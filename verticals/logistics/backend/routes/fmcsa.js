const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.lg');
const sequelize = require('../services/db.lg');
const fmcsaService = require('../services/fmcsa.lg');

router.post('/verify', auth.dispatcher, async (req, res) => {
  try { res.json({ success: true, data: await fmcsaService.verify_carrier_authority(req.body) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/safety/:dotNumber', auth.dispatcher, async (req, res) => {
  try { res.json({ success: true, data: await fmcsaService.get_safety_score({ dot_number: req.params.dotNumber }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/insurance/:dotNumber', auth.dispatcher, async (req, res) => {
  try { res.json({ success: true, data: await fmcsaService.check_insurance_status({ dot_number: req.params.dotNumber }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/onboard', auth.dispatcher, async (req, res) => {
  try { res.json({ success: true, data: await fmcsaService.run_carrier_onboarding(req.body) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/compliance', auth.dispatcher, async (req, res) => {
  try { const [records] = await sequelize.query(`SELECT * FROM lg_carrier_compliance ORDER BY updated_at DESC LIMIT 100`); res.json({ success: true, data: records }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/expiring-insurance', auth.dispatcher, async (req, res) => {
  try {
    const [records] = await sequelize.query(`SELECT * FROM lg_carrier_compliance WHERE (bipd_coverage_to IS NOT NULL AND bipd_coverage_to < NOW() + INTERVAL '30 days') OR (cargo_coverage_to IS NOT NULL AND cargo_coverage_to < NOW() + INTERVAL '30 days') ORDER BY LEAST(COALESCE(bipd_coverage_to, '2099-01-01'), COALESCE(cargo_coverage_to, '2099-01-01')) ASC`);
    res.json({ success: true, data: records });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
