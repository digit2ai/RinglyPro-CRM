# JobUp — Build Spec / Dev Prompt

**Product:** JobUp — an AI ecosystem dedicated to helping a person find a job.
**Domain:** `jobup.dev`
**Repo:** NEW, standalone. Not a folder inside `RinglyPro-CRM`.
**Price:** 97 USD per year, one tier. Every subscriber gets `firstnamelastname.jobup.dev`.
**Owner:** Digit2AI
**Timeline:** phased, weeks not months. v1 in approximately 4 weeks.

---

## 0. THE INSTRUCTION IN ONE PARAGRAPH

Clone the OrbUp funnel into a new standalone repo at `jobup.dev`, and swap the payload from "business project" to "career ecosystem." A visitor lands on an orb-first page, talks to the orb, types, or attaches a file, and the platform generates a personalized **teaser plus interactive simulator of their own future career ecosystem** — their site, their matched jobs, their AI-readable profile, their agents — narrated aloud by **Ava in English or Dalia in Spanish**. That preview is the sales pitch. When they click **Submit to build my ecosystem**, Stripe takes 97 USD per year, and the paid signal is handed to the **Digit2AI factory** (the architect pipeline), which builds the real personalized ecosystem on their own web address and turns their agents on. It is a multi-tenant subscription vertical: every subscriber is their own isolated tenant. OrbUp itself is never modified.

**In one sentence:** JobUp is OrbUp's funnel, delivering an enhanced version of what `manuelstagg.com` already runs, to any number of paying subscribers.

---

## 1. THE FUNNEL — THIS IS THE PRODUCT

| Step | What happens | Reused from |
|---|---|---|
| 1 | Visitor lands on `jobup.dev`. Orb-first hero, bilingual EN/ES | `orbup.html`, `orbup-es.html` |
| 2 | Visitor **talks** to the orb, **types**, or **attaches a file** — all three paths land in the same pipeline | Orb shell from `orbup.html` + the `manuelstagg.com` voice stack |
| 3 | Required identity gate: name, email, phone in E.164, language | `intake.js` identity gate |
| 4 | Visitor **attaches their resume** (PDF, DOCX, TXT) | `documentExtract.js` |
| 5 | Extraction into a structured career profile; the orb asks only what is missing | New, thin layer over the extractor |
| 6 | Platform generates a **personalized teaser + interactive simulator of their career ecosystem** | `teasers.js`, `appSimulator.js`, `appSimulatorGenerator.js` |
| 7 | The teaser is **narrated aloud — Ava in English, Dalia in Spanish** — and lives at an unguessable magic link, shareable and revisitable | `voiceTeaserGenerator.js`, `/api/tts/edge`, `GET /teaser/:token` |
| 8 | Simulator completes to a **Submit to build my ecosystem** CTA | New CTA on the existing simulator shell |
| 9 | Stripe Checkout — **97 USD per year, recurring**, tax calculated, terms accepted | `verticals/lawncopilot/src/services/billing.js` |
| 10 | Payment webhook hands the job to the **Digit2AI factory** (architect pipeline) to build the real ecosystem | `architectPipeline.js`, `architectPromptSynth.js` |
| 11 | `firstnamelastname.jobup.dev` and the website go live, structured data published, three agents activate | Career engine, section 5.2 |
| 12 | Subscriber sets a password, verifies email, and lands in their own private, isolated dashboard | `public/cv-admin.html` |

**The conversion moment is step 6-8.** Everything before it is capture; everything after it is delivery. Build steps 1-9 first and make them excellent, because a subscriber who never reaches Stripe never sees the engine.

---

## 2. HARD BOUNDARY — WHAT MUST NOT BE TOUCHED

`RinglyPro-CRM` is a **read-only donor**. It hosts OrbUp, four live CV domains, and 20-plus other live products.

- Do not modify any file in `RinglyPro-CRM`.
- Do not add JobUp to it as a vertical.
- Do not deploy onto the `aiagent.ringlypro.com` Render service.
- Do not share its database, Twilio account, Stripe account or environment.
- OrbUp at `orbup.app` keeps running exactly as it does today.

Copying source files into the new repo is correct and expected. Cross-repo `require()` is not.

---

## 3. VOICE — THE MANUELSTAGG.COM STACK, NO ELEVENLABS

**No ElevenLabs. No convai. No vendor.** JobUp uses exactly the voice system already running on `manuelstagg.com`: **zero-key Microsoft Edge neural TTS**, Ava in English and Dalia in Spanish. It costs nothing per play, needs no account and no API key, and it is already proven on the very page JobUp is productizing.

### 3.1 The engine

**`POST /api/tts/edge`** — port `src/routes/presentation-tts.js` from the donor repo. Body `{ text, voice, rate }`, returns an MP3, disk-cached by md5 of `edge|voice|rate|text`, text capped at 2,000 characters, default rate `-2%`.

| Alias | Edge voice | Use |
|---|---|---|
| `ava` | `en-US-AvaNeural` | **English — the JobUp voice** |
| `dalia` | `es-MX-DaliaNeural` | **Spanish — the JobUp voice** |
| `paloma`, `salome`, `elvira` | es-US / es-CO / es-ES | Spanish alternates |
| `guy`, `sonia` | en-US / en-GB | English alternates |

### 3.2 The client pattern

Port the orb controller from `public/manuelstagg.html` (roughly lines 1059-1200) rather than writing a new one. What it already solves:

- **Segmented script.** The narration is an array of segments per language, not one long blob — each segment is a separate short TTS call, so playback starts fast and the 2,000-character cap is never hit.
- **Prefetch and cache.** While segment N plays, segment N+1 is already being fetched. Blob URLs are cached client-side keyed on `lang|voice|index`, and the server disk-caches by content hash, so a replay costs nothing.
- **Graceful fallback.** A `neuralOK` flag flips to browser `speechSynthesis` on the first neural failure, with `pickBrowserVoice()` selecting the best available female voice for the language. The narration never simply dies.
- **Live language switching.** `__voiceApplyLang(lang)` stops playback, swaps the script and voice, clears the cache and relabels the UI. Wire it to the EN/ES toggle.
- **Real transport controls.** Play, pause, resume, stop, with a `runToken` guard so a stopped run cannot resurrect itself, and a status line showing segment position.
- **Orb states.** `loading`, `speaking`, idle — the visual orb animation is driven by these classes.

### 3.3 Making it two-way — still no vendor

`manuelstagg.com` narrates one way. JobUp needs the visitor to talk back, and the answer is to unbundle rather than to buy:

| Leg | Technology | Cost |
|---|---|---|
| Visitor speaks (STT) | **Web Speech API** in the browser, on-device | 0 |
| Understanding and reply (brain) | **Claude Haiku**, server-side, reusing `ANTHROPIC_API_KEY` | fractions of a cent per turn |
| Orb speaks (TTS) | **`/api/tts/edge`**, Ava or Dalia | 0 |

This is the same unbundling the ConversationRelay work in the donor repo already proved for phone calls. The Web Speech path is already used elsewhere in the repo for live capture (`es-ES` and `en-US`), so the browser handling is known-good.

**Why this matters commercially:** the orb runs **before** anyone pays. A bundled conversational vendor costs roughly 0.15 to 0.40 USD per visitor conversation, on a funnel where most visitors never convert. This stack costs Haiku tokens only. On a 97 USD per year product, that difference decides whether the top of the funnel can be opened to traffic at all.

