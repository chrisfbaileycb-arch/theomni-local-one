"""Google Business Profile — real OAuth 2.0 + localPosts publishing (stub until env keys set)."""
import os
import secrets
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator

import auth

router = APIRouter(prefix="/api/google-business")
SCOPE = "https://www.googleapis.com/auth/business.manage"
GBP_API = "https://mybusiness.googleapis.com/v4/"

db = None
state_get = None
state_set = None


def init(database, getter, setter):
    global db, state_get, state_set
    db = database
    state_get = getter
    state_set = setter


def _creds():
    return os.environ.get("GOOGLE_CLIENT_ID"), os.environ.get("GOOGLE_CLIENT_SECRET")


def is_live():
    cid, cs = _creds()
    return bool(cid and cs)


def _origin(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto") or "https"
    return f"{proto}://{host}"


def _redirect_uri(request: Request) -> str:
    return _origin(request) + "/api/google-business/callback"


async def _access_token() -> str:
    doc = await db.google_tokens.find_one({"_id": "owner"})
    if not doc:
        raise HTTPException(409, "Google Business Profile is not connected.")
    exp = datetime.fromisoformat(doc["expiresAt"])
    if exp > datetime.now(timezone.utc) + timedelta(seconds=120):
        return doc["accessToken"]
    cid, cs = _creds()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": cid, "client_secret": cs,
            "refresh_token": doc["refreshToken"], "grant_type": "refresh_token"})
    if r.status_code >= 400:
        await db.google_tokens.delete_one({"_id": "owner"})
        raise HTTPException(401, "Google authorization was revoked — reconnect from the Connections page.")
    tok = r.json()
    now = datetime.now(timezone.utc)
    await db.google_tokens.update_one({"_id": "owner"}, {"$set": {
        "accessToken": tok["access_token"],
        "expiresAt": (now + timedelta(seconds=tok.get("expires_in", 3600))).isoformat(),
        "updatedAt": now.isoformat()}})
    return tok["access_token"]


async def _google_get(path: str, params: dict | None = None):
    token = await _access_token()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(GBP_API + path, params=params,
                             headers={"Authorization": f"Bearer {token}"})
    if r.status_code >= 400:
        raise HTTPException(502, f"Google API error ({r.status_code}).")
    return r.json()


async def publish_localpost(summary: str, cta_url: str | None = None) -> dict:
    """Create a What's-New localPost on the selected location. Returns {ok, postUrl|error}."""
    try:
        loc = await state_get("gbp_location")
        if not loc or not loc.get("name"):
            return {"ok": False, "error": "No Google Business location selected."}
        payload = {"languageCode": "en-US", "summary": summary[:1500], "topicType": "STANDARD"}
        if cta_url:
            payload["callToAction"] = {"actionType": "LEARN_MORE", "url": cta_url}
        token = await _access_token()
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(GBP_API + loc["name"] + "/localPosts", json=payload,
                                  headers={"Authorization": f"Bearer {token}"})
        if r.status_code >= 400:
            return {"ok": False, "error": f"Google API error ({r.status_code})"}
        post = r.json()
        return {"ok": True, "postName": post.get("name"), "postUrl": post.get("searchUrl") or "https://business.google.com"}
    except HTTPException as e:
        return {"ok": False, "error": str(e.detail)}


async def _connected() -> bool:
    return await db.google_tokens.find_one({"_id": "owner"}) is not None


@router.get("/status")
async def gbp_status(request: Request):
    auth.require_owner(request)
    return {"mode": "live" if is_live() else "stub", "connected": await _connected(),
            "location": await state_get("gbp_location")}


