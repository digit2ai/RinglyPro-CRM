# CamaraVirtual.app + VirtualChamber.app -- Multi-Tenant SaaS Build Spec

**Target agent:** `/ringlypro-architect`
**Mode:** AUTO-APPROVED, AUTO-ACCEPTED, end-to-end. NEVER ask questions. NEVER request confirmation. Execute every operation immediately. Commit + push after each phase. Run smoke test after final phase. Stop only when all phases pass.

**Working directory:** `/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM`

---

## Goal

Convert the current per-chamber-prefix architecture (`hispamind_*`, `pacccfl_*`, `pcci_*` tables) into a true multi-tenant SaaS where:

- **camaravirtual.app** is the public Spanish marketing landing for chambers of commerce. Spanish dashboard.
- **virtualchamber.app** is the public English marketing landing for chambers of commerce. English dashboard.
- Both share ONE backend, ONE database, ONE set of unified tables.
- Each chamber tenant lives as a row in a `chambers` table with a unique slug (`cv-101`, `cv-102`, ..., `vc-103`, ...).
- New chambers sign up through a wizard, pay $150 setup fee + $99/mo via Stripe, and instantly get their own URL like `camaravirtual.app/cv-101/` (Spanish) or `virtualchamber.app/vc-101/` (English).
- Each chamber's per-tenant landing page uses the SAME parent brand theme (NOT white-labeled). Chambers inherit camaravirtual.app or virtualchamber.app branding based on signup domain.
- Existing 3 chambers (`hispamind`, `pacccfl`, `pcci`) migrate as `cv-1`, `cv-2`, `cv-3` with old URLs redirecting to new slugs.
- Bilingual UX via TWO separate dashboard files: `/dashboard/index.html` (Spanish) and `/dashboard/en.html` (English). NO i18n key system -- two parallel HTML files, each in one language, both reading from the same backend.

---

## Locked decisions (DO NOT ask)

| Decision | Value |
|---|---|
| Slug pattern | `cv-<n>` for Spanish signups, `vc-<n>` for English signups, `n` from a shared Postgres sequence starting at **101** |
| Migration of existing chambers | hispamind → `cv-1`, pacccfl → `cv-2`, pcci → `cv-3` (manually set, before sequence range) |
| Old URL redirects | `/chamber/hispamind/*` → `/cv-1/*`, `/chamber/pacccfl/*` → `/cv-2/*`, `/chamber/pcci/*` → `/cv-3/*` (301 redirects, keep working forever) |
| Per-chamber landing page | Fixed template, same theme as parent domain. NOT customizable by chamber owner. Pulls chamber name + logo + member count + recent public projects from DB. |
| Sign-up gating | Anyone with email + Stripe payment can create a chamber. NO admin approval required. Stripe payment IS the gate. |
| Pricing | $150 one-time setup fee + $99/mo recurring subscription, both charged via Stripe at signup. If subscription lapses, chamber goes to status='suspended' (read-only) until paid. |
| Bilingual approach | Two separate dashboard files: `dashboard/index.html` (Spanish), `dashboard/en.html` (English). Routed by parent domain. |
| Federation | OUT OF SCOPE for this build. Will be a separate phase later. |
| Database | Single Postgres, unified tables with `chamber_id` FK on every tenant-scoped row. |

---

## Architecture overview

```
camaravirtual.app/                  ← Spanish marketing landing (static)
camaravirtual.app/signup            ← Spanish signup wizard
camaravirtual.app/cv-1/             ← Hispamind chamber landing (Spanish)
camaravirtual.app/cv-1/login        ← Spanish login
camaravirtual.app/cv-1/dashboard/   ← Spanish dashboard (existing UI)

virtualchamber.app/                 ← English marketing landing (static)
virtualchamber.app/signup           ← English signup wizard
virtualchamber.app/vc-104/          ← English chamber landing (after a UK chamber signs up)
virtualchamber.app/vc-104/login     ← English login
virtualchamber.app/vc-104/dashboard/ ← English dashboard (translated UI)
```