### 3.4 Degradation — voice is an enhancement, never a requirement

- No microphone permission, or a browser without Web Speech (Firefox by default): the **typed** and **attach-a-file** paths are first-class and fully complete the funnel. Say so in the UI rather than presenting a broken orb.
- Neural TTS unreachable: fall back to browser `speechSynthesis`.
- Browser speech unavailable too: the teaser is still fully readable on screen.
- No `ANTHROPIC_API_KEY`: the orb answers from a labeled scripted flow and the funnel still reaches checkout.

Nothing in the voice layer may block capture, teaser generation or payment.

---

## 4. MULTITENANCY — ONE SUBSCRIBER, ONE TENANT

JobUp is a Digit2AI **vertical**: a product line, sold by subscription, with many paying tenants on one deployment. Tenancy is not a feature added later; it is the shape of every table and every query from the first migration.

**The model:** one subscriber equals one tenant (`tenant_id = subscriber id`). Every row in every table carries it. Every query filters on it, taken from the authenticated session and **never** from a request parameter, a header or a tool argument.

| Shared infrastructure | Per subscriber, strictly isolated |
|---|---|
| The `jobs` pool, the employer and ATS connector registry, source health, scoring machinery | Settings, targeting, watchlists, matches, saved searches, pipeline, opportunities, outreach, contacts, resume files, tailored resumes, site content, identity facts, billing |

One subscriber can never see another's data, and a targeting change for one provably does not move another's matches. The SIT asserts both, and asserts a cross-tenant read returns 404, not an empty list.

**Scale consequences to design for now, not later:**

- The shared `jobs` pool means one fetch of a Greenhouse board serves every subscriber targeting that employer. Never fetch per subscriber — that is how the ATS rate limits get hit and the connectors get blocked.
- Scoring is the per-subscriber cost, so it is what the per-tenant cost cap governs.
- Agent runs fan out per subscriber inside a global concurrency ceiling. A thousand tenants must not mean a thousand simultaneous LLM calls.
- Multi-instance safety: any scheduler or poller claims work atomically (`SELECT ... FOR UPDATE SKIP LOCKED`) so an agent run or an outreach send never fires twice.

**A note on the word "vertical."** In this ecosystem "vertical" means a product line, and the donor repo happens to keep several under a `verticals/` folder because 20 products share one database and one Render service there. JobUp is standalone by decision, so it gets its own repo, service and database — stronger isolation than the folder convention, not weaker.

---

## 5. COPY MANIFEST

### 5.1 The funnel — from OrbUp (`digit2ai-projects/`)

| Source | Lines | What it gives JobUp |
|---|---|---|
| `src/routes/intake.js` | 3,705 | Identity gate, public request endpoint, rate limiting keyed on `CF-Connecting-IP`, E.164 validation, orb config endpoint, triage trigger. **Copy selectively** — take the intake, gating and orb-config paths, leave booking, campaigns and reminders behind |
| `src/routes/teasers.js` | 626 | Teaser render, magic-link token, share and send |
| `src/routes/appSimulator.js` | 391 | Simulator route and viewer shell |
| `src/services/appSimulatorGenerator.js` | 351 | Generates the interactive multi-screen simulator |
| `src/services/voiceTeaserGenerator.js` | 270 | Builds the narration script (the segment array the orb plays) |
| `src/services/documentExtract.js` | 59 | Resume parsing: pdf-parse, mammoth for docx, txt/md/rtf, per-file caps |
| `orbup.html`, `orbup-es.html` | 1,888 / 1,803 | The whole orb-first landing: orb SVG and animation states, mic handling, transcript panel, identity gate, bilingual toggle, PWA head, funnel analytics hooks. **Strip the ElevenLabs SDK loader on the way in** and wire the orb to the section 3 stack |
| `src/routes/orbupApps.js` | 282 | Credit and usage metering pattern: daily grant, monthly cap, spend-on-action |
| `src/config/database.js`, `src/models/index.js`, `src/middleware/auth.js` | — | Sequelize bootstrap, model registration, JWT in an HttpOnly cookie |

### 5.2 The career engine — from the CV Talent Engine (`RinglyPro-CRM/src/`)

This is what the architect delivers per subscriber. It already exists and is multi-profile from the ground up. Copy and rename; do not reimplement.

| Source | Lines | What it gives JobUp |
|---|---|---|
| `routes/cv-engine.js` | 1,060 | ~60 endpoints: auth, dashboard, opportunities, matching, job refresh, employers, watchlist, pipeline, digest, outreach, settings, admin |
| `services/cv-jobsource.js` | 303 | Job pool, source registry, cross-source dedupe, repost and stale detection, optional Adzuna |
| `services/cv-employers.js` | 506 | 8 ATS adapters — Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Workday (paginated), Eightfold — plus guessed-token quarantine and closed-family honesty |
| `services/cv-settings.js` | 426 | Per-profile settings as JSONB, forced approval, private-by-default fields, verbatim owner facts |
| `services/cv-geo.js` | 228 | Country and location policy for every messy ATS location string |
| `services/cv-targeting.js` | 196 | Role, industry and employer targeting |
| `routes/cv-agent.js` | 308 | The single `applyPrivacy` projection, resume.json, A2A agent card, MCP endpoint |
| `routes/cv-pages.js` | 184 | Server-rendered indexable role pages with Person and Occupation JSON-LD |
| `routes/cv-analytics.js` | 156 | First-party page-view analytics |
| `public/cv-admin.html` | 976 | The subscriber dashboard |
| `public/manuelstagg.html` | 1,237 | **The reference implementation of the product's public face** — the voice orb controller (section 3), the personal-site layout, FAQ JSON-LD, EN/ES i18n dictionary, print stylesheet, share and QR. Turn it into the data-driven template every subscriber's site renders from |
| `src/routes/presentation-tts.js` | — | `POST /api/tts/edge` — zero-key Edge neural TTS, Ava and Dalia, disk-cached |
| `src/app.js` ~700-830 | — | Host-aware `robots.txt`, `sitemap.xml`, `llms.txt`, `/resume.json`, `/.well-known/agent.json` |
| `scripts/test-cv-engine-v2.js` | 420 | The SIT to port and keep green |

Rename on the way in: `cv_*` tables to plain names, `cv-` file prefixes dropped, `CV_*` env vars to `JOBUP_*`.

### 5.3 Billing, auth and the build handoff

