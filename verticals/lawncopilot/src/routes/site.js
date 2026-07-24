'use strict';

/**
 * The tenant's page content + share kit.
 * Mounted under /lawncopilot/:slug/api/v1/site — tenant already resolved.
 */

const express = require('express');
const router = express.Router();
const { SiteContent, ShortLink, Review } = require('../models');
const { tenantBaseUrl, shortLinkUrl } = require('../tenancy');
const { qrSvg } = require('../services/qr');

function requireStaff(req, res, next) {
  if (!req.staff) return res.status(401).json({ success: false, error: 'Not signed in' });
  next();
}

/** Public: what the page renders from. */
router.get('/content', async (req, res) => {
  const row = await SiteContent.findOne({
    where: { tenant_id: req.tenant_id, published: true },
    order: [['version', 'DESC']], raw: true
  });
  res.json({ success: true, content: (row && row.content) || req.tenant.brand || {}, version: row ? row.version : 0 });
});

/** Owner edits their page. Versioned and revertible. */
router.put('/content', requireStaff, async (req, res) => {
  const last = await SiteContent.findOne({
    where: { tenant_id: req.tenant_id }, order: [['version', 'DESC']], raw: true
  });
  const merged = { ...((last && last.content) || {}), ...(req.body.content || {}) };
  const row = await SiteContent.create({
    tenant_id: req.tenant_id,
    version: (last ? last.version : 0) + 1,
    content: merged, published: true, published_by: req.staff.id
  });
  res.json({ success: true, version: row.version, content: merged });
});

router.get('/versions', requireStaff, async (req, res) => {
  const rows = await SiteContent.findAll({
    where: { tenant_id: req.tenant_id }, order: [['version', 'DESC']], limit: 30, raw: true
  });
  res.json({ success: true, versions: rows.map(r => ({ version: r.version, at: r.created_at })) });
});

router.post('/revert/:version', requireStaff, async (req, res) => {
  const target = await SiteContent.findOne({
    where: { tenant_id: req.tenant_id, version: Number(req.params.version) }, raw: true
  });
  if (!target) return res.status(404).json({ success: false, error: 'No such version' });
  const last = await SiteContent.findOne({
    where: { tenant_id: req.tenant_id }, order: [['version', 'DESC']], raw: true
  });
  const row = await SiteContent.create({
    tenant_id: req.tenant_id, version: last.version + 1,
    content: target.content, published: true, published_by: req.staff.id
  });
  res.json({ success: true, version: row.version });
});

/**
 * The share kit — everything needed to put the link on a truck, a card, a
 * Google listing and a Facebook bio.
 */
router.get('/share-kit', requireStaff, async (req, res) => {
  const base = tenantBaseUrl(req.tenant, req);
  let link = await ShortLink.findOne({ where: { tenant_id: req.tenant_id, source: 'signup' }, raw: true });
  const shortUrl = link ? shortLinkUrl(link.code, req) : base;

  res.json({
    success: true,
    page_url: base,
    short_url: shortUrl,
    qr_svg_url: `/lawncopilot/${req.tenant.slug}/api/v1/site/qr.svg`,
    clicks: link ? link.clicks : 0,
    google_business_profile: {
      website_field: base,
      appointment_link_field: base,
      instructions: [
        'Open your Google Business Profile and choose Edit profile.',
        `Set the Website field to ${base}`,
        `Set the Appointment link to ${base}`,
        'Save. Customers tapping Website or Book now land on your page.'
      ]
    },
    share_text: `Get an instant lawn care price from ${req.tenant.name}: ${shortUrl}`
  });
});

/** Print-resolution QR for truck doors and yard signs. */
router.get('/qr.svg', async (req, res) => {
  const base = tenantBaseUrl(req.tenant, req);
  const link = await ShortLink.findOne({ where: { tenant_id: req.tenant_id, source: 'signup' }, raw: true });
  const url = link ? shortLinkUrl(link.code, req) : base;
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(qrSvg(url));
});

/** Public reviews for the page. */
router.get('/reviews', async (req, res) => {
  const rows = await Review.findAll({
    where: { tenant_id: req.tenant_id, status: 'left' },
    order: [['created_at', 'DESC']], limit: 20, raw: true
  });
  res.json({ success: true, reviews: rows });
});

module.exports = router;
