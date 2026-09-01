'use strict';

/**
 * DEMO COMPANY — "Harborline Freight", a mid-size 3PL.
 *
 * Seeds a complete, cross-referenced Discovery account so the end result can be
 * looked at rather than described: real captures through the real redactor, real
 * clustering, the real readiness engines, a real frozen roadmap.
 *
 * THE CAPTURES ARE SYNTHETIC AND THE ACCOUNT SAYS SO. Nothing here is presented
 * as a measurement of an actual company — it is a worked example, and a worked
 * example that pretends to be a customer is the exact dishonesty this module
 * exists to prevent. The mechanism is genuine; the input is invented.
 *
 * Usage:  node verticals/discovery/scripts/seed-demo.js [baseUrl]
 * Default baseUrl: https://orbup.app/discovery
 */

const BASE = (process.argv[2] || 'https://orbup.app/discovery').replace(/\/+$/, '');
const SLUG = process.env.DISCOVERY_DEMO_SLUG || 'harborline';
const EMAIL = process.env.DISCOVERY_DEMO_EMAIL || `demo@${SLUG}.example`;
const PASSWORD = process.env.DISCOVERY_DEMO_PASSWORD || 'harborline-demo-2026';

let cookie = '';
async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch (e) { return { status: res.status, data: null, text }; }
}

/* ── the four processes, as they would actually be performed ─────────────── */
// Written as app sequences because that is what the recorder sees. The
// swivel-chair pattern is not decoration: it is the whole reason the invoice
// run is expensive, and it only appears because somebody watched it happen.
const SCRIPTS = {
  invoice: {
    label: 'daily invoice reconciliation',
    actors: ['ops-priya', 'ops-marcus'],
    runsPerActor: 9,
    minutes: [88, 96, 104, 112, 97, 121, 84, 108, 99],
    steps: () => [
      ['navigate', 'harborline.my.salesforce.com', '/lightning/r/Shipment/0061A00000XyZ/view', 'link'],
      ['click', 'harborline.my.salesforce.com', '/lightning/r/Shipment/0061A00000XyZ/view', 'button'],
      ['copy', 'harborline.my.salesforce.com', '/lightning/r/Shipment/0061A00000XyZ/view', 'field'],
      ['switch_app', 'quickbooks.intuit.com', '/app/invoice', null],
      ['paste', 'quickbooks.intuit.com', '/app/invoice', 'field'],
      ['type', 'quickbooks.intuit.com', '/app/invoice', 'field'],
      ['switch_app', 'harborline.my.salesforce.com', '/lightning/r/Account/0011A00000AbC/view', null],
      ['copy', 'harborline.my.salesforce.com', '/lightning/r/Account/0011A00000AbC/view', 'field'],
      ['switch_app', 'docs.google.com', '/spreadsheets/d/1kPq7RxvNmT4/edit', null],
      ['paste', 'docs.google.com', '/spreadsheets/d/1kPq7RxvNmT4/edit', 'field'],
      ['type', 'docs.google.com', '/spreadsheets/d/1kPq7RxvNmT4/edit', 'field'],
      ['switch_app', 'quickbooks.intuit.com', '/app/invoice', null],
      ['submit', 'quickbooks.intuit.com', '/app/invoice', 'button'],
      ['switch_app', 'mail.google.com', '/mail/u/0/', null],
      ['type', 'mail.google.com', '/mail/u/0/', 'editor'],
      ['submit', 'mail.google.com', '/mail/u/0/', 'button']
    ]
  },
  packets: {
    label: 'carrier packet review',
    actors: ['ops-dana'],
    runsPerActor: 14,
    minutes: [34, 41, 28, 46, 37, 52, 31, 39, 44, 36, 48, 33, 42, 38],
    steps: () => [
      ['navigate', 'mail.google.com', '/mail/u/0/', 'link'],
      ['download', 'mail.google.com', '/mail/u/0/', 'file'],
      ['switch_app', 'dropbox.com', '/home/carriers', null],
      ['upload', 'dropbox.com', '/home/carriers', 'file'],
      ['click', 'dropbox.com', '/home/carriers', 'button'],
      ['switch_app', 'harborline.my.salesforce.com', '/lightning/r/Carrier/0031A00000QrS/view', null],
      ['type', 'harborline.my.salesforce.com', '/lightning/r/Carrier/0031A00000QrS/view', 'field'],
      ['click', 'harborline.my.salesforce.com', '/lightning/r/Carrier/0031A00000QrS/view', 'checkbox'],
      ['submit', 'harborline.my.salesforce.com', '/lightning/r/Carrier/0031A00000QrS/view', 'button']
    ]
  },
  quotes: {
    label: 'customer rate quotes',
    actors: ['sales-eli', 'sales-nora', 'sales-tomas'],
    runsPerActor: 6,
    minutes: [22, 31, 18, 27, 24, 35],
    steps: () => [
      ['navigate', 'outlook.office.com', '/mail/inbox', 'link'],
      ['copy', 'outlook.office.com', '/mail/inbox', 'field'],
      ['switch_app', 'docs.google.com', '/spreadsheets/d/1RateCard88/edit', null],
      ['paste', 'docs.google.com', '/spreadsheets/d/1RateCard88/edit', 'field'],
      ['type', 'docs.google.com', '/spreadsheets/d/1RateCard88/edit', 'field'],
      ['copy', 'docs.google.com', '/spreadsheets/d/1RateCard88/edit', 'field'],
      ['switch_app', 'outlook.office.com', '/mail/deeplink/compose', null],
      ['paste', 'outlook.office.com', '/mail/deeplink/compose', 'editor'],
      ['submit', 'outlook.office.com', '/mail/deeplink/compose', 'button']
    ]
  },
  settlement: {
    label: 'driver settlement run',
    actors: ['acct-rosa'],
    runsPerActor: 4,
    minutes: [186, 204, 171, 193],
    steps: () => [
      ['navigate', 'docs.google.com', '/spreadsheets/d/1Settle22/edit', 'link'],
      ['type', 'docs.google.com', '/spreadsheets/d/1Settle22/edit', 'field'],
      ['switch_app', 'quickbooks.intuit.com', '/app/bills', null],
      ['type', 'quickbooks.intuit.com', '/app/bills', 'field'],
      ['switch_app', 'docs.google.com', '/spreadsheets/d/1Settle22/edit', null],
      ['copy', 'docs.google.com', '/spreadsheets/d/1Settle22/edit', 'field'],
      ['switch_app', 'quickbooks.intuit.com', '/app/bills', null],
      ['paste', 'quickbooks.intuit.com', '/app/bills', 'field'],
      ['submit', 'quickbooks.intuit.com', '/app/bills', 'button']
    ]
  }
};

