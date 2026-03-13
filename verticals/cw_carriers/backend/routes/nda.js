'use strict';

const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');

const ENSURE_TABLES = `
  CREATE TABLE IF NOT EXISTS cw_ndas (
    id SERIAL PRIMARY KEY,
    project_id INTEGER,
    disclosing_company VARCHAR(255) NOT NULL,
    disclosing_name VARCHAR(255) NOT NULL,
    disclosing_title VARCHAR(255) NOT NULL,
    disclosing_signature TEXT,
    disclosing_signed_at TIMESTAMPTZ NOT NULL,
    receiving_signers JSONB NOT NULL DEFAULT '[]',
    nda_text TEXT,
    purpose TEXT,
    status VARCHAR(50) DEFAULT 'signed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS cw_nda_signatures (
    id SERIAL PRIMARY KEY,
    signer_role VARCHAR(50) DEFAULT 'receiving',
    company VARCHAR(255),
    name VARCHAR(255),
    title VARCHAR(255),
    signature_data TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

// POST / — Submit a signed NDA
router.post('/', async (req, res) => {
  try {
    const {
      project_id, disclosing_company, disclosing_name, disclosing_title,
      disclosing_signature, disclosing_signed_at, receiving_signers, nda_text, purpose
    } = req.body;

    if (!receiving_signers || receiving_signers.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one receiving signer is required' });
    }

    await sequelize.query(ENSURE_TABLES);

    const [result] = await sequelize.query(`
      INSERT INTO cw_ndas
        (project_id, disclosing_company, disclosing_name, disclosing_title,
         disclosing_signature, disclosing_signed_at, receiving_signers, nda_text, purpose)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, {
      bind: [
        project_id || null, disclosing_company, disclosing_name, disclosing_title,
        disclosing_signature || null, disclosing_signed_at || new Date().toISOString(),
        JSON.stringify(receiving_signers), nda_text || null, purpose || null
      ]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    console.error('CW NDA submit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET / — List all NDAs
router.get('/', async (req, res) => {
  try {
    await sequelize.query(ENSURE_TABLES);
    const [rows] = await sequelize.query(
      `SELECT id, project_id, disclosing_company, disclosing_name, disclosing_title,
              disclosing_signed_at, receiving_signers, purpose, status, created_at
       FROM cw_ndas ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('CW NDA list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id — Get a single NDA
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM cw_ndas WHERE id = $1`, { bind: [req.params.id] }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'NDA not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /signatures — Save an individual signature
router.post('/signatures', async (req, res) => {
  try {
    const { signer_role, company, name, title, signature_data, signed_at } = req.body;
    if (!signature_data) return res.status(400).json({ success: false, error: 'signature_data is required' });

    await sequelize.query(ENSURE_TABLES);

    const [result] = await sequelize.query(`
      INSERT INTO cw_nda_signatures (signer_role, company, name, title, signature_data, signed_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, signer_role, company, name, title, signed_at
    `, {
      bind: [
        signer_role || 'receiving', company || null, name || null,
        title || null, signature_data, signed_at || new Date().toISOString()
      ]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    console.error('CW NDA signature save error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id — Delete an NDA record
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `DELETE FROM cw_ndas WHERE id = $1 RETURNING id`, { bind: [req.params.id] }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'NDA not found' });
    res.json({ success: true, deleted_id: rows[0].id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
