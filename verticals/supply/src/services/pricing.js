'use strict';

/**
 * Competitive Price Intelligence.
 *
 * WHERE THE NUMBERS COME FROM: a person (or an import file) records what a
 * competitor charged, where, and when it was checked. Nothing here scrapes
 * Home Depot or Lowe's: neither offers a public price API and both forbid
 * automated collection in their terms. A future licensed price feed plugs in
 * as another source of the same row.
 *
 * TWO PRODUCTS ARE NOT EQUIVALENT BECAUSE THEIR NAMES LOOK ALIKE.
 * matchConfidence() scores the evidence: same UPC 1.00; same brand + model
 * 0.95; same SKU as the manufacturer part 0.90; brand + material/dimension
 * agreement plus name overlap up to 0.80; name overlap alone never above 0.50.
 * A unit mismatch (per sq ft vs per carton) caps it at 0.30, because the
 * prices are not comparable at all.
 *
 * A price may support a claim to a contractor ONLY when claimable():
 * verified (confidence >= the tenant floor, default 0.80, or a person
 * confirmed it), fresh (checked within price_fresh_days, default 30), same
 * unit, and the competitor price is actually higher. Otherwise the offer
 * engine says nothing about competitors.
 */

const db = require('../db');
const { num, audit, httpError } = require('../util');
const catalog = require('./catalog');

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const toks = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
function jaccard(a, b) { const A = toks(a); const B = toks(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); }
const unitKey = (u) => { const k = norm(u).replace(/^(per|a)/, ''); return { sqft: 'sqft', squarefoot: 'sqft', squarefeet: 'sqft', sf: 'sqft', ft2: 'sqft', each: 'ea', ea: 'ea', unit: 'ea', box: 'box', carton: 'box', case: 'box', lf: 'lf', linearfoot: 'lf', linearft: 'lf' }[k] || k; };

function matchConfidence(product, comp) {
  const basis = [];
  let c = 0;
  if (norm(comp.competitor_upc) && norm(comp.competitor_upc) === norm(product.upc)) { c = 1; basis.push('same UPC'); }
  if (norm(comp.competitor_brand) && norm(comp.competitor_brand) === norm(product.brand) && norm(comp.competitor_model) && norm(comp.competitor_model) === norm(product.model)) { c = Math.max(c, 0.95); basis.push('same brand and model'); }
  if (norm(comp.competitor_sku) && (norm(comp.competitor_sku) === norm(product.model) || norm(comp.competitor_sku) === norm(product.sku)) && norm(comp.competitor_brand) === norm(product.brand)) { c = Math.max(c, 0.9); basis.push('same manufacturer part'); }
  if (c < 0.9) {
    const name = jaccard(comp.competitor_product, [product.name, product.brand, product.material, product.dimensions].join(' '));
    let attr = 0;
    if (norm(comp.competitor_brand) && norm(comp.competitor_brand) === norm(product.brand)) { attr += 0.35; basis.push('same brand'); }
    if (product.material && String(comp.competitor_product || '').toLowerCase().includes(String(product.material).toLowerCase())) { attr += 0.1; basis.push('material agrees'); }
    if (product.dimensions && norm(comp.competitor_product).includes(norm(product.dimensions))) { attr += 0.1; basis.push('dimensions agree'); }
    const nameScore = Math.min(0.5, name * 0.9);
    if (name > 0) basis.push(`name overlap ${Math.round(name * 100)}%`);
    c = Math.max(c, Math.min(attr > 0 ? 0.8 : 0.5, nameScore + attr));
  }
  if (comp.competitor_unit && product.unit && unitKey(comp.competitor_unit) !== unitKey(product.unit)) { c = Math.min(c, 0.3); basis.push('UNIT MISMATCH: not comparable'); }
  return { confidence: Number(c.toFixed(3)), basis };
}

function claimable(row, product, settings = {}) {
  const floor = Number(settings.min_verified_confidence || 0.8);
  const freshDays = Number(settings.price_fresh_days || 30);
  const reasons = [];
  if (!row.verified) reasons.push('not verified');
  if (Number(row.match_confidence) < floor && !row.verified_by) reasons.push('match confidence below ' + floor);
  const age = (Date.now() - new Date(row.date_checked).getTime()) / 864e5;
  if (!(age <= freshDays)) reasons.push(`checked ${Math.floor(age)} days ago (limit ${freshDays})`);
  if (row.competitor_unit && product.unit && unitKey(row.competitor_unit) !== unitKey(product.unit)) reasons.push('different unit');
  const offer = catalog.offerPrice(product);
  if (offer.price == null) reasons.push(offer.reason);
  else if (!(Number(row.competitor_price) > offer.price)) reasons.push('competitor is not more expensive');
  return { ok: reasons.length === 0, reasons };
}

async function competitorId(tenantId, nameOrId) {
  const byId = Number(nameOrId);
  const row = Number.isInteger(byId) && byId > 0
    ? await db.tone(tenantId, 'SELECT id FROM sup_competitors WHERE tenant_id = :tenant AND id = :id', { id: byId })
    : await db.tone(tenantId, 'SELECT id FROM sup_competitors WHERE tenant_id = :tenant AND lower(name) = lower(:n)', { n: String(nameOrId || '').trim() });
  if (row) return row.id;
  const n = String(nameOrId || '').trim().slice(0, 160);
  if (!n || Number.isInteger(byId)) throw httpError(400, 'Unknown competitor');
  const [c] = await db.trun(tenantId, 'INSERT INTO sup_competitors (tenant_id, name) VALUES (:tenant, :n) RETURNING id', { n });
  return c.id;
}

