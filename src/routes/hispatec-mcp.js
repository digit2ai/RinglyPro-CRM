// src/routes/hispatec-mcp.js -- MCP Tool Server for HISPATEC AI Orchestrator
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.JWT_SECRET || 'hispatec-jwt-secret-2026';

// MCP Tool Definitions
const MCP_TOOLS = [
  {
    name: 'match_members',
    description: 'Encuentra miembros optimos para una necesidad o proyecto usando similitud coseno + correccion Gini',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Descripcion en lenguaje natural de lo que se necesita' },
        sector: { type: 'string', description: 'Sector objetivo' },
        region: { type: 'string', description: 'Region objetivo (opcional)' },
        limit: { type: 'number', description: 'Maximo de resultados (default 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'evaluate_project',
    description: 'Evalua viabilidad de proyecto usando simulacion Monte Carlo',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'number' },
        budget_min: { type: 'number' }, budget_est: { type: 'number' }, budget_max: { type: 'number' },
        timeline_min: { type: 'number' }, timeline_est: { type: 'number' }, timeline_max: { type: 'number' },
        budget_available: { type: 'number' }, deadline_months: { type: 'number' }
      }
    }
  },
  {
    name: 'calc_gini',
    description: 'Calcula el Coeficiente de Gini por region, sector o miembro',
    parameters: {
      type: 'object',
      properties: {
        dimension: { type: 'string', enum: ['regional', 'sectoral', 'member'] },
        metric: { type: 'string', enum: ['opportunities', 'projects', 'members'] }
      },
      required: ['dimension']
    }
  },
  {
    name: 'calc_trust',
    description: 'Calcula el Trust Score de un miembro o empresa',
    parameters: {
      type: 'object',
      properties: { member_id: { type: 'number' } },
      required: ['member_id']
    }
  },
  {
    name: 'find_opportunities',
    description: 'Busca oportunidades internacionales relevantes para un perfil',
    parameters: {
      type: 'object',
      properties: { member_id: { type: 'number' }, limit: { type: 'number' } },
      required: ['member_id']
    }
  },
  {
    name: 'optimize_allocation',
    description: 'Asignacion optima de recursos humanos y financieros a proyectos',
    parameters: {
      type: 'object',
      properties: { project_id: { type: 'number' }, budget: { type: 'number' } },
      required: ['project_id']
    }
  },
  {
    name: 'risk_montecarlo',
    description: 'Simulacion de escenarios de riesgo para proyectos (10,000 iteraciones)',
    parameters: {
      type: 'object',
      properties: { project_id: { type: 'number' }, iterations: { type: 'number' } },
      required: ['project_id']
    }
  },
  {
    name: 'gen_report',
    description: 'Genera reportes de actividad, financieros o de impacto',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['activity', 'financial', 'impact', 'hci'] },
        period: { type: 'string', description: 'Periodo: last_7d, last_30d, last_90d, all' }
      },
      required: ['type']
    }
  },
  {
    name: 'network_value',
    description: 'Calcula el valor de red total usando Ley de Metcalfe adaptada',
    parameters: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['full', 'simple'] } }
    }
  }
];

// Monte Carlo triangular distribution
function triangularRandom(min, est, max) {
  const u = Math.random();
  const f = (est - min) / (max - min);
  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (est - min));
  } else {
    return max - Math.sqrt((1 - u) * (max - min) * (max - est));
  }
}

