# SurgicalMind vs. Snowflake + ThoughtSpot Pilot — Single-Page Brief

**For Greg Eriksen to forward internally at Intuitive Surgical**
**Prepared by Digit2AI · Live demo: surgicalmind.app/intuitive**

---

## What the Snowflake + ThoughtSpot pilot ships today

A natural-language Q&A surface over Intuitive's hospital and rep data. A rep can ask "show me top-10 robotic candidates in Florida" and get a ranked list. Then what?

Then the rep opens PowerPoint. Then Excel. Then Outlook. Then a CRM. Then a notebook with handwritten notes from the surgeon meeting. The pilot answers slide 1 of a 9-slide workflow. **Slides 2 through 9 still get hand-built per deal.**

That's $2.4M–$3.6M ARR (per current pilot pricing × full rollout) to deliver one slide.

---

## What SurgicalMind ships today (already deployed at 13 hospitals)

The same Q&A — **plus** every step after.

| Step | Snowflake + TS | SurgicalMind |
|---|:---:|:---:|
| 1. Hospital identification & ranking | ✓ | ✓ |
| 2. AI-driven hospital research (CMS + AR + web) | — | ✓ |
| 3. Procedure pareto, capacity, design-day analysis | — | ✓ |
| 4. System match (clinical fit + volume reconciliation) | — | ✓ |
| 5. Auto-generated CFO presentation (HTML + voice) | — | ✓ |
| 6. **Clinical outcome dollarization** (per-hospital $) | — | ✓ |
| 7. Surgeon survey distribution + magic-link response | — | ✓ |
| 8. Business plan with auto-imported surgeon commitments | — | ✓ |
| 9. Plan-vs-actuals proforma tracking | — | ✓ |
| Executive PDF report (Helvetica Now, print-ready) | — | ✓ |

---

## The six things SurgicalMind does that the pilot cannot

1. **Clinical outcome dollarization.** Per-hospital dollar value of robotic outcomes versus open/laparoscopic baseline — applied to that hospital's actual case mix and payer mix. *Greg called this "perhaps the most important slide" because Intuitive cannot produce it today.*

2. **Three-bucket CFO volume language.** Conversion (same revenue, margin uplift) vs. Market Incremental (NEW top line) vs. Surgeon-Committed Incremental (NEW top line, signed). The distinction every hospital CFO insists on, and the one most reps fudge.

3. **Two-path system reconciliation.** When per-procedure clinical fit (e.g. DV5 at 97/100) disagrees with volume-math fit (Xi for throughput), we surface BOTH paths side-by-side with rationale. Customer chooses based on strategic priority. No silent override. CFO trusts the recommendation.

4. **Peak-hour capacity model.** Systems-needed math constrained by actual peak surgical hours (7:30am–noon × 70% utilization), not raw OR availability. Eliminates the "4 systems for 644 cases" credibility-killer that wrecks every analysis built in Excel.

5. **Surgeon survey → business plan, automated.** Magic-link emails go out via SendGrid. Surgeon submits a 3-question response page. The Business Plan auto-creates a Surgeon Commitment row. Plan totals recalculate. Idempotent — re-submission updates without duplicating.

6. **CFO-grade executive PDF.** Browser-native print. Helvetica Now Display brand-matched. US Letter, page-break-per-section, navy table headers, tabular numerals on every financial column. The CFO has it on their iPad before the rep leaves the parking lot.

---

## Commercial — undercut the pilot, deliver 10x the workflow

- **$75/user/month**, 3-year term, 3,000 reps → **$2,700,000 ARR**
- White-label as "Intuitive Insights" — 5-day theming engagement
- SSO with Intuitive's existing IdP (Okta / Azure AD / Ping)
- Snowflake stays in place — SurgicalMind reads your data via direct connector

---

## 60-day proof — zero risk

50–60 reps in one territory (recommend Florida — high da Vinci density, strong competitive set). Matched control group of equivalent size on current tools. Compare:

- **Days from first contact to signed contract** (target: -20%)
- **Hours of rep time per proposal preparation** (target: -30%)

Pilot cost: **$0**. If KPIs hit, transition to per-user pricing. If not, walk away.

---

## What we're asking

A 30-minute working session with the Intuitive program owner for the AI sales-rep initiative — **before** Intuitive commits internally to the Snowflake + ThoughtSpot path. Five-minute live demo, twenty-five minutes of Q&A on architecture, compliance, deployment, and commercial.

**Live demo (no scheduling required):** [surgicalmind.app/intuitive](https://www.surgicalmind.app/intuitive)
**Contact:** Manuel Stagg, CEO, Digit2AI · digitalinformation2ai@gmail.com
**Channel introduction:** Greg Eriksen, Area Sales Manager — Florida
