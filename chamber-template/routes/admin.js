// Chamber Template - Admin Routes Factory
module.exports = function createAdminRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const jwt = require('jsonwebtoken');
  const { Sequelize, QueryTypes } = require('sequelize');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });

  const t = config.db_prefix;
  const JWT_SECRET = config.jwt_secret || `${t}-jwt-secret`;
  const GOVERNANCE_ROLES = config.governance_roles || ['superadmin', 'president', 'vp', 'secretary_general', 'treasurer', 'board_member', 'chapter_president', 'chapter_secretary', 'chapter_treasurer', 'chapter_board', 'member'];
  const ACCESS_LEVELS = ['superadmin', 'admin_global', 'admin_regional', 'member'];

  function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token required' });
    try { req.member = jwt.verify(token, JWT_SECRET); req.member.id = req.member.member_id; next(); } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  }

  function requireAccess(...levels) {
    return async function(req, res, next) {
      const [member] = await sequelize.query(`SELECT access_level, governance_role, region_id FROM ${t}_members WHERE id = :id`, { replacements: { id: req.member.id }, type: QueryTypes.SELECT });
      if (!member) return res.status(403).json({ success: false, error: 'Member not found' });
      req.memberAccess = member;
      if (levels.includes(member.access_level)) return next();
      return res.status(403).json({ success: false, error: 'Access denied. Required level: ' + levels.join(' or ') });
    };
  }

  // GET /roles
  router.get('/roles', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const members = await sequelize.query(`SELECT m.id, m.first_name, m.last_name, m.email, m.governance_role, m.access_level, m.region_id, r.name as region_name, m.membership_type FROM ${t}_members m LEFT JOIN ${t}_regions r ON m.region_id = r.id WHERE m.governance_role != 'member' ORDER BY CASE m.access_level WHEN 'superadmin' THEN 1 WHEN 'admin_global' THEN 2 WHEN 'admin_regional' THEN 3 ELSE 4 END, m.governance_role, m.last_name`, { type: QueryTypes.SELECT });
      res.json({ success: true, data: { governance_board: members, available_roles: GOVERNANCE_ROLES, access_levels: ACCESS_LEVELS } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // PUT /roles/:member_id
  router.put('/roles/:member_id', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const memberId = parseInt(req.params.member_id);
      const { governance_role, access_level } = req.body;
      if (governance_role && !GOVERNANCE_ROLES.includes(governance_role)) return res.status(400).json({ success: false, error: 'Invalid role' });
      const newAccess = access_level || 'member';
      await sequelize.query(`UPDATE ${t}_members SET governance_role = :role, access_level = :access, updated_at = NOW() WHERE id = :id`, { replacements: { role: governance_role || 'member', access: newAccess, id: memberId } });
      res.json({ success: true, data: { member_id: memberId, governance_role, access_level: newAccess } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // DELETE /roles/:member_id
  router.delete('/roles/:member_id', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const memberId = parseInt(req.params.member_id);
      const [target] = await sequelize.query(`SELECT governance_role FROM ${t}_members WHERE id = :id`, { replacements: { id: memberId }, type: QueryTypes.SELECT });
      if (target && target.governance_role === 'superadmin') return res.status(403).json({ success: false, error: 'Cannot remove superadmin role' });
      await sequelize.query(`UPDATE ${t}_members SET governance_role = 'member', access_level = 'member', updated_at = NOW() WHERE id = :id`, { replacements: { id: memberId } });
      res.json({ success: true, data: { member_id: memberId, governance_role: 'member', access_level: 'member' } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /members
  router.get('/members', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
    try {
      const { region_id, status, membership_type, search, page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const conditions = []; const replacements = { limit: parseInt(limit), offset };
      if (req.memberAccess.access_level === 'admin_regional') { conditions.push('m.region_id = :adminRegion'); replacements.adminRegion = req.memberAccess.region_id; }
      if (region_id) { conditions.push('m.region_id = :region_id'); replacements.region_id = parseInt(region_id); }
      if (status) { conditions.push('m.status = :status'); replacements.status = status; }
      if (membership_type) { conditions.push('m.membership_type = :mtype'); replacements.mtype = membership_type; }
      if (search) { conditions.push("(m.first_name ILIKE :search OR m.last_name ILIKE :search OR m.email ILIKE :search OR m.company_name ILIKE :search)"); replacements.search = `%${search}%`; }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const members = await sequelize.query(`SELECT m.id, m.email, m.first_name, m.last_name, m.country, m.region_id, r.name as region_name, m.sector, m.company_name, m.membership_type, m.governance_role, m.access_level, m.trust_score, m.verified, m.verification_level, m.status, m.phone, m.created_at, m.last_active_at FROM ${t}_members m LEFT JOIN ${t}_regions r ON m.region_id = r.id ${where} ORDER BY m.created_at DESC LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
      const [{ count }] = await sequelize.query(`SELECT COUNT(*) as count FROM ${t}_members m ${where}`, { replacements, type: QueryTypes.SELECT });
      res.json({ success: true, data: { members, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(count) } } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // PUT /members/:id/status
  router.put('/members/:id/status', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const { status } = req.body;
      if (!['active', 'inactive', 'suspended', 'pending'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
      if (req.memberAccess.access_level === 'admin_regional') {
        const [target] = await sequelize.query(`SELECT region_id FROM ${t}_members WHERE id = :id`, { replacements: { id: memberId }, type: QueryTypes.SELECT });
        if (!target || target.region_id !== req.memberAccess.region_id) return res.status(403).json({ success: false, error: 'Can only manage members in your region' });
      }
      await sequelize.query(`UPDATE ${t}_members SET status = :status, updated_at = NOW() WHERE id = :id`, { replacements: { status, id: memberId } });
      res.json({ success: true, data: { member_id: memberId, status } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // PUT /members/:id/verify
  router.put('/members/:id/verify', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const { verification_level } = req.body;
      if (!['none', 'email', 'id_complete'].includes(verification_level)) return res.status(400).json({ success: false, error: 'Invalid verification level' });
      await sequelize.query(`UPDATE ${t}_members SET verification_level = :level, verified = :verified, updated_at = NOW() WHERE id = :id`, { replacements: { level: verification_level, verified: verification_level === 'id_complete', id: memberId } });
      res.json({ success: true, data: { member_id: memberId, verification_level } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // POST /members -- admin creates a new member account (email-based invite)
  router.post('/members', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { email, first_name, last_name, country, sector, region_id, membership_type, governance_role, access_level, password } = req.body;
      if (!email || !first_name || !last_name) return res.status(400).json({ success: false, error: 'email, first_name, last_name required' });
      const [existing] = await sequelize.query(`SELECT id FROM ${t}_members WHERE email = :email`, { replacements: { email }, type: QueryTypes.SELECT });
      if (existing) return res.status(409).json({ success: false, error: 'A member with this email already exists' });
      // Regional admins can only create within their region
      let finalRegion = region_id ? parseInt(region_id) : null;
      if (req.memberAccess.access_level === 'admin_regional') finalRegion = req.memberAccess.region_id;
      const finalAccess = (req.memberAccess.access_level === 'admin_regional') ? 'member'
                        : (ACCESS_LEVELS.includes(access_level) ? access_level : 'member');
      const finalRole = (governance_role && GOVERNANCE_ROLES.includes(governance_role)) ? governance_role : 'member';
      const tempPwd = password || Math.random().toString(36).slice(-12) + 'A1';
      const hash = await bcrypt.hash(tempPwd, 10);
      const result = await sequelize.query(
        `INSERT INTO ${t}_members (email, password_hash, first_name, last_name, country, sector, region_id, membership_type, governance_role, access_level, verification_level, status, trust_score, created_at, updated_at)
         VALUES (:email, :hash, :fn, :ln, :country, :sector, :region, :mtype, :role, :access, 'email', 'active', 0.7, NOW(), NOW())
         RETURNING id, email, first_name, last_name, country, sector, region_id, membership_type, governance_role, access_level, status`,
        { replacements: { email, hash, fn: first_name, ln: last_name, country: country || null, sector: sector || null, region: finalRegion, mtype: membership_type || 'individual', role: finalRole, access: finalAccess }, type: QueryTypes.SELECT }
      );
      return res.status(201).json({ success: true, data: { ...result[0], temporary_password: password ? undefined : tempPwd } });
    } catch (err) {
      console.error('[POST /admin/members]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /members/:id -- soft delete by setting status='deleted', keeps row for audit
  router.delete('/members/:id', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      if (memberId === req.member.id) return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
      const [target] = await sequelize.query(`SELECT access_level FROM ${t}_members WHERE id = :id`, { replacements: { id: memberId }, type: QueryTypes.SELECT });
      if (target && target.access_level === 'superadmin' && req.memberAccess.access_level !== 'superadmin') {
        return res.status(403).json({ success: false, error: 'Only superadmin can remove a superadmin' });
      }
      const hard = req.query.hard === 'true' && req.memberAccess.access_level === 'superadmin';
      if (hard) {
        await sequelize.query(`DELETE FROM ${t}_members WHERE id = :id`, { replacements: { id: memberId } });
      } else {
        await sequelize.query(`UPDATE ${t}_members SET status = 'deleted', access_level = 'member', governance_role = 'member', updated_at = NOW() WHERE id = :id`, { replacements: { id: memberId } });
      }
      res.json({ success: true, data: { member_id: memberId, hard_delete: hard } });
    } catch (err) {
      console.error('[DELETE /admin/members/:id]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /members/:id/access -- set access level + region (separate from governance role)
  router.put('/members/:id/access', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const { access_level, region_id } = req.body;
      if (access_level && !ACCESS_LEVELS.includes(access_level)) return res.status(400).json({ success: false, error: 'Invalid access_level' });
      // Only superadmin can grant superadmin
      if (access_level === 'superadmin' && req.memberAccess.access_level !== 'superadmin') {
        return res.status(403).json({ success: false, error: 'Only superadmin can grant superadmin' });
      }
      const setClauses = ['updated_at = NOW()']; const replacements = { id: memberId };
      if (access_level !== undefined) { setClauses.push('access_level = :access'); replacements.access = access_level; }
      if (region_id !== undefined) { setClauses.push('region_id = :region'); replacements.region = region_id ? parseInt(region_id) : null; }
      await sequelize.query(`UPDATE ${t}_members SET ${setClauses.join(', ')} WHERE id = :id`, { replacements });
      res.json({ success: true, data: { member_id: memberId, access_level, region_id } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /regions -- create a new regional delegation
  router.post('/regions', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const { name, description, country_code } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'name required' });
      const result = await sequelize.query(
        `INSERT INTO ${t}_regions (name, description, country_code, created_at, updated_at)
         VALUES (:name, :description, :country_code, NOW(), NOW()) RETURNING *`,
        { replacements: { name, description: description || null, country_code: country_code || null }, type: QueryTypes.SELECT }
      );
      res.status(201).json({ success: true, data: result[0] });
    } catch (err) {
      console.error('[POST /admin/regions]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /regions/:id -- edit a region
  router.put('/regions/:id', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const regionId = parseInt(req.params.id);
      const { name, description, country_code } = req.body;
      const setClauses = ['updated_at = NOW()']; const replacements = { id: regionId };
      if (name !== undefined) { setClauses.push('name = :name'); replacements.name = name; }
      if (description !== undefined) { setClauses.push('description = :description'); replacements.description = description; }
      if (country_code !== undefined) { setClauses.push('country_code = :country_code'); replacements.country_code = country_code; }
      const result = await sequelize.query(
        `UPDATE ${t}_regions SET ${setClauses.join(', ')} WHERE id = :id RETURNING *`,
        { replacements, type: QueryTypes.SELECT }
      );
      if (!result[0]) return res.status(404).json({ success: false, error: 'Region not found' });
      res.json({ success: true, data: result[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /regions/:id -- delete only if no members assigned
  router.delete('/regions/:id', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const regionId = parseInt(req.params.id);
      const [{ count }] = await sequelize.query(`SELECT COUNT(*) as count FROM ${t}_members WHERE region_id = :id AND status != 'deleted'`, { replacements: { id: regionId }, type: QueryTypes.SELECT });
      if (parseInt(count) > 0) return res.status(400).json({ success: false, error: `Cannot delete: ${count} active members in this region. Reassign them first.` });
      await sequelize.query(`DELETE FROM ${t}_regions WHERE id = :id`, { replacements: { id: regionId } });
      res.json({ success: true, data: { region_id: regionId, deleted: true } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /members/:id/membership
  router.put('/members/:id/membership', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const { membership_type } = req.body;
      const validTypes = Object.keys(config.membership_tiers || {});
      if (!validTypes.includes(membership_type)) return res.status(400).json({ success: false, error: 'Invalid membership type' });
      await sequelize.query(`UPDATE ${t}_members SET membership_type = :type, updated_at = NOW() WHERE id = :id`, { replacements: { type: membership_type, id: memberId } });
      res.json({ success: true, data: { member_id: memberId, membership_type } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // PUT /projects/:id/status
  router.put('/projects/:id/status', authMiddleware, requireAccess('superadmin', 'admin_global'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { status } = req.body;
      const validStatuses = ['proposal', 'analysis', 'team', 'resources', 'execution', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid project status' });
      await sequelize.query(`UPDATE ${t}_projects SET status = :status, updated_at = NOW() WHERE id = :id`, { replacements: { status, id: projectId } });
      res.json({ success: true, data: { project_id: projectId, status } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /regions
  router.get('/regions', authMiddleware, requireAccess('superadmin', 'admin_global', 'admin_regional'), async (req, res) => {
    try {
      const regions = await sequelize.query(`SELECT r.*, (SELECT COUNT(*) FROM ${t}_members m WHERE m.region_id = r.id AND m.status = 'active') as member_count FROM ${t}_regions r ORDER BY r.id`, { type: QueryTypes.SELECT });
      res.json({ success: true, data: regions });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /system/stats
  router.get('/system/stats', authMiddleware, requireAccess('superadmin'), async (req, res) => {
    try {
      const [stats] = await sequelize.query(`SELECT (SELECT COUNT(*) FROM ${t}_members) as total_members, (SELECT COUNT(*) FROM ${t}_members WHERE status = 'active') as active_members, (SELECT COUNT(*) FROM ${t}_projects) as total_projects, (SELECT COUNT(*) FROM ${t}_companies) as total_companies, (SELECT COUNT(*) FROM ${t}_rfqs WHERE status = 'open') as open_rfqs, (SELECT COUNT(*) FROM ${t}_transactions) as total_transactions, (SELECT COALESCE(SUM(amount), 0) FROM ${t}_transactions WHERE status = 'completed') as total_revenue, (SELECT COUNT(*) FROM ${t}_matches) as total_matches, (SELECT COUNT(*) FROM ${t}_opportunities WHERE status = 'active') as active_opportunities`, { type: QueryTypes.SELECT });
      res.json({ success: true, data: { overview: stats } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /my-access
  router.get('/my-access', authMiddleware, async (req, res) => {
    try {
      const [member] = await sequelize.query(`SELECT id, email, first_name, last_name, governance_role, access_level, membership_type, region_id FROM ${t}_members WHERE id = :id`, { replacements: { id: req.member.id }, type: QueryTypes.SELECT });
      if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
      const permissions = {
        can_manage_members: ['superadmin', 'admin_global', 'admin_regional'].includes(member.access_level),
        can_manage_governance: ['superadmin', 'admin_global'].includes(member.access_level),
        can_manage_projects: ['superadmin', 'admin_global'].includes(member.access_level),
        can_view_system: member.access_level === 'superadmin'
      };
      res.json({ success: true, data: { ...member, permissions } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  return router;
};
