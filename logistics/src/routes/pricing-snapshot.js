'use strict';

/**
 * Pricing Snapshot Service
 *
 * Decouples SAP/pricing inputs from direct agent access.
 * A snapshot is pulled on-demand, version-stamped, and frozen for downstream agents.
 *
 * Routes:
 *   POST   /api/v1/pricing-snapshot          — Create a new snapshot
 *   GET    /api/v1/pricing-snapshot          — List all snapshots (newest first)
 *   GET    /api/v1/pricing-snapshot/active   — Get current approved snapshot
 *   GET    /api/v1/pricing-snapshot/:id      — Get specific snapshot
 *   PATCH  /api/v1/pricing-snapshot/:id/approve — Approve and freeze snapshot
 */

const express = require('express');
const router = express.Router();

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS logistics_pricing_snapshots (
    id                  SERIAL PRIMARY KEY,
    version             VARCHAR(50) NOT NULL,
    label               VARCHAR(255),
    source              VARCHAR(100) DEFAULT 'manual',
    status              VARCHAR(30) DEFAULT 'draft',
    approved_by         VARCHAR(255),
    approved_at         TIMESTAMPTZ,
    snapshot_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    currency            VARCHAR(10) DEFAULT 'EUR',
    -- Product pricing (JSONB array of {product_name, list_price, install_scope_pct, margin_pct, capex_estimate})
    product_prices      JSONB NOT NULL DEFAULT '[]',
    -- Global margin/scope rules
    install_scope_pct   NUMERIC(5,2) DEFAULT 15.0,
    margin_target_pct   NUMERIC(5,2) DEFAULT 25.0,
    contingency_pct     NUMERIC(5,2) DEFAULT 5.0,
    -- Notes
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
  )
`;

// Default product prices seeded on first snapshot
const DEFAULT_PRODUCT_PRICES = [
  { product_name: 'StoreBiter MLS',  list_price: 850000,  install_scope_pct: 18, capex_estimate: 1020000 },
  { product_name: 'StoreBiter OLS',  list_price: 1100000, install_scope_pct: 20, capex_estimate: 1320000 },
  { product_name: 'InstaPick',       list_price: 420000,  install_scope_pct: 12, capex_estimate: 470400  },
  { product_name: 'ROTA-Sorter',     list_price: 680000,  install_scope_pct: 22, capex_estimate: 829600  },
  { product_name: 'Omnipallet',      list_price: 950000,  install_scope_pct: 20, capex_estimate: 1140000 },
  { product_name: 'Versastore',      list_price: 720000,  install_scope_pct: 16, capex_estimate: 835200  }
];

function nextVersion(existing) {
  if (!existing.length) return 'v1.0';
  const last = existing[0].version || 'v0.0';
  const match = last.match(/v(\d+)\.(\d+)/);
  if (!match) return 'v1.0';
  return `v${parseInt(match[1])}.${parseInt(match[2]) + 1}`;
}

// POST / — Create new pricing snapshot
router.post('/', async (req, res) => {
  try {
    const { sequelize } = req.models;
    await sequelize.query(CREATE_TABLE);

    const { label, source, install_scope_pct, margin_target_pct, contingency_pct, product_prices, notes, currency } = req.body;

    const [existing] = await sequelize.query(
      `SELECT version FROM logistics_pricing_snapshots ORDER BY created_at DESC LIMIT 1`
    );
    const version = nextVersion(existing);

    const [result] = await sequelize.query(`
      INSERT INTO logistics_pricing_snapshots
        (version, label, source, status, snapshot_date, currency, product_prices,
         install_scope_pct, margin_target_pct, contingency_pct, notes)
      VALUES
        (:version, :label, :source, 'draft', CURRENT_DATE, :currency, :product_prices,
         :install_scope_pct, :margin_target_pct, :contingency_pct, :notes)
      RETURNING *
    `, {
      replacements: {
        version,
        label: label || `Pricing Snapshot ${version}`,
        source: source || 'manual',
        currency: currency || 'EUR',
        product_prices: JSON.stringify(product_prices || DEFAULT_PRODUCT_PRICES),
        install_scope_pct: install_scope_pct ?? 15.0,
        margin_target_pct: margin_target_pct ?? 25.0,
        contingency_pct: contingency_pct ?? 5.0,
        notes: notes || null
      }
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Pricing snapshot create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /active — Get current approved snapshot
router.get('/active', async (req, res) => {
  try {
    const { sequelize } = req.models;
    await sequelize.query(CREATE_TABLE);

    const [rows] = await sequelize.query(`
      SELECT * FROM logistics_pricing_snapshots
      WHERE status = 'approved'
      ORDER BY approved_at DESC
      LIMIT 1
    `);

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'No approved pricing snapshot. Create and approve one first.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET / — List all snapshots
router.get('/', async (req, res) => {
  try {
    const { sequelize } = req.models;
    await sequelize.query(CREATE_TABLE);

    const [rows] = await sequelize.query(`
      SELECT id, version, label, source, status, approved_by, approved_at,
             snapshot_date, currency, install_scope_pct, margin_target_pct, contingency_pct,
             notes, created_at
      FROM logistics_pricing_snapshots
      ORDER BY created_at DESC
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id — Get specific snapshot
router.get('/:id', async (req, res) => {
  try {
    const { sequelize } = req.models;
    const [rows] = await sequelize.query(
      `SELECT * FROM logistics_pricing_snapshots WHERE id = :id`,
      { replacements: { id: req.params.id } }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Snapshot not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:id/approve — Approve and freeze snapshot
router.patch('/:id/approve', async (req, res) => {
  try {
    const { sequelize } = req.models;
    const { approved_by } = req.body;

    const [result] = await sequelize.query(`
      UPDATE logistics_pricing_snapshots
      SET status = 'approved', approved_by = :approved_by, approved_at = NOW(), updated_at = NOW()
      WHERE id = :id
      RETURNING *
    `, {
      replacements: { id: req.params.id, approved_by: approved_by || 'Manuel Stagg' }
    });

    if (!result.length) return res.status(404).json({ success: false, error: 'Snapshot not found' });
    res.json({ success: true, data: result[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
