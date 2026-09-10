# OmniLocal #1 end-to-end suite

Runs with Playwright against the built app (`playwright.config.js` starts `node server.js` on port 3000 when nothing is listening).

```bash
npm run test:e2e                     # everything
npx playwright test 04-maximizer     # one area
npx playwright show-report           # HTML report after a run
```

| Spec | Covers |
|---|---|
| `00-smoke` | every navigation tab and public route renders with no page errors, failed API calls or leaked `undefined`/`NaN` |
| `01-auth` | logout, master password, wrong password, Google fallback message, team-member sign-in, code rotation lock-out, revoke/restore, master password change |
| `02-team` | access code card, copy, rotate confirm/cancel, member submissions approved / rejected by the owner |
| `03-overview` | command center shortcuts, mobile nav, Weekly Win Report + PDF download, ad-spend log, Monday report email settings |
| `04-maximizer` | game planner, prize board, QR generator + PDFs, segment-aware spin, redeem station, customer CSV import, welcome queue, weekly codes + POS reconciliation, location analytics |
| `05-dashboard` | in-app wheel -> ledger -> staff redemption, history/staff/rest tabs, sprint / rest / margin-floor controls |
| `06-content` | copywriter, video critic (sample + real chunked upload), publish-all, coach templates (PDF, calendar, shelf), video vault uploads, calendar CRUD, local events, brand brain, strategy + industry manager |
| `07-executioner` | weekly learning loop, POS transaction import/clear, connection-gated plan, connector OAuth handshake, coach build sheets |
| `08-tools` | print studio, attribution hub imports/clear, knowledge base horizons, multi-track toggles |
| `09-copilot` | Co-Captain sidebar controls, free-text commands and all eight quick-action chips (including approval + CSV export popup) |
| `10-public` | scan-to-play page (signup validation, win, one-play-per-week), paused games, pricing -> checkout -> payment result |
| `11-api` | every Express route: status codes, error paths and the response shapes the UI reads |
| `12-persistence` | memory core: boots its own server on port 3111, restarts it, and checks data / sessions / uploads survive, plus backup, restore, reset and owner-only access |

Helpers in `helpers.js` attach console/network watchers (`watchPage` / `expectClean`) so a test fails if any API call errors unexpectedly. `fixtures.js` aborts requests to non-local hosts (Google Fonts) so page loads are not held up in sandboxed CI.
