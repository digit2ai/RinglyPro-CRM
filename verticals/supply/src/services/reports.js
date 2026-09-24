'use strict';

/** Tenant dashboard + reports. Every figure is a count or sum of real rows; nothing is estimated. */

const db = require('../db');
const { localDate } = require('../util');

async function dashboard(tenant) {
  const T = tenant.id;
  const today = localDate(tenant.timezone);
  const k = await db.tone(T, `SELECT
    (SELECT count(*) FROM sup_campaigns WHERE tenant_id = :tenant AND status = 'active')::int AS active_campaigns,
    (SELECT count(*) FROM sup_calls WHERE tenant_id = :tenant AND direction = 'outbound' AND (started_at AT TIME ZONE :tz)::date = :d::date)::int AS outbound_today,
    (SELECT count(*) FROM sup_calls WHERE tenant_id = :tenant AND status = 'completed' AND outcome IS NOT NULL AND outcome NOT IN ('no_answer','voicemail'))::int AS connected,
    (SELECT count(*) FROM sup_calls WHERE tenant_id = :tenant AND status = 'completed')::int AS completed_calls,
    (SELECT count(*) FROM sup_contractors WHERE tenant_id = :tenant AND interest_level IN ('high','medium'))::int AS interested,
    (SELECT count(*) FROM sup_buyers WHERE tenant_id = :tenant AND status = 'open')::int AS potential_buyers,
    (SELECT count(*) FROM sup_calls WHERE tenant_id = :tenant AND direction = 'inbound')::int AS callbacks,
    (SELECT count(*) FROM sup_transfers WHERE tenant_id = :tenant)::int AS transfers,
    (SELECT count(*) FROM sup_contractors WHERE tenant_id = :tenant AND stage IN ('quote_requested','quote_sent'))::int AS quotes,
    (SELECT count(*) FROM sup_sales WHERE tenant_id = :tenant)::int AS sales,
    (SELECT COALESCE(sum(sale_amount),0) FROM sup_sales WHERE tenant_id = :tenant)::float AS revenue,
    (SELECT count(*) FROM sup_buyers WHERE tenant_id = :tenant)::int AS buyers_all`, { tz: tenant.timezone, d: today });
  k.conversion_rate = k.buyers_all ? Number(((k.sales / k.buyers_all) * 100).toFixed(1)) : null;
  k.connect_rate = k.completed_calls ? Number(((k.connected / k.completed_calls) * 100).toFixed(1)) : null;
  const topProducts = await db.tq(T, `SELECT p.id, p.name, count(DISTINCT b.id)::int AS buyers, COALESCE(sum(s.sale_amount),0)::float AS revenue
    FROM sup_products p LEFT JOIN sup_buyers b ON b.product_id = p.id AND b.tenant_id = p.tenant_id LEFT JOIN sup_sales s ON s.product_id = p.id AND s.tenant_id = p.tenant_id
    WHERE p.tenant_id = :tenant GROUP BY p.id HAVING count(b.id) > 0 OR sum(s.sale_amount) > 0 ORDER BY revenue DESC, buyers DESC LIMIT 5`);
  const topCategories = await db.tq(T, `SELECT cat.name, count(DISTINCT b.id)::int AS buyers FROM sup_buyers b JOIN sup_contractors c ON c.id = b.contractor_id AND c.tenant_id = b.tenant_id
    JOIN sup_categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id WHERE b.tenant_id = :tenant GROUP BY cat.name ORDER BY buyers DESC LIMIT 5`);
  const bestCampaigns = await db.tq(T, `SELECT cp.id, cp.campaign_name, cp.status,
      (SELECT count(*) FROM sup_calls k WHERE k.tenant_id = :tenant AND k.campaign_id = cp.id)::int AS calls,
      (SELECT count(*) FROM sup_buyers b WHERE b.tenant_id = :tenant AND b.campaign_id = cp.id)::int AS buyers,
      (SELECT COALESCE(sum(s.sale_amount),0) FROM sup_sales s WHERE s.tenant_id = :tenant AND s.campaign_id = cp.id)::float AS revenue
    FROM sup_campaigns cp WHERE cp.tenant_id = :tenant ORDER BY revenue DESC, buyers DESC LIMIT 5`);
  const inventory = await db.tq(T, `SELECT id, name, quantity_available, unit, COALESCE(promotional_price, selling_price)::float AS price,
      (COALESCE(quantity_available,0) * COALESCE(promotional_price, selling_price, 0))::float AS stock_value
    FROM sup_products WHERE tenant_id = :tenant AND active AND COALESCE(quantity_available,0) > 0
      AND id NOT IN (SELECT (jsonb_array_elements_text(product_ids))::int FROM sup_campaigns WHERE tenant_id = :tenant AND status IN ('active','approved','pending_approval'))
    ORDER BY stock_value DESC LIMIT 5`);
  const advantages = await db.tq(T, `SELECT DISTINCT ON (cp.product_id) cp.product_id, p.name, c.name AS competitor, cp.competitor_price::float, cp.savings_percentage::float, cp.date_checked, cp.match_confidence::float
    FROM sup_competitor_prices cp JOIN sup_products p ON p.id = cp.product_id AND p.tenant_id = cp.tenant_id JOIN sup_competitors c ON c.id = cp.competitor_id AND c.tenant_id = cp.tenant_id
    WHERE cp.tenant_id = :tenant AND cp.verified AND cp.savings_percentage > 0 ORDER BY cp.product_id, cp.savings_percentage DESC LIMIT 5`);
  const health = await db.tone(T, `SELECT ok, last_error, last_checked_at FROM sup_integration_health WHERE tenant_id = :tenant AND provider = 'gohighlevel'`);
  return { kpis: k, top_products: topProducts, top_categories: topCategories, best_campaigns: bestCampaigns, inventory_opportunities: inventory, price_advantages: advantages, ghl: health };
}

