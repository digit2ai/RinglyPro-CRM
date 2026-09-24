'use strict';

/**
 * Campaigns: build, approve, activate, target.
 *
 * OUTBOUND CALLING NEVER STARTS BY ITSELF. draft -> pending_approval ->
 * approved -> active, and both approve and activate require a tenant owner
 * or admin (a rep cannot). Activation also requires a GoHighLevel outbound
 * workflow id, because that workflow is what actually dials. Editing an
 * approved or active campaign's products, audience or offer sends it back to
 * draft: an approval covers what was approved, not what it was changed into.
 */

const db = require('../db');
const C = require('../corpus');
const { audit, httpError } = require('../util');
const offers = require('./offers');
const compliance = require('./compliance');
const catalog = require('./catalog');
const pricing = require('./pricing');

const ADMIN_ROLES = new Set(['owner', 'admin']);
const MATERIAL_FIELDS = ['product_ids', 'category_ids', 'geographic_target', 'offer', 'talking_points', 'minimum_match_score'];

async function checkIds(tenantId, table, ids, label) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!list.length) return [];
  const rows = await db.tq(tenantId, `SELECT id FROM ${table} WHERE tenant_id = :tenant AND id IN (:ids)`, { ids: list });
  if (rows.length !== list.length) throw httpError(400, `Unknown ${label} for this company`);
  return list;
}
function cleanGeo(g) {
  const up = (a) => (Array.isArray(a) ? a : String(a || '').split(',')).map((s) => String(s).trim()).filter(Boolean).slice(0, 200);
  return { states: up(g && g.states).map((s) => s.toUpperCase().slice(0, 2)), cities: up(g && g.cities), zips: up(g && g.zips) };
}

async function get(tenantId, id) {
  const c = await db.tone(tenantId, 'SELECT * FROM sup_campaigns WHERE tenant_id = :tenant AND id = :id', { id: Number(id) });
  if (!c) throw httpError(404, 'Campaign not found');
  return c;
}
async function list(tenantId) {
  return db.tq(tenantId, `SELECT c.*, r.name AS rep_name,
      (SELECT count(*) FROM sup_campaign_targets t WHERE t.tenant_id = :tenant AND t.campaign_id = c.id AND t.status = 'queued')::int AS queued,
      (SELECT count(*) FROM sup_calls k WHERE k.tenant_id = :tenant AND k.campaign_id = c.id)::int AS calls,
      (SELECT count(*) FROM sup_buyers b WHERE b.tenant_id = :tenant AND b.campaign_id = c.id)::int AS buyers
    FROM sup_campaigns c LEFT JOIN sup_sales_reps r ON r.id = c.sales_rep_id AND r.tenant_id = c.tenant_id
    WHERE c.tenant_id = :tenant ORDER BY c.updated_at DESC LIMIT 500`);
}

async function create(tenant, input, actor) {
  const name = String(input.campaign_name || '').trim().slice(0, 200);
  if (!name) throw httpError(400, 'Campaign name is required');
  const productIds = await checkIds(tenant.id, 'sup_products', input.product_ids, 'product');
  if (!productIds.length) throw httpError(400, 'Choose at least one product');
  const categoryIds = await checkIds(tenant.id, 'sup_categories', input.category_ids, 'contractor category');
  const repId = input.sales_rep_id ? (await checkIds(tenant.id, 'sup_sales_reps', [input.sales_rep_id], 'sales rep'))[0] : null;
  const cats = categoryIds.length ? await db.tq(tenant.id, 'SELECT name FROM sup_categories WHERE tenant_id = :tenant AND id IN (:ids)', { ids: categoryIds }) : [];
  const offer = await offers.build(tenant, { productIds, categoryNames: cats.map((c) => c.name), objective: input.call_objective });
  const minScore = Math.max(0, Math.min(100, Number(input.minimum_match_score == null ? 60 : input.minimum_match_score)));
  const limit = Math.max(1, Math.min(5000, Number(input.daily_call_limit || 50)));
  const schedule = input.calling_schedule && typeof input.calling_schedule === 'object' ? input.calling_schedule : {};
  const agent = { name: input.agent_name || null, ghl_agent_id: input.ghl_agent_id || null, ghl_workflow_id: input.ghl_workflow_id || (tenant.ghl && tenant.ghl.default_workflow_id) || null };
  const [row] = await db.trun(tenant.id, `INSERT INTO sup_campaigns (tenant_id, campaign_name, product_ids, category_ids, geographic_target, offer, talking_points, call_objective,
      agent, sales_rep_id, calling_schedule, daily_call_limit, minimum_match_score, priority, status, generated_by, rationale, created_by)
    VALUES (:tenant, :n, :p::jsonb, :c::jsonb, :g::jsonb, :o::jsonb, :tp::jsonb, :obj, :ag::jsonb, :rep, :sch::jsonb, :lim, :min, :pri, 'draft', :gen, :why, :actor) RETURNING *`,
  { n: name, p: JSON.stringify(productIds), c: JSON.stringify(categoryIds), g: JSON.stringify(cleanGeo(input.geographic_target)), o: JSON.stringify(offer),
    tp: JSON.stringify(offer.talking_points), obj: offer.call_objective, ag: JSON.stringify(agent), rep: repId, sch: JSON.stringify(schedule), lim: limit, min: minScore,
    pri: input.priority || null, gen: input.generated_by || 'manual', why: input.rationale || null, actor: actor.id });
  await audit(tenant.id, actor.id, 'campaign.created', 'campaign', row.id, { generated_by: row.generated_by });
  return row;
}

