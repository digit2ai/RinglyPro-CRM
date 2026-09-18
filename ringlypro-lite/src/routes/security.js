'use strict';

/**
 * Security report + outbound lock control. Owner only (LITE_ADMIN_KEY in the
 * x-admin-key header). A missing or wrong key answers 404, not 401: this route
 * confirms nothing to someone who should not know it exists.
 *
 *   GET  /internal/security          guard, watch and webhook-signature state
 *   POST /internal/security/run      run one fraud-watch pass now
 *   POST /internal/security/unlock   lift an auto-lock after a person has looked
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const tollFraud = require('../security/tollFraud');
const fraudWatch = require('../security/fraudWatch');
const twilioSig = require('../security/twilioSignature');

function keyOk(req) {
  const key = process.env.LITE_ADMIN_KEY || '';
  const got = String(req.headers['x-admin-key'] || '');
  if (key.length < 16 || !got) return false;
  // Constant-time over digests, so the key's length does not leak.
  const a = crypto.createHash('sha256').update(key).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}
router.use((req, res, next) => (keyOk(req) ? next() : res.status(404).json({ error: 'not_found' })));

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  // Phones saved before the allow-list existed that it would now refuse: those
  // owners silently stop getting texts or transfers, so they are listed here
  // (tenant id and field only, never the number) for someone to fix.
  let stale = null;
  try {
    const { Tenant } = require('../models');
    const rows = await Tenant.findAll({ attributes: ['id', 'country', 'owner_phone', 'transfer_number'] });
    stale = [];
    for (const r of rows) for (const f of ['owner_phone', 'transfer_number']) {
      if (r[f] && !tollFraud.checkDestination(r[f], { defaultCountry: r.country }).ok) stale.push({ tenant_id: r.id, field: f });
    }
  } catch (e) { stale = { error: e.message }; }
  res.json({ outbound_guard: tollFraud.status(), fraud_watch: fraudWatch.status(), webhook_signature: twilioSig.status(),
    phones_now_refused: stale });
});

router.post('/run', async (req, res) => {
  try {
    const raised = await fraudWatch.runOnce(req.app.get('fraudWatchDeps')());
    res.json({ raised, fraud_watch: fraudWatch.status() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/unlock', (req, res) => {
  tollFraud.unlock();
  console.warn('[lite:security] outbound lock lifted by admin');
  res.json({ ok: true, outbound_guard: tollFraud.status() });
});

module.exports = router;