@router.get("/start")
async def gbp_start(request: Request):
    auth.require_owner(request)
    if not is_live():
        return {"mode": "stub", "connected": await _connected(),
                "message": "Paste GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET into backend/.env to go live."}
    state = secrets.token_urlsafe(32)
    await db.google_oauth_states.insert_one({
        "state": state, "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=10)})
    cid, _ = _creds()
    params = {"client_id": cid, "redirect_uri": _redirect_uri(request), "response_type": "code",
              "scope": SCOPE, "access_type": "offline", "prompt": "consent",
              "include_granted_scopes": "true", "state": state}
    return {"mode": "oauth",
            "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)}


@router.get("/callback")
async def gbp_callback(request: Request, code: str | None = None,
                       state: str | None = None, error: str | None = None):
    origin = _origin(request)
    if error:
        return RedirectResponse(f"{origin}/?google_error={error[:60]}")
    if not is_live():
        return RedirectResponse(f"{origin}/?google=stub")
    if not code or not state:
        raise HTTPException(400, "Missing OAuth code/state")
    state_doc = await db.google_oauth_states.find_one_and_delete({"state": state})
    if not state_doc or state_doc["expiresAt"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired OAuth state")
    cid, cs = _creds()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": cid, "client_secret": cs,
            "redirect_uri": _redirect_uri(request), "grant_type": "authorization_code"})
    if r.status_code >= 400:
        raise HTTPException(400, "Google token exchange failed")
    tok = r.json()
    old = await db.google_tokens.find_one({"_id": "owner"})
    refresh = tok.get("refresh_token") or (old or {}).get("refreshToken")
    if not refresh:
        raise HTTPException(400, "No refresh token returned — revoke the app's access in your Google account and reconnect.")
    now = datetime.now(timezone.utc)
    await db.google_tokens.replace_one({"_id": "owner"}, {
        "_id": "owner", "accessToken": tok["access_token"], "refreshToken": refresh,
        "scopes": tok.get("scope", SCOPE).split(),
        "expiresAt": (now + timedelta(seconds=tok.get("expires_in", 3600))).isoformat(),
        "createdAt": (old or {}).get("createdAt", now.isoformat()), "updatedAt": now.isoformat()},
        upsert=True)
    connections = await state_get("connections")
    tokens = await state_get("oauth_tokens")
    connections["google"] = True
    tokens["google"] = {"provider": "google-direct", "mode": "live",
                        "connectedAt": now.isoformat()}
    await state_set("connections", connections)
    await state_set("oauth_tokens", tokens)
    return RedirectResponse(f"{origin}/?google=connected")


@router.get("/locations")
async def gbp_locations(request: Request):
    auth.require_owner(request)
    if not is_live():
        return {"mode": "stub", "locations": [
            {"name": "accounts/stub/locations/stub", "title": "Stub Business Profile"}]}
    accounts = await _google_get("accounts", {"pageSize": 20})
    result = []
    for account in accounts.get("accounts", []):
        page_token = None
        while True:
            p = {"pageSize": 100}
            if page_token:
                p["pageToken"] = page_token
            data = await _google_get(account["name"] + "/locations", p)
            for loc in data.get("locations", []):
                result.append({"name": loc["name"], "title": loc.get("locationName") or loc.get("title"),
                               "storeCode": loc.get("storeCode")})
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return {"mode": "live", "locations": result}


class LocationReq(BaseModel):
    name: str = Field(pattern=r"^accounts/[^/]+/locations/[^/]+$")
    title: str = Field("", max_length=120)


@router.put("/location")
async def gbp_set_location(req: LocationReq, request: Request):
    auth.require_owner(request)
    loc = {"name": req.name, "title": req.title.strip()}
    await state_set("gbp_location", loc)
    return {"ok": True, "location": loc}


class PostReq(BaseModel):
    summary: str = Field(min_length=1, max_length=1500)
    ctaUrl: str | None = None

    @field_validator("ctaUrl")
    @classmethod
    def _https(cls, v):
        if v and not v.startswith("https://"):
            raise ValueError("CTA link must be an https URL")
        return v


@router.post("/posts")
async def gbp_publish(req: PostReq, request: Request):
    auth.require_owner(request)
    if not is_live():
        return {"mode": "stub", "state": "PUBLISHED", "summary": req.summary[:200]}
    res = await publish_localpost(req.summary, req.ctaUrl)
    if not res["ok"]:
        raise HTTPException(502, res["error"])
    return {"mode": "live", **res}


@router.delete("/connection")
async def gbp_disconnect(request: Request):
    auth.require_owner(request)
    await db.google_tokens.delete_one({"_id": "owner"})
    await state_set("gbp_location", None)
    connections = await state_get("connections")
    tokens = await state_get("oauth_tokens")
    connections["google"] = False
    tokens.pop("google", None)
    await state_set("connections", connections)
    await state_set("oauth_tokens", tokens)
    return {"ok": True, "connected": False}
