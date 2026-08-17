# RoboNegotiate

Insider intelligence that turns robotic surgery contracts into savings.

A sourced, self-reconciling market and revenue model for a surgical robotics contract
advisory practice. Built for Greg Eriksen (project 142), who spent sixteen years as VP of
National Key Accounts at Intuitive Surgical and is deciding whether to leave and advise
IDNs on the other side of the table.

**Live:** `https://aiagent.ringlypro.com/surgical-robotics-contract-advisory-firm`
**Mounted by:** the `client-builds` auto-mount loop in `src/app.js`. No registration step.

---

## What it is

Five tabs, all computed from one model:

| Tab | What it answers |
|---|---|
| **Dashboard** | How big is the market, what does a client pay, what does year one look like, and what has to be true |
| **Market Sizing** | Spend by tier, per-IDN averages, spend split by contract category, and the provenance of every input |
| **Revenue Model** | The fee-on-savings chain per client, year by year to ten years, net contribution, capacity, and ranked sensitivity |
| **IDN Pipeline** | Named accounts with annualised spend and contract notes |
| **Watchouts** | Non-compete, trade secret, tortious interference, GPO competition, conflict of interest, vendor response, adoption timing |

---

## The four things that make this different from the teaser demo

Greg has already seen the teaser simulator at
`/projects/teaser/0e38e29f-8bd1-4436-99b3-0eb17d2ed356/simulator`. It was hand-authored
illustrative HTML, and it contradicted itself four ways. He negotiates two-and-a-half
billion dollar contracts for a living; he would have found all four. This build exists to
fix them, and each fix is enforced in code rather than in a review checklist.

**1. No number is written down.** Every currency figure, percentage and count on every
tab is returned by `lib/model.js`. `sit.js` greps `public/*.html` and fails the build on
any currency literal, digit-adjacent percentage, or magnitude suffix. The demo's dashboard
said year one was $4.2M while its own scenario table implied $14.4M; that class of defect
is now impossible rather than merely discouraged.

**2. Revenue is a ramp, not a multiplication.** The earlier sprint brief asserted
`11 National IDNs x $2.5B x 15% x 15%`, which claims a two-person startup captures one
hundred percent of every National IDN in the country in its first year. Revenue here is a
function of *active engagements* per year, built from arrivals, retention, a
fee-realisation lag and a multi-vendor adoption lag. `year5` is the sum of five different
years, and SIT asserts it is not five times `year1`.

**3. Total contract value is annualised before anything touches it.** Greg's intake says
the HealthTrust master contract was five years and roughly $2.5B. The simulator printed
that as HCA's *annual* spend, inflating the National tier and the whole market by about
five times on its largest line. Every spend figure carries `spend_is_tcv`; there is no
ambiguous "spend" field anywhere in the model.

**4. The market checks itself against a public anchor.** A total addressable market larger
than the entire worldwide revenue of the vendor whose contracts you propose to renegotiate
is not a market size. The model compares its own TAM to Intuitive's reported revenue and
reports the result. At the seeded defaults it reads `exceeds` at roughly 2.2x, which is
defensible only because the market is explicitly multi-vendor — and the app says exactly
that instead of printing the bigger number quietly.

---

## Provenance

Every seeded figure carries `{ value, unit, source, source_url, as_of, basis }`. SIT fails
the build on any registry entry missing a source or an as-of date.

`basis` is one of `public_filing`, `analyst_report`, `cms_data`, `client_stated`,
`derived`, `assumption`, or `user_input`. The first four count as sourced; `assumption`
renders amber; typing over an input flips it to `user_input` and drops it out of the
sourced count, so the Dashboard pill always reads honestly.

**Several tier totals are currently labelled `assumption`, on purpose.** They were carried
over from the teaser simulator and are not yet traced to a filing, a CMS extract or a
named analyst report. That is stated in the app, in the CSV export, and in the Watchouts
tab. Replacing them is the highest-value next task and needs no code change — only the
values and sources in `lib/benchmarks.js`.

---

## Running it

```bash
# The whole suite. Zero external keys, zero network, zero database.
node client-builds/surgical-robotics-contract-advisory-firm/sit.js
# -> 124/124 GREEN

# The model on its own, no server.
node -e "console.log(require('./client-builds/surgical-robotics-contract-advisory-firm/lib/model').project({}).cumulative)"
```

