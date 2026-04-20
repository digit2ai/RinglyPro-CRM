'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Contact, Company, Vertical, Project, ProjectContact, ActivityLog } = require('../models');
const { logActivity } = require('../services/activityService');

// GET /api/v1/contacts - List contacts
router.get('/', async (req, res) => {
  try {
    const { status, vertical_id, contact_type, search, tag, page = 1, limit = 50 } = req.query;
    const where = { workspace_id: 1, archived_at: null };

    if (status) where.status = status;
    if (vertical_id) where.vertical_id = vertical_id;
    if (contact_type) where.contact_type = contact_type;
    if (search) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (tag) where.tags = { [Op.contains]: [tag] };

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows, count } = await Contact.findAndCountAll({
      where,
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'] },
        { model: Vertical, as: 'vertical', attributes: ['id', 'name', 'color'] }
      ],
      order: [['updated_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({ success: true, data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) });
  } catch (error) {
    console.error('[D2AI] Contacts list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/contacts/followups - Contacts needing follow-up
router.get('/followups', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const contacts = await Contact.findAll({
      where: {
        workspace_id: 1,
        archived_at: null,
        next_followup_date: { [Op.lte]: today }
      },
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'] },
        { model: Vertical, as: 'vertical', attributes: ['id', 'name', 'color'] }
      ],
      order: [['next_followup_date', 'ASC']],
      limit: 50
    });
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/contacts/:id - Get contact detail
router.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      include: [
        { model: Company, as: 'company' },
        { model: Vertical, as: 'vertical' },
        { model: Project, as: 'projects', through: { attributes: ['role'] } }
      ]
    });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    // Get activity timeline
    const activity = await ActivityLog.findAll({
      where: { entity_type: 'contact', entity_id: contact.id },
      order: [['created_at', 'DESC']],
      limit: 20
    });

    res.json({ success: true, data: { ...contact.toJSON(), activity } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/contacts - Create contact
router.post('/', async (req, res) => {
  try {
    const data = { workspace_id: 1, ...req.body };
    const contact = await Contact.create(data);
    await logActivity(req.user?.email, 'created', 'contact', contact.id, `${contact.first_name} ${contact.last_name || ''}`);
    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    console.error('[D2AI] Create contact error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/contacts/:id - Update contact
router.put('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    await contact.update(req.body);
    await logActivity(req.user?.email, 'updated', 'contact', contact.id, `${contact.first_name} ${contact.last_name || ''}`);
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/contacts/:id/archive - Archive contact
router.put('/:id/archive', async (req, res) => {
  try {
    const contact = await Contact.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    await contact.update({ archived_at: new Date(), status: 'archived' });
    await logActivity(req.user?.email, 'archived', 'contact', contact.id, `${contact.first_name} ${contact.last_name || ''}`);
    res.json({ success: true, message: 'Contact archived' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/contacts/:id - Permanently delete contact
router.delete('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    // Remove project links first
    await ProjectContact.destroy({ where: { contact_id: contact.id } });
    await contact.destroy();
    await logActivity(req.user?.email, 'deleted', 'contact', contact.id, `${contact.first_name} ${contact.last_name || ''}`);
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
