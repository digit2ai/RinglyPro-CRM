/**
 * P2B Auto-Cascade
 * When recruitment closes (manual or auto-expiry), this runs:
 *   1. Check must_have roles filled -> recruitment_failed if not
 *   2. Run real Monte Carlo, store result
 *   3. Auto-book Final Meeting
 *   4. Transition plan_status: recruiting -> recruitment_closed -> fully_staffed -> pending_signoff
 */
const { Sequelize, QueryTypes } = require('sequelize');
const { monteCarloProject } = require('../chamber-math');
const ical = require('./ical');

// Sector difficulty multiplier -- higher = harder execution
const SECTOR_DIFFICULTY = {
  ciberseguridad: 1.3,
  finanzas: 1.25,
  salud: 1.25,
  tecnologia: 1.2,
  comercio_exterior: 1.2,
  legal: 1.15,
  energia: 1.15,
  manufactura: 1.1,
  construccion: 1.1,
  mineria: 1.1,
  logistica: 1.05,
  bienes_raices: 1.0,
  alimentos_bebidas: 1.0,
  hoteleria_turismo: 1.0,
  servicios_profesionales: 1.0,
  consultoria: 0.95,
  marketing_digital: 0.95,
  educacion: 0.9,
  retail: 0.9,
  agricultura: 0.95,
  textil: 0.9,
  automotriz: 1.05,
  belleza_bienestar: 0.85,
  seguros: 1.1,
  medios_comunicacion: 0.9
};

