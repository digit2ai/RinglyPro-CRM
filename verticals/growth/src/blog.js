'use strict';

/**
 * Digit2AI Growth — PUBLIC blog renderer (crawlable, SEO-clean).
 *
 * Mounted at /blog on the main app. Host-aware: on a brand's custom domain
 * (e.g. orbup.app/blog) it shows THAT brand's posts. On the main domain it
 * falls back to ?brand=<slug> (default digit2ai). Server-rendered HTML with
 * proper <title>, meta description, canonical, and Article JSON-LD so Google
 * and AI answer engines can index and cite it.
 */

const express = require('express');
const router = express.Router();
const { Brand, Post } = require('./models');
const { escapeHtml } = require('./services/render');

function hostBrandName(host) { return (host || '').toLowerCase().replace(/^www\./, ''); }

// Resolve which brand this request's blog belongs to.
async function resolveBrand(req) {
  const host = hostBrandName(req.get('host'));
  const all = await Brand.findAll();
  // 1) custom domain match (orbup.app -> OrbUp)
  let brand = all.find(b => { try { return new URL(b.url).host.replace(/^www\./, '') === host; } catch { return false; } });
  // 2) main domain -> ?brand=slug, else Digit2AI
  if (!brand) {
    const slug = (req.query.brand || 'digit2ai').toLowerCase();
    brand = all.find(b => b.slug === slug) || all.find(b => b.slug === 'digit2ai') || all[0];
  }
  return brand;
}

function canonicalHost(req, brand) {
  const host = hostBrandName(req.get('host'));
  try { const bh = new URL(brand.url).host.replace(/^www\./, ''); if (bh === host) return `https://${bh}`; } catch {}
  return `https://${req.get('host')}`;
}

const SHELL = (brand, title, desc, canonical, bodyHtml, jsonLd) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc || '')}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc || '')}">
<meta property="og:type" content="article"><meta property="og:url" content="${escapeHtml(canonical)}">
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
<style>
  :root{--ink:#12151c;--mut:#5a6472;--line:#e6e9ef;--acc:#3257d6;--bg:#fff}
  @media(prefers-color-scheme:dark){:root{--ink:#e9edf5;--mut:#9aa4b6;--line:#232a38;--acc:#7aa0ff;--bg:#0d1017}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 Georgia,'Times New Roman',serif}
  .wrap{max-width:720px;margin:0 auto;padding:40px 22px 80px}
  header a{font:600 14px system-ui,sans-serif;color:var(--acc);text-decoration:none}
  h1{font:700 34px/1.2 system-ui,-apple-system,sans-serif;margin:22px 0 6px}
  .meta{color:var(--mut);font:14px system-ui,sans-serif;margin-bottom:28px}
  article h2{font:700 24px/1.3 system-ui,sans-serif;margin:34px 0 10px}
  article h3{font:700 19px/1.3 system-ui,sans-serif;margin:26px 0 8px}
  article p{margin:16px 0}
  article ul{margin:16px 0;padding-left:22px}
  article a{color:var(--acc)}
  .card{display:block;border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:14px 0;text-decoration:none;color:inherit}
  .card:hover{border-color:var(--acc)}
  .card h2{font:700 20px system-ui,sans-serif;margin:0 0 6px}
  .card p{color:var(--mut);font:15px system-ui,sans-serif;margin:0}
  footer{margin-top:60px;color:var(--mut);font:13px system-ui,sans-serif;border-top:1px solid var(--line);padding-top:18px}
</style></head>
<body><div class="wrap">
<header><a href="${escapeHtml(brand.url || '/')}">← ${escapeHtml(brand.name)}</a></header>
${bodyHtml}
<footer>${escapeHtml(brand.name)} — ${escapeHtml(brand.tagline || '')}</footer>
</div></body></html>`;

// ── Blog index ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const brand = await resolveBrand(req);
    if (!brand) return res.status(404).send('No blog configured.');
    const posts = await Post.findAll({
      where: { brand_id: brand.id, status: 'published' },
      order: [['published_at', 'DESC']], limit: 100
    });
    const list = posts.length
      ? posts.map(p => `<a class="card" href="/blog/${encodeURIComponent(p.slug)}${req.query.brand ? '?brand=' + brand.slug : ''}"><h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.meta_description || '')}</p></a>`).join('')
      : '<p style="color:var(--mut);font-family:system-ui">No posts yet.</p>';
    const canonical = canonicalHost(req, brand) + '/blog';
    res.set('Content-Type', 'text/html; charset=utf-8').set('X-Growth-Blog', '1')
      .send(SHELL(brand, `${brand.name} — Blog`, `Latest from ${brand.name}. ${brand.tagline || ''}`, canonical,
        `<h1>${escapeHtml(brand.name)} Blog</h1><div class="meta">${brand.tagline ? escapeHtml(brand.tagline) : ''}</div>${list}`, ''));
  } catch (e) { res.status(500).send('Blog error'); }
});

// ── Single post ─────────────────────────────────────────────────────────────
router.get('/:slug', async (req, res) => {
  try {
    const brand = await resolveBrand(req);
    if (!brand) return res.status(404).send('Not found');
    const post = await Post.findOne({ where: { brand_id: brand.id, slug: req.params.slug, status: 'published' } });
    if (!post) return res.status(404).send(SHELL(brand, 'Not found', '', canonicalHost(req, brand) + '/blog', '<h1>Not found</h1><p><a href="/blog">Back to blog</a></p>', ''));
    post.update({ views: (post.views || 0) + 1 }).catch(() => {});
    const canonical = `${canonicalHost(req, brand)}/blog/${post.slug}`;
    const dateStr = (post.published_at || post.created_at || new Date()).toISOString();
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article', headline: post.title,
      description: post.meta_description, datePublished: dateStr, author: { '@type': 'Organization', name: brand.name },
      publisher: { '@type': 'Organization', name: brand.name }, mainEntityOfPage: canonical
    });
    const body = `<h1>${escapeHtml(post.title)}</h1>
<div class="meta">${escapeHtml(brand.name)} · ${new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
<article>${post.html || ''}</article>
<p style="font-family:system-ui;margin-top:36px"><a href="/blog${req.query.brand ? '?brand=' + brand.slug : ''}">← All posts</a></p>`;
    res.set('Content-Type', 'text/html; charset=utf-8').set('X-Growth-Blog', '1')
      .send(SHELL(brand, `${post.title} — ${brand.name}`, post.meta_description, canonical, body, jsonLd));
  } catch (e) { res.status(500).send('Blog error'); }
});

module.exports = router;
