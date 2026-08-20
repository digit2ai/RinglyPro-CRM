# BUILD BRIEF — OrbUp growth upgrade: free tier that ships, shareable proof, SEO content, follow-up

Run with `/ringlypro-architect loop`.

## 0. Target and ground rules

Target: the OrbUp ecosystem in `RinglyPro-CRM` — landing pages `orbup.html` / `orbup-es.html`,
credit engine `digit2ai-projects/src/services/orbupCredits.js`, billing `.../routes/orbupBilling.js`,
teaser + Studio `.../routes/teasers.js`, app viewer `.../routes/orbupApps.js`,
Growth vertical `verticals/growth/`.

Detect the files, the existing CSS variables and the i18n mechanism yourself before writing anything.
Do not create new pages where a section will do, and do not restyle what is already there — inherit the
dark-navy / glowing-orb language, spacing scale and tokens already in the files.

**Non-negotiables**

- Do NOT break: the tap-the-orb voice flow, the "Ask OrbUp to build" input, the anonymous-build →
  claim-on-signup path, or the Plan Copilot change-highlighting. Regression-test each after every increment.
- Multi-tenant by default: every new table carries `tenant_id`, every query is scoped by it.
- Ownership is never inferred from a typed email. Anything that attaches a project to a person goes
  through `orbup_project_owners` from a verified session, as `POST /orbup/claim` already does.
- Bilingual EN/ES on all new copy. Proper Spanish orthography (tildes, ñ). No emojis anywhere.
- **`EMAIL_AUTOSEND_DISABLED` is ON by default and must stay honored.** No server-initiated send may be
  added that bypasses it. See section 4 for what to build instead.
- Mobile-first: verify every new surface at 390px, 768px and 1440px.
- Numbers shown to a customer must be asserted against the engine that charges them. If the page says a
  figure, a test proves the cost table agrees. This already exists for the credits table — extend it, do
  not weaken it.
- Continuous deploy: commit and push each working increment. Do not batch one push at the end.

---

## 1. Make the Free tier ship exactly one thing

**Problem.** Free is 1,500 credits. A Simple solution is 1,200 to plan and 4,200 to deliver — so a free
user can plan one small thing and deliver nothing. We just removed the signup wall; without this they
clear that wall and hit a second one a minute later. A free tier nobody can complete converts nobody.

**Build.**

- Raise `PLANS.free.credits` to **6,000** in `orbupCredits.js`. That is one Simple MVP delivered
  (5,400 all-in) with 600 to spare for a Copilot round.
- The Free monthly grant, the signup grant and the refill path must all reflect it. Confirm the ledger
  still derives the balance and that `refill()` sets rather than adds.
- Update every place the old figure is stated: the pricing card, the "What one month can actually
  deliver" card, and any copy that says Free delivers nothing. The Free card must now honestly read that
  it delivers one Simple MVP.
- Existing free accounts: grant the difference once, through the ledger with a stable idempotency key so
  a re-run cannot double-grant. Do not mutate balances directly.

**Guard.** 6,000 free credits with no card is a farm target. Ship with:
- email verification required before the second month's grant (first month grants on signup),
- one account per verified email (unique index already exists — assert it),
- a disposable-domain blocklist,
- per-IP signup throttling using the existing `ip_hash` pattern, never a raw IP.

State in the Build Report whether stronger gating is warranted at this credit level.

**Done when.** A brand-new free account can take one Simple solution from brief to delivered MVP without
paying, the ledger balances, and the page figures reconcile against the cost table in both locales.

---

## 2. Turn 76 dead links into proof and distribution

**Problem.** Every teaser, simulator and generated app is a shareable magic link — 76 of them exist and
none of them work as marketing. Pasted into Slack, WhatsApp or LinkedIn they render as a bare URL. There
is no public evidence that OrbUp has ever built anything, while the landing page shows a *mock* phone
simulator as proof.

**Build.**

- **OG + Twitter cards** on the teaser, simulator and `/app/:token` viewer routes: real title, real
  description drawn from the project, `og:image`, `twitter:card=summary_large_image`, canonical.
- **A generated OG image per build** — dynamic SVG rendered server-side (project name, one line of the
  plan, the OrbUp mark, brand gradient). No headless browser, no external service.
- **A share step after a build completes**: "Share this build" with copy-link, and native share on
  mobile via `navigator.share` where available.
- **A public gallery** at `/orbup/built` (EN) and `/orbup-es` equivalent, listing builds whose owner has
  **explicitly opted in**. Default is private — never list a build without an opt-in stored per project.
  Show project name, one line, the shareable link. Add it to `sitemap.xml`.
- Replace or demote the fake phone simulator on the landing in favour of real builds once the gallery
  has enough entries; keep the simulator if the gallery is thin, and say which you chose and why.

