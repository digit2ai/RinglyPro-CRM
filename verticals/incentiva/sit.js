'use strict';

/**
 * BuyersLine SIT. Run: node verticals/incentiva/sit.js
 *
 * Zero external keys: ANTHROPIC_API_KEY is removed before anything loads, and
 * geocoding is off, so the keyless paths are the ones under test. It attacks
 * the invariants: unverified or stale incentives reaching a buyer, a decrease
 * that stays visible, an unlicensed account confirming, a figure invented in
 * prose, a cross-tenant or cross-agent read, a transaction-contingent charge,
 * a consent text forged by the client. DB sections run under throwaway tenants
 * 990913 / 990914 and delete their own rows.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const HAD_KEY = !!process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
const SIT_TENANT = 990913, OTHER_TENANT = 990914;
Object.assign(process.env, {
  INCENTIVA_TENANT_ID: String(SIT_TENANT), INCENTIVA_GEOCODE: 'off', INCENTIVA_INTAKE_PER_HOUR: '500',
  INCENTIVA_OWNER_EMAIL: 'sit-owner@example.test', INCENTIVA_OWNER_PASSWORD: 'sit-owner-password-2026x',
  INCENTIVA_AGENT_EMAIL: 'sit-agent@example.test', INCENTIVA_AGENT_PASSWORD: 'sit-agent-password-2026x', INCENTIVA_AGENT_NAME: 'Sit Agent',
  INCENTIVA_AGENT_LICENSE: 'SL0000000', INCENTIVA_BROKERAGE_NAME: 'SIT Brokerage LLC', INCENTIVA_BROKERAGE_LICENSE: 'BK0000000'
});
delete process.env.INCENTIVA_REPORT_REVIEW;
delete process.env.INCENTIVA_CONSULT_MONTHLY_CAP;
delete process.env.INCENTIVA_MONITOR_GO;
delete process.env.INCENTIVA_SEED_DEMO;

const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

let pass = 0, fail = 0;
const failures = [], skipped = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name + ': ' + e.message); console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'expected equal') + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function walk(dir, out = []) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; }
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1'); }

(async () => {
  const { scenarios } = require('./src/engines/payment');
  const fresh = require('./src/engines/freshness');
  const changes = require('./src/engines/changes');
  const extractor = require('./src/engines/extractor');
  const compliance = require('./src/engines/compliance');
  const advisor = require('./src/engines/advisor');
  const fit = require('./src/engines/fit');
  const bp = require('./src/engines/buyingPower');
  const billing = require('./src/engines/billing');
  const i18n = require('./src/engines/i18n');
  const monitorMod = require('./src/services/monitor');

  const DEMO_SETTINGS = { reference_rate: 6.25, tax_rate_by_county: { Hillsborough: 0.015 }, tax_rate_default: 0.015, insurance_monthly: 160, pmi_rate_annual: 0.004, closing_cost_pct: 3, down_payment_pct_default: 5 };

  console.log('\nA. Payment engine');
  await t('worked example reconciles to the dollar (P&I + tax + insurance + HOA + PMI)', () => {
    const r = scenarios({ price: 419990, financing: 'needs_lender', county: 'Hillsborough', settings: DEMO_SETTINGS,
      fees: [{ fee_type: 'hoa', amount_usd: 95, period: 'month' }, { fee_type: 'cdd_om', amount_usd: 0, period: 'year' }],
      incentives: [{ id: 1, type: 'rate_buydown_temporary', buydown_schedule: [2, 1] }, { id: 2, type: 'closing_cost_assistance', value_usd: 12000 }] });
    eq(r.base.year3plus, 3370, 'base payment');
    eq(r.base.cash_to_close, 33600, 'cash to close');
    const bd = r.options.find((o) => o.incentive_id === 1);
    eq(bd.year1, 2876, 'buydown year 1'); eq(bd.year2, 3116, 'buydown year 2'); eq(bd.year3plus, 3370, 'buydown year 3+');
    eq(r.options.find((o) => o.incentive_id === 2).cash_to_close, 21600, 'closing credit');
  });
  await t('an unknown CDD is never zero: payment is marked "from"', () => {
    const r = scenarios({ price: 400000, financing: 'needs_lender', county: 'Hillsborough', settings: DEMO_SETTINGS, fees: [{ fee_type: 'hoa', amount_usd: 95, period: 'month' }], incentives: [] });
    eq(r.fees_known, false); eq(r.base.from, true);
  });
  await t('a temporary buydown always carries its post-buydown payment; 3-year schedules are not modeled', () => {
    const r = scenarios({ price: 400000, financing: 'fha', county: 'Hillsborough', settings: DEMO_SETTINGS, fees: [], incentives: [{ id: 1, type: 'rate_buydown_temporary', buydown_schedule: [2, 1] }, { id: 2, type: 'rate_buydown_temporary', buydown_schedule: [3, 2, 1] }] });
    assert(r.options[0].year3plus > r.options[0].year1, 'year3+ above year 1');
    eq(r.options[1].modeled, false); eq(r.options[1].reason, 'schedule_longer_than_two_years');
  });
  await t('no reference rate = nothing estimated, with a reason', () => {
    const r = scenarios({ price: 400000, financing: 'needs_lender', settings: Object.assign({}, DEMO_SETTINGS, { reference_rate: null }), fees: [], incentives: [{ id: 1, type: 'price_reduction', value_usd: 5000 }] });
    eq(r.base.modeled, false); eq(r.base.year1, null); eq(r.options[0].reason, 'no_reference_rate');
  });
  await t('a lender-required incentive is not applied to a cash buyer; an unstated amount is not invented', () => {
    const r = scenarios({ price: 400000, financing: 'cash', settings: DEMO_SETTINGS, fees: [], incentives: [{ id: 1, type: 'closing_cost_assistance', value_usd: 9000, requires_affiliated_lender: true }, { id: 2, type: 'flex_cash', value_usd: null }] });
    eq(r.options[0].reason, 'lender_required_cash_buyer'); eq(r.options[1].reason, 'value_not_stated');
  });

  console.log('\nB. Freshness and the buyer-safe rule');
  const now = new Date();
  const base = { audience: 'buyer', verification_status: 'verified', last_verified_at: now, fresh_until: new Date(now.getTime() + 86400000) };
  await t('expires today (New York) is still shown; yesterday is not', () => {
    const today = fresh.todayET(now);
    const y = fresh.todayET(new Date(now.getTime() - 86400000));
    eq(fresh.isBuyerSafe(Object.assign({}, base, { expires_on: today }), now), true);
    eq(fresh.isBuyerSafe(Object.assign({}, base, { expires_on: y }), now), false);
  });
  await t('pending, withdrawn, broker-audience and stale versions never reach a buyer', () => {
    eq(fresh.isBuyerSafe(Object.assign({}, base, { verification_status: 'pending_verification' }), now), false);
    eq(fresh.isBuyerSafe(Object.assign({}, base, { verification_status: 'withdrawn' }), now), false);
    eq(fresh.isBuyerSafe(Object.assign({}, base, { audience: 'broker' }), now), false);
    eq(fresh.isBuyerSafe(Object.assign({}, base, { fresh_until: new Date(now.getTime() - 1) }), now), false);
  });
  await t('freshness window: the earlier of the expiry and the window', () => {
    const v = new Date('2026-09-01T12:00:00Z');
    const a = fresh.computeFreshUntil(v, '2026-09-05', { fresh_days_with_expiry: 21 });
    assert(a < new Date('2026-09-06T06:00:00Z') && a > new Date('2026-09-05T20:00:00Z'), 'ends at end of Sep 5 ET, got ' + a.toISOString());
    eq(fresh.computeFreshUntil(v, null, { fresh_days_no_expiry: 10 }).toISOString(), '2026-09-11T12:00:00.000Z');
  });

  console.log('\nC. Change detection (asymmetric safety)');
  const cur = { type: 'closing_cost_assistance', value_usd: 12000, value_cap_usd: 12000 };
  await t('a decrease hides the visible offer immediately', () => eq(changes.classify(cur, { type: cur.type, value_usd: 8000, value_cap_usd: 8000 }).action, 'withdraw_current'));
  await t('an increase waits for the agent', () => eq(changes.classify(cur, { type: cur.type, value_usd: 15000, value_cap_usd: 15000 }).action, 'propose'));
  await t('a lower builder rate is an increase in value', () => eq(changes.classify({ type: 'below_market_fixed_rate', rate: 4.99 }, { type: 'below_market_fixed_rate', rate: 4.5 }).change_kind, 'increase'));
  await t('an amount that vanished from the wording is treated as a decrease', () => eq(changes.classify(cur, { type: cur.type, value_usd: null, value_cap_usd: null }).action, 'withdraw_current'));
  await t('a newly required lender narrows the offer: hide first', () => eq(changes.classify(cur, Object.assign({}, cur, { requires_affiliated_lender: true })).action, 'withdraw_current'));

  console.log('\nD. Extraction verifier (runs on every path)');
  const SRC_TEXT = 'Fall savings! Up to $15,000 toward closing costs when you finance with our preferred lender and close by December 31, 2026. On select quick move-in homes. Agents: earn a 1% bonus on contracts written this month.';
  await t('heuristic reads amount, lender requirement, close-by date and the question about "select" homes', () => {
    const items = extractor.verifyExtraction(extractor.heuristic(SRC_TEXT), SRC_TEXT).kept;
    const cc = items.find((i) => i.type === 'closing_cost_assistance');
    assert(cc, 'closing cost found'); eq(cc.value_usd, 15000); eq(cc.value_cap_usd, 15000); eq(cc.requires_affiliated_lender, true); eq(cc.close_by, '2026-12-31');
    assert(items.find((i) => i.type === 'broker_bonus' && i.audience === 'broker'), 'agent bonus classified as broker audience');
  });
  await t('a headline that is not verbatim in the source is discarded', () => {
    const r = extractor.verifyExtraction([{ type: 'price_reduction', headline: 'Prices slashed by $50,000 on every home', value_usd: 50000 }], SRC_TEXT);
    eq(r.kept.length, 0); eq(r.discarded[0].reason, 'headline_not_in_source');
  });
  await t('an invented amount, rate or date is nulled and becomes a question', () => {
    const r = extractor.verifyExtraction([{ type: 'closing_cost_assistance', headline: 'Up to $15,000 toward closing costs when you finance with our preferred lender and close by December 31, 2026.',
      value_usd: 25000, rate: 3.99, expires_on: '2027-01-15' }], SRC_TEXT);
    const k = r.kept[0];
    eq(k.value_usd, null); eq(k.rate, null); eq(k.expires_on, null);
    assert(k.verifier_questions.length >= 3, 'questions added');
  });
  await t('extract() with no key is labelled heuristic', async () => {
    const r = await extractor.extract(SRC_TEXT);
    eq(r.extracted_by, 'heuristic'); eq(r.is_simulated, true);
  });

  console.log('\nE. Compliance guard');
  const cleanPayload = () => ({ narrative: { opening: 'I compared 2 new-home options.', watch_outs: [], questions_to_ask: ['Which homes qualify?'], next_step: 'Request a call.' },
    items: [{ community: { name: 'Sample Preserve' }, incentives: [], scenarios: [{ label: 'x', modeled: true, from: true, year3plus: 3370 }], fees_known: false, take: 'Priced at $419,990.', fit: { reasons: ['Priced at $419,990, within your $450,000 budget.'] } }],
    comparison: [], criteria_summary: { budget_max: 450000 }, assumptions: [], disclosures: { platform: 'a', compensation: 'b', estimates: 'c', incentives: 'd', equal_housing: 'e' } });
  await t('clean report passes', () => eq(compliance.reviewReport(cleanPayload()).verdict, 'pass'));
  await t('a fair-housing hard term blocks (EN and ES)', () => {
    const p = cleanPayload(); p.narrative.opening = 'Quiet street, no children allowed.'; eq(compliance.reviewReport(p).verdict, 'block');
    const q = cleanPayload(); q.narrative.opening = 'Es un barrio latino tranquilo.'; eq(compliance.reviewReport(q).verdict, 'block');
  });
  await t('steering language holds', () => { const p = cleanPayload(); p.narrative.watch_outs = ['Great for young families, safe neighborhood.']; eq(compliance.reviewReport(p).verdict, 'hold'); });
  await t('a figure in prose that the data does not contain holds', () => { const p = cleanPayload(); p.narrative.opening = 'You could save $42,000 here.'; eq(compliance.reviewReport(p).verdict, 'hold'); });
  await t('a missing disclosure holds', () => { const p = cleanPayload(); delete p.disclosures.equal_housing; eq(compliance.reviewReport(p).verdict, 'hold'); });
  await t('an incentive that is not buyer-safe blocks', () => {
    const p = cleanPayload(); p.items[0].incentives = [{ version_id: 77, headline: 'x' }];
    eq(compliance.reviewReport(p, { versionsById: { 77: Object.assign({}, base, { verification_status: 'pending_verification' }) } }).verdict, 'block');
  });
  await t('an unknown fee shown as a complete payment holds', () => { const p = cleanPayload(); p.items[0].scenarios[0].from = false; eq(compliance.reviewReport(p).verdict, 'hold'); });

  console.log('\nF. Narrative, fit, buying power, billing');
  await t('model rewrite is rejected if it adds a figure or a name, accepted if it only rewords', () => {
    const orig = 'First, look at Sample Preserve by Sample Builder North: Priced at $419,990.';
    eq(advisor.acceptRewrite(orig, 'Start with Sample Preserve by Sample Builder North, priced at $399,990.', ''), false);
    eq(advisor.acceptRewrite(orig, 'Start with Sample Preserve near Brandon Estates, priced at $419,990.', ''), false);
    eq(advisor.acceptRewrite(orig, 'I would start with Sample Preserve by Sample Builder North, priced at $419,990.', ''), true);
  });
  await t('fit score uses property and criteria only (fair housing): buyer identity cannot change it', () => {
    const item = { community: { zip: '33578', age_restricted: false }, home: { list_price: 400000, beds: 4, baths: 2, est_completion: 'ready' }, fees: [] };
    const c = { budget_max: 450000, target_zips: ['33578'], beds_min: 3, baths_min: 2, timeline: '0_3m', must_haves: [] };
    const a = fit.scoreFit(item, c), b = fit.scoreFit(item, Object.assign({ language: 'es', first_name: 'María', email: 'x@y.z', national_origin: 'x' }, c));
    eq(a.score, b.score);
    const srcFit = stripComments(read(path.join(SRC, 'engines', 'fit.js')));
    assert(!/\b(language|first_name|email|phone|preferred_language)\b/.test(srcFit), 'fit.js references buyer identity fields');
  });
  await t('buying power refuses to estimate without income or a reference rate', () => {
    eq(bp.estimate({ gross_income_annual: null }, DEMO_SETTINGS).estimate, null);
    const r = bp.estimate({ gross_income_annual: 120000, monthly_debts: 500, down_payment: 20000 }, Object.assign({}, DEMO_SETTINGS, { reference_rate: null }));
    eq(r.estimate, null); assert(r.missing.includes('reference_rate'));
  });
  await t('buying power charges mortgage insurance only below 20% down, like the payment engine', () => {
    const big = { gross_income_annual: 150000, monthly_debts: 0, down_payment: 300000 };
    const a = bp.estimate(big, DEMO_SETTINGS).estimate, b = bp.estimate(big, Object.assign({}, DEMO_SETTINGS, { pmi_rate_annual: 0 })).estimate;
    eq(a.price_high, b.price_high, 'PMI changed a 20%+ down estimate');
  });
  await t('buying power returns an ordered range when inputs exist', () => {
    const r = bp.estimate({ gross_income_annual: 120000, monthly_debts: 500, down_payment: 20000 }, DEMO_SETTINGS);
    assert(r.estimate && r.estimate.price_low > 100000 && r.estimate.price_low <= r.estimate.price_high, JSON.stringify(r.estimate));
  });
  await t('billing knows exactly one event: consult_held; closing, agreement or registration cannot be billed', () => {
    eq(JSON.stringify(billing.ALLOWED_EVENTS), '["consult_held"]');
    for (const ev of ['closing', 'agreement_signed', 'registration', 'commission']) {
      let threw = false; try { billing.evaluate(ev, 0); } catch (e) { threw = true; } assert(threw, ev + ' was billable');
    }
    eq(billing.evaluate('consult_held', 20, { fee_usd: 350, monthly_cap: 20 }).billable, false);
    const mig = read(path.join(ROOT, 'migrations', '20260913_incentiva_tables.sql'));
    assert(/event IN \('consult_held'\)/.test(mig), 'database CHECK limits events to consult_held');
    assert(!/commission_pct|percent_of_commission|referral_fee/i.test(stripComments(read(path.join(SRC, 'engines', 'billing.js')))), 'no commission share logic');
  });
  await t('redirects are followed by hand and non-standard ports refused (source grep + runtime)', async () => {
    const m = stripComments(read(path.join(SRC, 'services', 'monitor.js')));
    assert(!/redirect:\s*'follow'/.test(m), 'automatic redirect following');
    let threw = false; try { await monitorMod.assertPublicUrl('http://example.com:10000/'); } catch (e) { threw = e.message === 'port_not_allowed'; } assert(threw, 'port 10000 allowed');
  });
  await t('fetch gate: robots.txt honored, private addresses refused', () => {
    eq(monitorMod.robotsAllows('User-agent: *\nDisallow: /promos', '/promos/fall'), false);
    eq(monitorMod.robotsAllows('User-agent: *\nUser-agent: Googlebot\nDisallow: /promo', '/promo'), false, 'grouped user-agents share rules');
    eq(monitorMod.robotsAllows('User-agent: *\nDisallow: /\n\nUser-agent: BuyersLineMonitor\nAllow: /', '/x'), true, 'a group naming us wins');
    eq(monitorMod.robotsAllows('User-agent: *\nDisallow: /promos\nAllow: /promos/public', '/promos/public/x'), true);
    eq(monitorMod.isPrivateIp('10.1.2.3'), true); eq(monitorMod.isPrivateIp('::ffff:127.0.0.1'), true); eq(monitorMod.isPrivateIp('100.64.1.1'), true); eq(monitorMod.isPrivateIp('192.168.0.1'), true); eq(monitorMod.isPrivateIp('8.8.8.8'), false);
  });

  console.log('\nG. Structural promises (source greps)');
  const srcFiles = walk(SRC).filter((f) => f.endsWith('.js'));
  await t('no mail, SMS or WhatsApp transport exists anywhere in the vertical', () => {
    for (const f of srcFiles) {
      const s = stripComments(read(f));
      assert(!/@sendgrid|nodemailer|require\(['"]twilio['"]\)|sgMail|whatsapp|\.messages\.create\(\{[^}]*to:/i.test(s), 'transport found in ' + path.basename(f));
    }
  });
  await t('only llm.js reaches a model', () => {
    const users = srcFiles.filter((f) => /@anthropic-ai\/sdk/.test(read(f)));
    eq(users.map((f) => path.basename(f)).join(','), 'llm.js');
  });
  await t('the report builder reads buyer incentives only through the buyer-safe view', () => {
    const s = stripComments(read(path.join(SRC, 'services', 'report.js')));
    assert(s.includes('nca_v_incentives_buyer_safe'), 'view not used');
    const direct = s.match(/nca_incentive_versions[\s\S]{0,300}?(WHERE|$)[\s\S]{0,300}/g) || [];
    for (const d of direct) assert(/audience = 'broker'|report_incentives|isBuyerSafe|incentive_version_id/.test(d), 'direct version read without a buyer-safe guard');
  });
  await t('no route reads a tenant from the request', () => {
    for (const f of srcFiles) assert(!/req\.(body|query|params)\.tenant_id|req\.(body|query)\.tid\b/.test(read(f)), 'tenant from request in ' + path.basename(f));
  });
  await t('the fetch gate carries no evasion tooling', () => {
    const s = stripComments(read(path.join(SRC, 'services', 'monitor.js')));
    assert(!/proxy-agent|HttpsProxyAgent|puppeteer-extra|stealth|2captcha|anticaptcha|rotating/i.test(s), 'evasion tooling present');
  });
  await t('every table carries tenant_id NOT NULL', () => {
    const mig = read(path.join(ROOT, 'migrations', '20260913_incentiva_tables.sql'));
    const tables = mig.split(/CREATE TABLE IF NOT EXISTS /).slice(1);
    assert(tables.length >= 20, 'expected 20+ tables, got ' + tables.length);
    for (const tb of tables) assert(/tenant_id INTEGER NOT NULL/.test(tb.split(');')[0]), 'missing tenant_id in ' + tb.split(' ')[0]);
  });
  await t('English and Spanish label sets are identical', () => {
    const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k])).sort();
    eq(JSON.stringify(keys(i18n.L.en)), JSON.stringify(keys(i18n.L.es)));
  });
  await t('public pages hardcode no mount prefix and carry no emoji', () => {
    for (const f of walk(path.join(ROOT, 'public'))) {
      if (!/\.(html|js|css)$/.test(f)) continue;
      const s = read(f);
      assert(!/["'`(]\/(incentiva|buyersline)\b/.test(s), 'hardcoded mount prefix in ' + path.basename(f));
      if (/\.html$/.test(f)) assert(!/Incentiva/.test(s), 'old product name in ' + path.basename(f));
      assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s), 'emoji in ' + path.basename(f));
    }
  });
  await t('dark is the default theme on every page, light is an explicit saved choice with a toggle', () => {
    for (const f of ['index.html', 'report.html', 'login.html', 'admin.html']) {
      const html = read(path.join(ROOT, 'public', f));
      assert(/<html[^>]*data-theme="dark"/.test(html), f + ' does not ship dark');
      const head = html.slice(0, html.indexOf('</head>'));
      assert(/t==='light'\?'light':'dark'/.test(head), f + ' head script does not default to dark');
      assert(head.indexOf('incentiva_theme') < Math.max(head.indexOf('site.css'), head.indexOf('<style>')), f + ' theme applied after styles (flash)');
      assert(/data-theme-toggle/.test(html), f + ' has no toggle');
    }
  });
  await t('the voice orb persona exists and forbids stating incentives or payments', () => {
    const { AGENTS } = require('../../src/config/voice-agents');
    assert(AGENTS.buyersline, 'persona missing');
    assert(/Never state or estimate a builder incentive/.test(AGENTS.buyersline.persona.en), 'persona rule missing');
    assert(/data-agent="buyersline"/.test(read(path.join(ROOT, 'public', 'index.html'))), 'orb not wired to the buyersline persona');
  });

  // ── Database sections ────────────────────────────────────────────────────
  const db = require('./src/db');
  if (!db.configured) {
    skipped.push('ALL DATABASE SECTIONS (no DATABASE_URL): intake, reports, verification, isolation, billing were NOT exercised');
  } else {
    const TABLES = ['nca_audit_log', 'nca_geocode_cache', 'nca_compliance_reviews', 'nca_activity', 'nca_conversion_events', 'nca_appointments', 'nca_report_incentives', 'nca_reports',
      'nca_consents', 'nca_buyer_criteria', 'nca_buyers', 'nca_incentive_versions', 'nca_incentives', 'nca_snapshots', 'nca_sources', 'nca_homes', 'nca_community_fees',
      'nca_communities', 'nca_builders', 'nca_users', 'nca_brokerages', 'nca_markets'];
    const cleanup = async () => { for (const tb of TABLES) await db.exec(`DELETE FROM ${tb} WHERE tenant_id IN (:a, :b)`, { a: SIT_TENANT, b: OTHER_TENANT }); };
    try {
      await db.ensureSchema();
      await cleanup();
      const express = require('express');
      const incentiva = require('./src/index');
      const app = express();
      app.use('/buyersline', incentiva);
      const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
      const BASE = `http://127.0.0.1:${server.address().port}/buyersline`;
      await new Promise((r) => setTimeout(r, 1500)); // let boot ensureAccounts settle

      const jar = {};
      async function call(method, p, body, who) {
        const headers = { 'Content-Type': 'application/json' };
        if (who && jar[who]) headers.Cookie = jar[who];
        const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const sc = r.headers.get('set-cookie');
        if (who && sc) jar[who] = sc.split(';')[0];
        let data = null; const txt = await r.text(); try { data = JSON.parse(txt); } catch (e) { data = txt; }
        return { status: r.status, data };
      }

      console.log('\nH. Console gate and accounts');
      await t('console fails shut when the owner password is unset (503, no default)', async () => {
        const saved = process.env.INCENTIVA_OWNER_PASSWORD; delete process.env.INCENTIVA_OWNER_PASSWORD;
        try {
          eq((await call('POST', '/api/v1/auth/login', { email: 'sit-owner@example.test', password: 'x' })).status, 503);
          eq((await call('GET', '/api/v1/agent/today')).status, 503);
        } finally { process.env.INCENTIVA_OWNER_PASSWORD = saved; }
      });
      await t('wrong password is refused', async () => eq((await call('POST', '/api/v1/auth/login', { email: 'sit-owner@example.test', password: 'nope-nope' }, 'x')).status, 401));
      await t('owner signs in as admin WITHOUT verification rights; agent signs in WITH them', async () => {
        const o = await call('POST', '/api/v1/auth/login', { email: 'sit-owner@example.test', password: process.env.INCENTIVA_OWNER_PASSWORD }, 'owner');
        eq(o.status, 200); eq(o.data.user.role, 'admin'); eq(o.data.user.can_verify, false);
        const a = await call('POST', '/api/v1/auth/login', { email: 'sit-agent@example.test', password: process.env.INCENTIVA_AGENT_PASSWORD }, 'agent');
        eq(a.status, 200); eq(a.data.user.can_verify, true);
      });
      await t('only an admin loads demo data', async () => {
        eq((await call('POST', '/api/v1/agent/demo/seed', {}, 'agent')).status, 403);
        const r = await call('POST', '/api/v1/agent/demo/seed', {}, 'owner');
        eq(r.status, 200); eq(r.data.created.communities, 3);
      });
      await t('health reports the console configured and no transports', async () => {
        const r = await call('GET', '/health'); eq(r.data.agent_console, 'configured'); eq(r.data.model_configured, false); assert(/none/.test(r.data.transports));
      });

      console.log('\nI. Intake gates and consent');
      const cfg = await call('GET', '/api/v1/public/config?lang=en');
      await t('config names the agent, the brokerage and the co-ownership in the share consent', () => {
        assert(cfg.data.consent.share.includes('Sit Agent') && cfg.data.consent.share.includes('SIT Brokerage LLC') && /co-owner/.test(cfg.data.consent.share), cfg.data.consent.share);
        eq(cfg.data.is_demo_data, true);
      });
      const intake = (over = {}) => Object.assign({ lang: 'en', first_name: 'Sit', email: 'sit-buyer@example.test', phone: '8135550100',
        criteria: { target_zips: ['33578', '33563'], radius_miles: 15, budget_max: 450000, beds_min: 3, baths_min: 2, timeline: '0_3m', financing: 'needs_lender', must_haves: [] },
        gates: { has_other_agent: 'no', prior_builder_visits: [] }, consents: { email: true, sms: false, share_with_agent: true }, consent_version: cfg.data.consent.version }, over);

      await t('a buyer under agreement with another agent is stopped and no contact data is stored', async () => {
        const r = await call('POST', '/api/v1/public/intake', intake({ gates: { has_other_agent: 'yes_under_agreement' } }));
        eq(r.data.status, 'stopped_other_agent');
        const row = await db.one(`SELECT email, phone, stage FROM nca_buyers WHERE tenant_id = :t AND stage = 'has_other_agent' ORDER BY id DESC LIMIT 1`, { t: SIT_TENANT });
        eq(row.email, null); eq(row.phone, null);
        eq((await db.one(`SELECT COUNT(*)::int AS n FROM nca_reports WHERE tenant_id = :t`, { t: SIT_TENANT })).n, 0);
      });
      await t('honeypot and missing fields are refused', async () => {
        eq((await call('POST', '/api/v1/public/intake', intake({ website: 'http://spam' }))).status, 400);
        const r = await call('POST', '/api/v1/public/intake', intake({ email: '', criteria: { target_zips: [] } }));
        eq(r.status, 400); assert(r.data.missing.includes('email') && r.data.missing.includes('criteria.budget_max'), JSON.stringify(r.data.missing));
      });

      const es = await call('POST', '/api/v1/public/intake', intake({ lang: 'es', consent_text: 'I agree to be called at any hour by anyone' }));
      const tokenEs = es.data.token;
      await t('intake produces a report that waits for agent review by default', async () => {
        eq(es.status, 200); eq(es.data.status, 'pending_review');
        eq((await call('GET', '/api/v1/public/reports/' + tokenEs)).data.status, 'pending_review');
      });
      await t('stored consent wording is the server\'s text, not what the client sent', async () => {
        const rows = await db.q(`SELECT channel, granted, consent_text FROM nca_consents WHERE tenant_id = :t ORDER BY id DESC LIMIT 3`, { t: SIT_TENANT });
        assert(rows.every((r) => !/any hour/.test(r.consent_text)), 'client text stored');
        eq(rows.find((r) => r.channel === 'sms').granted, false);
      });

      const repRow = await db.one('SELECT * FROM nca_reports WHERE token = :tok', { tok: tokenEs });
      await t('the generated report passes compliance on its own templates (EN and ES)', () => eq(repRow.compliance_verdict, 'pass'));
      await t('English and Spanish list the same communities in the same order', () => {
        const sig = (p) => p.items.map((i) => i.rank + ':' + i.community.id + ':' + (i.home ? i.home.id : '-')).join('|');
        eq(sig(repRow.payload.en), sig(repRow.payload.es)); assert(repRow.payload.en.items.length > 0, 'no items');
      });

      console.log('\nJ. Report content invariants');
      await t('agent approves; the report shows only verified incentives', async () => {
        const list = await call('GET', '/api/v1/agent/reports?status=pending_review', null, 'agent');
        assert(list.data.reports.some((r) => r.id === repRow.id), 'agent of record sees the report');
        eq((await call('POST', `/api/v1/agent/reports/${repRow.id}/approve`, {}, 'agent')).status, 200);
      });
      const viewEn = await call('GET', `/api/v1/public/reports/${tokenEs}?lang=en`);
      await t('a detected decrease is hidden: the withdrawn $12,000 offer is not in the report', () => {
        eq(viewEn.data.status, 'ready');
        const preserve = viewEn.data.items.filter((i) => i.community.name === 'Sample Preserve');
        assert(preserve.length, 'Sample Preserve listed');
        const all = JSON.stringify(preserve);
        assert(!/12,000/.test(all), 'withdrawn offer leaked into report');
        assert(preserve[0].incentives.some((i) => /buydown/i.test(i.headline)), 'verified buydown shown');
      });
      await t('payment figures match the engine and the buydown row carries Year 3+', () => {
        const oak = viewEn.data.items.find((i) => i.home && i.home.label.includes('Oakmont'));
        assert(oak, 'Oakmont listed');
        const b = oak.scenarios[0]; eq(b.year3plus, 3370); eq(b.from, true);
        const bd = oak.scenarios.find((s) => /Temporary/.test(s.label)); eq(bd.year1, 2876); eq(bd.year3plus, 3370);
      });
      await t('a community with no verified incentives is withheld, not ranked', () => {
        assert(viewEn.data.withheld.some((w) => w.community === 'Sample Oaks'), 'Sample Oaks withheld');
        assert(!viewEn.data.items.some((i) => i.community.name === 'Sample Oaks'), 'Sample Oaks ranked');
      });
      await t('the public report carries all five disclosures and the co-owner statement', () => {
        for (const k of compliance.REQUIRED_DISCLOSURES) assert(viewEn.data.disclosures[k], k);
        assert(/co-owner/.test(viewEn.data.disclosures.compensation));
      });
      await t('an agent hold pulls a released report back from the buyer, and approve cannot bypass it', async () => {
        eq((await call('POST', `/api/v1/agent/reports/${repRow.id}/hold`, { note: 'Recheck the CDD figure' }, 'agent')).status, 200);
        eq((await call('GET', '/api/v1/public/reports/' + tokenEs)).data.status, 'pending_review');
        eq((await call('POST', `/api/v1/agent/reports/${repRow.id}/approve`, {}, 'agent')).status, 409);
        const holds = (await call('GET', '/api/v1/agent/compliance', null, 'agent')).data.holds.filter((h) => h.subject_id === repRow.id);
        eq(holds.length, 1);
        eq((await call('POST', `/api/v1/agent/compliance/${holds[0].id}/release`, { note: 'CDD confirmed with builder' }, 'agent')).status, 200);
        eq((await call('GET', '/api/v1/public/reports/' + tokenEs)).data.status, 'pending_review', 'release must not publish by itself');
        eq((await call('POST', `/api/v1/agent/reports/${repRow.id}/approve`, {}, 'agent')).status, 200);
        eq((await call('GET', '/api/v1/public/reports/' + tokenEs)).data.status, 'ready');
      });

      console.log('\nK. Verification rights and lifecycle');
      const cards = (await call('GET', '/api/v1/agent/verifications', null, 'agent')).data.cards;
      const dec = cards.find((c) => c.change_kind === 'decrease');
      const neu = cards.find((c) => c.change_kind === 'new');
      await t('the decrease card says it is already hidden', () => { assert(dec, 'decrease card'); eq(dec.hidden_from_buyers, true); });
      await t('an admin without a license cannot confirm an incentive (403)', async () => eq((await call('POST', `/api/v1/agent/verifications/${dec.version_id}/confirm`, { verification_method: 'agent_confirmed_with_builder' }, 'owner')).status, 403));
      await t('confirming requires a method', async () => eq((await call('POST', `/api/v1/agent/verifications/${dec.version_id}/confirm`, {}, 'agent')).status, 400));
      await t('the licensed agent confirms the decrease; a new report shows $8,000', async () => {
        eq((await call('POST', `/api/v1/agent/verifications/${dec.version_id}/confirm`, { verification_method: 'agent_confirmed_with_builder' }, 'agent')).status, 200);
        const again = await call('POST', `/api/v1/agent/verifications/${dec.version_id}/confirm`, { verification_method: 'agent_confirmed_with_builder' }, 'agent');
        eq(again.status, 409);
        process.env.INCENTIVA_REPORT_REVIEW = 'auto';
        const r = await call('POST', '/api/v1/public/intake', intake({ email: 'sit-buyer2@example.test' }));
        delete process.env.INCENTIVA_REPORT_REVIEW;
        eq(r.data.status, 'report_ready');
        const v = await call('GET', `/api/v1/public/reports/${r.data.token}`);
        assert(/8,000/.test(JSON.stringify(v.data.items)), 'confirmed $8,000 shown');
        assert(!/12,000/.test(JSON.stringify(v.data.items)), '$12,000 still shown');
      });
      await t('rejecting a new card keeps it away from buyers', async () => {
        eq((await call('POST', `/api/v1/agent/verifications/${neu.version_id}/reject`, {}, 'agent')).status, 400);
        eq((await call('POST', `/api/v1/agent/verifications/${neu.version_id}/reject`, { reason: 'Offer ended last week' }, 'agent')).status, 200);
        const safe = await db.one(`SELECT COUNT(*)::int AS n FROM nca_v_incentives_buyer_safe WHERE tenant_id = :t AND type = 'price_reduction'`, { t: SIT_TENANT });
        eq(safe.n, 0);
      });
      await t('pasted builder text becomes pending cards and nothing new reaches buyers', async () => {
        const oaks = await db.one(`SELECT id FROM nca_communities WHERE tenant_id = :t AND name = 'Sample Oaks'`, { t: SIT_TENANT });
        const r = await call('POST', '/api/v1/agent/ingest/text', { community_id: oaks.id, kind: 'broker_email', text: SRC_TEXT }, 'agent');
        eq(r.status, 200); assert(r.data.cards_created >= 2, 'cards ' + r.data.cards_created); eq(r.data.extracted_by, 'heuristic');
        eq((await db.one(`SELECT COUNT(*)::int AS n FROM nca_v_incentives_buyer_safe WHERE tenant_id = :t AND community_id = :c`, { t: SIT_TENANT, c: oaks.id })).n, 0);
        const dup = await call('POST', '/api/v1/agent/ingest/text', { community_id: oaks.id, kind: 'broker_email', text: SRC_TEXT }, 'agent');
        eq(dup.data.cards_created, 0, 'the same text twice creates no duplicate cards');
      });
      await t('retyping a card to an agent bonus on confirm moves it out of the buyer view', async () => {
        const oaks = await db.one(`SELECT id FROM nca_communities WHERE tenant_id = :t AND name = 'Sample Oaks'`, { t: SIT_TENANT });
        const cs = (await call('GET', '/api/v1/agent/verifications', null, 'agent')).data.cards.filter((c) => c.community_id === oaks.id && c.after.audience === 'buyer');
        assert(cs.length, 'a buyer card at Oaks');
        eq((await call('POST', `/api/v1/agent/verifications/${cs[0].version_id}/confirm`, { edits: { type: 'broker_bonus' }, verification_method: 'builder_email' }, 'agent')).status, 200);
        eq((await db.one('SELECT audience FROM nca_incentive_versions WHERE id = :v', { v: cs[0].version_id })).audience, 'broker');
        eq((await db.one(`SELECT COUNT(*)::int AS n FROM nca_v_incentives_buyer_safe WHERE tenant_id = :t AND community_id = :c`, { t: SIT_TENANT, c: oaks.id })).n, 0);
      });
      await t('a removal seen on a source hides the offer at once, and an earlier report says so when read', async () => {
        const preserve = await db.one(`SELECT id FROM nca_communities WHERE tenant_id = :t AND name = 'Sample Preserve'`, { t: SIT_TENANT });
        const src = (await db.exec(`INSERT INTO nca_sources (tenant_id, community_id, kind) VALUES (:t, :c, 'promo_page') RETURNING id`, { t: SIT_TENANT, c: preserve.id }))[0];
        const bdv = await db.one(`SELECT v.id FROM nca_v_incentives_buyer_safe v WHERE v.tenant_id = :t AND v.community_id = :c AND v.type = 'rate_buydown_temporary'`, { t: SIT_TENANT, c: preserve.id });
        await db.exec('UPDATE nca_incentive_versions SET source_id = :s WHERE id = :v', { s: src.id, v: bdv.id });
        const out = await monitorMod.processText(SIT_TENANT, { community_id: preserve.id, source_id: src.id, kind: 'promo_page', text: 'Community update: the clubhouse opens in October.', detectRemovals: true, actor: { type: 'system' }, allowModel: false });
        assert(out.hidden >= 1, 'hidden ' + out.hidden);
        const again = await call('GET', `/api/v1/public/reports/${tokenEs}?lang=en`);
        assert(again.data.notice && /no longer shown/.test(again.data.notice), 'notice missing');
        assert(!/buydown/i.test(JSON.stringify(again.data.items.filter((i) => i.community.name === 'Sample Preserve').map((i) => i.incentives))), 'removed buydown still shown');
        assert(!(again.data.comparison || []).some((row) => /Temporary/.test(row.incentive) && row.community === 'Sample Preserve'), 'removed buydown still in the comparison table');
        assert((again.data.comparison || []).every((row) => row.version_id === undefined), 'internal version ids leaked');
      });
      await t('an expired incentive drops out of the view with no human action', async () => {
        const lakes = await db.one(`SELECT v.id FROM nca_v_incentives_buyer_safe v JOIN nca_communities c ON c.id = v.community_id WHERE v.tenant_id = :t AND c.name = 'Sample Lakes' AND v.type = 'below_market_fixed_rate'`, { t: SIT_TENANT });
        await db.exec(`UPDATE nca_incentive_versions SET expires_on = ((now() AT TIME ZONE 'America/New_York')::date - 1) WHERE id = :v`, { v: lakes.id });
        eq((await db.one('SELECT COUNT(*)::int AS n FROM nca_v_incentives_buyer_safe WHERE id = :v', { v: lakes.id })).n, 0);
      });

      console.log('\nL. Isolation');
      const buyer1 = await db.one(`SELECT id, agent_id FROM nca_buyers WHERE tenant_id = :t AND email = 'sit-buyer@example.test'`, { t: SIT_TENANT });
      await t('a model- or client-supplied tenant_id is ignored', async () => {
        const r = await call('POST', '/api/v1/agent/builders', { name: 'SIT Tenant Probe Builder', tenant_id: OTHER_TENANT }, 'agent');
        eq(r.status, 200); eq(r.data.builder.tenant_id, SIT_TENANT);
      });
      await t('another tenant\'s buyer and report are not found (404)', async () => {
        const ob = (await db.exec(`INSERT INTO nca_buyers (tenant_id, market_id, first_name, email) VALUES (:o, 1, 'Other', 'other@example.test') RETURNING id`, { o: OTHER_TENANT }))[0];
        eq((await call('GET', `/api/v1/agent/buyers/${ob.id}`, null, 'owner')).status, 404);
        await db.exec(`INSERT INTO nca_reports (tenant_id, buyer_id, criteria_id, token, report_no, payload, status) VALUES (:o, :b, 1, 'sitothertenanttoken000000001', 'R-X', '{"en":{}}', 'ready')`, { o: OTHER_TENANT, b: ob.id });
        eq((await call('GET', '/api/v1/public/reports/sitothertenanttoken000000001')).status, 404);
      });
      await t('a second agent cannot see or approve the first agent\'s buyers', async () => {
        const auth = require('./src/services/auth');
        await auth.upsertAccount(SIT_TENANT, { email: 'sit-agent2@example.test', name: 'Second', password: 'second-agent-password-1', role: 'agent', license_no: 'SL1111111' });
        eq((await call('POST', '/api/v1/auth/login', { email: 'sit-agent2@example.test', password: 'second-agent-password-1' }, 'agent2')).status, 200);
        eq((await call('GET', `/api/v1/agent/buyers/${buyer1.id}`, null, 'agent2')).status, 404);
        const lst = await call('GET', '/api/v1/agent/buyers', null, 'agent2');
        eq(lst.data.buyers.length, 0);
        eq((await call('POST', `/api/v1/agent/reports/${repRow.id}/approve`, {}, 'agent2')).status, 404);
      });
      await t('without share consent the buyer has no agent of record and the agent never sees them', async () => {
        const r = await call('POST', '/api/v1/public/intake', intake({ email: 'sit-private@example.test', consents: { email: false, sms: false, share_with_agent: false } }));
        const row = await db.one('SELECT b.id, b.agent_id FROM nca_reports r JOIN nca_buyers b ON b.id = r.buyer_id WHERE r.token = :tok', { tok: r.data.token });
        eq(row.agent_id, null);
        eq((await call('GET', `/api/v1/agent/buyers/${row.id}`, null, 'agent')).status, 404);
        const adm = await call('GET', `/api/v1/agent/buyers/${row.id}`, null, 'owner');
        eq(adm.status, 200); eq(adm.data.buyer.contact_shared, false);
      });

      console.log('\nM. Billing per consult held');
      await t('consult request, then held: one billable event at the plan fee; twice is refused', async () => {
        eq((await call('POST', `/api/v1/public/reports/${tokenEs}/consult-request`, { channel: 'call', preferred_times: 'Weekday mornings' })).status, 200);
        const d = await call('GET', `/api/v1/agent/buyers/${buyer1.id}`, null, 'agent');
        const appt = d.data.appointments[0]; assert(appt, 'appointment');
        const h = await call('POST', `/api/v1/agent/appointments/${appt.id}/held`, {}, 'agent');
        eq(h.status, 200); eq(h.data.conversion.billable, true); eq(h.data.conversion.fee_usd, 350);
        eq((await call('POST', `/api/v1/agent/appointments/${appt.id}/held`, {}, 'agent')).status, 409);
        const bill = await call('GET', '/api/v1/agent/billing', null, 'agent');
        eq(bill.data.invoice_preview.total_usd, 350);
      });
      await t('the monthly cap turns further consults non-billable', async () => {
        process.env.INCENTIVA_CONSULT_MONTHLY_CAP = '1';
        try {
          const r = await call('POST', '/api/v1/public/intake', intake({ email: 'sit-buyer3@example.test' }));
          await call('POST', `/api/v1/public/reports/${r.data.token}/consult-request`, { channel: 'video', preferred_times: 'Evenings' });
          const b = await db.one('SELECT b.id FROM nca_reports r JOIN nca_buyers b ON b.id = r.buyer_id WHERE r.token = :tok', { tok: r.data.token });
          const appt = await db.one('SELECT id FROM nca_appointments WHERE buyer_id = :b', { b: b.id });
          const h = await call('POST', `/api/v1/agent/appointments/${appt.id}/held`, {}, 'agent');
          eq(h.data.conversion.billable, false);
        } finally { delete process.env.INCENTIVA_CONSULT_MONTHLY_CAP; }
      });
      await t('the database refuses a transaction-contingent charge', async () => {
        let threw = false;
        try {
          await db.exec(`INSERT INTO nca_conversion_events (tenant_id, buyer_id, agent_id, appointment_id, event, billable, fee_usd) VALUES (:t, 1, 1, 999999999, 'closing', true, 3000)`, { t: SIT_TENANT });
        } catch (e) { threw = true; }
        assert(threw, 'closing event inserted');
      });

      console.log('\nN. Settings and routing');
      await t('a reference rate without its source and date is refused', async () => {
        eq((await call('PUT', '/api/v1/agent/settings/market', { settings: { reference_rate: 6.1, reference_rate_source: null } }, 'agent')).status, 400);
      });
      await t('unowned paths end in an Incentiva 404, never the host app', async () => {
        const a = await call('GET', '/wp-admin'); eq(a.status, 404); assert(/BuyersLine/.test(a.data), 'branded');
        eq((await call('GET', '/api/v1/nope')).status, 404);
      });
      await t('HTML shells are served with the mount substituted', async () => {
        const r = await fetch(BASE + '/'); const html = await r.text();
        assert(!html.includes('{{BASE}}'), 'token leaked'); assert(html.includes('/buyersline/site.css'), 'base substituted');
      });

      server.close();
    } catch (e) {
      fail++; failures.push('database section crashed: ' + e.stack);
      console.log('  FAIL database section crashed\n', e);
    } finally {
      try { await cleanup(); } catch (e) { console.log('  cleanup failed:', e.message); }
      try { await db.sequelize.close(); } catch (e) { /* ignore */ }
    }
  }

  console.log('\n────────────────────────────────────────');
  console.log(`BuyersLine SIT: ${pass}/${pass + fail} passed`);
  console.log('NOT COVERED (keyless run): the Anthropic extraction and narrative paths' + (HAD_KEY ? ' (a key was present and deliberately removed)' : '') + '; live geocoding; live builder page fetches.');
  skipped.forEach((s) => console.log('SKIPPED: ' + s));
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
