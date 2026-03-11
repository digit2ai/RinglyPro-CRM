'use strict';

const express = require('express');
const router = express.Router();

// POST /api/v1/nda — Submit a signed NDA
router.post('/', async (req, res) => {
  try {
    const {
      project_id,
      disclosing_company,
      disclosing_name,
      disclosing_title,
      disclosing_signature,
      disclosing_signed_at,
      receiving_signers,  // array of { name, title, signature, signed_at }
      nda_text,
      purpose
    } = req.body;

    if (!receiving_signers || receiving_signers.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one receiving signer is required' });
    }

    const { sequelize } = req.models;

    // Ensure table exists
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS logistics_ndas (
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
      )
    `);

    const [result] = await sequelize.query(`
      INSERT INTO logistics_ndas
        (project_id, disclosing_company, disclosing_name, disclosing_title,
         disclosing_signature, disclosing_signed_at, receiving_signers, nda_text, purpose)
      VALUES
        (:project_id, :disclosing_company, :disclosing_name, :disclosing_title,
         :disclosing_signature, :disclosing_signed_at, :receiving_signers, :nda_text, :purpose)
      RETURNING *
    `, {
      replacements: {
        project_id: project_id || null,
        disclosing_company,
        disclosing_name,
        disclosing_title,
        disclosing_signature: disclosing_signature || null,
        disclosing_signed_at: disclosing_signed_at || new Date().toISOString(),
        receiving_signers: JSON.stringify(receiving_signers),
        nda_text: nda_text || null,
        purpose: purpose || null
      }
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    console.error('NDA submit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/nda — List all NDAs
router.get('/', async (req, res) => {
  try {
    const { sequelize } = req.models;

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS logistics_ndas (
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
      )
    `);

    const [rows] = await sequelize.query(
      `SELECT id, project_id, disclosing_company, disclosing_name, disclosing_title,
              disclosing_signed_at, receiving_signers, purpose, status, created_at
       FROM logistics_ndas ORDER BY created_at DESC`
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('NDA list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/nda/:id — Get a single NDA
router.get('/:id', async (req, res) => {
  try {
    const { sequelize } = req.models;
    const [rows] = await sequelize.query(
      `SELECT * FROM logistics_ndas WHERE id = :id`,
      { replacements: { id: req.params.id } }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'NDA not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
