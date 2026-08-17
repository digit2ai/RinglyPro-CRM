// =====================================================
// lib/watchouts.js — the Watchouts tab content, server-side.
//
// This lives here rather than in the HTML for two reasons. First, the no-literals
// rule: the HTML file carries no content that could drift from the model. Second,
// this text has legal weight and belongs in one auditable place that the CSV
// export can also read.
//
// EVERY ITEM CARRIES THE SAME DISCLAIMER. Not because a lawyer asked for it, but
// because the single most valuable thing this tab does is push Greg toward
// counsel before he resigns — which is the actual next step recorded on the
// project record, and the one thing no software here can do for him.
// =====================================================

'use strict';

const DISCLAIMER = 'This is not legal advice. Confirm with your own counsel.';

const NEXT_STEP = {
  headline: 'Retain independent counsel before you resign',
  body: 'Engage a healthcare employment and trade-secret attorney to review the Intuitive Surgical non-compete, the confidentiality agreement, and any IP assignment clauses, and to establish the exact legal perimeter around your knowledge and your departure timeline. Every assumption in this model, and the entire go-to-market, sits downstream of that perimeter. Obtain a clean copy of the employment agreement first.',
  owner: 'Greg Eriksen',
  timing: 'Before resignation, and before any client conversation',
  disclaimer: DISCLAIMER,
};

const ITEMS = [
  {
    key: 'non_compete',
    severity: 'critical',
    category: 'Legal and compliance',
    title: 'Non-compete agreement',
    body: 'A sixteen-year executive employment contract at a medical device manufacturer almost certainly contains a non-compete. Scope, duration and enforceability vary sharply by state, and enforceability is not the same question as whether litigation gets filed. Assess all three before resigning, not after.',
    mitigation: 'Independent legal review of the executed agreement, with a written opinion on geographic scope, duration and state enforceability.',
    guardrail: 'No client conversation, no entity formation and no outbound marketing until the opinion is in hand.',
    disclaimer: DISCLAIMER,
  },
  {
    key: 'trade_secret',
    severity: 'critical',
    category: 'Legal and compliance',
    title: 'Trade secret and confidentiality exposure',
    body: 'Intuitive pricing structures, internal leverage points, floor pricing and contract terms are very likely protected as trade secrets. General expertise about how robotic surgery contracts are structured is yours. Specific numbers learned inside the company are not. The distinction is the entire business model, and it is not self-evident from the inside.',
    mitigation: 'Counsel-defined written boundary between transferable expertise and protected information, plus a documented clean-room practice for client work.',
    guardrail: 'This model uses only public benchmarks. Never enter Intuitive-confidential pricing into it, into any client deliverable, or into any tool.',
    disclaimer: DISCLAIMER,
  },
  {
    key: 'tortious_interference',
    severity: 'critical',
    category: 'Legal and compliance',
    title: 'Tortious interference',
    body: 'Actively targeting accounts you personally managed at Intuitive, or contracts you personally negotiated, invites a tortious interference claim independent of any non-compete question. The named-account pipeline in this model is a market map, not a call list.',
    mitigation: 'Sequence go-to-market to lead with multi-vendor advisory across J&J, Medtronic and orthopedic platforms rather than exclusively Intuitive renegotiation.',
    guardrail: 'Counsel reviews the target list and the outreach sequence before the first approach.',
    disclaimer: DISCLAIMER,
  },
  {
    key: 'gpo_competition',
    severity: 'strategic',
    category: 'Strategic and market',
    title: 'GPO and incumbent advisory competition',
    body: 'Vizient, Premier and HealthTrust already sell contract negotiation and cost management to IDNs, with existing relationships and contracted access. Depth of vendor-side process knowledge is a real differentiator, but it is a positioning argument that has to be made rather than assumed.',
    mitigation: 'A written positioning statement against each named incumbent, and a defined wedge: the specific decision a GPO cannot support.',
    guardrail: 'Model the fee percentage against what a GPO already charges for adjacent work before committing to a rate card.',
    disclaimer: DISCLAIMER,
  },
  {
    key: 'conflict_of_interest',
    severity: 'strategic',
    category: 'Operational',
    title: 'Client conflict of interest',
    body: 'Engagement by an IDN you previously sold to on the vendor side creates a perceived conflict even where no actual one exists. Perceived conflicts lose deals and invite scrutiny at exactly the wrong moment.',
    mitigation: 'A formal conflict disclosure and recusal protocol written before the first engagement, not after the first complaint.',
    guardrail: 'Disclose prior vendor-side involvement in writing at the start of every engagement.',
    disclaimer: DISCLAIMER,
  },
  {
    key: 'vendor_retaliation',
    severity: 'strategic',
    category: 'Commercial',
    title: 'Vendor response to client wins',
    body: 'A vendor facing a well-informed adviser on the other side of the table can respond by discounting directly, which makes attributed savings harder to verify and therefore harder to invoice against. A fee-on-savings model is only as strong as its baseline.',
    mitigation: 'Contractual baseline definition, performance benchmarks and third-party audit rights written into every engagement letter.',
    guardrail: 'No fee is invoiced against savings that cannot be evidenced against the agreed baseline.',
    disclaimer: DISCLAIMER,
  },
  {
    key: 'adoption_timing',
    severity: 'strategic',
    category: 'Timing',
    title: 'Ottava and Hugo adoption timeline',
    body: 'Both platforms have clearance and limited installed base. The multi-vendor leverage thesis depends on adoption accelerating. Until it does, an adviser brings expertise but no credible alternative for a client to walk toward, which is a materially weaker negotiating position.',
    mitigation: 'The model discounts early-year savings capture by the pre-leverage share and ramps it over the adoption lag. Both are adjustable inputs, and both are labelled assumptions.',
    guardrail: 'Do not present a Year-1 revenue figure without stating the adoption lag it assumes.',
    disclaimer: DISCLAIMER,
  },
  {
    key: 'model_provenance',
    severity: 'strategic',
    category: 'Analytical',
    title: 'Several tier figures are not yet independently sourced',
    body: 'The tier totals in this model were carried over from the Digit2AI teaser simulator and are labelled assumptions. They are plausible and internally consistent, but they are not yet traced to a filing, a CMS extract or an analyst report. An investor who checks will find that, and it is better found here than there.',
    mitigation: 'Replace the three tier totals with figures derived from CMS cost reports, vendor 10-K segment disclosures and a named analyst source. The Provenance panel tracks how many inputs remain unsourced.',
    guardrail: 'Any figure whose basis reads as an assumption renders amber, and is never presented as a sourced market size.',
    disclaimer: DISCLAIMER,
  },
];

function all() {
  return {
    disclaimer: DISCLAIMER,
    next_step: NEXT_STEP,
    items: ITEMS.map((i) => ({ ...i })),
    counts: {
      critical: ITEMS.filter((i) => i.severity === 'critical').length,
      strategic: ITEMS.filter((i) => i.severity === 'strategic').length,
      total: ITEMS.length,
    },
  };
}

module.exports = { all, DISCLAIMER, NEXT_STEP, ITEMS };
