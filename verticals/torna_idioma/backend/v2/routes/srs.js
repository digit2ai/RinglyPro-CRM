'use strict';

/**
 * v2 SRS Routes — Spaced Repetition System
 *
 * Auth: all routes require learner JWT. Cards are scoped to the
 * learner's ti_v2_learners.id (not ti_users.id).
 *
 *   GET   /api/v2/srs/queue              — due cards for today (+ overdue)
 *   GET   /api/v2/srs/stats              — deck summary (total, due, mastered, new)
 *   GET   /api/v2/srs/cards              — all cards (paginated)
 *   POST  /api/v2/srs/cards              — add new card to deck
 *   POST  /api/v2/srs/cards/from-cognate — add card from cognate database
 *   POST  /api/v2/srs/review             — submit review quality (SM-2)
 *   DELETE /api/v2/srs/cards/:id         — remove card
 */

const express = require('express');
const router = express.Router();
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');
const srsEngine = require('../services/srs-engine');

// Helper — fetch or create learner record for current JWT user
async function getLearnerId(userId) {
  const [rows] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  if (rows.length > 0) return rows[0].id;

  // Lazy create (mirrors learner.js logic)
  await sequelize.query(
    `INSERT INTO ti_v2_learners (user_id, created_at, updated_at)
     VALUES ($1, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
    { bind: [userId] }
  );
  const [created] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  return created[0].id;
}

// GET /api/v2/srs/queue?limit=20
router.get('/queue', v2Auth.learner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const learnerId = await getLearnerId(req.user.id);
    const [cards] = await sequelize.query(
      `SELECT id, word_es, word_tl_cognate, translation_en, example_sentence, audio_url,
              ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at,
              total_reviews, source, source_cognate_id
       FROM ti_v2_vocabulary_cards
       WHERE learner_id = $1 AND next_review_at <= NOW()
       ORDER BY next_review_at ASC
       LIMIT $2`,
      { bind: [learnerId, limit] }
    );
    res.json({ success: true, count: cards.length, cards });
  } catch (err) {
    console.error('[v2/srs] queue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/srs/stats
router.get('/stats', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const [[s]] = await sequelize.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE next_review_at <= NOW())::int AS due,
         COUNT(*) FILTER (WHERE repetitions = 0)::int AS new_cards,
         COUNT(*) FILTER (WHERE repetitions >= 5 AND interval_days >= 21)::int AS mastered,
         COALESCE(SUM(total_reviews), 0)::int AS total_reviews,
         COALESCE(AVG(ease_factor), 2.5)::numeric(4,2) AS avg_ease
       FROM ti_v2_vocabulary_cards
       WHERE learner_id = $1`,
      { bind: [learnerId] }
    );
    res.json({ success: true, stats: s });
  } catch (err) {
    console.error('[v2/srs] stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/srs/cards?limit=50&offset=0
router.get('/cards', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const [cards] = await sequelize.query(
      `SELECT id, word_es, word_tl_cognate, translation_en, ease_factor, interval_days,
              repetitions, next_review_at, last_reviewed_at, total_reviews, source, created_at
       FROM ti_v2_vocabulary_cards
       WHERE learner_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      { bind: [learnerId, limit, offset] }
    );
    res.json({ success: true, count: cards.length, cards });
  } catch (err) {
    console.error('[v2/srs] cards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/srs/cards  { word_es, word_tl_cognate?, translation_en?, example_sentence?, audio_url? }
router.post('/cards', v2Auth.learner, async (req, res) => {
  try {
    const { word_es, word_tl_cognate, translation_en, example_sentence, audio_url } = req.body;
    if (!word_es || typeof word_es !== 'string') {
      return res.status(400).json({ error: 'word_es is required' });
    }
    const learnerId = await getLearnerId(req.user.id);
    const [result] = await sequelize.query(
      `INSERT INTO ti_v2_vocabulary_cards
       (learner_id, word_es, word_tl_cognate, translation_en, example_sentence, audio_url, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual', NOW(), NOW())
       ON CONFLICT (learner_id, word_es) DO UPDATE SET
         word_tl_cognate = COALESCE(EXCLUDED.word_tl_cognate, ti_v2_vocabulary_cards.word_tl_cognate),
         translation_en = COALESCE(EXCLUDED.translation_en, ti_v2_vocabulary_cards.translation_en),
         updated_at = NOW()
       RETURNING *`,
      {
        bind: [
          learnerId,
          word_es.trim(),
          word_tl_cognate || null,
          translation_en || null,
          example_sentence || null,
          audio_url || null
        ]
      }
    );
    res.status(201).json({ success: true, card: result[0] });
  } catch (err) {
    console.error('[v2/srs] add card error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/srs/cards/from-cognate  { cognate_id }
router.post('/cards/from-cognate', v2Auth.learner, async (req, res) => {
  try {
    const { cognate_id } = req.body;
    if (!cognate_id) return res.status(400).json({ error: 'cognate_id required' });

    const [[cognate]] = await sequelize.query(
      `SELECT id, word_es, word_tl, category, etymology_note FROM ti_v2_cognates WHERE id = $1`,
      { bind: [cognate_id] }
    );
    if (!cognate) return res.status(404).json({ error: 'Cognate not found' });

    const learnerId = await getLearnerId(req.user.id);
    const [result] = await sequelize.query(
      `INSERT INTO ti_v2_vocabulary_cards
       (learner_id, word_es, word_tl_cognate, translation_en, example_sentence, source, source_cognate_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'cognate', $6, NOW(), NOW())
       ON CONFLICT (learner_id, word_es) DO UPDATE SET
         word_tl_cognate = EXCLUDED.word_tl_cognate,
         source = 'cognate',
         source_cognate_id = EXCLUDED.source_cognate_id,
         updated_at = NOW()
       RETURNING *`,
      {
        bind: [
          learnerId,
          cognate.word_es,
          cognate.word_tl,
          null,
          cognate.etymology_note,
          cognate.id
        ]
      }
    );
    res.status(201).json({ success: true, card: result[0] });
  } catch (err) {
    console.error('[v2/srs] from-cognate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/srs/review  { card_id, quality, time_taken_ms? }
router.post('/review', v2Auth.learner, async (req, res) => {
  try {
    const { card_id, quality, time_taken_ms } = req.body;
    if (card_id == null || quality == null) {
      return res.status(400).json({ error: 'card_id and quality required' });
    }
    const q = Math.max(0, Math.min(5, Math.round(Number(quality))));

    const learnerId = await getLearnerId(req.user.id);

    // Fetch the card (and verify ownership)
    const [[card]] = await sequelize.query(
      `SELECT id, ease_factor, interval_days, repetitions, lapses
       FROM ti_v2_vocabulary_cards
       WHERE id = $1 AND learner_id = $2`,
      { bind: [card_id, learnerId] }
    );
    if (!card) return res.status(404).json({ error: 'Card not found or not owned by learner' });

    const next = srsEngine.calculateNextReview(card, q);

    // Update card
    const [updated] = await sequelize.query(
      `UPDATE ti_v2_vocabulary_cards
       SET ease_factor = $1,
           interval_days = $2,
           repetitions = $3,
           next_review_at = $4,
           last_reviewed_at = NOW(),
           total_reviews = total_reviews + 1,
           lapses = lapses + $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      {
        bind: [
          next.ease_factor,
          next.interval_days,
          next.repetitions,
          next.next_review_at,
          next.is_lapse ? 1 : 0,
          card_id
        ]
      }
    );

    // Log the review
    await sequelize.query(
      `INSERT INTO ti_v2_reviews
       (card_id, learner_id, quality, prev_ease, prev_interval, new_ease, new_interval, time_taken_ms, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      {
        bind: [
          card_id,
          learnerId,
          q,
          card.ease_factor,
          card.interval_days,
          next.ease_factor,
          next.interval_days,
          time_taken_ms || null
        ]
      }
    );

    res.json({
      success: true,
      card: updated[0],
      quality: q,
      quality_label: srsEngine.qualityLabel(q),
      is_lapse: next.is_lapse
    });
  } catch (err) {
    console.error('[v2/srs] review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v2/srs/cards/:id
router.delete('/cards/:id', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const cardId = parseInt(req.params.id, 10);
    const [result] = await sequelize.query(
      `DELETE FROM ti_v2_vocabulary_cards WHERE id = $1 AND learner_id = $2 RETURNING id`,
      { bind: [cardId, learnerId] }
    );
    if (result.length === 0) return res.status(404).json({ error: 'Card not found' });
    res.json({ success: true, deleted: result[0].id });
  } catch (err) {
    console.error('[v2/srs] delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
