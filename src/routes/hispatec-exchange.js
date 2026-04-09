/**
 * HISPATEC - Business Exchange / Marketplace
 * Tables: hispatec_companies, hispatec_rfqs, hispatec_rfq_responses, hispatec_opportunities
 */

const express = require('express');
const router = express.Router();
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

// -- Auth middleware --
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'hispatec-jwt-secret-2026';
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

// ============================================================
// COMPANIES
// ============================================================

// GET /companies -- Company directory (paginated, filterable)
router.get('/companies', async (req, res) => {
  try {
    const { sector, country, verified, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = [];
    const replacements = {};

    if (sector) {
      conditions.push('c.sector = :sector');
      replacements.sector = sector;
    }
    if (country) {
      conditions.push(':country = ANY(c.countries_served)');
      replacements.country = country;
    }
    if (verified !== undefined) {
      conditions.push('c.verified = :verified');
      replacements.verified = verified === 'true';
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await sequelize.query(
      `SELECT COUNT(*) as total FROM hispatec_companies c ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = parseInt(countResult[0].total);

    const companies = await sequelize.query(
      `SELECT c.*
       FROM hispatec_companies c
       ${where}
       ORDER BY c.created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: {
        companies,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (err) {
    console.error('[hispatec-exchange] GET /companies error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /companies -- Register company (auth required)
router.post('/companies', authMiddleware, async (req, res) => {
  try {
    const {
      name, description, sector, capabilities, certifications,
      countries_served, employee_count, annual_revenue_range, website
    } = req.body;

    if (!name || !sector) {
      return res.status(400).json({ success: false, error: 'name y sector son requeridos' });
    }

    // Build array literals
    const capArr = Array.isArray(capabilities) ? capabilities : [];
    const certArr = Array.isArray(certifications) ? certifications : [];
    const countriesArr = Array.isArray(countries_served) ? countries_served : [];

    const buildArraySql = (arr, prefix) => {
      if (arr.length === 0) return { sql: "ARRAY[]::TEXT[]", reps: {} };
      const reps = {};
      const parts = arr.map((v, i) => { reps[`${prefix}${i}`] = v; return `:${prefix}${i}`; });
      return { sql: `ARRAY[${parts.join(',')}]::TEXT[]`, reps };
    };

    const capSql = buildArraySql(capArr, 'cap');
    const certSql = buildArraySql(certArr, 'cert');
    const cSql = buildArraySql(countriesArr, 'cs');

    const result = await sequelize.query(
      `INSERT INTO hispatec_companies
        (name, description, sector, capabilities, certifications,
         countries_served, employee_count, annual_revenue_range, website,
         owner_member_id, verified, created_at, updated_at)
       VALUES
        (:name, :description, :sector, ${capSql.sql}, ${certSql.sql},
         ${cSql.sql}, :employee_count, :annual_revenue_range, :website,
         :owner_member_id, false, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          name, description: description || null, sector,
          employee_count: employee_count || null,
          annual_revenue_range: annual_revenue_range || null,
          website: website || null,
          owner_member_id: req.member.id,
          ...capSql.reps, ...certSql.reps, ...cSql.reps
        },
        type: QueryTypes.SELECT
      }
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[hispatec-exchange] POST /companies error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /companies/:id -- Company detail
router.get('/companies/:id', async (req, res) => {
  try {
    const companies = await sequelize.query(
      `SELECT c.*, m.first_name || ' ' || m.last_name AS owner_name
       FROM hispatec_companies c
       LEFT JOIN hispatec_members m ON m.id = c.owner_member_id
       WHERE c.id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (companies.length === 0) {
      return res.status(404).json({ success: false, error: 'Empresa no encontrada' });
    }

    return res.json({ success: true, data: companies[0] });
  } catch (err) {
    console.error('[hispatec-exchange] GET /companies/:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /companies/:id -- Update company (auth, owner only)
router.put('/companies/:id', authMiddleware, async (req, res) => {
  try {
    const companies = await sequelize.query(
      `SELECT * FROM hispatec_companies WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (companies.length === 0) {
      return res.status(404).json({ success: false, error: 'Empresa no encontrada' });
    }

    if (companies[0].owner_member_id !== req.member.id && req.member.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Solo el propietario o admin puede editar' });
    }

    const {
      name, description, sector, capabilities, certifications,
      countries_served, employee_count, annual_revenue_range, website
    } = req.body;

    const sets = [];
    const replacements = { id: req.params.id };

    if (name !== undefined) { sets.push('name = :name'); replacements.name = name; }
    if (description !== undefined) { sets.push('description = :description'); replacements.description = description; }
    if (sector !== undefined) { sets.push('sector = :sector'); replacements.sector = sector; }
    if (employee_count !== undefined) { sets.push('employee_count = :employee_count'); replacements.employee_count = employee_count; }
    if (annual_revenue_range !== undefined) { sets.push('annual_revenue_range = :annual_revenue_range'); replacements.annual_revenue_range = annual_revenue_range; }
    if (website !== undefined) { sets.push('website = :website'); replacements.website = website; }

    const buildArraySql = (arr, prefix) => {
      if (arr.length === 0) return { sql: "ARRAY[]::TEXT[]", reps: {} };
      const reps = {};
      const parts = arr.map((v, i) => { reps[`${prefix}${i}`] = v; return `:${prefix}${i}`; });
      return { sql: `ARRAY[${parts.join(',')}]::TEXT[]`, reps };
    };

    if (capabilities !== undefined) {
      const a = buildArraySql(Array.isArray(capabilities) ? capabilities : [], 'cap');
      sets.push(`capabilities = ${a.sql}`);
      Object.assign(replacements, a.reps);
    }
    if (certifications !== undefined) {
      const a = buildArraySql(Array.isArray(certifications) ? certifications : [], 'cert');
      sets.push(`certifications = ${a.sql}`);
      Object.assign(replacements, a.reps);
    }
    if (countries_served !== undefined) {
      const a = buildArraySql(Array.isArray(countries_served) ? countries_served : [], 'cs');
      sets.push(`countries_served = ${a.sql}`);
      Object.assign(replacements, a.reps);
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
    }

    sets.push('updated_at = NOW()');

    const result = await sequelize.query(
      `UPDATE hispatec_companies SET ${sets.join(', ')} WHERE id = :id RETURNING *`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[hispatec-exchange] PUT /companies/:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// RFQs (Requests for Quotation)
// ============================================================

// GET /rfqs -- List open RFQs (paginated, filterable)
router.get('/rfqs', async (req, res) => {
  try {
    const { sector, country, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = ["r.status = 'open'"];
    const replacements = {};

    if (sector) {
      conditions.push('r.sector = :sector');
      replacements.sector = sector;
    }
    if (country) {
      conditions.push(':country = ANY(r.countries_target)');
      replacements.country = country;
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const countResult = await sequelize.query(
      `SELECT COUNT(*) as total FROM hispatec_rfqs r ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = parseInt(countResult[0].total);

    const rfqs = await sequelize.query(
      `SELECT r.*, m.first_name || ' ' || m.last_name AS requester_name,
              co.name AS company_name
       FROM hispatec_rfqs r
       LEFT JOIN hispatec_members m ON m.id = r.requester_member_id
       LEFT JOIN hispatec_companies co ON co.id = r.company_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: {
        rfqs,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (err) {
    console.error('[hispatec-exchange] GET /rfqs error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /rfqs -- Create RFQ (auth required)
router.post('/rfqs', authMiddleware, async (req, res) => {
  try {
    const { title, description, sector, budget_range, deadline, countries_target, company_id } = req.body;

    if (!title || !description || !sector) {
      return res.status(400).json({ success: false, error: 'title, description y sector son requeridos' });
    }

    const countriesArr = Array.isArray(countries_target) ? countries_target : [];
    const buildArraySql = (arr, prefix) => {
      if (arr.length === 0) return { sql: "ARRAY[]::TEXT[]", reps: {} };
      const reps = {};
      const parts = arr.map((v, i) => { reps[`${prefix}${i}`] = v; return `:${prefix}${i}`; });
      return { sql: `ARRAY[${parts.join(',')}]::TEXT[]`, reps };
    };
    const ctSql = buildArraySql(countriesArr, 'ct');

    const result = await sequelize.query(
      `INSERT INTO hispatec_rfqs
        (title, description, sector, budget_range, deadline, countries_target,
         company_id, requester_member_id, status, created_at, updated_at)
       VALUES
        (:title, :description, :sector, :budget_range, :deadline, ${ctSql.sql},
         :company_id, :requester_member_id, 'open', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          title, description, sector,
          budget_range: budget_range || null,
          deadline: deadline || null,
          company_id: company_id || null,
          requester_member_id: req.member.id,
          ...ctSql.reps
        },
        type: QueryTypes.SELECT
      }
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[hispatec-exchange] POST /rfqs error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /rfqs/:id -- RFQ detail with responses
router.get('/rfqs/:id', async (req, res) => {
  try {
    const rfqs = await sequelize.query(
      `SELECT r.*, m.first_name || ' ' || m.last_name AS requester_name,
              co.name AS company_name
       FROM hispatec_rfqs r
       LEFT JOIN hispatec_members m ON m.id = r.requester_member_id
       LEFT JOIN hispatec_companies co ON co.id = r.company_id
       WHERE r.id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (rfqs.length === 0) {
      return res.status(404).json({ success: false, error: 'RFQ no encontrada' });
    }

    const responses = await sequelize.query(
      `SELECT rr.*, m.first_name || ' ' || m.last_name AS responder_name,
              co.name AS responder_company
       FROM hispatec_rfq_responses rr
       LEFT JOIN hispatec_members m ON m.id = rr.responder_member_id
       LEFT JOIN hispatec_companies co ON co.id = rr.company_id
       WHERE rr.rfq_id = :id
       ORDER BY rr.created_at ASC`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: { ...rfqs[0], responses } });
  } catch (err) {
    console.error('[hispatec-exchange] GET /rfqs/:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /rfqs/:id/respond -- Submit response to RFQ (auth required)
router.post('/rfqs/:id/respond', authMiddleware, async (req, res) => {
  try {
    const rfqs = await sequelize.query(
      `SELECT * FROM hispatec_rfqs WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (rfqs.length === 0) {
      return res.status(404).json({ success: false, error: 'RFQ no encontrada' });
    }

    if (rfqs[0].status !== 'open') {
      return res.status(400).json({ success: false, error: 'Esta RFQ ya no acepta respuestas' });
    }

    const { proposal_text, price_quote, currency, delivery_timeline, company_id } = req.body;

    if (!proposal_text) {
      return res.status(400).json({ success: false, error: 'proposal_text es requerido' });
    }

    const result = await sequelize.query(
      `INSERT INTO hispatec_rfq_responses
        (rfq_id, responder_member_id, company_id, proposal_text, price_quote, currency,
         delivery_timeline, status, created_at, updated_at)
       VALUES
        (:rfq_id, :responder_member_id, :company_id, :proposal_text, :price_quote, :currency,
         :delivery_timeline, 'submitted', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          rfq_id: req.params.id,
          responder_member_id: req.member.id,
          company_id: company_id || null,
          proposal_text,
          price_quote: price_quote || null,
          currency: currency || 'USD',
          delivery_timeline: delivery_timeline || null
        },
        type: QueryTypes.SELECT
      }
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[hispatec-exchange] POST /rfqs/:id/respond error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /rfqs/:id/award -- Award RFQ to a response (auth, RFQ owner only)
router.put('/rfqs/:id/award', authMiddleware, async (req, res) => {
  try {
    const rfqs = await sequelize.query(
      `SELECT * FROM hispatec_rfqs WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (rfqs.length === 0) {
      return res.status(404).json({ success: false, error: 'RFQ no encontrada' });
    }

    if (rfqs[0].requester_member_id !== req.member.id && req.member.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Solo el creador de la RFQ o admin puede adjudicar' });
    }

    const { response_id } = req.body;
    if (!response_id) {
      return res.status(400).json({ success: false, error: 'response_id es requerido' });
    }

    // Verify response belongs to this RFQ
    const responses = await sequelize.query(
      `SELECT * FROM hispatec_rfq_responses WHERE id = :response_id AND rfq_id = :rfq_id`,
      { replacements: { response_id, rfq_id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (responses.length === 0) {
      return res.status(404).json({ success: false, error: 'Respuesta no encontrada para esta RFQ' });
    }

    // Award the response and close the RFQ
    await sequelize.query(
      `UPDATE hispatec_rfq_responses SET status = 'awarded', updated_at = NOW() WHERE id = :response_id`,
      { replacements: { response_id }, type: QueryTypes.SELECT }
    );

    // Mark other responses as not-selected
    await sequelize.query(
      `UPDATE hispatec_rfq_responses SET status = 'not_selected', updated_at = NOW()
       WHERE rfq_id = :rfq_id AND id != :response_id AND status = 'submitted'`,
      { replacements: { rfq_id: req.params.id, response_id }, type: QueryTypes.SELECT }
    );

    // Close the RFQ
    const updatedRfq = await sequelize.query(
      `UPDATE hispatec_rfqs SET status = 'awarded', awarded_response_id = :response_id, updated_at = NOW()
       WHERE id = :id RETURNING *`,
      { replacements: { response_id, id: req.params.id }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: { rfq: updatedRfq[0], awarded_response: responses[0] } });
  } catch (err) {
    console.error('[hispatec-exchange] PUT /rfqs/:id/award error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// OPPORTUNITIES
// ============================================================

// GET /opportunities -- List opportunities (paginated, filterable)
router.get('/opportunities', async (req, res) => {
  try {
    const { sector, country, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = [];
    const replacements = {};

    if (sector) {
      conditions.push('o.sector = :sector');
      replacements.sector = sector;
    }
    if (country) {
      conditions.push(':country = ANY(o.countries)');
      replacements.country = country;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await sequelize.query(
      `SELECT COUNT(*) as total FROM hispatec_opportunities o ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = parseInt(countResult[0].total);

    const opportunities = await sequelize.query(
      `SELECT o.*, m.first_name || ' ' || m.last_name AS posted_by_name
       FROM hispatec_opportunities o
       LEFT JOIN hispatec_members m ON m.id = o.posted_by_member_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: {
        opportunities,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (err) {
    console.error('[hispatec-exchange] GET /opportunities error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /opportunities -- Post opportunity (auth required)
router.post('/opportunities', authMiddleware, async (req, res) => {
  try {
    const { title, description, sector, countries, source, url, expires_at } = req.body;

    if (!title || !description || !sector) {
      return res.status(400).json({ success: false, error: 'title, description y sector son requeridos' });
    }

    const countriesArr = Array.isArray(countries) ? countries : [];
    const buildArraySql = (arr, prefix) => {
      if (arr.length === 0) return { sql: "ARRAY[]::TEXT[]", reps: {} };
      const reps = {};
      const parts = arr.map((v, i) => { reps[`${prefix}${i}`] = v; return `:${prefix}${i}`; });
      return { sql: `ARRAY[${parts.join(',')}]::TEXT[]`, reps };
    };
    const cSql = buildArraySql(countriesArr, 'co');

    const result = await sequelize.query(
      `INSERT INTO hispatec_opportunities
        (title, description, sector, countries, source, url, expires_at,
         posted_by_member_id, created_at, updated_at)
       VALUES
        (:title, :description, :sector, ${cSql.sql}, :source, :url, :expires_at,
         :posted_by_member_id, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          title, description, sector,
          source: source || null,
          url: url || null,
          expires_at: expires_at || null,
          posted_by_member_id: req.member.id,
          ...cSql.reps
        },
        type: QueryTypes.SELECT
      }
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[hispatec-exchange] POST /opportunities error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
