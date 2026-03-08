'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Project, Contact, Company, Vertical, ProjectContact, ProjectMilestone, ProjectUpdate, ActivityLog, StaffMember, sequelize } = require('../models');
const { logActivity } = require('../services/activityService');

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
        { model: StaffMember, as: 'lead', attributes: ['id', 'first_name', 'last_name'] }
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
        { model: StaffMember, as: 'lead', attributes: ['id', 'first_name', 'last_name', 'position'] },
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

module.exports = router;
