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

/**
 * FIND THE SHARED OUTBOUND WORKFLOW BY NAME.
 *
 * HighLevel still has no POST/PUT for workflows (verified 2026-09-28: the
 * public API exposes GET /workflows/ under a readonly scope and the create
 * endpoint is an open feature request), so one must be built by hand. But Lite
 * runs every tenant inside ONE shared sub-account, so it only has to exist
 * ONCE — and then nobody should ever paste its id again.
 *
 * TWO REFUSALS, because this decides which workflow dials real people:
 *  - more than one candidate is refused and both are named, never guessed
 *    between;
 *  - a draft is refused, because it accepts the enrollment and does nothing,
 *    which is indistinguishable from a call nobody answered.
 */
async function findSharedWorkflow(t) {
  const ghl = require('../telephony/ghl');
  const accounts = require('./ghlAccounts');
  const pattern = new RegExp(process.env.LITE_GHL_OUTBOUND_WORKFLOW_NAME || 'voice\\s*ai\\s*outbound', 'i');
  let creds = null;
  try { creds = await accounts.credsFor(t); } catch (_) { creds = null; }
  if (!creds) creds = ghl.resolve(null);
  const loc = (creds && creds.locationId) || t.ghl_location_id || ghl.locationId();
  const list = await ghl.call('GET', '/workflows/', { query: { locationId: loc }, creds });
  const all = (list && (list.workflows || list.data)) || [];
  const hits = all.filter((w) => pattern.test(String(w.name || '')));
  if (!hits.length) return { ok: false, reason: 'no_matching_workflow', pattern: String(pattern) };
  if (hits.length > 1) {
    return { ok: false, reason: 'several_matching_workflows',
      matches: hits.map((w) => ({ id: String(w.id || w._id), name: w.name || null })) };
  }
  const w = hits[0];
  if (w.status && String(w.status).toLowerCase() !== 'published') {
    return { ok: false, reason: 'workflow_not_published',
      workflow: { id: String(w.id || w._id), name: w.name || null, status: w.status } };
  }
  return { ok: true, id: String(w.id || w._id), name: w.name || null };
}

/**
 * THE WORKFLOW A CLIENT OWNS IS THE ONE NAMED AFTER THEIR OWN NUMBER.
 *
 * `findSharedWorkflow` above finds ONE workflow for the whole sub-account, and
 * that is only safe for the single tenant it dials as: `callMirror.resolveNumber`
 * attributes an inbound call by the number that was DIALLED, so a prospect
 * returning a call made from a shared line reaches whoever owns that line and
 * their message lands in that client's dashboard. It does not scale past one
 * client, which is why every other client needed a human to paste an id.
 *
 * So the convention carries the mapping instead: the owner builds each client's
 * workflow with that client's OWN number in its name, and this finds it. No id
 * is typed anywhere, and because the workflow is named for the number it dials
 * from, the caller-ID problem above does not arise.
 *
 * MATCHED ON DIGITS, so `+1 656-213-4441`, `(656) 213-4441` and `16562134441`
 * are the same name. The last ten are accepted as well as the full eleven,
 * because a US number is written both ways and refusing on that would send the
 * owner hunting for a typo that is not there.
 *
 * FOUR REFUSALS, because this decides which workflow dials real people, and a
 * wrong one dials a stranger's prospects from a stranger's number:
 *  - a tenant with no number of their own cannot be matched at all;
 *  - nothing matching is refused WITH the exact name to use, so the fix is
 *    readable rather than guessable;
 *  - two workflows naming the same number are ambiguous, and both are named;
 *  - a name carrying ANOTHER client's number too is refused, because a single
 *    workflow cannot belong to two clients and the one-match rule above cannot
 *    see it — that check is what stops "Outbound 656... and 656..." being
 *    silently handed to whichever tenant asked first.
 * A draft is refused last, exactly as the shared path refuses it.
 */
function digitsOf(v) { return String(v == null ? '' : v).replace(/\D+/g, ''); }

/** Both forms a US number is written in. Never an empty string, which matches everything. */
function numberKeys(did) {
  const d = digitsOf(did);
  if (!d) return [];
  const keys = [d];
  if (d.length === 11 && d.startsWith('1')) keys.push(d.slice(1));
  return keys;
}

function nameHolds(name, did) {
  const n = digitsOf(name);
  if (!n) return false;
  return numberKeys(did).some((k) => k.length >= 7 && n.includes(k));
}

