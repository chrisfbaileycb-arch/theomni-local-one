"""Backend tests for Coach Template Library + Coach-to-Calendar features.

Endpoints under test (all require owner Bearer token per test_credentials.md):
  GET    /api/coach/templates
  POST   /api/coach/template          (real Claude — used once to seed a disposable)
  DELETE /api/coach/template/{id}     (real + bogus)
  POST   /api/coach/template/{id}/to-calendar  (real + bogus)
  GET    /api/coach/template/{id}/pdf
  GET    /api/content/calendar        (used to verify persistence)

IMPORTANT: does NOT delete the 3 pre-existing templates. Only touches the disposable
one it creates itself.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://template-vault-41.preview.emergentagent.com").rstrip("/")
OWNER_TOKEN = "tok_owner_e2e"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {OWNER_TOKEN}",
        "Content-Type": "application/json",
    })
    return s


# ---------- GET /api/coach/templates -----------------------------------------
class TestCoachTemplatesList:
    def test_list_returns_seeded_templates(self, api):
        r = api.get(f"{BASE_URL}/api/coach/templates")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "templates" in data
        assert isinstance(data["templates"], list)
        assert len(data["templates"]) >= 3, f"expected >=3 seeded templates, got {len(data['templates'])}"
        # ceiling
        assert len(data["templates"]) <= 25

    def test_list_sorted_newest_first(self, api):
        r = api.get(f"{BASE_URL}/api/coach/templates")
        assert r.status_code == 200
        docs = r.json()["templates"]
        created = [d.get("createdAt") for d in docs]
        assert all(created), "every template must have createdAt"
        # newest first == descending
        assert created == sorted(created, reverse=True), f"not sorted newest first: {created}"

    def test_list_item_shape(self, api):
        r = api.get(f"{BASE_URL}/api/coach/templates")
        assert r.status_code == 200
        doc = r.json()["templates"][0]
        for k in ("id", "topic", "template", "createdAt"):
            assert k in doc, f"missing field {k}"
        assert isinstance(doc["template"], dict)
        # _id must NOT leak from mongo
        assert "_id" not in doc


# ---------- POST /api/coach/template/{id}/to-calendar ------------------------
class TestCoachToCalendar:
    def test_bogus_id_returns_404(self, api):
        r = api.post(f"{BASE_URL}/api/coach/template/does-not-exist-xyz/to-calendar")
        assert r.status_code == 404, r.text

    def test_add_to_calendar_persists(self, api):
        # pick an existing (seeded) template
        r = api.get(f"{BASE_URL}/api/coach/templates")
        assert r.status_code == 200
        templates = r.json()["templates"]
        assert templates, "need at least 1 seeded template"
        # prefer one with whereItGoes lines
        target = None
        for t in templates:
            if t.get("template", {}).get("whereItGoes"):
                target = t
                break
        assert target, "no seeded template has whereItGoes lines"
        tid = target["id"]
        expected_lines = target["template"]["whereItGoes"]

        # POST → to-calendar
        r = api.post(f"{BASE_URL}/api/coach/template/{tid}/to-calendar")
        assert r.status_code == 200, r.text
        payload = r.json()

        assert "added" in payload and isinstance(payload["added"], list)
        assert "addedCount" in payload
        assert payload["addedCount"] == len(expected_lines), (
            f"addedCount {payload['addedCount']} != whereItGoes count {len(expected_lines)}"
        )
        assert payload["addedCount"] > 0

        # per-post structure
        added = payload["added"]
        for p in added:
            for k in ("id", "date", "time", "title", "idea", "surface", "source", "status"):
                assert k in p, f"post missing {k}: {p}"
            assert p["time"] == "11:30 AM"
            assert p["source"] == "coach"
            assert p["status"] == "planned"
            assert p["surface"] in {
                "Instagram", "Facebook", "TikTok", "Google Business",
                "Email", "SMS", "YouTube", "In-Store", "Nextdoor", "Multi-platform"
            }

        # verify every-2-days cadence starting tomorrow
        from datetime import datetime, timezone, timedelta
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        dates = [datetime.strptime(p["date"], "%Y-%m-%d").date() for p in added]
        assert dates[0] == tomorrow, f"first post date should be tomorrow {tomorrow}, got {dates[0]}"
        for i in range(1, len(dates)):
            gap = (dates[i] - dates[0]).days
            assert gap == 2 * i, f"expected {2*i}-day offset, got {gap} (dates={dates})"

        # verify persistence via GET /api/content/calendar
        # payload shape: {weeks:[{weekOf, label, days:[{date, posts:[...]}]}]}
        r2 = api.get(f"{BASE_URL}/api/content/calendar")
        assert r2.status_code == 200, r2.text
        cal = r2.json()
        added_ids = {p["id"] for p in added}
        found_ids = set()
        for wk in cal.get("weeks", []):
            for day in wk.get("days", []):
                for post in day.get("posts", []):
                    if post.get("id") in added_ids:
                        found_ids.add(post["id"])
                        # inline sanity: fields survived round-trip
                        assert post.get("source") == "coach"
                        assert post.get("status") == "planned"
                        assert post.get("time") == "11:30 AM"
        assert found_ids == added_ids, (
            f"not all added posts persisted; missing={added_ids - found_ids}"
        )


# ---------- DELETE /api/coach/template/{id} ----------------------------------
class TestCoachTemplateDelete:
    def test_delete_bogus_returns_404(self, api):
        r = api.delete(f"{BASE_URL}/api/coach/template/does-not-exist-xyz-2")
        assert r.status_code == 404

    def test_create_and_delete_disposable(self, api):
        """Real Claude call to create a disposable template, verify shelf includes it,
        then delete only THAT one and confirm it disappears. Never touches seeded ones."""
        # snapshot existing ids
        before = api.get(f"{BASE_URL}/api/coach/templates").json()["templates"]
        before_ids = {t["id"] for t in before}

        # Create (real Claude — allow up to 90s)
        r = api.post(
            f"{BASE_URL}/api/coach/template",
            json={"topic": "test disposable play"},
            timeout=95,
        )
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:400]}"
        doc = r.json()
        assert "id" in doc
        assert doc.get("topic") == "test disposable play"
        assert "template" in doc and isinstance(doc["template"], dict)
        disposable_id = doc["id"]
        assert disposable_id not in before_ids, "new id collided with existing"

        # Confirm shelf includes it (newest first)
        r = api.get(f"{BASE_URL}/api/coach/templates")
        assert r.status_code == 200
        after = r.json()["templates"]
        assert any(t["id"] == disposable_id for t in after), "disposable not in shelf"
        # newest first → should be index 0
        assert after[0]["id"] == disposable_id

        # PDF works for the disposable
        r_pdf = api.get(f"{BASE_URL}/api/coach/template/{disposable_id}/pdf")
        assert r_pdf.status_code == 200
        assert "application/pdf" in r_pdf.headers.get("content-type", ""), r_pdf.headers
        assert r_pdf.content[:4] == b"%PDF", r_pdf.content[:12]

        # DELETE only the disposable
        r_del = api.delete(f"{BASE_URL}/api/coach/template/{disposable_id}")
        assert r_del.status_code == 200
        assert r_del.json() == {"ok": True}

        # Verify it's gone AND that all seeded ids are still there
        r = api.get(f"{BASE_URL}/api/coach/templates")
        assert r.status_code == 200
        final = r.json()["templates"]
        final_ids = {t["id"] for t in final}
        assert disposable_id not in final_ids, "disposable still present after delete"
        # every previously-existing seeded id must still be present
        assert before_ids.issubset(final_ids), f"seed data was destroyed: missing={before_ids - final_ids}"


# ---------- GET /api/coach/template/{id}/pdf ---------------------------------
class TestCoachTemplatePdf:
    def test_pdf_valid(self, api):
        r = api.get(f"{BASE_URL}/api/coach/templates")
        tid = r.json()["templates"][0]["id"]
        r_pdf = api.get(f"{BASE_URL}/api/coach/template/{tid}/pdf")
        assert r_pdf.status_code == 200, r_pdf.text[:200]
        assert "application/pdf" in r_pdf.headers.get("content-type", "")
        assert r_pdf.content[:4] == b"%PDF"
        assert len(r_pdf.content) > 500  # sanity: at least a real PDF

    def test_pdf_bogus_404(self, api):
        r = api.get(f"{BASE_URL}/api/coach/template/does-not-exist-xyz-3/pdf")
        assert r.status_code == 404
