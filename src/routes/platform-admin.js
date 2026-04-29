/**
 * Platform Admin API
 *
 * Mounted at /api/platform/* by src/app.js. This is a CROSS-chamber surface
 * for the operator (digit2ai) so they can see and jump into every chamber's
 * dashboard from a single page.
 *
 * Authentication: an email + password that matches a 'superadmin' member row
 * in ANY chamber. Issues a separate JWT (platform_admin=true) signed with the
 * same CHAMBER_JWT_SECRET so we don't introduce a new key.
 *
 * Endpoints:
 *   POST /platform/admin/login   -- email + password -> platform admin token
 *   GET  /platform/admin/me      -- echoes back the token claims
 *   GET  /platform/admin/chambers -- every row in chambers + member_count
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const router = express.Router();
const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.CHAMBER_JWT_SECRET || 'chamber-multitenant-secret-change-me';
const JWT_EXPIRY = '12h';

function platformAdminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.platform_admin) {
      return res.status(403).json({ success: false, error: 'Platform admin token required' });
    }
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// POST /platform/admin/login
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password required' });
    }
    const lowerEmail = String(email).toLowerCase().trim();

    // Find every member row across all chambers with this email + superadmin
    // access_level. We compare passwords against the FIRST one whose hash
    // matches.
    const candidates = await sequelize.query(
      `SELECT m.id, m.chamber_id, m.email, m.password_hash, m.first_name, m.last_name,
              m.access_level, c.slug AS chamber_slug, c.name AS chamber_name
       FROM members m JOIN chambers c ON c.id = m.chamber_id
       WHERE m.email = :email AND m.access_level = 'superadmin' AND m.status = 'active'`,
      { replacements: { email: lowerEmail }, type: QueryTypes.SELECT }
    );
    if (candidates.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials or no platform-admin access' });
    }

    let matched = null;
    for (const c of candidates) {
      if (!c.password_hash) continue;
      // eslint-disable-next-line no-await-in-loop
      const ok = await bcrypt.compare(password, c.password_hash);
      if (ok) { matched = c; break; }
    }
    if (!matched) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        platform_admin: true,
        email: matched.email,
        first_name: matched.first_name,
        last_name: matched.last_name,
        // The chamber where this admin row originated (we just record it for
        // audit purposes -- platform admin claims are not chamber-scoped).
        origin_chamber_id: matched.chamber_id,
        origin_chamber_slug: matched.chamber_slug
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.json({
      success: true,
      data: {
        token,
        admin: {
          email: matched.email,
          first_name: matched.first_name,
          last_name: matched.last_name,
          origin_chamber: { slug: matched.chamber_slug, name: matched.chamber_name }
        }
      }
    });
  } catch (err) {
    console.error('[/platform/admin/login]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /platform/admin/me
router.get('/admin/me', platformAdminAuth, async (req, res) => {
  return res.json({ success: true, data: req.admin });
});

// PUT /platform/admin/chambers/:id -- edit chamber metadata
router.put('/admin/chambers/:id', platformAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid chamber id' });

    const allowed = ['name', 'brand_domain', 'primary_language', 'country',
                     'logo_url', 'contact_email', 'status', 'subscription_status'];
    const VALID_STATUS = ['pending', 'active', 'suspended', 'archived'];
    const VALID_LANG = ['es', 'en'];

    const sets = []; const r = { id };
    for (const k of allowed) {
      if (!(k in req.body)) continue;
      let v = req.body[k];
      if (typeof v === 'string') v = v.trim();
      if (v === '' ) v = null;
      if (k === 'status' && v && !VALID_STATUS.includes(v)) {
        return res.status(400).json({ success: false, error: `status must be one of ${VALID_STATUS.join(', ')}` });
      }
      if (k === 'primary_language' && v && !VALID_LANG.includes(v)) {
        return res.status(400).json({ success: false, error: `primary_language must be one of ${VALID_LANG.join(', ')}` });
      }
      sets.push(`${k} = :${k}`);
      r[k] = v;
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push('updated_at = NOW()');

    const [updated] = await sequelize.query(
      `UPDATE chambers SET ${sets.join(', ')} WHERE id = :id RETURNING *`,
      { replacements: r, type: QueryTypes.SELECT }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Chamber not found' });

    // Invalidate the resolver cache so the change shows up immediately on
    // /<slug>/* requests without a 60s wait.
    try {
      const { invalidateCache } = require('../../chamber-template/lib/chamber-resolver');
      invalidateCache(updated.slug);
    } catch (_) {}

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[/platform/admin/chambers PUT]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /platform/admin/chambers -- every chamber with member counts
router.get('/admin/chambers', platformAdminAuth, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT c.id, c.slug, c.name, c.brand_domain, c.primary_language, c.country,
              c.status, c.subscription_status, c.logo_url, c.created_at,
              (SELECT COUNT(*) FROM members m WHERE m.chamber_id = c.id) AS member_count,
              (SELECT COUNT(*) FROM members m WHERE m.chamber_id = c.id AND m.status = 'active') AS active_member_count,
              (SELECT COUNT(*) FROM projects p WHERE p.chamber_id = c.id) AS project_count
       FROM chambers c
       ORDER BY c.id`,
      { type: QueryTypes.SELECT }
    );
    return res.json({
      success: true,
      data: {
        chambers: rows.map(r => ({
          ...r,
          member_count: parseInt(r.member_count) || 0,
          active_member_count: parseInt(r.active_member_count) || 0,
          project_count: parseInt(r.project_count) || 0,
          dashboard_url: `/${r.slug}/dashboard/`,
          landing_url: `/${r.slug}`
        })),
        total: rows.length
      }
    });
  } catch (err) {
    console.error('[/platform/admin/chambers]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
