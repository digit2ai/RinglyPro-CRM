# SurgicalMind for Intuitive — Positioning Deck

**Audience:** Internal Intuitive Surgical decision-maker for the Snowflake + ThoughtSpot AI sales-rep pilot
**Author:** Digit2AI (Manuel Stagg, CEO)
**Length:** 6 slides + appendix
**Format:** Drop content into Keynote / Google Slides / your existing Intuitive template; use Helvetica Now stack to match brand

---

## Slide 1 — The Internal Sales Intelligence Problem

**Headline:** Your reps already know the question. They need a system that can answer it end-to-end.

**Body:**
- 2,000–3,000 commercial reps across the US robotic surgery field force
- Current Snowflake + ThoughtSpot pilot: roughly **$100/user/month**, projecting **$2.4M–$3.6M ARR** at full rollout
- What the pilot ships today: natural-language Q&A — “show me top-10 robotic candidates in Florida,” “which hospitals have the most pending da Vinci proposals”
- What the pilot does **not** ship: anything past slide 1. Reps still hand-build the business case, the CFO presentation, the surgeon outreach, and the deal-tracking spreadsheet
- Greg Eriksen called the demo he saw last week “basic shit” — accurate. It’s a query layer, not a sales workflow.

**Sub-headline:** ThoughtSpot stops at the question. The deal needs an answer.

---

## Slide 2 — What Reps Actually Need (the workflow gap)

**Headline:** From the question to the signed contract — one workflow, not seven tools.

