'use strict';

/**
 * Short links — how the slug travels.
 *
 * lawncopilot.com/l/ab12cd goes on truck doors, yard signs, business cards and
 * into the Google Business Profile. Every hit is counted so the Marketer and
 * the Controller can tell the owner which channel actually brings work.
 */

const express = require('express');
const router = express.Router();
const { ShortLink, Tenant } = require('../models');

router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!code) return res.redirect(require('../tenancy').basePath(req) + '/');

  const link = await ShortLink.findOne({ where: { code } });
  if (!link) return res.redirect(require('../tenancy').basePath(req) + '/');

  // Count it, but never let analytics block the redirect.
  ShortLink.update(
    { clicks: (link.clicks || 0) + 1, last_clicked_at: new Date() },
    { where: { id: link.id } }
  ).catch(() => {});

  let target = link.target;
  if (!target) {
    const t = await Tenant.findByPk(link.tenant_id, { raw: true });
    target = t ? `/lawncopilot/${t.slug}` : '/lawncopilot/';
  }
  const src = req.query.s ? `?src=${encodeURIComponent(String(req.query.s).slice(0, 24))}` : '';
  res.redirect(302, target + src);
});

module.exports = router;
