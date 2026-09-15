'use strict';

/**
 * The buyer's report, built from a search (the five intake answers) before any contact details are asked
 * (owner review 2026-09-15). One JSON payload the page renders and the email summarizes.
 *
 * Invariants (SIT asserts each):
 *  - Every figure is computed here, deterministically: purchasing power uses the buying-power engine's
 *    payment math and the 50% total-debt ceiling; fit scores are arithmetic on price, monthly payment and
 *    location only (incentives never add to fit); price per square foot and lowest price come from listings.
 *  - Promotions come only from research.publicRun, so only rows the compliance agent passed reach the report.
 *  - The five named builders always appear. A builder with nothing found says so; when research could not
 *    run, it says the promotions could not be checked today instead of implying there are none.
 *  - A search holds no name, email or phone. Contact details exist only on the lead created afterwards.
 */

const db = require('../db');
const { token, clampStr, numOrNull } = require('./util');
const { getMarket, effectiveSettings } = require('./market');
const { priceForPayment } = require('../engines/buyingPower');
const { scenarios } = require('../engines/payment');
const research = require('./research');
const rentcast = require('./rentcast');
const area = require('./area');

const TIMELINE = ['0_3m', '3_6m', '6_12m', '12m_plus'];
const FINANCING = ['preapproved', 'cash', 'needs_lender', 'va', 'fha', 'unsure'];
const DTI_CAP = 0.5;
const HOME_RADIUS = 10;