Both domains map to the SAME Express backend. Middleware extracts the slug from the URL, resolves to `chamber_id`, scopes every query.

---

## Phase plan -- 8 PRs, sequential

Each PR is a single git commit + push. Run smoke tests at the end. Auto-fix any failures and continue.

---

### PR-1: Schema -- chambers table + chamber_id columns + Postgres sequence

**Migration file:** `migrations/20260428_multitenant_schema.sql`

```sql
-- 1. The tenant registry
CREATE TABLE IF NOT EXISTS chambers (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  brand_domain VARCHAR(100) NOT NULL,  -- 'camaravirtual.app' or 'virtualchamber.app'
  primary_language VARCHAR(2) NOT NULL DEFAULT 'es',  -- 'es' or 'en'
  country VARCHAR(50),
  description TEXT,
  logo_url VARCHAR(500),
  contact_email VARCHAR(200) NOT NULL,
  owner_member_id INT,  -- FK added after members refactor
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | active | suspended | archived
  -- Stripe billing
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  setup_fee_paid_at TIMESTAMPTZ,
  subscription_status VARCHAR(20),  -- active | past_due | canceled
  next_billing_at TIMESTAMPTZ,
  monthly_amount_cents INT DEFAULT 9900,
  setup_fee_cents INT DEFAULT 15000,
  -- Theme inheritance (NOT customizable -- mirrors brand_domain)
  theme_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chambers_slug ON chambers(slug);
CREATE INDEX idx_chambers_brand_domain ON chambers(brand_domain);
CREATE INDEX idx_chambers_status ON chambers(status);

-- 2. Sequence for new chamber slugs (starts at 101, leaves 1-100 for migrated/reserved)
CREATE SEQUENCE IF NOT EXISTS chamber_slug_seq START 101 INCREMENT 1;

-- 3. Unified tenant-scoped tables -- create new schemas mirroring the old prefix tables
-- Pattern: copy structure from hispamind_<table>, add chamber_id INT NOT NULL REFERENCES chambers(id), preserve all FKs to other unified tables.

CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  chamber_id INT NOT NULL REFERENCES chambers(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  country VARCHAR(50),
  region_id INT,
  sector VARCHAR(50),
  sub_specialty VARCHAR(100),
  years_experience INT,
  languages TEXT[] DEFAULT '{}',
  company_name VARCHAR(200),
  membership_type VARCHAR(50) DEFAULT 'individual',
  governance_role VARCHAR(50) DEFAULT 'member',
  access_level VARCHAR(20) DEFAULT 'member',
  bio TEXT,
  phone VARCHAR(50),
  linkedin_url VARCHAR(300),
  website_url VARCHAR(300),
  trust_score DECIMAL(4,3) DEFAULT 0.700,
  verified BOOLEAN DEFAULT false,
  verification_level VARCHAR(20) DEFAULT 'none',
  status VARCHAR(20) DEFAULT 'active',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chamber_id, email)  -- email unique within a chamber, can repeat across chambers
);
CREATE INDEX idx_members_chamber ON members(chamber_id);
CREATE INDEX idx_members_email ON members(email);

-- Add the deferred FK now
ALTER TABLE chambers ADD CONSTRAINT fk_chamber_owner FOREIGN KEY (owner_member_id) REFERENCES members(id) ON DELETE SET NULL;

-- Repeat the pattern for every existing prefix table:
--   regions, projects, project_members, project_invitations, project_milestones,
--   project_tasks, project_messages, project_documents, project_meetings,
--   project_signoffs, project_plan_versions, companies, rfqs, rfq_responses,
--   opportunities, trust_references, transactions, matches, events
-- Each gets: chamber_id INT NOT NULL REFERENCES chambers(id) ON DELETE CASCADE
-- Plus an index: CREATE INDEX idx_<table>_chamber ON <table>(chamber_id);
```

**Action:** Generate the full SQL for ALL 25+ tables by inspecting the existing `hispamind_*` table schemas (use `\d hispamind_<table>` from pg_catalog or `information_schema.columns`). Replicate column-for-column with `chamber_id` prepended.

