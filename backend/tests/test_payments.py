"""Backend tests for Stripe payments (Flow A sandbox): checkout, status, webhook guards."""
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-vault-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session_id():
    r = requests.post(f"{API}/payments/checkout", json={
        "lookup_key": "omnilocal_monthly", "origin_url": BASE_URL}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["checkout_url"].startswith("https://")
    return d["session_id"]


class TestPayments:
    def test_checkout_is_public_and_returns_url(self, session_id):
        assert session_id.startswith("cs_")

    def test_status_pending_before_payment(self, session_id):
        r = requests.get(f"{API}/payments/status/{session_id}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["session_id"] == session_id
        assert d["payment_status"] in ("pending", "unpaid")
        assert set(d.keys()) == {"session_id", "status", "payment_status"}

    def test_status_unknown_session_404(self):
        assert requests.get(f"{API}/payments/status/cs_test_doesnotexist", timeout=15).status_code == 404

    def test_unknown_lookup_key_rejected(self):
        r = requests.post(f"{API}/payments/checkout", json={
            "lookup_key": "nope_plan", "origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 500

    def test_webhook_rejects_bad_signature(self):
        r = requests.post(f"{API}/stripe/webhook", data=b"{}",
                          headers={"stripe-signature": "t=1,v1=bad"}, timeout=15)
        assert r.status_code == 400

    def test_yearly_price_exists(self):
        r = requests.post(f"{API}/payments/checkout", json={
            "lookup_key": "omnilocal_yearly", "origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 200 and r.json()["checkout_url"].startswith("https://")
