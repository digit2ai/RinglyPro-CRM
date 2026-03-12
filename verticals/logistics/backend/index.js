const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const router = express.Router();
const sequelize = require('./services/db.lg');

const TIERS = {
  starter: { name: 'Freight CRM', modules: ['dashboard', 'auth', 'tools'] },
  professional: { name: 'Freight Pro', modules: ['dashboard', 'auth', 'tools', 'shipper', 'carrier', 'documents', 'ingestion'] },
  enterprise: { name: 'Logistics AI', modules: ['dashboard', 'auth', 'tools', 'shipper', 'carrier', 'documents', 'fmcsa', 'matching', 'pricing', 'load-matching', 'ingestion', 'analytics'] },
  warehouse: { name: 'Warehouse OPS', modules: ['dashboard', 'auth', 'tools'] },
  full: { name: 'RinglyPro Logistics', modules: ['dashboard', 'auth', 'tools', 'shipper', 'carrier', 'documents', 'fmcsa', 'matching', 'pricing', 'load-matching', 'ingestion', 'analytics', 'demo'] }
};

const ACTIVE_TIER = process.env.LG_TIER || 'full';
const activeTierConfig = TIERS[ACTIVE_TIER] || TIERS.full;

function requireTier(module) {
  return (req, res, next) => {
    if (!activeTierConfig.modules.includes(module)) {
      return res.status(403).json({ error: `Module "${module}" not available in ${activeTierConfig.name} tier`, current_tier: ACTIVE_TIER, upgrade_message: 'Upgrade to access this feature. Contact sales@ringlypro.com' });
    }
    next();
  };
}

// --- Existing routes ---
router.use('/api/auth', require('./routes/auth'));
router.use('/api/tools', requireTier('tools'), require('./routes/tools'));
router.use('/api/shipper', requireTier('shipper'), require('./routes/shipper'));
router.use('/api/carrier', requireTier('carrier'), require('./routes/carrier'));
router.use('/api/documents', requireTier('documents'), require('./routes/documents'));
router.use('/api/fmcsa', requireTier('fmcsa'), require('./routes/fmcsa'));
router.use('/api/matching', requireTier('matching'), require('./routes/matching'));

// --- AI Brokerage Platform routes ---
router.use('/api/pricing', requireTier('pricing'), require('./routes/pricing'));
router.use('/api/load-matching', requireTier('load-matching'), require('./routes/loadmatching'));
router.use('/api/ingestion', requireTier('ingestion'), require('./routes/ingestion'));
router.use('/api/analytics', requireTier('analytics'), require('./routes/analytics'));
router.use('/api/demo', requireTier('demo'), require('./routes/demo'));

router.get('/health', (req, res) => {
  res.json({ service: 'RinglyPro Logistics', status: 'healthy', tier: ACTIVE_TIER, tier_name: activeTierConfig.name, active_modules: activeTierConfig.modules, timestamp: new Date().toISOString() });
});

router.get('/api/tiers', (req, res) => {
  res.json({ success: true, current_tier: ACTIVE_TIER, tiers: Object.entries(TIERS).map(([id, tier]) => ({ id, name: tier.name, modules: tier.modules, is_active: id === ACTIVE_TIER })) });
});

// PINAXIS Logistics Suite — internal enterprise sales tools
router.use('/api/pinaxis', require('./routes/pinaxis-tools'));
const pinaxisToolsPath = path.join(__dirname, '../frontend/pinaxis-tools');
router.use('/pinaxis-tools', express.static(pinaxisToolsPath));

const distPath = path.join(__dirname, '../frontend/dist');
router.use(express.static(distPath));
router.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found' });
  if (req.path.startsWith('/pinaxis-tools')) return res.status(404).send('Not found');
  res.sendFile(path.join(distPath, 'index.html'));
});

async function initialize() {
  try {
    const fs = require('fs');
    // Run all migrations in order
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await sequelize.query(sql);
    }
    console.log('  \u2705 Logistics schema initialized (' + migrationFiles.length + ' migrations)');

    const users = [
      { email: 'admin@ringlypro.com', password: 'RinglyProLogistics2026!', role: 'admin', full_name: 'RinglyPro Admin' },
      { email: 'mstagg@ringlypro.com', password: 'Palindrome@7', role: 'admin', full_name: 'Manuel Stagg' },
      { email: 'mstagg@digit2ai.com', password: 'Palindrome@7', role: 'admin', full_name: 'Manuel Stagg', company_name: 'Digit2AI' },
      { email: 'shipper@demo.com', password: 'ShipperDemo2026!', role: 'shipper', full_name: 'Demo Shipper', company_name: 'Acme Shipping Co' },
      { email: 'carrier@demo.com', password: 'CarrierDemo2026!', role: 'carrier', full_name: 'Demo Carrier', company_name: 'FastHaul Transport LLC' },
    ];
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 12);
      const [[existing]] = await sequelize.query(`SELECT id FROM lg_users WHERE email = $1`, { bind: [u.email] });
      if (existing) {
        await sequelize.query(`UPDATE lg_users SET password_hash = $1, updated_at = NOW() WHERE email = $2`, { bind: [hash, u.email] });
      } else {
        await sequelize.query(`INSERT INTO lg_users (email, password_hash, tenant_id, role, full_name, company_name, status, created_at, updated_at) VALUES ($1, $2, 'logistics', $3, $4, $5, 'active', NOW(), NOW())`, { bind: [u.email, hash, u.role, u.full_name, u.company_name || null] });
      }
    }
    console.log('  \u2705 Logistics users initialized');
    console.log(`  \u2705 Logistics tier: ${ACTIVE_TIER} (${activeTierConfig.name})`);
  } catch (err) {
    console.error('  \u26A0\uFE0F Logistics init error:', err.message);
  }
}

initialize();
module.exports = router;
