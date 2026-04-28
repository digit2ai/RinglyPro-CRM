# Multi-Tenant SaaS Build -- Complete

Conversion of CamaraVirtual.app + VirtualChamber.app from prefix-per-chamber tables (hispamind_*, pacccfl_*, pcci_*) to a unified multi-tenant SaaS with `chamber_id` row-level scoping.

**Build spec:** [`prompts/camaravirtual-multitenant-saas.md`](../prompts/camaravirtual-multitenant-saas.md)
**Smoke test:** 26/26 PASSED

## Commit chain (8 PRs + 1 fix)

| PR | Commit | Description |
|---|---|---|
| 1 | [`5a0a8ca8`](../../commit/5a0a8ca8) | Schema: chambers + 22 unified tenant tables + chamber_slug_seq |
| 2 | [`ac212803`](../../commit/ac212803) | Data migration: cv-1 (hispamind) / cv-2 (pacccfl) / cv-3 (pcci) -- 29+3+2 members, all FKs preserved via id offset |
| 3 | [`c54e8e8e`](../../commit/c54e8e8e) | Chamber-resolver middleware + unified router (auth, members, projects, regions, public/info) |
| 4 | [`02d7ac96`](../../commit/02d7ac96) | Stripe-integrated signup wizard ($150 setup + $99/mo) + bilingual signup pages + webhook |
| 5 | [`cde571f1`](../../commit/cde571f1) | Per-chamber landing template (ES + EN) + dynamic Express routing for cv-* / vc-* slugs |
| 6 | [`0a3780db`](../../commit/0a3780db) | Bilingual dashboards: public/dashboard/index.html (ES) + en.html (EN) -- 70+ translations |
| 7 | [`a868f510`](../../commit/a868f510) | Legacy URL redirects /chamber/<prefix>/ → /cv-N/ + custom-domain pass-through |
| 8 | [`0a3d720e`](../../commit/0a3d720e) | Smoke test script -- 30+ end-to-end checks |
| fix | [`84d63d75`](../../commit/84d63d75) | Move legacy redirect before express.static; smoke test acknowledges multi-chamber email overlap |

## What's live

```
camaravirtual.app/                    → Spanish marketing landing
camaravirtual.app/signup              → Spanish signup wizard ($150 + $99/mo)
camaravirtual.app/cv-1/               → HispaMind chamber landing (ES)
camaravirtual.app/cv-1/dashboard/     → HispaMind dashboard (ES)
camaravirtual.app/cv-1/api/*          → HispaMind unified API (chamber_id=1 scoped)

virtualchamber.app/                   → English marketing landing
virtualchamber.app/signup             → English signup wizard
virtualchamber.app/vc-101/            → New English chamber (after first signup)

/chamber/hispamind/* → 301 → /cv-1/*  (legacy URLs preserved)
/chamber/pacccfl/*   → 301 → /cv-2/*
/chamber/pcci/*      → 301 → /cv-3/*
```

## Database schema

- `chambers` -- tenant registry (slug, name, brand_domain, primary_language, status, Stripe billing fields)
- `chamber_slug_seq` -- shared sequence starting at 101 for new signups
- 22 unified tenant tables, each with `chamber_id INT NOT NULL REFERENCES chambers(id) ON DELETE CASCADE` + `idx_<table>_chamber` index
- `members` has `UNIQUE(chamber_id, email)` -- a person can belong to multiple chambers

## Tenant isolation

- JWT carries `chamber_id` in payload; chamber-resolver middleware refuses cross-chamber tokens
- Every query in `src/routes/unified-chamber.js` includes `WHERE chamber_id = :chamber_id`
- `members.email` may repeat across chambers, but each row is scoped to one chamber

## Smoke test results

```
[1] Schema             3/3 PASS
[2] Data Migration    10/10 PASS
[3] Slug sequence      1/1 PASS
[4] Routing (live)     9/9 PASS
[5] Stripe signup      3/3 PASS

TOTAL: 26/26 PASSED
```

## Pending operational items

1. **Set Stripe production keys on Render** -- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_MONTHLY` (the $99/mo recurring price ID), `STRIPE_WEBHOOK_SECRET`. Until set, signup runs in TEST MODE (no charges).

2. **Configure Stripe webhook endpoint** in Stripe dashboard pointed at `https://www.camaravirtual.app/api/chambers/stripe/webhook` -- listens for invoice.payment_succeeded / invoice.payment_failed / customer.subscription.deleted.

3. **Drop legacy prefix tables** (66 tables) when ready for full cutover:
   ```bash
   DROP_LEGACY=true /opt/homebrew/bin/node scripts/smoke-test-multitenant.js
   ```
   Currently the legacy `hispamind_*` / `pacccfl_*` / `pcci_*` tables remain as a safety net. Until they are dropped, the legacy chamber-template router at `/chamber/<prefix>/api/*` keeps the old prefix-based dashboards functional in parallel with the new unified routing.

4. **Federation** -- not built in this phase. Will require `chamber_federations` table + bilateral admin approval flow + scope JSON.
