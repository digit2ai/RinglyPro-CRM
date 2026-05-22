'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize, Project, Contact, Task, CalendarEvent, ActivityLog, Vertical, Notification } = require('../models');

// GET /api/v1/dashboard - Full dashboard data
router.get('/', async (req, res) => {
  try {
    const ws = 1;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekFromNow = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

    // Match the drill-down's window exactly: [startOfToday, startOfToday+7d).
    // Count CalendarEvents AND Tasks with a due_date in the same window so
    // the Home KPI matches the "Coming Up This Week" page total (which uses
    // GET /calendar — a UNION of events + tasks).
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysOut = new Date(startOfToday.getTime() + 7 * 86400000);
    const [
      totalProjects,
      activeProjects,
      overdueProjects,
      projectsDueThisWeek,
      upcomingEventsRowCount,
      upcomingTaskRowCount,
      totalContacts,
      contactsNeedFollowup,
      pendingTasks,
      overdueTasks,
      tasksDueToday,
      pendingReminders,
      meetingsToday,
      upcomingEvents,
      recentActivity,
      projectsByStatus,
      projectsByPriority,
      verticalDistribution,
      unreadNotifications
    ] = await Promise.all([
      Project.count({ where: { workspace_id: ws, archived_at: null } }),
      Project.count({ where: { workspace_id: ws, archived_at: null, status: { [Op.in]: ['active', 'in_progress'] } } }),
      Project.count({ where: { workspace_id: ws, archived_at: null, due_date: { [Op.lt]: today }, status: { [Op.notIn]: ['completed', 'cancelled'] } } }),
      Project.count({ where: { workspace_id: ws, archived_at: null, due_date: { [Op.between]: [today, weekFromNow] } } }),
      CalendarEvent.count({ where: { workspace_id: ws, start_time: { [Op.between]: [startOfToday, sevenDaysOut] } } }),
      Task.count({ where: { workspace_id: ws, due_date: { [Op.between]: [startOfToday, sevenDaysOut] } } }),
      Contact.count({ where: { workspace_id: ws, archived_at: null } }),
      Contact.count({ where: { workspace_id: ws, archived_at: null, next_followup_date: { [Op.lte]: today } } }),
      Task.count({ where: { workspace_id: ws, status: 'pending' } }),
      // Strictly overdue = due_date is on a day BEFORE today. Comparing to
      // NOW() instead of CURRENT_DATE incorrectly flagged tasks due today
      // at an earlier time as overdue, causing a mismatch with the To-Do
      // list's "Overdue" filter (which compares date-only).
      Task.count({ where: { workspace_id: ws, status: 'pending', due_date: { [Op.lt]: today } } }),
      Task.count({ where: { workspace_id: ws, status: 'pending', due_date: today } }),
      Task.count({
        where: {
          workspace_id: ws,
          status: 'pending',
          [Op.or]: [
            { task_type: 'reminder' },
            { quicktask_id: { [Op.ne]: null } }
          ]
        }
      }),
      // Calendar badge: meetings still upcoming today (from now → end-of-day).
      // Past meetings shouldn't surface here — the home-page chip is meant to
      // tell the user what they still have to attend.
      CalendarEvent.count({
        where: {
          workspace_id: ws,
          start_time: { [Op.between]: [now, new Date(startOfToday.getTime() + 86400000)] }
        }
      }),
      CalendarEvent.findAll({ where: { workspace_id: ws, start_time: { [Op.gte]: now } }, order: [['start_time', 'ASC']], limit: 5 }),
      ActivityLog.findAll({ where: { workspace_id: ws }, order: [['created_at', 'DESC']], limit: 10 }),
      Project.findAll({
        where: { workspace_id: ws, archived_at: null },
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true
      }),
      Project.findAll({
        where: { workspace_id: ws, archived_at: null },
        attributes: ['priority', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['priority'],
        raw: true
      }),
      sequelize.query(`
        SELECT v.name, v.color, COUNT(p.id) as project_count
        FROM d2_verticals v
        LEFT JOIN d2_projects p ON p.vertical_id = v.id AND p.archived_at IS NULL
        WHERE v.workspace_id = :ws AND v.active = true
        GROUP BY v.id, v.name, v.color
        ORDER BY v.sort_order
      `, { replacements: { ws }, type: sequelize.QueryTypes.SELECT }),
      Notification.count({ where: { workspace_id: ws, read: false } })
    ]);

    // Stalled projects (no updates in 14 days)
    const stalledProjects = await sequelize.query(`
      SELECT p.id, p.name, p.status, p.updated_at
      FROM d2_projects p
      WHERE p.workspace_id = :ws AND p.archived_at IS NULL
        AND p.status NOT IN ('completed', 'cancelled')
        AND p.updated_at < :cutoff
      ORDER BY p.updated_at ASC
      LIMIT 5
    `, { replacements: { ws, cutoff: twoWeeksAgo }, type: sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      data: {
        summary: {
          total_projects: totalProjects,
          active_projects: activeProjects,
          overdue_projects: overdueProjects,
          projects_due_this_week: projectsDueThisWeek,
          upcoming_events_count: upcomingEventsRowCount + upcomingTaskRowCount,
          total_contacts: totalContacts,
          contacts_need_followup: contactsNeedFollowup,
          pending_tasks: pendingTasks,
          overdue_tasks: overdueTasks,
          tasks_due_today: tasksDueToday,
          pending_reminders: pendingReminders,
          meetings_today: meetingsToday,
          unread_notifications: unreadNotifications
        },
        projects_by_status: projectsByStatus,
        projects_by_priority: projectsByPriority,
        vertical_distribution: verticalDistribution,
        stalled_projects: stalledProjects,
        upcoming_events: upcomingEvents,
        recent_activity: recentActivity
      }
    });
  } catch (error) {
    console.error('[D2AI] Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
