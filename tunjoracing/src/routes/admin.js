'use strict';

/**
 * Admin Routes - TunjoRacing
 * Handles admin authentication and dashboard
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const { authenticateToken, requireAdmin, generateToken } = require('../middleware/auth');

// Admin credentials from env
const ADMIN_EMAIL = process.env.TUNJO_ADMIN_EMAIL || 'admin@tunjoracing.com';
const ADMIN_PASSWORD = process.env.TUNJO_ADMIN_PASSWORD || 'TunjoRacing2024!';

// POST /api/v1/admin/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  // Simple admin check (in production, use proper user management)
  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  const token = generateToken({
    id: 0,
    email: ADMIN_EMAIL,
    role: 'admin',
    name: 'TunjoRacing Admin'
  });

  res.json({
    success: true,
    token,
    admin: {
      email: ADMIN_EMAIL,
      name: 'TunjoRacing Admin'
    }
  });
}));

// GET /api/v1/admin/dashboard - Admin dashboard data
router.get('/dashboard', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  let models;
  try {
    models = require('../../models');
  } catch (e) {
    return res.json({
      success: true,
      data: {
        fans: { total: 0, new_this_month: 0 },
        sponsors: { total: 0, active: 0 },
        orders: { total: 0, revenue: 0 },
        inquiries: { total: 0, new: 0 }
      }
    });
  }

  const TunjoFan = models.TunjoFan;
  const TunjoSponsor = models.TunjoSponsor;
  const TunjoOrder = models.TunjoOrder;
  const TunjoSponsorInquiry = models.TunjoSponsorInquiry;

  // Get counts
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalFans,
    newFans,
    totalSponsors,
    activeSponsors,
    totalOrders,
    newInquiries
  ] = await Promise.all([
    TunjoFan.count({ where: { tenant_id: 1 } }),
    TunjoFan.count({ where: { tenant_id: 1, created_at: { [models.Sequelize.Op.gte]: startOfMonth } } }),
    TunjoSponsor.count({ where: { tenant_id: 1 } }),
    TunjoSponsor.count({ where: { tenant_id: 1, status: 'active' } }),
    TunjoOrder.count({ where: { tenant_id: 1, payment_status: 'paid' } }),
    TunjoSponsorInquiry.count({ where: { tenant_id: 1, status: 'new' } })
  ]);

  // Get revenue
  const revenueResult = await TunjoOrder.findOne({
    where: { tenant_id: 1, payment_status: 'paid' },
    attributes: [
      [models.sequelize.fn('SUM', models.sequelize.col('total')), 'total_revenue']
    ],
    raw: true
  });

  res.json({
    success: true,
    data: {
      fans: {
        total: totalFans,
        new_this_month: newFans
      },
      sponsors: {
        total: totalSponsors,
        active: activeSponsors
      },
      orders: {
        total: totalOrders,
        revenue: parseFloat(revenueResult?.total_revenue || 0)
      },
      inquiries: {
        new: newInquiries
      }
    }
  });
}));

// GET /api/v1/admin/me - Get current admin info
router.get('/me', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    admin: {
      email: req.user.email,
      name: req.user.name,
      role: req.user.role
    }
  });
}));

module.exports = router;