async function runCascade(sequelize, t, projectId) {
  const [proj] = await sequelize.query(
    `SELECT * FROM ${t}_projects WHERE id = :id`,
    { replacements: { id: projectId }, type: QueryTypes.SELECT }
  );
  if (!proj) throw new Error('Project not found');
  if (!proj.plan_json) throw new Error('Project has no plan_json');

  const plan = proj.plan_json;
  const teamRoles = Array.isArray(plan.team_roles_required) ? plan.team_roles_required : [];

  // 1) Check must_have roles
  const filled = await sequelize.query(
    `SELECT role_index, COUNT(*) AS n FROM ${t}_project_members
     WHERE project_id = :p AND role_index IS NOT NULL GROUP BY role_index`,
    { replacements: { p: projectId }, type: QueryTypes.SELECT }
  );
  const filledMap = {};
  filled.forEach(r => { filledMap[r.role_index] = parseInt(r.n); });

  const mustHaveIndices = teamRoles
    .map((r, i) => ({ ...r, idx: i }))
    .filter(r => r.must_have);
  const missing = mustHaveIndices.filter(r => !filledMap[r.idx] || filledMap[r.idx] < 1);

  if (missing.length > 0) {
    await sequelize.query(
      `UPDATE ${t}_projects SET plan_status = 'recruitment_failed', updated_at = NOW() WHERE id = :id`,
      { replacements: { id: projectId } }
    );
    return {
      status: 'recruitment_failed',
      missing_roles: missing.map(r => r.role_title),
      message: 'Recruitment closed but ' + missing.length + ' must-have role(s) unfilled'
    };
  }

  // 2) Run real Monte Carlo
  const teamMembers = await sequelize.query(
    `SELECT pm.member_id, m.trust_score, m.years_experience
     FROM ${t}_project_members pm JOIN ${t}_members m ON m.id = pm.member_id
     WHERE pm.project_id = :p`,
    { replacements: { p: projectId }, type: QueryTypes.SELECT }
  );

  const teamSize = teamMembers.length || 1;
  const avgTrust = teamMembers.length > 0
    ? teamMembers.reduce((s, m) => s + parseFloat(m.trust_score || 0.7), 0) / teamMembers.length
    : 0.7;
  const sectorDiff = SECTOR_DIFFICULTY[proj.sector] || 1.0;

  // Pull budget + timeline from plan if available, fall back to project columns
  let budgetMin = parseFloat(proj.budget_min) || 100000;
  let budgetEst = parseFloat(proj.budget_est) || 200000;
  let budgetMax = parseFloat(proj.budget_max) || 500000;
  let timeMin = parseInt(proj.timeline_min_months) || 3;
  let timeEst = parseInt(proj.timeline_est_months) || 6;
  let timeMax = parseInt(proj.timeline_max_months) || 12;

  if (Array.isArray(plan.budget_breakdown) && plan.budget_breakdown.length > 0) {
    const total = plan.budget_breakdown.reduce((s, b) => s + (parseFloat(b.amount_usd) || 0), 0);
    if (total > 0) {
      budgetEst = total * sectorDiff;
      budgetMin = budgetEst * 0.75;
      budgetMax = budgetEst * 1.5;
    }
  }
  if (Array.isArray(plan.timeline_milestones) && plan.timeline_milestones.length > 0) {
    const months = plan.timeline_milestones
      .map(m => parseInt(m.month) || 0)
      .filter(m => m > 0);
    if (months.length > 0) {
      timeEst = Math.max(...months);
      timeMin = Math.max(2, Math.floor(timeEst * 0.7));
      timeMax = Math.ceil(timeEst * 1.5);
    }
  }

  // Team-based alignment score: more members + higher trust = better
  const teamScore = Math.min(1, teamSize / Math.max(1, teamRoles.length));
  const alignmentScore = avgTrust;

  const mcResult = monteCarloProject({
    budget_min: budgetMin,
    budget_est: budgetEst,
    budget_max: budgetMax,
    budget_available: budgetMax,  // budget_max is the cap
    timeline_min: timeMin,
    timeline_est: timeEst,
    timeline_max: timeMax,
    deadline_months: timeMax,
    team_score: teamScore,
    alignment_score: alignmentScore
  }, 10000);

  // Also compute timeline percentiles (chamber-math only does cost; do time inline)
  const timeSamples = [];
  for (let i = 0; i < 5000; i++) {
    const u = Math.random();
    const fc = (timeEst - timeMin) / (timeMax - timeMin);
    let t;
    if (u < fc) t = timeMin + Math.sqrt(u * (timeMax - timeMin) * (timeEst - timeMin));
    else t = timeMax - Math.sqrt((1 - u) * (timeMax - timeMin) * (timeMax - timeEst));
    timeSamples.push(t);
  }
  timeSamples.sort((a, b) => a - b);
  const tp = (p) => timeSamples[Math.max(0, Math.ceil(p * timeSamples.length) - 1)];

  const enrichedResult = {
    ...mcResult,
    success_probability: mcResult.viabilityScore,
    risk_score: mcResult.semaphore.toLowerCase(),
    iterations: 10000,
    budget: {
      p10: Math.round(mcResult.percentiles.p10),
      p50: Math.round(mcResult.percentiles.p50),
      p90: Math.round(mcResult.percentiles.p90),
      mean: Math.round((mcResult.percentiles.p25 + mcResult.percentiles.p50 + mcResult.percentiles.p75) / 3)
    },
    timeline_months: {
      p10: Math.round(tp(0.10)),
      p50: Math.round(tp(0.50)),
      p90: Math.round(tp(0.90))
    },
    team_size: teamSize,
    avg_trust: Math.round(avgTrust * 1000) / 1000,
    sector_difficulty: sectorDiff,
    computed_at: new Date().toISOString()
  };

  await sequelize.query(
    `UPDATE ${t}_projects
     SET plan_status = 'fully_staffed',
         monte_carlo_result = :mc,
         monte_carlo_at = NOW(),
         updated_at = NOW()
     WHERE id = :id`,
    { replacements: { id: projectId, mc: JSON.stringify(enrichedResult) } }
  );

  // 3) Auto-book Final Meeting
  const participants = await sequelize.query(
    `SELECT DISTINCT m.id, m.first_name, m.last_name, m.email
     FROM ${t}_members m
     WHERE m.id = :proposer
        OR m.id IN (SELECT member_id FROM ${t}_project_members WHERE project_id = :p)`,
    { replacements: { proposer: proj.proposer_member_id, p: projectId }, type: QueryTypes.SELECT }
  );
  const attendeeIds = participants.map(p => p.id);

  const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  scheduledAt.setUTCHours(14, 0, 0, 0);
  const uid = ical.generateUID(projectId, 'final_review');
  const videoLink = ical.generateJitsiLink(projectId);

  const [meeting] = await sequelize.query(
    `INSERT INTO ${t}_project_meetings
     (project_id, meeting_type, scheduled_at, duration_minutes, video_link, ical_event_uid, attendees, status, created_at, updated_at)
     VALUES (:p, 'final_review', :sa, 60, :vl, :uid, :att::int[], 'scheduled', NOW(), NOW())
     RETURNING *`,
    {
      replacements: {
        p: projectId, sa: scheduledAt, vl: videoLink, uid,
        att: '{' + attendeeIds.join(',') + '}'
      },
      type: QueryTypes.SELECT
    }
  );

  // 4) Transition to pending_signoff
  await sequelize.query(
    `UPDATE ${t}_projects SET plan_status = 'pending_signoff', updated_at = NOW() WHERE id = :id`,
    { replacements: { id: projectId } }
  );

  return {
    status: 'pending_signoff',
    monte_carlo: enrichedResult,
    meeting,
    attendee_count: participants.length
  };
}

/**
 * Lazy auto-close: if recruitment_deadline is past and project is still
 * 'recruiting', auto-close and run cascade. Called from GET /projects[ /:id ].
 */
async function maybeAutoClose(sequelize, t, project) {
  if (!project) return null;
  if (project.recruitment_closed_at) return null;
  if (project.plan_status !== 'recruiting') return null;
  if (!project.recruitment_deadline) return null;
  if (new Date(project.recruitment_deadline) > new Date()) return null;

  await sequelize.query(
    `UPDATE ${t}_projects
     SET recruitment_closed_at = NOW(), recruitment_closed_by = 'auto_expired', updated_at = NOW()
     WHERE id = :id AND recruitment_closed_at IS NULL`,
    { replacements: { id: project.id } }
  );

  try {
    return await runCascade(sequelize, t, project.id);
  } catch (err) {
    console.error('[p2b-cascade auto-close]', err.message);
    return { status: 'cascade_error', error: err.message };
  }
}

module.exports = { runCascade, maybeAutoClose, SECTOR_DIFFICULTY };
