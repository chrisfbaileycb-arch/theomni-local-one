"""Auth, team seats, and owner-approval workflow (direct Google OAuth + master password)."""
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

import bcrypt
import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

GOOGLE_LOGIN_SCOPE = "openid email profile"
SESSION_TTL_DAYS = 7
MAX_TEAM_MEMBERS = 3

db = None
EXECUTORS = {}

router = APIRouter(prefix="/api/auth")
team_router = APIRouter(prefix="/api/team")
approvals_router = APIRouter(prefix="/api/approvals")

OPEN_PATHS = {"/api", "/api/", "/api/auth/google/start", "/api/auth/google/callback",
              "/api/auth/login", "/api/maximizer/spin",
              "/api/maximizer/games", "/api/maximizer/scan",
              "/api/payments/checkout", "/api/stripe/webhook", "/api/google-business/callback"}
OPEN_PREFIXES = ("/api/vault/video/", "/api/payments/status/")
SESSION_ONLY_PATHS = {"/api/auth/me", "/api/auth/logout", "/api/auth/activate"}


def init(database):
    global db
    db = database


def _now():
    return datetime.now(timezone.utc)


def _gen_access_code():
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    seg = lambda: "".join(secrets.choice(alphabet) for _ in range(4))
    return f"TR-{seg()}-{seg()}"


async def get_team_settings():
    doc = await db.state.find_one({"_id": "team_settings"})
    if doc:
        return doc["value"]
    settings = {"access_code": _gen_access_code(), "code_version": 1}
    await db.state.update_one({"_id": "team_settings"}, {"$set": {"value": settings}}, upsert=True)
    return settings


def public_user(u):
    return {k: u.get(k) for k in ("user_id", "email", "name", "picture", "role", "status")}


def _needs_code(user, settings):
    if user["role"] == "owner":
        return False
    return user["status"] != "active" or user.get("code_version") != settings["code_version"]


def _token_from_request(request: Request) -> Optional[str]:
    tok = request.cookies.get("session_token")
    if tok:
        return tok
    authz = request.headers.get("Authorization", "")
    return authz[7:] if authz.startswith("Bearer ") else None


async def get_session_user(request: Request):
    token = _token_from_request(request)
    if not token:
        return None
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires = sess["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < _now():
        return None
    return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})


async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api") or path in OPEN_PATHS or path.startswith(OPEN_PREFIXES) or request.method == "OPTIONS":
        return await call_next(request)
    user = await get_session_user(request)
    if user is None:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    request.state.user = user
    if path in SESSION_ONLY_PATHS:
        return await call_next(request)
    if user["role"] != "owner":
        if user["status"] == "revoked":
            return JSONResponse({"detail": "revoked"}, status_code=403)
        settings = await get_team_settings()
        if _needs_code(user, settings):
            return JSONResponse({"detail": "access_code_required"}, status_code=403)
    return await call_next(request)


def require_owner(request: Request):
    user = request.state.user
    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the account owner can do this.")
    return user


# ---------------------------------------------------------------------------
# MASTER PASSWORD — email + password sign-in that doesn't rely on Google
# ---------------------------------------------------------------------------
MAX_LOGIN_FAILS = 5
LOCKOUT_MINUTES = 15


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


async def seed_master_password():
    """Attach the .env MASTER_PASSWORD to the owner account. Re-applies only when the env
    value changes, so a password changed in-app survives restarts."""
    pw = os.environ.get("MASTER_PASSWORD")
    if not pw:
        return
    marker = hashlib.sha256(pw.encode()).hexdigest()
    owner = await db.users.find_one({"role": "owner"}, sort=[("created_at", 1)])
    if not owner:
        return
    doc = await db.state.find_one({"_id": "master_seed"})
    if owner.get("password_hash") and doc and doc.get("envSha") == marker:
        return
    await db.users.update_one({"user_id": owner["user_id"]},
                              {"$set": {"password_hash": _hash_password(pw)}})
    await db.state.update_one({"_id": "master_seed"}, {"$set": {"envSha": marker}}, upsert=True)


async def _issue_session(user, response: Response):
    token = f"pw_{secrets.token_urlsafe(32)}"
    await db.user_sessions.insert_one({
        "user_id": user["user_id"], "session_token": token,
        "expires_at": (_now() + timedelta(days=SESSION_TTL_DAYS)).isoformat(),
        "created_at": _now().isoformat()})
    response.set_cookie("session_token", token, max_age=SESSION_TTL_DAYS * 24 * 3600,
                        httponly=True, secure=True, samesite="none", path="/")


class LoginReq(BaseModel):
    email: str
    password: str


class ChangePasswordReq(BaseModel):
    currentPassword: str
    newPassword: str


