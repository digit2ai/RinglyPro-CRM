/**
 * Unified core router: public info, auth, members, regions, exchange,
 * metrics, payments, admin, match. Preserves the previous unified-chamber.js
 * surface and adds admin write paths.
 */
const express = require('express');
const { sequelize, QueryTypes, bcrypt, signToken, authMiddleware, requireAdmin } = require('./lib/shared');

const router = express.Router();

// =====================================================================
// PUBLIC -- chamber landing info
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
       FROM projects WHERE chamber_id = :c AND visibility = 'public_plan'
       ORDER BY created_at DESC LIMIT 3`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const rfqs = await sequelize.query(
      `SELECT id, title, sector, budget_range, deadline
       FROM rfqs WHERE chamber_id = :c AND status = 'open'
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
        slug: chamber.slug, name: chamber.name, brand_domain: chamber.brand_domain,
        primary_language: chamber.primary_language, country: chamber.country,
        logo_url: chamber.logo_url, member_count: parseInt(memberCount),
        recent_projects: projects, open_rfqs: rfqs, top_sectors: sectors
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
      member_id: member.id, chamber_id: req.chamber_id, chamber_slug: req.chamber.slug,
      email: member.email,
      access_level: member.access_level || 'member',
      governance_role: member.governance_role || 'member'
    });
    await sequelize.query(`UPDATE members SET last_active_at = NOW() WHERE id = :id`, { replacements: { id: member.id } });

    return res.json({
      success: true,
      data: {
        token,
        member: {
          id: member.id, email: member.email,
          first_name: member.first_name, last_name: member.last_name,
          membership_type: member.membership_type,
          governance_role: member.governance_role,
          access_level: member.access_level
        },
        chamber: { slug: req.chamber.slug, name: req.chamber.name, primary_language: req.chamber.primary_language }
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
       VALUES (:c, :email, :hash, :fn, :ln, :country, :sector, :company,
               'individual', 'member', 'member', 'email', 'active', 0.7, NOW(), NOW())
       RETURNING id, email, first_name, last_name, membership_type, access_level`,
      {
        replacements: {
          c: req.chamber_id, email: email.toLowerCase(), hash,
          fn: first_name, ln: last_name,
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
      success: true, data: member,
      chamber: { slug: req.chamber.slug, name: req.chamber.name, primary_language: req.chamber.primary_language }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// MEMBERS
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

// PUT /members/:id -- self profile update OR admin/superadmin can update anyone in their chamber
router.put('/members/:id', authMiddleware, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const isSelf = targetId === req.member.id;
    const isAdmin = ['superadmin', 'admin_global', 'admin_regional'].includes(req.member.access_level);
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Cannot edit other members' });
    }
    const [exists] = await sequelize.query(
      `SELECT id FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: targetId }, type: QueryTypes.SELECT }
    );
    if (!exists) return res.status(404).json({ success: false, error: 'Member not found' });

    const allowed = ['first_name', 'last_name', 'country', 'region_id', 'sector', 'sub_specialty',
                     'years_experience', 'languages', 'company_name', 'bio', 'phone',
                     'linkedin_url', 'website_url'];
    if (isAdmin) allowed.push('membership_type', 'governance_role', 'verified', 'verification_level');
    const sets = []; const r = { c: req.chamber_id, id: targetId };
    for (const k of allowed) {
      if (k in req.body) { sets.push(`${k} = :${k}`); r[k] = req.body[k]; }
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    const [updated] = await sequelize.query(
      `UPDATE members SET ${sets.join(', ')} WHERE chamber_id = :c AND id = :id RETURNING *`,
      { replacements: r, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: updated });
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
      `SELECT r.*,
        (SELECT COUNT(*) FROM members m
         WHERE m.chamber_id = :c AND m.region_id = r.id AND m.status = 'active') AS member_count
       FROM regions r WHERE r.chamber_id = :c ORDER BY r.id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: regions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// EXCHANGE
// =====================================================================
router.get('/exchange/companies', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const companies = await sequelize.query(
      `SELECT c.*, m.first_name || ' ' || m.last_name AS owner_name
       FROM companies c LEFT JOIN members m ON m.id = c.owner_member_id
       WHERE c.chamber_id = :c ORDER BY c.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { companies, pagination: { total: companies.length } } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/exchange/rfqs', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rfqs = await sequelize.query(
      `SELECT r.*, m.first_name || ' ' || m.last_name AS requester_name, co.name AS company_name
       FROM rfqs r LEFT JOIN members m ON m.id = r.requester_member_id
       LEFT JOIN companies co ON co.id = r.company_id
       WHERE r.chamber_id = :c ORDER BY r.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { rfqs, pagination: { total: rfqs.length } } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/exchange/opportunities', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const opportunities = await sequelize.query(
      `SELECT o.*, m.first_name || ' ' || m.last_name AS posted_by_name
       FROM opportunities o LEFT JOIN members m ON m.id = o.posted_by_member_id
       WHERE o.chamber_id = :c ORDER BY o.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { opportunities, pagination: { total: opportunities.length } } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// =====================================================================
// METRICS
// =====================================================================
router.get('/metrics/dashboard', authMiddleware, async (req, res) => {
  try {
    const [counts] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM members WHERE chamber_id = :c AND status = 'active') AS members,
         (SELECT COUNT(*) FROM projects WHERE chamber_id = :c AND status NOT IN ('completed','cancelled')) AS active_projects,
         (SELECT COUNT(*) FROM companies WHERE chamber_id = :c) AS companies,
         (SELECT COUNT(*) FROM rfqs WHERE chamber_id = :c AND status = 'open') AS open_rfqs,
         (SELECT COUNT(*) FROM opportunities WHERE chamber_id = :c AND status = 'active') AS opportunities,
         (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE chamber_id = :c AND status = 'completed') AS total_revenue`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const membersByRegion = await sequelize.query(
      `SELECT r.name, COUNT(m.id) AS count
       FROM regions r LEFT JOIN members m
         ON m.region_id = r.id AND m.chamber_id = r.chamber_id AND m.status = 'active'
       WHERE r.chamber_id = :c
       GROUP BY r.id, r.name ORDER BY r.id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const membersByType = await sequelize.query(
      `SELECT membership_type, COUNT(*) AS count FROM members
       WHERE chamber_id = :c AND status = 'active'
       GROUP BY membership_type ORDER BY count DESC`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    // network_metrics history is optional -- table may not be populated for new chambers.
    let history = [];
    try {
      history = await sequelize.query(
        `SELECT * FROM network_metrics WHERE chamber_id = :c ORDER BY date DESC LIMIT 30`,
        { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
      );
    } catch (e) { /* table absent or empty -- fine */ }
    return res.json({
      success: true,
      data: {
        current: counts,
        members_by_region: membersByRegion,
        members_by_type: membersByType,
        history: history.reverse()
      }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/metrics/hci', authMiddleware, async (req, res) => {
  try {
    const [r] = await sequelize.query(
      `SELECT COALESCE(AVG(trust_score), 0.7) AS hci, COUNT(*) AS members
       FROM members WHERE chamber_id = :c AND status = 'active'`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const hci = parseFloat(r.hci) || 0.7;
    return res.json({ success: true, data: { hci, score: hci, value: hci, members: parseInt(r.members) } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/metrics/gini', authMiddleware, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT region_id, COUNT(*) AS n FROM members
       WHERE chamber_id = :c AND status='active' GROUP BY region_id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const counts = rows.map(r => parseInt(r.n)).sort((a, b) => a - b);
    let gini = 0;
    if (counts.length > 1) {
      const n = counts.length;
      const total = counts.reduce((s, x) => s + x, 0);
      let acc = 0;
      counts.forEach((x, i) => { acc += (i + 1) * x; });
      gini = total > 0 ? (2 * acc) / (n * total) - (n + 1) / n : 0;
    }
    return res.json({
      success: true,
      data: {
        gini: Math.max(0, gini),
        dimension: req.query.dimension || 'regional',
        metric: req.query.metric || 'members'
      }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/metrics/network-value', authMiddleware, async (req, res) => {
  try {
    const [s] = await sequelize.query(
      `SELECT COUNT(*) AS members,
              (SELECT COUNT(*) FROM projects WHERE chamber_id = :c) AS projects
       FROM members WHERE chamber_id = :c AND status='active'`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const m = parseInt(s.members) || 0;
    return res.json({
      success: true,
      data: { members: m, projects: parseInt(s.projects) || 0, network_value: m * m, formula: 'metcalfe_n_squared' }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/metrics/trust/:id', authMiddleware, async (req, res) => {
  try {
    const [m] = await sequelize.query(
      `SELECT id, first_name, last_name, trust_score, verified, verification_level, membership_type, created_at
       FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!m) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({
      success: true,
      data: {
        member_id: m.id,
        name: `${m.first_name} ${m.last_name}`,
        trust_score: parseFloat(m.trust_score),
        components: {}
      }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// =====================================================================
// PAYMENTS
// =====================================================================
router.get('/payments/plans', authMiddleware, async (req, res) => {
  return res.json({
    success: true,
    data: [
      { id: 'individual', name: 'Individual', price: 0, period: 'month',
        features: ['Basic directory access', 'AI matching'] },
      { id: 'empresarial', name: 'Empresarial', price: 49, period: 'month',
        features: ['All Individual', 'Project participation', 'Exchange listings'] },
      { id: 'corporativo', name: 'Corporativo', price: 199, period: 'month',
        features: ['All Empresarial', 'Priority matching', 'Trust acceleration'] }
    ]
  });
});

router.get('/payments/history', authMiddleware, async (req, res) => {
  try {
    const tx = await sequelize.query(
      `SELECT * FROM transactions
       WHERE chamber_id = :c AND member_id = :me
       ORDER BY created_at DESC LIMIT 20`,
      { replacements: { c: req.chamber_id, me: req.member.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: tx });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// =====================================================================
// ADMIN
// =====================================================================
router.get('/admin/members', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const members = await sequelize.query(
      `SELECT m.*, r.name AS region_name FROM members m
       LEFT JOIN regions r ON r.id = m.region_id
       WHERE m.chamber_id = :c ORDER BY m.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { members, pagination: { total: members.length } } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/roles', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const board = await sequelize.query(
      `SELECT m.id, m.first_name, m.last_name, m.email, m.governance_role, m.access_level,
              m.region_id, m.membership_type, r.name AS region_name
       FROM members m LEFT JOIN regions r ON r.id = m.region_id
       WHERE m.chamber_id = :c AND m.governance_role != 'member'
       ORDER BY m.governance_role, m.last_name`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const available_roles = ['superadmin', 'president', 'vp', 'secretary_general', 'treasurer',
      'board_member', 'chapter_president', 'chapter_secretary', 'chapter_treasurer',
      'chapter_board', 'member'];
    return res.json({
      success: true,
      data: { governance_board: board, available_roles, access_levels: ['superadmin', 'admin_global', 'admin_regional', 'member'] }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/regions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const regions = await sequelize.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM members m
         WHERE m.region_id = r.id AND m.status = 'active' AND m.chamber_id = :c) AS member_count
       FROM regions r WHERE r.chamber_id = :c ORDER BY r.id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: regions });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/system/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [stats] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM members WHERE chamber_id = :c) AS total_members,
         (SELECT COUNT(*) FROM members WHERE chamber_id = :c AND status='active') AS active_members,
         (SELECT COUNT(*) FROM members WHERE chamber_id = :c AND governance_role != 'member') AS governance_roles_assigned,
         (SELECT COUNT(*) FROM projects WHERE chamber_id = :c) AS total_projects,
         (SELECT COUNT(*) FROM companies WHERE chamber_id = :c) AS total_companies,
         (SELECT COUNT(*) FROM rfqs WHERE chamber_id = :c AND status='open') AS open_rfqs,
         (SELECT COUNT(*) FROM transactions WHERE chamber_id = :c) AS total_transactions,
         (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE chamber_id = :c AND status='completed') AS total_revenue,
         (SELECT COUNT(*) FROM matches WHERE chamber_id = :c) AS total_matches,
         (SELECT COUNT(*) FROM trust_references WHERE chamber_id = :c) AS total_references,
         (SELECT COUNT(*) FROM opportunities WHERE chamber_id = :c AND status='active') AS active_opportunities,
         (SELECT COUNT(*) FROM events WHERE chamber_id = :c) AS total_events`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { overview: stats, members_by_access: [], database_tables: [] } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// PUT /admin/members/:id/access -- update access_level
router.put('/admin/members/:id/access', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { access_level } = req.body;
    const valid = ['superadmin', 'admin_global', 'admin_regional', 'member'];
    if (!valid.includes(access_level)) {
      return res.status(400).json({ success: false, error: 'Invalid access_level' });
    }
    if (access_level === 'superadmin' && req.member.access_level !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Only superadmin can grant superadmin' });
    }
    const [updated] = await sequelize.query(
      `UPDATE members SET access_level = :al, updated_at = NOW()
       WHERE chamber_id = :c AND id = :id RETURNING id, access_level`,
      { replacements: { c: req.chamber_id, id: targetId, al: access_level }, type: QueryTypes.SELECT }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /admin/members/:id/membership -- update membership_type
router.put('/admin/members/:id/membership', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { membership_type } = req.body;
    if (!membership_type) {
      return res.status(400).json({ success: false, error: 'membership_type required' });
    }
    const [updated] = await sequelize.query(
      `UPDATE members SET membership_type = :mt, updated_at = NOW()
       WHERE chamber_id = :c AND id = :id RETURNING id, membership_type`,
      { replacements: { c: req.chamber_id, id: targetId, mt: membership_type }, type: QueryTypes.SELECT }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// AI MATCHING
// =====================================================================
router.post('/match', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.body.limit) || 10, 50);
    const members = await sequelize.query(
      `SELECT id AS member_id, first_name, last_name, email, company_name, sector, country,
              trust_score, membership_type, region_id
       FROM members
       WHERE chamber_id = :c AND status='active' AND id != :me
       ORDER BY trust_score DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, me: req.member.id, limit }, type: QueryTypes.SELECT }
    );
    const results = members.map(m => ({
      ...m,
      trust_score: parseFloat(m.trust_score),
      similarity_score: 0.5,
      gini_correction: 1.0,
      final_score: parseFloat(m.trust_score)
    }));
    return res.json({ success: true, data: { results, total_candidates: results.length } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
