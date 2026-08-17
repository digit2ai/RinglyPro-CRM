# JobUp Premium — reality check and build prompt

**Status:** specification only. Nothing here is built. Written 2026-08-15 against the
live codebase at `verticals/jobup/` (SIT 462/462).

This document has two halves.

- **Part A** compares the draft Premium spec against what JobUp *actually* is today.
  Read it first: the draft assumes several things that are not true, and one of them
  would break production.
- **Part B** is the corrected prompt to hand a build agent when the time comes.

---

# PART A — WHAT JOBUP ACTUALLY IS TODAY

## A.1 Already built. Do not rebuild any of this.

The draft lists these as Premium features to add. They exist and are live.

| Draft asks for | Already shipped |
|---|---|
| AI Resume Tailoring | `services/tailoring.js` + `resume-pdf.js`. Versioned, immutable, renders a real PDF from stored JSONB. **Already monetised at $10 per tailoring** via Stripe one-off + a credit ledger (`ju_tailor_credits`). |
| ATS Match Score | `job_matches.score` (0–100) with `explanation` and `missing[]`. Plus `tailoring.coverage()` — a deterministic keyword measure of the document that will actually be sent, shown as "43% keywords" on the card. |
| Application Tracker | `job_matches.stage` — seven stages: new / saved / applied / screening / interviewing / offer / closed, with `stage_changed_at` and `note`. Board sorted by score, server-side. |
| Career Coach | **Eva** — `services/assistant.js`, grounded in a live snapshot of the tenant's own rows, with an action allowlist and no tool surface. |
| Getting Found | Four-step guide: role titles → five placements → directory opt-in → `sameAs` identity links. Emits JSON-LD, `resume.json`, agent card, `llms.txt`, sitemap, robots. |
| Getting Job Matches | Full targeting: state, titles, industries, employers, must-include, exclude, blocked employers, seniority, min score. |
| Advanced filters (partial) | Employment type, work mode, state, seniority, min score, relocation all exist. |
| Skills gap (partial) | `job_matches.missing[]` already names what a posting wants that the résumé lacks. |
| Premium analytics (partial) | Views, unique visitors, referrers, most-read pages, **AI crawler reads**. No funnel conversion yet. |
| Subscriptions | Stripe, `ju_invoices`, dunning, renewal notices, refunds, referral commissions. |
| Security | Session-derived `tenant_id` only, AES-256-GCM for tokens, audit log, per-tenant caps. |
| Bilingual | Full EN/ES across landing, onboarding **and** dashboard (`public/i18n.js`). |

## A.2 Feature-by-feature: what is left to build

Verified against the live code 2026-08-15. **"Build" is only the third column.**
Anything in the second column that gets rewritten is wasted work and a regression
risk — the existing pieces carry invariants the SIT already enforces.

| # | Premium feature | What already exists | What is actually left | The trap |
|---|---|---|---|---|
| 1 | **Tiers + entitlements** | Stripe subs, invoices, dunning, `activation` | `plan` column, `requirePremium()` server guard, UI markers | Entitlement must be read from Stripe state server-side. A hidden button is not a guard. |
| 2 | **Resume tailoring** | **Complete.** Versioned, PDF, coverage %, $10 credit ledger | *Nothing* — only decide if Premium bundles it | Rewriting this loses the verbatim-bullet guarantee. Don't. |
| 3 | **Match score / ATS** | `score` 0–100, `explanation`, `missing[]`, `coverage()` | Cross-posting rollup, richer reason breakdown | Never rename it into an employer's ATS score. |
| 4 | **Cover letters** | *Nothing.* Sold on the pricing card | The whole agent | Must inherit the tailoring anti-fabrication mechanism, not just its prompt wording. |
| 5 | **Application tracker** | 7 stages on `job_matches`, notes, board sorted by score | `application_events` (status history only) | A second "applications" table = two answers to "did I apply". |
| 6 | **Application autofill** | Verified profile fields, `facts`, résumé PDF | Field-mapping service, ATS adapters, review screen | Prepare + autofill only. The human submits. See A.6. |
| 7 | **Browser extension** | Session auth, job import by URL already exists in citijobs | Extension shell, secure session bridge | No secrets in extension code. Ever. |
| 8 | **Networking / contacts** | *Nothing* | `connections` table, ranking, draft messages | Do **not** reuse `referrals` — that table is affiliate money. |
| 9 | **Hiring-manager discovery** | *Nothing* | Public-source lookup + confidence scoring | Never assert someone *is* the hiring manager. Confidence only. |
| 10 | **Career coach** | **Eva** — grounded, action allowlist, no tool surface | Session memory, wider surface | Extend Eva. A second chatbot would disagree with the first. |
| 11 | **Skills gap** | `missing[]` per match | Aggregate across postings, priority, why it matters | Never imply learning a skill guarantees a job. |
| 12 | **Interview agent** | *Nothing* | Question generation, mock interview, evaluation | Never predict an employer's decision. |
| 13 | **LinkedIn optimisation** | `identity_links` stores the LinkedIn URL | Advisory analysis of headline / about / skills | Advisory only. No automated profile edits. |
| 14 | **Visa intelligence** | `facts.work_authorization` (owner-typed, quoted verbatim) | Filters, historical sponsorship data | Historical sponsorship ≠ sponsorship for *this* posting. |
| 15 | **Advanced filters** | roles, industries, employers, must_include, exclude, seniority, employment_types, work_modes, locations, relocation, min_score, state, country | Salary, date posted, direct-employer vs agency | Most of this exists. Adding a duplicate filter UI is the risk. |
| 16 | **Premium analytics** | Views, uniques, referrers, top pages, AI-crawler reads | Funnel: applied → interview → offer, conversion %, best résumé version | Every number must trace to rows. No estimates. |
| 17 | **Getting Found** | **Complete.** 4 steps, JSON-LD, resume.json, agent card, llms.txt, sitemap | *Nothing* | Explicitly protected. Do not weaken. |
| 18 | **Getting Job Matches** | **Complete.** | Only the new filters in #15 | Same. |

