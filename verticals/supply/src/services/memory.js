'use strict';

/**
 * Customer Memory Engine — a short, current, AI-readable summary of where a
 * contractor stands, built deterministically from rows (no model, so it cannot
 * remember something that did not happen). It is written onto the contact in
 * the communications platform after every call, which is what lets the inbound
 * agent greet a caller as someone it already knows: the context is already on
 * the contact BEFORE they call back, so it does not depend on a webhook
 * arriving in time.
 */

const db = require('../db');

const LABEL = {
  no_answer: 'no answer', voicemail: 'left voicemail', not_interested: 'not interested', call_back_later: 'asked for a call back later',
  interested: 'interested', needs_pricing: 'asked for contractor pricing', needs_product_information: 'asked for product information',
  needs_inventory_information: 'asked about inventory', potential_buyer: 'potential buyer', transfer_requested: 'asked to speak with sales',
  transferred: 'was transferred to sales', do_not_call: 'asked not to be called'
};

async function build(tenantId, contractorId) {
  const c = await db.tone(tenantId, `SELECT c.*, cat.name AS category, r.name AS rep_name, r.phone AS rep_phone FROM sup_contractors c
    LEFT JOIN sup_categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    LEFT JOIN sup_sales_reps r ON r.id = c.assigned_rep_id AND r.tenant_id = c.tenant_id
    WHERE c.tenant_id = :tenant AND c.id = :id`, { id: Number(contractorId) });
  if (!c) return null;
  const calls = await db.tq(tenantId, `SELECT k.id, k.direction, k.outcome, k.summary, k.extracted, k.started_at, k.campaign_id, cp.campaign_name
    FROM sup_calls k LEFT JOIN sup_campaigns cp ON cp.id = k.campaign_id AND cp.tenant_id = k.tenant_id
    WHERE k.tenant_id = :tenant AND k.contractor_id = :id AND k.status = 'completed' ORDER BY k.started_at DESC LIMIT 5`, { id: c.id });
  const buyers = await db.tq(tenantId, `SELECT b.*, p.name AS product_name, p.unit AS product_unit, rr.name AS rep_name FROM sup_buyers b
    LEFT JOIN sup_products p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
    LEFT JOIN sup_sales_reps rr ON rr.id = b.assigned_rep_id AND rr.tenant_id = b.tenant_id
    WHERE b.tenant_id = :tenant AND b.contractor_id = :id ORDER BY b.updated_at DESC LIMIT 3`, { id: c.id });

  const who = [c.contact_name, c.company_name ? `from ${c.company_name}` : null].filter(Boolean).join(' ') || c.company_name;
  const parts = [`${who}${c.category ? ` (${c.category})` : ''}.`];
  if (!calls.length && !buyers.length) parts.push('No previous conversation on record.');
  const last = calls[0];
  if (last) {
    const x = last.extracted || {};
    const bits = [LABEL[last.outcome] || last.outcome || 'spoke with us'];
    if (x.rps_product) bits.push('about ' + String(x.rps_product).slice(0, 80));
    if (x.rps_quantity) bits.push('quantity ' + String(x.rps_quantity).slice(0, 40));
    if (x.rps_timeframe) bits.push('timeframe ' + String(x.rps_timeframe).slice(0, 40));
    parts.push(`Last ${last.direction} call ${String(new Date(last.started_at).toISOString()).slice(0, 10)}${last.campaign_name ? ` (${last.campaign_name})` : ''}: ${bits.join(', ')}.`);
    if (last.summary) parts.push('Summary: ' + String(last.summary).replace(/\s+/g, ' ').slice(0, 280));
  }
  const open = buyers.find((b) => b.status === 'open');
  if (open) {
    const bits = [`Potential buyer${open.product_name ? ' for ' + open.product_name : ''}`];
    if (open.price_discussed) bits.push('price discussed ' + open.price_discussed);
    if (open.quantity) bits.push('quantity ' + open.quantity);
    if (open.buying_timeframe) bits.push('buying ' + open.buying_timeframe);
    parts.push(bits.join(', ') + '.');
    if (open.next_action) parts.push('Next action: ' + open.next_action + '.');
  }
  const objections = calls.map((k) => k.extracted && k.extracted.rps_notes).filter(Boolean).slice(0, 2);
  if (objections.length) parts.push('Notes: ' + objections.join(' / ').slice(0, 200));
  const rep = (open && open.rep_name) || c.rep_name;
  if (rep) parts.push(`Assigned representative: ${rep}.`);
  if (c.do_not_contact) parts.push('DO NOT CALL THIS CONTACT FOR SALES.');
  const text = parts.join(' ').slice(0, 1500);
  return { contractor_id: c.id, text, rep_name: rep || null, last_call_id: last ? last.id : null, open_buyer_id: open ? open.id : null };
}

/** Write the current context onto the provider contact. Never throws. */
async function push(tenant, contractorId, provider, extra = {}) {
  try {
    const ctx = await build(tenant.id, contractorId);
    if (!ctx) return { ok: false, reason: 'contractor not found' };
    const c = await db.tone(tenant.id, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND id = :id', { id: Number(contractorId) });
    let ext = c.ghl_contact_id;
    if (!ext) ext = await require('./contractors').syncToProvider(tenant, c, provider);
    await provider.setContactContext(tenant, ext, Object.assign({ rps_context: ctx.text, rps_rep: ctx.rep_name || '' }, extra));
    return { ok: true, context: ctx.text };
  } catch (e) { return { ok: false, reason: e.message }; }
}

module.exports = { build, push };
