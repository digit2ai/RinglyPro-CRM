/**
 * Unified workspace router (P2B Stage 3 -- private project workspace).
 * Mounted at /:chamber_slug/api/projects/:id/workspace, ahead of the projects
 * router so /:id/workspace/* doesn't get swallowed by /:id.
 */
const express = require('express');
const { sequelize, QueryTypes, authMiddleware } = require('./lib/shared');
const { autoInitWorkspaceFromPlan } = require('./lib/workspace-init');

const router = express.Router({ mergeParams: true });

async function requireProjectParticipant(req, res, next) {
  try {
    const projectId = parseInt(req.params.id);
    const memberId = req.member.id;
    const [row] = await sequelize.query(
      `SELECT 1 AS ok FROM projects
         WHERE chamber_id = :c AND id = :p AND proposer_member_id = :m
       UNION
       SELECT 1 FROM project_members
         WHERE chamber_id = :c AND project_id = :p AND member_id = :m
       UNION
       SELECT 1 FROM members
         WHERE chamber_id = :c AND id = :m AND access_level = 'superadmin'
       LIMIT 1`,
      { replacements: { c: req.chamber_id, p: projectId, m: memberId }, type: QueryTypes.SELECT }
    );
    if (!row) return res.status(403).json({ success: false, error: 'Not a project participant' });
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function requireProjectOwner(req, res, next) {
  try {
    const projectId = parseInt(req.params.id);
    const memberId = req.member.id;
    const [row] = await sequelize.query(
      `SELECT 1 AS ok FROM projects
         WHERE chamber_id = :c AND id = :p AND proposer_member_id = :m
       UNION
       SELECT 1 FROM members
         WHERE chamber_id = :c AND id = :m AND access_level = 'superadmin'
       LIMIT 1`,
      { replacements: { c: req.chamber_id, p: projectId, m: memberId }, type: QueryTypes.SELECT }
    );
    if (!row) return res.status(403).json({ success: false, error: 'Project Owner only (proposer or superadmin)' });
    req.isProjectOwner = true;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// =====================================================================
// OVERVIEW
// =====================================================================
router.get('/overview', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const projectId = req.params.id;
    const [taskStats] = await sequelize.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status='todo') AS todo,
              COUNT(*) FILTER (WHERE status='doing') AS doing,
              COUNT(*) FILTER (WHERE status='review') AS review,
              COUNT(*) FILTER (WHERE status='done') AS done,
              COUNT(*) FILTER (WHERE status='blocked') AS blocked
       FROM project_tasks WHERE chamber_id = :c AND project_id = :p`,
      { replacements: { c: req.chamber_id, p: projectId }, type: QueryTypes.SELECT }
    );
    const [msStats] = await sequelize.query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='completed') AS completed
       FROM project_milestones WHERE chamber_id = :c AND project_id = :p`,
      { replacements: { c: req.chamber_id, p: projectId }, type: QueryTypes.SELECT }
    );
    const recent = await sequelize.query(
      `SELECT 'message' AS kind, m.id, m.created_at, m.body AS text,
              mb.first_name || ' ' || mb.last_name AS member_name
       FROM project_messages m JOIN members mb ON mb.id = m.member_id
       WHERE m.chamber_id = :c AND m.project_id = :p
       UNION ALL
       SELECT 'task' AS kind, tk.id, tk.updated_at AS created_at, tk.title AS text,
              cb.first_name || ' ' || cb.last_name AS member_name
       FROM project_tasks tk JOIN members cb ON cb.id = tk.created_by_member_id
       WHERE tk.chamber_id = :c AND tk.project_id = :p
       ORDER BY created_at DESC LIMIT 10`,
      { replacements: { c: req.chamber_id, p: projectId }, type: QueryTypes.SELECT }
    );
    const [proj] = await sequelize.query(
      `SELECT proposer_member_id FROM projects WHERE chamber_id = :c AND id = :p`,
      { replacements: { c: req.chamber_id, p: projectId }, type: QueryTypes.SELECT }
    );
    const [viewer] = await sequelize.query(
      `SELECT access_level FROM members WHERE chamber_id = :c AND id = :m`,
      { replacements: { c: req.chamber_id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    const isOwner = (proj && proj.proposer_member_id === req.member.id) || (viewer && viewer.access_level === 'superadmin');

    const myMilestones = await sequelize.query(
      `SELECT id, title, status, target_month FROM project_milestones
       WHERE chamber_id = :c AND project_id = :p AND :m = ANY(lead_member_ids)`,
      { replacements: { c: req.chamber_id, p: projectId, m: req.member.id }, type: QueryTypes.SELECT }
    );
    const [myTasks] = await sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE status != 'done') AS open,
              COUNT(*) FILTER (WHERE status = 'done') AS done
       FROM project_tasks WHERE chamber_id = :c AND project_id = :p AND assignee_member_id = :m`,
      { replacements: { c: req.chamber_id, p: projectId, m: req.member.id }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: {
        tasks: taskStats, milestones: msStats, recent_activity: recent,
        viewer: { is_owner: isOwner, member_id: req.member.id },
        my_milestones: myMilestones, my_tasks: myTasks
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// TASKS
// =====================================================================
router.get('/tasks', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const tasks = await sequelize.query(
      `SELECT t1.*, m.first_name || ' ' || m.last_name AS assignee_name
       FROM project_tasks t1 LEFT JOIN members m ON m.id = t1.assignee_member_id
       WHERE t1.chamber_id = :c AND t1.project_id = :p
       ORDER BY t1.priority DESC, t1.due_date NULLS LAST, t1.created_at`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: tasks });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tasks', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const { title, description, status, assignee_member_id, milestone_id, priority, due_date } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'title required' });
    const [task] = await sequelize.query(
      `INSERT INTO project_tasks
       (chamber_id, project_id, title, description, status, assignee_member_id, milestone_id, priority, due_date, created_by_member_id, created_at, updated_at)
       VALUES (:c, :p, :t, :d, :s, :a, :mi, :pr, :dd, :cb, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id, t: title, d: description || null,
          s: status || 'todo', a: assignee_member_id || null, mi: milestone_id || null,
          pr: priority || 'medium', dd: due_date || null, cb: req.member.id
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: task });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/tasks/:tid', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const [task] = await sequelize.query(
      `SELECT * FROM project_tasks WHERE chamber_id = :c AND id = :id AND project_id = :p`,
      { replacements: { c: req.chamber_id, id: req.params.tid, p: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    const [proj] = await sequelize.query(
      `SELECT proposer_member_id FROM projects WHERE chamber_id = :c AND id = :p`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    const [viewer] = await sequelize.query(
      `SELECT access_level FROM members WHERE chamber_id = :c AND id = :m`,
      { replacements: { c: req.chamber_id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    const isOwner = (proj && proj.proposer_member_id === req.member.id) || (viewer && viewer.access_level === 'superadmin');
    const isAssignee = task.assignee_member_id === req.member.id;
    const isCreator = task.created_by_member_id === req.member.id;

    if (!isOwner && !isAssignee && !isCreator) {
      return res.status(403).json({ success: false, error: 'Only owner, creator, or assignee can update' });
    }

    let allowed;
    if (isOwner) {
      allowed = ['title', 'description', 'status', 'assignee_member_id', 'milestone_id', 'priority', 'due_date'];
    } else {
      allowed = ['status', 'description', 'due_date'];
      if (isAssignee || isCreator) allowed.push('priority');
    }

    const sets = []; const repl = { c: req.chamber_id, id: req.params.tid, p: req.params.id };
    for (const k of allowed) {
      if (k in req.body) { sets.push(`${k} = :${k}`); repl[k] = req.body[k]; }
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields (or insufficient permissions)' });
    sets.push('updated_at = NOW()');
    if (req.body.status === 'done') sets.push('completed_at = NOW()');
    const [updated] = await sequelize.query(
      `UPDATE project_tasks SET ${sets.join(', ')}
       WHERE chamber_id = :c AND id = :id AND project_id = :p RETURNING *`,
      { replacements: repl, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/tasks/:tid', authMiddleware, requireProjectParticipant, requireProjectOwner, async (req, res) => {
  try {
    await sequelize.query(
      `DELETE FROM project_tasks WHERE chamber_id = :c AND id = :id AND project_id = :p`,
      { replacements: { c: req.chamber_id, id: req.params.tid, p: req.params.id } }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// MILESTONES
// =====================================================================
router.get('/milestones', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const m = await sequelize.query(
      `SELECT m.*,
        (SELECT array_agg(json_build_object('id', mb.id, 'name', mb.first_name || ' ' || mb.last_name))
         FROM members mb WHERE mb.chamber_id = :c AND mb.id = ANY(m.lead_member_ids)) AS leads
       FROM project_milestones m
       WHERE m.chamber_id = :c AND m.project_id = :p
       ORDER BY m.target_month NULLS LAST, m.target_date`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: m });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/milestones/:mid/assign', authMiddleware, requireProjectParticipant, requireProjectOwner, async (req, res) => {
  try {
    const { lead_member_ids } = req.body;
    if (!Array.isArray(lead_member_ids)) {
      return res.status(400).json({ success: false, error: 'lead_member_ids must be an array' });
    }
    const valid = await sequelize.query(
      `SELECT id FROM members
       WHERE chamber_id = :c AND id = ANY(:ids::int[])
         AND (id IN (SELECT member_id FROM project_members WHERE chamber_id = :c AND project_id = :p)
              OR id IN (SELECT proposer_member_id FROM projects WHERE chamber_id = :c AND id = :p))`,
      {
        replacements: {
          c: req.chamber_id, ids: '{' + lead_member_ids.join(',') + '}', p: req.params.id
        },
        type: QueryTypes.SELECT
      }
    );
    const validIds = valid.map(v => v.id);
    if (validIds.length !== lead_member_ids.length) {
      return res.status(400).json({ success: false, error: 'Some member_ids are not participants' });
    }
    const [updated] = await sequelize.query(
      `UPDATE project_milestones SET lead_member_ids = :ids::int[]
       WHERE chamber_id = :c AND id = :mid AND project_id = :p RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, ids: '{' + validIds.join(',') + '}', mid: req.params.mid, p: req.params.id
        },
        type: QueryTypes.SELECT
      }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Milestone not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/milestones', authMiddleware, requireProjectParticipant, requireProjectOwner, async (req, res) => {
  try {
    const { title, description, target_month, target_date, budget_allocation_usd, status } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'title required' });
    const [m] = await sequelize.query(
      `INSERT INTO project_milestones
       (chamber_id, project_id, title, description, target_month, target_date, budget_allocation_usd, status, created_at)
       VALUES (:c, :p, :t, :d, :tm, :td, :b, :s, NOW())
       RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id, t: title, d: description || null,
          tm: target_month || null, td: target_date || null,
          b: budget_allocation_usd || null, s: status || 'planned'
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: m });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/milestones/:mid', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const [milestone] = await sequelize.query(
      `SELECT * FROM project_milestones WHERE chamber_id = :c AND id = :id AND project_id = :p`,
      { replacements: { c: req.chamber_id, id: req.params.mid, p: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!milestone) return res.status(404).json({ success: false, error: 'Milestone not found' });

    const [proj] = await sequelize.query(
      `SELECT proposer_member_id FROM projects WHERE chamber_id = :c AND id = :p`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    const [viewer] = await sequelize.query(
      `SELECT access_level FROM members WHERE chamber_id = :c AND id = :m`,
      { replacements: { c: req.chamber_id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    const isOwner = (proj && proj.proposer_member_id === req.member.id) || (viewer && viewer.access_level === 'superadmin');
    const isLead = Array.isArray(milestone.lead_member_ids) && milestone.lead_member_ids.includes(req.member.id);

    if (!isOwner && !isLead) {
      return res.status(403).json({ success: false, error: 'Only Project Owner or assigned milestone lead can update' });
    }

    let allowed;
    if (isOwner) {
      allowed = ['title', 'description', 'target_month', 'target_date',
                 'budget_allocation_usd', 'status', 'escrow_status', 'stripe_escrow_id', 'lead_member_ids'];
    } else {
      allowed = ['status'];
    }

    const sets = []; const repl = { c: req.chamber_id, id: req.params.mid, p: req.params.id };
    for (const k of allowed) {
      if (k in req.body) {
        if (k === 'lead_member_ids' && Array.isArray(req.body[k])) {
          sets.push(`${k} = :${k}::int[]`);
          repl[k] = '{' + req.body[k].join(',') + '}';
        } else {
          sets.push(`${k} = :${k}`);
          repl[k] = req.body[k];
        }
      }
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields (or insufficient permissions for fields requested)' });
    if (req.body.status === 'completed') sets.push('completed_at = NOW()');
    const [updated] = await sequelize.query(
      `UPDATE project_milestones SET ${sets.join(', ')}
       WHERE chamber_id = :c AND id = :id AND project_id = :p RETURNING *`,
      { replacements: repl, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/milestones/:mid/fund-escrow', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const stripeId = 'esc_' + Math.random().toString(36).substring(2, 12);
    const [updated] = await sequelize.query(
      `UPDATE project_milestones
       SET escrow_status = 'funded', stripe_escrow_id = :sid
       WHERE chamber_id = :c AND id = :id AND project_id = :p RETURNING *`,
      { replacements: { c: req.chamber_id, sid: stripeId, id: req.params.mid, p: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Milestone not found' });
    return res.json({ success: true, data: updated, note: 'Stripe escrow stub: real Stripe integration pending' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/milestones/:mid/release-escrow', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const [updated] = await sequelize.query(
      `UPDATE project_milestones
       SET escrow_status = 'released', status = 'completed', completed_at = NOW()
       WHERE chamber_id = :c AND id = :id AND project_id = :p RETURNING *`,
      { replacements: { c: req.chamber_id, id: req.params.mid, p: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Milestone not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// MESSAGES
// =====================================================================
router.get('/messages', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const messages = await sequelize.query(
      `SELECT msg.*, m.first_name || ' ' || m.last_name AS member_name, m.country, m.sector
       FROM project_messages msg JOIN members m ON m.id = msg.member_id
       WHERE msg.chamber_id = :c AND msg.project_id = :p
       ORDER BY msg.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, p: req.params.id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: messages.reverse() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/messages', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const { body, attachment_url } = req.body;
    if (!body || body.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'body required' });
    }
    const [msg] = await sequelize.query(
      `INSERT INTO project_messages (chamber_id, project_id, member_id, body, attachment_url, created_at)
       VALUES (:c, :p, :m, :b, :a, NOW()) RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id, m: req.member.id,
          b: body.trim(), a: attachment_url || null
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: msg });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// DOCUMENTS
// =====================================================================
router.get('/documents', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const docs = await sequelize.query(
      `SELECT d.*, m.first_name || ' ' || m.last_name AS uploaded_by_name
       FROM project_documents d JOIN members m ON m.id = d.uploaded_by_member_id
       WHERE d.chamber_id = :c AND d.project_id = :p
       ORDER BY d.created_at DESC`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: docs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/documents', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const { title, file_url, doc_type } = req.body;
    if (!title || !file_url) return res.status(400).json({ success: false, error: 'title and file_url required' });
    const [doc] = await sequelize.query(
      `INSERT INTO project_documents
       (chamber_id, project_id, uploaded_by_member_id, title, file_url, doc_type, visibility, created_at)
       VALUES (:c, :p, :m, :t, :f, :dt, 'participants', NOW()) RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id, m: req.member.id,
          t: title, f: file_url, dt: doc_type || 'other'
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// INITIALIZE FROM PLAN (manual)
// =====================================================================
router.post('/initialize-from-plan', authMiddleware, requireProjectParticipant, async (req, res) => {
  try {
    const [proj] = await sequelize.query(
      `SELECT proposer_member_id FROM projects WHERE chamber_id = :c AND id = :p`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });

    const [viewer] = await sequelize.query(
      `SELECT access_level FROM members WHERE chamber_id = :c AND id = :m`,
      { replacements: { c: req.chamber_id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    const isSuperadmin = viewer && viewer.access_level === 'superadmin';
    if (proj.proposer_member_id !== req.member.id && !isSuperadmin) {
      return res.status(403).json({ success: false, error: 'Only proposer or superadmin can initialize' });
    }

    const result = await autoInitWorkspaceFromPlan(sequelize, req.chamber_id, req.params.id, req.member.id);
    if (result.skipped) {
      return res.status(409).json({ success: false, error: result.reason });
    }
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[unified init-from-plan]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
