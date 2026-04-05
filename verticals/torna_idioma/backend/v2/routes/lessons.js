'use strict';

/**
 * v2 Lesson Player Routes — uses existing v1 UVEG curriculum
 *
 *   GET  /api/v2/lessons/next                  — next recommended lesson for learner
 *   GET  /api/v2/lessons/courses               — list all UVEG courses + progress
 *   GET  /api/v2/lessons/:id                   — lesson detail + exercises (parsed)
 *   POST /api/v2/lessons/:id/start             — create/resume session
 *   POST /api/v2/lessons/:id/answer            — submit exercise answer
 *   POST /api/v2/lessons/:id/complete          — finalize session, update CEFR
 *   GET  /api/v2/lessons/cefr/evaluate         — get CEFR recommendation
 *   POST /api/v2/lessons/cefr/apply            — apply level change
 */

const express = require('express');
const router = express.Router();
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');
const cefrEngine = require('../services/cefr-engine');
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

/**
 * UVEG lessons store exercises as a JSONB column (could be string or array).
 * Normalize to always return a parsed array.
 */
function parseExercises(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

// GET /api/v2/lessons/courses
router.get('/courses', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const [courses] = await sequelize.query(
      `SELECT c.id, c.title_en, c.title_es, c.title_fil, c.description_en, c.level, c.category,
              c.duration_hours, c.total_lessons, c.sort_order,
              COUNT(DISTINCT l.id)::int AS lesson_count,
              COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.lesson_id END)::int AS completed_count
       FROM ti_courses c
       LEFT JOIN ti_lessons l ON l.course_id = c.id
       LEFT JOIN ti_v2_lesson_sessions s ON s.lesson_id = l.id AND s.learner_id = $1
       WHERE c.is_published = true
       GROUP BY c.id
       ORDER BY c.sort_order, c.id`,
      { bind: [learnerId] }
    );
    res.json({ success: true, count: courses.length, courses });
  } catch (err) {
    console.error('[v2/lessons] courses error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/lessons/next
router.get('/next', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);

    // Find first lesson (by course sort_order, then lesson sort_order) that is
    // NOT yet completed by this learner
    const [[next]] = await sequelize.query(
      `SELECT l.id, l.course_id, l.title_en, l.title_es, l.title_fil, l.lesson_type,
              l.duration_minutes, c.title_en AS course_title, c.level,
              COALESCE(s.status, 'not_started') AS session_status
       FROM ti_lessons l
       JOIN ti_courses c ON c.id = l.course_id
       LEFT JOIN ti_v2_lesson_sessions s ON s.lesson_id = l.id AND s.learner_id = $1
       WHERE c.is_published = true AND (s.status IS NULL OR s.status != 'completed')
       ORDER BY c.sort_order, l.sort_order
       LIMIT 1`,
      { bind: [learnerId] }
    );

    if (!next) {
      return res.json({ success: true, all_complete: true, lesson: null });
    }

    res.json({ success: true, lesson: next });
  } catch (err) {
    console.error('[v2/lessons] next error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/lessons/cefr/evaluate
router.get('/cefr/evaluate', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const evaluation = await cefrEngine.evaluate(learnerId);
    res.json({ success: true, ...evaluation });
  } catch (err) {
    console.error('[v2/lessons] cefr evaluate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/lessons/cefr/apply  { level }
router.post('/cefr/apply', v2Auth.learner, async (req, res) => {
  try {
    const { level } = req.body;
    if (!level) return res.status(400).json({ error: 'level required' });
    const learnerId = await getLearnerId(req.user.id);
    const applied = await cefrEngine.applyLevelChange(learnerId, level);
    res.json({ success: true, applied_level: applied });
  } catch (err) {
    console.error('[v2/lessons] cefr apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/lessons/:id
router.get('/:id', v2Auth.learner, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    if (!lessonId) return res.status(400).json({ error: 'invalid lesson id' });
    const learnerId = await getLearnerId(req.user.id);

    const [[lesson]] = await sequelize.query(
      `SELECT l.*, c.title_en AS course_title, c.level, c.category
       FROM ti_lessons l
       JOIN ti_courses c ON c.id = l.course_id
       WHERE l.id = $1`,
      { bind: [lessonId] }
    );
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const exercises = parseExercises(lesson.exercises);

    // Include prior session state if exists
    const [[session]] = await sequelize.query(
      `SELECT id, status, score, exercises_completed, exercises_total, time_spent_sec, completed_at
       FROM ti_v2_lesson_sessions
       WHERE learner_id = $1 AND lesson_id = $2`,
      { bind: [learnerId, lessonId] }
    );

    res.json({
      success: true,
      lesson: {
        id: lesson.id,
        course_id: lesson.course_id,
        course_title: lesson.course_title,
        level: lesson.level,
        category: lesson.category,
        title_en: lesson.title_en,
        title_es: lesson.title_es,
        title_fil: lesson.title_fil,
        content_en: lesson.content_en,
        content_es: lesson.content_es,
        content_fil: lesson.content_fil,
        lesson_type: lesson.lesson_type,
        duration_minutes: lesson.duration_minutes,
        exercises,
        exercise_count: exercises.length
      },
      session: session || null
    });
  } catch (err) {
    console.error('[v2/lessons] detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/lessons/:id/start
router.post('/:id/start', v2Auth.learner, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const learnerId = await getLearnerId(req.user.id);

    const [[lesson]] = await sequelize.query(
      `SELECT l.id, l.course_id, l.exercises FROM ti_lessons l WHERE l.id = $1`,
      { bind: [lessonId] }
    );
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const exercises = parseExercises(lesson.exercises);

    // Get current CEFR level for difficulty tracking
    const [[learner]] = await sequelize.query(
      `SELECT cefr_level FROM ti_v2_learners WHERE id = $1`,
      { bind: [learnerId] }
    );

    // Upsert session
    const [result] = await sequelize.query(
      `INSERT INTO ti_v2_lesson_sessions
       (learner_id, lesson_id, course_id, status, exercises_total, difficulty_level, started_at)
       VALUES ($1, $2, $3, 'in_progress', $4, $5, NOW())
       ON CONFLICT (learner_id, lesson_id) DO UPDATE SET
         status = CASE WHEN ti_v2_lesson_sessions.status = 'completed'
                       THEN ti_v2_lesson_sessions.status
                       ELSE 'in_progress' END,
         exercises_total = EXCLUDED.exercises_total,
         started_at = CASE WHEN ti_v2_lesson_sessions.status = 'completed'
                            THEN ti_v2_lesson_sessions.started_at
                            ELSE NOW() END
       RETURNING *`,
      {
        bind: [
          learnerId,
          lessonId,
          lesson.course_id,
          exercises.length,
          learner?.cefr_level || 'A1'
        ]
      }
    );

    // Log behavior event
    try {
      await sequelize.query(
        `INSERT INTO ti_v2_behavior_events (learner_id, event_type, payload, created_at)
         VALUES ($1, 'lesson_started', $2::jsonb, NOW())`,
        { bind: [learnerId, JSON.stringify({ lesson_id: lessonId, course_id: lesson.course_id })] }
      );
    } catch (_) {}

    res.json({ success: true, session: result[0] });
  } catch (err) {
    console.error('[v2/lessons] start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/lessons/:id/answer  { exercise_index, learner_answer, time_ms }
router.post('/:id/answer', v2Auth.learner, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const { exercise_index, learner_answer, time_ms } = req.body;
    if (exercise_index == null || learner_answer == null) {
      return res.status(400).json({ error: 'exercise_index and learner_answer required' });
    }

    const learnerId = await getLearnerId(req.user.id);

    // Find session
    const [[session]] = await sequelize.query(
      `SELECT id, exercises_completed, exercises_total FROM ti_v2_lesson_sessions
       WHERE learner_id = $1 AND lesson_id = $2`,
      { bind: [learnerId, lessonId] }
    );
    if (!session) return res.status(400).json({ error: 'Session not started. Call /start first.' });

    // Load exercises from lesson
    const [[lesson]] = await sequelize.query(
      `SELECT exercises FROM ti_lessons WHERE id = $1`,
      { bind: [lessonId] }
    );
    const exercises = parseExercises(lesson.exercises);
    const exercise = exercises[exercise_index];
    if (!exercise) return res.status(400).json({ error: 'Invalid exercise_index' });

    // Check correctness
    let isCorrect = false;
    let correctAnswer = '';
    if (exercise.type === 'multiple_choice') {
      correctAnswer = String(exercise.answer);
      isCorrect = String(learner_answer) === correctAnswer;
    } else if (exercise.type === 'fill_blank') {
      correctAnswer = String(exercise.answer || '').trim().toLowerCase();
      isCorrect = String(learner_answer).trim().toLowerCase() === correctAnswer;
    } else {
      // Other types (speaking/listening): accept as correct for now
      correctAnswer = String(exercise.answer || '');
      isCorrect = true;
    }

    // Log attempt
    await sequelize.query(
      `INSERT INTO ti_v2_exercise_attempts
       (session_id, learner_id, exercise_index, exercise_type, prompt, learner_answer, correct_answer, is_correct, time_ms, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      {
        bind: [
          session.id,
          learnerId,
          exercise_index,
          exercise.type || 'unknown',
          exercise.q || null,
          String(learner_answer).slice(0, 500),
          correctAnswer,
          isCorrect,
          time_ms || null
        ]
      }
    );

    // Update exercises_completed counter (idempotent: count distinct indexes)
    await sequelize.query(
      `UPDATE ti_v2_lesson_sessions
       SET exercises_completed = (
         SELECT COUNT(DISTINCT exercise_index)::int FROM ti_v2_exercise_attempts WHERE session_id = $1
       )
       WHERE id = $1`,
      { bind: [session.id] }
    );

    // Log behavior event
    try {
      await sequelize.query(
        `INSERT INTO ti_v2_behavior_events (learner_id, event_type, payload, created_at)
         VALUES ($1, $2, $3::jsonb, NOW())`,
        {
          bind: [
            learnerId,
            isCorrect ? 'exercise_started' : 'exercise_retried',
            JSON.stringify({ lesson_id: lessonId, exercise_index, is_correct: isCorrect })
          ]
        }
      );
    } catch (_) {}

    // Determine next exercise
    const nextIndex = exercise_index + 1;
    const isFinal = nextIndex >= session.exercises_total;
    const nextExercise = exercises[nextIndex] || null;

    res.json({
      success: true,
      is_correct: isCorrect,
      correct_answer: correctAnswer,
      feedback: isCorrect ? '¡Muy bien!' : 'Inténtalo de nuevo la próxima vez.',
      next_exercise_index: isFinal ? null : nextIndex,
      next_exercise: nextExercise,
      is_final: isFinal,
      exercises_remaining: Math.max(0, session.exercises_total - nextIndex)
    });
  } catch (err) {
    console.error('[v2/lessons] answer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/lessons/:id/complete  { time_spent_sec? }
router.post('/:id/complete', v2Auth.learner, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const { time_spent_sec } = req.body;
    const learnerId = await getLearnerId(req.user.id);

    // Find session
    const [[session]] = await sequelize.query(
      `SELECT s.id, s.exercises_total, s.status, s.course_id
       FROM ti_v2_lesson_sessions s
       WHERE s.learner_id = $1 AND s.lesson_id = $2`,
      { bind: [learnerId, lessonId] }
    );
    if (!session) return res.status(400).json({ error: 'Session not started' });
    if (session.status === 'completed') {
      return res.json({ success: true, already_complete: true });
    }

    // Score from attempts (latest attempt per exercise_index counts)
    const [[scoring]] = await sequelize.query(
      `SELECT
         COUNT(DISTINCT exercise_index)::int AS attempted,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct_total,
         COUNT(*)::int AS total_attempts
       FROM ti_v2_exercise_attempts
       WHERE session_id = $1`,
      { bind: [session.id] }
    );

    // Correct-per-exercise calc: latest attempt per index
    const [correctLatest] = await sequelize.query(
      `SELECT exercise_index, is_correct
       FROM (
         SELECT exercise_index, is_correct,
                ROW_NUMBER() OVER (PARTITION BY exercise_index ORDER BY attempted_at DESC) AS rn
         FROM ti_v2_exercise_attempts
         WHERE session_id = $1
       ) t WHERE rn = 1`,
      { bind: [session.id] }
    );
    const correctCount = correctLatest.filter((r) => r.is_correct).length;
    const total = session.exercises_total || correctLatest.length || 1;
    const score = Math.round((correctCount / total) * 100);

    await sequelize.query(
      `UPDATE ti_v2_lesson_sessions
       SET status = 'completed', score = $1, completed_at = NOW(), time_spent_sec = COALESCE($2, time_spent_sec)
       WHERE id = $3`,
      { bind: [score, time_spent_sec || null, session.id] }
    );

    // Award XP
    let gamificationResult = null;
    try {
      const eventType = score === 100 ? 'lesson_perfect' : 'lesson_complete';
      const baseXp = 25;
      const perfectBonus = score === 100 ? 10 : 0;
      gamificationResult = await gamification.recordActivity(
        learnerId,
        'lesson_complete',
        baseXp + perfectBonus,
        { lesson_id: lessonId, score, perfect: score === 100 }
      );
    } catch (e) {
      console.warn('[v2/lessons] gamification failed:', e.message);
    }

    // Log behavior event
    try {
      await sequelize.query(
        `INSERT INTO ti_v2_behavior_events (learner_id, event_type, payload, engagement_score, created_at)
         VALUES ($1, 'lesson_completed', $2::jsonb, $3, NOW())`,
        { bind: [learnerId, JSON.stringify({ lesson_id: lessonId, score }), score] }
      );
    } catch (_) {}

    // Run CEFR evaluation
    const cefrResult = await cefrEngine.evaluate(learnerId);

    res.json({
      success: true,
      session_id: session.id,
      score,
      correct_count: correctCount,
      total,
      cefr: cefrResult,
      gamification: gamificationResult
    });
  } catch (err) {
    console.error('[v2/lessons] complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
