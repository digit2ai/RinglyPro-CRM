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
const { Op } = require('sequelize');
const { Project, ProjectMilestone, ProjectUpdate, Vertical, Company, CalendarEvent } = require('../models');
const { logActivity } = require('../services/activityService');

const RESCHEDULE_CAP = 2;

// Generate `count` reschedule slots that vary across business-hour bands so
// a stakeholder with a recurring conflict at one time of day still has a
// realistic alternative. Each slot is on a different weekday, drawn from
// shuffled bands and conflict-checked against the workspace calendar so we
// don't suggest a time that already has another meeting.
//
// Bands (Cali / America/Bogota = UTC-5):
//   morning   ~ 9:00 - 10:30    (14:00 - 15:30 UTC)
//   midday    ~11:30 - 13:30    (16:30 - 18:30 UTC)
//   afternoon ~14:30 - 16:30    (19:30 - 21:30 UTC)
async function generateRescheduleSlots({ minDaysOut = 2, count = 3, durationMin = 30, workspaceId = 1 } = {}) {
  const lookaheadDays = 21;
  const now = new Date();
  const horizon = new Date(now.getTime() + (lookaheadDays + 2) * 86400000);

  // Fetch every workspace event in the lookahead window for conflict checking
  let evWindows = [];
  try {
    const events = await CalendarEvent.findAll({
      where: {
        workspace_id: workspaceId,
        start_time: { [Op.lt]: horizon },
        end_time: { [Op.gt]: now }
      },
      attributes: ['start_time', 'end_time']
    });
    evWindows = events.map(e => [new Date(e.start_time).getTime(), new Date(e.end_time || e.start_time).getTime()]);
  } catch (_) { /* fall through with no conflict data */ }
  const overlaps = (s, e) => evWindows.some(([es, ee]) => s < ee && e > es);

  const bands = [
    { startMinUtc: 14 * 60,      rangeMin: 90  },  //  9:00 - 10:30 Cali
    { startMinUtc: 16 * 60 + 30, rangeMin: 120 },  // 11:30 - 13:30 Cali
    { startMinUtc: 19 * 60 + 30, rangeMin: 120 }   // 14:30 - 16:30 Cali
  ];
  // Shuffle band order so the first slot is not always morning.
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);

  const slots = [];
  const cursor = new Date();
  let weekdaysAdvanced = 0;
  let dayAttempts = 0;
  while (slots.length < count && dayAttempts < lookaheadDays * 2) {
    dayAttempts++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    weekdaysAdvanced++;
    if (weekdaysAdvanced < minDaysOut) continue;

    const band = bands[order[slots.length % order.length]];
    // Try up to 6 random positions inside the band before moving on
    let placed = false;
    const dayStartMs = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 0, 0, 0);
    for (let i = 0; i < 6 && !placed; i++) {
      const offsetSteps = Math.floor(Math.random() * (band.rangeMin / 15));
      const totalMin = band.startMinUtc + offsetSteps * 15;
      const slotStartMs = dayStartMs + totalMin * 60000;
      const slotEndMs = slotStartMs + durationMin * 60000;
      if (slotStartMs < Date.now()) continue;
      if (!overlaps(slotStartMs, slotEndMs)) {
        slots.push({
          start_time: new Date(slotStartMs).toISOString(),
          end_time: new Date(slotEndMs).toISOString()
        });
        placed = true;
      }
    }
  }
  return slots;
}

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

// =====================================================
// PROJECT MEETINGS — list + Owner-only per-event reschedule
// =====================================================

// Helper: load all upcoming meetings linked to a project, mark which one
// is the kickoff so the UI can label it.
async function loadUpcomingMeetings(project) {
  const events = await CalendarEvent.findAll({
    where: {
      workspace_id: project.workspace_id || 1,
      project_id: project.id,
      event_type: 'meeting',
      end_time: { [Op.gte]: new Date() }
    },
    order: [['start_time', 'ASC']]
  });
  return events.map(e => ({
    id: e.id,
    title: e.title,
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location || null,
    zoom_join_url: e.zoom_join_url || null,
    reschedule_count: Number(e.reschedule_count || 0),
    is_kickoff: project.kickoff_event_id === e.id
  }));
}

