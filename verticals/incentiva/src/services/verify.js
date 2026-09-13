'use strict';

/**
 * Agent verification actions. The only way an incentive becomes visible to a
 * buyer is confirm() by an account with a real estate license number.
 */

const db = require('../db');
const { computeFreshUntil } = require('../engines/freshness');
const { getMarket } = require('./market');
const { audit } = require('./util');
const { pgIntArray } = require('./monitor');
const { TYPES } = require('../engines/extractor');

const METHODS = ['published_page_confirmed', 'agent_confirmed_with_builder', 'builder_email', 'broker_portal_viewed', 'flyer'];
const EDITABLE = ['type', 'value_kind', 'value_usd', 'value_percent', 'value_cap_usd', 'rate', 'buydown_schedule', 'use_restriction',
  'requires_affiliated_lender', 'contract_by', 'close_by', 'expires_on', 'combinable_with', 'choice_group', 'conditions_text', 'headline'];

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

function cleanEdits(edits = {}) {
  const out = {};
  for (const k of EDITABLE) {
    if (!(k in edits)) continue;
    let v = edits[k];
    if (v === '' || v === undefined) v = null;
    if (['value_usd', 'value_percent', 'value_cap_usd', 'rate'].includes(k) && v !== null) { v = Number(v); if (!isFinite(v) || v < 0) throw new HttpError(400, k + ' must be a positive number'); }
    if (['contract_by', 'close_by', 'expires_on'].includes(k) && v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new HttpError(400, k + ' must be YYYY-MM-DD');
    if (k === 'requires_affiliated_lender' && v !== null) v = v === true || v === 'true';
    if (k === 'type' && !TYPES.includes(v)) throw new HttpError(400, 'Unknown incentive type');
    if (k === 'buydown_schedule' && v !== null) {
      const arr = (Array.isArray(v) ? v : String(v).split(/[,\-/ ]+/)).map(Number).filter((x) => isFinite(x) && x > 0 && x < 10);
      v = arr.length ? arr : null;
    }
    if (k === 'combinable_with' && !['all', 'none', 'listed', 'not_stated'].includes(v)) v = 'not_stated';
    if ((k === 'headline' || k === 'conditions_text' || k === 'choice_group') && v !== null) v = String(v).slice(0, k === 'choice_group' ? 60 : 2000);
    out[k] = v;
  }
  if ('headline' in out && !out.headline) throw new HttpError(400, 'headline cannot be empty');
  return out;
}

async function loadPending(tenantId, versionId) {
  const v = await db.one(`SELECT v.*, i.current_version_id, i.community_id FROM nca_incentive_versions v JOIN nca_incentives i ON i.id = v.incentive_id AND i.tenant_id = v.tenant_id
    WHERE v.id = :id AND v.tenant_id = :t`, { id: versionId, t: tenantId });
  if (!v) throw new HttpError(404, 'Not found');
  if (v.verification_status !== 'pending_verification') throw new HttpError(409, 'This card was already resolved');
  return v;
}

async function confirm(tenantId, user, versionId, { edits, verification_method }) {
  if (!user.can_verify) throw new HttpError(403, 'Only a licensed agent account can confirm incentives');
  if (!METHODS.includes(verification_method)) throw new HttpError(400, 'verification_method is required');
  const v = await loadPending(tenantId, versionId);
  const e = cleanEdits(edits);
  const market = await getMarket(tenantId);
  const expires = 'expires_on' in e ? e.expires_on : v.expires_on;
  const now = new Date();

  const sets = Object.keys(e).map((k) => (k === 'buydown_schedule' ? `${k} = CAST(:e_${k} AS int[])` : `${k} = :e_${k}`));
  const repl = { id: v.id, t: tenantId, uid: user.id, m: verification_method, now: now.toISOString() };
  for (const k of Object.keys(e)) repl['e_' + k] = k === 'buydown_schedule' ? pgIntArray(e[k]) : e[k];

  if (v.change_kind === 'removed') {
    // Confirming a removal means "yes, it ended": the offer stays hidden for good.
    await db.exec(`UPDATE nca_incentive_versions SET verification_status = 'withdrawn', verification_method = :m, verified_by = :uid, last_verified_at = :now WHERE id = :id AND tenant_id = :t`, repl);
    await db.exec(`UPDATE nca_incentives SET current_version_id = :id WHERE id = :i AND tenant_id = :t`, { id: v.id, i: v.incentive_id, t: tenantId });
  } else {
    repl.fresh = computeFreshUntil(now, expires, market.settings).toISOString();
    // Audience follows the FINAL type: a broker bonus must never land in the buyer view.
    repl.audience = ('type' in e ? e.type : v.type) === 'broker_bonus' ? 'broker' : 'buyer';
    await db.exec(`UPDATE nca_incentive_versions SET ${sets.concat(["verification_status = 'verified'", 'audience = :audience', 'verification_method = :m', 'verified_by = :uid', 'last_verified_at = :now', 'fresh_until = :fresh']).join(', ')}
      WHERE id = :id AND tenant_id = :t`, repl);
    if (v.current_version_id && v.current_version_id !== v.id) {
      await db.exec(`UPDATE nca_incentive_versions SET verification_status = 'superseded' WHERE id = :c AND tenant_id = :t AND verification_status IN ('verified','withdrawn')`, { c: v.current_version_id, t: tenantId });
    }
    const typeRow = await db.one('SELECT type, audience FROM nca_incentive_versions WHERE id = :id', { id: v.id });
    await db.exec(`UPDATE nca_incentives SET current_version_id = :id, type = :ty, audience = :au WHERE id = :i AND tenant_id = :t`,
      { id: v.id, ty: typeRow.type, au: typeRow.audience, i: v.incentive_id, t: tenantId });
  }
  await audit(tenantId, { type: 'agent', id: user.id }, 'incentive.confirm', 'incentive_version', v.id, { method: verification_method, edits: Object.keys(e), change_kind: v.change_kind });
  return db.one('SELECT * FROM nca_incentive_versions WHERE id = :id', { id: v.id });
}

async function reject(tenantId, user, versionId, reason) {
  if (!reason || !String(reason).trim()) throw new HttpError(400, 'A reason is required');
  const v = await loadPending(tenantId, versionId);
  await db.exec(`UPDATE nca_incentive_versions SET verification_status = 'rejected', rejected_reason = :r, verified_by = :uid WHERE id = :id AND tenant_id = :t`,
    { r: String(reason).slice(0, 1000), uid: user.id, id: v.id, t: tenantId });
  // A rejected decrease/removal means the detector was wrong: restore the offer it hid, if still fresh.
  if (['decrease', 'removed', 'terms_changed'].includes(v.change_kind) && v.current_version_id) {
    await db.exec(`UPDATE nca_incentive_versions SET verification_status = 'verified' WHERE id = :c AND tenant_id = :t AND verification_status = 'withdrawn' AND fresh_until > now()`,
      { c: v.current_version_id, t: tenantId });
  }
  await audit(tenantId, { type: 'agent', id: user.id }, 'incentive.reject', 'incentive_version', v.id, { reason: String(reason).slice(0, 200) });
  return true;
}

/** Reconfirm a currently verified incentive: extends freshness on the same version, logged. */
async function reconfirm(tenantId, user, incentiveId, verification_method) {
  if (!user.can_verify) throw new HttpError(403, 'Only a licensed agent account can confirm incentives');
  if (!METHODS.includes(verification_method)) throw new HttpError(400, 'verification_method is required');
  const v = await db.one(`SELECT v.* FROM nca_incentives i JOIN nca_incentive_versions v ON v.id = i.current_version_id WHERE i.id = :i AND i.tenant_id = :t`, { i: incentiveId, t: tenantId });
  if (!v) throw new HttpError(404, 'Not found');
  if (v.verification_status !== 'verified') throw new HttpError(409, 'Only a verified incentive can be reconfirmed');
  const market = await getMarket(tenantId);
  const now = new Date();
  await db.exec(`UPDATE nca_incentive_versions SET last_verified_at = :now, fresh_until = :f, verification_method = :m, verified_by = :uid WHERE id = :id AND tenant_id = :t`,
    { now: now.toISOString(), f: computeFreshUntil(now, v.expires_on, market.settings).toISOString(), m: verification_method, uid: user.id, id: v.id, t: tenantId });
  await audit(tenantId, { type: 'agent', id: user.id }, 'incentive.reconfirm', 'incentive_version', v.id, { method: verification_method });
  return true;
}

module.exports = { confirm, reject, reconfirm, cleanEdits, HttpError, METHODS };
