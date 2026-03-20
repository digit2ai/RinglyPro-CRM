/**
 * FMCSA API Routes — CW Carriers
 * Layer 1: Search carriers on demand
 * Layer 2: Lookup by DOT/MC number
 * Layer 3: Compliance check for existing carriers
 */
const express = require('express');
const router = express.Router();
const fmcsa = require('../services/fmcsa.cw');
const sequelize = require('../services/db.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// Layer 1: Search carriers by state, name, fleet size — live from FMCSA, no storage
router.get('/search', async (req, res) => {
  try {
    const { state, name, min_fleet_size, equipment, limit } = req.query;
    if (!state && !name) return res.status(400).json({ error: 'state or name required' });
    const result = await fmcsa.searchCarriers({ state, name, min_fleet_size, equipment, limit: parseInt(limit) || 50 });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Layer 2: Lookup single carrier by DOT or MC number
router.get('/lookup', async (req, res) => {
  try {
    const { dot_number, mc_number } = req.query;
    if (!dot_number && !mc_number) return res.status(400).json({ error: 'dot_number or mc_number required' });
    const result = await fmcsa.lookupCarrier({ dot_number, mc_number });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Layer 2b: Lookup and save — auto-fill + add to lg_carriers
router.post('/lookup-and-save', async (req, res) => {
  try {
    const { dot_number, mc_number } = req.body;
    const lookup = await fmcsa.lookupCarrier({ dot_number, mc_number });
    if (!lookup.found) return res.status(404).json({ success: false, error: 'Carrier not found in FMCSA' });

    // Save to lg_carriers (upsert by DOT number)
    const equipArray = '{dry_van}'; // Default — FMCSA doesn't provide equipment types
    await sequelize.query(`
      INSERT INTO lg_carriers (tenant_id, carrier_name, mc_number, dot_number, contact_name, phone,
        home_city, home_state, home_zip, equipment_types, safety_rating,
        operating_status, source, metadata, created_at, updated_at)
      VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'fmcsa', $12, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `, { bind: [
      lookup.legal_name, lookup.mc_number, lookup.dot_number, null, lookup.phone,
      lookup.city, lookup.state, lookup.zip, equipArray,
      lookup.status === 'active' ? 'Satisfactory' : 'Unknown',
      lookup.status, JSON.stringify({ power_units: lookup.power_units, total_drivers: lookup.total_drivers, hazmat: lookup.hazmat })
    ] });

    // Also create cw_contact via bridge
    try {
      const bridge = require('../services/bridge.cw');
      const [newCarrier] = await sequelize.query(
        `SELECT id FROM lg_carriers WHERE dot_number = $1 ORDER BY id DESC LIMIT 1`,
        { bind: [lookup.dot_number] }
      );
      if (newCarrier.length > 0) {
        await bridge.syncCarrierToCW(newCarrier[0].id);
      }
    } catch (e) { /* bridge not critical */ }

    res.json({ success: true, data: lookup, message: `${lookup.legal_name} added to carrier database` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Layer 3: Compliance check — verify existing carriers against FMCSA
router.post('/compliance-check', async (req, res) => {
  try {
    const { carrier_ids } = req.body;
    let carriers;

    if (carrier_ids && carrier_ids.length > 0) {
      // Check specific carriers
      [carriers] = await sequelize.query(
        `SELECT id, carrier_name, mc_number, dot_number FROM lg_carriers
         WHERE id IN (${carrier_ids.map((_, i) => `$${i + 1}`).join(',')})`,
        { bind: carrier_ids }
      );
    } else {
      // Check all carriers with DOT numbers (limit 50 per batch)
      [carriers] = await sequelize.query(
        `SELECT id, carrier_name, mc_number, dot_number FROM lg_carriers
         WHERE dot_number IS NOT NULL AND dot_number != ''
         ORDER BY updated_at ASC LIMIT 50`
      );
    }

    if (carriers.length === 0) return res.json({ success: true, data: { results: [], summary: { total: 0 } } });

    const result = await fmcsa.checkCompliance(carriers);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Layer 3b: Check all carriers — full compliance audit
router.get('/compliance-audit', async (req, res) => {
  try {
    const [carriers] = await sequelize.query(
      `SELECT id, carrier_name, mc_number, dot_number FROM lg_carriers
       WHERE (dot_number IS NOT NULL AND dot_number != '') OR (mc_number IS NOT NULL AND mc_number != '')
       ORDER BY updated_at ASC LIMIT 50`
    );
    if (carriers.length === 0) return res.json({ success: true, data: { results: [], summary: { total: 0 }, message: 'No carriers with DOT/MC numbers to check' } });
    const result = await fmcsa.checkCompliance(carriers);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cache stats
router.get('/cache', (req, res) => {
  res.json({ success: true, data: fmcsa.getCacheStats() });
});

module.exports = router;
