'use strict';

// =============================================================
// Approval queue. An asset cannot be published until it is approved, and a
// SPANISH asset cannot be approved without a bilingual_reviewer sign-off — this
// is enforced HERE, in the service layer, not merely in the UI. Approval routing
// (a notification of what needs review) goes to a per-tenant target, never a
// hardcoded channel.
// =============================================================

const { scoped } = require('../models');

async function rolesFor(tenantId, email) {
  if (!email) return [];
  const rows = await scoped('roles', tenantId).findAll({});
  return rows.filter((r) => String(r.user_ref || '').toLowerCase() === String(email).toLowerCase()).map((r) => r.role);
}

async function submitForReview(tenantId, assetId) {
  const a = await scoped('content_assets', tenantId).findOne({ where: { id: assetId } });
  if (!a) return { ok: false, error: 'no such asset' };
  await scoped('content_assets', tenantId).update({ status: 'pending_review' }, { id: assetId });
  return { ok: true, status: 'pending_review' };
}

/**
 * Approve an asset. Role gate:
 *   - EN asset: needs marketing_reviewer OR bilingual_reviewer.
 *   - ES asset: needs bilingual_reviewer (no exceptions).
 */
async function approve(tenantId, assetId, { reviewerEmail }) {
  const a = await scoped('content_assets', tenantId).findOne({ where: { id: assetId } });
  if (!a) return { ok: false, error: 'no such asset' };
  const roles = await rolesFor(tenantId, reviewerEmail);
  if (a.language === 'es') {
    if (!roles.includes('bilingual_reviewer')) {
      return { ok: false, error: 'a Spanish asset can only be approved by a bilingual_reviewer', role_required: 'bilingual_reviewer' };
    }
  } else if (!roles.includes('marketing_reviewer') && !roles.includes('bilingual_reviewer')) {
    return { ok: false, error: 'approval requires a marketing_reviewer or bilingual_reviewer', role_required: 'marketing_reviewer' };
  }
  await scoped('content_assets', tenantId).update(
    { status: 'approved', approved_by: reviewerEmail, approved_at: new Date(), rejection_reason: null }, { id: assetId });
  return { ok: true, status: 'approved', approved_by: reviewerEmail };
}

async function reject(tenantId, assetId, { reviewerEmail, reason }) {
  const a = await scoped('content_assets', tenantId).findOne({ where: { id: assetId } });
  if (!a) return { ok: false, error: 'no such asset' };
  await scoped('content_assets', tenantId).update(
    { status: 'rejected', approved_by: reviewerEmail || null, rejection_reason: reason || 'unspecified' }, { id: assetId });
  return { ok: true, status: 'rejected' };
}

module.exports = { rolesFor, submitForReview, approve, reject };
