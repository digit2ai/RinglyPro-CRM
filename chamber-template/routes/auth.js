// Chamber Template - Auth Routes Factory
module.exports = function createAuthRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const bcrypt = require('bcrypt');
  const jwt = require('jsonwebtoken');
  const { Sequelize } = require('sequelize');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });

  const t = config.db_prefix;
  const JWT_SECRET = config.jwt_secret || process.env.JWT_SECRET || `${t}-jwt-secret`;
  const JWT_EXPIRY = '7d';

  // POST /register
  router.post('/register', async (req, res) => {
    try {
      const { email, password, first_name, last_name, country, region_id, sector, sub_specialty, years_experience, languages, company_name, membership_type, bio, phone, linkedin_url, website_url } = req.body;
      if (!email || !password || !first_name || !last_name) {
        return res.json({ success: false, data: null, error: 'Required fields: email, password, first_name, last_name' });
      }
      const [existing] = await sequelize.query(
        `SELECT id FROM ${t}_members WHERE email = :email LIMIT 1`,
        { replacements: { email: email.toLowerCase().trim() }, type: Sequelize.QueryTypes.SELECT }
      );
      if (existing) {
        return res.json({ success: false, data: null, error: 'An account with this email already exists' });
      }
      const password_hash = await bcrypt.hash(password, 12);
      const defaultTier = Object.keys(config.membership_tiers || {})[0] || 'regular';
      const [results] = await sequelize.query(
        `INSERT INTO ${t}_members (
          email, password_hash, first_name, last_name, country, region_id,
          sector, sub_specialty, years_experience, languages,
          company_name, membership_type, bio, phone, linkedin_url, website_url,
          governance_role, access_level, status, created_at, updated_at
        ) VALUES (
          :email, :password_hash, :first_name, :last_name, :country, :region_id,
          :sector, :sub_specialty, :years_experience, :languages,
          :company_name, :membership_type, :bio, :phone, :linkedin_url, :website_url,
          'member', 'member', 'active', NOW(), NOW()
        ) RETURNING id, email, first_name, last_name, membership_type, governance_role, access_level`,
        {
          replacements: {
            email: email.toLowerCase().trim(), password_hash,
            first_name: first_name.trim(), last_name: last_name.trim(),
            country: country || null, region_id: region_id || null,
            sector: sector || null, sub_specialty: sub_specialty || null,
            years_experience: years_experience || null,
            languages: languages ? `{${languages.join(',')}}` : '{}',
            company_name: company_name || null, membership_type: membership_type || defaultTier,
            bio: bio || null, phone: phone || null,
            linkedin_url: linkedin_url || null, website_url: website_url || null
          }
        }
      );
      const member = results[0];
      const token = jwt.sign({
        member_id: member.id, email: member.email, membership_type: member.membership_type,
        governance_role: member.governance_role || 'member', access_level: member.access_level || 'member',
        first_name: member.first_name, last_name: member.last_name
      }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
      return res.json({ success: true, data: { token, member }, error: null });
    } catch (err) {
      console.error(`[${t}-auth] Register error:`, err.message);
      return res.status(500).json({ success: false, data: null, error: 'Internal error during registration' });
    }
  });

  // POST /login
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.json({ success: false, data: null, error: 'Email and password are required' });
      }
      const [member] = await sequelize.query(
        `SELECT id, email, password_hash, first_name, last_name, membership_type, governance_role, access_level
         FROM ${t}_members WHERE email = :email LIMIT 1`,
        { replacements: { email: email.toLowerCase().trim() }, type: Sequelize.QueryTypes.SELECT }
      );
      if (!member) {
        return res.json({ success: false, data: null, error: 'Invalid credentials' });
      }
      const valid = await bcrypt.compare(password, member.password_hash);
      if (!valid) {
        return res.json({ success: false, data: null, error: 'Invalid credentials' });
      }
      await sequelize.query(`UPDATE ${t}_members SET last_active_at = NOW() WHERE id = :id`, { replacements: { id: member.id } });
      const token = jwt.sign({
        member_id: member.id, email: member.email, membership_type: member.membership_type,
        governance_role: member.governance_role || 'member', access_level: member.access_level || 'member',
        first_name: member.first_name, last_name: member.last_name
      }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
      return res.json({
        success: true,
        data: {
          token,
          member: { id: member.id, email: member.email, first_name: member.first_name, last_name: member.last_name, membership_type: member.membership_type, governance_role: member.governance_role, access_level: member.access_level }
        },
        error: null
      });
    } catch (err) {
      console.error(`[${t}-auth] Login error:`, err.message);
      return res.status(500).json({ success: false, data: null, error: 'Internal error during login' });
    }
  });

  // GET /me
  router.get('/me', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, data: null, error: 'Authentication token required' });
      }
      let decoded;
      try { decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET); } catch (e) {
        return res.status(401).json({ success: false, data: null, error: 'Invalid or expired token' });
      }
      const [member] = await sequelize.query(
        `SELECT m.id, m.email, m.first_name, m.last_name, m.country, m.region_id,
                r.name as region_name,
                m.sector, m.sub_specialty, m.years_experience, m.languages,
                m.company_name, m.membership_type, m.governance_role, m.access_level,
                m.trust_score, m.bio, m.phone, m.linkedin_url, m.website_url,
                m.verified, m.verification_level, m.status,
                m.created_at, m.updated_at
         FROM ${t}_members m
         LEFT JOIN ${t}_regions r ON m.region_id = r.id
         WHERE m.id = :id LIMIT 1`,
        { replacements: { id: decoded.member_id }, type: Sequelize.QueryTypes.SELECT }
      );
      if (!member) {
        return res.status(404).json({ success: false, data: null, error: 'Member not found' });
      }
      return res.json({ success: true, data: member, error: null });
    } catch (err) {
      console.error(`[${t}-auth] /me error:`, err.message);
      return res.status(500).json({ success: false, data: null, error: 'Internal error' });
    }
  });

  return router;
};
