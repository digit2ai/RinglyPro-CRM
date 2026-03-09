const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const router = express.Router();
const sequelize = require('./services/db.cw');

// Import routes
const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const loadsRoutes = require('./routes/loads');
const callsRoutes = require('./routes/calls');
const hubspotRoutes = require('./routes/hubspot');
const nlpRoutes = require('./routes/nlp');
const analyticsRoutes = require('./routes/analytics');
const voiceRoutes = require('./routes/voice');

// Mount API routes
router.use('/api/auth', authRoutes);
router.use('/api/contacts', contactsRoutes);
router.use('/api/loads', loadsRoutes);
router.use('/api/calls', callsRoutes);
router.use('/api/hubspot', hubspotRoutes);
router.use('/api/nlp', nlpRoutes);
router.use('/api/analytics', analyticsRoutes);
router.use('/api/voice', voiceRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    service: 'CW Carriers USA',
    status: 'healthy',
    tenant_id: 'cw_carriers',
    timestamp: new Date().toISOString()
  });
});

// Serve React SPA static files
const distPath = path.join(__dirname, '../frontend/dist');
router.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
router.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize: run migrations and seed admin user
async function initialize() {
  try {
    // Run schema migration
    const fs = require('fs');
    const migrationPath = path.join(__dirname, 'migrations', '001_cw_schema.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await sequelize.query(sql);
      console.log('  ✅ CW Carriers schema initialized');
    }

    // Seed admin user if not exists
    const email = process.env.CW_USER_EMAIL || 'cwcarriers@ringlypro.com';
    const password = process.env.CW_USER_PASSWORD || 'CWCarriers2026!';
    const [[existing]] = await sequelize.query(
      `SELECT id FROM cw_users WHERE email = $1`, { bind: [email] }
    );
    if (!existing) {
      const hash = await bcrypt.hash(password, 12);
      await sequelize.query(
        `INSERT INTO cw_users (email, password_hash, tenant_id, role, full_name, status, created_at, updated_at)
         VALUES ($1, $2, 'cw_carriers', 'admin', 'CW Carriers Admin', 'active', NOW(), NOW())`,
        { bind: [email, hash] }
      );
      console.log('  ✅ CW Carriers admin user created');
    }
  } catch (err) {
    console.error('  ⚠️ CW Carriers init error:', err.message);
  }
}

// Run init on load
initialize();

module.exports = router;
