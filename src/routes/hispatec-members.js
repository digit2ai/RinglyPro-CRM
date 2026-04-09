const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.JWT_SECRET || 'hispatec-jwt-secret-2026';

// Auth middleware -- verifies JWT and attaches req.member
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Token de autenticacion requerido'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.member = {
      id: decoded.member_id,
      email: decoded.email,
      membership_type: decoded.membership_type
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Token invalido o expirado'
    });
  }
}

// GET / -- Member directory with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      region_id, sector, country, membership_type, search,
      page = 1, limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const replacements = { limit: limitNum, offset };

    if (region_id) {
      conditions.push('region_id = :region_id');
      replacements.region_id = region_id;
    }
    if (sector) {
      conditions.push('sector = :sector');
      replacements.sector = sector;
    }
    if (country) {
      conditions.push('country = :country');
      replacements.country = country;
    }
    if (membership_type) {
      conditions.push('membership_type = :membership_type');
      replacements.membership_type = membership_type;
    }
    if (search) {
      conditions.push(
        `(first_name ILIKE :search OR last_name ILIKE :search OR company_name ILIKE :search)`
      );
      replacements.search = `%${search}%`;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countQuery = `SELECT COUNT(*) AS total FROM hispatec_members ${whereClause}`;
    const [countResult] = await sequelize.query(countQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT
    });
    const total = parseInt(countResult.total, 10);

    const dataQuery = `
      SELECT id, email, first_name, last_name, country, region_id,
             sector, sub_specialty, years_experience, languages,
             company_name, membership_type, bio, linkedin_url, website_url,
             verification_level, created_at
      FROM hispatec_members
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset
    `;
    const members = await sequelize.query(dataQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT
    });

    return res.json({
      success: true,
      data: {
        members,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          total_pages: Math.ceil(total / limitNum)
        }
      },
      error: null
    });
  } catch (err) {
    console.error('[hispatec-members] Directory error:', err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Error interno al consultar el directorio'
    });
  }
});

// GET /:id -- Single member profile (public fields only)
router.get('/:id', async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    if (isNaN(memberId)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'ID de miembro invalido'
      });
    }

    const [member] = await sequelize.query(
      `SELECT id, email, first_name, last_name, country, region_id,
              sector, sub_specialty, years_experience, languages,
              company_name, membership_type, bio, phone, linkedin_url, website_url,
              verification_level, created_at, updated_at
       FROM hispatec_members WHERE id = :id LIMIT 1`,
      { replacements: { id: memberId }, type: Sequelize.QueryTypes.SELECT }
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Miembro no encontrado'
      });
    }

    return res.json({
      success: true,
      data: member,
      error: null
    });
  } catch (err) {
    console.error('[hispatec-members] Profile error:', err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Error interno al obtener el perfil'
    });
  }
});

// PUT /:id -- Update own profile (auth required)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    if (isNaN(memberId)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'ID de miembro invalido'
      });
    }

    // Members can only update their own profile
    if (req.member.id !== memberId) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Solo puedes actualizar tu propio perfil'
      });
    }

    // Allowed fields for update (no password_hash, no id, no email)
    const allowedFields = [
      'first_name', 'last_name', 'country', 'region_id', 'sector',
      'sub_specialty', 'years_experience', 'languages', 'company_name',
      'bio', 'phone', 'linkedin_url', 'website_url'
    ];

    const setClauses = [];
    const replacements = { id: memberId };

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'languages' && Array.isArray(req.body[field])) {
          setClauses.push(`${field} = :${field}`);
          replacements[field] = JSON.stringify(req.body[field]);
        } else {
          setClauses.push(`${field} = :${field}`);
          replacements[field] = req.body[field];
        }
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No se proporcionaron campos para actualizar'
      });
    }

    setClauses.push('updated_at = NOW()');

    const updateQuery = `
      UPDATE hispatec_members
      SET ${setClauses.join(', ')}
      WHERE id = :id
      RETURNING id, email, first_name, last_name, country, region_id,
                sector, sub_specialty, years_experience, languages,
                company_name, membership_type, bio, phone, linkedin_url, website_url,
                verification_level, created_at, updated_at
    `;

    const [results] = await sequelize.query(updateQuery, { replacements });
    const updated = results[0];

    if (!updated) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Miembro no encontrado'
      });
    }

    return res.json({
      success: true,
      data: updated,
      error: null
    });
  } catch (err) {
    console.error('[hispatec-members] Update error:', err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Error interno al actualizar el perfil'
    });
  }
});

// POST /:id/verify -- Request verification upgrade
router.post('/:id/verify', authMiddleware, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    if (isNaN(memberId)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'ID de miembro invalido'
      });
    }

    // Members can only request verification for themselves
    if (req.member.id !== memberId) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Solo puedes solicitar verificacion para tu propia cuenta'
      });
    }

    const [results] = await sequelize.query(
      `UPDATE hispatec_members
       SET verification_level = 'pending', updated_at = NOW()
       WHERE id = :id
       RETURNING id, email, first_name, last_name, verification_level`,
      { replacements: { id: memberId } }
    );

    const member = results[0];
    if (!member) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Miembro no encontrado'
      });
    }

    return res.json({
      success: true,
      data: {
        id: member.id,
        email: member.email,
        verification_level: member.verification_level,
        message: 'Solicitud de verificacion enviada. Sera revisada por el equipo.'
      },
      error: null
    });
  } catch (err) {
    console.error('[hispatec-members] Verify request error:', err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Error interno al solicitar verificacion'
    });
  }
});

module.exports = router;
