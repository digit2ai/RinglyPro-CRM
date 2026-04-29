'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {
  sequelize,
  Company,
  Project,
  ProjectMilestone,
  IntakeBatch,
  ProjectIntake,
  ProjectQuestion,
  QuestionResponse,
  ProjectComment,
  PriorityVote,
  CompanyAccessToken
} = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TOKEN_AUDIENCE = 'd2ai-intake';

// =====================================================
// HEALTH (unauthenticated)
// =====================================================
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'D2AI Intake & Discussion',
    timestamp: new Date().toISOString()
  });
});

// =====================================================
// MAGIC-LINK IDENTIFY
// =====================================================
// POST /share/:token/identify { email, name }
//   -> returns { jwt, company_id, batch_id, role, expires_at }
router.post('/share/:token/identify', async (req, res) => {
  try {
    const { token } = req.params;
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email required' });

    const accessToken = await CompanyAccessToken.findOne({ where: { token } });
    if (!accessToken) return res.status(404).json({ success: false, error: 'Invalid share link' });

    if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
      return res.status(403).json({ success: false, error: 'Share link expired' });
    }

    // Persist identity (first time only) so the audit trail is locked
    if (!accessToken.grantee_email) {
      accessToken.grantee_email = email;
      accessToken.grantee_name = name || email;
    }
    accessToken.last_used_at = new Date();
    await accessToken.save();

    const sessionToken = jwt.sign(
      {
        aud: TOKEN_AUDIENCE,
        company_id: accessToken.company_id,
        batch_id: accessToken.batch_id,
        access_token_id: accessToken.id,
        email,
        name: name || email,
        role: accessToken.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      jwt: sessionToken,
      company_id: accessToken.company_id,
      batch_id: accessToken.batch_id,
      role: accessToken.role,
      email,
      name: name || email
    });
  } catch (err) {
    console.error('[D2AI-Intake] identify error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// AUTH MIDDLEWARE
// Accepts either:
//   (a) admin JWT (CRM userId/email -> auto-provisions UserAccess admin)
//   (b) intake share JWT (aud=d2ai-intake, scoped to company_id)
// Sets req.identity = { source, email, name, company_id?, role }
// =====================================================
async function intakeAuth(req, res, next) {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Missing bearer token' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (decoded.aud === TOKEN_AUDIENCE) {
      // share token
      req.identity = {
        source: 'share',
        email: decoded.email,
        name: decoded.name,
        company_id: decoded.company_id,
        batch_id: decoded.batch_id,
        role: decoded.role || 'reviewer'
      };
    } else {
      // admin token (existing CRM auth pattern)
      req.identity = {
        source: 'admin',
        email: decoded.email,
        name: decoded.businessName || decoded.email,
        role: 'admin'
      };
    }
    next();
  } catch (err) {
    console.error('[D2AI-Intake] auth error:', err);
    res.status(500).json({ success: false, error: 'Auth failed' });
  }
}

function isAdminIdentity(req) {
  return !!req.identity && (req.identity.source === 'admin' || req.identity.role === 'admin');
}

function requireAdmin(req, res, next) {
  if (isAdminIdentity(req)) return next();
  return res.status(403).json({ success: false, error: 'Admin access required' });
}

// Verify the requested resource belongs to the identity's company scope.
// Admin (CRM JWT or admin-role share token): always allowed.
// Reviewer share token: company_id must match.
function assertCompanyScope(req, resourceCompanyId) {
  if (!req.identity) return false;
  if (isAdminIdentity(req)) return true;
  return Number(resourceCompanyId) === Number(req.identity.company_id);
}

async function loadProjectAndAssertScope(req, projectId) {
  const project = await Project.findByPk(projectId, {
    include: [{ model: ProjectIntake, as: 'intake' }]
  });
  if (!project) return { error: 404, message: 'Project not found' };
  if (!assertCompanyScope(req, project.company_id)) {
    return { error: 403, message: 'Forbidden: cross-company access denied' };
  }
  return { project };
}

async function recomputePriorityAvg(project_id) {
  const votes = await PriorityVote.findAll({ where: { project_id } });
  if (!votes.length) {
    await ProjectIntake.update({ priority_avg: null }, { where: { project_id } });
    return null;
  }
  const avg = votes.reduce((s, v) => s + Number(v.score), 0) / votes.length;
  const rounded = Math.round(avg * 100) / 100;
  await ProjectIntake.update({ priority_avg: rounded }, { where: { project_id } });
  return rounded;
}

// =====================================================
// BATCHES
// =====================================================

// Create batch (admin)
router.post('/batches', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const { company_id, title, meeting_date, notes } = req.body;
    if (!company_id || !title) return res.status(400).json({ success: false, error: 'company_id and title required' });
    const company = await Company.findByPk(company_id);
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    const batch = await IntakeBatch.create({
      workspace_id: 1,
      company_id,
      title,
      meeting_date: meeting_date || null,
      submitted_by_email: req.identity.email,
      submitted_by_name: req.identity.name,
      status: 'draft',
      notes: notes || null
    });
    res.status(201).json({ success: true, data: batch });
  } catch (err) {
    console.error('[D2AI-Intake] create batch:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// List batches: admin sees all (filter by company_id), share sees only own
router.get('/batches', intakeAuth, async (req, res) => {
  try {
    const where = { workspace_id: 1 };
    if (req.identity.source === 'admin') {
      if (req.query.company_id) where.company_id = req.query.company_id;
    } else {
      where.company_id = req.identity.company_id;
    }
    const batches = await IntakeBatch.findAll({
      where,
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: batches });
  } catch (err) {
    console.error('[D2AI-Intake] list batches:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get full batch (with all projects + intake meta + questions + comments + votes)
router.get('/batches/:id', intakeAuth, async (req, res) => {
  try {
    const batch = await IntakeBatch.findByPk(req.params.id, {
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }]
    });
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    if (!assertCompanyScope(req, batch.company_id)) {
      return res.status(403).json({ success: false, error: 'Forbidden: cross-company access denied' });
    }

    // Pull all project intakes for this batch, with parent project
    const intakes = await ProjectIntake.findAll({
      where: { batch_id: batch.id },
      include: [
        {
          model: Project,
          as: 'project',
          include: [
            { model: ProjectQuestion, as: 'questions', include: [{ model: QuestionResponse, as: 'responses' }] },
            { model: ProjectComment, as: 'comments' },
            { model: PriorityVote, as: 'priority_votes' }
          ]
        }
      ],
      order: [['id', 'ASC']]
    });

    res.json({ success: true, data: { batch, projects: intakes } });
  } catch (err) {
    console.error('[D2AI-Intake] get batch:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add project to batch (admin)
router.post('/batches/:id/projects', intakeAuth, requireAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const batch = await IntakeBatch.findByPk(req.params.id, { transaction: t });
    if (!batch) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }
    const { name, description, feasibility, feasibility_notes, risk_level, risk_notes, contacts_notes, questions } = req.body;
    if (!name) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'name required' });
    }
    const project = await Project.create({
      workspace_id: 1,
      company_id: batch.company_id,
      name,
      description: description || null,
      status: 'planning',
      stage: 'initiation'
    }, { transaction: t });
    const intake = await ProjectIntake.create({
      project_id: project.id,
      batch_id: batch.id,
      feasibility: feasibility || null,
      feasibility_notes: feasibility_notes || null,
      risk_level: risk_level || null,
      risk_notes: risk_notes || null,
      contacts_notes: contacts_notes || null,
      intake_status: 'discussion'
    }, { transaction: t });
    if (Array.isArray(questions)) {
      for (let i = 0; i < questions.length; i++) {
        await ProjectQuestion.create({
          project_id: project.id,
          question_text: questions[i],
          position: i,
          created_by_email: req.identity.email
        }, { transaction: t });
      }
    }
    await t.commit();
    res.status(201).json({ success: true, data: { project, intake } });
  } catch (err) {
    await t.rollback();
    console.error('[D2AI-Intake] add project to batch:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PROJECT INTAKE PATCH (feasibility, risk, status)
// =====================================================
router.patch('/projects/:id/intake', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });

    const allowed = ['feasibility', 'feasibility_notes', 'risk_level', 'risk_notes', 'contacts_notes', 'intake_status'];
    const updates = {};
    for (const key of allowed) if (key in req.body) updates[key] = req.body[key];

    // Only admin can change intake_status to 'approved'/'rejected'/'converted'
    if (updates.intake_status && req.identity.source !== 'admin' && ['approved', 'rejected', 'converted'].includes(updates.intake_status)) {
      return res.status(403).json({ success: false, error: 'Only admin can finalize intake_status' });
    }

    await ProjectIntake.update(updates, { where: { project_id: req.params.id } });
    const fresh = await ProjectIntake.findOne({ where: { project_id: req.params.id } });
    res.json({ success: true, data: fresh });
  } catch (err) {
    console.error('[D2AI-Intake] patch intake:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// QUESTIONS
// =====================================================
router.post('/projects/:id/questions', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });

    const { question_text, position } = req.body;
    if (!question_text) return res.status(400).json({ success: false, error: 'question_text required' });
    const q = await ProjectQuestion.create({
      project_id: req.params.id,
      question_text,
      position: position || 0,
      created_by_email: req.identity.email
    });
    res.status(201).json({ success: true, data: q });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/questions/:id', intakeAuth, async (req, res) => {
  try {
    const q = await ProjectQuestion.findByPk(req.params.id);
    if (!q) return res.status(404).json({ success: false, error: 'Question not found' });
    const r = await loadProjectAndAssertScope(req, q.project_id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const { question_text, position } = req.body;
    if (question_text !== undefined) q.question_text = question_text;
    if (position !== undefined) q.position = position;
    await q.save();
    res.json({ success: true, data: q });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/questions/:id', intakeAuth, async (req, res) => {
  try {
    const q = await ProjectQuestion.findByPk(req.params.id);
    if (!q) return res.status(404).json({ success: false, error: 'Question not found' });
    const r = await loadProjectAndAssertScope(req, q.project_id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    if (req.identity.source !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    await q.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add response to a question
router.post('/questions/:id/responses', intakeAuth, async (req, res) => {
  try {
    const q = await ProjectQuestion.findByPk(req.params.id);
    if (!q) return res.status(404).json({ success: false, error: 'Question not found' });
    const r = await loadProjectAndAssertScope(req, q.project_id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });

    const { response_text } = req.body;
    if (!response_text) return res.status(400).json({ success: false, error: 'response_text required' });
    const resp = await QuestionResponse.create({
      question_id: q.id,
      responder_email: req.identity.email,
      responder_name: req.identity.name,
      response_text
    });
    res.status(201).json({ success: true, data: resp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// COMMENTS
// =====================================================
router.get('/projects/:id/comments', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const comments = await ProjectComment.findAll({
      where: { project_id: req.params.id },
      order: [['created_at', 'ASC']]
    });
    res.json({ success: true, data: comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/projects/:id/comments', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const { body, parent_comment_id } = req.body;
    if (!body) return res.status(400).json({ success: false, error: 'body required' });
    const c = await ProjectComment.create({
      project_id: req.params.id,
      parent_comment_id: parent_comment_id || null,
      author_email: req.identity.email,
      author_name: req.identity.name,
      body
    });
    res.status(201).json({ success: true, data: c });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PRIORITY VOTES
// =====================================================
router.get('/projects/:id/votes', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const votes = await PriorityVote.findAll({
      where: { project_id: req.params.id },
      order: [['created_at', 'ASC']]
    });
    const avg = votes.length
      ? Math.round((votes.reduce((s, v) => s + Number(v.score), 0) / votes.length) * 100) / 100
      : null;
    res.json({ success: true, data: { votes, average: avg, count: votes.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/projects/:id/votes', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const { score, rationale } = req.body;
    if (!score || score < 1 || score > 10) {
      return res.status(400).json({ success: false, error: 'score must be 1-10' });
    }
    const [vote] = await PriorityVote.upsert({
      project_id: Number(req.params.id),
      voter_email: req.identity.email,
      voter_name: req.identity.name,
      score,
      rationale: rationale || null
    }, {
      conflictFields: ['project_id', 'voter_email']
    });
    const avg = await recomputePriorityAvg(req.params.id);
    res.status(201).json({ success: true, data: vote, average: avg });
  } catch (err) {
    console.error('[D2AI-Intake] vote:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// CONVERT TO PLAN
// =====================================================
router.post('/projects/:id/convert', intakeAuth, requireAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const project = await Project.findByPk(req.params.id, { transaction: t });
    if (!project) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    const intake = await ProjectIntake.findOne({ where: { project_id: project.id }, transaction: t });
    if (!intake || intake.intake_status !== 'approved') {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'Project must be approved before conversion' });
    }
    const { milestones, due_date, kickoff_date, acceptance_criteria } = req.body;
    project.status = 'active';
    project.stage = 'execution';
    if (kickoff_date) project.start_date = kickoff_date;
    if (due_date) project.due_date = due_date;
    if (acceptance_criteria) {
      project.notes = (project.notes ? project.notes + '\n\n' : '') + 'Acceptance Criteria:\n' + acceptance_criteria;
    }
    await project.save({ transaction: t });
    intake.intake_status = 'converted';
    intake.converted_at = new Date();
    await intake.save({ transaction: t });
    if (Array.isArray(milestones)) {
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        await ProjectMilestone.create({
          project_id: project.id,
          title: m.title,
          description: m.description || null,
          due_date: m.due_date || null,
          status: 'pending',
          sort_order: i
        }, { transaction: t });
      }
    }
    await t.commit();
    res.json({ success: true, data: { project, intake } });
  } catch (err) {
    await t.rollback();
    console.error('[D2AI-Intake] convert:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// COMPANY ACCESS TOKENS (admin)
// =====================================================
router.post('/companies/:id/tokens', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    const { batch_id, grantee_email, grantee_name, role, expires_at } = req.body;
    const t = await CompanyAccessToken.create({
      company_id: company.id,
      batch_id: batch_id || null,
      grantee_email: grantee_email || null,
      grantee_name: grantee_name || null,
      role: role || 'reviewer',
      expires_at: expires_at || null
    });
    res.status(201).json({ success: true, data: t });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/companies/:id/tokens', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const tokens = await CompanyAccessToken.findAll({
      where: { company_id: req.params.id },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: tokens });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
