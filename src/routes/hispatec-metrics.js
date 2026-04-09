// src/routes/hispatec-metrics.js -- Gini, HCI, TrustRank, Network Value metrics
const express = require('express');
const router = express.Router();
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

// Calculate Gini coefficient from an array of values
function calcGini(values) {
  if (!values.length) return 0;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;

  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(values[i] - values[j]);
    }
  }
  return sumDiff / (2 * n * n * mean);
}

// GET /gini -- Current Gini coefficient by dimension
router.get('/gini', async (req, res) => {
  try {
    const { dimension = 'regional', metric = 'opportunities' } = req.query;

    let values = [];
    let details = [];

    if (dimension === 'regional') {
      const regions = await sequelize.query(
        'SELECT name, opportunity_count FROM hispatec_regions ORDER BY id',
        { type: QueryTypes.SELECT }
      );

      if (metric === 'opportunities') {
        values = regions.map(r => r.opportunity_count || 0);
        details = regions.map(r => ({ name: r.name, value: r.opportunity_count || 0 }));
      } else if (metric === 'members') {
        const memberCounts = await sequelize.query(`
          SELECT r.name, COUNT(m.id) as count
          FROM hispatec_regions r
          LEFT JOIN hispatec_members m ON m.region_id = r.id AND m.status = 'active'
          GROUP BY r.id, r.name ORDER BY r.id
        `, { type: QueryTypes.SELECT });
        values = memberCounts.map(r => parseInt(r.count) || 0);
        details = memberCounts.map(r => ({ name: r.name, value: parseInt(r.count) || 0 }));
      } else if (metric === 'projects') {
        const projectCounts = await sequelize.query(`
          SELECT r.name, COUNT(DISTINCT p.id) as count
          FROM hispatec_regions r
          LEFT JOIN hispatec_members m ON m.region_id = r.id
          LEFT JOIN hispatec_project_members pm ON pm.member_id = m.id
          LEFT JOIN hispatec_projects p ON pm.project_id = p.id
          GROUP BY r.id, r.name ORDER BY r.id
        `, { type: QueryTypes.SELECT });
        values = projectCounts.map(r => parseInt(r.count) || 0);
        details = projectCounts.map(r => ({ name: r.name, value: parseInt(r.count) || 0 }));
      }
    } else if (dimension === 'sectoral') {
      const sectorCounts = await sequelize.query(`
        SELECT sector, COUNT(*) as count
        FROM hispatec_members WHERE status = 'active' AND sector IS NOT NULL
        GROUP BY sector ORDER BY count DESC
      `, { type: QueryTypes.SELECT });
      values = sectorCounts.map(r => parseInt(r.count));
      details = sectorCounts;
    }

    const gini = calcGini(values);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    // Calculate correction factors for regions
    const corrections = details.map(d => ({
      name: d.name,
      value: d.value,
      correction_factor: mean > 0 ? Math.round((1 + 0.3 * ((mean - d.value) / mean)) * 1000) / 1000 : 1
    }));

    res.json({
      success: true,
      data: {
        dimension,
        metric,
        gini: Math.round(gini * 10000) / 10000,
        threshold: 0.40,
        correction_active: gini > 0.40,
        mean: Math.round(mean * 100) / 100,
        details: corrections
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /hci -- HISPATEC Composite Index
router.get('/hci', async (req, res) => {
  try {
    // 1. Gini (equity factor = 1 - Gini)
    const regions = await sequelize.query(
      'SELECT opportunity_count FROM hispatec_regions',
      { type: QueryTypes.SELECT }
    );
    const oppValues = regions.map(r => r.opportunity_count || 0);
    const gini = calcGini(oppValues);
    const equityFactor = 1 - gini;

    // 2. Average Trust
    const [trustResult] = await sequelize.query(
      'SELECT AVG(trust_score) as avg_trust FROM hispatec_members WHERE status = \'active\'',
      { type: QueryTypes.SELECT }
    );
    const avgTrust = parseFloat(trustResult.avg_trust) || 0.5;

    // 3. Network Value (simplified Metcalfe)
    const [memberCount] = await sequelize.query(
      'SELECT COUNT(*) as total, COUNT(CASE WHEN last_active_at > NOW() - INTERVAL \'90 days\' OR created_at > NOW() - INTERVAL \'90 days\' THEN 1 END) as active FROM hispatec_members WHERE status = \'active\'',
      { type: QueryTypes.SELECT }
    );
    const totalMembers = parseInt(memberCount.total) || 0;
    const activeMembers = parseInt(memberCount.active) || totalMembers;
    const networkValue = 0.001 * activeMembers * activeMembers * avgTrust;
    const networkValueMax = 0.001 * 2500 * 2500 * 1.0; // target: 2500 members

    // 4. Project success rate
    const [projectStats] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completado' THEN 1 END) as completed,
        COUNT(CASE WHEN status NOT IN ('completado','cancelado') THEN 1 END) as active
      FROM hispatec_projects
    `, { type: QueryTypes.SELECT });
    const projectTotal = parseInt(projectStats.total) || 0;
    const projectCompleted = parseInt(projectStats.completed) || 0;
    const projectActive = parseInt(projectStats.active) || 0;
    const projectSuccess = projectTotal > 0 ? projectCompleted / projectTotal : 0;

    // 5. Member activation rate
    const activationRate = totalMembers > 0 ? activeMembers / totalMembers : 0;

    // HCI = b1*(1-G) + b2*avgT + b3*(V/Vmax) + b4*(Psuccess) + b5*(activation)
    const weights = { equity: 0.20, trust: 0.20, network: 0.20, projects: 0.25, activation: 0.15 };
    const hci =
      weights.equity * equityFactor +
      weights.trust * avgTrust +
      weights.network * (networkValueMax > 0 ? Math.min(networkValue / networkValueMax, 1) : 0) +
      weights.projects * projectSuccess +
      weights.activation * activationRate;

    const hciRounded = Math.round(hci * 10000) / 10000;

    // Save daily snapshot
    await sequelize.query(`
      INSERT INTO hispatec_network_metrics (date, total_members, active_members, gini_regional, avg_trust, network_value, projects_active, projects_completed, hci_score)
      VALUES (CURRENT_DATE, :total, :active, :gini, :trust, :netVal, :projActive, :projComplete, :hci)
      ON CONFLICT (date) DO UPDATE SET
        total_members = EXCLUDED.total_members,
        active_members = EXCLUDED.active_members,
        gini_regional = EXCLUDED.gini_regional,
        avg_trust = EXCLUDED.avg_trust,
        network_value = EXCLUDED.network_value,
        projects_active = EXCLUDED.projects_active,
        projects_completed = EXCLUDED.projects_completed,
        hci_score = EXCLUDED.hci_score
    `, {
      replacements: {
        total: totalMembers, active: activeMembers, gini: Math.round(gini * 10000) / 10000,
        trust: Math.round(avgTrust * 10000) / 10000, netVal: Math.round(networkValue * 100) / 100,
        projActive: projectActive, projComplete: projectCompleted, hci: hciRounded
      }
    });

    res.json({
      success: true,
      data: {
        hci: hciRounded,
        target: 0.65,
        components: {
          equity: { value: Math.round(equityFactor * 10000) / 10000, weight: weights.equity, gini: Math.round(gini * 10000) / 10000 },
          trust: { value: Math.round(avgTrust * 10000) / 10000, weight: weights.trust },
          network: { value: Math.round((networkValueMax > 0 ? networkValue / networkValueMax : 0) * 10000) / 10000, weight: weights.network, raw_value: Math.round(networkValue * 100) / 100 },
          projects: { value: Math.round(projectSuccess * 10000) / 10000, weight: weights.projects, total: projectTotal, completed: projectCompleted, active: projectActive },
          activation: { value: Math.round(activationRate * 10000) / 10000, weight: weights.activation, active: activeMembers, total: totalMembers }
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /network-value -- Network value calculation
router.get('/network-value', async (req, res) => {
  try {
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN last_active_at > NOW() - INTERVAL '90 days' OR created_at > NOW() - INTERVAL '90 days' THEN 1 END) as active,
        AVG(trust_score) as avg_trust
      FROM hispatec_members WHERE status = 'active'
    `, { type: QueryTypes.SELECT });

    const active = parseInt(stats.active) || parseInt(stats.total) || 0;
    const avgTrust = parseFloat(stats.avg_trust) || 0.5;
    const k = 0.001;
    const networkValue = k * active * active * avgTrust;

    res.json({
      success: true,
      data: {
        network_value: Math.round(networkValue * 100) / 100,
        active_members: active,
        avg_trust: Math.round(avgTrust * 10000) / 10000,
        formula: 'V = k * n_active^2 * avg_trust',
        k
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /trust/:id -- Member trust score
router.get('/trust/:id', async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);

    const [member] = await sequelize.query(
      'SELECT id, first_name, last_name, trust_score, verified, verification_level, membership_type, created_at FROM hispatec_members WHERE id = :id',
      { replacements: { id: memberId }, type: QueryTypes.SELECT }
    );

    if (!member) {
      return res.status(404).json({ success: false, error: 'Miembro no encontrado' });
    }

    // Get references
    const references = await sequelize.query(`
      SELECT AVG(collaboration_quality) as avg_quality, COUNT(*) as count
      FROM hispatec_trust_references WHERE to_member_id = :id
    `, { replacements: { id: memberId }, type: QueryTypes.SELECT });

    // Get project stats
    const [projectStats] = await sequelize.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM hispatec_project_members WHERE member_id = :id
    `, { replacements: { id: memberId }, type: QueryTypes.SELECT });

    // Calculate trust components
    const V = member.verification_level === 'id_complete' ? 1.0 : member.verification_level === 'email' ? 0.5 : 0;
    const R = parseFloat(references[0].avg_quality) || 0;
    const projTotal = parseInt(projectStats.total) || 0;
    const P = projTotal > 0 ? (parseInt(projectStats.completed) || 0) / projTotal : 0;
    const tenureYears = (Date.now() - new Date(member.created_at).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const A = Math.min(tenureYears / 5, 1);
    const M_SCORES = { numerario: 0.4, protector: 0.6, patrono: 0.8, fundador: 1.0, honorifico: 0.9 };
    const M = M_SCORES[member.membership_type] || 0.4;

    const trustBase = 0.30 * V + 0.25 * R + 0.20 * P + 0.15 * A + 0.10 * M;

    res.json({
      success: true,
      data: {
        member_id: memberId,
        name: `${member.first_name} ${member.last_name}`,
        trust_score: parseFloat(member.trust_score),
        trust_base_calculated: Math.round(trustBase * 10000) / 10000,
        components: {
          verification: { value: V, weight: 0.30, level: member.verification_level },
          references: { value: Math.round(R * 1000) / 1000, weight: 0.25, count: parseInt(references[0].count) },
          projects: { value: Math.round(P * 1000) / 1000, weight: 0.20, total: projTotal },
          tenure: { value: Math.round(A * 1000) / 1000, weight: 0.15, years: Math.round(tenureYears * 10) / 10 },
          membership: { value: M, weight: 0.10, type: member.membership_type }
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /dashboard -- All metrics for dashboard view
router.get('/dashboard', async (req, res) => {
  try {
    // Recent metrics history
    const history = await sequelize.query(`
      SELECT * FROM hispatec_network_metrics ORDER BY date DESC LIMIT 30
    `, { type: QueryTypes.SELECT });

    // Current counts
    const [counts] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM hispatec_members WHERE status = 'active') as members,
        (SELECT COUNT(*) FROM hispatec_projects WHERE status NOT IN ('completado','cancelado')) as active_projects,
        (SELECT COUNT(*) FROM hispatec_companies) as companies,
        (SELECT COUNT(*) FROM hispatec_rfqs WHERE status = 'open') as open_rfqs,
        (SELECT COUNT(*) FROM hispatec_opportunities WHERE status = 'active') as opportunities,
        (SELECT COALESCE(SUM(amount), 0) FROM hispatec_transactions WHERE status = 'completed') as total_revenue
    `, { type: QueryTypes.SELECT });

    // Members by region
    const membersByRegion = await sequelize.query(`
      SELECT r.name, COUNT(m.id) as count
      FROM hispatec_regions r
      LEFT JOIN hispatec_members m ON m.region_id = r.id AND m.status = 'active'
      GROUP BY r.id, r.name ORDER BY r.id
    `, { type: QueryTypes.SELECT });

    // Members by membership type
    const membersByType = await sequelize.query(`
      SELECT membership_type, COUNT(*) as count
      FROM hispatec_members WHERE status = 'active'
      GROUP BY membership_type ORDER BY count DESC
    `, { type: QueryTypes.SELECT });

    res.json({
      success: true,
      data: {
        current: counts,
        members_by_region: membersByRegion,
        members_by_type: membersByType,
        history: history.reverse()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
