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
    const { company_name, contact_name, email, phone, sponsorship_goals, target_audience, budget_range, preferred_tier, additional_info } = req.body;
    if (!company_name || !email || !contact_name) {
      return res.status(400).json({ success: false, error: 'company_name, contact_name, and email are required' });
    }

    const sponsor = await models.RoninSponsor.create({
      tenant_id: 1,
      company_name,
      contact_name,
      email,
      phone,
      tier: preferred_tier || 'supporter',
      notes: [sponsorship_goals, target_audience, budget_range, additional_info].filter(Boolean).join(' | '),
      status: 'pending'
    });

    // Send email notification
    try {
      const sgMail = require('@sendgrid/mail');
      if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: 'mstagg@digit2ai.com',
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ringlypro.com',
          subject: 'New Sponsorship Inquiry - ' + company_name,
          html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;padding:40px;border-radius:12px;">' +
            '<div style="text-align:center;margin-bottom:30px;"><h1 style="color:#d10404;margin:0;">Ronin Brotherhood</h1><p style="color:#c4a35a;font-size:12px;letter-spacing:2px;margin:4px 0 0;">SPONSORSHIP INQUIRY</p></div>' +
            '<div style="background:#1a1a1a;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;">' +
            '<h2 style="color:#c4a35a;font-size:16px;margin:0 0 16px;">Contact Information</h2>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">Company:</strong> ' + company_name + '</p>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">Contact:</strong> ' + contact_name + '</p>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">Email:</strong> <a href="mailto:' + email + '" style="color:#d10404;">' + email + '</a></p>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">Phone:</strong> ' + (phone || 'Not provided') + '</p>' +
            '</div>' +
            '<div style="background:#1a1a1a;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;">' +
            '<h2 style="color:#c4a35a;font-size:16px;margin:0 0 16px;">Inquiry Details</h2>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">1. Sponsorship Goals:</strong><br>' + (sponsorship_goals || 'Not provided') + '</p>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">2. Target Audience:</strong><br>' + (target_audience || 'Not provided') + '</p>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">3. Budget Range:</strong><br>' + (budget_range || 'Not provided') + '</p>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">4. Preferred Tier:</strong><br>' + (preferred_tier || 'Not specified') + '</p>' +
            '<p style="margin:8px 0;"><strong style="color:#888;">5. Additional Info:</strong><br>' + (additional_info || 'None') + '</p>' +
            '</div>' +
            '<div style="text-align:center;padding:16px;color:#555;font-size:11px;">Ronin Brotherhood LLC &bull; Martial Arts Federation</div>' +
            '</div>'
        });
      }
    } catch (emailErr) {
      console.log('Sponsorship inquiry email error:', emailErr.message);
    }

    res.status(201).json({ success: true, data: sponsor, message: 'Sponsorship inquiry submitted successfully' });
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
