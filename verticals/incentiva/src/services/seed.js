'use strict';

/**
 * Demo data. FICTIONAL builders and communities ("Sample ..."), flagged
 * is_demo, so a sample row can never be quoted back as a real builder's offer.
 * Real Tampa Bay city names and ZIP codes are used only so matching works.
 * Only an admin can load it, and reset removes every demo row it created.
 */

const db = require('../db');
const { getMarket } = require('./market');
const { computeFreshUntil } = require('../engines/freshness');
const { pgIntArray } = require('./monitor');
const { audit } = require('./util');

const BUILDERS = [
  { name: 'Sample Builder North', co: { percent: 2.5, requires_first_visit_registration: true, registration_valid_days: 60 } },
  { name: 'Sample Homes Co.', co: { percent: 3, requires_first_visit_registration: true, registration_valid_days: 90 } }
];

const COMMUNITIES = [
  { b: 0, name: 'Sample Preserve', city: 'Riverview', county: 'Hillsborough', zip: '33578', lat: 27.8667, lng: -82.3265, from: 389990,
    fees: [['hoa', 95, 'month'], ['cdd_om', null, 'year']],
    homes: [['Lot 114 · Oakmont', 'Oakmont', 4, 2.5, 2210, 2, 419990, 'ready', ['office']], ['Lot 131 · Birch', 'Birch', 3, 2, 1780, 1, 394990, '2026-11', []]],
    incentives: [
      { type: 'closing_cost_assistance', value_kind: 'usd', value_usd: 12000, value_cap_usd: 12000, use_restriction: 'closing_costs_only', requires_affiliated_lender: true, close_by: '2026-12-31',
        headline: 'Up to $12,000 toward closing costs when you finance with our affiliated lender and close by December 31, 2026.', choice_group: 'finance_choice' },
      { type: 'rate_buydown_temporary', value_kind: 'buydown_schedule', buydown_schedule: [2, 1], requires_affiliated_lender: true,
        headline: '2-1 temporary rate buydown on select move-in-ready homes with our affiliated lender.', choice_group: 'finance_choice' }
    ],
    pending: { type: 'closing_cost_assistance', value_kind: 'usd', value_usd: 8000, value_cap_usd: 8000, change_kind: 'decrease',
      headline: 'Up to $8,000 toward closing costs when you finance with our affiliated lender.', q: ['The amount dropped from $12,000. Confirm the new amount with the sales counselor?'] }
  },
  { b: 1, name: 'Sample Lakes', city: 'Wesley Chapel', county: 'Pasco', zip: '33545', lat: 28.2395, lng: -82.3279, from: 429990,
    fees: [['hoa', 120, 'month'], ['cdd_om', 1400, 'year'], ['cdd_debt', 1100, 'year']],
    homes: [['Lot 22 · Palmetto', 'Palmetto', 4, 3, 2480, 1, 449990, '2026-10', ['three_car_garage', 'office']]],
    incentives: [
      { type: 'below_market_fixed_rate', value_kind: 'rate_absolute', rate: 4.99, requires_affiliated_lender: true, expires_on: '2026-11-30',
        headline: '4.99% fixed rate on a 30-year conventional loan with our preferred lender, valid through November 30, 2026.' },
      { type: 'design_center_credit', value_kind: 'usd', value_usd: 10000, requires_affiliated_lender: false,
        headline: '$10,000 design center credit on new contracts.' }
    ],
    pending: { type: 'price_reduction', value_kind: 'usd', value_usd: 15000, change_kind: 'new',
      headline: 'Prices reduced by $15,000 on quick move-in homes this month.', q: ['Which homes qualify?', 'When does this offer end?'] }
  },
  { b: 1, name: 'Sample Oaks', city: 'Plant City', county: 'Hillsborough', zip: '33563', lat: 28.0186, lng: -82.1193, from: 339990,
    fees: [], homes: [['Lot 7 · Cypress', 'Cypress', 3, 2, 1620, 1, 344990, 'ready', []]], incentives: [], pending: null }
];

