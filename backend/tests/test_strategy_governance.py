"""Backend tests for Content Director governance (strategy panel, pacing, disclaimer, AI directive)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-vault-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER_TOKEN = "tok_owner_e2e"

DISCLAIMER_START = "WARNING / STRATEGIC NOTICE: Gamified promotions are designed to drive high-density engagement."
VERTICALS = {"restaurant", "salon", "tattoo", "auto_repair", "contractor", "real_estate"}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OWNER_TOKEN}", "Content-Type": "application/json"})
    yield s
    s.put(f"{API}/content/strategy", json={"industry": "restaurant"}, timeout=15)


class TestStrategyGovernance:
    def test_get_defaults(self, api):
        r = api.get(f"{API}/content/strategy", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["industry"] in VERTICALS
        assert {i["id"] for i in d["industries"]} >= VERTICALS
        assert d["disclaimer"].startswith(DISCLAIMER_START)
        assert "staggering campaigns across short, limited timeframes" in d["disclaimer"]
        titles = {v["title"] for v in d["videos"]}
        assert "How to Run High-Converting Flash Campaigns" in titles
        assert "Rules of Engagement for Gamification" in titles
        for k in ("label", "advisor", "cadence", "window", "rotation"):
            assert k in d["pacing"]

    def test_industry_switch_retunes_pacing(self, api):
        d = api.put(f"{API}/content/strategy", json={"industry": "auto_repair"}, timeout=15).json()
        assert d["pacing"]["label"] == "Auto Repair"
        assert "low-bay" in d["pacing"]["advisor"]
        d = api.put(f"{API}/content/strategy", json={"industry": "salon"}, timeout=15).json()
        assert "mid-week" in d["pacing"]["advisor"] and "weekend" in d["pacing"]["advisor"]
        d = api.put(f"{API}/content/strategy", json={"industry": "restaurant"}, timeout=15).json()
        assert "kitchen bottlenecks" in d["pacing"]["advisor"]

    def test_bad_industry_rejected(self, api):
        r = api.put(f"{API}/content/strategy", json={"industry": "spaceport"}, timeout=15)
        assert r.status_code == 400

    def test_video_slot_updates_and_validation(self, api):
        cur = api.get(f"{API}/content/strategy", timeout=15).json()["videos"]
        vids = [{**v, "youtubeUrl": "https://youtu.be/dQw4w9WgXcQ"} if v["id"] == "flash-campaigns" else v
                for v in cur]
        d = api.put(f"{API}/content/strategy", json={"videos": vids}, timeout=15).json()
        slot = next(v for v in d["videos"] if v["id"] == "flash-campaigns")
        assert slot["youtubeUrl"] == "https://youtu.be/dQw4w9WgXcQ"
        bad = [{**v, "youtubeUrl": "https://vimeo.com/12345"} for v in cur]
        assert api.put(f"{API}/content/strategy", json={"videos": bad}, timeout=15).status_code == 400
        # clear back
        cleared = [{**v, "youtubeUrl": ""} for v in cur]
        api.put(f"{API}/content/strategy", json={"videos": cleared}, timeout=15)

    def test_requires_auth(self):
        assert requests.get(f"{API}/content/strategy", timeout=15).status_code == 401
