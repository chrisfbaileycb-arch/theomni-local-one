"""Backend tests for Location Analytics + Weekly Win Report.

Endpoints under test:
  POST /api/maximizer/scan            (PUBLIC — no auth)
  GET  /api/maximizer/locations       (owner Bearer)
  GET  /api/maximizer/weekly-report   (owner Bearer)
  GET  /api/maximizer/weekly-report.pdf (owner Bearer)
"""
import os
import uuid
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


TEST_SPOT = f"TEST-Spot-{uuid.uuid4().hex[:6]}"


class TestScan:
    def test_scan_is_public_and_records(self, anon):
        r = anon.post(f"{API}/maximizer/scan", json={"spaceId": TEST_SPOT}, timeout=15)
        assert r.status_code == 200 and r.json()["ok"] is True

    def test_scan_defaults_to_direct(self, anon):
        r = anon.post(f"{API}/maximizer/scan", json={}, timeout=15)
        assert r.status_code == 200

    def test_scan_truncates_long_space(self, anon):
        r = anon.post(f"{API}/maximizer/scan", json={"spaceId": "x" * 500}, timeout=15)
        assert r.status_code == 200


class TestLocations:
    def test_requires_auth(self, anon):
        r = anon.get(f"{API}/maximizer/locations", timeout=15)
        assert r.status_code == 401

    def test_rows_shape_and_test_spot_present(self, api, anon):
        anon.post(f"{API}/maximizer/scan", json={"spaceId": TEST_SPOT}, timeout=15)
        anon.post(f"{API}/maximizer/scan", json={"spaceId": TEST_SPOT}, timeout=15)
        r = api.get(f"{API}/maximizer/locations", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert set(body.keys()) == {"rows", "totals", "topSpot"}
        row = next((x for x in body["rows"] if x["spaceId"] == TEST_SPOT), None)
        assert row is not None and row["scans"] >= 2
        for k in ("scans", "plays", "signups", "redeemed", "revenue", "scanToPlay"):
            assert k in row
        assert body["totals"]["scans"] >= row["scans"]

    def test_admin_demo_excluded(self, api):
        rows = api.get(f"{API}/maximizer/locations", timeout=15).json()["rows"]
        assert all(r["spaceId"] != "admin-demo" for r in rows)

    def test_spin_signup_records_space(self, api, anon):
        email = f"loc-{uuid.uuid4().hex[:8]}@test.example"
        r = anon.post(f"{API}/maximizer/spin",
                      json={"agree": True, "email": email, "spaceId": TEST_SPOT}, timeout=20)
        assert r.status_code == 200
        row = next((x for x in api.get(f"{API}/maximizer/locations", timeout=15).json()["rows"]
                    if x["spaceId"] == TEST_SPOT), None)
        assert row and row["signups"] >= 1 and row["plays"] >= 1


class TestWeeklyReport:
    def test_requires_auth(self, anon):
        assert anon.get(f"{API}/maximizer/weekly-report", timeout=15).status_code == 401

    def test_shape_and_week_bounds(self, api):
        r = api.get(f"{API}/maximizer/weekly-report", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("weekOf", "weekEnd", "current", "previous", "deltas", "soFar", "topSpot", "topGame"):
            assert k in d
        from datetime import datetime, timedelta
        start = datetime.strptime(d["weekOf"], "%Y-%m-%d")
        end = datetime.strptime(d["weekEnd"], "%Y-%m-%d")
        assert start.weekday() == 0 and end.weekday() == 6
        assert (end - start).days == 6
        for w in (d["current"], d["previous"], d["soFar"]):
            assert set(w.keys()) == {"scans", "spins", "newMembers", "redeemed", "revenue"}
        for k, v in d["deltas"].items():
            assert abs(v - round(d["current"][k] - d["previous"][k], 2)) < 0.01

    def test_pdf_downloads(self, api):
        r = api.get(f"{API}/maximizer/weekly-report.pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF" and len(r.content) > 500
