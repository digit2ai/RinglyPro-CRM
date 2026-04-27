// Chamber Template - Members Routes Factory
module.exports = function createMemberRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const jwt = require('jsonwebtoken');
  const { Sequelize } = require('sequelize');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });

  const t = config.db_prefix;
  const JWT_SECRET = config.jwt_secret || `${t}-jwt-secret`;

  function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token required' });
    try { req.member = jwt.verify(token, JWT_SECRET); req.member.id = req.member.member_id; next(); } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  }

  // GET / -- Directory
  router.get('/', async (req, res) => {
    try {
      const { region_id, sector, country, membership_type, search, page = 1, limit = 20 } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;
      const conditions = []; const replacements = { limit: limitNum, offset };
      if (region_id) { conditions.push('region_id = :region_id'); replacements.region_id = region_id; }
      if (sector) { conditions.push('sector = :sector'); replacements.sector = sector; }
      if (country) { conditions.push('country = :country'); replacements.country = country; }
      if (membership_type) { conditions.push('membership_type = :membership_type'); replacements.membership_type = membership_type; }
      if (search) { conditions.push(`(first_name ILIKE :search OR last_name ILIKE :search OR company_name ILIKE :search)`); replacements.search = `%${search}%`; }
      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const [countResult] = await sequelize.query(`SELECT COUNT(*) AS total FROM ${t}_members ${whereClause}`, { replacements, type: Sequelize.QueryTypes.SELECT });
      const total = parseInt(countResult.total);
      const members = await sequelize.query(
        `SELECT id, email, first_name, last_name, country, region_id, sector, sub_specialty, years_experience, languages, company_name, membership_type, bio, linkedin_url, website_url, verification_level, created_at
         FROM ${t}_members ${whereClause} ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
        { replacements, type: Sequelize.QueryTypes.SELECT }
      );
      return res.json({ success: true, data: { members, pagination: { page: pageNum, limit: limitNum, total, total_pages: Math.ceil(total / limitNum) } }, error: null });
    } catch (err) {
      console.error(`[${t}-members] Directory error:`, err.message);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  });

  // GET /:id
  router.get('/:id', async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      if (isNaN(memberId)) return res.status(400).json({ success: false, error: 'Invalid member ID' });
      const [member] = await sequelize.query(
        `SELECT id, email, first_name, last_name, country, region_id, sector, sub_specialty, years_experience, languages, company_name, membership_type, bio, phone, linkedin_url, website_url, verification_level, created_at, updated_at
         FROM ${t}_members WHERE id = :id LIMIT 1`,
        { replacements: { id: memberId }, type: Sequelize.QueryTypes.SELECT }
      );
      if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
      return res.json({ success: true, data: member, error: null });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  });

  // PUT /:id
  router.put('/:id', authMiddleware, async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      if (isNaN(memberId)) return res.status(400).json({ success: false, error: 'Invalid member ID' });
      if (req.member.id !== memberId) return res.status(403).json({ success: false, error: 'You can only update your own profile' });
      const allowedFields = ['first_name', 'last_name', 'country', 'region_id', 'sector', 'sub_specialty', 'years_experience', 'languages', 'company_name', 'bio', 'phone', 'linkedin_url', 'website_url'];
      const setClauses = []; const replacements = { id: memberId };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (field === 'languages') {
            // Postgres TEXT[] expects ARRAY[...] literal, not JSON
            const arr = Array.isArray(req.body[field])
              ? req.body[field]
              : (typeof req.body[field] === 'string' ? req.body[field].split(',').map(s => s.trim()).filter(Boolean) : []);
            if (arr.length === 0) {
              setClauses.push(`languages = ARRAY[]::TEXT[]`);
            } else {
              const placeholders = arr.map((_, i) => `:lang${i}`).join(',');
              setClauses.push(`languages = ARRAY[${placeholders}]::TEXT[]`);
              arr.forEach((v, i) => { replacements[`lang${i}`] = v; });
            }
          } else if (field === 'years_experience' || field === 'region_id') {
            // Coerce to int or null (frontend may send '' for empty)
            const v = req.body[field];
            const num = (v === '' || v === null || v === undefined) ? null : parseInt(v);
            setClauses.push(`${field} = :${field}`);
            replacements[field] = (Number.isNaN(num) ? null : num);
          } else {
            setClauses.push(`${field} = :${field}`); replacements[field] = req.body[field];
          }
        }
      }
      if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
      setClauses.push('updated_at = NOW()');
      const [results] = await sequelize.query(
        `UPDATE ${t}_members SET ${setClauses.join(', ')} WHERE id = :id RETURNING id, email, first_name, last_name, country, region_id, sector, sub_specialty, years_experience, languages, company_name, membership_type, bio, phone, linkedin_url, website_url, verification_level, trust_score, created_at, updated_at`,
        { replacements }
      );
      if (!results[0]) return res.status(404).json({ success: false, error: 'Member not found' });
      return res.json({ success: true, data: results[0], error: null });
    } catch (err) {
      console.error('[PUT /members/:id]', err.message, err.stack);
      return res.status(500).json({ success: false, error: err.message || 'Internal error' });
    }
  });

  // POST /:id/verify
  router.post('/:id/verify', authMiddleware, async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      if (req.member.id !== memberId) return res.status(403).json({ success: false, error: 'Can only request verification for own account' });
      const [results] = await sequelize.query(
        `UPDATE ${t}_members SET verification_level = 'pending', updated_at = NOW() WHERE id = :id RETURNING id, email, first_name, last_name, verification_level`,
        { replacements: { id: memberId } }
      );
      if (!results[0]) return res.status(404).json({ success: false, error: 'Member not found' });
      return res.json({ success: true, data: { ...results[0], message: 'Verification request submitted' }, error: null });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  });

  return router;
};
