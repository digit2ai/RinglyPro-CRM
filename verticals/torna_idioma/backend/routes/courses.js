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

// Get user's enrollments
router.get('/my/enrollments', auth.any, async (req, res) => {
  try {
    const [enrollments] = await sequelize.query(
      `SELECT e.*, c.title_en, c.title_es, c.title_fil, c.level, c.category, c.total_lessons, c.thumbnail_url
       FROM ti_enrollments e JOIN ti_courses c ON e.course_id = c.id
       WHERE e.user_id = $1 ORDER BY e.enrolled_at DESC`,
      { bind: [req.user.id] }
    );
    res.json({ success: true, enrollments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
