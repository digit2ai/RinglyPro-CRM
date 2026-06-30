'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const crypto = require('crypto');
const { Project, Contact, Company, Vertical, ProjectContact, ProjectMilestone, ProjectUpdate, ActivityLog, StaffMember, ProjectQuestion, QuestionResponse, IntakeBatch, CompanyAccessToken, CalendarEvent, MeetingRsvp, sequelize } = require('../models');
const { logActivity } = require('../services/activityService');
const planGenerator = require('../../../chamber-template/lib/plan-generator');
const onDemandInvite = require('../services/onDemandMeetingInvite');

// =====================================================
// STAKEHOLDER SHARE (magic-link, no account required)
// =====================================================
//
// Three endpoints — placed BEFORE /:id so the share/* routes match.
//
//   POST /:id/share-token       (admin only) — mint or rotate the token, return URL
//   POST /share/:token/identify (public)     — body: { email }; verify email is in team_members
//   GET  /share/:token/data     (public)     — returns project data for the token, only if
//                                              the email param is in team_members.
//
// Hard guarantees:
//   - The token alone is NOT a key. Token + correct email is the key.
//   - The data endpoint only returns the ONE project that owns the token.
//   - Other projects, calendar, tasks, staff, etc. are not reachable through this surface.
//   - Tokens can be rotated (regenerated) or expired by the admin at any time.

function emailInTeam(project, email) {
  if (!email || !project) return false;
  const e = String(email).trim().toLowerCase();
  // Project owner (Manuel) and submitter are always allowed
  if (project.submitter_email && String(project.submitter_email).trim().toLowerCase() === e) return true;
  const team = Array.isArray(project.team_members) ? project.team_members : [];
  return team.some((m) => {
    if (!m) return false;
    if (typeof m === 'string') return m.trim().toLowerCase() === e;
    if (typeof m === 'object' && m.email) return String(m.email).trim().toLowerCase() === e;
    return false;
  });
}

