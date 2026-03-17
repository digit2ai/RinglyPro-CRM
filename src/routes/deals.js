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

// ═══════════════════════════════════════════════════════════════
// DEAL SYNC — Pull deals from connected CRMs into local DB
// ═══════════════════════════════════════════════════════════════

const GHL_BASE = 'https://services.leadconnectorhq.com';
const HS_BASE = 'https://api.hubapi.com';

// GHL stage → local stage mapping
const GHL_STAGE_MAP = {
  'new lead': 'new_lead', 'contacted': 'contacted', 'qualified': 'qualified',
  'proposal sent': 'proposal_sent', 'negotiation': 'negotiation',
  'closed': 'closed_won', 'won': 'closed_won', 'lost': 'closed_lost'
};

// HubSpot stage → local stage mapping
const HS_STAGE_MAP = {
  'appointmentscheduled': 'new_lead', 'qualifiedtobuy': 'qualified',
  'presentationscheduled': 'proposal_sent', 'decisionmakerboughtin': 'negotiation',
  'contractsent': 'negotiation', 'closedwon': 'closed_won', 'closedlost': 'closed_lost'
};

// Zoho stage → local stage mapping
const ZOHO_STAGE_MAP = {
  'qualification': 'new_lead', 'needs analysis': 'contacted',
  'value proposition': 'qualified', 'proposal/price quote': 'proposal_sent',
  'negotiation/review': 'negotiation', 'closed won': 'closed_won',
  'closed-won': 'closed_won', 'closed lost': 'closed_lost', 'closed-lost': 'closed_lost'
};