async function update(tenant, id, input, actor) {
  const cur = await get(tenant.id, id);
  if (['completed', 'cancelled'].includes(cur.status)) throw httpError(409, 'A ' + cur.status + ' campaign cannot be edited');
  const set = {}; const casts = {};
  if (input.campaign_name) set.campaign_name = String(input.campaign_name).slice(0, 200);
  if (input.product_ids) { set.product_ids = JSON.stringify(await checkIds(tenant.id, 'sup_products', input.product_ids, 'product')); casts.product_ids = 'jsonb'; }
  if (input.category_ids) { set.category_ids = JSON.stringify(await checkIds(tenant.id, 'sup_categories', input.category_ids, 'contractor category')); casts.category_ids = 'jsonb'; }
  if (input.geographic_target) { set.geographic_target = JSON.stringify(cleanGeo(input.geographic_target)); casts.geographic_target = 'jsonb'; }
  if (input.minimum_match_score != null) set.minimum_match_score = Math.max(0, Math.min(100, Number(input.minimum_match_score)));
  if (input.daily_call_limit != null) set.daily_call_limit = Math.max(1, Math.min(5000, Number(input.daily_call_limit)));
  if (input.calling_schedule) { set.calling_schedule = JSON.stringify(input.calling_schedule); casts.calling_schedule = 'jsonb'; }
  if (input.sales_rep_id !== undefined) set.sales_rep_id = input.sales_rep_id ? (await checkIds(tenant.id, 'sup_sales_reps', [input.sales_rep_id], 'sales rep'))[0] : null;
  if (input.ghl_workflow_id !== undefined || input.ghl_agent_id !== undefined || input.agent_name !== undefined) {
    const ag = Object.assign({}, cur.agent);
    if (input.ghl_workflow_id !== undefined) ag.ghl_workflow_id = input.ghl_workflow_id || null;
    if (input.ghl_agent_id !== undefined) ag.ghl_agent_id = input.ghl_agent_id || null;
    if (input.agent_name !== undefined) ag.name = input.agent_name || null;
    set.agent = JSON.stringify(ag); casts.agent = 'jsonb';
  }
  if (input.call_objective) set.call_objective = String(input.call_objective).slice(0, 1000);
  if (set.product_ids || set.category_ids || input.rebuild_offer) {
    const pids = JSON.parse(set.product_ids || JSON.stringify(cur.product_ids));
    const cids = JSON.parse(set.category_ids || JSON.stringify(cur.category_ids));
    const cats = cids.length ? await db.tq(tenant.id, 'SELECT name FROM sup_categories WHERE tenant_id = :tenant AND id IN (:ids)', { ids: cids }) : [];
    const offer = await offers.build(tenant, { productIds: pids, categoryNames: cats.map((c) => c.name), objective: set.call_objective || cur.call_objective });
    set.offer = JSON.stringify(offer); casts.offer = 'jsonb';
    set.talking_points = JSON.stringify(offer.talking_points); casts.talking_points = 'jsonb';
  }
  const material = MATERIAL_FIELDS.some((f) => set[f] !== undefined);
  if (material && ['pending_approval', 'approved', 'active', 'paused'].includes(cur.status)) set.status = 'draft';
  const cols = Object.keys(set);
  if (!cols.length) return cur;
  const [row] = await db.trun(tenant.id, `UPDATE sup_campaigns SET ${cols.map((c) => `${c} = :${c}${casts[c] ? '::' + casts[c] : ''}`).join(', ')}, updated_at = now()
    ${set.status === 'draft' ? ', approved_by = NULL, approved_at = NULL' : ''} WHERE tenant_id = :tenant AND id = :id RETURNING *`, Object.assign({ id: cur.id }, set));
  await audit(tenant.id, actor.id, 'campaign.updated', 'campaign', row.id, { fields: cols, reset_to_draft: set.status === 'draft' && cur.status !== 'draft' });
  return row;
}

