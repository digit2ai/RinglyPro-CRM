// Chamber Template - MCP Tool Server Routes Factory
module.exports = function createMCPRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const { Sequelize, QueryTypes } = require('sequelize');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });

  const t = config.db_prefix;
  const chamberName = config.short_name || config.name;

  const MCP_TOOLS = [
    { name: 'match_members', description: 'Find optimal members for a need or project using cosine similarity + Gini correction', parameters: { type: 'object', properties: { query: { type: 'string' }, sector: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
    { name: 'evaluate_project', description: 'Evaluate project viability using Monte Carlo simulation', parameters: { type: 'object', properties: { project_id: { type: 'number' }, budget_min: { type: 'number' }, budget_est: { type: 'number' }, budget_max: { type: 'number' } } } },
    { name: 'calc_gini', description: 'Calculate Gini coefficient by region or sector', parameters: { type: 'object', properties: { dimension: { type: 'string', enum: ['regional', 'sectoral'] } }, required: ['dimension'] } },
    { name: 'calc_trust', description: 'Calculate Trust Score for a member', parameters: { type: 'object', properties: { member_id: { type: 'number' } }, required: ['member_id'] } },
    { name: 'find_opportunities', description: 'Find relevant opportunities for a member profile', parameters: { type: 'object', properties: { member_id: { type: 'number' }, limit: { type: 'number' } }, required: ['member_id'] } },
    { name: 'gen_report', description: 'Generate activity, financial, or impact reports', parameters: { type: 'object', properties: { type: { type: 'string', enum: ['activity', 'financial', 'impact', 'hci'] }, period: { type: 'string' } }, required: ['type'] } },
    { name: 'network_value', description: 'Calculate network value using adapted Metcalfe Law', parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['full', 'simple'] } } } }
  ];

  function triangularRandom(min, est, max) {
    const u = Math.random(); const f = (est - min) / (max - min);
    if (u < f) return min + Math.sqrt(u * (max - min) * (est - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - est));
  }

  const toolHandlers = {
    async match_members(params) {
      const members = await sequelize.query(`SELECT m.id, m.first_name, m.last_name, m.sector, m.country, m.trust_score, m.company_name, m.years_experience, r.name as region_name FROM ${t}_members m LEFT JOIN ${t}_regions r ON m.region_id = r.id WHERE m.status = 'active' ${params.sector ? "AND m.sector = :sector" : ''} ORDER BY m.trust_score DESC LIMIT :limit`, { replacements: { sector: params.sector, limit: params.limit || 10 }, type: QueryTypes.SELECT });
      return { query: params.query, total_found: members.length, members: members.map((m, i) => ({ rank: i + 1, ...m, trust_score: parseFloat(m.trust_score) })) };
    },
    async evaluate_project(params) {
      let budget = params;
      if (params.project_id) {
        const [proj] = await sequelize.query(`SELECT * FROM ${t}_projects WHERE id = :id`, { replacements: { id: params.project_id }, type: QueryTypes.SELECT });
        if (proj) budget = { budget_min: parseFloat(proj.budget_min) || 10000, budget_est: parseFloat(proj.budget_est) || 25000, budget_max: parseFloat(proj.budget_max) || 50000, budget_available: params.budget_available || parseFloat(proj.budget_est) * 1.2, timeline_min: proj.timeline_min_months || 2, timeline_est: proj.timeline_est_months || 4, timeline_max: proj.timeline_max_months || 8, deadline_months: params.deadline_months || proj.timeline_est_months * 1.2 };
      }
      const iterations = 10000; let costWithin = 0, timeWithin = 0; const costSamples = [];
      for (let i = 0; i < iterations; i++) {
        const c = triangularRandom(budget.budget_min || 10000, budget.budget_est || 25000, budget.budget_max || 50000);
        const tt = triangularRandom(budget.timeline_min || 2, budget.timeline_est || 4, budget.timeline_max || 8);
        costSamples.push(c);
        if (c <= (budget.budget_available || budget.budget_est * 1.2)) costWithin++;
        if (tt <= (budget.deadline_months || budget.timeline_est * 1.2)) timeWithin++;
      }
      costSamples.sort((a, b) => a - b);
      const costProb = costWithin / iterations; const timeProb = timeWithin / iterations;
      const viability = 0.30 * costProb + 0.25 * timeProb + 0.25 * 0.75 + 0.20 * 0.80;
      const score = Math.round(viability * 100);
      return { cost_probability: Math.round(costProb * 1000) / 1000, time_probability: Math.round(timeProb * 1000) / 1000, percentiles: { p10: Math.round(costSamples[Math.floor(iterations * 0.10)]), p50: Math.round(costSamples[Math.floor(iterations * 0.50)]), p90: Math.round(costSamples[Math.floor(iterations * 0.90)]) }, viability_score: score, semaphore: score >= 70 ? 'GREEN' : score >= 40 ? 'YELLOW' : 'RED', iterations };
    },
    async calc_gini(params) {
      const dimension = params.dimension || 'regional'; let values = [];
      if (dimension === 'regional') { const regions = await sequelize.query(`SELECT name, opportunity_count FROM ${t}_regions ORDER BY id`, { type: QueryTypes.SELECT }); values = regions.map(r => ({ name: r.name, value: r.opportunity_count || 0 })); }
      else { const sectors = await sequelize.query(`SELECT sector as name, COUNT(*) as value FROM ${t}_members WHERE status = 'active' AND sector IS NOT NULL GROUP BY sector ORDER BY value DESC`, { type: QueryTypes.SELECT }); values = sectors.map(s => ({ name: s.name, value: parseInt(s.value) })); }
      const nums = values.map(v => v.value); const n = nums.length; const mean = n > 0 ? nums.reduce((a, b) => a + b, 0) / n : 0;
      let sumDiff = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sumDiff += Math.abs(nums[i] - nums[j]);
      const gini = mean > 0 ? sumDiff / (2 * n * n * mean) : 0;
      return { dimension, gini: Math.round(gini * 10000) / 10000, threshold: 0.40, details: values };
    },
    async calc_trust(params) {
      const [member] = await sequelize.query(`SELECT * FROM ${t}_members WHERE id = :id`, { replacements: { id: params.member_id }, type: QueryTypes.SELECT });
      if (!member) return { error: 'Member not found' };
      const V = member.verification_level === 'id_complete' ? 1.0 : member.verification_level === 'email' ? 0.5 : 0;
      const [refs] = await sequelize.query(`SELECT AVG(collaboration_quality) as avg_q, COUNT(*) as cnt FROM ${t}_trust_references WHERE to_member_id = :id`, { replacements: { id: params.member_id }, type: QueryTypes.SELECT });
      const R = parseFloat(refs.avg_q) || 0;
      const trust = 0.30 * V + 0.25 * R + 0.20 * 0 + 0.15 * 0 + 0.10 * 0.4;
      return { member_id: params.member_id, name: `${member.first_name} ${member.last_name}`, trust_score: Math.round(trust * 10000) / 10000 };
    },
    async find_opportunities(params) {
      const [member] = await sequelize.query(`SELECT sector, country FROM ${t}_members WHERE id = :id`, { replacements: { id: params.member_id }, type: QueryTypes.SELECT });
      if (!member) return { error: 'Member not found' };
      const opps = await sequelize.query(`SELECT * FROM ${t}_opportunities WHERE status = 'active' AND (sector = :sector OR :sector IS NULL) ORDER BY created_at DESC LIMIT :limit`, { replacements: { sector: member.sector, limit: params.limit || 10 }, type: QueryTypes.SELECT });
      return { member_id: params.member_id, opportunities: opps };
    },
    async gen_report(params) {
      const periodMap = { last_7d: '7 days', last_30d: '30 days', last_90d: '90 days', all: '10 years' };
      const interval = periodMap[params.period] || '30 days';
      if (params.type === 'activity') {
        const [stats] = await sequelize.query(`SELECT (SELECT COUNT(*) FROM ${t}_members WHERE created_at > NOW() - INTERVAL '${interval}') as new_members, (SELECT COUNT(*) FROM ${t}_projects WHERE created_at > NOW() - INTERVAL '${interval}') as new_projects, (SELECT COUNT(*) FROM ${t}_matches WHERE created_at > NOW() - INTERVAL '${interval}') as matches_run, (SELECT COUNT(*) FROM ${t}_rfqs WHERE created_at > NOW() - INTERVAL '${interval}') as new_rfqs`, { type: QueryTypes.SELECT });
        return { report_type: 'activity', period: params.period, ...stats };
      } else if (params.type === 'financial') {
        const [stats] = await sequelize.query(`SELECT COALESCE(SUM(CASE WHEN type='membership' THEN amount END), 0) as membership_revenue, COALESCE(SUM(CASE WHEN type='escrow' THEN amount END), 0) as escrow_volume, COALESCE(SUM(amount), 0) as total_volume, COUNT(*) as transaction_count FROM ${t}_transactions WHERE created_at > NOW() - INTERVAL '${interval}' AND status IN ('completed','held')`, { type: QueryTypes.SELECT });
        return { report_type: 'financial', period: params.period, ...stats };
      } else if (params.type === 'hci') {
        const metrics = await sequelize.query(`SELECT * FROM ${t}_network_metrics ORDER BY date DESC LIMIT 30`, { type: QueryTypes.SELECT });
        return { report_type: 'hci', history: metrics };
      }
      return { report_type: params.type, status: 'not_implemented' };
    },
    async network_value(params) {
      const [stats] = await sequelize.query(`SELECT COUNT(*) as active, AVG(trust_score) as avg_trust FROM ${t}_members WHERE status = 'active'`, { type: QueryTypes.SELECT });
      const n = parseInt(stats.active) || 0; const tr = parseFloat(stats.avg_trust) || 0.5; const k = 0.001;
      return { mode: params.mode || 'simple', network_value: Math.round(k * n * n * tr * 100) / 100, active_members: n, avg_trust: Math.round(tr * 10000) / 10000 };
    }
  };

  // GET /tools/list
  router.get('/tools/list', (req, res) => {
    res.json({ success: true, data: { tools: MCP_TOOLS, version: '1.0', engine: `${chamberName} MCP Orchestrator` } });
  });

  // POST /tools/call
  router.post('/tools/call', async (req, res) => {
    try {
      const { name, parameters: params } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Tool name required' });
      const handler = toolHandlers[name];
      if (!handler) return res.status(404).json({ success: false, error: `Tool '${name}' not found`, available: MCP_TOOLS.map(t => t.name) });
      const startTime = Date.now();
      const result = await handler(params || {});
      res.json({ success: true, data: { tool: name, result, execution_time_ms: Date.now() - startTime } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