| Source | Role |
|---|---|
| `src/services/architectPipeline.js` (547) | Start on paid signal, run, SIT, poll for completion, human greenlight, UAT loop, cancel-on-refund |
| `src/services/architectPromptSynth.js` (184) | Synthesize the build prompt from the captured profile |
| `src/services/architectEmail.js` (278) | Build-complete and UAT notifications |
| `verticals/lawncopilot/src/services/billing.js` | Stripe Checkout with trial, customer portal, `applySubscriptionEvent`, honest "not configured" with no key |
| `verticals/lawncopilot/src/routes/webhooks.js` | **The whole subscription lifecycle** — `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `trial_will_end`, invoice records and **`dunning_stage`**. Port this; do not rediscover it |
| `verticals/lawncopilot/src/services/accounting.js` | Invoice and receipt records |
| LawnCopilot platform forgot-password flow | Stateless reset token signed with the app secret **plus the user's current password hash** — one-time by construction, 1-hour expiry, nothing to store |
| `verticals/lawncopilot/src/services/unit-economics.js` | Deriving price from measured per-subscriber cost instead of typing a number |
| `verticals/exec-coaching/public/speakly-terms.html`, `speakly-privacy.html` | Legal page structure and tone |

---

## 6. WHAT IS DIFFERENT FROM ORBUP

| | OrbUp | JobUp |
|---|---|---|
| Who is the visitor | A company with a project | An individual professional |
| What they describe | A business problem | Their career |
| What they attach | Nothing | **Their resume** |
| What the teaser shows | A simulated business app | **Their own career ecosystem** |
| What the CTA sells | A build engagement | **A 97 USD per year subscription** |
| What gets delivered | A custom application | **A personal site, address, AI-readable identity and three running agents** |
| What runs afterward | Nothing recurring | **Three agents, continuously, for a year** |

**Cut entirely** — none of this ships in JobUp: project triage for businesses, contracts and e-signature, NDAs, meetings, minutes, RSVP, Zoom, calendar booking and kickoff scheduling, SMS reminder loops, campaigns, staff, workflows, findings, verticals, partner attribution, the Lovable-style app builder.

**Deferred to v2** from the career engine: Wikidata entity dossier, employer probe UI, saved searches, contacts CRM.

---

## 7. THE TEASER AND SIMULATOR — THE CRUX

This is what converts. Budget the most design effort here.

After the resume is parsed, generate a personalized preview at an unguessable magic link, narrated by the orb, in the visitor's language.

**Screens the simulator walks through:**

1. **Your personal site** — a live-looking mockup rendered from their actual parsed resume: headline, summary, experience, skills, certifications, recruiter CTA.
2. **Your web address** — `firstnamelastname.jobup.dev`, resolved live against the fallback ladder so they see the exact address they will get.
3. **Your matched jobs** — real openings, pulled live from the real ATS pool against their real resume, each with a score and a one-line explanation of the fit.
4. **Your tailored resume** — one job from screen 3, with their resume rewritten against that specific posting and the changes highlighted. This is the single most tangible "the product works" moment; see section 11.
5. **Your AI-readable identity** — a readable rendering of their JSON-LD and resume.json, with a plain-language explanation of why a machine can now understand their career.
6. **Your three agents** — what each will do, with a simulated activity feed.
7. **Your dashboard** — a preview of the real dashboard populated with their data.
8. **Submit to build my ecosystem** — 97 USD per year, everything included, what happens next, and what happens if they do not renew.

**Narration.** The whole walkthrough is read aloud by **Ava in English or Dalia in Spanish** over `/api/tts/edge`, as a segment array — one short segment per screen, prefetched one ahead, disk-cached on the server and blob-cached in the client, exactly as `manuelstagg.com` does it. The visitor should be able to sit back and listen to their own career ecosystem being described to them, in their own language, with their own name in it. This is the emotional beat that closes the sale, it costs nothing per play, and it is worth more design attention than any other screen.

**Honesty rules, enforced in code:**

- The matched jobs in screen 3 must be **real postings from the real pool**, scored against their real resume. If the pool is unavailable, the screen says so and shows nothing — it never fabricates an opening, a company or a salary.
- Anything simulated is labeled simulated, in the manner the donor repo already labels `is_simulated` output.
- Never show fabricated recruiter interest, fabricated view counts, or an invented match percentage on a job that was not actually scored.
- No guaranteed-outcome language anywhere in the teaser.

**Cost guard:** the teaser runs before any payment, so it is a free spend on every visitor. Rate limit on `CF-Connecting-IP`, cap jobs scored per teaser at ~15, cap teasers per identity per day. An unmetered pre-payment generator is how this product loses money.

---

## 8. PRICING AND UNIT ECONOMICS

Model rates: **Claude Haiku 4.5 at 1.00 USD per million input tokens and 5.00 USD per million output**. Cache reads bill at 0.1x, cache writes at 1.25x. The Batch API is 50 percent off. Voice costs nothing (section 3), and speech recognition runs on-device.

### 8.1 The pre-payment teaser — the cost that exists whether or not they buy

| Stage | Tokens (in / out) | Cost |
|---|---|---|
| Orb conversation, ~6 turns | 21,000 / 2,700 | 0.035 |
| Resume extraction | 4,000 / 1,500 | 0.012 |
| Job matching, 15 jobs scored, resume block cached | 30,000 / 4,500 | 0.038 |
| One tailored resume (teaser screen 4) | 5,000 / 2,500 | 0.018 |
| Teaser + simulator generation | 6,000 / 8,000 | 0.046 |
| Narration script | 2,000 / 1,500 | 0.010 |
| Voice (Edge TTS) and speech recognition | — | 0.000 |
| **Total per teaser** | | **≈ 0.16 USD** |

At a 3 percent conversion rate, each paying subscriber carries 33 teasers, or **5.28 USD** of pre-sale cost. At 5 percent it is 3.20; at 2 percent, 8.00.

**Optional upgrade:** running the teaser copy on Claude Sonnet 5 instead of Haiku costs about 0.10 more per teaser (roughly +3.30 per subscriber at 3 percent conversion). The teaser is the sales pitch, so this is probably worth buying. Score jobs on Haiku, write the teaser on Sonnet.

### 8.2 Full cost per subscriber per year

| Line | 100 subscribers | 500 subscribers |
|---|---|---|
| Stripe (2.9% + 0.30 on 97) | 3.11 | 3.11 |
| Pre-sale teasers (33 at 0.16) | 5.28 | 5.28 |
| Architect build, one-time at signup | 0.25 | 0.25 |
| Opportunity Hunter, 6 jobs scored/day for a year | 5.29 | 5.29 |
| Application toolkit — tailoring, cover letters (section 11) | 1.80 | 1.80 |
| Career Broadcaster, ~48 approved drafts/year | 0.34 | 0.34 |
| Professional Presence Agent, monthly review | 0.28 | 0.28 |
| Weekly digest, 52 sends | 0.36 | 0.36 |
| Email delivery | 0.05 | 0.05 |
| Web address (subdomain) | 0.00 | 0.00 |
| Monitoring, backups, status page | 0.60 | 0.12 |
| Infrastructure, amortized (~1,020/yr Render + Postgres) | 10.20 | 2.04 |
| **Total cost** | **27.56** | **18.92** |
| **Gross margin at 97 USD** | **69.44 (72%)** | **78.08 (80%)** |

Stress case — 1.5 percent conversion, uncapped agents, 100 subscribers: cost ~38, margin 61 percent. Still healthy.

**97 USD per year works.** It is a 3.5x markup on measured cost, well above the repo's own 1.70x convention in `unit-economics.js`.

### 8.3 The six mechanics that make those numbers true

Requirements, not optimizations. Without them the Hunter line alone runs 25 USD per subscriber per year.

1. **One shared job pool.** Fetch each ATS board once for every tenant targeting that employer. Per-tenant fetching multiplies cost and gets connectors rate-limited or blocked.
2. **Deterministic pre-filter before any LLM call.** Title, location and keyword matching is free. Only the top handful of genuinely new candidates per day get scored. This is the difference between 5 USD and 25 USD a year.
3. **Prompt caching on the resume and settings block.** Identical across every scoring call in a batch; cache reads bill at one tenth of input rate.
4. **Batch API for overnight scoring.** Nightly discovery is not latency-sensitive, and batch is half price — it takes the Hunter from 5.29 to about 2.65.
5. **A hard per-tenant monthly cost cap.** The career engine already derives a ceiling from a per-profile dollar setting. Set it, log actual spend, and correct these assumptions with evidence rather than defending them.
6. **Teaser and toolkit rate limiting.** Cap teasers per identity per day, jobs scored per teaser, and tailored resumes per subscriber per month (fair-use, generous — see section 11).

### 8.4 What to charge — one tier

**97 USD per year. One plan. Everyone gets the same thing.**

| Included at 97 USD/year |
|---|
| `firstnamelastname.jobup.dev` — their web address, live minutes after payment |
| A professional website, generated and maintained by the Presence agent |
| Machine-readable identity: resume.json, JSON-LD, agent card, MCP, role pages |
| Three AI agents running continuously |
| Job discovery, scoring and explained matching |
| Per-job resume tailoring (30/month) and cover letters |
| ATS keyword scoring |
| Consent-gated professional broadcasting |
| Private dashboard, weekly digest, full data export |

**Why one tier.** A second tier only earns its complexity when it carries something the first genuinely lacks. Quota differences alone do not justify a pricing page that makes every visitor stop and choose — and a choice at the checkout moment costs conversion. Ship one plan, learn what people actually ask for, and let the second tier be defined by evidence rather than by guess.

**Positioning.** 97/year is 8.08 a month against a category charging 20-40 a month (Teal ~29, Simplify+ ~40, Jobright 20-40, Jobscan ~50, LinkedIn Premium ~40). We are the cheapest by a wide margin. With the section 11 table stakes in place that reads as value; without them it reads as a cheap tool. **The table stakes are therefore not optional — they are what makes the price legible.**

**Hard requirement:** the price is an administrative variable in platform settings, never hardcoded. The landing page and checkout read from it.

### 8.5 Parked — custom domains and a second tier

**Decision: not in v1.** Every subscriber is on `firstnamelastname.jobup.dev`. No registrar, no ICANN registrant question, no WHOIS privacy, no per-domain TLS, no annual domain renewal running independently of the subscription, no transfer-out policy, no trademark-complaint path, and no second SKU on the pricing page. A single wildcard `*.jobup.dev` entry on Render covers every subscriber with one certificate and zero per-subscriber configuration.

This is the right call for launch. The domain tier added roughly a dozen operational obligations to a product that has not yet proven anyone will pay for the first one.

**Preserved for when it comes back**, so the analysis is not redone from scratch:

- **Pricing shape.** A Professional tier at ~197/year (16.42 a month, still under every competitor), differentiated by the domain *plus* higher quotas, priority scoring and better-model writing. A tier whose only visible difference is "`.com` instead of a subdomain" reads as gouging; one that is visibly more product does not.
- **Marginal cost** would be roughly 19-21/year automated: 10-12 registration (recurring), 3.00 Render custom domain (0.25/mo on a Professional+ workspace — Hobby caps at 2 across all services), plus quota and model deltas.
- **Ship "bring your own domain" first.** Many senior professionals already own their name domain; serving them costs nothing but Render's 0.25/mo, carries zero renewal liability and zero ownership ambiguity. Subscriber enters the domain → we show one CNAME plus a verification token → poll until DNS resolves → `create-custom-domain` on Render → TLS issues automatically. Entri or Domain Connect makes the DNS step one click if manual instructions become a support burden.
- **If registering on their behalf:** every registrar API assumes a reseller with one billing account, not a SaaS with self-serving end users. Choose on whether **per-domain registrant contact** can be set to the subscriber, not on price. **Porkbun** is the lowest-friction starting point (sign up, API key, go); Dynadot and Namecheap also qualify; **Cloudflare Registrar is cheapest but registers into your own account**, so it cannot support subscriber ownership; OpenProvider or OpenSRS become worthwhile at several hundred domains; GoDaddy's API is gated.
- **Two commitments that must hold if it ships:** register in the subscriber's name, and **they keep the domain if they cancel**. Taking back a domain carrying someone's own name because they stopped subscribing is indefensible.
- **Today's manual flow** — buy in GoHighLevel, add the Render CNAME in GHL DNS, add the domain in Render — works and is proven on `manuelstagg.com`, `anastagg.com` and `speakly.vip`. It is fine for a first cohort but has no purchase API, is retail-priced, and leaves Digit2AI as registrant.

### 8.7 Commercial decisions — settled

- **Web address:** `firstnamelastname.jobup.dev` for everyone, provisioned instantly at payment under a single wildcard certificate. Custom domains are parked (section 8.5).
- **Non-renewal:** a subscriber who does not renew keeps nothing hosted — the site goes down, the agents stop, the subdomain is released. Stated plainly in the pricing section, at checkout, and in the terms. **One permanent exception:** the subscriber can always export their own data (resume, profile, matches, pipeline, tailored resumes) before and after expiry. Taking down the product is a business decision; withholding someone's own career data is not.
- **Tax:** Stripe Tax on from day one. Prices are declared **tax-exclusive**; tax is calculated at checkout by the customer's location. EU/UK VAT and US economic-nexus thresholds are Stripe's problem once it is switched on, and nobody's problem until it is.
- **Refunds:** 14-day no-questions refund from the date of charge, published on the pricing page and in the terms, with a self-service button in the dashboard. A refund cancels the subscription, tears down the site, and fires `cancelStripeSubscription` on the architect pipeline.
- **Auto-renewal:** an advance renewal notice email goes out **30 days and 7 days** before each annual charge, stating the amount, the date, and a one-click cancel link. Required by California's ARL and EU consumer rules; also the single cheapest way to prevent chargebacks.

---

## 9. PERSONAL WEB ADDRESS

Every subscriber gets **`firstnamelastname.jobup.dev`**, provisioned instantly at payment under a single wildcard certificate on Render. Zero registrar cost, zero ICANN obligations, zero renewal exposure, live within minutes of checkout. Custom domains are parked (section 8.5).

**The name ladder.** Preferred form is `firstnamelastname`. Fallbacks in decreasing preference: first + middle initial + last, first + full middle + last, first + last + profession, first + last + city, first + last + industry, first + last + short numeric suffix. Clean, professional, memorable only — no long or random variants. Always shown for approval before provisioning.

**Availability in the teaser.** The teaser resolves the ladder live and shows the visitor the exact address they will get, so there is no gap between what was promised and what is provisioned. Re-check at provisioning time and, if it has been taken in the interim, offer the next rung rather than silently substituting.

**Collision policy.** Two subscribers wanting the same name is a matter of when, not if. First to provision wins the exact match; the second is offered the ladder. **Never reassign an address that is already live** — a recruiter may hold the link.

**Address changes.** A subscriber can change their address once without support (a typo, a name change). The old address becomes a permanent redirect, never a 404 and never reassigned to someone else.

---

## 10. THE THREE AGENTS

### Agent 1 — Opportunity Hunter

Roughly 90 percent exists in the donor code. Wrap job sourcing, employer registry and match scoring in a named agent with a schedule, a cost cap and an activity log.

Inputs: resume, skills, experience, education, goals, target industries and employers, target titles, location, remote preference, compensation floor, work authorization, seniority.

Behavior: search approved sources, discard irrelevant results, rank, score, explain the match, name missing qualifications, detect deadlines, dedupe, save to the dashboard, notify on high-priority matches.

**Invariants that must survive the port:**
- A guessed ATS board token is quarantined as `unverified` and contributes nothing until a human confirms it. Guessed tokens land on abandoned trial accounts squatting real company names. Reachable does not mean live.
- Workday tenants are paginated and can hold thousands of postings. Caps are stated in the status, never applied silently.
- Compensation is shown only when the posting states it. Never estimated.
- Never claim an application was submitted unless a verified submission occurred.

### Agent 2 — Career Broadcaster

Drafting exists; campaign management is new.

Targeting by industry, job category, geography, jurisdiction, seniority, target employer, recruiter category, professional association, market segment.

Subscriber controls: pick industries, geographies and categories; review every draft; approve, pause, stop; see delivery, engagement and recruiter responses; manage opt-outs.

**Invariants:** approval stays forced on in code, not in a prompt. Consent is checked at send time against the live record and snapshotted per send, with quiet hours. Referral suggestions come only from people already in that subscriber's own inbox and outreach history. No scraped-contact blasting, no deceptive sender identity, no unauthorized mass messaging.

### Agent 3 — Professional Presence Agent

Capabilities exist scattered across the donor code; the agent itself is new.

Generates and maintains the website, structures resume data, optimizes the professional summary, generates metadata and structured data, keeps website / resume.json / agent card / role pages / llms.txt mutually consistent, identifies missing resume information, recommends improvements, tracks skills and certifications, improves recruiter-facing language, monitors broken links, address status, SSL and site health, produces recruiter-ready summaries.

**Invariant:** one source of truth. Website, resume.json, agent card, role pages and llms.txt are all projections of the subscriber's settings record and can never state different things.

---

## 11. THE APPLICATION TOOLKIT — CATEGORY PARITY

The three agents are the differentiator. This section is the table stakes: what every competitor ships, what a subscriber will look for on day one, and what they will notice missing.

### 11.1 Per-job resume tailoring

The highest-frequency action in the category. From any matched job, one click produces a version of the resume rewritten against that specific posting.

- Diff view: what changed and why, so the subscriber approves rather than trusts.
- Every tailored version is **stored, versioned and tenant-scoped** — attached to the job and to the pipeline entry, downloadable as PDF and DOCX.
- **Honesty rule, enforced in code:** tailoring reorders, reweights and rephrases what the subscriber actually wrote. It may **never** invent an employer, a date, a degree, a certification, a clearance or a metric that is not in the source resume. The generated version is diffed against the source and any new proper noun or number is flagged for explicit confirmation before it can be saved. Résumé fraud is not a feature.
- Fair-use ceiling (e.g. 30/month), stated in the UI, metered against the per-tenant cost cap.

### 11.2 Cover letter generation

Same pattern, same invariant, same storage. Generated against the job plus the profile plus the owner-entered facts, always reviewable, never auto-sent.

### 11.3 ATS keyword scoring against a specific posting

Deterministic and free — no LLM call. Extract the posting's requirement terms, compare against the resume, show matched, missing, and near-miss terms with a score. Concrete, instant, demoable, and it makes the tailoring suggestion obvious rather than mysterious.

### 11.4 Application autofill — and the line it must not cross

**Autofill is not auto-apply, and the section 19 compliance rule does not forbid it.** The rule bans *submitting* an application without explicit per-application authorization. Filling a form the subscriber is looking at, which they then submit themselves, respects that rule completely.

- The platform prepares the field mapping for a given posting from the profile and the tailored resume.
- **The human always clicks submit.** No headless submission, no queued auto-apply, no "apply to 50 jobs" button — ever.
- The system records an application only when the subscriber confirms they submitted it. It never infers, and never reports a submission that did not verifiably occur.

In v1 this is a copy-ready field pack plus a one-click "mark as applied" on the pipeline entry. Real in-page autofill arrives with the browser extension (section 12).

---

## 12. BROWSER EXTENSION — v1.5, THE STRONGEST SINGLE INVESTMENT

This is how the category actually works, and its absence is the biggest product gap in the plan. Simplify, Huntr and Teal all ship one; it is both the core utility and the distribution channel.

**Scope:**
- **Save this job** from any site — job boards, company career pages, LinkedIn — straight into the pipeline, with the posting captured for scoring and tailoring.
- **Autofill** the application form in place from the profile and the tailored resume, under the section 11.4 rule: the human clicks submit.
- **Show the match score and missing keywords** inline on the posting page.
- **Track** — one click moves the pipeline stage without opening the dashboard.

**Constraints:** minimum permissions, no background scraping of pages the subscriber did not open, no reading of anything outside the active tab, and a plain-language explanation of every permission at install. The extension authenticates against the subscriber's own session and is strictly tenant-scoped.

Ship after the funnel converts, not before — but plan the pipeline and profile APIs so the extension is a client of them rather than a rewrite.

---

## 13. ACCOUNT, AUTH AND SESSION

Not previously specified. All of it is v1.

- **Account creation happens at payment**, not before. Checkout captures identity; the post-payment step sets a password and verifies the email.
- **Email verification** — required before the site goes public and before any outbound send. An unverified address cannot receive a digest or a broadcast.
- **Password reset** — port LawnCopilot's stateless flow: token signed with the app secret **plus the user's current password hash**, so it is one-time by construction and expires in an hour with nothing to store. Never clobber a set password on boot.
- **Session management** — JWT in an HttpOnly, Secure, SameSite cookie. A visible session list and a log-out-everywhere control.
- **Optional 2FA (TOTP)** in v2. A resume plus contact details plus work-authorization status is a meaningful identity-theft target; offer it before someone needs it.
- **Account recovery** when the email itself is lost — a documented manual path with identity checks, not a self-service bypass.
- **Rate limiting and lockout** on login, reset and verification endpoints, keyed on `CF-Connecting-IP`.
- **Account deletion** is self-service, complete, and removes the resume files themselves — not only the rows.

---

## 14. SUBSCRIPTION LIFECYCLE

The funnel takes one payment. This section covers everything after it, which is where annual SaaS actually lives or dies. **Port `verticals/lawncopilot/src/routes/webhooks.js` rather than rediscovering it** — it already implements most of this.

**Webhook events that must be handled:**

| Event | What must happen |
|---|---|
| `checkout.session.completed` | Provision the tenant, fire the architect pipeline, send welcome + verification |
| `customer.subscription.created` / `.updated` | Apply plan and status, attributed by metadata — never guessed |
| `customer.subscription.trial_will_end` | The conversion email. This single email largely decides trial-to-paid rate |
| `invoice.paid` | Record the invoice, issue the receipt |
| `invoice.payment_failed` | Enter dunning at `dunning_stage` 1 |
| `customer.subscription.deleted` | Tear down: site offline, address released, agents stopped, export still available |

**Dunning.** Card declines are the largest source of involuntary churn in annual SaaS. On failure: retry on Stripe's schedule, send escalating emails at each stage, hold a grace period during which the site stays up and the agents keep running, then suspend. Every stage is recorded on the invoice row. A subscriber must never discover their site is down without having been told twice.

**Card expiry warning** before the renewal attempt, not after the decline.

**Advance renewal notice** at 30 and 7 days (section 8.7).

**Refunds** — 14-day window, self-service, cancels and tears down (section 8.7).

**Also required:** invoices and receipts the subscriber can download; plan changes with proration if a second tier ever lands (section 8.5); a cancellation flow that asks one question and offers a pause instead; and a win-back email after teardown that still links to the data export.

---

## 15. NOTIFICATIONS AND EMAIL

- **A preference centre.** Per-category toggles: job matches, digest, agent activity, outreach responses, billing, product news. Billing and security notices are transactional and cannot be disabled.
- **An unsubscribe link in every non-transactional email**, honored immediately and permanently. CAN-SPAM requires it and the Broadcaster's credibility depends on it.
- **Sender identity and deliverability** — SPF, DKIM and DMARC configured on the sending domain before the first send. A cold sending domain that starts with volume lands in spam and stays there.
- **Quiet hours** respected on anything outbound, in the recipient's local time.
- **The digest is the retention product.** Weekly, personalized, showing what the agents did — new matches, pipeline movement, site visits, recruiter inquiries. It is the main reason a subscriber remembers they are paying.

---

## 16. LANDING PAGE (`jobup.dev`)

Orb-first, exactly like OrbUp. Bilingual EN/ES with proper Spanish orthography, emoji-free, mobile-first, accessible, fast.

**Hero headline:** Stop Looking for Jobs. Let AI Find Them for You.

**Hero support:** Talk to the orb or attach your resume. JobUp shows you your own AI career ecosystem in minutes — your personal website, your web address, your AI-readable profile, and the real jobs that match you right now.

**Primary CTA:** Attach my resume
**Secondary CTA:** See how JobUp works

| # | Section | Content |
|---|---|---|
| 1 | Hero + orb | Talk or type. Attach a resume. See your ecosystem |
| 2 | What You Receive | Web address, website, resume optimization, per-job tailoring, AI-readable structured profile, continuous discovery, intelligent matching, professional broadcasting, private dashboard, three AI agents |
| 3 | The Three AI Agents | Opportunity Hunter, Career Broadcaster, Professional Presence Agent |
| 4 | Own Your Professional Identity | Your own address versus a long third-party profile URL. **Do not attack LinkedIn** — it stays one of the sources JobUp connects |
| 5 | AI Search Ready | Structured data in plain language, with an expandable technical section for JSON, JSON-LD, schema, metadata, machine-readable profiles |
| 6 | Traditional Search vs JobUp | Manual searching, hundreds of listings, repeated uploads, board dependence, waiting to be found, disconnected profiles — against continuous AI search, ranked opportunities, an always-available professional site, AI-discoverable structure, targeted broadcasting, one dashboard |
| 7 | How It Works | The 12 steps in section 1 |
| 8 | Pricing | **One plan, 97 USD per year**, read from the admin pricing variable. Tax stated as calculated at checkout; every inclusion listed; the 14-day refund window and the non-renewal policy both stated plainly. No tier chooser — one button |
| 9 | Trust and Control | The subscriber controls their data, website, profile, campaigns, job preferences, communication approvals and privacy settings. Export any time, delete any time |
| 10 | FAQ | Including: what happens if I do not renew, can I get a refund, where does my resume go, do you apply on my behalf (no — you always click submit) |
| 11 | Final CTA | "Your Career Should Keep Moving, Even When You Are Not Searching." CTA: Show me my ecosystem |

Footer carries: Terms, Privacy, Subprocessors, Refund policy, Contact, Status.

**Honest framing to preserve.** No recruiting product discovers candidates via MCP today. The agent surface is differentiation once someone lands and a positional bet, not a traffic source. Real discovery comes from corpora recruiter tooling already indexes — LinkedIn, Dice, GitHub, employer talent networks — which only the subscriber can create. JobUp links them and keeps them consistent. Do not sell MCP as a traffic channel.

---

## 17. BRAND

Name: JobUp. Positioning: Your Personal AI Career Platform. Supporting line: a 24/7 AI-powered ecosystem that builds your professional presence, finds matching opportunities, and helps promote your career.

Feel: professional, modern, trustworthy, intelligent, premium, career-focused, empowering, human-centered. Inherit OrbUp's visual system — dark, orb-led, cyan and violet accents — but tuned for an individual's career rather than a company's project. Avoid a playful social-media look, a generic job-board look, and futuristic graphics that reduce trust. Emoji-free throughout.

---

## 18. ADMIN PORTAL

Administrators manage: subscribers, profiles, web addresses, websites, subscriptions and payments, dunning state, refunds, agents, job sources, search frequency, broadcast settings, prompts, industries, job categories, geographic markets, notifications, privacy requests, data exports, account deletion, platform analytics, errors, agent activity, usage limits, cost caps and the pricing variable.

**Two dashboards that decide whether the business works:**
- **Funnel:** teasers generated, teaser-to-checkout conversion, drop-off by step, cost per teaser, cost per acquisition.
- **Retention:** activation rate, weekly active, digest open rate, churn and renewal cohorts, involuntary versus voluntary churn, refund rate.

**Boundary:** an administrator sees counts and money, not subscriber PII. Viewing a subscriber's private career data requires audited impersonation with a written reason, written to an append-only log.

---

## 19. COMPLIANCE, LEGAL AND PRIVACY

**Never use:** guaranteed job, guaranteed interview, guaranteed recruiter response, guaranteed search ranking, guaranteed Wikidata listing, guaranteed employment outcome.

**Use:** helps identify opportunities, improves professional visibility, searches for relevant openings, supports professional outreach, structures information for AI readability, helps subscribers manage their job search.

### 19.1 Enforced in code, not in prompts

- **No application is submitted without explicit per-application authorization**, and the system never reports a submission that did not verifiably occur. Autofill is permitted; the human always clicks submit (section 11.4).
- **Tailored resumes and cover letters may not invent facts.** Any proper noun or number not present in the source resume is flagged for confirmation before it can be saved (section 11.1).
- No broadcast leaves the platform without subscriber approval and a live consent check.
- Private fields are deleted from every public surface through one shared projection, never blanked or merely hidden in the UI. Contact details, compensation, work authorization and clearance are private by default; the subscriber opts in.
- Work authorization, compensation and availability are owner-entered facts, quoted verbatim in drafts or omitted entirely. Never paraphrased, never inferred.
- An uploaded resume is personal data. State retention, allow deletion, and delete the file itself — not only the row. **A visitor who uploads a resume and never pays still has deletion rights**, and an unconverted teaser's resume is purged automatically after 90 days.
- Data export and account deletion are real, complete and self-service.
- Job-source terms of service reviewed per source, with rate limiting and identification. Serving paying subscribers at volume is a different posture from reading public endpoints for four people. Closed ATS families — iCIMS, Taleo, Phenom, Oracle HCM, SuccessFactors — are named as closed, not scraped around.

### 19.2 Legal artifacts that must exist before the first paid signup

- **Terms of Service** — covering the subscription, auto-renewal, the 14-day refund window, what happens on non-renewal, acceptable use, and the explicit statement that JobUp does not submit applications on the subscriber's behalf.
- **Privacy Policy** — what is collected, why, where it goes, how long it is kept, and how to export or delete it.
- **Subprocessor list** — resume and profile content is sent to **Anthropic** for scoring, tailoring and drafting. That makes Anthropic a subprocessor and it must be named, alongside Stripe, the email provider, and the hosting provider. Publish the list and commit to notifying before adding to it.
- **DPA** available on request for anyone who asks.
- **Cookie consent** for EU visitors, covering analytics.
- **Documented GDPR/CCPA request handling** — an intake channel, an owner, and a stated response window. An export button is a mechanism, not a process.

Structure and tone precedent: `verticals/exec-coaching/public/speakly-terms.html` and `speakly-privacy.html`.

### 19.3 Accessibility

WCAG 2.2 AA is the target, with a named owner and a pre-launch audit of the four surfaces that matter: landing page, orb intake, teaser/simulator, dashboard. Specifically: keyboard navigation throughout, visible focus states, sufficient contrast in the dark theme, alt text, and — because the product is voice-led — **a complete, equally prominent non-voice path**. The orb must never be the only way to do anything.

Applicable regimes: privacy and data protection, email and outreach regulation including CAN-SPAM and GDPR, consent, data deletion, auto-renewal disclosure law, sales tax and VAT, anti-spam law, platform scraping restrictions, employment discrimination law, and accessibility.

---

## 20. OPERATIONS, SUPPORT AND MONITORING

None of this is optional for a paid product, and none of it was in the original plan.

- **Error monitoring** (Sentry or equivalent) on server and browser, with alerting.
- **Uptime monitoring** on the landing page, the teaser generator, checkout, and the subscriber site host — with a **public status page**.
- **Database backups with a tested restore.** An untested backup is not a backup. Test it before launch and on a schedule.
- **Incident response:** who is paged, how subscribers are told, where it is written down afterwards.
- **Audit log** of privileged actions — impersonation, refunds, plan changes, data exports, deletions — append-only.
- **Secrets management and rotation**, including what happens when a key leaks.
- **Support:** help documentation, a contact channel, and a published response time. A subscriber whose site is down and who cannot reach anyone will chargeback rather than email twice.
- **Activation onboarding:** a first-session checklist (verify email, confirm profile, set targets, review first matches). Activation predicts renewal better than any other early signal.
- **Product analytics** on the funnel and retention dashboards in section 18.
- **Referrals** in v2 — a job search is a thing people discuss with peers who are also searching.

---

## 21. TECHNICAL FOUNDATION

**Stack:** Node, Express, Sequelize, PostgreSQL — matching the donor code so ported files run with minimal edits.

**Deployment:** its own Render service, its own Postgres, its own environment. Push to `main` auto-deploys.

**`jobup.dev` note:** `.dev` is on the HSTS preload list, so HTTPS is mandatory in every browser. Render terminates TLS so this is free, but never emit an `http://` link, canonical or redirect anywhere in the codebase.

