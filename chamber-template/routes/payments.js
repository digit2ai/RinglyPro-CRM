// Chamber Template - Payments Routes Factory
module.exports = function createPaymentRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const jwt = require('jsonwebtoken');
  const { Sequelize, QueryTypes } = require('sequelize');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });

  const t = config.db_prefix;
  const JWT_SECRET = config.jwt_secret || `${t}-jwt-secret`;
  const MEMBERSHIP_PRICES = config.membership_tiers || {};
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

  function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token required' });
    try { req.member = jwt.verify(token, JWT_SECRET); req.member.id = req.member.member_id; next(); } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  }

  // POST /membership
  router.post('/membership', authMiddleware, async (req, res) => {
    try {
      const { membership_type, billing_period = 'monthly' } = req.body;
      const pricing = MEMBERSHIP_PRICES[membership_type];
      if (!pricing) return res.status(400).json({ success: false, error: 'Invalid membership type' });
      const amount = billing_period === 'annual' ? pricing.annual : pricing.monthly;
      const [member] = await sequelize.query(`SELECT * FROM ${t}_members WHERE id = :id`, { replacements: { id: req.member.id }, type: QueryTypes.SELECT });
      if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

      let stripeCustomerId = member.stripe_customer_id;
      if (!stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
        try {
          const customer = await stripe.customers.create({ email: member.email, name: `${member.first_name} ${member.last_name}`, metadata: { chamber: config.slug, member_id: member.id.toString() } });
          stripeCustomerId = customer.id;
          await sequelize.query(`UPDATE ${t}_members SET stripe_customer_id = :customerId WHERE id = :id`, { replacements: { customerId: stripeCustomerId, id: member.id } });
        } catch (e) { console.error('Stripe error:', e.message); }
      }

      await sequelize.query(`INSERT INTO ${t}_transactions (type, from_member_id, amount, currency, status, description) VALUES ('membership', :memberId, :amount, 'USD', 'pending', :description)`, { replacements: { memberId: req.member.id, amount, description: `${pricing.label} - ${billing_period}` } });
      await sequelize.query(`UPDATE ${t}_members SET membership_type = :type, updated_at = NOW() WHERE id = :id`, { replacements: { type: membership_type, id: req.member.id } });

      res.json({ success: true, data: { membership_type, billing_period, amount, currency: 'USD', stripe_customer_id: stripeCustomerId, pricing: MEMBERSHIP_PRICES } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // POST /escrow
  router.post('/escrow', authMiddleware, async (req, res) => {
    try {
      const { project_id, amount, currency = 'USD', description } = req.body;
      if (!project_id || !amount) return res.status(400).json({ success: false, error: 'project_id and amount required' });
      const [project] = await sequelize.query(`SELECT * FROM ${t}_projects WHERE id = :id`, { replacements: { id: project_id }, type: QueryTypes.SELECT });
      if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
      const [result] = await sequelize.query(`INSERT INTO ${t}_transactions (type, from_member_id, project_id, amount, currency, status, description) VALUES ('escrow', :memberId, :projectId, :amount, :currency, 'held', :description) RETURNING *`, { replacements: { memberId: req.member.id, projectId: project_id, amount, currency, description: description || `Escrow for project: ${project.title}` }, type: QueryTypes.SELECT });
      res.status(201).json({ success: true, data: result });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // POST /release
  router.post('/release', authMiddleware, async (req, res) => {
    try {
      const { transaction_id, to_member_id } = req.body;
      if (!transaction_id) return res.status(400).json({ success: false, error: 'transaction_id required' });
      const [txn] = await sequelize.query(`SELECT * FROM ${t}_transactions WHERE id = :id AND type = 'escrow' AND status = 'held'`, { replacements: { id: transaction_id }, type: QueryTypes.SELECT });
      if (!txn) return res.status(404).json({ success: false, error: 'Escrow transaction not found' });
      if (txn.from_member_id !== req.member.id) return res.status(403).json({ success: false, error: 'Only the escrow creator can release' });
      await sequelize.query(`UPDATE ${t}_transactions SET status = 'completed', to_member_id = :toMemberId WHERE id = :id`, { replacements: { id: transaction_id, toMemberId: to_member_id || null } });
      res.json({ success: true, data: { transaction_id, status: 'completed', released_to: to_member_id } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /history
  router.get('/history', authMiddleware, async (req, res) => {
    try {
      const { type, status, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      let whereClause = `WHERE (t.from_member_id = :memberId OR t.to_member_id = :memberId)`;
      const replacements = { memberId: req.member.id, limit: parseInt(limit), offset };
      if (type) { whereClause += ' AND t.type = :type'; replacements.type = type; }
      if (status) { whereClause += ' AND t.status = :status'; replacements.status = status; }
      const transactions = await sequelize.query(`SELECT t.*, p.title as project_title FROM ${t}_transactions t LEFT JOIN ${t}_projects p ON t.project_id = p.id ${whereClause} ORDER BY t.created_at DESC LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
      const [{ count }] = await sequelize.query(`SELECT COUNT(*) as count FROM ${t}_transactions t ${whereClause}`, { replacements, type: QueryTypes.SELECT });
      res.json({ success: true, data: transactions, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(count) } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /pricing
  router.get('/pricing', (req, res) => {
    res.json({ success: true, data: MEMBERSHIP_PRICES });
  });

  // POST /checkout -- Create Stripe Checkout session ($25 setup + $10/mo)
  router.post('/checkout', async (req, res) => {
    try {
      const { email, member_id, first_name, last_name } = req.body;
      if (!email) return res.status(400).json({ success: false, error: 'Email required' });

      const chamberName = config.short_name || config.name;
      const mountPath = config.mount_path || `/chamber/${config.slug}`;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email,
        metadata: { chamber: config.slug, member_id: String(member_id || ''), member_name: `${first_name || ''} ${last_name || ''}`.trim() },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `${chamberName} -- One-Time Setup Fee`, description: 'Account provisioning, onboarding, and platform activation' },
              unit_amount: 2500
            },
            quantity: 1
          },
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `${chamberName} -- Monthly Membership`, description: 'Full ecosystem access: AI matching, directory, projects, exchange, analytics, MCP' },
              unit_amount: 1000,
              recurring: { interval: 'month' }
            },
            quantity: 1
          }
        ],
        mode: 'subscription',
        success_url: `${baseUrl}${mountPath}/dashboard/?payment=success`,
        cancel_url: `${baseUrl}${mountPath}/#register`
      });

      res.json({ success: true, data: { checkout_url: session.url, session_id: session.id } });
    } catch (error) {
      console.error(`[${config.slug}-payments] Checkout error:`, error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
