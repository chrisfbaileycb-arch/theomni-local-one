# OmniLocal #1 — Unified Restaurant Revenue Engine

## Original Problem Statement
A single unified, demoable, competition-ready web app that shows a complete closed-loop
marketing system for local restaurants, with external systems mocked. Rebranded strictly to
**OmniLocal #1**. Tagline: *"This is your one and only revenue engine that you will ever need."*

## Strict Naming (do NOT reintroduce legacy names)
- Product: **OmniLocal #1**
- Modules: **Content Director**, **Quality Content Executioner** (Ad Engine),
  **Quality Customer Maximizer** (Rewards / Gamification).
- Legacy names permanently purged: AdSmith, ExpoProxy, EchoLink. Legacy test artifact
  `backend_test.py` deleted.

## The three integrated modules (Python/FastAPI, deterministic)
1. **Content Director** — asset vault, daily shooting prompts, speech→copy (GBP/FB/IG drafts),
   Brutal Honesty Video Critic, and **distribution pathways** (GBP, Facebook Reels, Instagram
   Reels, TikTok, YouTube Shorts).
2. **Quality Content Executioner** — closed-loop weekly budget engine (Strategy A vs B), promo-code
   attribution, ROAS/CAC learning loop, ZIP breakdown, connection-gated recommended plan.
3. **Quality Customer Maximizer** — 4 rotating games (30-day cycle, admin-toggleable), segment-aware
   Scan-to-Spin, RFMD VIP segmenting, weekly customer CSV import (new / coupon_only / loyal),
   welcome-video automation, 30-day slow-trickle drip.

## Social Media Connector (OAuth handshake)
- Unified API provider handshake, **stubbed until `UNIFIED_API_KEY` set**.
- Routes: `GET /api/connections/pathways`, `GET /api/connections/oauth/{platform}/start`,
  `POST /api/connections/oauth/callback`, `GET/PUT /api/connections`.
- UI exposes a clear **Connect** flow during onboarding (Connections, embedded under the Ad Engine).

## Email Engine (Anti-Spam Trickle) — Resend, STUBBED
- Sending stubbed until `RESEND_API_KEY` provided.
- Mandatory: 15-second throttle between sends, `Reply-To` + `List-Unsubscribe` headers,
  content sanitization (spam-phrase/all-caps/tracking-pixel checks).
- Welcome automation: new customers → automated email with static owner welcome video URL.

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), deterministic engines, seeded in-memory data. Prefix `/api`.
- Frontend: React (CRA/craco), `@` alias → src. Sections in `src/sections/*`, api in `src/lib/api.js`.
  Nav: Command Center, Quality Content Executioner, Quality Customer Maximizer, Content Director.

## MOCKED (not real integrations)
Google auth, transcription, real ad-platform posting/feeds, POS/platform data, ordering redirects,
Resend sending, Unified social OAuth. All realistic seeded data for a clickable demo.

## Production migration (2026-06) — from demo to product
- **Phase 0 · Persistence (DONE):** all state moved from in-memory globals to **MongoDB** (motor).
  A `state` collection holds singleton blobs (reports, connections, oauth_tokens, welcome_queue,
  current_batch, game_override, customers, calendar, brand_profile); startup seeds only if empty.
  Data now survives restarts (verified). `ai_generations` collection logs every AI call.
- **Phase 1A · Real AI Copywriter (DONE):** `/api/content/copy` is a live **Claude Sonnet 4.6**
  call via emergentintegrations + Emergent LLM key, grounded in a stored **Brand Brain** profile
  (`/api/content/brand-profile` GET/PUT), 45s timeout, no template fallback. New Brand Brain
  editor UI in the Content Director.
- **Phase 1B · Real Video Critic (DONE):** owners upload a clip (chunked, 1MB) → pip-bundled
  **ffmpeg** (imageio-ffmpeg) extracts audio + frames + real audio levels (astats) → **Whisper**
  (whisper-1) transcribes → **gpt-4o vision** grades framing/lighting/clutter → fed into the
  existing hook/audio/framing rubric. Video stored in **Emergent object storage**, played back
  via `/api/content/critic/video/{id}`. Critiques logged to `video_critiques`. Endpoints:
  `/api/content/critic/upload/init|chunk`, `/analyze`, `/video/{id}`.

