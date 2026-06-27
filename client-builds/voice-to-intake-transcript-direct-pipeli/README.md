# Voice-to-Intake Transcript Direct Pipeline

Single-screen EN/ES voice → transcript → intake web app. The browser's Web Speech
API transcribes speech client-side; on submit the page POSTs the transcript to a
JWT-guarded endpoint that persists the row and forwards it to the Digit2AI intake
webhook (mocked when the forward env vars are unset). Intake rows are flagged
`triage_bypass=true` so downstream knows they skipped triage.

## Runbook

Auto-mounted by `src/app.js` at `/voice-to-intake-transcript-direct-pipeli` on
boot (any `client-builds/<short_name>/index.js` exporting an Express app is picked
up). Render auto-deploys on push to `main` (~90s). No build step — static HTML/JS.

- UI: `GET /voice-to-intake-transcript-direct-pipeli/` (append `?lang=es` for Spanish)
- Health: `GET /voice-to-intake-transcript-direct-pipeli/health`
- Create: `POST /voice-to-intake-transcript-direct-pipeli/api/v1/intake` (Bearer JWT)
- List: `GET /voice-to-intake-transcript-direct-pipeli/api/v1/intake` (Bearer JWT, tenant-scoped)

Run SIT: `node sit.js` (in-process, self-hosted) or
`SIT_BASE_URL=https://aiagent.ringlypro.com/voice-to-intake-transcript-direct-pipeli node sit.js`.

## Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `DATABASE_URL` | for persistence | Postgres connection. Unset/unreachable → in-memory fallback store (rows lost on restart; persistence TODO). |
| `JWT_SECRET` | yes (prod) | HMAC secret for verifying the Bearer JWT on write/read endpoints. Tenant context read from `tenant_id`/`clientId`/`client_id`/`userId` claim. |
| `CHAMPION_LINK_SECRET` | no (falls back to `JWT_SECRET`) | HMAC secret for signing/verifying champion magic-link codes (the `?c=<code>` capability token). Set a dedicated value on prod. Owner mints links at `/voice-to-intake-transcript-direct-pipeli/champion-links.html` (needs a CRM login); champions open `…/?c=<code>` and are recognized with no login. A champion code can never mint another link. |
| `DIGIT2AI_INTAKE_URL` | no | Real Digit2AI intake webhook. Unset → forward is mocked, row saved with `forward_status='mocked'`. |
| `DIGIT2AI_INTAKE_TOKEN` | no | Bearer token for the intake webhook. Both URL + token must be set to enable real forwarding. |

## Notes / deferred

Web Speech API is the MVP STT (EN `en-US` / ES `es-US`); typed transcript is the
guaranteed fallback when `SpeechRecognition` is undefined (e.g. older Safari).
Deferred: server-side Whisper/Deepgram STT, PWA/offline, WebSocket streaming,
iOS Safari mic certification, MCP wrapper, magic-link login.

PII discipline: transcript bodies and submitter emails are never logged — only
`{ intake_id, tenant_id, lang, forward_status, transcript_len }` go to stderr.
