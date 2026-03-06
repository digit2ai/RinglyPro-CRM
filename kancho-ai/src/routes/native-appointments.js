'use strict';

// Native Appointments - KanchoAI appointment management using kancho_appointments table
// No dependency on RinglyPro CRM bridge

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List appointments
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });

  try {
    const schoolId = req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'School context required' });

    const { date, status, page = 1, limit = 50 } = req.query;
    const where = { school_id: schoolId };
    if (date) where.appointment_date = date;
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await kanchoModels.KanchoAppointment.findAndCountAll({
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

// GET /today - Today's appointments
router.get('/today', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });

  try {
    const schoolId = req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'School context required' });

    const today = new Date().toISOString().split('T')[0];
    const appointments = await kanchoModels.KanchoAppointment.findAll({
      where: {
        school_id: schoolId,
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

// GET /month - Monthly calendar view
router.get('/month', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });

  try {
    const schoolId = req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'School context required' });

    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const appointments = await kanchoModels.KanchoAppointment.findAll({
      where: {
        school_id: schoolId,
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

// POST / - Create appointment
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });

  try {
    const schoolId = req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'School context required' });

    const confirmationCode = 'KA-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const appointment = await kanchoModels.KanchoAppointment.create({
      school_id: schoolId,
      student_id: req.body.studentId || null,
      lead_id: req.body.leadId || null,
      customer_name: req.body.customerName,
      customer_phone: req.body.customerPhone,
      customer_email: req.body.customerEmail || null,
      appointment_date: req.body.date,
      appointment_time: req.body.time,
      duration: req.body.duration || 60,
      purpose: req.body.purpose || 'Class trial',
      status: 'confirmed',
      confirmation_code: confirmationCode,
      source: 'kanchoai',
      notes: req.body.notes || null
    });
    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update appointment
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });

  try {
    const schoolId = req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'School context required' });

    const appt = await kanchoModels.KanchoAppointment.findOne({ where: { id: req.params.id, school_id: schoolId } });
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });

    const allowed = ['customer_name', 'customer_phone', 'customer_email', 'appointment_date', 'appointment_time', 'duration', 'purpose', 'status', 'notes'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await appt.update(updates);
    res.json({ success: true, data: appt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Cancel appointment
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });

  try {
    const schoolId = req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'School context required' });

    const appt = await kanchoModels.KanchoAppointment.findOne({ where: { id: req.params.id, school_id: schoolId } });
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });

    await appt.update({ status: 'cancelled', updated_at: new Date() });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
