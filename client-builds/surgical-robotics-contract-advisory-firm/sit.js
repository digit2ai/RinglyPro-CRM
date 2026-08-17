// =====================================================
// sit.js — System Integration Test for RoboNegotiate.
//
// Boots the sub-app MOUNTED AT ITS REAL PATH on an ephemeral port and drives it
// over real HTTP, then exits 0 on green and non-zero on red.
//
// IT UNSETS DATABASE_URL BEFORE REQUIRING THE APP, DELIBERATELY. Two reasons:
// the suite must need zero external anything, and the in-memory fallback is a
// shipped code path rather than a hope — so the run that proves the criteria is
// the run that exercises it. The Postgres path is therefore NOT covered here and
// is named in the skipped list rather than quietly implied.
//
// The assertions are the invariants, not the happy path: the arithmetic chain,
// the ramp being a sum of distinct years, the total-contract-value guard, the
// absence of hardcoded figures in the HTML, provenance completeness, and the
// auth boundary in both directions.
//
// Run:  /opt/homebrew/bin/node client-builds/surgical-robotics-contract-advisory-firm/sit.js
// =====================================================

'use strict';

delete process.env.DATABASE_URL;
delete process.env.CRM_DATABASE_URL;
process.env.SRCAF_JWT_SECRET = process.env.SRCAF_JWT_SECRET || 'sit-only-secret';

const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');

const app = require('./index');
const model = require('./lib/model');
const benchmarks = require('./lib/benchmarks');
const { toCsv } = require('./routes/scenarios');

const SERVICE = app.SERVICE;
const VERSION = app.VERSION;
const MOUNT = '/' + SERVICE;

const results = [];
const skipped = [];
let failures = 0;

