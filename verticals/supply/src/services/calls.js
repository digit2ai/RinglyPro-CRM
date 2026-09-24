'use strict';

/**
 * What happened on a call, and everything that follows from it.
 *
 * ingestCall() is idempotent on (tenant, provider, provider_call_id): the same
 * call arriving by webhook AND by the call-log poll is stored once and its
 * effects run once.
 *
 * OUTCOME: taken from the agent's extracted rps_outcome when it is one of the
 * fixed outcomes ('extracted'); a transfer action in the call log is a fact
 * ('transferred'); otherwise conservative keyword rules on the summary
 * ('rules'). An unclassifiable call gets NO outcome and creates no buyer —
 * interest is never assumed.
 *
 * ATTRIBUTION IS FIRST-TOUCH AND NEVER OVERWRITTEN. A Potential Buyer records
 * the campaign and the outbound call that created it. A callback days later
 * updates the buyer's needs but cannot move its campaign or original call,
 * so the sale still traces back to the campaign that earned it.
 */

const db = require('../db');
const C = require('../corpus');
const { e164, audit } = require('../util');
const compliance = require('./compliance');
const memory = require('./memory');
const tenants = require('./tenants');

const RULES = [
  [/\b(do not call|don'?t call|stop calling|remove (me|us|my number)|take me off)\b/i, 'do_not_call'],
  [/\b(transfer(red)?|speak (to|with) (a |someone|sales|a person|a human)|talk to (a |someone|sales))\b/i, 'transfer_requested'],
  [/\b(voicemail|left a message|answering machine)\b/i, 'voicemail'],
  [/\b(no answer|did not answer|didn'?t answer|unanswered)\b/i, 'no_answer'],
  [/\b(not interested|no interest|no thanks|not a fit)\b/i, 'not_interested'],
  [/\b(call (me |us )?back|busy right now|try (again )?later)\b/i, 'call_back_later'],
  [/\b(price|pricing|quote|how much)\b/i, 'needs_pricing'],
  [/\b(in stock|inventory|availability|how many)\b/i, 'needs_inventory_information'],
  [/\b(interested|sounds good|send (me|us)|would like)\b/i, 'interested']
];

function classify(call) {
  const x = call.extracted || {};
  const ext = String(x.rps_outcome || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (C.CALL_OUTCOMES.includes(ext)) return { outcome: ext, source: 'extracted' };
  if ((call.actions || []).some((a) => /transfer/i.test(a.type))) return { outcome: 'transferred', source: 'extracted' };
  if (/^(yes|true|1)$/i.test(String(x.rps_wants_transfer || ''))) return { outcome: 'transfer_requested', source: 'extracted' };
  const text = [call.summary, x.rps_notes].filter(Boolean).join(' ');
  for (const [re, out] of RULES) if (re.test(text)) return { outcome: out, source: 'rules' };
  return { outcome: null, source: null };
}

function interestLevel(outcome, x) {
  const said = String((x && x.rps_interest) || '').toLowerCase();
  if (['high', 'medium', 'low'].includes(said)) return said;
  if (['transfer_requested', 'transferred', 'potential_buyer', 'needs_pricing'].includes(outcome)) return 'high';
  if (['interested', 'needs_product_information', 'needs_inventory_information'].includes(outcome)) return 'medium';
  if (['not_interested', 'do_not_call'].includes(outcome)) return 'none';
  return null;
}

async function repFor(tenantId, { buyer, contractor, campaign }) {
  const id = (buyer && buyer.assigned_rep_id) || (contractor && contractor.assigned_rep_id) || (campaign && campaign.sales_rep_id);
  if (id) return id;
  const r = await db.tone(tenantId, 'SELECT id FROM sup_sales_reps WHERE tenant_id = :tenant AND active ORDER BY is_default DESC, id LIMIT 1');
  return r ? r.id : null;
}

async function resolveProduct(tenantId, campaign, said) {
  const ids = campaign ? (campaign.product_ids || []).map(Number) : [];
  if (said) {
    const byName = await db.tone(tenantId, `SELECT id FROM sup_products WHERE tenant_id = :tenant AND active AND (name ILIKE :q OR sku ILIKE :s) ${ids.length ? 'ORDER BY (id IN (:ids)) DESC' : ''} LIMIT 1`,
      { q: '%' + String(said).slice(0, 60) + '%', s: String(said).slice(0, 60), ids: ids.length ? ids : [0] });
    if (byName) return byName.id;
  }
  return ids[0] || null;
}

async function moveStage(tenantId, contractor, outcome) {
  const to = C.OUTCOME_STAGE[outcome];
  if (!to) return contractor.stage;
  if (to !== 'do_not_contact' && C.HUMAN_STAGES.has(contractor.stage)) return contractor.stage; // a person owns it now
  if (to !== 'do_not_contact' && C.PIPELINE.indexOf(to) < C.PIPELINE.indexOf(contractor.stage) && !['callback_required', 'do_not_contact'].includes(contractor.stage)) return contractor.stage; // never backward
  await db.trun(tenantId, 'UPDATE sup_contractors SET stage = :s, updated_at = now() WHERE tenant_id = :tenant AND id = :id', { s: to, id: contractor.id });
  return to;
}

/**
 * ingestCall(tenant, provider, call) — call is a normalizedCall.
 * Returns { call, created, outcome, buyer_id, transfer_id } or { ignored }.
 */
async function ingestCall(tenant, provider, call, { direction } = {}) {
  const T = tenant.id;
  let contractor = call.externalContactId
    ? await db.tone(T, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND ghl_contact_id = :g', { g: String(call.externalContactId) }) : null;
  if (!contractor && call.fromNumber) {
    const p = e164(call.fromNumber);
    if (p) contractor = await db.tone(T, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND phone_e164 = :p', { p });
  }
  if (!contractor) return { ignored: 'no matching contractor for this call' };
  if (call.trial) return { ignored: 'test call made from the GHL agent editor' };

  if (call.providerCallId) {
    const seen = await db.tone(T, 'SELECT * FROM sup_calls WHERE tenant_id = :tenant AND provider = :pv AND provider_call_id = :id', { pv: provider.name, id: String(call.providerCallId) });
    if (seen && seen.status === 'completed') return { call: seen, created: false, duplicate: true };
  }

  // An outbound call we dispatched and are waiting on = this call.
  const pending = direction === 'inbound' ? null : await db.tone(T, `SELECT * FROM sup_calls WHERE tenant_id = :tenant AND contractor_id = :c AND direction = 'outbound' AND status = 'dispatched'
    AND started_at > now() - interval '48 hours' ORDER BY started_at DESC LIMIT 1`, { c: contractor.id });
  const dir = pending ? 'outbound' : (direction || call.direction || 'inbound');
  const cls = classify(call);
  const fields = {
    outcome: cls.outcome, src: cls.source, pid: call.providerCallId ? String(call.providerCallId) : null, g: call.externalContactId || contractor.ghl_contact_id,
    sum: call.summary ? String(call.summary).slice(0, 4000) : null, tr: call.transcript ? String(call.transcript).slice(0, 60000) : null,
    ex: JSON.stringify(call.extracted || {}), ac: JSON.stringify(call.actions || []), dur: call.durationSec == null ? null : Number(call.durationSec), ended: call.startedAt ? new Date(call.startedAt) : new Date()
  };
  let row;
  if (pending) {
    [row] = await db.trun(T, `UPDATE sup_calls SET status = 'completed', outcome = :outcome, outcome_source = :src, provider_call_id = COALESCE(:pid, provider_call_id), ghl_contact_id = :g,
      summary = :sum, transcript = :tr, extracted = :ex::jsonb, actions = :ac::jsonb, duration_sec = :dur, ended_at = now() WHERE tenant_id = :tenant AND id = :id RETURNING *`, Object.assign({ id: pending.id }, fields));
  } else {
    // Inbound: attribute to the contractor's most recent campaign so a callback stays in the story.
    const lastOut = await db.tone(T, `SELECT campaign_id FROM sup_calls WHERE tenant_id = :tenant AND contractor_id = :c AND direction = 'outbound' AND campaign_id IS NOT NULL ORDER BY started_at DESC LIMIT 1`, { c: contractor.id });
    const ins = await db.trun(T, `INSERT INTO sup_calls (tenant_id, campaign_id, contractor_id, direction, status, outcome, outcome_source, provider, provider_call_id, ghl_contact_id,
        summary, transcript, extracted, actions, duration_sec, started_at, ended_at)
      VALUES (:tenant, :camp, :c, :dir, 'completed', :outcome, :src, :pv, :pid, :g, :sum, :tr, :ex::jsonb, :ac::jsonb, :dur, :ended, now())
      ON CONFLICT (tenant_id, provider, provider_call_id) WHERE provider_call_id IS NOT NULL DO NOTHING RETURNING *`,
    Object.assign({ camp: lastOut ? lastOut.campaign_id : null, c: contractor.id, dir, pv: provider.name }, fields));
    if (!ins.length) return { duplicate: true, created: false };
    row = ins[0];
  }
  const campaign = row.campaign_id ? await db.tone(T, 'SELECT * FROM sup_campaigns WHERE tenant_id = :tenant AND id = :id', { id: row.campaign_id }) : null;
  const x = call.extracted || {};
  const result = { call: row, created: true, outcome: cls.outcome, recognized: dir === 'inbound' };

  await db.trun(T, `UPDATE sup_contractors SET last_contact = now(), call_status = :o, interest_level = COALESCE(:il, interest_level), updated_at = now() WHERE tenant_id = :tenant AND id = :id`,
    { o: cls.outcome || 'completed', il: interestLevel(cls.outcome, x), id: contractor.id });
  if (row.campaign_id && dir === 'outbound') await db.trun(T, `UPDATE sup_campaign_targets SET status = 'done', call_id = :k, updated_at = now() WHERE tenant_id = :tenant AND campaign_id = :c AND contractor_id = :ct`, { k: row.id, c: row.campaign_id, ct: contractor.id });
  if (cls.outcome) result.stage = await moveStage(T, contractor, cls.outcome);
  if (cls.outcome === 'do_not_call' && contractor.phone_e164) await compliance.suppress(T, contractor.phone_e164, 'opt_out', { source: 'said on call ' + row.id });

  if (cls.outcome && C.BUYER_OUTCOMES.has(cls.outcome)) {
    const productId = await resolveProduct(T, campaign, x.rps_product);
    const existing = await db.tone(T, `SELECT * FROM sup_buyers WHERE tenant_id = :tenant AND contractor_id = :c AND COALESCE(product_id,0) = COALESCE(:p,0) AND status = 'open'`, { c: contractor.id, p: productId });
    const rep = await repFor(T, { buyer: existing, contractor, campaign });
    const v = {
      q: x.rps_quantity ? String(x.rps_quantity).slice(0, 120) : null, price: x.rps_price_discussed ? String(x.rps_price_discussed).slice(0, 120) : null,
      il: interestLevel(cls.outcome, x), tf: x.rps_timeframe ? String(x.rps_timeframe).slice(0, 120) : null, sum: row.summary, notes: x.rps_notes ? String(x.rps_notes).slice(0, 2000) : null,
      next: cls.outcome === 'needs_pricing' ? 'Send contractor pricing' : ['transfer_requested', 'transferred'].includes(cls.outcome) ? 'Sales representative to follow up' : 'Follow up on interest'
    };
    let buyer;
    if (existing) {
      [buyer] = await db.trun(T, `UPDATE sup_buyers SET quantity = COALESCE(:q, quantity), price_discussed = COALESCE(:price, price_discussed), interest_level = COALESCE(:il, interest_level),
        buying_timeframe = COALESCE(:tf, buying_timeframe), call_summary = COALESCE(:sum, call_summary), ai_notes = COALESCE(:notes, ai_notes), next_action = :next,
        transcript_reference = :k, updated_at = now() WHERE tenant_id = :tenant AND id = :id RETURNING *`, Object.assign({ id: existing.id, k: row.id }, v));
    } else {
      // First touch: campaign + original call are set here, once.
      const origin = dir === 'outbound' ? row : await db.tone(T, `SELECT id, campaign_id FROM sup_calls WHERE tenant_id = :tenant AND contractor_id = :c AND direction = 'outbound' ORDER BY started_at DESC LIMIT 1`, { c: contractor.id });
      const pc = campaign ? campaign.offer : null;
      const claim = pc && pc.products ? (pc.products.find((p) => p.product_id === productId) || {}).claim : null;
      [buyer] = await db.trun(T, `INSERT INTO sup_buyers (tenant_id, contractor_id, product_id, quantity, price_discussed, competitive_context, interest_level, buying_timeframe,
          call_summary, transcript_reference, ai_notes, campaign_id, original_call_id, assigned_rep_id, next_action, status)
        VALUES (:tenant, :c, :p, :q, :price, :cc, :il, :tf, :sum, :k, :notes, :camp, :orig, :rep, :next, 'open')
        ON CONFLICT (tenant_id, contractor_id, COALESCE(product_id, 0)) WHERE status = 'open' DO UPDATE SET updated_at = now() RETURNING *`,
      Object.assign({ c: contractor.id, p: productId, cc: claim ? `${claim.competitor} $${claim.competitor_price} checked ${String(claim.date_checked).slice(0, 10)}` : null, k: row.id,
        camp: origin ? origin.campaign_id : null, orig: origin ? origin.id : null, rep }, v));
      await audit(T, null, 'buyer.created', 'buyer', buyer.id, { call_id: row.id, campaign_id: buyer.campaign_id });
    }
    if (rep && !contractor.assigned_rep_id) await db.trun(T, 'UPDATE sup_contractors SET assigned_rep_id = :r WHERE tenant_id = :tenant AND id = :id', { r: rep, id: contractor.id });
    result.buyer_id = buyer.id;
    await syncOpportunity(tenant, provider, buyer, contractor, result.stage);

    if (['transfer_requested', 'transferred'].includes(cls.outcome)) {
      const tr = await db.trun(T, `INSERT INTO sup_transfers (tenant_id, call_id, contractor_id, product_id, campaign_id, sales_rep_id, outcome)
        VALUES (:tenant, :k, :c, :p, :camp, :rep, :o) ON CONFLICT (tenant_id, call_id) DO NOTHING RETURNING id`,
      { k: row.id, c: contractor.id, p: productId, camp: buyer.campaign_id, rep: buyer.assigned_rep_id || rep, o: cls.outcome === 'transferred' ? 'connected' : 'requested' });
      if (tr.length) result.transfer_id = tr[0].id;
    }
  }
  await tenants.markOnboarding(T, dir === 'outbound' ? 'test_outbound' : 'test_inbound').catch(() => {});
  result.memory = await memory.push(tenant, contractor.id, provider);
  return result;
}

async function syncOpportunity(tenant, provider, buyer, contractor, stage) {
  const g = tenant.ghl || {};
  const stageId = g.stage_map && g.stage_map[stage || contractor.stage];
  if (!g.pipeline_id || !stageId || !contractor.ghl_contact_id) return { skipped: 'pipeline not mapped' };
  try {
    const out = await provider.upsertOpportunity(tenant, { externalId: buyer.ghl_opportunity_id, externalContactId: contractor.ghl_contact_id, name: `${contractor.company_name} — potential buyer`, pipelineId: g.pipeline_id, stageId });
    if (out.externalId && out.externalId !== buyer.ghl_opportunity_id) await db.trun(tenant.id, 'UPDATE sup_buyers SET ghl_opportunity_id = :o WHERE tenant_id = :tenant AND id = :id', { o: out.externalId, id: buyer.id });
    return out;
  } catch (e) { return { error: e.message }; }
}

/**
 * Callback recognition: an inbound call signal. Finds the contractor and
 * refreshes the context on their contact so the inbound agent reads it.
 */
async function recognize(tenant, provider, { externalContactId, phone }) {
  let c = externalContactId ? await db.tone(tenant.id, 'SELECT id FROM sup_contractors WHERE tenant_id = :tenant AND ghl_contact_id = :g', { g: String(externalContactId) }) : null;
  if (!c && phone) { const p = e164(phone); if (p) c = await db.tone(tenant.id, 'SELECT id FROM sup_contractors WHERE tenant_id = :tenant AND phone_e164 = :p', { p }); }
  if (!c) return { recognized: false };
  const pushed = await memory.push(tenant, c.id, provider);
  const ctx = await memory.build(tenant.id, c.id);
  return { recognized: true, contractor_id: c.id, context: ctx.text, pushed: pushed.ok, push_error: pushed.ok ? null : pushed.reason };
}

async function list(tenantId, { contractorId, campaignId, limit = 200 } = {}) {
  return db.tq(tenantId, `SELECT k.id, k.campaign_id, k.contractor_id, k.direction, k.status, k.outcome, k.outcome_source, k.provider, k.summary, k.duration_sec, k.started_at, k.ended_at, k.is_simulated,
      c.company_name, c.contact_name, cp.campaign_name
    FROM sup_calls k LEFT JOIN sup_contractors c ON c.id = k.contractor_id AND c.tenant_id = k.tenant_id LEFT JOIN sup_campaigns cp ON cp.id = k.campaign_id AND cp.tenant_id = k.tenant_id
    WHERE k.tenant_id = :tenant ${contractorId ? 'AND k.contractor_id = :ct' : ''} ${campaignId ? 'AND k.campaign_id = :cp' : ''}
    ORDER BY k.started_at DESC LIMIT :lim`, { ct: Number(contractorId) || 0, cp: Number(campaignId) || 0, lim: Math.min(1000, Number(limit) || 200) });
}
async function get(tenantId, id) {
  return db.tone(tenantId, 'SELECT * FROM sup_calls WHERE tenant_id = :tenant AND id = :id', { id: Number(id) });
}

module.exports = { classify, ingestCall, recognize, list, get, repFor, syncOpportunity };
