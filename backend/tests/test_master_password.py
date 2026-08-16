"""Backend tests for master-password login (bcrypt, brute force, change-password).

Endpoints:
  POST /api/auth/login            (PUBLIC)
  POST /api/auth/change-password  (owner)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-vault-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER_TOKEN = "tok_owner_e2e"
OWNER_EMAIL = "owner.test@example.com"


def _master_password():
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith("MASTER_PASSWORD="):
                return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("MASTER_PASSWORD not in .env")


@pytest.fixture(scope="module")
def owner():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OWNER_TOKEN}", "Content-Type": "application/json"})
    return s


class TestMasterPassword:
    """Single class: pytest.ini uses xdist loadscope — separate classes land on different
    workers and race (change-password swaps the password mid-login-test)."""

    def test_login_success_sets_cookie_and_me_works(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login",
                   json={"email": OWNER_EMAIL, "password": _master_password()}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["role"] == "owner" and body["needsCode"] is False
        assert "session_token" in s.cookies
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200 and me.json()["user"]["email"] == OWNER_EMAIL
        s.post(f"{API}/auth/logout", timeout=15)

    def test_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": OWNER_EMAIL, "password": "definitely-wrong"}, timeout=15)
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid email or password."

    def test_unknown_email_401_same_message(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": f"ghost-{uuid.uuid4().hex[:6]}@nope.example", "password": "x"}, timeout=15)
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid email or password."

    def test_member_without_password_cannot_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "member.test@example.com", "password": _master_password()}, timeout=15)
        assert r.status_code == 401

    def test_brute_force_lockout(self):
        email = f"brute-{uuid.uuid4().hex[:8]}@nope.example"
        for _ in range(5):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "bad"}, timeout=15)
            assert r.status_code == 401
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "bad"}, timeout=15)
        assert r.status_code == 429
        assert "Too many failed attempts" in r.json()["detail"]

    def test_change_and_revert(self, owner):
        master = _master_password()
        temp = f"Temp-{uuid.uuid4().hex[:10]}"
        r = owner.post(f"{API}/auth/change-password",
                       json={"currentPassword": master, "newPassword": temp}, timeout=15)
        assert r.status_code == 200 and r.json()["ok"] is True
        # old password no longer works, new one does
        assert requests.post(f"{API}/auth/login",
                             json={"email": OWNER_EMAIL, "password": master}, timeout=15).status_code == 401
        assert requests.post(f"{API}/auth/login",
                             json={"email": OWNER_EMAIL, "password": temp}, timeout=15).status_code == 200
        # revert
        r = owner.post(f"{API}/auth/change-password",
                       json={"currentPassword": temp, "newPassword": master}, timeout=15)
        assert r.status_code == 200
        assert requests.post(f"{API}/auth/login",
                             json={"email": OWNER_EMAIL, "password": master}, timeout=15).status_code == 200

    def test_wrong_current_400(self, owner):
        r = owner.post(f"{API}/auth/change-password",
                       json={"currentPassword": "wrong", "newPassword": "whatever123"}, timeout=15)
        assert r.status_code == 400

    def test_short_new_password_400(self, owner):
        r = owner.post(f"{API}/auth/change-password",
                       json={"currentPassword": _master_password(), "newPassword": "short"}, timeout=15)
        assert r.status_code == 400