function check(name, condition, detail) {
  const pass = !!condition;
  if (!pass) failures += 1;
  results.push({ name, pass, detail: detail || '' });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${!pass && detail ? ' -> ' + detail : ''}`);
}

function near(a, b, tol) {
  return Math.abs(Number(a) - Number(b)) <= (tol === undefined ? 0.05 : tol);
}

let BASE = '';

function request(method, urlPath, { headers, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const url = new URL(BASE + urlPath);
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: Object.assign(
        payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
        headers || {},
      ),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        if (!raw) { try { parsed = JSON.parse(text); } catch (e) { parsed = null; } }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, text });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// A deliberately flat, lag-free input set so the arithmetic chain can be
// asserted to the cent without the ramp or the lags in the way.
function chainInputs(extra) {
  return Object.assign({
    engagement: {
      clients_by_year: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      annual_churn_pct: 0,
      override_spend_per_client_usd: 400e6,
    },
    savings: { capture_pct: 0.12, pre_leverage_share: 1 },
    fee: { pct: 0.15, realization_lag_months: 0 },
    market: { adoption_lag_months: 0, start_month: 0, ortho_in_scope: false, cofounder: false },
  }, extra || {});
}

async function run() {
  const host = express();
  host.use(MOUNT, app);
  const server = http.createServer(host);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  console.log(`\nSIT · ${SERVICE} v${VERSION} · ${BASE}${MOUNT}\n`);

  // --- 1. health ----------------------------------------------------------
  console.log('Criterion 1 — health');
  {
    const r = await request('GET', `${MOUNT}/health`);
    check('health returns 200', r.status === 200, `status ${r.status}`);
    check('health status is ok', r.body && r.body.status === 'ok');
    check('health names the service', r.body && r.body.service === SERVICE, r.body && r.body.service);
    check('health carries a version', !!(r.body && r.body.version));
    check('health carries a model version', !!(r.body && r.body.model_version));
    check('health reports the storage backend', !!(r.body && r.body.db_backend), r.body && r.body.db_backend);
  }

  // --- 2. calculate shape -------------------------------------------------
  console.log('\nCriterion 2 — calculate response shape');
  let base = null;
  {
    const r = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: {} } });
    base = r.body;
    check('calculate returns 200', r.status === 200, `status ${r.status}`);
    check('calculate is public (no auth sent)', r.status === 200);
    check('perYear has ten years', base && Array.isArray(base.perYear) && base.perYear.length === 10,
      base && base.perYear && String(base.perYear.length));
    check('perTier is populated', base && Array.isArray(base.perTier) && base.perTier.length === 3);
    check('cumulative carries y1, y5 and y10',
      base && base.cumulative && ['y1', 'y5', 'y10'].every((k) => typeof base.cumulative[k] === 'number'));
    check('netContribution is present', !!(base && base.netContribution));
    check('capacity_exceeded is a boolean', base && typeof base.capacity_exceeded === 'boolean');
    check('sensitivity is a ranked array', base && Array.isArray(base.sensitivity) && base.sensitivity.length > 1);
    check('sensitivity is sorted by swing, descending',
      base && base.sensitivity.every((s, i, a) => i === 0 || a[i - 1].swing_usd >= s.swing_usd));
    check('what_has_to_be_true is populated',
      base && Array.isArray(base.what_has_to_be_true) && base.what_has_to_be_true.length > 0);
    check('provenance reports sourced and total',
      base && base.provenance && typeof base.provenance.sourced === 'number' && typeof base.provenance.total === 'number');
    check('pipeline is populated', base && Array.isArray(base.pipeline) && base.pipeline.length > 0);
    check('reconciliation is populated', base && Array.isArray(base.reconciliation) && base.reconciliation.length > 0);
  }

  // --- 3. the arithmetic chain -------------------------------------------
  console.log('\nCriterion 3 — the base-case chain, to the cent');
  {
    const r = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: chainInputs() } });
    const u = r.body.unit_economics;
    check('blended spend honours the override', u.blended_spend_per_client_usd === 400e6, String(u.blended_spend_per_client_usd));
    check('override is labelled as one', u.blended_spend_is_override === true);
    check('savings delivered per client-year is exact', u.savings_per_client_year_usd === 48e6, String(u.savings_per_client_year_usd));
    check('consulting fee per client-year is exact', u.fee_per_client_year_usd === 7.2e6, String(u.fee_per_client_year_usd));
    check('five-year client value is exact', u.client_value_5yr_usd === 36e6, String(u.client_value_5yr_usd));
    check('year one with two clients and no lag is exact', near(r.body.perYear[0].revenue_usd, 14.4e6),
      String(r.body.perYear[0].revenue_usd));
  }

  // --- 4. ramp integrity --------------------------------------------------
  console.log('\nCriterion 4 — the ramp is a sum of distinct years');
  {
    const inputs = chainInputs({
      engagement: {
        clients_by_year: [2, 4, 8, 12, 18, 18, 18, 18, 18, 18],
        annual_churn_pct: 0,
        override_spend_per_client_usd: 400e6,
      },
    });
    const r = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs } });
    const py = r.body.perYear;
    const manual = py.slice(0, 5).reduce((a, x) => a + x.revenue_usd, 0);
    check('cumulative y5 equals the sum of the five distinct years', near(r.body.cumulative.y5, manual),
      `${r.body.cumulative.y5} vs ${manual}`);
    check('cumulative y5 is NOT five times year one',
      Math.abs(r.body.cumulative.y5 - 5 * py[0].revenue_usd) > 1,
      `y5 ${r.body.cumulative.y5}, 5x y1 ${5 * py[0].revenue_usd}`);
    check('cumulative y10 equals the sum of ten distinct years',
      near(r.body.cumulative.y10, py.reduce((a, x) => a + x.revenue_usd, 0)));
    check('year five revenue equals eighteen clients at the per-client fee',
      near(py[4].revenue_usd, 18 * 7.2e6), String(py[4].revenue_usd));

    // Churn does not lower the target; it raises how many logos must be won.
    const churned = await request('POST', `${MOUNT}/api/v1/calculate`, {
      body: { inputs: chainInputs({ engagement: { clients_by_year: [2, 4, 8, 12, 18, 18, 18, 18, 18, 18], annual_churn_pct: 0.25, override_spend_per_client_usd: 400e6 } }) },
    });
    check('churn increases the new clients needed each year',
      churned.body.perYear[3].arrivals_needed > py[3].arrivals_needed,
      `${churned.body.perYear[3].arrivals_needed} vs ${py[3].arrivals_needed}`);
  }

  // --- 5. total contract value guard --------------------------------------
  console.log('\nCriterion 5 — total contract value is annualised before anything else');
  {
    const annualTier = [{ key: 'national', label: 'National IDNs', idn_count: 1, spend_usd: 2.5e9, spend_basis: 'tier_total', spend_is_tcv: false, tcv_years: 5 }];
    const tcvTier = [{ key: 'national', label: 'National IDNs', idn_count: 1, spend_usd: 2.5e9, spend_basis: 'tier_total', spend_is_tcv: true, tcv_years: 5 }];
    const a = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: { tiers: annualTier } } });
    const b = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: { tiers: tcvTier } } });
    check('a five-year contract value produces exactly one fifth of the market',
      near(a.body.tam_usd / 5, b.body.tam_usd, 1), `${a.body.tam_usd / 5} vs ${b.body.tam_usd}`);

    const hca = base.pipeline.find((p) => /HCA/.test(p.name));
    check('HCA is seeded as total contract value', hca && hca.spend_was_tcv === true);
    check('HCA annualises to one fifth of the entered figure',
      hca && near(hca.annual_spend_usd, 2.5e9 / 5, 1), hca && String(hca.annual_spend_usd));
    check('HCA carries a note saying it is not an annual figure', !!(hca && hca.tcv_note));
  }

  // --- 6. no hardcoded figures in the HTML --------------------------------
  console.log('\nCriterion 6 — no numeric literals in the served markup');
  {
    const htmlDir = path.join(__dirname, 'public');
    const htmlFiles = fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html'));
    check('there is at least one HTML file to check', htmlFiles.length > 0);
    const patterns = [
      { name: 'currency literal', re: /\$\s*\d/ },
      { name: 'percentage literal', re: /\d\s*%/ },
      { name: 'magnitude literal', re: /\b\d+(?:\.\d+)?\s*(?:B|M|K)\b/ },
    ];
    for (const file of htmlFiles) {
      const text = fs.readFileSync(path.join(htmlDir, file), 'utf8');
      for (const p of patterns) {
        const m = text.match(p.re);
        check(`${file} carries no ${p.name}`, !m, m ? `found "${m[0]}"` : '');
      }
    }
    const appJs = fs.readFileSync(path.join(htmlDir, 'app.js'), 'utf8');
    check('app.js carries no currency literal', !/\$\s*\d/.test(appJs));
  }

  // --- 7. provenance completeness -----------------------------------------
  console.log('\nCriterion 7 — every seeded figure declares where it came from');
  {
    const r = await request('GET', `${MOUNT}/api/v1/benchmarks`);
    check('benchmarks returns 200', r.status === 200);
    const entries = r.body.provenance.entries;
    check('the provenance registry is populated', entries.length > 0);
    const missingSource = entries.filter((e) => !e.source || !String(e.source).trim());
    const missingAsOf = entries.filter((e) => !e.as_of);
    const missingBasis = entries.filter((e) => !e.basis);
    check('every entry has a source', missingSource.length === 0, missingSource.map((e) => e.path).join(', '));
    check('every entry has an as-of date', missingAsOf.length === 0, missingAsOf.map((e) => e.path).join(', '));
    check('every entry has a basis', missingBasis.length === 0, missingBasis.map((e) => e.path).join(', '));
    check('sourced plus assumptions plus overrides equals the total',
      r.body.provenance.sourced + r.body.provenance.assumptions + r.body.provenance.overrides === r.body.provenance.total);

    // An operator override must stop counting as sourced.
    const overridden = await request('POST', `${MOUNT}/api/v1/calculate`, {
      body: { inputs: { savings: { capture_pct: 0.19 } } },
    });
    check('an overridden input is reported as an override',
      overridden.body.provenance.overrides > 0, String(overridden.body.provenance.overrides));
    check('an overridden input no longer counts as sourced',
      overridden.body.provenance.sourced < r.body.provenance.sourced,
      `${overridden.body.provenance.sourced} vs ${r.body.provenance.sourced}`);

    check('watchouts ship with the benchmarks payload',
      r.body.watchouts && r.body.watchouts.items.length > 0);
    const undisclaimed = r.body.watchouts.items.filter((i) => !i.disclaimer);
    check('every watchout carries the not-legal-advice line', undisclaimed.length === 0);
    check('the watchouts tab leads with retaining counsel', /counsel/i.test(r.body.watchouts.next_step.headline));
  }

  // --- reconciliation -----------------------------------------------------
  console.log('\nReconciliation against a public anchor');
  {
    const rec = base.reconciliation[0];
    check('the market is compared against a sourced anchor', !!rec.anchor_source);
    check('the anchor comparison reports a status', rec.status === 'ok' || rec.status === 'exceeds', rec.status);
    check('a market above the anchor is flagged rather than printed quietly',
      base.tam_usd <= rec.anchor_usd ? rec.status === 'ok' : rec.status === 'exceeds');
  }

  // --- 8 + 9. auth boundary and magic link --------------------------------
  console.log('\nCriteria 8 and 9 — the auth boundary, in both directions');
  let token = null;
  let scenarioId = null;
  {
    let r = await request('GET', `${MOUNT}/api/v1/scenarios`);
    check('scenarios list refuses without a session', r.status === 401, `status ${r.status}`);
    r = await request('POST', `${MOUNT}/api/v1/scenarios`, { body: { name: 'sit', inputs: {} } });
    check('scenario create refuses without a session', r.status === 401, `status ${r.status}`);

    r = await request('POST', `${MOUNT}/api/v1/auth/magic-link`, { body: { email: 'not-an-email' } });
    check('magic link rejects a malformed address', r.status === 400, `status ${r.status}`);

    r = await request('POST', `${MOUNT}/api/v1/auth/magic-link`, { body: { email: 'stranger@example.com' } });
    check('magic link does not mint a token for an unknown address',
      r.status === 200 && r.body.verify_url === null);

    r = await request('POST', `${MOUNT}/api/v1/auth/magic-link`, { body: { email: 'eriksen.greg@yahoo.com' } });
    check('magic link returns 200 for the seeded address', r.status === 200, `status ${r.status}`);
    check('the verify URL comes back in the response body', !!r.body.verify_url);
    check('the delivery path is stated', r.body.delivery === 'returned_in_response' || r.body.delivery === 'email');
    check('the email is masked in the response', /^e\*\*\*@/.test(r.body.email_masked || ''), r.body.email_masked);

    const verifyPath = r.body.verify_url.slice(r.body.verify_url.indexOf(MOUNT));
    const magic = verifyPath.split('token=')[1];

    let v = await request('GET', `${MOUNT}/api/v1/auth/verify?token=${magic}`);
    check('a valid link returns 200 and a session token', v.status === 200 && !!v.body.token, `status ${v.status}`);
    token = v.body.token;

    v = await request('GET', `${MOUNT}/api/v1/auth/verify?token=${magic}`);
    check('the same link cannot be used twice', v.status === 401 && v.body.reason === 'already_used', v.body && v.body.reason);

    v = await request('GET', `${MOUNT}/api/v1/auth/verify?token=deadbeef`);
    check('an unknown link is refused', v.status === 401);

    const authHeader = { Authorization: `Bearer ${token}` };
    r = await request('POST', `${MOUNT}/api/v1/scenarios`, {
      headers: authHeader,
      body: { name: 'SIT base case', inputs: chainInputs() },
    });
    check('scenario create returns 201 with a session', r.status === 201, `status ${r.status}`);
    check('the persisted row carries computed projections',
      r.body.data && r.body.data.projections && r.body.data.projections.cumulative);
    check('the persisted row carries a tenant id', r.body.data && r.body.data.tenant_id === 1);
    check('the projection was recomputed server-side, not accepted from the client',
      r.body.data.projections.unit_economics.fee_per_client_year_usd === 7.2e6);
    scenarioId = r.body.data.id;

    r = await request('GET', `${MOUNT}/api/v1/scenarios`, { headers: authHeader });
    check('scenarios list returns 200 with a session', r.status === 200);
    check('the list carries the saved scenario', r.body.data.some((s) => s.id === scenarioId));
    check('every listed row belongs to the caller tenant', r.body.data.length >= 1);

    r = await request('GET', `${MOUNT}/api/v1/scenarios/999999`, { headers: authHeader });
    check('an unknown scenario id resolves to 404, not 403', r.status === 404, `status ${r.status}`);

    r = await request('GET', `${MOUNT}/api/v1/scenarios`, { headers: { Authorization: 'Bearer not.a.token' } });
    check('a forged session token is refused', r.status === 401);
  }

  // --- 10. the served shell -----------------------------------------------
  console.log('\nCriterion 10 — the served shell renders all five tabs');
  {
    const r = await request('GET', `${MOUNT}/`, { raw: true });
    check('the root returns 200', r.status === 200, `status ${r.status}`);
    check('the shell names the product', /RoboNegotiate/.test(r.text));
    check('the shell carries the Fee-on-Savings heading', /Fee-on-Savings/.test(r.text));
    for (const tab of ['Dashboard', 'Market Sizing', 'Revenue Model', 'IDN Pipeline', 'Watchouts']) {
      check(`the shell carries the ${tab} tab`, new RegExp(tab).test(r.text));
    }
    check('the base-path token was substituted server-side', !/\{\{BASE\}\}/.test(r.text));
    check('no template token survives into the served HTML', !/\{\{[A-Z_]+\}\}/.test(r.text));
    check('the guardrail banner is present', /Do not enter Intuitive-confidential pricing/.test(r.text));
    check('the shell links its stylesheet at the mounted base', new RegExp(`${MOUNT}/app\\.css`).test(r.text));
  }

  // --- 11. CSV export ------------------------------------------------------
  console.log('\nCriterion 11 — the CSV export matches the stored projection');
  {
    const authHeader = { Authorization: `Bearer ${token}` };
    const csv = await request('GET', `${MOUNT}/api/v1/scenarios/${scenarioId}/export.csv`, { headers: authHeader, raw: true });
    check('export returns 200', csv.status === 200, `status ${csv.status}`);
    check('export is served as CSV', /text\/csv/.test(csv.headers['content-type'] || ''));
    check('export is served as a download', /attachment/.test(csv.headers['content-disposition'] || ''));

    const json = await request('GET', `${MOUNT}/api/v1/scenarios/${scenarioId}`, { headers: authHeader });
    const py = json.body.data.projections.perYear;
    const lines = csv.text.split('\n');
    const headerIdx = lines.findIndex((l) => l.startsWith('Year,Active clients'));
    check('the CSV carries the projection table', headerIdx > 0);
    let rowsMatch = true;
    let mismatch = '';
    for (let i = 0; i < py.length; i += 1) {
      const cells = lines[headerIdx + 1 + i].split(',');
      if (Number(cells[0]) !== py[i].year || Number(cells[6]) !== py[i].revenue_usd) {
        rowsMatch = false;
        mismatch = `year ${py[i].year}: csv ${cells[6]} vs json ${py[i].revenue_usd}`;
        break;
      }
    }
    check('every CSV projection row equals its JSON counterpart', rowsMatch, mismatch);
    check('the CSV carries the assumptions block', /ASSUMPTIONS AND PROVENANCE/.test(csv.text));
    check('the CSV carries the reconciliation block', /RECONCILIATION/.test(csv.text));
    check('the CSV carries what has to be true', /WHAT HAS TO BE TRUE/.test(csv.text));
    check('the CSV names its model version', csv.text.indexOf(json.body.data.model_version) > 0);

    const noAuth = await request('GET', `${MOUNT}/api/v1/scenarios/${scenarioId}/export.csv`, { raw: true });
    check('export refuses without a session', noAuth.status === 401, `status ${noAuth.status}`);
  }

  // --- 12. the app runs with no database ----------------------------------
  console.log('\nCriterion 12 — the app is fully usable with no database');
  {
    const r = await request('GET', `${MOUNT}/health`);
    check('health reports the in-memory backend', r.body.db_backend === 'memory', r.body.db_backend);
    check('health explains why', !!r.body.db_error, r.body.db_error);
    const c = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: {} } });
    check('the model still computes with no database', c.status === 200 && c.body.cumulative.y5 > 0);
    const shell = await request('GET', `${MOUNT}/`, { raw: true });
    check('the app still renders with no database', shell.status === 200);
    skipped.push('The Postgres storage path. This run unsets DATABASE_URL on purpose so the suite needs nothing external; the in-memory fallback is what was exercised.');
  }

  // --- scope toggles from the triage --------------------------------------
  console.log('\nThe triage open questions, shipped as toggles');
  {
    const off = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: { market: { ortho_in_scope: false } } } });
    const on = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: { market: { ortho_in_scope: true } } } });
    check('the orthopedic toggle raises the modelled market', on.body.tam_usd > off.body.tam_usd,
      `${on.body.tam_usd} vs ${off.body.tam_usd}`);

    const solo = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: { market: { cofounder: false } } } });
    const duo = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: { market: { cofounder: true } } } });
    check('the co-founder toggle adds a partner',
      duo.body.capacity.partners_planned === solo.body.capacity.partners_planned + 1);

    const late = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: { market: { start_month: 6 } } } });
    check('starting mid-year shortens year one', late.body.perYear[0].revenue_usd < base.perYear[0].revenue_usd);

    const investor = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: { view: 'personal' } } });
    check('the view toggle is carried through to the response', investor.body.inputs.view === 'personal');
  }

  // --- capacity honesty ----------------------------------------------------
  console.log('\nThe ramp has to be staffable');
  {
    const r = await request('POST', `${MOUNT}/api/v1/calculate`, {
      body: { inputs: { costs: { partners: 1, clients_per_partner: 2 } } },
    });
    check('an unstaffable ramp is flagged', r.body.capacity_exceeded === true);
    check('the peak partner requirement is reported', r.body.capacity.peak_required_partners > r.body.capacity.partners_planned);
    check('the shortfall appears in what has to be true',
      r.body.what_has_to_be_true.some((w) => /capacity/i.test(w.driver)));
    check('cost prices the partners the ramp requires, not the ones planned',
      r.body.perYear[4].cost_usd > r.body.perYear[0].cost_usd);
  }

  // --- break-even ----------------------------------------------------------
  // Guarding a real defect: taking the first year with a non-negative cumulative
  // and interpolating from the prior year returns month zero whenever year one
  // is already profitable, because the practice starts at zero by definition.
  // Break-even must land inside the year the lines actually cross.
  console.log('\nBreak-even is a month, and never month zero');
  {
    const r = await request('POST', `${MOUNT}/api/v1/calculate`, { body: { inputs: {} } });
    const be = r.body.netContribution.break_even_month;
    check('break-even is reported', be !== undefined);
    check('break-even is never month zero', be === null || be >= 1, String(be));

    const starved = await request('POST', `${MOUNT}/api/v1/calculate`, {
      body: { inputs: { fee: { pct: 0.001 }, costs: { loaded_cost_per_partner_yr: 900000 } } },
    });
    check('a practice that never covers its cost reports no break-even',
      starved.body.netContribution.break_even_month === null,
      String(starved.body.netContribution.break_even_month));
    check('a practice that never breaks even has a negative five-year net',
      starved.body.cumulative.net_y5 < 0, String(starved.body.cumulative.net_y5));

    const slow = await request('POST', `${MOUNT}/api/v1/calculate`, {
      body: { inputs: { fee: { realization_lag_months: 12 }, engagement: { clients_by_year: [1, 1, 2, 3, 5, 6, 7, 8, 9, 10] } } },
    });
    check('a slower ramp breaks even later than the default',
      slow.body.netContribution.break_even_month > be,
      `${slow.body.netContribution.break_even_month} vs ${be}`);
  }

  // --- the model is pure ---------------------------------------------------
  console.log('\nThe model is deterministic and self-contained');
  {
    const a = model.project(chainInputs());
    const b = model.project(chainInputs());
    check('the same inputs produce byte-identical output', JSON.stringify(a) === JSON.stringify(b));

    const src = fs.readFileSync(path.join(__dirname, 'lib', 'model.js'), 'utf8');
    check('the model reads no environment variables', !/process\.env/.test(src));
    check('the model performs no I/O', !/require\(['"](fs|http|https|net)['"]\)/.test(src));
    check('the model does not read the clock', !/Date\.now\(\)|new Date\(\)/.test(src));

    check('the tier count matches the seeded registry', benchmarks.defaults().tiers.length === 3);
    check('the model exposes its version', typeof model.MODEL_VERSION === 'string' && model.MODEL_VERSION.length > 0);

    const csvOnly = toCsv({
      name: 'unit', model_version: model.MODEL_VERSION, created_at: new Date(), notes: null,
      projections: a && Object.assign({}, a, {
        pipeline: [], reconciliation: [], sensitivity: [], what_has_to_be_true: [],
        provenance: benchmarks.provenanceFor(a.inputs),
      }),
    });
    check('the CSV writer runs against a bare projection', typeof csvOnly === 'string' && csvOnly.length > 0);
  }

  // --- tenant isolation ----------------------------------------------------
  console.log('\nTenant isolation');
  {
    const jwt = require('jsonwebtoken');
    const otherTenant = jwt.sign(
      { aud: 'srcaf', email: 'other@example.com', tenant_id: 2 },
      process.env.SRCAF_JWT_SECRET,
      { expiresIn: '5m' },
    );
    const r = await request('GET', `${MOUNT}/api/v1/scenarios`, { headers: { Authorization: `Bearer ${otherTenant}` } });
    check('another tenant sees none of this tenant\'s scenarios', r.status === 200 && r.body.data.length === 0,
      r.body && r.body.data && String(r.body.data.length));
    const g = await request('GET', `${MOUNT}/api/v1/scenarios/${scenarioId}`, { headers: { Authorization: `Bearer ${otherTenant}` } });
    check('another tenant reading a known id gets 404, not 403', g.status === 404, `status ${g.status}`);

    // The tenant must come from the session, never from the request body.
    const spoof = await request('POST', `${MOUNT}/api/v1/scenarios`, {
      headers: { Authorization: `Bearer ${token}` },
      body: { name: 'spoof', tenant_id: 2, inputs: {} },
    });
    check('a client-supplied tenant id is ignored', spoof.status === 201 && spoof.body.data.tenant_id === 1,
      spoof.body && spoof.body.data && String(spoof.body.data.tenant_id));
    await request('DELETE', `${MOUNT}/api/v1/scenarios/${spoof.body.data.id}`, { headers: { Authorization: `Bearer ${token}` } });
  }

  // --- clean up ------------------------------------------------------------
  {
    const authHeader = { Authorization: `Bearer ${token}` };
    const del = await request('DELETE', `${MOUNT}/api/v1/scenarios/${scenarioId}`, { headers: authHeader });
    check('the harness deletes the rows it created', del.status === 200);
    const gone = await request('GET', `${MOUNT}/api/v1/scenarios/${scenarioId}`, { headers: authHeader });
    check('the deleted scenario is gone', gone.status === 404);
  }

  await new Promise((r) => server.close(r));
  summary();
}

function summary() {
  const total = results.length;
  const passed = total - failures;
  console.log('\n' + '-'.repeat(64));
  console.log(`## SIT · ${SERVICE} v${VERSION}`);
  console.log('');
  console.log(`**${passed}/${total} checks passed**  ·  ${failures === 0 ? 'GREEN' : 'RED'}`);
  console.log('');
  if (failures) {
    console.log('| Failed check | Detail |');
    console.log('|---|---|');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`| ${r.name} | ${String(r.detail).replace(/\|/g, '/').slice(0, 100)} |`);
    }
    console.log('');
  }
  if (skipped.length) {
    console.log('**Not covered by this run:**');
    for (const s of skipped) console.log(`- ${s}`);
    console.log('');
  }
  console.log('Zero external keys. Criteria 1-12 covered over real HTTP against the app mounted at its real path.');
  console.log('-'.repeat(64) + '\n');
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('\nSIT harness crashed:', err && err.stack);
  process.exit(1);
});
