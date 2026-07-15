'use strict';
// Row-level tenant scoping helper. Every read/write must pass the caller's tenant_id.
// Keeps the discipline explicit so no route accidentally omits the filter.
function tenantScope(req) {
  const t = req.tenantId;
  if (typeof t === 'undefined' || t === null) {
    throw new Error('tenant context missing — requireAuth must run first');
  }
  return t;
}
module.exports = { tenantScope };