## Roadmap (user-approved order: 0 → 1 → 3 → 2 → 4 → 5)
- **Phase 1B (DONE):** Real Video Critic — upload + Whisper + gpt-4o vision + ffmpeg + object storage.
- **Phase 3 (DONE):** Scan-to-Spin productionized — persisted `redemptions`, real segno QR + public
  `/spin` play page, fraud-proof `/api/maximizer/redeem` (rejects invalid/duplicate/expired), live
  redemption dashboard (`/api/maximizer/redemptions/dashboard`), verification pulled from the ledger.
- **Phase 2 (next):** Real POS/CSV transaction ingest → executioner learns on real data (replace `_seed_week_txs`).
- **Phase 4:** Live Google Business Profile publishing (needs user Google OAuth creds).
- **Phase 5:** Live Resend email sending (needs user Resend key + verified domain).
- **Phase 6 (optional):** Owner auth + multi-restaurant.

## Implemented (2026-06)
- Full rebrand to OmniLocal #1; legacy strings + `backend_test.py` purged.
- 4 rotating games, weekly CSV segmentation, welcome-video automation, anti-spam trickle engine.
- Social Media Connector OAuth handshake (start/callback, stubbed) + Connect flow UI.
- Distribution pathways defined in Content Director backend + surfaced in UI.
- Unified **Publish-All** (`POST /api/content/publish-all`) — one-cycle blast across all
  authorized pathways with per-platform status feedback; skips unconnected surfaces.
- **Local Market Intelligence** (`GET /api/content/local-events`) — seeded nearby events →
  recommended ad channel + budget-shift + content idea, with "Add to Content Calendar".
- **Content Calendar** (`/api/content/calendar` + add-week/post/remove/reset) — weekly grid
  auto-filled from prompts + events, "Plan Next Week" to schedule weeks ahead, quick add-post.
- **Visual polish** — fixed CSS token alias bug (accent colors now render), premium card
  shadows/lift, kept light bone/orange/green editorial theme (no dark theme).

## Backlog / Next Action Items
- P0: **Phase 4** — Live Google Business Profile publishing. WAITING ON USER: GOOGLE_CLIENT_ID +
  GOOGLE_CLIENT_SECRET (user expects them ~Tuesday, tied to new business identity).
- P1: **Phase 5** — Activate real Resend sending once `RESEND_API_KEY` provided.
- P1: Activate live Unified social OAuth once `UNIFIED_API_KEY` provided.
- P2: Real OAuth into Meta/Google/TikTok/YouTube for automated spend.
- P2: Publish-All scheduling/drip option.
- P2: Refactor `server.py` into modular routers as integrations grow.
- P2: Multi-restaurant scoping (restaurant_id on collections).

## 2026-07-18 — The Coach: Build Templates + Accountability (DONE, 85/85 backend + frontend e2e)
- **AI is coach, not editor** (explicit user directive): recommends HOW and WHERE to make videos,
  never makes/reviews everything. Birthday-sender idea DROPPED (no birthday tracking).
  No in-app onboarding wizard — user will supply a YouTube instruction video.
- `POST /api/coach/template` (Claude + Brand Brain): key elements, fill-in-the-blank offer,
  raw-phone shot list, where-it-goes, success checks. Stored in `coach_templates`.
- `GET /api/coach/template/{id}/pdf` — downloadable/printable one-pager (fpdf2; NOTE: multi_cell
  needs new_x="LMARGIN", new_y="NEXT" or it throws "not enough horizontal space").
- Accountability: critic analyze accepts optional templateId → `planCheck`
  {verdict ON-PLAN/CLOSE/OFF-PLAN, matched, fix (2-3 short edit/re-film actions)}.
- UI: AskTheCoach card in Content Director; "How does this work?" buttons on Executioner
  strategy recommendations; plan-check select + result block on the Video Critic.

