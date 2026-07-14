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

## The 5 deliverables (program SEGUIMIENTO section)
fortalezas · aspectos a mejorar · expresiones de alto impacto · vocabulario estratégico · ejercicio para el día siguiente (+ correcciones).

## Live
landing `/executive-english` (EN/ES) · dashboard `/coaching-english/` · signup/login · health `/coaching-english/health` · debug `/debug/exec-coaching-error`.

## Key env vars
`EXEC_COACHING_JWT_SECRET`, `EXEC_COACHING_MODEL`, `EXEC_COACHING_DEFAULT_PASSWORD`, `EXEC_COACHING_SEED_DEMO`. Full list in root CLAUDE.md.

## Source
Extracted program doc: `/Users/manuelstagg/Desktop/executive-english-coaching-gomez-amin.md`.