// GET /api/deals/sync — Sync deals from CRMs + return merged pipeline
router.get('/sync', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    // Get client CRM config
    const [client] = await sequelize.query(
      `SELECT id, ghl_api_key, ghl_location_id, hubspot_api_key, settings
       FROM clients WHERE id = :clientId`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const synced = { ghl: 0, hubspot: 0, zoho: 0 };

    // ─── Sync GHL Opportunities ───────────────────────────
    if (client.ghl_api_key && client.ghl_location_id) {
      try {
        // Get GHL pipelines first
        const pipRes = await fetch(`${GHL_BASE}/opportunities/pipelines?locationId=${client.ghl_location_id}`, {
          headers: { 'Authorization': `Bearer ${client.ghl_api_key}`, 'Version': '2021-07-28' }
        });
        const pipData = await pipRes.json();
        const stageNames = {};
        if (pipData.pipelines) {
          pipData.pipelines.forEach(p => p.stages.forEach(s => { stageNames[s.id] = s.name.toLowerCase(); }));
        }

        // Get GHL opportunities
        const oppRes = await fetch(`${GHL_BASE}/opportunities/search`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${client.ghl_api_key}`, 'Version': '2021-07-28', 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId: client.ghl_location_id, limit: 100 })
        });
        const oppData = await oppRes.json();

        if (oppData.opportunities) {
          for (const opp of oppData.opportunities) {
            const stageName = stageNames[opp.pipelineStageId] || 'new_lead';
            const localStage = GHL_STAGE_MAP[stageName] || 'new_lead';
            const amount = Number(opp.monetaryValue) || 0;
            const title = opp.name || 'GHL Deal';

            // Upsert: check if we already have this GHL deal
            const [existing] = await sequelize.query(
              `SELECT id FROM deals WHERE client_id = :clientId AND source = 'ghl_sync' AND notes LIKE :ghlId`,
              { replacements: { clientId, ghlId: `%ghl_id:${opp.id}%` }, type: QueryTypes.SELECT }
            );

            if (existing) {
              await sequelize.query(
                `UPDATE deals SET stage = :stage, amount = :amount, probability = :prob, title = :title, updated_at = NOW() WHERE id = :id`,
                { replacements: { id: existing.id, stage: localStage, amount, prob: Number(STAGE_PROBABILITY[localStage]) || 0, title } }
              );
            } else {
              await sequelize.query(
                `INSERT INTO deals (client_id, title, stage, amount, probability, source, notes, created_at, updated_at)
                 VALUES (:clientId, :title, :stage, :amount, :prob, 'ghl_sync', :notes, NOW(), NOW())`,
                { replacements: { clientId, title, stage: localStage, amount, prob: Number(STAGE_PROBABILITY[localStage]) || 0, notes: `ghl_id:${opp.id}` } }
              );
              synced.ghl++;
            }
          }
        }
      } catch (e) { console.error('[Deal Sync] GHL error:', e.message); }
    }

    // ─── Sync HubSpot Deals ──────────────────────────────
    const hsToken = client.hubspot_api_key || client.settings?.integration?.hubspot?.accessToken;
    if (hsToken) {
      try {
        const hsRes = await fetch(`${HS_BASE}/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,pipeline`, {
          headers: { 'Authorization': `Bearer ${hsToken}` }
        });
        const hsData = await hsRes.json();

        if (hsData.results) {
          for (const deal of hsData.results) {
            const stageName = deal.properties.dealstage || '';
            const localStage = HS_STAGE_MAP[stageName] || 'new_lead';
            const amount = Number(deal.properties.amount) || 0;
            const title = deal.properties.dealname || 'HubSpot Deal';

            const [existing] = await sequelize.query(
              `SELECT id FROM deals WHERE client_id = :clientId AND source = 'hubspot_sync' AND notes LIKE :hsId`,
              { replacements: { clientId, hsId: `%hs_id:${deal.id}%` }, type: QueryTypes.SELECT }
            );

            if (existing) {
              await sequelize.query(
                `UPDATE deals SET stage = :stage, amount = :amount, probability = :prob, title = :title, updated_at = NOW() WHERE id = :id`,
                { replacements: { id: existing.id, stage: localStage, amount, prob: Number(STAGE_PROBABILITY[localStage]) || 0, title } }
              );
            } else {
              await sequelize.query(
                `INSERT INTO deals (client_id, title, stage, amount, probability, source, notes, created_at, updated_at)
                 VALUES (:clientId, :title, :stage, :amount, :prob, 'hubspot_sync', :notes, NOW(), NOW())`,
                { replacements: { clientId, title, stage: localStage, amount, prob: Number(STAGE_PROBABILITY[localStage]) || 0, notes: `hs_id:${deal.id}` } }
              );
              synced.hubspot++;
            }
          }
        }
      } catch (e) { console.error('[Deal Sync] HubSpot error:', e.message); }
    }

    // ─── Sync Zoho Deals ─────────────────────────────────
    const zoho = client.settings?.integration?.zoho;
    if (zoho?.enabled && zoho?.refreshToken) {
      try {
        // Get Zoho access token
        const tokenRes = await fetch(`https://accounts.zoho.${zoho.region || 'com'}/oauth/v2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&client_id=${zoho.clientId}&client_secret=${zoho.clientSecret}&refresh_token=${zoho.refreshToken}`
        });
        const tokenData = await tokenRes.json();
        const zohoToken = tokenData.access_token;

        if (zohoToken) {
          const zoRes = await fetch(`https://www.zohoapis.${zoho.region || 'com'}/crm/v2/Deals?per_page=100`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${zohoToken}` }
          });
          const zoData = await zoRes.json();

          if (zoData.data) {
            for (const deal of zoData.data) {
              const stageName = (deal.Stage || '').toLowerCase();
              const localStage = ZOHO_STAGE_MAP[stageName] || 'new_lead';
              const amount = Number(deal.Amount) || 0;
              const title = deal.Deal_Name || 'Zoho Deal';

              const [existing] = await sequelize.query(
                `SELECT id FROM deals WHERE client_id = :clientId AND source = 'zoho_sync' AND notes LIKE :zoId`,
                { replacements: { clientId, zoId: `%zoho_id:${deal.id}%` }, type: QueryTypes.SELECT }
              );

              if (existing) {
                await sequelize.query(
                  `UPDATE deals SET stage = :stage, amount = :amount, probability = :prob, title = :title, updated_at = NOW() WHERE id = :id`,
                  { replacements: { id: existing.id, stage: localStage, amount, prob: Number(STAGE_PROBABILITY[localStage]) || 0, title } }
                );
              } else {
                await sequelize.query(
                  `INSERT INTO deals (client_id, title, stage, amount, probability, source, notes, created_at, updated_at)
                   VALUES (:clientId, :title, :stage, :amount, :prob, 'zoho_sync', :notes, NOW(), NOW())`,
                  { replacements: { clientId, title, stage: localStage, amount, prob: Number(STAGE_PROBABILITY[localStage]) || 0, notes: `zoho_id:${deal.id}` } }
                );
                synced.zoho++;
              }
            }
          }
        }
      } catch (e) { console.error('[Deal Sync] Zoho error:', e.message); }
    }

    // Return merged pipeline
    const deals = await sequelize.query(
      `SELECT d.*, c.first_name, c.last_name, c.phone as contact_phone,
              EXTRACT(DAY FROM NOW() - d.updated_at) as days_in_stage
       FROM deals d LEFT JOIN contacts c ON d.contact_id = c.id
       WHERE d.client_id = :clientId ORDER BY d.updated_at DESC`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );

    const [forecast] = await sequelize.query(
      `SELECT COALESCE(SUM(amount * probability / 100.0), 0) as weighted_forecast,
              COUNT(*) as open_deals, COALESCE(SUM(amount), 0) as total_pipeline
       FROM deals WHERE client_id = :clientId AND stage NOT IN ('closed_won','closed_lost')`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      synced,
      deals,
      forecast,
      total: deals.length
    });
  } catch (e) {
    console.error('[Deal Sync] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
