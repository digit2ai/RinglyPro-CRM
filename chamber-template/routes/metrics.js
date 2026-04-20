// Chamber Template - Metrics Routes Factory
module.exports = function createMetricsRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const { Sequelize, QueryTypes } = require('sequelize');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });

  const t = config.db_prefix;

  function calcGini(values) {
    if (!values.length) return 0;
    const n = values.length; const mean = values.reduce((a, b) => a + b, 0) / n;
    if (mean === 0) return 0;
    let sumDiff = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sumDiff += Math.abs(values[i] - values[j]);
    return sumDiff / (2 * n * n * mean);
  }

  // GET /gini
  router.get('/gini', async (req, res) => {
    try {
      const { dimension = 'regional', metric = 'opportunities' } = req.query;
      let values = [], details = [];
      if (dimension === 'regional') {
        const regions = await sequelize.query(`SELECT name, opportunity_count FROM ${t}_regions ORDER BY id`, { type: QueryTypes.SELECT });
        if (metric === 'opportunities') { values = regions.map(r => r.opportunity_count || 0); details = regions.map(r => ({ name: r.name, value: r.opportunity_count || 0 })); }
        else if (metric === 'members') {
          const mc = await sequelize.query(`SELECT r.name, COUNT(m.id) as count FROM ${t}_regions r LEFT JOIN ${t}_members m ON m.region_id = r.id AND m.status = 'active' GROUP BY r.id, r.name ORDER BY r.id`, { type: QueryTypes.SELECT });
          values = mc.map(r => parseInt(r.count) || 0); details = mc.map(r => ({ name: r.name, value: parseInt(r.count) || 0 }));
        }
      } else if (dimension === 'sectoral') {
        const sc = await sequelize.query(`SELECT sector, COUNT(*) as count FROM ${t}_members WHERE status = 'active' AND sector IS NOT NULL GROUP BY sector ORDER BY count DESC`, { type: QueryTypes.SELECT });
        values = sc.map(r => parseInt(r.count)); details = sc;
      }
      const gini = calcGini(values);
      const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const corrections = details.map(d => ({ name: d.name, value: d.value, correction_factor: mean > 0 ? Math.round((1 + 0.3 * ((mean - d.value) / mean)) * 1000) / 1000 : 1 }));
      res.json({ success: true, data: { dimension, metric, gini: Math.round(gini * 10000) / 10000, threshold: 0.40, correction_active: gini > 0.40, mean: Math.round(mean * 100) / 100, details: corrections } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /hci
  router.get('/hci', async (req, res) => {
    try {
      const regions = await sequelize.query(`SELECT opportunity_count FROM ${t}_regions`, { type: QueryTypes.SELECT });
      const gini = calcGini(regions.map(r => r.opportunity_count || 0));
      const equityFactor = 1 - gini;
      const [trustResult] = await sequelize.query(`SELECT AVG(trust_score) as avg_trust FROM ${t}_members WHERE status = 'active'`, { type: QueryTypes.SELECT });
      const avgTrust = parseFloat(trustResult.avg_trust) || 0.5;
      const [memberCount] = await sequelize.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN last_active_at > NOW() - INTERVAL '90 days' OR created_at > NOW() - INTERVAL '90 days' THEN 1 END) as active FROM ${t}_members WHERE status = 'active'`, { type: QueryTypes.SELECT });
      const totalMembers = parseInt(memberCount.total) || 0;
      const activeMembers = parseInt(memberCount.active) || totalMembers;
      const networkValue = 0.001 * activeMembers * activeMembers * avgTrust;
      const networkValueMax = 0.001 * 2500 * 2500 * 1.0;
      const [projectStats] = await sequelize.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed, COUNT(CASE WHEN status NOT IN ('completed','cancelled') THEN 1 END) as active FROM ${t}_projects`, { type: QueryTypes.SELECT });
      const projectTotal = parseInt(projectStats.total) || 0;
      const projectCompleted = parseInt(projectStats.completed) || 0;
      const projectActive = parseInt(projectStats.active) || 0;
      const projectSuccess = projectTotal > 0 ? projectCompleted / projectTotal : 0;
      const activationRate = totalMembers > 0 ? activeMembers / totalMembers : 0;
      const weights = { equity: 0.20, trust: 0.20, network: 0.20, projects: 0.25, activation: 0.15 };
      const hci = weights.equity * equityFactor + weights.trust * avgTrust + weights.network * Math.min(networkValue / networkValueMax, 1) + weights.projects * projectSuccess + weights.activation * activationRate;
      const hciRounded = Math.round(hci * 10000) / 10000;

      await sequelize.query(`INSERT INTO ${t}_network_metrics (date, total_members, active_members, gini_regional, avg_trust, network_value, projects_active, projects_completed, hci_score) VALUES (CURRENT_DATE, :total, :active, :gini, :trust, :netVal, :projActive, :projComplete, :hci) ON CONFLICT (date) DO UPDATE SET total_members = EXCLUDED.total_members, active_members = EXCLUDED.active_members, gini_regional = EXCLUDED.gini_regional, avg_trust = EXCLUDED.avg_trust, network_value = EXCLUDED.network_value, projects_active = EXCLUDED.projects_active, projects_completed = EXCLUDED.projects_completed, hci_score = EXCLUDED.hci_score`, { replacements: { total: totalMembers, active: activeMembers, gini: Math.round(gini * 10000) / 10000, trust: Math.round(avgTrust * 10000) / 10000, netVal: Math.round(networkValue * 100) / 100, projActive: projectActive, projComplete: projectCompleted, hci: hciRounded } });

      res.json({ success: true, data: { hci: hciRounded, target: 0.65, components: { equity: { value: Math.round(equityFactor * 10000) / 10000, weight: weights.equity }, trust: { value: Math.round(avgTrust * 10000) / 10000, weight: weights.trust }, network: { value: Math.round(Math.min(networkValue / networkValueMax, 1) * 10000) / 10000, weight: weights.network }, projects: { value: Math.round(projectSuccess * 10000) / 10000, weight: weights.projects, total: projectTotal }, activation: { value: Math.round(activationRate * 10000) / 10000, weight: weights.activation, active: activeMembers, total: totalMembers } } } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /network-value
  router.get('/network-value', async (req, res) => {
    try {
      const [stats] = await sequelize.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN last_active_at > NOW() - INTERVAL '90 days' OR created_at > NOW() - INTERVAL '90 days' THEN 1 END) as active, AVG(trust_score) as avg_trust FROM ${t}_members WHERE status = 'active'`, { type: QueryTypes.SELECT });
      const active = parseInt(stats.active) || parseInt(stats.total) || 0;
      const avgTrust = parseFloat(stats.avg_trust) || 0.5;
      const k = 0.001; const networkValue = k * active * active * avgTrust;
      res.json({ success: true, data: { network_value: Math.round(networkValue * 100) / 100, active_members: active, avg_trust: Math.round(avgTrust * 10000) / 10000, formula: 'V = k * n_active^2 * avg_trust', k } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /trust/:id
  router.get('/trust/:id', async (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const [member] = await sequelize.query(`SELECT id, first_name, last_name, trust_score, verified, verification_level, membership_type, created_at FROM ${t}_members WHERE id = :id`, { replacements: { id: memberId }, type: QueryTypes.SELECT });
      if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
      const references = await sequelize.query(`SELECT AVG(collaboration_quality) as avg_quality, COUNT(*) as count FROM ${t}_trust_references WHERE to_member_id = :id`, { replacements: { id: memberId }, type: QueryTypes.SELECT });
      const [projectStats] = await sequelize.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed FROM ${t}_project_members WHERE member_id = :id`, { replacements: { id: memberId }, type: QueryTypes.SELECT });
      const V = member.verification_level === 'id_complete' ? 1.0 : member.verification_level === 'email' ? 0.5 : 0;
      const R = parseFloat(references[0].avg_quality) || 0;
      const projTotal = parseInt(projectStats.total) || 0;
      const P = projTotal > 0 ? (parseInt(projectStats.completed) || 0) / projTotal : 0;
      const tenureYears = (Date.now() - new Date(member.created_at).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const A = Math.min(tenureYears / 5, 1);
      const mScores = config.membership_scores || {};
      const M = mScores[member.membership_type] || 0.4;
      const trustBase = 0.30 * V + 0.25 * R + 0.20 * P + 0.15 * A + 0.10 * M;
      res.json({ success: true, data: { member_id: memberId, name: `${member.first_name} ${member.last_name}`, trust_score: parseFloat(member.trust_score), trust_base_calculated: Math.round(trustBase * 10000) / 10000, components: { verification: { value: V, weight: 0.30 }, references: { value: Math.round(R * 1000) / 1000, weight: 0.25, count: parseInt(references[0].count) }, projects: { value: Math.round(P * 1000) / 1000, weight: 0.20 }, tenure: { value: Math.round(A * 1000) / 1000, weight: 0.15 }, membership: { value: M, weight: 0.10, type: member.membership_type } } } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  // GET /dashboard
  router.get('/dashboard', async (req, res) => {
    try {
      const history = await sequelize.query(`SELECT * FROM ${t}_network_metrics ORDER BY date DESC LIMIT 30`, { type: QueryTypes.SELECT });
      const [counts] = await sequelize.query(`SELECT (SELECT COUNT(*) FROM ${t}_members WHERE status = 'active') as members, (SELECT COUNT(*) FROM ${t}_projects WHERE status NOT IN ('completed','cancelled')) as active_projects, (SELECT COUNT(*) FROM ${t}_companies) as companies, (SELECT COUNT(*) FROM ${t}_rfqs WHERE status = 'open') as open_rfqs, (SELECT COUNT(*) FROM ${t}_opportunities WHERE status = 'active') as opportunities, (SELECT COALESCE(SUM(amount), 0) FROM ${t}_transactions WHERE status = 'completed') as total_revenue`, { type: QueryTypes.SELECT });
      const membersByRegion = await sequelize.query(`SELECT r.name, COUNT(m.id) as count FROM ${t}_regions r LEFT JOIN ${t}_members m ON m.region_id = r.id AND m.status = 'active' GROUP BY r.id, r.name ORDER BY r.id`, { type: QueryTypes.SELECT });
      const membersByType = await sequelize.query(`SELECT membership_type, COUNT(*) as count FROM ${t}_members WHERE status = 'active' GROUP BY membership_type ORDER BY count DESC`, { type: QueryTypes.SELECT });
      res.json({ success: true, data: { current: counts, members_by_region: membersByRegion, members_by_type: membersByType, history: history.reverse() } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  return router;
};
