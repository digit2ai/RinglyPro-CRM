/**
 * WordPress-as-System-of-Record routes for a chamber.
 * Mounted by unified-chamber/index.js at /:chamber_slug/api/wp/*.
 *
 * Admin surface (Bearer token + chamber admin):
 *   GET    /wp/config   read connection settings (secrets masked, never returned)
 *   PUT    /wp/config   update settings; blank secret keeps the stored one
 *   POST   /wp/test     connectivity probe -- fetches and normalizes, writes nothing
 *   POST   /wp/sync     reconcile; { dry_run: true } returns the plan only
 *   GET    /wp/runs     recent sync runs (audit)
 *
 * Machine surface (no Bearer token -- authenticated by HMAC against the
 * per-chamber shared secret):
 *   POST   /wp/webhook  near-real-time single-member upsert from WordPress
 *   GET    /wp/sso      signed login handoff from WordPress into the dashboard
 */
'use strict';

const express = require('express');
const { sequelize, QueryTypes, signToken, authMiddleware, requireAdmin } = require('./lib/shared');
const wp = require('../../services/chamberWpSync');

const router = express.Router();

// =====================================================================
// ADMIN
// =====================================================================
router.get('/config', authMiddleware, requireAdmin, async (req, res) => {
  try {
    return res.json({ success: true, data: wp.publicConfig(req.chamber) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/config', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const cfg = await wp.saveConfig(req.chamber_id, req.chamber, req.body || {});
    // Re-read so the response reflects exactly what was persisted.
    const [row] = await sequelize.query(
      `SELECT id, slug, theme_config, owner_member_id FROM chambers WHERE id = :id`,
      { replacements: { id: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: wp.publicConfig(row || { theme_config: { wp_sync: cfg } }) });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Connectivity probe. Fetches the roster and shows what CamaraVirtual would
// read, without touching the members table -- the safe first step.
router.post('/test', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const cfg = wp.readConfig(req.chamber);
    if (!cfg.site_url) return res.status(400).json({ success: false, error: 'site_url is not configured' });
    const raw = await wp.fetchRoster(cfg);
    const sample = raw.slice(0, 3).map(r => wp.normalizeRecord(r));
    return res.json({
      success: true,
      data: {
        mode: cfg.mode, site_url: cfg.site_url, fetched: raw.length,
        sample, wp_owned_fields: wp.WP_OWNED_FIELDS
      }
    });
  } catch (err) {
    return res.status(502).json({ success: false, error: err.message });
  }
});

router.post('/sync', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [chamber] = await sequelize.query(
      `SELECT id, slug, theme_config, owner_member_id FROM chambers WHERE id = :id`,
      { replacements: { id: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const dryRun = req.body && (req.body.dry_run === true || req.body.dry_run === 'true');
    const summary = await wp.syncChamber(chamber, { dryRun });
    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error('[/wp/sync]', err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
});

router.get('/runs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await wp.ensureTables();
    const runs = await sequelize.query(
      `SELECT id, dry_run, ok, fetched, created, updated, deactivated, skipped,
              error, started_at, finished_at
       FROM chamber_wp_sync_runs WHERE chamber_id = :c
       ORDER BY id DESC LIMIT 20`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: runs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// WEBHOOK -- WordPress pushes a single member on save/delete
// =====================================================================
// Authenticated by HMAC over `timestamp + "." + event + "." + email` using the
// chamber's shared secret. No Bearer token: WordPress has no chamber session.
router.post('/webhook', async (req, res) => {
  try {
    const cfg = wp.readConfig(req.chamber);
    if (!cfg.enabled) return res.status(403).json({ success: false, error: 'WordPress sync is not enabled for this chamber' });

    const body = req.body || {};
    const event = String(body.event || '').trim();
    const member = body.member || {};
    const email = String(member.email || '').trim().toLowerCase();
    if (!event || !email) return res.status(400).json({ success: false, error: 'event and member.email are required' });

    const check = wp.verifyWebhook(
      cfg, `${event}.${email}`,
      req.get('X-CV-Signature'), req.get('X-CV-Timestamp')
    );
    if (!check.ok) return res.status(401).json({ success: false, error: check.error });

    await wp.ensureTables();
    const rec = wp.normalizeRecord(member);

    if (event === 'user.deleted' || rec.active === false) {
      const [r] = await sequelize.query(
        `UPDATE members SET status = 'inactive', updated_at = NOW()
         WHERE chamber_id = :c AND LOWER(email) = :e AND status = 'active'
         RETURNING id`,
        { replacements: { c: req.chamber_id, e: email }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: { action: r ? 'deactivated' : 'noop', email } });
    }

    // Upsert. Only WP-owned columns are written -- trust, roles and access
    // level stay whatever CamaraVirtual has them set to.
    const cols = wp.WP_OWNED_FIELDS;
    const [existing] = await sequelize.query(
      `SELECT id FROM members WHERE chamber_id = :c AND LOWER(email) = :e`,
      { replacements: { c: req.chamber_id, e: email }, type: QueryTypes.SELECT }
    );

    if (existing) {
      const sets = cols.map(f => f === 'languages' ? `${f} = :${f}::text[]` : `${f} = :${f}`);
      await sequelize.query(
        `UPDATE members SET ${sets.join(', ')}, status = 'active', updated_at = NOW()
         WHERE chamber_id = :c AND id = :id`,
        { replacements: Object.assign({ c: req.chamber_id, id: existing.id }, pickCols(rec, cols)) }
      );
      await linkIfPossible(req.chamber_id, existing.id, rec.external_id);
      return res.json({ success: true, data: { action: 'updated', email, member_id: existing.id } });
    }

    const crypto = require('crypto');
    const { bcrypt } = require('./lib/shared');
    const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const [row] = await sequelize.query(
      `INSERT INTO members
        (chamber_id, email, password_hash, first_name, last_name, company_name, phone,
         country, sector, sub_specialty, years_experience, languages, bio,
         linkedin_url, website_url, membership_type, status, created_at, updated_at)
       VALUES (:c, :email, :ph, :first_name, :last_name, :company_name, :phone,
         :country, :sector, :sub_specialty, :years_experience, :languages::text[], :bio,
         :linkedin_url, :website_url, :membership_type, 'active', NOW(), NOW())
       ON CONFLICT (chamber_id, email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      {
        replacements: Object.assign({ c: req.chamber_id, ph: unusable }, rec, {
          languages: wp.pgArray(rec.languages)
        }),
        type: QueryTypes.SELECT
      }
    );
    if (row && row.id) await linkIfPossible(req.chamber_id, row.id, rec.external_id);
    return res.json({ success: true, data: { action: 'created', email, member_id: row && row.id } });
  } catch (err) {
    console.error('[/wp/webhook]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

function pickCols(rec, cols) {
  const out = {};
  for (const f of cols) out[f] = f === 'languages' ? wp.pgArray(rec[f]) : rec[f];
  return out;
}

async function linkIfPossible(chamberId, memberId, externalId) {
  if (!externalId) return;
  try {
    await sequelize.query(
      `INSERT INTO chamber_wp_links (chamber_id, member_id, external_id, source, last_synced_at)
       VALUES (:c, :m, :e, 'wordpress', NOW())
       ON CONFLICT (chamber_id, member_id)
       DO UPDATE SET external_id = EXCLUDED.external_id, last_synced_at = NOW()`,
      { replacements: { c: chamberId, m: memberId, e: String(externalId).slice(0, 120) } }
    );
  } catch (e) { /* provenance is best-effort; the member row is what matters */ }
}

// =====================================================================
// SSO -- signed login handoff from WordPress
// =====================================================================
// WordPress mints a short-lived HMAC token for the logged-in user and links
// the member to /cv-105/api/wp/sso?token=... This route verifies it, mints the
// normal chamber JWT, and hands it to the dashboard the same way a password
// login would. Members created by sync have an unusable password hash, so this
// (or the existing forgot-password flow) is how they get in.
router.get('/sso', async (req, res) => {
  const slug = req.chamber.slug;
  const fail = (msg, code) => res.status(code || 401)
    .type('html')
    .send(errorPage(msg, `/${slug}/login`));

  try {
    const cfg = wp.readConfig(req.chamber);
    if (!cfg.enabled) return fail('WordPress sync is not enabled for this chamber', 403);

    const check = wp.verifySsoToken(cfg, req.query.token);
    if (!check.ok) return fail(check.error, 401);

    const [member] = await sequelize.query(
      `SELECT id, email, first_name, last_name, membership_type, governance_role, access_level, status
       FROM members WHERE chamber_id = :c AND LOWER(email) = :e`,
      { replacements: { c: req.chamber_id, e: check.email }, type: QueryTypes.SELECT }
    );
    if (!member) return fail('No member in this chamber matches that account. Run a sync first.', 404);
    if (member.status !== 'active') return fail(`This membership is ${member.status}.`, 403);

    const token = signToken({
      member_id: member.id, chamber_id: req.chamber_id, chamber_slug: slug,
      email: member.email,
      access_level: member.access_level || 'member',
      governance_role: member.governance_role || 'member'
    });
    await sequelize.query(`UPDATE members SET last_active_at = NOW() WHERE id = :id`, { replacements: { id: member.id } });

    // Only same-site relative paths -- a caller-supplied absolute URL here
    // would be an open redirect that leaks the freshly minted session token.
    let dest = String(req.query.redirect || `/${slug}/dashboard/`);
    if (!dest.startsWith('/') || dest.startsWith('//')) dest = `/${slug}/dashboard/`;

    // The dashboard reads localStorage['cv_<slug>_token'] (see
    // public/dashboard/index.html). Hand the JWT over in a tiny page rather
    // than in the URL so it never lands in history or a Referer header.
    return res.type('html').send(handoffPage(slug, token, dest));
  } catch (err) {
    console.error('[/wp/sso]', err.message);
    return fail('Sign-in failed.', 500);
  }
});

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function handoffPage(slug, token, dest) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Iniciando sesion...</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;
align-items:center;justify-content:center;min-height:100vh;margin:0;color:#14213d}</style></head>
<body><p>Iniciando sesion...</p>
<script>
(function(){
  try {
    localStorage.setItem(${JSON.stringify('cv_' + slug + '_token')}, ${JSON.stringify(token)});
    localStorage.removeItem('hispamind_token');
  } catch (e) {}
  location.replace(${JSON.stringify(dest)});
})();
</script></body></html>`;
}

function errorPage(msg, loginUrl) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>No se pudo iniciar sesion</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;
align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;color:#14213d;text-align:center}
a{color:#1d4ed8}</style></head><body><div><h1 style="font-size:20px">No se pudo iniciar sesion</h1>
<p>${esc(msg)}</p><p><a href="${esc(loginUrl)}">Ir al inicio de sesion</a></p></div></body></html>`;
}

module.exports = router;
