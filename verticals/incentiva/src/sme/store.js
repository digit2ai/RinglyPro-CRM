'use strict';

/**
 * SME knowledge capture: questions, answers, versions and progress.
 * An SME reads and writes only rows with their own user_id; every query here takes the user id from the
 * session, never from the request body.
 */

const db = require('../db');
const { SECTIONS, QUESTIONS } = require('./questions');

/** Insert-only seed: an existing section or question (matched by code) is never overwritten. */
async function seed(tenantId) {
  let sections = 0, questions = 0;
  for (let i = 0; i < SECTIONS.length; i++) {
    const s = SECTIONS[i];
    const r = await db.exec(`INSERT INTO nca_sme_sections (tenant_id, code, title_en, title_es, sort_order) VALUES (:t, :c, :en, :es, :o) ON CONFLICT DO NOTHING RETURNING id`,
      { t: tenantId, c: s.code, en: s.en, es: s.es, o: i + 1 });
    sections += r.length;
  }
  const ids = Object.fromEntries((await db.q('SELECT id, code FROM nca_sme_sections WHERE tenant_id = :t', { t: tenantId })).map((x) => [x.code, x.id]));
  for (const q of QUESTIONS) {
    const r = await db.exec(`INSERT INTO nca_sme_questions (tenant_id, section_id, code, text_en, text_es, help_en, help_es, answer_type, sort_order)
      VALUES (:t, :s, :c, :en, :es, :hen, :hes, :type, :o) ON CONFLICT DO NOTHING RETURNING id`,
      { t: tenantId, s: ids[q.section], c: q.code, en: q.en, es: q.es, hen: q.help_en, hes: q.help_es, type: q.answer_type, o: q.sort_order });
    questions += r.length;
  }
  return { sections, questions };
}

/** Active questions in the order an SME answers them: section order, then question order. */
async function orderedQuestions(tenantId) {
  return db.q(`SELECT q.id, q.code, q.section_id, s.code AS section_code, s.title_en AS section_en, s.title_es AS section_es
    FROM nca_sme_questions q JOIN nca_sme_sections s ON s.id = q.section_id AND s.tenant_id = q.tenant_id
    WHERE q.tenant_id = :t AND q.active = true ORDER BY s.sort_order, s.id, q.sort_order, q.id`, { t: tenantId });
}

async function overview(tenantId, userId) {
  const order = await orderedQuestions(tenantId);
  const answers = await db.q(`SELECT question_id, status, (COALESCE(length(trim(answer_text)), 0) > 0) AS has_text FROM nca_sme_answers WHERE tenant_id = :t AND user_id = :u`, { t: tenantId, u: userId });
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  const done = await db.q('SELECT section_id FROM nca_sme_section_status WHERE tenant_id = :t AND user_id = :u', { t: tenantId, u: userId });
  const complete = new Set(done.map((d) => d.section_id));
  const sections = [];
  const bySection = new Map();
  let answered = 0, resume = null;
  for (const q of order) {
    let sec = bySection.get(q.section_id);
    if (!sec) { sec = { id: q.section_id, code: q.section_code, title_en: q.section_en, title_es: q.section_es, total: 0, answered: 0, drafts: 0, first_question_id: q.id, first_open_question_id: null, completed: complete.has(q.section_id) }; bySection.set(q.section_id, sec); sections.push(sec); }
    sec.total++;
    const a = byQ.get(q.id);
    if (a && a.status === 'submitted') { sec.answered++; answered++; }
    else {
      if (a && a.has_text) sec.drafts++;
      if (!sec.first_open_question_id) sec.first_open_question_id = q.id;
      if (!resume) resume = q.id;
    }
  }
  for (const sec of sections) sec.status = sec.completed ? 'complete' : sec.answered === sec.total ? 'answered' : (sec.answered || sec.drafts) ? 'in_progress' : 'not_started';
  return { total: order.length, answered, resume_question_id: resume || (order[0] && order[0].id) || null, sections };
}

