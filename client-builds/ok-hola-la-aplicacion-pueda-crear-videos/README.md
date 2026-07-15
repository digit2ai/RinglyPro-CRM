# OK Hola — Voice-to-Video Prompt Builder

Spanish-first web app: a user describes a video by voice (Web Speech API) or text, an LLM (Anthropic Claude, with a deterministic in-memory mock fallback) transforms the free-form input into a structured video-generation prompt (`{scenes[], style, durationSec, aspectRatio, platform}`), and the user reviews, edits, and saves it to their prompt library. Passwordless magic-link auth reusing the RinglyPro `jsonwebtoken` lib; multi-tenant (`tenant_id === user id`, scoped on every read). Video rendering and social publishing are STUBBED (`routes/mocks.js`).

## Run
- Auto-mounted by `src/app.js` at `/ok-hola-la-aplicacion-pueda-crear-videos` (Render). Uses `process.env.DATABASE_URL`.
- Standalone smoke: `node client-builds/ok-hola-la-aplicacion-pueda-crear-videos/index.js` (uses in-memory store when `DATABASE_URL` is unset).
- SIT (deterministic, no DB / no live LLM): `node client-builds/ok-hola-la-aplicacion-pueda-crear-videos/sit.js` — exits 0 on all-pass, covers acceptance criteria 1-9 (+10/11).

## Env vars
- `DATABASE_URL` — Postgres (production). Absent -> in-memory store.
- `ANTHROPIC_API_KEY` — enables the real LLM prompt builder; absent or 2 failures -> deterministic mock.
- `OKHOLA_MODEL` — Anthropic model (default `claude-haiku-4-5-20251001`).
- `JWT_SECRET` — reused to sign/verify the app JWT.
- `OKHOLA_INMEM=1` / `OKHOLA_FORCE_MOCK=1` — force in-memory store / mock builder (SIT sets both).

## Endpoints (relative to the mount)
`GET /health` · `GET /` (es default, `?lang=en`) · `GET /dashboard` · `GET /privacy` ·
`POST /api/v1/auth/magic-link` · `POST /api/v1/auth/verify` ·
`POST /api/v1/prompts/generate` · `GET /api/v1/prompts` · `GET /api/v1/prompts/:id` · `PATCH /api/v1/prompts/:id` ·
`POST /api/v1/prompts/:id/render` (mocked 202) · `POST /api/v1/prompts/:id/publish` (mocked 202)
