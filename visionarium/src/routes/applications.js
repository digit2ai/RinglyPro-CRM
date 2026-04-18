const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { awardBadge } = require('../services/badge-service');

// POST /api/v1/applications -- Submit application (community member)
router.post('/', verifyToken, async (req, res) => {
  try {
    const models = require('../../models');
    const { cohort_id, track_preference, written_vision, video_url, challenge_submission, scholarship_requested } = req.body;

    if (!cohort_id) return res.status(400).json({ error: 'cohort_id is required' });

    // Check cohort is accepting applications
    const cohort = await models.VisionariumCohort.findByPk(cohort_id);
    if (!cohort || cohort.status !== 'applications_open') {
      return res.status(400).json({ error: 'Cohort is not accepting applications' });
    }

    const existing = await models.VisionariumApplication.findOne({
      where: { community_member_id: req.user.id, cohort_id }
    });
    if (existing) return res.status(409).json({ error: 'You already have an application for this cohort', application: existing });

    const app = await models.VisionariumApplication.create({
      community_member_id: req.user.id,
      cohort_id, track_preference, written_vision, video_url,
      challenge_submission, scholarship_requested,
      status: 'submitted',
      submitted_at: new Date()
    });

    // Update member tier
    await models.VisionariumCommunityMember.update({ tier: 'applicant' }, { where: { id: req.user.id } });
    // Update cohort applicant count
    await cohort.increment('total_applicants');

    // Award applicant badge
    awardBadge(models, req.user.id, 'applicant').catch(() => {});

    res.status(201).json({ success: true, application: app });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/applications/me -- My applications
router.get('/me', verifyToken, async (req, res) => {
  try {
    const models = require('../../models');
    const apps = await models.VisionariumApplication.findAll({
      where: { community_member_id: req.user.id },
      include: [{ model: models.VisionariumCohort, as: 'cohort' }],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, applications: apps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list all applications
router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const { cohort_id, status, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (cohort_id) where.cohort_id = cohort_id;
    if (status) where.status = status;

    const { rows, count } = await models.VisionariumApplication.findAndCountAll({
      where, limit: parseInt(limit), offset: parseInt(offset),
      include: [
        { model: models.VisionariumCommunityMember, as: 'applicant', attributes: ['first_name', 'last_name', 'email', 'country', 'age'] },
        { model: models.VisionariumCohort, as: 'cohort', attributes: ['name'] }
      ],
      order: [['submitted_at', 'DESC']]
    });
    res.json({ success: true, total: count, applications: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update application status
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const app = await models.VisionariumApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });

    const updates = {};
    ['status', 'reviewer_notes', 'reviewer_id', 'interview_date', 'interview_score'].forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (updates.status === 'under_review' || updates.status === 'interview') updates.reviewed_at = new Date();
    if (['accepted', 'waitlisted', 'rejected'].includes(updates.status)) updates.decided_at = new Date();

    await app.update(updates);
    res.json({ success: true, application: app });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete application
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const app = await models.VisionariumApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });
    await app.destroy();
    res.json({ success: true, message: 'Application deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
