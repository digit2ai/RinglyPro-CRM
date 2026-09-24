'use strict';

/**
 * Contractors (business prospects). Dedupe is by E.164 phone (a unique index)
 * and by a normalised company name within the same ZIP/city, so "ABC Flooring
 * LLC" and "abc flooring" are one business. A duplicate import UPDATES the
 * existing row's empty fields instead of creating a second one.
 */

const db = require('../db');
const { e164, companyKey, audit, httpError } = require('../util');

const FIELDS = ['company_name', 'contact_name', 'phone', 'email', 'website', 'business_type', 'category_id', 'address', 'city', 'state', 'zip',
  'timezone', 'source', 'notes', 'assigned_rep_id', 'consent_status', 'consent_note', 'do_not_contact'];

function clean(input) {
  const p = {};
  for (const f of FIELDS) {
    if (input[f] === undefined) continue;
    let v = input[f];
    if (f === 'category_id' || f === 'assigned_rep_id') v = v === '' || v == null ? null : Number(v);
    else if (f === 'do_not_contact') v = v === true || v === 'true' || v === 1 || v === '1' || v === 'yes';
    else if (f === 'consent_status') { v = String(v || 'unknown'); if (!['unknown', 'business_published', 'express', 'revoked'].includes(v)) throw httpError(400, 'Unknown consent status'); }
    else v = v == null ? null : String(v).trim().slice(0, f === 'notes' ? 4000 : 250) || null;
    p[f] = v;
  }
  if (p.phone !== undefined) {
    p.phone_e164 = e164(p.phone);
    if (p.phone && !p.phone_e164) throw httpError(400, 'Phone number is not a valid US or international (+country) number');
  }
  if (p.state) p.state = p.state.toUpperCase().slice(0, 2);
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) throw httpError(400, 'Email is not valid');
  if (p.website && !/^https?:\/\//i.test(p.website)) p.website = 'https://' + p.website;
  return p;
}

