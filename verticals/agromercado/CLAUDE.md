# AgroMercado / Agrollano — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. Focused context below.

## What this is
National agro marketplace for Venezuela (semovientes, maquinaria, insumos, subastas en vivo, divisas BCV). **Developed by ISTC** (owns the platform); **AI layer by Digit2AI**. Product for Grupo Agrollano = **AgrollanoDigital** (white-label, separate `tenant_id`). The alliance is **ISTC × Digit2AI** — never "AgroMercado × Digit2AI".

## Architecture
- Self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`).
- Tables auto-create on boot (`sync({alter:false})`). Migration: `migrations/20260610_agromercado_tables.sql`. Multi-tenant, `am_` prefix.
- Bid min: `P_min = P_actual + Δ_base × (1 + ln(Count_pujas + 1))` in `src/utils/bid.js`. Pujas are ACID row-locked.
- FX poller `src/services/fxPoller.js` fires 09:00 & 13:00; parallel fallback = official + 40%.

## Live
dashboard `/agromercado/` (admin/ops, Spanish) · health `/agromercado/health`. Public storefront on ISTC Vercel (agromercado-vzla.vercel.app). Teaser `public/agromercado-teaser.html`.

## Key env vars
`AGROMERCADO_JWT_SECRET`, `AGROMERCADO_WHATSAPP_TOKEN`/`_PHONE_ID` (unset = log-only), `AGROMERCADO_FX_SOURCE_URL`, `AGROMERCADO_SEED_DEMO`.
