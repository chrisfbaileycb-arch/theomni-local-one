"""Backend tests for the Weekly Win Report v2 (channel activity + POS accountability + prize payouts)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-vault-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER_TOKEN = "tok_owner_e2e"

EXPECTED_CHANNELS = {"wheel", "google", "facebook", "instagram", "tiktok", "youtube", "calendar", "email"}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OWNER_TOKEN}", "Content-Type": "application/json"})
    return s


class TestWeeklyReportV2:
    def test_report_has_new_sections(self, api):
        d = api.get(f"{API}/maximizer/weekly-report", timeout=15).json()
        assert "posImport" in d and "prizeBreakdown" in d and "channels" in d
        pi = d["posImport"]
        assert set(pi.keys()) == {"importedThisWeek", "importsInWeek", "lastImportAt"}
        assert isinstance(d["prizeBreakdown"], list)
        for p in d["prizeBreakdown"]:
            assert set(p.keys()) == {"reward", "redeemed", "revenue"}

    def test_channels_cover_all_platforms(self, api):
        d = api.get(f"{API}/maximizer/weekly-report", timeout=15).json()
        chans = {c["channel"]: c for c in d["channels"]}
        assert set(chans.keys()) == EXPECTED_CHANNELS
        assert chans["wheel"]["live"] is True and len(chans["wheel"]["lines"]) == 3
        for p in ("google", "facebook", "instagram", "tiktok", "youtube"):
            assert chans[p]["live"] is False and "note" in chans[p]
            assert "published" in chans[p]["lines"][0]
        assert "planned" in chans["calendar"]["lines"][0]
        assert "stub mode" in chans["email"]["lines"][0]  # no Resend key in this env

    def test_pos_import_is_logged(self, api):
        csv = "name,email,visits,coupon_ratio\nReport TestGuy,report-v2@test.example,4,0.1\n"
        r = api.post(f"{API}/maximizer/import-csv", json={"csv": csv}, timeout=20)
        assert r.status_code == 200 and r.json()["imported"] == 1
        d = api.get(f"{API}/maximizer/weekly-report", timeout=15).json()
        assert d["posImport"]["lastImportAt"] is not None
        # lastImportAt must be fresh (within the last 2 minutes)
        from datetime import datetime, timezone
        last = datetime.fromisoformat(d["posImport"]["lastImportAt"])
        assert (datetime.now(timezone.utc) - last).total_seconds() < 120

    def test_pdf_still_one_document(self, api):
        r = api.get(f"{API}/maximizer/weekly-report.pdf", timeout=30)
        assert r.status_code == 200 and r.content[:4] == b"%PDF" and len(r.content) > 800

    def test_send_now_email_includes_channels(self, api):
        r = api.post(f"{API}/maximizer/report-email/send-now", timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "stubbed"
