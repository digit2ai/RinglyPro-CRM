'use strict';

/**
 * Executive English Coaching — "entre sesiones" assignments API.
 *  GET    /                 all assignments (optionally ?student_id=&status=)
 *  POST   /                 create an assignment
 *  PATCH  /:id              update status / fields
 *  DELETE /:id              delete an assignment
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Assignment, Student } = require('../models');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
const KINDS = ['audio', 'articulo', 'podcast', 'expresion', 'vocabulario', 'ejercicio'];

router.get('/', async (req, res) => {
  try {
    const where = { tenant_id: tenantOf(req) };
    if (req.query.student_id) where.student_id = parseInt(req.query.student_id, 10);
    if (req.query.status) where.status = req.query.status;
    const items = await Assignment.findAll({ where, order: [['status', 'ASC'], ['created_at', 'DESC']], limit: 500 });
    const studentIds = [...new Set(items.map(i => i.student_id))];
    const students = studentIds.length ? await Student.findAll({ where: { id: { [Op.in]: studentIds } } }) : [];
    const nameBy = {};
    students.forEach(st => { nameBy[st.id] = st.name; });
    res.json({ success: true, assignments: items.map(i => ({ ...i.toJSON(), student_name: nameBy[i.student_id] || null })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const studentId = parseInt(req.body.student_id, 10);
    const student = await Student.findOne({ where: { id: studentId, tenant_id: tenantOf(req) } });
    if (!student) return res.status(400).json({ error: 'Alumno inválido' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Título requerido' });
    const item = await Assignment.create({
      tenant_id: tenantOf(req),
      student_id: student.id,
      session_id: req.body.session_id ? parseInt(req.body.session_id, 10) : null,
      kind: KINDS.includes(req.body.kind) ? req.body.kind : 'ejercicio',
      title: title.slice(0, 200),
      detail: String(req.body.detail || '').slice(0, 2000) || null,
      due_date: req.body.due_date || null,
      status: 'open'
    });
    res.status(201).json({ success: true, assignment: item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const item = await Assignment.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!item) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (req.body.status && ['open', 'done'].includes(req.body.status)) {
      item.status = req.body.status;
      item.completed_at = req.body.status === 'done' ? new Date() : null;
    }
    if (req.body.title) item.title = String(req.body.title).slice(0, 200);
    if (req.body.detail !== undefined) item.detail = String(req.body.detail).slice(0, 2000);
    if (req.body.due_date !== undefined) item.due_date = req.body.due_date || null;
    if (req.body.kind && KINDS.includes(req.body.kind)) item.kind = req.body.kind;
    await item.save();
    res.json({ success: true, assignment: item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const item = await Assignment.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!item) return res.status(404).json({ error: 'Tarea no encontrada' });
    await item.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
