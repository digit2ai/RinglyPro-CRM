'use strict';

/**
 * The buyer report pipeline.
 *
 *   match (property + criteria only) -> buyer-safe incentives (THE VIEW) ->
 *   payment scenarios -> fit -> rank -> narrative (EN and ES) -> compliance ->
 *   status -> persist with pinned incentive versions
 *
 * Ranking happens BEFORE any language is chosen, so a Spanish and an English
 * report for the same criteria list the same communities in the same order.
 */

const db = require('../db');
const { t, money, dateLabel } = require('../engines/i18n');
const { scenarios } = require('../engines/payment');
const { scoreFit, renderFitLine, locationStatus } = require('../engines/fit');
const { narrate } = require('../engines/advisor');
const { reviewReport } = require('../engines/compliance');
const { isBuyerSafe } = require('../engines/freshness');
const { getMarket, effectiveSettings } = require('./market');
const { geocode } = require('./geocode');
const { token, audit, activity } = require('./util');

const MAX_ITEMS = 8;

function valueDisplay(lang, v) {
  const es = lang === 'es';
  if (v.value_kind === 'usd' || v.value_usd != null) {
    const amt = money(lang, v.value_cap_usd != null ? v.value_cap_usd : v.value_usd);
    return v.value_cap_usd != null ? (es ? 'Hasta ' : 'Up to ') + amt : amt;
  }
  if (v.value_percent != null) return v.value_percent + (es ? ' % del precio' : '% of price');
  if (v.rate != null) return v.rate + (es ? ' % de tasa' : '% rate');
  if (Array.isArray(v.buydown_schedule) && v.buydown_schedule.length) return v.buydown_schedule.join('-');
  return null;
}

async function loadAgent(tenantId, agentId, market) {
  if (!agentId) return null;
  const u = await db.one(`SELECT u.id, u.name, u.title, u.license_no, b.name AS brokerage_name, b.license_no AS brokerage_license_no
    FROM nca_users u LEFT JOIN nca_brokerages b ON b.id = u.brokerage_id AND b.tenant_id = u.tenant_id
    WHERE u.id = :id AND u.tenant_id = :t AND u.active = true AND u.role = 'agent'`, { id: agentId, t: tenantId });
  if (!u) return null;
  return { id: u.id, name: u.name, title: u.title, license_no: u.license_no, brokerage_name: u.brokerage_name, brokerage_license_no: u.brokerage_license_no,
    co_owner: (market.settings.co_owner_user_ids || []).includes(u.id) };
}

function disclosures(lang, agent) {
  const d = {};
  for (const k of ['platform', 'compensation', 'estimates', 'incentives', 'equal_housing']) d[k] = t(lang, 'disclosures.' + k);
  if (agent && agent.co_owner) d.compensation += ' ' + t(lang, 'consent.co_owner', { agent: agent.name });
  return d;
}

