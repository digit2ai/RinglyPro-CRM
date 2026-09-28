'use strict';

/**
 * TURNING OUTBOUND ON IS ONE PIECE OF LOGIC WITH TWO DOORS.
 *
 * It was written inside `POST /internal/security/outbound`, which needs
 * LITE_ADMIN_KEY — fine for a script, useless for the founder sitting in their
 * own dashboard, who then cannot complete the one manual step the product
 * requires for every client. The founder-only control in the app calls this
 * same function rather than carrying a second copy: two copies of "verify the
 * workflow, then let a tenant dial real people" is how one of them loses the
 * published check.
 *
 * It returns `{ status, payload }` instead of touching a response, so neither
 * caller can accidentally own the HTTP shape.
 */
const express = require('express');

function out(status, payload) { return { status, payload }; }

async function setOutbound(b) {
  b = b || {};
  if (b.confirm !== true) return out(400, { error: 'confirm_required',
    message: 'Send {"confirm":true} - this lets a tenant start dialling real people.' });
  const tenantId = parseInt(b.tenant, 10);
  if (!Number.isInteger(tenantId)) return out(400, { error: 'tenant_required' });

  const { Tenant } = require('../models');
  const ghl = require('../telephony/ghl');
  const accounts = require('../services/ghlAccounts');
  const t = await Tenant.findByPk(tenantId);
  if (!t) return out(404, { error: 'no_such_tenant' });

  const enable = b.enabled !== false;               // default ON; pass false to switch off
  const workflowId = b.workflow_id == null ? null : String(b.workflow_id).trim().slice(0, 64);
  const patch = {};
  let verified = null;

  if (workflowId !== null) {
    if (workflowId && !/^[A-Za-z0-9_-]{6,64}$/.test(workflowId)) {
      return out(400, { error: 'bad_workflow_id',
        message: 'A HighLevel workflow id is letters, numbers, dashes or underscores.' });
    }
    if (workflowId && b.skip_verify !== true) {
      try {
        let creds = null;
        try { creds = await accounts.credsFor(t); } catch (_) { creds = null; }
        if (!creds) creds = ghl.resolve(null);
        const loc = (creds && creds.locationId) || t.ghl_location_id || ghl.locationId();
        const list = await ghl.call('GET', '/workflows/', { query: { locationId: loc }, creds });
        const all = (list && (list.workflows || list.data)) || [];
        const hit = all.find((w) => String(w.id || w._id) === workflowId);
        if (!hit) {
          return out(422, { error: 'workflow_not_found',
            message: 'HighLevel does not have that workflow in this sub-account. Nothing was changed.',
            workflow_id: workflowId,
            available: all.slice(0, 40).map((w) => ({ id: String(w.id || w._id), name: w.name || null,
              status: w.status || null })) });
        }
        verified = { id: workflowId, name: hit.name || null, status: hit.status || null };
        // A draft workflow accepts the enrollment and does nothing with it,
        // which looks exactly like a call that was never answered.
        if (hit.status && String(hit.status).toLowerCase() !== 'published') {
          return out(422, { error: 'workflow_not_published',
            message: 'That workflow exists but is not published, so an enrollment would do nothing. Publish it in HighLevel first. Nothing was changed.',
            workflow: verified });
        }
      } catch (e) {
        return out(502, { error: 'workflow_check_failed',
          message: 'Could not ask HighLevel whether that workflow exists, so nothing was changed. Retry, or send "skip_verify":true to set it unchecked.',
          detail: String(e.message || e).slice(0, 220), status: e.status || null });
      }
    }
    patch.outbound_workflow_id = workflowId || null;
  }

  // Enabling with no workflow is a half-state the dialer refuses anyway, and
  // it makes the dashboard say "ready" when nothing can dial.
  const effectiveWorkflow = patch.outbound_workflow_id !== undefined
    ? patch.outbound_workflow_id : t.outbound_workflow_id;
  if (enable && !effectiveWorkflow) {
    return out(422, { error: 'no_outbound_workflow',
      message: 'Set the HighLevel outbound workflow id in the same call. Without it nothing can dial, and enabling alone would report ready.' });
  }
  patch.outbound_enabled = enable;

  if (b.daily_cap !== undefined) {
    const cap = parseInt(b.daily_cap, 10);
    if (!Number.isInteger(cap) || cap < 0 || cap > 5000) {
      return out(400, { error: 'bad_daily_cap', message: '0 to 5000.' });
    }
    patch.outbound_daily_cap = cap;
  }

  await t.update(patch);
  console.log('[lite:outbound] tenant', tenantId, 'enabled=', patch.outbound_enabled,
    'workflow=', patch.outbound_workflow_id !== undefined ? 'set' : 'unchanged');

  // COMPLETING THE SETUP AND TELLING THE CLIENT ARE ONE ACTION.
  // Two actions is how a client who has paid sits uninformed for a day while
  // the thing they bought is already working.
  let told = null;
  // EXPLICIT, not the default. `enable` defaults true, so a call that only
  // changed `daily_cap` would flip a paying tenant live and email them "your
  // outbound caller is ready" before the operator had finished building it.
  if (b.enabled === true && t.outbound_state === 'pending_setup') {
    const billing = require('../services/outboundBilling');
    const notify = require('../services/notify');
    const moved = await billing.transition(tenantId, 'pending_setup', 'active',
      { outbound_activated_at: new Date(), outbound_state_reason: null });
    if (moved.moved) {
      // ONE CALL. It writes the client's dashboard row AND pushes their badge,
      // so there is no second channel that can silently not happen.
      told = await notify.clientOutboundReady(t).catch((e) => ({ ok: false, reason: String(e.message || e) }));
    }
  }

  return out(200, { ok: true, tenant: tenantId,
    activated: told !== null,
    client_notified: told,
    enabled: !!patch.outbound_enabled,
    workflow_id: effectiveWorkflow || null,
    workflow_verified: verified,
    workflow_unverified: !!(workflowId && b.skip_verify === true) || undefined,
    daily_cap: patch.outbound_daily_cap !== undefined ? patch.outbound_daily_cap
      : (t.outbound_daily_cap == null ? null : Number(t.outbound_daily_cap)),
    reminder: 'Numbers are still NOT checked against the National Do Not Call registry.' });
}

module.exports = { setOutbound };
