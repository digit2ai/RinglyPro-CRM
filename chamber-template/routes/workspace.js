// Chamber Template - P2B Stage 3 Private Workspace Routes
// Mounted at /api/projects/:id/workspace -- participants-only access
const { autoInitWorkspaceFromPlan } = require('../lib/workspace-init');

module.exports = function createWorkspaceRoutes(config) {
  const express = require('express');
  const router = express.Router({ mergeParams: true });
  const { Sequelize, QueryTypes } = require('sequelize');
  const jwt = require('jsonwebtoken');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
  });

  const t = config.db_prefix;
  const JWT_SECRET = config.jwt_secret || `${t}-jwt-secret`;

  function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token required' });
    try {
      req.member = jwt.verify(token, JWT_SECRET);
      req.member.id = req.member.member_id;
      next();
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  }

  async function requireProjectParticipant(req, res, next) {
    try {
      const projectId = parseInt(req.params.id);
      const memberId = req.member.id;
      // proposer | project_member | superadmin
      const [row] = await sequelize.query(
        `SELECT 1 AS ok FROM ${t}_projects WHERE id = :p AND proposer_member_id = :m
         UNION
         SELECT 1 FROM ${t}_project_members WHERE project_id = :p AND member_id = :m
         UNION
         SELECT 1 FROM ${t}_members WHERE id = :m AND access_level = 'superadmin'
         LIMIT 1`,
        { replacements: { p: projectId, m: memberId }, type: QueryTypes.SELECT }
      );
      if (!row) return res.status(403).json({ success: false, error: 'Not a project participant' });
      next();
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ============ OVERVIEW ============
  router.get('/overview', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      const projectId = req.params.id;
      const [taskStats] = await sequelize.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='todo') AS todo,
           COUNT(*) FILTER (WHERE status='doing') AS doing,
           COUNT(*) FILTER (WHERE status='review') AS review,
           COUNT(*) FILTER (WHERE status='done') AS done,
           COUNT(*) FILTER (WHERE status='blocked') AS blocked
         FROM ${t}_project_tasks WHERE project_id = :p`,
        { replacements: { p: projectId }, type: QueryTypes.SELECT }
      );
      const [msStats] = await sequelize.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='completed') AS completed
         FROM ${t}_project_milestones WHERE project_id = :p`,
        { replacements: { p: projectId }, type: QueryTypes.SELECT }
      );
      const recent = await sequelize.query(
        `SELECT 'message' AS kind, m.id, m.created_at, m.body AS text,
                mb.first_name || ' ' || mb.last_name AS member_name
         FROM ${t}_project_messages m JOIN ${t}_members mb ON mb.id = m.member_id
         WHERE m.project_id = :p
         UNION ALL
         SELECT 'task' AS kind, tk.id, tk.updated_at AS created_at, tk.title AS text,
                cb.first_name || ' ' || cb.last_name AS member_name
         FROM ${t}_project_tasks tk JOIN ${t}_members cb ON cb.id = tk.created_by_member_id
         WHERE tk.project_id = :p
         ORDER BY created_at DESC LIMIT 10`,
        { replacements: { p: projectId }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: { tasks: taskStats, milestones: msStats, recent_activity: recent } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============ TASKS ============
  router.get('/tasks', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      const tasks = await sequelize.query(
        `SELECT t1.*, m.first_name || ' ' || m.last_name AS assignee_name
         FROM ${t}_project_tasks t1
         LEFT JOIN ${t}_members m ON m.id = t1.assignee_member_id
         WHERE t1.project_id = :p
         ORDER BY t1.priority DESC, t1.due_date NULLS LAST, t1.created_at`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
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
        `INSERT INTO ${t}_project_tasks
         (project_id, title, description, status, assignee_member_id, milestone_id, priority, due_date, created_by_member_id, created_at, updated_at)
         VALUES (:p, :t, :d, :s, :a, :m, :pr, :dd, :c, NOW(), NOW())
         RETURNING *`,
        {
          replacements: {
            p: req.params.id, t: title, d: description || null,
            s: status || 'todo', a: assignee_member_id || null, m: milestone_id || null,
            pr: priority || 'medium', dd: due_date || null, c: req.member.id
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
      const allowed = ['title', 'description', 'status', 'assignee_member_id', 'milestone_id', 'priority', 'due_date'];
      const sets = []; const repl = { id: req.params.tid, p: req.params.id };
      for (const k of allowed) {
        if (k in req.body) {
          sets.push(`${k} = :${k}`);
          repl[k] = req.body[k];
        }
      }
      if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
      sets.push('updated_at = NOW()');
      if (req.body.status === 'done') sets.push('completed_at = NOW()');
      const [updated] = await sequelize.query(
        `UPDATE ${t}_project_tasks SET ${sets.join(', ')} WHERE id = :id AND project_id = :p RETURNING *`,
        { replacements: repl, type: QueryTypes.SELECT }
      );
      if (!updated) return res.status(404).json({ success: false, error: 'Task not found' });
      return res.json({ success: true, data: updated });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/tasks/:tid', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      await sequelize.query(
        `DELETE FROM ${t}_project_tasks WHERE id = :id AND project_id = :p`,
        { replacements: { id: req.params.tid, p: req.params.id } }
      );
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============ MILESTONES ============
  router.get('/milestones', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      const m = await sequelize.query(
        `SELECT * FROM ${t}_project_milestones WHERE project_id = :p ORDER BY target_month NULLS LAST, target_date`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: m });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/milestones', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      const { title, description, target_month, target_date, budget_allocation_usd, status } = req.body;
      if (!title) return res.status(400).json({ success: false, error: 'title required' });
      const [m] = await sequelize.query(
        `INSERT INTO ${t}_project_milestones
         (project_id, title, description, target_month, target_date, budget_allocation_usd, status, created_at)
         VALUES (:p, :t, :d, :tm, :td, :b, :s, NOW())
         RETURNING *`,
        {
          replacements: {
            p: req.params.id, t: title, d: description || null,
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
      const allowed = ['title', 'description', 'target_month', 'target_date', 'budget_allocation_usd', 'status', 'escrow_status', 'stripe_escrow_id'];
      const sets = []; const repl = { id: req.params.mid, p: req.params.id };
      for (const k of allowed) {
        if (k in req.body) { sets.push(`${k} = :${k}`); repl[k] = req.body[k]; }
      }
      if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
      if (req.body.status === 'completed') sets.push('completed_at = NOW()');
      const [updated] = await sequelize.query(
        `UPDATE ${t}_project_milestones SET ${sets.join(', ')} WHERE id = :id AND project_id = :p RETURNING *`,
        { replacements: repl, type: QueryTypes.SELECT }
      );
      if (!updated) return res.status(404).json({ success: false, error: 'Milestone not found' });
      return res.json({ success: true, data: updated });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/milestones/:mid/fund-escrow', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      // Stripe escrow stub -- mock for now
      const stripeId = 'esc_' + Math.random().toString(36).substring(2, 12);
      const [updated] = await sequelize.query(
        `UPDATE ${t}_project_milestones
         SET escrow_status = 'funded', stripe_escrow_id = :sid
         WHERE id = :id AND project_id = :p RETURNING *`,
        { replacements: { sid: stripeId, id: req.params.mid, p: req.params.id }, type: QueryTypes.SELECT }
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
        `UPDATE ${t}_project_milestones
         SET escrow_status = 'released', status = 'completed', completed_at = NOW()
         WHERE id = :id AND project_id = :p RETURNING *`,
        { replacements: { id: req.params.mid, p: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!updated) return res.status(404).json({ success: false, error: 'Milestone not found' });
      return res.json({ success: true, data: updated });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============ MESSAGES ============
  router.get('/messages', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      const limit = Math.min(100, parseInt(req.query.limit) || 50);
      const messages = await sequelize.query(
        `SELECT msg.*, m.first_name || ' ' || m.last_name AS member_name,
                m.country, m.sector
         FROM ${t}_project_messages msg
         JOIN ${t}_members m ON m.id = msg.member_id
         WHERE msg.project_id = :p
         ORDER BY msg.created_at DESC LIMIT :limit`,
        { replacements: { p: req.params.id, limit }, type: QueryTypes.SELECT }
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
        `INSERT INTO ${t}_project_messages (project_id, member_id, body, attachment_url, created_at)
         VALUES (:p, :m, :b, :a, NOW()) RETURNING *`,
        {
          replacements: { p: req.params.id, m: req.member.id, b: body.trim(), a: attachment_url || null },
          type: QueryTypes.SELECT
        }
      );
      return res.status(201).json({ success: true, data: msg });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============ DOCUMENTS ============
  router.get('/documents', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      const docs = await sequelize.query(
        `SELECT d.*, m.first_name || ' ' || m.last_name AS uploaded_by_name
         FROM ${t}_project_documents d
         JOIN ${t}_members m ON m.id = d.uploaded_by_member_id
         WHERE d.project_id = :p
         ORDER BY d.created_at DESC`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
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
        `INSERT INTO ${t}_project_documents (project_id, uploaded_by_member_id, title, file_url, doc_type, visibility, created_at)
         VALUES (:p, :m, :t, :f, :dt, 'participants', NOW()) RETURNING *`,
        {
          replacements: {
            p: req.params.id, m: req.member.id, t: title, f: file_url, dt: doc_type || 'other'
          },
          type: QueryTypes.SELECT
        }
      );
      return res.status(201).json({ success: true, data: doc });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============ INITIALIZE FROM PLAN ============
  // Manual trigger -- but PR-A also auto-fires this on /signoff completion.
  router.post('/initialize-from-plan', authMiddleware, requireProjectParticipant, async (req, res) => {
    try {
      const [proj] = await sequelize.query(
        `SELECT proposer_member_id FROM ${t}_projects WHERE id = :p`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });

      const [viewer] = await sequelize.query(
        `SELECT access_level FROM ${t}_members WHERE id = :m`,
        { replacements: { m: req.member.id }, type: QueryTypes.SELECT }
      );
      const isSuperadmin = viewer && viewer.access_level === 'superadmin';
      if (proj.proposer_member_id !== req.member.id && !isSuperadmin) {
        return res.status(403).json({ success: false, error: 'Only proposer or superadmin can initialize' });
      }

      const result = await autoInitWorkspaceFromPlan(sequelize, t, req.params.id, req.member.id);
      if (result.skipped) {
        return res.status(409).json({ success: false, error: result.reason });
      }
      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[init-from-plan]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
