'use strict';

/**
 * VERITAS — AI Deepfake Detection & Takedown
 * Digit2AI vertical. Mounted at /veritas.
 *
 * Detect and remove deepfakes at scale — protecting brands, executives, and
 * individuals from impersonation fraud. Provider-agnostic detection engine
 * (stub in Phase 0; Hive / Reality Defender / Sensity in Phase 1).
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const router = express.Router();

const { sequelize } = require('./models');
const { seedSampleData } = require('./services/seed');

// ── Body parsing (scoped to this router) ──────────────────────────────────
router.use(express.json({ limit: '25mb' }));
router.use(express.urlencoded({ extended: true }));

// ── API routes ─────────────────────────────────────────────────────────────
router.use('/health', require('./routes/health'));
router.use('/api/v1/monitors', require('./routes/monitors'));
router.use('/api/v1/detections', require('./routes/detections'));
router.use('/api/v1/takedowns', require('./routes/takedowns'));
router.use('/api/v1/scan', require('./routes/scan'));
router.use('/api/v1/webhooks', require('./routes/webhooks'));
router.use('/api/v1/analyst', require('./routes/analyst'));

// ── Static dashboard (no build step — single self-contained HTML) ───────────
const publicDir = path.join(__dirname, '..', 'public');
router.use(express.static(publicDir));

router.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

// ── Init: sync tables + seed sample data (non-blocking) ─────────────────────
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  VERITAS database tables synced (df_*)');
    // Demo seeding is OPT-IN. Set VERITAS_SEED_DEMO=1 to populate sample data.
    // Default (unset) leaves the tenant clean for real scans — and never
    // re-seeds on restart.
    if (process.env.VERITAS_SEED_DEMO === '1') {
      try {
        const result = await seedSampleData();
        if (result.seeded) console.log(`  VERITAS seeded sample data (${result.detections} detections)`);
        else console.log(`  VERITAS sample data present (${result.detections} detections)`);
      } catch (seedErr) {
        console.error('  VERITAS seed error:', seedErr.message);
      }
    } else {
      console.log('  VERITAS demo seeding disabled (set VERITAS_SEED_DEMO=1 to enable)');
    }
  } catch (err) {
    console.error('  VERITAS DB sync error:', err.message);
  }
})();

module.exports = router;