async function transition(tenant, id, to, actor) {
  const cur = await get(tenant.id, id);
  if (!C.CAMPAIGN_STATUSES.includes(to)) throw httpError(400, 'Unknown status');
  if (!(C.CAMPAIGN_TRANSITIONS[cur.status] || []).includes(to)) throw httpError(409, `A campaign cannot go from ${cur.status} to ${to}`);
  if (['approved', 'active'].includes(to) && !ADMIN_ROLES.has(actor.role)) throw httpError(403, 'Only a company owner or admin can approve or activate a campaign');
  if (to === 'active') {
    if (!cur.approved_at) throw httpError(409, 'The campaign has not been approved');
    if (!(cur.agent && cur.agent.ghl_workflow_id)) throw httpError(409, 'Add the GoHighLevel outbound workflow id before activating: that workflow places the calls');
    if (!['trial', 'active'].includes(tenant.status)) throw httpError(409, 'This company account is ' + tenant.status);
  }
  const extra = to === 'approved' ? ', approved_by = :actor, approved_at = now()' : '';
  const [row] = await db.trun(tenant.id, `UPDATE sup_campaigns SET status = :to, updated_at = now() ${extra} WHERE tenant_id = :tenant AND id = :id AND status = :from RETURNING *`,
    { to, from: cur.status, id: cur.id, actor: actor.id });
  if (!row) throw httpError(409, 'The campaign changed while you were looking at it. Reload.');
  let audience = null;
  if (to === 'active') audience = await buildAudience(tenant, row);
  if (['completed', 'cancelled'].includes(to)) {
    await db.trun(tenant.id, `UPDATE sup_campaign_targets SET status = 'skipped', skip_reason = :r, updated_at = now() WHERE tenant_id = :tenant AND campaign_id = :c AND status = 'queued'`, { c: row.id, r: 'campaign ' + to });
  }
  await audit(tenant.id, actor.id, 'campaign.' + to, 'campaign', row.id, { from: cur.status, audience });
  return { campaign: row, audience };
}

/** Score = best relevance of any campaign product to the contractor's category. */
async function candidates(tenant, campaign) {
  const pids = (campaign.product_ids || []).map(Number);
  const cids = (campaign.category_ids || []).map(Number);
  if (!pids.length) return [];
  const rows = await db.tq(tenant.id, `SELECT c.*, COALESCE(MAX(r.relevance_score), 0)::int AS score
    FROM sup_contractors c LEFT JOIN sup_product_relevance r ON r.tenant_id = c.tenant_id AND r.category_id = c.category_id AND r.product_id IN (:pids)
    WHERE c.tenant_id = :tenant ${cids.length ? 'AND c.category_id IN (:cids)' : ''}
    GROUP BY c.id ORDER BY score DESC, c.id`, { pids, cids: cids.length ? cids : [0] });
  const g = campaign.geographic_target || {};
  const inGeo = (c) => {
    const hasGeo = (g.states && g.states.length) || (g.cities && g.cities.length) || (g.zips && g.zips.length);
    if (!hasGeo) return true;
    return (g.states || []).includes(String(c.state || '').toUpperCase())
      || (g.cities || []).some((x) => x.toLowerCase() === String(c.city || '').toLowerCase())
      || (g.zips || []).some((z) => String(c.zip || '').startsWith(z));
  };
  return rows.map((c) => Object.assign(c, { in_geo: inGeo(c) }));
}

async function buildAudience(tenant, campaign) {
  const rows = await candidates(tenant, campaign);
  const summary = { queued: 0, skipped: 0, below_threshold: 0, outside_geography: 0, reasons: {} };
  for (const c of rows) {
    if (!c.in_geo) { summary.outside_geography++; continue; }
    if (c.score < campaign.minimum_match_score) { summary.below_threshold++; continue; }
    const e = await compliance.eligible(tenant, c);
    const status = e.ok ? 'queued' : 'skipped';
    const ins = await db.trun(tenant.id, `INSERT INTO sup_campaign_targets (tenant_id, campaign_id, contractor_id, score, status, skip_reason)
      VALUES (:tenant, :cid, :k, :s, :st, :r) ON CONFLICT (campaign_id, contractor_id) DO NOTHING RETURNING id`,
    { cid: campaign.id, k: c.id, s: c.score, st: status, r: e.ok ? null : e.reason });
    if (!ins.length) continue;
    if (e.ok) {
      summary.queued++;
      await db.trun(tenant.id, `UPDATE sup_contractors SET stage = 'outbound_scheduled', product_match_score = GREATEST(COALESCE(product_match_score,0), :s), updated_at = now()
        WHERE tenant_id = :tenant AND id = :id AND stage = 'target_contractor'`, { id: c.id, s: c.score });
    } else { summary.skipped++; summary.reasons[e.reason] = (summary.reasons[e.reason] || 0) + 1; }
  }
  return summary;
}

