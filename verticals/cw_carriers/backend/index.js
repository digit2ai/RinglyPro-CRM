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
const settingsRoutes = require('./routes/settings');
const demoRoutes = require('./routes/demo');
const tmsRoutes = require('./routes/tms');
const reportsRoutes = require('./routes/reports');
const alertsRoutes = require('./routes/alerts');
const collectorRoutes = require('./routes/collector');
const offersRoutes = require('./routes/offers');
const checkCallsRoutes = require('./routes/checkcalls');
const billingRoutes = require('./routes/billing');
// Brokerage routes
const pricingRoutes = require('./routes/pricing');
const loadmatchingRoutes = require('./routes/loadmatching');
const ingestionRoutes = require('./routes/ingestion');
const brokerageAnalyticsRoutes = require('./routes/analytics-brokerage');
const brokerageDemoRoutes = require('./routes/demo-brokerage');

// Mount API routes
router.use('/api/auth', authRoutes);
router.use('/api/contacts', contactsRoutes);
router.use('/api/loads', loadsRoutes);
router.use('/api/calls', callsRoutes);
router.use('/api/hubspot', hubspotRoutes);
router.use('/api/nlp', nlpRoutes);
router.use('/api/analytics', analyticsRoutes);
router.use('/api/voice', voiceRoutes);
router.use('/api/settings', settingsRoutes);
router.use('/api/demo', demoRoutes);
router.use('/api/tms', tmsRoutes);
router.use('/api/reports', reportsRoutes);
router.use('/api/alerts', alertsRoutes);
router.use('/api/collector', collectorRoutes);
router.use('/api/offers', offersRoutes);
router.use('/api/checkcalls', checkCallsRoutes);
router.use('/api/billing', billingRoutes);
// Brokerage API routes
router.use('/api/pricing', pricingRoutes);
router.use('/api/load-matching', loadmatchingRoutes);
router.use('/api/ingestion', ingestionRoutes);
router.use('/api/brokerage-analytics', brokerageAnalyticsRoutes);
router.use('/api/brokerage-demo', brokerageDemoRoutes);

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
    // Run schema migrations
    const fs = require('fs');
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await sequelize.query(sql);
        console.log(`  ✅ CW Carriers migration: ${file}`);
      }
    }

    // Seed admin user — always upsert to ensure password is current
    const email = process.env.CW_USER_EMAIL || 'cwcarriers@ringlypro.com';
    const password = process.env.CW_USER_PASSWORD || 'CWCarriers2026!';
    const hash = await bcrypt.hash(password, 12);

    const [existingRows] = await sequelize.query(
      `SELECT id FROM cw_users WHERE email = $1`, { bind: [email] }
    );
    if (existingRows && existingRows.length > 0) {
      // Update password hash in case env var changed
      await sequelize.query(
        `UPDATE cw_users SET password_hash = $1, updated_at = NOW() WHERE email = $2`,
        { bind: [hash, email] }
      );
      console.log('  ✅ CW Carriers admin user password updated');
    } else {
      await sequelize.query(
        `INSERT INTO cw_users (email, password_hash, tenant_id, role, full_name, status, created_at, updated_at)
         VALUES ($1, $2, 'cw_carriers', 'admin', 'CW Carriers Admin', 'active', NOW(), NOW())`,
        { bind: [email, hash] }
      );
      console.log('  ✅ CW Carriers admin user created');
    }
    // Seed additional admin users
    const extraUsers = [
      { email: 'mstagg@ringlypro.com', password: 'Palindrome@7', name: 'Manuel Stagg' },
      { email: 'mstagg@digit2ai.com', password: 'Palindrome@7', name: 'Manuel Stagg' },
    ];
    for (const u of extraUsers) {
      const h = await bcrypt.hash(u.password, 12);
      const [ex] = await sequelize.query(`SELECT id FROM cw_users WHERE email = $1`, { bind: [u.email] });
      if (ex && ex.length > 0) {
        await sequelize.query(`UPDATE cw_users SET password_hash = $1, updated_at = NOW() WHERE email = $2`, { bind: [h, u.email] });
      } else {
        await sequelize.query(`INSERT INTO cw_users (email, password_hash, tenant_id, role, full_name, status, created_at, updated_at) VALUES ($1, $2, 'cw_carriers', 'admin', $3, 'active', NOW(), NOW())`, { bind: [u.email, h, u.name] });
      }
    }
    console.log('  ✅ CW Carriers admin users initialized');
  } catch (err) {
    console.error('  ⚠️ CW Carriers init error:', err.message);
  }
}

// Run init on load
initialize();

module.exports = router;
