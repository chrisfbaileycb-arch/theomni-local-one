"""Iteration 9: auth gating, team access-code activation, approval workflow.

Covers:
- OPEN vs SESSION_ONLY vs auth-required paths
- Owner /auth/me + /team overview
- Member activation (wrong code / correct code / seat cap)
- Rotate-code locks out active members instantly
- Revoke / restore lifecycle
- Approval workflow: member publish-all -> pending_approval; owner approve executes.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
API = f"{BASE_URL}/api"

OWNER_TOKEN = "tok_owner_e2e"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture
def owner():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OWNER_TOKEN}"})
    return s


@pytest.fixture
def anon():
    return requests.Session()


def _seed_member(db, *, status="pending", code_version=None, name_suffix="pending"):
    """Insert a member + session and return (user_id, session_token)."""
    uid = f"test-member-{name_suffix}-{uuid.uuid4().hex[:8]}"
    email = f"TEST_{uid}@example.com"
    tok = f"tok_{uid}"
    db.users.insert_one({
        "user_id": uid, "email": email, "name": "Test Member " + name_suffix,
        "picture": "", "role": "member", "status": status,
        "code_version": code_version,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": uid, "session_token": tok,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return uid, tok, email


@pytest.fixture
def cleanup_test_members(db):
    yield
    # remove all TEST_ prefixed users + their sessions
    victims = list(db.users.find({"email": {"$regex": "^TEST_"}}, {"user_id": 1}))
    ids = [v["user_id"] for v in victims]
    if ids:
        db.user_sessions.delete_many({"user_id": {"$in": ids}})
        db.users.delete_many({"user_id": {"$in": ids}})
    # clear approvals from tests
    db.approvals.delete_many({"requestedByName": {"$regex": "^Test Member"}})


# ============================================================================
# Auth gating on /api paths
# ============================================================================
class TestAuthGating:
    def test_public_root(self, anon):
        r = anon.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_public_spin_no_auth(self, anon):
        em = f"pub.{uuid.uuid4().hex[:8]}@example.com"
        r = anon.post(f"{API}/maximizer/spin",
                      json={"agree": True, "email": em, "spaceId": "TestPub"},
                      timeout=15)
        assert r.status_code == 200
        assert "code" in r.json() and r.json()["code"]
        assert r.json()["mystery"] is True

    def test_public_spin_requires_agreement(self, anon):
        r = anon.post(f"{API}/maximizer/spin",
                      json={"email": "noagree@example.com", "spaceId": "TestPub"}, timeout=15)
        assert r.status_code == 400

    def test_public_spin_requires_identity(self, anon):
        r = anon.post(f"{API}/maximizer/spin", json={"agree": True, "spaceId": "TestPub"}, timeout=15)
        assert r.status_code == 400

    def test_public_spin_daily_limit(self, anon):
        em = f"limit.{uuid.uuid4().hex[:8]}@example.com"
        body = {"agree": True, "email": em, "spaceId": "TestPub"}
        r = anon.post(f"{API}/maximizer/spin", json=body, timeout=15)
        assert r.status_code == 200
        r2 = anon.post(f"{API}/maximizer/spin", json=body, timeout=15)
        assert r2.status_code == 429
        assert r2.json()["detail"]["existingCode"] == r.json()["code"]

    def test_public_games_no_auth(self, anon):
        r = anon.get(f"{API}/maximizer/games", timeout=10)
        assert r.status_code == 200
        assert "games" in r.json()

    def test_overview_requires_auth(self, anon):
        r = anon.get(f"{API}/overview", timeout=10)
        assert r.status_code == 401

    def test_segments_requires_auth(self, anon):
        r = anon.get(f"{API}/maximizer/segments", timeout=10)
        assert r.status_code == 401

    def test_team_requires_auth(self, anon):
        r = anon.get(f"{API}/team", timeout=10)
        assert r.status_code == 401

    def test_owner_can_hit_protected(self, owner):
        r = owner.get(f"{API}/overview", timeout=15)
        assert r.status_code == 200

    def test_auth_me_owner(self, owner):
        r = owner.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "owner"
        assert d["needsCode"] is False
        assert d["revoked"] is False


# ============================================================================
# Team overview & rotate/revoke/restore
# ============================================================================
class TestTeamOwnerOps:
    def test_team_overview_shape(self, owner):
        r = owner.get(f"{API}/team", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("members", "accessCode", "codeVersion", "seatsUsed",
                  "maxMembers", "pendingApprovals"):
            assert k in d, f"missing {k}"
        assert d["maxMembers"] == 3
        assert d["accessCode"].startswith("TR-")

    def test_rotate_code_changes_code_and_version(self, owner):
        before = owner.get(f"{API}/team", timeout=15).json()
        r = owner.post(f"{API}/team/rotate-code", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["accessCode"] != before["accessCode"]
        assert d["codeVersion"] == before["codeVersion"] + 1
        # confirmed by GET
        after = owner.get(f"{API}/team", timeout=15).json()
        assert after["accessCode"] == d["accessCode"]

    def test_cannot_revoke_owner(self, owner):
        r = owner.post(f"{API}/team/member/test-owner-1/revoke", timeout=15)
        assert r.status_code == 400


# ============================================================================
# Member activation, code correctness, seat cap, rotate-lockout, revoke
# ============================================================================
class TestMemberActivationFlow:
    def test_pending_member_gets_403_access_code_required(self, db, cleanup_test_members):
        uid, tok, email = _seed_member(db, status="pending")
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        r = s.get(f"{API}/overview", timeout=10)
        assert r.status_code == 403
        assert r.json()["detail"] == "access_code_required"

    def test_activate_wrong_code_returns_400(self, db, cleanup_test_members):
        uid, tok, _ = _seed_member(db, status="pending")
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        r = s.post(f"{API}/auth/activate", json={"code": "TR-XXXX-XXXX"}, timeout=10)
        assert r.status_code == 400

    def test_activate_correct_code_unlocks(self, db, owner, cleanup_test_members):
        uid, tok, _ = _seed_member(db, status="pending")
        current_code = owner.get(f"{API}/team", timeout=15).json()["accessCode"]
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        r = s.post(f"{API}/auth/activate", json={"code": current_code}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["needsCode"] is False
        assert d["user"]["status"] == "active"
        # now protected API works
        r2 = s.get(f"{API}/overview", timeout=15)
        assert r2.status_code == 200

    def test_seat_cap_rejects_fourth_member(self, db, owner, cleanup_test_members):
        # Ensure any prior test members are cleaned first
        db.user_sessions.delete_many({"user_id": {"$regex": "^test-member-"}})
        db.users.delete_many({"user_id": {"$regex": "^test-member-"},
                              "email": {"$regex": "^TEST_"}})

        current_code = owner.get(f"{API}/team", timeout=15).json()["accessCode"]
        # seed 3 pending members and activate all
        toks = []
        for i in range(3):
            uid, tok, _ = _seed_member(db, status="pending", name_suffix=f"cap{i}")
            toks.append(tok)
        for tok in toks:
            s = requests.Session()
            s.headers.update({"Authorization": f"Bearer {tok}"})
            r = s.post(f"{API}/auth/activate", json={"code": current_code}, timeout=10)
            assert r.status_code == 200, f"couldn't activate seat: {r.text}"

        # 4th member should be rejected
        uid, tok4, _ = _seed_member(db, status="pending", name_suffix="cap3")
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok4}"})
        r = s.post(f"{API}/auth/activate", json={"code": current_code}, timeout=10)
        assert r.status_code == 403
        assert "seat" in r.json()["detail"].lower()

    def test_rotate_locks_out_active_member(self, db, owner, cleanup_test_members):
        current_code = owner.get(f"{API}/team", timeout=15).json()["accessCode"]
        uid, tok, _ = _seed_member(db, status="pending", name_suffix="rotate")
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        # activate
        r = s.post(f"{API}/auth/activate", json={"code": current_code}, timeout=10)
        assert r.status_code == 200
        assert s.get(f"{API}/overview", timeout=15).status_code == 200

        # rotate — member should now be locked out
        r = owner.post(f"{API}/team/rotate-code", timeout=15)
        assert r.status_code == 200
        new_code = r.json()["accessCode"]

        r2 = s.get(f"{API}/overview", timeout=10)
        assert r2.status_code == 403
        assert r2.json()["detail"] == "access_code_required"

        # re-activate with new code
        r3 = s.post(f"{API}/auth/activate", json={"code": new_code}, timeout=10)
        assert r3.status_code == 200
        assert s.get(f"{API}/overview", timeout=15).status_code == 200

    def test_revoke_kills_session_and_restore_returns_pending(self, db, owner, cleanup_test_members):
        current_code = owner.get(f"{API}/team", timeout=15).json()["accessCode"]
        uid, tok, _ = _seed_member(db, status="pending", name_suffix="revoke")
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        s.post(f"{API}/auth/activate", json={"code": current_code}, timeout=10)
        assert s.get(f"{API}/overview", timeout=15).status_code == 200

        # owner revokes
        r = owner.post(f"{API}/team/member/{uid}/revoke", timeout=15)
        assert r.status_code == 200
        # session deleted → 401
        r2 = s.get(f"{API}/overview", timeout=10)
        assert r2.status_code == 401

        # restore → back to pending
        r = owner.post(f"{API}/team/member/{uid}/restore", timeout=15)
        assert r.status_code == 200
        u = db.users.find_one({"user_id": uid}, {"_id": 0})
        assert u["status"] == "pending"


# ============================================================================
# Approval workflow: member publish-all -> pending_approval; owner approve
# ============================================================================
class TestApprovalWorkflow:
    def test_member_publish_all_creates_pending_approval(self, db, owner, cleanup_test_members):
        current_code = owner.get(f"{API}/team", timeout=15).json()["accessCode"]
        uid, tok, _ = _seed_member(db, status="pending", name_suffix="approvA")
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        s.post(f"{API}/auth/activate", json={"code": current_code}, timeout=10)

        r = s.post(f"{API}/content/publish-all",
                   json={"assetId": "asset-x", "caption": "member submit"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending_approval"
        assert d["approvalId"]

    def test_owner_publish_all_executes_directly(self, owner):
        r = owner.post(f"{API}/content/publish-all",
                       json={"assetId": "asset-o", "caption": "owner direct"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "publishedCount" in d
        assert "results" in d
        # owner bypass -> no status:pending_approval
        assert d.get("status") != "pending_approval"

    def test_owner_can_approve_and_double_approve_rejected(self, db, owner, cleanup_test_members):
        current_code = owner.get(f"{API}/team", timeout=15).json()["accessCode"]
        uid, tok, _ = _seed_member(db, status="pending", name_suffix="approvB")
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        s.post(f"{API}/auth/activate", json={"code": current_code}, timeout=10)

        r = s.post(f"{API}/content/publish-all",
                   json={"assetId": "for-approval", "caption": "approve me"}, timeout=15)
        assert r.status_code == 200
        approval_id = r.json()["approvalId"]

        # owner sees pending approval
        r = owner.get(f"{API}/approvals", timeout=15)
        assert r.status_code == 200
        pending = [a for a in r.json()["approvals"] if a["id"] == approval_id]
        assert pending and pending[0]["status"] == "pending"

        # approve → executes publish
        r = owner.post(f"{API}/approvals/{approval_id}/approve", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True and d["status"] == "approved"
        assert "publishedCount" in d["result"]

        # double-approve → 400
        r = owner.post(f"{API}/approvals/{approval_id}/approve", timeout=15)
        assert r.status_code == 400

    def test_owner_can_reject(self, db, owner, cleanup_test_members):
        current_code = owner.get(f"{API}/team", timeout=15).json()["accessCode"]
        uid, tok, _ = _seed_member(db, status="pending", name_suffix="approvC")
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        s.post(f"{API}/auth/activate", json={"code": current_code}, timeout=10)
        r = s.post(f"{API}/content/publish-all", json={"assetId": "rej"}, timeout=15)
        approval_id = r.json()["approvalId"]

        r = owner.post(f"{API}/approvals/{approval_id}/reject",
                       json={"reason": "not on brand"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"


# ============================================================================
# Regression: post-rebuild — protected read endpoints all return 200
# ============================================================================
class TestPostRebuildRegression:
    @pytest.mark.parametrize("path", [
        "/executioner/reports",
        "/maximizer/segments",
        "/maximizer/spin/qr?spaceId=Counter&base=https://x.app",
        "/content/calendar",
        "/content/brand-profile",
    ])
    def test_get_returns_200(self, owner, path):
        r = owner.get(f"{API}{path}", timeout=20)
        assert r.status_code == 200, f"{path}: {r.status_code} — {r.text[:200]}"