async function preview(tenant, id) {
  const campaign = await get(tenant.id, id);
  const rows = await candidates(tenant, campaign);
  const out = [];
  for (const c of rows.slice(0, 300)) {
    const e = c.in_geo && c.score >= campaign.minimum_match_score ? await compliance.eligible(tenant, c) : { ok: false, reason: !c.in_geo ? 'outside geography' : 'below match threshold' };
    out.push({ contractor_id: c.id, company_name: c.company_name, city: c.city, state: c.state, score: c.score, included: e.ok, reason: e.ok ? null : e.reason });
  }
  return { campaign_id: campaign.id, minimum_match_score: campaign.minimum_match_score, contractors: out };
}

/**
 * CREATE CAMPAIGN FROM INVENTORY. Ranks sellable products by verified price
 * advantage, margin and inventory on hand, picks the categories that buy the
 * lead product, counts who could be called, and writes a DRAFT with its
 * reasoning. It never approves or activates anything.
 */
async function generate(tenant, actor, { max = 3 } = {}) {
  const products = await db.tq(tenant.id, `SELECT * FROM sup_products WHERE tenant_id = :tenant AND active AND COALESCE(quantity_available,0) > 0`);
  const ranked = [];
  for (const p of products) {
    const o = catalog.offerPrice(p);
    if (o.price == null) continue;
    const claim = await pricing.bestClaim(tenant.id, p, tenant.settings);
    const margin = p.cost != null && o.price > 0 ? ((o.price - Number(p.cost)) / o.price) * 100 : null;
    const stockValue = Number(p.quantity_available) * o.price;
    const score = (claim ? Math.min(50, claim.savings_pct) * 1.5 : 0) + (margin != null ? Math.max(0, margin) * 0.5 : 0) + Math.min(30, Math.log10(stockValue + 1) * 5);
    ranked.push({ p, o, claim, margin, stockValue, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  const made = [];
  for (const r of ranked.slice(0, Math.max(1, Math.min(5, max)))) {
    const rel = await db.tq(tenant.id, `SELECT r.category_id, r.relevance_score, c.name FROM sup_product_relevance r JOIN sup_categories c ON c.id = r.category_id AND c.tenant_id = r.tenant_id
      WHERE r.tenant_id = :tenant AND r.product_id = :p AND r.relevance_score >= 70 ORDER BY r.relevance_score DESC LIMIT 4`, { p: r.p.id });
    if (!rel.length) continue; // no analysed buyer category yet: run Product Intelligence first
    const market = (tenant.settings && tenant.settings.market) || {};
    const why = [
      `${r.p.name}: ${Number(r.p.quantity_available).toLocaleString('en-US')} ${r.p.unit || 'units'} on hand at $${r.o.price}.`,
      r.claim ? `Verified ${Math.round(r.claim.savings_pct)}% below ${r.claim.competitor} (checked ${String(r.claim.date_checked).slice(0, 10)}).` : 'No verified competitor price, so the offer makes no price comparison.',
      r.margin != null ? `Margin at the offer price: ${r.margin.toFixed(1)}%.` : 'No cost on file, so margin is unknown.',
      `Likely buyers: ${rel.map((x) => `${x.name} (${x.relevance_score})`).join(', ')}.`
    ].join(' ');
    const c = await create(tenant, {
      campaign_name: `${r.p.name} — ${rel[0].name}`, product_ids: [r.p.id], category_ids: rel.map((x) => x.category_id),
      geographic_target: market, minimum_match_score: 70, daily_call_limit: 50, priority: r.claim ? 'high' : 'normal',
      generated_by: 'rules', rationale: why, sales_rep_id: (await defaultRep(tenant.id)) || null
    }, actor);
    const prev = await preview(tenant, c.id);
    made.push({ campaign: c, reachable_contractors: prev.contractors.filter((x) => x.included).length });
  }
  return { proposals: made, considered: ranked.length, note: made.length ? 'Drafts only. An owner or admin must approve and activate.' : 'No product had stock, a price and an analysed buyer category. Run Product Intelligence on the catalog first.' };
}

async function defaultRep(tenantId) {
  const r = await db.tone(tenantId, 'SELECT id FROM sup_sales_reps WHERE tenant_id = :tenant AND active ORDER BY is_default DESC, id LIMIT 1');
  return r ? r.id : null;
}

module.exports = { create, update, get, list, transition, buildAudience, preview, generate, defaultRep, candidates };
