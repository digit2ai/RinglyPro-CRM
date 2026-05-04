'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { CalendarEvent, Project, Contact, Task, StaffMember } = require('../models');
const { logActivity } = require('../services/activityService');
const zoomService = require('../services/zoom');
const inviteService = require('../services/meetingInvite');

// GET /api/v1/calendar/zoom/status — returns whether Zoom integration is configured
router.get('/zoom/status', (req, res) => {
  res.json({ success: true, configured: zoomService.isConfigured() });
});

// GET /api/v1/calendar/invite/status — returns whether SendGrid invites are configured
router.get('/invite/status', (req, res) => {
  res.json({ success: true, configured: inviteService.isConfigured() });
});

// Convert a Task row into a calendar-event-shaped object
function taskToEvent(task) {
  const t = task.toJSON ? task.toJSON() : task;
  const due = t.due_date ? new Date(t.due_date) : null;
  return {
    id: `task-${t.id}`,
    source: 'task',
    task_id: t.id,
    workspace_id: t.workspace_id,
    user_email: t.user_email,
    project_id: t.project_id,
    contact_id: t.contact_id,
    title: t.title,
    description: t.description,
    event_type: 'task',
    start_time: due,
    end_time: due,
    all_day: true,
    location: null,
    task_status: t.status,
    task_priority: t.priority,
    assigned_staff_id: t.assigned_staff_id,
    project: t.project || null,
    contact: t.contact || null,
    assignee: t.assignee || null
  };
}

async function fetchTasksForRange(start, end) {
  const where = { workspace_id: 1, due_date: { [Op.ne]: null } };
  if (start && end) {
    where.due_date = { [Op.between]: [new Date(start), new Date(end)] };
  } else if (start) {
    where.due_date = { [Op.gte]: new Date(start) };
  }
  const tasks = await Task.findAll({
    where,
    include: [
      { model: Project, as: 'project', attributes: ['id', 'name'] },
      { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name'] },
      { model: StaffMember, as: 'assignee', attributes: ['id', 'first_name', 'last_name'], required: false }
    ],
    order: [['due_date', 'ASC']]
  });
  return tasks.map(taskToEvent);
}

// GET /api/v1/calendar - List events (merges tasks with due dates)
router.get('/', async (req, res) => {
  try {
    const { start, end, event_type } = req.query;
    const where = { workspace_id: 1 };

    if (start && end) {
      where.start_time = { [Op.between]: [new Date(start), new Date(end)] };
    } else if (start) {
      where.start_time = { [Op.gte]: new Date(start) };
    } else {
      where.start_time = { [Op.gte]: new Date() };
    }
    if (event_type) where.event_type = event_type;

    const events = await CalendarEvent.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['start_time', 'ASC']],
      limit: 200
    });

    let merged = events.map(e => ({ ...e.toJSON(), source: 'event' }));
    if (!event_type || event_type === 'task') {
      const taskEvents = await fetchTasksForRange(start, end);
      merged = merged.concat(taskEvents);
      merged.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }

    res.json({ success: true, data: merged });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/calendar/upcoming - Next 7 days (merges tasks with due dates)
router.get('/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 86400000);
    const events = await CalendarEvent.findAll({
      where: { workspace_id: 1, start_time: { [Op.between]: [now, weekLater] } },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['start_time', 'ASC']]
    });
    const taskEvents = await fetchTasksForRange(now, weekLater);
    const merged = events.map(e => ({ ...e.toJSON(), source: 'event' })).concat(taskEvents);
    merged.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    res.json({ success: true, data: merged });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/calendar/:id - Single event
router.get('/:id', async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name', 'status'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name', 'email'] }
      ]
    });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/calendar - Create event (optionally provisions a Zoom meeting + sends invites)
