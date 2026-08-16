"""Backend tests for the game pause toggle + per-week rest weeks."""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-vault-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER_TOKEN = "tok_owner_e2e"


def _monday(weeks_ahead=0):
    now = datetime.now(timezone.utc)
    mon = now - timedelta(days=now.weekday()) + timedelta(weeks=weeks_ahead)
    return mon.strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OWNER_TOKEN}", "Content-Type": "application/json"})
    yield s
    # cleanup: games back on, current week back to auto
    s.put(f"{API}/maximizer/game-settings", json={"enabled": True}, timeout=15)
    s.put(f"{API}/maximizer/game-plan/week", json={"weekStart": _monday(0), "gameId": None}, timeout=15)


@pytest.fixture(scope="module")
def raw():
    """Session WITHOUT the conftest 423-retry (asserts the paused status directly)."""
    from requests.adapters import HTTPAdapter
    s = requests.Session()
    s.mount("https://", HTTPAdapter())
    s.mount("http://", HTTPAdapter())
    yield s


class TestGameToggle:
    def test_pause_toggle_kills_active_game_and_public_spin(self, api, raw):
        r = api.put(f"{API}/maximizer/game-settings", json={"enabled": False}, timeout=15)
        assert r.status_code == 200 and r.json()["settings"]["enabled"] is False
        g = api.get(f"{API}/maximizer/games", timeout=15).json()
        assert g["active"] is None and g["enabled"] is False
        spin = raw.post(f"{API}/maximizer/spin", json={
            "agree": True, "email": "pausetest@example.com"}, timeout=15)
        assert spin.status_code == 423
        # PDFs must not crash while paused
        assert api.get(f"{API}/maximizer/qr-sheet.pdf", timeout=30).status_code == 200
        assert api.get(f"{API}/maximizer/table-tent.pdf", timeout=30).status_code == 200
        # back on
        r = api.put(f"{API}/maximizer/game-settings", json={"enabled": True}, timeout=15)
        assert r.json()["settings"]["enabled"] is True
        g = api.get(f"{API}/maximizer/games", timeout=15).json()
        assert g["active"] is not None

    def test_rest_week_none_schedules_no_game(self, api):
        wk = _monday(0)
        r = api.put(f"{API}/maximizer/game-plan/week", json={"weekStart": wk, "gameId": "none"}, timeout=15)
        assert r.status_code == 200 and r.json()["schedule"][wk] == "none"
        g = api.get(f"{API}/maximizer/games", timeout=15).json()
        assert g["active"] is None and g["enabled"] is True
        plan = api.get(f"{API}/maximizer/game-plan", timeout=15).json()
        assert plan["weeks"][0]["gameId"] == "none"
        # clear back to auto -> a game is active again
        api.put(f"{API}/maximizer/game-plan/week", json={"weekStart": wk, "gameId": None}, timeout=15)
        g = api.get(f"{API}/maximizer/games", timeout=15).json()
        assert g["active"] is not None

    def test_unknown_game_still_rejected(self, api):
        r = api.put(f"{API}/maximizer/game-plan/week",
                    json={"weekStart": _monday(1), "gameId": "not_a_game"}, timeout=15)
        assert r.status_code == 400

    def test_saas_industry_available(self, api):
        d = api.get(f"{API}/content/strategy", timeout=15).json()
        ids = {i["id"] for i in d["industries"]}
        assert "saas" in ids
        d = api.put(f"{API}/content/strategy", json={"industry": "saas"}, timeout=15).json()
        assert d["pacing"]["label"] == "Software / SaaS"
        api.put(f"{API}/content/strategy", json={"industry": "restaurant"}, timeout=15)