/** Gather and score everything. Language-free. */
async function assemble(tenantId, market, criteria, { allowGeocode = true, now = new Date() } = {}) {
  const settings = market.settings;
  let center = null;
  if (allowGeocode) {
    if (criteria.place_text) center = await geocode(tenantId, criteria.place_text);
    else if ((criteria.target_zips || []).length) center = await geocode(tenantId, criteria.target_zips[0]);
  }

  const communities = await db.q(`SELECT c.*, b.name AS builder, b.co_broke_policy
    FROM nca_communities c JOIN nca_builders b ON b.id = c.builder_id AND b.tenant_id = c.tenant_id
    WHERE c.tenant_id = :t AND c.market_id = :m AND c.status IN ('selling','coming_soon')`, { t: tenantId, m: market.id });

  const inArea = communities.filter((c) => ['zip_match', 'within_radius'].includes(locationStatus(c, criteria, center).status));
  if (!inArea.length) return { items: [], withheld: [], center, versionsById: {}, isDemo: false };
  const ids = inArea.map((c) => c.id);

  const [homes, fees, safe, broker] = await Promise.all([
    db.q(`SELECT * FROM nca_homes WHERE tenant_id = :t AND community_id IN (:ids) AND status = 'available'`, { t: tenantId, ids }),
    db.q(`SELECT * FROM nca_community_fees WHERE tenant_id = :t AND community_id IN (:ids)`, { t: tenantId, ids }),
    db.q(`SELECT * FROM nca_v_incentives_buyer_safe WHERE tenant_id = :t AND community_id IN (:ids)`, { t: tenantId, ids }),
    db.q(`SELECT v.*, i.community_id FROM nca_incentives i JOIN nca_incentive_versions v ON v.id = i.current_version_id
          WHERE i.tenant_id = :t AND i.community_id IN (:ids) AND v.audience = 'broker' AND v.verification_status = 'verified' AND v.fresh_until > now()`, { t: tenantId, ids })
  ]);

  // Belt and braces: the view is the rule, isBuyerSafe re-states it.
  const safeRows = safe.filter((v) => isBuyerSafe(v, now));
  const versionsById = {};
  safeRows.forEach((v) => { versionsById[v.id] = v; });

  const budget = Number(criteria.budget_max);
  const candidates = [], withheld = [];
  for (const c of inArea) {
    const cFees = fees.filter((f) => f.community_id === c.id);
    const cInc = safeRows.filter((v) => v.community_id === c.id);
    const cHomes = homes.filter((h) => h.community_id === c.id && h.list_price != null && Number(h.list_price) <= budget)
      .sort((a, b) => Number(a.list_price) - Number(b.list_price)).slice(0, 2);
    const priced = cHomes.length || (c.price_from != null && Number(c.price_from) <= budget);
    if (!priced) continue;
    if (!cInc.length) { withheld.push(c); continue; }
    const units = cHomes.length ? cHomes : [null];
    for (const h of units) {
      const incs = cInc.filter((v) => !v.applies_to_home_ids || !v.applies_to_home_ids.length || (h && v.applies_to_home_ids.includes(h.id)));
      const price = h ? Number(h.list_price) : Number(c.price_from);
      const sc = scenarios({ price, financing: criteria.financing, down_payment: criteria.down_payment, county: c.county, settings, fees: cFees, incentives: incs });
      const base = sc.base;
      const fit = scoreFit({ community: c, home: h, fees: cFees, monthly_estimate: base && base.modeled ? base.year3plus : null }, criteria, { center, now });
      candidates.push({ key: c.id + ':' + (h ? h.id : 'c'), community: c, home: h, fees: cFees, incentives: incs, sc, fit_raw: fit,
        broker: broker.filter((b) => b.community_id === c.id), price });
    }
  }
  candidates.sort((a, b) => b.fit_raw.score - a.fit_raw.score || a.price - b.price || a.key.localeCompare(b.key));
  // One card per community: its best-fitting home. Two homes in one community are not two options.
  const seen = new Set();
  const perCommunity = candidates.filter((it) => (seen.has(it.community.id) ? false : (seen.add(it.community.id), true)));
  const items = perCommunity.slice(0, MAX_ITEMS).map((it, i) => Object.assign(it, { rank: i + 1 }));
  const isDemo = items.some((i) => i.community.is_demo) || withheld.some((w) => w.is_demo);
  return { items, withheld, center, versionsById, isDemo };
}

function sameText(a, b) { const n = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); return n(a) === n(b); }

function feeObj(fees, types) {
  const rows = fees.filter((f) => types.includes(f.fee_type));
  if (!rows.length || rows.some((r) => r.amount_usd === null)) return null;
  const monthly = rows.reduce((a, r) => a + (r.period === 'year' ? Number(r.amount_usd) / 12 : r.period === 'one_time' ? 0 : Number(r.amount_usd)), 0);
  return { amount: Math.round(monthly), period: 'month' };
}

