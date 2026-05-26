# Prompt — SurgicalMind / Intuitive: "How to Read This Page" Notes on Every Page

**Agent:** `ringlypro-architect`
**Mode:** Autonomous. Per the project AUTO-APPROVAL DIRECTIVE, do not ask questions, do not request confirmation, do not use AskUserQuestion or EnterPlanMode. Execute end-to-end: read code, edit, build, commit, push, report results after completion.

---

## Objective

Add a clear, plain-language **"How to Read This Page"** explanatory note to the **bottom of every page** of the Intuitive / SurgicalMind dashboard (`verticals/intuitive/dashboard`). The goal: during a live demo or when a client opens any screen, **any non-technical audience member (hospital executive, CFO, surgeon, administrator) can understand what the page answers, what each number means, where the data comes from, the formula behind it, and the assumptions used** — with zero prior context.

This eliminates the kind of misunderstanding we hit with "incremental" vs "conversion": the same word meant different things on different pages and confused the audience. Every note must make provenance and definitions unambiguous.

## Non-negotiable principle: notes must be ACCURATE to the code

Do **not** guess what a page computes. For **each page**, first open its React component in `verticals/intuitive/dashboard/src/pages/` AND its backing API/service in `verticals/intuitive/src/services/` and `verticals/intuitive/src/routes/`, and trace exactly:
- which data source each number comes from (public CMS data, NPI registry, surgeon commitments, the analysis cache, the business plan, published benchmarks, user intake, etc.),
- the exact formula/assumptions used,
- any benchmark constant and its cited source.

The note text must reflect what the code actually does. If a number is display-only, say so. If an assumption is hard-coded (e.g., 14% OR efficiency, 2.5-day LOS delta, 35% contribution margin, 15% conversion), state the value and its source.

---

## Deliverable 1 — One reusable component

Create a single reusable component `verticals/intuitive/dashboard/src/components/PageNotes.jsx` (create the `components/` folder if needed). Requirements:

- Renders a consistent styled box matching the existing dark theme used across pages: container `mt-8 bg-slate-800/40 border border-slate-700 rounded-lg p-5 text-sm text-slate-300 leading-relaxed`; an uppercase cyan eyebrow label `text-[10px] uppercase tracking-widest text-cyan-300 font-bold mb-2`; white emphasis via `text-white font-semibold`; money/positive accents in `text-emerald-300`, revenue/financial in `text-amber-300`, warnings/"do not count" in `text-red-300`.
- Props: `title` (string, e.g., the page name), and `children` (the note body) OR a structured `sections` array — your call, but keep it simple and consistent.
- Always renders the heading in the form: **"How to Read This Page · {title}"**.
- Mobile-friendly (it already inherits the page container width).

Refactor the **existing** ClinicalOverlayPage note (already added at the bottom of `ClinicalOverlayPage.jsx`) to use this new `PageNotes` component, preserving its current content (the two-senses "incremental" explanation). All other pages get a new note via the same component.

## Deliverable 2 — A note at the bottom of every page

Place `<PageNotes>` at the **bottom of each page's main content, immediately above the page's navigation buttons** (the `flex justify-between` next/back row), so it's the last thing the audience reads before moving on. Pages without nav buttons: put it at the very end of the content.

Apply to all 21 pages:

