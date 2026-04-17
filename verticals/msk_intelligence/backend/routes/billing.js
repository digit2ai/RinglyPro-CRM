'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../middleware/auth');

// Pricing — $99/mo base + metered per-image (volume-tiered)
const PLATFORM_BASE = { name: 'ImagingMind Platform', cents: 9900, billing: 'monthly', description: 'Full platform access — all 6 modalities, AI Copilot, Lina, portal, messaging, billing tools' };

// Per-study rates in cents — tiered by monthly volume
// Starter: <1,000 studies/mo (70% margin)
// Growth: 1,000-10,000 studies/mo (50% margin)
// Scale: 10,000+ studies/mo (40% margin)
const PER_STUDY_CENTS = {
  starter: { // <1,000 studies/mo
    'X-Ray': 16, 'CT': 89, 'MRI': 89, 'Mammography': 26,
    'DEXA': 16, 'Dental': 16, 'Ultrasound': 26, 'PET': 89
  },
  growth: { // 1,000-10,000 studies/mo
    'X-Ray': 10, 'CT': 54, 'MRI': 54, 'Mammography': 16,
    'DEXA': 10, 'Dental': 10, 'Ultrasound': 16, 'PET': 54
  },
  scale: { // 10,000+ studies/mo
    'X-Ray': 8, 'CT': 45, 'MRI': 45, 'Mammography': 13,
    'DEXA': 8, 'Dental': 8, 'Ultrasound': 13, 'PET': 45
  }
};

function getTierForVolume(monthlyStudies) {
  if (monthlyStudies >= 10000) return 'scale';
  if (monthlyStudies >= 1000) return 'growth';
  return 'starter';
}

function getStudyRate(modality, monthlyVolume) {
  const tier = getTierForVolume(monthlyVolume);
  return PER_STUDY_CENTS[tier][modality] || PER_STUDY_CENTS[tier]['X-Ray'];
}

const PRICING_TIERS = {
  starter: { name: 'Starter', maxStudies: 999, description: 'Up to 1,000 studies/mo — small clinics, solo practitioners' },
  growth: { name: 'Growth', maxStudies: 9999, description: '1,000-10,000 studies/mo — mid-size groups, imaging centers' },
  scale: { name: 'Scale', maxStudies: null, description: '10,000+ studies/mo — hospitals, large networks' }
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
