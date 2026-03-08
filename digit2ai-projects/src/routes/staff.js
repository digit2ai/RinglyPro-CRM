'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { StaffMember, Role, StaffRole, Responsibility, Task, Project } = require('../models');
const { logActivity } = require('../services/activityService');

// =====================================================
// STAFF MEMBERS
// =====================================================

// GET /api/v1/staff - List staff
router.get('/', async (req, res) => {
  try {
    const { status, department, search } = req.query;
    const where = { workspace_id: 1, archived_at: null };
    if (status) where.status = status;
    if (department) where.department = department;
    if (search) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { position: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const staff = await StaffMember.findAll({
      where,
      include: [{ model: Role, as: 'roles', attributes: ['id', 'name', 'color'], through: { attributes: [] } }],
      order: [['first_name', 'ASC'], ['last_name', 'ASC']]
    });
    res.json({ success: true, data: staff });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/staff/:id - Single staff member with full details
router.get('/:id', async (req, res) => {
  try {
    const member = await StaffMember.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      include: [
        { model: Role, as: 'roles', attributes: ['id', 'name', 'color', 'description'], through: { attributes: [] },
          include: [{ model: Responsibility, as: 'responsibilities', attributes: ['id', 'name', 'description', 'category'] }]
        },
        { model: Task, as: 'tasks', where: { status: 'pending' }, required: false, attributes: ['id', 'title', 'status', 'priority', 'due_date'] },
        { model: Project, as: 'led_projects', where: { archived_at: null }, required: false, attributes: ['id', 'name', 'status', 'priority'] }
      ]
    });
    if (!member) return res.status(404).json({ success: false, error: 'Staff member not found' });
    res.json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/staff - Create staff member
router.post('/', async (req, res) => {
  try {
    const { role_ids, ...data } = req.body;
    data.workspace_id = 1;
    const member = await StaffMember.create(data);

    if (role_ids?.length) {
      await StaffRole.bulkCreate(role_ids.map(role_id => ({ staff_id: member.id, role_id })));
    }

    await logActivity(req.user?.email, 'created', 'staff', member.id, `${member.first_name} ${member.last_name || ''}`);

    const full = await StaffMember.findByPk(member.id, {
      include: [{ model: Role, as: 'roles', attributes: ['id', 'name', 'color'], through: { attributes: [] } }]
    });
    res.status(201).json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/staff/:id - Update staff member
router.put('/:id', async (req, res) => {
  try {
    const member = await StaffMember.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!member) return res.status(404).json({ success: false, error: 'Staff member not found' });

    const { role_ids, ...data } = req.body;
    await member.update(data);

    if (role_ids !== undefined) {
      await StaffRole.destroy({ where: { staff_id: member.id } });
      if (role_ids.length) {
        await StaffRole.bulkCreate(role_ids.map(role_id => ({ staff_id: member.id, role_id })));
      }
    }

    await logActivity(req.user?.email, 'updated', 'staff', member.id, `${member.first_name} ${member.last_name || ''}`);

    const full = await StaffMember.findByPk(member.id, {
      include: [{ model: Role, as: 'roles', attributes: ['id', 'name', 'color'], through: { attributes: [] } }]
    });
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/staff/:id/archive - Archive staff member
router.put('/:id/archive', async (req, res) => {
  try {
    const member = await StaffMember.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!member) return res.status(404).json({ success: false, error: 'Staff member not found' });
    await member.update({ archived_at: new Date(), status: 'inactive' });
    res.json({ success: true, message: 'Staff member archived' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/staff/:id - Delete staff member
router.delete('/:id', async (req, res) => {
  try {
    await StaffRole.destroy({ where: { staff_id: req.params.id } });
    await StaffMember.destroy({ where: { id: req.params.id, workspace_id: 1 } });
    res.json({ success: true, message: 'Staff member deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// ROLES
// =====================================================

// GET /api/v1/staff/roles/list - List roles
router.get('/roles/list', async (req, res) => {
  try {
    const roles = await Role.findAll({
      where: { workspace_id: 1 },
      include: [
        { model: Responsibility, as: 'responsibilities', attributes: ['id', 'name', 'description', 'category'] },
        { model: StaffMember, as: 'staff', attributes: ['id', 'first_name', 'last_name'], through: { attributes: [] } }
      ],
      order: [['sort_order', 'ASC'], ['name', 'ASC']]
    });
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/staff/roles - Create role
router.post('/roles', async (req, res) => {
  try {
    const data = { workspace_id: 1, ...req.body };
    const role = await Role.create(data);
    await logActivity(req.user?.email, 'created', 'role', role.id, role.name);
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/staff/roles/:id - Update role
router.put('/roles/:id', async (req, res) => {
  try {
    const role = await Role.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
    await role.update(req.body);
    res.json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/staff/roles/:id - Delete role
router.delete('/roles/:id', async (req, res) => {
  try {
    await StaffRole.destroy({ where: { role_id: req.params.id } });
    await Responsibility.destroy({ where: { role_id: req.params.id } });
    await Role.destroy({ where: { id: req.params.id, workspace_id: 1 } });
    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// RESPONSIBILITIES
// =====================================================

// POST /api/v1/staff/responsibilities - Create responsibility
router.post('/responsibilities', async (req, res) => {
  try {
    const data = { workspace_id: 1, ...req.body };
    const resp = await Responsibility.create(data);
    res.status(201).json({ success: true, data: resp });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/staff/responsibilities/:id - Update
router.put('/responsibilities/:id', async (req, res) => {
  try {
    const resp = await Responsibility.findByPk(req.params.id);
    if (!resp) return res.status(404).json({ success: false, error: 'Responsibility not found' });
    await resp.update(req.body);
    res.json({ success: true, data: resp });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/staff/responsibilities/:id - Delete
router.delete('/responsibilities/:id', async (req, res) => {
  try {
    await Responsibility.destroy({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Responsibility deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
