"""Backend tests for Spot QR Sheet + Weekly Win Report auto-email.

Endpoints under test (owner Bearer unless noted):
  GET  /api/maximizer/qr-sheet.pdf
  GET  /api/maximizer/report-email
  PUT  /api/maximizer/report-email
  POST /api/maximizer/report-email/send-now  (stub mode — no Resend key)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-vault-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER_TOKEN = "tok_owner_e2e"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OWNER_TOKEN}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


class TestQrSheet:
    def test_requires_auth(self, anon):
        assert anon.get(f"{API}/maximizer/qr-sheet.pdf", timeout=15).status_code == 401

    def test_pdf_downloads(self, api):
        r = api.get(f"{API}/maximizer/qr-sheet.pdf", params={"base": BASE_URL}, timeout=30)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF" and len(r.content) > 2000

    def test_bad_base_ignored(self, api):
        r = api.get(f"{API}/maximizer/qr-sheet.pdf", params={"base": "javascript:alert(1)"}, timeout=30)
        assert r.status_code == 200 and r.content[:4] == b"%PDF"


class TestReportEmail:
    def test_requires_auth(self, anon):
        assert anon.get(f"{API}/maximizer/report-email", timeout=15).status_code == 401

    def test_get_defaults(self, api):
        r = api.get(f"{API}/maximizer/report-email", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("enabled", "recipient", "timezone", "liveSending", "schedule",
                  "lastSentWeekOf", "lastSentAt", "lastResult"):
            assert k in d
        assert d["liveSending"] is False  # no Resend key in this environment
        assert d["recipient"]  # falls back to owner login email

    def test_put_settings_roundtrip(self, api):
        orig = api.get(f"{API}/maximizer/report-email", timeout=15).json()
        r = api.put(f"{API}/maximizer/report-email",
                    json={"enabled": False, "timezone": "America/Chicago"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is False and d["timezone"] == "America/Chicago"
        r = api.put(f"{API}/maximizer/report-email",
                    json={"enabled": orig["enabled"], "timezone": orig["timezone"]}, timeout=15)
        assert r.status_code == 200 and r.json()["timezone"] == orig["timezone"]

    def test_put_bad_timezone_rejected(self, api):
        r = api.put(f"{API}/maximizer/report-email", json={"timezone": "Mars/Olympus"}, timeout=15)
        assert r.status_code == 400

    def test_send_now_stub(self, api):
        r = api.post(f"{API}/maximizer/report-email/send-now", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "stubbed" and d["to"] and "weekOf" in d and "subject" in d
        view = api.get(f"{API}/maximizer/report-email", timeout=15).json()
        assert view["lastSentWeekOf"] == d["weekOf"] and view["lastResult"] == "stubbed"