/** The name the owner must give the workflow in HighLevel, printed wherever it is needed. */
function expectedWorkflowName(did) {
  const tpl = process.env.LITE_GHL_OUTBOUND_WORKFLOW_TEMPLATE || 'RinglyPro Outbound {number}';
  return tpl.replace('{number}', String(did || ''));
}

async function findWorkflowForTenant(t) {
  const ghl = require('../telephony/ghl');
  const accounts = require('./ghlAccounts');
  const { Number: NumberModel } = require('../models');

  const own = await NumberModel.findOne({ where: { tenant_id: t.id, status: 'active' } });
  const did = own && own.did;
  if (!did) return { ok: false, reason: 'tenant_has_no_number' };

  let creds = null;
  try { creds = await accounts.credsFor(t); } catch (_) { creds = null; }
  if (!creds) creds = ghl.resolve(null);
  const loc = (creds && creds.locationId) || t.ghl_location_id || ghl.locationId();
  const list = await ghl.call('GET', '/workflows/', { query: { locationId: loc }, creds });
  const all = (list && (list.workflows || list.data)) || [];

  const expected = expectedWorkflowName(did);
  const hits = all.filter((w) => nameHolds(w.name, did));
  if (!hits.length) {
    return { ok: false, reason: 'no_workflow_for_number', number: String(did), expected_name: expected,
      seen: all.slice(0, 40).map((w) => w.name || null) };
  }
  if (hits.length > 1) {
    return { ok: false, reason: 'several_workflows_for_number', number: String(did), expected_name: expected,
      matches: hits.map((w) => ({ id: String(w.id || w._id), name: w.name || null })) };
  }

  const w = hits[0];
  // A workflow whose name carries somebody else's line as well belongs to
  // neither of them. Read every active number once rather than per candidate.
  const others = await NumberModel.findAll({ where: { status: 'active' }, attributes: ['did', 'tenant_id'] });
  const clash = others.find((r) => Number(r.tenant_id) !== Number(t.id) && nameHolds(w.name, r.did));
  if (clash) {
    return { ok: false, reason: 'workflow_names_another_client', number: String(did),
      expected_name: expected, workflow: { id: String(w.id || w._id), name: w.name || null } };
  }
  if (w.status && String(w.status).toLowerCase() !== 'published') {
    return { ok: false, reason: 'workflow_not_published', number: String(did), expected_name: expected,
      workflow: { id: String(w.id || w._id), name: w.name || null, status: w.status } };
  }
  return { ok: true, id: String(w.id || w._id), name: w.name || null, number: String(did) };
}

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
  let workflowId = b.workflow_id == null ? null : String(b.workflow_id).trim().slice(0, 64);
  // 'auto' means: find the shared workflow yourself. This is what removes the
  // manual step for every client after the first.
  if (workflowId === 'auto') {
    // THE CLIENT'S OWN WORKFLOW FIRST, named after their own number. This is
    // what removes the manual paste for every client, and it needs no
    // environment variable: a workflow named for a number dials from that
    // number, so the caller ID is right by construction.
    const mine = await findWorkflowForTenant(t).catch((e) => ({ ok: false, reason: 'lookup_failed',
      detail: String(e.message || e).slice(0, 160) }));
    if (mine.ok) {
      workflowId = mine.id;
    } else {
      // THE SINGLE SHARED WORKFLOW IS THE FALLBACK. It is deliberately NOT
      // gated here: this door is an operator holding the admin key or the
      // founder in their own dashboard, asking for it explicitly. The
      // caller-ID guard belongs on the path that fires with nobody watching
      // (`outboundBilling.autoActivate`), which is where it lives.
      const found = await findSharedWorkflow(t).catch((e) => ({ ok: false, reason: 'lookup_failed',
        detail: String(e.message || e).slice(0, 160) }));
      if (!found.ok) {
        // The per-tenant refusal is the more useful one to read when the
        // tenant HAS a number, because it names the workflow to create.
        const best = mine.reason === 'tenant_has_no_number' ? found : mine;
        return out(422, { error: best.reason, ...best, message:
          best.expected_name
            ? `No workflow names this client's number. Create one in HighLevel called "${best.expected_name}" and publish it. Nothing was changed.`
            : 'Could not identify the outbound workflow automatically. Nothing was changed.' });
      }
      workflowId = found.id;
    }
  }
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

module.exports = { setOutbound, findSharedWorkflow, findWorkflowForTenant, expectedWorkflowName };