## 2026-07-18 — Onboarding Video Vault (DONE, 85/85 backend + frontend e2e)
- Guided film-once shot list (10 prompts): walkthrough, menu items, kitchen, dining room,
  exterior, owner story, birthday, holiday, rewards thank-you, current dish. Raw-over-polished
  guidance baked into the UI copy.
- Chunked phone-video upload (reuses critic upload endpoints) → object storage → `vault` collection.
- Custom campaign videos with title (e.g. Mother's Day Special) + **Feature star**: featured video
  leads the 30-day drip (every 3rd day); other vault videos spread evenly between.
- Welcome email + welcome-queue auto-use the vault rewards-thank-you video
  (fallback order: rewards_thanks → featured → owner_intro → stock stub).
- `/api/vault/video/{id}` is PUBLIC (email recipients can stream); all other vault APIs auth-gated.
- UI: VideoVault component at bottom of Content Director; Maximizer drip card shows vault fuel note.

## 2026-07-18 — Game Planner, Rules & Member Export (DONE, 85/85 backend + frontend e2e)
- **4-Week Game Planner**: owner schedules a different game per week (weekly schedule > pinned
  game > 30-day auto rotation). Endpoints: GET /api/maximizer/game-plan, PUT /game-plan/week.
- **Game rules settings**: play limit once per 7 or 14 days (default weekly) + coupon codes expire
  after 7 or 14 days (default 7 — "use it this week or lose it"). PUT /api/maximizer/game-settings.
  Spin 429 message shows next eligible date; /spin consent copy reflects the frequency.
- **Member CSV export**: GET /api/maximizer/members/export.csv (auth-gated) + Export button.
- **Header-aware POS import**: maps columns by name (name/customer, email/contact email,
  phone/number/mobile, visits/orders, coupon_ratio/discount rate), ignores extras (reward points),
  supports phone-only customers; sample CSV now includes phone + reward_points columns.

## 2026-07-18 — Identified Mystery Spins (DONE, 85/85 backend tests + frontend e2e)
- Public `/spin` is now a **rewards-club gate**: customer must agree to join + give email OR phone
  before spinning. Wheel is a **mystery** (no prizes shown upfront; everybody wins something).
- `members` collection = permanent directory. Weekly POS CSV imports upsert by email
  (visits + coupon_ratio + segment update each week). Wheel signups auto-join as "new"
  + enter the welcome queue (email or sms channel).
- **Tiered deals fire on identity**: coupon_only → promo_pool (low deal); loyal/full-price → vip
  (high deal); unknown → new-guest deal. 1 spin per identity per 24h (429 returns active code).
- Redemptions store memberKey/email/phone → redeem bumps member visits (closed loop).
- Owner Maximizer: new "Reward Members — Live Directory" panel (totals, couponers vs full-price,
  wheel signups, recent members table). Segments verification uses real member counts when present.
- Authenticated owner demo spins keep legacy isNewGuest/segment behavior.
- tests/conftest.py mounts 502-retries (persistence tests restart backend mid-suite under xdist).

## 2026-07-18 — Fork corruption incident + Auth phase (DONE)
- Forked pod arrived with massive null-byte file corruption (venv, node_modules, mongo data,
  supervisor confs, many frontend files). Full recovery performed: see /app/memory/learnings.md.
  MongoDB data was unrecoverable → wiped + re-seeded (prior user-entered data lost).
- **Security audit:** no secrets in code (all env-driven), .env git-ignored, nothing leaked to
  frontend bundle. Previously ALL APIs were un-gated → fixed by auth below.
- **Phase 6 (pulled forward) — Multi-user auth + approval governance (DONE, 82/82 tests):**
  - Emergent Google Auth (backend/auth.py). First login = owner; later logins = members.
  - Owner-controlled rotating **TR access code** (TR-XXXX-XXXX): members must enter it to occupy
    one of **3 seats**; rotating instantly locks all members out (trial-ending use case);
    revoke kills sessions immediately; restore → member re-enters current code.
  - **Approval workflow:** member publish-all / welcome-email calls create `approvals` docs;
    owner approves (executes live) or rejects from the Team & Approvals page; owner actions
    execute directly. Pending badge in nav.
  - Middleware gates every /api path; public: POST /maximizer/spin, GET /maximizer/games,
    /api/ root, /auth/session; frontend /spin stays public for customers.
  - New UI: Login page, ActivateGate (code entry / revoked screen), Team & Approvals page,
    sidebar user card + logout. Test identities in /app/memory/test_credentials.md.

## 2026-07-18/19 — Coach To Calendar + Template Library (DONE, iter_14 100%)
- POST /api/coach/template/{id}/to-calendar: whereItGoes lines (capped at 8) become planned
  posts every 2 days starting tomorrow, 11:30 AM, surface keyword-mapped; uuid4-hex post ids.
- GET /api/coach/templates (25 newest), DELETE /api/coach/template/{id}. UI: Template Shelf
  under Ask-the-Coach (Open / PDF / Delete per row), "Add plan to calendar" button on the
  template panel; calendar auto-refreshes via 'omni-calendar-update' CustomEvent.
- Verified end-to-end: iteration_14 (9/9 backend, all frontend scenarios, 0 console errors).

## 2026-07-19 — ECC-guided security audit (DONE, iter_15 100%: 94/94 pytest + 17/17 security)
- User's ECC repo (github.com/chrisfbaileycb-arch/ECC) pulled to /tmp/ecc_repo; its
  security-review + fastapi-patterns skills used as audit checklist (knowledge layer only —
  ECC runtime targets other harnesses, nothing installed into the app).
- Fixed: (1) uploadId path traversal — _upload_part() UUID-regex gate on critic chunk/analyze
  + vault/save (400 malformed, 404 unknown); (2) app-level CORS lockdown — wildcard removed,
  env allowlist + emergent-domain regex (NOTE: platform ingress still injects ACAO:* externally;
  app-level is defense-in-depth); (3) raw exception text no longer leaked in 4 endpoints
  (generic 502s, logger.exception kept); (4) coach post-id collision + calendar sprawl cap.
- Passed audit: no hardcoded secrets, .env git-ignored, httpOnly/secure cookies, owner-only
  route guards, no dangerouslySetInnerHTML, upload size/type whitelist, spin 24h rate limit.
- Test files: tests/test_coach_library_and_calendar.py, tests/test_security_iter15.py.

## 2026-07-19 — Location Analytics + Weekly Win Report (DONE, iter_16 100%; 121/121 pytest)
- **Location Analytics**: public POST /api/maximizer/scan (in OPEN_PATHS) logs `scan_events`
  {spaceId ≤48ch, at}; /spin page fires it once per load (module-level guard). New members store
  signupSpace. GET /api/maximizer/locations → per-spot rows {scans, plays, signups, redeemed,
  revenue, scanToPlay}, admin-demo excluded, sorted plays desc. UI: LocationSpots.js panel in
  Maximizer (trophy on top spot, totals line) + 7 spot-preset chips on the QR generator
  (Pizza Box, Bag Sticker, Door Decal, Table Tent, Counter QR, Receipt, Window Decal).
- **Weekly Win Report**: strict last completed Mon–Sun week (hard stop Sunday — user directive:
  campaigns start any day, week closes Sunday). GET /api/maximizer/weekly-report → current/
  previous/deltas/soFar + topSpot + topGame (scans, spins, newMembers, redeemed, revenue;
  admin-demo excluded from spins). GET .../weekly-report.pdf → fpdf2 one-pager. UI:
  WeeklyWinReport.js card on Command Center under metric tiles with wk/wk delta arrows +
  Download one-pager button + this-week-so-far strip.
- Tests: tests/test_locations_weekly.py (10). NOTE: screenshot_tool auto-navigates to page_url
  BEFORE the script runs — a script goto = 2 page loads (caused a false 2×-scan alarm).

## 2026-07-19 — Spot QR Sheet + Report Auto-Email (DONE, iter_17 100%; 18/18 new tests)
- **Spot QR Sheet**: GET /api/maximizer/qr-sheet.pdf?base= — one A4 print-anywhere page: brand
  header, 7 labeled spot QRs (dashed cut guides), 8th slot = "How your QR codes work" block
  (user directive: no sticker assumption; explain codes are unique per restaurant/landing page).
  UI: qr-sheet-btn under the spot chips in the Maximizer QR generator.
- **Weekly Win Report auto-email**: Mondays 8am LOCAL (configurable tz, default America/New_York,
  zoneinfo-validated), recipient defaults to owner login email (editable). asyncio scheduler
  (15-min tick, dedup via lastSentWeekOf in state `win_report_email`). Endpoints: GET/PUT
  /api/maximizer/report-email, POST .../send-now. HTML email via existing send_via_resend —
  STUB MODE until RESEND_API_KEY set, then live automatically. UI: ReportEmailSettings.js strip
  on the Win Report card (STUB/LIVE badge, toggle, recipient, tz select, Send now, status line).
- Tests: tests/test_qr_sheet_report_email.py (8). Gotcha fixed: env const is UNSUBSCRIBE_BASE
  (not UNSUBSCRIBE_BASE_URL).

## 2026-07-19 — Owner-Defined Prize Board + POS Codes (DONE, iter_18 100%; 137/137 suite)
- **User's game-economics directive (verified & implemented):**
  - Prizes are owner-defined placeholder slots (2–6 "good" prizes), each with an optional
    **POS discount code** (e.g. "30% Off" = 261745) so staff knows what to punch in.
  - Wheel spins uniformly across the good prizes for everyone EXCEPT identified repeat
    couponers (coupon_only → promo_pool), who always get the single owner-defined **dud**.
  - Slot 1 = headline prize → tier highValue / HV- code / private "You won big!" reveal
    (kept intentionally: household prize-comparison is the viral engine — families all scan).
  - No public winner announcements anywhere (mystery wheel, private reveal, owner-only ledger) ✓.
  - 4-week Game Planner (different game each week) re-verified working ✓.
- Backend: DEFAULT_PRIZE_BOARD + rewritten spin(board); GET/PUT /api/maximizer/prize-board
  (validation: 2–6 good, dud required); posCode stored on redemption doc, POPPED from public
  spin response, returned by /maximizer/redeem for staff. Seeded in startup.
- UI: PrizeBoard.js editor in Maximizer (HEADLINE badge, add/remove slots, amber dud row);
  redeem station shows "Punch into POS: <code>"; QR card copy + QR-sheet PDF tips reoriented
  to at-home placements (mailers, social, boxes, bags — households scan together).
- Tests: tests/test_prize_board.py (8; consolidated to ONE class — pytest.ini `-n 2 --dist
  loadscope` puts separate classes on different workers → shared-state races). Also made
  backend_test.py live-ledger assertion tolerant (pre-existing off-by-1 xdist race fixed).

## 2026-07-19 — Weekly Win Report v2: whole-business report (DONE, iter_19 100%)
- User directive: manager cares about REDEMPTIONS not wins; report must show the whole
  OmniLocal picture (all platforms), not just the game; numbers only, no noise; game weeks
  are optional (content-only weeks exist) so the report can't be game-centric.
- Report (card + PDF + Monday email, same layout): ① POS reconciliation line (soft gate —
  green 'imported during report week' / red 'NOT imported, not reconciled'; imports now logged
  via log_activity('pos_import') in import-csv); ② Deals Redeemed + Revenue Proven lead,
  scans/spins/members secondary; ③ Prize Payouts breakdown (per reward: redeemed + revenue,
  reconcile vs POS); ④ Channel Activity — 8 channels (wheel live, google/facebook/instagram/
  tiktok/youtube stubbed with real 'posts published' counts + 'engagement unlocks when live'
  note, calendar posts planned, welcome emails sent). STRICT no-fake-engagement: platform
  clicks appear only when Phase 4/5 keys go live.
- New: activity_log collection (log_activity helper) — pos_import, post_published (in
  _do_publish_all), welcome_email (in _do_send_welcome).
- Tests: tests/test_report_v2.py (5) + testing-agent's test_report_v2_extras.py (8). Suite ~150.

## 2026-07-19 — Ad Spend Log + Friday Import Nudge (DONE, iter_20 100%)
- **Ad Spend Log**: db.ad_spend {id, platform, label, amount, date}; POST/GET/DELETE
  /api/maximizer/ad-spend (validation: label required, 0<amount<=100k, YYYY-MM-DD date).
  Report gains adSpend {total, prevTotal, delta, entries}; channel rows show "$X boosted";
  card = 3rd big stat "Ad Spend" + AdSpendLog.js strip (platform/label/amount, $50/wk minimum
  hint — user's paid-reach philosophy); PDF + email get spend-vs-revenue line.
- **Import Reminder**: GET /api/maximizer/import-status {importedThisWeek, importsThisWeek,
  lastImportAt, weekOf, nudge (Fri+ local & no import)}; red banner on Command Center
  (import-nudge-banner) with "Import it now" → navigates to Maximizer; scheduler also emails a
  Friday 10am (owner tz) nudge, deduped via state `import_nudge` (STUB until Resend key).
- NOTE: pos_import activity rows created by pytest (test_report_v2) must be deleted after test
  runs to preserve real nudge state (testing agents instructed; main agent cleans up).
- Tests: tests/test_ad_spend_nudge.py (5).

## 2026-07-25 — Full App Audit + 5 Fixes (DONE, iter_21 100%; 155/155 suite)
- FIXED: ① 12 secondary Mongo indexes via _ensure_indexes() at startup (sessions.token hit on
  every request; redemptions code/issuedAt/redeemedAt/memberKey; members; scan_events;
  activity_log; coach_templates; ad_spend) — biggest scalability win, collections were
  index-free; ② React ErrorBoundary (components/ErrorBoundary.js wired in index.js) —
  graceful crash screen replaces white-screen; ③ OG/Twitter meta tags in index.html;
  ④ privacy note under Join & Spin on /spin (spin-privacy-note); ⑤ aria-labels on /spin inputs.
- PASSED AUDIT (no action needed): mobile /spin flawless at 390px; auth (httpOnly/secure
  cookies, session TTL, owner-only guards); no secret leaks; upload validation; consent
  checkbox on data collection; unsubscribe links; branding/copy consistency; 155 tests.
- REPORT-ONLY (backlog): server.py ~3200 lines → modularize (P2); yarn audit 48 high all in
  CRA dev tooling (build-time only, not runtime — no action); add a proper privacy-policy
  page before public launch (P1); ErrorBoundary → backend telemetry later; scheduler paths
  untested by automation (stub-mode).

## 2026-07-25 — Master Password (owner sign-in without Google) (DONE, iter_22 100%)
- Per auth integration playbook: bcrypt hash on the owner user; login POST /api/auth/login
  (OPEN_PATHS) issues the SAME opaque session cookie as Google flow; generic 401 (no user
  enumeration); brute force 5 fails/ip+email → 15 min 429 lockout (login_attempts collection,
  TTL-indexed 30 min self-clean); POST /api/auth/change-password (owner, verify current, min 8).
- Seeding: backend/.env MASTER_PASSWORD (plaintext env + runtime hash — avoids bcrypt-$-in-env
  gotcha); envSha marker in state 'master_seed' → in-app password changes SURVIVE restarts,
  env edit re-applies. Restart-survival verified.
- CREDS: owner.test@example.com / OL1-84A7-EDE3-E64C (also in test_credentials.md).
- UI: Login.js rewritten (password form + 422-array-safe error formatting + Google button);
  MasterPassword.js change card in Team & Approvals.
- Tests: tests/test_master_password.py (8, single class — xdist loadscope).

## 2026-07-25 — Content Director Governance & Campaign Disclaimers (DONE, iter_23 100%)
- Per user's formal spec (multi-industry: Restaurant, Salon/Spa, Tattoo, Auto Repair, Contractor):
- **Strategy & Best Practices panel** (StrategyPanel.js on Content Director): industry vertical
  select (persists in state `strategy`), dynamic Campaign Pacing Advisor per vertical
  (INDUSTRY_PACING: advisor/cadence/window/rotation), 2 instructional video plaques
  ('How to Run High-Converting Flash Campaigns', 'Rules of Engagement for Gamification') —
  YouTube-only URL slots that render embeds (youtu.be/watch/embed/shorts parsed).
- **Operational Protection Disclaimer** (exact spec WARNING/STRATEGIC NOTICE text, amber) on all
  3 campaign config screens: Content Director (above calendar), Maximizer, Executioner.
- **Limited-Run Burst Model injected into BOTH AI system prompts** (copywriter ai_generate_drafts
  + coach ai_build_template via _governance_text()): never continuous promos, 2-3 day bursts,
  weekly channel rotation, industry-tailored. VERIFIED with a real Claude call — 'all day every
  day' request produced burst-limited copy.
- Endpoints: GET/PUT /api/content/strategy (industry validation, YouTube URL validation).
- Tests: tests/test_strategy_governance.py (5).

## 2026-07-25 — Dynamic Industry Manager + PWA + Video Scripts (DONE, iter_24 100%)
- **Industry Manager (frontend)**: 'Manage' toggle on the Strategy panel opens an owner UI to
  add/edit/delete verticals (label/advisor/cadence/window/rotation). Backend CRUD
  (POST/PUT/DELETE /api/content/industries, owner-gated, slug dedupe, delete guards: keep ≥1,
  can't delete selected) was already in; tests/test_industries.py (5) added. real_estate now a
  default (6 verticals); test_strategy_governance VERTICALS updated to superset check.
- **PWA**: public/manifest.json (standalone, theme #D35400, 192/512 + maskable icons),
  public/sw.js (network-first, same-origin GETs only, /api never cached, offline nav fallback),
  index.html manifest + apple-touch/mobile-web-app meta, SW registration in index.js.
  App is now installable on phones (Add to Home Screen).
- **Video scripts**: two 60-second recording scripts delivered ("How to Run High-Converting
  Flash Campaigns", "Rules of Engagement for Gamification") → /app/memory/video_scripts.md.
  Owner records → YouTube → paste links into Strategy panel video slots.
- GOTCHA fixed: parallel search_replace edits on StrategyPanel.js collided (stray lines +
  dropped import) → syntax error + Settings2 ReferenceError; repaired, verified.

## 2026-08-01 — Games Fully Optional + Multi-Industry Generalization (DONE, iter_25 + 177/177)
- **User directive:** app must work standalone WITHOUT the wheel (protect the "bump"), games
  toggle on/off; user will market OmniLocal with OmniLocal (dogfooding as a SaaS).
- **Pause toggle**: game_settings.enabled (default true); PUT /api/maximizer/game-settings
  {enabled}; resolve_active_game() → None when off. Public spin blocked with 423; /spin shows
  'taking a quick break' screen (spin-paused); PDFs (qr-sheet, table-tent) render paused-safe.
- **Rest weeks**: game-plan week gameId "none" → no game that week (weekly 'none' beats
  rotation). UI: 'No game — rest week' option in all 4 week selects; 'Games running' checkbox
  (games-enabled-toggle) + red PAUSED note; active-game-title shows 'Paused'.
- **SaaS vertical**: 'Software / SaaS' added to INDUSTRY_PACING + seeded in DB (7 verticals).
- **De-restauranted**: AI prompts now industry-aware (copywriter + coach use
  _current_industry() label; plan-check/vision generic); vault prompts, QR/PDF copy,
  sidebar 'Active Business', spin privacy note, placeholders all generalized. Table tent
  headline now pulls prize board slot 1 (was hardcoded FREE SUB).
- **New games**: 4 built-in mechanics only (wheel/scratch/vault/slots); new mechanics = dev
  work (backlog); prizes fully re-themeable via Prize Board.
- Tests: tests/test_game_toggle.py (4); conftest retries now include 423 (rides out pause
  windows under xdist); raw no-retry session used to assert 423. Suite: 177/177.
- GOTCHAS: (1) parallel same-file edits silently REVERTED 3 'successful' edits + duplicated
  the file tail (IndentationError) — always audit server.py after big parallel batches;
  (2) iter_25 found bare games.active.name at Maximizer.js:227/315 → crash-to-ErrorBoundary
  when paused; guarded, self-verified per repro.
