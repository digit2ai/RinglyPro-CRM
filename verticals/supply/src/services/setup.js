'use strict';

/** Sales reps, contractor categories, competitors, buyers and manual pipeline moves. */

const db = require('../db');
const C = require('../corpus');
const { e164, audit, httpError } = require('../util');

// ── Sales reps ──
async function reps(tenantId) { return db.tq(tenantId, 'SELECT * FROM sup_sales_reps WHERE tenant_id = :tenant ORDER BY active DESC, is_default DESC, name'); }
async function saveRep(tenantId, input, actorId) {
  const name = String(input.name || '').trim().slice(0, 200);
  if (!name) throw httpError(400, 'Rep name is required');
  const phone = input.phone ? e164(input.phone) : null;
  if (input.phone && !phone) throw httpError(400, 'Rep phone is not valid');
  const pct = input.commission_pct === '' || input.commission_pct == null ? null : Number(input.commission_pct);
  if (pct != null && !(pct >= 0 && pct <= 100)) throw httpError(400, 'Commission % must be 0-100');
  const v = { n: name, e: input.email ? String(input.email).trim().slice(0, 200) : null, p: phone, pct, d: !!input.is_default, a: input.active !== false };
  if (v.d) await db.trun(tenantId, 'UPDATE sup_sales_reps SET is_default = false WHERE tenant_id = :tenant', {});
  let row;
  if (input.id) {
    [row] = await db.trun(tenantId, `UPDATE sup_sales_reps SET name = :n, email = :e, phone = :p, commission_pct = :pct, is_default = :d, active = :a WHERE tenant_id = :tenant AND id = :id RETURNING *`, Object.assign({ id: Number(input.id) }, v));
    if (!row) throw httpError(404, 'Rep not found');
  } else {
    [row] = await db.trun(tenantId, `INSERT INTO sup_sales_reps (tenant_id, name, email, phone, commission_pct, is_default, active) VALUES (:tenant, :n, :e, :p, :pct, :d, :a) RETURNING *`, v);
  }
  await audit(tenantId, actorId, 'rep.saved', 'rep', row.id, {});
  return row;
}

// ── Categories ──
async function categories(tenantId) { return db.tq(tenantId, 'SELECT * FROM sup_categories WHERE tenant_id = :tenant ORDER BY active DESC, name'); }
async function saveCategory(tenantId, input, actorId) {
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) throw httpError(400, 'Category name is required');
  const kw = String(input.keywords || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 80).join(',');
  let row;
  if (input.id) [row] = await db.trun(tenantId, 'UPDATE sup_categories SET name = :n, keywords = :k, active = :a WHERE tenant_id = :tenant AND id = :id RETURNING *', { n: name, k: kw, a: input.active !== false, id: Number(input.id) });
  else [row] = await db.trun(tenantId, 'INSERT INTO sup_categories (tenant_id, name, keywords) VALUES (:tenant, :n, :k) RETURNING *', { n: name, k: kw })
      .catch((e) => { if (e.name === 'SequelizeUniqueConstraintError' || /sup_categories_name_uq/.test(JSON.stringify([e.message, e.parent && e.parent.constraint]))) throw httpError(409, 'That category already exists'); throw e; });
  if (!row) throw httpError(404, 'Category not found');
  await audit(tenantId, actorId, 'category.saved', 'category', row.id, {});
  return row;
}
async function competitors(tenantId) { return db.tq(tenantId, 'SELECT * FROM sup_competitors WHERE tenant_id = :tenant ORDER BY name'); }

// ── Potential buyers ──
async function buyers(tenantId, { status, repId } = {}) {
  return db.tq(tenantId, `SELECT b.*, c.company_name, c.contact_name, c.phone, c.stage, p.name AS product_name, r.name AS rep_name, cp.campaign_name
    FROM sup_buyers b JOIN sup_contractors c ON c.id = b.contractor_id AND c.tenant_id = b.tenant_id
    LEFT JOIN sup_products p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
    LEFT JOIN sup_sales_reps r ON r.id = b.assigned_rep_id AND r.tenant_id = b.tenant_id
    LEFT JOIN sup_campaigns cp ON cp.id = b.campaign_id AND cp.tenant_id = b.tenant_id
    WHERE b.tenant_id = :tenant ${status ? 'AND b.status = :st' : ''} ${repId ? 'AND b.assigned_rep_id = :rep' : ''}
    ORDER BY b.updated_at DESC LIMIT 1000`, { st: status || '', rep: Number(repId) || 0 });
}
async function updateBuyer(tenantId, id, input, actorId) {
  const cur = await db.tone(tenantId, 'SELECT * FROM sup_buyers WHERE tenant_id = :tenant AND id = :id', { id: Number(id) });
  if (!cur) throw httpError(404, 'Potential buyer not found');
  const set = {};
  for (const f of ['quantity', 'price_discussed', 'buying_timeframe', 'next_action', 'ai_notes', 'interest_level']) if (input[f] !== undefined) set[f] = input[f] ? String(input[f]).slice(0, 2000) : null;
  if (input.assigned_rep_id !== undefined) {
    if (input.assigned_rep_id && !(await db.tone(tenantId, 'SELECT id FROM sup_sales_reps WHERE tenant_id = :tenant AND id = :id', { id: Number(input.assigned_rep_id) }))) throw httpError(400, 'Unknown rep');
    set.assigned_rep_id = input.assigned_rep_id ? Number(input.assigned_rep_id) : null;
  }
  if (input.status !== undefined) { if (!['open', 'won', 'lost'].includes(input.status)) throw httpError(400, 'Unknown status'); set.status = input.status; }
  // campaign_id and original_call_id are NOT editable: first-touch attribution.
  const cols = Object.keys(set);
  if (!cols.length) return cur;
  const [row] = await db.trun(tenantId, `UPDATE sup_buyers SET ${cols.map((c) => `${c} = :${c}`).join(', ')}, updated_at = now() WHERE tenant_id = :tenant AND id = :id RETURNING *`, Object.assign({ id: cur.id }, set));
  await audit(tenantId, actorId, 'buyer.updated', 'buyer', row.id, { fields: cols });
  return row;
}

// ── Pipeline (manual) ──
async function pipeline(tenantId) {
  const rows = await db.tq(tenantId, `SELECT c.id, c.company_name, c.contact_name, c.stage, c.interest_level, c.last_contact, r.name AS rep_name
    FROM sup_contractors c LEFT JOIN sup_sales_reps r ON r.id = c.assigned_rep_id AND r.tenant_id = c.tenant_id
    WHERE c.tenant_id = :tenant ORDER BY c.updated_at DESC LIMIT 2000`);
  const stages = C.PIPELINE.map((s) => ({ stage: s, items: rows.filter((r) => r.stage === s) }));
  return { stages };
}
async function moveStage(tenantId, contractorId, stage, actorId) {
  if (!C.PIPELINE.includes(stage)) throw httpError(400, 'Unknown stage');
  const [row] = await db.trun(tenantId, 'UPDATE sup_contractors SET stage = :s, updated_at = now() WHERE tenant_id = :tenant AND id = :id RETURNING id, stage, phone_e164', { s: stage, id: Number(contractorId) });
  if (!row) throw httpError(404, 'Contractor not found');
  if (stage === 'do_not_contact' && row.phone_e164) await require('./compliance').suppress(tenantId, row.phone_e164, 'do_not_call', { source: 'pipeline', actorId });
  await audit(tenantId, actorId, 'pipeline.moved', 'contractor', row.id, { stage });
  return row;
}

module.exports = { reps, saveRep, categories, saveCategory, competitors, buyers, updateBuyer, pipeline, moveStage };
