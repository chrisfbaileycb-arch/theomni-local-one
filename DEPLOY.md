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
| `MASTER_PASSWORD` | Owner sign-in password for the login page (default `omnilocal`). The owner can also change it under Team & Approvals. Team members sign in with the current TR access code instead. |
| `PORT` | HTTP port (default `3000`). |
| `RESEND_API_KEY` | Optional. Flips the Monday Win Report email and welcome-video emails from stub mode to live sending. |
| `UNIFIED_PUBLISH_API_KEY` | Optional. Flips Publish-All from a demo blast to live posting. |
| `OMNILOCAL_UPLOAD_DIR` | Optional. Storage directory for chunked video uploads (Video Critic / Vault). Defaults to the OS temp dir. |

Google OAuth and Stripe are not wired in this build: the Google button explains that on the login page, and checkout runs in a clearly labelled demo mode that lands on `/payment/success`.

## Verifying the app

```bash
npm install            # also builds the frontend bundle
npm run test:e2e       # Playwright: every button, workflow and API route (starts the server itself)
```

The suite lives in `tests/e2e/` — one spec per section plus `11-api.spec.js`, which exercises every route in `server.js` and asserts the response shapes the frontend reads.

### Architecture
- **AI Execution Engine**: `@google/genai` (Google Gemini 3.7 Flash)
- **Runtime**: Node.js / Express
- **Frontend**: React + Tailwind CSS
- **Persistence**: Self-contained state store
