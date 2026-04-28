/**
 * Unified-schema port of chamber-template/lib/p2b-cascade.js.
 * Runs Monte Carlo + auto-books Final Meeting + transitions plan_status to pending_signoff.
 */
const { QueryTypes } = require('sequelize');
const { monteCarloProject } = require('../../../../chamber-template/chamber-math');
const ical = require('../../../../chamber-template/lib/ical');

const SECTOR_DIFFICULTY = {
  ciberseguridad: 1.3, finanzas: 1.25, salud: 1.25, tecnologia: 1.2,
  comercio_exterior: 1.2, legal: 1.15, energia: 1.15, manufactura: 1.1,
  construccion: 1.1, mineria: 1.1, logistica: 1.05, bienes_raices: 1.0,
  alimentos_bebidas: 1.0, hoteleria_turismo: 1.0, servicios_profesionales: 1.0,
  consultoria: 0.95, marketing_digital: 0.95, educacion: 0.9, retail: 0.9,
  agricultura: 0.95, textil: 0.9, automotriz: 1.05, belleza_bienestar: 0.85,
  seguros: 1.1, medios_comunicacion: 0.9
};

async function runCascade(sequelize, chamberId, projectId) {
  const [proj] = await sequelize.query(
    `SELECT * FROM projects WHERE chamber_id = :c AND id = :id`,
    { replacements: { c: chamberId, id: projectId }, type: QueryTypes.SELECT }
  );
  if (!proj) throw new Error('Project not found');
  if (!proj.plan_json) throw new Error('Project has no plan_json');

  if (proj.monte_carlo_result && ['pending_signoff', 'signed_off', 'executing', 'completed'].includes(proj.plan_status)) {
    const [meeting] = await sequelize.query(
      `SELECT * FROM project_meetings
       WHERE chamber_id = :c AND project_id = :p AND meeting_type = 'final_review'
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: { c: chamberId, p: projectId }, type: QueryTypes.SELECT }
    );
    return { status: proj.plan_status, monte_carlo: proj.monte_carlo_result, meeting, cached: true };
  }

  const plan = proj.plan_json;
  const teamRoles = Array.isArray(plan.team_roles_required) ? plan.team_roles_required : [];

  const teamMembers = await sequelize.query(
    `SELECT pm.member_id, m.trust_score, m.years_experience
     FROM project_members pm JOIN members m ON m.id = pm.member_id
     WHERE pm.chamber_id = :c AND pm.project_id = :p`,
    { replacements: { c: chamberId, p: projectId }, type: QueryTypes.SELECT }
  );

  const teamSize = teamMembers.length || 1;
  const avgTrust = teamMembers.length > 0
    ? teamMembers.reduce((s, m) => s + parseFloat(m.trust_score || 0.7), 0) / teamMembers.length
    : 0.7;
  const sectorDiff = SECTOR_DIFFICULTY[proj.sector] || 1.0;

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
    const months = plan.timeline_milestones.map(m => parseInt(m.month) || 0).filter(m => m > 0);
    if (months.length > 0) {
      timeEst = Math.max(...months);
      timeMin = Math.max(2, Math.floor(timeEst * 0.7));
      timeMax = Math.ceil(timeEst * 1.5);
    }
  }

  const teamScore = Math.min(1, teamSize / Math.max(1, teamRoles.length));
  const alignmentScore = avgTrust;

  const mcResult = monteCarloProject({
    budget_min: budgetMin, budget_est: budgetEst, budget_max: budgetMax,
    budget_available: budgetMax,
    timeline_min: timeMin, timeline_est: timeEst, timeline_max: timeMax,
    deadline_months: timeMax,
    team_score: teamScore, alignment_score: alignmentScore
  }, 10000);

  const timeSamples = [];
  for (let i = 0; i < 5000; i++) {
    const u = Math.random();
    const fc = (timeEst - timeMin) / (timeMax - timeMin);
    let ts;
    if (u < fc) ts = timeMin + Math.sqrt(u * (timeMax - timeMin) * (timeEst - timeMin));
    else ts = timeMax - Math.sqrt((1 - u) * (timeMax - timeMin) * (timeMax - timeEst));
    timeSamples.push(ts);
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
    `UPDATE projects
     SET plan_status = 'fully_staffed', monte_carlo_result = :mc, monte_carlo_at = NOW(), updated_at = NOW()
     WHERE chamber_id = :c AND id = :id`,
    { replacements: { c: chamberId, id: projectId, mc: JSON.stringify(enrichedResult) } }
  );

  // Auto-book Final Meeting
  const participants = await sequelize.query(
    `SELECT DISTINCT m.id, m.first_name, m.last_name, m.email
     FROM members m
     WHERE m.chamber_id = :c
       AND (m.id = :proposer
            OR m.id IN (SELECT member_id FROM project_members WHERE chamber_id = :c AND project_id = :p))`,
    { replacements: { c: chamberId, proposer: proj.proposer_member_id, p: projectId }, type: QueryTypes.SELECT }
  );
  const attendeeIds = participants.map(p => p.id);

  const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  scheduledAt.setUTCHours(14, 0, 0, 0);
  const uid = ical.generateUID(projectId, 'final_review');
  const videoLink = ical.generateJitsiLink(projectId);

  const [meeting] = await sequelize.query(
    `INSERT INTO project_meetings
     (chamber_id, project_id, meeting_type, scheduled_at, duration_minutes, video_link, ical_event_uid, attendees, status, created_at, updated_at)
     VALUES (:c, :p, 'final_review', :sa, 60, :vl, :uid, :att::int[], 'scheduled', NOW(), NOW())
     RETURNING *`,
    {
      replacements: {
        c: chamberId, p: projectId, sa: scheduledAt, vl: videoLink, uid,
        att: '{' + attendeeIds.join(',') + '}'
      },
      type: QueryTypes.SELECT
    }
  );

  await sequelize.query(
    `UPDATE projects SET plan_status = 'pending_signoff', updated_at = NOW()
     WHERE chamber_id = :c AND id = :id`,
    { replacements: { c: chamberId, id: projectId } }
  );

  return { status: 'pending_signoff', monte_carlo: enrichedResult, meeting, attendee_count: participants.length };
}

async function maybeAutoClose(sequelize, chamberId, project) {
  if (!project) return null;
  if (project.recruitment_closed_at) return null;
  if (project.plan_status !== 'recruiting') return null;
  if (!project.recruitment_deadline) return null;
  if (new Date(project.recruitment_deadline) > new Date()) return null;

  await sequelize.query(
    `UPDATE projects
     SET recruitment_closed_at = NOW(), recruitment_closed_by = 'auto_expired', updated_at = NOW()
     WHERE chamber_id = :c AND id = :id AND recruitment_closed_at IS NULL`,
    { replacements: { c: chamberId, id: project.id } }
  );

  try {
    return await runCascade(sequelize, chamberId, project.id);
  } catch (err) {
    console.error('[unified p2b-cascade auto-close]', err.message);
    return { status: 'cascade_error', error: err.message };
  }
}

module.exports = { runCascade, maybeAutoClose, SECTOR_DIFFICULTY };
