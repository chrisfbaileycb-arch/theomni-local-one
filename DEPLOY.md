# Deploying OmniLocal #1

The app runs as a unified Node.js / Express service with Vite React frontend. It uses **Google Gemini** as the single source of truth for all AI execution, copilot tool calling, copywriting, video analysis, and decision-making.

## Environment Variables

### AI & Execution (Single Source of Truth)

| Var | What it does |
|---|---|
| `GEMINI_API_KEY` | **Google Gemini API Key** — The single source of truth for all AI intelligence: Sidebar Agent / Co-Captain, Content Director copywriting, Coach templates, Video critic, and Customer Maximizer decision making. Without it every AI path falls back to a deterministic local engine so the app stays fully usable. |
| `GEMINI_MODEL` | Gemini model id (default `gemini-3.7-flash`). |

### Access & delivery

| Var | What it does |
|---|---|
| `MASTER_PASSWORD` | Owner sign-in password (default `omnilocal`). When set it is authoritative on every boot; when unset, the password last saved from Team & Approvals persists. Team members sign in with the current TR access code instead. |
| `PORT` | HTTP port (default `3000`). |
| `RESEND_API_KEY` | Optional. Flips the Monday Win Report email and welcome-video emails from stub mode to live sending. |
| `UNIFIED_PUBLISH_API_KEY` | Optional. Flips Publish-All from a demo blast to live posting. |
| `OMNILOCAL_DATA_DIR` | Directory for the memory core (SQLite file + uploads). Default `./data`; the Docker image uses `/app/data`. Mount it as a volume. |
| `OMNILOCAL_UPLOAD_DIR` | Optional override for uploaded media; defaults to `<OMNILOCAL_DATA_DIR>/uploads`. |

Google OAuth and Stripe are not wired in this build: the Google button explains that on the login page, and checkout runs in a clearly labelled demo mode that lands on `/payment/success`.

## Verifying the app

```bash
npm install            # also builds the frontend bundle
npm run test:e2e       # Playwright: every button, workflow and API route (starts the server itself)
```

The suite lives in `tests/e2e/` — one spec per section plus `11-api.spec.js`, which exercises every route in `server.js` and asserts the response shapes the frontend reads.

### Architecture
- **AI Execution Engine**: `@google/genai` (Google Gemini 3.7 Flash)
- **Runtime**: Node.js 22 / Express
- **Frontend**: React + Tailwind CSS (Vite build served by the same process)
- **Persistence**: the memory core (`lib/store.js`) — an embedded SQLite database under `OMNILOCAL_DATA_DIR` (default `./data`), written on every change

## Memory core (persistence)

The server keeps its working set in memory and the memory core makes it durable:

- Every collection (brand profile, members, claim codes, calendar, vault, approvals, sessions, ...) is saved to `data/omnilocal.sqlite` a few hundred milliseconds after any change, and again on shutdown. Restarts and deploys keep all data, and signed-in users stay signed in.
- Uploaded videos live in `data/uploads/`.
- `GET /api/health` reports the storage driver, last save time and record counts. Point your load balancer or uptime monitor at it.
- Owners get **Memory Core · Data & Backups** on the Team page: download a JSON backup, restore one, or reset to the demo seed. The same operations exist as `GET /api/admin/backup`, `POST /api/admin/restore`, `POST /api/admin/reset` (owner session required).
- Node 22.13+ uses the built-in `node:sqlite`; older Node runtimes fall back to an atomically written JSON file in the same directory.

**Back up the data directory** (or the JSON export) as part of your normal ops. It is the only copy of a business's data.

## Running in Docker

```bash
docker compose up --build -d
```

The compose file mounts a named volume at `/app/data` so the memory core survives container rebuilds. Set `MASTER_PASSWORD` and `GEMINI_API_KEY` in a `.env` file next to `docker-compose.yml`.
