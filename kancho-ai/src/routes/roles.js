'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) {}

// Default permissions by role
const ROLE_DEFAULTS = {
  owner:      { dashboard: 'write', students: 'write', leads: 'write', billing: 'write', staff: 'write', reports: 'write', settings: 'write', automations: 'write', campaigns: 'write' },
  admin:      { dashboard: 'write', students: 'write', leads: 'write', billing: 'write', staff: 'write', reports: 'read',  settings: 'write', automations: 'write', campaigns: 'write' },
  manager:    { dashboard: 'read',  students: 'write', leads: 'write', billing: 'read',  staff: 'read',  reports: 'read',  settings: 'none',  automations: 'read',  campaigns: 'write' },
  instructor: { dashboard: 'read',  students: 'read',  leads: 'none',  billing: 'none',  staff: 'none',  reports: 'none',  settings: 'none',  automations: 'none',  campaigns: 'none' },
  front_desk: { dashboard: 'read',  students: 'write', leads: 'write', billing: 'read',  staff: 'none',  reports: 'none',  settings: 'none',  automations: 'none',  campaigns: 'none' },
  viewer:     { dashboard: 'read',  students: 'read',  leads: 'read',  billing: 'none',  staff: 'none',  reports: 'read',  settings: 'none',  automations: 'none',  campaigns: 'none' }
};

// GET /defaults - Return role permission matrix
router.get('/defaults', (req, res) => {
  res.json({ success: true, data: ROLE_DEFAULTS });
});

// GET / - List roles for a school
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const roles = await kanchoModels.KanchoRole.findAll({
      where: { school_id: schoolId },
      order: [['role', 'ASC'], ['name', 'ASC']]
    });
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create/invite a role
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    if (!req.body.email) return res.status(400).json({ success: false, error: 'email required' });

    // Check duplicate
    const existing = await kanchoModels.KanchoRole.findOne({
      where: { school_id: schoolId, email: req.body.email }
    });
    if (existing) return res.status(409).json({ success: false, error: 'Role already exists for this email' });

    const roleName = req.body.role || 'viewer';
    const role = await kanchoModels.KanchoRole.create({
      school_id: schoolId,
      email: req.body.email,
      name: req.body.name,
      role: roleName,
      user_id: req.body.user_id || null,
      instructor_id: req.body.instructor_id || null,
      permissions: req.body.permissions || ROLE_DEFAULTS[roleName] || {}
    });
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update role/permissions
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const role = await kanchoModels.KanchoRole.findByPk(req.params.id);
    if (!role) return res.status(404).json({ success: false, error: 'Role not found' });

    const allowed = ['role', 'name', 'permissions', 'is_active', 'instructor_id'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    // Auto-fill default permissions when role changes
    if (updates.role && !req.body.permissions) {
      updates.permissions = ROLE_DEFAULTS[updates.role] || {};
    }
    updates.updated_at = new Date();
    await role.update(updates);
    res.json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Remove role
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const role = await kanchoModels.KanchoRole.findByPk(req.params.id);
    if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
    if (role.role === 'owner') return res.status(403).json({ success: false, error: 'Cannot remove owner role' });
    await role.destroy();
    res.json({ success: true, message: 'Role removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /check - Check permissions for current user
router.get('/check', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    const email = req.query.email || req.userEmail;
    if (!schoolId || !email) return res.status(400).json({ success: false, error: 'school_id and email required' });

    const role = await kanchoModels.KanchoRole.findOne({
      where: { school_id: schoolId, email, is_active: true }
    });

    if (!role) {
      // No role = owner by default (backwards compatible)
      return res.json({ success: true, data: { role: 'owner', permissions: ROLE_DEFAULTS.owner } });
    }

    const perms = { ...ROLE_DEFAULTS[role.role], ...role.permissions };
    res.json({ success: true, data: { role: role.role, permissions: perms } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
