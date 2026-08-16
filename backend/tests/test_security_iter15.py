"""Iteration 15 — Security hardening regression.

Verifies:
1. uploadId validation on /content/critic/upload/chunk, /content/critic/analyze, /vault/save
   - path-traversal / malformed → 400 "Invalid uploadId."
   - well-formed UUID but unknown → 404
2. App-level CORS lockdown (http://localhost:8001)
   - evil origin: no access-control-allow-origin header
   - approved emergent-preview origin: header echoed
3. No raw exception leak: server.py has no f-string detail leaking `{e}`.
4. Chunked upload pipeline still works end-to-end with legit UUIDs.
5. Coach-to-calendar: uuid post ids (c-YYYY-MM-DD-<8 hex>), cap at 8 posts.
"""
import os
import re
import requests
import subprocess
import uuid


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break

API = f"{BASE_URL}/api"
LOCAL_API = "http://localhost:8001/api"
OWNER = {"Authorization": "Bearer tok_owner_e2e"}
WELL_FORMED_UNKNOWN = "00000000-0000-4000-8000-000000000000"


# --- Security fix 1: uploadId validation ---
class TestUploadIdValidation:
    def test_chunk_path_traversal_400(self):
        r = requests.post(f"{API}/content/critic/upload/chunk",
                          headers=OWNER,
                          data={"uploadId": "../../etc/passwd", "index": 0},
                          files={"chunk": ("c.bin", b"hi", "application/octet-stream")},
                          timeout=15)
        assert r.status_code == 400, r.text
        assert "Invalid uploadId" in r.text

    def test_chunk_malformed_400(self):
        r = requests.post(f"{API}/content/critic/upload/chunk",
                          headers=OWNER,
                          data={"uploadId": "not-a-uuid", "index": 0},
                          files={"chunk": ("c.bin", b"hi", "application/octet-stream")},
                          timeout=15)
        assert r.status_code == 400

    def test_chunk_well_formed_unknown_404(self):
        r = requests.post(f"{API}/content/critic/upload/chunk",
                          headers=OWNER,
                          data={"uploadId": WELL_FORMED_UNKNOWN, "index": 0},
                          files={"chunk": ("c.bin", b"hi", "application/octet-stream")},
                          timeout=15)
        assert r.status_code == 404

    def test_analyze_malformed_400(self):
        r = requests.post(f"{API}/content/critic/analyze",
                          headers=OWNER,
                          json={"uploadId": "nope-not-a-real-id", "filename": "clip.mp4"},
                          timeout=15)
        assert r.status_code == 400

    def test_analyze_well_formed_unknown_404(self):
        r = requests.post(f"{API}/content/critic/analyze",
                          headers=OWNER,
                          json={"uploadId": WELL_FORMED_UNKNOWN, "filename": "clip.mp4"},
                          timeout=15)
        assert r.status_code == 404

    def test_vault_save_malformed_400(self):
        r = requests.post(f"{API}/vault/save",
                          headers=OWNER,
                          json={"uploadId": "../../evil", "filename": "clip.mp4", "title": "x"},
                          timeout=15)
        assert r.status_code == 400, r.text

    def test_vault_save_well_formed_unknown_404(self):
        r = requests.post(f"{API}/vault/save",
                          headers=OWNER,
                          json={"uploadId": WELL_FORMED_UNKNOWN, "filename": "clip.mp4", "title": "x"},
                          timeout=15)
        assert r.status_code == 404

    def test_no_file_written_for_traversal(self):
        # /app/uploads/../../etc/passwd.part must NOT exist / be modified
        assert not os.path.exists("/etc/passwd.part")


