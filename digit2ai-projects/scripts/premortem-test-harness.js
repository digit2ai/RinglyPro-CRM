'use strict';

// Premortem test harness — runs Claude Premortem against 2 sample requests:
//   1) a CLEAR request (should produce ranked failure modes + 3 mitigations + verdict)
//   2) a deliberately VAGUE request (should return missing_context, NOT a fabricated analysis)
//
// Runs the agent in-memory (persist:false) so it needs only ANTHROPIC_API_KEY —
// no DB writes, safe to run before enabling in production.
//
//   cd digit2ai-projects && node scripts/premortem-test-harness.js
//   (loads ../.env or ./.env for ANTHROPIC_API_KEY)

require('dotenv').config();
try { require('dotenv').config({ path: __dirname + '/../.env' }); } catch (_) {}
try { require('dotenv').config({ path: __dirname + '/../../.env' }); } catch (_) {}

const premortemAgent = require('../src/services/agents/premortemAgent');

// ---- Sample 1: CLEAR ------------------------------------------------------
const clearProject = {
  id: 9001,
  name: 'ChurnGuard — AI retention agent for a Colombian 3PL',
  submitter_name: 'María Restrepo',
  submitter_email: 'maria@logistica-andina.co',
  country: 'Colombia',
  description: 'We are a mid-size third-party logistics company (3PL) in Medellín losing about 18% of small-shipper accounts per year. We want an AI agent that watches shipment-volume drops and support-ticket sentiment, predicts which accounts are about to churn, and triggers a bilingual outreach sequence (WhatsApp + call) from a human account manager. Integrate with our existing TMS (custom Postgres) and our WhatsApp Business number.',
  target_users: '6 account managers + 1 ops lead',
  current_process: 'Account managers manually eyeball a monthly spreadsheet; they usually notice churn after the account has already left.',
  sensitive_data_detail: 'Shipper contact info, shipment volumes, pricing. No payment card data.',
  existing_stack: 'Custom TMS on Postgres, WhatsApp Business API, no data warehouse',
  budget_range: 'USD 20,000-30,000',
  timeline: '6 weeks',
  team_members: [{}, {}],
  premortem_version: 0
};

const clearTriage = {
  fit_score: 8,
  fit_reasoning: 'Strong fit: reuses RinglyPro bilingual voice/WhatsApp stack and a churn-prediction wedge is well-scoped for 6 weeks.',
  wedge_recommendation: 'v1 = volume-drop + ticket-sentiment churn score with a WhatsApp nudge to the account manager; defer the predictive model retraining loop.',
  go_no_go_recommendation: 'accept',
  regulatory_flags: [{ risk: 'Colombian Habeas Data (Ley 1581) on shipper PII in WhatsApp outreach', severity: 'medium', what_to_check: 'consent basis for automated messaging' }],
  monetization_options: ['SaaS per-seat', 'per-recovered-account success fee'],
  conditions_if_any: ['TMS read access', 'WhatsApp template pre-approval']
};

// ---- Sample 2: VAGUE ------------------------------------------------------
const vagueProject = {
  id: 9002,
  name: 'AI thing',
  submitter_name: 'Anon',
  submitter_email: 'someone@example.com',
  country: '',
  description: 'I want to use AI in my business to make things better and save money. Can you build something?',
  target_users: '',
  current_process: '',
  sensitive_data_detail: '',
  existing_stack: '',
  budget_range: '',
  timeline: '',
  team_members: [],
  premortem_version: 0
};

const vagueTriage = {
  fit_score: 3,
  fit_reasoning: 'Too vague to assess — no audience, goal, or constraints stated.',
  go_no_go_recommendation: 'reject'
};

function line() { console.log('\n' + '='.repeat(78) + '\n'); }

async function runOne(label, project, triage) {
  line();
  console.log(`SAMPLE: ${label}`);
  console.log(`Project: ${project.name}`);
  line();
  const r = await premortemAgent.run({ project, triage, persist: false, failure_horizon: '6 months' });
  console.log('ok:', r.ok, '| verdict:', r.verdict, '| cost $', r.cost_estimate_usd, '| model:', r.model);
  console.log('\n--- MARKDOWN (Premortem Analysis section) ---\n');
  console.log(r.output_md);
  if (r.structured) {
    console.log('\n--- STRUCTURED ---');
    console.log('failure_modes:', r.structured.failure_modes.length);
    console.log('top_mitigations:', r.structured.top_mitigations.length);
    console.log('missing_context:', JSON.stringify(r.structured.missing_context));
  }
  // Lightweight assertions so the harness self-reports pass/fail per sample.
  const checks = [];
  if (label.startsWith('CLEAR')) {
    checks.push(['>=5 failure modes', r.structured && r.structured.failure_modes.length >= 5]);
    checks.push(['3 mitigations', r.structured && r.structured.top_mitigations.length >= 3]);
    checks.push(['each mode has base rate', r.structured && r.structured.failure_modes.every(f => !!f.base_rate_estimate)]);
    checks.push(['each mode ranked', r.structured && r.structured.failure_modes.every(f => f.likelihood_rank && f.danger_rank && f.prevention_cost_rank)]);
    checks.push(['valid verdict', ['PROCEED', 'PROCEED_WITH_MITIGATIONS', 'RESHAPE', 'DECLINE'].includes(r.verdict)]);
  } else {
    checks.push(['returns missing_context', r.structured && r.structured.missing_context.length > 0]);
    checks.push(['no fabricated failure modes', r.structured && r.structured.failure_modes.length === 0]);
  }
  console.log('\n--- CHECKS ---');
  let allPass = true;
  checks.forEach(([name, pass]) => { console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}`); if (!pass) allPass = false; });
  return allPass;
}

(async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — cannot run the harness. Set it and retry.');
    process.exit(1);
  }
  const p1 = await runOne('CLEAR — ChurnGuard 3PL', clearProject, clearTriage);
  const p2 = await runOne('VAGUE — "AI thing"', vagueProject, vagueTriage);
  line();
  console.log(`RESULT: sample 1 (clear) ${p1 ? 'PASS' : 'FAIL'} · sample 2 (vague) ${p2 ? 'PASS' : 'FAIL'}`);
  process.exit(p1 && p2 ? 0 : 2);
})().catch(e => { console.error('harness crashed:', e); process.exit(3); });