async function findDuplicate(tenantId, p) {
  if (p.phone_e164) {
    const byPhone = await db.tone(tenantId, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND phone_e164 = :p', { p: p.phone_e164 });
    if (byPhone) return byPhone;
  }
  if (p.company_name) {
    return db.tone(tenantId, `SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND company_key = :k
      AND (COALESCE(zip,'') = COALESCE(:z,'') OR lower(COALESCE(city,'')) = lower(COALESCE(:c,'')))`, { k: companyKey(p.company_name), z: p.zip || null, c: p.city || null });
  }
  return null;
}

async function validRefs(tenantId, p) {
  if (p.category_id) { const c = await db.tone(tenantId, 'SELECT id FROM sup_categories WHERE tenant_id = :tenant AND id = :id', { id: p.category_id }); if (!c) throw httpError(400, 'Unknown contractor category'); }
  if (p.assigned_rep_id) { const r = await db.tone(tenantId, 'SELECT id FROM sup_sales_reps WHERE tenant_id = :tenant AND id = :id', { id: p.assigned_rep_id }); if (!r) throw httpError(400, 'Unknown sales rep'); }
}

async function create(tenantId, input, actorId, { mergeDuplicates = false } = {}) {
  const p = clean(input);
  if (!p.company_name) throw httpError(400, 'Company name is required');
  if (!p.category_id && input.category) {
    const cat = await db.tone(tenantId, 'SELECT id FROM sup_categories WHERE tenant_id = :tenant AND lower(name) = lower(:n)', { n: String(input.category).trim() });
    if (cat) p.category_id = cat.id;
  }
  await validRefs(tenantId, p);
  const dup = await findDuplicate(tenantId, p);
  if (dup) {
    if (!mergeDuplicates) throw httpError(409, 'This contractor already exists (same phone or same company in the same area)', { duplicate_id: dup.id });
    const fill = {};
    for (const [k, v] of Object.entries(p)) if (v != null && (dup[k] == null || dup[k] === '')) fill[k] = v;
    if (Object.keys(fill).length) await update(tenantId, dup.id, fill, actorId);
    return { row: dup, merged: true };
  }
  p.company_key = companyKey(p.company_name);
  const cols = Object.keys(p);
  const [row] = await db.trun(tenantId, `INSERT INTO sup_contractors (tenant_id, ${cols.join(', ')}) VALUES (:tenant, ${cols.map((c) => ':' + c).join(', ')}) RETURNING *`, p);
  if (row.do_not_contact && row.phone_e164) await require('./compliance').suppress(tenantId, row.phone_e164, 'do_not_call', { source: 'contractor record', actorId });
  await audit(tenantId, actorId, 'contractor.created', 'contractor', row.id, {});
  return { row, merged: false };
}

async function update(tenantId, id, input, actorId) {
  const cur = await get(tenantId, id);
  const p = clean(input);
  await validRefs(tenantId, p);
  if (p.company_name) p.company_key = companyKey(p.company_name);
  if (p.phone_e164 && p.phone_e164 !== cur.phone_e164) {
    const clash = await db.tone(tenantId, 'SELECT id FROM sup_contractors WHERE tenant_id = :tenant AND phone_e164 = :p AND id <> :id', { p: p.phone_e164, id: cur.id });
    if (clash) throw httpError(409, 'Another contractor already has that phone number', { duplicate_id: clash.id });
  }
  const cols = Object.keys(p);
  if (!cols.length) return cur;
  const [row] = await db.trun(tenantId, `UPDATE sup_contractors SET ${cols.map((c) => `${c} = :${c}`).join(', ')}, updated_at = now() WHERE tenant_id = :tenant AND id = :id RETURNING *`, Object.assign({ id: cur.id }, p));
  if (p.do_not_contact === true && row.phone_e164) await require('./compliance').suppress(tenantId, row.phone_e164, 'do_not_call', { source: 'contractor record', actorId });
  await audit(tenantId, actorId, 'contractor.updated', 'contractor', row.id, { fields: cols });
  return row;
}

async function get(tenantId, id) {
  const c = await db.tone(tenantId, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND id = :id', { id: Number(id) });
  if (!c) throw httpError(404, 'Contractor not found');
  return c;
}

async function list(tenantId, { q, category_id, stage } = {}) {
  return db.tq(tenantId, `SELECT c.*, cat.name AS category, r.name AS rep_name FROM sup_contractors c
    LEFT JOIN sup_categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    LEFT JOIN sup_sales_reps r ON r.id = c.assigned_rep_id AND r.tenant_id = c.tenant_id
    WHERE c.tenant_id = :tenant ${q ? 'AND (c.company_name ILIKE :q OR c.contact_name ILIKE :q OR c.phone ILIKE :q OR c.city ILIKE :q)' : ''}
    ${category_id ? 'AND c.category_id = :cat' : ''} ${stage ? 'AND c.stage = :stage' : ''}
    ORDER BY c.updated_at DESC LIMIT 1000`, { q: '%' + (q || '') + '%', cat: Number(category_id) || 0, stage: stage || '' });
}

async function importRows(tenantId, rows, actorId) {
  const report = { created: 0, merged: 0, failed: 0, errors: [] };
  if (!Array.isArray(rows) || !rows.length) throw httpError(400, 'The file has no rows');
  if (rows.length > 5000) throw httpError(400, 'Import at most 5,000 rows at a time');
  const pick = (r, names) => { for (const [k, v] of Object.entries(r)) if (names.includes(k.trim().toLowerCase().replace(/_/g, ' '))) return v; return undefined; };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const input = {
      company_name: pick(r, ['company name', 'company', 'business', 'business name', 'name']),
      contact_name: pick(r, ['contact name', 'contact', 'owner', 'first name']),
      phone: pick(r, ['phone', 'phone number', 'mobile', 'telephone']),
      email: pick(r, ['email', 'email address']),
      website: pick(r, ['website', 'url', 'web']),
      business_type: pick(r, ['business type', 'type']),
      category: pick(r, ['category', 'contractor category', 'trade']),
      address: pick(r, ['address', 'street']), city: pick(r, ['city']), state: pick(r, ['state']), zip: pick(r, ['zip', 'zip code', 'postal code']),
      source: pick(r, ['source']) || 'import', notes: pick(r, ['notes']),
      do_not_contact: pick(r, ['do not contact', 'dnc', 'do not call'])
    };
    for (const k of Object.keys(input)) if (input[k] === undefined || input[k] === '') delete input[k];
    try {
      const out = await create(tenantId, input, actorId, { mergeDuplicates: true });
      if (out.merged) report.merged++; else report.created++;
    } catch (e) { report.failed++; if (report.errors.length < 50) report.errors.push({ row: i + 2, error: e.message }); }
  }
  await audit(tenantId, actorId, 'contractor.import', 'contractor', null, { created: report.created, merged: report.merged, failed: report.failed });
  return report;
}

/** Push to the communications provider; failures are recorded, never fatal to the local record. */
async function syncToProvider(tenant, contractor, provider) {
  const out = await provider.upsertContact(tenant, contractor);
  if (out.externalId && out.externalId !== contractor.ghl_contact_id) {
    await db.trun(tenant.id, 'UPDATE sup_contractors SET ghl_contact_id = :g WHERE tenant_id = :tenant AND id = :id', { g: out.externalId, id: contractor.id });
  }
  return out.externalId;
}

async function byPhone(tenantId, phone) {
  const p = e164(phone);
  if (!p) return null;
  return db.tone(tenantId, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND phone_e164 = :p', { p });
}
async function byExternalId(tenantId, ext) {
  if (!ext) return null;
  return db.tone(tenantId, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND ghl_contact_id = :g', { g: String(ext) });
}

module.exports = { create, update, get, list, importRows, syncToProvider, byPhone, byExternalId, clean };