// POST /api/v1/projects/:id/share-token — mint or rotate the magic-link token
router.post('/:id/share-token', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const token = crypto.randomUUID();
    project.stakeholder_share_token = token;
    project.stakeholder_share_created_at = new Date();
    // Default expiry: 365 days (admin can rotate any time)
    project.stakeholder_share_expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await project.save();
    await logActivity(req.user ? req.user.userId : null, 'share_token_created', 'project', project.id, project.name);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      token,
      share_url: `${baseUrl}/projects/share/${token}`,
      expires_at: project.stakeholder_share_expires_at
    });
  } catch (error) {
    console.error('[D2AI] Share-token create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/projects/:id/share-token — revoke
router.delete('/:id/share-token', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    project.stakeholder_share_token = null;
    project.stakeholder_share_created_at = null;
    project.stakeholder_share_expires_at = null;
    await project.save();
    await logActivity(req.user ? req.user.userId : null, 'share_token_revoked', 'project', project.id, project.name);
    res.json({ success: true });
  } catch (error) {
    console.error('[D2AI] Share-token revoke error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Note: public share endpoints (identify / data / comment) live in
// src/routes/projectShare.js and are mounted at /api/v1/projects/share
// WITHOUT auth, before the authenticated /api/v1/projects mount.

// GET /api/v1/projects - List projects
// Query params:
//   ?include_archived=1   include archived rows (archived_at IS NOT NULL).
//                         Default: exclude. The Projects page sets this so
//                         the user can switch to the Archived view client-side.
router.get('/', async (req, res) => {
  try {
    const { status, priority, vertical_id, search, page = 1, limit = 50, include_archived } = req.query;
    const where = { workspace_id: 1 };
    if (!include_archived || include_archived === '0' || include_archived === 'false') {
      where.archived_at = null;
    }

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

    // Resolve the requestor-facing share token (the magic link emailed
    // after approve/reject) so the UI can surface it on the detail page.
    const { ProjectIntake } = require('../models');
    let share_token = null;
    let batch_id = null;
    const intake = await ProjectIntake.findOne({ where: { project_id: project.id } });
    if (intake) {
      batch_id = intake.batch_id;
      const token = await CompanyAccessToken.findOne({
        where: { batch_id: intake.batch_id },
        order: [['created_at', 'ASC']]
      });
      share_token = token ? token.token : null;
    }

    res.json({ success: true, data: { ...project.toJSON(), activity, share_token, batch_id } });
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

// PUT /api/v1/projects/:id/unarchive - Restore an archived project
// Body: { status?: string } — defaults to 'active'. Caller can override
// (e.g. restore as 'planning' or 'on_hold' depending on what they want).
router.put('/:id/unarchive', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!project.archived_at) return res.status(400).json({ success: false, error: 'Project is not archived' });
    const restoreStatus = (req.body && req.body.status) || 'active';
    await project.update({ archived_at: null, status: restoreStatus });
    await logActivity(req.user?.email, 'unarchived', 'project', project.id, project.name);
    res.json({ success: true, message: 'Project restored', data: project });
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

// DELETE /api/v1/projects/:projectId/milestones/:id - Remove milestone
router.delete('/:projectId/milestones/:id', async (req, res) => {
  try {
    const milestone = await ProjectMilestone.findOne({ where: { id: req.params.id, project_id: req.params.projectId } });
    if (!milestone) return res.status(404).json({ success: false, error: 'Milestone not found' });
    const title = milestone.title;
    await milestone.destroy();
    await logActivity(req.user?.email, 'deleted_milestone', 'project', parseInt(req.params.projectId), title);
    res.json({ success: true });
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

    const targetDeliveryWeeks = project.target_delivery_weeks ? Number(project.target_delivery_weeks) : null;
    const targetTotalUsd = project.target_total_usd ? Number(project.target_total_usd) : null;

    let result;
    try {
      result = await planGenerator.generatePlan({
        vision,
        sector: sectorList,
        countries,
        budget_tier,
        target_delivery_weeks: targetDeliveryWeeks,
        target_total_usd: targetTotalUsd
      });
    } catch (genErr) {
      console.error('[D2AI] Business plan gen error:', genErr.message);
      return res.status(502).json({ success: false, error: 'Claude business plan generation failed: ' + genErr.message });
    }

    await project.update({
      business_plan_json: result.plan,
      business_plan_generated_at: new Date()
    });
    await logActivity(req.user?.email, 'generated_business_plan', 'project', project.id, project.name);

    // Auto-draft (or refresh) the service contract alongside the business plan
    // so the user can review + send both in one step. If a draft/sent contract
    // already exists, REFRESH its amounts from the new targets and re-render
    // the HTML — otherwise a regen with new target_total_usd would leave the
    // contract stuck with stale numbers. Signed/active contracts are never
    // mutated (the engagement is already committed).
    let contract = null;
    let contractError = null;
    try {
      const { ProjectContract } = require('../models');
      const contractsRouter = require('./contracts');
      const existing = await ProjectContract.findOne({
        where: { project_id: project.id, workspace_id: 1, status: { [Op.in]: ['draft', 'sent'] } },
        order: [['created_at', 'DESC']]
      });
      if (existing) {
        if (typeof contractsRouter.refreshContractFromProject === 'function') {
          contract = await contractsRouter.refreshContractFromProject(existing, project, { businessPlan: result.plan });
          await logActivity(req.user?.email, 'updated', 'contract', contract.id, 'Refreshed amounts from regenerated plan');
        } else {
          contract = existing;
        }
      } else if (typeof contractsRouter.createContractFromProject === 'function') {
        contract = await contractsRouter.createContractFromProject(project, {
          businessPlan: result.plan,
          created_by_email: req.user?.email || null
        });
        await logActivity(req.user?.email, 'created', 'contract', contract.id, 'Auto-drafted with business plan');
      }
    } catch (ce) {
      contractError = ce.message;
      console.error('[D2AI] auto-contract draft error:', ce);
    }

    res.json({
      success: true,
      plan: result.plan,
      contract: contract ? contract.toJSON() : null,
      contract_error: contractError,
      usage: result.usage,
      generated_at: project.business_plan_generated_at
    });
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

// =====================================================
// Architect pipeline admin endpoints (Push #1)
// =====================================================

// POST /api/v1/projects/:id/human-greenlight — sensitive-data review approval
router.post('/:id/human-greenlight', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const pipeline = require('../services/architectPipeline');
    await pipeline.humanGreenlight(project, req.user && req.user.email);
    res.json({ success: true, data: project });
  } catch (e) {
    console.error('[D2AI] human-greenlight error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/v1/projects/:id/build-complete — admin marks the manual build done
// Body (optional): { sit_report_md: "..." }  -- additional SIT notes Manuel wants stored
router.post('/:id/build-complete', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const pipeline = require('../services/architectPipeline');
    const result = await pipeline.onBuildComplete(project, {
      sit_report_md: req.body && req.body.sit_report_md
    });
    res.json({ success: true, data: project, sit: result.sit });
  } catch (e) {
    console.error('[D2AI] build-complete error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/v1/projects/:id/cancel-stripe — manual subscription cancel
router.post('/:id/cancel-stripe', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const pipeline = require('../services/architectPipeline');
    const result = await pipeline.cancelStripeSubscription(project, req.body && req.body.reason);
    res.json({ success: true, data: project, stripe: result });
  } catch (e) {
    console.error('[D2AI] cancel-stripe error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/v1/projects/:id/set-phase — admin override of workflow_phase
// Body: { phase: 'build_authorized' }
// Side effects: if phase is set to 'build_authorized', fires
// architectPipeline.start so the orchestrator builds the architect
// prompt and emails Manuel the manual-build handoff. Used for testing
// the pipeline without paying Stripe and for unsticking projects.
router.post('/:id/set-phase', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const allowed = [
      'pending_review', 'approved', 'rejected', 'kickoff_scheduled',
      'contract_drafted', 'awaiting_deposit', 'deposit_paid',
      'build_authorized', 'awaiting_human_greenlight', 'queued',
      'manual_build', 'sit_running', 'uat_ready', 'uat_revision',
      'shipped', 'build_stuck'
    ];
    const phase = req.body && req.body.phase;
    if (!phase || !allowed.includes(phase)) {
      return res.status(400).json({ success: false, error: 'phase must be one of: ' + allowed.join(', ') });
    }
    const prevPhase = project.workflow_phase;
    project.workflow_phase = phase;
    await project.save();
    await logActivity(req.user?.email, 'phase_override', 'project', project.id, project.name, { from: prevPhase, to: phase });

    // Trigger the architect pipeline if the admin set the project to build_authorized.
    let pipelineFired = false;
    if (phase === 'build_authorized') {
      try {
        const pipeline = require('../services/architectPipeline');
        setImmediate(() => {
          pipeline.start(project).catch(e => console.error('[D2AI] pipeline.start (manual) failed:', e.message));
        });
        pipelineFired = true;
      } catch (e) {
        console.error('[D2AI] pipeline load failed:', e.message);
      }
    }
    res.json({ success: true, data: project, pipeline_fired: pipelineFired });
  } catch (e) {
    console.error('[D2AI] set-phase error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// -------------------------------------------------------------
// Architect-prompt generation — runs as a BACKGROUND JOB.
//
// The Senior Prompt Engineer synthesis is a single non-streaming Opus call
// that can take 60–150s. The origin sits behind Cloudflare, which kills any
// request that doesn't complete within ~100s with a 524. When that happened
// the browser got an HTML error page (not JSON), the dashboard's res.json()
// threw, and the UI showed "Generate failed" — even though the backend kept
// running and saved the prompt seconds later. (That's why finished projects
// still ended up with a good architect_prompt despite the "failure".)
//
// Fix: POST /regenerate-prompt returns 202 immediately and does the work in
// the background; the dashboard polls GET /:id/prompt-status until done. No
// single HTTP request stays open long enough to hit the proxy timeout.
// -------------------------------------------------------------
const promptJobs = new Map(); // projectId(String) -> { status, startedAt, prompt_length?, used_synth?, error? }

async function runPromptGeneration(projectId, actorEmail) {
  const pipeline = require('../services/architectPipeline');
  const synth = require('../services/architectPromptSynth');
  const project = await Project.findOne({ where: { id: projectId, workspace_id: 1 } });
  if (!project) throw new Error('Project not found');
  // The prompt template references short_name (table prefixes, build paths,
  // health URL). In the streamlined fast-path the operator can generate the
  // prompt before the formal pipeline ever assigned one — so ensure it exists.
  if (!project.short_name) {
    project.short_name = await pipeline.generateUniqueShortName(project);
    const base = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
    project.production_url = `${base}/${project.short_name}`;
    await project.save();
  }
  const context = await pipeline.gatherContext(project);
  const rawPrompt = pipeline.renderArchitectPrompt(project, context);
  let finalPrompt = rawPrompt;
  let usedSynth = false;
  try {
    const synthesized = await synth.synthesizePrompt(rawPrompt, {
      id: project.id, short_name: project.short_name, name: project.name
    });
    if (synthesized && synthesized.length > 200) {
      finalPrompt = synthesized;
      usedSynth = true;
    }
  } catch (e) {
    console.error('[D2AI] synth failed, using raw template:', e.message);
  }
  project.architect_prompt = finalPrompt;
  await project.save();
  await logActivity(actorEmail, 'regenerated_architect_prompt', 'project', project.id, project.name, { used_synth: usedSynth });
  return { used_synth: usedSynth, prompt_length: finalPrompt.length };
}

// POST /api/v1/projects/:id/regenerate-prompt — kick off (re)generation in the
// background and return 202 immediately. Idempotent while running: a second
// POST for the same project returns the in-flight job's status instead of
// starting a duplicate Opus call.
router.post('/:id/regenerate-prompt', async (req, res) => {
  try {
    const id = String(req.params.id);
    const project = await Project.findOne({ where: { id, workspace_id: 1 }, attributes: ['id', 'name'] });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const existing = promptJobs.get(id);
    if (existing && existing.status === 'generating') {
      return res.status(202).json({ success: true, status: 'generating', already_running: true });
    }

    const job = { status: 'generating', startedAt: Date.now() };
    promptJobs.set(id, job);
    const actorEmail = req.user?.email;

    // Fire-and-forget — do NOT await; the response goes out now.
    runPromptGeneration(id, actorEmail)
      .then(result => { promptJobs.set(id, { status: 'done', startedAt: job.startedAt, finishedAt: Date.now(), ...result }); })
      .catch(err => {
        console.error('[D2AI] background prompt generation error:', err);
        promptJobs.set(id, { status: 'error', startedAt: job.startedAt, finishedAt: Date.now(), error: err.message });
      });

    return res.status(202).json({ success: true, status: 'generating' });
  } catch (e) {
    console.error('[D2AI] regenerate-prompt error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/v1/projects/:id/prompt-status — poll the background generation job.
// Returns { status: 'generating'|'done'|'error'|'idle' }. The dashboard polls
// this after POST /regenerate-prompt. A 'done'/'error' result is cleared after
// it's read so the next generation starts clean.
router.get('/:id/prompt-status', async (req, res) => {
  const id = String(req.params.id);
  const job = promptJobs.get(id);
  if (!job) {
    // No tracked job (server may have restarted mid-run). Tell the client to
    // just refresh — whatever the backend saved is already on the record.
    return res.json({ success: true, status: 'idle' });
  }
  const out = { success: true, status: job.status };
  if (job.status === 'done') { out.prompt_length = job.prompt_length; out.used_synth = job.used_synth; }
  if (job.status === 'error') out.error = job.error;
  if (job.status === 'generating') out.elapsed_ms = Date.now() - job.startedAt;
  // Clear terminal states once observed so a re-run isn't shadowed by stale state.
  if (job.status === 'done' || job.status === 'error') promptJobs.delete(id);
  res.json(out);
});

// POST /api/v1/projects/:id/recompute-short-name — generate / refresh slug
router.post('/:id/recompute-short-name', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const pipeline = require('../services/architectPipeline');
    project.short_name = await pipeline.generateUniqueShortName(project);
    const base = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
    project.production_url = `${base}/${project.short_name}`;
    await project.save();
    res.json({ success: true, data: project });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/v1/projects/:id/meetings/:eventId/send-invite
// Sends the styled HTML + .ics meeting invite (same look as the auto-
// scheduled kickoff email) to a list of recipients. Used by the Project
// Dashboard's Schedule Meeting modal — replaces the legacy mailto: flow.
//
// Body: {
//   recipients: ['a@x.com', ...],   // required
//   objective:  '...',              // optional intro line
//   agenda:     ['item 1', ...],    // optional, falls back to default 5-item agenda
//   language:   'en' | 'es'         // optional, default 'en'
// }
router.post('/:id/meetings/:eventId/send-invite', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const event = await CalendarEvent.findOne({
      where: { id: parseInt(req.params.eventId, 10), workspace_id: 1, project_id: project.id }
    });
    if (!event) return res.status(404).json({ success: false, error: 'Meeting event not found on this project' });

    const { recipients, objective, agenda, language } = req.body || {};
    if (!Array.isArray(recipients) || !recipients.length) {
      return res.status(400).json({ success: false, error: 'recipients required' });
    }

    if (!onDemandInvite.isConfigured()) {
      return res.status(503).json({ success: false, error: 'SendGrid not configured (SENDGRID_API_KEY missing)' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const magicLink = project.stakeholder_share_token
      ? `${baseUrl}/projects/share/${project.stakeholder_share_token}`
      : null;

    // Persist the chosen language on the event so the day-before reminder
    // poller can render its email in the same language as the invite.
    const lang = language === 'es' ? 'es' : 'en';
    if (event.language !== lang) {
      event.language = lang;
      try { await event.save(); } catch (_) {}
    }

    const result = await onDemandInvite.sendOnDemandMeetingInvite({
      recipients,
      project,
      meeting: {
        id: event.id,
        title: event.title,
        start_time: event.start_time,
        end_time: event.end_time,
        zoom_join_url: event.zoom_join_url,
        zoom_password: event.zoom_password,
        location: event.location,
        description: event.description
      },
      agenda: Array.isArray(agenda) ? agenda.filter(Boolean) : null,
      objective: typeof objective === 'string' ? objective : null,
      magicLink,
      language: lang,
      publicBase: baseUrl
    });

    await logActivity(null, 'meeting_invite_sent', 'project', project.id,
      `${project.name} — event #${event.id} sent to ${result.sent.length}/${recipients.length}`);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[D2AI] meeting send-invite error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/:id/meetings/:eventId/rsvps
// Returns all RSVP rows for a meeting (admin-authenticated, used by the
// project detail Attendance panel). Includes counts and per-recipient
// status for the UI to render.
router.get('/:id/meetings/:eventId/rsvps', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const rsvps = await MeetingRsvp.findAll({
      where: { event_id: parseInt(req.params.eventId, 10), project_id: project.id },
      order: [['created_at', 'ASC']]
    });

    const counts = { yes: 0, no: 0, maybe: 0, pending: 0 };
    const rows = rsvps.map(r => {
      const resp = r.response || null;
      if (resp === 'yes') counts.yes++;
      else if (resp === 'no') counts.no++;
      else if (resp === 'maybe') counts.maybe++;
      else counts.pending++;
      return {
        email: r.email,
        response: resp,
        responded_at: r.responded_at,
        invited_at: r.invited_at
      };
    });

    res.json({ success: true, data: { counts, rsvps: rows, total: rsvps.length } });
  } catch (error) {
    console.error('[D2AI] meeting rsvps list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
