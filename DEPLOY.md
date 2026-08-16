# Deploying OmniLocal #1

The app ships as **one Docker container**: the FastAPI backend serves the API at
`/api` and the built React app at `/`. Same origin — no CORS setup, no frontend
URL wiring. Works on CreateOS, Railway, Render, Fly, or any Docker host.

```
docker build -t omnilocal .
docker run -p 8000:8000 --env-file .env omnilocal
```

The only external service required is MongoDB (MongoDB Atlas free tier works).

## Environment variables

### Required

| Var | What it does |
|---|---|
| `MONGO_URL` | MongoDB connection string (e.g. from Atlas) |
| `DB_NAME` | Database name, e.g. `omnilocal` |
| `ANTHROPIC_API_KEY` | Copywriter drafts, coach templates, plan checks |
| `OPENAI_API_KEY` | Video frame analysis (gpt-4o) + Whisper transcription |
| `S3_BUCKET` | Bucket for critic/vault videos |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `MASTER_PASSWORD` | Seeds the owner's email+password sign-in |

### Recommended

| Var | What it does |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enables "Sign in with Google" **and** the Google Business Profile connection. One OAuth client covers both. Add both redirect URIs in Google Cloud Console: `https://<your-domain>/api/auth/google/callback` and `https://<your-domain>/api/google-business/callback` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Live subscription billing |
| `RESEND_API_KEY` + `SENDER_EMAIL` + `REPLY_TO_EMAIL` | Real email sending (weekly reports, welcome emails) |

### Optional

| Var | Default | What it does |
|---|---|---|
| `AI_MODEL` | `claude-sonnet-4-6` | Claude model for copywriter/coach |
| `S3_REGION` | — | AWS region for the bucket |
| `S3_ENDPOINT_URL` | — | Point at any S3-compatible store (Cloudflare R2, MinIO) |
| `CORS_ORIGINS` | — | Only needed if the frontend is hosted on a *different* origin |
| `PORT` | `8000` | Listen port (most platforms set this automatically) |
| `UNSUBSCRIBE_BASE_URL` | example URL | Unsubscribe link base in emails |
| `OWNER_VIDEO_URL` | demo URL | Fallback welcome video |

## First sign-in

The **first account to sign in becomes the owner**. Sign in with Google (if
configured) or with `MASTER_PASSWORD` + any email you set as owner. Team
members who sign in afterwards are pending until they enter the access code
from the Team page (max 3 seats).

## Key separation (test vs business)

All keys are runtime env vars. Test with personal keys, then swap in the
business account's keys (Anthropic workspace key, business AWS account, live
Stripe) by updating the deployment's environment — no code changes.
