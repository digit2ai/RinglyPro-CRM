/**
 * CamaraVirtual.app - Platform Admin Routes
 * Manages demo requests and chamber ecosystem provisioning
 */
const express = require('express');
const router = express.Router();
const { Sequelize, QueryTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.CAMARAVIRTUAL_JWT_SECRET || 'cv-platform-jwt-2026-secret';

// Auto-create tables on load
(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS camaravirtual_demo_requests (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        chamber_name VARCHAR(255) NOT NULL,
        region VARCHAR(100),
        members_count VARCHAR(50),
        message TEXT,
        status VARCHAR(30) DEFAULT 'new',
        notes TEXT,
        ecosystem_slug VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS camaravirtual_admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(200),
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Seed default admin if not exists
    const [existing] = await sequelize.query(
      `SELECT id FROM camaravirtual_admins WHERE email = 'mstagg@digit2ai.com' LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    if (!existing) {
      const hash = await bcrypt.hash('Palindrome@7', 10);
      await sequelize.query(
        `INSERT INTO camaravirtual_admins (email, password_hash, name, role) VALUES ('mstagg@digit2ai.com', :hash, 'Manuel Stagg', 'superadmin')`,
        { replacements: { hash } }
      );
      console.log('CamaraVirtual default admin seeded');
    }
    console.log('CamaraVirtual tables ready');
  } catch (e) {
    console.error('CamaraVirtual table creation failed:', e.message);
  }
})();

// --- AUTH ---
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, error: 'Email y contrasena requeridos' });
    const [admin] = await sequelize.query(
      `SELECT * FROM camaravirtual_admins WHERE email = :email LIMIT 1`,
      { replacements: { email: email.toLowerCase().trim() }, type: QueryTypes.SELECT }
    );
    if (!admin) return res.json({ success: false, error: 'Credenciales invalidas' });
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.json({ success: false, error: 'Credenciales invalidas' });
    const token = jwt.sign({ admin_id: admin.id, email: admin.email, role: admin.role, name: admin.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, data: { token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Token required' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// ========================================
// PUBLIC: Submit demo request
// ========================================
router.post('/demo-requests', async (req, res) => {
  try {
    const { first_name, last_name, email, chamber_name, region, members_count, message } = req.body;
    if (!first_name || !last_name || !email || !chamber_name) {
      return res.json({ success: false, error: 'Campos requeridos: nombre, apellido, email, nombre de camara' });
    }
    await sequelize.query(
      `INSERT INTO camaravirtual_demo_requests (first_name, last_name, email, chamber_name, region, members_count, message)
       VALUES (:first_name, :last_name, :email, :chamber_name, :region, :members_count, :message)`,
      { replacements: { first_name, last_name, email: email.toLowerCase().trim(), chamber_name, region: region || null, members_count: members_count || null, message: message || null } }
    );
    res.json({ success: true, message: 'Demo request received' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// ADMIN: List all demo requests
// ========================================
router.get('/admin/demo-requests', adminAuth, async (req, res) => {
  try {
    const requests = await sequelize.query(
      `SELECT * FROM camaravirtual_demo_requests ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT }
    );
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// ADMIN: Update demo request status/notes
// ========================================
router.put('/admin/demo-requests/:id', adminAuth, async (req, res) => {
  try {
    const { status, notes, ecosystem_slug } = req.body;
    const sets = [];
    const replacements = { id: parseInt(req.params.id) };
    if (status) { sets.push('status = :status'); replacements.status = status; }
    if (notes !== undefined) { sets.push('notes = :notes'); replacements.notes = notes; }
    if (ecosystem_slug) { sets.push('ecosystem_slug = :ecosystem_slug'); replacements.ecosystem_slug = ecosystem_slug; }
    sets.push('updated_at = NOW()');
    await sequelize.query(
      `UPDATE camaravirtual_demo_requests SET ${sets.join(', ')} WHERE id = :id`,
      { replacements }
    );
    res.json({ success: true, message: 'Updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// ADMIN: Delete demo request
// ========================================
router.delete('/admin/demo-requests/:id', adminAuth, async (req, res) => {
  try {
    await sequelize.query(`DELETE FROM camaravirtual_demo_requests WHERE id = :id`, { replacements: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// ADMIN: Create ecosystem from demo request
// ========================================
router.post('/admin/create-ecosystem', adminAuth, async (req, res) => {
  try {
    const { slug, name, short_name, tagline, description, language, regions, sectors, request_id } = req.body;
    if (!slug || !name) {
      return res.status(400).json({ success: false, error: 'slug and name required' });
    }

    // Check if config already exists
    const configPath = path.join(__dirname, '..', '..', 'configs', `${slug}.json`);
    if (fs.existsSync(configPath)) {
      return res.status(409).json({ success: false, error: `Config ${slug}.json already exists` });
    }

    // Build config from template
    const config = {
      slug,
      name,
      short_name: short_name || slug.toUpperCase(),
      tagline: tagline || `Camara de Comercio Digital - ${name}`,
      description: description || `Ecosistema digital impulsado por inteligencia artificial para ${name}.`,
      language: language || 'es',
      colors: {
        primary: '#003DA5', primary_dark: '#002D7A', primary_light: '#E6EEF8',
        secondary: '#CE1126', secondary_dark: '#A00D1E',
        accent: '#FCD116', accent_light: '#FFF4CC', accent_dark: '#C9A60E',
        navy: '#1A2332', navy_light: '#2D3A4D', white: '#FFFFFF', gray_50: '#F8F9FA'
      },
      db_prefix: slug.replace(/-/g, '_'),
      mount_path: `/chamber/${slug}`,
      jwt_secret: `${slug}-chamber-jwt-2026`,
      regions: regions || [
        { id: 1, name: 'Region 1' }, { id: 2, name: 'Region 2' },
        { id: 3, name: 'Region 3' }, { id: 4, name: 'Region 4' }
      ],
      sectors: sectors || [
        'tecnologia', 'salud', 'comercio_exterior', 'construccion',
        'servicios_profesionales', 'educacion', 'finanzas', 'logistica',
        'manufactura', 'legal', 'consultoria', 'marketing_digital'
      ],
      membership_tiers: {
        emprendedor: { monthly: 10, annual: 96, label: 'Miembro Emprendedor' },
        empresarial: { monthly: 25, annual: 240, label: 'Miembro Empresarial' },
        corporativo: { monthly: 75, annual: 720, label: 'Miembro Corporativo' },
        fundador: { monthly: 0, annual: 0, label: 'Miembro Fundador (por invitacion)' }
      },
      membership_scores: { emprendedor: 0.3, empresarial: 0.5, corporativo: 0.8, fundador: 1.0 },
      governance_roles: [
        'superadmin', 'presidente', 'vicepresidente', 'secretario', 'tesorero', 'vocal',
        'coordinador_comite', 'miembro_comite', 'miembro'
      ],
      features: { matching: true, exchange: true, mcp: true, payments: true, monte_carlo: true, trust_rank: true },
      admin_account: {
        email: `admin@${slug}.chamber`,
        password: `${short_name || slug}-Admin-2026!`,
        first_name: short_name || slug,
        last_name: 'Administrador'
      }
    };

    // Write config file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Create static file directories
    const publicDir = path.join(__dirname, '..', '..', 'public', 'chamber', slug);
    const dashDir = path.join(publicDir, 'dashboard');
    const audioDir = path.join(publicDir, 'assets', 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    fs.mkdirSync(dashDir, { recursive: true });

    // Copy template files from hispamind
    const templateDir = path.join(__dirname, '..', '..', 'public', 'chamber', 'hispamind');
    const filesToCopy = [
      { src: 'index.html', dest: 'index.html' },
      { src: 'presentation.html', dest: 'presentation.html' },
      { src: 'dashboard/index.html', dest: 'dashboard/index.html' }
    ];
    for (const f of filesToCopy) {
      const srcPath = path.join(templateDir, f.src);
      const destPath = path.join(publicDir, f.dest);
      if (fs.existsSync(srcPath)) {
        let content = fs.readFileSync(srcPath, 'utf-8');
        // Replace hispamind references with new slug
        content = content.replace(/hispamind/g, slug);
        content = content.replace(/CamaraVirtual\.app/g, short_name || name);
        fs.writeFileSync(destPath, content);
      }
    }

    // Update demo request if request_id provided
    if (request_id) {
      await sequelize.query(
        `UPDATE camaravirtual_demo_requests SET status = 'provisioned', ecosystem_slug = :slug, updated_at = NOW() WHERE id = :id`,
        { replacements: { slug, id: parseInt(request_id) } }
      );
    }

    res.json({
      success: true,
      message: `Ecosystem ${slug} created`,
      data: {
        config_path: `configs/${slug}.json`,
        mount_path: `/chamber/${slug}`,
        public_dir: `public/chamber/${slug}/`,
        admin_email: config.admin_account.email,
        note: 'Restart server or redeploy to activate API routes'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// ADMIN: List all active ecosystems
// ========================================
router.get('/admin/ecosystems', adminAuth, async (req, res) => {
  try {
    const configsDir = path.join(__dirname, '..', '..', 'configs');
    const configs = [];
    if (fs.existsSync(configsDir)) {
      const files = fs.readdirSync(configsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const config = JSON.parse(fs.readFileSync(path.join(configsDir, file), 'utf-8'));
          configs.push({
            slug: config.slug,
            name: config.name,
            short_name: config.short_name,
            mount_path: config.mount_path,
            regions_count: config.regions ? config.regions.length : 0,
            sectors_count: config.sectors ? config.sectors.length : 0,
            file: file
          });
        } catch (e) { /* skip invalid */ }
      }
    }
    res.json({ success: true, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
