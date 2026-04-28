/**
 * Unified-schema port of chamber-template/lib/workspace-init.js.
 * Auto-initializes milestones + tasks from a project's plan_json.
 * Idempotent: returns { skipped: true } if milestones already exist.
 */
const { QueryTypes } = require('sequelize');

async function autoInitWorkspaceFromPlan(sequelize, chamberId, projectId, createdBy) {
  const [proj] = await sequelize.query(
    `SELECT id, plan_json, plan_status, proposer_member_id
     FROM projects WHERE chamber_id = :c AND id = :p`,
    { replacements: { c: chamberId, p: projectId }, type: QueryTypes.SELECT }
  );
  if (!proj) throw new Error('Project not found');
  if (!proj.plan_json) throw new Error('No plan to initialize from');

  const [{ count }] = await sequelize.query(
    `SELECT COUNT(*) AS count FROM project_milestones
     WHERE chamber_id = :c AND project_id = :p`,
    { replacements: { c: chamberId, p: projectId }, type: QueryTypes.SELECT }
  );
  if (parseInt(count) > 0) {
    return { skipped: true, reason: 'workspace already initialized' };
  }

  const plan = proj.plan_json;
  const created = { milestones: 0, tasks: 0 };
  const creator = createdBy || proj.proposer_member_id;

  if (Array.isArray(plan.timeline_milestones)) {
    for (const m of plan.timeline_milestones) {
      let budget = null;
      if (Array.isArray(plan.budget_breakdown)) {
        const matchingBudget = plan.budget_breakdown
          .filter(b => b.phase && (m.milestone || '').toLowerCase().includes(String(b.phase).toLowerCase()))
          .reduce((s, b) => s + (b.amount_usd || 0), 0);
        budget = matchingBudget || null;
      }
      const [mr] = await sequelize.query(
        `INSERT INTO project_milestones
         (chamber_id, project_id, title, description, target_month, budget_allocation_usd, status, created_at)
         VALUES (:c, :p, :t, :d, :tm, :b, 'planned', NOW()) RETURNING id`,
        {
          replacements: {
            c: chamberId, p: projectId,
            t: m.milestone || `Milestone M${m.month || 0}`,
            d: m.deliverable || null, tm: m.month || null, b: budget
          },
          type: QueryTypes.SELECT
        }
      );
      created.milestones++;

      if (m.deliverable) {
        await sequelize.query(
          `INSERT INTO project_tasks
           (chamber_id, project_id, title, description, status, milestone_id, priority, created_by_member_id, created_at, updated_at)
           VALUES (:c, :p, :t, :d, 'todo', :mid, 'high', :cb, NOW(), NOW())`,
          {
            replacements: {
              c: chamberId, p: projectId,
              t: `Deliverable: ${m.deliverable}`,
              d: `Auto-generated from plan milestone "${m.milestone}" (Month ${m.month || 0})`,
              mid: mr.id, cb: creator
            }
          }
        );
        created.tasks++;
      }
    }
  }

  if (Array.isArray(plan.team_roles_required)) {
    for (let i = 0; i < plan.team_roles_required.length; i++) {
      const role = plan.team_roles_required[i];
      const [pm] = await sequelize.query(
        `SELECT member_id FROM project_members
         WHERE chamber_id = :c AND project_id = :p AND role_index = :i LIMIT 1`,
        { replacements: { c: chamberId, p: projectId, i }, type: QueryTypes.SELECT }
      );
      await sequelize.query(
        `INSERT INTO project_tasks
         (chamber_id, project_id, title, description, status, assignee_member_id, priority, created_by_member_id, created_at, updated_at)
         VALUES (:c, :p, :t, :d, 'todo', :a, 'medium', :cb, NOW(), NOW())`,
        {
          replacements: {
            c: chamberId, p: projectId,
            t: `Kickoff: ${role.role_title || `Role ${i + 1}`}`,
            d: `Onboarding for the ${role.role_title} role.\nResponsibilities: ${(role.responsibilities || []).join(', ')}`,
            a: pm ? pm.member_id : null,
            cb: creator
          }
        }
      );
      created.tasks++;
    }
  }

  await sequelize.query(
    `UPDATE projects SET plan_status = 'executing', status = 'execution', updated_at = NOW()
     WHERE chamber_id = :c AND id = :p AND plan_status IN ('signed_off', 'pending_signoff')`,
    { replacements: { c: chamberId, p: projectId } }
  );

  return { skipped: false, ...created };
}

module.exports = { autoInitWorkspaceFromPlan };
