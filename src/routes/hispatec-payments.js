// src/routes/hispatec-payments.js -- Stripe Payments, Memberships & Escrow
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.JWT_SECRET || 'hispatec-jwt-secret-2026';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
  try {
    req.member = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Token invalido' });
  }
}

// Membership pricing (USD monthly)
const MEMBERSHIP_PRICES = {
  numerario: { monthly: 25, annual: 240, name: 'Numerario - Motor Operativo' },
  protector: { monthly: 100, annual: 960, name: 'Protector - Soporte e Inversion' },
  patrono: { monthly: 200, annual: 1920, name: 'Patrono - Experiencia y Valor' },
  fundador: { monthly: 0, annual: 500, name: 'Fundador - Cimiento Estrategico' }
};

// POST /membership -- Create or update membership subscription
router.post('/membership', authMiddleware, async (req, res) => {
  try {
    const { membership_type, billing_period = 'monthly', payment_method_id } = req.body;
    const pricing = MEMBERSHIP_PRICES[membership_type];

    if (!pricing) {
      return res.status(400).json({ success: false, error: 'Tipo de membresia invalido' });
    }

    const amount = billing_period === 'annual' ? pricing.annual : pricing.monthly;

    // Get member
    const [member] = await sequelize.query(
      'SELECT * FROM hispatec_members WHERE id = :id',
      { replacements: { id: req.member.id }, type: QueryTypes.SELECT }
    );

    if (!member) {
      return res.status(404).json({ success: false, error: 'Miembro no encontrado' });
    }

    let stripeCustomerId = member.stripe_customer_id;

    // Create Stripe customer if needed
    if (!stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
      try {
        const customer = await stripe.customers.create({
          email: member.email,
          name: `${member.first_name} ${member.last_name}`,
          metadata: { hispatec_member_id: member.id.toString(), membership_type }
        });
        stripeCustomerId = customer.id;

        await sequelize.query(
          'UPDATE hispatec_members SET stripe_customer_id = :customerId WHERE id = :id',
          { replacements: { customerId: stripeCustomerId, id: member.id } }
        );
      } catch (stripeErr) {
        console.error('Stripe customer creation error:', stripeErr.message);
      }
    }

    // Record transaction
    await sequelize.query(`
      INSERT INTO hispatec_transactions (type, from_member_id, amount, currency, status, description)
      VALUES ('membership', :memberId, :amount, 'USD', 'pending', :description)
    `, {
      replacements: {
        memberId: req.member.id,
        amount,
        description: `${pricing.name} - ${billing_period}`
      }
    });

    // Update membership type
    await sequelize.query(
      'UPDATE hispatec_members SET membership_type = :type, updated_at = NOW() WHERE id = :id',
      { replacements: { type: membership_type, id: req.member.id } }
    );

    res.json({
      success: true,
      data: {
        membership_type,
        billing_period,
        amount,
        currency: 'USD',
        stripe_customer_id: stripeCustomerId,
        pricing: MEMBERSHIP_PRICES
      }
    });
  } catch (error) {
    console.error('Membership error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /escrow -- Create project escrow
router.post('/escrow', authMiddleware, async (req, res) => {
  try {
    const { project_id, amount, currency = 'USD', description } = req.body;

    if (!project_id || !amount) {
      return res.status(400).json({ success: false, error: 'project_id y amount requeridos' });
    }

    // Verify project exists
    const [project] = await sequelize.query(
      'SELECT * FROM hispatec_projects WHERE id = :id',
      { replacements: { id: project_id }, type: QueryTypes.SELECT }
    );

    if (!project) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    // Create escrow transaction (held status)
    const [result] = await sequelize.query(`
      INSERT INTO hispatec_transactions (type, from_member_id, project_id, amount, currency, status, description)
      VALUES ('escrow', :memberId, :projectId, :amount, :currency, 'held', :description)
      RETURNING *
    `, {
      replacements: {
        memberId: req.member.id,
        projectId: project_id,
        amount,
        currency,
        description: description || `Escrow para proyecto: ${project.title}`
      },
      type: QueryTypes.SELECT
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Escrow error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /release -- Release escrow funds
router.post('/release', authMiddleware, async (req, res) => {
  try {
    const { transaction_id, to_member_id } = req.body;

    if (!transaction_id) {
      return res.status(400).json({ success: false, error: 'transaction_id requerido' });
    }

    // Get escrow transaction
    const [txn] = await sequelize.query(
      'SELECT * FROM hispatec_transactions WHERE id = :id AND type = \'escrow\' AND status = \'held\'',
      { replacements: { id: transaction_id }, type: QueryTypes.SELECT }
    );

    if (!txn) {
      return res.status(404).json({ success: false, error: 'Transaccion escrow no encontrada o ya liberada' });
    }

    // Only the escrow creator can release
    if (txn.from_member_id !== req.member.id) {
      return res.status(403).json({ success: false, error: 'Solo el creador del escrow puede liberar fondos' });
    }

    // Update transaction
    await sequelize.query(`
      UPDATE hispatec_transactions
      SET status = 'completed', to_member_id = :toMemberId
      WHERE id = :id
    `, {
      replacements: { id: transaction_id, toMemberId: to_member_id || null }
    });

    res.json({ success: true, data: { transaction_id, status: 'completed', released_to: to_member_id } });
  } catch (error) {
    console.error('Release error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /history -- Transaction history for current member
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE (t.from_member_id = :memberId OR t.to_member_id = :memberId)';
    const replacements = { memberId: req.member.id, limit: parseInt(limit), offset };

    if (type) {
      whereClause += ' AND t.type = :type';
      replacements.type = type;
    }
    if (status) {
      whereClause += ' AND t.status = :status';
      replacements.status = status;
    }

    const transactions = await sequelize.query(`
      SELECT t.*, p.title as project_title
      FROM hispatec_transactions t
      LEFT JOIN hispatec_projects p ON t.project_id = p.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT :limit OFFSET :offset
    `, { replacements, type: QueryTypes.SELECT });

    const [{ count }] = await sequelize.query(`
      SELECT COUNT(*) as count FROM hispatec_transactions t ${whereClause}
    `, { replacements, type: QueryTypes.SELECT });

    res.json({
      success: true,
      data: transactions,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(count) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /pricing -- Public endpoint for membership pricing
router.get('/pricing', (req, res) => {
  res.json({ success: true, data: MEMBERSHIP_PRICES });
});

module.exports = router;
