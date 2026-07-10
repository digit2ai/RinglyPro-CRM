'use strict';

/**
 * INTERNAL per-tenant unit-economics view (pricing decisions only).
 * Gated by LITE_ADMIN_KEY (header x-admin-key or ?key=). Never exposed to tenants.
 */
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Tenant, Call, Message, Appointment, Number } = require('../models');
const { callCost, callCostUnbundled, TARGET_PER_MIN } = require('../utils/cost');

function adminGate(req, res, next) {
  const key = process.env.LITE_ADMIN_KEY;
  const provided = req.headers['x-admin-key'] || req.query.key;
  if (!key) return res.status(503).json({ error: 'admin_key_not_configured' });
  if (provided !== key) return res.status(401).json({ error: 'unauthorized' });
  next();
}
router.use(adminGate);

// SMS segments per disposition (message = 1 owner SMS; appointment = 2: owner+caller).
function smsSegmentsFor(call) {
  if (call.disposition === 'appointment') return 2;
  if (call.disposition === 'message') return 1;
  return 0;
}

router.get('/tenant/:id', async (req, res) => {
  const tenantId = Number(req.params.id);
  const days = parseInt(req.query.days || '30', 10);
  const since = new Date(Date.now() - days * 86400000);
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) return res.status(404).json({ error: 'not_found' });

  const calls = await Call.findAll({ where: { tenant_id: tenantId, started_at: { [Op.gte]: since } } });
  const num = await Number.findOne({ where: { tenant_id: tenantId, status: 'active' } });

  let totalCogs = 0, totalMin = 0, totalUnbundled = 0;
  const perCall = calls.map(c => {
    const co = (tenant.country === 'CO');
    const withCountry = { ...c.toJSON(), country: tenant.country };
    const cost = callCost(withCountry, smsSegmentsFor(c));
    const unb = callCostUnbundled(withCountry, smsSegmentsFor(c));
    totalCogs += cost.total; totalMin += cost.minutes; totalUnbundled += unb.total;
    return { call_id: c.id, minutes: cost.minutes, disposition: c.disposition, cost: cost.total, per_minute: cost.perMinute };
  });

  const didMonthly = num ? Number(num.monthly_cost_usd || 0) : 0;
  const target = TARGET_PER_MIN();
  const perMin = totalMin > 0 ? totalCogs / totalMin : 0;
  const perMinUnbundled = totalMin > 0 ? totalUnbundled / totalMin : 0;

  res.json({
    tenant_id: tenantId,
    business_name: tenant.business_name,
    country: tenant.country,
    window_days: days,
    calls: calls.length,
    total_minutes: +totalMin.toFixed(2),
    did_monthly_usd: didMonthly,
    variable_cogs_usd: +totalCogs.toFixed(4),
    cogs_per_minute_usd: +perMin.toFixed(4),
    target_per_minute_usd: target,
    within_target: perMin > 0 ? perMin <= target : null,
    projected_unbundled_per_minute_usd: +perMinUnbundled.toFixed(4),
    projected_unbundled_within_target: perMinUnbundled > 0 ? perMinUnbundled <= target : null,
    per_call: perCall,
    note: 'v1 ConversationRelay path intentionally exceeds the $0.06 target; see docs/telephony-costs.md for the unbundled path under target.'
  });
});

// Fleet roll-up across all tenants.
router.get('/summary', async (req, res) => {
  const tenants = await Tenant.findAll();
  const out = [];
  for (const tnt of tenants) {
    const calls = await Call.findAll({ where: { tenant_id: tnt.id } });
    let cogs = 0, min = 0;
    for (const c of calls) {
      const cost = callCost({ ...c.toJSON(), country: tnt.country }, smsSegmentsFor(c));
      cogs += cost.total; min += cost.minutes;
    }
    out.push({ tenant_id: tnt.id, business_name: tnt.business_name, country: tnt.country, calls: calls.length, minutes: +min.toFixed(2), cogs: +cogs.toFixed(4), per_min: min > 0 ? +(cogs / min).toFixed(4) : 0 });
  }
  res.json({ target_per_minute_usd: TARGET_PER_MIN(), tenants: out });
});

module.exports = router;
