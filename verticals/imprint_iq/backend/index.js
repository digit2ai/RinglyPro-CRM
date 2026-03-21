const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const router = express.Router();
const sequelize = require('./services/db.iq');

// Import routes
const authRoutes = require('./routes/auth');
const neuralRoutes = require('./routes/neural');
const dashboardRoutes = require('./routes/dashboard');
const ingestionRoutes = require('./routes/ingestion');

// Mount API routes
router.use('/api/auth', authRoutes);
router.use('/api/neural', neuralRoutes);
router.use('/api/dashboard', dashboardRoutes);
router.use('/api/ingestion', ingestionRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    service: 'ImprintIQ',
    tagline: 'Intelligence for Every Impression',
    status: 'healthy',
    version: '1.0.0',
    agents: 11,
    neuralPanels: 6,
    diagnosticAnalyzers: 15,
    timestamp: new Date().toISOString()
  });
});

// Serve React SPA static files
const distPath = path.join(__dirname, '../frontend/dist');
router.use(express.static(distPath));

// SPA fallback
router.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize: run migrations, seed admin, seed demo data
async function initialize() {
  try {
    // Run schema migrations
    const fs = require('fs');
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await sequelize.query(sql);
      }
      console.log(`  ✅ ImprintIQ schema initialized (${files.length} migrations)`);
    }

    // Seed admin user
    const email = process.env.IMPRINT_IQ_USER_EMAIL || 'admin@imprintiq.com';
    const password = process.env.IMPRINT_IQ_USER_PASSWORD || 'ImprintIQ2026!';
    const hash = await bcrypt.hash(password, 12);

    const [existingRows] = await sequelize.query(
      `SELECT id FROM iq_users WHERE email = $1`, { bind: [email] }
    );
    if (existingRows && existingRows.length > 0) {
      await sequelize.query(
        `UPDATE iq_users SET password_hash = $1, updated_at = NOW() WHERE email = $2`,
        { bind: [hash, email] }
      );
    } else {
      await sequelize.query(
        `INSERT INTO iq_users (email, password_hash, tenant_id, role, full_name, status, created_at, updated_at)
         VALUES ($1, $2, 'imprint_iq', 'admin', 'ImprintIQ Admin', 'active', NOW(), NOW())`,
        { bind: [email, hash] }
      );
      console.log('  ✅ ImprintIQ admin user created');
    }

    // Seed demo data
    const { seed } = require('./services/seed.iq');
    await seed();

  } catch (err) {
    console.error('  ⚠️ ImprintIQ init error:', err.message);
  }
}

initialize();

module.exports = router;
