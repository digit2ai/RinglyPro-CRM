'use strict';

/**
 * Executive English Coaching — coach Knowledge Base.
 * Coach uploads teaching materials that steer the AI Curriculum Agent to teach
 * the way THIS coach teaches (white-label coach AI). Keyed by coach tenant.
 * Coach-only.
 *
 *  GET    /            list KB documents (this tenant)
 *  POST   /            add a document { title, kind, content }
 *  DELETE /:id         remove a document
 *  GET    /students    self-serve students in this tenant + their progress
 */

const express = require('express');
const router = express.Router();
const { KbDocument, User, Curriculum, Module } = require('../models');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
function ensureCoach(req, res) {
  if (!req.user || !['coach', 'owner'].includes(req.user.role)) { res.status(403).json({ error: 'Solo para coaches' }); return false; }
  return true;
}
const KINDS = ['method', 'vocab', 'lesson_plan', 'transcript', 'notes'];

router.get('/', async (req, res) => {
  if (!ensureCoach(req, res)) return;
  try {
    const docs = await KbDocument.findAll({ where: { tenant_id: tenantOf(req) }, order: [['created_at', 'DESC']], limit: 200 });
    res.json({ success: true, documents: docs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  if (!ensureCoach(req, res)) return;
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Título requerido' });
    const doc = await KbDocument.create({
      tenant_id: tenantOf(req), coach_id: req.user.id,
      title: title.slice(0, 200),
      kind: KINDS.includes(req.body.kind) ? req.body.kind : 'method',
      content: String(req.body.content || '').slice(0, 50000)
    });
    res.status(201).json({ success: true, document: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  if (!ensureCoach(req, res)) return;
  try {
    const doc = await KbDocument.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
    await doc.destroy();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Self-serve students in this tenant + their program progress (supervision view).
router.get('/students', async (req, res) => {
  if (!ensureCoach(req, res)) return;
  try {
    const students = await User.findAll({ where: { tenant_id: tenantOf(req), role: 'student' }, order: [['created_at', 'DESC']], limit: 200 });
    const out = [];
    for (const s of students) {
      const cur = await Curriculum.findOne({ where: { student_user_id: s.id, status: 'active' } });
      let passed = 0, total = 0;
      if (cur) {
        const mods = await Module.findAll({ where: { curriculum_id: cur.id } });
        total = mods.length; passed = mods.filter(m => m.status === 'passed').length;
      }
      out.push({ id: s.id, name: s.name, email: s.email,
        program: cur ? cur.title : null, level: cur ? cur.level : null,
        passed, total, pct: total ? Math.round((passed / total) * 100) : 0,
        stuck: cur && total && passed < total && passed === 0 });
    }
    res.json({ success: true, students: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
