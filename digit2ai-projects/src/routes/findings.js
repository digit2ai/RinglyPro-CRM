'use strict';

// Neural Findings for the project tracker — surfaces gaps and risks in
// the workflow so the Home page becomes actionable instead of a static
// dashboard. Mirrors the Neural Intelligence panel on the main site.
//
// All detectors run on every dashboard load (one round-trip, ~10 cheap
// COUNT queries against indexed columns). Dismissed findings are hidden
// for 7 days via d2_finding_dismissals.

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

// One detector returns { key, severity, title, description, impact_label,
// source_label, fix_view, fix_filter? } or null if nothing to flag.
async function detectAll(ws) {
  const detectors = [
    detectStalledProjects,
    detectTasksUnassignedNoOwner,
    detectIntakeAging,
    detectMinutesUnsent,
    detectApprovedMissingKickoff,
    detectOverdueMilestones,
    detectProjectsPastDue,
    detectStakeholdersMissingPhone,
    detectContractsDraftStale,
    detectAgentsFailed
  ];
  const results = await Promise.allSettled(detectors.map(d => d(ws)));
  return results
    .map((r, i) => r.status === 'fulfilled' ? r.value : (console.error('[findings] detector', i, 'failed:', r.reason?.message), null))
    .filter(Boolean);
}

async function single(q, replacements) {
  const [rows] = await sequelize.query(q, { replacements });
  return rows[0] || {};
}

async function detectStalledProjects(ws) {
  const r = await single(`
    SELECT COUNT(*)::int AS n
    FROM d2_projects
    WHERE workspace_id = :ws
      AND archived_at IS NULL
      AND status NOT IN ('completed', 'cancelled')
      AND updated_at < NOW() - INTERVAL '14 days'
  `, { ws });
  if (!r.n) return null;
  return {
    key: 'projects.stalled.14d',
    severity: r.n >= 5 ? 'critical' : 'warning',
    title: `${r.n} Project${r.n === 1 ? '' : 's'} Stalled for 14+ Days`,
    description: `${r.n} active project${r.n === 1 ? ' has' : 's have'} had no updates in over two weeks. Stalled projects drift toward abandonment — check in or close them out.`,
    impact_label: `${r.n} project${r.n === 1 ? '' : 's'} need a status update`,
    source_label: 'Projects',
    fix_view: 'projects',
    fix_drill: 'stalled_projects'
  };
}

async function detectTasksUnassignedNoOwner(ws) {
  const r = await single(`
    SELECT COUNT(*)::int AS n
    FROM d2_tasks
    WHERE workspace_id = :ws
      AND status = 'pending'
      AND assigned_staff_id IS NULL
      AND (description IS NULL OR description NOT ILIKE '%owner:%')
  `, { ws });
  if (!r.n) return null;
  return {
    key: 'tasks.unassigned.no_owner',
    severity: r.n >= 20 ? 'critical' : 'warning',
    title: `${r.n} Task${r.n === 1 ? '' : 's'} With No Owner`,
    description: `${r.n} pending task${r.n === 1 ? ' has' : 's have'} no assignee and no suggested owner in the description. These are likely to slip without a name attached.`,
    impact_label: `${r.n} unowned task${r.n === 1 ? '' : 's'}`,
    source_label: 'Tasks',
    fix_view: 'tasks'
  };
}

async function detectIntakeAging(ws) {
  const r = await single(`
    SELECT COUNT(*)::int AS n,
           MAX(EXTRACT(DAY FROM (NOW() - created_at))::int) AS oldest_days
    FROM d2_projects
    WHERE workspace_id = :ws
      AND intake_status = 'pending_review'
      AND created_at < NOW() - INTERVAL '7 days'
  `, { ws });
  if (!r.n) return null;
  const isCritical = r.oldest_days >= 14;
  return {
    key: 'intake.aging.7d',
    severity: isCritical ? 'critical' : 'warning',
    title: `${r.n} Intake Request${r.n === 1 ? '' : 's'} Awaiting Review for 7+ Days`,
    description: `${r.n} project request${r.n === 1 ? '' : 's'} sat in pending_review for over a week (oldest: ${r.oldest_days} days). Long delays signal to submitters that you are not responsive.`,
    impact_label: `Oldest: ${r.oldest_days} days`,
    source_label: 'Inbox',
    fix_view: 'inbox'
  };
}