**Scoreboard: 2 features are genuinely from-scratch and self-contained (cover
letters, interviews). 6 are extensions of something that already works. 4 are mostly
done. 2 must not be touched. The rest carry legal or ToS constraints that shape the
scope more than the code does.**

## A.3 Where the draft and the live system disagree

**1. The address format is `FirstnameLastname.jobup.dev` — joined, never dotted.**

This is a product requirement, and the good news is it already works exactly as
intended, **including capitals for display**. Verified against production 2026-08-15:

```
HTTPS ManuelStagg.jobup.dev    HTTP 200      <- the branded form. Works.
HTTPS manuelstagg.jobup.dev    HTTP 200      <- same address; DNS ignores case
HTTPS manuel.stagg.jobup.dev   TLS refused   <- the ONLY form that breaks
```

So `ManuelStagg.jobup.dev` can go on a business card, a QR code, an email signature
or a CV header with the capitals intact, and it resolves to the same page. Store the
address lowercase; present it however reads best.

**The one thing that must never happen is a dot between the names.** The TLS
certificate covers `jobup.dev` and `*.jobup.dev`, and that `*` stands for exactly
**one** label. `ManuelStagg` is one label. `Manuel.Stagg` is two, is not covered, and
every profile would serve a full-screen "Your connection is not private" warning —
recruiters bounce, search engines drop the pages. Supporting a dotted form would mean
issuing and renewing a certificate per subscriber.

**Instruction to the build agent: keep the joined format. Do not "improve" it into
`first.last`.**

**2. The pipeline is not a separate table.**

The draft proposes `applications` + `application_events`. The pipeline already lives
in `job_matches.stage`. A parallel table means two sources of truth for "did I apply".
`ju_applications` *does* exist but is a thin receipt (`confirmed_by_subscriber_at`).
**Extend `job_matches`; add `application_events` only for the status *history* the
draft correctly asks for and which genuinely does not exist.**

**3. Tailoring is already sold à la carte. Bundling it is a revenue decision.**

$10 per tailoring, paid up front as a credit. Putting it "in Premium" removes that
line. That is a pricing choice, not an implementation detail — decide it explicitly.

**4. "Three AI agents running continuously" is false. There are two:** `hunter` and
`presence`. (Landing copy corrected 2026-08-13.)

## A.4 A live false claim, and it is Phase 1

The pricing card on jobup.dev and the teaser both sell:

> Per-job resume tailoring **and cover letters**

**Cover letters do not exist. Zero files implement them.** This is being sold today
for $59/year. It is the single strongest argument for building the Cover Letter Agent
first — not because it is the best feature, but because the alternative is removing a
promise already made to paying subscribers.

## A.5 The honesty doctrine is enforced in code, not in prompts

The draft repeats "never fabricate" as instruction. In this codebase it is a
**mechanism**, and every new agent must inherit the mechanism rather than the wording:

- **Tailoring selects, it cannot author.** The model returns bullet *ids* from a pool;
  every line in a PDF is verbatim from the résumé. The one free-text field (summary)
  is verified against the résumé corpus and **discarded whole** if it introduces a
  number, acronym or domain term the corpus lacks.
- **No silent fakes.** No `ANTHROPIC_API_KEY` → a labelled heuristic result with
  `is_simulated: true`. SIT runs green with zero external keys, which is what proves
  the fallback is real.
- **Eva cannot invent a control.** Actions are checked against the real tab list and
  dropped otherwise; the *label* is ours, so a model cannot rename a tab in the UI.