// Tool execution handlers
const toolHandlers = {
  async match_members(params) {
    const members = await sequelize.query(`
      SELECT m.id, m.first_name, m.last_name, m.sector, m.country, m.trust_score,
             m.company_name, m.years_experience, r.name as region_name
      FROM hispatec_members m
      LEFT JOIN hispatec_regions r ON m.region_id = r.id
      WHERE m.status = 'active'
      ${params.sector ? "AND m.sector = :sector" : ''}
      ORDER BY m.trust_score DESC
      LIMIT :limit
    `, {
      replacements: { sector: params.sector, limit: params.limit || 10 },
      type: QueryTypes.SELECT
    });

    return {
      query: params.query,
      total_found: members.length,
      members: members.map((m, i) => ({
        rank: i + 1,
        ...m,
        trust_score: parseFloat(m.trust_score)
      }))
    };
  },

  async evaluate_project(params) {
    let budget = params;
    if (params.project_id) {
      const [proj] = await sequelize.query(
        'SELECT * FROM hispatec_projects WHERE id = :id',
        { replacements: { id: params.project_id }, type: QueryTypes.SELECT }
      );
      if (proj) {
        budget = {
          budget_min: parseFloat(proj.budget_min) || 10000,
          budget_est: parseFloat(proj.budget_est) || 25000,
          budget_max: parseFloat(proj.budget_max) || 50000,
          budget_available: params.budget_available || parseFloat(proj.budget_est) * 1.2,
          timeline_min: proj.timeline_min_months || 2,
          timeline_est: proj.timeline_est_months || 4,
          timeline_max: proj.timeline_max_months || 8,
          deadline_months: params.deadline_months || proj.timeline_est_months * 1.2
        };
      }
    }

    const iterations = 10000;
    let costWithin = 0, timeWithin = 0;
    const costSamples = [];

    for (let i = 0; i < iterations; i++) {
      const c = triangularRandom(budget.budget_min || 10000, budget.budget_est || 25000, budget.budget_max || 50000);
      const t = triangularRandom(budget.timeline_min || 2, budget.timeline_est || 4, budget.timeline_max || 8);
      costSamples.push(c);
      if (c <= (budget.budget_available || budget.budget_est * 1.2)) costWithin++;
      if (t <= (budget.deadline_months || budget.timeline_est * 1.2)) timeWithin++;
    }

    costSamples.sort((a, b) => a - b);
    const costProb = costWithin / iterations;
    const timeProb = timeWithin / iterations;

    const viability = 0.30 * costProb + 0.25 * timeProb + 0.25 * 0.75 + 0.20 * 0.80;
    const score = Math.round(viability * 100);

    return {
      cost_probability: Math.round(costProb * 1000) / 1000,
      time_probability: Math.round(timeProb * 1000) / 1000,
      percentiles: {
        p10: Math.round(costSamples[Math.floor(iterations * 0.10)]),
        p25: Math.round(costSamples[Math.floor(iterations * 0.25)]),
        p50: Math.round(costSamples[Math.floor(iterations * 0.50)]),
        p75: Math.round(costSamples[Math.floor(iterations * 0.75)]),
        p90: Math.round(costSamples[Math.floor(iterations * 0.90)]),
        p95: Math.round(costSamples[Math.floor(iterations * 0.95)])
      },
      viability_score: score,
      semaphore: score >= 70 ? 'VERDE' : score >= 40 ? 'AMARILLO' : 'ROJO',
      recommendation: score >= 70 ? 'Aprobacion recomendada' : score >= 40 ? 'Revision requerida - ajustar alcance' : 'No recomendado - riesgos superan beneficios',
      iterations
    };
  },

  async calc_gini(params) {
    const dimension = params.dimension || 'regional';
    let values = [];

    if (dimension === 'regional') {
      const regions = await sequelize.query(
        'SELECT name, opportunity_count FROM hispatec_regions ORDER BY id',
        { type: QueryTypes.SELECT }
      );
      values = regions.map(r => ({ name: r.name, value: r.opportunity_count || 0 }));
    } else if (dimension === 'sectoral') {
      const sectors = await sequelize.query(`
        SELECT sector as name, COUNT(*) as value
        FROM hispatec_members WHERE status = 'active' AND sector IS NOT NULL
        GROUP BY sector ORDER BY value DESC
      `, { type: QueryTypes.SELECT });
      values = sectors.map(s => ({ name: s.name, value: parseInt(s.value) }));
    }

    const nums = values.map(v => v.value);
    const n = nums.length;
    const mean = n > 0 ? nums.reduce((a, b) => a + b, 0) / n : 0;
    let sumDiff = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sumDiff += Math.abs(nums[i] - nums[j]);
    const gini = mean > 0 ? sumDiff / (2 * n * n * mean) : 0;

    return { dimension, gini: Math.round(gini * 10000) / 10000, threshold: 0.40, correction_needed: gini > 0.40, details: values };
  },

  async calc_trust(params) {
    const [member] = await sequelize.query(
      'SELECT * FROM hispatec_members WHERE id = :id',
      { replacements: { id: params.member_id }, type: QueryTypes.SELECT }
    );
    if (!member) return { error: 'Miembro no encontrado' };

    const V = member.verification_level === 'id_complete' ? 1.0 : member.verification_level === 'email' ? 0.5 : 0;
    const [refs] = await sequelize.query(
      'SELECT AVG(collaboration_quality) as avg_q, COUNT(*) as cnt FROM hispatec_trust_references WHERE to_member_id = :id',
      { replacements: { id: params.member_id }, type: QueryTypes.SELECT }
    );
    const R = parseFloat(refs.avg_q) || 0;
    const [projStats] = await sequelize.query(
      "SELECT COUNT(*) as total, COUNT(CASE WHEN status='completed' THEN 1 END) as done FROM hispatec_project_members WHERE member_id = :id",
      { replacements: { id: params.member_id }, type: QueryTypes.SELECT }
    );
    const P = parseInt(projStats.total) > 0 ? parseInt(projStats.done) / parseInt(projStats.total) : 0;
    const tenure = (Date.now() - new Date(member.created_at).getTime()) / (365.25 * 24 * 3600000);
    const A = Math.min(tenure / 5, 1);
    const M_MAP = { numerario: 0.4, protector: 0.6, patrono: 0.8, fundador: 1.0, honorifico: 0.9 };
    const M = M_MAP[member.membership_type] || 0.4;

    const trust = 0.30 * V + 0.25 * R + 0.20 * P + 0.15 * A + 0.10 * M;

    return {
      member_id: params.member_id,
      name: `${member.first_name} ${member.last_name}`,
      trust_score: Math.round(trust * 10000) / 10000,
      components: { V, R: Math.round(R * 1000) / 1000, P: Math.round(P * 1000) / 1000, A: Math.round(A * 1000) / 1000, M }
    };
  },

  async find_opportunities(params) {
    const [member] = await sequelize.query(
      'SELECT sector, country, region_id FROM hispatec_members WHERE id = :id',
      { replacements: { id: params.member_id }, type: QueryTypes.SELECT }
    );
    if (!member) return { error: 'Miembro no encontrado' };

    const opps = await sequelize.query(`
      SELECT * FROM hispatec_opportunities
      WHERE status = 'active'
      AND (sector = :sector OR :sector IS NULL)
      ORDER BY created_at DESC LIMIT :limit
    `, { replacements: { sector: member.sector, limit: params.limit || 10 }, type: QueryTypes.SELECT });

    return { member_id: params.member_id, opportunities: opps };
  },

  async optimize_allocation(params) {
    const [project] = await sequelize.query(
      'SELECT * FROM hispatec_projects WHERE id = :id',
      { replacements: { id: params.project_id }, type: QueryTypes.SELECT }
    );
    if (!project) return { error: 'Proyecto no encontrado' };

    const candidates = await sequelize.query(`
      SELECT m.id, m.first_name, m.last_name, m.sector, m.trust_score, m.region_id, r.name as region_name
      FROM hispatec_members m
      LEFT JOIN hispatec_regions r ON m.region_id = r.id
      WHERE m.status = 'active' AND m.sector = :sector
      ORDER BY m.trust_score DESC LIMIT 20
    `, { replacements: { sector: project.sector }, type: QueryTypes.SELECT });

    return {
      project_id: params.project_id,
      project_title: project.title,
      recommended_team: candidates.slice(0, 5).map((c, i) => ({
        rank: i + 1, member_id: c.id, name: `${c.first_name} ${c.last_name}`,
        trust_score: parseFloat(c.trust_score), region: c.region_name
      })),
      diversity: { regions_covered: [...new Set(candidates.slice(0, 5).map(c => c.region_name))].length }
    };
  },

  async risk_montecarlo(params) {
    return await toolHandlers.evaluate_project({ project_id: params.project_id, iterations: params.iterations || 10000 });
  },

  async gen_report(params) {
    const periodMap = { last_7d: '7 days', last_30d: '30 days', last_90d: '90 days', all: '10 years' };
    const interval = periodMap[params.period] || '30 days';

    if (params.type === 'activity') {
      const [stats] = await sequelize.query(`
        SELECT
          (SELECT COUNT(*) FROM hispatec_members WHERE created_at > NOW() - INTERVAL '${interval}') as new_members,
          (SELECT COUNT(*) FROM hispatec_projects WHERE created_at > NOW() - INTERVAL '${interval}') as new_projects,
          (SELECT COUNT(*) FROM hispatec_matches WHERE created_at > NOW() - INTERVAL '${interval}') as matches_run,
          (SELECT COUNT(*) FROM hispatec_rfqs WHERE created_at > NOW() - INTERVAL '${interval}') as new_rfqs
      `, { type: QueryTypes.SELECT });
      return { report_type: 'activity', period: params.period, ...stats };
    } else if (params.type === 'financial') {
      const [stats] = await sequelize.query(`
        SELECT
          COALESCE(SUM(CASE WHEN type='membership' THEN amount END), 0) as membership_revenue,
          COALESCE(SUM(CASE WHEN type='escrow' THEN amount END), 0) as escrow_volume,
          COALESCE(SUM(amount), 0) as total_volume,
          COUNT(*) as transaction_count
        FROM hispatec_transactions
        WHERE created_at > NOW() - INTERVAL '${interval}' AND status IN ('completed','held')
      `, { type: QueryTypes.SELECT });
      return { report_type: 'financial', period: params.period, ...stats };
    } else if (params.type === 'hci') {
      const metrics = await sequelize.query(
        `SELECT * FROM hispatec_network_metrics ORDER BY date DESC LIMIT 30`,
        { type: QueryTypes.SELECT }
      );
      return { report_type: 'hci', history: metrics };
    }

    return { report_type: params.type, status: 'not_implemented' };
  },

  async network_value(params) {
    const [stats] = await sequelize.query(`
      SELECT COUNT(*) as active, AVG(trust_score) as avg_trust
      FROM hispatec_members WHERE status = 'active'
    `, { type: QueryTypes.SELECT });

    const n = parseInt(stats.active) || 0;
    const t = parseFloat(stats.avg_trust) || 0.5;
    const k = 0.001;

    return {
      mode: params.mode || 'simple',
      network_value: Math.round(k * n * n * t * 100) / 100,
      active_members: n,
      avg_trust: Math.round(t * 10000) / 10000,
      formula: 'V = k * n^2 * T_avg'
    };
  }
};

// GET /tools/list -- List all available MCP tools
router.get('/tools/list', (req, res) => {
  res.json({
    success: true,
    data: {
      tools: MCP_TOOLS,
      version: '1.0',
      engine: 'HISPATEC MCP Orchestrator'
    }
  });
});

// POST /tools/call -- Execute a tool
router.post('/tools/call', async (req, res) => {
  try {
    const { name, parameters: params } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Tool name requerido' });
    }

    const handler = toolHandlers[name];
    if (!handler) {
      return res.status(404).json({ success: false, error: `Tool '${name}' no encontrada`, available: MCP_TOOLS.map(t => t.name) });
    }

    const startTime = Date.now();
    const result = await handler(params || {});
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        tool: name,
        result,
        execution_time_ms: duration
      }
    });
  } catch (error) {
    console.error(`MCP tool error [${req.body?.name}]:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
