'use strict';

/**
 * Digit2AI Growth — site SEO audit + auto-ensure-blog.
 *
 * When you click SEO on a brand, this fetches the brand's live landing page and
 * checks the three SEO connections:
 *   1) a visible /blog link on the landing
 *   2) /blog responds (our renderer -> X-Growth-Blog header)
 *   3) /sitemap.xml and /robots.txt respond
 * It detects whether the domain even routes to THIS app (served_by_app). If the
 * domain routes here, enabling the brand auto-wires the injector + sitemap +
 * robots (no code edit). If it does not, it reports honestly what to do (point
 * DNS here, or add a blog on that platform) — it never claims a fix it can't make.
 */

const { Brand } = require('../models');

async function head(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    const text = await r.text().catch(() => '');
    return { status: r.status, ok: r.ok, headers: r.headers, text };
  } catch (e) { return { status: 0, ok: false, headers: new Map(), text: '', error: e.message }; }
  finally { clearTimeout(t); }
}

function hostOf(url) { try { return new URL(url).host; } catch { return null; } }

async function auditBrand(brandId, ownerId) {
  const brand = await Brand.findOne({ where: { id: brandId, owner_id: ownerId } });
  if (!brand) throw new Error('Brand not found');
  const base = (brand.url || '').replace(/\/+$/, '');
  const host = hostOf(base);
  const findings = [];

  const landing = base ? await head(base) : { status: 0, text: '' };
  const blog = host ? await head(`https://${host}/blog`) : { status: 0 };
  const sitemap = host ? await head(`https://${host}/sitemap.xml`) : { status: 0 };
  const robots = host ? await head(`https://${host}/robots.txt`) : { status: 0 };

  const blogHdr = blog.headers && (blog.headers.get ? blog.headers.get('x-growth-blog') : null);
  const served_by_app = blog.status === 200 && (blogHdr === '1' || /Growth blog|OrbUp Blog|— Blog<\/title>/i.test(blog.text || ''));
  const has_blog_link = /href=["']?[^"'>]*\/blog/i.test(landing.text || '');
  const sitemap_ok = sitemap.status === 200;
  const robots_ok = robots.status === 200 && /sitemap/i.test(robots.text || '');

  if (!served_by_app) findings.push(`El dominio ${host || '(sin URL)'} no parece enrutar a esta app (blog HTTP ${blog.status}). Apunta el DNS aqui o agrega el blog en su plataforma para automatizar.`);
  if (served_by_app && !has_blog_link) findings.push('La landing no enlaza a /blog. Se activo el enlace "Blog" automatico (pill flotante) para que Google y visitantes lo encuentren.');
  if (served_by_app && has_blog_link) findings.push('La landing ya enlaza al blog. Correcto.');
  if (!sitemap_ok) findings.push('sitemap.xml no responde en el dominio (se sirve automatico al enrutar aqui + blog activo).');
  else findings.push('sitemap.xml activo.');
  if (!robots_ok) findings.push('robots.txt no apunta a un sitemap (se sirve automatico al enrutar aqui + blog activo).');
  else findings.push('robots.txt activo y apunta al sitemap.');

  return {
    host, served_by_app, has_blog_link, blog_ok: blog.status === 200, sitemap_ok, robots_ok,
    landing_status: landing.status, findings
  };
}

/**
 * Ensure the blog is wired for a brand: mark served_by_app, enable blog (so the
 * injector + sitemap + robots activate), and return an audit-finding summary the
 * caller persists as an SEO draft ("post the finding").
 */
async function ensureBlog(brandId, ownerId) {
  const brand = await Brand.findOne({ where: { id: brandId, owner_id: ownerId } });
  if (!brand) throw new Error('Brand not found');
  const a = await auditBrand(brandId, ownerId);
  await brand.update({ blog_enabled: true, served_by_app: a.served_by_app });

  const status = a.served_by_app
    ? 'Blog listo y enlazado. Enlace "Blog", sitemap.xml y robots.txt activos en el dominio.'
    : 'El dominio aun no enruta a esta app: publica igual (visible en aiagent.ringlypro.com/blog?brand=' + brand.slug + '), y apunta el DNS aqui para el blog nativo.';

  const body = [
    `Auditoria SEO de ${brand.name} (${a.host || 'sin dominio'})`,
    '',
    `- Enrutado a esta app: ${a.served_by_app ? 'si' : 'no'}`,
    `- Enlace a /blog en la landing: ${a.has_blog_link ? 'si' : (a.served_by_app ? 'agregado automatico' : 'no')}`,
    `- /blog responde: ${a.blog_ok ? 'si' : 'no'}`,
    `- sitemap.xml: ${a.sitemap_ok ? 'si' : 'pendiente'}`,
    `- robots.txt: ${a.robots_ok ? 'si' : 'pendiente'}`,
    '',
    'Notas:',
    ...a.findings.map(f => `- ${f}`),
    '',
    status
  ].join('\n');

  return { audit: a, title: `SEO readiness: ${brand.name}`, body, served_by_app: a.served_by_app };
}

module.exports = { auditBrand, ensureBlog };
