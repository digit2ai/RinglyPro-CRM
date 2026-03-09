const sequelize = require('./db.lg');

async function match_carriers_to_load(input, user) {
  const { load_id, max_results } = input;
  if (!load_id) throw new Error('load_id required');
  const [[load]] = await sequelize.query(`SELECT * FROM cw_loads WHERE id = $1`, { bind: [load_id] });
  if (!load) throw new Error('Load not found');

  const [carriers] = await sequelize.query(
    `SELECT c.id, c.full_name, c.company_name, c.phone, c.email, c.mc_number, c.dot_number, c.safety_rating,
       (SELECT COUNT(*) FROM cw_loads l2 INNER JOIN cw_carrier_offers o ON o.load_id = l2.id AND o.carrier_contact_id = c.id AND o.status = 'accepted' WHERE LOWER(l2.origin) LIKE LOWER($2) AND LOWER(l2.destination) LIKE LOWER($3)) as lane_loads,
       (SELECT AVG(o.offered_rate) FROM cw_carrier_offers o WHERE o.carrier_contact_id = c.id AND o.status = 'accepted') as avg_rate,
       (SELECT COUNT(*) FROM cw_carrier_offers o WHERE o.carrier_contact_id = c.id AND o.status = 'accepted') as total_completed,
       (SELECT COUNT(*) FROM cw_carrier_offers o WHERE o.carrier_contact_id = c.id) as total_offers
     FROM cw_contacts c WHERE c.contact_type = 'carrier' ORDER BY c.id`,
    { bind: [load_id, `%${(load.origin || '').split(',')[0]}%`, `%${(load.destination || '').split(',')[0]}%`] }
  );

  const scored = carriers.map(carrier => {
    const laneScore = Math.min(100, (parseInt(carrier.lane_loads) || 0) * 25);
    const reliabilityScore = carrier.total_offers > 0 ? Math.round((parseInt(carrier.total_completed) / parseInt(carrier.total_offers)) * 100) : 50;
    let rateScore = 50;
    if (carrier.avg_rate && load.rate_usd) { const diff = Math.abs(parseFloat(carrier.avg_rate) - parseFloat(load.rate_usd)) / parseFloat(load.rate_usd); rateScore = Math.max(0, Math.round(100 - diff * 200)); }
    let safetyScore = 70;
    if (carrier.safety_rating === 'Satisfactory') safetyScore = 100;
    else if (carrier.safety_rating === 'Conditional') safetyScore = 40;
    const matchScore = Math.round(laneScore * 0.30 + rateScore * 0.25 + reliabilityScore * 0.20 + safetyScore * 0.15 + 70 * 0.10);
    return { carrier_id: carrier.id, company_name: carrier.company_name, full_name: carrier.full_name, phone: carrier.phone, email: carrier.email, mc_number: carrier.mc_number, match_score: matchScore, scores: { lane: laneScore, rate: rateScore, reliability: reliabilityScore, safety: safetyScore, equipment: 70 }, historical: { lane_loads: parseInt(carrier.lane_loads) || 0, avg_rate: carrier.avg_rate, total_completed: parseInt(carrier.total_completed) || 0 } };
  });

  scored.sort((a, b) => b.match_score - a.match_score);
  const topMatches = scored.slice(0, max_results || 20);
  for (const m of topMatches) {
    await sequelize.query(`INSERT INTO lg_freight_matches (tenant_id, load_id, carrier_contact_id, match_score, lane_score, rate_score, reliability_score, safety_score, equipment_score, historical_loads_in_lane, avg_historical_rate, created_at) VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      { bind: [load_id, m.carrier_id, m.match_score, m.scores.lane, m.scores.rate, m.scores.reliability, m.scores.safety, m.scores.equipment, m.historical.lane_loads, m.historical.avg_rate] }).catch(() => {});
  }
  return { load_id, load_ref: load.load_ref, lane: `${load.origin} → ${load.destination}`, total_carriers_evaluated: carriers.length, top_matches: topMatches.length, matches: topMatches };
}

async function launch_coverage_campaign(input, user) {
  const { load_id, max_carriers } = input;
  if (!load_id) throw new Error('load_id required');
  const matchResult = await match_carriers_to_load({ load_id, max_results: max_carriers || 10 }, user);
  const campaignId = `CAMP-${Date.now().toString(36).toUpperCase()}`;
  for (const match of matchResult.matches) {
    await sequelize.query(`UPDATE lg_freight_matches SET campaign_id = $1, campaign_status = 'pending' WHERE load_id = $2 AND carrier_contact_id = $3 AND campaign_id IS NULL ORDER BY created_at DESC LIMIT 1`, { bind: [campaignId, load_id, match.carrier_id] }).catch(() => {});
  }
  return { campaign_id: campaignId, load_id, load_ref: matchResult.load_ref, lane: matchResult.lane, carriers_to_contact: matchResult.matches.length, carriers: matchResult.matches.map(m => ({ carrier_id: m.carrier_id, company_name: m.company_name, phone: m.phone, match_score: m.match_score })), message: `Coverage campaign ${campaignId} created. ${matchResult.matches.length} carriers queued.` };
}

async function get_match_score(input, user) {
  const { load_id, carrier_id } = input;
  if (!load_id || !carrier_id) throw new Error('load_id and carrier_id required');
  const [[match]] = await sequelize.query(`SELECT fm.*, c.full_name, c.company_name, l.load_ref, l.origin, l.destination FROM lg_freight_matches fm LEFT JOIN cw_contacts c ON c.id = fm.carrier_contact_id LEFT JOIN cw_loads l ON l.id = fm.load_id WHERE fm.load_id = $1 AND fm.carrier_contact_id = $2 ORDER BY fm.created_at DESC LIMIT 1`, { bind: [load_id, carrier_id] });
  if (!match) { const result = await match_carriers_to_load({ load_id, max_results: 100 }, user); return result.matches.find(m => m.carrier_id === parseInt(carrier_id)) || { error: 'Carrier not found' }; }
  return { load_id: match.load_id, load_ref: match.load_ref, lane: `${match.origin} → ${match.destination}`, carrier_id: match.carrier_contact_id, company_name: match.company_name, match_score: parseFloat(match.match_score), score_breakdown: { lane: parseFloat(match.lane_score), rate: parseFloat(match.rate_score), reliability: parseFloat(match.reliability_score), safety: parseFloat(match.safety_score), equipment: parseFloat(match.equipment_score) }, campaign_id: match.campaign_id, campaign_status: match.campaign_status };
}

module.exports = { match_carriers_to_load, launch_coverage_campaign, get_match_score };