async function campaignReport(tenantId) {
  return db.tq(tenantId, `SELECT cp.id, cp.campaign_name, cp.status,
      (SELECT count(*) FROM sup_campaign_targets t WHERE t.tenant_id = :tenant AND t.campaign_id = cp.id)::int AS targets,
      (SELECT count(*) FROM sup_calls k WHERE k.tenant_id = :tenant AND k.campaign_id = cp.id AND k.direction = 'outbound')::int AS outbound_calls,
      (SELECT count(*) FROM sup_calls k WHERE k.tenant_id = :tenant AND k.campaign_id = cp.id AND k.outcome IS NOT NULL AND k.outcome NOT IN ('no_answer','voicemail'))::int AS connected,
      (SELECT count(*) FROM sup_buyers b WHERE b.tenant_id = :tenant AND b.campaign_id = cp.id)::int AS buyers,
      (SELECT count(*) FROM sup_transfers x WHERE x.tenant_id = :tenant AND x.campaign_id = cp.id)::int AS transfers,
      (SELECT count(*) FROM sup_sales s WHERE s.tenant_id = :tenant AND s.campaign_id = cp.id)::int AS sales,
      (SELECT COALESCE(sum(s.sale_amount),0) FROM sup_sales s WHERE s.tenant_id = :tenant AND s.campaign_id = cp.id)::float AS revenue,
      (SELECT COALESCE(sum(cm.commission_amount),0) FROM sup_commissions cm WHERE cm.tenant_id = :tenant AND cm.campaign_id = cp.id)::float AS commissions
    FROM sup_campaigns cp WHERE cp.tenant_id = :tenant ORDER BY cp.id DESC`);
}

async function auditLog(tenantId) {
  return db.tq(tenantId, `SELECT a.*, u.email AS actor_email FROM sup_audit a LEFT JOIN sup_users u ON u.id = a.actor_id WHERE a.tenant_id = :tenant ORDER BY a.id DESC LIMIT 300`);
}

module.exports = { dashboard, campaignReport, auditLog };
