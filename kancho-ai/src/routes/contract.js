// kancho-ai/src/routes/contract.js
// Partnership Agreement contract signing & viewing routes

'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

// Database connection (uses DATABASE_URL like other kancho-ai models)
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  },
  logging: false,
  pool: { max: 3, min: 0, acquire: 30000, idle: 10000 }
});

// Define KanchoContract model
const KanchoContract = sequelize.define('KanchoContract', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  contract_version: {
    type: DataTypes.STRING(10),
    defaultValue: '1.0'
  },
  party_rb_name: { type: DataTypes.STRING(255) },
  party_rb_title: { type: DataTypes.STRING(255) },
  party_rb_email: { type: DataTypes.STRING(255) },
  party_kancho_name: { type: DataTypes.STRING(255) },
  party_kancho_title: { type: DataTypes.STRING(255) },
  party_kancho_email: { type: DataTypes.STRING(255) },
  party_unai_name: { type: DataTypes.STRING(255) },
  party_unai_email: { type: DataTypes.STRING(255) },
  rb_signature: { type: DataTypes.TEXT },
  kancho_signature: { type: DataTypes.TEXT },
  unai_signature: { type: DataTypes.TEXT },
  rb_signed_at: { type: DataTypes.DATE },
  kancho_signed_at: { type: DataTypes.DATE },
  unai_signed_at: { type: DataTypes.DATE },
  ip_address: { type: DataTypes.STRING(45) },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'pending'
  }
}, {
  tableName: 'kanchoai_contracts',
  timestamps: true,
  underscored: true
});

// Auto-create table on startup
(async () => {
  try {
    await sequelize.authenticate();
    await KanchoContract.sync({ alter: false });
    // Create table if not exists via raw SQL for UUID support
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS kanchoai_contracts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_version VARCHAR(10) DEFAULT '1.0',
        party_rb_name VARCHAR(255),
        party_rb_title VARCHAR(255),
        party_rb_email VARCHAR(255),
        party_kancho_name VARCHAR(255),
        party_kancho_title VARCHAR(255),
        party_kancho_email VARCHAR(255),
        party_unai_name VARCHAR(255),
        party_unai_email VARCHAR(255),
        rb_signature TEXT,
        kancho_signature TEXT,
        unai_signature TEXT,
        rb_signed_at TIMESTAMP,
        kancho_signed_at TIMESTAMP,
        unai_signed_at TIMESTAMP,
        ip_address VARCHAR(45),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ KanchoAI Contracts table ready');
  } catch (err) {
    console.error('⚠️ KanchoAI Contracts table error:', err.message);
  }
})();

// Serve contract HTML page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/contract.html'));
});

// POST /api/kanchoai/contract/sign - Sign the contract
router.post('/sign', async (req, res) => {
  try {
    const {
      party_rb_name, party_rb_title, party_rb_email,
      party_kancho_name, party_kancho_title, party_kancho_email,
      party_unai_name, party_unai_email,
      rb_signature, kancho_signature, unai_signature,
      rb_signed_at, kancho_signed_at, unai_signed_at
    } = req.body;

    // Validate all signatures present
    if (!rb_signature || !kancho_signature || !unai_signature) {
      return res.status(400).json({ success: false, error: 'All three signatures are required' });
    }

    // Validate required fields
    if (!party_rb_name || !party_rb_email || !party_kancho_name || !party_kancho_email || !party_unai_name || !party_unai_email) {
      return res.status(400).json({ success: false, error: 'All party names and emails are required' });
    }

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;

    const contract = await KanchoContract.create({
      party_rb_name, party_rb_title, party_rb_email,
      party_kancho_name, party_kancho_title, party_kancho_email,
      party_unai_name, party_unai_email,
      rb_signature, kancho_signature, unai_signature,
      rb_signed_at: rb_signed_at || new Date(),
      kancho_signed_at: kancho_signed_at || new Date(),
      unai_signed_at: unai_signed_at || new Date(),
      ip_address: ip,
      status: 'signed'
    });

    res.json({
      success: true,
      contract_id: contract.id,
      message: 'Contract signed successfully'
    });
  } catch (error) {
    console.error('Contract sign error:', error);
    res.status(500).json({ success: false, error: 'Failed to save contract' });
  }
});

// GET /api/kanchoai/contract/:id - Retrieve a signed contract
router.get('/:id', async (req, res) => {
  try {
    const contract = await KanchoContract.findByPk(req.params.id);
    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }
    res.json({ success: true, contract });
  } catch (error) {
    console.error('Contract fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve contract' });
  }
});

module.exports = router;