// GET /api/v1/projects/share/:token/meetings?email=...
// Returns ALL upcoming meetings linked to the project + reschedule status.
router.get('/:token/meetings', async (req, res) => {
  try {
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const project = await loadByToken(req.params.token);
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) return res.status(403).json({ success: false, error: 'Not authorized' });

    const meetings = await loadUpcomingMeetings(project);
    // Any team member can reschedule (Option 2). The is_owner field is kept
    // for backward compat with older frontends but now reflects "in team"
    // since reschedule rights expanded to all stakeholders.
    res.json({
      success: true,
      data: {
        meetings: meetings.map(m => ({
          ...m,
          can_reschedule: m.reschedule_count < RESCHEDULE_CAP
        })),
        is_owner: true,
        reschedule_cap: RESCHEDULE_CAP
      }
    });
  } catch (error) {
    console.error('[D2AI] Share meetings list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/share/:token/meetings/:eventId/slots?email=...
// Any team member can request slots: 3 candidate weekday slots at 10am Cali
// for the given event. Per-event reschedule cap still applies.
router.get('/:token/meetings/:eventId/slots', async (req, res) => {
  try {
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const project = await loadByToken(req.params.token);
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) return res.status(403).json({ success: false, error: 'Not authorized' });
    const event = await CalendarEvent.findOne({
      where: { id: parseInt(req.params.eventId, 10), project_id: project.id, workspace_id: project.workspace_id || 1 }
    });
    if (!event) return res.status(404).json({ success: false, error: 'Meeting not found on this project' });

    const count = Number(event.reschedule_count || 0);
    if (count >= RESCHEDULE_CAP) {
      return res.status(403).json({ success: false, error: `Reschedule limit reached for this meeting (${RESCHEDULE_CAP}). Contact us to adjust.` });
    }
    const slots = await generateRescheduleSlots({ minDaysOut: 2, count: 3, workspaceId: project.workspace_id || 1 });
    res.json({
      success: true,
      data: { slots, reschedule_count: count, reschedule_cap: RESCHEDULE_CAP }
    });
  } catch (error) {
    console.error('[D2AI] Share meeting slots (per-event) error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects/share/:token/meetings/:eventId/reschedule
// Body: { email, start_time, end_time }
// Any team member can reschedule. Per-event cap = RESCHEDULE_CAP. No conflict-check.
router.post('/:token/meetings/:eventId/reschedule', async (req, res) => {
  try {
    const { email, start_time, end_time } = req.body || {};
    if (!email || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'email, start_time, end_time required' });
    }
    const project = await loadByToken(req.params.token);
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) return res.status(403).json({ success: false, error: 'Not authorized' });
    const newStart = new Date(start_time);
    const newEnd = new Date(end_time);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
      return res.status(400).json({ success: false, error: 'Invalid start/end times' });
    }
    if (newStart < new Date()) {
      return res.status(400).json({ success: false, error: 'Cannot reschedule to a past time' });
    }
    const event = await CalendarEvent.findOne({
      where: { id: parseInt(req.params.eventId, 10), project_id: project.id, workspace_id: project.workspace_id || 1 }
    });
    if (!event) return res.status(404).json({ success: false, error: 'Meeting not found on this project' });
    const count = Number(event.reschedule_count || 0);
    if (count >= RESCHEDULE_CAP) {
      return res.status(403).json({ success: false, error: `Reschedule limit reached for this meeting (${RESCHEDULE_CAP}). Contact us to adjust.` });
    }

    const oldStart = event.start_time;
    event.start_time = newStart;
    event.end_time = newEnd;
    event.reschedule_count = count + 1;
    event.description = (event.description ? event.description + '\n\n' : '') +
      `Rescheduled by stakeholder (${email}) on ${new Date().toISOString().slice(0, 10)}. Previous time: ${oldStart}.`;
    await event.save();

    // Keep the project's kickoff timestamp in sync if this is the kickoff
    if (project.kickoff_event_id === event.id) {
      project.kickoff_scheduled_at = newStart;
      await project.save();
    }

    await logActivity(email, 'meeting_rescheduled_by_stakeholder', 'project', project.id,
      `${project.name} — event #${event.id} new time ${newStart.toISOString()} (count ${count + 1}/${RESCHEDULE_CAP})`);

    res.json({
      success: true,
      data: {
        meeting: {
          id: event.id,
          start_time: event.start_time,
          end_time: event.end_time,
          location: event.location || null,
          zoom_join_url: event.zoom_join_url || null
        },
        reschedule_count: count + 1,
        reschedule_cap: RESCHEDULE_CAP
      }
    });
  } catch (error) {
    console.error('[D2AI] Share meeting reschedule (per-event) error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// KICKOFF MEETING — view + Owner-only reschedule
// =====================================================

// GET /api/v1/projects/share/:token/meeting?email=...
// Returns the current proposed kickoff meeting plus reschedule status.
router.get('/:token/meeting', async (req, res) => {
  try {
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const project = await loadByToken(req.params.token);
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) return res.status(403).json({ success: false, error: 'Not authorized' });

    let meeting = null;
    if (project.kickoff_event_id) {
      const event = await CalendarEvent.findByPk(project.kickoff_event_id);
      if (event) {
        meeting = {
          id: event.id,
          title: event.title,
          start_time: event.start_time,
          end_time: event.end_time,
          location: event.location || null,
          zoom_join_url: event.zoom_join_url || null
        };
      }
    }

    const count = Number(project.kickoff_reschedule_count || 0);
    // Any team member can reschedule (Option 2); is_owner kept for back-compat.
    res.json({
      success: true,
      data: {
        meeting,
        is_owner: true,
        reschedule_count: count,
        reschedule_cap: RESCHEDULE_CAP,
        can_reschedule: !!meeting && count < RESCHEDULE_CAP
      }
    });
  } catch (error) {
    console.error('[D2AI] Share meeting fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/share/:token/meeting/slots?email=...
// Returns 3 candidate weekday slots at 10am Cali time, no conflict-check.
// Any team member can request slots.
router.get('/:token/meeting/slots', async (req, res) => {
  try {
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const project = await loadByToken(req.params.token);
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (!project.kickoff_event_id) {
      return res.status(404).json({ success: false, error: 'No kickoff meeting to reschedule' });
    }
    const count = Number(project.kickoff_reschedule_count || 0);
    if (count >= RESCHEDULE_CAP) {
      return res.status(403).json({ success: false, error: `Reschedule limit reached (${RESCHEDULE_CAP}). Contact us to adjust.` });
    }
    const slots = await generateRescheduleSlots({ minDaysOut: 2, count: 3, workspaceId: project.workspace_id || 1 });
    res.json({
      success: true,
      data: { slots, reschedule_count: count, reschedule_cap: RESCHEDULE_CAP }
    });
  } catch (error) {
    console.error('[D2AI] Share meeting slots error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects/share/:token/meeting/reschedule
// Body: { email, start_time, end_time }
// Any team member can reschedule. Caps at RESCHEDULE_CAP. No conflict-check.
router.post('/:token/meeting/reschedule', async (req, res) => {
  try {
    const { email, start_time, end_time } = req.body || {};
    if (!email || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'email, start_time, end_time required' });
    }
    const project = await loadByToken(req.params.token);
    if (!project) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (expired(project)) return res.status(410).json({ success: false, error: 'This share link has expired' });
    if (!emailInTeam(project, email)) return res.status(403).json({ success: false, error: 'Not authorized' });
    const newStart = new Date(start_time);
    const newEnd = new Date(end_time);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
      return res.status(400).json({ success: false, error: 'Invalid start/end times' });
    }
    if (newStart < new Date()) {
      return res.status(400).json({ success: false, error: 'Cannot reschedule to a past time' });
    }
    if (!project.kickoff_event_id) {
      return res.status(404).json({ success: false, error: 'No kickoff meeting to reschedule' });
    }
    const count = Number(project.kickoff_reschedule_count || 0);
    if (count >= RESCHEDULE_CAP) {
      return res.status(403).json({ success: false, error: `Reschedule limit reached (${RESCHEDULE_CAP}). Contact us to adjust.` });
    }

    const event = await CalendarEvent.findByPk(project.kickoff_event_id);
    if (!event) return res.status(404).json({ success: false, error: 'Kickoff event not found' });

    const oldStart = event.start_time;
    event.start_time = newStart;
    event.end_time = newEnd;
    event.description = (event.description ? event.description + '\n\n' : '') +
      `Rescheduled by stakeholder (${email}) on ${new Date().toISOString().slice(0, 10)}. Previous time: ${oldStart}.`;
    await event.save();

    project.kickoff_scheduled_at = newStart;
    project.kickoff_reschedule_count = count + 1;
    await project.save();

    await logActivity(email, 'kickoff_rescheduled_by_stakeholder', 'project', project.id,
      `${project.name} — new time ${newStart.toISOString()} (count ${count + 1}/${RESCHEDULE_CAP})`);

    res.json({
      success: true,
      data: {
        meeting: {
          id: event.id,
          start_time: event.start_time,
          end_time: event.end_time,
          location: event.location || null,
          zoom_join_url: event.zoom_join_url || null
        },
        reschedule_count: count + 1,
        reschedule_cap: RESCHEDULE_CAP
      }
    });
  } catch (error) {
    console.error('[D2AI] Share meeting reschedule error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
