# DIGIT2AI Project Factory — Multi-Tenant SaaS Conversion Plan

> Status: **PLANNING / PARKED** — no code changed yet. Resume from the "Open Decisions" section.
> Owner: Manuel Stagg · Created: 2026-07-10
> Concerns: `digit2ai-projects/` (mounted at `/projects`) — NOT the Veritas cwd.

## Goal (user's idea, verbatim intent)
Sell the existing `/projects` app as a product: a **DIGIT2AI AI Project Factory** that other
clients can use, leveraging the existing MCP + 83-agent architect + all current features.
Charge clients based on **credit consumption in the form of tokens**.

---

## What `/projects` is today (verified against code)

Two things bolted together:

1. **The factory** — `digit2ai-projects/` self-contained Express sub-app mounted at `/projects`
   (`src/app.js:1553`). NL project description → **architect pipeline**
   (`digit2ai-projects/src/services/architectPipeline.js`) synthesizes a master prompt → the
   runtime side in `src/app.js:1578` **builds code and `git push`es to `main` → Render deploys**.
   Also: intake, contracts/Stripe, NDAs, meeting minutes, teasers, partner attribution.
2. **The command center** — `src/routes/projects-bridge.js`, hard-scoped to `D2AI_CLIENT_ID = 15`
   (owner's CRM data: calls, messages, email, Neural KPIs).

## Feasibility verdict: YES — schema is already half-way there

- Every `d2_*` table **already has `workspace_id INTEGER NOT NULL DEFAULT 1`**. Data model is
  tenant-aware by design.
- BUT the code hardcodes it: **`workspace_id: 1` appears in 184 places across 29 files**
  (`digit2ai-projects/src/`).
- **Auth has no tenant boundary today**: `src/middleware/auth.js:28` accepts ANY valid main-CRM
  JWT and auto-provisions the caller as **admin of workspace 1**. Anyone who can log into the CRM
  is admin of the single shared factory.
- **No billing/metering anywhere** in `/projects`. Credit systems exist elsewhere (EquiMind,
  RinglyPro) but not here — this is net-new.

---

## The 4 workstreams to make it multi-tenant SaaS

| # | Workstream | Effort | Detail |
|---|---|---|---|
| 1 | **Tenant scoping** | Medium | Replace 184 hardcoded `workspace_id: 1` with per-request tenant id from JWT. Add tenant-resolver middleware; every query/insert + the architect pipeline inherit it. Mechanical but must be 100% — one missed query = cross-tenant data leak. |
| 2 | **Tenant auth & onboarding** | Medium | Real signup/login minting a JWT carrying `workspaceId`; workspaces/plan table; provisioning (create workspace + owner on signup). Stop auto-granting admin of workspace 1. |
| 3 | **Token/credit metering + billing** | High (the new part) | See below — the heart of the business model. |
| 4 | **Isolation for generated code** | High / Risk | The factory writes code and pushes to YOUR `main`. Not safe to let paying clients trigger builds into your production repo. Needs a sandbox/approval boundary. |

## Billing model — metering tokens/credits

Three cost events per tenant to meter:
1. **LLM tokens** — every architect prompt synth + agent run hits Anthropic. Wrap those calls to
   capture `usage.input_tokens` / `output_tokens`, write a ledger row per tenant.
2. **Build/deploy actions** — each generated app = real compute + a deploy. Price as a flat credit per build.
3. **Ongoing hosting** — each generated vertical runs forever; monthly credit drip.

Mechanism: a **credit ledger** (`d2_credit_ledger`: tenant_id, event_type, tokens_in, tokens_out,
credits_debited, ref). Buy credits via Stripe (already integrated) → deduct per metered event →
middleware blocks new work at zero balance. 1 credit = a token bucket (e.g. 1,000 tokens) so
pricing stays legible.

## The one decision that changes everything: retrofit vs clone

- **Option A — Retrofit in place** (one app, many tenants). Add `workspace_id` scoping + billing.
  Cheapest to run. Risk: incomplete scoping leaks data; all tenants share your build pipeline.
- **Option B — Clone-per-tenant** (template + per-client instance / subdomain), like the chamber
  "cookie cutter" pattern. Stronger isolation, higher ops overhead.
- **RECOMMENDED: Hybrid** — Option A for data/UI (one multi-tenant hub), Option B's isolation ONLY
  for the dangerous part: generated builds go to a per-tenant sandbox repo/branch behind an
  approval gate — never straight to your `main`. SaaS economics without customers pushing code
  into production.

---

## OPEN DECISIONS (answer these to resume)

1. **Isolation stance** — Retrofit (A), Clone-per-tenant (B), or recommended Hybrid?
2. **What do tenants get?** Full factory (they trigger real builds/deploys) OR a safer subset first
   (intake + project tracking + AI plan/proposal generation, builds stay manual/you-approved)?
   This massively changes workstream #4 risk.
3. **Credit unit + price** — 1 credit = 1,000 tokens OK? Per-build flat credit + monthly hosting
   drip? Ballpark price per credit?
4. **First paying tenant** — build against one real client (like Defensores/Veritas) vs generic
   multi-tenancy in the abstract.

## Key files (for whoever resumes)
- Mount: `src/app.js:1553` (`/projects`) + `src/app.js:1578` (runtime build side)
- Sub-app entry: `digit2ai-projects/src/index.js`
- Auth (no tenant boundary): `digit2ai-projects/src/middleware/auth.js`
- Architect pipeline (build+deploy): `digit2ai-projects/src/services/architectPipeline.js`
- Schema (workspace_id already present): `digit2ai-projects/migrations/001_schema.sql`
- Command center (client-15 scoped): `src/routes/projects-bridge.js`
- Find all hardcoded scoping to fix: `grep -rnE "workspace_id[ ]*[:=][ ]*1\b" digit2ai-projects/src/`
