# OmniLocal #1 — Local Revenue Engine

A single-owner marketing and loyalty engine for a local business: QR-driven
scan-to-play games, member management, voucher redemption, POS reconciliation,
a content director with an AI video critic, ad-spend staging with human
approval, and an operator copilot. One Express server (`server.js`) serves the
API and the React frontend in `frontend/`. State persists to SQLite (with a
JSON-file fallback) in the data directory.

## Quick start

```bash
npm install        # installs backend deps, then builds the frontend (postinstall)
npm start          # serves the app on http://localhost:3000
```

On **first boot** (fresh data directory) the server generates a strong random
owner master password, prints it once to the server log, and stores only its
bcrypt hash. Sign in with it, then change it in **Team & Approvals**.
For unattended deploys, set `MASTER_PASSWORD` in the environment instead —
there is no default password.

## Environment variables

| Variable | Purpose |
|---|---|
| `MASTER_PASSWORD` | Owner sign-in password. Initializes a fresh store only; a password the owner later saves in Team & Approvals survives restarts. Factory reset returns to this value. |
| `GEMINI_API_KEY` | Enables the AI video critic, copywriter, and copilot. Without it, the critic returns an explicit "not analyzed" result — never invented grades. |
| `PORT` | Server port (default `3000`). |
| `OMNILOCAL_DATA_DIR` | SQLite + uploads directory (default `./data`). Mount as a volume in production. Back it up. |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist for split front/back-end deploys. Same-origin only when unset. |
| `UNIFIED_PUBLISH_API_KEY` | Marks publishing pathways as live. Publishing, OAuth, and Google Business connections are **not implemented** in this build — the UI says so and the API refuses fake handshakes. |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | Reserved. Payments are **demo-only**: checkout sessions always return `mode: "demo"` and no charge occurs. |

## Auth model

- Fail-closed: requests without a valid session get `401`, never owner access.
- Owner signs in with the master password; teammates use rotating access codes.
- Sessions are random tokens with 7-day expiry, revoked server-side on logout.
- Login is throttled: >5 failures per IP per 10 minutes returns `429`.
- Password changes revoke existing sessions.

## What's real vs. what's demo

- **Real:** QR/member/redemption loop, SQLite persistence, backup/restore/reset, fraud guards (one spin per guest per week), Playwright E2E suite.
- **Demo / not wired up:** Stripe checkout, OAuth for Facebook/Instagram/Google/TikTok/YouTube, Google Business Profile sync, live publishing. These surfaces are labeled as demo in the UI and API; the server will not claim a connection that doesn't exist.
- **Sample data:** copilot analytics and the attribution dashboard compute from stored/imported data and are labeled as sample data until you import real Meta/TikTok/GBP/POS reports.

## Tests

```bash
npm run test:e2e        # full Playwright suite (13 spec files), Chromium
```

The suite spins up its own server on a throwaway data directory with
`MASTER_PASSWORD=test-omnilocal-master`, signs in explicitly, and exercises
the real authenticated flows — including a full server-restart persistence
test. Do not delete tests to get green.

## Layout

- `server.js` — API + static frontend (single file, ~4,400 lines)
- `lib/store.js` — SQLite/JSON persistence layer
- `frontend/` — React app (`npm run build` outputs to `frontend/build`)
- `tests/e2e/` — 13 Playwright spec files + shared fixtures/helpers
- `DEPLOY.md` — deployment notes
