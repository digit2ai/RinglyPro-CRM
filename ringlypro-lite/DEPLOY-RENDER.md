# Deploy RinglyPro Lite to Render — 2-minute manual step

Claude cannot create the service (no Render API key / CLI in the environment).
This is the one-time human action. Everything else is pre-wired.

## Create the service (Render dashboard)

1. Render dashboard → **New +** → **Web Service** → connect repo
   `digit2ai/RinglyPro-CRM` (already connected).
2. Settings:
   - **Name:** `ringlypro-lite`  → gives **https://ringlypro-lite.onrender.com**
   - **Root Directory:** `ringlypro-lite`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
   - Plan: Starter.
   (These match `ringlypro-lite/render.yaml`.)
3. Add env vars (below), **Create Web Service**. First deploy ~2 min.

## Env vars

### Fast first-test (reuse existing RinglyPro creds — OK because all tables are `lite_`-prefixed)
| Key | Value |
|---|---|
| `LITE_PORT` | `10000` |
| `LITE_WEBHOOK_BASE_URL` | `https://ringlypro-lite.onrender.com` |
| `LITE_DATABASE_URL` | reuse your existing `DATABASE_URL` (lite_ tables won't collide) |
| `LITE_JWT_SECRET` | reuse your `JWT_SECRET` (or a new random string) |
| `LITE_ANTHROPIC_API_KEY` | reuse your `ANTHROPIC_API_KEY` |
| `LITE_TWILIO_ACCOUNT_SID` | reuse your `TWILIO_ACCOUNT_SID` |
| `LITE_TWILIO_AUTH_TOKEN` | reuse your `TWILIO_AUTH_TOKEN` |
| `LITE_STRIPE_SECRET_KEY` | reuse your `STRIPE_SECRET_KEY` (trial works without it) |
| `LITE_ADMIN_KEY` | any secret string (gates /internal/economics) |
| `LITE_CO_NUMBERS_ENABLED` | `0` |

That's enough for `/health`, `/signup`, `/dashboard`, and message/booking logic.

### Production hardening (do before real traffic — restores full isolation)
- `LITE_DATABASE_URL` → a **separate** Postgres DB (not the CRM one).
- `LITE_TWILIO_*` → a **separate Twilio subaccount**.
- `LITE_STRIPE_WEBHOOK_SECRET` + point a Stripe webhook at
  `https://ringlypro-lite.onrender.com/webhooks/stripe`.
- `LITE_STRIPE_PRICE_US` / `LITE_PRICE_US_CENTS` for the flat plan.

## After it's live

1. Open `https://ringlypro-lite.onrender.com/health` → `{ ok: true }`.
2. `/signup` → create a tenant (7-day trial, default Mon–Fri 9–17).
3. In the wizard, **Assign my Lite number** buys a US DID on your Twilio.
4. Twilio auto-points that DID's Voice webhook at
   `https://ringlypro-lite.onrender.com/voice/incoming` (done at purchase).
5. Forward a mobile to the DID with the shown code, call it → AI answers →
   message/booking shows in `/dashboard`.

## Alternative Claude CAN do without the dashboard
Give Claude a **Render API key** (`rnd_…`) as an env var, or a **deploy-hook
URL**, and it will create/trigger the service via the API in this session.
Without one of those, this manual step is required once.
