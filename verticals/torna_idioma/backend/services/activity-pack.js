'use strict';

/**
 * Turns a reading lesson into a practice pack.
 *
 * Every lesson in ti_lessons is a passage plus three exercises. That is a textbook
 * page, not a language course — a learner can complete all 72 of them without ever
 * having spoken. This service derives the practice layer from the lesson's own
 * content, so it stays true to what is actually being taught and does not need an
 * author (or a model) to sit between the curriculum and the learner.
 *
 * What is derived here, deterministically, with no API key:
 *   - target vocabulary, lifted from the lesson's own "**term** — gloss" lines
 *   - the Tagalog cognate bridge, joined against ti_v2_cognates (576 rows)
 *   - the lesson's pronunciation focus, from the Filipino interference profile
 *   - sentence-mode drills, built from the lesson's real phrases
 *
 * What comes from the authored bank (data/practice-bank.js), per module:
 *   - roleplay scenarios, the debate prompt, the grammar focus, the can-do statements
 *   - the occupational (BPO) track from Module 7 onward
 *
 * An optional Claude pass (services/ai-activities.js) can deepen a pack afterwards.
 * It only ever fills fields that are still empty, so a hand-corrected pack is never
 * overwritten by a model.
 */

const sequelize = require('./db.ti');
const phonology = require('./phonology');
const bank = require('../data/practice-bank');

/**
 * Lift the vocabulary the lesson itself marks up.
 * The seed writes terms as "- **término** — gloss", which is a real contract across
 * 71 of the 72 lessons, so this is extraction rather than guesswork.
 */
function extractVocabulary(content) {
  const out = [];
  const seen = new Set();
  const re = /\*\*(.+?)\*\*\s*[—–-]\s*([^\n*]+)/g;
  let m;
  while ((m = re.exec(String(content || '')))) {
    const term = m[1].trim();
    const gloss = m[2].trim().replace(/\s+$/, '');
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push({ term, gloss });
  }
  return out;
}

/** The headword a cognate lookup should use — "El padre / La madre" has two. */
function lookupForms(term) {
  return String(term)
    .split('/')
    .map((s) => s.trim().replace(/^(el|la|los|las|un|una)\s+/i, '').replace(/[¡!¿?.,;:]/g, '').trim())
    .filter(Boolean);
}

/** Join this lesson's vocabulary against the Filipino-Spanish cognate table. */
async function attachCognates(terms) {
  if (!terms.length) return terms;
  const forms = [...new Set(terms.flatMap((t) => lookupForms(t.term).map((f) => f.toLowerCase())))];
  if (!forms.length) return terms;

  let rows = [];
  try {
    const [found] = await sequelize.query(
      `SELECT word_es, word_tl, etymology_note FROM ti_v2_cognates WHERE LOWER(word_es) = ANY($1)`,
      { bind: [forms] }
    );
    rows = found || [];
  } catch (e) {
    return terms; // cognate table absent or unreachable — the pack is still valid without it
  }

  const byWord = new Map(rows.map((r) => [String(r.word_es).toLowerCase(), r]));
  return terms.map((t) => {
    const hit = lookupForms(t.term).map((f) => byWord.get(f.toLowerCase())).find(Boolean);
    return hit
      ? { ...t, cognate: { tagalog: hit.word_tl, note: hit.etymology_note || null } }
      : t;
  });
}

/**
 * Sentence-mode drills: short lines the learner says aloud, each one chosen because
 * it exercises a sound their L1 does not hand them for free. Built from the lesson's
 * own phrases, so the drill is never disconnected from what was just taught.
 */
function sentenceDrills(terms, focus) {
  const contrasts = focus.filter((f) => f.kind === 'contrast');
  const drills = [];

  for (const c of contrasts.slice(0, 3)) {
    for (const example of c.examples.slice(0, 2)) {
      const term = terms.find((t) => t.term === example);
      if (!term) continue;
      drills.push({
        say: term.term,
        means: term.gloss,
        targets: c.label,
        why: c.tip_en,
      });
      if (drills.length >= 5) break;
    }
    if (drills.length >= 5) break;
  }

  // A lesson whose vocabulary trips no contrast still gets drills — the point is
  // daily production, not only remediation.
  if (drills.length < 3) {
    for (const t of terms) {
      if (drills.some((d) => d.say === t.term)) continue;
      drills.push({ say: t.term, means: t.gloss, targets: 'vowels', why: 'Keep the five vowels clean and short.' });
      if (drills.length >= 3) break;
    }
  }
  return drills;
}