/**
 * Build one capture. Note the payload deliberately carries the fields a naive
 * recorder WOULD send — a typed value, an element label, a query string — so
 * that the seeded account demonstrates the redactor removing them rather than
 * merely asserting that it would.
 */
function buildCapture(key, script, actor, runIndex, dayOffset, startDay) {
  const shape = script.steps();
  const totalMs = script.minutes[runIndex % script.minutes.length] * 60000;
  const per = Math.round(totalMs / shape.length);
  const start = new Date(2026, 7, startDay + dayOffset, 8 + (runIndex % 6), (runIndex * 13) % 60);

  const steps = shape.map(([action, host, path, role], i) => ({
    seq: i,
    action,
    // A query string and a record id on purpose — both must come back stripped.
    url: `https://${host}${path}${i % 4 === 0 ? '?ref=INV-' + (44000 + runIndex) + '&q=harborline' : ''}`,
    target_role: role,
    dwell_ms: Math.round(per * (0.6 + ((i * 37) % 90) / 100)),
    // Content a naive client might include. None of it may survive ingestion.
    value: 'Harborline Freight — invoice INV-' + (44000 + runIndex) + ' — $12,480.00',
    element_label: 'Approve invoice INV-' + (44000 + runIndex),
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg'
  }));

  return {
    label: script.label,
    actor,
    external_ref: `harborline-${key}-${actor}-${runIndex}`,
    started_at: start.toISOString(),
    ended_at: new Date(start.getTime() + totalMs).toISOString(),
    duration_ms: totalMs,
    steps
  };
}

