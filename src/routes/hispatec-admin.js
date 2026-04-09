// src/routes/hispatec-admin.js -- Admin & Governance Management
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.JWT_SECRET || 'hispatec-jwt-secret-2026';

// Valid governance roles and access levels
const GOVERNANCE_ROLES = [
  'superadmin',
  'presidente_general', 'vp_fundador', 'secretario_general', 'tesorero_general', 'vocal_global',
  'presidente_regional', 'secretario_regional', 'tesorero_regional', 'vocal_regional',
  'miembro'
];

const ACCESS_LEVELS = ['superadmin', 'admin_global', 'admin_regional', 'member'];

const ROLE_TO_ACCESS = {
  'superadmin': 'superadmin',
  'presidente_general': 'admin_global',
  'vp_fundador': 'admin_global',
  'secretario_general': 'admin_global',
  'tesorero_general': 'admin_global',
  'vocal_global': 'admin_global',
  'presidente_regional': 'admin_regional',
  'secretario_regional': 'admin_regional',
  'tesorero_regional': 'admin_regional',
  'vocal_regional': 'admin_regional',
  'miembro': 'member'
};

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
  try {
    req.member = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Token invalido' });
  }
}

// Role check middleware factory
function requireAccess(...levels) {
  return async function(req, res, next) {
    // Fetch fresh access level from DB (JWT may be stale)
    const [member] = await sequelize.query(
      'SELECT access_level, governance_role, region_id FROM hispatec_members WHERE id = :id',
      { replacements: { id: req.member.id || req.member.member_id }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(403).json({ success: false, error: 'Miembro no encontrado' });

    req.memberAccess = member;

    if (levels.includes(member.access_level)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Se requiere nivel: ' + levels.join(' o ')
    });
  };
}

// ==========================================
// GOVERNANCE MANAGEMENT
// ==========================================

// GET /roles -- List all governance roles and their holders
router.get('/roles', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
  try {
    const members = await sequelize.query(`
      SELECT m.id, m.first_name, m.last_name, m.email, m.governance_role, m.access_level,
             m.region_id, r.name as region_name, m.membership_type
      FROM hispatec_members m
      LEFT JOIN hispatec_regions r ON m.region_id = r.id
      WHERE m.governance_role != 'miembro'
      ORDER BY
        CASE m.access_level
          WHEN 'superadmin' THEN 1
          WHEN 'admin_global' THEN 2
          WHEN 'admin_regional' THEN 3
          ELSE 4
        END,
        m.governance_role, m.last_name
    `, { type: QueryTypes.SELECT });

    res.json({
      success: true,
      data: {
        governance_board: members,
        available_roles: GOVERNANCE_ROLES,
        access_levels: ACCESS_LEVELS,
        role_to_access_mapping: ROLE_TO_ACCESS
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /roles/:member_id -- Assign governance role to a member
router.put('/roles/:member_id', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.member_id);
    const { governance_role } = req.body;

    if (!GOVERNANCE_ROLES.includes(governance_role)) {
      return res.status(400).json({
        success: false,
        error: 'Rol invalido. Roles disponibles: ' + GOVERNANCE_ROLES.join(', ')
      });
    }

    // Only superadmin can assign global admin roles
    if (['superadmin', 'presidente_general', 'vp_fundador', 'secretario_general', 'tesorero_general'].includes(governance_role)) {
      if (req.memberAccess.access_level !== 'superadmin') {
        return res.status(403).json({ success: false, error: 'Solo el superadmin puede asignar roles globales' });
      }
    }

    const access_level = ROLE_TO_ACCESS[governance_role] || 'member';

    await sequelize.query(`
      UPDATE hispatec_members
      SET governance_role = :role, access_level = :access, updated_at = NOW()
      WHERE id = :id
    `, { replacements: { role: governance_role, access: access_level, id: memberId } });

    // Update region leadership if applicable
    if (governance_role === 'presidente_regional') {
      const [member] = await sequelize.query(
        'SELECT region_id FROM hispatec_members WHERE id = :id',
        { replacements: { id: memberId }, type: QueryTypes.SELECT }
      );
      if (member && member.region_id) {
        await sequelize.query(
          'UPDATE hispatec_regions SET president_member_id = :mid WHERE id = :rid',
          { replacements: { mid: memberId, rid: member.region_id } }
        );
      }
    } else if (governance_role === 'secretario_regional') {
      const [member] = await sequelize.query(
        'SELECT region_id FROM hispatec_members WHERE id = :id',
        { replacements: { id: memberId }, type: QueryTypes.SELECT }
      );
      if (member && member.region_id) {
        await sequelize.query(
          'UPDATE hispatec_regions SET secretary_member_id = :mid WHERE id = :rid',
          { replacements: { mid: memberId, rid: member.region_id } }
        );
      }
    } else if (governance_role === 'tesorero_regional') {
      const [member] = await sequelize.query(
        'SELECT region_id FROM hispatec_members WHERE id = :id',
        { replacements: { id: memberId }, type: QueryTypes.SELECT }
      );
      if (member && member.region_id) {
        await sequelize.query(
          'UPDATE hispatec_regions SET treasurer_member_id = :mid WHERE id = :rid',
          { replacements: { mid: memberId, rid: member.region_id } }
        );
      }
    }

    res.json({
      success: true,
      data: { member_id: memberId, governance_role, access_level }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /roles/:member_id -- Remove governance role (set to miembro)
router.delete('/roles/:member_id', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.member_id);

    // Cannot remove superadmin role (safety)
    const [target] = await sequelize.query(
      'SELECT governance_role FROM hispatec_members WHERE id = :id',
      { replacements: { id: memberId }, type: QueryTypes.SELECT }
    );
    if (target && target.governance_role === 'superadmin') {
      return res.status(403).json({ success: false, error: 'No se puede remover el rol de superadmin' });
    }

    await sequelize.query(`
      UPDATE hispatec_members
      SET governance_role = 'miembro', access_level = 'member', updated_at = NOW()
      WHERE id = :id
    `, { replacements: { id: memberId } });

    res.json({ success: true, data: { member_id: memberId, governance_role: 'miembro', access_level: 'member' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// MEMBER MANAGEMENT (admin operations)
// ==========================================

// GET /members -- All members with full details (admin view)
router.get('/members', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
  try {
    const { region_id, status, membership_type, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const replacements = { limit: parseInt(limit), offset };

    // Regional admins can only see their own region
    if (req.memberAccess.access_level === 'admin_regional') {
      conditions.push('m.region_id = :adminRegion');
      replacements.adminRegion = req.memberAccess.region_id;
    }

    if (region_id) { conditions.push('m.region_id = :region_id'); replacements.region_id = parseInt(region_id); }
    if (status) { conditions.push('m.status = :status'); replacements.status = status; }
    if (membership_type) { conditions.push('m.membership_type = :mtype'); replacements.mtype = membership_type; }
    if (search) { conditions.push("(m.first_name ILIKE :search OR m.last_name ILIKE :search OR m.email ILIKE :search OR m.company_name ILIKE :search)"); replacements.search = `%${search}%`; }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const members = await sequelize.query(`
      SELECT m.id, m.email, m.first_name, m.last_name, m.country, m.region_id,
             r.name as region_name, m.sector, m.company_name, m.membership_type,
             m.governance_role, m.access_level, m.trust_score, m.verified,
             m.verification_level, m.status, m.phone, m.created_at, m.last_active_at
      FROM hispatec_members m
      LEFT JOIN hispatec_regions r ON m.region_id = r.id
      ${where}
      ORDER BY m.created_at DESC
      LIMIT :limit OFFSET :offset
    `, { replacements, type: QueryTypes.SELECT });

    const [{ count }] = await sequelize.query(
      `SELECT COUNT(*) as count FROM hispatec_members m ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        members,
        pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(count) }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /members/:id/status -- Change member status (activate, suspend, etc)
router.put('/members/:id/status', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status invalido' });
    }

    // Regional admin check
    if (req.memberAccess.access_level === 'admin_regional') {
      const [target] = await sequelize.query(
        'SELECT region_id FROM hispatec_members WHERE id = :id',
        { replacements: { id: memberId }, type: QueryTypes.SELECT }
      );
      if (!target || target.region_id !== req.memberAccess.region_id) {
        return res.status(403).json({ success: false, error: 'Solo puede gestionar miembros de su region' });
      }
    }

    await sequelize.query(
      'UPDATE hispatec_members SET status = :status, updated_at = NOW() WHERE id = :id',
      { replacements: { status, id: memberId } }
    );

    res.json({ success: true, data: { member_id: memberId, status } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /members/:id/verify -- Verify a member (admin action)
router.put('/members/:id/verify', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const { verification_level } = req.body; // 'email', 'id_complete'

    if (!['none', 'email', 'id_complete'].includes(verification_level)) {
      return res.status(400).json({ success: false, error: 'Nivel de verificacion invalido' });
    }

    await sequelize.query(`
      UPDATE hispatec_members
      SET verification_level = :level, verified = :verified, updated_at = NOW()
      WHERE id = :id
    `, {
      replacements: {
        level: verification_level,
        verified: verification_level === 'id_complete',
        id: memberId
      }
    });

    res.json({ success: true, data: { member_id: memberId, verification_level } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /members/:id/membership -- Change membership type (admin action)
router.put('/members/:id/membership', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const { membership_type } = req.body;

    if (!['fundador', 'honorifico', 'numerario', 'protector', 'patrono'].includes(membership_type)) {
      return res.status(400).json({ success: false, error: 'Tipo de membresia invalido' });
    }

    await sequelize.query(
      'UPDATE hispatec_members SET membership_type = :type, updated_at = NOW() WHERE id = :id',
      { replacements: { type: membership_type, id: memberId } }
    );

    res.json({ success: true, data: { member_id: memberId, membership_type } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// PROJECT MANAGEMENT (admin operations)
// ==========================================

// PUT /projects/:id/status -- Force project status change
router.put('/projects/:id/status', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { status } = req.body;

    const validStatuses = ['propuesta', 'analisis', 'equipo', 'recursos', 'ejecucion', 'completado', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Status de proyecto invalido' });
    }

    await sequelize.query(
      'UPDATE hispatec_projects SET status = :status, updated_at = NOW() WHERE id = :id',
      { replacements: { status, id: projectId } }
    );

    res.json({ success: true, data: { project_id: projectId, status } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// REGIONAL MANAGEMENT
// ==========================================

// GET /regions -- Regions with leadership details
router.get('/regions', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
  try {
    const regions = await sequelize.query(`
      SELECT r.*,
        p.first_name || ' ' || p.last_name as president_name,
        s.first_name || ' ' || s.last_name as secretary_name,
        t.first_name || ' ' || t.last_name as treasurer_name,
        (SELECT COUNT(*) FROM hispatec_members m WHERE m.region_id = r.id AND m.status = 'active') as member_count
      FROM hispatec_regions r
      LEFT JOIN hispatec_members p ON r.president_member_id = p.id
      LEFT JOIN hispatec_members s ON r.secretary_member_id = s.id
      LEFT JOIN hispatec_members t ON r.treasurer_member_id = t.id
      ORDER BY r.id
    `, { type: QueryTypes.SELECT });

    res.json({ success: true, data: regions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// SYSTEM (superadmin only)
// ==========================================

// GET /system/stats -- Full system statistics
router.get('/system/stats', authMiddleware, requireAccess('superadmin'), async (req, res) => {
  try {
    const [stats] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM hispatec_members) as total_members,
        (SELECT COUNT(*) FROM hispatec_members WHERE status = 'active') as active_members,
        (SELECT COUNT(*) FROM hispatec_members WHERE governance_role != 'miembro') as governance_roles_assigned,
        (SELECT COUNT(*) FROM hispatec_projects) as total_projects,
        (SELECT COUNT(*) FROM hispatec_companies) as total_companies,
        (SELECT COUNT(*) FROM hispatec_rfqs WHERE status = 'open') as open_rfqs,
        (SELECT COUNT(*) FROM hispatec_transactions) as total_transactions,
        (SELECT COALESCE(SUM(amount), 0) FROM hispatec_transactions WHERE status = 'completed') as total_revenue,
        (SELECT COUNT(*) FROM hispatec_matches) as total_matches,
        (SELECT COUNT(*) FROM hispatec_trust_references) as total_references,
        (SELECT COUNT(*) FROM hispatec_opportunities WHERE status = 'active') as active_opportunities,
        (SELECT COUNT(*) FROM hispatec_events) as total_events
    `, { type: QueryTypes.SELECT });

    const membersByAccess = await sequelize.query(`
      SELECT access_level, COUNT(*) as count
      FROM hispatec_members GROUP BY access_level ORDER BY count DESC
    `, { type: QueryTypes.SELECT });

    const membersByRole = await sequelize.query(`
      SELECT governance_role, COUNT(*) as count
      FROM hispatec_members WHERE governance_role != 'miembro'
      GROUP BY governance_role ORDER BY count DESC
    `, { type: QueryTypes.SELECT });

    res.json({
      success: true,
      data: {
        overview: stats,
        members_by_access: membersByAccess,
        governance_roles: membersByRole,
        database_tables: [
          'hispatec_regions', 'hispatec_members', 'hispatec_projects',
          'hispatec_project_members', 'hispatec_matches', 'hispatec_trust_references',
          'hispatec_trust_scores', 'hispatec_opportunities', 'hispatec_transactions',
          'hispatec_companies', 'hispatec_rfqs', 'hispatec_rfq_responses',
          'hispatec_events', 'hispatec_network_metrics'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /my-access -- Check current user's access level
router.get('/my-access', authMiddleware, async (req, res) => {
  try {
    const [member] = await sequelize.query(`
      SELECT id, email, first_name, last_name, governance_role, access_level,
             membership_type, region_id, r.name as region_name
      FROM hispatec_members m
      LEFT JOIN hispatec_regions r ON m.region_id = r.id
      WHERE m.id = :id
    `, { replacements: { id: req.member.id || req.member.member_id }, type: QueryTypes.SELECT });

    if (!member) return res.status(404).json({ success: false, error: 'Miembro no encontrado' });

    const permissions = {
      can_manage_members: ['superadmin', 'admin_global', 'admin_regional'].includes(member.access_level),
      can_manage_governance: ['superadmin', 'admin_global'].includes(member.access_level),
      can_manage_all_regions: ['superadmin', 'admin_global'].includes(member.access_level),
      can_manage_projects: ['superadmin', 'admin_global'].includes(member.access_level),
      can_verify_members: ['superadmin', 'admin_global', 'admin_regional'].includes(member.access_level),
      can_view_system: member.access_level === 'superadmin',
      can_view_finances: ['superadmin', 'admin_global', 'admin_regional'].includes(member.access_level),
      region_scope: member.access_level === 'admin_regional' ? member.region_id : 'all'
    };

    res.json({
      success: true,
      data: { ...member, permissions }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
