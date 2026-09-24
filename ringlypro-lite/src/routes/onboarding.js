'use strict';

/**
 * Onboarding: provision a Lite DID for the tenant + generate carrier
 * forwarding codes. Colombia guard: never assign a US DID to a CO tenant.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { Tenant, Number } = require('../models');
const { getProvider, getNumberProvider } = require('../telephony');
const { codesFor, carriers } = require('../services/forwardingCodes');
const { canProvisionNumber } = require('../services/entitlement');
const { Op } = require('sequelize');
const tollFraud = require('../security/tollFraud');
const provisioning = require('../services/provisioning');

// NUMBER-PURCHASE CIRCUIT BREAKER. The 2026-08-06 attack began by BUYING a
// number. Our own buy path is card-gated and one-per-tenant, but a burst of
// paid signups (stolen cards) could still buy numbers in a loop. More than a
// handful a day is not growth, it is abuse, so purchases stop and say why.
// Counted from the database, so it holds across instances and restarts.
const MAX_NUMBERS_PER_DAY = Math.max(0, parseInt(process.env.LITE_MAX_NUMBERS_PER_DAY || '5', 10) || 0);


/**
 * EVERY GUARD BEFORE A NUMBER IS BOUGHT, IN ONE PLACE.
 *
 * These four checks lived inline in /provision-number, and when /resume was
 * added it called provisioning directly and inherited none of them: signup is
 * open and unverified, so N free accounts could have bought N numbers and
 * emptied a hand-stocked sub-account pool. That defeats the purchase circuit
 * breaker written for the 2026-08-06 toll-fraud incident. It is a function now,
 * and `provisioning.provision()` calls it too, so a future third caller cannot
 * miss it by being written somewhere else.
 *
 * @returns {null|{status:number,body:object}} null = allowed
 */
async function mayProvision(tenant) {
  if (!canProvisionNumber(tenant)) {
    return { status: 402, body: { success: false, error: 'payment_required',
      message: 'Add a payment method to activate your number. Your 7-day free trial starts with $0 charged today.' } };
  }
  const country = tenant.country || 'US';
  if (country === 'CO' && process.env.LITE_CO_NUMBERS_ENABLED !== '1') {
    return { status: 422, body: { success: false, error: 'co_numbers_gated',
      message: 'Colombia local numbers require a verified in-country address bundle (Twilio/Telnyx). Complete the regulatory bundle, then set LITE_CO_NUMBERS_ENABLED=1.' } };
  }
  if (tollFraud.lockState()) {
    return { status: 503, body: { success: false, error: 'outbound_locked',
      message: 'Number activation is paused while a security check runs. Please try again later.' } };
  }
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const boughtToday = await Number.count({ where: { created_at: { [Op.gte]: since } } });
  if (boughtToday >= MAX_NUMBERS_PER_DAY) {
    console.error(`[lite:security] number purchase refused: ${boughtToday} bought in 24h (cap ${MAX_NUMBERS_PER_DAY})`);
    return { status: 429, body: { success: false, error: 'purchase_cap_reached',
      message: 'We have paused new number activations for today. Please try again tomorrow or contact support.' } };
  }
  return null;
}

// List carriers for a country (drives the onboarding dropdown).
router.get('/carriers', requireAuth, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  res.json({ country: tenant.country, carriers: carriers(tenant.country) });
});

// Provision (or return existing) Lite DID for this tenant.
router.post('/provision-number', requireAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });

    let num = await Number.findOne({ where: { tenant_id: tenant.id, status: 'active' } });
    if (num) return res.json({ success: true, already: true, number: num });

    const refusal = await mayProvision(tenant);
    if (refusal) return res.status(refusal.status).json(refusal.body);

    // Isolation guard: DID country MUST match tenant country.
    const country = tenant.country || 'US';
    const provider = getNumberProvider();

    // THE WHOLE SETUP, NOT JUST A NUMBER. On the HighLevel path this claims the
    // tenant's own sub-account, buys the number, creates their calendar and
    // builds their agent on it — every step resumable, none repeatable by
    // accident (see services/provisioning.js). The Twilio path is unchanged.
    if (provider.name === 'ghl') {
      const out = await provisioning.provision(tenant, { areaCode: req.body && req.body.area_code });
      num = await Number.findOne({ where: { tenant_id: tenant.id, status: 'active' } });
      return res.status(201).json({
        success: true, number: num, provider: 'ghl',
        setup_step: out.state, agent_ready: out.agent_ready, calendar_ready: out.calendar_ready,
      });
    }

    const bought = await provider.buyNumber({ country, areaCode: req.body && req.body.area_code, tenantId: tenant.id, tenant });
    num = await Number.create({
      tenant_id: tenant.id, did: bought.did, country, provider: bought.provider,
      provider_sid: bought.providerSid, status: 'active', monthly_cost_usd: bought.monthlyCostUsd
    });
    res.status(201).json({ success: true, number: num, provider: bought.provider });
  } catch (e) {
    console.error('[lite:onboarding] provision error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get forwarding dial codes for the tenant's DID + selected carrier.
router.get('/forwarding-codes', requireAuth, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  const num = await Number.findOne({ where: { tenant_id: tenant.id, status: 'active' } });
  if (!num) return res.status(404).json({ error: 'no_number', message: 'Provision a number first.' });
  const carrier = req.query.carrier;
  const mode = req.query.mode === 'direct' ? 'direct' : 'noanswer';
  const rings = req.query.rings || 2;
  const codes = codesFor({ country: tenant.country, carrier, did: num.did, mode, rings });
  res.json({
    did: num.did,
    country: tenant.country,
    mode,
    codes,
    warning: tenant.country === 'CO'
      ? 'La llamada reenviada se cobra a su plan móvil. Su número Lite es local de Colombia para mantener la llamada nacional.'
      : null,
    reminder: tenant.country === 'CO'
      ? `Eliminar la app NO desactiva el reenvío. Marque ${codes.deactivate} desde su teléfono para desactivarlo.`
      : `Deleting the app does NOT remove forwarding. Dial ${codes.deactivate} from your phone to stop it.`
  });
});

/**
 * Resume a setup that stopped partway. Provisioning is resumable by design, so
 * a transient HighLevel failure is a retry rather than a support ticket — and
 * because every step is recorded on the tenant, the retry never re-buys.
 */
router.post('/resume', requireAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });
    if (getNumberProvider().name !== 'ghl') return res.status(400).json({ error: 'not_applicable' });
    const refusal = await mayProvision(tenant);
    if (refusal) return res.status(refusal.status).json(refusal.body);
    const out = await provisioning.provision(tenant);
    res.json({ success: true, ...out });
  } catch (e) {
    res.status(500).json({ success: false, error: e.code || 'provision_failed', message: e.message, state: e.state });
  }
});

/** What the client's dashboard shows about their own setup. No platform names. */
router.get('/status', requireAuth, async (req, res) => {
  try { res.json(await provisioning.clientView(req.tenantId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.mayProvision = mayProvision;