async function record(tenantId, input, actorId) {
  const product = await catalog.get(tenantId, input.product_id);
  const price = num(String(input.competitor_price == null ? '' : input.competitor_price).replace(/[$,]/g, ''));
  if (!(price > 0)) throw httpError(400, 'Competitor price must be a positive number');
  if (!input.competitor_product) throw httpError(400, 'Name the competitor product exactly as listed');
  const checked = input.date_checked ? new Date(input.date_checked) : null;
  if (!checked || isNaN(checked) || checked > new Date(Date.now() + 864e5)) throw httpError(400, 'date_checked is required and cannot be in the future');
  if (input.competitor_url && !/^https?:\/\//i.test(input.competitor_url)) throw httpError(400, 'competitor_url must be http(s)');
  const comp = {
    competitor_product: String(input.competitor_product).slice(0, 300), competitor_sku: input.competitor_sku || null, competitor_upc: input.competitor_upc || null,
    competitor_brand: input.competitor_brand || null, competitor_model: input.competitor_model || null, competitor_unit: input.competitor_unit || product.unit || null
  };
  const m = matchConfidence(product, comp);
  const t = await require('./tenants').get(tenantId);
  const floor = Number((t && t.settings && t.settings.min_verified_confidence) || 0.8);
  const offer = catalog.offerPrice(product);
  const diff = offer.price != null ? Number((price - offer.price).toFixed(4)) : null;
  const pct = offer.price != null ? Number((((price - offer.price) / price) * 100).toFixed(3)) : null;
  const cid = await competitorId(tenantId, input.competitor_id || input.competitor);
  const [row] = await db.trun(tenantId, `INSERT INTO sup_competitor_prices (tenant_id, product_id, competitor_id, competitor_product, competitor_sku, competitor_upc,
      competitor_brand, competitor_model, competitor_price, competitor_unit, competitor_url, date_checked, match_confidence, match_basis, verified, price_difference, savings_percentage)
    VALUES (:tenant, :p, :c, :cp, :cs, :cu, :cb, :cm, :price, :unit, :url, :dc, :conf, :basis::jsonb, :ver, :diff, :pct) RETURNING *`,
  { p: product.id, c: cid, cp: comp.competitor_product, cs: comp.competitor_sku, cu: comp.competitor_upc, cb: comp.competitor_brand, cm: comp.competitor_model,
    price, unit: comp.competitor_unit, url: input.competitor_url || null, dc: checked.toISOString().slice(0, 10), conf: m.confidence, basis: JSON.stringify(m.basis),
    ver: m.confidence >= floor, diff, pct });
  await audit(tenantId, actorId, 'price.recorded', 'product', product.id, { competitor_id: cid, confidence: m.confidence });
  return row;
}

/** A person looked at both listings and confirms they are the same item. */
async function confirm(tenantId, id, actorId) {
  const [row] = await db.trun(tenantId, 'UPDATE sup_competitor_prices SET verified = true, verified_by = :a WHERE tenant_id = :tenant AND id = :id RETURNING *', { id: Number(id), a: actorId });
  if (!row) throw httpError(404, 'Price record not found');
  await audit(tenantId, actorId, 'price.confirmed', 'competitor_price', row.id, {});
  return row;
}

async function list(tenantId, { productId } = {}) {
  return db.tq(tenantId, `SELECT cp.*, c.name AS competitor, p.name AS product_name, p.unit AS product_unit FROM sup_competitor_prices cp
    JOIN sup_competitors c ON c.id = cp.competitor_id AND c.tenant_id = cp.tenant_id JOIN sup_products p ON p.id = cp.product_id AND p.tenant_id = cp.tenant_id
    WHERE cp.tenant_id = :tenant ${productId ? 'AND cp.product_id = :p' : ''} ORDER BY cp.date_checked DESC, cp.id DESC LIMIT 1000`, { p: Number(productId) || 0 });
}

/** The best claimable comparison for a product, or null. */
async function bestClaim(tenantId, product, settings) {
  const rows = await db.tq(tenantId, `SELECT cp.*, c.name AS competitor FROM sup_competitor_prices cp JOIN sup_competitors c ON c.id = cp.competitor_id AND c.tenant_id = cp.tenant_id
    WHERE cp.tenant_id = :tenant AND cp.product_id = :p ORDER BY cp.date_checked DESC`, { p: product.id });
  const offer = catalog.offerPrice(product);
  let best = null;
  for (const r of rows) {
    const ok = claimable(r, product, settings);
    if (!ok.ok) continue;
    const savings = Number((((Number(r.competitor_price) - offer.price) / Number(r.competitor_price)) * 100).toFixed(1));
    if (!best || savings > best.savings_pct) best = { competitor: r.competitor, competitor_price: Number(r.competitor_price), our_price: offer.price, unit: product.unit, savings_pct: savings, date_checked: r.date_checked, match_confidence: Number(r.match_confidence), price_id: r.id };
  }
  return best;
}

module.exports = { matchConfidence, claimable, record, confirm, list, bestClaim, unitKey };
