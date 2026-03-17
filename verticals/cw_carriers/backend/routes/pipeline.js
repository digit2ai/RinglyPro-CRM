/**
 * CW Carriers — HubSpot Pipeline API
 * Kanban board with real HubSpot deal stages
 */
const express = require('express');
const router = express.Router();
const hubspot = require('../services/hubspot.cw');
const sequelize = require('../services/db.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET /pipelines — List all HubSpot pipelines
router.get('/pipelines', async (req, res) => {
  try {
    const result = await hubspot.getPipelines();
    if (result.success) {
      res.json({ success: true, pipelines: result.data?.results || [] });
    } else {
      // Fallback: return default pipeline structure
      res.json({
        success: true,
        pipelines: [{
          id: 'default',
          label: 'Sales Pipeline',
          stages: [
            { id: 'appointmentscheduled', label: 'Appointment Scheduled' },
            { id: 'qualifiedtobuy', label: 'Qualified to Buy' },
            { id: 'presentationscheduled', label: 'Presentation Scheduled' },
            { id: 'decisionmakerboughtin', label: 'Decision Maker Bought-In' },
            { id: 'contractsent', label: 'Contract Sent' },
            { id: 'closedwon', label: 'Closed Won' },
            { id: 'closedlost', label: 'Closed Lost' }
          ]
        }],
        fallback: true
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /deals — Get all deals with stage info for the Kanban board
router.get('/deals', async (req, res) => {
  try {
    const pipelineId = req.query.pipeline_id || 'default';
    const result = await hubspot.getDealsWithStages(pipelineId);

    if (result.success) {
      const deals = (result.data?.results || []).map(d => ({
        id: d.id,
        title: d.properties?.dealname || 'Untitled',
        amount: parseFloat(d.properties?.amount || 0),
        stage: d.properties?.dealstage || 'appointmentscheduled',
        pipeline: d.properties?.pipeline || 'default',
        closedate: d.properties?.closedate || null,
        last_modified: d.properties?.hs_lastmodifieddate || null,
        source: 'hubspot'
      }));

      // Calculate metrics
      const totalPipeline = deals.reduce((s, d) => s + d.amount, 0);
      const openDeals = deals.filter(d => !['closedwon', 'closedlost'].includes(d.stage));
      const wonDeals = deals.filter(d => d.stage === 'closedwon');
      const wonRevenue = wonDeals.reduce((s, d) => s + d.amount, 0);
      // Weighted forecast: each stage has a probability
      const stageProbability = {
        appointmentscheduled: 0.1,
        qualifiedtobuy: 0.2,
        presentationscheduled: 0.4,
        decisionmakerboughtin: 0.6,
        contractsent: 0.8,
        closedwon: 1.0,
        closedlost: 0
      };
      const weightedForecast = openDeals.reduce((s, d) => s + d.amount * (stageProbability[d.stage] || 0.1), 0);

      res.json({
        success: true,
        deals,
        forecast: {
          total_deals: deals.length,
          total_pipeline: totalPipeline,
          weighted_forecast: Math.round(weightedForecast),
          open_count: openDeals.length,
          won_count: wonDeals.length,
          won_revenue: wonRevenue
        }
      });
    } else {
      // Fallback: return local CW loads as pipeline
      const [loads] = await sequelize.query(
        `SELECT l.id, l.load_ref as title, l.rate_usd as amount, l.status,
                l.origin, l.destination, l.created_at, l.updated_at
         FROM cw_loads l ORDER BY l.created_at DESC LIMIT 100`
      );

      const stageMap = { open: 'appointmentscheduled', covered: 'qualifiedtobuy', in_transit: 'presentationscheduled', delivered: 'closedwon', cancelled: 'closedlost' };
      const deals = loads.map(l => ({
        id: l.id,
        title: l.title ? `Load ${l.title}: ${l.origin} → ${l.destination}` : `${l.origin || '?'} → ${l.destination || '?'}`,
        amount: parseFloat(l.amount || 0),
        stage: stageMap[l.status] || 'appointmentscheduled',
        pipeline: 'default',
        closedate: null,
        last_modified: l.updated_at,
        source: 'cw_local'
      }));

      res.json({ success: true, deals, forecast: { total_deals: deals.length, total_pipeline: 0, weighted_forecast: 0, open_count: 0 }, fallback: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /deals/:id/stage — Move a deal to a new stage
router.put('/deals/:id/stage', async (req, res) => {
  try {
    const { stage } = req.body;
    if (!stage) return res.status(400).json({ error: 'stage required' });

    const result = await hubspot.updateDealStage(req.params.id, stage);
    if (result.success) {
      res.json({ success: true, message: `Deal moved to ${stage}` });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /deals — Create a new deal in HubSpot
router.post('/deals', async (req, res) => {
  try {
    const { dealname, amount, dealstage, pipeline, closedate, description } = req.body;
    if (!dealname) return res.status(400).json({ error: 'dealname required' });

    const result = await hubspot.hubspotRequest('POST', '/crm/v3/objects/deals', {
      properties: {
        dealname,
        amount: String(amount || 0),
        pipeline: pipeline || 'default',
        dealstage: dealstage || 'appointmentscheduled',
        closedate: closedate || null,
        description: description || ''
      }
    });

    if (result.success) {
      res.status(201).json({ success: true, deal: result.data });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /deals/:id — Update a deal
router.put('/deals/:id', async (req, res) => {
  try {
    const result = await hubspot.updateDeal(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, deal: result.data });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /deals/:id — Delete a deal
router.delete('/deals/:id', async (req, res) => {
  try {
    const result = await hubspot.deleteDeal(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Deal deleted' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /metrics — Pipeline metrics summary
router.get('/metrics', async (req, res) => {
  try {
    const result = await hubspot.getPipelineMetrics();
    if (result.success) {
      res.json({ success: true, ...result.data });
    } else {
      res.json({ success: true, total_deals: 0, open_deals: 0, won_deals: 0, total_pipeline: 0, won_revenue: 0 });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
