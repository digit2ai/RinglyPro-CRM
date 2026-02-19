'use strict';

const express = require('express');
const router = express.Router();
const { authenticateMember, optionalAuth } = require('../middleware/auth');

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// GET / - List training courses
router.get('/', async (req, res) => {
  try {
    const { category, group, status, featured } = req.query;
    const where = { tenant_id: 1 };
    if (category) where.category = category;
    if (group) where.group = group;
    if (status) where.status = status;
    if (featured === 'true') where.featured = true;

    const courses = await models.RoninTrainingCourse.findAll({
      where,
      order: [['created_at', 'DESC']]
    });

    res.json({ success: true, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /rpdta - RPDTA tactical courses only
router.get('/rpdta', async (req, res) => {
  try {
    const courses = await models.RoninTrainingCourse.findAll({
      where: { tenant_id: 1, group: 'RPDTA' },
      order: [['created_at', 'ASC']]
    });
    res.json({ success: true, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:slug - Get course by slug
router.get('/:slug', async (req, res) => {
  try {
    const course = await models.RoninTrainingCourse.findOne({
      where: { tenant_id: 1, slug: req.params.slug },
      include: [{ model: models.RoninEnrollment, as: 'enrollments', attributes: ['id', 'status', 'member_id'] }]
    });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
    res.json({ success: true, data: course });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create course (admin)
router.post('/', async (req, res) => {
  try {
    const course = await models.RoninTrainingCourse.create({ ...req.body, tenant_id: 1 });
    res.status(201).json({ success: true, data: course });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/enroll - Enroll in course
router.post('/:id/enroll', authenticateMember, async (req, res) => {
  try {
    const course = await models.RoninTrainingCourse.findOne({ where: { id: req.params.id, tenant_id: 1 } });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

    if (course.max_enrollment && course.current_enrollment >= course.max_enrollment) {
      return res.status(409).json({ success: false, error: 'Course is full' });
    }

    // Check if RPDTA course requires clearance
    if (course.requires_clearance) {
      const member = await models.RoninMember.findByPk(req.memberId);
      if (!member.is_law_enforcement) {
        return res.status(403).json({ success: false, error: 'This course requires law enforcement/military credentials' });
      }
    }

    const existing = await models.RoninEnrollment.findOne({
      where: { member_id: req.memberId, course_id: course.id, tenant_id: 1 }
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Already enrolled in this course' });
    }

    const enrollment = await models.RoninEnrollment.create({
      tenant_id: 1,
      member_id: req.memberId,
      course_id: course.id,
      amount_paid: course.price
    });

    await course.increment('current_enrollment');

    res.status(201).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update course (admin)
router.put('/:id', async (req, res) => {
  try {
    const course = await models.RoninTrainingCourse.findOne({ where: { id: req.params.id, tenant_id: 1 } });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
    await course.update(req.body);
    res.json({ success: true, data: course });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