/** Render one language. */
async function renderLanguage(lang, ctx) {
  const { items, withheld, market, criteria, buyer, agent, allowModel, reportNo, now } = ctx;
  const s = market.settings;
  const dflt = (k) => ((s.defaulted || []).includes(k) ? ' ' + t(lang, 'basis.default_note') : '');

  const view = items.map((it) => {
    const c = it.community;
    const incentive_rows = it.incentives.map((v) => ({
      id: v.incentive_id, version_id: v.id, type: v.type, type_label: t(lang, 'incentive_type.' + v.type) || v.type,
      headline: v.headline, value_display: valueDisplay(lang, v),
      conditions_text: v.conditions_text && sameText(v.conditions_text, v.headline) ? null : v.conditions_text,
      requires_affiliated_lender: v.requires_affiliated_lender, contract_by: v.contract_by ? String(v.contract_by).slice(0, 10) : null,
      close_by: v.close_by ? String(v.close_by).slice(0, 10) : null, expires_on: v.expires_on ? String(v.expires_on).slice(0, 10) : null,
      last_verified_at: v.last_verified_at, choice_group: v.choice_group
    }));
    const byVersion = {};
    it.incentives.forEach((v) => { byVersion['inc_' + v.id] = v; });
    const scenario_rows = [Object.assign({}, it.sc.base, { label: t(lang, 'scenario.base'), type: null })]
      .concat(it.sc.options.map((o) => {
        const v = byVersion[o.key];
        const vd = valueDisplay(lang, v);
        return Object.assign({}, o, { type: v.type, label: (t(lang, 'incentive_type.' + v.type) || v.type) + (vd ? ' · ' + vd : '') });
      }))
      .map((r) => Object.assign(r, { reason: r.reason ? t(lang, 'unmodeled.' + r.reason) : null }));
    return {
      key: it.key, rank: it.rank,
      community: { id: c.id, name: c.name, builder: c.builder, city: c.city, county: c.county, zip: c.zip, url: c.url },
      home: it.home ? { id: it.home.id, label: it.home.label, beds: it.home.beds != null ? Number(it.home.beds) : null, baths: it.home.baths != null ? Number(it.home.baths) : null,
        sqft: it.home.sqft, price: Number(it.home.list_price), ready: it.home.est_completion } : null,
      fit_raw: it.fit_raw,
      fit: { score: it.fit_raw.score, reasons: it.fit_raw.reasons.map((r) => renderFitLine(lang, r)), gaps: it.fit_raw.gaps.map((r) => renderFitLine(lang, r)) },
      incentives: incentive_rows, incentive_rows,
      broker_compensation: {
        co_broke_display: c.co_broke_display || (c.co_broke_policy && c.co_broke_policy.percent != null ? c.co_broke_policy.percent + '%' : null),
        broker_bonus_display: it.broker.length ? it.broker.map((b) => b.headline).join(' / ') : null
      },
      fees: { hoa: feeObj(it.fees, ['hoa']), cdd: feeObj(it.fees, ['cdd_om', 'cdd_debt']) },
      fees_known: it.sc.fees_known,
      scenarios: scenario_rows, scenario_rows
    };
  });

  const narr = await narrate(lang, view, { allowModel, agentName: agent ? agent.name : null });
  const itemsOut = view.map((v) => {
    const out = Object.assign({}, v, { take: narr.takes[v.key] || null });
    delete out.fit_raw; delete out.incentive_rows; delete out.scenario_rows; delete out.key;
    return out;
  });

  const comparison = [];
  view.forEach((v) => v.incentives.forEach((inc) => {
    const sc = v.scenarios.find((r) => r.incentive_id === inc.version_id);
    comparison.push({ version_id: inc.version_id, community: v.community.name, incentive: inc.type_label, value_display: inc.value_display,
      lender_required_label: t(lang, 'lender_required.' + String(inc.requires_affiliated_lender)),
      year3plus: sc && sc.modeled ? sc.year3plus : null, last_verified_at: inc.last_verified_at });
  }));

  const a = items[0] ? items[0].sc.assumptions : null;
  const na = t(lang, 'not_set');
  const assumptions = [
    { key: 'rate', label: t(lang, 'assumptions.rate'), value_display: s.reference_rate != null ? s.reference_rate + '%' : na,
      basis: s.reference_rate != null ? t(lang, 'basis.rate', { source: s.reference_rate_is_feed ? require('./rates').source(lang) : s.reference_rate_source, date: dateLabel(lang, s.reference_rate_as_of) }) : '' },
    { key: 'down', label: t(lang, 'assumptions.down'), value_display: a && a.down_payment_pct != null ? a.down_payment_pct + '%' : (criteria.financing === 'cash' ? '100%' : na), basis: t(lang, 'basis.down') },
    { key: 'tax', label: t(lang, 'assumptions.tax'), value_display: s.tax_rate_default != null || Object.keys(s.tax_rate_by_county || {}).length ? (lang === 'es' ? 'Por condado' : 'By county') : na, basis: t(lang, 'basis.tax') + dflt('tax_rate_default') },
    { key: 'insurance', label: t(lang, 'assumptions.insurance'), value_display: s.insurance_monthly != null ? money(lang, s.insurance_monthly) + (lang === 'es' ? '/mes' : '/mo') : na, basis: t(lang, 'basis.insurance') + dflt('insurance_monthly') },
    { key: 'pmi', label: t(lang, 'assumptions.pmi'), value_display: s.pmi_rate_annual != null ? (Math.round(s.pmi_rate_annual * 10000) / 100) + '%' : na, basis: t(lang, 'basis.pmi') + dflt('pmi_rate_annual') },
    { key: 'closing', label: t(lang, 'assumptions.closing'), value_display: s.closing_cost_pct != null ? s.closing_cost_pct + '%' : na, basis: t(lang, 'basis.closing') + dflt('closing_cost_pct') },
    { key: 'stacking', label: t(lang, 'assumptions.stacking'), value_display: '-', basis: t(lang, 'basis.stacking') }
  ];

  const zips = (criteria.target_zips || []).join(', ');
  const area = [zips ? t(lang, 'area_summary_zips', { zips }) : null, criteria.place_text ? t(lang, 'area_summary_place', { place: criteria.place_text }) : null]
    .filter(Boolean).join(' · ') + (criteria.radius_miles ? ' · ' + t(lang, 'area_radius', { miles: criteria.radius_miles }) : '');

  return {
    language: lang, report_no: reportNo, generated_at: now.toISOString(), generated_by: narr.generated_by,
    buyer_first_name: buyer.first_name,
    criteria_summary: { area, budget_max: Number(criteria.budget_max), beds_min: criteria.beds_min, baths_min: criteria.baths_min,
      timeline_label: t(lang, 'timeline.' + criteria.timeline), financing_label: t(lang, 'financing.' + criteria.financing),
      must_haves: (criteria.must_haves || []).map((k) => t(lang, 'must_haves.' + k)).filter(Boolean) },
    agent: agent ? { name: agent.name, title: agent.title, license_no: agent.license_no, brokerage_name: agent.brokerage_name, brokerage_license_no: agent.brokerage_license_no } : null,
    narrative: narr.narrative,
    items: itemsOut,
    withheld: withheld.map((w) => ({ community: w.name, builder: w.builder, city: w.city, reason_label: t(lang, 'withheld_reason') })),
    comparison, assumptions, disclosures: disclosures(lang, agent)
  };
}

