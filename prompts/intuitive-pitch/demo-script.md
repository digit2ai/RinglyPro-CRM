# SurgicalMind — 5-Minute Live Demo Script (Intuitive Pitch)

**Goal:** In 5 minutes, prove that SurgicalMind ships every step beyond ThoughtSpot's natural-language Q&A — research, analysis, presentation, surgeon survey, business plan, tracking, executive PDF — and that all of it is already deployed at [surgicalmind.app/intuitive](https://www.surgicalmind.app/intuitive).

**Audience cue:** Decision-maker for the Snowflake + ThoughtSpot AI sales-rep pilot.

---

## Pre-demo (do this before the meeting)

1. Have the live URL open in a clean Chrome window: `https://www.surgicalmind.app/intuitive`
2. Be already signed in. (Login flow is fine but burns 20 seconds.)
3. Pre-pick a hospital from the dashboard with rich data — **Tampa General Hospital** is the recommended demo subject (FL, academic, 250 beds, deep procedure mix, robotic program already established, Greg's home territory).
4. Open a second tab to a sample SendGrid inbox (your own email) so when you trigger the survey send, the email lands visibly during the demo.

---

## Minute 1 — The dashboard (0:00 → 1:00)

**Action:** Open `surgicalmind.app/intuitive`. Land on the Sales Operations Dashboard.

**Say:**
> "This is what 13 of our pilot hospitals look like in production today. Total Hospitals 13. Pending Actions 8. Active Surveys 0. Plans Tracking 0 — we have not turned on every workflow yet for every hospital. Filter by stage — Planning, Analyzed, Proposed, Won. Sort by beds, by stage, by pending action. This view replaces what your reps build in Excel."

**Click:** the **AdventHealth Wesley Chapel** row's "View Analysis" button.

---

## Minute 2 — Hospital intake + auto-research (1:00 → 2:00)

**Action:** Land on Hospital Intake page. Type **"Tampa General Hospital"** into the AI Business Analyst input and click **Generate Report**.

**Say while the agent runs:**
> "Reps don't fill in 60 fields by hand. They type the hospital name. The Business Analyst Agent — Claude Sonnet 4 with our 4-pass maker-checker pipeline — pulls CMS data, the hospital's annual report, web research on robotic program status, surgeon roster from public sources, payer mix. Specialty percentages reconcile to 100. Bed count ties to licensed beds, not staffed. This takes about 90 seconds."

(If you want a faster demo, the hospital is already pre-loaded — skip the wait. Click the Tampa General row in the dashboard instead.)

**Land on the populated Intake form.**

> "Here's the result. 1,037 beds. 28,000 annual surgical volume. Specialty mix: urology 18%, gynecology 22%, general 31%, etc. Note the **Limited fidelity** banner at the top — there are no surgeon survey responses yet, so we flag any analysis as preliminary. Reps know not to walk into a CFO meeting until step 2 is done."

**Click sidebar item 2 — Surgeon Surveys.**

---

## Minute 3 — Surgeon survey distribution (2:00 → 3:00)

**Action:** Show survey list (or create a new survey if none exists). Click into a survey, show recipients.

**Say:**
> "True incremental volume only comes from surgeon commitments. Three-bucket language is non-negotiable when you're sitting across from a CFO: Conversion is open or laparoscopic moving to robotic — same revenue, better margin. Market Incremental is new cases captured from a competitor. Surgeon Incremental is new cases backed by signed surgeon commitments. Greg flagged this in our last call — calling all three 'incremental' is the fastest way to lose the room."

**Click **Send Survey**.**

> "Magic-link emails go out via SendGrid. Each surgeon gets a personalized 3-question response page — no login. When they submit, the response auto-imports into the Business Plan as a Surgeon Commitment row. No manual data entry."

**Switch to your second tab.** Show the email arriving in your inbox in real time. Click the link, scroll the response page, hit Submit.

**Switch back to the dashboard.** Refresh the Business Plan page.

> "There's the new commitment. The 'X of Y surgeons responded · N committed cases' card just updated. The plan recalculates."

---

## Minute 4 — Generate the report (3:00 → 4:00)

**Action:** Click sidebar item **8 Report**. Wait 2 seconds for aggregation.

**Say:**
> "This is what your reps walk into the CFO meeting with. Cover page — hospital name, project ID, confidentiality notice. Section 1 is the slide Intuitive cannot produce today: **The Quantified Clinical Value**. Per-hospital dollar value of robotic outcomes versus open and laparoscopic baseline. Reduced length of stay, complications avoided, readmissions avoided. All applied to Tampa General's actual case mix and payer mix. Section 3 — Cases That Change Your Top Line — three-bucket volume in print form. Section 5 — System Match — when per-procedure clinical fit and volume math diverge, we surface BOTH options. **Two paths — choose based on strategic priority.** No silent override. The CFO trusts the recommendation because the math is auditable."

**Click **Print / Save as PDF**.**

> "Browser-native PDF. Helvetica Now Display matches Intuitive brand. US Letter, page-break-per-section. The CFO has it on their iPad before the rep leaves the parking lot."

---

## Minute 5 — The punchline (4:00 → 5:00)

**Close the PDF viewer. Return to the dashboard.**

**Say:**
> "Quick recap. ThoughtSpot pilot's job: answer 'top-10 hospitals in Florida.' Done. Then what? Your rep still hand-builds the analysis, the presentation, the survey, the business plan, the tracking spreadsheet. Five different tools. Three weeks of work per deal."

> "SurgicalMind ships every one of those steps. One workflow. Already deployed. 13 pilot hospitals. We do everything ThoughtSpot does, **plus** the eight workflow steps after."

> "I'm proposing 60 reps for 60 days. One territory — Florida. Compare deal velocity to a matched 60-rep control group. If we don't move days-to-close by 20% and proposal hours by 30%, you don't pay anything. If we do, we transition into per-user pricing — undercutting the pilot at $75/user/month, $2.7M ARR for 3,000 reps."

> "What's the right next conversation?"

---

## Demo objection handling

**"How do you handle our Snowflake data?"**
→ Direct connector, encrypted credentials per tenant, your data never leaves your Snowflake. SurgicalMind reads via SQL views you control.

**"Can you white-label this?"**
→ Yes. Tenant theming swaps logo, color, and font stack. We can spin up an "Intuitive Insights" instance in 5 days. Wave 4 of our build plan covers this. (Show it's mapped: open Wave 4 docs if asked.)

**"Compliance?"**
→ Multi-tenant isolation at the application layer, encryption at rest and in transit, no PHI required for the sales workflow (procedure counts, not patient identifiers). SOC 2 Type II audit in progress, expected Q3 2026. We can run on Intuitive's AWS / Azure environment if required.

**"How does this integrate with our existing CRM (Salesforce)?"**
→ REST APIs, webhook on every state change. We push hospital records and stage transitions to Salesforce; we don't replace it.

**"Why not build this internally?"**
→ You can. Greg's team is already 6 months into the pilot and at slide 1. Building the remaining 8 steps takes 18–24 months and a 12-person team. We've already shipped them. Buy our 12 months of head start; redirect the internal team to the differentiation that only Intuitive has — clinical evidence library, instrument data, surgeon training network.

---

## Materials at hand during the demo

- Live URL: surgicalmind.app/intuitive (the demo itself)
- One-pager: `prompts/intuitive-pitch/differentiation-onepager.md`
- Positioning deck: `prompts/intuitive-pitch/positioning-deck.md`
- Greg's testimonial line (verbal): "pretty fucking awesome" / "perhaps the most important slide"
- Pricing table (Slide 6 of positioning deck) — print and hand over

---

## What success looks like

- Decision-maker schedules a 30-min working session within 7 days
- Greg gets pulled in for a joint Florida-territory pilot scoping call
- 60-day pilot agreement signed within 30 days
- First 60 reps onboarded within 60 days

If the meeting ends without a follow-up scheduled, the pitch failed. Always close with a specific next step on a specific date.
