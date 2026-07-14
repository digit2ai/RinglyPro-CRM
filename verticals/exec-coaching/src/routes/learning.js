'use strict';

/**
 * Executive English Coaching — student learning experience (self-serve).
 *  GET  /program              active curriculum + module list (progress)
 *  GET  /modules/:id          one module (lessons + vocab), assessment meta
 *  GET  /modules/:id/assessment   the assessment questions (no answers)
 *  POST /modules/:id/assessment/submit  grade -> pass unlocks next / fail reinforces
 *  GET  /progress             summary stats for the student
 */

const express = require('express');
const router = express.Router();
const { Curriculum, Module, Assessment, AssessmentAttempt, IntakeProfile } = require('../models');
const brain = require('../services/curriculum-brain');

const { KbDocument } = require('../models');

// Lazily materialize a module (vocab + lessons + assessment questions) on first
// open — Phase B of the two-phase AI Curriculum Agent. Idempotent.
async function ensureModuleContent(mod, req) {
  let lessons = [], vocab = [];
  try { lessons = JSON.parse(mod.lessons || '[]'); } catch (e) { lessons = []; }
  try { vocab = JSON.parse(mod.vocab || '[]'); } catch (e) { vocab = []; }
  const hasLessonContent = lessons.length && lessons.every(l => l.content_en);
  if (hasLessonContent) return { vocab, lessons };

  const profile = await IntakeProfile.findOne({ where: { student_user_id: mod.student_user_id } });
  const kbDocs = await KbDocument.findAll({ where: { tenant_id: mod.tenant_id }, limit: 10 });
  const kbText = kbDocs.map(d => `# ${d.title}\n${d.content}`).join('\n\n');

  const content = await brain.generateModuleContent(
    { title: mod.title, objective: mod.objective }, profile ? profile.toJSON() : {}, kbText
  );
  mod.vocab = JSON.stringify(content.vocab || []);
  mod.lessons = JSON.stringify(content.lessons || []);
  await mod.save();

  // Fill the assessment questions if they weren't materialized yet.
  const a = await Assessment.findOne({ where: { module_id: mod.id } });
  if (a) {
    let existing = []; try { existing = JSON.parse(a.questions || '[]'); } catch (e) { existing = []; }
    if (!existing.length && content.assessment && content.assessment.questions && content.assessment.questions.length) {
      a.questions = JSON.stringify(content.assessment.questions);
      await a.save();
    }
  }
  return { vocab: content.vocab || [], lessons: content.lessons || [] };
}

function studentId(req) { return req.user && req.user.id; }
function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
function ensureStudent(req, res) {
  if (!req.user || req.user.role !== 'student') { res.status(403).json({ error: 'Solo para alumnos' }); return false; }
  return true;
}
const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } };

async function ownedModule(req, id) {
  return Module.findOne({ where: { id, student_user_id: studentId(req) } });
}

