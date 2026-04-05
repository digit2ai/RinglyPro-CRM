'use strict';

/**
 * v2 Training Data Export — Step 12 prep work
 *
 * Generates a Hugging Face-compatible .jsonl file from the existing
 * UVEG curriculum + cognate database. Used as the starting corpus
 * for fine-tuning Llama 3 (or similar) into "Profesora Isabel v1".
 *
 * Each line is one training example in OpenAI chat-completion format,
 * which vLLM, HF TGI, axolotl, and most fine-tuning pipelines accept:
 *   {"messages": [{"role":"system","content":"..."},
 *                 {"role":"user","content":"..."},
 *                 {"role":"assistant","content":"..."}]}
 *
 * Admin-only endpoint. Output can be piped directly to `huggingface-cli`
 * upload or an S3 bucket for the training job.
 */

const express = require('express');
const router = express.Router();
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');

const ISABEL_SYSTEM_SEED = `You are Profesora Isabel, a warm Filipina-Hispanic Spanish teacher from Intramuros, Manila. You address the learner as "mi apo" (my grandchild). You build bridges between Spanish and Tagalog using cognates, teach with gentle correction, and always respond in Spanish at CEFR A1-B1 level with English/Tagalog glosses for new vocabulary.`;

// GET /api/v2/training-data/stats
router.get('/stats', v2Auth.admin, async (req, res) => {
  try {
    const [[cognateCount]] = await sequelize.query(`SELECT COUNT(*)::int AS c FROM ti_v2_cognates`);
    const [[lessonCount]] = await sequelize.query(`SELECT COUNT(*)::int AS c FROM ti_lessons l JOIN ti_courses c ON c.id = l.course_id WHERE c.is_published = true`);
    const [[conversationCount]] = await sequelize.query(`SELECT COUNT(*)::int AS c FROM ti_v2_isabel_conversations WHERE role = 'assistant'`);

    res.json({
      success: true,
      training_corpus: {
        cognate_pairs: cognateCount.c,
        uveg_lessons: lessonCount.c,
        isabel_conversations: conversationCount.c,
        estimated_examples: cognateCount.c + (lessonCount.c * 3) + conversationCount.c
      },
      recommended_base_models: [
        { name: 'meta-llama/Llama-3.1-8B-Instruct', vram: '16GB', cost: '$0.50/hr spot' },
        { name: 'mistralai/Mistral-7B-Instruct-v0.3', vram: '14GB', cost: '$0.40/hr spot' },
        { name: 'Qwen/Qwen2.5-7B-Instruct', vram: '14GB', cost: '$0.40/hr spot' }
      ],
      estimated_training_cost_usd: 45,
      fine_tune_method: 'LoRA (rank 16, alpha 32)',
      epochs: 3
    });
  } catch (err) {
    console.error('[v2/training-data] stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/training-data/export.jsonl
// Streams a .jsonl file ready for Hugging Face / axolotl / vLLM training
router.get('/export.jsonl', v2Auth.admin, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="torna-idioma-isabel-v1.jsonl"');

    const write = (obj) => res.write(JSON.stringify(obj) + '\n');

    // Corpus 1: Cognate pairs as Q&A
    const [cognates] = await sequelize.query(
      `SELECT word_es, word_tl, category, etymology_note FROM ti_v2_cognates ORDER BY category, id`
    );
    for (const c of cognates) {
      write({
        messages: [
          { role: 'system', content: ISABEL_SYSTEM_SEED },
          {
            role: 'user',
            content: `What is the Tagalog word that comes from the Spanish word "${c.word_es}"?`
          },
          {
            role: 'assistant',
            content: `¡Ay, mi apo! La palabra "${c.word_es}" → (${c.category}) in Tagalog is "${c.word_tl}". ${c.etymology_note || 'This is one of the 4,000+ Spanish loan words in Filipino.'} You already know more Spanish than you think!`
          }
        ],
        metadata: { source: 'cognate', category: c.category }
      });

      // Reverse direction: Tagalog -> Spanish
      write({
        messages: [
          { role: 'system', content: ISABEL_SYSTEM_SEED },
          {
            role: 'user',
            content: `Professor, is "${c.word_tl}" a Spanish loanword in Tagalog?`
          },
          {
            role: 'assistant',
            content: `¡Oo nga, hijo! "${c.word_tl}" comes from the Spanish "${c.word_es}". ${c.etymology_note ? c.etymology_note + ' ' : ''}This is part of our Hispanic heritage — tu herencia.`
          }
        ],
        metadata: { source: 'cognate_reverse', category: c.category }
      });
    }

    // Corpus 2: UVEG lessons as teaching dialogues
    const [lessons] = await sequelize.query(
      `SELECT l.title_en, l.title_es, l.content_en, l.exercises, c.title_en AS course_title, c.level
       FROM ti_lessons l
       JOIN ti_courses c ON c.id = l.course_id
       WHERE c.is_published = true AND l.content_en IS NOT NULL
       ORDER BY c.sort_order, l.sort_order`
    );

    for (const lesson of lessons) {
      // Ask about lesson topic
      write({
        messages: [
          { role: 'system', content: ISABEL_SYSTEM_SEED },
          {
            role: 'user',
            content: `Can you teach me about: ${lesson.title_en}?`
          },
          {
            role: 'assistant',
            content: `¡Claro que sí, mi apo! Let me teach you about "${lesson.title_en}" → (${lesson.title_es}).\n\n${(lesson.content_en || '').slice(0, 1500)}\n\n¿Tienes alguna pregunta? (Do you have any questions?)`
          }
        ],
        metadata: { source: 'uveg_lesson', course: lesson.course_title, level: lesson.level }
      });

      // Exercise-style examples
      try {
        const exercises = typeof lesson.exercises === 'string' ? JSON.parse(lesson.exercises) : lesson.exercises || [];
        for (const ex of exercises.slice(0, 3)) {
          if (ex.type === 'multiple_choice' && ex.options && ex.answer != null) {
            write({
              messages: [
                { role: 'system', content: ISABEL_SYSTEM_SEED },
                { role: 'user', content: ex.q },
                {
                  role: 'assistant',
                  content: `¡Muy bien que preguntas, hijo! The correct answer is: "${ex.options[ex.answer]}". ${ex.explanation || 'Remember this for next time — lo vas a usar mucho.'}`
                }
              ],
              metadata: { source: 'exercise', type: 'multiple_choice', course: lesson.course_title }
            });
          } else if (ex.type === 'fill_blank' && ex.answer) {
            write({
              messages: [
                { role: 'system', content: ISABEL_SYSTEM_SEED },
                { role: 'user', content: `Fill in the blank: ${ex.q}` },
                {
                  role: 'assistant',
                  content: `¡Exacto! The answer is "${ex.answer}". ¿Lo escuchas cómo suena? Practice it out loud — en voz alta.`
                }
              ],
              metadata: { source: 'exercise', type: 'fill_blank', course: lesson.course_title }
            });
          }
        }
      } catch (_) {}
    }

    // Corpus 3: Real Isabel conversations (if any have been collected)
    const [conversations] = await sequelize.query(
      `SELECT learner_id, role, content, created_at
       FROM ti_v2_isabel_conversations
       WHERE content IS NOT NULL AND LENGTH(content) > 10
       ORDER BY learner_id, created_at
       LIMIT 2000`
    );

    // Group into turn pairs
    const byLearner = {};
    for (const c of conversations) {
      if (!byLearner[c.learner_id]) byLearner[c.learner_id] = [];
      byLearner[c.learner_id].push(c);
    }
    for (const turns of Object.values(byLearner)) {
      for (let i = 0; i < turns.length - 1; i++) {
        if (turns[i].role === 'user' && turns[i + 1].role === 'assistant') {
          write({
            messages: [
              { role: 'system', content: ISABEL_SYSTEM_SEED },
              { role: 'user', content: turns[i].content },
              { role: 'assistant', content: turns[i + 1].content }
            ],
            metadata: { source: 'real_conversation' }
          });
        }
      }
    }

    res.end();
  } catch (err) {
    console.error('[v2/training-data] export error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