# --- Security fix 2: CORS lockdown at app-level ---
class TestCORSLockdown:
    def test_evil_origin_gets_no_acao(self):
        r = requests.options(f"{LOCAL_API}/",
                             headers={"Origin": "https://evil.com",
                                      "Access-Control-Request-Method": "GET"},
                             timeout=15)
        acao = r.headers.get("access-control-allow-origin")
        assert acao is None, f"CORS leaked to evil.com: {acao}"

    def test_evil_origin_get_gets_no_acao(self):
        r = requests.get(f"{LOCAL_API}/",
                         headers={"Origin": "https://evil.com"},
                         timeout=15)
        acao = r.headers.get("access-control-allow-origin")
        assert acao is None, f"CORS leaked to evil.com on GET: {acao}"

    def test_preview_origin_gets_acao(self):
        approved = "https://template-vault-41.preview.emergentagent.com"
        r = requests.options(f"{LOCAL_API}/",
                             headers={"Origin": approved,
                                      "Access-Control-Request-Method": "GET"},
                             timeout=15)
        acao = r.headers.get("access-control-allow-origin")
        assert acao == approved, f"expected {approved}, got {acao}"

    def test_preview_origin_get_gets_acao(self):
        approved = "https://template-vault-41.preview.emergentagent.com"
        r = requests.get(f"{LOCAL_API}/",
                         headers={"Origin": approved},
                         timeout=15)
        acao = r.headers.get("access-control-allow-origin")
        assert acao == approved


# --- Security fix 3: no raw exception leak in server.py ---
class TestNoRawExceptionLeak:
    def test_no_fstring_e_in_httpexception(self):
        with open("/app/backend/server.py") as f:
            src = f.read()
        # Look for `detail=f"...{e}...` patterns
        leaks = re.findall(r'detail=f"[^"]*\{e[^}]*\}[^"]*"', src)
        assert not leaks, f"raw exception leaks found: {leaks}"

    def test_logger_exception_still_used(self):
        with open("/app/backend/server.py") as f:
            src = f.read()
        assert "logger.exception" in src or "logger.error" in src


# --- Regression: full chunked upload pipeline with legit UUID ---
class TestChunkPipelineHappyPath:
    def test_init_chunk_size(self):
        r = requests.post(f"{API}/content/critic/upload/init",
                          headers=OWNER, json={"filename": "clip.mp4"}, timeout=15)
        assert r.status_code == 200
        uid = r.json()["uploadId"]
        # must be UUID v4 shape
        assert re.match(r"^[0-9a-f-]{36}$", uid)

        payload = b"x" * 1024
        r = requests.post(f"{API}/content/critic/upload/chunk",
                          headers=OWNER,
                          data={"uploadId": uid, "index": 0},
                          files={"chunk": ("c.bin", payload, "application/octet-stream")},
                          timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["size"] == len(payload)

        # second chunk accumulates
        r = requests.post(f"{API}/content/critic/upload/chunk",
                          headers=OWNER,
                          data={"uploadId": uid, "index": 1},
                          files={"chunk": ("c.bin", payload, "application/octet-stream")},
                          timeout=30)
        assert r.status_code == 200
        assert r.json()["size"] == 2 * len(payload)


# --- Regression: coach features from iter_14 ---
class TestCoachRegression:
    def test_templates_seeded(self):
        r = requests.get(f"{API}/coach/templates", headers=OWNER, timeout=15)
        assert r.status_code == 200
        templates = r.json()["templates"]
        assert len(templates) >= 3
        # Ensure no Mongo _id leak
        for t in templates:
            assert "_id" not in t
            assert "id" in t and "topic" in t and "template" in t

    def test_to_calendar_uuid_ids_and_cap(self):
        r = requests.get(f"{API}/coach/templates", headers=OWNER, timeout=15)
        templates = r.json()["templates"]
        # find one that has whereItGoes lines
        target = None
        for t in templates:
            lines = t.get("template", {}).get("whereItGoes", [])
            if lines:
                target = t
                break
        assert target, "no seeded template with whereItGoes"

        r = requests.post(f"{API}/coach/template/{target['id']}/to-calendar",
                          headers=OWNER, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["addedCount"] > 0
        assert d["addedCount"] <= 8, f"cap violated: {d['addedCount']}"

        pat = re.compile(r"^c-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$")
        for post in d["added"]:
            assert pat.match(post["id"]), f"bad post id format: {post['id']}"
            assert post["source"] == "coach"
            assert post["status"] == "planned"
            assert post["time"] == "11:30 AM"

        # cleanup: remove just-added posts to keep calendar clean
        for post in d["added"]:
            requests.post(f"{API}/content/calendar/remove",
                          headers=OWNER, json={"id": post["id"]}, timeout=15)
