'use strict';

/**
 * SPEAKING ENGINE (Phase 1 — browser-only voice).
 * Powers the speaking-first daily loop: serve units, give AI feedback on the
 * learner's spoken attempts (browser SpeechRecognition transcript → Claude),
 * run the roleplay persona, and score the oral assessment against a
 * criterion-referenced rubric (no auto-100). Model stays claude-sonnet-4-6.
 *
 * Pronunciation is transcript-based for now (free, browser STT). The feedback
 * contract is provider-agnostic so paid per-phoneme scoring can swap in later.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const auth = require('../middleware/auth.ti');
const rateLimit = require('../middleware/rate-limit.ti');
const emperador = require('../services/emperador');
const sequelize = require('../services/db.ti');

const UNITS_DIR = path.join(__dirname, '../seeds/metodo_rizal/speaking_units');
const MODEL = 'claude-sonnet-4-6';

function loadUnits() {
  try {
    return fs.readdirSync(UNITS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(UNITS_DIR, f), 'utf8')))
      // Order by CEFR then syllabus element (1.1, 1.2 …) so lessons run in teaching order.
      .sort((a, b) =>
        (a.cefr || '').localeCompare(b.cefr || '') ||
        String(a.element || '').localeCompare(String(b.element || ''), undefined, { numeric: true }) ||
        (a.unit_id || '').localeCompare(b.unit_id || ''));
  } catch (e) {
    return [];
  }
}

function normLang(l) { return l === 'fil' ? 'fil' : 'en'; }

async function callClaude({ system, messages, max_tokens = 700 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TI_V2_ANTHROPIC_KEY;
  if (!apiKey) return { error: 'AI service not configured', status: 503 };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages }),
  });
  if (!resp.ok) { return { error: 'AI temporarily unavailable', status: 502 }; }
  const data = await resp.json();
  return { text: data.content?.[0]?.text || '' };
}

// Pull the first JSON object out of a model reply (tolerates prose around it).
function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { return null; } }
  return null;
}

const limiter = rateLimit({ windowMs: 60000, max: 40, key: 'speaking' });

// --- Units ------------------------------------------------------------------
router.get('/units', auth.any, (req, res) => {
  const units = loadUnits().map(u => ({
    unit_id: u.unit_id, cefr: u.cefr, module: u.module, theme: u.theme,
    title: u.title, estimated_minutes: u.estimated_minutes, objectives: u.objectives,
  }));
  res.json({ success: true, units });
});

router.get('/units/:id', auth.any, (req, res) => {
  const u = loadUnits().find(x => x.unit_id === req.params.id);
  if (!u) return res.status(404).json({ error: 'unit not found' });
  res.json({ success: true, unit: u });
});

// --- Spoken-attempt feedback (guided prompts + shadow lines) -----------------
// Body: { target_es, said_text, interface_lang } → { score, ok, tip, corrected }
router.post('/feedback', auth.any, limiter, async (req, res) => {
  try {
    const target = String(req.body.target_es || '').slice(0, 400);
    const said = String(req.body.said_text || '').slice(0, 400);
    const lang = normLang(req.body.interface_lang || req.user.language_pref);
    if (!target || !said) return res.status(400).json({ error: 'target_es and said_text required' });

    const explLang = lang === 'fil' ? 'Tagalog' : 'English';
    const system = `You are Profesora Isabel scoring a beginner's spoken Spanish attempt. The learner's speech was transcribed by an imperfect browser recognizer, so judge MEANING and word choice, not exact spelling/accents. Be encouraging.

Return ONLY a JSON object (no prose):
{"score": <0-100, how well the attempt matches the target meaning & key words>,
 "ok": <true if score>=70>,
 "tip": "<one short, specific, encouraging tip in ${explLang}>",
 "corrected": "<the correct natural Spanish they were aiming for>"}`;
    const user = `TARGET (what they should say): "${target}"
LEARNER SAID (transcribed): "${said}"
Score the attempt.`;

    const r = await callClaude({ system, messages: [{ role: 'user', content: user }], max_tokens: 300 });
    if (r.error) return res.status(r.status).json({ error: r.error });
    const out = parseJson(r.text) || { score: 0, ok: false, tip: 'Try again — speak clearly.', corrected: target };
    out.score = Math.max(0, Math.min(100, Number(out.score) || 0));
    out.ok = !!out.ok;
    if (out.ok) { try { await emperador.award(req.user.id, 'translation_done'); } catch (e) { /* noop */ } }
    // Log a reviewable error when the attempt missed and we have a correction.
    if (!out.ok && out.corrected) {
      try {
        await sequelize.query(
          `INSERT INTO ti_speaking_errors (user_id, unit_id, learner_said, correct_form, tip, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          { bind: [req.user.id, req.body.unit_id || null, said, out.corrected, out.tip || null] }
        );
      } catch (e) { /* table may lag a migration; non-critical */ }
    }
    res.json({ success: true, ...out });
  } catch (err) {
    console.error('speaking/feedback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Roleplay turn (Isabel in-persona for the unit's scenario) ---------------
// Body: { unit_id, messages:[{role,content}], interface_lang } → { reply }
router.post('/roleplay', auth.any, limiter, async (req, res) => {
  try {
    const unit = loadUnits().find(x => x.unit_id === req.body.unit_id);
    if (!unit) return res.status(404).json({ error: 'unit not found' });
    const lang = normLang(req.body.interface_lang || req.user.language_pref);
    const persona = unit.roleplay?.isabel_persona || 'You are a friendly Spanish conversation partner. Speak simple Spanish for the learner level.';
    const explLang = lang === 'fil' ? 'Tagalog' : 'English';

    const system = `${persona}

Rules: Keep replies SHORT (1-2 sentences) and at CEFR ${unit.cefr} level. Speak Spanish. Wrap every Spanish phrase the learner should hear spoken in ⟦es⟧ … ⟦es⟧ markers. If the learner is stuck, offer a tiny hint in ${explLang} in parentheses. Stay in character for the scenario: ${unit.roleplay?.setup_es || unit.theme}. Never break character to lecture.`;

    const msgs = (Array.isArray(req.body.messages) ? req.body.messages : [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content || '') }));
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length) msgs.push({ role: 'user', content: 'Hola.' });

    const r = await callClaude({ system, messages: msgs, max_tokens: 400 });
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.json({ success: true, reply: r.text });
  } catch (err) {
    console.error('speaking/roleplay error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Oral assessment (5-criterion rubric, evidence-cited, no auto-100) -------
// Body: { unit_id, monologue_text, qa:[{q,a}], interface_lang } → rubric result
router.post('/assess', auth.any, limiter, async (req, res) => {
  try {
    const unit = loadUnits().find(x => x.unit_id === req.body.unit_id);
    if (!unit) return res.status(404).json({ error: 'unit not found' });
    const lang = normLang(req.body.interface_lang || req.user.language_pref);
    const explLang = lang === 'fil' ? 'Tagalog' : 'English';
    const monologue = String(req.body.monologue_text || '').slice(0, 1500);
    const qa = Array.isArray(req.body.qa) ? req.body.qa.slice(0, 8) : [];
    const transcript = `MONOLOGUE: ${monologue}\n` + qa.map((t, i) => `Q${i + 1}: ${t.q}\nA${i + 1}: ${t.a}`).join('\n');

    const system = `You are an oral proficiency examiner scoring a learner's spoken Spanish at CEFR ${unit.cefr}. The audio was transcribed by an imperfect browser recognizer — judge communication, not spelling/accents. Score 5 criteria from 1-5 each and CITE a short evidence span from the transcript for each. NEVER give a perfect/auto score; be fair but honest.

Criteria & weights: fluency 20%, accuracy 25%, pronunciation 20% (judge from word choice/intelligibility only, since this is a transcript), range 15%, interaction 20%.

Return ONLY JSON:
{"criteria": {"fluency": <1-5>, "accuracy": <1-5>, "pronunciation": <1-5>, "range": <1-5>, "interaction": <1-5>},
 "evidence": {"fluency":"...","accuracy":"...","pronunciation":"...","range":"...","interaction":"..."},
 "weighted_percent": <0-100>,
 "band": "${unit.cefr}",
 "pass": <true if weighted_percent>=${unit.assessment?.pass_threshold || 70} and no criterion is 1>,
 "summary_${lang}": "<2-sentence encouraging summary + the ONE thing to improve, in ${explLang}>"}`;
    const user = `Unit: ${unit.theme} (${unit.cefr}). Learner transcript:\n${transcript}\nScore it.`;

    const r = await callClaude({ system, messages: [{ role: 'user', content: user }], max_tokens: 700 });
    if (r.error) return res.status(r.status).json({ error: r.error });
    const out = parseJson(r.text);
    if (!out) return res.status(502).json({ error: 'could not score' });
    out.weighted_percent = Math.max(0, Math.min(100, Number(out.weighted_percent) || 0));
    out.pass = !!out.pass;
    if (out.pass) {
      try {
        await emperador.award(req.user.id, 'rizal_milestone'); // milestone-weight points for passing an oral assessment
      } catch (e) { /* noop */ }
    }
    // Record formative progress for this unit (best score + passed gate).
    try {
      await sequelize.query(
        `INSERT INTO ti_speaking_progress (user_id, unit_id, best_score, passed, attempts, completed_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, ${out.pass ? 'NOW()' : 'NULL'}, NOW())
         ON CONFLICT (user_id, unit_id) DO UPDATE SET
           best_score = GREATEST(ti_speaking_progress.best_score, $3),
           passed = ti_speaking_progress.passed OR $4,
           attempts = ti_speaking_progress.attempts + 1,
           completed_at = COALESCE(ti_speaking_progress.completed_at, ${out.pass ? 'NOW()' : 'NULL'}),
           updated_at = NOW()`,
        { bind: [req.user.id, unit.unit_id, out.weighted_percent, out.pass] }
      );
    } catch (e) { /* non-critical */ }
    res.json({ success: true, ...out });
  } catch (err) {
    console.error('speaking/assess error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Progress (formative gating) --------------------------------------------
router.get('/progress', auth.any, async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT unit_id, best_score, passed, attempts, completed_at FROM ti_speaking_progress WHERE user_id = $1`,
      { bind: [req.user.id] }
    );
    res.json({ success: true, progress: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Error log (review your mistakes) ---------------------------------------
router.get('/errors', auth.any, async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT id, unit_id, learner_said, correct_form, tip, created_at
       FROM ti_speaking_errors WHERE user_id = $1 AND resolved = false
       ORDER BY created_at DESC LIMIT 20`,
      { bind: [req.user.id] }
    );
    res.json({ success: true, errors: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/errors/:id/resolve', auth.any, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE ti_speaking_errors SET resolved = true WHERE id = $1 AND user_id = $2`,
      { bind: [Number(req.params.id), req.user.id] }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
