'use strict';

/**
 * Onboarding: provision a Lite DID for the tenant + generate carrier
 * forwarding codes. Colombia guard: never assign a US DID to a CO tenant.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { Tenant, Number } = require('../models');
const { getProvider } = require('../telephony');
const { codesFor, carriers } = require('../services/forwardingCodes');
const { canProvisionNumber } = require('../services/entitlement');

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

    // Card-required gate: don't burn a Twilio DID on a card-free signup that may
    // never convert. A number is only provisioned once payment is on file.
    if (!canProvisionNumber(tenant)) {
      return res.status(402).json({
        success: false,
        error: 'payment_required',
        message: 'Add a payment method to activate your number. Your 7-day free trial starts with $0 charged today.'
      });
    }

    // Isolation guard: DID country MUST match tenant country.
    const country = tenant.country || 'US';
    const provider = getProvider();

    // Colombia regulatory blocker: local DIDs require an in-country address
    // bundle (see docs/telephony-costs.md). Gate provisioning behind a flag.
    if (country === 'CO' && process.env.LITE_CO_NUMBERS_ENABLED !== '1') {
      return res.status(422).json({
        success: false,
        error: 'co_numbers_gated',
        message: 'Colombia local numbers require a verified in-country address bundle (Twilio/Telnyx). Complete the regulatory bundle, then set LITE_CO_NUMBERS_ENABLED=1.'
      });
    }

    const bought = await provider.buyNumber({ country, areaCode: req.body && req.body.area_code, tenantId: tenant.id });
    num = await Number.create({
      tenant_id: tenant.id, did: bought.did, country, provider: bought.provider,
      provider_sid: bought.providerSid, status: 'active', monthly_cost_usd: bought.monthlyCostUsd
    });
    res.status(201).json({ success: true, number: num });
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

module.exports = router;
