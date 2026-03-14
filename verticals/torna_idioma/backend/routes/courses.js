const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.ti');
const auth = require('../middleware/auth.ti');

// List published courses
router.get('/', async (req, res) => {
  try {
    const [courses] = await sequelize.query(
      `SELECT c.*, u.full_name as creator_name,
        (SELECT COUNT(*) FROM ti_enrollments WHERE course_id = c.id) as enrollment_count
       FROM ti_courses c LEFT JOIN ti_users u ON c.created_by = u.id
       WHERE c.is_published = true ORDER BY c.sort_order, c.created_at DESC`
    );
    res.json({ success: true, courses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get course details with lessons
router.get('/:id', async (req, res) => {
  try {
    const [[course]] = await sequelize.query(
      `SELECT c.*, u.full_name as creator_name FROM ti_courses c LEFT JOIN ti_users u ON c.created_by = u.id WHERE c.id = $1`,
      { bind: [req.params.id] }
    );
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const [lessons] = await sequelize.query(
      `SELECT id, title_en, title_es, title_fil, lesson_type, sort_order, duration_minutes FROM ti_lessons WHERE course_id = $1 ORDER BY sort_order`,
      { bind: [req.params.id] }
    );
    course.lessons = lessons;
    res.json({ success: true, course });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create course (admin/teacher)
router.post('/', auth.teacher, async (req, res) => {
  try {
    const { title_en, title_es, title_fil, description_en, description_es, description_fil, level, category, duration_hours } = req.body;
    if (!title_en) return res.status(400).json({ error: 'title_en required' });
    const [[course]] = await sequelize.query(
      `INSERT INTO ti_courses (title_en, title_es, title_fil, description_en, description_es, description_fil, level, category, duration_hours, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()) RETURNING *`,
      { bind: [title_en, title_es||null, title_fil||null, description_en||null, description_es||null, description_fil||null, level||'beginner', category||'general', duration_hours||0, req.user.id] }
    );
    res.status(201).json({ success: true, course });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Enroll in a course
router.post('/:id/enroll', auth.any, async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      `SELECT id FROM ti_enrollments WHERE user_id = $1 AND course_id = $2`,
      { bind: [req.user.id, req.params.id] }
    );
    if (existing) return res.status(409).json({ error: 'Already enrolled' });
    const [[enrollment]] = await sequelize.query(
      `INSERT INTO ti_enrollments (user_id, course_id, status, enrolled_at) VALUES ($1,$2,'active',NOW()) RETURNING *`,
      { bind: [req.user.id, req.params.id] }
    );
    res.status(201).json({ success: true, enrollment });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get user's enrollments with progress
router.get('/my/enrollments', auth.any, async (req, res) => {
  try {
    const [enrollments] = await sequelize.query(
      `SELECT e.*, c.title_en, c.title_es, c.title_fil, c.level, c.category, c.total_lessons, c.thumbnail_url, c.duration_hours, c.description_en,
        (SELECT COUNT(*) FROM ti_lesson_progress lp JOIN ti_lessons l ON lp.lesson_id = l.id WHERE lp.user_id = e.user_id AND l.course_id = e.course_id AND lp.status = 'completed') as lessons_completed,
        (SELECT COALESCE(SUM(lp.time_spent_sec),0) FROM ti_lesson_progress lp JOIN ti_lessons l ON lp.lesson_id = l.id WHERE lp.user_id = e.user_id AND l.course_id = e.course_id) as total_time_sec
       FROM ti_enrollments e JOIN ti_courses c ON e.course_id = c.id
       WHERE e.user_id = $1 ORDER BY e.enrolled_at DESC`,
      { bind: [req.user.id] }
    );
    res.json({ success: true, enrollments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get lesson content
router.get('/lessons/:id', auth.any, async (req, res) => {
  try {
    const [[lesson]] = await sequelize.query(
      `SELECT l.*, c.title_en as course_title_en, c.title_es as course_title_es, c.title_fil as course_title_fil
       FROM ti_lessons l JOIN ti_courses c ON l.course_id = c.id WHERE l.id = $1`,
      { bind: [req.params.id] }
    );
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    // Get user progress for this lesson
    const [[progress]] = await sequelize.query(
      `SELECT * FROM ti_lesson_progress WHERE user_id = $1 AND lesson_id = $2`,
      { bind: [req.user.id, req.params.id] }
    );
    lesson.user_progress = progress || null;
    // Get all lessons in this course for navigation
    const [siblings] = await sequelize.query(
      `SELECT id, title_en, title_es, title_fil, sort_order, lesson_type FROM ti_lessons WHERE course_id = $1 ORDER BY sort_order`,
      { bind: [lesson.course_id] }
    );
    lesson.course_lessons = siblings;
    res.json({ success: true, lesson });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Submit lesson progress / complete lesson
router.post('/lessons/:id/progress', auth.any, async (req, res) => {
  try {
    const { status, score, time_spent_sec } = req.body;
    const lessonId = parseInt(req.params.id);
    const [[existing]] = await sequelize.query(
      `SELECT * FROM ti_lesson_progress WHERE user_id = $1 AND lesson_id = $2`,
      { bind: [req.user.id, lessonId] }
    );
    const safeStatus = status || 'in_progress';
    const safeScore = score != null ? parseFloat(score) : null;
    const safeTime = parseInt(time_spent_sec) || 0;
    const completedAt = safeStatus === 'completed' ? new Date() : null;

    if (existing) {
      await sequelize.query(
        `UPDATE ti_lesson_progress SET status = $1::varchar, score = COALESCE($2::numeric, score), time_spent_sec = time_spent_sec + $3::integer, completed_at = CASE WHEN $1::varchar = 'completed' THEN NOW() ELSE completed_at END WHERE user_id = $4 AND lesson_id = $5`,
        { bind: [safeStatus, safeScore, safeTime, req.user.id, lessonId] }
      );
    } else {
      await sequelize.query(
        `INSERT INTO ti_lesson_progress (user_id, lesson_id, status, score, time_spent_sec, completed_at, created_at) VALUES ($1,$2,$3::varchar,$4::numeric,$5::integer,$6,NOW())`,
        { bind: [req.user.id, lessonId, safeStatus, safeScore, safeTime, completedAt] }
      );
    }
    // Recalculate enrollment progress
    const [[lesson]] = await sequelize.query(`SELECT course_id FROM ti_lessons WHERE id = $1`, { bind: [lessonId] });
    if (lesson) {
      const [[stats]] = await sequelize.query(
        `SELECT (SELECT COUNT(*) FROM ti_lessons WHERE course_id = $1) as total,
                (SELECT COUNT(*) FROM ti_lesson_progress lp JOIN ti_lessons l ON lp.lesson_id = l.id WHERE l.course_id = $1 AND lp.user_id = $2 AND lp.status = 'completed') as done`,
        { bind: [lesson.course_id, req.user.id] }
      );
      const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
      await sequelize.query(
        `UPDATE ti_enrollments SET progress_pct = $1::numeric, completed_at = CASE WHEN $1::numeric = 100 THEN NOW() ELSE completed_at END, status = CASE WHEN $1::numeric = 100 THEN 'completed' ELSE status END WHERE user_id = $2 AND course_id = $3`,
        { bind: [pct, req.user.id, lesson.course_id] }
      );
    }
    res.json({ success: true, message: 'Progress updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get user's certifications
router.get('/my/certifications', auth.any, async (req, res) => {
  try {
    const [certs] = await sequelize.query(
      `SELECT cert.*, c.title_en as course_title_en, c.title_es as course_title_es, c.title_fil as course_title_fil
       FROM ti_certifications cert LEFT JOIN ti_courses c ON cert.course_id = c.id
       WHERE cert.user_id = $1 ORDER BY cert.issued_at DESC`,
      { bind: [req.user.id] }
    );
    res.json({ success: true, certifications: certs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get user's full progress summary
router.get('/my/progress', auth.any, async (req, res) => {
  try {
    const [enrollments] = await sequelize.query(
      `SELECT e.*, c.title_en, c.title_es, c.title_fil, c.level, c.category, c.total_lessons, c.duration_hours,
        (SELECT COUNT(*) FROM ti_lesson_progress lp JOIN ti_lessons l ON lp.lesson_id = l.id WHERE lp.user_id = e.user_id AND l.course_id = e.course_id AND lp.status = 'completed') as lessons_completed,
        (SELECT COALESCE(SUM(lp.time_spent_sec),0) FROM ti_lesson_progress lp JOIN ti_lessons l ON lp.lesson_id = l.id WHERE lp.user_id = e.user_id AND l.course_id = e.course_id) as total_time_sec,
        (SELECT COALESCE(AVG(lp.score),0) FROM ti_lesson_progress lp JOIN ti_lessons l ON lp.lesson_id = l.id WHERE lp.user_id = e.user_id AND l.course_id = e.course_id AND lp.score IS NOT NULL) as avg_score
       FROM ti_enrollments e JOIN ti_courses c ON e.course_id = c.id
       WHERE e.user_id = $1 ORDER BY e.enrolled_at DESC`,
      { bind: [req.user.id] }
    );
    const [certs] = await sequelize.query(
      `SELECT COUNT(*) as total FROM ti_certifications WHERE user_id = $1 AND status = 'active'`,
      { bind: [req.user.id] }
    );
    const [[timeStats]] = await sequelize.query(
      `SELECT COALESCE(SUM(time_spent_sec),0) as total_time, COUNT(CASE WHEN status='completed' THEN 1 END) as lessons_done FROM ti_lesson_progress WHERE user_id = $1`,
      { bind: [req.user.id] }
    );
    res.json({
      success: true,
      enrollments,
      summary: {
        total_courses: enrollments.length,
        completed_courses: enrollments.filter(e => e.status === 'completed').length,
        total_lessons_completed: parseInt(timeStats.lessons_done),
        total_time_sec: parseInt(timeStats.total_time),
        total_certifications: parseInt(certs[0].total)
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
