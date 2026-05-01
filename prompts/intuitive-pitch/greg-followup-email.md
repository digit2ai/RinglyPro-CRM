# Follow-up email to Greg Eriksen — DRAFT

**To:** Greg Eriksen, Area Sales Manager — Florida, Intuitive Surgical
**From:** Manuel Stagg, CEO, Digit2AI
**Subject:** Recap from yesterday + the Snowflake intro

---

Greg,

Quick recap from our call, plus the work we shipped this week.

## What we discussed

You laid out the wave — trust → belief → understanding value → tying value to objectives — and the fact that the factory approach is fine for filling the top of the funnel but doesn't ride any one deal to crash. Fair. The three I'm picking to ride this month: PINAXIS (Austin next weekend, MVP-to-contract), CW Carriers (data-blocked between meetings 2 and 3), and the China credit union AML opportunity. I'll flag for you which one closes first.

## What we shipped from your demo notes

I went back to the SurgicalMind demo and fixed every critique you gave. All of this is live at surgicalmind.app/intuitive right now:

1. **Workflow reorder.** Surgeon Surveys is now step 2, before Analysis. The Analysis page shows a "Limited fidelity" banner when no surgeon commitments are collected yet. Reps can't accidentally walk into a CFO meeting on incomplete data.

2. **Three-bucket volume language.** Conversion (open/lap → robotic, same revenue, margin uplift only). Market Incremental (new cases captured from competitors, new top line). Surgeon-Committed Incremental (new cases backed by signed surgeon commitments). New CFO presentation slide titled "Cases That Change Your Top Line" surfaces only the two incremental buckets — that's the one you said hits hardest. The 1,759 number you flagged is now correctly labeled as conversion.

3. **Peak-hour systems-needed math.** Capacity is now constrained by peak surgical window (7:30am–noon × 70% utilization × 250 OR-days) divided by 2.5 hours/case, not raw 10-hour OR availability. The "4 systems for 644 cases" math that didn't pass the smell test is gone.

4. **Recommendation reconciliation.** When per-procedure clinical fit disagrees with volume math (DV5 at 97/100 vs. Xi for throughput), both paths surface side-by-side with rationale. No silent override. CFO chooses based on strategic priority.

5. **Seasonality demoted.** Removed from the executive presentation entirely; moved to an appendix in the report. Not exec-relevant — your call.

6. **Clinical dollarization promoted to slide 2.** Right after the hospital profile, before procedure pareto. New title: "The Quantified Clinical Value — What Intuitive Cannot Show You Today." That's the slide you said is perhaps the most important; it now anchors the deck.

7. **Surgeon survey emails.** SendGrid is wired. When a survey gets sent, magic-link emails actually go out to surgeons. When they submit, the response auto-imports into the Business Plan as a signed Surgeon Commitment row. The "true incremental from surgeon commitments" number is now backed by data, not a hand-wave.

8. **Competitor data fix.** Florida hospitals now correctly include Moffitt, Tampa General, AdventHealth Orlando, Mayo Jacksonville, Cleveland Clinic Florida, Memorial Regional, HCA Florida network, UF Health. Curated installed-base seed list across 10 states. Surfaces in the Hospital Profile section of the report under "Competitive Landscape."

Everything in points 1–8 is live in production right now. Same URL.

## The Snowflake / ThoughtSpot opportunity

This is the one I want to talk about. You said the demo you saw was "basic shit" — answering questions like top-10 hospital lists. SurgicalMind already does that AND ships every step after — full assessment, business plan, presentation, surgeon survey, executive PDF, plan-vs-actuals tracking. At the pilot's pricing it's $2.4M–$3.6M ARR for a query layer; we'd undercut at $75/user/month for the full workflow ($2.7M ARR at 3,000 reps).

You said you could get me in front of the person making the decision. Three questions:

1. **What's the timeline?** When is Intuitive committing internally to Snowflake + ThoughtSpot vs. exploring alternatives? I want to be early enough to matter.
2. **Who's the right name?** AI program owner? VP Commercial Operations? CIO? Tell me whose calendar to chase.
3. **Do you want to be in the meeting?** Your testimony — "pretty fucking awesome" plus the "most important slide" — is a stronger opener than anything I can say. Joint pitch is fine if you'd rather hand off the relationship after.

I drafted a 6-slide positioning deck and a 5-minute live demo script — both ready to send to whoever you want to forward to. Also a one-page brief sized for an internal email forward. Happy to share before the meeting if it'd be helpful for you to read.

## On PINAXIS

Austin next weekend. SLA, payment distribution, contract terms. I'll send you the recap Tuesday after the meeting — if you have any war stories from the Intuitive contract negotiation playbook that translate to MVP-to-production transitions, I'm all ears.

Talk soon.

— Manuel

---

**Manuel Stagg**
CEO, Digit2AI
digitalinformation2ai@gmail.com
surgicalmind.app/intuitive

---

## Notes for Manuel before sending

- Tone: peer, not deferential. Greg is helping; he's not your boss.
- Don't ask for a meeting in this email. Ask for the three pieces of information he needs to give you (timeline, name, joint vs. handoff). The meeting is the next email.
- Lead with the work shipped — that's the receipt that the conversation was useful and acted on. People who give feedback and then see nothing happen disengage fast.
- Drop the demo URL twice (once in section 2, once in signature). Make it impossible to lose.
- "On PINAXIS" closing paragraph reciprocates: ask Greg for something Intuitive-relevant. Mutual exchange, not extraction.
- Send Tuesday morning, not Monday. Monday is for triage; Tuesday is when execs actually read.
