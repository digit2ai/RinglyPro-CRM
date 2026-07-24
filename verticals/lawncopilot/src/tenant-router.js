'use strict';

/**
 * Everything that belongs to ONE landscaping company.
 *
 * Mounted at /lawncopilot/:slug behind tenantMiddleware, so req.tenant and
 * req.tenant_id are guaranteed present by the time anything here runs. No route
 * in this tree may read a tenant from anywhere else.
 */

const express = require('express');
const path = require('path');
const router = express.Router({ mergeParams: true });

const publicDir = path.join(__dirname, '..', 'public');

// ── Guard: a staff/customer session from company A must not act on company B.
// The cookie is global to the browser, so the tenant in the token is checked
// against the tenant in the URL on every request.
router.use((req, res, next) => {
  if (req.customer && req.customer.tenant_id !== req.tenant_id) req.customer = null;
  if (req.staff && req.staff.tenant_id !== req.tenant_id) req.staff = null;
  next();
});

// ── Tenant API ─────────────────────────────────────────────────────────────
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/api/v1/orb', require('./routes/orb'));
router.use('/api/v1/quote', require('./routes/quote'));
router.use('/api/v1/me', require('./routes/me'));
router.use('/api/v1/admin', require('./routes/admin'));
router.use('/api/v1/site', require('./routes/site'));
router.use('/api/v1/billing', require('./routes/billing'));

// The Brain, scoped to this company.
router.use('/mcp', require('./routes/mcp'));

// ── Tenant pages ───────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    company: req.tenant.name,
    slug: req.tenant.slug,
    tenant_id: req.tenant_id,
    plan: req.tenant.plan,
    tenant_status: req.tenant.status
  });
});

router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
router.get('/admin/login', (req, res) => res.sendFile(path.join(publicDir, 'admin-login.html')));
router.get('/quote/:token', (req, res) => res.sendFile(path.join(publicDir, 'quote.html')));

// Static asset (has a file extension) — never gated.
const ASSET = /\.[a-z0-9]{2,16}$/i;

// Customer portal
router.get(['/portal', '/portal/'], (req, res) => {
  if (!req.customer) return res.redirect(`/lawncopilot/${req.tenantSlug}/login`);
  res.sendFile(path.join(publicDir, 'portal', 'inicio.html'));
});
router.get('/portal/:page', (req, res, next) => {
  if (ASSET.test(req.params.page)) return next();
  if (!req.customer) return res.redirect(`/lawncopilot/${req.tenantSlug}/login`);
  const page = String(req.params.page).replace(/[^a-z0-9-]/gi, '');
  res.sendFile(path.join(publicDir, 'portal', `${page}.html`), (err) => { if (err) next(); });
});

// Tenant admin
router.get(['/admin', '/admin/'], (req, res) => {
  if (!req.staff) return res.redirect(`/lawncopilot/${req.tenantSlug}/admin/login`);
  res.sendFile(path.join(publicDir, 'admin', 'inicio.html'));
});
router.get('/admin/:page', (req, res, next) => {
  if (ASSET.test(req.params.page)) return next();
  const page = String(req.params.page).replace(/[^a-z0-9-]/gi, '');
  if (page === 'login') return res.sendFile(path.join(publicDir, 'admin-login.html'));
  if (!req.staff) return res.redirect(`/lawncopilot/${req.tenantSlug}/admin/login`);
  res.sendFile(path.join(publicDir, 'admin', `${page}.html`), (err) => { if (err) next(); });
});

// ── THE COMPANY'S PAGE — rendered per tenant, their real web presence ──────
const { renderTenantPage } = require('./services/site');

router.get('/', async (req, res, next) => {
  try {
    res.type('html').send(await renderTenantPage(req.tenant, req));
  } catch (e) { next(e); }
});

router.get('/:page', async (req, res, next) => {
  if (ASSET.test(req.params.page)) return next();
  const page = String(req.params.page).replace(/[^a-z0-9-]/gi, '');
  const KNOWN = ['services', 'areas', 'about', 'reviews', 'contact', 'faq', 'privacy', 'terms'];
  if (!KNOWN.includes(page)) return next();
  try {
    res.type('html').send(await renderTenantPage(req.tenant, req, page));
  } catch (e) { next(e); }
});

// Shared static (styles, orb.js, portal assets) resolves under the slug too.
router.use(express.static(publicDir));

module.exports = router;
