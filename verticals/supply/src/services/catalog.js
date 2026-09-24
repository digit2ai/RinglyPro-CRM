'use strict';

/**
 * Product catalog: manual entry, edit, (de)activate, CSV / Excel import.
 * Unknown columns in an import are kept in `attributes` rather than dropped,
 * so a supplier's extra specs (thickness, wear layer, finish) are available to
 * matching later without a migration.
 */

const db = require('../db');
const { num, audit, httpError } = require('../util');

const FIELDS = ['sku', 'upc', 'name', 'category', 'subcategory', 'description', 'brand', 'model', 'dimensions', 'material', 'unit',
  'quantity_available', 'cost', 'selling_price', 'minimum_price', 'promotional_price', 'inventory_location', 'image', 'product_url', 'notes', 'active'];
const isUnique = (e, idx) => e && (e.name === 'SequelizeUniqueConstraintError' || /unique/i.test(e.message)) && JSON.stringify([e.message, e.parent && e.parent.constraint, e.original && e.original.constraint]).includes(idx);
const NUMERIC = new Set(['quantity_available', 'cost', 'selling_price', 'minimum_price', 'promotional_price']);

const ALIASES = {
  sku: ['sku', 'item', 'item number', 'item #', 'part number', 'product id', 'product_id'],
  upc: ['upc', 'barcode', 'ean', 'gtin'],
  name: ['name', 'product', 'product name', 'title', 'item name', 'description short'],
  category: ['category', 'department', 'dept'],
  subcategory: ['subcategory', 'sub category', 'sub-category', 'class'],
  description: ['description', 'long description', 'details'],
  brand: ['brand', 'manufacturer', 'mfr', 'make'],
  model: ['model', 'model number', 'mfr part', 'model #'],
  dimensions: ['dimensions', 'size', 'dims'],
  material: ['material'],
  unit: ['unit', 'uom', 'unit of measure'],
  quantity_available: ['quantity_available', 'quantity', 'qty', 'on hand', 'stock', 'inventory'],
  cost: ['cost', 'unit cost'],
  selling_price: ['selling_price', 'price', 'sell price', 'retail', 'our price'],
  minimum_price: ['minimum_price', 'min price', 'floor price', 'minimum'],
  promotional_price: ['promotional_price', 'promo price', 'sale price', 'promo'],
  inventory_location: ['inventory_location', 'location', 'warehouse', 'bin'],
  image: ['image', 'image url', 'photo'],
  product_url: ['product_url', 'url', 'link', 'product url'],
  notes: ['notes', 'note', 'comments']
};
function mapHeader(h) {
  const k = String(h || '').trim().toLowerCase().replace(/_/g, ' ');
  for (const [field, list] of Object.entries(ALIASES)) if (list.some((a) => a.replace(/_/g, ' ') === k)) return field;
  return null;
}

function clean(input) {
  const p = {};
  for (const f of FIELDS) {
    if (input[f] === undefined) continue;
    let v = input[f];
    if (NUMERIC.has(f)) {
      if (v === '' || v == null) { p[f] = null; continue; }
      v = num(String(v).replace(/[$,\s]/g, ''));
      if (v == null || v < 0) throw httpError(400, `${f} must be a non-negative number`);
    } else if (f === 'active') v = v === true || v === 'true' || v === 1 || v === '1';
    else v = v == null ? null : String(v).trim().slice(0, f === 'description' || f === 'notes' ? 5000 : 300) || null;
    p[f] = v;
  }
  return p;
}
function checkPrices(p) {
  if (p.minimum_price != null && p.selling_price != null && p.minimum_price > p.selling_price) throw httpError(400, 'Minimum price cannot exceed the selling price');
  if (p.promotional_price != null && p.minimum_price != null && p.promotional_price < p.minimum_price) throw httpError(400, 'Promotional price cannot be below the minimum price');
}

async function list(tenantId, { q, active } = {}) {
  return db.tq(tenantId, `SELECT * FROM sup_products WHERE tenant_id = :tenant
    ${active === undefined ? '' : 'AND active = :a'} ${q ? 'AND (name ILIKE :q OR sku ILIKE :q OR brand ILIKE :q OR category ILIKE :q)' : ''}
    ORDER BY active DESC, name LIMIT 1000`, { a: active === 'true' || active === true, q: '%' + (q || '') + '%' });
}
async function get(tenantId, id) {
  const p = await db.tone(tenantId, 'SELECT * FROM sup_products WHERE tenant_id = :tenant AND id = :id', { id: Number(id) });
  if (!p) throw httpError(404, 'Product not found');
  return p;
}