async function detectMinutesUnsent(ws) {
  const r = await single(`
    SELECT COUNT(*)::int AS n
    FROM d2_meeting_minutes
    WHERE workspace_id = :ws
      AND project_id IS NOT NULL
      AND notes IS NOT NULL
      AND LENGTH(TRIM(notes)) > 0
      AND sent_at IS NULL
  `, { ws });
  if (!r.n) return null;
  return {
    key: 'minutes.unsent',
    severity: 'warning',
    title: `${r.n} Meeting Minute${r.n === 1 ? '' : 's'} Never Sent to Stakeholders`,
    description: `${r.n} meeting minute${r.n === 1 ? '' : 's'} ${r.n === 1 ? 'has notes and is' : 'have notes and are'} linked to a project but never went out. Stakeholders are missing the recap.`,
    impact_label: `${r.n} unsent recap${r.n === 1 ? '' : 's'}`,
    source_label: 'Meeting Minutes',
    fix_view: 'minutes'
  };
}

async function detectApprovedMissingKickoff(ws) {
  const r = await single(`
    SELECT COUNT(*)::int AS n
    FROM d2_projects
    WHERE workspace_id = :ws
      AND archived_at IS NULL
      AND intake_status = 'approved'
      AND kickoff_event_id IS NULL
  `, { ws });
  if (!r.n) return null;
  return {
    key: 'projects.approved.no_kickoff',
    severity: 'critical',
    title: `${r.n} Approved Project${r.n === 1 ? '' : 's'} With No Kickoff Scheduled`,
    description: `${r.n} project${r.n === 1 ? ' was' : 's were'} approved but never got a kickoff meeting scheduled. The submitter is waiting on next steps.`,
    impact_label: `${r.n} project${r.n === 1 ? '' : 's'} without kickoff`,
    source_label: 'Projects',
    fix_view: 'projects'
  };
}

async function detectOverdueMilestones(ws) {
  const r = await single(`
    SELECT COUNT(*)::int AS n
    FROM d2_project_milestones m
    JOIN d2_projects p ON p.id = m.project_id
    WHERE p.workspace_id = :ws
      AND p.archived_at IS NULL
      AND m.due_date < CURRENT_DATE
      AND m.status NOT IN ('completed', 'cancelled')
  `, { ws });
  if (!r.n) return null;
  return {
    key: 'milestones.overdue',
    severity: r.n >= 10 ? 'critical' : 'warning',
    title: `${r.n} Overdue Milestone${r.n === 1 ? '' : 's'}`,
    description: `${r.n} milestone${r.n === 1 ? '' : 's'} ${r.n === 1 ? 'is' : 'are'} past ${r.n === 1 ? 'its' : 'their'} due date and not marked complete. Either ship them or push the date.`,
    impact_label: `${r.n} overdue`,
    source_label: 'Milestones',
    fix_view: 'projects'
  };
}

async function detectProjectsPastDue(ws) {
  const r = await single(`
    SELECT COUNT(*)::int AS n
    FROM d2_projects
    WHERE workspace_id = :ws
      AND archived_at IS NULL
      AND status NOT IN ('completed', 'cancelled')
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
  `, { ws });
  if (!r.n) return null;
  return {
    key: 'projects.past_due.active',
    severity: 'critical',
    title: `${r.n} Active Project${r.n === 1 ? '' : 's'} Past Due Date`,
    description: `${r.n} project${r.n === 1 ? ' is' : 's are'} past the committed due date but still listed as active. Update the timeline or mark complete to stop the slip from compounding.`,
    impact_label: `${r.n} past due`,
    source_label: 'Projects',
    fix_view: 'projects',
    fix_drill: 'overdue_projects'
  };
}

async function detectStakeholdersMissingPhone(ws) {
  // Count projects that have at least one team_member with no phone field
  // populated — blocks the WhatsApp send feature for those people.
  const r = await single(`
    SELECT COUNT(DISTINCT p.id)::int AS n
    FROM d2_projects p,
         jsonb_array_elements(p.team_members) AS tm
    WHERE p.workspace_id = :ws
      AND p.archived_at IS NULL
      AND jsonb_array_length(COALESCE(p.team_members, '[]'::jsonb)) > 0
      AND (tm->>'phone' IS NULL OR tm->>'phone' = '')
  `, { ws });
  if (!r.n) return null;
  return {
    key: 'stakeholders.missing_phone',
    severity: 'info',
    title: `${r.n} Project${r.n === 1 ? '' : 's'} With Stakeholders Missing Phone Numbers`,
    description: `${r.n} project${r.n === 1 ? ' has' : 's have'} stakeholders without a phone on file. WhatsApp sends will skip those recipients silently.`,
    impact_label: `${r.n} project${r.n === 1 ? '' : 's'}`,
    source_label: 'Stakeholders',
    fix_view: 'projects'
  };
}

