# Learnings & Incident Log

## 2026-07-18 — Fork corruption incident (RESOLVED)
The forked pod arrived with widespread null/whitespace file corruption:
- /etc/supervisor/supervisord.conf + nginx proxy conf (services down) → rewritten
- /root/.venv (82% corrupt) → rebuilt from requirements.txt (litellm/emergentintegrations conflict:
  install base reqs first, then `pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/`)
- /app/frontend/node_modules + yarn.lock → rm -rf + fresh yarn install
- MongoDB /data/db WiredTiger files destroyed → wiped, backend startup re-seeds demo state.
  ALL PRIOR USER DATA IN MONGO WAS LOST (brand profile edits, imports, redemptions, AI logs).
- Many /app files restored from git blobs (walk `git rev-list HEAD`, test blob for >95% whitespace).
- Hand-recreated: craco.config.js (needs WDS v5 compat: strip onBefore/onAfterSetupMiddleware into
  setupMiddlewares, allowedHosts:"all", withVisualEdits wrapper), public/index.html, App.css,
  lib/utils.js, 12 shadcn components (deleted unrecoverable extras: carousel, navigation-menu,
  menubar, form, drawer, hover-card, aspect-ratio, collapsible, dropdown-menu, slider, select),
  /root/.config/pip/pip.conf (deleted), code-server config.
- Detection tip: scan for files whose bytes are >95% in {0x00, 0x20, \t, \n}.

## Auth architecture (2026-07-18)
- backend/auth.py: Emergent Google OAuth + middleware gating all /api paths except OPEN_PATHS.
- Roles: single owner (first login) + max 3 members. Members need TR access code (state key
  team_settings). Rotating code bumps code_version → members with stale version get 403
  access_code_required instantly. Revoke deletes sessions (immediate 401).
- Approval workflow: members' publish-all / send-welcome create docs in `approvals`; owner
  approve executes via auth.EXECUTORS registered in server.py (_do_publish_all, _do_send_welcome).
- Frontend: index.js checks location.hash session_id synchronously → AuthCallback; AuthProvider +
  AuthGate in lib/AuthContext.js; axios withCredentials + 403 interceptor dispatches
  "omni-auth-locked" event to re-lock UI live.

## 2026-07-25 — GitHub push failed: corrupt loose git objects
- Symptom: push 500 "inflate: data stream error / loose object ... is corrupt". 58 loose objects
  in .git/objects were null-byte corrupted (residue of the earlier pod corruption incident).
- Fix: regenerated the 2 corrupt objects reachable from HEAD (empty blob e69de29 via
  `printf '' | git hash-object -w --stdin`; frontend/jsconfig.json blob via `git hash-object -w`),
  verified snapshot with `git archive HEAD`, then rebuilt history: orphan branch -> commit full
  tree -> `git branch -M main` -> reflog expire -> rm remaining corrupt loose objects ->
  `git gc --prune=now`. fsck clean; `git bundle create` used to prove pack/push path works.
- .git backup saved at /tmp/git_backup_* (pre-repair). History is now a single clean commit.
