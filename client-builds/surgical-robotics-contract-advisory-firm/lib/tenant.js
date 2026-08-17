// =====================================================
// lib/tenant.js — row-level tenant scoping.
//
// One tenant ships (Greg, tenant 1), but every table carries `tenant_id` and
// every query filters on it, so a second owner is a row rather than a
// migration. The tenant is resolved from the SESSION and never from the request
// body — a client-supplied tenant_id is the classic way a scoped app stops
// being scoped, so it is ignored wherever it appears.
// =====================================================

'use strict';

const DEFAULT_TENANT_ID = Number(process.env.SRCAF_TENANT_ID || 1);

function tenantFrom(req) {
  if (req.session && Number.isFinite(Number(req.session.tenant_id))) {
    return Number(req.session.tenant_id);
  }
  return DEFAULT_TENANT_ID;
}

// Attaches req.tenant_id and strips any caller-supplied one from the body, so a
// downstream handler cannot pick it up by accident.
function scopeTenant(req, _res, next) {
  req.tenant_id = tenantFrom(req);
  if (req.body && typeof req.body === 'object' && 'tenant_id' in req.body) {
    delete req.body.tenant_id;
  }
  return next();
}

module.exports = { scopeTenant, tenantFrom, DEFAULT_TENANT_ID };
