'use strict';

const express = require('express');
const router = express.Router();
const { authenticateMember, authenticateAdmin, optionalAuth, generateToken } = require('../middleware/auth');

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// POST /register - Public registration
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, country, city, state, dojo_name, instructor_name, styles } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ success: false, error: 'email, password, first_name, and last_name are required' });
    }

    const existing = await models.RoninMember.findOne({ where: { tenant_id: 1, email } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const member = await models.RoninMember.create({
      tenant_id: 1,
      email,
      password_hash: password,
      first_name,
      last_name,
      phone,
      country,
      city,
      state,
      dojo_name,
      instructor_name,
      styles: styles || [],
      membership_status: 'pending'
    });

    const token = generateToken(member);
    res.status(201).json({
      success: true,
      data: {
        id: member.id,
        email: member.email,
        first_name: member.first_name,
        last_name: member.last_name,
        membership_tier: member.membership_tier,
        membership_status: member.membership_status
      },
      token
    });
  } catch (error) {
    console.error('Member registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const member = await models.RoninMember.findOne({ where: { tenant_id: 1, email } });
    if (!member) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await member.validatePassword(password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    await member.update({ last_login_at: new Date() });
    const token = generateToken(member);

    res.json({
      success: true,
      data: {
        id: member.id,
        email: member.email,
        first_name: member.first_name,
        last_name: member.last_name,
        title: member.title,
        dan_level: member.dan_level,
        membership_tier: member.membership_tier,
        membership_status: member.membership_status
      },
      token
    });
  } catch (error) {
    console.error('Member login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /profile - Get current member profile
router.get('/profile', authenticateMember, async (req, res) => {
  try {
    const member = await models.RoninMember.findByPk(req.memberId, {
      attributes: { exclude: ['password_hash'] }
    });
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
    res.json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /profile - Update member profile
router.put('/profile', authenticateMember, async (req, res) => {
  try {
    const allowedFields = ['first_name', 'last_name', 'phone', 'country', 'city', 'state', 'dojo_name', 'instructor_name', 'bio', 'profile_image', 'styles', 'email_subscribed'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    await models.RoninMember.update(updates, { where: { id: req.memberId, tenant_id: 1 } });
    const member = await models.RoninMember.findByPk(req.memberId, {
      attributes: { exclude: ['password_hash'] }
    });
    res.json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET / - List all members (admin)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, tier, status, group, country } = req.query;
    const where = { tenant_id: 1 };
    if (tier) where.membership_tier = tier;
    if (status) where.membership_status = status;
    if (country) where.country = country;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await models.RoninMember.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash'] },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats - Membership stats
router.get('/stats', async (req, res) => {
  try {
    const [total, active, pending, byTier, byCountry] = await Promise.all([
      models.RoninMember.count({ where: { tenant_id: 1 } }),
      models.RoninMember.count({ where: { tenant_id: 1, membership_status: 'active' } }),
      models.RoninMember.count({ where: { tenant_id: 1, membership_status: 'pending' } }),
      models.RoninMember.findAll({
        where: { tenant_id: 1 },
        attributes: ['membership_tier', [models.sequelize.fn('COUNT', '*'), 'count']],
        group: ['membership_tier'],
        raw: true
      }),
      models.RoninMember.findAll({
        where: { tenant_id: 1 },
        attributes: ['country', [models.sequelize.fn('COUNT', '*'), 'count']],
        group: ['country'],
        order: [[models.sequelize.fn('COUNT', '*'), 'DESC']],
        limit: 10,
        raw: true
      })
    ]);

    res.json({
      success: true,
      data: { total, active, pending, byTier, byCountry }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
