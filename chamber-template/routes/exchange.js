// Chamber Template - Exchange/Marketplace Routes Factory
module.exports = function createExchangeRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const { Sequelize, QueryTypes } = require('sequelize');
  const jwt = require('jsonwebtoken');
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

  function buildArraySql(arr, prefix) {
    if (!arr || arr.length === 0) return { sql: "ARRAY[]::TEXT[]", reps: {} };
    const reps = {}; const parts = arr.map((v, i) => { reps[`${prefix}${i}`] = v; return `:${prefix}${i}`; });
    return { sql: `ARRAY[${parts.join(',')}]::TEXT[]`, reps };
  }

  // COMPANIES
  router.get('/companies', async (req, res) => {
    try {
      const { sector, country, verified, page = 1, limit = 20 } = req.query;
      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions = []; const replacements = {};
      if (sector) { conditions.push('c.sector = :sector'); replacements.sector = sector; }
      if (country) { conditions.push(':country = ANY(c.countries_served)'); replacements.country = country; }
      if (verified !== undefined) { conditions.push('c.verified = :verified'); replacements.verified = verified === 'true'; }
      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const countResult = await sequelize.query(`SELECT COUNT(*) as total FROM ${t}_companies c ${where}`, { replacements, type: QueryTypes.SELECT });
      const companies = await sequelize.query(`SELECT c.* FROM ${t}_companies c ${where} ORDER BY c.created_at DESC LIMIT :limit OFFSET :offset`, { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT });
      return res.json({ success: true, data: { companies, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult[0].total), pages: Math.ceil(parseInt(countResult[0].total) / parseInt(limit)) } } });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/companies', authMiddleware, async (req, res) => {
    try {
      const { name, description, sector, capabilities, certifications, countries_served, employee_count, annual_revenue_range, website } = req.body;
      if (!name || !sector) return res.status(400).json({ success: false, error: 'name and sector are required' });
      const capSql = buildArraySql(Array.isArray(capabilities) ? capabilities : [], 'cap');
      const certSql = buildArraySql(Array.isArray(certifications) ? certifications : [], 'cert');
      const cSql = buildArraySql(Array.isArray(countries_served) ? countries_served : [], 'cs');
      const result = await sequelize.query(
        `INSERT INTO ${t}_companies (name, description, sector, capabilities, certifications, countries_served, employee_count, annual_revenue_range, website, owner_member_id, verified, created_at, updated_at)
         VALUES (:name, :description, :sector, ${capSql.sql}, ${certSql.sql}, ${cSql.sql}, :employee_count, :annual_revenue_range, :website, :owner_member_id, false, NOW(), NOW()) RETURNING *`,
        { replacements: { name, description: description || null, sector, employee_count: employee_count || null, annual_revenue_range: annual_revenue_range || null, website: website || null, owner_member_id: req.member.id, ...capSql.reps, ...certSql.reps, ...cSql.reps }, type: QueryTypes.SELECT }
      );
      return res.status(201).json({ success: true, data: result[0] });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  router.get('/companies/:id', async (req, res) => {
    try {
      const companies = await sequelize.query(`SELECT c.*, m.first_name || ' ' || m.last_name AS owner_name FROM ${t}_companies c LEFT JOIN ${t}_members m ON m.id = c.owner_member_id WHERE c.id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (companies.length === 0) return res.status(404).json({ success: false, error: 'Company not found' });
      return res.json({ success: true, data: companies[0] });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  // PUT /companies/:id -- owner or admin can edit
  router.put('/companies/:id', authMiddleware, async (req, res) => {
    try {
      const [company] = await sequelize.query(`SELECT owner_member_id FROM ${t}_companies WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (!company) return res.status(404).json({ success: false, error: 'Company not found' });

      const [viewer] = await sequelize.query(`SELECT access_level FROM ${t}_members WHERE id = :id`, { replacements: { id: req.member.id }, type: QueryTypes.SELECT });
      const isAdmin = viewer && ['superadmin','admin_global','admin_regional','admin'].includes(viewer.access_level);
      const isOwner = company.owner_member_id === req.member.id;
      if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Only the owner or chamber admin can edit this company' });

      const { name, description, sector, capabilities, certifications, countries_served, employee_count, annual_revenue_range, website, verified } = req.body;
      const setClauses = []; const replacements = { id: req.params.id };
      if (name !== undefined) { setClauses.push('name = :name'); replacements.name = name; }
      if (description !== undefined) { setClauses.push('description = :description'); replacements.description = description; }
      if (sector !== undefined) { setClauses.push('sector = :sector'); replacements.sector = sector; }
      if (employee_count !== undefined) { setClauses.push('employee_count = :employee_count'); replacements.employee_count = employee_count === '' ? null : parseInt(employee_count); }
      if (annual_revenue_range !== undefined) { setClauses.push('annual_revenue_range = :annual_revenue_range'); replacements.annual_revenue_range = annual_revenue_range || null; }
      if (website !== undefined) { setClauses.push('website = :website'); replacements.website = website || null; }
      if (Array.isArray(capabilities)) {
        const s = buildArraySql(capabilities, 'cap');
        setClauses.push(`capabilities = ${s.sql}`); Object.assign(replacements, s.reps);
      }
      if (Array.isArray(certifications)) {
        const s = buildArraySql(certifications, 'cert');
        setClauses.push(`certifications = ${s.sql}`); Object.assign(replacements, s.reps);
      }
      if (Array.isArray(countries_served)) {
        const s = buildArraySql(countries_served, 'cs');
        setClauses.push(`countries_served = ${s.sql}`); Object.assign(replacements, s.reps);
      }
      // Only admins can flip verified
      if (verified !== undefined && isAdmin) {
        setClauses.push('verified = :verified'); replacements.verified = !!verified;
      }
      if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
      setClauses.push('updated_at = NOW()');

      const result = await sequelize.query(
        `UPDATE ${t}_companies SET ${setClauses.join(', ')} WHERE id = :id RETURNING *`,
        { replacements, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: result[0] });
    } catch (err) {
      console.error('[PUT /companies/:id]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /companies/:id -- owner or admin
  router.delete('/companies/:id', authMiddleware, async (req, res) => {
    try {
      const [company] = await sequelize.query(`SELECT owner_member_id FROM ${t}_companies WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
      const [viewer] = await sequelize.query(`SELECT access_level FROM ${t}_members WHERE id = :id`, { replacements: { id: req.member.id }, type: QueryTypes.SELECT });
      const isAdmin = viewer && ['superadmin','admin_global','admin_regional','admin'].includes(viewer.access_level);
      if (!isAdmin && company.owner_member_id !== req.member.id) {
        return res.status(403).json({ success: false, error: 'Only the owner or chamber admin can delete this company' });
      }
      await sequelize.query(`DELETE FROM ${t}_companies WHERE id = :id`, { replacements: { id: req.params.id } });
      return res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // RFQS
  router.get('/rfqs', async (req, res) => {
    try {
      const { sector, country, page = 1, limit = 20 } = req.query;
      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions = ["r.status = 'open'"]; const replacements = {};
      if (sector) { conditions.push('r.sector = :sector'); replacements.sector = sector; }
      if (country) { conditions.push(':country = ANY(r.countries_target)'); replacements.country = country; }
      const where = 'WHERE ' + conditions.join(' AND ');
      const countResult = await sequelize.query(`SELECT COUNT(*) as total FROM ${t}_rfqs r ${where}`, { replacements, type: QueryTypes.SELECT });
      const rfqs = await sequelize.query(`SELECT r.*, m.first_name || ' ' || m.last_name AS requester_name, co.name AS company_name FROM ${t}_rfqs r LEFT JOIN ${t}_members m ON m.id = r.requester_member_id LEFT JOIN ${t}_companies co ON co.id = r.company_id ${where} ORDER BY r.created_at DESC LIMIT :limit OFFSET :offset`, { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT });
      return res.json({ success: true, data: { rfqs, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult[0].total), pages: Math.ceil(parseInt(countResult[0].total) / parseInt(limit)) } } });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/rfqs', authMiddleware, async (req, res) => {
    try {
      const { title, description, sector, budget_range, deadline, countries_target, company_id } = req.body;
      if (!title || !description || !sector) return res.status(400).json({ success: false, error: 'title, description and sector are required' });
      const ctSql = buildArraySql(Array.isArray(countries_target) ? countries_target : [], 'ct');
      const result = await sequelize.query(
        `INSERT INTO ${t}_rfqs (title, description, sector, budget_range, deadline, countries_target, company_id, requester_member_id, status, created_at, updated_at)
         VALUES (:title, :description, :sector, :budget_range, :deadline, ${ctSql.sql}, :company_id, :requester_member_id, 'open', NOW(), NOW()) RETURNING *`,
        { replacements: { title, description, sector, budget_range: budget_range || null, deadline: deadline || null, company_id: company_id || null, requester_member_id: req.member.id, ...ctSql.reps }, type: QueryTypes.SELECT }
      );
      return res.status(201).json({ success: true, data: result[0] });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  router.get('/rfqs/:id', async (req, res) => {
    try {
      const rfqs = await sequelize.query(`SELECT r.*, m.first_name || ' ' || m.last_name AS requester_name, co.name AS company_name FROM ${t}_rfqs r LEFT JOIN ${t}_members m ON m.id = r.requester_member_id LEFT JOIN ${t}_companies co ON co.id = r.company_id WHERE r.id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (rfqs.length === 0) return res.status(404).json({ success: false, error: 'RFQ not found' });
      const responses = await sequelize.query(`SELECT rr.*, m.first_name || ' ' || m.last_name AS responder_name, co.name AS responder_company FROM ${t}_rfq_responses rr LEFT JOIN ${t}_members m ON m.id = rr.responder_member_id LEFT JOIN ${t}_companies co ON co.id = rr.company_id WHERE rr.rfq_id = :id ORDER BY rr.created_at ASC`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      return res.json({ success: true, data: { ...rfqs[0], responses } });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/rfqs/:id/respond', authMiddleware, async (req, res) => {
    try {
      const rfqs = await sequelize.query(`SELECT * FROM ${t}_rfqs WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (rfqs.length === 0) return res.status(404).json({ success: false, error: 'RFQ not found' });
      if (rfqs[0].status !== 'open') return res.status(400).json({ success: false, error: 'RFQ is no longer accepting responses' });
      const { proposal_text, price_quote, currency, delivery_timeline, company_id } = req.body;
      if (!proposal_text) return res.status(400).json({ success: false, error: 'proposal_text is required' });
      const result = await sequelize.query(
        `INSERT INTO ${t}_rfq_responses (rfq_id, responder_member_id, company_id, proposal_text, price_quote, currency, delivery_timeline, status, created_at, updated_at)
         VALUES (:rfq_id, :responder_member_id, :company_id, :proposal_text, :price_quote, :currency, :delivery_timeline, 'submitted', NOW(), NOW()) RETURNING *`,
        { replacements: { rfq_id: req.params.id, responder_member_id: req.member.id, company_id: company_id || null, proposal_text, price_quote: price_quote || null, currency: currency || 'USD', delivery_timeline: delivery_timeline || null }, type: QueryTypes.SELECT }
      );
      return res.status(201).json({ success: true, data: result[0] });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  router.put('/rfqs/:id/award', authMiddleware, async (req, res) => {
    try {
      const rfqs = await sequelize.query(`SELECT * FROM ${t}_rfqs WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (rfqs.length === 0) return res.status(404).json({ success: false, error: 'RFQ not found' });
      if (rfqs[0].requester_member_id !== req.member.id) return res.status(403).json({ success: false, error: 'Only the RFQ creator can award' });
      const { response_id } = req.body;
      if (!response_id) return res.status(400).json({ success: false, error: 'response_id is required' });
      const responses = await sequelize.query(`SELECT * FROM ${t}_rfq_responses WHERE id = :response_id AND rfq_id = :rfq_id`, { replacements: { response_id, rfq_id: req.params.id }, type: QueryTypes.SELECT });
      if (responses.length === 0) return res.status(404).json({ success: false, error: 'Response not found for this RFQ' });
      await sequelize.query(`UPDATE ${t}_rfq_responses SET status = 'awarded', updated_at = NOW() WHERE id = :response_id`, { replacements: { response_id } });
      await sequelize.query(`UPDATE ${t}_rfq_responses SET status = 'not_selected', updated_at = NOW() WHERE rfq_id = :rfq_id AND id != :response_id AND status = 'submitted'`, { replacements: { rfq_id: req.params.id, response_id } });
      const updatedRfq = await sequelize.query(`UPDATE ${t}_rfqs SET status = 'awarded', awarded_response_id = :response_id, updated_at = NOW() WHERE id = :id RETURNING *`, { replacements: { response_id, id: req.params.id }, type: QueryTypes.SELECT });
      return res.json({ success: true, data: { rfq: updatedRfq[0], awarded_response: responses[0] } });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  // OPPORTUNITIES
  router.get('/opportunities', async (req, res) => {
    try {
      const { sector, country, page = 1, limit = 20 } = req.query;
      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions = []; const replacements = {};
      if (sector) { conditions.push('o.sector = :sector'); replacements.sector = sector; }
      if (country) { conditions.push(':country = ANY(o.countries)'); replacements.country = country; }
      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const countResult = await sequelize.query(`SELECT COUNT(*) as total FROM ${t}_opportunities o ${where}`, { replacements, type: QueryTypes.SELECT });
      const opportunities = await sequelize.query(`SELECT o.*, m.first_name || ' ' || m.last_name AS posted_by_name FROM ${t}_opportunities o LEFT JOIN ${t}_members m ON m.id = o.posted_by_member_id ${where} ORDER BY o.created_at DESC LIMIT :limit OFFSET :offset`, { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT });
      return res.json({ success: true, data: { opportunities, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult[0].total), pages: Math.ceil(parseInt(countResult[0].total) / parseInt(limit)) } } });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/opportunities', authMiddleware, async (req, res) => {
    try {
      const { title, description, sector, countries, source, url, expires_at } = req.body;
      if (!title || !description || !sector) return res.status(400).json({ success: false, error: 'title, description and sector are required' });
      const cSql = buildArraySql(Array.isArray(countries) ? countries : [], 'co');
      const result = await sequelize.query(
        `INSERT INTO ${t}_opportunities (title, description, sector, countries, source, url, expires_at, posted_by_member_id, status, created_at, updated_at)
         VALUES (:title, :description, :sector, ${cSql.sql}, :source, :url, :expires_at, :posted_by_member_id, 'active', NOW(), NOW()) RETURNING *`,
        { replacements: { title, description, sector, source: source || null, url: url || null, expires_at: expires_at || null, posted_by_member_id: req.member.id, ...cSql.reps }, type: QueryTypes.SELECT }
      );
      return res.status(201).json({ success: true, data: result[0] });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  });

  return router;
};