function compact(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function r1000(x) { return Math.floor(x / 1000) * 1000; }
function median(arr) { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

/** Validate the five answers. Only the area is required. */
function validateSearch(body) {
  const b = body && typeof body === 'object' ? body : {};
  const a = b.area && typeof b.area === 'object' ? b.area : { input: b.area };
  const errors = [];
  const input = clampStr(a.zip || a.input, 120);
  if (!input) return { missing: ['area'], errors };
  const maxPrice = numOrNull(b.max_price);
  const maxMonthly = numOrNull(b.max_monthly);
  const down = numOrNull(b.down_payment);
  if (maxPrice !== null && !(maxPrice >= 50000 && maxPrice <= 20000000)) errors.push('max_price');
  if (maxMonthly !== null && !(maxMonthly >= 300 && maxMonthly <= 50000)) errors.push('max_monthly');
  if (down !== null && !(down >= 0 && down <= 10000000)) errors.push('down_payment');
  if (errors.length) return { missing: [], errors };
  return { value: {
    lang: b.lang === 'es' ? 'es' : 'en', input,
    max_price: maxPrice, max_monthly: maxMonthly, down_payment: down,
    move_timeline: TIMELINE.includes(b.move_timeline) ? b.move_timeline : null,
    financing_type: FINANCING.includes(b.financing_type) ? b.financing_type : null
  } };
}

/** Resolve the area on the server, start (or reuse) its research, store the search. Never waits for the crawl. */
async function createSearch(tenantId, v, { ipHash, allowFresh = true } = {}) {
  const resolved = await area.resolveArea(tenantId, v.input);
  if (!resolved.ok) return { error: 'area', reason: resolved.reason };
  const safeArea = { zip: resolved.zip || null, city: resolved.city || null, county: resolved.county || null, state: 'FL',
    label: resolved.resolved ? resolved.label : (resolved.zip || String(resolved.input || '').replace(/[^A-Za-z .'-]/g, '').slice(0, 60)) };
  safeArea.input = safeArea.label;
  let run = null;
  try {
    const out = await research.startOrGet(tenantId, safeArea, { allowFresh });
    run = out.run;
  } catch (e) { console.error('[incentiva] search research start', e.message); }
  const tok = token(24);
  const rows = await db.exec(`INSERT INTO nca_searches (tenant_id, token, lang, area_input, zip, city, county, state, max_price, max_monthly, down_payment, move_timeline, financing_type, research_run_id, ip_hash)
    VALUES (:t, :tok, :lang, :ai, :zip, :city, :county, 'FL', :mp, :mm, :dp, :tl, :fin, :run, :ih) RETURNING id, token`, {
    t: tenantId, tok, lang: v.lang, ai: safeArea.label, zip: safeArea.zip, city: safeArea.city, county: safeArea.county,
    mp: v.max_price, mm: v.max_monthly, dp: v.down_payment, tl: v.move_timeline, fin: v.financing_type, run: run ? run.id : null, ih: ipHash || null
  });
  return { id: rows[0].id, token: rows[0].token, area: safeArea, research_token: run ? run.token : null, limited: !run };
}

/** Purchasing power from what the buyer said, with the 50% total-debt ceiling spelled out. */
function purchasingPower(s, settings) {
  const cash = s.financing_type === 'cash';
  const maxPrice = s.max_price != null ? Number(s.max_price) : null;
  const maxMonthly = s.max_monthly != null ? Number(s.max_monthly) : null;
  const down = s.down_payment != null ? Number(s.down_payment) : null;
  const rate = settings.reference_rate != null ? Number(settings.reference_rate) : null;
  const out = { basis: 'none', dti_cap_pct: DTI_CAP * 100, cash, rate, rate_as_of: settings.reference_rate_as_of || null, rate_is_feed: !!settings.reference_rate_is_feed,
    down_payment: down, price_supported: null, monthly_for_price: null, income_needed_annual: null, from: false, defaulted: settings.defaulted || [] };
  const args = { rate, taxRate: Number(settings.tax_rate_default), insurance: Number(settings.insurance_monthly), pmiRate: Number(settings.pmi_rate_annual) };
  if (maxMonthly && !cash && rate !== null) {
    out.basis = 'monthly';
    let p = null;
    if (down != null) p = priceForPayment(maxMonthly, Object.assign({ down }, args));
    else {
      // No down payment given: use the market's default percentage, solved by fixed-point iteration.
      const pct = s.financing_type === 'va' ? 0 : s.financing_type === 'fha' ? 3.5 : Number(settings.down_payment_pct_default != null ? settings.down_payment_pct_default : 5);
      p = priceForPayment(maxMonthly, Object.assign({ down: 0 }, args));
      for (let i = 0; p && i < 6; i++) p = priceForPayment(maxMonthly, Object.assign({ down: p * pct / 100 }, args));
      out.assumed_down_pct = pct;
    }
    out.price_supported = p && p >= 50000 ? r1000(p) : null;
    out.monthly = maxMonthly;
    out.income_needed_annual = Math.ceil((maxMonthly / DTI_CAP) * 12 / 1000) * 1000;
  } else if (maxPrice) {
    out.basis = 'price';
    const sc = scenarios({ price: maxPrice, financing: s.financing_type, down_payment: down, county: s.county, settings, fees: [], incentives: [] });
    if (sc.base && sc.base.modeled) {
      out.monthly_for_price = sc.base.year1;
      out.from = true; // HOA and CDD vary by community and are not included
      out.income_needed_annual = cash ? null : Math.ceil((sc.base.year1 / DTI_CAP) * 12 / 1000) * 1000;
      out.down_used = sc.assumptions.down_payment_usd;
    }
  }
  return out;
}

/** Fit: price 50, monthly payment 30, location 20. Unknowns earn part credit and are named. Incentives never count. */
function fitScore({ price, monthly, scope }, budget, maxMonthly) {
  let score = 0, max = 0;
  const reasons = [], gaps = [];
  if (budget) {
    max += 50;
    if (price == null) { score += 20; gaps.push('price_unknown'); }
    else if (price <= budget) { score += 50; reasons.push('within_price'); }
    else if (price <= budget * 1.1) { score += 25; gaps.push('slightly_over_price'); }
    else gaps.push('over_price');
  }
  if (maxMonthly) {
    max += 30;
    if (monthly == null) { score += 12; gaps.push('monthly_unknown'); }
    else if (monthly <= maxMonthly) { score += 30; reasons.push('within_monthly'); }
    else if (monthly <= maxMonthly * 1.1) { score += 15; gaps.push('slightly_over_monthly'); }
    else gaps.push('over_monthly');
  }
  max += 20;
  if (scope === 'zip' || scope === 'in_area') { score += 20; reasons.push('in_area'); }
  else if (scope === 'metro') { score += 10; gaps.push('metro_wide'); }
  else { score += 14; }
  return { score: Math.round((score / max) * 100), reasons, gaps };
}

function builderTable(run) {
  const rows = (run && run.rows) || [];
  const checked = run && run.status === 'done' && !(run.notice && !run.stale && !rows.length && /unavailable|failed|not_configured|cap_reached/.test(run.notice));
  const groups = new Map();
  const order = [];
  for (const r of rows) {
    const k = compact(r.builder);
    const named = k.length >= 4 ? research.REPORT_BUILDERS.find((b) => k.startsWith(compact(b)) || compact(b).startsWith(k)) : null;
    const key = named ? compact(named) : k;
    if (!groups.has(key)) { groups.set(key, { builder: named || r.builder, rows: [] }); order.push(key); }
    groups.get(key).rows.push(r);
  }
  const out = [];
  const pushGroup = (key, name) => {
    const g = groups.get(key);
    if (!g) {
      out.push({ builder: name, status: run && run.status === 'running' ? 'checking' : checked ? 'none_found' : 'not_checked', communities: [] });
      return;
    }
    const withOffer = g.rows.filter((r) => r.promotion || r.rate || r.closing_credit || r.other_incentives);
    const lead = withOffer.find((r) => r.origin === 'agent_verified') || withOffer.find((r) => r.verified) || withOffer[0] || g.rows[0];
    const prices = g.rows.map((r) => r.starting_price_usd).filter((x) => x != null);
    out.push({
      builder: g.builder, status: withOffer.length ? 'found' : 'no_promotion',
      communities: g.rows.map((r) => r.community).filter(Boolean).slice(0, 8),
      lowest_starting_price: prices.length ? Math.min(...prices) : null,
      promotion: lead.promotion, rate: lead.rate, closing_credit: lead.closing_credit, other_incentives: lead.other_incentives,
      expiration: lead.expiration, restrictions: lead.restrictions, badge: lead.origin === 'agent_verified' ? 'agent' : lead.verified ? 'source' : 'unverified',
      notes: lead.compliance_notes || [], community: lead.community
    });
  };
  research.REPORT_BUILDERS.forEach((b) => pushGroup(compact(b), b));
  order.filter((k) => !research.REPORT_BUILDERS.some((b) => compact(b) === k)).forEach((k) => pushGroup(k, groups.get(k).builder));
  return out;
}

async function loadSearch(tenantId, tok) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(tok || ''))) return null;
  return db.one('SELECT * FROM nca_searches WHERE tenant_id = :t AND token = :tok', { t: tenantId, tok });
}

async function buildReport(tenantId, s, { lang, allowGeocode = true } = {}) {
  const l = lang === 'es' || lang === 'en' ? lang : s.lang;
  const market = await getMarket(tenantId);
  const settings = await effectiveSettings(market.settings);
  const pp = purchasingPower(s, settings);
  const budget = s.max_price != null ? Number(s.max_price) : pp.price_supported;
  const maxMonthly = s.max_monthly != null ? Number(s.max_monthly) : null;
  const criteria = { max_price: s.max_price, max_monthly: maxMonthly, down_payment: s.down_payment, financing: s.financing_type, lang: l };

  const runRow = s.research_run_id ? await db.one('SELECT token FROM nca_research_runs WHERE id = :id AND tenant_id = :t', { id: s.research_run_id, t: tenantId }) : null;
  const run = runRow ? await research.publicRun(tenantId, runRow.token, criteria, settings) : null;

  const communities = ((run && run.rows) || []).map((r) => Object.assign({}, r, {
    fit: fitScore({ price: r.starting_price_usd, monthly: r.est_monthly_from, scope: r.scope }, budget, maxMonthly)
  })).sort((a, b) => b.fit.score - a.fit.score);

  let best = null;
  if (run && run.status === 'done') {
    const byId = new Map(communities.map((c) => [c.id, c]));
    const top = (run.top_deals || []).map((t) => ({ row: byId.get(t.row_id), reason: t.reason })).find((t) => t.row);
    if (top) best = { row: top.row, reason: top.reason, basis: 'research_ranking' };
    else {
      const offers = communities.filter((c) => (c.promotion || c.rate || c.closing_credit) && c.est_monthly_from != null).sort((a, b) => a.est_monthly_from - b.est_monthly_from);
      if (offers.length) best = { row: offers[0], reason: null, basis: 'lowest_estimated_payment' };
    }
  }

  // Homes and market figures from listings (RentCast). Contact details were already dropped by the service.
  let market_stats = { status: 'no_zip' }, homes = [];
  if (s.zip) {
    const found = await rentcast.search(tenantId, { zip: s.zip, radius: HOME_RADIUS, sort: 'price_asc' }, { allowGeocode }).catch(() => ({ status: 'error', listings: [] }));
    const all = found.listings || [];
    const ppsf = all.filter((h) => h.price && h.sqft).map((h) => h.price / h.sqft);
    const inBudget = budget ? all.filter((h) => h.price != null && h.price <= budget) : all;
    market_stats = {
      status: found.status || 'error', count: all.length, matching: inBudget.length, radius_miles: HOME_RADIUS,
      lowest_price: all.length ? Math.min(...all.filter((h) => h.price).map((h) => h.price)) : null,
      lowest_price_in_budget: inBudget.filter((h) => h.price).length ? Math.min(...inBudget.filter((h) => h.price).map((h) => h.price)) : null,
      median_price_per_sqft: ppsf.length ? Math.round(median(ppsf)) : null,
      lowest_price_per_sqft: ppsf.length ? Math.round(Math.min(...ppsf)) : null,
      fetched_at: found.fetched_at || null, stale: !!found.stale
    };
    homes = inBudget.slice(0, 200).map((h) => {
      let monthly = null;
      if (h.price) {
        const sc = scenarios({ price: h.price, financing: s.financing_type, down_payment: s.down_payment, county: s.county, settings, fees: [], incentives: [] });
        monthly = sc.base && sc.base.modeled ? Math.round(sc.base.year1 + (h.hoa_monthly || 0)) : null;
      }
      const scope = h.zip && s.zip && h.zip === s.zip ? 'in_area' : 'nearby';
      return {
        id: h.id, address: h.address, city: h.city, zip: h.zip, price: h.price, beds: h.beds, baths: h.baths, sqft: h.sqft,
        price_per_sqft: h.price && h.sqft ? Math.round(h.price / h.sqft) : null, hoa_monthly: h.hoa_monthly, est_monthly: monthly,
        builder: h.builder ? h.builder.name : null, community: h.builder ? h.builder.community : null, days_on_market: h.days_on_market,
        fit: fitScore({ price: h.price, monthly, scope }, budget, maxMonthly)
      };
    }).sort((a, b) => b.fit.score - a.fit.score || (a.price || 0) - (b.price || 0)).slice(0, 60);
  }
  const lowestCommunity = communities.filter((c) => c.starting_price_usd != null).sort((a, b) => a.starting_price_usd - b.starting_price_usd)[0] || null;

  // The report link is meant to be forwarded (to the buyer's own agent), so it carries no name or contact detail.
  const lead = s.lead_id ? await db.one('SELECT referral_consent FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: s.lead_id, t: tenantId }) : null;
  return {
    token: s.token, lang: l, created_at: s.created_at,
    area: { label: s.area_input, zip: s.zip, city: s.city, county: s.county },
    wish: { area: s.area_input, max_price: s.max_price != null ? Number(s.max_price) : null, max_monthly: maxMonthly,
      down_payment: s.down_payment != null ? Number(s.down_payment) : null, move_timeline: s.move_timeline, financing_type: s.financing_type },
    purchasing_power: pp,
    research: run ? { status: run.status, notice: run.notice, stale: !!run.stale, checked_on: run.checked_on, progress: run.progress || {}, filtered_out: run.filtered_out || 0, held: run.held || 0 } : { status: 'not_started', notice: 'research_unavailable' },
    builders: builderTable(run),
    communities,
    best_deal: best,
    lowest_community: lowestCommunity ? { builder: lowestCommunity.builder, community: lowestCommunity.community, starting_price: lowestCommunity.starting_price, starting_price_usd: lowestCommunity.starting_price_usd } : null,
    market: market_stats,
    homes,
    schools: (run && run.schools) || [],
    inventory: (run && run.inventory) || [],
    lead: lead ? { created: true, referral: !!lead.referral_consent } : null
  };
}

module.exports = { validateSearch, createSearch, buildReport, loadSearch, purchasingPower, fitScore, builderTable, DTI_CAP };
