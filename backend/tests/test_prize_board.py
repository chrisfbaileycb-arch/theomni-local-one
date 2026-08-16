"""Backend tests for the owner-defined Prize Board.

Endpoints under test (owner Bearer):
  GET  /api/maximizer/prize-board
  PUT  /api/maximizer/prize-board  (validation)
  POST /api/maximizer/spin         (demo path: couponer -> dud, others -> good prizes)
  POST /api/maximizer/redeem       (returns posCode for staff)

NOTE (testing-agent iter18): the two original test classes (CRUD + Spin) were
consolidated into a single class so that `--dist loadscope` (pinned in
pytest.ini `-n 2`) keeps every test on ONE xdist worker. When they lived in
separate classes the CRUD teardown that restores defaults raced against the
Spin class's `_set_board` autouse on the OTHER worker, producing intermittent
"reward = default '10% Off Your Order'" flakes. Product code is unaffected.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-vault-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER_TOKEN = "tok_owner_e2e"

TEST_BOARD = {
    "goodPrizes": [
        {"label": "TEST Free Burger", "posCode": "261745"},
        {"label": "TEST 30% Off", "posCode": "300300"},
        {"label": "TEST Free Side", "posCode": ""},
    ],
    "dudPrize": {"label": "TEST Candy Bar", "posCode": "111111"},
}

DEFAULT_BOARD = {
    "goodPrizes": [
        {"label": "Free Sub (BOGO)", "posCode": ""},
        {"label": "30% Off Your Order", "posCode": ""},
        {"label": "Free Side & Drink", "posCode": ""},
        {"label": "20% Off Your Order", "posCode": ""},
    ],
    "dudPrize": {"label": "10% Off Your Order", "posCode": ""},
}


@pytest.fixture(scope="class")
def api():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OWNER_TOKEN}", "Content-Type": "application/json"})
    yield s
    # restore defaults after the class completes
    s.put(f"{API}/maximizer/prize-board", json=DEFAULT_BOARD, timeout=15)


class TestPrizeBoard:
    # --- CRUD & validation -------------------------------------------------
    def test_a_get_board_shape(self, api):
        r = api.get(f"{API}/maximizer/prize-board", timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert "goodPrizes" in b and "dudPrize" in b
        assert 2 <= len(b["goodPrizes"]) <= 6
        assert all("label" in p and "posCode" in p for p in b["goodPrizes"])

    def test_b_put_valid_board(self, api):
        r = api.put(f"{API}/maximizer/prize-board", json=TEST_BOARD, timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert [p["label"] for p in b["goodPrizes"]] == [p["label"] for p in TEST_BOARD["goodPrizes"]]
        assert b["dudPrize"]["label"] == "TEST Candy Bar"
        assert api.get(f"{API}/maximizer/prize-board", timeout=15).json() == b

    def test_c_put_too_few_good_prizes_rejected(self, api):
        r = api.put(f"{API}/maximizer/prize-board", json={
            "goodPrizes": [{"label": "Only One", "posCode": ""}],
            "dudPrize": {"label": "Dud", "posCode": ""}}, timeout=15)
        assert r.status_code == 400

    def test_d_put_empty_dud_rejected(self, api):
        r = api.put(f"{API}/maximizer/prize-board", json={
            "goodPrizes": TEST_BOARD["goodPrizes"],
            "dudPrize": {"label": "   ", "posCode": ""}}, timeout=15)
        assert r.status_code == 400

    # --- Spin behaviour ----------------------------------------------------
    def _reset_test_board(self, api):
        api.put(f"{API}/maximizer/prize-board", json=TEST_BOARD, timeout=15)

    def test_e_couponer_always_gets_dud(self, api):
        self._reset_test_board(api)
        for _ in range(5):
            r = api.post(f"{API}/maximizer/spin",
                         json={"isNewGuest": False, "segment": "promo_pool", "spaceId": "admin-demo"}, timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d["reward"] == "TEST Candy Bar" and d["tier"] == "standard"
            assert "posCode" not in d  # never leaked to the spin response

    def test_f_others_get_good_prizes_only(self, api):
        self._reset_test_board(api)
        labels = {p["label"] for p in TEST_BOARD["goodPrizes"]}
        seen = set()
        for _ in range(12):
            r = api.post(f"{API}/maximizer/spin",
                         json={"isNewGuest": True, "segment": "new", "spaceId": "admin-demo"}, timeout=15)
            d = r.json()
            assert d["reward"] in labels
            seen.add(d["reward"])
        assert len(seen) >= 2  # random across slots

    def test_g_headline_slot_is_high_tier(self, api):
        self._reset_test_board(api)
        for _ in range(30):
            d = api.post(f"{API}/maximizer/spin",
                         json={"isNewGuest": True, "segment": "new", "spaceId": "admin-demo"}, timeout=15).json()
            if d["reward"] == "TEST Free Burger":
                assert d["tier"] == "highValue" and d["couponCode"].startswith("HV-")
                return
        pytest.fail("Headline prize never hit in 30 spins")

    def test_h_redeem_returns_pos_code(self, api):
        self._reset_test_board(api)
        d = api.post(f"{API}/maximizer/spin",
                     json={"isNewGuest": False, "segment": "promo_pool", "spaceId": "admin-demo"}, timeout=15).json()
        r = api.post(f"{API}/maximizer/redeem", json={"code": d["couponCode"], "netSales": 12.5}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True and body["posCode"] == "111111"
