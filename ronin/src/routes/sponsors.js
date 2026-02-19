'use strict';

const express = require('express');
const router = express.Router();

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// GET / - List sponsors (public shows active only)
router.get('/', async (req, res) => {
  try {
    const { tier, status = 'active' } = req.query;
    const where = { tenant_id: 1, status };
    if (tier) where.tier = tier;

    const sponsors = await models.RoninSponsor.findAll({
      where,
      order: [
        [models.sequelize.literal("CASE tier WHEN 'platinum' THEN 1 WHEN 'gold' THEN 2 WHEN 'silver' THEN 3 WHEN 'bronze' THEN 4 ELSE 5 END"), 'ASC'],
        ['company_name', 'ASC']
      ]
    });

    res.json({ success: true, data: sponsors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - Get sponsor details
router.get('/:id', async (req, res) => {
  try {
    const sponsor = await models.RoninSponsor.findOne({ where: { id: req.params.id, tenant_id: 1 } });
    if (!sponsor) return res.status(404).json({ success: false, error: 'Sponsor not found' });
    res.json({ success: true, data: sponsor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create sponsor (admin)
router.post('/', async (req, res) => {
  try {
    const sponsor = await models.RoninSponsor.create({ ...req.body, tenant_id: 1 });
    res.status(201).json({ success: true, data: sponsor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /inquiry - Public sponsorship inquiry
router.post('/inquiry', async (req, res) => {
  try {
    const { company_name, contact_name, email, phone, message, tier_interest } = req.body;
    if (!company_name || !email) {
      return res.status(400).json({ success: false, error: 'company_name and email required' });
    }

    const sponsor = await models.RoninSponsor.create({
      tenant_id: 1,
      company_name,
      contact_name,
      email,
      phone,
      tier: tier_interest || 'supporter',
      notes: message,
      status: 'pending'
    });

    res.status(201).json({ success: true, data: sponsor, message: 'Sponsorship inquiry submitted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update sponsor
router.put('/:id', async (req, res) => {
  try {
    const sponsor = await models.RoninSponsor.findOne({ where: { id: req.params.id, tenant_id: 1 } });
    if (!sponsor) return res.status(404).json({ success: false, error: 'Sponsor not found' });
    await sponsor.update(req.body);
    res.json({ success: true, data: sponsor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
