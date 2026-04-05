'use strict';

/**
 * v2 Human Tutor Marketplace Routes
 *
 * Public (no auth):
 *   GET  /api/v2/tutor-market/status         — configuration check
 *   GET  /api/v2/tutor-market/tutors         — list approved tutors
 *   GET  /api/v2/tutor-market/tutors/:id     — tutor detail + availability
 *
 * Learner (authed):
 *   POST /api/v2/tutor-market/bookings                 — create booking + payment intent
 *   GET  /api/v2/tutor-market/bookings/my              — learner's bookings
 *   GET  /api/v2/tutor-market/bookings/:id             — booking detail + room info
 *   GET  /api/v2/tutor-market/bookings/:id/copilot     — AI co-pilot data for tutor
 *   POST /api/v2/tutor-market/bookings/:id/confirm     — mark as confirmed (demo mode auto-confirms)
 *   POST /api/v2/tutor-market/bookings/:id/start       — mark as in_progress
 *   POST /api/v2/tutor-market/bookings/:id/end         — mark as completed
 *   POST /api/v2/tutor-market/bookings/:id/review      — post-session rating
 *
 * Tutor application:
 *   POST /api/v2/tutor-market/tutors/apply             — submit tutor application
 */

const express = require('express');
const router = express.Router();
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');
const market = require('../services/tutor-market');
const gamification = require('../services/gamification');

