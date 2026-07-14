'use strict';

/**
 * Executive English Coaching — student intake + placement + program generation.
 * Student self-serve. All routes scoped to the logged-in student (req.user.id,
 * role='student'). tenant_id = student's own tenant.
 *
 *  GET  /me                     current intake profile (or null)
 *  POST /save                   upsert intake answers (partial, per step)
 *  GET  /placement              placement item bank (no answers)
 *  POST /placement/submit       score placement -> level
 *  POST /placement/spoken       score a 30s spoken response (optional)
 *  POST /generate-program       run the AI Curriculum Agent -> modules
 */

const express = require('express');
const router = express.Router();
const { IntakeProfile, Curriculum, Module, Assessment, KbDocument, User } = require('../models');
const brain = require('../services/curriculum-brain');

function studentId(req) { return req.user && req.user.id; }
function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
function ensureStudent(req, res) {
  if (!req.user || req.user.role !== 'student') { res.status(403).json({ error: 'Solo para alumnos' }); return false; }
  return true;
}

async function getOrInitProfile(req) {
  let p = await IntakeProfile.findOne({ where: { student_user_id: studentId(req) } });
  if (!p) {
    p = await IntakeProfile.create({
      tenant_id: tenantOf(req), student_user_id: studentId(req),
      email: req.user.email, first_name: (req.user.name || '').split(' ')[0] || null
    });
  }
  return p;
}

router.get('/me', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const p = await IntakeProfile.findOne({ where: { student_user_id: studentId(req) } });
    const curriculum = await Curriculum.findOne({ where: { student_user_id: studentId(req), status: 'active' } });
    res.json({ success: true, profile: p, has_program: !!curriculum });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const FIELDS = ['first_name', 'last_name', 'phone', 'email', 'age_range', 'occupation', 'industry', 'motivation', 'motivation_text', 'timeline_months', 'hours_per_week', 'self_level'];

router.post('/save', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const p = await getOrInitProfile(req);
    FIELDS.forEach(f => {
      if (req.body[f] !== undefined && req.body[f] !== null) {
        if (f === 'timeline_months' || f === 'hours_per_week') p[f] = parseInt(req.body[f], 10) || p[f];
        else p[f] = String(req.body[f]).slice(0, 2000);
      }
    });
    if (req.body.step) p.step = Math.max(p.step, parseInt(req.body.step, 10) || p.step);
    await p.save();
    res.json({ success: true, profile: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Placement item bank (questions only — answers stay server-side)
router.get('/placement', (req, res) => {
  if (!ensureStudent(req, res)) return;
  res.json({ success: true, items: brain.PLACEMENT_BANK });
});

router.post('/placement/submit', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const result = brain.scorePlacement(answers);
    const p = await getOrInitProfile(req);
    p.placement_level = result.level; p.placement_score = result.score;
    p.step = Math.max(p.step, 6);
    await p.save();
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/placement/spoken', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const target = String(req.body.target || 'Introduce yourself and your role.').slice(0, 400);
    const said = String(req.body.said || '').slice(0, 3000);
    const r = await brain.scoreSpoken(target, said);
    const p = await getOrInitProfile(req);
    p.placement_spoken = JSON.stringify(r);
    // Blend spoken level with quiz level (take the higher signal conservatively).
    if (!p.placement_level) p.placement_level = r.level;
    await p.save();
    res.json({ success: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Run the AI Curriculum Agent and materialize modules + assessments.
router.post('/generate-program', async (req, res) => {
  if (!ensureStudent(req, res)) return;
  try {
    const p = await getOrInitProfile(req);
    if (!p.occupation) return res.status(400).json({ error: 'Complete el perfil antes de generar el programa' });

    // Pull coach knowledge base if the student is linked to a coach tenant that
    // differs from their own (self-serve students default to their own tenant,
    // so KB is empty unless a coach shares the tenant).
    const kbDocs = await KbDocument.findAll({ where: { tenant_id: tenantOf(req) }, limit: 20 });
    const kbText = kbDocs.map(d => `# ${d.title} (${d.kind})\n${d.content}`).join('\n\n');

    const plan = await brain.generateCurriculum(p.toJSON(), kbText);

    // Archive any prior program, then persist the new one.
    await Curriculum.update({ status: 'archived' }, { where: { student_user_id: studentId(req), status: 'active' } });
    const threshold = parseInt(req.body.pass_threshold, 10) || 80;
    const cur = await Curriculum.create({
      tenant_id: tenantOf(req), student_user_id: studentId(req),
      title: plan.title, level: plan.level, focus: plan.focus,
      total_modules: plan.modules.length, pass_threshold: threshold, generated_by: plan.generated_by
    });

    for (let i = 0; i < plan.modules.length; i++) {
      const m = plan.modules[i];
      const mod = await Module.create({
        tenant_id: tenantOf(req), student_user_id: studentId(req), curriculum_id: cur.id,
        order_index: i, title: m.title, objective: m.objective,
        vocab: JSON.stringify(m.vocab || []), lessons: JSON.stringify(m.lessons || []),
        status: i === 0 ? 'unlocked' : 'locked'
      });
      await Assessment.create({
        tenant_id: tenantOf(req), student_user_id: studentId(req), module_id: mod.id,
        questions: JSON.stringify((m.assessment && m.assessment.questions) || []),
        pass_threshold: threshold, is_final: i === plan.modules.length - 1
      });
    }

    p.status = 'completed'; p.step = 7; await p.save();
    res.json({ success: true, curriculum: cur, modules: plan.modules.length, generated_by: plan.generated_by });
  } catch (e) {
    console.error('generate-program error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
