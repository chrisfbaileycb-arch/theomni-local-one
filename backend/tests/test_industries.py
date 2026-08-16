"""Backend tests for the dynamic Industry Manager (owner-managed verticals)."""
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
    yield s
    # cleanup: strategy back to restaurant, remove any test verticals
    s.put(f"{API}/content/strategy", json={"industry": "restaurant"}, timeout=15)
    d = s.get(f"{API}/content/strategy", timeout=15).json()
    for i in d["industries"]:
        if i["id"].startswith("qa_test_vertical"):
            s.delete(f"{API}/content/industries/{i['id']}", timeout=15)


class TestIndustryManager:
    def test_requires_auth(self):
        assert requests.post(f"{API}/content/industries", json={"label": "X"}, timeout=15).status_code == 401
        assert requests.delete(f"{API}/content/industries/restaurant", timeout=15).status_code == 401

    def test_blank_label_rejected(self, api):
        r = api.post(f"{API}/content/industries", json={"label": "   "}, timeout=15)
        assert r.status_code == 400

    def test_add_update_switch_delete_lifecycle(self, api):
        body = {"label": "QA Test Vertical", "advisor": "Burst around QA demo days only.",
                "cadence": "2-day bursts", "window": "Mon-Tue", "rotation": "Email one week, QR the next"}
        d = api.post(f"{API}/content/industries", json=body, timeout=15).json()
        row = next(i for i in d["industries"] if i["id"] == "qa_test_vertical")
        assert row["label"] == "QA Test Vertical" and row["advisor"] == body["advisor"]

        # update
        d = api.put(f"{API}/content/industries/qa_test_vertical",
                    json={**body, "advisor": "Updated pacing advice."}, timeout=15).json()
        row = next(i for i in d["industries"] if i["id"] == "qa_test_vertical")
        assert row["advisor"] == "Updated pacing advice."

        # switch strategy to it -> pacing follows
        d = api.put(f"{API}/content/strategy", json={"industry": "qa_test_vertical"}, timeout=15).json()
        assert d["pacing"]["label"] == "QA Test Vertical"
        assert d["pacing"]["advisor"] == "Updated pacing advice."

        # cannot delete the selected industry
        assert api.delete(f"{API}/content/industries/qa_test_vertical", timeout=15).status_code == 400

        # switch away, then delete works
        api.put(f"{API}/content/strategy", json={"industry": "restaurant"}, timeout=15)
        d = api.delete(f"{API}/content/industries/qa_test_vertical", timeout=15).json()
        assert not any(i["id"] == "qa_test_vertical" for i in d["industries"])

    def test_slug_dedupe(self, api):
        b = {"label": "QA Test Vertical Dup"}
        d1 = api.post(f"{API}/content/industries", json=b, timeout=15).json()
        d2 = api.post(f"{API}/content/industries", json=b, timeout=15).json()
        ids = [i["id"] for i in d2["industries"] if i["id"].startswith("qa_test_vertical_dup")]
        assert len(ids) == 2 and len(set(ids)) == 2
        for iid in ids:
            api.delete(f"{API}/content/industries/{iid}", timeout=15)

    def test_update_unknown_404(self, api):
        r = api.put(f"{API}/content/industries/nope_missing", json={"label": "X"}, timeout=15)
        assert r.status_code == 404
        assert api.delete(f"{API}/content/industries/nope_missing", timeout=15).status_code == 404