async function getLearnerId(userId) {
  const [rows] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  if (rows.length > 0) return rows[0].id;
  await sequelize.query(
    `INSERT INTO ti_v2_learners (user_id, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
    { bind: [userId] }
  );
  const [created] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  return created[0].id;
}

// GET /api/v2/tutor-market/status
router.get('/status', (req, res) => {
  res.json({ success: true, ...market.isConfigured() });
});

// GET /api/v2/tutor-market/tutors?specialty=bpo
router.get('/tutors', async (req, res) => {
  try {
    const { specialty, accent } = req.query;
    let sql = `SELECT id, display_name, headline, bio, accent, native_language, languages_spoken,
                      specialties, certifications, years_experience, hourly_rate_usd,
                      rating_avg, rating_count, total_sessions, total_students,
                      timezone, photo_url, status
               FROM ti_v2_tutors WHERE status = 'approved'`;
    const binds = [];
    if (specialty) {
      binds.push(specialty);
      sql += ` AND specialties ? $${binds.length}`;
    }
    if (accent) {
      binds.push(accent);
      sql += ` AND accent = $${binds.length}`;
    }
    sql += ' ORDER BY rating_avg DESC, total_sessions DESC';

    const [tutors] = await sequelize.query(sql, { bind: binds });
    res.json({ success: true, count: tutors.length, tutors });
  } catch (err) {
    console.error('[v2/tutor-market] tutors error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/tutor-market/tutors/:id
router.get('/tutors/:id', async (req, res) => {
  try {
    const tutorId = parseInt(req.params.id, 10);
    const [[tutor]] = await sequelize.query(
      `SELECT * FROM ti_v2_tutors WHERE id = $1 AND status = 'approved'`,
      { bind: [tutorId] }
    );
    if (!tutor) return res.status(404).json({ error: 'Tutor not found' });

    // Hide sensitive fields
    delete tutor.stripe_connect_account_id;
    delete tutor.approved_by;

    const [availability] = await sequelize.query(
      `SELECT day_of_week, start_time, end_time FROM ti_v2_tutor_availability
       WHERE tutor_id = $1 AND active = true ORDER BY day_of_week, start_time`,
      { bind: [tutorId] }
    );

    const [recentReviews] = await sequelize.query(
      `SELECT r.rating, r.review_text, r.created_at, u.full_name AS learner_name
       FROM ti_v2_tutor_reviews r
       JOIN ti_v2_learners l ON l.id = r.learner_id
       JOIN ti_users u ON u.id = l.user_id
       WHERE r.tutor_id = $1
       ORDER BY r.created_at DESC LIMIT 10`,
      { bind: [tutorId] }
    );

    res.json({ success: true, tutor, availability, reviews: recentReviews });
  } catch (err) {
    console.error('[v2/tutor-market] tutor detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/tutor-market/tutors/apply
router.post('/tutors/apply', v2Auth.any, async (req, res) => {
  try {
    const {
      display_name, headline, bio, accent, native_language,
      languages_spoken, specialties, certifications, years_experience,
      hourly_rate_usd, timezone
    } = req.body;

    if (!display_name || !bio || !hourly_rate_usd) {
      return res.status(400).json({ error: 'display_name, bio, hourly_rate_usd required' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO ti_v2_tutors
       (user_id, display_name, headline, bio, accent, native_language, languages_spoken,
        specialties, certifications, years_experience, hourly_rate_usd, timezone, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, 'pending', NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         headline = EXCLUDED.headline,
         bio = EXCLUDED.bio,
         accent = EXCLUDED.accent,
         updated_at = NOW()
       RETURNING *`,
      {
        bind: [
          req.user.id,
          display_name,
          headline || null,
          bio,
          accent || 'latin_american',
          native_language || null,
          JSON.stringify(languages_spoken || []),
          JSON.stringify(specialties || []),
          JSON.stringify(certifications || []),
          years_experience || 0,
          hourly_rate_usd,
          timezone || 'UTC'
        ]
      }
    );

    res.status(201).json({ success: true, tutor: result[0], message: 'Application submitted — awaiting admin approval' });
  } catch (err) {
    console.error('[v2/tutor-market] apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/tutor-market/bookings
router.post('/bookings', v2Auth.learner, async (req, res) => {
  try {
    const { tutor_id, scheduled_at, duration_minutes, notes } = req.body;
    if (!tutor_id || !scheduled_at) {
      return res.status(400).json({ error: 'tutor_id and scheduled_at required' });
    }

    const duration = parseInt(duration_minutes, 10) || 30;

    const [[tutor]] = await sequelize.query(
      `SELECT id, hourly_rate_usd, display_name FROM ti_v2_tutors WHERE id = $1 AND status = 'approved'`,
      { bind: [tutor_id] }
    );
    if (!tutor) return res.status(404).json({ error: 'Tutor not found or not approved' });

    const priceUsd = Math.round((Number(tutor.hourly_rate_usd) * duration / 60) * 100) / 100;
    const { price, fee, payout } = market.splitPrice(priceUsd);
    const roomId = market.generateRoomId();

    const learnerId = await getLearnerId(req.user.id);

    // Create Stripe payment intent (or stub)
    const intent = await market.createPaymentIntent(priceUsd, {
      tutor_id,
      learner_id: learnerId,
      duration_minutes: duration
    });

    // Demo mode auto-confirms bookings when Stripe is not configured
    const initialStatus = intent.mode === 'live' ? 'pending_payment' : 'confirmed';

    const [result] = await sequelize.query(
      `INSERT INTO ti_v2_tutor_bookings
       (learner_id, tutor_id, scheduled_at, duration_minutes, price_usd, platform_fee_usd,
        tutor_payout_usd, status, stripe_payment_intent_id, room_id, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      {
        bind: [
          learnerId,
          tutor_id,
          scheduled_at,
          duration,
          price,
          fee,
          payout,
          initialStatus,
          intent.id,
          roomId,
          notes || null
        ]
      }
    );

    res.status(201).json({
      success: true,
      booking: result[0],
      payment: {
        payment_intent_id: intent.id,
        client_secret: intent.client_secret,
        mode: intent.mode,
        amount_usd: price,
        platform_fee_usd: fee,
        tutor_payout_usd: payout
      },
      room_url: `https://${market.JITSI_DOMAIN}/${roomId}`
    });
  } catch (err) {
    console.error('[v2/tutor-market] booking error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/tutor-market/bookings/my
router.get('/bookings/my', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const [rows] = await sequelize.query(
      `SELECT b.*, t.display_name AS tutor_name, t.photo_url AS tutor_photo,
              t.accent AS tutor_accent
       FROM ti_v2_tutor_bookings b
       JOIN ti_v2_tutors t ON t.id = b.tutor_id
       WHERE b.learner_id = $1
       ORDER BY b.scheduled_at DESC`,
      { bind: [learnerId] }
    );
    res.json({ success: true, count: rows.length, bookings: rows });
  } catch (err) {
    console.error('[v2/tutor-market] my bookings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/tutor-market/bookings/:id
router.get('/bookings/:id', v2Auth.learner, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const learnerId = await getLearnerId(req.user.id);
    const [[booking]] = await sequelize.query(
      `SELECT b.*, t.display_name AS tutor_name, t.bio AS tutor_bio,
              t.accent AS tutor_accent, t.photo_url AS tutor_photo
       FROM ti_v2_tutor_bookings b
       JOIN ti_v2_tutors t ON t.id = b.tutor_id
       WHERE b.id = $1 AND b.learner_id = $2`,
      { bind: [bookingId, learnerId] }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    res.json({
      success: true,
      booking,
      room_url: `https://${market.JITSI_DOMAIN}/${booking.room_id}`,
      jitsi_domain: market.JITSI_DOMAIN
    });
  } catch (err) {
    console.error('[v2/tutor-market] booking detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/tutor-market/bookings/:id/copilot
// AI co-pilot panel for tutors during live sessions — shows learner context
router.get('/bookings/:id/copilot', v2Auth.learner, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);

    const [[booking]] = await sequelize.query(
      `SELECT learner_id, tutor_id, scheduled_at, duration_minutes
       FROM ti_v2_tutor_bookings WHERE id = $1`,
      { bind: [bookingId] }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const learnerId = booking.learner_id;

    // Learner profile
    const [[learner]] = await sequelize.query(
      `SELECT l.cefr_level, l.total_xp, l.native_language, l.target_dialect,
              u.full_name, u.email
       FROM ti_v2_learners l JOIN ti_users u ON u.id = l.user_id
       WHERE l.id = $1`,
      { bind: [learnerId] }
    );

    // Recent SRS reviews (what words they've been practicing)
    const [recentVocab] = await sequelize.query(
      `SELECT word_es, word_tl_cognate, ease_factor, repetitions, lapses
       FROM ti_v2_vocabulary_cards
       WHERE learner_id = $1
       ORDER BY last_reviewed_at DESC NULLS LAST LIMIT 15`,
      { bind: [learnerId] }
    );

    // Vocabulary struggles (cards with low ease factor or high lapses)
    const [struggles] = await sequelize.query(
      `SELECT word_es, word_tl_cognate, ease_factor, lapses
       FROM ti_v2_vocabulary_cards
       WHERE learner_id = $1 AND (ease_factor < 2.0 OR lapses >= 2)
       ORDER BY lapses DESC, ease_factor ASC LIMIT 10`,
      { bind: [learnerId] }
    );

    // Recent completed lessons
    const [recentLessons] = await sequelize.query(
      `SELECT s.score, s.completed_at, l.title_en, c.title_en AS course_title
       FROM ti_v2_lesson_sessions s
       JOIN ti_lessons l ON l.id = s.lesson_id
       JOIN ti_courses c ON c.id = l.course_id
       WHERE s.learner_id = $1 AND s.status = 'completed'
       ORDER BY s.completed_at DESC LIMIT 5`,
      { bind: [learnerId] }
    );

    // Engagement score (last 60 min)
    let engagement = null;
    try {
      const behaviorService = require('../services/behavior-score');
      engagement = await behaviorService.computeEngagementScore(learnerId, 60);
    } catch (_) {}

    // Suggested exercises for this session based on struggles
    const suggestions = struggles.slice(0, 5).map((s) => ({
      word_es: s.word_es,
      word_tl: s.word_tl_cognate,
      reason: s.lapses >= 2 ? `Failed ${s.lapses} times` : `Low ease factor (${s.ease_factor})`
    }));

    res.json({
      success: true,
      learner,
      recent_vocabulary: recentVocab,
      struggles,
      recent_lessons: recentLessons,
      engagement,
      suggested_focus: suggestions,
      copilot_notes: [
        `Learner CEFR level: ${learner?.cefr_level || 'A1'} — adjust complexity accordingly`,
        struggles.length > 0
          ? `Top struggle: "${struggles[0].word_es}" — ${struggles[0].lapses} lapses`
          : 'No major vocabulary struggles detected',
        recentLessons.length > 0
          ? `Last lesson: "${recentLessons[0].title_en}" — ${recentLessons[0].score}%`
          : 'No completed lessons yet',
        `Speaks ${learner?.native_language || 'tagalog'} natively — use cognates to build bridges`
      ]
    });
  } catch (err) {
    console.error('[v2/tutor-market] copilot error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/tutor-market/bookings/:id/confirm
router.post('/bookings/:id/confirm', v2Auth.learner, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const learnerId = await getLearnerId(req.user.id);

    const [result] = await sequelize.query(
      `UPDATE ti_v2_tutor_bookings
       SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1 AND learner_id = $2 AND status = 'pending_payment'
       RETURNING *`,
      { bind: [bookingId, learnerId] }
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Booking not found or already confirmed' });
    }
    res.json({ success: true, booking: result[0] });
  } catch (err) {
    console.error('[v2/tutor-market] confirm error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/tutor-market/bookings/:id/start
router.post('/bookings/:id/start', v2Auth.learner, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const learnerId = await getLearnerId(req.user.id);
    const [result] = await sequelize.query(
      `UPDATE ti_v2_tutor_bookings
       SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND learner_id = $2 AND status IN ('confirmed', 'in_progress')
       RETURNING *`,
      { bind: [bookingId, learnerId] }
    );
    if (result.length === 0) return res.status(404).json({ error: 'Booking not found' });
    res.json({ success: true, booking: result[0] });
  } catch (err) {
    console.error('[v2/tutor-market] start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/tutor-market/bookings/:id/end
router.post('/bookings/:id/end', v2Auth.learner, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const learnerId = await getLearnerId(req.user.id);
    const [result] = await sequelize.query(
      `UPDATE ti_v2_tutor_bookings
       SET status = 'completed', ended_at = NOW(), updated_at = NOW(),
           actual_duration_minutes = CASE
             WHEN started_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (NOW() - started_at))::int / 60
             ELSE duration_minutes END
       WHERE id = $1 AND learner_id = $2 AND status IN ('in_progress', 'confirmed')
       RETURNING *`,
      { bind: [bookingId, learnerId] }
    );
    if (result.length === 0) return res.status(404).json({ error: 'Booking not found' });

    // Bump tutor session counter
    await sequelize.query(
      `UPDATE ti_v2_tutors SET total_sessions = total_sessions + 1, updated_at = NOW() WHERE id = $1`,
      { bind: [result[0].tutor_id] }
    );

    res.json({ success: true, booking: result[0] });
  } catch (err) {
    console.error('[v2/tutor-market] end error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/tutor-market/bookings/:id/review  { rating, review_text }
router.post('/bookings/:id/review', v2Auth.learner, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const { rating, review_text } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be 1-5' });
    }

    const learnerId = await getLearnerId(req.user.id);
    const [[booking]] = await sequelize.query(
      `SELECT id, tutor_id, status FROM ti_v2_tutor_bookings
       WHERE id = $1 AND learner_id = $2`,
      { bind: [bookingId, learnerId] }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'Can only review completed sessions' });
    }

    const [result] = await sequelize.query(
      `INSERT INTO ti_v2_tutor_reviews
       (booking_id, tutor_id, learner_id, rating, review_text, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (booking_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         review_text = EXCLUDED.review_text,
         created_at = NOW()
       RETURNING *`,
      { bind: [bookingId, booking.tutor_id, learnerId, rating, review_text || null] }
    );

    // Recompute tutor aggregate rating
    await market.updateTutorRating(booking.tutor_id);

    res.json({ success: true, review: result[0] });
  } catch (err) {
    console.error('[v2/tutor-market] review error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
