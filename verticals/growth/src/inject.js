'use strict';

/**
 * Digit2AI Growth — universal "Blog" link injector.
 *
 * The SEO fix #1 (a visible Blog link on the landing) applied to EVERY managed
 * brand with zero per-page edits. For a request whose Host matches a blog-enabled
 * brand, we hook res.send and, if the returned HTML has no /blog link yet, inject
 * a small fixed "Blog" pill before </body>. Gated hard: non-brand hosts (the whole
 * main CRM) never install the hook, so there is zero overhead/risk there.
 *
 * Static-file landings (res.sendFile) bypass res.send — those are flagged by the
 * site audit instead; generated landings (res.send'd HTML, e.g. orbup.app) get the
 * link automatically.
 */

const { brandForHostSync } = require('./services/hosts');

const PILL = () => `<a href="/blog" aria-label="Blog" style="position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#3257d6;color:#fff;font:600 14px/1 system-ui,-apple-system,sans-serif;padding:11px 17px;border-radius:24px;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.28)">Blog</a>`;

module.exports = function blogLinkInjector(req, res, next) {
  if (req.method !== 'GET') return next();
  const p = req.path || '';
  if (p.startsWith('/api') || p.startsWith('/blog') || /\.[a-z0-9]{2,5}$/i.test(p)) return next();

  const host = (req.get('host') || '').toLowerCase().replace(/^www\./, '');
  const brand = brandForHostSync(host);
  if (!brand || brand.blog_enabled === false) return next(); // not a managed brand host → untouched

  const origSend = res.send.bind(res);
  res.send = function (body) {
    try {
      const ct = res.get('Content-Type') || '';
      if (typeof body === 'string' && /html/i.test(ct || 'text/html')
        && /<\/body>/i.test(body) && !/href=["']\/blog/i.test(body)) {
        body = body.replace(/<\/body>/i, PILL() + '</body>');
      }
    } catch (e) { /* never break the page */ }
    return origSend(body);
  };
  next();
};
