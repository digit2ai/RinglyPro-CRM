const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.lg');
const sequelize = require('../services/db.lg');
const matchingService = require('../services/matching.lg');

router.post('/match/:loadId', auth.dispatcher, async (req, res) => {
  try { res.json({ success: true, data: await matchingService.match_carriers_to_load({ load_id: req.params.loadId, max_results: req.body.max_results }, req.user) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaign/:loadId', auth.dispatcher, async (req, res) => {
  try { res.json({ success: true, data: await matchingService.launch_coverage_campaign({ load_id: req.params.loadId, max_carriers: req.body.max_carriers }, req.user) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/score/:loadId/:carrierId', auth.dispatcher, async (req, res) => {
  try { res.json({ success: true, data: await matchingService.get_match_score({ load_id: req.params.loadId, carrier_id: req.params.carrierId }, req.user) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/campaigns', auth.dispatcher, async (req, res) => {
  try {
    const [campaigns] = await sequelize.query(`SELECT campaign_id, load_id, COUNT(*) as total_carriers, SUM(CASE WHEN campaign_status = 'booked' THEN 1 ELSE 0 END) as booked, SUM(CASE WHEN campaign_status = 'interested' THEN 1 ELSE 0 END) as interested, SUM(CASE WHEN campaign_status = 'declined' THEN 1 ELSE 0 END) as declined, SUM(CASE WHEN campaign_status = 'no_answer' THEN 1 ELSE 0 END) as no_answer, MIN(created_at) as started_at FROM lg_freight_matches WHERE campaign_id IS NOT NULL GROUP BY campaign_id, load_id ORDER BY MIN(created_at) DESC LIMIT 50`);
    res.json({ success: true, data: campaigns });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/history/:loadId', auth.dispatcher, async (req, res) => {
  try {
    const [matches] = await sequelize.query(`SELECT fm.*, c.full_name, c.company_name, c.phone FROM lg_freight_matches fm LEFT JOIN cw_contacts c ON c.id = fm.carrier_contact_id WHERE fm.load_id = $1 ORDER BY fm.match_score DESC`, { bind: [req.params.loadId] });
    res.json({ success: true, data: matches });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