async function detectContractsDraftStale(ws) {
  // Check table exists first — contracts module is optional
  try {
    const r = await single(`
      SELECT COUNT(*)::int AS n
      FROM d2_project_contracts
      WHERE workspace_id = :ws
        AND status = 'draft'
        AND created_at < NOW() - INTERVAL '7 days'
    `, { ws });
    if (!r.n) return null;
    return {
      key: 'contracts.draft.stale',
      severity: 'warning',
      title: `${r.n} Draft Contract${r.n === 1 ? '' : 's'} Sitting for 7+ Days`,
      description: `${r.n} contract${r.n === 1 ? ' has' : 's have'} been in draft for over a week without being sent. The deal cools off until the paper is in front of the client.`,
      impact_label: `${r.n} unsent draft${r.n === 1 ? '' : 's'}`,
      source_label: 'Contracts',
      fix_view: 'projects'
    };
  } catch (_) {
    return null; // table not present, skip
  }
}

async function detectAgentsFailed(ws) {
  // Check column exists before querying (agent_status was added later)
  try {
    const r = await single(`
      SELECT COUNT(*)::int AS n
      FROM d2_tasks
      WHERE workspace_id = :ws
        AND agent_status = 'failed'
    `, { ws });
    if (!r.n) return null;
    return {
      key: 'agents.failed',
      severity: 'warning',
      title: `${r.n} AI Agent Run${r.n === 1 ? '' : 's'} Failed`,
      description: `${r.n} task agent run${r.n === 1 ? '' : 's'} ended in failure. Check the task to see the error and rerun.`,
      impact_label: `${r.n} failed run${r.n === 1 ? '' : 's'}`,
      source_label: 'AI Agents',
      fix_view: 'tasks'
    };
  } catch (_) {
    return null; // column not present yet
  }
}

// =====================================================
// ROUTES
// =====================================================

// GET /api/v1/findings — list active (non-dismissed) findings, sorted by severity
router.get('/', async (req, res) => {
  try {
    const ws = 1;
    const [dismissedRows] = await sequelize.query(`
      SELECT finding_key FROM d2_finding_dismissals
      WHERE workspace_id = :ws AND expires_at > NOW()
    `, { replacements: { ws } });
    const dismissedSet = new Set(dismissedRows.map(r => r.finding_key));
    const all = await detectAll(ws);
    const active = all.filter(f => !dismissedSet.has(f.key));
    active.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
    res.json({
      success: true,
      data: {
        findings: active,
        total: active.length,
        dismissed_count: all.length - active.length
      }
    });
  } catch (error) {
    console.error('[findings] /findings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/findings/dismiss — snooze a finding for 7 days
router.post('/dismiss', async (req, res) => {
  try {
    const ws = 1;
    const key = req.body && req.body.key ? String(req.body.key).slice(0, 120) : null;
    if (!key) return res.status(400).json({ success: false, error: 'key required' });
    const days = Math.max(1, Math.min(30, parseInt(req.body?.days, 10) || 7));
    await sequelize.query(`
      INSERT INTO d2_finding_dismissals (workspace_id, finding_key, dismissed_by, expires_at)
      VALUES (:ws, :key, :by, NOW() + (:days || ' days')::interval)
      ON CONFLICT (workspace_id, finding_key)
      DO UPDATE SET dismissed_at = NOW(),
                    dismissed_by = EXCLUDED.dismissed_by,
                    expires_at = EXCLUDED.expires_at
    `, { replacements: { ws, key, by: req.user?.email || null, days: String(days) } });
    res.json({ success: true, snoozed_days: days });
  } catch (error) {
    console.error('[findings] /findings/dismiss error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/findings/undismiss — unsnooze (mostly for debugging / undo)
router.post('/undismiss', async (req, res) => {
  try {
    const ws = 1;
    const key = req.body && req.body.key ? String(req.body.key).slice(0, 120) : null;
    if (!key) return res.status(400).json({ success: false, error: 'key required' });
    await sequelize.query(`
      DELETE FROM d2_finding_dismissals WHERE workspace_id = :ws AND finding_key = :key
    `, { replacements: { ws, key } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