/**
 * Build, review and persist a report.
 * @returns {Promise<{report, verdict, findings}>}
 */
async function buildReport(tenantId, { buyer, criteria, criteriaId, lang, allowModel = true, allowGeocode = true, now = new Date() }) {
  const stored = await getMarket(tenantId);
  const market = Object.assign({}, stored, { settings: await effectiveSettings(stored.settings) });
  const agent = await loadAgent(tenantId, buyer.agent_id, market);
  const assembled = await assemble(tenantId, market, criteria, { allowGeocode, now });
  const reportNo = 'R-' + now.toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(buyer.id).padStart(5, '0');
  const ctx = { items: assembled.items, withheld: assembled.withheld, market, criteria, buyer, agent, reportNo, now };

  const primary = lang === 'es' ? 'es' : 'en';
  const other = primary === 'es' ? 'en' : 'es';
  const payload = {};
  payload[primary] = await renderLanguage(primary, Object.assign({}, ctx, { allowModel }));
  payload[other] = await renderLanguage(other, Object.assign({}, ctx, { allowModel: false }));
  payload.is_demo_data = assembled.isDemo;

  const reviews = [reviewReport(payload.en, { versionsById: assembled.versionsById, now }), reviewReport(payload.es, { versionsById: assembled.versionsById, now })];
  const findings = reviews[0].findings.concat(reviews[1].findings.map((f) => Object.assign({ language: 'es' }, f)));
  const verdict = reviews.some((r) => r.verdict === 'block') ? 'block' : reviews.some((r) => r.verdict === 'hold') ? 'hold' : 'pass';

  const autoRelease = process.env.INCENTIVA_REPORT_REVIEW === 'auto';
  const status = verdict === 'block' ? 'compliance_hold' : (verdict === 'pass' && autoRelease ? 'ready' : 'pending_review');
  const tok = token(24);

  const rows = await db.exec(`INSERT INTO nca_reports (tenant_id, buyer_id, agent_id, criteria_id, language, status, token, report_no, payload, generated_by, compliance_verdict)
    VALUES (:t, :b, :a, :c, :l, :s, :tok, :no, :p, :g, :v) RETURNING id`, {
    t: tenantId, b: buyer.id, a: buyer.agent_id || null, c: criteriaId, l: primary, s: status, tok, no: reportNo,
    p: JSON.stringify(payload), g: payload[primary].generated_by, v: verdict
  });
  const reportId = rows[0].id;
  const pinned = Object.keys(assembled.versionsById).map(Number).filter((vid) => assembled.items.some((it) => it.incentives.some((v) => v.id === vid)));
  for (const vid of pinned) {
    await db.exec('INSERT INTO nca_report_incentives (tenant_id, report_id, incentive_version_id) VALUES (:t, :r, :v)', { t: tenantId, r: reportId, v: vid });
  }
  if (verdict !== 'pass') {
    await db.exec(`INSERT INTO nca_compliance_reviews (tenant_id, subject_type, subject_id, verdict, findings) VALUES (:t, 'report', :r, :v, :f)`,
      { t: tenantId, r: reportId, v: verdict, f: JSON.stringify(findings) });
  }
  await activity(tenantId, buyer.id, { type: 'system' }, 'report_generated', { report_id: reportId, status, verdict, items: assembled.items.length });
  await audit(tenantId, { type: 'system' }, 'report.generate', 'report', reportId, { verdict, status });
  return { report: { id: reportId, token: tok, status, report_no: reportNo }, verdict, findings, payload };
}

