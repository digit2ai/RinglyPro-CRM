'use strict';

// =====================================================
// STAKEHOLDER MAGIC-LINK SHARE (PUBLIC ROUTES)
// =====================================================
//
// Mounted at /api/v1/projects/share WITHOUT auth — these are the public
// endpoints stakeholders hit when they click a share link in their email.
//
// Hard guarantees:
//   - The token alone is NOT a key. Token + correct email is the key.
//   - Endpoints only return / mutate the ONE project that owns the token.
//   - No path leads to calendar, tasks, staff, meeting minutes, history,
//     other projects, or any admin surface.
//   - Admin-only fields (architect_prompt, workflow internals, the share
//     token itself) are stripped before payload is returned.
//
// Admin-only token creation/revocation lives in projects.js behind the
// authenticated /api/v1/projects/:id/share-token route.

const express = require('express');
const router = express.Router();
const { Project, ProjectMilestone, ProjectUpdate, Vertical, Company } = require('../models');
const { logActivity } = require('../services/activityService');

function emailInTeam(project, email) {
  if (!email || !project) return false;
  const e = String(email).trim().toLowerCase();
  if (project.submitter_email && String(project.submitter_email).trim().toLowerCase() === e) return true;
  const team = Array.isArray(project.team_members) ? project.team_members : [];
  return team.some((m) => {
    if (!m) return false;
    if (typeof m === 'string') return m.trim().toLowerCase() === e;
    if (typeof m === 'object' && m.email) return String(m.email).trim().toLowerCase() === e;
    return false;
  });
}

async function loadByToken(token) {
  if (!token) return null;
  return Project.findOne({
    where: { workspace_id: 1, stakeholder_share_token: token, archived_at: null }
  });
}

function expired(project) {
  return project.stakeholder_share_expires_at &&
    new Date(project.stakeholder_share_expires_at) < new Date();
}

// POST /api/v1/projects/share/:token/identify
// Body: { email } — verify email is on the team_members list for this token.
router.post('/:token/identify', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const project = await loadByToken(req.params.token);
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) {
      return res.status(403).json({ success: false, error: 'This email is not authorized for this project' });
    }
    res.json({ success: true, project_id: project.id, project_name: project.name });
  } catch (error) {
    console.error('[D2AI] Share identify error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/share/:token/data?email=...
// Read-only project payload, scoped to the single project this token owns.
router.get('/:token/data', async (req, res) => {
  try {
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const project = await Project.findOne({
      where: { workspace_id: 1, stakeholder_share_token: req.params.token, archived_at: null },
      include: [
        { model: Vertical, as: 'vertical', attributes: ['id', 'name', 'color'] },
        { model: Company, as: 'company', attributes: ['id', 'name'] },
        { model: ProjectMilestone, as: 'milestones', required: false },
        { model: ProjectUpdate, as: 'updates', required: false }
      ]
    });
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) {
      return res.status(403).json({ success: false, error: 'This email is not authorized for this project' });
    }
    const safe = project.toJSON();
    // Strip admin-only / internal fields
    [
      'architect_prompt',
      'intake_status',
      'workflow_phase_history',
      'stakeholder_share_token',
      'stakeholder_share_created_at',
      'stakeholder_share_expires_at',
      'ai_summary',
      'blockers'
    ].forEach((k) => delete safe[k]);
    res.json({ success: true, data: safe });
  } catch (error) {
    console.error('[D2AI] Share data error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects/share/:token/comment
// Body: { email, message } — stakeholder posts a comment as a ProjectUpdate.
router.post('/:token/comment', async (req, res) => {
  try {
    const { email, message } = req.body || {};
    if (!email || !message) return res.status(400).json({ success: false, error: 'Email and message required' });
    const project = await loadByToken(req.params.token);
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const update = await ProjectUpdate.create({
      project_id: project.id,
      author: email,
      text: `[Stakeholder] ${String(message).slice(0, 4000)}`,
      workspace_id: 1
    });
    await logActivity(null, 'stakeholder_comment', 'project', project.id, `${email}: ${String(message).slice(0, 80)}`);
    res.json({ success: true, data: update });
  } catch (error) {
    console.error('[D2AI] Share comment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
