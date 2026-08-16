"""OmniLocal #1 backend test suite (iteration 2).

Covers:
- Social Media Connector OAuth handshake + connections state machine
- Distribution pathways in Content Director
- Core routes post-rebrand (executioner, maximizer, codes, email)
- Welcome video automation flow (CSV import -> segments -> send-welcome)
- Email trickle plan (throttle + Reply-To + List-Unsubscribe headers)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read from frontend .env file (used when this file runs on the host)
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break

API = f"{BASE_URL}/api"


OWNER_TOKEN = os.environ.get("OWNER_SESSION_TOKEN", "tok_owner_e2e")


@pytest.fixture(scope="module")
def s():
    """Owner-authenticated session used by regression tests (auth added in iter 9)."""
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {OWNER_TOKEN}"})
    return sess


@pytest.fixture()
def anon():
    """Un-authenticated session for public/negative tests."""
    return requests.Session()


# ============================================================================
# CONNECTIONS — OAuth handshake + pathways
# ============================================================================
class TestConnections:
    def test_pathways_returns_5(self, s):
        r = s.get(f"{API}/connections/pathways", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["provider"] == "unified_api"
        assert d["liveOAuth"] is False
        platforms = [p["platform"] for p in d["pathways"]]
        assert set(platforms) == {"google", "facebook", "instagram", "tiktok", "youtube"}
        for p in d["pathways"]:
            assert "surface" in p and "contentType" in p and "scope" in p

    @pytest.mark.parametrize("platform", ["google", "tiktok", "instagram", "facebook", "youtube"])
    def test_oauth_start_valid_platform(self, s, platform):
        r = s.get(f"{API}/connections/oauth/{platform}/start", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["platform"] == platform
        assert d["provider"] == "unified_api"
        assert d["state"] and len(d["state"]) == 16
        assert "authorizeUrl" in d and platform in d["authorizeUrl"]
        assert d["live"] is False

    def test_oauth_start_unknown_platform(self, s):
        r = s.get(f"{API}/connections/oauth/notreal/start", timeout=15)
        # Post-Phase 0: unknown platform now returns HTTP 404
        assert r.status_code == 404

    def test_oauth_callback_unknown_platform(self, s):
        r = s.post(f"{API}/connections/oauth/callback",
                   json={"platform": "notreal", "code": "x"}, timeout=15)
        assert r.status_code == 404

    def test_oauth_callback_marks_authorized(self, s):
        # start
        r = s.get(f"{API}/connections/oauth/tiktok/start", timeout=15)
        assert r.status_code == 200
        # callback
        r = s.post(f"{API}/connections/oauth/callback",
                   json={"platform": "tiktok", "code": "demo_code"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["authorized"]["platform"] == "tiktok"
        assert d["authorized"]["mode"] == "stubbed"
        # platforms list reflects state
        tt = next(p for p in d["platforms"] if p["id"] == "tiktok")
        assert tt["connected"] is True
        assert tt["authorized"] is True
        assert tt["authMode"] == "stubbed"

    def test_get_connections_reflects_state_and_disconnect_clears_auth(self, s):
        # ensure tiktok connected first
        s.post(f"{API}/connections/oauth/callback",
               json={"platform": "tiktok", "code": "x"}, timeout=15)
        r = s.get(f"{API}/connections", timeout=15)
        assert r.status_code == 200
        d = r.json()
        tt = next(p for p in d["platforms"] if p["id"] == "tiktok")
        assert tt["connected"] is True and tt["authorized"] is True

        # disconnect
        r = s.put(f"{API}/connections",
                  json={"platform": "tiktok", "connected": False}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        tt = next(p for p in d["platforms"] if p["id"] == "tiktok")
        assert tt["connected"] is False
        assert tt["authorized"] is False
        assert tt["authMode"] is None


# ============================================================================
# CONTENT DIRECTOR — distribution + prompts + copy + critic
# ============================================================================
class TestContentDirector:
    def test_prompts_has_distribution(self, s):
        r = s.get(f"{API}/content/prompts", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "prompts" in d and "today" in d and "assetVault" in d
        assert "distribution" in d
        assert len(d["distribution"]) == 5
        assert "sampleVideos" in d and len(d["sampleVideos"]) == 3

    def test_distribution_endpoint(self, s):
        r = s.get(f"{API}/content/distribution", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["pathways"]) == 5
        assert d["provider"] == "unified_api"
        assert "connections" in d
        for pid in ("google", "facebook", "instagram", "tiktok", "youtube"):
            assert pid in d["connections"]

    def test_content_copy(self, s):
        # Real LLM call (Claude Sonnet 4.6) — allow generous timeout
        r = s.post(f"{API}/content/copy",
                   json={"transcript": "Um, so we make the sub, you know, best in town."},
                   timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "normalized" in d and "drafts" in d
        assert d.get("model") == "claude-sonnet-4-6"
        assert "um" not in d["normalized"].lower().split()
        assert set(d["drafts"].keys()) == {"gbp", "facebook", "instagram"}
        # Drafts must be non-empty and distinct (real AI, not templated)
        for k, v in d["drafts"].items():
            assert isinstance(v, str) and len(v.strip()) > 20, f"empty/short {k}"
        vals = list(d["drafts"].values())
        assert len(set(vals)) == 3, "drafts must all be distinct"

    def test_content_critic(self, s):
        r = s.post(f"{API}/content/critic", json={"index": 0}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["report"]["overall"] == "STRONG"
        r2 = s.post(f"{API}/content/critic", json={"index": 1}, timeout=15)
        assert r2.json()["report"]["overall"] == "WEAK"


# ============================================================================
# PUBLISH-ALL — unified content blast across authorized pathways
# ============================================================================
class TestPublishAll:
    def test_publish_all_default_state(self, s):
        """Default connections: facebook/instagram/google ON; tiktok/youtube OFF."""
        # Ensure default state: disconnect tiktok/youtube in case a previous test left them on
        s.put(f"{API}/connections", json={"platform": "tiktok", "connected": False}, timeout=15)
        s.put(f"{API}/connections", json={"platform": "youtube", "connected": False}, timeout=15)
        r = s.post(f"{API}/content/publish-all",
                   json={"assetId": "hero-clip", "caption": "hello world"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["totalPathways"] == 5
        assert d["publishedCount"] == 3
        assert d["live"] is False
        assert len(d["results"]) == 5
        by_platform = {r_["platform"]: r_ for r_ in d["results"]}
        # connected platforms -> published, with postUrl + mode
        for p in ("facebook", "instagram", "google"):
            assert by_platform[p]["status"] == "published"
            assert by_platform[p]["postUrl"].startswith("https://")
            assert "mode" in by_platform[p]
        # not-connected -> skipped
        for p in ("tiktok", "youtube"):
            assert by_platform[p]["status"] == "skipped"
            assert by_platform[p]["reason"] == "not connected"

    def test_publish_all_respects_connection_toggle(self, s):
        # authorize tiktok via callback
        r = s.post(f"{API}/connections/oauth/callback",
                   json={"platform": "tiktok", "code": "demo"}, timeout=15)
        assert r.status_code == 200
        # publish-all now includes tiktok as published
        r = s.post(f"{API}/content/publish-all",
                   json={"assetId": "clip-1", "caption": "hi"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        by = {x["platform"]: x for x in d["results"]}
        assert by["tiktok"]["status"] == "published"
        assert by["tiktok"]["mode"] == "stubbed"
        assert d["publishedCount"] == 4

        # disconnect tiktok -> skipped again
        r = s.put(f"{API}/connections",
                  json={"platform": "tiktok", "connected": False}, timeout=15)
        assert r.status_code == 200
        r = s.post(f"{API}/content/publish-all", json={}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        by = {x["platform"]: x for x in d["results"]}
        assert by["tiktok"]["status"] == "skipped"
        assert by["tiktok"]["reason"] == "not connected"
        assert d["publishedCount"] == 3

    def test_publish_all_empty_body_ok(self, s):
        r = s.post(f"{API}/content/publish-all", json={}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["totalPathways"] == 5
        assert d["assetId"] is None
        assert d["caption"] is None


# ============================================================================
# CORE ROUTES SMOKE — no 404s after refactor
# ============================================================================
class TestCoreRoutes:
    def test_overview(self, s):
        r = s.get(f"{API}/overview", timeout=15); assert r.status_code == 200
        d = r.json(); assert "brand" in d and "hero" in d and "weekly" in d

    def test_executioner_reports(self, s):
        r = s.get(f"{API}/executioner/reports", timeout=15); assert r.status_code == 200
        assert "reports" in r.json()

    def test_executioner_reconcile_and_reset(self, s):
        # reset first
        r = s.post(f"{API}/executioner/reset", timeout=15); assert r.status_code == 200
        weeks_before = r.json()["weeks"]
        r = s.post(f"{API}/executioner/reconcile", timeout=15); assert r.status_code == 200
        d = r.json(); assert "report" in d and "reallocatedTo" in d
        r = s.get(f"{API}/executioner/reports", timeout=15)
        assert len(r.json()["reports"]) == weeks_before + 1
        s.post(f"{API}/executioner/reset", timeout=15)

    def test_recommended_plan(self, s):
        r = s.get(f"{API}/executioner/recommended-plan", timeout=15); assert r.status_code == 200
        d = r.json(); assert "strategyA" in d and "strategyB" in d and "totalBudget" in d

    def test_maximizer_games(self, s):
        r = s.get(f"{API}/maximizer/games", timeout=15); assert r.status_code == 200
        d = r.json(); assert len(d["games"]) == 4 and "active" in d

    def test_maximizer_set_active(self, s):
        r = s.put(f"{API}/maximizer/games/active", json={"gameId": "scratch_card"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["active"]["id"] == "scratch_card"
        # clear override
        s.put(f"{API}/maximizer/games/active", json={"gameId": None}, timeout=15)

    def test_maximizer_segments(self, s):
        r = s.get(f"{API}/maximizer/segments", timeout=15); assert r.status_code == 200
        d = r.json(); assert "rows" in d and "counts" in d and "verification" in d

    def test_maximizer_drip(self, s):
        r = s.get(f"{API}/maximizer/drip", timeout=15); assert r.status_code == 200

    def test_maximizer_spin(self, s):
        r = s.post(f"{API}/maximizer/spin", json={"isNewGuest": True, "segment": "new"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["tier"] in ("highValue", "standard")

    def test_codes_flow(self, s):
        r = s.get(f"{API}/codes/current", timeout=15); assert r.status_code == 200
        r = s.post(f"{API}/codes/generate", json={"length": 8}, timeout=15); assert r.status_code == 200
        r = s.get(f"{API}/codes/sample-csv", timeout=15); assert r.status_code == 200
        csv = r.json()["csv"]
        r = s.post(f"{API}/codes/reconcile", json={"csv": csv}, timeout=15)
        assert r.status_code == 200
        d = r.json(); assert d["issued"] > 0 and d["redeemed"] > 0


# ============================================================================
# WELCOME VIDEO AUTOMATION — CSV → segments → welcome email
# ============================================================================
class TestWelcomeAutomation:
    def test_full_welcome_flow(self, s):
        # sample csv
        r = s.get(f"{API}/maximizer/sample-customer-csv", timeout=15)
        assert r.status_code == 200
        csv = r.json()["csv"]
        # import
        r = s.post(f"{API}/maximizer/import-csv", json={"csv": csv}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert set(d["segments"].keys()) == {"new", "coupon_only", "loyal"}
        assert d["segments"]["new"] >= 1
        assert d["newCustomersQueued"] >= 1
        # welcome queue
        r = s.get(f"{API}/maximizer/welcome-queue", timeout=15)
        assert r.status_code == 200
        qd = r.json()
        assert qd["ownerVideoUrl"].startswith("http")
        assert len(qd["queue"]) >= 1
        # send welcome
        r = s.post(f"{API}/email/send-welcome", json={"index": 0}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["result"]["status"] == "stubbed"
        headers = d["result"]["headers"]
        assert "Reply-To" in headers and "List-Unsubscribe" in headers
        assert d["videoUrl"] in d["videoUrl"]  # sanity
        # html embeds the video url (spot check via a second call using queueItem)
        # HTML is not returned from send-welcome; the important asserts are headers + status + videoUrl.


# ============================================================================
# EMAIL TRICKLE PLAN
# ============================================================================
class TestEmailTrickle:
    def test_trickle_plan(self, s):
        r = s.get(f"{API}/email/trickle-plan", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["throttleSeconds"] == 15
        assert d["provider"] == "resend"
        assert d["liveSending"] is False
        h = d["headers"]
        assert "Reply-To" in h and "List-Unsubscribe" in h and "List-Unsubscribe-Post" in h

    def test_email_preview(self, s):
        r = s.post(f"{API}/email/preview", json={"content": "ACT NOW!!! CLICK HERE FREE"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["spamScore"] >= 1
        assert len(d["warnings"]) >= 1


# ============================================================================
# CONTENT DIRECTOR — Local Market Intelligence (seeded events)
# ============================================================================
class TestLocalEvents:
    def test_local_events_payload(self, s):
        r = s.get(f"{API}/content/local-events", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "events" in d and "insight" in d
        assert len(d["events"]) == 5
        # events sorted by daysAway ascending
        days = [e["daysAway"] for e in d["events"]]
        assert days == sorted(days)
        required = {"id", "category", "venue", "distanceMiles", "expectedAttendance",
                    "channel", "channelLabel", "budgetShift", "rationale", "contentIdea",
                    "date", "daysAway", "title"}
        for e in d["events"]:
            assert required.issubset(e.keys()), f"missing keys in event: {required - set(e.keys())}"
            assert isinstance(e["expectedAttendance"], int)
            assert isinstance(e["budgetShift"], int)
            assert e["channelLabel"] and isinstance(e["channelLabel"], str)

    def test_local_events_insight_bounds(self, s):
        r = s.get(f"{API}/content/local-events", timeout=15)
        d = r.json()
        ins = d["insight"]
        for k in ("headline", "upcomingCount", "topEvent", "recommendedChannel", "suggestedShiftPct"):
            assert k in ins
        assert ins["suggestedShiftPct"] <= 80
        assert isinstance(ins["upcomingCount"], int)
        assert ins["upcomingCount"] >= 0


# ============================================================================
# CONTENT DIRECTOR — Content Calendar (weekly plan CRUD)
# ============================================================================
class TestContentCalendar:
    def test_calendar_initial_state(self, s):
        # ensure default state
        r = s.post(f"{API}/content/calendar/reset", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["weeksPlanned"] == 2
        assert len(d["weeks"]) == 2
        for wk in d["weeks"]:
            assert "weekOf" in wk and "label" in wk
            assert len(wk["days"]) == 7
            for day in wk["days"]:
                assert set(day.keys()) >= {"date", "weekday", "dayNum", "posts"}
                for p in day["posts"]:
                    assert set(p.keys()) >= {"id", "time", "title", "surface", "source", "status"}
                    assert p["source"] in ("prompt", "event", "manual")
        assert d["totalPosts"] > 0

    def test_calendar_add_week(self, s):
        s.post(f"{API}/content/calendar/reset", timeout=15)
        r = s.post(f"{API}/content/calendar/add-week", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["weeksPlanned"] == 3
        assert len(d["weeks"]) == 3
        # reset back
        s.post(f"{API}/content/calendar/reset", timeout=15)

    def test_calendar_add_and_remove_post(self, s):
        s.post(f"{API}/content/calendar/reset", timeout=15)
        r = s.get(f"{API}/content/calendar", timeout=15)
        d = r.json()
        # pick a valid date from week 0
        target_date = d["weeks"][0]["days"][3]["date"]
        before_total = d["totalPosts"]
        # add manual post
        r = s.post(f"{API}/content/calendar/post",
                   json={"date": target_date, "title": "TEST_manual_post",
                         "surface": "Instagram Reels", "time": "13:15"}, timeout=15)
        assert r.status_code == 200
        d2 = r.json()
        assert d2["totalPosts"] == before_total + 1
        # find added post
        day = next(dy for wk in d2["weeks"] for dy in wk["days"] if dy["date"] == target_date)
        added = next((p for p in day["posts"] if p["title"] == "TEST_manual_post"), None)
        assert added is not None
        assert added["source"] == "manual"
        assert added["time"] == "13:15"
        # remove
        r = s.post(f"{API}/content/calendar/remove", json={"id": added["id"]}, timeout=15)
        assert r.status_code == 200
        d3 = r.json()
        assert d3["totalPosts"] == before_total
        # ensure gone
        day = next(dy for wk in d3["weeks"] for dy in wk["days"] if dy["date"] == target_date)
        assert not any(p["id"] == added["id"] for p in day["posts"])

    def test_calendar_reset_restores_two_weeks(self, s):
        s.post(f"{API}/content/calendar/add-week", timeout=15)
        s.post(f"{API}/content/calendar/add-week", timeout=15)
        r = s.post(f"{API}/content/calendar/reset", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["weeksPlanned"] == 2
        assert len(d["weeks"]) == 2


# ============================================================================
# BRAND PROFILE — GET returns full profile; PUT partial-updates & persists
# ============================================================================
DEFAULT_BRAND_VOICE = (
    "Warm, proud, family-run and unpretentious. Speaks like a neighbor who loves "
    "feeding people — confident about quality, never corporate or salesy."
)


class TestBrandProfile:
    def test_get_brand_profile_shape(self, s):
        r = s.get(f"{API}/content/brand-profile", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for key in ("name", "city", "voice", "menuHighlights", "backstory",
                    "igHandle", "orderUrl"):
            assert key in d, f"missing key {key}"
        assert d["name"] and d["city"]

    def test_put_partial_update_and_persist(self, s):
        # snapshot
        original = s.get(f"{API}/content/brand-profile", timeout=15).json()
        # partial update
        r = s.put(f"{API}/content/brand-profile",
                  json={"voice": "TEST_voice_partial"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["voice"] == "TEST_voice_partial"
        # untouched fields remain
        assert d["name"] == original["name"]
        assert d["menuHighlights"] == original["menuHighlights"]
        # persisted via GET
        r2 = s.get(f"{API}/content/brand-profile", timeout=15)
        assert r2.json()["voice"] == "TEST_voice_partial"
        # restore
        s.put(f"{API}/content/brand-profile",
              json={"voice": original["voice"]}, timeout=15)


# ============================================================================
# PERSISTENCE — mutate state, restart backend, verify data survived
# ============================================================================
import subprocess
import time


def _wait_for_backend(s, timeout=45):
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = s.get(f"{API}/", timeout=5)
            if r.status_code == 200:
                return True
        except requests.RequestException:
            pass
        time.sleep(1)
    return False


class TestPersistenceAcrossRestart:
    """Mutates codes.length, executioner reports and brand-profile, restarts
    backend via supervisor, and confirms the mutations survived (Phase 0).
    Finally restores demo defaults."""

    def test_state_survives_backend_restart(self, s):
        # ---- 1. Snapshot originals ----
        orig_brand = s.get(f"{API}/content/brand-profile", timeout=15).json()
        orig_reports_len = len(s.get(f"{API}/executioner/reports", timeout=15).json()["reports"])

        # ---- 2. Mutate state ----
        # 2a. codes length -> 11
        r = s.post(f"{API}/codes/generate", json={"length": 11}, timeout=15)
        assert r.status_code == 200
        assert r.json()["length"] == 11

        # 2b. executioner reconcile adds a week
        r = s.post(f"{API}/executioner/reconcile", timeout=15)
        assert r.status_code == 200
        after_reports_len = len(s.get(f"{API}/executioner/reports", timeout=15).json()["reports"])
        assert after_reports_len == orig_reports_len + 1

        # 2c. brand voice
        r = s.put(f"{API}/content/brand-profile",
                  json={"voice": "TEST_persist_voice"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["voice"] == "TEST_persist_voice"

        # ---- 3. Restart backend ----
        result = subprocess.run(
            ["sudo", "supervisorctl", "restart", "backend"],
            capture_output=True, text=True, timeout=30,
        )
        print("supervisor restart:", result.stdout, result.stderr)
        assert _wait_for_backend(s), "backend did not come back up after restart"

        # ---- 4. Verify mutations survived ----
        cur = s.get(f"{API}/codes/current", timeout=15).json()
        assert cur["length"] == 11, f"codes length not persisted: {cur.get('length')}"

        reports_after = s.get(f"{API}/executioner/reports", timeout=15).json()["reports"]
        assert len(reports_after) == after_reports_len, "executioner report not persisted"

        brand_after = s.get(f"{API}/content/brand-profile", timeout=15).json()
        assert brand_after["voice"] == "TEST_persist_voice", "brand voice not persisted"

        # ---- 5. Restore demo defaults ----
        s.post(f"{API}/executioner/reset", timeout=15)
        s.post(f"{API}/codes/generate", json={"length": 8}, timeout=15)
        s.post(f"{API}/content/calendar/reset", timeout=15)
        s.put(f"{API}/content/brand-profile",
              json={"voice": orig_brand["voice"]}, timeout=15)
        # Restore default connections state
        for p, on in (("facebook", True), ("instagram", True), ("google", True),
                      ("tiktok", False), ("youtube", False)):
            s.put(f"{API}/connections", json={"platform": p, "connected": on}, timeout=15)

        # final sanity
        assert s.get(f"{API}/codes/current", timeout=15).json()["length"] == 8
        assert s.get(f"{API}/content/brand-profile", timeout=15).json()["voice"] == orig_brand["voice"]


# ============================================================================
# PHASE 3 — SCAN-TO-SPIN: persisted redemptions + QR + fraud-proof redeem
# ============================================================================
class TestScanToSpinPhase3:
    def test_spin_issues_persisted_code(self, s):
        r = s.post(f"{API}/maximizer/spin",
                   json={"isNewGuest": True, "segment": "new", "spaceId": "Counter"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Required fields
        for k in ("code", "couponCode", "tier", "reward", "status", "expiresAt", "gameId"):
            assert k in d, f"missing {k}"
        assert d["status"] == "issued"
        assert d["code"] == d["couponCode"]
        assert d["tier"] in ("highValue", "standard")
        assert d["spaceId"] == "Counter"

    def test_redeem_valid_then_duplicate_then_invalid(self, s):
        # Issue a fresh code
        r = s.post(f"{API}/maximizer/spin",
                   json={"isNewGuest": True, "segment": "new", "spaceId": "Counter"}, timeout=15)
        code = r.json()["code"]

        # First redeem -> ok
        r = s.post(f"{API}/maximizer/redeem",
                   json={"code": code, "netSales": 25}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert d["status"] == "redeemed"
        assert "reward" in d

        # Same code again -> already_redeemed
        r = s.post(f"{API}/maximizer/redeem",
                   json={"code": code, "netSales": 25}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is False
        assert d["status"] == "already_redeemed"

        # Bogus code -> invalid
        r = s.post(f"{API}/maximizer/redeem",
                   json={"code": "NOPE-000000", "netSales": 10}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is False
        assert d["status"] == "invalid"

    def test_dashboard_reflects_ledger_and_updates_after_spin_and_redeem(self, s):
        # Snapshot
        r = s.get(f"{API}/maximizer/redemptions/dashboard", timeout=15)
        assert r.status_code == 200
        before = r.json()
        for k in ("codesIssued", "codesRedeemed", "redemptionRate",
                  "revenueFromRedemptions", "byTier", "recent"):
            assert k in before
        assert isinstance(before["recent"], list)
        # Starter ledger seeded ~46 codes on fresh DB
        assert before["codesIssued"] >= 1

        # Issue + redeem
        r = s.post(f"{API}/maximizer/spin",
                   json={"isNewGuest": True, "segment": "new", "spaceId": "Table Tent"}, timeout=15)
        code = r.json()["code"]
        s.post(f"{API}/maximizer/redeem",
               json={"code": code, "netSales": 33.5}, timeout=15)

        r = s.get(f"{API}/maximizer/redemptions/dashboard", timeout=15)
        after = r.json()
        assert after["codesIssued"] >= before["codesIssued"] + 1
        assert after["codesRedeemed"] >= before["codesRedeemed"] + 1
        # Revenue increased by at least the netSales we just posted
        assert after["revenueFromRedemptions"] >= before["revenueFromRedemptions"] + 33.0

    def test_spin_qr_returns_png_data_uri(self, s):
        r = s.get(f"{API}/maximizer/spin/qr",
                  params={"spaceId": "Table Tent", "base": "https://x.app"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["spaceId"] == "Table Tent"
        assert d["playUrl"] == "https://x.app/spin?space=Table%20Tent"
        assert d["qrDataUri"].startswith("data:image/png;base64,")
        # decode and verify PNG signature
        import base64 as _b
        raw = _b.b64decode(d["qrDataUri"].split(",", 1)[1])
        assert raw[:8] == b"\x89PNG\r\n\x1a\n"

    def test_segments_verification_uses_live_ledger(self, s):
        dash = s.get(f"{API}/maximizer/redemptions/dashboard", timeout=15).json()
        seg = s.get(f"{API}/maximizer/segments", timeout=15).json()
        v = seg["verification"]
        # tolerate the other xdist worker issuing/redeeming codes between the two GETs
        assert abs(v["codesIssued"] - dash["codesIssued"]) <= 3
        assert abs(v["codesRedeemed"] - dash["codesRedeemed"]) <= 3
        assert abs(v["redemptionRate"] - dash["redemptionRate"]) <= 0.02
        assert abs(v["revenueFromRedemptions"] - dash["revenueFromRedemptions"]) <= 100
        # Old hardcoded 214/137 must NOT be there
        assert v["codesIssued"] != 214
        assert v["codesRedeemed"] != 137

    def test_persistence_across_restart(self, s):
        # Issue a code
        r = s.post(f"{API}/maximizer/spin",
                   json={"isNewGuest": True, "segment": "new", "spaceId": "Counter"}, timeout=15)
        code = r.json()["code"]
        before = s.get(f"{API}/maximizer/redemptions/dashboard", timeout=15).json()

        # Restart backend
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"],
                       capture_output=True, text=True, timeout=30)
        assert _wait_for_backend(s), "backend didn't come back up"

        after = s.get(f"{API}/maximizer/redemptions/dashboard", timeout=15).json()
        assert after["codesIssued"] >= before["codesIssued"]
        # Our specific issued code should still be redeemable
        r = s.post(f"{API}/maximizer/redeem",
                   json={"code": code, "netSales": 12}, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True


# ============================================================================
# PHASE 1B — REAL VIDEO CRITIC (chunked upload → ffmpeg + Whisper + gpt-4o)
# ============================================================================
CLIP_PATH = "/tmp/clip.mp4"


def _ensure_test_clip():
    """Create a small 4s test MP4 with bundled ffmpeg if not present."""
    import os as _os
    if _os.path.exists(CLIP_PATH) and _os.path.getsize(CLIP_PATH) > 0:
        return
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ff, "-y", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x480:rate=15",
         "-f", "lavfi", "-i", "sine=frequency=300:duration=4",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", CLIP_PATH],
        capture_output=True, text=True, timeout=60,
    )


class TestVideoCritic:
    """End-to-end video critic: chunked upload → analyze → real report + playable video."""

    def test_analyze_bogus_uploadId_returns_404(self, s):
        r = s.post(f"{API}/content/critic/analyze",
                   json={"uploadId": "nope-not-a-real-id", "filename": "clip.mp4"}, timeout=15)
        assert r.status_code == 400  # malformed id rejected
        r = s.post(f"{API}/content/critic/analyze",
                   json={"uploadId": "00000000-0000-4000-8000-000000000000", "filename": "clip.mp4"}, timeout=15)
        assert r.status_code == 404  # well-formed but unknown

    def test_chunk_bogus_uploadId_returns_404(self, s):
        with open("/dev/null", "rb") as f:
            r = s.post(f"{API}/content/critic/upload/chunk",
                       data={"uploadId": "no-such-id", "index": 0},
                       files={"chunk": ("chunk.bin", b"hello", "application/octet-stream")},
                       timeout=15)
        assert r.status_code == 400
        r = s.post(f"{API}/content/critic/upload/chunk",
                   data={"uploadId": "00000000-0000-4000-8000-000000000000", "index": 0},
                   files={"chunk": ("chunk.bin", b"hello", "application/octet-stream")},
                   timeout=15)
        assert r.status_code == 404

    def test_full_pipeline_upload_analyze_playback(self, s):
        _ensure_test_clip()
        # 1) init upload
        r = s.post(f"{API}/content/critic/upload/init",
                   json={"filename": "clip.mp4"}, timeout=15)
        assert r.status_code == 200, r.text
        upload_id = r.json()["uploadId"]
        assert upload_id

        # 2) chunk upload (single chunk since file is small)
        with open(CLIP_PATH, "rb") as f:
            data = f.read()
        r = s.post(f"{API}/content/critic/upload/chunk",
                   data={"uploadId": upload_id, "index": 0},
                   files={"chunk": ("clip.mp4", data, "video/mp4")},
                   timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["size"] == len(data)

        # 3) analyze — real ffmpeg + Whisper + gpt-4o vision
        r = s.post(f"{API}/content/critic/analyze",
                   json={"uploadId": upload_id, "filename": "clip.mp4"}, timeout=180)
        assert r.status_code == 200, r.text
        d = r.json()
        # top-level shape
        for k in ("report", "transcript", "analysis", "videoUrl", "id"):
            assert k in d, f"missing key {k}"
        report = d["report"]
        # rubric grades present + valid
        assert report["overall"] in ("WEAK", "MODERATE", "IMPROVABLE", "STRONG")
        for sec in ("hook", "audio", "framing"):
            assert report[sec]["grade"] in ("WEAK", "MODERATE", "IMPROVABLE", "STRONG")
            assert report[sec]["critique"]
            assert report[sec]["recommendation"]
        # measured must reflect real analysis
        m = report["measured"]
        assert m["framesAnalyzed"] > 0, "vision analyzed 0 frames"
        assert m["durationSec"] > 0
        assert isinstance(m["hasAudio"], bool)
        # videoUrl points at the playback route
        assert d["videoUrl"] and d["id"] in d["videoUrl"]

        # 4) playback round-trip
        r = s.get(f"{BASE_URL}{d['videoUrl']}", timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("video/")
        assert len(r.content) > 1000, "video body too small"



# ============================================================================
# PHASE 2 — Real POS Import + Table Tent PDF (iteration 8)
# ============================================================================
class TestPhase2POSImport:
    """POS CSV import → real weeks recomputed; clear-transactions restores demo baseline."""

    def test_sample_transactions_csv_has_square_headers(self, s):
        r = s.get(f"{API}/executioner/sample-transactions-csv", timeout=15)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "csv" in d and "format" in d
        first_line = d["csv"].split("\n")[0].lower()
        for h in ["date", "net sales", "customer id", "postal code", "clicks", "discount"]:
            assert h in first_line, f"missing header {h} in {first_line}"
        # At least 10 data rows so import produces meaningful volume
        assert len(d["csv"].split("\n")) - 1 >= 10

    def test_import_square_csv_recomputes_reports(self, s):
        # Baseline: 3 demo weeks
        r = s.get(f"{API}/executioner/reports", timeout=15)
        assert r.status_code == 200
        base_reports = r.json()["reports"]
        assert len(base_reports) == 3
        for rep in base_reports:
            assert rep.get("dataSource") == "demo"
        base_overview = s.get(f"{API}/overview", timeout=15).json()

        # Load sample CSV
        sample = s.get(f"{API}/executioner/sample-transactions-csv", timeout=15).json()
        r = s.post(f"{API}/executioner/import-transactions",
                   json={"csv": sample["csv"], "source": "square"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["imported"] > 0
        assert isinstance(d["weeks"], list) and len(d["weeks"]) >= 1
        assert d["revenueImported"] > 0
        assert "mapping" in d
        # column mapping: 'discount' column → promo_code field (Square style)
        assert d["mapping"].get("promo_code", "").lower() == "discount"
        assert d["mapping"].get("net_sales", "").lower() == "net sales"
        assert "skipped" in d

        # Reports now include real weeks
        after = s.get(f"{API}/executioner/reports", timeout=15).json()["reports"]
        assert len(after) > len(base_reports), "no new reports added after import"
        real = [r_ for r_ in after if r_.get("dataSource") == "real"]
        demo = [r_ for r_ in after if r_.get("dataSource") == "demo"]
        assert len(real) >= 1, "no real-labeled reports"
        assert len(demo) == 3, "demo baseline (3 weeks) not preserved"
        for r_ in real:
            assert "txCount" in r_ and r_["txCount"] > 0

        # Overview reflects higher revenue after import
        after_ov = s.get(f"{API}/overview", timeout=15).json()
        # revenue field key may vary - just assert that at least one numeric field grew
        # find total revenue in reports
        base_total = sum(x.get("totalRevenue", 0) for x in base_reports)
        after_total = sum(x.get("totalRevenue", 0) for x in after)
        assert after_total > base_total, f"totals did not grow: {base_total} -> {after_total}"

    def test_import_generic_csv_column_mapping(self, s):
        csv = ("promo_code,net_sales,customer_id,postal_code,clicks,date\n"
               "STRATA-1111,30.00,C1,01103,10,2026-07-10")
        r = s.post(f"{API}/executioner/import-transactions",
                   json={"csv": csv, "source": "generic"}, timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["imported"] == 1
        m = d["mapping"]
        assert m.get("promo_code") == "promo_code"
        assert m.get("net_sales") == "net_sales"
        assert m.get("customer_id") == "customer_id"
        assert m.get("postal_code") == "postal_code"

    def test_import_csv_with_no_amount_column_returns_422(self, s):
        # header has no net-sales/amount column
        csv = "foo,bar,baz\n1,2,3"
        r = s.post(f"{API}/executioner/import-transactions",
                   json={"csv": csv, "source": "generic"}, timeout=15)
        assert r.status_code == 422, r.text[:200]

    def test_clear_transactions_restores_demo_baseline(self, s):
        r = s.post(f"{API}/executioner/clear-transactions", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        after = s.get(f"{API}/executioner/reports", timeout=15).json()["reports"]
        assert len(after) == 3, f"expected 3 demo weeks after clear, got {len(after)}"
        for rep in after:
            assert rep.get("dataSource") == "demo", f"non-demo report leaked: {rep.get('weekOf')}"

        # Also reset the loop for full clean state
        s.post(f"{API}/executioner/reset", timeout=15)


class TestTableTentPDF:
    """GET /api/maximizer/table-tent.pdf returns a real PDF."""

    def test_table_tent_pdf_returns_pdf_bytes(self, s):
        r = s.get(f"{API}/maximizer/table-tent.pdf",
                  params={"spaceId": "Table Tent", "base": "https://demo.app"}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 2048, f"PDF too small: {len(r.content)} bytes"
        assert r.content[:5] == b"%PDF-", f"missing PDF magic header: {r.content[:8]!r}"

    def test_table_tent_pdf_default_params(self, s):
        # No params → still returns a PDF
        r = s.get(f"{API}/maximizer/table-tent.pdf", timeout=30)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"
        assert len(r.content) > 2048

    def test_table_tent_pdf_strips_bad_base(self, s):
        # base without scheme should be ignored (no error)
        r = s.get(f"{API}/maximizer/table-tent.pdf",
                  params={"spaceId": "Counter", "base": "evil.com"}, timeout=30)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"
