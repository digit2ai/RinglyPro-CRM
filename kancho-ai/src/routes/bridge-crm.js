'use strict';

// Bridge CRM - Access RinglyPro CRM data (contacts, appointments, messages, calls) from KanchoAI
// All queries are scoped by the linked clientId from the bridge JWT

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let crmBridge;
try { crmBridge = require('../../config/crm-bridge'); } catch (e) { console.log('CRM Bridge not loaded:', e.message); }

// Auth middleware is injected by the parent router

// ==================== CONTACTS ====================

// GET /contacts - List contacts for this school's linked client
router.get('/contacts', async (req, res) => {
  if (!crmBridge?.ready) return res.status(503).json({ success: false, error: 'CRM bridge not available' });
  if (!req.clientId) return res.status(400).json({ success: false, error: 'No CRM client linked to this school' });

  try {
    const { page = 1, limit = 50, search, status } = req.query;
    const where = { client_id: req.clientId };
    if (status) where.status = status;

    if (search) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await crmBridge.Contact.findAndCountAll({
      where,
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

// POST /contacts - Create a contact
router.post('/contacts', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const contact = await crmBridge.Contact.create({
      client_id: req.clientId,
      first_name: req.body.firstName,
      last_name: req.body.lastName,
      phone: req.body.phone,
      email: req.body.email,
      notes: req.body.notes,
      source: req.body.source || 'kanchoai'
    });
    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /contacts/:id - Update a contact
router.put('/contacts/:id', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const contact = await crmBridge.Contact.findOne({ where: { id: req.params.id, client_id: req.clientId } });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    const allowed = ['first_name', 'last_name', 'phone', 'email', 'notes', 'status'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await contact.update(updates);
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /contacts/:id
router.delete('/contacts/:id', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const deleted = await crmBridge.Contact.destroy({ where: { id: req.params.id, client_id: req.clientId } });
    if (!deleted) return res.status(404).json({ success: false, error: 'Contact not found' });
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== APPOINTMENTS ====================

// GET /appointments - List appointments
router.get('/appointments', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const { date, status, page = 1, limit = 50 } = req.query;
    const where = { client_id: req.clientId };
    if (date) where.appointment_date = date;
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await crmBridge.Appointment.findAndCountAll({
      where,
      order: [['appointment_date', 'DESC'], ['appointment_time', 'ASC']],
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

// GET /appointments/today - Today's appointments
router.get('/appointments/today', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const today = new Date().toISOString().split('T')[0];
    const appointments = await crmBridge.Appointment.findAll({
      where: {
        client_id: req.clientId,
        appointment_date: today,
        status: { [Op.notIn]: ['cancelled'] }
      },
      order: [['appointment_time', 'ASC']]
    });
    res.json({ success: true, data: appointments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /appointments/month - Monthly calendar view
router.get('/appointments/month', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const appointments = await crmBridge.Appointment.findAll({
      where: {
        client_id: req.clientId,
        appointment_date: { [Op.between]: [startDate, endDate] }
      },
      order: [['appointment_date', 'ASC'], ['appointment_time', 'ASC']]
    });

    // Group by date
    const byDate = {};
    appointments.forEach(appt => {
      const d = appt.appointment_date;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(appt);
    });

    res.json({ success: true, data: { year, month, appointments, byDate } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /appointments - Create appointment
router.post('/appointments', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const confirmationCode = 'KA-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const appointment = await crmBridge.Appointment.create({
      client_id: req.clientId,
      contact_id: req.body.contactId || null,
      customer_name: req.body.customerName,
      customer_phone: req.body.customerPhone,
      customer_email: req.body.customerEmail || null,
      appointment_date: req.body.date,
      appointment_time: req.body.time,
      duration: req.body.duration || 60,
      purpose: req.body.purpose || 'Class trial',
      status: 'confirmed',
      confirmation_code: confirmationCode,
      source: 'kanchoai'
    });
    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /appointments/:id - Update appointment
router.put('/appointments/:id', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const appt = await crmBridge.Appointment.findOne({ where: { id: req.params.id, client_id: req.clientId } });
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });

    const allowed = ['customer_name', 'customer_phone', 'customer_email', 'appointment_date', 'appointment_time', 'duration', 'purpose', 'status'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await appt.update(updates);
    res.json({ success: true, data: appt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /appointments/:id - Cancel/delete appointment
router.delete('/appointments/:id', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const appt = await crmBridge.Appointment.findOne({ where: { id: req.params.id, client_id: req.clientId } });
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });

    await appt.update({ status: 'cancelled' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CALLS ====================

// GET /calls - Call history
router.get('/calls', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const { direction, status, page = 1, limit = 50 } = req.query;
    const where = { client_id: req.clientId };
    if (direction) where.direction = direction;
    if (status) where.call_status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await crmBridge.Call.findAndCountAll({
      where,
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

// GET /calls/stats - Call statistics
router.get('/calls/stats', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalCalls, todayCalls, answeredCalls, missedCalls] = await Promise.all([
      crmBridge.Call.count({ where: { client_id: req.clientId, created_at: { [Op.gte]: thirtyDaysAgo } } }),
      crmBridge.Call.count({ where: { client_id: req.clientId, created_at: { [Op.gte]: today } } }),
      crmBridge.Call.count({ where: { client_id: req.clientId, call_status: 'completed', created_at: { [Op.gte]: thirtyDaysAgo } } }),
      crmBridge.Call.count({ where: { client_id: req.clientId, call_status: { [Op.in]: ['missed', 'no-answer'] }, created_at: { [Op.gte]: thirtyDaysAgo } } })
    ]);

    res.json({
      success: true,
      data: {
        last30Days: totalCalls,
        today: todayCalls,
        answered: answeredCalls,
        missed: missedCalls,
        answerRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== MESSAGES ====================

// GET /messages - SMS message history
router.get('/messages', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const { direction, page = 1, limit = 50 } = req.query;
    const where = { client_id: req.clientId };
    if (direction) where.direction = direction;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await crmBridge.Message.findAndCountAll({
      where,
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

// ==================== DASHBOARD STATS ====================

// GET /dashboard - Combined CRM dashboard stats
router.get('/dashboard', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = today.toISOString().split('T')[0];

    const [
      contactCount,
      todayAppointments,
      todayCalls,
      todayMessages,
      recentContacts
    ] = await Promise.all([
      crmBridge.Contact.count({ where: { client_id: req.clientId } }),
      crmBridge.Appointment.findAll({
        where: { client_id: req.clientId, appointment_date: todayStr, status: { [Op.notIn]: ['cancelled'] } },
        order: [['appointment_time', 'ASC']]
      }),
      crmBridge.Call.count({ where: { client_id: req.clientId, created_at: { [Op.between]: [today, tomorrow] } } }),
      crmBridge.Message.count({ where: { client_id: req.clientId, created_at: { [Op.between]: [today, tomorrow] } } }),
      crmBridge.Contact.findAll({
        where: { client_id: req.clientId },
        order: [['created_at', 'DESC']],
        limit: 5
      })
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalContacts: contactCount,
          todayAppointments: todayAppointments.length,
          todayCalls,
          todayMessages
        },
        todayAppointments,
        recentContacts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
