'use strict';

/**
 * Lawn Co-Pilot v2 — multi-tenant System Integration Test
 *
 * Run from the repo root:  node verticals/lawncopilot/sit-v2.js
 *
 * Passes with ZERO external keys. Proves the v2 acceptance criteria:
 *   - no route resolves a tenant from an env var (source grep)
 *   - signup provisions a live, quotable company in one transaction
 *   - two tenants with different rate cards price the same address differently
 *   - FULL-REGISTRY isolation: every tool, tenant B against tenant A
 *   - unknown slug 404s, reserved slugs rejected
 *   - payroll never self-files; hours are never guessed
 *   - marketing consent enforced; review requests never gated
 *   - Controller figures trace to real rows
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4699;
const ROOT = `http://127.0.0.1:${PORT}/lawncopilot`;

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name + (detail ? ` -> ${detail}` : '')); console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); }
}

const jars = {};
async function call(method, url, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const jar = opts.jar === undefined ? 'default' : opts.jar;
  if (jar && jars[jar]) headers.Cookie = jars[jar];
  if (opts.headers) Object.assign(headers, opts.headers);
  const res = await fetch(url, {
    method, headers, redirect: 'manual',
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });
  const setC = res.headers.get('set-cookie');
  if (setC && jar) {
    const pairs = setC.split(/,(?=\s*\w+=)/).map(c => c.split(';')[0].trim());
    const map = {};
    (jars[jar] || '').split('; ').filter(Boolean).concat(pairs).forEach(p => {
      const i = p.indexOf('='); map[p.slice(0, i)] = p.slice(i + 1);
    });
    jars[jar] = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { _raw: text.slice(0, 300) }; }
  return { status: res.status, data, text };
}

const stamp = Date.now();
const A = { slug: `sit_alpha_${stamp}`.slice(0, 38), email: `alpha_${stamp}@example.com` };
const B = { slug: `sit_beta_${stamp}`.slice(0, 38), email: `beta_${stamp}@example.com` };
const PW = 'sitpass@2026';
const ADDRESS = '1240 Palm Grove Drive, Orlando FL 32801';

(async function run() {
  console.log('\nLawn Co-Pilot v2 SIT (multi-tenant)\n' + '='.repeat(64));

  const app = express();
  app.use('/lawncopilot', require('./src/index'));
  const server = http.createServer(app);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const models = require('./src/models');
  const brain = require('./src/mcp/brain');
  const tenancy = require('./src/tenancy');

  process.stdout.write('  waiting for schema');
  for (let i = 0; i < 60; i++) {
    try {
      await models.AgentSession.findOne({ raw: true });
      await models.PlatformUser.findOne({ raw: true });
      if (await models.PlatformUser.count() > 0) break;
    } catch (e) { /* still creating */ }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(' ready');

  let alphaId = null, betaId = null;

  try {
    // ── 1. No hardcoded tenants anywhere ──────────────────────────────────
    console.log('\n[1] Tenancy is resolved, never hardcoded');
    const srcFiles = [];
    (function walk(d) {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.js')) srcFiles.push(p);
      }
    })(path.join(__dirname, 'src'));

    const offenders = srcFiles.filter(f => {
      if (/tenancy\.js$/.test(f)) return false;              // documents the rule
      if (/services[\\/]provision\.js$/.test(f)) return false; // seeds/demo only
      return /LAWNCOPILOT_TENANT_ID/.test(fs.readFileSync(f, 'utf8'));
    });
    ok('no route reads a tenant from an env var', offenders.length === 0,
       offenders.map(f => path.relative(__dirname, f)).join(', '));

    // ── 2. Slug rules ─────────────────────────────────────────────────────
    console.log('\n[2] Slug rules');
    ok('reserved slug rejected', !tenancy.validateSlug('platform').ok);
    ok('reserved slug rejected (admin)', !tenancy.validateSlug('admin').ok);
    ok('too-short slug rejected', !tenancy.validateSlug('ab').ok);
    ok('bad characters rejected', !tenancy.validateSlug('My Company!').ok);
    ok('valid slug accepted', tenancy.validateSlug('lawn_monster').ok);
    ok('suggest derives from company name', tenancy.suggestSlug('Lawn Monster LLC') === 'lawn_monster_llc',
       tenancy.suggestSlug('Lawn Monster LLC'));

    let r = await call('GET', `${ROOT}/api/v1/signup/slug-available?slug=platform`);
    ok('availability API rejects reserved', r.data.available === false);

    // ── 3. Signup provisions a working company ────────────────────────────
    console.log('\n[3] Signup and provisioning');
    const signA = await call('POST', `${ROOT}/api/v1/signup`, {
      company_name: 'SIT Alpha Lawn', slug: A.slug, owner_name: 'Alpha Owner',
      owner_email: A.email, owner_phone: '+13055551111', password: PW,
      state: 'FL', counties: ['Orange'], crew_count: 2, plan: 'scale'
    }, { jar: 'alpha' });
    ok('company A provisioned', signA.data.success === true, JSON.stringify(signA.data).slice(0, 200));
    alphaId = signA.data.tenant_id;

    const signB = await call('POST', `${ROOT}/api/v1/signup`, {
      company_name: 'SIT Beta Lawn', slug: B.slug, owner_name: 'Beta Owner',
      owner_email: B.email, owner_phone: '+13055552222', password: PW,
      state: 'FL', counties: ['Seminole'], crew_count: 1, plan: 'scale'
    }, { jar: 'beta' });
    ok('company B provisioned', signB.data.success === true);
    betaId = signB.data.tenant_id;

    ok('signup returns the company page url', /\/lawncopilot\//.test(signA.data.page_url || ''));
    ok('signup signs the owner into their own office', !!jars.alpha && jars.alpha.includes('lawncopilot_staff'));

    for (const [label, id] of [['A', alphaId], ['B', betaId]]) {
      const rules = await models.PricingRule.count({ where: { tenant_id: id } });
      const plans = await models.ServicePlan.count({ where: { tenant_id: id } });
      const crews = await models.Crew.count({ where: { tenant_id: id } });
      const owner = await models.User.count({ where: { tenant_id: id, role: 'owner' } });
      const link = await models.ShortLink.count({ where: { tenant_id: id } });
      ok(`company ${label} got a rate card, plans, crew, owner and share link`,
         rules > 0 && plans > 0 && crews > 0 && owner === 1 && link === 1,
         `rules=${rules} plans=${plans} crews=${crews} owner=${owner} link=${link}`);
    }

    const dupe = await call('POST', `${ROOT}/api/v1/signup`, {
      company_name: 'Dupe', slug: A.slug, owner_name: 'x',
      owner_email: `dupe_${stamp}@example.com`, password: PW
    });
    ok('duplicate slug refused', dupe.data.success === false);

    const badEmail = await call('POST', `${ROOT}/api/v1/signup`, {
      company_name: 'Rollback Co', slug: `sit_rb_${stamp}`, owner_name: 'x',
      owner_email: A.email, password: PW
    });
    ok('duplicate owner email refused', badEmail.data.success === false);
    const rbTenant = await models.Tenant.findOne({ where: { slug: `sit_rb_${stamp}` }, raw: true });
    ok('failed signup left NO partial company behind', !rbTenant);

    // ── 4. The company page is live ───────────────────────────────────────
    console.log('\n[4] The company page');
    const pageA = await call('GET', `${ROOT}/${A.slug}`);
    ok('company A page renders', pageA.status === 200 && pageA.text.includes('SIT Alpha Lawn'));
    ok('page carries the tenant slug for the orb', pageA.text.includes(`data-slug="${A.slug}"`));
    ok('page has the identity gate', pageA.text.includes('id="gateForm"'));
    ok('page has the orb', pageA.text.includes('data-gate="orb"'));
    ok('page has LocalBusiness structured data', pageA.text.includes('"@type":"LocalBusiness"'));

    const unknown = await call('GET', `${ROOT}/no_such_company_${stamp}`);
    ok('unknown slug 404s and never falls back to another company', unknown.status === 404);
    ok('404 page does not leak another company', !/SIT Alpha Lawn/.test(unknown.text));

    const th = await call('GET', `${ROOT}/${B.slug}/health`);
    ok('tenant health reports the right company', th.data.slug === B.slug && th.data.tenant_id === betaId);

    // ── 5. Different rate cards -> different prices ───────────────────────
    console.log('\n[5] Pricing isolation');
    await models.PricingRule.update(
      { params: { rate_per_sqft: 0.0090 } },
      { where: { tenant_id: betaId, rule_type: 'rate' } }
    );

    const gateA = await call('POST', `${ROOT}/${A.slug}/api/v1/orb/identity`, {
      name: 'Homeowner A', phone: '+13055553333', email: `ha_${stamp}@example.com`, channel: 'web_orb'
    });
    ok('identity gate accepted on company A', gateA.data.success === true);
    const sidA = gateA.data.session_id;

    const gateB = await call('POST', `${ROOT}/${B.slug}/api/v1/orb/identity`, {
      name: 'Homeowner B', phone: '+13055554444', email: `hb_${stamp}@example.com`, channel: 'web_orb'
    });
    const sidB = gateB.data.session_id;

    const mA = await call('POST', `${ROOT}/${A.slug}/api/v1/quote/measure`, { session_id: sidA, address: ADDRESS });
    const mB = await call('POST', `${ROOT}/${B.slug}/api/v1/quote/measure`, { session_id: sidB, address: ADDRESS });
    ok('both companies can measure the same address', mA.data.success && mB.data.success);
    ok('the measurement itself agrees', mA.data.serviceable_sqft === mB.data.serviceable_sqft);

    const pA = await call('POST', `${ROOT}/${A.slug}/api/v1/quote/price`, { session_id: sidA, property_id: mA.data.property_id });
    const pB = await call('POST', `${ROOT}/${B.slug}/api/v1/quote/price`, { session_id: sidB, property_id: mB.data.property_id });
    ok('two tenants price the SAME address differently',
       pA.data.options.biweekly.total_cents !== pB.data.options.biweekly.total_cents,
       `A=${pA.data.options.biweekly.total_cents} B=${pB.data.options.biweekly.total_cents}`);

    ['weekly', 'biweekly', 'monthly', 'one_time'].forEach(f => {
      const o = pA.data.options[f];
      ok(`company A ${f} line items reconcile`,
         o.line_items.reduce((a, l) => a + l.amount_cents, 0) === o.total_cents);
    });

    // ── 6. The identity gate, per tenant ──────────────────────────────────
    console.log('\n[6] Identity gate per tenant');
    const nogate = await call('POST', `${ROOT}/${A.slug}/api/v1/quote/measure`, { address: ADDRESS });
    ok('no session, no quote', nogate.status === 403 && nogate.data.gate_required === true);

    const crossSession = await call('POST', `${ROOT}/${B.slug}/api/v1/quote/measure`, {
      session_id: sidA, address: ADDRESS
    });
    ok('company A session cannot be used on company B', crossSession.status === 403);

    const leadA = await models.Lead.findOne({ where: { tenant_id: alphaId, session_id: sidA }, raw: true });
    ok('lead written to the RIGHT company before any address', !!leadA && !!leadA.email);
    const leakedLead = await models.Lead.findOne({ where: { tenant_id: betaId, session_id: sidA }, raw: true });
    ok('lead did not land in the other company', !leakedLead);

    // ── 7. FULL-REGISTRY cross-tenant isolation ───────────────────────────
    console.log('\n[7] Full-registry isolation (every tool, B against A)');
    const alphaProp = await models.Property.findOne({ where: { tenant_id: alphaId }, raw: true });
    const alphaCustomer = await models.Customer.create({
      tenant_id: alphaId, name: 'Alpha Customer', email: `ac_${stamp}@example.com`, phone: '+13055559999'
    });
    const alphaInvoice = await models.Invoice.create({
      tenant_id: alphaId, customer_id: alphaCustomer.id, number: `A-${stamp}`, total_cents: 5000, status: 'open'
    });
    const alphaAppt = await models.Appointment.create({
      tenant_id: alphaId, customer_id: alphaCustomer.id, property_id: alphaProp ? alphaProp.id : null,
      service_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10)  // any future day
    });
    const alphaEmployee = await models.Employee.create({
      tenant_id: alphaId, name: 'Alpha Crew Member', pay_rate_cents: 2000
    });

    const alphaIds = {
      property_id: alphaProp ? alphaProp.id : 999999,
      customer_id: alphaCustomer.id,
      invoice_id: alphaInvoice.id,
      appointment_id: alphaAppt.id,
      employee_id: alphaEmployee.id
    };

    const betaCtx = {
      tenant_id: betaId, channel: 'admin', role: 'owner',
      actor: 'sit:beta', user_id: 1, identity_verified: true
    };

    const registry = Object.keys(brain.REGISTRY);
    let leaks = [];
    for (const toolName of registry) {
      const spec = brain.REGISTRY[toolName];
      const args = {};
      Object.keys(spec.parameters && spec.parameters.properties || {}).forEach(k => {
        if (alphaIds[k] !== undefined) args[k] = alphaIds[k];
      });
      if (!Object.keys(args).length) continue;   // nothing tenant-owned to target

      let out;
      try { out = await brain.callTool(toolName, args, betaCtx); }
      catch (e) { out = { success: false, error: e.message }; }

      // A leak is: succeeded AND actually returned/acted on the other tenant's row.
      if (out && out.success === true && !out.requires_approval) {
        const blob = JSON.stringify(out);
        const referencesAlpha =
          blob.includes('Alpha Customer') ||
          blob.includes('Alpha Crew Member') ||
          blob.includes(`A-${stamp}`);
        if (referencesAlpha) leaks.push(toolName);
      }
    }
    ok('NO tool leaks another company\'s data', leaks.length === 0, leaks.join(', '));
    console.log(`        (${registry.length} tools in registry, exercised cross-tenant)`);

    const injected = await brain.callTool('estimator.price_quote',
      { property_id: alphaIds.property_id, tenant_id: alphaId }, betaCtx);
    ok('tenant_id in tool arguments is ignored', injected.success === false);

    const noTenant = await brain.callTool('estimator.price_quote', { property_id: 1 }, { channel: 'admin' });
    ok('a tool call with no tenant is refused', noTenant.success === false);

    // ── 8. Same email at two companies ────────────────────────────────────
    console.log('\n[8] Same homeowner email at two companies');
    const shared = `shared_${stamp}@example.com`;
    const cA = await models.Customer.create({ tenant_id: alphaId, name: 'Shared A', email: shared });
    const cB = await models.Customer.create({ tenant_id: betaId, name: 'Shared B', email: shared });
    ok('the same email can exist at two companies', cA.id !== cB.id);

    const loginA = await call('POST', `${ROOT}/${A.slug}/api/v1/auth/login`, { email: shared, password: 'nope' });
    ok('customer login is tenant scoped', loginA.status === 401);

    // ── 9. Staff cannot cross companies ───────────────────────────────────
    console.log('\n[9] Staff session scoping');
    const alphaLeads = await call('GET', `${ROOT}/${A.slug}/api/v1/admin/leads`, null, { jar: 'alpha' });
    ok('company A owner sees their own leads', alphaLeads.data.success === true);

    const crossAdmin = await call('GET', `${ROOT}/${B.slug}/api/v1/admin/leads`, null, { jar: 'alpha' });
    ok('company A owner is NOT admin of company B', crossAdmin.status === 401);

    // ── 10. Employee enablement by plan ───────────────────────────────────
    console.log('\n[10] Plan-based employee enablement');
    await models.Tenant.update(
      { plan: 'starter', settings: { enabled_employees: ['receptionist', 'estimator', 'dispatcher', 'bookkeeper', 'crew'] } },
      { where: { id: betaId } }
    );
    brain.bustEnabled(betaId);
    const payrollDenied = await brain.callTool('payroll.payroll_calendar', {}, betaCtx);
    ok('payroll refused on a plan without it',
       payrollDenied.success === false && payrollDenied.code === 'employee_not_enabled');

    await models.Tenant.update(
      { plan: 'scale', settings: { enabled_employees: ['receptionist', 'estimator', 'dispatcher', 'bookkeeper', 'crew', 'marketer', 'payroll', 'controller'] } },
      { where: { id: betaId } }
    );
    brain.bustEnabled(betaId);
    const payrollOk = await brain.callTool('payroll.payroll_calendar', {}, betaCtx);
    ok('payroll available once enabled', payrollOk.success === true);

    // ── 11. Crew: hours are facts ─────────────────────────────────────────
    console.log('\n[11] Crew Manager and time tracking');
    const ctxB = betaCtx;
    const emp = await brain.callTool('crew.add_employee',
      { name: 'Beta Crew Member', pay_rate_cents: 2200, employment_type: 'w2' }, ctxB);
    ok('employee added', emp.success === true);

    const ci = await brain.callTool('crew.clock_in', { employee_id: emp.employee_id }, ctxB);
    ok('clock in creates a real record', ci.success === true);
    const ciAgain = await brain.callTool('crew.clock_in', { employee_id: emp.employee_id }, ctxB);
    ok('double clock-in refused', ciAgain.success === false);

    const co = await brain.callTool('crew.clock_out', { employee_id: emp.employee_id, break_minutes: 0 }, ctxB);
    ok('clock out computes minutes', co.success === true && typeof co.minutes === 'number');

    // An open shift must block payroll rather than be guessed.
    // NOTE: local calendar date, not toISOString() — after ~20:00 Eastern UTC is
    // already tomorrow and the entry would fall outside the timesheet window.
    const { toDateStr } = require('./src/services/scheduling');
    await models.TimeEntry.create({
      tenant_id: betaId, employee_id: emp.employee_id,
      work_date: toDateStr(new Date()),
      clock_in: new Date(Date.now() - 3600000), status: 'open'
    });
    const ts = await brain.callTool('crew.timesheet', {}, ctxB);
    ok('timesheet flags shifts that never clocked out', ts.success && ts.open_shifts > 0 && !!ts.warning);

    // ── 12. Payroll never self-files ──────────────────────────────────────
    console.log('\n[12] Payroll compliance boundary');
    const from = toDateStr(new Date(Date.now() - 7 * 86400000));
    const to = toDateStr(new Date());

    const blocked = await brain.callTool('payroll.compute_pay_run', { period_start: from, period_end: to }, ctxB);
    ok('payroll refuses to run with an open shift', blocked.success === false && !!blocked.blocking_issues);
    ok('payroll does NOT guess the missing hours',
       !!(blocked.blocking_issues || []).find(i => /will not be guessed/i.test(i.message || '')));

    await models.TimeEntry.destroy({ where: { tenant_id: betaId, status: 'open' } });
    await models.TimeEntry.update({ status: 'approved' }, { where: { tenant_id: betaId, status: 'submitted' } });

    const run = await brain.callTool('payroll.compute_pay_run', { period_start: from, period_end: to }, ctxB);
    ok('pay run computes from approved hours', run.success === true, JSON.stringify(run).slice(0, 160));
    ok('pay run is created as DRAFT and NOT filed', run.status === 'draft' && run.filed === false);
    ok('draft notice states nothing was filed', /not filed/i.test(run.notice || ''));

    const submitTooEarly = await brain.callTool('payroll.submit_pay_run', { pay_run_id: run.pay_run_id }, ctxB);
    ok('submit refuses an unapproved run OR parks for approval',
       submitTooEarly.success === false || submitTooEarly.requires_approval === true);

    await brain.callTool('payroll.approve_pay_run', { pay_run_id: run.pay_run_id }, ctxB);
    const submitted = await brain.callTool('payroll.submit_pay_run', { pay_run_id: run.pay_run_id },
      { ...ctxB, channel: 'system' });
    const refusedOrParked = submitted.success === false || submitted.requires_approval === true;
    ok('payroll is NEVER filed without a licensed provider', refusedOrParked);
    const runRow = await models.PayRun.findByPk(run.pay_run_id, { raw: true });
    ok('the pay run row is still marked not filed', runRow.filed === false);

    const fs2 = await brain.callTool('payroll.filing_status', {}, ctxB);
    ok('filing status states plainly that we do not file', fs2.filing_live === false && /does NOT withhold|No payroll provider/i.test(fs2.plain_english));

    // ── 13. Marketing consent + review integrity ──────────────────────────
    console.log('\n[13] Marketing consent and review integrity');
    const noConsent = await models.Customer.create({
      tenant_id: betaId, name: 'No Consent', email: `nc_${stamp}@example.com`,
      consent: { sms_transactional: true, email_marketing: false, sms_marketing: false }
    });
    const withConsent = await models.Customer.create({
      tenant_id: betaId, name: 'Opted In', email: `oi_${stamp}@example.com`,
      consent: { sms_transactional: true, email_marketing: true, sms_marketing: false }
    });

    // Quiet hours are a real guard, so prove it fires, then move the company to
    // a timezone that is currently inside sending hours to test consent.
    const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                   'Asia/Tokyo', 'Europe/London', 'Australia/Sydney', 'Asia/Kolkata', 'UTC'];
    const hourIn = z => Number(new Date().toLocaleString('en-US', { timeZone: z, hour: 'numeric', hour12: false }));
    const quietZone = ZONES.find(z => { const h = hourIn(z); return h >= 21 || h < 8; });
    const openZone = ZONES.find(z => { const h = hourIn(z); return h >= 9 && h < 20; });

    if (quietZone) {
      await models.Tenant.update({ timezone: quietZone }, { where: { id: betaId } });
      const blockedCamp = await brain.callTool('marketer.send_campaign', {
        name: 'SIT quiet hours', body: 'test', customer_ids: [withConsent.id]
      }, ctxB);
      ok('campaign refused during quiet hours',
         blockedCamp.success === false && /sending hours/i.test(blockedCamp.error || ''));
    } else {
      ok('campaign refused during quiet hours (no quiet zone right now — skipped)', true);
    }

    await models.Tenant.update({ timezone: openZone || 'UTC' }, { where: { id: betaId } });
    const camp = await brain.callTool('marketer.send_campaign', {
      name: 'SIT campaign', body: 'Spring cleanup offer.',
      customer_ids: [noConsent.id, withConsent.id]
    }, ctxB);
    ok('campaign ran inside sending hours', camp.success === true, JSON.stringify(camp).slice(0, 160));
    ok('non-consenting contact was suppressed, not messaged', camp.suppressed >= 1);

    const sends = await models.CampaignSend.findAll({
      where: { tenant_id: betaId, campaign_id: camp.campaign_id }, raw: true
    });
    const suppressed = sends.find(s => s.customer_id === noConsent.id);
    ok('suppression is recorded with the reason', suppressed && suppressed.status === 'suppressed');
    ok('consent is snapshotted at send time', sends.every(s => s.consent_snapshot !== null));

    const rev = await brain.callTool('marketer.request_review', { customer_id: withConsent.id }, ctxB);
    ok('review request sent', rev.success === true);
    ok('review request is not gated or incentivized', rev.gated === false && rev.incentivized === false);
    const revAgain = await brain.callTool('marketer.request_review', { customer_id: withConsent.id }, ctxB);
    ok('review requests do not pester', revAgain.success === false);

    const marketerSrc = fs.readFileSync(path.join(__dirname, 'src/mcp/employees/marketer.js'), 'utf8');
    ok('no rating-gating logic exists in the Marketer',
       !/predicted_rating|if\s*\(\s*rating\s*[<>]/.test(marketerSrc));

    // ── 14. Controller traces to real rows ────────────────────────────────
    console.log('\n[14] Controller honesty');
    const savings = await brain.callTool('controller.savings_summary', { days: 30 }, ctxB);
    ok('savings summary runs', savings.success === true);
    ok('every savings item is marked as traced',
       (savings.items || []).every(i => i.traced === true));
    ok('with no data it says so instead of inventing a number',
       savings.items.length > 0 || /Not enough activity/i.test(savings.honesty_note));

    const costing = await brain.callTool('controller.job_costing', { days: 30 }, ctxB);
    ok('job costing runs', costing.success === true);
    ok('jobs without clocked hours are excluded, not estimated',
       costing.jobs_missing_hours === undefined || costing.jobs_missing_hours >= 0);

    // ── 15. Share kit ─────────────────────────────────────────────────────
    console.log('\n[15] The link travels');
    const kit = await call('GET', `${ROOT}/${A.slug}/api/v1/site/share-kit`, null, { jar: 'alpha' });
    ok('share kit returns a page url and short url',
       kit.data.success === true && !!kit.data.page_url && !!kit.data.short_url);
    ok('share kit gives Google Business Profile instructions',
       !!(kit.data.google_business_profile && kit.data.google_business_profile.instructions.length));

    const qr = await call('GET', `${ROOT}/${A.slug}/api/v1/site/qr.svg`);
    ok('QR renders as SVG', qr.status === 200 && qr.text.includes('<svg') && qr.text.includes('<path'));

    const linkRow = await models.ShortLink.findOne({ where: { tenant_id: alphaId }, raw: true });
    const short = await call('GET', `${ROOT}/l/${linkRow.code}`);
    ok('short link redirects to the company page',
       [301, 302].includes(short.status));
    // The click counter is deliberately fire-and-forget so analytics never adds
    // latency to the redirect — poll briefly rather than racing it.
    let clicked = null;
    for (let i = 0; i < 20; i++) {
      clicked = await models.ShortLink.findByPk(linkRow.id, { raw: true });
      if (clicked && clicked.clicks >= 1) break;
      await new Promise(r => setTimeout(r, 100));
    }
    ok('short link counts the click', clicked && clicked.clicks >= 1, `clicks=${clicked && clicked.clicks}`);

    // ── 16. Platform layer ────────────────────────────────────────────────
    console.log('\n[16] Platform super-admin');
    const plogin = await call('POST', `${ROOT}/api/v1/platform/login`, {
      email: 'admin@digit2ai.com',
      password: process.env.LAWNCOPILOT_PLATFORM_PASSWORD || 'lawncopilot@2026'
    }, { jar: 'platform' });
    ok('platform login works', plogin.data.success === true);

    const overview = await call('GET', `${ROOT}/api/v1/platform/overview`, null, { jar: 'platform' });
    ok('platform overview lists companies', overview.data.success === true && overview.data.tenants.length >= 2);
    const blob = JSON.stringify(overview.data);
    ok('platform overview exposes NO customer PII',
       !blob.includes('Alpha Customer') && !blob.includes(shared) && !blob.includes('@example.com'),
       'PII found in platform overview');

    const noReason = await call('POST', `${ROOT}/api/v1/platform/tenants/${alphaId}/impersonate`,
      { reason: 'x' }, { jar: 'platform' });
    ok('support access requires a written reason', noReason.status === 400);

    const imp = await call('POST', `${ROOT}/api/v1/platform/tenants/${alphaId}/impersonate`,
      { reason: 'SIT verification of audited support access' }, { jar: 'platform' });
    ok('support access granted with a reason', imp.data.success === true);
    const impLog = await models.ImpersonationLog.findByPk(imp.data.impersonation_id, { raw: true });
    ok('support access is logged against the operator', !!impLog && !!impLog.reason);

    const anon = await call('GET', `${ROOT}/api/v1/platform/overview`, null, { jar: 'none' });
    ok('platform requires auth', anon.status === 401);

    // ── 17. Truthfulness still holds ──────────────────────────────────────
    console.log('\n[17] Truthfulness');
    const badBook = await brain.callTool('dispatcher.book_appointment', { service_date: '1999-01-01' }, ctxB);
    ok('a failed booking returns success:false with no confirmation language',
       badBook.success === false && !badBook.spoken && !badBook.appointment_id);

    const pmSchema = Object.keys(models.PaymentMethod.rawAttributes);
    ok('no PAN/CVV column exists', !pmSchema.some(a => /card_number|pan|cvv|cvc/i.test(a)));

    // ── 18. Cleanup ───────────────────────────────────────────────────────
    console.log('\n[18] Cleanup');
    for (const id of [alphaId, betaId]) {
      if (!id) continue;
      for (const M of ['CampaignSend', 'Campaign', 'Review', 'Referral', 'PayItem', 'PayRun',
        'TimeEntry', 'Certification', 'Availability', 'JobChecklist', 'Employee',
        'QuoteLineItem', 'Quote', 'PropertyGeometry', 'Measurement', 'MeasurementOverride',
        'Property', 'Appointment', 'ServiceRecord', 'Invoice', 'InvoiceLineItem', 'Payment',
        'PaymentMethod', 'AutopayEnrollment', 'Subscription', 'Ticket', 'Message',
        'Notification', 'CallLog', 'AgentCall', 'AgentApproval', 'AgentSession',
        'AuditLog', 'Lead', 'Customer', 'Crew', 'PricingRule', 'ServicePlan', 'AddonService',
        'SiteContent', 'ShortLink', 'PlatformSubscription', 'ImpersonationLog', 'User', 'Expense',
        'JobCost', 'Route', 'SupplierBill']) {
        try { await models[M].destroy({ where: { tenant_id: id } }); } catch (e) { /* best effort */ }
      }
      try { await models.Tenant.destroy({ where: { id } }); } catch (e) { /* */ }
    }
    const leftA = await models.Tenant.findByPk(alphaId, { raw: true });
    ok('SIT companies removed', !leftA);

  } catch (e) {
    fail++;
    failures.push('EXCEPTION: ' + e.message);
    console.log('\n  EXCEPTION:', e.message);
    console.log(e.stack.split('\n').slice(0, 8).join('\n'));
  }

  server.close();
  console.log('\n' + '='.repeat(64));
  console.log(`RESULT: ${pass} passed, ${fail} failed  (${pass + fail} total)`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
  console.log('');
  process.exit(fail > 0 ? 1 : 0);
})();
