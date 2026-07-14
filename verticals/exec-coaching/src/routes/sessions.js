'use strict';

/**
 * Executive English Coaching — sessions API.
 *  POST /                  start a session for a student
 *  GET  /                  list sessions (optionally ?student_id=)
 *  GET  /:id               session + transcript + report
 *  POST /:id/turn          append a transcript turn (voice or typed)
 *  POST /:id/finalize      AI-generate the 5-deliverable report + speaking %
 *  GET  /:id/report        fetch the report only
 *  POST /:id/guidance      ask the AI coach about this session's plan
 *  POST /:id/suggest-assignments  AI-propose "entre sesiones" tasks (persisted)
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Student, Session, Transcript, Report, Assignment } = require('../models');
const brain = require('../services/coach-brain');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
function countWords(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }

// Parse a stored report row into a client-friendly object (JSON text -> arrays).
function reportToJSON(r) {
  if (!r) return null;
  const j = r.toJSON ? r.toJSON() : r;
  const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  return {
    id: j.id, session_id: j.session_id, student_id: j.student_id,
    fortalezas: parse(j.fortalezas, []),
    aspectos_mejorar: parse(j.aspectos_mejorar, []),
    expresiones: parse(j.expresiones, []),
    vocabulario: parse(j.vocabulario, []),
    ejercicio: j.ejercicio || '',
    correcciones: parse(j.correcciones, []),
    created_at: j.created_at
  };
}

async function ownedSession(req, id) {
  return Session.findOne({ where: { id, tenant_id: tenantOf(req) } });
}

// Start a session
router.post('/', async (req, res) => {
  try {
    const studentId = parseInt(req.body.student_id, 10);
    const student = await Student.findOne({ where: { id: studentId, tenant_id: tenantOf(req) } });
    if (!student) return res.status(400).json({ error: 'Alumno inválido' });
    const s = await Session.create({
      tenant_id: tenantOf(req),
      student_id: student.id,
      coach_name: (req.body.coach_name || (req.user && req.user.name) || 'Coach').slice(0, 80),
      scenario: String(req.body.scenario || '').slice(0, 160) || null,
      session_date: req.body.session_date || undefined,
      status: 'in_progress'
    });
    res.json({ success: true, session: s });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List sessions (optionally by student)
router.get('/', async (req, res) => {
  try {
    const where = { tenant_id: tenantOf(req) };
    if (req.query.student_id) where.student_id = parseInt(req.query.student_id, 10);
    const sessions = await Session.findAll({ where, order: [['created_at', 'DESC']], limit: 200 });
    const studentIds = [...new Set(sessions.map(s => s.student_id))];
    const students = studentIds.length ? await Student.findAll({ where: { id: { [Op.in]: studentIds } } }) : [];
    const nameBy = {};
    students.forEach(st => { nameBy[st.id] = st.name; });
    res.json({ success: true, sessions: sessions.map(s => ({ ...s.toJSON(), student_name: nameBy[s.student_id] || null })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Session detail
router.get('/:id', async (req, res) => {
  try {
    const s = await ownedSession(req, req.params.id);
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const transcript = await Transcript.findAll({ where: { session_id: s.id }, order: [['turn_index', 'ASC'], ['id', 'ASC']] });
    const report = await Report.findOne({ where: { session_id: s.id } });
    const student = await Student.findByPk(s.student_id);
    res.json({ success: true, session: s, student, transcript, report: reportToJSON(report) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Append a transcript turn (voice or typed — same pipeline)
router.post('/:id/turn', async (req, res) => {
  try {
    const s = await ownedSession(req, req.params.id);
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Texto requerido' });
    const count = await Transcript.count({ where: { session_id: s.id } });
    const role = req.body.role === 'coach' ? 'coach' : 'student';
    const turn = await Transcript.create({
      session_id: s.id, turn_index: count, role,
      text: text.slice(0, 8000),
      source: req.body.source === 'voice' ? 'voice' : 'typed'
    });
    // Keep the running speaking-% meter live.
    const words = countWords(text);
    if (role === 'coach') s.coach_words += words; else s.student_words += words;
    const total = s.student_words + s.coach_words;
    s.speaking_pct = total ? Math.round((s.student_words / total) * 100) : null;
    await s.save();
    res.json({ success: true, turn, speaking_pct: s.speaking_pct, student_words: s.student_words, coach_words: s.coach_words });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Finalize: AI-generate the 5-deliverable report + lock the speaking %
router.post('/:id/finalize', async (req, res) => {
  try {
    const s = await ownedSession(req, req.params.id);
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const student = await Student.findByPk(s.student_id);
    const turns = await Transcript.findAll({ where: { session_id: s.id }, order: [['turn_index', 'ASC'], ['id', 'ASC']] });

    const result = await brain.finalizeSession(
      turns.map(t => ({ role: t.role, text: t.text })),
      { role_title: student && student.role_title, target_level: student && student.target_level }
    );

    // Recompute speaking % from the full transcript (authoritative).
    let sw = 0, cw = 0;
    for (const t of turns) { const w = countWords(t.text); if (t.role === 'coach') cw += w; else sw += w; }
    const total = sw + cw;
    s.student_words = sw; s.coach_words = cw;
    s.speaking_pct = total ? Math.round((sw / total) * 100) : null;
    s.subject = result.subject;
    s.summary = result.summary;
    s.status = 'finalized';
    if (req.body.duration_min) s.duration_min = parseInt(req.body.duration_min, 10) || null;
    await s.save();

    // One report per session — replace on re-finalize.
    await Report.destroy({ where: { session_id: s.id } });
    const report = await Report.create({
      tenant_id: tenantOf(req), session_id: s.id, student_id: s.student_id,
      fortalezas: JSON.stringify(result.fortalezas),
      aspectos_mejorar: JSON.stringify(result.aspectos_mejorar),
      expresiones: JSON.stringify(result.expresiones),
      vocabulario: JSON.stringify(result.vocabulario),
      ejercicio: result.ejercicio,
      correcciones: JSON.stringify(result.correcciones)
    });

    res.json({ success: true, session: s, report: reportToJSON(report) });
  } catch (e) {
    console.error('ExecCoaching finalize error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/report', async (req, res) => {
  try {
    const s = await ownedSession(req, req.params.id);
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const report = await Report.findOne({ where: { session_id: s.id } });
    res.json({ success: true, report: reportToJSON(report) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI-propose "entre sesiones" tasks and persist them for the student.
router.post('/:id/suggest-assignments', async (req, res) => {
  try {
    const s = await ownedSession(req, req.params.id);
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const student = await Student.findByPk(s.student_id);
    const report = reportToJSON(await Report.findOne({ where: { session_id: s.id } })) || { subject: s.subject };
    const tasks = await brain.suggestAssignments(report, { role_title: student && student.role_title });
    const created = [];
    for (const t of tasks) {
      created.push(await Assignment.create({
        tenant_id: tenantOf(req), student_id: s.student_id, session_id: s.id,
        kind: t.kind, title: t.title, detail: t.detail, status: 'open'
      }));
    }
    res.json({ success: true, created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Coaching guidance scoped to this session's improvement plan.
router.post('/:id/guidance', async (req, res) => {
  try {
    const s = await ownedSession(req, req.params.id);
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ error: 'Pregunta requerida' });
    const report = reportToJSON(await Report.findOne({ where: { session_id: s.id } })) || {};
    const answer = await brain.guidance(
      { subject: s.subject, summary: s.summary, aspectos_mejorar: report.aspectos_mejorar || [] },
      question,
      []
    );
    res.json({ success: true, answer });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
