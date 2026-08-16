"""Backend tests for Google Business Profile OAuth plumbing (stub mode — no env keys)."""
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


class TestGoogleBusinessStub:
    def test_requires_auth(self):
        assert requests.get(f"{API}/google-business/start", timeout=15).status_code == 401
        assert requests.get(f"{API}/google-business/status", timeout=15).status_code == 401

    def test_start_stub_mode(self, api):
        d = api.get(f"{API}/google-business/start", timeout=15).json()
        assert d["mode"] == "stub"
        assert "GOOGLE_CLIENT_ID" in d["message"]

    def test_status_stub(self, api):
        d = api.get(f"{API}/google-business/status", timeout=15).json()
        assert d["mode"] == "stub"
        assert d["connected"] is False

    def test_callback_public_redirects_in_stub(self):
        r = requests.get(f"{API}/google-business/callback", timeout=15, allow_redirects=False)
        assert r.status_code in (302, 307)
        assert "google=stub" in r.headers.get("location", "")

    def test_locations_stub(self, api):
        d = api.get(f"{API}/google-business/locations", timeout=15).json()
        assert d["mode"] == "stub" and d["locations"][0]["name"] == "accounts/stub/locations/stub"

    def test_post_stub(self, api):
        d = api.post(f"{API}/google-business/posts", json={"summary": "Test post"}, timeout=15).json()
        assert d["mode"] == "stub" and d["state"] == "PUBLISHED"

    def test_location_selection_and_validation(self, api):
        r = api.put(f"{API}/google-business/location",
                    json={"name": "accounts/123/locations/456", "title": "Main Street"}, timeout=15)
        assert r.status_code == 200
        d = api.get(f"{API}/google-business/status", timeout=15).json()
        assert d["location"]["name"] == "accounts/123/locations/456"
        bad = api.put(f"{API}/google-business/location", json={"name": "not-a-location"}, timeout=15)
        assert bad.status_code == 422
        # cleanup
        api.delete(f"{API}/google-business/connection", timeout=15)

    def test_cta_must_be_https(self, api):
        r = api.post(f"{API}/google-business/posts",
                     json={"summary": "x", "ctaUrl": "http://insecure.example"}, timeout=15)
        assert r.status_code == 422
