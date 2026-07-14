# Executive English Coaching — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. This file is the focused context for this folder.

## What this is
Digit2AI multi-tenant AI coaching platform for **executive English for international leadership** (trade, investment, diplomacy, press). Built from Fernando de la Espriella García's `ad honorem` program for Dr. Mauricio Gómez Amín, new Colombian Minister of Comercio, Industria y Turismo. Mounted at `/coaching-english`. Spanish-first, emoji-free.

## Architecture
- Self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`).
- Tables auto-create on boot (`sync({alter:false})`). Canonical migration: `migrations/20260714_exec_coaching_tables.sql`. All multi-tenant (`tenant_id`), `ec_` prefix.
- Tenancy: **one coach = one tenant** (`tenant_id = coach user id`). Academy-ready via `ec_students.coach_id`.
- AI brain `src/services/coach-brain.js` reuses `ANTHROPIC_API_KEY` (Haiku); zero-key heuristic fallback. Produces the program's 5 deliverables per session.
- 80%-student-speaks meter is deterministic (word counts in `routes/sessions.js`, not the LLM).

## The 5 deliverables (program SEGUIMIENTO section — coach v1 track)
fortalezas · aspectos a mejorar · expresiones de alto impacto · vocabulario estratégico · ejercicio para el día siguiente (+ correcciones).

## Two tracks
- **Coach track (v1):** coach logs 1:1 sessions, AI generates the 5 deliverables + 80%-speaks meter. Routes: `students`, `sessions`, `assignments`. Dashboard `/coaching-english/`.
- **Student self-serve (v2):** derived from Torna Idioma (reversed ES->EN, premium). Student self-signs up at `/start`, does a 7-step intake + placement, and the **AI Curriculum Agent** (`services/curriculum-brain.js`) generates a personalized modular program (ESP, 80/20 vocab, micro-lessons). Modular learning with AI-graded assessments: pass unlocks next, fail -> AI reinforcement, final -> certificate. Student app `/learn`. Routes: `intake`, `learning`. Tables: `ec_intake_profiles, ec_curricula, ec_modules, ec_assessments, ec_assessment_attempts`.
- **Coach KB (v2):** coach uploads teaching materials (`ec_kb_documents`, route `kb`) that steer the curriculum agent to teach the coach's way (white-label). Coach linking code = coach tenant id; students enter it at signup to attach. Supervision view lists self-serve students + progress.

## Tenancy
one coach = one tenant. Self-serve student = own tenant unless they sign up with a coach code (then they join that coach's tenant + KB). Role-aware gate: students -> /learn, coaches -> dashboard.

## Reused from Torna Idioma
exercise schema (`multiple_choice`/`fill_blank` + `content_en` markdown lessons) and the transcript-based 5-criterion oral-scoring rubric (fluency/accuracy/pronunciation/range/interaction, no auto-100). Discarded: Philippine/heritage/UVEG/TESDA content.

## Live
landing `/executive-english` (EN/ES) · dashboard `/coaching-english/` · signup/login · health `/coaching-english/health` · debug `/debug/exec-coaching-error`.

## Key env vars
`EXEC_COACHING_JWT_SECRET`, `EXEC_COACHING_MODEL`, `EXEC_COACHING_DEFAULT_PASSWORD`, `EXEC_COACHING_SEED_DEMO`. Full list in root CLAUDE.md.

## Source
Extracted program doc: `/Users/manuelstagg/Desktop/executive-english-coaching-gomez-amin.md`.