async function main() {
  console.log(`\nSeeding the Harborline Freight demo against ${BASE}\n${'='.repeat(64)}`);

  /* 1 · account */
  let r = await call('POST', '/api/v1/auth/signup', {
    email: EMAIL, password: PASSWORD, name: 'Ruth Okafor',
    company_name: 'Harborline Freight (demo)',
    industry: 'Third-party logistics', country: 'United States',
    headcount: 62, revenue_band: '10m_50m'
  });
  if (r.status !== 201) {
    r = await call('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD });
    if (r.status !== 200) { console.error('Could not sign in:', r.data); process.exit(1); }
    console.log('Signed in to the existing demo account.');
  } else {
    console.log(`Account created — tenant ${r.data.account.id}`);
  }
  const tenant = r.data.account.id;

  /* 2 · a key, then captures through it — the real ingest path */
  r = await call('POST', '/api/v1/keys', { name: 'Harborline laptops', scopes: ['ingest'] });
  const ingestKey = r.data.plaintext;
  await call('POST', '/api/v1/keys', { name: 'Harborline copilot', scopes: ['read'] });
  console.log('Keys minted (ingest + read).');

  const captures = [];
  Object.entries(SCRIPTS).forEach(([key, script]) => {
    script.actors.forEach((actor, ai) => {
      for (let i = 0; i < script.runsPerActor; i++) {
        // Spread runs across a 15-day window so the observation is a real week+.
        captures.push(buildCapture(key, script, actor, i, (i + ai) % 15, 1));
      }
    });
  });

  let stored = 0;
  for (let i = 0; i < captures.length; i += 20) {
    const res = await fetch(BASE + '/api/v1/ingest/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ingestKey },
      body: JSON.stringify({ captures: captures.slice(i, i + 20) })
    });
    const j = await res.json();
    stored += j.stored || 0;
  }
  console.log(`Captures ingested: ${stored} of ${captures.length} (the rest were already present).`);

  const caps = await call('GET', '/api/v1/captures');
  const red = caps.data.stats.redaction;
  console.log(`Redactor removed: ${red.text_values_dropped} text values, ${red.query_strings_dropped} query strings, ${red.identifiers_masked} identifiers, across ${red.steps_in} steps.`);

  /* 3 · derive */
  r = await call('POST', '/api/v1/processes/derive');
  console.log(`\nProposed processes (${r.data.processes.length}):`);
  r.data.processes.forEach(p =>
    console.log(`  · ${p.name.padEnd(30)} ${String(p.hours_per_week).padStart(6)} h/wk × ${p.people}  ${String(p.observed_runs).padStart(3)} runs / ${p.observed_window_days}d  ${(p.evidence || {}).confidence}`));

  /* 4 · a human confirms, names the rate, answers the judgement calls.
   *    Exactly what an owner would do in the dashboard — the rates below are
   *    loaded hourly costs for a US 3PL, entered here the way a person types
   *    them, because there is no other way for a dollar to enter this system. */
  const RATES = {
    'daily invoice reconciliation': { rate: 44, customer_facing: false, regulated: false, tol: 'medium' },
    'carrier packet review': { rate: 38, customer_facing: false, regulated: false, tol: 'low' },
    'customer rate quotes': { rate: 61, customer_facing: true, regulated: false, tol: 'low' },
    'driver settlement run': { rate: 52, customer_facing: false, regulated: true, tol: 'zero' }
  };

  const procs = (await call('GET', '/api/v1/processes')).data.processes;
  for (const p of procs) {
    const key = Object.keys(RATES).find(k => p.name.toLowerCase().includes(k.split(' ')[0].toLowerCase()));
    const cfg = key ? RATES[key] : null;
    await call('PATCH', '/api/v1/processes/' + p.id, {
      status: 'confirmed',
      // The settlement run is left UNCOSTED on purpose, so the demo shows what
      // an unpriced process looks like in the deliverable rather than hiding it.
      loaded_hourly_cost: cfg && !/settlement/i.test(p.name) ? cfg.rate : null,
      customer_facing: cfg ? cfg.customer_facing : null,
      involves_regulated_data: cfg ? cfg.regulated : null,
      error_tolerance: cfg ? cfg.tol : null
    });
  }
  console.log('\nAll processes confirmed. The settlement run is deliberately left without a rate.');

  /* 5 · the six questions */
  await call('PUT', '/api/v1/answers/fears', {
    top_fears: ['cost', 'been_oversold_before', 'job_disruption'],
    biggest_fear: 'been_oversold_before'
  });
  await call('PUT', '/api/v1/answers/cost', {
    comfortable_pilot_budget_usd: 22000,
    monthly_run_comfort_usd: 1200,
    current_software_spend_monthly_usd: 4300,
    known_leak_annual_usd: 68000,
    political_cost_of_failure: 'medium'
  });
  await call('PUT', '/api/v1/answers/risk', {
    risk_concerns: ['errors', 'bad_decisions', 'job_disruption'],
    regulatory_regimes: ['none'],
    worst_case: 'We bill a customer the wrong rate for a month, they find it before we do, and I lose the account plus the referral behind it.',
    headcount_intent: 'redeploy',
    workforce_sensitivity: 'medium',
    security_review_required: false
  });
  await call('PUT', '/api/v1/answers/data', {
    data_exists: 4, data_quality: 3, data_accessible: 3, data_structured: 2,
    contains_pii: true, dpa_in_place: false,
    data_owner_exists: false, retention_policy: false, history_months: 30
  });
  console.log('Six questions answered.');

  /* 6 · run it */
  r = await call('POST', '/api/v1/evaluation/run', {});
  if (!r.data.success) { console.error('Evaluation refused:', r.data); process.exit(1); }
  const { scorecard: sc, phases, coverage, neural, version, share_token } = r.data;

  console.log(`\n${'='.repeat(64)}\nTHE DELIVERABLE (version ${version})\n${'='.repeat(64)}`);
  console.log(`\nVerdict: ${sc.verdict_label}   [overall ${sc.overall_rating}]`);
  sc.lanes.forEach(l => console.log(`  ${l.title.padEnd(18)} ${String(l.rating).padEnd(7)} ${String(l.score).padStart(3)}   ${l.headline}`));

  console.log('\nPhases:');
  phases.forEach(p => {
    const c = p.cost || {};
    console.log(`  ${p.number}. ${p.title}`);
    if ((p.scope || []).length) console.log(`     scope: ${p.scope.join(', ')}`);
    console.log(`     ${p.timeline_weeks ? p.timeline_weeks + ' weeks' : 'not scoped'} · ${c.build_usd_range || 'not priced'}${c.run_monthly_usd ? ' · $' + c.run_monthly_usd + '/mo' : ''}${c.max_exposure_usd ? ' · max exposure $' + c.max_exposure_usd : ''}`);
  });

  console.log('\nFindings:');
  neural.forEach(f => console.log(`  [${f.severity.padEnd(11)}] ${f.code.padEnd(18)} ${f.dollarImpact || '—'}  ${f.title}`));

  console.log('\nCoverage:');
  console.log(`  hours   ${coverage.hours.source} — ${coverage.hours.runs} runs over ${coverage.hours.window_days} days`);
  console.log(`  rates   ${coverage.rates.source} — ${coverage.rates.costed} costed, ${coverage.rates.uncosted} uncosted (${coverage.rates.uncosted_names.join(', ')})`);
  console.log(`  systems ${coverage.systems.source} — ${coverage.systems.derived.join(', ')}`);
  (coverage.absent || []).forEach(a => console.log(`  absent  ${a}`));

  console.log(`\n${'='.repeat(64)}`);
  console.log(`Dashboard         ${BASE}/            (sign in as ${EMAIL} / ${PASSWORD})`);
  console.log(`Shareable report  ${BASE}/r/${share_token}`);
  console.log(`${'='.repeat(64)}\n`);
}

main().catch(e => { console.error('Seed failed:', e); process.exit(1); });