async function reset(tenantId) {
  await db.exec(`DELETE FROM nca_incentive_versions WHERE tenant_id = :t AND incentive_id IN (SELECT id FROM nca_incentives WHERE tenant_id = :t AND is_demo)`, { t: tenantId });
  await db.exec(`DELETE FROM nca_incentives WHERE tenant_id = :t AND is_demo`, { t: tenantId });
  const ids = (await db.q(`SELECT id FROM nca_communities WHERE tenant_id = :t AND is_demo`, { t: tenantId })).map((r) => r.id);
  if (ids.length) {
    for (const tbl of ['nca_community_fees', 'nca_homes', 'nca_sources', 'nca_snapshots']) {
      await db.exec(`DELETE FROM ${tbl} WHERE tenant_id = :t AND community_id IN (:ids)`, { t: tenantId, ids });
    }
  }
  await db.exec(`DELETE FROM nca_communities WHERE tenant_id = :t AND is_demo`, { t: tenantId });
  await db.exec(`DELETE FROM nca_builders WHERE tenant_id = :t AND is_demo`, { t: tenantId });
  const market = await getMarket(tenantId);
  if (market.settings.reference_rate_is_demo) {
    const s = Object.assign({}, market.settings, { reference_rate: null, reference_rate_source: null, reference_rate_as_of: null, tax_rate_default: null,
      tax_rate_by_county: {}, insurance_monthly: null, pmi_rate_annual: null, closing_cost_pct: null, reference_rate_is_demo: false });
    await db.exec('UPDATE nca_markets SET settings = :s WHERE id = :id', { s: JSON.stringify(s), id: market.id });
  }
}