router.post('/', async (req, res) => {
  try {
    const { create_zoom, invite_emails, invite_message, ...rest } = req.body || {};
    const data = { workspace_id: 1, user_email: req.user?.email, ...rest };
    const inviteList = inviteService.normalizeEmails(invite_emails);
    if (inviteList.length) data.invited_emails = inviteList;

    // Optionally create a Zoom meeting first so we can attach the join URL on create.
    let zoomWarning = null;
    if (create_zoom) {
      if (!zoomService.isConfigured()) {
        zoomWarning = 'Zoom integration not configured on the server';
      } else if (!data.start_time) {
        zoomWarning = 'Cannot create Zoom meeting without a start time';
      } else {
        try {
          const start = new Date(data.start_time);
          const end = data.end_time ? new Date(data.end_time) : null;
          const durationMinutes = end ? Math.max(15, Math.round((end - start) / 60000)) : 30;
          const meeting = await zoomService.createMeeting({
            topic: data.title || 'Meeting',
            startISO: start.toISOString(),
            durationMinutes,
            timezone: 'America/New_York',
            agenda: data.description || ''
          });
          data.zoom_meeting_id = meeting.id;
          data.zoom_join_url = meeting.join_url;
          data.zoom_start_url = meeting.start_url;
          data.zoom_password = meeting.password;
          // Surface the join URL in the location field too, so existing calendar
          // views that show "location" automatically render it.
          if (!data.location) data.location = meeting.join_url;
        } catch (zErr) {
          console.error('[D2AI] Zoom meeting creation failed:', zErr.response?.data || zErr.message);
          zoomWarning = 'Zoom meeting creation failed: ' + (zErr.response?.data?.message || zErr.message);
        }
      }
    }

    const event = await CalendarEvent.create(data);
    await logActivity(req.user?.email, 'created', 'calendar_event', event.id, event.title);

    // Fire invites if any addresses were provided. Event already saved, so a
    // SendGrid failure is a soft warning rather than a 500 — caller still gets
    // their event back.
    let inviteResult = null;
    if (inviteList.length) {
      try {
        inviteResult = await inviteService.sendInvites({
          event,
          emails: inviteList,
          customMessage: invite_message,
          organizerName: req.user?.display_name || null,
          organizerEmail: req.user?.email || null
        });
      } catch (iErr) {
        console.error('[D2AI] invite send error:', iErr.message);
        inviteResult = { sent: [], failed: inviteList.map(e => ({ email: e, error: iErr.message })) };
      }
    }

    res.status(201).json({ success: true, data: event, zoom_warning: zoomWarning, invite_result: inviteResult });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/calendar/:id/invite — send invites to additional attendees on an existing event
router.post('/:id/invite', async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    const newEmails = inviteService.normalizeEmails(req.body?.emails);
    if (!newEmails.length) {
      return res.status(400).json({ success: false, error: 'No valid email addresses provided' });
    }
    const result = await inviteService.sendInvites({
      event,
      emails: newEmails,
      customMessage: req.body?.message,
      organizerName: req.user?.display_name || null,
      organizerEmail: req.user?.email || null
    });
    // Merge successful sends into the persisted invitee list (dedup).
    const existing = Array.isArray(event.invited_emails) ? event.invited_emails : [];
    const merged = Array.from(new Set([...existing, ...result.sent]));
    if (merged.length !== existing.length) {
      event.invited_emails = merged;
      await event.save();
    }
    res.json({ success: true, data: event, invite_result: result });
  } catch (error) {
    console.error('[D2AI] /:id/invite error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/calendar/:id - Update event
router.put('/:id', async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    await event.update(req.body);
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/calendar/:id - Delete event
// Optional ?scope=series  -> deletes every event sharing the recurrence_group_id
router.delete('/:id', async (req, res) => {
  try {
    const scope = req.query.scope;
    if (scope === 'series') {
      const event = await CalendarEvent.findOne({ where: { id: req.params.id, workspace_id: 1 } });
      if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
      if (event.recurrence_group_id) {
        const removed = await CalendarEvent.destroy({
          where: { workspace_id: 1, recurrence_group_id: event.recurrence_group_id }
        });
        return res.json({ success: true, deleted: removed, scope: 'series' });
      }
      await event.destroy();
      return res.json({ success: true, deleted: 1, scope: 'single' });
    }
    const removed = await CalendarEvent.destroy({ where: { id: req.params.id, workspace_id: 1 } });
    if (!removed) return res.status(404).json({ success: false, error: 'Event not found' });
    res.json({ success: true, deleted: removed, scope: 'single' });
  } catch (error) {
    console.error('[D2AI] calendar delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
