'use strict';

const express = require('express');
const router = express.Router();
const { Vertical, Company } = require('../models');

// GET /api/v1/verticals
router.get('/', async (req, res) => {
  try {
    const verticals = await Vertical.findAll({
      where: { workspace_id: 1, active: true },
      order: [['sort_order', 'ASC']]
    });
    res.json({ success: true, data: verticals });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/verticals
router.post('/', async (req, res) => {
  try {
    const data = { workspace_id: 1, ...req.body };
    if (!data.slug && data.name) data.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const vertical = await Vertical.create(data);
    res.status(201).json({ success: true, data: vertical });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/companies
router.get('/companies', async (req, res) => {
  try {
    const companies = await Company.findAll({
      where: { workspace_id: 1 },
      order: [['name', 'ASC']]
    });
    res.json({ success: true, data: companies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/companies
router.post('/companies', async (req, res) => {
  try {
    const data = { workspace_id: 1, ...req.body };
    const company = await Company.create(data);
    res.status(201).json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