/** Word mode: the retrievable core of the lesson, capped so a session stays a session. */
function wordMode(terms) {
  return terms.slice(0, 12).map((t) => ({
    term: t.term,
    gloss: t.gloss,
    cognate: t.cognate || null,
    pronunciation_targets: phonology.targetsFor(t.term),
  }));
}

/**
 * Build the complete pack for one lesson.
 * `moduleIndex` is 1-based (Module 1 … Module 12); `lessonIndex` likewise within it.
 */
async function buildPack(lesson, moduleIndex, lessonIndex) {
  const raw = extractVocabulary(lesson.content_en);
  const terms = await attachCognates(raw);
  const focus = phonology.lessonFocus(terms);
  const module = bank.forModule(moduleIndex) || {};

  // Each lesson takes one roleplay from its module's set, so a module's six lessons
  // cycle through the scenarios instead of all opening the same one.
  const roleplays = module.roleplays || [];
  const primary = roleplays.length ? roleplays[(lessonIndex - 1) % roleplays.length] : null;

  const occupational = module.occupational || null;
  const occScenario = occupational && occupational.scenarios.length
    ? occupational.scenarios[(lessonIndex - 1) % occupational.scenarios.length]
    : null;

  return {
    version: 1,
    source: 'derived',
    module_theme: module.theme || null,
    can_do: module.can_do || [],
    grammar: module.grammar || null,

    // speak
    roleplay: primary,
    all_roleplays: roleplays,
    debate: module.debate || null,

    // drill
    word_mode: wordMode(terms),
    sentence_mode: sentenceDrills(terms, focus),
    pronunciation_focus: focus,

    // work
    occupational: occupational
      ? { track: occupational.track, register: occupational.register, compliance: occupational.compliance, scenario: occScenario }
      : null,

    counts: {
      vocabulary: terms.length,
      cognates: terms.filter((t) => t.cognate).length,
      drills: sentenceDrills(terms, focus).length,
    },
  };
}

/** Persist a pack. Idempotent per lesson. */
async function savePack(lessonId, pack) {
  await sequelize.query(
    `INSERT INTO ti_lesson_activities (lesson_id, pack, source, updated_at, created_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (lesson_id) DO UPDATE
       SET pack = EXCLUDED.pack, source = EXCLUDED.source, updated_at = NOW()`,
    { bind: [lessonId, JSON.stringify(pack), pack.source || 'derived'] }
  );
}

/** Load packs for a set of lessons, keyed by lesson id. */
async function loadPacks(lessonIds) {
  if (!lessonIds || !lessonIds.length) return {};
  try {
    const [rows] = await sequelize.query(
      `SELECT lesson_id, pack, source FROM ti_lesson_activities WHERE lesson_id = ANY($1)`,
      { bind: [lessonIds] }
    );
    const out = {};
    for (const r of rows || []) {
      out[r.lesson_id] = typeof r.pack === 'string' ? JSON.parse(r.pack) : r.pack;
    }
    return out;
  } catch (e) {
    return {}; // table not migrated yet — the curriculum page renders without packs
  }
}

/** Rebuild every lesson's pack from the current curriculum. Returns a summary. */
async function rebuildAll() {
  const [courses] = await sequelize.query(
    `SELECT id FROM ti_courses ORDER BY sort_order, id`
  );
  const [lessons] = await sequelize.query(
    `SELECT id, course_id, title_en, content_en, sort_order FROM ti_lessons ORDER BY course_id, sort_order, id`
  );

  const moduleIndexById = new Map(courses.map((c, i) => [c.id, i + 1]));
  const perCourseCount = {};
  let built = 0;
  let withCognates = 0;

  for (const lesson of lessons) {
    const moduleIndex = moduleIndexById.get(lesson.course_id) || 1;
    perCourseCount[lesson.course_id] = (perCourseCount[lesson.course_id] || 0) + 1;
    const lessonIndex = perCourseCount[lesson.course_id];

    const pack = await buildPack(lesson, moduleIndex, lessonIndex);
    await savePack(lesson.id, pack);
    built += 1;
    if (pack.counts.cognates > 0) withCognates += 1;
  }

  return { built, lessons: lessons.length, lessons_with_cognates: withCognates };
}

module.exports = { extractVocabulary, buildPack, savePack, loadPacks, rebuildAll };