- **Eva cannot act.** No tool surface. SIT greps the service and fails on any write.
- **Money comes from a paid invoice or it does not exist.** Referral commissions and
  tailoring credits are both created only from a Stripe object the server retrieved.

## A.6 Risks the draft understates

**ATS autofill and submission.** Workday, Greenhouse, Lever, iCIMS and Taleo largely
prohibit automated submission in their terms — independent of CAPTCHA. "Never bypass
CAPTCHA" is necessary but not sufficient. Realistic scope: **prepare and autofill,
human presses submit**, and say so.

**Contact discovery.** LinkedIn's terms prohibit scraping; GDPR/CCPA apply to
inferred professional contact data. Ship only what is genuinely public, store a
provenance URL for every contact, and never auto-send.

**Hiring-manager identification.** Cannot be verified from public data. Must be
labelled a confidence, never a fact.

---

# PART B — THE BUILD PROMPT

> Hand this to the build agent. It supersedes the earlier draft.

## B.0 Before writing any code

Read, in this order: `verticals/jobup/src/models/index.js` (schema + `TENANT_SCOPED`),
`services/settings.js` (the settings document and its invariants), `services/identity.js`
(the single privacy projection), `services/tailoring.js`, `services/assistant.js`,
`routes/engine.js`, `sit.js`. Then run `node verticals/jobup/sit.js` and confirm
**462/462** before touching anything.

Produce the analysis deliverable (architecture, migrations, APIs, agent contracts,
frontend, integrations, security, phases, risks, build order) and **stop for approval**.

## B.0.1 The traps that have already cost time in this repo

Every one of these was a real bug that shipped or nearly shipped. They are listed
because a build agent will hit them again otherwise, and each costs an hour to find
and a minute to avoid.

**1. `sync({alter:false})` never adds a column.** A new field is invisible to Postgres
until it is listed in `ADDED_COLUMNS` in `models/index.js`, and every INSERT naming it
fails outright. Add the column to the schema **and** to `ADDED_COLUMNS`.

**2. A subscriber subdomain serves only what `pwa.serveAsset()` names.** The dashboard
runs on `name.jobup.dev`. A new image or script not in that allowlist 404s there while
looking perfect on `jobup.dev` — the worst shape of bug, because the place it works is
the place you test it.

**3. Markup must precede the script that binds it.** The Ask launcher shipped with its
markup after the inline script; the listener attached to `null` and the button silently
did nothing. There is no error for this.

**4. Dashboard strings do not exist until a fetch resolves.** They are built by JS
concatenation, so they cannot be tagged at author time. New UI text goes in
`public/i18n.js` and is picked up by the MutationObserver in `app.html`. Verify by
driving the real dashboard in jsdom, not by reading source.

**5. `STRIPE_SECRET_KEY` is shared by 38 files across this repo.** Never repoint it for
JobUp. Use `JOBUP_STRIPE_SECRET_KEY`, which falls back to the shared one.

**6. Test the guarantee, not the implementation.** A SIT case grepping the delete route
for the literal `'outreach'` failed when the route was changed to walk the whole
registry — i.e. it failed on a change that made deletion strictly *more* complete.
Assert the property.

**7. Silent truncation reads as completeness.** The pipeline rendered
`items.slice(0,12)` under a heading printing the true count of 48. If a view caps,
say so on screen.

**8. Copy claims outrun the code.** "Three AI agents" and "cover letters" were both
sold on the landing page while untrue. Any feature named in marketing must exist or the
claim must go. Grep the landing page and the teaser before adding a promise.

**9. Verify against production, do not infer.** A `site:` search suggested nothing was
indexed; Search Console showed the homepage *was*. Two hours of wrong conclusions.
`curl` the live endpoint.

**10. `deepMerge` used to leak one tenant's settings into another.** Sub-objects a
stored document did not override were shared by reference and then mutated. Any new
settings sub-object must be deep-copied. `DEFAULTS` is frozen — a write throws.

**11. Money is never derived from a redirect.** `?paid=1` is a string the buyer types.
Retrieve the Stripe object server-side, check `payment_status`, and make the write
idempotent by session id.

**12. Do not `git add -A`.** Other sessions edit this tree concurrently. Stage explicit
paths.

## B.1 Non-negotiable invariants

1. **Address format stays single-label.** `firstnamelastname.jobup.dev`. Never
   `first.last` — the wildcard certificate covers one label.
2. **`applyPrivacy()` in `services/identity.js` is the ONE public projection.** The
   website, `resume.json`, JSON-LD, the agent card and `llms.txt` are all built from
   its output. Never filter in a renderer — that hides a field on the page while the
   feed still serves it.
