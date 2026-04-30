'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Project, Contact, Company, Vertical, ProjectContact, ProjectMilestone, ProjectUpdate, ActivityLog, StaffMember, ProjectQuestion, QuestionResponse, IntakeBatch, CompanyAccessToken, sequelize } = require('../models');
const { logActivity } = require('../services/activityService');
const planGenerator = require('../../../chamber-template/lib/plan-generator');

// GET /api/v1/projects - List projects
router.get('/', async (req, res) => {
  try {
    const { status, priority, vertical_id, search, page = 1, limit = 50 } = req.query;
    const where = { workspace_id: 1, archived_at: null };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (vertical_id) where.vertical_id = vertical_id;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { code: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows, count } = await Project.findAndCountAll({
      where,
      include: [
        { model: Vertical, as: 'vertical', attributes: ['id', 'name', 'color'] },
        { model: Company, as: 'company', attributes: ['id', 'name'] },
        { model: StaffMember, as: 'lead', attributes: ['id', 'first_name', 'last_name'], required: false }
      ],
      order: [['updated_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({ success: true, data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) });
  } catch (error) {
    console.error('[D2AI] Projects list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// INBOX (intake_status='pending_review')
// =====================================================

// GET /api/v1/projects/inbox/count -> { count: N }
router.get('/inbox/count', async (req, res) => {
  try {
    const count = await Project.count({
      where: { workspace_id: 1, archived_at: null, intake_status: 'pending_review' }
    });
    res.json({ success: true, count });
  } catch (error) {
    console.error('[D2AI] Inbox count error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/inbox -> full pending review list with intake answers
router.get('/inbox', async (req, res) => {
  try {
    const rows = await Project.findAll({
      where: { workspace_id: 1, archived_at: null, intake_status: 'pending_review' },
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']]
    });

    // Pull Q&A and batch share token for each
    const enriched = await Promise.all(rows.map(async (p) => {
      const obj = p.toJSON();
      const questions = await ProjectQuestion.findAll({
        where: { project_id: p.id },
        include: [{ model: QuestionResponse, as: 'responses', attributes: ['response_text', 'responder_name'] }],
        order: [['position', 'ASC']]
      });
      obj.intake_qa = questions.map(q => ({
        question: q.question_text,
        answers: (q.responses || []).map(r => r.response_text)
      }));

      // Find share token (first reviewer-role token tied to this project's batch)
      const { ProjectIntake } = require('../models');
      const intake = await ProjectIntake.findOne({ where: { project_id: p.id } });
      if (intake) {
        const token = await CompanyAccessToken.findOne({
          where: { batch_id: intake.batch_id },
          order: [['created_at', 'ASC']]
        });
        obj.batch_id = intake.batch_id;
        obj.share_token = token ? token.token : null;
      }

      return obj;
    }));

    res.json({ success: true, data: enriched, total: enriched.length });
  } catch (error) {
    console.error('[D2AI] Inbox list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/overdue - Overdue projects
router.get('/overdue', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const projects = await Project.findAll({
      where: {
        workspace_id: 1,
        archived_at: null,
        due_date: { [Op.lt]: today },
        status: { [Op.notIn]: ['completed', 'cancelled'] }
      },
      include: [{ model: Vertical, as: 'vertical', attributes: ['id', 'name', 'color'] }],
      order: [['due_date', 'ASC']]
    });
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/stalled - Stalled projects (no update in 14 days)
router.get('/stalled', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const cutoff = new Date(Date.now() - days * 86400000);
    const projects = await Project.findAll({
      where: {
        workspace_id: 1,
        archived_at: null,
        status: { [Op.notIn]: ['completed', 'cancelled'] },
        updated_at: { [Op.lt]: cutoff }
      },
      include: [{ model: Vertical, as: 'vertical', attributes: ['id', 'name', 'color'] }],
      order: [['updated_at', 'ASC']]
    });
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/:id - Get project detail
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      include: [
        { model: Vertical, as: 'vertical' },
        { model: Company, as: 'company' },
        { model: StaffMember, as: 'lead', attributes: ['id', 'first_name', 'last_name', 'position'], required: false },
        { model: Contact, as: 'contacts', through: { attributes: ['role'] } },
        { model: ProjectMilestone, as: 'milestones', order: [['sort_order', 'ASC']] },
        { model: ProjectUpdate, as: 'updates', order: [['created_at', 'DESC']], limit: 20 }
      ]
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const activity = await ActivityLog.findAll({
      where: { entity_type: 'project', entity_id: project.id },
      order: [['created_at', 'DESC']],
      limit: 20
    });

    res.json({ success: true, data: { ...project.toJSON(), activity } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects - Create project
router.post('/', async (req, res) => {
  try {
    const data = { workspace_id: 1, ...req.body };
    // Auto-generate code if not provided
    if (!data.code && data.name) {
      data.code = data.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() + '-' + Date.now().toString(36).slice(-4).toUpperCase();
    }
    const project = await Project.create(data);
    await logActivity(req.user?.email, 'created', 'project', project.id, project.name);
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('[D2AI] Create project error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/projects/:id - Update project
router.put('/:id', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const oldStatus = project.status;
    await project.update(req.body);

    if (req.body.status && req.body.status !== oldStatus) {
      await logActivity(req.user?.email, 'status_changed', 'project', project.id, project.name, { from: oldStatus, to: req.body.status });
    } else {
      await logActivity(req.user?.email, 'updated', 'project', project.id, project.name);
    }

    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/projects/:id - Hard delete project (cascade through children)
router.delete('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 }, transaction: t });
    if (!project) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    const projectName = project.name;
    const ids = [project.id];
    // Cascade through intake-related tables (FKs are CASCADE on most, but be explicit
    // for d2_project_questions / d2_question_responses which lose the chain otherwise)
    await sequelize.query('DELETE FROM d2_question_responses WHERE question_id IN (SELECT id FROM d2_project_questions WHERE project_id = :pid)', { replacements: { pid: project.id }, transaction: t });
    await sequelize.query('DELETE FROM d2_project_questions WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    await sequelize.query('DELETE FROM d2_project_milestones WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    await sequelize.query('DELETE FROM d2_project_updates WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    await sequelize.query('DELETE FROM d2_project_intake WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    await sequelize.query('DELETE FROM d2_priority_votes WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    await sequelize.query('DELETE FROM d2_project_comments WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    await sequelize.query('DELETE FROM d2_project_contacts WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    // Tasks + calendar events: detach (FK ON DELETE SET NULL in schema, but enforce here)
    await sequelize.query('UPDATE d2_tasks SET project_id = NULL WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    await sequelize.query('UPDATE d2_calendar_events SET project_id = NULL WHERE project_id = :pid', { replacements: { pid: project.id }, transaction: t });
    // Finally delete the project itself
    await project.destroy({ transaction: t });
    await t.commit();
    await logActivity(req.user?.email, 'deleted', 'project', null, projectName);
    res.json({ success: true, message: 'Project deleted', project_name: projectName });
  } catch (error) {
    try { await t.rollback(); } catch (_) {}
    console.error('[D2AI] Delete project error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/projects/:id/archive - Archive project
router.put('/:id/archive', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    await project.update({ archived_at: new Date(), status: 'archived' });
    await logActivity(req.user?.email, 'archived', 'project', project.id, project.name);
    res.json({ success: true, message: 'Project archived' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects/:id/contacts - Link contact to project
router.post('/:id/contacts', async (req, res) => {
  try {
    const { contact_id, role } = req.body;
    await ProjectContact.findOrCreate({
      where: { project_id: req.params.id, contact_id },
      defaults: { project_id: parseInt(req.params.id), contact_id, role }
    });
    await logActivity(req.user?.email, 'linked_contact', 'project', parseInt(req.params.id), '', { contact_id });
    res.json({ success: true, message: 'Contact linked to project' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/projects/:id/contacts/:contactId - Unlink contact
router.delete('/:id/contacts/:contactId', async (req, res) => {
  try {
    await ProjectContact.destroy({ where: { project_id: req.params.id, contact_id: req.params.contactId } });
    res.json({ success: true, message: 'Contact unlinked' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects/:id/milestones - Add milestone
router.post('/:id/milestones', async (req, res) => {
  try {
    const milestone = await ProjectMilestone.create({ project_id: parseInt(req.params.id), ...req.body });
    await logActivity(req.user?.email, 'added_milestone', 'project', parseInt(req.params.id), req.body.title);
    res.status(201).json({ success: true, data: milestone });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/projects/:projectId/milestones/:id - Update milestone
router.put('/:projectId/milestones/:id', async (req, res) => {
  try {
    const milestone = await ProjectMilestone.findOne({ where: { id: req.params.id, project_id: req.params.projectId } });
    if (!milestone) return res.status(404).json({ success: false, error: 'Milestone not found' });

    if (req.body.status === 'completed' && milestone.status !== 'completed') {
      req.body.completed_at = new Date();
    }
    await milestone.update(req.body);
    res.json({ success: true, data: milestone });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects/:id/updates - Add project update
router.post('/:id/updates', async (req, res) => {
  try {
    const update = await ProjectUpdate.create({
      project_id: parseInt(req.params.id),
      user_email: req.user?.email,
      ...req.body
    });
    // Touch project updated_at
    await Project.update({ updated_at: new Date() }, { where: { id: req.params.id } });
    res.status(201).json({ success: true, data: update });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// AI BUSINESS PLAN GENERATION (reuses chamber-template/lib/plan-generator.js)
// =====================================================

function mapBudgetTier(budget_range) {
  if (!budget_range) return 'medium';
  const s = String(budget_range).toLowerCase();
  if (/under\s*\$?\s*10k|under\s*\$?\s*50k|<\s*\$?\s*50k|<\s*10k/.test(s)) return 'small';
  if (/\$?\s*1m\+|>\s*\$?\s*1m|\$?\s*250k\s*-\s*\$?\s*1m/.test(s)) return 'large';
  return 'medium';
}

// POST /api/v1/projects/:id/generate-business-plan
router.post('/:id/generate-business-plan', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Pull problem from intake Q&A
    let problemAnswer = '';
    const questions = await ProjectQuestion.findAll({
      where: { project_id: project.id },
      include: [{ model: QuestionResponse, as: 'responses', attributes: ['response_text'] }],
      order: [['position', 'ASC']]
    });
    const problemQ = questions.find(q => /problem.*solve/i.test(q.question_text));
    if (problemQ && problemQ.responses && problemQ.responses.length) {
      problemAnswer = problemQ.responses.map(r => r.response_text).join('\n');
    }

    const visionParts = [];
    if (project.description) visionParts.push(project.description);
    if (problemAnswer) visionParts.push('Problem: ' + problemAnswer);
    if (project.target_users) visionParts.push('Target users: ' + project.target_users);
    if (project.current_process) visionParts.push('Current process: ' + project.current_process);
    if (project.success_metrics) visionParts.push('Success metrics: ' + project.success_metrics);
    if (project.existing_stack) visionParts.push('Existing stack: ' + project.existing_stack);
    let vision = visionParts.join('\n\n');
    if (vision.length < 80) {
      vision = (project.description || project.name) + '\n\n' + (problemAnswer || 'Build an AI-powered solution to solve a business problem at scale.');
    }
    if (vision.length < 80) {
      vision = vision + '\n\nDeliver measurable ROI by automating manual workflows, improving accuracy, and reducing time-to-resolution. Build trust through reliable, observable AI behavior.';
    }

    const sectorList = Array.isArray(project.ai_category) && project.ai_category.length
      ? project.ai_category.join(' / ')
      : (project.category || 'Neural AI');
    const countries = project.country ? [project.country] : [];
    const budget_tier = mapBudgetTier(project.budget_range);

    let result;
    try {
      result = await planGenerator.generatePlan({ vision, sector: sectorList, countries, budget_tier });
    } catch (genErr) {
      console.error('[D2AI] Business plan gen error:', genErr.message);
      return res.status(502).json({ success: false, error: 'Claude business plan generation failed: ' + genErr.message });
    }

    await project.update({
      business_plan_json: result.plan,
      business_plan_generated_at: new Date()
    });
    await logActivity(req.user?.email, 'generated_business_plan', 'project', project.id, project.name);

    res.json({ success: true, plan: result.plan, usage: result.usage, generated_at: project.business_plan_generated_at });
  } catch (error) {
    console.error('[D2AI] generate-business-plan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/:id/business-plan
router.get('/:id/business-plan', async (req, res) => {
  try {
    const project = await Project.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      attributes: ['id', 'name', 'business_plan_json', 'business_plan_generated_at']
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!project.business_plan_json) return res.status(404).json({ success: false, error: 'No business plan generated yet' });
    res.json({
      success: true,
      plan: project.business_plan_json,
      generated_at: project.business_plan_generated_at,
      project_name: project.name
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
