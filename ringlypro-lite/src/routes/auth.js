'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { Tenant, User, AvailabilityRule } = require('../models');
const auth = require('../middleware/auth');

const TRIAL_DAYS = parseInt(process.env.LITE_TRIAL_DAYS || '7', 10);

// Self-serve signup: creates tenant (7-day trial) + owner login + default hours.
router.post('/register', async (req, res) => {
  try {
    const { business_name, owner_name, email, password, owner_phone, country, locale, timezone } = req.body || {};
    if (!business_name || !email || !password) {
      return res.status(400).json({ error: 'business_name, email, password required' });
    }
    const existing = await User.findOne({ where: { email: String(email).toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'email_in_use' });

    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400000);
    const tenant = await Tenant.create({
      business_name,
      owner_name: owner_name || null,
      owner_phone: owner_phone || null,
      owner_email: String(email).toLowerCase(),
      country: (country || 'US').toUpperCase().slice(0, 2),
      locale: (locale || 'en').toLowerCase().slice(0, 2),
      timezone: timezone || (country === 'CO' ? 'America/Bogota' : 'America/New_York'),
      subscription_status: 'trialing',
      trial_ends_at: trialEnds
    });
    const user = await User.create({
      tenant_id: tenant.id,
      email: String(email).toLowerCase(),
      password_hash: await bcrypt.hash(password, 10),
      name: owner_name || null
    });
    // Seed a sensible Mon–Fri 9–17 availability template.
    for (let wd = 1; wd <= 5; wd++) {
      await AvailabilityRule.create({
        tenant_id: tenant.id, weekday: wd, start: '09:00', end: '17:00',
        slot_minutes: 30, timezone: tenant.timezone
      });
    }
    const token = auth.sign({ user_id: user.id, tenant_id: tenant.id, email: user.email, name: user.name });
    auth.setCookie(res, token);
    res.status(201).json({ success: true, token, tenant_id: tenant.id, trial_ends_at: trialEnds });
  } catch (e) {
    console.error('[lite:auth] register error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ where: { email: String(email || '').toLowerCase() } });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    const ok = await bcrypt.compare(password || '', user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    const token = auth.sign({ user_id: user.id, tenant_id: user.tenant_id, email: user.email, name: user.name });
    auth.setCookie(res, token);
    res.json({ success: true, token, tenant_id: user.tenant_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => { auth.clearCookie(res); res.json({ success: true }); });

router.get('/me', auth.requireAuth, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });
  res.json({ user: req.user, tenant });
});

module.exports = router;