async function seedDemo(tenantId, { resetFirst = false, actor = { type: 'system' }, verifierId = null, now = new Date() } = {}) {
  if (resetFirst) await reset(tenantId);
  const market = await getMarket(tenantId);
  const existing = await db.one(`SELECT COUNT(*)::int AS n FROM nca_builders WHERE tenant_id = :t AND is_demo`, { t: tenantId });
  if (existing.n > 0) return { created: { builders: 0, communities: 0, incentives: 0 }, already_seeded: true };

  if (market.settings.reference_rate == null) {
    const s = Object.assign({}, market.settings, {
      reference_rate: 6.25, reference_rate_source: 'Sample reference rate for demonstration', reference_rate_as_of: now.toISOString().slice(0, 10),
      tax_rate_default: 0.015, tax_rate_by_county: { Hillsborough: 0.015, Pasco: 0.016 }, insurance_monthly: 160, pmi_rate_annual: 0.004, closing_cost_pct: 3,
      reference_rate_is_demo: true
    });
    await db.exec('UPDATE nca_markets SET settings = :s WHERE id = :id', { s: JSON.stringify(s), id: market.id });
  }

  const builderIds = [];
  for (const b of BUILDERS) {
    const r = await db.exec(`INSERT INTO nca_builders (tenant_id, name, co_broke_policy, automated_access, is_demo) VALUES (:t, :n, :c, 'unknown', true)
      ON CONFLICT (tenant_id, name) DO UPDATE SET is_demo = true RETURNING id`, { t: tenantId, n: b.name, c: JSON.stringify(b.co) });
    builderIds.push(r[0].id);
  }
  let communities = 0, incentives = 0;
  for (const c of COMMUNITIES) {
    const r = await db.exec(`INSERT INTO nca_communities (tenant_id, market_id, builder_id, name, status, city, county, zip, lat, lng, price_from, co_broke_display, is_demo, url)
      VALUES (:t, :m, :b, :n, 'selling', :city, :county, :zip, :lat, :lng, :from, :co, true, NULL) RETURNING id`, {
      t: tenantId, m: market.id, b: builderIds[c.b], n: c.name, city: c.city, county: c.county, zip: c.zip, lat: c.lat, lng: c.lng, from: c.from,
      co: BUILDERS[c.b].co.percent + '%'
    });
    const cid = r[0].id; communities++;
    for (const [type, amt, period] of c.fees) {
      await db.exec(`INSERT INTO nca_community_fees (tenant_id, community_id, fee_type, amount_usd, period) VALUES (:t, :c, :ty, :a, :p)`, { t: tenantId, c: cid, ty: type, a: amt, p: period });
    }
    for (const [label, plan, beds, baths, sqft, stories, price, ready, features] of c.homes) {
      await db.exec(`INSERT INTO nca_homes (tenant_id, community_id, label, plan_name, beds, baths, sqft, stories, features, list_price, est_completion)
        VALUES (:t, :c, :l, :p, :beds, :baths, :sqft, :st, CAST(:f AS text[]), :price, :ready)`,
      { t: tenantId, c: cid, l: label, p: plan, beds, baths, sqft, st: stories, f: '{' + features.join(',') + '}', price, ready });
    }
    for (const inc of c.incentives) {
      const ir = await db.exec(`INSERT INTO nca_incentives (tenant_id, market_id, community_id, audience, type, is_demo) VALUES (:t, :m, :c, 'buyer', :ty, true) RETURNING id`,
        { t: tenantId, m: market.id, c: cid, ty: inc.type });
      const fresh = computeFreshUntil(now, inc.expires_on || null, market.settings);
      const vr = await db.exec(`INSERT INTO nca_incentive_versions (tenant_id, incentive_id, version_no, type, audience, value_kind, value_usd, value_cap_usd, rate, buydown_schedule,
          use_restriction, requires_affiliated_lender, close_by, expires_on, choice_group, headline, conditions_text, change_kind, verification_status, verification_method,
          verified_by, last_verified_at, fresh_until, extracted_by)
        VALUES (:t, :i, 1, :type, 'buyer', :vk, :usd, :cap, :rate, CAST(:bd AS int[]), :use, :lender, :close, :exp, :cg, :h, :h, 'new', 'verified', 'agent_confirmed_with_builder',
          :vb, :now, :fresh, 'demo') RETURNING id`, {
        t: tenantId, i: ir[0].id, type: inc.type, vk: inc.value_kind, usd: inc.value_usd ?? null, cap: inc.value_cap_usd ?? null, rate: inc.rate ?? null,
        bd: pgIntArray(inc.buydown_schedule), use: inc.use_restriction || null, lender: inc.requires_affiliated_lender ?? null, close: inc.close_by || null,
        exp: inc.expires_on || null, cg: inc.choice_group || null, h: inc.headline, vb: verifierId, now: now.toISOString(), fresh: fresh.toISOString()
      });
      await db.exec('UPDATE nca_incentives SET current_version_id = :v WHERE id = :i', { v: vr[0].id, i: ir[0].id });
      incentives++;
      if (c.pending && c.pending.change_kind === 'decrease' && c.pending.type === inc.type) {
        await db.exec(`UPDATE nca_incentive_versions SET verification_status = 'withdrawn' WHERE id = :v`, { v: vr[0].id });
        await db.exec(`INSERT INTO nca_incentive_versions (tenant_id, incentive_id, version_no, type, audience, value_kind, value_usd, value_cap_usd, requires_affiliated_lender,
            headline, conditions_text, change_kind, verification_status, extraction_confidence, extracted_by, verifier_questions)
          VALUES (:t, :i, 2, :type, 'buyer', :vk, :usd, :cap, true, :h, :h, 'decrease', 'pending_verification', 0.8, 'demo', :q)`,
        { t: tenantId, i: ir[0].id, type: c.pending.type, vk: c.pending.value_kind, usd: c.pending.value_usd, cap: c.pending.value_cap_usd, h: c.pending.headline, q: JSON.stringify(c.pending.q) });
      }
    }
    if (c.pending && c.pending.change_kind === 'new') {
      const ir = await db.exec(`INSERT INTO nca_incentives (tenant_id, market_id, community_id, audience, type, is_demo) VALUES (:t, :m, :c, 'buyer', :ty, true) RETURNING id`,
        { t: tenantId, m: market.id, c: cid, ty: c.pending.type });
      await db.exec(`INSERT INTO nca_incentive_versions (tenant_id, incentive_id, version_no, type, audience, value_kind, value_usd, headline, conditions_text, change_kind,
          verification_status, extraction_confidence, extracted_by, verifier_questions)
        VALUES (:t, :i, 1, :type, 'buyer', :vk, :usd, :h, :h, 'new', 'pending_verification', 0.6, 'demo', :q)`,
      { t: tenantId, i: ir[0].id, type: c.pending.type, vk: c.pending.value_kind, usd: c.pending.value_usd, h: c.pending.headline, q: JSON.stringify(c.pending.q) });
    }
  }
  await audit(tenantId, actor, 'demo.seed', 'market', market.id, { communities, incentives });
  return { created: { builders: BUILDERS.length, communities, incentives }, already_seeded: false };
}

module.exports = { seedDemo, reset };
