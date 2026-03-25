/**
 * Carrier Matching API — CW Carriers
 * Matches open loads to best-fit carriers from lg_carriers
 * Scores by: equipment, lane proximity, reliability, rate history
 */
const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// POST /match/:loadId — Find best carriers for a load
router.post('/match/:loadId', async (req, res) => {
  try {
    const loadId = req.params.loadId;
    const { max_carriers } = req.body;
    const limit = max_carriers || 20;

    // Find the load — try load_ref first (handles CW-XXXXX), then numeric id
    let load;
    const isNumeric = /^\d+$/.test(String(loadId));
    if (isNumeric) {
      const [[byId]] = await sequelize.query(`SELECT * FROM lg_loads WHERE id = $1`, { bind: [loadId] });
      load = byId;
    }
    if (!load) {
      const [[byRef]] = await sequelize.query(`SELECT * FROM lg_loads WHERE load_ref = $1`, { bind: [String(loadId)] });
      load = byRef;
    }
    if (!load) return res.status(404).json({ error: 'Load not found' });

    const originState = (load.origin_state || '').toUpperCase();
    const destState = (load.destination_state || '').toUpperCase();
    const equip = load.equipment_type || 'dry_van';

    // Find carriers — score by multiple factors
    const [carriers] = await sequelize.query(`
      SELECT id, carrier_name, mc_number, dot_number, contact_name, phone, email,
             equipment_types, home_city, home_state, home_zip,
             reliability_score, acceptance_rate, on_time_delivery_pct,
             avg_rate_per_mile, total_loads_completed, safety_rating, operating_status
      FROM lg_carriers
      WHERE tenant_id = 'logistics'
      ORDER BY reliability_score DESC NULLS LAST
      LIMIT 500
    `);

    const matches = [];

    for (const c of carriers) {
      const carrierState = (c.home_state || '').toUpperCase();
      const equipTypes = c.equipment_types || [];

      // Equipment score
      let equipScore = 0;
      if (Array.isArray(equipTypes) && equipTypes.includes(equip)) equipScore = 100;
      else if (typeof equipTypes === 'string' && equipTypes.includes(equip)) equipScore = 100;
      else equipScore = 20; // Mismatch

      // Lane score — proximity to origin
      let laneScore = 0;
      if (carrierState === originState) laneScore = 90;
      else if (carrierState === destState) laneScore = 60;
      else {
        // Check adjacent states
        const adjacent = {
          TX:['LA','AR','OK','NM'], OK:['TX','AR','KS','MO'], AR:['TX','LA','MS','TN','MO','OK'],
          IL:['IN','WI','MO','IA','KY'], PA:['OH','NY','NJ','DE','MD','WV'], GA:['FL','SC','NC','TN','AL'],
          FL:['GA','AL'], OH:['IN','PA','WV','KY','MI'], NY:['PA','NJ','CT','MA','VT'],
          CA:['OR','NV','AZ'], TN:['KY','VA','NC','GA','AL','MS','AR','MO'],
          NC:['SC','GA','TN','VA'], WI:['IL','MN','IA','MI'], MN:['WI','IA','ND','SD'],
          IN:['IL','OH','MI','KY'], MI:['OH','IN','WI'], KY:['TN','VA','WV','OH','IN','IL','MO'],
          MO:['IL','IA','KS','OK','AR','TN','KY','NE'], NJ:['NY','PA','DE'],
          VA:['NC','TN','KY','WV','MD','DC'], SC:['NC','GA'], AL:['FL','GA','TN','MS'],
          MS:['LA','AR','TN','AL'], LA:['TX','AR','MS'], KS:['MO','OK','NE','CO'],
          CO:['NM','OK','KS','NE','WY','UT'], AZ:['CA','NV','UT','NM'],
        };
        if (adjacent[originState]?.includes(carrierState) || adjacent[carrierState]?.includes(originState)) laneScore = 45;
        else laneScore = 10;
      }

      // Reliability score
      const reliabilityScore = Math.min(100, parseFloat(c.reliability_score) || 50);

      // Rate score — lower avg rate = better for broker margin
      const avgRpm = parseFloat(c.avg_rate_per_mile) || 0;
      const loadRpm = load.buy_rate && load.miles ? parseFloat(load.buy_rate) / parseFloat(load.miles) : 2.5;
      let rateScore = 50;
      if (avgRpm > 0 && loadRpm > 0) {
        if (avgRpm <= loadRpm) rateScore = 90; // Carrier rate below load rate = good margin
        else if (avgRpm <= loadRpm * 1.1) rateScore = 70;
        else if (avgRpm <= loadRpm * 1.25) rateScore = 40;
        else rateScore = 20;
      }

      // Safety score
      let safetyScore = 50;
      const rating = (c.safety_rating || '').toLowerCase();
      if (rating.includes('satisfactory')) safetyScore = 100;
      else if (rating.includes('conditional')) safetyScore = 50;
      else if (rating.includes('unsatisfactory')) safetyScore = 10;

      // Composite
      const matchScore = Math.round(
        equipScore * 0.25 +
        laneScore * 0.30 +
        reliabilityScore * 0.20 +
        rateScore * 0.10 +
        safetyScore * 0.15
      );

      if (matchScore < 20) continue;

      matches.push({
        carrier_id: c.id,
        company_name: c.carrier_name,
        full_name: c.contact_name,
        mc_number: c.mc_number,
        dot_number: c.dot_number,
        phone: c.phone,
        email: c.email,
        home: c.home_city && c.home_state ? `${c.home_city}, ${c.home_state}` : null,
        match_score: matchScore,
        scores: {
          lane: laneScore,
          equipment: equipScore,
          reliability: Math.round(reliabilityScore),
          rate: rateScore,
          safety: safetyScore,
        },
        total_loads: parseInt(c.total_loads_completed) || 0,
        safety_rating: c.safety_rating,
      });
    }

    matches.sort((a, b) => b.match_score - a.match_score);
    const topMatches = matches.slice(0, limit);

    res.json({
      success: true,
      data: {
        load_ref: load.load_ref,
        lane: `${load.origin_city || '?'}, ${load.origin_state || '?'} → ${load.destination_city || '?'}, ${load.destination_state || '?'}`,
        equipment: equip,
        top_matches: topMatches.length,
        total_carriers_evaluated: carriers.length,
        matches: topMatches,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /campaigns — list past campaigns (stub)
router.get('/campaigns', (req, res) => {
  res.json({ success: true, data: [] });
});

// POST /campaign/:loadId — launch outbound campaign (stub)
router.post('/campaign/:loadId', (req, res) => {
  res.json({ success: true, data: { message: 'Campaign queued — carriers will be contacted via Rachel AI' } });
});

module.exports = router;
