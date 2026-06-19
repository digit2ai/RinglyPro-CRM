'use strict';

/**
 * PLACEMENT (Phase 2 — credibility). Two stages:
 *   A) adaptive-ish graded MCQ (scored deterministically server-side)
 *   B) short oral elicitation (browser STT transcript → Claude oral band)
 * Combined into a CEFR level + a recommended starting lesson, saved on the
 * learner. The oral stage can only LOWER an MCQ over-placement (a reader who
 * can't talk) — never raise it — matching the design blueprint.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const auth = require('../middleware/auth.ti');
const rateLimit = require('../middleware/rate-limit.ti');
const sequelize = require('../services/db.ti');

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '../seeds/metodo_rizal/placement_bank.json'), 'utf8'));
const MODEL = 'claude-sonnet-4-6';
const ORDER = ['A1', 'A2', 'B1', 'B2'];
const limiter = rateLimit({ windowMs: 60000, max: 20, key: 'placement' });

function normLang(l) { return l === 'fil' ? 'fil' : 'en'; }

async function callClaude(system, user, max_tokens = 500) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TI_V2_ANTHROPIC_KEY;
  if (!apiKey) return { error: 'AI not configured', status: 503 };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!resp.ok) return { error: 'AI unavailable', status: 502 };
  const data = await resp.json();
  return { text: data.content?.[0]?.text || '' };
}
function parseJson(t) { if (!t) return null; try { return JSON.parse(t); } catch (e) {} const m = t.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e) {} } return null; }

// GET /bank — questions WITHOUT the answer key.
router.get('/bank', auth.any, (req, res) => {
  res.json({
    success: true,
    stage_a_mcq: BANK.stage_a_mcq.map(({ answer, ...q }) => q),
    stage_b_oral: BANK.stage_b_oral,
  });
});

// GET /status — has this learner been placed?
router.get('/status', auth.any, async (req, res) => {
  try {
    const [[u]] = await sequelize.query(`SELECT cefr_level, placed_at FROM ti_users WHERE id = $1`, { bind: [req.user.id] });
    res.json({ success: true, cefr_level: u?.cefr_level || null, placed_at: u?.placed_at || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /score — body { mcq:[{id,chosen}], oral:[{id,said}], interface_lang }
router.post('/score', auth.any, limiter, async (req, res) => {
  try {
    const lang = normLang(req.body.interface_lang || req.user.language_pref);
    const mcq = Array.isArray(req.body.mcq) ? req.body.mcq : [];
    const oral = Array.isArray(req.body.oral) ? req.body.oral : [];

    // Deterministic MCQ scoring per band.
    const byBand = { A1: { c: 0, n: 0 }, A2: { c: 0, n: 0 }, B1: { c: 0, n: 0 } };
    for (const item of BANK.stage_a_mcq) {
      const ans = mcq.find(m => m.id === item.id);
      if (!byBand[item.band]) continue;
      byBand[item.band].n++;
      if (ans && Number(ans.chosen) === item.answer) byBand[item.band].c++;
    }
    const rate = (b) => byBand[b].n ? byBand[b].c / byBand[b].n : 0;
    let mcqBand = 'A1';
    if (rate('A1') >= 0.5 && rate('A2') >= 0.5) mcqBand = 'A2';
    if (mcqBand === 'A2' && rate('B1') >= 0.5) mcqBand = 'B1';

    // Oral judging (Claude). Can only confirm or lower the MCQ band.
    const oralText = oral.map(o => {
      const p = BANK.stage_b_oral.find(x => x.id === o.id);
      return `Prompt: ${p ? p.es : o.id}\nLearner said: ${o.said || '(no answer)'}`;
    }).join('\n\n');
    const explLang = lang === 'fil' ? 'Tagalog' : 'English';
    const unitList = "a1-presentaciones, a1-numeros-alfabeto, a1-origen, a1-familia, a1-descripciones, a1-cortesia";

    const system = `You are a Spanish placement examiner. The learner's spoken answers were transcribed by an imperfect recognizer — judge communicative ability, not spelling. You are given a deterministic MCQ band and oral transcripts.

Rules:
- The MCQ band is "${mcqBand}". The oral evidence can CONFIRM it or LOWER it (a learner who tests well on grammar but cannot speak should be lowered), but must NOT raise it above the MCQ band.
- Recommend a starting lesson_id from this A1 course (only A1 units exist so far): ${unitList}. A near-beginner → a1-presentaciones. Stronger A1/A2/B1 → a later unit (e.g. a1-descripciones or a1-cortesia) as a warm-up, and note in the summary that higher-level units are coming.
- Output ONLY JSON: {"cefr_level":"A1|A2|B1","recommended_lesson":"<one of the unit ids>","summary_${lang}":"<2 warm sentences in ${explLang}: their level + what to do first>"}`;
    const user = `MCQ rates — A1:${rate('A1').toFixed(2)} A2:${rate('A2').toFixed(2)} B1:${rate('B1').toFixed(2)} → MCQ band ${mcqBand}.\nOral transcripts:\n${oralText || '(none)'}`;

    const r = await callClaude(system, user, 500);
    let out = r.error ? null : parseJson(r.text);
    if (!out) {
      // Fallback: trust MCQ band, recommend first lesson.
      out = { cefr_level: mcqBand, recommended_lesson: 'a1-presentaciones', [`summary_${lang}`]: lang === 'fil' ? 'Magsimula tayo sa unang aralin. Magaling!' : "Let's start at the first lesson. Great!" };
    }
    // Guard: never exceed MCQ band.
    if (ORDER.indexOf(out.cefr_level) > ORDER.indexOf(mcqBand)) out.cefr_level = mcqBand;

    await sequelize.query(`UPDATE ti_users SET cefr_level = $1, placed_at = NOW(), updated_at = NOW() WHERE id = $2`, { bind: [out.cefr_level, req.user.id] });
    res.json({ success: true, ...out, mcq_band: mcqBand });
  } catch (err) {
    console.error('placement/score error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