@router.post("/login")
async def password_login(req: LoginReq, request: Request, response: Response):
    email = req.email.strip().lower()
    ident = f"{_client_ip(request)}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident}, {"_id": 0})
    if att and att.get("lockedUntil"):
        locked = datetime.fromisoformat(att["lockedUntil"])
        if locked > _now():
            mins = int((locked - _now()).total_seconds() // 60) + 1
            raise HTTPException(status_code=429,
                                detail=f"Too many failed attempts. Try again in {mins} min.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    ok = bool(user and user.get("password_hash") and _verify_password(req.password, user["password_hash"]))
    if not ok:
        fails = (att or {}).get("fails", 0) + 1
        upd = {"identifier": ident, "fails": fails, "updatedAt": _now()}
        if fails >= MAX_LOGIN_FAILS:
            upd["lockedUntil"] = (_now() + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            upd["fails"] = 0
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    await db.login_attempts.delete_many({"identifier": ident})
    if user["status"] == "revoked":
        raise HTTPException(status_code=403, detail="Your access was revoked by the account owner.")
    await _issue_session(user, response)
    settings = await get_team_settings()
    return {"user": public_user(user), "needsCode": _needs_code(user, settings),
            "revoked": user["status"] == "revoked"}


@router.post("/change-password")
async def change_password(req: ChangePasswordReq, request: Request):
    user = require_owner(request)
    full = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not full.get("password_hash") or not _verify_password(req.currentPassword, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current master password is incorrect.")
    if len(req.newPassword) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"password_hash": _hash_password(req.newPassword)}})
    return {"ok": True, "note": "Master password updated. Existing sessions stay signed in."}


class CodeReq(BaseModel):
    code: str


class RejectReq(BaseModel):
    reason: Optional[str] = None


def _origin(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto") or "https"
    return f"{proto}://{host}"


def _google_creds():
    return os.environ.get("GOOGLE_CLIENT_ID"), os.environ.get("GOOGLE_CLIENT_SECRET")


@router.get("/google/start")
async def google_login_start(request: Request):
    cid, cs = _google_creds()
    if not (cid and cs):
        raise HTTPException(status_code=503,
                            detail="Google sign-in is not configured. Set GOOGLE_CLIENT_ID and "
                                   "GOOGLE_CLIENT_SECRET, or sign in with the master password.")
    state = secrets.token_urlsafe(32)
    await db.login_oauth_states.insert_one({
        "state": state, "expiresAt": (_now() + timedelta(minutes=10)).isoformat()})
    params = {"client_id": cid, "redirect_uri": _origin(request) + "/api/auth/google/callback",
              "response_type": "code", "scope": GOOGLE_LOGIN_SCOPE, "state": state}
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params))


@router.get("/google/callback")
async def google_login_callback(request: Request, code: Optional[str] = None,
                                state: Optional[str] = None, error: Optional[str] = None):
    origin = _origin(request)
    if error:
        return RedirectResponse(f"{origin}/?auth_error={error[:60]}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code/state")
    state_doc = await db.login_oauth_states.find_one_and_delete({"state": state})
    if not state_doc or datetime.fromisoformat(state_doc["expiresAt"]) < _now():
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    cid, cs = _google_creds()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": cid, "client_secret": cs,
            "redirect_uri": origin + "/api/auth/google/callback",
            "grant_type": "authorization_code"})
        if r.status_code >= 400:
            raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")
        userinfo = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    if userinfo.status_code >= 400:
        raise HTTPException(status_code=401, detail="Could not read your Google profile.")
    data = userinfo.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="Your Google account has no email address.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user is None:
        has_owner = await db.users.count_documents({"role": "owner"}) > 0
        role = "member" if has_owner else "owner"
        user = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email,
                "name": data.get("name", ""), "picture": data.get("picture", ""),
                "role": role, "status": "active" if role == "owner" else "pending",
                "code_version": None, "created_at": _now().isoformat()}
        await db.users.insert_one(dict(user))
    else:
        await db.users.update_one({"email": email}, {"$set": {
            "name": data.get("name", user["name"]),
            "picture": data.get("picture", user.get("picture", ""))}})
    if user["status"] == "revoked":
        return RedirectResponse(f"{origin}/?auth_error=revoked")
    resp = RedirectResponse(f"{origin}/")
    await _issue_session(user, resp)
    return resp


@router.get("/me")
async def me(request: Request):
    user = request.state.user
    settings = await get_team_settings()
    return {"user": public_user(user), "needsCode": _needs_code(user, settings),
            "revoked": user["status"] == "revoked"}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = _token_from_request(request)
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