**Cloudflare 100-second ceiling:** long synchronous endpoints return 524 even when the backend finishes. Teaser generation, simulator generation, resume tailoring and the architect build all exceed it. Every one must be a background job plus a poll, never a synchronous request.

**Proposed layout:**

```
jobup/
  package.json
  render.yaml
  sit.js
  migrations/
  src/
    server.js
    app.js
    config/database.js
    models/index.js
    middleware/auth.js
    routes/    intake, teaser, simulator, billing, webhooks, auth,
               profile, jobs, tailoring, outreach, sites, addresses,
               agent, pages, analytics, notifications, admin, health
    services/  resume-extract, teaser-generator, simulator-generator,
               jobsource, employers, geo, settings, targeting, matcher,
               tailor, coverletter, ats-score, site-render, addresses,
               billing, dunning, email, architect,
               agents/{hunter, broadcaster, presence}
    data/
  extension/   (v1.5 — manifest, content script, background worker)
  public/      landing EN/ES, dashboard, legal pages, orb assets, PWA
```

Its own database means no table prefix is needed — plain `subscribers`, `profiles`, `teasers`, `jobs`, `job_matches`, `tailored_resumes`, `applications`, `opportunities`, `outreach`, `sites`, `settings`, `agent_runs`, `invoices`, `notification_prefs`, `audit_log`.