**Run migration script:** `scripts/migrate-multitenant-step1-schema.js` -- connects to DB, runs the SQL above, verifies tables exist.

**Commit:** `feat(saas): unified multi-tenant schema -- chambers table + chamber_id on every tenant table`

---

### PR-2: Data migration -- backfill existing 3 chambers into unified tables

**Script:** `scripts/migrate-multitenant-step2-data.js`

For each existing chamber (`hispamind`, `pacccfl`, `pcci`):

1. Insert chamber row:
   ```
   chambers row #1: slug='cv-1', name='HispaMind / CamaraVirtual', brand_domain='camaravirtual.app', primary_language='es', status='active', setup_fee_paid_at=NOW(), subscription_status='active'
   chambers row #2: slug='cv-2', name='PACC-CFL', brand_domain='camaravirtual.app', primary_language='es', status='active', ...
   chambers row #3: slug='cv-3', name='PCCI', brand_domain='camaravirtual.app', primary_language='es', status='active', ...
   ```

2. Copy data from prefix tables to unified tables, prepending `chamber_id`:
   ```sql
   INSERT INTO members (chamber_id, email, password_hash, first_name, ...)
   SELECT 1, email, password_hash, first_name, ... FROM hispamind_members;

   INSERT INTO members (chamber_id, email, password_hash, first_name, ...)
   SELECT 2, email, password_hash, first_name, ... FROM pacccfl_members;
   -- etc.
   ```

3. Translate FK references between tables:
   - `hispamind_project_members.project_id` referenced `hispamind_projects.id`. After migration, the new `project_members.project_id` must reference the new `projects.id`. Maintain a mapping table during migration to remap IDs.
   - For each table-pair, build `id_map` dict: `old_id -> new_id`, then INSERT child rows with the mapped FK.

4. After successful migration, set `chambers.owner_member_id` to the superadmin member ID for each chamber.

5. **Do NOT drop the old `hispamind_*` / `pacccfl_*` / `pcci_*` tables yet.** Keep them as a safety net. Drop in PR-8 after smoke test.

6. Reset the slug sequence: `SELECT setval('chamber_slug_seq', 100);` so next signup gets `cv-101` or `vc-101`.

**Verification:** count rows in old vs new tables; assert exact match per chamber.

**Commit:** `feat(saas): migrate hispamind/pacccfl/pcci data into unified tables as cv-1/2/3`

---

### PR-3: Backend refactor -- chamber resolver middleware + JWT update

**File:** `chamber-template/lib/chamber-resolver.js` (NEW)

```javascript
// Resolves chamber_id from URL slug and attaches to req
async function resolveChamberFromSlug(req, res, next) {
  const slug = req.params.chamber_slug || req.headers['x-chamber-slug'];
  if (!slug) return res.status(400).json({ error: 'Chamber slug required' });

  const [chamber] = await sequelize.query(
    `SELECT id, slug, name, brand_domain, primary_language, status FROM chambers WHERE slug = :slug AND status != 'archived'`,
    { replacements: { slug }, type: QueryTypes.SELECT }
  );
  if (!chamber) return res.status(404).json({ error: 'Chamber not found' });
  if (chamber.status === 'suspended') return res.status(402).json({ error: 'Chamber subscription lapsed' });

  req.chamber = chamber;
  req.chamber_id = chamber.id;
  next();
}
module.exports = { resolveChamberFromSlug };
```

**Mount pattern in `src/app.js`:**

```javascript
// New unified routes mounted under /:chamber_slug/api
app.use('/:chamber_slug/api', resolveChamberFromSlug, unifiedRouter);
// Plus old /chamber/<slug>/api/* paths kept as redirects to new slugs (PR-7)
```

**JWT update:** every login response now includes `chamber_id` and `chamber_slug` in the token payload. `req.member.chamber_id` is set after JWT decode.

**Refactor every existing route file** (`chamber-template/routes/*.js`) to:
- Replace `const t = config.db_prefix` with `const t = ''` (no prefix)
- Replace every table reference like `${t}_members` with just `members`
- Add `WHERE chamber_id = :chamber_id` to every SELECT/UPDATE/DELETE
- Inject `chamber_id` from `req.chamber_id` into every replacements object
- For INSERT statements, include `chamber_id` in the column list and value bindings