SIT unsets `DATABASE_URL` before requiring the app, deliberately: the suite must need
nothing external, and the in-memory fallback should be the path that gets exercised rather
than a branch nobody has run. **The Postgres path is therefore not covered by SIT** and is
named in its skipped list. It was verified separately against the dev database before
first deploy — schema creation, JSONB round-trip, single-use tokens, CSV off a stored row,
and index names all confirmed.

---

## Storage

**`DATABASE_URL`.** On production `CRM_DATABASE_URL` points at a *different* database, and
the client-builds convention in this repo is `DATABASE_URL`. The fallback to
`CRM_DATABASE_URL` in `models/index.js` exists only so a laptop configured with one of the
two still gets Postgres.

**No connection means no crash.** A missing URL or a failed handshake drops the store to
an in-memory implementation behind an identical interface. Routes never branch on storage
availability, `/health` reports which backend won, and the header pill in the UI says
"in-memory only" so nobody believes a scenario saved when it did not.

### Why the tables are `srcaf_` and not the full slug

Postgres truncates identifiers at 63 bytes. Sequelize builds index and constraint names by
appending to the table name, so
`surgical_robotics_contract_advisory_firm_scenarios_tenant_id_idx` is 64 bytes and
truncates — and two different indexes can truncate onto the same name. The mount path
keeps the long slug; only SQL identifiers shorten. Every index is named explicitly for the
same reason. Canonical DDL is in `migrations/001_init.sql`; the app also creates it
idempotently on boot.

Tables: `srcaf_scenarios`, `srcaf_magic_tokens`. Both `tenant_id NOT NULL` with a named
index. Every read filters on `tenant_id`, and a cross-tenant id resolves to 404 rather
than 403 — a 403 confirms the row exists.

---

## Access and auth

**THE APP IS PRIVATE. NOTHING IS PUBLICLY READABLE.**

It shipped with public reads, which was a defensible default for a public-benchmark
calculator and the wrong default for this artifact. The Watchouts tab alone names a
non-compete, a trade-secret boundary and a tortious-interference exposure for one named
person against one named employer. That is not a page to leave open on a guessable path.

`SRCAF_ACCESS_LEVEL` sets the posture:

| Level | Behaviour |
|---|---|
| `private` | **Default.** Nothing without a session, except liveness and the sign-in flow. |
| `public` | The previous behaviour: reads open, writes authenticated. |

The gate is a single middleware installed above every route **and above
`express.static`**, with an explicit allow-list. A gate applied per route is a gate someone
forgets to apply to the next route, and a gate applied to static separately misses the
file dropped into `public/` next month. SIT asserts the ordering by reading `index.js`.

Reachable with no session: `/health` (liveness only), `/login`, `/login.js`, `/app.css`,
and the sign-in endpoints. Everything else — the model, the benchmarks, the watchouts,
saved scenarios, the app shell, `app.js` — returns 401 to a JSON caller and redirects a
browser to the gate page.

### Two factors, because one of them is written on the project record

Sign-in requires **an allow-listed email AND the access code**. The magic link is returned
in the HTTP response, because `EMAIL_AUTOSEND_DISABLED` is on repo-wide and a flow that
assumed an email would arrive would authenticate nobody. That was tolerable when reads
were public. Behind a gate it *is* the gate — so returning the link to anyone who merely
knows the address would make the address the credential, and Greg's address is on the
project record. The code is what makes returning the link safe.

A wrong address and a wrong code produce the **same** status and the **same** message, so
the endpoint is not an oracle for which addresses are provisioned.

### It fails closed

With no `SRCAF_ACCESS_CODE` set, **no session can be created at all** — `/health` and the
gate page still answer, and the gate page says why. This is the rule the JobUp consoles
follow in this repo: unset means CLOSED, deliberately, rather than open under a password
published in this repository's own documentation. The cost is one env var before first
sign-in; the alternative is a live app anyone who has read this repo can walk into.

A code shorter than twelve characters, or one matching a password this repo publishes, is
reported as weak on `/health` and bannered on the gate page. **Reported, not blocked** —
refusing to boot would lock the owner out of their own model with no way back in.

### Other hardening