router.get('/program', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const cur = await Curriculum.findOne({ where: { student_user_id: studentId(req), status: 'active' } });
    if (!cur) return res.json({ success: true, curriculum: null, modules: [] });
    const mods = await Module.findAll({ where: { curriculum_id: cur.id }, order: [['order_index', 'ASC']] });
    res.json({
      success: true, curriculum: cur,
      modules: mods.map(m => ({
        id: m.id, order_index: m.order_index, title: m.title, objective: m.objective,
        status: m.status, best_score: m.best_score,
        lesson_count: parse(m.lessons, []).length, vocab_count: parse(m.vocab, []).length
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/modules/:id', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const m = await ownedModule(req, req.params.id);
    if (!m) return res.status(404).json({ error: 'Módulo no encontrado' });
    if (m.status === 'locked') return res.status(403).json({ error: 'Módulo bloqueado. Apruebe el módulo anterior.' });
    if (m.status === 'unlocked') { m.status = 'in_progress'; await m.save(); }
    const { vocab, lessons } = await ensureModuleContent(m, req);   // lazy AI materialization on first open
    const assessment = await Assessment.findOne({ where: { module_id: m.id } });
    res.json({
      success: true,
      module: { id: m.id, title: m.title, objective: m.objective, status: m.status, best_score: m.best_score,
        vocab, lessons, reinforcement: m.reinforcement || null },
      assessment_id: assessment ? assessment.id : null,
      is_final: assessment ? assessment.is_final : false,
      question_count: assessment ? parse(assessment.questions, []).length : 0,
      pass_threshold: assessment ? assessment.pass_threshold : 80
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Assessment questions WITHOUT the answers (so the client can't cheat).
router.get('/modules/:id/assessment', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const m = await ownedModule(req, req.params.id);
    if (!m) return res.status(404).json({ error: 'Módulo no encontrado' });
    if (m.status === 'locked') return res.status(403).json({ error: 'Módulo bloqueado' });
    await ensureModuleContent(m, req);   // safety: materialize if assessment reached before module open
    const a = await Assessment.findOne({ where: { module_id: m.id } });
    if (!a) return res.status(404).json({ error: 'Sin evaluación' });
    const qs = parse(a.questions, []).map(q => q.type === 'multiple_choice'
      ? { type: q.type, q: q.q, options: q.options }
      : { type: q.type, q: q.q });
    res.json({ success: true, assessment_id: a.id, pass_threshold: a.pass_threshold, is_final: a.is_final, questions: qs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Grade the assessment. Pass -> unlock next module. Fail -> AI reinforcement.
router.post('/modules/:id/assessment/submit', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const m = await ownedModule(req, req.params.id);
    if (!m) return res.status(404).json({ error: 'Módulo no encontrado' });
    const a = await Assessment.findOne({ where: { module_id: m.id } });
    if (!a) return res.status(404).json({ error: 'Sin evaluación' });

    const questions = parse(a.questions, []);
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const graded = brain.gradeAssessment(questions, answers);
    const passed = graded.score >= a.pass_threshold;

    await AssessmentAttempt.create({
      tenant_id: tenantOf(req), student_user_id: studentId(req), assessment_id: a.id, module_id: m.id,
      answers: JSON.stringify(answers), score: graded.score, passed,
      weak_areas: JSON.stringify(graded.weak_areas || [])
    });

    if (m.best_score == null || graded.score > m.best_score) m.best_score = graded.score;

    let reinforcement = null, unlockedNext = false, certificate = false;
    if (passed) {
      m.status = 'passed'; m.reinforcement = null;
      // Unlock the next module.
      const next = await Module.findOne({ where: { curriculum_id: m.curriculum_id, order_index: m.order_index + 1 } });
      if (next && next.status === 'locked') { next.status = 'unlocked'; await next.save(); unlockedNext = true; }
      certificate = a.is_final;
    } else {
      const profile = await IntakeProfile.findOne({ where: { student_user_id: studentId(req) } });
      reinforcement = await brain.reinforce({ title: m.title }, graded.weak_areas, profile ? profile.toJSON() : {});
      m.reinforcement = reinforcement;
      if (m.status !== 'passed') m.status = 'in_progress';
    }
    await m.save();

    res.json({
      success: true, score: graded.score, passed, pass_threshold: a.pass_threshold,
      correct: graded.correct, total: graded.total,
      unlocked_next: unlockedNext, certificate, reinforcement, weak_areas: graded.weak_areas
    });
  } catch (e) {
    console.error('assessment submit error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/progress', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const cur = await Curriculum.findOne({ where: { student_user_id: studentId(req), status: 'active' } });
    if (!cur) return res.json({ success: true, progress: null });
    const mods = await Module.findAll({ where: { curriculum_id: cur.id } });
    const passed = mods.filter(m => m.status === 'passed').length;
    const attempts = await AssessmentAttempt.count({ where: { student_user_id: studentId(req) } });
    res.json({ success: true, progress: {
      title: cur.title, level: cur.level, total_modules: mods.length, passed,
      pct: mods.length ? Math.round((passed / mods.length) * 100) : 0,
      completed: passed === mods.length && mods.length > 0, attempts
    } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