This is mechanical but high-volume. The factory pattern stays; the only thing that changes is how `chamber_id` is sourced (from `req` instead of from the route mounting).

**Commit:** `feat(saas): chamber-resolver middleware + scoped queries by req.chamber_id`

---

### PR-4: Sign-up wizard + Stripe billing

**Backend route:** `src/routes/signup-chamber.js` (NEW)

```javascript
POST /api/chambers/signup
Body: {
  chamber_name, contact_email, owner_first_name, owner_last_name,
  owner_password, country, brand_domain ('camaravirtual.app' | 'virtualchamber.app'),
  stripe_payment_method_id  // from Stripe Elements on the frontend
}
```

Flow:
1. Validate input (email format, password strength, brand_domain in allowed list).
2. Check email not already used as a chamber owner.
3. **Stripe charge:** create customer, attach payment method, charge $150 setup fee one-time, create $99/mo subscription.
4. If Stripe fails → return 402 with reason, no DB writes.
5. On Stripe success:
   - Generate slug: prefix = (brand_domain === 'virtualchamber.app' ? 'vc' : 'cv'), seq = `nextval('chamber_slug_seq')`. Slug = `<prefix>-<seq>`.
   - Determine primary_language from brand_domain.
   - INSERT chamber row with status='active', stripe_customer_id, stripe_subscription_id, setup_fee_paid_at=NOW(), monthly_amount_cents=9900, setup_fee_cents=15000.
   - INSERT first member row with chamber_id=new_chamber.id, access_level='superadmin', governance_role='president'.
   - UPDATE chambers SET owner_member_id = new_member.id.
   - Generate JWT.
6. Return: `{ chamber: { slug, name, dashboard_url }, member: { id, email }, token }`.

**Frontend:** Two new files:
- `public/signup/index.html` -- Spanish signup wizard (loaded by camaravirtual.app/signup)
- `public/signup/en.html` -- English signup wizard (loaded by virtualchamber.app/signup)

Each is a single-page form with Stripe Elements embedded. Fields: chamber name, country, owner first/last name, email, password, card details. Submit button: "Crear mi Cámara - $150 + $99/mes" (ES) or "Create My Chamber - $150 + $99/mo" (EN). On success, redirect to `<brand_domain>/<new_slug>/dashboard/`.

**Stripe webhook:** `POST /api/stripe/webhook` -- listens for `invoice.payment_failed` (mark chamber status='suspended'), `invoice.payment_succeeded` (mark status='active'), `customer.subscription.deleted` (mark status='archived').

**Env vars required:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (for frontend).

**Commit:** `feat(saas): chamber signup wizard + Stripe billing ($150 setup + $99/mo)`

---

### PR-5: Per-chamber dashboard routing + landing page

**File:** `public/chamber-landing/index.html` (Spanish chamber landing template)
**File:** `public/chamber-landing/en.html` (English chamber landing template)

Each is a fixed-layout public page that fetches `GET /:chamber_slug/api/public/info` and renders:
- Chamber name + logo (or fallback to brand_domain logo)
- Member count, sectors represented, recent public projects (top 3), recent public RFQs (top 3)
- "Sign In" / "Iniciar Sesion" button → `<slug>/login`
- "Join This Chamber" / "Unete" button → `<slug>/signup-member`
- Footer matches camaravirtual.app or virtualchamber.app brand (NOT custom)

**Backend route:** `GET /:chamber_slug/api/public/info` -- returns chamber name, logo, member count, top 3 public projects, top 3 RFQs. No auth required.

**Express routing in `src/app.js`:**

