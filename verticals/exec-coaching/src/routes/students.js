'use strict';

/**
 * Executive English Coaching — students API (the coach's roster).
 *  GET    /            list students (with session + progress counts)
 *  POST   /            create a student
 *  GET    /:id         student detail + recent sessions + open assignments
 *  PATCH  /:id         update student
 *  DELETE /:id         delete a student (and cascade sessions/reports)
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Student, Session, Transcript, Report, Assignment } = require('../models');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
function coachOf(req) { return (req.user && req.user.id) || 0; }

router.get('/', async (req, res) => {
  try {
    const students = await Student.findAll({
      where: { tenant_id: tenantOf(req) },
      order: [['created_at', 'DESC']],
      limit: 200
    });
    const ids = students.map(s => s.id);
    const sessions = ids.length ? await Session.findAll({ where: { student_id: { [Op.in]: ids } } }) : [];
    const assignments = ids.length ? await Assignment.findAll({ where: { student_id: { [Op.in]: ids }, status: 'open' } }) : [];
    const sCount = {}, openA = {};
    for (const s of sessions) sCount[s.student_id] = (sCount[s.student_id] || 0) + 1;
    for (const a of assignments) openA[a.student_id] = (openA[a.student_id] || 0) + 1;
    res.json({
      success: true,
      students: students.map(s => ({ ...s.toJSON(), session_count: sCount[s.id] || 0, open_assignments: openA[s.id] || 0 }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const s = await Student.create({
      tenant_id: tenantOf(req),
      coach_id: coachOf(req),
      name: name.slice(0, 160),
      email: String(req.body.email || '').slice(0, 160) || null,
      role_title: String(req.body.role_title || '').slice(0, 160) || null,
      target_level: String(req.body.target_level || 'C1').slice(0, 20),
      native_language: String(req.body.native_language || 'es').slice(0, 10),
      goals: String(req.body.goals || '').slice(0, 4000) || null
    });
    res.status(201).json({ success: true, student: s });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const s = await Student.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!s) return res.status(404).json({ error: 'Alumno no encontrado' });
    const sessions = await Session.findAll({ where: { student_id: s.id }, order: [['created_at', 'DESC']], limit: 100 });
    const assignments = await Assignment.findAll({ where: { student_id: s.id }, order: [['status', 'ASC'], ['created_at', 'DESC']], limit: 100 });
    res.json({ success: true, student: s, sessions, assignments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const s = await Student.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!s) return res.status(404).json({ error: 'Alumno no encontrado' });
    ['name', 'email', 'role_title', 'target_level', 'native_language', 'goals', 'notes'].forEach(f => {
      if (req.body[f] !== undefined) s[f] = String(req.body[f]).slice(0, 4000);
    });
    await s.save();
    res.json({ success: true, student: s });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const s = await Student.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!s) return res.status(404).json({ error: 'Alumno no encontrado' });
    const sessions = await Session.findAll({ where: { student_id: s.id } });
    const sIds = sessions.map(x => x.id);
    if (sIds.length) {
      await Transcript.destroy({ where: { session_id: { [Op.in]: sIds } } });
      await Report.destroy({ where: { session_id: { [Op.in]: sIds } } });
    }
    await Session.destroy({ where: { student_id: s.id } });
    await Assignment.destroy({ where: { student_id: s.id } });
    await s.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
