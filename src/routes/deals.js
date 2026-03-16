/**
 * RinglyPro CRM — Deals / Pipeline API
 */
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const STAGE_PROBABILITY = {
  new_lead: 10, contacted: 25, qualified: 50,
  proposal_sent: 65, negotiation: 80, closed_won: 100, closed_lost: 0
};

// Auth middleware
function getClientId(req) {
  return parseInt(req.query.client_id || req.body?.client_id || req.user?.clientId);
}

// GET /api/deals — List all deals
router.get('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const { stage, source, contact_id, limit = 100 } = req.query;
    let where = 'WHERE d.client_id = :clientId';
    const replacements = { clientId, limit: parseInt(limit) };
    if (stage) { where += ' AND d.stage = :stage'; replacements.stage = stage; }
    if (source) { where += ' AND d.source = :source'; replacements.source = source; }
    if (contact_id) { where += ' AND d.contact_id = :contactId'; replacements.contactId = parseInt(contact_id); }

    const deals = await sequelize.query(
      `SELECT d.*, c.first_name, c.last_name, c.phone as contact_phone, c.email as contact_email,
              EXTRACT(DAY FROM NOW() - d.updated_at) as days_in_stage
       FROM deals d LEFT JOIN contacts c ON d.contact_id = c.id
       ${where} ORDER BY d.updated_at DESC LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );
    res.json({ success: true, count: deals.length, deals });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/deals/pipeline — Pipeline summary
router.get('/pipeline', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const stages = await sequelize.query(
      `SELECT stage, COUNT(*) as count, COALESCE(SUM(amount),0) as total_amount,
              COALESCE(AVG(amount),0) as avg_amount
       FROM deals WHERE client_id = :clientId AND stage NOT IN ('closed_won','closed_lost')
       GROUP BY stage ORDER BY CASE stage
         WHEN 'new_lead' THEN 1 WHEN 'contacted' THEN 2 WHEN 'qualified' THEN 3
         WHEN 'proposal_sent' THEN 4 WHEN 'negotiation' THEN 5 END`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );

    const [totals] = await sequelize.query(
      `SELECT COUNT(*) as total_deals, COALESCE(SUM(amount),0) as total_pipeline,
              COUNT(*) FILTER (WHERE stage = 'closed_won') as won,
              COALESCE(SUM(amount) FILTER (WHERE stage = 'closed_won'),0) as won_amount,
              COUNT(*) FILTER (WHERE stage = 'closed_lost') as lost
       FROM deals WHERE client_id = :clientId`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, stages, totals });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/deals/forecast — Weighted forecast
router.get('/forecast', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const [result] = await sequelize.query(
      `SELECT COALESCE(SUM(amount * probability / 100.0), 0) as weighted_forecast,
              COUNT(*) as open_deals,
              COALESCE(SUM(amount), 0) as total_pipeline
       FROM deals WHERE client_id = :clientId AND stage NOT IN ('closed_won','closed_lost')`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/deals/:id — Single deal
router.get('/:id', async (req, res) => {
  try {
    const [deal] = await sequelize.query(
      `SELECT d.*, c.first_name, c.last_name, c.phone as contact_phone, c.email as contact_email
       FROM deals d LEFT JOIN contacts c ON d.contact_id = c.id
       WHERE d.id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
    res.json({ success: true, deal });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/deals — Create deal
router.post('/', async (req, res) => {
  try {
    const { client_id, contact_id, title, stage = 'new_lead', amount = 0, expected_close_date, source = 'manual', notes, assigned_to, tags } = req.body;
    if (!client_id || !title) return res.status(400).json({ success: false, error: 'client_id and title required' });

    const probability = STAGE_PROBABILITY[stage] || 0;
    const [deal] = await sequelize.query(
      `INSERT INTO deals (client_id, contact_id, title, stage, amount, probability, expected_close_date, source, notes, assigned_to, tags, created_at, updated_at)
       VALUES (:clientId, :contactId, :title, :stage, :amount, :probability, :closeDate, :source, :notes, :assignedTo, :tags, NOW(), NOW())
       RETURNING *`,
      { replacements: { clientId: client_id, contactId: contact_id || null, title, stage, amount, probability, closeDate: expected_close_date || null, source, notes: notes || null, assignedTo: assigned_to || null, tags: JSON.stringify(tags || []) }, type: QueryTypes.SELECT }
    );

    // Log activity
    try {
      await sequelize.query(
        `INSERT INTO activities (client_id, contact_id, deal_id, activity_type, title, metadata, created_at)
         VALUES (:clientId, :contactId, :dealId, 'deal_stage_change', :title, :meta, NOW())`,
        { replacements: { clientId: client_id, contactId: contact_id || null, dealId: deal.id, title: `Deal created: ${title}`, meta: JSON.stringify({ stage, amount }) } }
      );
    } catch (e) { /* non-critical */ }

    res.status(201).json({ success: true, deal });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/deals/:id — Update deal
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const fields = req.body;
    if (fields.stage) fields.probability = STAGE_PROBABILITY[fields.stage] || 0;
    if (fields.stage === 'closed_won') fields.actual_close_date = new Date().toISOString().split('T')[0];

    const setClauses = [];
    const replacements = { id };
    for (const [key, value] of Object.entries(fields)) {
      if (['client_id', 'id'].includes(key)) continue;
      const col = key === 'tags' ? key : key;
      setClauses.push(`${col} = :${key}`);
      replacements[key] = key === 'tags' ? JSON.stringify(value) : value;
    }
    if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    setClauses.push('updated_at = NOW()');

    await sequelize.query(`UPDATE deals SET ${setClauses.join(', ')} WHERE id = :id`, { replacements });
    const [deal] = await sequelize.query('SELECT * FROM deals WHERE id = :id', { replacements: { id }, type: QueryTypes.SELECT });
    res.json({ success: true, deal });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/deals/:id/stage — Quick stage change
router.put('/:id/stage', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { stage, note, lost_reason } = req.body;
    if (!stage) return res.status(400).json({ success: false, error: 'stage required' });

    const [oldDeal] = await sequelize.query('SELECT * FROM deals WHERE id = :id', { replacements: { id }, type: QueryTypes.SELECT });
    if (!oldDeal) return res.status(404).json({ success: false, error: 'Deal not found' });

    const probability = STAGE_PROBABILITY[stage] || 0;
    const updates = { stage, probability, updated_at: 'NOW()' };
    if (stage === 'closed_won') updates.actual_close_date = new Date().toISOString().split('T')[0];
    if (stage === 'closed_lost' && lost_reason) updates.lost_reason = lost_reason;

    await sequelize.query(
      `UPDATE deals SET stage = :stage, probability = :prob, updated_at = NOW()
       ${stage === 'closed_won' ? ", actual_close_date = CURRENT_DATE" : ''}
       ${lost_reason ? ", lost_reason = :reason" : ''}
       WHERE id = :id`,
      { replacements: { id, stage, prob: probability, reason: lost_reason || null } }
    );

    // Log activity
    try {
      await sequelize.query(
        `INSERT INTO activities (client_id, contact_id, deal_id, activity_type, title, description, metadata, created_at)
         VALUES (:clientId, :contactId, :dealId, 'deal_stage_change', :title, :desc, :meta, NOW())`,
        { replacements: { clientId: oldDeal.client_id, contactId: oldDeal.contact_id, dealId: id, title: `Stage: ${oldDeal.stage} → ${stage}`, desc: note || null, meta: JSON.stringify({ fromStage: oldDeal.stage, toStage: stage, amount: oldDeal.amount }) } }
      );
    } catch (e) { /* non-critical */ }

    const [deal] = await sequelize.query('SELECT * FROM deals WHERE id = :id', { replacements: { id }, type: QueryTypes.SELECT });
    res.json({ success: true, deal });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/deals/:id
router.delete('/:id', async (req, res) => {
  try {
    await sequelize.query('DELETE FROM deals WHERE id = :id', { replacements: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
