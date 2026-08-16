"""Backend tests for the Ad Spend log + POS Import Friday nudge.

Endpoints (owner Bearer unless noted):
  POST/GET/DELETE /api/maximizer/ad-spend
  GET             /api/maximizer/import-status
  GET             /api/maximizer/weekly-report  (adSpend section)
"""
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone

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


class TestAdSpendAndImportNudge:
    def test_requires_auth(self, anon):
        assert anon.get(f"{API}/maximizer/ad-spend", timeout=15).status_code == 401
        assert anon.get(f"{API}/maximizer/import-status", timeout=15).status_code == 401

    def test_add_list_delete_roundtrip(self, api):
        r = api.post(f"{API}/maximizer/ad-spend",
                     json={"platform": "Facebook", "label": "TEST menu photo boost", "amount": 25.5}, timeout=15)
        assert r.status_code == 200
        doc = r.json()
        assert doc["platform"] == "facebook" and doc["amount"] == 25.5 and doc["date"]
        entries = api.get(f"{API}/maximizer/ad-spend", timeout=15).json()["entries"]
        assert any(x["id"] == doc["id"] for x in entries)
        assert api.delete(f"{API}/maximizer/ad-spend/{doc['id']}", timeout=15).json()["ok"] is True
        entries = api.get(f"{API}/maximizer/ad-spend", timeout=15).json()["entries"]
        assert not any(x["id"] == doc["id"] for x in entries)

    def test_validation(self, api):
        assert api.post(f"{API}/maximizer/ad-spend",
                        json={"platform": "facebook", "label": "  ", "amount": 20}, timeout=15).status_code == 400
        assert api.post(f"{API}/maximizer/ad-spend",
                        json={"platform": "facebook", "label": "x", "amount": 0}, timeout=15).status_code == 400
        assert api.post(f"{API}/maximizer/ad-spend",
                        json={"platform": "facebook", "label": "x", "amount": 20, "date": "07/18/2026"},
                        timeout=15).status_code == 400
        assert api.delete(f"{API}/maximizer/ad-spend/nope", timeout=15).status_code == 404

    def test_weekly_report_includes_spend_for_report_week(self, api):
        report = api.get(f"{API}/maximizer/weekly-report", timeout=15).json()
        assert set(report["adSpend"].keys()) == {"total", "prevTotal", "delta", "entries"}
        before = report["adSpend"]["total"]
        # log a spend entry dated inside the report week
        doc = api.post(f"{API}/maximizer/ad-spend",
                       json={"platform": "tiktok", "label": "TEST report-week boost",
                             "amount": 50, "date": report["weekOf"]}, timeout=15).json()
        after = api.get(f"{API}/maximizer/weekly-report", timeout=15).json()
        assert abs(after["adSpend"]["total"] - before - 50) < 0.01
        assert any(x["id"] == doc["id"] for x in after["adSpend"]["entries"])
        tiktok = next(c for c in after["channels"] if c["channel"] == "tiktok")
        assert any("boosted" in ln for ln in tiktok["lines"])
        api.delete(f"{API}/maximizer/ad-spend/{doc['id']}", timeout=15)

    def test_import_status_shape_and_consistency(self, api):
        d = api.get(f"{API}/maximizer/import-status", timeout=15).json()
        assert set(d.keys()) == {"importedThisWeek", "importsThisWeek", "lastImportAt", "weekOf", "nudge"}
        monday = datetime.strptime(d["weekOf"], "%Y-%m-%d")
        assert monday.weekday() == 0
        if d["importedThisWeek"]:
            assert d["nudge"] is False
        # nudge only possible Fri/Sat/Sun
        local_wd = datetime.now(timezone.utc).weekday()
        if d["nudge"]:
            assert d["importsThisWeek"] == 0