**Privacy.** These links are unlisted, not secret — the privacy policy already says so. The gallery must
not change that contract silently: opt-in is per project, revocable, and revoking removes it from the
gallery and the sitemap on the next render.

**Done when.** Pasting a build link anywhere renders a card with a real image, the gallery lists only
opted-in builds, revoking removes one, and no un-opted build is reachable from any public index.

---

## 3. Start the SEO machine that is already built

**Problem.** The Growth vertical has content agents, a publishing pipeline, a host-aware blog, a
sitemap and a site auditor — and **one published post**. Search Console is now verified and the
technical layer is correct (canonical, hreflang, sitemap). Nothing will rank without pages.

**Build.**

- Run the Growth `seo.audit` and `content.draft` agents against the OrbUp brand and produce a
  **12-post plan** targeting real intent: "AI receptionist for small business", "build an app without
  code", "how much does a custom CRM cost", "AI app builder for [vertical]", and the Spanish equivalents.
- Draft and publish **at least 4 posts**, EN with ES counterparts, through the existing
  `POST /api/v1/drafts/:id/publish` pipeline into `gr_posts` so they render at `/blog` and enter the
  sitemap automatically.
- Every post must be **honest**: no invented case studies, no fabricated customer names, no traction
  claims that are not true. Where a real build can be cited, link the shareable artifact from section 2.
- Internal links: each post links to the landing and to one relevant legal or pricing anchor.
- Add `Article` JSON-LD, `author`, `datePublished`, and hreflang pairs for the ES versions.

**Done when.** `/blog` lists the posts on the OrbUp host, they are in `sitemap.xml` with lastmod, the ES
versions are declared reciprocally in hreflang, and every factual claim traces to something real.

---

## 4. Follow up with the people who already built something

**Problem.** 38 people built a plan and never heard from us again. SendGrid is configured.

**Constraint that decides the design.** `EMAIL_AUTOSEND_DISABLED` is ON by default across
`digit2ai-projects` because SendGrid mail was landing in spam and the owner reviews and sends manually.
**Do not add another server-initiated send.** Build the queue, not the cannon.

**Build.**

- A **follow-up queue**: for each project with no activity in N days, generate a drafted, personalized
  message (their project name, the wedge from their plan, the link back to their Studio) into a review
  table with `tenant_id`.
- An owner review surface listing drafts with edit-in-place, plus **Approve** and **Send via Apple Mail**
  (the existing mailto / magic-link helper pattern) so a human sends it.
- Record a consent snapshot per send, exactly as the Marketer does. Respect quiet hours.
- If — and only if — the owner explicitly sets a new opt-in env var, allow automated sending; default off,
  and say so in the Build Report and the env documentation.

**Done when.** Drafts appear for stale projects, the owner can edit and send one by hand, nothing is sent
by the server without the explicit opt-in, and `EMAIL_AUTOSEND_DISABLED` still governs everything else.

---

## 5. Order of work

1. Free tier (section 1) — smallest change, biggest unblock, and it compounds with the wall we removed.
2. Shareable proof (section 2) — turns existing artifacts into distribution.
3. Follow-up queue (section 4) — recovers people already in the funnel.
4. SEO content (section 3) — slowest to pay off, so start it early but land it last.

---

## 6. Acceptance criteria — all green before the loop exits

- A new free account delivers one Simple MVP end to end without paying; ledger reconciles; no
  double-grant on a re-run of the backfill.
- Every customer-facing figure is asserted against the cost table, in EN and ES.
- A build link pasted externally renders a card with a generated image.
- The gallery lists only opted-in builds; revoking removes it from gallery and sitemap.
- At least 4 posts live on the OrbUp host, in the sitemap, hreflang-paired, every claim true.
- Follow-up drafts exist for stale projects and nothing sends itself.
- Anonymous build → claim-on-signup still passes; orb, input, Copilot highlighting all still work.
- Health endpoint green, no new errors on the debug endpoint after deploy.
- 390 / 768 / 1440px verified on every new surface.

---

## 7. Build Report

Report: the bench of specialists activated; every component shipped with absolute local paths; migrations
run; env vars added and where they must be set; the credit figures before and after with the backfill
count; posts published with URLs; commit SHAs and live verification; and any blocked item with the exact
secret or credential needed to unblock it.

## 8. Decide and flag, do not stop for these

- **Free at 6,000 credits** is roughly 1.3x the all-in cost of one Simple MVP. State what that costs us in
  real Anthropic spend per free user per month, and recommend whether 6,000 is sustainable or should be
  4,800 (exactly one MVP, no slack).
- **Pro is still the worst credits-per-dollar tier** (602/$ against Plus at 714/$). Recommend a figure.
- **The gallery may be thin at launch.** If fewer than 6 builds opt in, say so and recommend whether to
  seed it with our own builds, clearly labelled as ours.