@router.post("/activate")
async def activate(req: CodeReq, request: Request):
    user = request.state.user
    settings = await get_team_settings()
    if user["role"] == "owner":
        return {"user": public_user(user), "needsCode": False, "revoked": False}
    if user["status"] == "revoked":
        raise HTTPException(status_code=403, detail="Your access was revoked by the account owner.")
    if req.code.strip().upper() != settings["access_code"]:
        raise HTTPException(status_code=400, detail="Invalid access code. Ask the owner for the current code.")
    seated = await db.users.count_documents(
        {"role": "member", "status": "active", "user_id": {"$ne": user["user_id"]}})
    if seated >= MAX_TEAM_MEMBERS:
        raise HTTPException(status_code=403,
                            detail=f"All {MAX_TEAM_MEMBERS} team seats are taken. Ask the owner to free a seat.")
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"status": "active", "code_version": settings["code_version"]}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"user": public_user(fresh), "needsCode": False, "revoked": False}


@team_router.get("")
async def team_overview(request: Request):
    require_owner(request)
    settings = await get_team_settings()
    users = await db.users.find({}, {"_id": 0}).sort("created_at", 1).to_list(100)
    members = []
    for u in users:
        entry = public_user(u)
        entry["lockedOut"] = u["role"] == "member" and u["status"] == "active" and _needs_code(u, settings)
        members.append(entry)
    pending = await db.approvals.count_documents({"status": "pending"})
    seated = await db.users.count_documents({"role": "member", "status": "active"})
    return {"members": members, "accessCode": settings["access_code"],
            "codeVersion": settings["code_version"], "seatsUsed": seated,
            "maxMembers": MAX_TEAM_MEMBERS, "pendingApprovals": pending}


@team_router.post("/rotate-code")
async def rotate_code(request: Request):
    require_owner(request)
    settings = await get_team_settings()
    settings["access_code"] = _gen_access_code()
    settings["code_version"] += 1
    await db.state.update_one({"_id": "team_settings"}, {"$set": {"value": settings}}, upsert=True)
    return {"accessCode": settings["access_code"], "codeVersion": settings["code_version"],
            "note": "Every team member is locked out until they enter the new code."}


@team_router.post("/member/{user_id}/revoke")
async def revoke_member(user_id: str, request: Request):
    require_owner(request)
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "owner":
        raise HTTPException(status_code=400, detail="The owner account cannot be revoked.")
    await db.users.update_one({"user_id": user_id}, {"$set": {"status": "revoked"}})
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"ok": True}


@team_router.post("/member/{user_id}/restore")
async def restore_member(user_id: str, request: Request):
    require_owner(request)
    await db.users.update_one({"user_id": user_id, "role": "member"}, {"$set": {"status": "pending"}})
    return {"ok": True, "note": "Member must sign in again and enter the current access code."}


async def submit_or_execute(request: Request, action_type: str, payload: dict, summary: str):
    user = request.state.user
    if user["role"] == "owner":
        return await EXECUTORS[action_type](payload)
    doc = {"id": str(uuid.uuid4()), "type": action_type, "payload": payload, "summary": summary,
           "requestedBy": user["user_id"], "requestedByName": user["name"] or user["email"],
           "status": "pending", "createdAt": _now().isoformat(),
           "decidedAt": None, "decidedBy": None, "result": None, "reason": None}
    await db.approvals.insert_one(dict(doc))
    return {"status": "pending_approval", "approvalId": doc["id"],
            "note": "Submitted to the account owner for approval. Nothing goes live until they approve."}


@approvals_router.get("")
async def list_approvals(request: Request):
    user = request.state.user
    q = {} if user["role"] == "owner" else {"requestedBy": user["user_id"]}
    docs = await db.approvals.find(q, {"_id": 0}).sort("createdAt", -1).to_list(100)
    return {"approvals": docs, "pendingCount": sum(1 for d in docs if d["status"] == "pending")}


@approvals_router.post("/{approval_id}/approve")
async def approve(approval_id: str, request: Request):
    owner = require_owner(request)
    doc = await db.approvals.find_one({"id": approval_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Approval not found")
    if doc["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"This request was already {doc['status']}.")
    result = await EXECUTORS[doc["type"]](doc["payload"])
    await db.approvals.update_one({"id": approval_id}, {"$set": {
        "status": "approved", "decidedAt": _now().isoformat(),
        "decidedBy": owner["name"] or owner["email"], "result": result}})
    return {"ok": True, "status": "approved", "result": result}


@approvals_router.post("/{approval_id}/reject")
async def reject(approval_id: str, req: RejectReq, request: Request):
    owner = require_owner(request)
    doc = await db.approvals.find_one({"id": approval_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Approval not found")
    if doc["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"This request was already {doc['status']}.")
    await db.approvals.update_one({"id": approval_id}, {"$set": {
        "status": "rejected", "decidedAt": _now().isoformat(),
        "decidedBy": owner["name"] or owner["email"], "reason": req.reason}})
    return {"ok": True, "status": "rejected"}
