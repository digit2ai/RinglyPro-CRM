/**
 * Unified Chamber Router
 *
 * Mounted at /:chamber_slug/api/* by src/app.js (after resolveChamberFromSlug
 * middleware). Every handler scopes queries by req.chamber_id.
 *
 * This is the new entrypoint for chambers using the unified schema
 * (cv-101+ and migrated cv-1/2/3). Legacy /chamber/<prefix>/api/* routes
 * stay live for backwards compatibility until cutover.
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.CHAMBER_JWT_SECRET || 'chamber-multitenant-secret-change-me';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.chamber_id !== req.chamber_id) {
      return res.status(403).json({ success: false, error: 'Token does not match this chamber' });
    }
    req.member = decoded;
    req.member.id = decoded.member_id;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// =====================================================================
// PUBLIC -- chamber landing info (no auth)
// =====================================================================
router.get('/public/info', async (req, res) => {
  try {
    const chamber = req.chamber;
    const [{ count: memberCount }] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM members WHERE chamber_id = :c AND status = 'active'`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const projects = await sequelize.query(
      `SELECT id, title, sector, plan_status, created_at
       FROM projects
       WHERE chamber_id = :c AND visibility = 'public_plan'
       ORDER BY created_at DESC LIMIT 3`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const rfqs = await sequelize.query(
      `SELECT id, title, sector, budget_range, deadline
       FROM rfqs
       WHERE chamber_id = :c AND status = 'open'
       ORDER BY created_at DESC LIMIT 3`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const sectors = await sequelize.query(
      `SELECT sector, COUNT(*) AS count FROM members
       WHERE chamber_id = :c AND status = 'active' AND sector IS NOT NULL
       GROUP BY sector ORDER BY count DESC LIMIT 8`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({
      success: true,
      data: {
        slug: chamber.slug,
        name: chamber.name,
        brand_domain: chamber.brand_domain,
        primary_language: chamber.primary_language,
        country: chamber.country,
        logo_url: chamber.logo_url,
        member_count: parseInt(memberCount),
        recent_projects: projects,
        open_rfqs: rfqs,
        top_sectors: sectors
      }
    });
  } catch (err) {
    console.error('[/public/info]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// AUTH
// =====================================================================
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'email and password required' });
    const [member] = await sequelize.query(
      `SELECT id, email, password_hash, first_name, last_name, membership_type, governance_role, access_level, status
       FROM members WHERE chamber_id = :c AND email = :email`,
      { replacements: { c: req.chamber_id, email: email.toLowerCase() }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    if (member.status === 'deleted' || member.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Account ' + member.status });
    }
    const ok = await bcrypt.compare(password, member.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = signToken({
      member_id: member.id,
      chamber_id: req.chamber_id,
      chamber_slug: req.chamber.slug,
      email: member.email,
      access_level: member.access_level || 'member',
      governance_role: member.governance_role || 'member'
    });

    // Update last_active_at
    await sequelize.query(`UPDATE members SET last_active_at = NOW() WHERE id = :id`, { replacements: { id: member.id } });

    return res.json({
      success: true,
      data: {
        token,
        member: {
          id: member.id,
          email: member.email,
          first_name: member.first_name,
          last_name: member.last_name,
          membership_type: member.membership_type,
          governance_role: member.governance_role,
          access_level: member.access_level
        },
        chamber: {
          slug: req.chamber.slug,
          name: req.chamber.name,
          primary_language: req.chamber.primary_language
        }
      }
    });
  } catch (err) {
    console.error('[/auth/login]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/auth/signup-member', async (req, res) => {
  try {
    const { email, password, first_name, last_name, country, sector, company_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ success: false, error: 'email, password, first_name, last_name required' });
    }
    const [existing] = await sequelize.query(
      `SELECT id FROM members WHERE chamber_id = :c AND email = :email`,
      { replacements: { c: req.chamber_id, email: email.toLowerCase() }, type: QueryTypes.SELECT }
    );
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered in this chamber' });
    const hash = await bcrypt.hash(password, 10);
    const [row] = await sequelize.query(
      `INSERT INTO members (chamber_id, email, password_hash, first_name, last_name, country, sector, company_name,
                            membership_type, governance_role, access_level, verification_level, status, trust_score, created_at, updated_at)
       VALUES (:c, :email, :hash, :fn, :ln, :country, :sector, :company, 'individual', 'member', 'member', 'email', 'active', 0.7, NOW(), NOW())
       RETURNING id, email, first_name, last_name, membership_type, access_level`,
      {
        replacements: {
          c: req.chamber_id, email: email.toLowerCase(), hash, fn: first_name, ln: last_name,
          country: country || null, sector: sector || null, company: company_name || null
        },
        type: QueryTypes.SELECT
      }
    );
    const token = signToken({
      member_id: row.id, chamber_id: req.chamber_id, chamber_slug: req.chamber.slug,
      email: row.email, access_level: 'member', governance_role: 'member'
    });
    return res.status(201).json({
      success: true,
      data: { token, member: row, chamber: { slug: req.chamber.slug, name: req.chamber.name } }
    });
  } catch (err) {
    console.error('[/auth/signup-member]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const [member] = await sequelize.query(
      `SELECT m.id, m.chamber_id, m.email, m.first_name, m.last_name, m.country, m.region_id,
              m.sector, m.sub_specialty, m.years_experience, m.languages, m.company_name,
              m.membership_type, m.governance_role, m.access_level, m.bio, m.phone,
              m.linkedin_url, m.website_url, m.trust_score, m.verified, m.verification_level,
              m.status, m.created_at,
              r.name AS region_name
       FROM members m LEFT JOIN regions r ON r.id = m.region_id
       WHERE m.chamber_id = :c AND m.id = :id`,
      { replacements: { c: req.chamber_id, id: req.member.id }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({
      success: true,
      data: member,
      chamber: { slug: req.chamber.slug, name: req.chamber.name, primary_language: req.chamber.primary_language }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// MEMBERS (list + get)
// =====================================================================
router.get('/members', authMiddleware, async (req, res) => {
  try {
    const { sector, country, region_id, search, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = ['m.chamber_id = :c', `m.status = 'active'`];
    const replacements = { c: req.chamber_id, limit: parseInt(limit), offset };
    if (sector) { conditions.push('m.sector = :sector'); replacements.sector = sector; }
    if (country) { conditions.push('m.country = :country'); replacements.country = country; }
    if (region_id) { conditions.push('m.region_id = :region_id'); replacements.region_id = parseInt(region_id); }
    if (search) {
      conditions.push("(m.first_name ILIKE :search OR m.last_name ILIKE :search OR m.email ILIKE :search OR m.company_name ILIKE :search)");
      replacements.search = `%${search}%`;
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const members = await sequelize.query(
      `SELECT m.id, m.email, m.first_name, m.last_name, m.country, m.region_id, m.sector, m.sub_specialty,
              m.years_experience, m.languages, m.company_name, m.membership_type, m.governance_role,
              m.access_level, m.bio, m.linkedin_url, m.website_url, m.trust_score, m.verified,
              m.verification_level, m.created_at, r.name AS region_name
       FROM members m LEFT JOIN regions r ON r.id = m.region_id ${where}
       ORDER BY m.last_name, m.first_name LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { members, pagination: { page: parseInt(page), limit: parseInt(limit) } } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/members/:id', authMiddleware, async (req, res) => {
  try {
    const [member] = await sequelize.query(
      `SELECT id, email, first_name, last_name, country, region_id, sector, sub_specialty,
              years_experience, languages, company_name, membership_type, governance_role,
              access_level, bio, phone, linkedin_url, website_url, trust_score, verified,
              verification_level, status, created_at
       FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({ success: true, data: member });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// PROJECTS (list + get)
// =====================================================================
router.get('/projects', authMiddleware, async (req, res) => {
  try {
    const { plan_status, sector, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = ['p.chamber_id = :c', `(p.visibility != 'archived' AND (p.plan_status NOT IN ('draft') OR p.proposer_member_id = :me))`];
    const replacements = { c: req.chamber_id, me: req.member.id, limit: parseInt(limit), offset };
    if (plan_status) { conditions.push('p.plan_status = :plan_status'); replacements.plan_status = plan_status; }
    if (sector) { conditions.push('p.sector = :sector'); replacements.sector = sector; }
    const where = 'WHERE ' + conditions.join(' AND ');
    const projects = await sequelize.query(
      `SELECT p.id, p.title, p.description, p.sector, p.countries, p.plan_status, p.visibility,
              p.budget_min, p.budget_est, p.budget_max, p.timeline_min_months, p.timeline_est_months,
              p.timeline_max_months, p.recruitment_deadline, p.recruitment_closed_at, p.recruitment_closed_by,
              p.monte_carlo_result, p.proposer_member_id, p.created_at,
              m.first_name || ' ' || m.last_name AS proposer_name,
              (p.proposer_member_id = :me) AS is_mine
       FROM projects p LEFT JOIN members m ON m.id = p.proposer_member_id
       ${where}
       ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { projects } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// REGIONS
// =====================================================================
router.get('/regions', authMiddleware, async (req, res) => {
  try {
    const regions = await sequelize.query(
      `SELECT r.*, (SELECT COUNT(*) FROM members m WHERE m.region_id = r.id AND m.status = 'active') AS member_count
       FROM regions r WHERE r.chamber_id = :c ORDER BY r.id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: regions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
