// =====================================================
// Tenant resolver — for PUBLIC read endpoints (no JWT required for the demo
// dashboard). Derives a tenant_id from ?tenant_id / X-Tenant-Id, else falls
// back to 1 (the demo tenant). Write endpoints do NOT use this — they go through
// requireAuth in lib/auth.js, which derives tenant_id from the verified JWT.
//
// Multi-tenant org management UI is explicitly deferred this sprint, so tenant
// is derived/hardwired, never user-managed.
// =====================================================

'use strict';

const DEFAULT_TENANT = 1;

function resolveTenant(req, res, next) {
  let t = null;
  if (req.query && req.query.tenant_id != null) t = parseInt(req.query.tenant_id, 10);
  if ((t == null || Number.isNaN(t)) && req.headers['x-tenant-id']) {
    t = parseInt(req.headers['x-tenant-id'], 10);
  }
  req.tenantId = Number.isInteger(t) ? t : DEFAULT_TENANT;
  next();
}

module.exports = { resolveTenant, DEFAULT_TENANT };