**The reality on the ground (per Greg's coaching last week):**
1. Identify candidate hospitals (procedure volume, payer mix, surgeon roster)
2. **Trust → Belief → Value → Outcome** — the wave a deal must ride
3. Get the customer’s data (the hardest step every time — multiple internal sign-offs)
4. Build the analysis (procedure pareto, capacity model, financial deep dive)
5. Match the right system (DV5 / Xi / X / SP — clinical fit AND volume math, reconciled)
6. Generate the **CFO-grade proposal** (the slide every executive committee asks for)
7. Send the surgeon survey — the only credible source of incremental volume
8. Build the business plan + clinical dollarization
9. Track plan vs. actuals after placement

**Today:** Snowflake answers step 1. Reps freelance steps 2–9 in PowerPoint, Excel, Outlook, and field notes.

**Tomorrow:** SurgicalMind ships all 9 in one product, pre-integrated.

---

## Slide 3 — SurgicalMind: Already Built, Already Live

**Headline:** This is not a prototype. It’s deployed.

**Live URL:** [surgicalmind.app/intuitive](https://www.surgicalmind.app/intuitive)

**What you can demo today (no slides — the actual product):**
- 13-hospital sales operations dashboard with stage filters (Planning / Analyzed / Proposed / Won)
- AI Business Analyst Agent (Claude Sonnet 4): type a hospital name → full intake auto-populated from CMS data + annual reports + web research
- 16 analysis modules: procedure pareto + ABC, monthly seasonality, weekday distribution, peak-hour capacity model, design day, robot compatibility matrix, financial deep dive, growth scenarios, risk assessment
- System Match with two-path reconciliation: clinical fit (per-procedure scoring) AND volume math, surfaced together so the customer can choose based on strategic priority
- Auto-generated CFO presentation (HTML deck with Rachel voice AI narration) and full executive PDF report
- Business Plan builder with **clinical outcome dollarization** — peer-reviewed evidence applied to the hospital’s own case mix to generate a per-hospital dollar value (Greg called this "perhaps the most important slide" because Intuitive cannot produce it today)
- Surgeon Survey distribution: magic-link emails via SendGrid, public response page, **auto-import into Business Plan** as signed Surgeon Commitment rows on submit
- Proforma vs Actuals tracking after system placement
- Voice agents (Rachel English / Ana Spanish / Lina bilingual) for outbound calls and inbound demo discovery

**Stack:** Node.js + Express + PostgreSQL on Render, React + Vite dashboard, Anthropic Claude Sonnet 4 for AI research, ElevenLabs for voice, SendGrid for email. Already multi-tenant.

---

## Slide 4 — Capability Comparison

| Capability                                                       | Snowflake + ThoughtSpot pilot | SurgicalMind |
|------------------------------------------------------------------|:-----------------------------:|:------------:|
| Natural-language Q&A on hospital data                            | Yes                           | Yes          |
| Hospital ranking / lead scoring                                  | Yes                           | Yes          |
| Auto-research a new hospital from name (CMS + web + AR)          | —                             | Yes          |
| Per-procedure clinical fit scoring (DV5 / Xi / X / SP)           | —                             | Yes          |
| Volume-math + clinical-fit reconciliation (TWO PATHS card)       | —                             | Yes          |
| Peak-hour capacity model (systems-needed math)                   | —                             | Yes          |
| Procedure pareto + ABC classification                            | —                             | Yes          |
| Auto-generated CFO presentation (HTML + voice narration)         | —                             | Yes          |
| Executive PDF report (Helvetica Now, print-ready)                | —                             | Yes          |
| Surgeon survey distribution (email magic-links)                  | —                             | Yes          |
| Public surgeon response page (no login)                          | —                             | Yes          |
| Auto-populate Business Plan from survey responses                | —                             | Yes          |
| **Clinical outcome dollarization (per-hospital $)**              | **—**                         | **Yes**      |
| Three-bucket CFO volume language (conversion vs incremental)     | —                             | Yes          |
| Plan-vs-actuals proforma tracking                                | —                             | Yes          |
| Voice AI for outbound rep follow-up                              | —                             | Yes          |
| White-label theming (rebrand as Intuitive Insights)              | —                             | Yes (planned, ~5 days) |

**Summary line:** ThoughtSpot delivers query. SurgicalMind delivers the deal.

---

## Slide 5 — Deployment Model

**Headline:** Your data stays in your Snowflake. SurgicalMind makes it actionable.

**Architecture:**
1. **White-label as "Intuitive Insights"** (or chosen brand). Custom logo, color palette (Intuitive blue #0066B2), font stack matched to intuitive.com.
2. **Single sign-on** with Intuitive identity (Okta / Azure AD / Ping). Rep authentication is your existing IdP.
3. **Snowflake stays in place. SurgicalMind reads via direct connector** — encrypted credentials per tenant, audit-logged queries. We do not copy, mirror, or warehouse Intuitive data outside Intuitive's environment.
4. **Same data, different surface.** ThoughtSpot returns Snowflake answers as a chart. SurgicalMind takes the same answer and folds it into a populated Hospital Intake form, runs 16 analyses on top of it, generates the CFO deck, sends the surgeon survey, builds the proforma, and tracks the deal.
5. **The Snowflake-augmented Hospital Intake briefing.** When a rep types a hospital name, the agent merges public sources (CMS, web, reference data) with Intuitive's own warehouse: prior proposals, system installed-base, surgeon training history, service contract status, last meeting notes. The output is the briefing the rep wishes they could walk into a meeting with — not just public facts, Intuitive's institutional memory of the account on one screen.
6. **AI research, presentation generation, surgeon survey, business plan, tracking, executive PDF, voice AI, Neural Intelligence** — these are SurgicalMind features rolled in with no additional Intuitive build effort.
7. **Compliance:** PHI-aware, SOC 2 Type II posture (in progress), all data encrypted at rest and in transit. Tenant isolation enforced at the application layer. Snowflake credentials encrypted with a tenant-specific key.

**Timeline to first production rep cohort:** 30 days. (Shorter if Intuitive provides Snowflake credentials and IdP federation in week 1.)

---

## Slide 6 — Commercial

**Headline:** Undercut the pilot pricing, deliver 10× the workflow.

### Option A — Per-user (recommended)
- **$75/user/month**, 3-year term
- 3,000 reps × $75 × 12 months = **$2,700,000 ARR**
- Includes: full SurgicalMind feature set, white-label, SSO, Snowflake connector, support, onboarding
- Compares favorably to ThoughtSpot pilot at $100/user — and ships every workflow step beyond Q&A

### Option A2 — Tiered per-user
- $50/user/month for read-only / Q&A users
- $125/user/month for Power users (full presentation + business plan + survey)
- Mix of 60/40 → $80 blended × 3,000 = **$2,880,000 ARR**

### Option B — Per-deal
- $5,000/deal flat fee for any hospital that gets a SurgicalMind-generated proposal
- Intuitive closes ~600 system placements/year → **$3,000,000 ARR** baseline
- Aligns vendor cost with rep success, predictable per-territory budget

### 60-day proof
- Pick **50 reps** in one territory (suggest Florida — high da Vinci density, strong competitive set)
- Measure: **deal velocity** (days from first contact to signed contract) vs. matched control group of 50 reps using current tools
- KPI: target **20% reduction in days-to-close** and **30% reduction in proposal preparation hours**
- Cost: $0 for the 60-day pilot. If KPIs hit, transition to one of the commercial options above.

---

## Appendix — Why This Conversation, Why Now

- Greg Eriksen (Area Sales Manager, Florida) demoed SurgicalMind last week. His exact words on the auto-generated CFO presentation: **"pretty fucking awesome."** On the clinical dollarization slide specifically: **"perhaps the most important slide"** because Intuitive cannot produce that today.
- Greg has offered to put Digit2AI in front of the Intuitive decision-maker for the Snowflake + ThoughtSpot pilot before Intuitive commits internally to that path.
- This deck exists to make that conversation efficient. Everything in slides 3 and 4 is verifiable in five minutes at [surgicalmind.app/intuitive](https://www.surgicalmind.app/intuitive).

---

**Next step:** 30-minute working session with the Intuitive AI program owner. Live demo, not slides.

**Contact:** Manuel Stagg, CEO, Digit2AI · digitalinformation2ai@gmail.com