/** Read-time recheck: drop anything no longer buyer-safe, and say so. */
async function publicView(tenantId, report, lang, now = new Date()) {
  const l = lang === 'es' || lang === 'en' ? lang : report.language;
  const p = JSON.parse(JSON.stringify(report.payload[l] || report.payload[report.language]));
  const pins = await db.q(`SELECT v.* FROM nca_report_incentives ri JOIN nca_incentive_versions v ON v.id = ri.incentive_version_id AND v.tenant_id = ri.tenant_id
    JOIN nca_incentives i ON i.id = v.incentive_id AND i.current_version_id = v.id
    WHERE ri.tenant_id = :t AND ri.report_id = :r`, { t: tenantId, r: report.id });
  const stillSafe = new Set(pins.filter((v) => isBuyerSafe(v, now)).map((v) => v.id));
  let removed = 0;
  for (const it of p.items) {
    const before = it.incentives.length;
    it.incentives = it.incentives.filter((inc) => stillSafe.has(inc.version_id));
    removed += before - it.incentives.length;
    const keep = new Set(it.incentives.map((i) => i.version_id));
    it.scenarios = it.scenarios.filter((sc) => sc.incentive_id === null || keep.has(sc.incentive_id));
    it.incentives.forEach((inc) => { delete inc.version_id; });
    it.scenarios.forEach((sc) => { delete sc.incentive_id; delete sc.type; });
  }
  // Keyed by version id: a withdrawn offer cannot survive because a sibling shares its community and type.
  p.comparison = (p.comparison || []).filter((row) => stillSafe.has(row.version_id));
  p.comparison.forEach((row) => { delete row.version_id; });
  p.status = 'ready';
  p.is_demo_data = !!report.payload.is_demo_data;
  p.notice = removed ? (l === 'es'
    ? `${removed} incentivo(s) de este informe cambiaron o terminaron después de prepararlo y ya no se muestran. Su agente le avisará.`
    : `${removed} incentive(s) in this report changed or ended after it was prepared and are no longer shown. Your agent will follow up.`) : null;
  return p;
}

module.exports = { buildReport, publicView, assemble, valueDisplay, loadAgent, disclosures };