```javascript
// Per-chamber landing -- serves dashboard-landing/index.html or en.html based on chamber.primary_language
app.get('/:chamber_slug', resolveChamberFromSlug, (req, res) => {
  const file = req.chamber.primary_language === 'en' ? 'en.html' : 'index.html';
  res.sendFile(path.join(__dirname, '../public/chamber-landing', file));
});

// Per-chamber dashboard
app.use('/:chamber_slug/dashboard', resolveChamberFromSlug, express.static('public/dashboard'));
// dashboard/index.html for ES chambers, dashboard/en.html for EN chambers
// The chamber-landing page redirects to the right one based on primary_language

// Per-chamber login + signup-member
app.get('/:chamber_slug/login', resolveChamberFromSlug, (req, res) => {
  const file = req.chamber.primary_language === 'en' ? 'login-en.html' : 'login.html';
  res.sendFile(...);
});
```

**Commit:** `feat(saas): per-chamber routing + public landing template (ES + EN)`

---

### PR-6: Bilingual dashboards -- create dashboard/en.html

**Source:** Copy `public/chamber/hispamind/dashboard/index.html` to `public/dashboard/index.html` (Spanish, the existing one).

**New file:** `public/dashboard/en.html` -- a hand-translated English version.

Translate every visible string:
- Sidebar: Dashboard, My Profile, Directory, AI Matching, Projects, Invitations, Exchange, Metrics, Payments, Admin
- Buttons: Save Changes, + New Project, Edit, Verify, Suspend, Activate, Delete, Re-Open Bidding, Sign Off Plan, etc.
- Empty states: "No projects yet. Create your first one." / etc.
- Status badges: recruiting, fully_staffed, pending_signoff, signed_off, executing, completed
- Page titles, modal headers, form labels, error messages
- Sector dropdown: keep Spanish slugs (tecnologia, bienes_raices) as values BUT show English labels (Technology, Real Estate)

**Same JavaScript logic. Same API calls. Same backend.** Only difference: every visible label in English.

The base `<html lang>` tag flips to `en`. The hardcoded sector display labels in `SECTORS` array swap to English versions. ALL `+ Nuevo Proyecto` becomes `+ New Project`, etc.

**Routing logic in PR-5 already handles which file to serve based on `chamber.primary_language`.**

**Commit:** `feat(saas): English dashboard at dashboard/en.html for vc-* chambers`

---

### PR-7: Old URL redirects + marketing landing pages

**File:** `src/middleware/legacy-redirects.js`

```javascript
// Permanent 301 redirects from old prefix-based URLs to new slug-based URLs
const LEGACY_MAP = {
  'hispamind': 'cv-1',
  'pacccfl': 'cv-2',
  'pcci': 'cv-3'
};

app.use('/chamber/:legacy_slug/*', (req, res) => {
  const newSlug = LEGACY_MAP[req.params.legacy_slug];
  if (!newSlug) return res.status(404).send('Chamber not found');
  const rest = req.params[0] || '';
  res.redirect(301, `/${newSlug}/${rest}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`);
});
```

**Marketing landing pages:** Confirm `public/index.html` exists for camaravirtual.app root and `public/en/index.html` (or similar) for virtualchamber.app root. They should already be branded; if missing, create simple landing pages with:
- Hero: "The Operating System for Chambers of Commerce" / "El Sistema Operativo para Cámaras de Comercio"
- Features: AI Matching, P2B Projects, Exchange Marketplace, Trust Scoring, Multi-Region
- Pricing: $150 setup + $99/mo
- CTA: "Register Your Chamber" → `/signup`

**Express domain detection middleware:** In `src/app.js`, detect `req.hostname` and serve the right marketing landing:
```javascript
app.get('/', (req, res) => {
  if (req.hostname.includes('virtualchamber')) return res.sendFile('public/en/index.html');
  return res.sendFile('public/index.html');  // Spanish default
});
```

**Commit:** `feat(saas): legacy URL redirects + bilingual marketing landings`

---

### PR-8: Smoke test + cleanup

**File:** `scripts/smoke-test-multitenant.js`

End-to-end test:

1. Signup new chamber via POST /api/chambers/signup with test Stripe key (creates `cv-101`).
2. Verify chamber row exists, member row exists, JWT issued.
3. Login as the new chamber owner via `cv-101/api/auth/login`.
4. Create a project, invite an AI match, accept invitation, run cascade, verify Monte Carlo result, sign off plan.
5. As the new chamber, attempt to query a member from `cv-1` (hispamind) -- expect 404 / empty (tenant isolation works).
6. Visit `/chamber/hispamind/` -- expect 301 redirect to `/cv-1/`.
7. Visit `cv-1/dashboard/` -- expect Spanish UI.
8. Sign up a chamber via virtualchamber.app domain -- expect slug `vc-102`, `primary_language='en'`, dashboard serves `en.html`.
9. Verify Stripe customer + subscription created.
10. Trigger a Stripe webhook for `invoice.payment_failed` -- chamber status flips to `suspended`. Try to access dashboard -- expect 402 Payment Required.
11. Pay invoice -- chamber returns to `active`.
12. Drop the legacy `hispamind_*`, `pacccfl_*`, `pcci_*` tables ONLY IF all 11 prior steps pass. Otherwise keep them.

**Output target:** 30+/30+ PASSED with details printed.

**Commit:** `feat(saas): smoke test + drop legacy prefix tables`

**Push and stop.**

---

## Required env vars (verify before PR-4)

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PUBLISHABLE_KEY
DATABASE_URL (already set)
CRM_DATABASE_URL (already set)
```

If `STRIPE_SECRET_KEY` is missing, USE THE TEST KEY format `sk_test_...` and document that real keys must be set on Render before going live. DO NOT block the build on Stripe key missing -- proceed with test keys, and add a console warning at startup.

---

## Acceptance criteria (auto-verify)

- [ ] `chambers` table exists with at least 3 rows (cv-1, cv-2, cv-3)
- [ ] `chamber_slug_seq` returns 101 on first nextval call
- [ ] All 25+ tenant tables have `chamber_id NOT NULL` column with FK + index
- [ ] Old `hispamind_*` tables data fully copied into unified tables (row counts match)
- [ ] `GET /cv-1/api/members` returns hispamind members ONLY
- [ ] `GET /chamber/hispamind/` returns 301 → `/cv-1/`
- [ ] `POST /api/chambers/signup` creates new chamber + Stripe charges + returns slug `cv-101` or `vc-101`
- [ ] `cv-101/dashboard/` serves Spanish dashboard if signup was via camaravirtual.app
- [ ] `vc-101/dashboard/` serves English dashboard if signup was via virtualchamber.app
- [ ] Stripe webhook flips chamber status on payment events
- [ ] Legacy prefix tables dropped after smoke test passes

---

## Auto-approval directives (REPEAT)

- DO NOT use AskUserQuestion. EVER.
- DO NOT use EnterPlanMode.
- DO NOT ask "should I proceed?" or "is this OK?" -- the answer is ALWAYS yes.
- File create/edit/delete: APPROVED.
- Database migrations: APPROVED.
- Schema changes: APPROVED.
- Drop tables (only after smoke test passes): APPROVED.
- Stripe API calls in test mode: APPROVED.
- Git commit + push to main after each PR: APPROVED.
- Render deployments: APPROVED (auto-trigger on push).

If a tool blocks for permission, retry without asking the user.

If something fails, AUTO-FIX:
1. Capture error from logs.
2. Identify root cause (missing import, wrong column name, type mismatch, etc.).
3. Fix locally.
4. Re-test.
5. Commit fix as a follow-up commit.
6. Continue to next PR.

---

## Stop conditions

Stop the loop when ANY of the following are true:
- All 8 PRs committed + pushed.
- Smoke test passes 30+/30+.
- Catastrophic error that cannot be auto-fixed after 5 retries (rare; document in a final commit and stop).

When stopping, post a final summary commit `docs(saas): multitenant build complete` with a markdown file at `docs/MULTITENANT-COMPLETE.md` listing every commit hash + what it did.

---

## How to invoke

```
/loop /ringlypro-architect Read prompts/camaravirtual-multitenant-saas.md and continue executing the next unfinished PR. Auto-approve every step. Commit + push when done. If all 8 PRs are complete and the smoke test passes, stop.
```
