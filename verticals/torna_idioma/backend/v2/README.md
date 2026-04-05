# Torna Idioma — Learner Platform v2

This directory contains the **next-generation AI-powered Spanish learning platform** for Filipino learners. It runs **alongside** the existing Torna Idioma program/advocacy site (`/Torna_Idioma/*`) as an additive, fully-isolated subsystem.

## Isolation Boundaries (Non-Negotiable)

| Boundary | v1 (Program & Advocacy) | v2 (Learner Platform) |
|---|---|---|
| URL path (API) | `/Torna_Idioma/api/*` | `/Torna_Idioma/api/v2/*` |
| URL path (SPA) | `/Torna_Idioma/*` | `/Torna_Idioma/learn/*` |
| DB table prefix | `ti_*` | `ti_v2_*` |
| Filesystem (backend) | `backend/routes/`, `backend/services/` | `backend/v2/` |
| Filesystem (frontend) | `frontend/src/pages/` | `frontend/src/v2/` |
| Env vars | existing | `TI_V2_*` (new keys) |
| Migrations | `backend/migrations/` | `backend/v2/migrations/` |

## What's Shared

- **PostgreSQL instance** + connection pool (reuses parent `sequelize` from `services/db.ti.js`)
- **JWT secret** (v2 issues its own tokens but uses the same signing key)
- **Express app** (v2 is a sub-router mounted at `/api/v2`)
- **Vite build output** (single frontend bundle)
- **Render deployment** (same service)

## What's NEVER Touched by v2

- Any file in `/verticals/cw_carriers/`, `/verticals/msk_intelligence/`, `/verticals/logistics/`, `/verticals/kanchoai/`, `/verticals/tunjoracing/`, `/verticals/spark/`
- Any existing v1 Torna Idioma file (`backend/routes/*.js`, `backend/migrations/*.sql`, `frontend/src/pages/*.jsx`)
- The root `src/app.js` (only the existing `/Torna_Idioma` mount is used)
- Any non-`ti_v2_` database table

**Exceptions** (the ONLY allowed modifications to v1 files):
- `backend/index.js` — one added line mounting the v2 router + one added line in migration loader to also read from `v2/migrations/`
- `frontend/src/App.jsx` — one added `<Route path={\`${BASE}/learn/*\`}>` + one import

## Remove-ability Test

At any time, v2 can be cleanly removed with:

```bash
rm -rf verticals/torna_idioma/backend/v2/
rm -rf verticals/torna_idioma/frontend/src/v2/
# Remove the single v2 mount line from backend/index.js
# Remove the single /learn route from frontend/src/App.jsx
psql $DATABASE_URL -c "DROP TABLE IF EXISTS ti_v2_learners, ti_v2_vocabulary_cards, ti_v2_reviews, ti_v2_cognates, ti_v2_xp_log, ti_v2_streaks, ti_v2_badges, ti_v2_user_badges, ti_v2_ai_memory, ti_v2_isabel_conversations, ti_v2_conversation_logs, ti_v2_behavior_events, ti_v2_lesson_sessions, ti_v2_exercise_attempts, ti_v2_tutors, ti_v2_tutor_availability, ti_v2_tutor_bookings, ti_v2_tutor_reviews CASCADE;"
```

After removal, the existing Torna Idioma program/advocacy site keeps running unchanged. **This is the litmus test at every phase gate.**

## Directory Structure

```
backend/v2/
├── index.js              # Express sub-router, mounted at /api/v2
├── README.md             # This file
├── routes/               # HTTP route handlers
├── services/             # Business logic (SRS, Isabel LLM, voice, etc.)
├── middleware/           # v2-auth, rate-limit
├── migrations/           # ti_v2_*.sql migration files
└── seeds/                # Cognates, badges, demo data
```

## Build Steps

See `../LEARNER_V2_BUILD_PLAN.md` at the Torna Idioma root for the 12-step autonomous build plan.

| Step | Scope | Status |
|---|---|---|
| 1 | Skeleton + mount + migration loader | **In progress** |
| 2 | Learner profile (first slice) | Pending |
| 3 | Cognate engine (500+ Filipino-Spanish pairs) | Pending |
| 4 | SRS engine (SM-2 algorithm) | Pending |
| 5 | Gamification (XP, streaks, badges) | Pending |
| 6 | Profesora Isabel AI tutor (text) | Pending |
| 7 | Real-time voice conversation | Pending |
| 8 | Behavior & engagement analytics | Pending |
| 9 | Lesson player + CEFR adaptive engine | Pending |
| 10 | Human tutor marketplace | Pending |
| 11 | Mobile app (React Native / Expo) | Pending |
| 12 | Proprietary model + voice clones | Pending |

## Regression Testing

After every deploy, run:

```bash
bash scripts/regression-check.sh
```

This curls 7 health endpoints (all verticals + v1 + v2) and exits non-zero if any fail.
