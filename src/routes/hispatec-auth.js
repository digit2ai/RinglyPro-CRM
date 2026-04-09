const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.JWT_SECRET || 'hispatec-jwt-secret-2026';
const JWT_EXPIRY = '7d';

// POST /register -- Create a new member
router.post('/register', async (req, res) => {
  try {
    const {
      email, password, first_name, last_name, country, region_id,
      sector, sub_specialty, years_experience, languages,
      company_name, membership_type, bio, phone, linkedin_url, website_url
    } = req.body;

    if (!email || !password || !first_name || !last_name) {
      return res.json({
        success: false,
        data: null,
        error: 'Campos obligatorios: email, password, first_name, last_name'
      });
    }

    // Check if email already exists
    const [existing] = await sequelize.query(
      'SELECT id FROM hispatec_members WHERE email = :email LIMIT 1',
      { replacements: { email: email.toLowerCase().trim() }, type: Sequelize.QueryTypes.SELECT }
    );

    if (existing) {
      return res.json({
        success: false,
        data: null,
        error: 'Ya existe una cuenta con este correo electronico'
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const [results] = await sequelize.query(
      `INSERT INTO hispatec_members (
        email, password_hash, first_name, last_name, country, region_id,
        sector, sub_specialty, years_experience, languages,
        company_name, membership_type, bio, phone, linkedin_url, website_url,
        created_at, updated_at
      ) VALUES (
        :email, :password_hash, :first_name, :last_name, :country, :region_id,
        :sector, :sub_specialty, :years_experience, :languages,
        :company_name, :membership_type, :bio, :phone, :linkedin_url, :website_url,
        NOW(), NOW()
      ) RETURNING id, email, first_name, last_name, membership_type`,
      {
        replacements: {
          email: email.toLowerCase().trim(),
          password_hash,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          country: country || null,
          region_id: region_id || null,
          sector: sector || null,
          sub_specialty: sub_specialty || null,
          years_experience: years_experience || null,
          languages: languages ? JSON.stringify(languages) : null,
          company_name: company_name || null,
          membership_type: membership_type || 'free',
          bio: bio || null,
          phone: phone || null,
          linkedin_url: linkedin_url || null,
          website_url: website_url || null
        }
      }
    );

    const member = results[0];

    const token = jwt.sign(
      {
        member_id: member.id,
        email: member.email,
        membership_type: member.membership_type,
        first_name: member.first_name,
        last_name: member.last_name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.json({
      success: true,
      data: { token, member },
      error: null
    });
  } catch (err) {
    console.error('[hispatec-auth] Register error:', err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Error interno al registrar la cuenta'
    });
  }
});

// POST /login -- Authenticate and return JWT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({
        success: false,
        data: null,
        error: 'Correo y contrasena son obligatorios'
      });
    }

    const [member] = await sequelize.query(
      `SELECT id, email, password_hash, first_name, last_name, membership_type
       FROM hispatec_members WHERE email = :email LIMIT 1`,
      { replacements: { email: email.toLowerCase().trim() }, type: Sequelize.QueryTypes.SELECT }
    );

    if (!member) {
      return res.json({
        success: false,
        data: null,
        error: 'Credenciales invalidas'
      });
    }

    const valid = await bcrypt.compare(password, member.password_hash);
    if (!valid) {
      return res.json({
        success: false,
        data: null,
        error: 'Credenciales invalidas'
      });
    }

    const token = jwt.sign(
      {
        member_id: member.id,
        email: member.email,
        membership_type: member.membership_type,
        first_name: member.first_name,
        last_name: member.last_name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.json({
      success: true,
      data: {
        token,
        member: {
          id: member.id,
          email: member.email,
          first_name: member.first_name,
          last_name: member.last_name,
          membership_type: member.membership_type
        }
      },
      error: null
    });
  } catch (err) {
    console.error('[hispatec-auth] Login error:', err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Error interno al iniciar sesion'
    });
  }
});

// GET /me -- Return full profile for authenticated member
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Token de autenticacion requerido'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Token invalido o expirado'
      });
    }

    const [member] = await sequelize.query(
      `SELECT id, email, first_name, last_name, country, region_id,
              sector, sub_specialty, years_experience, languages,
              company_name, membership_type, bio, phone, linkedin_url, website_url,
              verification_status, created_at, updated_at
       FROM hispatec_members WHERE id = :id LIMIT 1`,
      { replacements: { id: decoded.member_id }, type: Sequelize.QueryTypes.SELECT }
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
    console.error('[hispatec-auth] /me error:', err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Error interno al obtener el perfil'
    });
  }
});

module.exports = router;