async function question(tenantId, userId, questionId) {
  const order = await orderedQuestions(tenantId);
  const idx = order.findIndex((q) => q.id === Number(questionId));
  if (idx === -1) return null;
  const q = await db.one('SELECT id, code, section_id, text_en, text_es, help_en, help_es, answer_type, options_json FROM nca_sme_questions WHERE id = :id AND tenant_id = :t AND active = true', { id: order[idx].id, t: tenantId });
  const a = await db.one('SELECT id, answer_text, answer_json, language, status, updated_at FROM nca_sme_answers WHERE tenant_id = :t AND user_id = :u AND question_id = :q', { t: tenantId, u: userId, q: q.id });
  const inSection = order.filter((x) => x.section_id === q.section_id);
  return {
    question: q,
    section: { id: q.section_id, code: order[idx].section_code, title_en: order[idx].section_en, title_es: order[idx].section_es, position: inSection.findIndex((x) => x.id === q.id) + 1, total: inSection.length },
    answer: a || null,
    position: idx + 1, total: order.length,
    prev_question_id: idx > 0 ? order[idx - 1].id : null,
    next_question_id: idx < order.length - 1 ? order[idx + 1].id : null,
    section_ends: idx === order.length - 1 || order[idx + 1].section_id !== q.section_id
  };
}

/**
 * Save an answer for the signed-in SME. A version row is written whenever the text, json or status
 * changed, so autosave every few seconds does not flood the history with identical copies.
 */
async function saveAnswer(tenantId, userId, questionId, { answer_text, answer_json, language, status }, logSessionId) {
  const q = await db.one('SELECT id FROM nca_sme_questions WHERE id = :id AND tenant_id = :t AND active = true', { id: Number(questionId) || 0, t: tenantId });
  if (!q) return { error: 404 };
  const text = answer_text == null ? null : String(answer_text).slice(0, 50000);
  const json = answer_json == null ? null : JSON.stringify(answer_json).length <= 50000 ? JSON.stringify(answer_json) : null;
  const lang = language === 'es' ? 'es' : 'en';
  const st = status === 'submitted' && text && text.trim() ? 'submitted' : 'draft';
  const prev = await db.one('SELECT id, answer_text, answer_json, status FROM nca_sme_answers WHERE tenant_id = :t AND user_id = :u AND question_id = :q', { t: tenantId, u: userId, q: q.id });
  // A submitted answer stays submitted when autosave sends a draft of the same text.
  const finalStatus = prev && prev.status === 'submitted' && st === 'draft' && (prev.answer_text || '') === (text || '') ? 'submitted' : st;
  let row;
  if (!prev) {
    row = (await db.exec(`INSERT INTO nca_sme_answers (tenant_id, user_id, question_id, answer_text, answer_json, language, status) VALUES (:t, :u, :q, :txt, :j, :l, :s)
      ON CONFLICT (tenant_id, user_id, question_id) DO UPDATE SET answer_text = EXCLUDED.answer_text, answer_json = EXCLUDED.answer_json, language = EXCLUDED.language, status = EXCLUDED.status, updated_at = now()
      RETURNING id, status, updated_at`, { t: tenantId, u: userId, q: q.id, txt: text, j: json, l: lang, s: finalStatus }))[0];
  } else {
    row = (await db.exec(`UPDATE nca_sme_answers SET answer_text = :txt, answer_json = :j, language = :l, status = :s, updated_at = now() WHERE id = :id RETURNING id, status, updated_at`,
      { txt: text, j: json, l: lang, s: finalStatus, id: prev.id }))[0];
  }
  const changed = !prev || (prev.answer_text || '') !== (text || '') || JSON.stringify(prev.answer_json || null) !== (json || 'null') || prev.status !== finalStatus;
  if (changed) {
    await db.exec('INSERT INTO nca_sme_answer_versions (tenant_id, answer_id, answer_text, answer_json, status) VALUES (:t, :a, :txt, :j, :s)', { t: tenantId, a: row.id, txt: text, j: json, s: finalStatus });
  }
  if (finalStatus === 'submitted' && (!prev || prev.status !== 'submitted') && logSessionId) {
    await db.exec('UPDATE nca_sme_sessions_log SET questions_answered = questions_answered + 1, ended_at = now() WHERE auth_session_id = :s', { s: logSessionId });
  }
  return { id: row.id, status: row.status, saved_at: row.updated_at, versioned: changed };
}

module.exports = { seed, orderedQuestions, overview, question, saveAnswer };
