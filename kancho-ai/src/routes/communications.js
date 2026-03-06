'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List communications
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.channel) where.channel = req.query.channel;
    if (req.query.direction) where.direction = req.query.direction;
    if (req.query.student_id) where.student_id = req.query.student_id;
    if (req.query.lead_id) where.lead_id = req.query.lead_id;
    if (req.query.status) where.status = req.query.status;

    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await kanchoModels.KanchoCommunication.findAndCountAll({
      where,
      include: [
        { model: kanchoModels.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name'], required: false },
        { model: kanchoModels.KanchoLead, as: 'lead', attributes: ['id', 'first_name', 'last_name'], required: false }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats - Communication statistics
router.get('/stats', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalSms, totalEmail, totalVoice, sent, delivered, failed] = await Promise.all([
      kanchoModels.KanchoCommunication.count({ where: { school_id: schoolId, channel: 'sms', created_at: { [Op.gte]: thirtyDaysAgo } } }),
      kanchoModels.KanchoCommunication.count({ where: { school_id: schoolId, channel: 'email', created_at: { [Op.gte]: thirtyDaysAgo } } }),
      kanchoModels.KanchoCommunication.count({ where: { school_id: schoolId, channel: 'voice', created_at: { [Op.gte]: thirtyDaysAgo } } }),
      kanchoModels.KanchoCommunication.count({ where: { school_id: schoolId, status: 'sent', created_at: { [Op.gte]: thirtyDaysAgo } } }),
      kanchoModels.KanchoCommunication.count({ where: { school_id: schoolId, status: 'delivered', created_at: { [Op.gte]: thirtyDaysAgo } } }),
      kanchoModels.KanchoCommunication.count({ where: { school_id: schoolId, status: 'failed', created_at: { [Op.gte]: thirtyDaysAgo } } })
    ]);

    res.json({
      success: true,
      data: {
        last30Days: { sms: totalSms, email: totalEmail, voice: totalVoice, total: totalSms + totalEmail + totalVoice },
        delivery: { sent, delivered, failed, rate: (sent + delivered) > 0 ? Math.round((delivered / (sent + delivered)) * 100) : 0 }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Log a communication
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const comm = await kanchoModels.KanchoCommunication.create({
      school_id: schoolId,
      channel: req.body.channel,
      direction: req.body.direction || 'outbound',
      from_number: req.body.from_number,
      to_number: req.body.to_number,
      from_email: req.body.from_email,
      to_email: req.body.to_email,
      subject: req.body.subject,
      body: req.body.body,
      status: req.body.status || 'sent',
      student_id: req.body.student_id || null,
      lead_id: req.body.lead_id || null,
      automation_id: req.body.automation_id || null,
      campaign: req.body.campaign,
      template_name: req.body.template_name,
      external_id: req.body.external_id,
      metadata: req.body.metadata || {}
    });
    res.status(201).json({ success: true, data: comm });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /timeline/:entity_type/:entity_id - Communication timeline for a student or lead
router.get('/timeline/:entity_type/:entity_id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const where = {};
    if (req.params.entity_type === 'student') where.student_id = req.params.entity_id;
    else if (req.params.entity_type === 'lead') where.lead_id = req.params.entity_id;
    else return res.status(400).json({ success: false, error: 'entity_type must be student or lead' });

    const comms = await kanchoModels.KanchoCommunication.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(req.query.limit) || 50
    });
    res.json({ success: true, data: comms });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