**Degrade gracefully with no keys.** No `ANTHROPIC_API_KEY` gives labeled heuristic output marked `is_simulated` and a scripted orb, never a silent fake. No Stripe key disables checkout with an honest message, never a fake URL. No email key logs and skips rather than crashing. Voice needs no key at all. The SIT runs green with zero external keys.

**The whole product needs three external services:** Anthropic for the brain, Stripe for the money, an email provider for delivery. Voice, speech recognition, job sourcing, ATS scoring and structured data are all keyless. Adzuna and error/uptime monitoring are optional additions. That is a deliberately small vendor surface — keep it that way.

**Environment variables:** `JOBUP_JWT_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `JOBUP_MODEL` (default Haiku), `JOBUP_TEASER_MODEL` (optional Sonnet upgrade), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED`, `JOBUP_PRICE_USD` (97, annual), `JOBUP_REFUND_DAYS` (14), `JOBUP_TTS_VOICE_EN` (`ava`), `JOBUP_TTS_VOICE_ES` (`dalia`), `JOBUP_TTS_RATE` (`-2%`), `JOBUP_TEASER_COST_CAP_USD`, `JOBUP_SUBSCRIBER_COST_CAP_USD`, `JOBUP_TAILOR_MONTHLY_LIMIT` (30), `JOBUP_AGENT_CONCURRENCY`, `SENDGRID_API_KEY`, `JOBUP_FROM_EMAIL`, `SENTRY_DSN`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOBUP_BASE_DOMAIN` (`jobup.dev`).

---

## 22. BUILD SEQUENCE

**Phase 0 — Settled (sections 8.4-8.7).** One tier at 97 USD/year. Every subscriber on `firstnamelastname.jobup.dev` under a single wildcard certificate; custom domains parked (section 8.5). Stripe Tax on, prices tax-exclusive; 14-day refunds; renewal notices at 30 and 7 days; nothing retained on non-renewal except the subscriber's own exportable data. Remaining setup: put the cost caps from 8.3 into config before the first paid signup.

**Phase 1 — Scaffold.** New repo, Render service, Postgres, `jobup.dev` DNS, health endpoint, CI, error and uptime monitoring, backups configured. OrbUp untouched.

**Phase 2 — Funnel.** Orb landing, identity gate, resume upload and extraction. A visitor can talk, type or attach, and see their parsed profile.

**Phase 3 — Teaser and simulator.** The conversion surface (section 7). Background job plus poll. Real matched jobs, one real tailored resume, labeled simulation everywhere else, cost-capped.

**Phase 4 — Checkout and account.** Stripe annual subscription at the admin-set price with Stripe Tax, terms acceptance, password set, email verification, customer portal, webhooks attributed by metadata.

**Phase 5 — Career engine.** Port the section 5.2 files, rename, wire to the new database, port the SIT and get it green.

**Phase 6 — Architect handoff.** Paid webhook fires the pipeline: provision the address, render the site, publish structured data, activate the agents, email the subscriber, land them in onboarding.

**Phase 7 — Agents and toolkit.** The three named agents with schedules, cost caps, activity logs and dashboard surfaces. Per-job tailoring, cover letters, ATS scoring, the application field pack.

**Phase 8 — Lifecycle and comms.** Dunning, `trial_will_end`, card expiry, renewal notices, refunds, cancellation and win-back. Notification preference centre, unsubscribe, SPF/DKIM/DMARC, the weekly digest.

**Phase 9 — Legal, accessibility, support.** Terms, privacy, subprocessor list, cookie consent, GDPR process. WCAG audit of the four key surfaces. Help docs, contact channel, status page.

**Phase 10 — Validate.** SIT (section 23). Restore a backup. Then launch.

**Phase 11 — v1.5.** The browser extension (section 12).

---

## 23. DEFINITION OF DONE

**Platform**
- `jobup` runs as its own repo, service, database and environment. `RinglyPro-CRM` and OrbUp are unchanged and fully operational.
- Multitenancy holds: every table is tenant-scoped, tenant id comes only from the session, and a cross-tenant read returns 404.
- SIT passes with zero external keys. A backup has been restored successfully at least once.

**Funnel**
- A visitor can talk to the orb, type, or attach a file, and receive a personalized teaser and simulator at a magic link, narrated by Ava or Dalia.
- The simulator shows real matched jobs scored against the real resume and one real tailored resume; everything simulated is labeled.
- Teaser generation is rate-limited and cost-capped against unpaid abuse.
- Checkout charges the admin-set price with tax calculated, terms accepted, and account created.

**Delivery**
- Payment hands off to the Digit2AI factory, which provisions the address, generates the site, publishes structured data and activates the agents.
- resume.json, JSON-LD, agent card, role pages, sitemap, robots and llms.txt are generated and mutually consistent.
- All three agents are scheduled, cost-capped and logged. Opportunities are discovered, deduped, ranked, explained and displayed.
- Per-job tailoring, cover letters and ATS scoring work, with the no-invented-facts check enforced and tested.
- Every broadcast requires subscriber approval; no send path bypasses it. No application is ever submitted by the platform.

**Business**
- Email verification, password reset, session management and self-service account deletion all work.
- Dunning, `trial_will_end`, card expiry, renewal notices at 30 and 7 days, refunds and cancellation all work end to end.
- Every non-transactional email carries a working unsubscribe; SPF, DKIM and DMARC pass.
- Terms, privacy, subprocessor list and refund policy are published; cookie consent works; a GDPR request has a documented path.
- WCAG 2.2 AA audit passed on landing, orb intake, teaser and dashboard; the non-voice path is complete.
- Error and uptime monitoring are live with a public status page; the audit log records impersonation, refunds and deletions.
- The admin funnel and retention dashboards are live.

---

## 24. COMPETITIVE POSITION

JobUp sits at the intersection of three markets that today have almost no overlap: **career tooling** (trackers, matching, tailoring), **application automation** (autofill and auto-apply), and **personal professional identity** (a website and a findable presence). Nobody occupies that intersection. That is the opportunity and also the reason the roster below is wider than a job-board comparison would suggest.

### 24.1 The ten to watch, ranked by threat to JobUp specifically

| # | Competitor | Category | Approx. price | Why it matters to us |
|---|---|---|---|---|
| 1 | **Teal** | Tracker + AI resume | ~29/mo | Closest *positioning* — sells itself as a career platform, not a tool. Strong brand, deep tracker, keyword-optimizing resume builder, Chrome extension. The comparison a prospect will make. |
| 2 | **Jobright** | AI matching + advisor | 20-40/mo | The most direct overlap with our **Opportunity Hunter**: resume-based matching with scores, plus autofill and per-job resume tailoring. If anyone ships a personal site next, it is probably them. |
| 3 | **Simplify** | Autofill | Free / ~40/mo | The autofill benchmark — ~90% ATS form coverage, drafts screening answers. Sets the bar our extension (section 12) is measured against. |
| 4 | **Huntr** | Tracker | Free tier / paid | 100 tracked jobs and **unlimited autofill free**. The hardest competitor at the entry point, because our entry point costs 97. |
| 5 | **Kickresume** | Resume + website | ~19-25/mo | **The only mainstream product already doing resume → personal website in one click.** A direct hit on our differentiator — but static, with no agents, no job engine, no structured data, no address of their own. |
| 6 | **Jobscan** | ATS scoring | ~50/mo | Owns ATS keyword matching as an entire product. Our section 11.3 is a feature; for them it is the company. |
| 7 | **LinkedIn Premium Career** | Incumbent | ~40/mo | The real "why wouldn't I just…" objection. Everyone already has an account. We must never position against LinkedIn — we connect to it (section 16, row 4). |
| 8 | **Careerflow** | LinkedIn optimization + tracker | ~30/mo | Overlaps the **Professional Presence Agent** — profile optimization, personal branding, tracking. |
| 9 | **JobCopilot** | Auto-apply | ~0.93/day (~340/yr) | The strongest pure auto-apply agent. Represents the category we deliberately will not enter (section 11.4). |
| 10 | **Wix / Squarespace AI** | Website builder | ~16-25/mo | The substitute for our personal-site pillar. Far more design power, zero career intelligence — no matching, no agents, no machine-readable identity. |

**Also tracked:** Resumly (free auto-apply tier), LazyApply, Sonara, Massive, LoopCV, Rezi, Enhancv, Resume Worded.

### 24.2 Three findings that should shape the product

**1. The auto-apply category has a trust problem, and that is an asset.** LazyApply and Massive both sit below 2.5/5 on Trustpilot with documented reliability and refund complaints; Sonara's own pitch concedes it sends the same untailored resume everywhere. Our section 11.4 rule — the platform never submits, the human always clicks — was written as a compliance constraint. **It is also the clearest trust message available in this market.** Say it on the landing page and in the FAQ, plainly: *JobUp never applies on your behalf. You review and submit every application yourself.*

**2. The personal-website thesis is validated but barely served.** Employers overwhelmingly look candidates up online, and Kickresume is the only career product treating a personal site as part of the offer — as a static one-click export. Nobody pairs the site with a live job engine, agents that maintain it, or a machine-readable identity. That gap is the product.

**3. We are the cheapest by a wide margin, which cuts both ways.** The category runs 20-40 USD per month; several auto-apply services exceed 300 a year. At 97 a year we undercut everyone. With the section 11 table stakes in place that reads as value; without them it reads as a cheap tool.

### 24.3 The race that actually decides this

Two moves are each about a quarter's work: **Teal or Jobright adding a personal website**, or **JobUp adding autofill**. We are already doing ours (sections 11 and 12). The strategic priority is to be far enough ahead on the identity layer — real address, live agents, structured data, indexable role pages — that a static site bolted onto a tracker does not read as equivalent.

**What we ship that no competitor does:** voice-orb intake; a personalized teaser and simulator as the sales mechanism; a personal web address and a real, agent-maintained website; a machine-readable identity layer (resume.json, JSON-LD, agent card, MCP); role-targeted indexable pages; consent-gated outbound broadcasting; and eight ATS connectors with guessed-token quarantine. **This is the moat — do not let parity work erode it.**

**Still deferred to v2:** registered `.com` domains, a genuine free tier, interview preparation, salary data, referrals, 2FA, and the Wikidata entity dossier.

---

## 25. THE RULE THAT GOVERNS EVERYTHING

Nothing about a person may live in code. No hardcoded name, slug, role, country, employer or biographical fact in engine logic. Adding a subscriber is data entry: parse the resume, create the profile, provision the address. Zero code edits, zero redeploys, zero new environment variables per person. The SIT provisions a throwaway subscriber end to end to prove it.

This rule already governs the donor engine. JobUp inherits it. Any design decision that violates it is wrong, however convenient it looks.
