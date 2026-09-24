'use strict';

/**
 * Sales, attribution and commissions.
 *
 * A sale is recorded by a person (a rep or an admin): nothing here infers
 * that money changed hands. When it is recorded against a Potential Buyer,
 * the attribution is COPIED from that buyer — campaign and original outbound
 * call as they were at first touch — so a contractor who called back a week
 * later still credits the campaign that found them.
 *
 * Commission % comes from the rep's own rate, else the tenant default; it is
 * stored on the commission row at the time of the sale so a later rate change
 * does not rewrite history. Nothing here pays anyone: status moves
 * pending -> approved -> paid by a person, and "paid" records that it was
 * settled elsewhere.
 */

const db = require('../db');
const { audit, httpError, money } = require('../util');

async function record(tenant, input, actor) {
  const T = tenant.id;
  const amount = money(String(input.sale_amount == null ? '' : input.sale_amount).replace(/[$,]/g, ''));
  if (!(amount > 0)) throw httpError(400, 'Sale amount must be a positive number');
  let buyer = null;
  if (input.buyer_id) {
    buyer = await db.tone(T, 'SELECT * FROM sup_buyers WHERE tenant_id = :tenant AND id = :id', { id: Number(input.buyer_id) });
    if (!buyer) throw httpError(404, 'Potential buyer not found');
  }
  const contractorId = buyer ? buyer.contractor_id : Number(input.contractor_id);
  const contractor = await db.tone(T, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND id = :id', { id: contractorId || 0 });
  if (!contractor) throw httpError(400, 'Choose the contractor or potential buyer this sale belongs to');
  const productId = input.product_id ? Number(input.product_id) : (buyer ? buyer.product_id : null);
  if (productId && !(await db.tone(T, 'SELECT id FROM sup_products WHERE tenant_id = :tenant AND id = :id', { id: productId }))) throw httpError(400, 'Unknown product');
  const repId = input.sales_rep_id ? Number(input.sales_rep_id) : (buyer && buyer.assigned_rep_id) || contractor.assigned_rep_id || null;
  const rep = repId ? await db.tone(T, 'SELECT * FROM sup_sales_reps WHERE tenant_id = :tenant AND id = :id', { id: repId }) : null;
  if (repId && !rep) throw httpError(400, 'Unknown sales rep');

  // Attribution: from the buyer (first touch), else from the contractor's first outbound call on record.
  let campaignId = buyer ? buyer.campaign_id : null;
  let originalCallId = buyer ? buyer.original_call_id : null;
  if (!buyer) {
    const first = await db.tone(T, `SELECT id, campaign_id FROM sup_calls WHERE tenant_id = :tenant AND contractor_id = :c AND direction = 'outbound' AND status = 'completed' ORDER BY started_at ASC LIMIT 1`, { c: contractor.id });
    if (first) { campaignId = first.campaign_id; originalCallId = first.id; }
  }
  const soldAt = input.sold_at ? new Date(input.sold_at) : new Date();
  if (isNaN(soldAt)) throw httpError(400, 'Invalid sale date');
  const [sale] = await db.trun(T, `INSERT INTO sup_sales (tenant_id, buyer_id, contractor_id, product_id, campaign_id, original_call_id, sales_rep_id, sale_amount, sold_at, notes, created_by)
    VALUES (:tenant, :b, :c, :p, :camp, :orig, :rep, :amt, :at, :notes, :actor) RETURNING *`,
  { b: buyer ? buyer.id : null, c: contractor.id, p: productId, camp: campaignId, orig: originalCallId, rep: rep ? rep.id : null, amt: amount, at: soldAt, notes: input.notes ? String(input.notes).slice(0, 2000) : null, actor: actor.id });

  let commission = null;
  if (rep) {
    const pct = rep.commission_pct != null ? Number(rep.commission_pct) : Number((tenant.settings && tenant.settings.default_commission_pct) || 0);
    const amt = money((amount * pct) / 100);
    [commission] = await db.trun(T, `INSERT INTO sup_commissions (tenant_id, sale_id, campaign_id, original_call_id, contact_id, product_id, sales_rep_id, sale_amount, commission_percentage, commission_amount)
      VALUES (:tenant, :s, :camp, :orig, :c, :p, :rep, :amt, :pct, :camt) RETURNING *`,
    { s: sale.id, camp: campaignId, orig: originalCallId, c: contractor.id, p: productId, rep: rep.id, amt: amount, pct, camt: amt });
  }
  if (buyer && input.close_buyer !== false) await db.trun(T, `UPDATE sup_buyers SET status = 'won', next_action = NULL, updated_at = now() WHERE tenant_id = :tenant AND id = :id`, { id: buyer.id });
  await db.trun(T, `UPDATE sup_contractors SET stage = 'won', updated_at = now() WHERE tenant_id = :tenant AND id = :id`, { id: contractor.id });
  await audit(T, actor.id, 'sale.recorded', 'sale', sale.id, { amount, campaign_id: campaignId, original_call_id: originalCallId, commission_id: commission && commission.id });
  return { sale, commission, attribution: await attribution(T, sale.id) };
}

/** The full chain for one sale: campaign -> outbound call -> contractor -> buyer -> rep -> sale -> commission. */
async function attribution(tenantId, saleId) {
  return db.tone(tenantId, `SELECT s.id AS sale_id, s.sale_amount, s.sold_at,
      cp.id AS campaign_id, cp.campaign_name, k.id AS original_call_id, k.started_at AS original_call_at, k.outcome AS original_call_outcome,
      c.id AS contractor_id, c.company_name, c.contact_name, b.id AS buyer_id, b.created_at AS buyer_created_at,
      p.id AS product_id, p.name AS product_name, r.id AS sales_rep_id, r.name AS sales_rep,
      cm.id AS commission_id, cm.commission_percentage, cm.commission_amount, cm.commission_status
    FROM sup_sales s
    JOIN sup_contractors c ON c.id = s.contractor_id AND c.tenant_id = s.tenant_id
    LEFT JOIN sup_campaigns cp ON cp.id = s.campaign_id AND cp.tenant_id = s.tenant_id
    LEFT JOIN sup_calls k ON k.id = s.original_call_id AND k.tenant_id = s.tenant_id
    LEFT JOIN sup_buyers b ON b.id = s.buyer_id AND b.tenant_id = s.tenant_id
    LEFT JOIN sup_products p ON p.id = s.product_id AND p.tenant_id = s.tenant_id
    LEFT JOIN sup_sales_reps r ON r.id = s.sales_rep_id AND r.tenant_id = s.tenant_id
    LEFT JOIN sup_commissions cm ON cm.sale_id = s.id AND cm.tenant_id = s.tenant_id
    WHERE s.tenant_id = :tenant AND s.id = :id`, { id: Number(saleId) });
}

async function list(tenantId) {
  return db.tq(tenantId, `SELECT s.*, c.company_name, p.name AS product_name, r.name AS rep_name, cp.campaign_name FROM sup_sales s
    JOIN sup_contractors c ON c.id = s.contractor_id AND c.tenant_id = s.tenant_id
    LEFT JOIN sup_products p ON p.id = s.product_id AND p.tenant_id = s.tenant_id
    LEFT JOIN sup_sales_reps r ON r.id = s.sales_rep_id AND r.tenant_id = s.tenant_id
    LEFT JOIN sup_campaigns cp ON cp.id = s.campaign_id AND cp.tenant_id = s.tenant_id
    WHERE s.tenant_id = :tenant ORDER BY s.sold_at DESC LIMIT 1000`);
}

async function commissions(tenantId, { repId } = {}) {
  return db.tq(tenantId, `SELECT cm.*, r.name AS rep_name, c.company_name, cp.campaign_name, p.name AS product_name FROM sup_commissions cm
    LEFT JOIN sup_sales_reps r ON r.id = cm.sales_rep_id AND r.tenant_id = cm.tenant_id
    LEFT JOIN sup_contractors c ON c.id = cm.contact_id AND c.tenant_id = cm.tenant_id
    LEFT JOIN sup_campaigns cp ON cp.id = cm.campaign_id AND cp.tenant_id = cm.tenant_id
    LEFT JOIN sup_products p ON p.id = cm.product_id AND p.tenant_id = cm.tenant_id
    WHERE cm.tenant_id = :tenant ${repId ? 'AND cm.sales_rep_id = :rep' : ''} ORDER BY cm.created_at DESC LIMIT 1000`, { rep: Number(repId) || 0 });
}

const COMMISSION_FLOW = { pending: ['approved', 'void'], approved: ['paid', 'void'], paid: [], void: [] };
async function setCommissionStatus(tenantId, id, status, actor) {
  if (!['owner', 'admin'].includes(actor.role)) throw httpError(403, 'Only an owner or admin can change commission status');
  const cur = await db.tone(tenantId, 'SELECT * FROM sup_commissions WHERE tenant_id = :tenant AND id = :id', { id: Number(id) });
  if (!cur) throw httpError(404, 'Commission not found');
  if (!(COMMISSION_FLOW[cur.commission_status] || []).includes(status)) throw httpError(409, `Cannot go from ${cur.commission_status} to ${status}`);
  const [row] = await db.trun(tenantId, 'UPDATE sup_commissions SET commission_status = :s WHERE tenant_id = :tenant AND id = :id RETURNING *', { s: status, id: cur.id });
  await audit(tenantId, actor.id, 'commission.' + status, 'commission', row.id, {});
  return row;
}

module.exports = { record, attribution, list, commissions, setCommissionStatus };
