'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../middleware/auth');

// Pricing tiers
const PRICING_TIERS = {
  imaging_review: { name: 'Imaging Review', minCents: 29900, maxCents: 49900, description: 'Upload existing imaging → specialist report within 24-48h' },
  full_diagnostic: { name: 'Full Diagnostic', minCents: 79900, maxCents: 149900, description: 'Voice intake → imaging coordination → full report → video explanation' },
  elite_concierge: { name: 'Elite Concierge', minCents: 299900, maxCents: 499900, description: 'Unlimited consultations, priority queue, direct specialist line, quarterly assessments', billing: 'monthly' },
  team_basic: { name: 'Team Basic', minCents: 999900, maxCents: 1999900, description: 'Sports team bulk pricing, team dashboard', billing: 'monthly' },
  team_premium: { name: 'Team Premium', minCents: 2999900, maxCents: 4999900, description: 'Full team coverage with seasonal screening', billing: 'monthly' },
  clinic_partner: { name: 'Clinic Partner', minCents: 499900, maxCents: 999900, description: 'White-label diagnostic reports, referral partnerships', billing: 'monthly' }
};

// GET /api/v1/billing/pricing
router.get('/pricing', (req, res) => {
  res.json({ success: true, data: PRICING_TIERS });
});

// GET /api/v1/billing/subscriptions
router.get('/subscriptions', async (req, res) => {
  try {
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (req.user.role === 'patient') {
      conditions.push(`s.patient_id IN (SELECT id FROM msk_patients WHERE user_id = $${idx++})`);
      binds.push(req.user.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [subs] = await sequelize.query(`
      SELECT s.*, pu.first_name, pu.last_name, pu.email
      FROM msk_subscriptions s
      LEFT JOIN msk_patients p ON s.patient_id = p.id
      LEFT JOIN msk_users pu ON p.user_id = pu.id
      ${where}
      ORDER BY s.created_at DESC
    `, { bind: binds });

    res.json({ success: true, data: subs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/billing/subscriptions — create subscription
router.post('/subscriptions', async (req, res) => {
  try {
    const { patientId, organizationId, planType, priceCents, billingCycle } = req.body;

    if (!planType || !priceCents) {
      return res.status(400).json({ error: 'planType and priceCents required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO msk_subscriptions (patient_id, organization_id, plan_type, price_cents, billing_cycle, current_period_start, current_period_end)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '1 month')
      RETURNING *
    `, {
      bind: [patientId || null, organizationId || null, planType, priceCents, billingCycle || 'monthly']
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/billing/invoices
router.get('/invoices', async (req, res) => {
  try {
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (req.user.role === 'patient') {
      conditions.push(`i.patient_id IN (SELECT id FROM msk_patients WHERE user_id = $${idx++})`);
      binds.push(req.user.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [invoices] = await sequelize.query(`
      SELECT i.*, c.case_number
      FROM msk_invoices i
      LEFT JOIN msk_cases c ON i.case_id = c.id
      ${where}
      ORDER BY i.created_at DESC
    `, { bind: binds });

    res.json({ success: true, data: invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/billing/invoices — create invoice
router.post('/invoices', async (req, res) => {
  try {
    if (!['admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin or staff only' });
    }

    const { caseId, patientId, subscriptionId, amountCents, description, dueDate } = req.body;

    const invoiceNumber = `MSK-INV-${Date.now()}`;

    const [result] = await sequelize.query(`
      INSERT INTO msk_invoices (case_id, patient_id, subscription_id, invoice_number, amount_cents, description, due_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, {
      bind: [caseId || null, patientId || null, subscriptionId || null, invoiceNumber, amountCents, description || null, dueDate || null]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/billing/contracts — B2B contracts
router.get('/contracts', async (req, res) => {
  try {
    if (!['admin', 'b2b_manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin or B2B manager only' });
    }

    const [contracts] = await sequelize.query(`SELECT * FROM msk_b2b_contracts ORDER BY created_at DESC`);
    res.json({ success: true, data: contracts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/billing/contracts
router.post('/contracts', async (req, res) => {
  try {
    if (!['admin', 'b2b_manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin or B2B manager only' });
    }

    const { organizationName, organizationType, contactName, contactEmail, contactPhone, contractType, monthlyValueCents, includedCasesPerMonth, startDate, endDate, terms } = req.body;

    const [result] = await sequelize.query(`
      INSERT INTO msk_b2b_contracts (organization_name, organization_type, contact_name, contact_email, contact_phone, contract_type, monthly_value_cents, included_cases_per_month, start_date, end_date, terms)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, {
      bind: [
        organizationName, organizationType || 'other', contactName || null,
        contactEmail || null, contactPhone || null, contractType || null,
        monthlyValueCents || 0, includedCasesPerMonth || 0,
        startDate || null, endDate || null, terms ? JSON.stringify(terms) : '{}'
      ]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
