'use strict';

/**
 * Company signup — a landscaper goes from a form to a live, quotable page.
 * Platform-level: no tenant in context yet, because we are creating one.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { provisionTenant, PLAN_LIMITS, PLAN_ORDER } = require('../services/provision');
const { isSlugAvailable, suggestSlug } = require('../tenancy');
const { notify } = require('../services/notify');
const { User } = require('../models');

const SECRET = () => process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';
const COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000, path: '/' };

// ── Rate limit signups per IP ──────────────────────────────────────────────
const buckets = new Map();
router.use((req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || 'x').split(',')[0].trim();
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, reset: now + 3600000 };
  if (now > b.reset) { b.n = 0; b.reset = now + 3600000; }
  b.n++; buckets.set(ip, b);
  if (b.n > 20) return res.status(429).json({ success: false, error: 'Too many attempts. Try again later.' });
  next();
});

/**
 * The pricing table. The landing page renders from this rather than hardcoding
 * numbers in markup, so a price change is one edit in provision.js.
 */
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    trial_days: Number(process.env.LAWNCOPILOT_TRIAL_DAYS || 14),
    currency: 'USD',
    plans: PLAN_ORDER.map(id => {
      const p = PLAN_LIMITS[id];
      return {
        id,
        label: p.label,
        tagline: p.tagline,
        price_cents: p.price_cents,
        price_display: `$${Math.round(p.price_cents / 100)}`,
        period: 'month',
        popular: !!p.popular,
        highlights: p.highlights,
        limits: {
          crews: p.crews >= 999 ? 'Unlimited' : p.crews,
          employees: p.employees >= 999 ? 'Unlimited' : p.employees
        },
        includes: {
          payroll: p.payroll, marketing: p.marketing, controller: p.controller
        }
      };
    })
  });
});

/** Live availability check as they type. */
router.get('/slug-available', async (req, res) => {
  const r = await isSlugAvailable(req.query.slug);
  res.json({
    success: true,
    available: r.ok,
    slug: r.slug || null,
    error: r.ok ? null : r.error,
    preview: r.slug ? `/lawncopilot/${r.slug}` : null
  });
});

router.get('/suggest-slug', (req, res) => {
  res.json({ success: true, slug: suggestSlug(req.query.company_name) });
});

/**
 * Create the company. One transaction — a partly-built company is worse than
 * a failed signup.
 */
router.post('/', async (req, res) => {
  const b = req.body || {};
  const r = await provisionTenant({
    company_name: b.company_name,
    slug: b.slug || suggestSlug(b.company_name),
    owner_name: b.owner_name,
    owner_email: b.owner_email,
    owner_phone: b.owner_phone,
    password: b.password,
    state: b.state || 'FL',
    counties: b.counties,
    crew_count: b.crew_count,
    plan: b.plan
  });

  if (!r.success) return res.status(400).json(r);

  // Sign them straight into their own office.
  const owner = await User.findOne({
    where: { tenant_id: r.tenant_id, role: 'owner' }, raw: true
  });
  if (owner) {
    res.cookie('lawncopilot_staff', jwt.sign(
      { id: owner.id, tenant_id: r.tenant_id, email: owner.email, role: 'owner', kind: 'staff' },
      SECRET(), { expiresIn: '30d' }
    ), COOKIE);
  }

  await notify({
    tenant_id: r.tenant_id,
    channel: 'email',
    template: 'account_registration',
    to: b.owner_email,
    vars: {
      name: b.owner_name || b.company_name,
      portal_url: (process.env.LAWNCOPILOT_BASE_DOMAIN || 'https://aiagent.ringlypro.com') + r.admin_url
    }
  });

  res.json({
    ...r,
    message: 'Your company is live.',
    next: r.admin_url
  });
});

module.exports = router;
