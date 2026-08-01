'use strict';

/**
 * Optional pass that deepens a lesson's practice pack with Claude.
 *
 * The deterministic builder (services/activity-pack.js) already produces a complete,
 * usable pack with no API key: vocabulary, cognate bridge, pronunciation focus,
 * sentence drills, and the module's authored roleplays. This pass adds the one thing
 * that genuinely needs authoring per lesson — a comprehensible-input mini-dialogue
 * built from that lesson's own target language, plus a roleplay tuned to the lesson
 * rather than inherited from the module.
 *
 * Rules the code enforces, not just the prompt:
 *   - it only ever FILLS fields that are still empty. A pack whose `source` is
 *     'manual' is skipped entirely — a human vouched for it.
 *   - a lesson is skipped if it has no extracted vocabulary to ground the dialogue in.
 *   - structured output comes from a forced tool call, so a malformed response is a
 *     tool-validation failure rather than a JSON.parse guess.
 *
 * Requires ANTHROPIC_API_KEY. It is set on Render, not in local development — with no
 * key this module reports that plainly and changes nothing.
 */

const sequelize = require('./db.ti');
const activityPack = require('./activity-pack');

const MODEL = process.env.TI_ACTIVITIES_MODEL || 'claude-opus-5';

const AUTHOR_TOOL = {
  name: 'record_lesson_practice',
  description: 'Record the authored practice material for one Spanish lesson.',
  input_schema: {
    type: 'object',
    properties: {
      dialogue: {
        type: 'object',
        description: 'A 6-8 line exchange a learner listens to before speaking. Latin American Spanish, natural register, built only from this lesson\'s target language plus what an learner at this CEFR level already knows.',
        properties: {
          setting: { type: 'string', description: 'One sentence, in English, on where this takes place.' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speaker: { type: 'string' },
                es: { type: 'string' },
                en: { type: 'string' },
              },
              required: ['speaker', 'es', 'en'],
            },
          },
        },
        required: ['setting', 'lines'],
      },
      comprehension_question: {
        type: 'string',
        description: 'One question in Spanish about the dialogue, answerable aloud in a sentence.',
      },
      lesson_roleplay: {
        type: 'object',
        description: 'A roleplay specific to THIS lesson (not the wider module theme).',
        properties: {
          title: { type: 'string' },
          situation: { type: 'string', description: 'In English.' },
          opens: { type: 'string', description: 'The tutor\'s opening line, in Spanish.' },
          must_use: { type: 'array', items: { type: 'string' }, description: 'Spanish phrases the learner has to produce.' },
        },
        required: ['title', 'situation', 'opens', 'must_use'],
      },
      likely_errors: {
        type: 'array',
        description: 'Two or three errors a Filipino learner specifically is likely to make in this lesson, each with the correction.',
        items: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            correction: { type: 'string' },
            why: { type: 'string', description: 'The L1 interference or rule behind it, one sentence.' },
          },
          required: ['error', 'correction', 'why'],
        },
      },
    },
    required: ['dialogue', 'comprehension_question', 'lesson_roleplay', 'likely_errors'],
  },
};

const SYSTEM = `You author practice material for Torna Idioma, a Spanish course for Filipino learners.

Ground rules:
- Latin American Spanish, never Peninsular. No vosotros, no ceceo.
- Build only on the lesson's own target vocabulary plus language a learner at the stated CEFR level already has. Do not introduce a tense the course has not reached.
- Filipino learners share ~4,000 Spanish loanwords with the language. Lean on that where it is real; never invent a cognate that does not exist.
- Register matters: usted with elders, strangers and customers; tú with peers.
- Write dialogue people actually say, not textbook sentences that exist to display a grammar point.
- Never claim a learning outcome, and never write anything that reads as a promise about results.`;

function haveKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function authorForLesson(lesson, pack, moduleTitle, cefr) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const vocab = (pack.word_mode || []).map((w) => `${w.term} = ${w.gloss}`).join('\n');
  const contrasts = (pack.pronunciation_focus || [])
    .filter((f) => f.kind === 'contrast')
    .map((f) => f.sound)
    .join(', ');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [AUTHOR_TOOL],
    tool_choice: { type: 'tool', name: AUTHOR_TOOL.name },
    messages: [{
      role: 'user',
      content: `Module: ${moduleTitle}
Lesson: ${lesson.title_en} (${lesson.title_es})
CEFR: ${cefr}
Module theme: ${pack.module_theme || 'n/a'}
Grammar focus for this module: ${pack.grammar ? pack.grammar.point : 'n/a'}

Target vocabulary from this lesson:
${vocab || '(none extracted)'}

Sounds this lesson's vocabulary makes a Filipino learner work at: ${contrasts || 'none in particular'}

Author the practice material for this lesson.`,
    }],
  });

  const block = (response.content || []).find((b) => b.type === 'tool_use');
  if (!block) throw new Error('model returned no tool call');
  return block.input;
}

/**
 * Deepen packs that have not been authored yet.
 * `limit` bounds a run so a single invocation cannot spend unboundedly.
 */
async function deepen({ limit = 12, lessonIds = null } = {}) {
  if (!haveKey()) {
    return { ok: false, reason: 'ANTHROPIC_API_KEY is not set; nothing was changed.', authored: 0 };
  }

  const [courses] = await sequelize.query(`SELECT id, title_en, description_en FROM ti_courses ORDER BY sort_order, id`);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const where = lessonIds && lessonIds.length ? `AND l.id = ANY($1)` : '';
  const [rows] = await sequelize.query(
    `SELECT l.id, l.course_id, l.title_en, l.title_es, a.pack, a.source
       FROM ti_lessons l
       JOIN ti_lesson_activities a ON a.lesson_id = l.id
      WHERE a.source = 'derived' ${where}
      ORDER BY l.course_id, l.sort_order
      LIMIT ${Number(limit) || 12}`,
    lessonIds && lessonIds.length ? { bind: [lessonIds] } : undefined
  );

  const results = { authored: 0, skipped: 0, failed: 0, errors: [] };

  for (const row of rows) {
    const pack = typeof row.pack === 'string' ? JSON.parse(row.pack) : row.pack;
    if (!pack || !(pack.word_mode || []).length) { results.skipped += 1; continue; }
    if (pack.authored) { results.skipped += 1; continue; }

    const course = courseById.get(row.course_id) || {};
    const cefrMatch = String(course.description_en || '').match(/CEFR\s+([AB][12]\+?(?:\s*-\s*[AB][12]\+?)?)/i);

    try {
      const authored = await authorForLesson(row, pack, course.title_en || '', cefrMatch ? cefrMatch[1] : 'A1');
      // Fill, never overwrite: the derived pack is the floor.
      const merged = {
        ...pack,
        source: 'ai',
        authored,
        // A lesson-specific roleplay is better than the module's, so it takes the slot —
        // the module set is still listed under all_roleplays.
        roleplay: authored.lesson_roleplay || pack.roleplay,
      };
      await activityPack.savePack(row.id, merged);
      results.authored += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ lesson_id: row.id, message: err.message });
    }
  }

  return { ok: true, model: MODEL, ...results };
}

module.exports = { deepen, haveKey, MODEL };
