/**
 * RinglyPro CRM — Activity Timeline API
 */
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// GET /api/activities — Timeline (filter by contact_id or deal_id)
router.get('/', async (req, res) => {
  try {
    const { client_id, contact_id, deal_id, activity_type, limit = 50 } = req.query;
    if (!client_id && !contact_id && !deal_id) {
      return res.status(400).json({ success: false, error: 'client_id, contact_id, or deal_id required' });
    }

    let where = 'WHERE 1=1';
    const replacements = { limit: parseInt(limit) };
    if (client_id) { where += ' AND a.client_id = :clientId'; replacements.clientId = parseInt(client_id); }
    if (contact_id) { where += ' AND a.contact_id = :contactId'; replacements.contactId = parseInt(contact_id); }
    if (deal_id) { where += ' AND a.deal_id = :dealId'; replacements.dealId = parseInt(deal_id); }
    if (activity_type) { where += ' AND a.activity_type = :type'; replacements.type = activity_type; }

    const activities = await sequelize.query(
      `SELECT a.*, c.first_name, c.last_name
       FROM activities a LEFT JOIN contacts c ON a.contact_id = c.id
       ${where} ORDER BY a.created_at DESC LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );
    res.json({ success: true, count: activities.length, activities });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/activities — Manual note/activity
router.post('/', async (req, res) => {
  try {
    const { client_id, contact_id, deal_id, activity_type = 'note', title, description, metadata } = req.body;
    if (!client_id) return res.status(400).json({ success: false, error: 'client_id required' });

    const [activity] = await sequelize.query(
      `INSERT INTO activities (client_id, contact_id, deal_id, activity_type, title, description, metadata, created_at)
       VALUES (:clientId, :contactId, :dealId, :type, :title, :desc, :meta, NOW()) RETURNING *`,
      { replacements: { clientId: client_id, contactId: contact_id || null, dealId: deal_id || null, type: activity_type, title: title || null, desc: description || null, meta: JSON.stringify(metadata || {}) }, type: QueryTypes.SELECT }
    );
    res.status(201).json({ success: true, activity });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
