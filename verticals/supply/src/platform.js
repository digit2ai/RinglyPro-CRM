'use strict';

/**
 * Super admin view. COUNTS AND MONEY PER TENANT, NEVER A CONTRACTOR'S NAME,
 * PHONE OR CALL CONTENT: the platform operator has no business reading one
 * supplier's customer list, and a screen that shows it is a screen that leaks
 * it. To act inside a tenant the super admin uses "enter tenant", which is
 * audited in that tenant's log.
 */

const db = require('./db');

async function overview() {
  const tenants = await db.q(`SELECT t.id, t.name, t.slug, t.status, t.is_demo, t.created_at, t.billing,
      (t.ghl->>'source') AS ghl_source,
      (SELECT count(*) FROM sup_users u WHERE u.tenant_id = t.id)::int AS users,
      (SELECT count(*) FROM sup_products p WHERE p.tenant_id = t.id)::int AS products,
      (SELECT count(*) FROM sup_contractors c WHERE c.tenant_id = t.id)::int AS contractors,
      (SELECT count(*) FROM sup_campaigns c WHERE c.tenant_id = t.id AND c.status = 'active')::int AS active_campaigns,
      (SELECT count(*) FROM sup_calls k WHERE k.tenant_id = t.id)::int AS calls,
      (SELECT count(*) FROM sup_calls k WHERE k.tenant_id = t.id AND k.started_at > now() - interval '30 days')::int AS calls_30d,
      (SELECT count(*) FROM sup_buyers b WHERE b.tenant_id = t.id)::int AS potential_buyers,
      (SELECT COALESCE(sum(s.sale_amount),0) FROM sup_sales s WHERE s.tenant_id = t.id)::float AS sales,
      (SELECT count(*) FROM sup_webhook_events w WHERE w.tenant_id = t.id AND w.status = 'failed')::int AS failed_events,
      h.ok AS ghl_ok, h.last_error AS ghl_error, h.last_checked_at AS ghl_checked_at
    FROM sup_tenants t LEFT JOIN sup_integration_health h ON h.tenant_id = t.id AND h.provider = 'gohighlevel'
    ORDER BY t.id`);
  const totals = tenants.reduce((a, t) => {
    a.tenants++; if (t.status === 'active') a.active++; if (t.status === 'trial') a.trial++;
    a.calls += t.calls; a.potential_buyers += t.potential_buyers; a.sales += t.sales; a.failed_events += t.failed_events;
    return a;
  }, { tenants: 0, active: 0, trial: 0, calls: 0, potential_buyers: 0, sales: 0, failed_events: 0 });
  const errors = await db.q(`SELECT w.tenant_id, t.name AS tenant, w.event_type, left(w.error, 300) AS error, w.attempts, w.created_at FROM sup_webhook_events w
    JOIN sup_tenants t ON t.id = w.tenant_id WHERE w.status = 'failed' ORDER BY w.id DESC LIMIT 30`);
  return { totals, tenants, errors };
}

module.exports = { overview };
