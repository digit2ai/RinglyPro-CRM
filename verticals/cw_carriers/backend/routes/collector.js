/**
 * Business Collector Routes
 * Lead sourcing, enrichment, scoring, and prospect pipeline
 */
const express = require('express');
const router = express.Router();
const collector = require('../services/collector.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET /pipeline - Get scored prospect pipeline
router.get('/pipeline', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const prospects = await collector.getProspectPipeline(parseInt(limit));
    res.json({ success: true, data: prospects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /import - Import prospect list (JSON array)
router.post('/import', async (req, res) => {
  try {
    const { prospects } = req.body;
    if (!prospects || !Array.isArray(prospects) || !prospects.length) {
      return res.status(400).json({ error: 'prospects array required' });
    }
    const results = await collector.importProspects(prospects);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /enrich - Enrich a single company
router.post('/enrich', async (req, res) => {
  try {
    const { company_name, industry, location } = req.body;
    if (!company_name) return res.status(400).json({ error: 'company_name required' });
    const enriched = await collector.enrichProspect(company_name, { industry, location });
    const score = await collector.scoreProspect({
      company_name,
      industry: enriched.industry,
      estimated_volume: enriched.estimated_annual_freight_loads,
      lanes: enriched.likely_lanes,
      freight_types: enriched.likely_freight_types
    });
    res.json({ success: true, data: { ...enriched, score } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /score - Score an existing contact
router.post('/score', async (req, res) => {
  try {
    const { contact_id } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
    const sequelize = require('../services/db.cw');
    const [[contact]] = await sequelize.query(`SELECT * FROM cw_contacts WHERE id = $1`, { bind: [contact_id] });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    const score = await collector.scoreProspect({
      company_name: contact.company_name,
      industry: null,
      estimated_volume: contact.volume_estimate,
      lanes: contact.lanes,
      freight_types: contact.freight_types
    });
    res.json({ success: true, data: { contact_id, company_name: contact.company_name, score } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /suggest - AI-generated prospect suggestions
router.get('/suggest', async (req, res) => {
  try {
    const { count = 10 } = req.query;
    const suggestions = await collector.suggestProspects(parseInt(count));
    res.json({ success: true, data: suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /verticals - Show target verticals
router.get('/verticals', (req, res) => {
  res.json({
    success: true,
    data: {
      verticals: collector.DEFAULT_TARGET_VERTICALS,
      target_lanes: collector.DEFAULT_TARGET_LANES
    }
  });
});

module.exports = router;