async function create(tenantId, input, actorId) {
  const p = clean(input);
  if (!p.name) throw httpError(400, 'Product name is required');
  checkPrices(p);
  const attrs = input.attributes && typeof input.attributes === 'object' ? input.attributes : {};
  const cols = Object.keys(p);
  const [row] = await db.trun(tenantId, `INSERT INTO sup_products (tenant_id, attributes, ${cols.join(', ')})
    VALUES (:tenant, :attrs::jsonb, ${cols.map((c) => ':' + c).join(', ')}) RETURNING *`, Object.assign({ attrs: JSON.stringify(attrs) }, p))
    .catch((e) => { if (isUnique(e, 'sup_products_sku_uq')) throw httpError(409, 'A product with that SKU already exists'); throw e; });
  await audit(tenantId, actorId, 'product.created', 'product', row.id, { sku: row.sku });
  return row;
}

async function update(tenantId, id, input, actorId) {
  const cur = await get(tenantId, id);
  const p = clean(input);
  checkPrices(Object.assign({}, cur, p, {
    minimum_price: p.minimum_price !== undefined ? p.minimum_price : num(cur.minimum_price),
    selling_price: p.selling_price !== undefined ? p.selling_price : num(cur.selling_price),
    promotional_price: p.promotional_price !== undefined ? p.promotional_price : num(cur.promotional_price)
  }));
  const cols = Object.keys(p);
  if (input.attributes && typeof input.attributes === 'object') { cols.push('attributes'); p.attributes = JSON.stringify(input.attributes); }
  if (!cols.length) return cur;
  const set = cols.map((c) => (c === 'attributes' ? 'attributes = :attributes::jsonb' : `${c} = :${c}`)).join(', ');
  const [row] = await db.trun(tenantId, `UPDATE sup_products SET ${set}, updated_at = now() WHERE tenant_id = :tenant AND id = :id RETURNING *`, Object.assign({ id: Number(id) }, p));
  await audit(tenantId, actorId, 'product.updated', 'product', row.id, { fields: cols });
  return row;
}

/** Parse a CSV or Excel buffer into rows. xlsx reads both. */
function parseSheet(buffer, filename) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw httpError(400, `No sheet found in ${filename || 'file'}`);
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
}

/**
 * import rows: upsert by SKU when present, else insert. Returns a per-row
 * report; one bad row never aborts the rest.
 */
async function importRows(tenantId, rows, actorId) {
  const report = { created: 0, updated: 0, failed: 0, errors: [], unmapped_columns: [] };
  if (!Array.isArray(rows) || !rows.length) throw httpError(400, 'The file has no rows');
  if (rows.length > 5000) throw httpError(400, 'Import at most 5,000 rows at a time');
  const headers = Object.keys(rows[0]);
  const map = {};
  for (const h of headers) { const f = mapHeader(h); if (f && !Object.values(map).includes(f)) map[h] = f; else report.unmapped_columns.push(h); }
  if (!Object.values(map).includes('name')) throw httpError(400, 'No product name column found (expected a column like "name" or "product name")');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const input = { attributes: {} };
    for (const [h, v] of Object.entries(r)) { if (map[h]) input[map[h]] = v; else if (String(v).trim()) input.attributes[h] = String(v).trim().slice(0, 300); }
    try {
      const sku = input.sku ? String(input.sku).trim() : '';
      const existing = sku ? await db.tone(tenantId, 'SELECT id FROM sup_products WHERE tenant_id = :tenant AND lower(sku) = lower(:s)', { s: sku }) : null;
      if (existing) { await update(tenantId, existing.id, input, actorId); report.updated++; }
      else { await create(tenantId, input, actorId); report.created++; }
    } catch (e) {
      report.failed++;
      if (report.errors.length < 50) report.errors.push({ row: i + 2, error: e.message });
    }
  }
  await audit(tenantId, actorId, 'product.import', 'product', null, { created: report.created, updated: report.updated, failed: report.failed });
  return report;
}

/** The price a buyer is offered: promo if set, else selling — never under the floor. */
function offerPrice(p) {
  const promo = num(p.promotional_price);
  const sell = num(p.selling_price);
  const min = num(p.minimum_price);
  const price = promo != null ? promo : sell;
  if (price == null) return { price: null, reason: 'no price on the product' };
  if (min != null && price < min) return { price: null, reason: 'offer price is below the minimum price' };
  return { price, is_promotional: promo != null };
}

module.exports = { list, get, create, update, importRows, parseSheet, mapHeader, offerPrice, FIELDS };
