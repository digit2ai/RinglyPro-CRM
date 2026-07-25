'use strict';

/**
 * Digit2AI Growth — universal sitemap.xml + robots.txt (SEO fixes #2 and #3).
 *
 * Host-aware and gated to managed brand hosts: on a brand's domain it serves a
 * sitemap of the homepage + /blog + every published post, and a robots.txt that
 * points at it. On any non-brand host it calls next() so the main app's own
 * behavior is untouched. Auto-updates the moment you publish a post.
 */

const express = require('express');
const router = express.Router();
const { Post } = require('./models');
const hostsCache = require('./services/hosts');
const { brandForHostSync } = hostsCache;

// Temporary diagnostics: what does the host cache think this domain is?
router.get('/__seo_debug', async (req, res) => {
  const host = (req.get('host') || '').toLowerCase().replace(/^www\./, '');
  await hostsCache.refresh();
  res.json({ host, managed: !!hostsCache.brandForHostSync(host), cache: hostsCache.dump() });
});

function xmlEscape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

router.get('/sitemap.xml', async (req, res, next) => {
  const host = (req.get('host') || '').toLowerCase().replace(/^www\./, '');
  const brand = brandForHostSync(host);
  if (!brand) return next();
  try {
    const base = `https://${host}`;
    const posts = await Post.findAll({ where: { brand_id: brand.id, status: 'published' }, order: [['published_at', 'DESC']], limit: 5000, raw: true });
    const urls = [
      { loc: base + '/', pri: '1.0' },
      { loc: base + '/blog', pri: '0.8' },
      ...posts.map(p => ({ loc: `${base}/blog/${encodeURIComponent(p.slug)}`, pri: '0.7', lastmod: (p.published_at || p.updated_at || new Date()).toISOString().slice(0, 10) }))
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map(u => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.pri}</priority></url>`).join('\n') +
      `\n</urlset>\n`;
    res.set('Content-Type', 'application/xml; charset=utf-8').send(body);
  } catch (e) { next(); }
});

router.get('/robots.txt', (req, res, next) => {
  const host = (req.get('host') || '').toLowerCase().replace(/^www\./, '');
  const brand = brandForHostSync(host);
  if (!brand) return next();
  res.set('Content-Type', 'text/plain; charset=utf-8')
    .send(`User-agent: *\nAllow: /\nSitemap: https://${host}/sitemap.xml\n`);
});

module.exports = router;