- Repeated failures from one source are throttled (10 per 15 minutes), and a correct code
  during a throttle window is still refused. This is per-process and Render may run more
  than one instance, so it raises the cost rather than eliminating the attack — the real
  defence is a long random code.
- The code is compared as a SHA-256 digest through `timingSafeEqual`, so the comparison is
  timing-safe and does not leak the real code's length.
- Every response carries `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, and a CSP with `frame-ancestors 'none'`. No CDN and no
  inline script, so the policy is strict without qualification.
- `/health` gives an anonymous caller liveness and the access level only. Storage backend,
  error strings and secret-configuration booleans are operational detail, and operational
  detail is reconnaissance when the app behind it is private.
- Tokens are single-use, expire in thirty minutes, and are never logged at any level.
  Greg's email is masked (`e***@yahoo.com`) before any console write.

---

## Export

`GET /api/v1/scenarios/:id/export.csv` returns the year-by-year projection **plus** an
assumptions block naming every input, its value, its basis and its source, plus the
reconciliation and what-has-to-be-true blocks. Opens directly in Excel and Google Sheets.

`print.css` gives a clean print-to-PDF of all five tabs with chrome hidden.

**Explicitly not shipped:** a formula-live `.xlsx` where cells recompute. The teaser
promised an "editable financial model"; the CSV plus the live app is the practical 95% of
that, and pretending otherwise would be the fifth unreconciled claim.

---

## API

| Method | Path | Auth |
|---|---|---|
| `GET` | `/health` | public |
| `GET` | `/api/v1/benchmarks` | public — defaults, provenance, spend components, anchors, watchouts |
| `GET` | `/api/v1/watchouts` | public |
| `GET\|POST` | `/api/v1/calculate` | public, stateless, persists nothing |
| `POST` | `/api/v1/auth/magic-link` | public — returns the verify URL |
| `GET` | `/api/v1/auth/verify?token=` | public, single-use |
| `GET` | `/api/v1/auth/me` | public |
| `POST` | `/api/v1/auth/logout` | public |
| `GET\|POST` | `/api/v1/scenarios` | JWT, tenant-scoped |
| `GET\|DELETE` | `/api/v1/scenarios/:id` | JWT, tenant-scoped |
| `GET` | `/api/v1/scenarios/:id/export.csv` | JWT, tenant-scoped |

Projections are always recomputed server-side on save, never accepted from the client.

---

## Environment variables

| Variable | Default | Effect |
|---|---|---|
| `SRCAF_ACCESS_CODE` | **none — CLOSED** | Required alongside an allow-listed email to create a session. Unset means no one can sign in, deliberately. Use 20+ random characters. |
| `SRCAF_ACCESS_LEVEL` | `private` | `private` gates everything; `public` restores open reads with authenticated writes. |
| `SRCAF_JWT_SECRET` | falls back to `JWT_SECRET` | Signs the session cookie and bearer token. **Set on prod** — unset on both means a known development secret, and `/health` reports `jwt_secret_configured:false`. |
| `SRCAF_ALLOWED_EMAILS` | `eriksen.greg@yahoo.com,mstagg@digit2ai.com` | Who may hold a session. The address alone is never sufficient; the access code is also required. |
| `SRCAF_TENANT_ID` | `1` | Tenant stamped on rows and sessions. |
| `DATABASE_URL` | — | Unset means in-memory scenarios; the whole app still works. |
| `EMAIL_AUTOSEND_DISABLED` | ON unless `0` | Read, not written, by this app. Governs whether the sign-in link is returned or emailed. |

---

## Base-path independence

Nothing user-facing hardcodes `/surgical-robotics-contract-advisory-firm`. The shell
carries a `{{BASE}}` token substituted from `req.baseUrl` at request time, so the same
files serve correctly here and on `robonegotiate.app` later. `express.static` is mounted
with `index:false` — left at the default it answers `GET /` with the raw HTML and ships
the un-substituted token to the browser.

---

## What is deferred

- Investor-ready PDF deck and executive-summary prose (content deliverable, not code)
- Live web-search research to replace the assumption-labelled tier totals
- Formula-live `.xlsx`
- A real contract-renewal-date feed for the Pipeline tab
- Multi-user collaboration
- The non-compete legal workflow — Greg's outside counsel, and the Watchouts tab says so