| Page file | Route | What the note must explain (trace the real source first) |
|---|---|---|
| `DashboardPage.jsx` | `/` | What the project list is, that it's the entry point, where projects come from (intake). |
| `IntakePage.jsx` | `/intake` | This is data ENTRY by the rep; which fields are user-entered vs auto-enriched (NPI registry, CMS Hospital Compare, etc.). |
| `AnalysisPage.jsx` | `/analysis` | Utilization forecast / volume projection / model matching come from the analysis engine + intake volume; list the key assumptions. |
| `RecommendationsPage.jsx` | `/recommendations` | System recommendation logic (system-matcher): how system count is derived; note conversion-opportunity basis. |
| `HospitalProfilePage.jsx` | `/hospital-profile` | Strategic Impact 8 metrics, Capital Snapshot, AMP peer benchmark, research — cite hospital-profile-service formulas; clarify **Incremental Cases = net-new from surgeon commitments**, and the "(Conversion)" LOS line = derived subset. |
| `MarketProfilePage.jsx` | `/market-profile` | Market/demographics source. |
| `SurgeonProfilePage.jsx` | `/surgeon-profile` | Per-surgeon data source (NPI, volumes). |
| `SurgeonTargetingPage.jsx` | `/surgeon-targeting` | How targets are scored/ranked (surgeon-targeting-service). |
| `SurgeonCommitmentsPage.jsx` | `/commitments` | **The canonical source of "Incremental" (net-new revenue volume)**; commitment categories (e.g., pull-forward, recruited, growth); this feeds the Business Plan revenue. |
| `ClinicalOutcomesPage.jsx` | `/clinical-outcomes` | Clinical dollarization per outcome (clinical-outcomes-service); cost avoidance from peer-reviewed deltas. |
| `ClinicalOverlayPage.jsx` | `/clinical-overlay` | ALREADY DONE — just refactor to use `PageNotes`. Keep the two-senses incremental/conversion explanation. |
| `RoboticsProgramPage.jsx` | `/robotics-program` | Robotics program build (robotics-program-service). |
| `BusinessPlanPage.jsx` | `/business-plan` | Proforma IRR/NPV/payback: margin on incremental (surgeon-commitment) revenue, ramps, hurdle rate; clinical savings reported separately. |
| `ExecutiveBriefPage.jsx` | `/executive` | This is a COMPOSITE — it pulls the same canonical figures from the pages above (cite which). |
| `ExecutivePresentationPage.jsx` | `/executive-presentation` | Composite/presentation; same canonical sources. |
| `PresentationPage.jsx` | `/presentation` | Presentation deck source. |
| `ReportPage.jsx` | `/report` | Full report aggregation. |
| `TrackingDashboardPage.jsx` | `/tracking` | Post-sale performance tracking (performance-tracking-service): actuals vs plan. |
| `SurveyManagerPage.jsx` | `/surveys` | Surgeon survey source / magic links (SendGrid). |
| `RecommendationsPage` / `AskPage.jsx` | `/ask` | AI assistant — answers are generated from the project's real data (grounded), state that clearly. |

(If any page is trivial/login, e.g., `LoginPage.jsx`, skip it. Verify the actual list in `App.jsx` routes.)

## Note content template (every note follows this shape, in plain English)

Keep each note to ~4–7 short lines or a few bullets. Use this structure:

1. **What this page answers** — one sentence in plain language.
2. **Where the numbers come from** — name the real data sources (e.g., "public CMS Hospital Compare data," "the surgeons' own committed volume," "the Business Plan proforma," "peer-reviewed published benchmarks"). Distinguish **real/entered data** vs **modeled/assumed**.
3. **The key formula(s)** — written so a non-technical person follows it (e.g., "open cases × 15% conversion × days saved per case").
4. **Assumptions & benchmarks** — list any hard-coded factor and its source.
5. **Plain-language bottom line** — what the audience should take away (and, where relevant, whether it's **money saved (cost avoidance)** vs **money earned (new revenue)**).

## Deliverable 3 — Consistent global glossary (use identical wording everywhere)

Define these canonical terms once and use them the same way in every note (this is what prevents the misunderstanding):

- **Conversion** = an existing **open** surgery switched to da Vinci (same case, different technique). Value = **clinical cost avoidance** (bed-days saved, fewer complications). No new volume, no new revenue.
- **Incremental (net-new)** = **additional** cases surgeons commit to bring (recruited from another hospital, or grown practice). Value = **new revenue**. Drives IRR/NPV/payback.
- **Cost avoidance** = money the hospital **stops losing**. **Revenue** = money the hospital **earns**. They are never added into the same ROI figure.
- **LOS** = length of stay (hospital days). **OR efficiency** = operating-room time saved. **IRR / NPV / Payback** = the financial return on the capital purchase. **Contribution margin** = the profit slice of revenue used in the return.

If you find a page that uses one of these words in a conflicting sense (e.g., the Clinical Overlay "Conversion Formula" block currently labels the conversion pool as "Incremental"), do NOT silently change the calculation — instead make the note explicitly disambiguate it (as the Clinical Overlay note already does), and add a one-line `TODO:` code comment proposing the cleaner relabel for human review.

## Build, verify, deploy

1. Build the dashboard: `cd verticals/intuitive/dashboard && PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/node node_modules/.bin/vite build`.
2. Verify the build succeeds and that each note string is present in the new bundle.
3. The `dist/` folder is committed and served — `git add -A verticals/intuitive/dashboard`, commit with a clear message, and `git push origin main` (Render auto-deploys ~90s).
4. Report: list every page that received a note, the component path, and the live URL pattern (`https://aiagent.ringlypro.com/intuitive/<route>/<projectId>`).

## Acceptance criteria

- A single reusable `PageNotes` component exists and is used by every page (including the refactored ClinicalOverlay).
- Every non-trivial page renders a "How to Read This Page · {title}" note at the bottom.
- Each note is **accurate to the backing service/code** (sources, formulas, assumptions verified, not guessed).
- The glossary terms are worded identically across all notes; cost-avoidance vs revenue is always distinguished.
- Dashboard builds cleanly and is deployed.
- A short summary report is produced listing each page + what its note explains.