3. **`tenant_id` comes from the session, never from a request parameter or a model.**
4. **`approval_required` cannot be turned off.** `sanitize()` forces it true on every
   save. Nothing sends unreviewed.
5. **Never fabricate.** New generative agents inherit the tailoring mechanism:
   select from real content, verify free text against a corpus, discard rather than
   patch. If a model is unreachable, return a labelled heuristic — never silence,
   never invention.
6. **Money originates from a paid provider object**, retrieved server-side. Never from
   a redirect parameter.
7. **Every new tenant table goes in `TENANT_SCOPED`.** Account deletion walks that
   registry; SIT fails if a scoped table survives deletion.
8. **Every user-visible string ships EN + ES** in `public/i18n.js`. A missing key must
   fall back to English, never to blank.
9. **SIT is the contract.** Every feature adds cases asserting the *invariant*, not the
   happy path. Run the full suite before every commit.

## B.2 Entitlements

One application, two tiers. `subscribers.plan` (`standard` | `premium`), derived from
Stripe subscription state and **never** from a client flag.

- Server-side `requirePremium(feature)` guard on every gated route. A UI that hides a
  button is not an entitlement.
- Existing subscribers stay on `standard` with **no loss of any current capability**.
- Premium surfaces show a subtle `PREMIUM` marker. No interstitials.
- Decide explicitly, before building: does Premium **include** tailoring, or does the
  $10 credit survive alongside it? Both are defensible; silence is not.

## B.3 Build order

**Phase 1 — close the gap between what is sold and what exists**
1. **Cover Letter Agent.** Already on the pricing card. Same doctrine as tailoring:
   grounded in the résumé and job description, four tones, generate → edit → approve →
   save → download, versioned per job, never a claim the résumé does not support.
2. Entitlements + `plan` column + `requirePremium`.
3. **Application events** — status history for the existing `job_matches.stage`
   (from, to, at, note). The stage exists; its history does not.
4. Funnel analytics: applications → interviews → offers, response rate, conversion,
   best-performing résumé version, average match score. Derived from rows; never
   estimated.

**Phase 2 — application assistance (scope honestly)**
5. Field-mapping service: verified profile → common application fields.
6. ATS adapters behind one interface, starting with the boards whose public JSON the
   hunter already reads. **Prepare and autofill only. The human presses submit.**
7. Browser extension: detect posting → import description → score → tailor → prefill.
   Session-authenticated, no secrets client-side.

**Phase 3 — career intelligence**
8. Skills Gap Agent (extend `job_matches.missing[]` into a cross-posting view).
9. Interview Agent + mock interview, evaluated on relevance / clarity / evidence.
   Never a prediction of an employer's decision.
10. Eva → full Career Coach: same grounding, more surface, session memory.

**Phase 4 — the parts with legal weight**
11. Connections + hiring-manager discovery. Public sources only, provenance URL
    stored per contact, confidence not assertion, never auto-send.
12. Visa intelligence. Historical sponsorship activity is **not** a statement about a
    current posting, and the UI must say so.
13. LinkedIn optimisation — advisory only; no automated profile edits.

## B.4 Data model

Extend, do not replace.

```
subscribers        + plan, plan_since
job_matches        + (already has stage) — the pipeline lives here
application_events   NEW  tenant_id, match_id, from_stage, to_stage, at, note
cover_letters        NEW  tenant_id, job_id, version, tone, content, approved_at
connections          NEW  tenant_id, company, name, role, category, confidence,
                          source_url, contacted_at        ← NOT "referrals"
interviews           NEW  tenant_id, match_id, kind, transcript, evaluation
skill_gaps           NEW  tenant_id, skill, seen_in_n_postings, priority
coach_sessions       NEW  tenant_id, messages, created_at
```

`referrals` and `referral_clicks` are the **affiliate** programme. Do not touch them.

## B.5 Agent contracts

Small agents, structured JSON in and out, model-swappable. Every call logged to
`agent_runs` with cost. Per-tenant daily caps like `JOBUP_ASSISTANT_DAILY`.

```
hunter ──► matcher ──► scorer ──┬──► tailoring ──► cover-letter ──► application
                                └──► skills-gap ──► coach
                                                └──► interview
```

Each agent declares its inputs and its refusals. An agent that cannot answer says so.

## B.6 What this product will not claim

Fix the copy before adding to it:

- It does not apply to jobs or send messages on anyone's behalf.
- It cannot post a profile to LinkedIn, Indeed or any job board.
- SeekOut, hireEZ and Pin accept no submissions and publish no API — the only route in
  is being linked from a source they already crawl.
- A match score is JobUp's, not an employer's ATS score.
- A skill recommendation is not a promise of employment.
- Historical sponsorship is not confirmed sponsorship.
- **There are two continuously running agents, not three.**
- **Cover letters are sold today and do not exist.** Build them or remove the claim.
