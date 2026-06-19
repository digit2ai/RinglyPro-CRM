# Veritas — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. This file is the focused context for this folder.

## What this is
Digit2AI AI deepfake detection & takedown (modeled on revelum.ai) — brand/executive/likeness protection. Mounted at `/veritas`. Launch client = **Defensores de la Patria** campaign (Abelardo de la Espriella). Spanish + emoji-free.

## Architecture
- Self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`).
- Tables auto-create on boot (`sync({alter:false})`). Canonical migration: `migrations/20260605_veritas_tables.sql`. All multi-tenant (`tenant_id`), `df_` prefix.
- Detection engine `src/services/detection.js` is provider-agnostic. Phase 0 = deterministic stub (zero keys). Swap via `VERITAS_DETECTION_PROVIDER` (hive|reality_defender|sensity).
- Ad scanning `src/services/adscan.js` — stubbed until `META_AD_LIBRARY_TOKEN` set.

## Live
dashboard `/veritas/` · landing `/public/veritas-landing.html` · health `/veritas/health`.

## Key env vars
`VERITAS_DETECTION_PROVIDER`, `HIVE_API_KEY`/`REALITY_DEFENDER_API_KEY`, `META_AD_LIBRARY_TOKEN`, `VERITAS_JWT_SECRET`, `VERITAS_SEARCH_API_KEY`+`VERITAS_SEARCH_CX`. Full list in root CLAUDE.md.

## Status
Build status + remaining external deps tracked in `ECOSYSTEM.md`.
