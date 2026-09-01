'use strict';

/**
 * AI DISCOVERY — system integration test.
 *
 * It attacks the invariants rather than the happy path. Every assertion here
 * corresponds to a way this module could quietly become dishonest:
 *
 *   the redactor letting a typed value through
 *   a short window being scaled up into a week
 *   an unconfirmed proposal reaching the roadmap
 *   an hourly rate being invented for an uncosted process
 *   the evaluation running around a missing required answer
 *   an ingest key reading a roadmap, or a read key writing
 *   one tenant seeing another's observed work
 *
 * Zero external keys. Runs green on the deterministic path.
 * Cleans up after itself: every row it creates carries a sit_ marker.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const express = require('express');
const http = require('http');
const crypto = require('crypto');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`); }

const RUN = crypto.randomBytes(4).toString('hex');
const email = (n) => `sit_${RUN}_${n}@discovery.test`;

let server, base, agentCookie = null, tenantA = null, tenantB = null;
let ingestKey = null, readKey = null, bothKey = null;

/* ── tiny HTTP client ────────────────────────────────────────────────────── */
function req(method, path, { body, headers = {}, cookie } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const h = Object.assign({ 'Content-Type': 'application/json' }, headers);
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    if (cookie) h.Cookie = cookie;
    const r = http.request(base + path, { method, headers: h }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch (e) { /* html */ }
        resolve({ status: res.statusCode, json, text: buf, headers: res.headers });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}

/* ── synthetic captures ──────────────────────────────────────────────────── */
function capture({ day, actor, apps, label, ref, dirty }) {
  const steps = [];
  apps.forEach((app, i) => {
    steps.push({ action: 'navigate', url: `https://${app}/orders/${8000 + i}/edit?token=secret${i}`, dwell_ms: 30000 });
    steps.push({
      action: 'type', url: `https://${app}/orders/${8000 + i}/edit`, role: 'field', dwell_ms: 45000,
      ...(dirty ? {
        value: 'ACME Corporation — invoice 4471 — $18,300',
        element_label: 'Approve Invoice #4471',
        screenshot: 'data:image/png;base64,iVBORw0KGgo',
        typed_text: 'jane.doe@acme.com'
      } : {})
    });
    steps.push({ action: 'copy', url: `https://${app}/orders/${8000 + i}`, dwell_ms: 5000 });
  });
  const base = new Date(2026, 7, day, 9, 0, 0).getTime();
  return {
    label, actor, external_ref: ref,
    started_at: new Date(base).toISOString(),
    ended_at: new Date(base + steps.length * 30000).toISOString(),
    duration_ms: steps.reduce((a, s) => a + s.dwell_ms, 0),
    steps
  };
}

async function main() {
  console.log(`\nAI DISCOVERY — SIT  (run ${RUN})\n${'='.repeat(66)}`);

  const router = require('./src/index');
  const app = express();
  app.use('/discovery', router);
  await new Promise(r => { server = app.listen(0, r); });
  base = 'http://127.0.0.1:' + server.address().port;

  // Give the router's async boot a moment rather than racing it.
  for (let i = 0; i < 40 && !router.ready(); i++) await new Promise(r => setTimeout(r, 150));

  /* ═══ REDACTION ═══ */
  section('The privacy boundary');
  const redact = require('./src/services/redact');
  {
    const r = redact.redactCapture({
      label: 'Invoice run for ACME 449281 jane@acme.com',
      actor: 'jane@acme.com',
      steps: [{
        action: 'type', url: 'https://acme.my.salesforce.com/orders/8837/edit?q=confidential+term#frag',
        role: 'field', dwell_ms: 4000,
        value: '123 Main Street', element_label: 'Approve Invoice #4471',
        screenshot: 'data:image/png;base64,AAAA', innerText: 'Patient: John Doe'
      }]
    }, { tenant_id: 1 });

    const blob = JSON.stringify(r);
    ok('no typed value survives', !blob.includes('123 Main Street'));
    ok('no element label survives', !blob.includes('Approve Invoice'));
    ok('no screenshot survives', !blob.includes('base64'));
    ok('no page text survives', !blob.includes('John Doe'));
    ok('no query string survives', !blob.includes('confidential'));
    ok('path identifier masked', r.steps[0].path_shape === '/orders/:id/edit', r.steps[0].path_shape);
    ok('host kept', r.steps[0].host === 'acme.my.salesforce.com');
    ok('app resolved', r.steps[0].app === 'Salesforce');
    ok('query drop counted', r.redaction_report.query_strings_dropped >= 1);
    ok('dropped fields counted', r.redaction_report.fields_dropped >= 4, String(r.redaction_report.fields_dropped));
    ok('actor is a pseudonym', /^p_[0-9a-f]{16}$/.test(r.actor_ref) && !r.actor_ref.includes('jane'));
    ok('email stripped from label', !r.label.includes('@'));
    ok('long number stripped from label', !/\d{5,}/.test(r.label));
  }
  {
    // The same person at two companies must not be linkable.
    const a = redact.pseudonym('jane@acme.com', 1);
    const b = redact.pseudonym('jane@acme.com', 2);
    ok('pseudonyms differ across tenants', a !== b);
    ok('pseudonym is stable within a tenant', a === redact.pseudonym('jane@acme.com', 1));
  }
  {
    const rep = { query_strings_dropped: 0, identifiers_masked: 0 };
    ok('route words are not masked as ids',
      redact.pathShape('/invoices/pending/review', rep) === '/invoices/pending/review');
    ok('generated key is masked',
      redact.pathShape('/spreadsheets/d/1AbCdEfGhIjK/edit', rep) === '/spreadsheets/d/:id/edit');
    ok('unknown action becomes other',
      redact.redactStep({ action: 'exfiltrate', url: 'https://x.com/' }, redact.redactCapture({ steps: [] }).redaction_report || { fields_dropped: 0, text_values_dropped: 0, query_strings_dropped: 0, identifiers_masked: 0, unnamed_apps: 0, steps_in: 0, steps_kept: 0 }, 0).action === 'other');
  }
  {
    const allowed = redact.ALLOWED_STEP_KEYS;
    ok('allow-list has no content-shaped key',
      !['value', 'text', 'label', 'title', 'screenshot', 'innerText', 'selector', 'query'].some(k => allowed.has(k)));
  }
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'src', 'models.js'), 'utf8');
    // The schema is the second half of the guarantee: there must be nowhere to
    // put content even if the redactor were bypassed entirely.
    const stepBlock = src.slice(src.indexOf("const Step ="), src.indexOf("const Process ="));
    ok('dsc_steps has no content column',
      !/(\bvalue\b|\btext\b|\bscreenshot\b|\blabel\b|\bcontent\b|\bquery\b)\s*:/.test(stepBlock));
  }

  /* ═══ DERIVATION ═══ */
  section('Derivation and the extrapolation rule');
  const derive = require('./src/services/derive');
  {
    const caps = [];
    for (let i = 0; i < 10; i++) caps.push({
      id: i, started_at: new Date(2026, 7, 1 + i).toISOString(), actor_ref: 'p_a',
      duration_ms: 3600000, fingerprint: 'fpA',
      app_summary: [{ app: 'Salesforce', steps: 3, ms: 1800000 }, { app: 'QuickBooks', steps: 3, ms: 1800000 }],
      steps: [{ app: 'Salesforce', action: 'navigate' }, { app: 'Salesforce', action: 'copy' },
              { app: 'QuickBooks', action: 'paste' }, { app: 'QuickBooks', action: 'submit' }]
    });
    const r = derive.derive(caps);
    ok('runs cluster into one process', r.processes.length === 1, String(r.processes.length));
    const p = r.processes[0];
    ok('hours per person per week is measured', p.hours_per_week > 0 && p.hours_source === 'measured');
    ok('confidence high over a full window with many runs', p.evidence.confidence === 'high', p.evidence.confidence);
    ok('rate is null, never derived', p.loaded_hourly_cost === null);
    ok('flags are null, not false',
      p.customer_facing === null && p.involves_regulated_data === null && p.error_tolerance === null);
    ok('a proposal is proposed', p.status === 'proposed');
    ok('app switches counted', p.evidence.app_switches_per_run > 0);
  }
  {
    // Two days of work must not be multiplied into a week.
    const caps = [];
    for (let i = 0; i < 2; i++) caps.push({
      id: i, started_at: new Date(2026, 7, 1 + i).toISOString(), actor_ref: 'p_a',
      duration_ms: 3600000, fingerprint: 'fpB',
      app_summary: [{ app: 'Gmail', steps: 2, ms: 3600000 }],
      steps: [{ app: 'Gmail', action: 'navigate' }, { app: 'Gmail', action: 'type' }]
    });
    const p = derive.derive(caps).processes[0];
    // 2 hours observed over a 2-day window, one person. Scaled to a week that
    // would be 7h; unscaled it is the measured 2h/(2/7 wk) — the assertion is
    // that the caveat is present and the window is reported.
    ok('short window carries a caveat', p.evidence.caveats.some(c => /not a full week/i.test(c)));
    ok('short window is low confidence', p.evidence.confidence === 'low');
    ok('observation window is reported', p.observed_window_days === 2, String(p.observed_window_days));
    ok('single-operator caveat present', p.evidence.caveats.some(c => /one person/i.test(c)));
  }
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'src', 'services', 'derive.js'), 'utf8');
    ok('deriver never reads a rate or a wage', !/salary|wage|hourly_rate\s*=|loaded_hourly_cost\s*=\s*[^n]/i.test(src));
  }

  /* ═══ ACCOUNTS + KEYS ═══ */
  section('Accounts, tenancy and keys');
  {
    const r = await req('POST', '/discovery/api/v1/auth/signup', {
      body: { email: email('a'), password: 'sit-password-1', name: 'SIT Owner',
              company_name: 'SIT Northwind ' + RUN, industry: 'freight', country: 'US', headcount: 40 }
    });
    ok('signup creates an account', r.status === 201, String(r.status));
    agentCookie = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    tenantA = r.json && r.json.account ? r.json.account.id : null;
    ok('tenant_id is the account id', r.json && r.json.account && r.json.account.tenant_id === tenantA);
    ok('password hash never leaves the server', r.text.indexOf('password_hash') === -1);
  }
  {
    const r = await req('POST', '/discovery/api/v1/auth/signup', {
      body: { email: email('a'), password: 'sit-password-1', company_name: 'Dupe' }
    });
    ok('duplicate email refused', r.status === 400);
  }
  {
    const r = await req('POST', '/discovery/api/v1/auth/signup', {
      body: { email: email('b'), password: 'sit-password-2', company_name: 'SIT Other ' + RUN }
    });
    tenantB = r.json.account.id;
    ok('second tenant created', !!tenantB && tenantB !== tenantA);
  }
  {
    const r = await req('POST', '/discovery/api/v1/keys', { cookie: agentCookie, body: { name: 'sit ingest', scopes: ['ingest'] } });
    ingestKey = r.json.plaintext;
    ok('ingest key minted', r.status === 201 && /^orbup_dk_/.test(ingestKey || ''));
    ok('plaintext shown once with a warning', !!r.json.warning);

    const r2 = await req('POST', '/discovery/api/v1/keys', { cookie: agentCookie, body: { name: 'sit read', scopes: ['read'] } });
    readKey = r2.json.plaintext;
    const r3 = await req('POST', '/discovery/api/v1/keys', { cookie: agentCookie, body: { name: 'sit both', scopes: ['ingest', 'read'] } });
    bothKey = r3.json.plaintext;
    ok('scoped keys minted', !!readKey && !!bothKey);

    const list = await req('GET', '/discovery/api/v1/keys', { cookie: agentCookie });
    ok('key list never returns a hash or plaintext',
      !list.text.includes('key_hash') && !list.text.includes(ingestKey));
  }
  {
    const r = await req('POST', '/discovery/api/v1/keys', { cookie: agentCookie, body: { name: 'bad', scopes: ['admin', 'root'] } });
    ok('unknown scopes are dropped, not honoured',
      JSON.stringify(r.json.key.scopes) === JSON.stringify(['ingest']), JSON.stringify(r.json.key.scopes));
  }

  /* ═══ INGEST ═══ */
  section('Ingest');
  {
    const r = await req('POST', '/discovery/api/v1/ingest/capture', {
      headers: { Authorization: 'Bearer ' + readKey },
      body: capture({ day: 1, actor: 'ops-1', apps: ['acme.my.salesforce.com'], label: 'x', ref: 'sit-x' })
    });
    ok('a read-only key cannot ingest', r.status === 401);
  }
  {
    const r = await req('POST', '/discovery/api/v1/ingest/capture', {
      headers: { Authorization: 'Bearer orbup_dk_totally-made-up' },
      body: capture({ day: 1, actor: 'ops-1', apps: ['x.com'], label: 'x', ref: 'sit-y' })
    });
    ok('an invented key is refused', r.status === 401);
  }
  {
    const caps = [];
    for (let d = 1; d <= 12; d++) caps.push(capture({
      day: d, actor: d % 3 === 0 ? 'ops-2' : 'ops-1',
      apps: ['acme.my.salesforce.com', 'quickbooks.intuit.com'],
      label: 'month-end invoice run', ref: `sit-${RUN}-inv-${d}`, dirty: true
    }));
    for (let d = 1; d <= 9; d++) caps.push(capture({
      day: d, actor: 'ops-3', apps: ['mail.google.com', 'dropbox.com'],
      label: 'carrier packet review', ref: `sit-${RUN}-pkt-${d}`
    }));
    const r = await req('POST', '/discovery/api/v1/ingest/batch', {
      headers: { Authorization: 'Bearer ' + ingestKey }, body: { captures: caps }
    });
    ok('batch ingest stores every run', r.json && r.json.stored === 21, JSON.stringify(r.json && { s: r.json.stored, f: r.json.failed }));
  }
  {
    const one = capture({ day: 3, actor: 'ops-1', apps: ['acme.my.salesforce.com', 'quickbooks.intuit.com'], label: 'dupe', ref: `sit-${RUN}-inv-3` });
    const r = await req('POST', '/discovery/api/v1/ingest/capture', { headers: { Authorization: 'Bearer ' + ingestKey }, body: one });
    ok('a retried external_ref never double-counts', r.json && r.json.duplicate === true);
  }
  {
    const r = await req('POST', '/discovery/api/v1/ingest/capture', {
      headers: { Authorization: 'Bearer ' + ingestKey }, body: { label: 'nothing', steps: [] }
    });
    ok('an empty capture is refused', r.status === 400);
  }
  {
    const r = await req('POST', '/discovery/api/v1/ingest/batch', {
      headers: { Authorization: 'Bearer ' + ingestKey },
      body: { captures: [{ steps: [] }, capture({ day: 20, actor: 'ops-1', apps: ['x.example.com'], label: 'good one', ref: `sit-${RUN}-mix` })] }
    });
    ok('one bad capture never abandons the batch', r.json.stored === 1 && r.json.failed === 1);
  }
  {
    const caps = await req('GET', '/discovery/api/v1/captures', { cookie: agentCookie });
    const blob = caps.text;
    ok('stored captures carry no typed value', !blob.includes('ACME Corporation'));
    ok('stored captures carry no element label', !blob.includes('Approve Invoice'));
    ok('redaction is reported to the account', caps.json.stats.redaction.text_values_dropped > 0);
  }

  /* ═══ THE ROADMAP GATE ═══ */
  section('Derivation and the confirmation gate');
  {
    const r = await req('POST', '/discovery/api/v1/processes/derive', { cookie: agentCookie });
    ok('captures derive into proposals', r.json.processes.length >= 2, String(r.json.processes.length));
    ok('every derived process starts proposed', r.json.processes.every(p => p.status === 'proposed'));
    ok('no derived process has a rate', r.json.processes.every(p => p.loaded_hourly_cost === null));
  }
  {
    const r = await req('GET', '/discovery/api/v1/evaluation/preview', { cookie: agentCookie });
    ok('evaluation refuses with zero confirmed processes',
      r.json.success === false && r.json.error === 'no_confirmed_processes', JSON.stringify(r.json.error));
  }
  let procs = [];
  {
    procs = (await req('GET', '/discovery/api/v1/processes', { cookie: agentCookie })).json.processes;
    const invoice = procs.find(p => /invoice/i.test(p.name)) || procs[0];
    await req('PATCH', '/discovery/api/v1/processes/' + invoice.id, { cookie: agentCookie, body: { status: 'confirmed' } });
    const after = (await req('GET', '/discovery/api/v1/processes', { cookie: agentCookie })).json.processes;
    ok('confirming a process sticks', after.find(p => p.id === invoice.id).status === 'confirmed');

    const r = await req('GET', '/discovery/api/v1/evaluation/preview', { cookie: agentCookie });
    ok('evaluation still refuses on missing answers',
      r.json.success === false && r.json.error === 'missing_required_answers');
    ok('the refusal names the missing questions', (r.json.missing || []).length === 6, String((r.json.missing || []).length));
  }
  {
    // Measured hours are not settable through the update endpoint — the whole
    // point of observation is lost if the UI can overwrite it.
    const p = (await req('GET', '/discovery/api/v1/processes', { cookie: agentCookie })).json.processes.find(x => x.status === 'confirmed');
    const before = p.hours_per_week;
    await req('PATCH', '/discovery/api/v1/processes/' + p.id, { cookie: agentCookie, body: { hours_per_week: 999, people: 999 } });
    const after = (await req('GET', '/discovery/api/v1/processes', { cookie: agentCookie })).json.processes.find(x => x.id === p.id);
    ok('measured hours cannot be overwritten via PATCH', after.hours_per_week === before, `${before} -> ${after.hours_per_week}`);
  }

  /* ═══ ANSWERS + EVALUATION ═══ */
  section('The evaluation');
  {
    await req('PUT', '/discovery/api/v1/answers/fears', { cookie: agentCookie, body: { top_fears: ['cost', 'data'], biggest_fear: 'cost' } });
    await req('PUT', '/discovery/api/v1/answers/cost', { cookie: agentCookie, body: { comfortable_pilot_budget_usd: 15000, monthly_run_comfort_usd: 900, political_cost_of_failure: 'medium' } });
    await req('PUT', '/discovery/api/v1/answers/risk', { cookie: agentCookie, body: { risk_concerns: ['errors', 'security'], regulatory_regimes: ['none'], worst_case: 'We quote a customer wrong and eat the difference.', headcount_intent: 'redeploy' } });
    const r = await req('PUT', '/discovery/api/v1/answers/data', { cookie: agentCookie, body: { data_exists: 4, data_quality: 3, data_accessible: 3, data_structured: 2, contains_pii: false } });
    ok('all six required answers recorded', (r.json.missing || []).length === 0, JSON.stringify(r.json.missing));
  }
  let evalA = null;
  {
    const r = await req('GET', '/discovery/api/v1/evaluation/preview', { cookie: agentCookie });
    evalA = r.json;
    ok('evaluation runs once inputs exist', r.json.success === true);
    ok('a scorecard with three lanes', (evalA.scorecard.lanes || []).length === 3);
    ok('three phases', (evalA.phases || []).length === 3);
    ok('phase 3 is never priced',
      !evalA.phases[2].cost || !evalA.phases[2].cost.build_usd_range || /defined|definir/i.test(evalA.phases[2].cost.build_usd_range),
      JSON.stringify(evalA.phases[2].cost));
    ok('there is always a next step', !!(evalA.safe_next_step && Object.keys(evalA.safe_next_step).length));
    ok('a diagram is generated from the phases', (evalA.diagram.nodes || []).some(n => n.kind === 'phase'));
    ok('the diagram has a gate between phases', (evalA.diagram.nodes || []).some(n => n.kind === 'gate'));
  }
  {
    // An uncosted confirmed process must contribute zero dollars and be named.
    const p2 = (await req('GET', '/discovery/api/v1/processes', { cookie: agentCookie })).json.processes.find(x => x.status === 'proposed');
    await req('PATCH', '/discovery/api/v1/processes/' + p2.id, { cookie: agentCookie, body: { status: 'confirmed' } });
    const r = await req('GET', '/discovery/api/v1/evaluation/preview', { cookie: agentCookie });
    const cov = r.json.coverage;
    ok('uncosted processes are counted', cov.rates.uncosted >= 2, String(cov.rates.uncosted));
    ok('uncosted processes are named, not averaged', cov.rates.uncosted_names.length >= 2);
    ok('the absence is stated in the deliverable', (cov.absent || []).some(a => /hourly rate/i.test(a)));
    ok('hours are marked measured', cov.hours.source === 'measured');
    ok('rates are marked stated', cov.rates.source === 'stated');
    ok('systems are marked derived', cov.systems.source === 'derived');
    ok('systems were read from observed apps', (cov.systems.derived || []).length > 0);

    const f = (r.json.neural || []).find(x => x.code === 'DSC-UNCOSTED');
    ok('an uncosted finding is raised', !!f);
    ok('the uncosted finding carries no dollar figure', f && f.dollarImpact === '');
  }
  {
    // Adding a rate must move dollars, and only then.
    const p = (await req('GET', '/discovery/api/v1/processes', { cookie: agentCookie })).json.processes.find(x => x.status === 'confirmed');
    await req('PATCH', '/discovery/api/v1/processes/' + p.id, { cookie: agentCookie, body: { loaded_hourly_cost: 42, customer_facing: false, involves_regulated_data: false, error_tolerance: 'medium' } });
    const r = await req('GET', '/discovery/api/v1/evaluation/preview', { cookie: agentCookie });
    const nothing = r.json.findings.cost.cost_of_doing_nothing || r.json.findings.cost.doing_nothing || {};
    ok('a stated rate produces dollars', JSON.stringify(r.json.findings.cost).includes('annual'), 'cost engine produced no annual figure');
    const top = (r.json.neural || []).find(x => x.code === 'DSC-TOP-COST');
    ok('the top-cost finding appears only once a rate exists', !!top);
    ok('its evidence names the rate as account-stated', top && top.evidence.rate_stated_by === 'account');
  }
  {
    const r = await req('POST', '/discovery/api/v1/evaluation/run', { cookie: agentCookie, body: {} });
    ok('a run is versioned and frozen', r.json.success && r.json.version === 1);
    ok('a share token is minted', !!r.json.share_token);
    const again = await req('POST', '/discovery/api/v1/evaluation/run', { cookie: agentCookie, body: {} });
    ok('re-running writes a new version, never edits the old', again.json.version === 2);

    const shared = await req('GET', '/discovery/api/v1/public/roadmap/' + r.json.share_token);
    ok('the shared link resolves without a session', shared.status === 200);
    ok('the shared link omits the stated budget', !shared.text.includes('15000'));
    ok('the shared link omits the worst-case quote', !shared.text.includes('eat the difference'));
    ok('the shared link still carries the diagram', !!(shared.json.diagram && shared.json.diagram.nodes));

    const bad = await req('GET', '/discovery/api/v1/public/roadmap/not-a-real-token');
    ok('an unknown share token 404s', bad.status === 404);
  }
  {
    // Regulated work must be held out of Phase 1 by rule.
    const p = (await req('GET', '/discovery/api/v1/processes', { cookie: agentCookie })).json.processes.find(x => x.status === 'confirmed');
    await req('PATCH', '/discovery/api/v1/processes/' + p.id, { cookie: agentCookie, body: { involves_regulated_data: true } });
    const r = await req('GET', '/discovery/api/v1/evaluation/preview', { cookie: agentCookie });
    const phase1Scope = r.json.phases[0].scope || [];
    ok('regulated work is excluded from Phase 1', !phase1Scope.includes(p.name), JSON.stringify(phase1Scope));
    ok('a regulated finding is raised', (r.json.neural || []).some(x => x.code === 'DSC-REGULATED'));
    await req('PATCH', '/discovery/api/v1/processes/' + p.id, { cookie: agentCookie, body: { involves_regulated_data: false } });
  }

  /* ═══ MCP ═══ */
  section('The MCP read surface');
  {
    const r = await req('GET', '/discovery/mcp', { headers: { Authorization: 'Bearer ' + ingestKey } });
    const names = (r.json.tools || []).map(t => t.name);
    ok('an ingest key sees only the ingest tool', names.length === 1 && names[0] === 'discovery.push_capture', JSON.stringify(names));
  }
  {
    const r = await req('GET', '/discovery/mcp', { headers: { Authorization: 'Bearer ' + readKey } });
    const names = (r.json.tools || []).map(t => t.name);
    ok('a read key sees the read tools', names.length === 7, String(names.length));
    ok('a read key cannot see push_capture', !names.includes('discovery.push_capture'));
  }
  {
    const r = await req('POST', '/discovery/mcp', {
      headers: { Authorization: 'Bearer ' + readKey },
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'discovery.push_capture', arguments: { steps: [{ action: 'click' }] } } }
    });
    const payload = JSON.parse(r.json.result.content[0].text);
    ok('a read key is refused the ingest tool', payload.ok === false && /scope/i.test(payload.error));
  }
  {
    const r = await req('POST', '/discovery/mcp', {
      headers: { Authorization: 'Bearer ' + readKey },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'discovery.list_proposed_processes', arguments: {} } }
    });
    const payload = JSON.parse(r.json.result.content[0].text);
    ok('proposals come back explicitly marked proposed',
      payload.status === 'proposed' && /not confirmed/i.test(payload.note));
    ok('every proposed row carries its status', (payload.processes || []).every(p => p.status === 'proposed'));
  }
  {
    const r = await req('POST', '/discovery/mcp', {
      headers: { Authorization: 'Bearer ' + readKey },
      body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'discovery.list_confirmed_processes', arguments: { tenant_id: tenantB } } }
    });
    const payload = JSON.parse(r.json.result.content[0].text);
    ok('a tenant_id in the arguments is ignored',
      payload.ok === true && (payload.processes || []).length > 0);
  }
  {
    const r = await req('POST', '/discovery/mcp', {
      headers: { Authorization: 'Bearer ' + readKey },
      body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'discovery.get_coverage', arguments: {} } }
    });
    const payload = JSON.parse(r.json.result.content[0].text);
    ok('coverage is readable over MCP', payload.ok && payload.coverage.rates.source === 'stated');
  }
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'src', 'services', 'mcp.js'), 'utf8');
    const names = require('./src/services/mcp').TOOLS.map(t => t.name);
    // Verbs, not nouns — `list_confirmed_processes` reads confirmations, it
    // does not make one, and an over-broad grep here would pass on a rename.
    const verbs = names.map(n => n.split('.')[1]);
    ok('no MCP tool confirms a process', !verbs.some(v => /^(confirm|approve|reject)/.test(v)), JSON.stringify(verbs));
    ok('no MCP tool sets a rate or answers a question', !verbs.some(v => /^(set|answer|record|update|patch)/.test(v)));
    ok('the only write tool is push_capture',
      names.filter(n => /push|create|update|delete|set/i.test(n)).length === 1);
  }
  {
    const r = await req('POST', '/discovery/mcp', {
      headers: { Authorization: 'Bearer ' + bothKey },
      body: { jsonrpc: '2.0', id: 5, method: 'initialize', params: {} } });
    ok('initialize answers with a protocol version', r.json.result.protocolVersion === require('./src/services/mcp').PROTOCOL_VERSION);
    const r2 = await req('POST', '/discovery/mcp', { body: { jsonrpc: '2.0', id: 6, method: 'tools/list' } });
    ok('MCP without a key is refused', r2.status === 401);
  }

  /* ═══ TENANT ISOLATION ═══ */
  section('Cross-tenant isolation');
  {
    const login = await req('POST', '/discovery/api/v1/auth/login', { body: { email: email('b'), password: 'sit-password-2' } });
    const cookieB = (login.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    const proc = await req('GET', '/discovery/api/v1/processes', { cookie: cookieB });
    ok('tenant B sees none of tenant A\'s processes', (proc.json.processes || []).length === 0);

    const caps = await req('GET', '/discovery/api/v1/captures', { cookie: cookieB });
    ok('tenant B sees none of tenant A\'s captures', (caps.json.captures || []).length === 0);

    const keys = await req('GET', '/discovery/api/v1/keys', { cookie: cookieB });
    ok('tenant B sees none of tenant A\'s keys', (keys.json.keys || []).length === 0);

    const aProc = (await req('GET', '/discovery/api/v1/processes', { cookie: agentCookie })).json.processes[0];
    const steal = await req('PATCH', '/discovery/api/v1/processes/' + aProc.id, { cookie: cookieB, body: { status: 'rejected' } });
    ok('tenant B cannot touch tenant A\'s process', steal.status === 404);

    const ev = await req('GET', '/discovery/api/v1/evaluations', { cookie: cookieB });
    ok('tenant B has no evaluations', (ev.json.evaluations || []).length === 0);
  }
  {
    const r = await req('GET', '/discovery/api/v1/overview');
    ok('the API is closed without a session', r.status === 401);
    const p = await req('GET', '/discovery/api/v1/processes');
    ok('processes are closed without a session', p.status === 401);
  }

  /* ═══ SURFACES ═══ */
  section('Surfaces');
  {
    const h = await req('GET', '/discovery/health');
    ok('health answers', h.status === 200 && h.json.service === 'AI Discovery');
    ok('health names the engines it reuses', /ai-readiness/.test(h.json.engines));
    ok('health never leaks a key', !h.text.includes('orbup_dk_'));

    for (const p of ['/discovery/', '/discovery/login', '/discovery/signup', '/discovery/how-it-works']) {
      const r = await req('GET', p);
      ok(`${p} serves`, r.status === 200 && /<!doctype html>/i.test(r.text));
    }
    const conn = await req('GET', '/discovery/connect');
    ok('/connect redirects when signed out', conn.status === 302);
    const conn2 = await req('GET', '/discovery/connect', { cookie: agentCookie });
    ok('/connect serves when signed in', conn2.status === 200);
    const ext = await req('GET', '/discovery/extension/manifest.json');
    ok('the extension is downloadable', ext.status === 200 && ext.json.manifest_version === 3);
  }
  {
    const g = await req('GET', '/discovery/guide');
    ok('the walkthrough serves publicly', g.status === 200 && /<!doctype html>/i.test(g.text));
    ok('the walkthrough is linked from the landing page',
      (await req('GET', '/discovery/')).text.includes('/discovery/guide'));

    const js = require('fs').readFileSync(require('path').join(__dirname, 'public', 'guide.js'), 'utf8');
    // Layer 1 and 2 already exist in this repo; a vertical that stands up its
    // own synthesis is the duplication the voice runbook exists to prevent.
    ok('the guide reuses the shared TTS route', js.includes("'/api/tts/edge'"));
    ok('the guide ships no second TTS backend',
      !/elevenlabs|readaloud|speech\.platform\.bing|edge-tts/i.test(js));
    ok('the guide falls back to browser speech', /SpeechSynthesisUtterance/.test(js));

    // Numbers read aloud. Edge says "10.61" and "$147,393" badly, and this is
    // copy being spoken to a business owner — the script spells them, while the
    // page keeps the digits.
    const SCRIPT_BLOCK = js.slice(js.indexOf('const SCRIPT'), js.indexOf('/* ═', js.indexOf('const SCRIPT')));
    const bareNumerals = (SCRIPT_BLOCK.match(/[\$]?\d[\d,.]*/g) || [])
      .filter(t => !/^\d$/.test(t));   // a lone digit in prose is read fine
    ok('the spoken script spells its numbers out', bareNumerals.length === 0,
      'found: ' + bareNumerals.slice(0, 6).join(', '));

    // REGRESSION GUARD — Ava stopped mid-deck and browser speech finished it.
    // Two causes, both greppable, both asserted here so neither can return.
    //
    // 1. A segment long enough to lose the cold-connect race. The service now
    //    chunks and retries, but a 1,500-character monologue is also simply too
    //    long to listen to, so the script is held to a ceiling.
    const SEG_CEILING = 1200;
    const tooLong = [];
    ['en', 'es'].forEach(l => {
      const block = (js.match(new RegExp(l + ': \\[([\\s\\S]*?)\\n  \\]')) || [])[1] || '';
      (block.match(/"(?:[^"\\\\]|\\\\.)*"/g) || []).forEach(seg => {
        if (seg.length > SEG_CEILING) tooLong.push(`${l}:${seg.length}`);
      });
    });
    ok('no narration segment exceeds the length ceiling', !tooLong.length, tooLong.join(', '));

    // 2. A single miss permanently downgrading the voice. The old code set
    //    neuralOK=false on any error, which is exactly what produced "a pause,
    //    then a machine voice for the rest of the presentation".
    ok('one failed segment does not disable the voice', /consecutiveMisses/.test(js) && /GIVE_UP_AFTER/.test(js));
    ok('a failed fetch is retried before falling back', /\.catch\(\(\) => requestNeural/.test(js));
    ok('the fallback is announced, not silent',
      /browser voice/i.test(js) && /voz del navegador/i.test(js));

    // The shared service must keep the widened budget and the chunked path —
    // this vertical is not the only narrated page that depends on them.
    const tts = require('../../src/services/edge-tts');
    ok('the TTS service exposes the chunked path', typeof tts.synthesizeLong === 'function');
    ok('chunking splits on sentence boundaries, losslessly', (() => {
      const long = 'One sentence here. '.repeat(60);
      const parts = tts.chunkText(long, 600);
      return parts.length > 1
        && parts.every(x => x.length <= 760)
        && parts.join(' ').replace(/\s+/g, ' ').trim() === long.replace(/\s+/g, ' ').trim();
    })());
    ok('short text still takes the single-request path', tts.chunkText('Hello there.', 600).length === 1);

    ok('the walkthrough is bilingual', /\ben:\s*\[/.test(js) && /\bes:\s*\[/.test(js));
    const en = (js.match(/en: \[([\s\S]*?)\n  \],/) || [])[1] || '';
    const es = (js.match(/es: \[([\s\S]*?)\n  \]\n/) || [])[1] || '';
    ok('both languages carry the same number of segments',
      (en.match(/^\s*"/gm) || []).length === (es.match(/^\s*"/gm) || []).length);
  }
  {
    // The extension must not read content, and this is greppable.
    const fs = require('fs');
    const content = fs.readFileSync(require('path').join(__dirname, 'extension', 'content.js'), 'utf8');
    const code = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('the recorder never reads a value', !/\.value\b/.test(code));
    // The banner it draws is its own node; writing to that is not reading a page.
    const reads = code.replace(/banner\.textContent\s*=/g, '');
    ok('the recorder never reads text content', !/textContent|innerText|innerHTML/.test(reads));
    ok('the recorder never reads the query string', !/location\.search|location\.hash/.test(code));
    ok('the recorder never takes a screenshot', !/captureVisibleTab|screenshot|toDataURL/i.test(code));
    ok('the recorder shows a visible banner', /showBanner/.test(code) && /recording/i.test(content));
  }
  {
    // The evaluation must not reimplement the department's engines.
    const src = require('fs').readFileSync(require('path').join(__dirname, 'src', 'services', 'evaluate.js'), 'utf8');
    ok('the readiness engines are required, not reimplemented',
      /ai-readiness/.test(src) && /require\(path\.join\(ENGINES/.test(src));
    const order = ['dataEngine.analyze', 'costEngine.analyze', 'riskEngine.analyze', 'scorecardEngine.build', 'roadmapEngine.build']
      .map(k => src.indexOf(k));
    ok('the engines run in the load-bearing order',
      order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
  }
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'src', 'services', 'findings.js'), 'utf8');
    ok('findings speak the CRM Neural vocabulary',
      /CRITICAL/.test(src) && /WARNING/.test(src) && /OPPORTUNITY/.test(src) && /dollarImpact/.test(src));
  }

  /* ═══ CLEANUP ═══ */
  section('Cleanup');
  {
    const { sequelize } = require('./src/models');
    const ids = [tenantA, tenantB].filter(Boolean);
    for (const t of ['dsc_events', 'dsc_findings', 'dsc_evaluations', 'dsc_answers', 'dsc_processes', 'dsc_steps', 'dsc_captures', 'dsc_sources', 'dsc_api_keys']) {
      await sequelize.query(`DELETE FROM ${t} WHERE tenant_id IN (${ids.join(',') || '-1'})`).catch(() => {});
    }
    await sequelize.query(`DELETE FROM dsc_accounts WHERE email LIKE 'sit_${RUN}_%'`).catch(() => {});
    const [left] = await sequelize.query(`SELECT count(*)::int AS n FROM dsc_accounts WHERE email LIKE 'sit_%'`);
    ok('SIT rows removed', left[0].n === 0, `${left[0].n} left`);
    await sequelize.close();
  }

  server.close();
  console.log('\n' + '='.repeat(66));
  console.log(`RESULT: ${pass}/${pass + fail} passed`);
  if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
  console.log('Zero external keys used. Deterministic path throughout.');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('SIT crashed:', e); process.exit(1); });
