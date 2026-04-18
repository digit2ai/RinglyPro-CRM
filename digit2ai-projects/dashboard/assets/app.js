/* =====================================================
   Digit2AI Projects Hub - Frontend Application
   ===================================================== */
'use strict';

const BASE = '/projects';
const API = `${BASE}/api/v1`;
let TOKEN = localStorage.getItem('d2ai_token') || '';
let USER = JSON.parse(localStorage.getItem('d2ai_user') || 'null');
let VERTICALS = [];
let currentView = 'overview';

// =====================================================
// API HELPER
// =====================================================
async function api(path, opts = {}) {
  const url = `${API}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  return res.json();
}

// =====================================================
// AUTH
// =====================================================
function checkAuth() {
  if (TOKEN && USER) {
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('user-info').textContent = USER?.email || '';
  loadVerticals();
  loadStaff();
  loadRoles();
  navigateTo('overview');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Enter email and password'; return; }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success && data.token) {
      TOKEN = data.token;
      USER = { email: data.user?.email || email, name: data.user?.businessName || email };
      localStorage.setItem('d2ai_token', TOKEN);
      localStorage.setItem('d2ai_user', JSON.stringify(USER));
      showApp();
    } else {
      errEl.textContent = data.error || data.message || 'Login failed';
    }
  } catch (err) {
    errEl.textContent = 'Connection error';
  }
}

function logout() {
  TOKEN = '';
  USER = null;
  localStorage.removeItem('d2ai_token');
  localStorage.removeItem('d2ai_user');
  showLogin();
}

// =====================================================
// THEME (dark/light)
// =====================================================
function getTheme() {
  return localStorage.getItem('d2ai_theme') || 'dark';
}

function setTheme(theme) {
  localStorage.setItem('d2ai_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon();
  if (currentView === 'settings') renderView('settings');
}

function initTheme() {
  const theme = getTheme();
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = getTheme() === 'dark' ? '&#9728;' : '&#127769;';
}

// =====================================================
// NAVIGATION
// =====================================================
function navigateTo(view) {
  _lastDrilldown = null;
  currentView = view;
  document.querySelectorAll('.sidebar-nav li').forEach(li => {
    li.classList.toggle('active', li.dataset.view === view);
  });
  const titles = {
    overview: 'Home', contacts: 'People & Pipeline', projects: 'My Projects',
    calendar: 'Calendar', tasks: 'My To-Do List', staff: 'Staff & Roles',
    notifications: 'Alerts & Updates', ai: 'Ask AI', activity: 'Recent History', settings: 'Settings'
  };
  document.getElementById('page-title').textContent = titles[view] || view;
  renderView(view);
}

async function renderView(view) {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="spinner"></div>';
  try {
    switch (view) {
      case 'overview': await renderOverview(container); break;
      case 'contacts': await renderContacts(container); break;
      case 'projects': await renderProjects(container); break;
      case 'calendar': await renderCalendar(container); break;
      case 'tasks': await renderTasks(container); break;
      case 'staff': await renderStaff(container); break;
      case 'notifications': await renderNotifications(container); break;
      case 'ai': renderAIWorkspace(container); break;
      case 'activity': await renderActivity(container); break;
      case 'settings': renderSettings(container); break;
      case 'contact-detail': await renderContactDetail(container, view._id); break;
      case 'project-detail': await renderProjectDetail(container, view._id); break;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">&#9888;</div><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

// =====================================================
// VERTICALS
// =====================================================
async function loadVerticals() {
  try {
    const res = await api('/verticals');
    if (res.success) VERTICALS = res.data;
  } catch (e) { console.log('Verticals load error'); }
}

function verticalOptions(selectedId) {
  return `<option value="">-- Select Vertical --</option>` +
    VERTICALS.map(v => `<option value="${v.id}" ${v.id == selectedId ? 'selected' : ''}>${v.name}</option>`).join('');
}

// =====================================================
// OVERVIEW / DASHBOARD
// =====================================================
async function renderOverview(container) {
  const res = await api('/dashboard');
  if (!res.success) { container.innerHTML = '<p>Failed to load dashboard</p>'; return; }
  const d = res.data;
  const s = d.summary;

  // Welcome banner (dismissible, stored in localStorage)
  const showWelcome = !localStorage.getItem('d2ai_welcome_dismissed');
  const welcomeHtml = showWelcome ? `
    <div class="welcome-banner" id="welcome-banner">
      <div>
        <h2>Welcome to your Projects Hub!</h2>
        <p>This is your control center. Click on any card below to see details, use the <strong>+ Create</strong> button to add new items, or click the <strong>&#10024; AI button</strong> in the bottom-right corner to ask questions in plain English.</p>
      </div>
      <button class="welcome-dismiss" onclick="dismissWelcome()" title="Hide this message">&times;</button>
    </div>` : '';

  // Quick actions bar
  const quickActionsHtml = `
    <div class="quick-actions">
      <button class="quick-action-btn" onclick="openContactModal()"><span class="qa-icon">&#128100;</span><span class="qa-label">Add Person</span></button>
      <button class="quick-action-btn" onclick="openProjectModal()"><span class="qa-icon">&#128203;</span><span class="qa-label">New Project</span></button>
      <button class="quick-action-btn" onclick="openTaskModal()"><span class="qa-icon">&#9989;</span><span class="qa-label">Add To-Do</span></button>
      <button class="quick-action-btn" onclick="openEventModal()"><span class="qa-icon">&#128197;</span><span class="qa-label">Schedule Event</span></button>
      <button class="quick-action-btn" onclick="document.getElementById('nlp-panel').classList.remove('hidden')"><span class="qa-icon">&#10024;</span><span class="qa-label">Ask AI</span></button>
    </div>`;

  container.innerHTML = `
    ${welcomeHtml}
    ${quickActionsHtml}

    <div class="card-grid" style="margin-bottom:24px">
      <div class="card card-stat card-accent-purple card-clickable" onclick="drillDown('active_projects')" data-tooltip="Click to see all active projects">
        <div class="kpi-icon">&#128203;</div>
        <div class="stat-label">Your Active Projects</div>
        <div class="stat-value">${s.active_projects}</div>
        <div class="stat-change stat-neutral">${s.total_projects} total projects</div>
        <div class="kpi-hint">Click to view details</div>
      </div>
      <div class="card card-stat card-accent-red card-clickable ${s.overdue_projects > 0 ? 'card-needs-attention' : ''}" onclick="drillDown('overdue_projects')" data-tooltip="${s.overdue_projects > 0 ? 'You have projects past their due date!' : 'Great! Nothing overdue'}">
        <div class="kpi-icon">${s.overdue_projects > 0 ? '&#9888;' : '&#9989;'}</div>
        <div class="stat-label">${s.overdue_projects > 0 ? 'Overdue - Needs Attention' : 'All Projects On Track'}</div>
        <div class="stat-value">${s.overdue_projects}</div>
        <div class="stat-change ${s.overdue_projects > 0 ? 'stat-down' : 'stat-up'}">${s.overdue_projects > 0 ? 'Past due date' : 'Everything looks good!'}</div>
      </div>
      <div class="card card-stat card-accent-yellow card-clickable" onclick="drillDown('due_this_week')" data-tooltip="Projects that need to be finished this week">
        <div class="kpi-icon">&#128197;</div>
        <div class="stat-label">Due This Week</div>
        <div class="stat-value">${s.projects_due_this_week}</div>
        <div class="stat-change stat-neutral">${s.projects_due_this_week > 0 ? 'Coming up soon' : 'Nothing urgent'}</div>
      </div>
      <div class="card card-stat card-accent-green card-clickable" onclick="drillDown('contacts')" data-tooltip="Your contacts and people">
        <div class="kpi-icon">&#128101;</div>
        <div class="stat-label">Your People</div>
        <div class="stat-value">${s.total_contacts}</div>
        <div class="stat-change ${s.contacts_need_followup > 0 ? 'stat-down' : 'stat-up'}">${s.contacts_need_followup > 0 ? s.contacts_need_followup + ' need a follow-up' : 'All caught up!'}</div>
      </div>
      <div class="card card-stat card-accent-blue card-clickable ${s.overdue_tasks > 0 ? 'card-needs-attention' : ''}" onclick="drillDown('pending_tasks')" data-tooltip="Things you still need to do">
        <div class="kpi-icon">&#9989;</div>
        <div class="stat-label">Your To-Do Items</div>
        <div class="stat-value">${s.pending_tasks}</div>
        <div class="stat-change ${s.overdue_tasks > 0 ? 'stat-down' : 'stat-up'}">${s.overdue_tasks > 0 ? s.overdue_tasks + ' are overdue!' : 'On schedule'}</div>
      </div>
      <div class="card card-stat card-accent-purple card-clickable" onclick="drillDown('notifications')" data-tooltip="Messages and alerts for you">
        <div class="kpi-icon">&#128276;</div>
        <div class="stat-label">Unread Alerts</div>
        <div class="stat-value">${s.unread_notifications}</div>
        <div class="stat-change stat-neutral">${s.unread_notifications > 0 ? 'Tap to read' : 'All caught up!'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="card">
        <div class="section-header"><h3>Projects by Status</h3></div>
        <p class="section-hint">Click any bar to see projects in that status</p>
        <div class="bar-chart" id="status-chart"></div>
      </div>
      <div class="card">
        <div class="section-header"><h3>Projects by Category</h3></div>
        <p class="section-hint">See how your projects are distributed</p>
        <div class="bar-chart" id="vertical-chart"></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="card">
        <div class="section-header"><h3>Stalled Projects</h3></div>
        <p class="section-hint">Projects with no updates in the last 2 weeks</p>
        <div id="stalled-list"></div>
      </div>
      <div class="card">
        <div class="section-header"><h3>Coming Up Next</h3></div>
        <p class="section-hint">Your upcoming meetings and events</p>
        <div id="upcoming-list"></div>
      </div>
    </div>

    <div class="card">
      <div class="section-header"><h3>What's Been Happening</h3></div>
      <p class="section-hint">A log of recent actions taken in the system</p>
      <div class="timeline" id="activity-timeline"></div>
    </div>
  `;

  // Status chart - clickable bars
  const statusColors = { planning: '#2563eb', active: '#10b981', in_progress: '#3b82f6', on_hold: '#f59e0b', completed: '#64748b', cancelled: '#475569' };
  const maxStatus = Math.max(...d.projects_by_status.map(s => parseInt(s.count)), 1);
  document.getElementById('status-chart').innerHTML = d.projects_by_status.map(s =>
    `<div class="bar-row card-clickable" onclick="drillDown('projects_by_status','${s.status}')"><div class="bar-label">${s.status}</div><div class="bar-track"><div class="bar-fill" style="width:${(s.count/maxStatus)*100}%;background:${statusColors[s.status]||'#2563eb'}">${s.count}</div></div></div>`
  ).join('') || '<p style="color:var(--text-muted);font-size:13px">No projects yet. <a href="#" onclick="event.preventDefault();openProjectModal()" style="color:var(--accent)">Create your first one!</a></p>';

  // Vertical chart - clickable bars
  const maxV = Math.max(...d.vertical_distribution.map(v => parseInt(v.project_count)), 1);
  document.getElementById('vertical-chart').innerHTML = d.vertical_distribution.map(v =>
    `<div class="bar-row card-clickable" onclick="drillDown('projects_by_vertical','${v.name}')"><div class="bar-label">${v.name}</div><div class="bar-track"><div class="bar-fill" style="width:${(v.project_count/maxV)*100}%;background:${v.color}">${v.project_count}</div></div></div>`
  ).join('');

  // Stalled
  document.getElementById('stalled-list').innerHTML = d.stalled_projects.length > 0
    ? d.stalled_projects.map(p => `<div class="timeline-item" style="cursor:pointer" onclick="showProjectDetail(${p.id})"><div class="timeline-dot" style="background:var(--warning)"></div><div class="timeline-content"><strong>${p.name}</strong><br><span class="timeline-time">Last update: ${fmtDate(p.updated_at)}</span></div></div>`).join('')
    : '<p style="color:var(--text-muted);font-size:13px;padding:12px">&#9989; Great! All projects are progressing well.</p>';

  // Upcoming events - clickable
  document.getElementById('upcoming-list').innerHTML = d.upcoming_events.length > 0
    ? d.upcoming_events.map(e => `<div class="timeline-item" style="cursor:pointer" onclick="showEventDetail(${e.id})"><div class="timeline-dot" style="background:var(--info)"></div><div class="timeline-content"><strong>${e.title}</strong><br><span class="timeline-time">${fmtDateTime(e.start_time)}</span>${e.event_type ? ' <span class="status-badge status-planning">'+e.event_type+'</span>' : ''}</div></div>`).join('')
    : '<p style="color:var(--text-muted);font-size:13px;padding:12px">No events scheduled. <a href="#" onclick="event.preventDefault();openEventModal()" style="color:var(--accent)">Schedule one now</a></p>';

  // Activity
  document.getElementById('activity-timeline').innerHTML = d.recent_activity.length > 0
    ? d.recent_activity.map(a => `<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content">${a.user_email || 'System'} <strong>${a.action}</strong> ${a.entity_type} "${a.entity_name || ''}"<br><span class="timeline-time">${fmtDateTime(a.created_at)}</span></div></div>`).join('')
    : '<p style="color:var(--text-muted);font-size:13px">No activity yet. Start by adding a project or contact!</p>';
}

// =====================================================
// DRILL-DOWN: Click a KPI card to see the underlying data
// =====================================================
let _lastDrilldown = null;

async function drillDown(metric, filterValue) {
  _lastDrilldown = { metric, filterValue };
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    switch (metric) {
      case 'active_projects': {
        const res = await api('/projects?status=active');
        const res2 = await api('/projects?status=in_progress');
        const all = [...(res.data || []), ...(res2.data || [])];
        renderDrillTable(container, 'Active Projects', all, 'project');
        break;
      }
      case 'overdue_projects': {
        const res = await api('/projects/overdue');
        renderDrillTable(container, 'Overdue Projects', res.data || [], 'project');
        break;
      }
      case 'due_this_week': {
        const res = await api('/projects');
        const now = new Date();
        const weekEnd = new Date(now.getTime() + 7 * 86400000);
        const filtered = (res.data || []).filter(p =>
          p.due_date && new Date(p.due_date) >= now && new Date(p.due_date) <= weekEnd
          && !['completed','cancelled'].includes(p.status)
        );
        renderDrillTable(container, 'Projects Due This Week', filtered, 'project');
        break;
      }
      case 'contacts': {
        navigateTo('contacts');
        return;
      }
      case 'contacts_followup': {
        const res = await api('/contacts/followups');
        renderDrillTable(container, 'Contacts Needing Follow-up', res.data || [], 'contact');
        break;
      }
      case 'pending_tasks': {
        const res = await api('/tasks?status=pending');
        renderDrillTable(container, 'Pending Tasks', res.data || [], 'task');
        break;
      }
      case 'overdue_tasks': {
        const res = await api('/tasks/overdue');
        renderDrillTable(container, 'Overdue Tasks', res.data || [], 'task');
        break;
      }
      case 'notifications': {
        navigateTo('notifications');
        return;
      }
      case 'projects_by_status': {
        const res = await api(`/projects?status=${filterValue}`);
        renderDrillTable(container, `Projects: ${filterValue}`, res.data || [], 'project');
        break;
      }
      case 'projects_by_vertical': {
        const vertical = VERTICALS.find(v => v.name === filterValue);
        if (vertical) {
          const res = await api(`/projects?vertical_id=${vertical.id}`);
          renderDrillTable(container, `Projects: ${filterValue}`, res.data || [], 'project');
        }
        break;
      }
      case 'stalled_projects': {
        const res = await api('/projects/stalled');
        renderDrillTable(container, 'Stalled Projects (no update in 14 days)', res.data || [], 'project');
        break;
      }
      default:
        navigateTo('overview');
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p><button class="btn btn-ghost" onclick="navigateTo('overview')">Back to Overview</button></div>`;
  }
}

function renderDrillTable(container, title, items, type) {
  let tableHtml = '';

  if (type === 'project') {
    tableHtml = `<table class="data-table"><thead><tr><th>Project</th><th>Vertical</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Progress</th></tr></thead><tbody>` +
      (items.length > 0 ? items.map(p => {
        const isOverdue = p.due_date && new Date(p.due_date) < new Date() && !['completed','cancelled'].includes(p.status);
        return `<tr class="clickable" onclick="showProjectDetail(${p.id})">
          <td><strong>${p.name}</strong>${p.code ? '<br><span style="font-size:11px;color:var(--text-muted)">'+p.code+'</span>' : ''}</td>
          <td>${p.vertical ? '<span class="vertical-dot" style="background:'+p.vertical.color+'"></span>'+p.vertical.name : '-'}</td>
          <td><span class="status-badge status-${isOverdue ? 'overdue' : p.status}">${isOverdue ? 'OVERDUE' : p.status}</span></td>
          <td><span class="priority-badge priority-${p.priority}">${p.priority}</span></td>
          <td>${p.due_date ? fmtDate(p.due_date) : '-'}</td>
          <td><div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:${p.progress}%"></div></div> <span style="font-size:11px;color:var(--text-muted)">${p.progress}%</span></td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">No items found</td></tr>') +
      '</tbody></table>';
  } else if (type === 'contact') {
    tableHtml = `<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Status</th><th>Follow-up</th></tr></thead><tbody>` +
      (items.length > 0 ? items.map(c => `<tr class="clickable" onclick="showContactDetail(${c.id})">
        <td><strong>${c.first_name} ${c.last_name || ''}</strong>${c.title ? '<br><span style="font-size:12px;color:var(--text-muted)">'+c.title+'</span>' : ''}</td>
        <td>${c.email || '-'}</td>
        <td>${c.company?.name || '-'}</td>
        <td><span class="status-badge status-${c.status}">${c.status}</span></td>
        <td>${c.next_followup_date ? fmtDate(c.next_followup_date) : '-'}</td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">No items found</td></tr>') +
      '</tbody></table>';
  } else if (type === 'task') {
    const now = new Date();
    tableHtml = `<table class="data-table"><thead><tr><th>Task</th><th>Type</th><th>Priority</th><th>Project</th><th>Due</th><th>Actions</th></tr></thead><tbody>` +
      (items.length > 0 ? items.map(t => {
        const isOverdue = t.due_date && new Date(t.due_date) < now && t.status === 'pending';
        return `<tr class="clickable" onclick="showTaskDetail(${t.id})">
          <td><strong>${t.title}</strong>${t.description ? '<br><span style="font-size:12px;color:var(--text-muted)">'+t.description.substring(0,60)+'</span>' : ''}</td>
          <td><span class="status-badge status-${t.task_type === 'reminder' ? 'on_hold' : 'planning'}">${t.task_type}</span></td>
          <td><span class="priority-badge priority-${t.priority}">${t.priority}</span></td>
          <td>${t.project?.name || '-'}</td>
          <td><span style="color:${isOverdue ? 'var(--danger)' : 'var(--text-secondary)'}">${t.due_date ? fmtDate(t.due_date) : '-'}${isOverdue ? ' (overdue)' : ''}</span></td>
          <td>${t.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();completeTask(${t.id})">Done</button>` : '<span class="status-badge status-completed">done</span>'}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">No items found</td></tr>') +
      '</tbody></table>';
  }

  const itemWord = items.length === 1 ? 'item' : 'items';
  container.innerHTML = `
    <div class="section-header" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('overview')">&#8592; Back to Home</button>
        <h3>${title}</h3>
        <span class="status-badge status-planning">${items.length} ${itemWord}</span>
      </div>
    </div>
    ${items.length === 0 ? '<div class="empty-state"><div class="empty-icon">&#128269;</div><h3>Nothing here</h3><p>No items match this view right now.</p><button class="btn btn-ghost" onclick="navigateTo(\'overview\')">Go Back Home</button></div>' : tableHtml}
  `;
}

// =====================================================
// CONTACTS — Tabbed view: Table | Pipeline | Campaigns | Workflows
// =====================================================
let contactsPage = 1;
let contactsTab = 'table';

const PIPELINE_STAGES = ['prospect', 'lead', 'cold_lead', 'warm_lead', 'hot_lead', 'client'];
const STAGE_LABELS = { prospect: 'Prospect', lead: 'Lead', cold_lead: 'Cold Lead', warm_lead: 'Warm Lead', hot_lead: 'Hot Lead', client: 'Client' };
const STAGE_COLORS = { prospect: '#64748b', lead: '#2563eb', cold_lead: '#06b6d4', warm_lead: '#f59e0b', hot_lead: '#ef4444', client: '#10b981' };

async function renderContacts(container, page = 1) {
  contactsPage = page;
  container.innerHTML = `
    <div class="contacts-tabs" style="display:flex;gap:2px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:0">
      <button class="contacts-tab ${contactsTab==='table'?'active':''}" onclick="contactsTab='table';renderContacts(document.getElementById('view-container'))" style="padding:10px 20px;border:none;background:none;color:${contactsTab==='table'?'var(--accent)':'var(--text-secondary)'};font-weight:${contactsTab==='table'?'600':'400'};border-bottom:2px solid ${contactsTab==='table'?'var(--accent)':'transparent'};cursor:pointer;margin-bottom:-2px">&#128101; Contacts</button>
      <button class="contacts-tab ${contactsTab==='pipeline'?'active':''}" onclick="contactsTab='pipeline';renderContacts(document.getElementById('view-container'))" style="padding:10px 20px;border:none;background:none;color:${contactsTab==='pipeline'?'var(--accent)':'var(--text-secondary)'};font-weight:${contactsTab==='pipeline'?'600':'400'};border-bottom:2px solid ${contactsTab==='pipeline'?'var(--accent)':'transparent'};cursor:pointer;margin-bottom:-2px">&#128200; Pipeline</button>
      <button class="contacts-tab ${contactsTab==='campaigns'?'active':''}" onclick="contactsTab='campaigns';renderContacts(document.getElementById('view-container'))" style="padding:10px 20px;border:none;background:none;color:${contactsTab==='campaigns'?'var(--accent)':'var(--text-secondary)'};font-weight:${contactsTab==='campaigns'?'600':'400'};border-bottom:2px solid ${contactsTab==='campaigns'?'var(--accent)':'transparent'};cursor:pointer;margin-bottom:-2px">&#9993; Campaigns</button>
      <button class="contacts-tab ${contactsTab==='workflows'?'active':''}" onclick="contactsTab='workflows';renderContacts(document.getElementById('view-container'))" style="padding:10px 20px;border:none;background:none;color:${contactsTab==='workflows'?'var(--accent)':'var(--text-secondary)'};font-weight:${contactsTab==='workflows'?'600':'400'};border-bottom:2px solid ${contactsTab==='workflows'?'var(--accent)':'transparent'};cursor:pointer;margin-bottom:-2px">&#9881; Workflows</button>
    </div>
    <div id="contacts-tab-content"></div>
  `;
  const tabContainer = document.getElementById('contacts-tab-content');
  switch (contactsTab) {
    case 'table': await renderContactsTable(tabContainer, page); break;
    case 'pipeline': await renderPipelineBoard(tabContainer); break;
    case 'campaigns': await renderCampaigns(tabContainer); break;
    case 'workflows': await renderWorkflows(tabContainer); break;
  }
}

async function renderContactsTable(container, page = 1) {
  const params = new URLSearchParams({ page, limit: 30 });
  const searchVal = document.getElementById('global-search')?.value;
  if (searchVal) params.set('search', searchVal);

  const res = await api(`/contacts?${params}`);
  if (!res.success) return;

  container.innerHTML = `
    <div class="section-header">
      <div class="filter-bar">
        <input type="text" placeholder="Search contacts..." id="contact-search" value="${searchVal || ''}" style="width:250px">
        <select id="contact-status-filter">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="lead">Lead</option>
          <option value="prospect">Prospect</option>
          <option value="client">Client</option>
          <option value="partner">Partner</option>
        </select>
        <select id="contact-vertical-filter">
          ${verticalOptions('')}
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="openCsvImportModal()">&#128228; Import CSV</button>
        <button class="btn btn-primary btn-sm" onclick="openContactModal()">+ Add Person</button>
      </div>
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Name</th><th>Email</th><th>Company</th><th>Vertical</th><th>Stage</th><th>Follow-up</th>
      </tr></thead>
      <tbody id="contacts-tbody"></tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:13px;color:var(--text-secondary)">
      <span>${res.total} contacts (page ${res.page}/${res.pages})</span>
      <div style="display:flex;gap:8px">
        ${res.page > 1 ? `<button class="btn btn-ghost btn-sm" onclick="renderContactsTable(document.getElementById('contacts-tab-content'),${res.page-1})">Prev</button>` : ''}
        ${res.page < res.pages ? `<button class="btn btn-ghost btn-sm" onclick="renderContactsTable(document.getElementById('contacts-tab-content'),${res.page+1})">Next</button>` : ''}
      </div>
    </div>
  `;

  document.getElementById('contacts-tbody').innerHTML = res.data.length > 0
    ? res.data.map(c => {
        const stage = c.pipeline_stage || 'prospect';
        return `<tr class="clickable" onclick="showContactDetail(${c.id})">
        <td><strong>${c.first_name} ${c.last_name || ''}</strong>${c.title ? '<br><span style="font-size:12px;color:var(--text-muted)">'+c.title+'</span>' : ''}</td>
        <td>${c.email || '-'}</td>
        <td>${c.company?.name || '-'}</td>
        <td>${c.vertical ? '<span class="vertical-dot" style="background:'+c.vertical.color+'"></span>'+c.vertical.name : '-'}</td>
        <td><span class="status-badge" style="background:${STAGE_COLORS[stage]}20;color:${STAGE_COLORS[stage]}">${STAGE_LABELS[stage] || stage}</span></td>
        <td>${c.next_followup_date ? fmtDate(c.next_followup_date) : '-'}</td>
      </tr>`;
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No people added yet.<br><br><button class="btn btn-primary" onclick="openContactModal()">&#128100; Add Your First Person</button><br><span style="font-size:12px;margin-top:8px;display:block">or use the AI: "Add contact John Smith"</span></td></tr>';

  const searchInput = document.getElementById('contact-search');
  let searchTimeout;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const s = searchInput.value;
      const url = new URLSearchParams({ page: 1, limit: 30, search: s });
      api(`/contacts?${url}`).then(r => {
        if (r.success) {
          document.getElementById('contacts-tbody').innerHTML = r.data.map(c => {
            const stage = c.pipeline_stage || 'prospect';
            return `<tr class="clickable" onclick="showContactDetail(${c.id})">
            <td><strong>${c.first_name} ${c.last_name || ''}</strong></td>
            <td>${c.email || '-'}</td>
            <td>${c.company?.name || '-'}</td>
            <td>${c.vertical ? '<span class="vertical-dot" style="background:'+c.vertical.color+'"></span>'+c.vertical.name : '-'}</td>
            <td><span class="status-badge" style="background:${STAGE_COLORS[stage]}20;color:${STAGE_COLORS[stage]}">${STAGE_LABELS[stage] || stage}</span></td>
            <td>${c.next_followup_date ? fmtDate(c.next_followup_date) : '-'}</td>
          </tr>`;
          }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No results</td></tr>';
        }
      });
    }, 300);
  });
}

// =====================================================
// PIPELINE BOARD (Kanban)
// =====================================================
async function renderPipelineBoard(container) {
  const res = await api('/pipeline');
  if (!res.success) { container.innerHTML = '<p style="color:var(--danger)">Failed to load pipeline</p>'; return; }

  const pipeline = res.data;
  container.innerHTML = `
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:14px;color:var(--text-secondary)">${res.total} total contacts in pipeline</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="openCsvImportModal()">&#128228; Import CSV</button>
        <button class="btn btn-primary btn-sm" onclick="openContactModal()">+ Add Person</button>
      </div>
    </div>
    <div class="pipeline-board" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:16px;min-height:400px">
      ${PIPELINE_STAGES.map(stage => {
        const data = pipeline[stage] || { label: STAGE_LABELS[stage], count: 0, contacts: [] };
        return `<div class="pipeline-column" style="min-width:220px;flex:1;background:var(--bg-card);border-radius:var(--radius);border:1px solid var(--border)">
          <div style="padding:12px 16px;border-bottom:2px solid ${STAGE_COLORS[stage]};display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:13px;color:${STAGE_COLORS[stage]}">${data.label}</strong>
            <span style="background:${STAGE_COLORS[stage]}20;color:${STAGE_COLORS[stage]};padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600">${data.count}</span>
          </div>
          <div class="pipeline-cards" style="padding:8px;max-height:500px;overflow-y:auto;display:flex;flex-direction:column;gap:6px"
               ondragover="event.preventDefault();this.style.background='var(--bg-hover)'"
               ondragleave="this.style.background=''"
               ondrop="handlePipelineDrop(event,'${stage}');this.style.background=''">
            ${data.contacts.length > 0 ? data.contacts.slice(0, 20).map(c => `
              <div class="pipeline-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${c.id}')"
                   onclick="showContactDetail(${c.id})"
                   style="padding:10px 12px;background:var(--bg-secondary);border-radius:var(--radius);cursor:pointer;border:1px solid var(--border);font-size:13px">
                <strong>${c.first_name} ${c.last_name || ''}</strong>
                ${c.email ? '<br><span style="font-size:11px;color:var(--text-muted)">'+c.email+'</span>' : ''}
                ${c.company?.name ? '<br><span style="font-size:11px;color:var(--text-secondary)">'+c.company.name+'</span>' : ''}
                ${c.vertical ? '<br><span class="tag" style="font-size:10px;margin-top:4px;display:inline-block;background:'+c.vertical.color+'20;color:'+c.vertical.color+'">'+c.vertical.name+'</span>' : ''}
              </div>
            `).join('') : '<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:20px 8px">No contacts</p>'}
            ${data.count > 20 ? `<p style="font-size:11px;color:var(--text-muted);text-align:center">+${data.count - 20} more</p>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

async function handlePipelineDrop(event, newStage) {
  event.preventDefault();
  const contactId = event.dataTransfer.getData('text/plain');
  if (!contactId) return;
  await api(`/pipeline/${contactId}/stage`, { method: 'PUT', body: JSON.stringify({ stage: newStage, trigger_type: 'manual' }) });
  renderPipelineBoard(document.getElementById('contacts-tab-content'));
}

// =====================================================
// CSV IMPORT MODAL
// =====================================================
function openCsvImportModal() {
  openModal('Import Contacts from CSV', `
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Upload a CSV or tab-delimited file. Must have a header row with columns like: first_name, last_name, email, phone, company, title, notes</p>
    <div class="form-row">
      <div class="form-group"><label>Vertical</label><select id="m-import-vertical">${verticalOptions('')}</select></div>
      <div class="form-group"><label>Pipeline Stage</label>
        <select id="m-import-stage">
          ${PIPELINE_STAGES.map(s => `<option value="${s}" ${s==='prospect'?'selected':''}>${STAGE_LABELS[s]}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group"><label>Delimiter</label>
      <select id="m-import-delimiter">
        <option value=",">Comma (,)</option>
        <option value="tab">Tab</option>
        <option value=";">Semicolon (;)</option>
      </select>
    </div>
    <div class="form-group">
      <label>CSV File</label>
      <input type="file" id="m-import-file" accept=".csv,.txt,.tsv" style="padding:8px">
    </div>
    <div class="form-group">
      <label>Or Paste CSV Text</label>
      <textarea id="m-import-text" rows="6" placeholder="first_name,last_name,email,phone&#10;John,Smith,john@example.com,555-0100"></textarea>
    </div>
    <div id="import-result" style="display:none;margin-top:12px;padding:12px;border-radius:var(--radius);font-size:13px"></div>
  `, async () => {
    const vertical_id = document.getElementById('m-import-vertical').value;
    const stage = document.getElementById('m-import-stage').value;
    const delimiter = document.getElementById('m-import-delimiter').value;
    const file = document.getElementById('m-import-file').files?.[0];
    const pastedText = document.getElementById('m-import-text').value.trim();
    const resultEl = document.getElementById('import-result');

    let csvText = pastedText;
    if (file) {
      csvText = await file.text();
    }
    if (!csvText) { alert('Please upload a file or paste CSV text'); return; }

    resultEl.style.display = 'block';
    resultEl.style.background = 'var(--bg-hover)';
    resultEl.innerHTML = '<span style="color:var(--accent)">Importing...</span>';

    try {
      const params = new URLSearchParams({ pipeline_stage: stage, delimiter });
      if (vertical_id) params.set('vertical_id', vertical_id);
      const res = await fetch(`${API}/pipeline/import?${params}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'text/plain' },
        body: csvText
      });
      const data = await res.json();
      if (data.success) {
        resultEl.style.background = '#10b98120';
        resultEl.innerHTML = `<strong style="color:var(--success)">Import Complete</strong><br>
          Imported: <strong>${data.imported}</strong> | Duplicates: ${data.duplicates} | Skipped: ${data.skipped} | Total Rows: ${data.total_rows}
          ${data.errors?.length ? '<br><br><strong>Errors:</strong><br>' + data.errors.join('<br>') : ''}`;
      } else {
        resultEl.style.background = '#ef444420';
        resultEl.innerHTML = `<strong style="color:var(--danger)">Error</strong>: ${data.error}${data.detected_headers ? '<br>Detected headers: ' + data.detected_headers.join(', ') : ''}`;
      }
    } catch (err) {
      resultEl.style.background = '#ef444420';
      resultEl.innerHTML = `<strong style="color:var(--danger)">Error</strong>: ${err.message}`;
    }
  });
}

// =====================================================
// CAMPAIGNS
// =====================================================
async function renderCampaigns(container) {
  const res = await api('/campaigns');
  if (!res.success) { container.innerHTML = '<p style="color:var(--danger)">Failed to load campaigns</p>'; return; }

  container.innerHTML = `
    <div class="section-header">
      <span style="font-size:14px;color:var(--text-secondary)">${res.data.length} campaign(s)</span>
      <button class="btn btn-primary btn-sm" onclick="openCampaignModal()">+ New Campaign</button>
    </div>
    ${res.data.length > 0 ? `<table class="data-table">
      <thead><tr><th>Campaign</th><th>Subject</th><th>Target Stage</th><th>Status</th><th>Sent</th><th>Opens</th><th>Clicks</th><th>Actions</th></tr></thead>
      <tbody>
        ${res.data.map(c => `<tr>
          <td><strong>${c.name}</strong></td>
          <td>${c.subject}</td>
          <td>${c.target_stage ? `<span class="status-badge" style="background:${STAGE_COLORS[c.target_stage]||'#64748b'}20;color:${STAGE_COLORS[c.target_stage]||'#64748b'}">${STAGE_LABELS[c.target_stage]||c.target_stage}</span>` : 'All'}</td>
          <td><span class="status-badge status-${c.status === 'sent' ? 'completed' : c.status === 'sending' ? 'active' : 'planning'}">${c.status}</span></td>
          <td>${c.sent_count || 0}</td>
          <td>${c.open_count || 0}</td>
          <td>${c.click_count || 0}</td>
          <td style="display:flex;gap:4px">
            ${c.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="sendCampaign(${c.id})">Send</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="openCampaignModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">Edit</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteCampaign(${c.id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state"><div class="empty-icon">&#9993;</div><h3>No campaigns yet</h3><p>Create an email campaign to reach your contacts via SendGrid.</p><button class="get-started-btn" onclick="openCampaignModal()">&#9993; Create Your First Campaign</button></div>'}
  `;
}

function openCampaignModal(existing) {
  const c = existing || {};
  openModal(c.id ? 'Edit Campaign' : 'New Campaign', `
    <div class="form-group"><label>Campaign Name *</label><input type="text" id="m-cname" value="${c.name || ''}"></div>
    <div class="form-group"><label>Email Subject *</label><input type="text" id="m-csubject" value="${c.subject || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label>From Name</label><input type="text" id="m-cfrom-name" value="${c.from_name || ''}"></div>
      <div class="form-group"><label>From Email</label><input type="email" id="m-cfrom-email" value="${c.from_email || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Target Stage</label>
        <select id="m-ctarget-stage">
          <option value="">All Contacts</option>
          ${PIPELINE_STAGES.map(s => `<option value="${s}" ${c.target_stage===s?'selected':''}>${STAGE_LABELS[s]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Target Vertical</label><select id="m-ctarget-vertical">${verticalOptions(c.target_vertical_id)}</select></div>
    </div>
    <div class="form-group">
      <label>Email Body (HTML) *</label>
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Use {{first_name}}, {{last_name}}, {{email}}, {{company}} for personalization</p>
      <textarea id="m-cbody" rows="10" style="font-family:monospace;font-size:12px">${c.body_html || '<p>Hi {{first_name}},</p>\\n<p>Your message here...</p>\\n<p>Best regards</p>'}</textarea>
    </div>
  `, async () => {
    const data = {
      name: document.getElementById('m-cname').value.trim(),
      subject: document.getElementById('m-csubject').value.trim(),
      from_name: document.getElementById('m-cfrom-name').value.trim(),
      from_email: document.getElementById('m-cfrom-email').value.trim(),
      target_stage: document.getElementById('m-ctarget-stage').value || null,
      target_vertical_id: document.getElementById('m-ctarget-vertical').value || null,
      body_html: document.getElementById('m-cbody').value.trim()
    };
    if (!data.name || !data.subject || !data.body_html) { alert('Name, subject, and body are required'); return; }
    if (c.id) {
      await api(`/campaigns/${c.id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/campaigns', { method: 'POST', body: JSON.stringify(data) });
    }
    closeModal();
    renderCampaigns(document.getElementById('contacts-tab-content'));
  });
}

async function sendCampaign(id) {
  if (!confirm('Send this campaign now? Emails will be sent to all matching contacts via SendGrid.')) return;
  const res = await api(`/campaigns/${id}/send`, { method: 'POST' });
  if (res.success) {
    alert(`Campaign sent to ${res.data?.sent_count || 0} contacts!`);
  } else {
    alert('Error: ' + (res.error || 'Failed to send'));
  }
  renderCampaigns(document.getElementById('contacts-tab-content'));
}

async function deleteCampaign(id) {
  if (!confirm('Delete this campaign permanently?')) return;
  await api(`/campaigns/${id}`, { method: 'DELETE' });
  renderCampaigns(document.getElementById('contacts-tab-content'));
}

// =====================================================
// WORKFLOWS
// =====================================================
async function renderWorkflows(container) {
  const res = await api('/workflows');
  if (!res.success) { container.innerHTML = '<p style="color:var(--danger)">Failed to load workflows</p>'; return; }

  container.innerHTML = `
    <div class="section-header">
      <span style="font-size:14px;color:var(--text-secondary)">${res.data.length} workflow(s)</span>
      <div style="display:flex;gap:8px">
        ${res.data.length === 0 ? `<button class="btn btn-ghost btn-sm" onclick="seedDefaultWorkflow()">&#9889; Create Default Workflow</button>` : ''}
        <button class="btn btn-primary btn-sm" onclick="openWorkflowModal()">+ New Workflow</button>
      </div>
    </div>
    ${res.data.length > 0 ? res.data.map(w => `
      <div class="card" style="margin-bottom:16px;border-left:3px solid ${w.active ? 'var(--success)' : 'var(--text-muted)'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <h3 style="font-size:16px;margin-bottom:4px">${w.name}</h3>
            ${w.description ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">${w.description}</p>` : ''}
            <div style="display:flex;gap:8px;align-items:center;font-size:12px">
              <span class="status-badge status-${w.active ? 'active' : 'on_hold'}">${w.active ? 'Active' : 'Inactive'}</span>
              <span style="color:var(--text-muted)">Trigger: ${w.trigger_type}</span>
              <span style="color:var(--text-muted)">${(w.steps || []).length} steps</span>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="showWorkflowDetail(${w.id})">View</button>
            <button class="btn btn-ghost btn-sm" onclick="openWorkflowModal(${JSON.stringify(w).replace(/"/g,'&quot;')})">Edit</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteWorkflow(${w.id})">Delete</button>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          ${(w.steps || []).map((step, i) => {
            const typeIcons = { change_stage: '&#128200;', send_email: '&#9993;', wait: '&#9203;', condition: '&#10067;', tag: '&#127991;', notify: '&#128276;' };
            return `<div style="display:flex;align-items:center;gap:4px;font-size:11px;padding:4px 8px;background:var(--bg-hover);border-radius:var(--radius)">
              <span>${typeIcons[step.type] || '&#9679;'}</span>
              <span>${step.name || step.type}</span>
              ${i < (w.steps||[]).length - 1 ? '<span style="color:var(--text-muted)">&#8594;</span>' : ''}
            </div>`;
          }).join('')}
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-primary btn-sm" onclick="openEnrollModal(${w.id})">Enroll Contacts</button>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-icon">&#9881;</div><h3>No workflows yet</h3><p>Workflows automate your pipeline — move contacts through stages, send emails, and tag based on engagement.</p><button class="get-started-btn" onclick="seedDefaultWorkflow()">&#9889; Create Default Prospecting Workflow</button></div>'}
  `;
}

async function seedDefaultWorkflow() {
  const res = await api('/workflows/seed-default', { method: 'POST' });
  if (res.success) {
    alert('Default prospecting workflow created!');
  } else {
    alert('Error: ' + (res.error || 'Failed'));
  }
  renderWorkflows(document.getElementById('contacts-tab-content'));
}

function openWorkflowModal(existing) {
  const w = existing || {};
  const stepsJson = JSON.stringify(w.steps || [], null, 2);
  openModal(w.id ? 'Edit Workflow' : 'New Workflow', `
    <div class="form-group"><label>Workflow Name *</label><input type="text" id="m-wname" value="${w.name || ''}"></div>
    <div class="form-group"><label>Description</label><textarea id="m-wdesc">${w.description || ''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Trigger Type</label>
        <select id="m-wtrigger">
          <option value="manual" ${w.trigger_type==='manual'?'selected':''}>Manual</option>
          <option value="stage_change" ${w.trigger_type==='stage_change'?'selected':''}>Stage Change</option>
          <option value="email_event" ${w.trigger_type==='email_event'?'selected':''}>Email Event</option>
          <option value="import" ${w.trigger_type==='import'?'selected':''}>Contact Import</option>
        </select>
      </div>
      <div class="form-group"><label>Active</label>
        <select id="m-wactive">
          <option value="true" ${w.active !== false ? 'selected' : ''}>Active</option>
          <option value="false" ${w.active === false ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Steps (JSON)</label>
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Each step: { "type": "change_stage|send_email|wait|condition|tag|notify", "name": "...", "config": {...} }</p>
      <textarea id="m-wsteps" rows="10" style="font-family:monospace;font-size:12px">${stepsJson}</textarea>
    </div>
  `, async () => {
    let steps;
    try {
      steps = JSON.parse(document.getElementById('m-wsteps').value.trim() || '[]');
    } catch (e) { alert('Invalid JSON in steps field'); return; }
    const data = {
      name: document.getElementById('m-wname').value.trim(),
      description: document.getElementById('m-wdesc').value.trim(),
      trigger_type: document.getElementById('m-wtrigger').value,
      active: document.getElementById('m-wactive').value === 'true',
      steps
    };
    if (!data.name) { alert('Workflow name is required'); return; }
    if (w.id) {
      await api(`/workflows/${w.id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/workflows', { method: 'POST', body: JSON.stringify(data) });
    }
    closeModal();
    renderWorkflows(document.getElementById('contacts-tab-content'));
  });
}

async function showWorkflowDetail(id) {
  const res = await api(`/workflows/${id}`);
  if (!res.success) return;
  const w = res.data;
  const typeIcons = { change_stage: '&#128200;', send_email: '&#9993;', wait: '&#9203;', condition: '&#10067;', tag: '&#127991;', notify: '&#128276;' };

  const container = document.getElementById('contacts-tab-content');
  container.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="contactsTab='workflows';renderContacts(document.getElementById('view-container'))" style="margin-bottom:8px">&#8592; Back to Workflows</button>
          <h2>${w.name}</h2>
          ${w.description ? `<p style="color:var(--text-secondary)">${w.description}</p>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="openEnrollModal(${w.id})">Enroll Contacts</button>
          <button class="btn btn-ghost btn-sm" onclick="openWorkflowModal(${JSON.stringify(w).replace(/"/g,'&quot;')})">Edit</button>
        </div>
      </div>
      <div class="detail-meta">
        <span class="status-badge status-${w.active ? 'active' : 'on_hold'}">${w.active ? 'Active' : 'Inactive'}</span>
        <span style="color:var(--text-muted);font-size:13px">Trigger: ${w.trigger_type}</span>
      </div>
      <div style="margin-top:24px">
        <h4 style="margin-bottom:16px">Workflow Steps</h4>
        <div class="workflow-steps" style="display:flex;flex-direction:column;gap:8px">
          ${(w.steps || []).map((step, i) => `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius)">
              <div style="min-width:32px;height:32px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600">${i + 1}</div>
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-size:16px">${typeIcons[step.type] || '&#9679;'}</span>
                  <strong style="font-size:14px">${step.name || step.type}</strong>
                  <span class="tag">${step.type}</span>
                </div>
                ${step.config ? `<div style="font-size:12px;color:var(--text-secondary)">
                  ${step.type === 'change_stage' && step.config.to_stage ? 'Move to: <strong>' + (STAGE_LABELS[step.config.to_stage] || step.config.to_stage) + '</strong>' : ''}
                  ${step.type === 'wait' && step.config.days ? 'Wait <strong>' + step.config.days + ' day(s)</strong>' : ''}
                  ${step.type === 'send_email' && step.config.subject ? 'Subject: <strong>' + step.config.subject + '</strong>' : ''}
                  ${step.type === 'condition' && step.config.field ? 'If ' + step.config.field + ' ' + (step.config.operator||'') + ' ' + (step.config.value||'') : ''}
                  ${step.type === 'tag' && step.config.tag ? 'Add tag: <strong>' + step.config.tag + '</strong>' : ''}
                  ${step.type === 'notify' && step.config.message ? step.config.message : ''}
                </div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function openEnrollModal(workflowId) {
  openModal('Enroll Contacts into Workflow', `
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Select which contacts to enroll in this workflow by stage and/or vertical.</p>
    <div class="form-row">
      <div class="form-group"><label>Pipeline Stage</label>
        <select id="m-enroll-stage">
          <option value="">All Stages</option>
          ${PIPELINE_STAGES.map(s => `<option value="${s}">${STAGE_LABELS[s]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Vertical</label><select id="m-enroll-vertical">${verticalOptions('')}</select></div>
    </div>
    <div class="form-group">
      <label>Or enter specific Contact IDs (comma-separated)</label>
      <input type="text" id="m-enroll-ids" placeholder="e.g. 1, 5, 12">
    </div>
    <div id="enroll-result" style="display:none;margin-top:12px;padding:12px;border-radius:var(--radius);font-size:13px"></div>
  `, async () => {
    const stage = document.getElementById('m-enroll-stage').value;
    const verticalId = document.getElementById('m-enroll-vertical').value;
    const idsText = document.getElementById('m-enroll-ids').value.trim();
    const resultEl = document.getElementById('enroll-result');

    let contact_ids = [];
    if (idsText) {
      contact_ids = idsText.split(',').map(s => parseInt(s.trim())).filter(n => n > 0);
    } else {
      // Fetch contacts matching criteria
      const params = new URLSearchParams({ limit: 500 });
      if (stage) params.set('pipeline_stage', stage);
      const contactsRes = await api(`/contacts?${params}`);
      if (contactsRes.success) {
        let filtered = contactsRes.data;
        if (verticalId) filtered = filtered.filter(c => c.vertical_id == verticalId);
        if (stage) filtered = filtered.filter(c => (c.pipeline_stage || 'prospect') === stage);
        contact_ids = filtered.map(c => c.id);
      }
    }

    if (contact_ids.length === 0) { alert('No contacts match the criteria'); return; }

    resultEl.style.display = 'block';
    resultEl.style.background = 'var(--bg-hover)';
    resultEl.innerHTML = `<span style="color:var(--accent)">Enrolling ${contact_ids.length} contacts...</span>`;

    const res = await api(`/workflows/${workflowId}/enroll`, { method: 'POST', body: JSON.stringify({ contact_ids }) });
    if (res.success) {
      resultEl.style.background = '#10b98120';
      resultEl.innerHTML = `<strong style="color:var(--success)">Enrolled ${res.enrolled || contact_ids.length} contacts</strong>`;
    } else {
      resultEl.style.background = '#ef444420';
      resultEl.innerHTML = `<strong style="color:var(--danger)">Error</strong>: ${res.error}`;
    }
  });
}

async function deleteWorkflow(id) {
  if (!confirm('Delete this workflow permanently?')) return;
  await api(`/workflows/${id}`, { method: 'DELETE' });
  renderWorkflows(document.getElementById('contacts-tab-content'));
}

// =====================================================
// PROJECTS
// =====================================================
async function renderProjects(container) {
  const res = await api('/projects');
  if (!res.success) return;

  container.innerHTML = `
    <div class="section-header">
      <div class="filter-bar">
        <input type="text" placeholder="Search projects..." id="project-search" style="width:250px">
        <select id="project-status-filter">
          <option value="">All Status</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="in_progress">In Progress</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
        </select>
        <select id="project-priority-filter">
          <option value="">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="printProjectsPDF()" title="Print / Export PDF">Print PDF</button>
      <button class="btn btn-primary btn-sm" onclick="openProjectModal()">+ New Project</button>
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Project</th><th>Vertical</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Progress</th>
      </tr></thead>
      <tbody id="projects-tbody"></tbody>
    </table>
  `;

  document.getElementById('projects-tbody').innerHTML = res.data.length > 0
    ? res.data.map(p => {
        const isOverdue = p.due_date && new Date(p.due_date) < new Date() && !['completed','cancelled'].includes(p.status);
        return `<tr class="clickable" onclick="showProjectDetail(${p.id})">
          <td><strong>${p.name}</strong>${p.code ? '<br><span style="font-size:11px;color:var(--text-muted)">'+p.code+'</span>' : ''}</td>
          <td>${p.vertical ? '<span class="vertical-dot" style="background:'+p.vertical.color+'"></span>'+p.vertical.name : '-'}</td>
          <td><span class="status-badge status-${isOverdue ? 'overdue' : p.status}">${isOverdue ? 'OVERDUE' : p.status}</span></td>
          <td><span class="priority-badge priority-${p.priority}">${p.priority}</span></td>
          <td>${p.due_date ? fmtDate(p.due_date) : '-'}</td>
          <td><div class="progress-bar" style="width:100px"><div class="progress-fill" style="width:${p.progress}%"></div></div><span style="font-size:11px;color:var(--text-muted);margin-left:8px">${p.progress}%</span></td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No projects yet.<br><br><button class="btn btn-primary" onclick="openProjectModal()">&#128203; Create Your First Project</button><br><span style="font-size:12px;margin-top:8px;display:block">or use the AI: "Start a new project called Website Redesign"</span></td></tr>';
}

// Print Projects as PDF
async function printProjectsPDF() {
  const res = await api('/projects');
  if (!res.success || !res.data.length) { alert('No projects to print.'); return; }
  const projects = res.data;
  const now = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  const rows = projects.map(p => {
    const isOverdue = p.due_date && new Date(p.due_date) < new Date() && !['completed','cancelled'].includes(p.status);
    return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #ddd;vertical-align:top">
          <strong style="font-size:14px">${p.name}</strong>
          ${p.code ? '<br><span style="font-size:11px;color:#888">'+p.code+'</span>' : ''}
        </td>
        <td style="padding:12px 10px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px">${p.vertical?.name || '-'}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px;font-weight:600;color:${isOverdue?'#dc2626':p.status==='completed'?'#16a34a':'#333'}">
          ${isOverdue ? 'OVERDUE' : p.status?.replace(/_/g,' ')}
        </td>
        <td style="padding:12px 10px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px">${p.priority}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px">${p.start_date ? new Date(p.start_date).toLocaleDateString() : '-'}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px">${p.due_date ? new Date(p.due_date).toLocaleDateString() : '-'}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px">${p.progress||0}%</td>
      </tr>
      ${p.description ? '<tr><td colspan="7" style="padding:6px 10px 16px;border-bottom:2px solid #ccc;font-size:12px;color:#555;line-height:1.5"><em>'+p.description+'</em></td></tr>' : ''}`;
  }).join('');

  const byStatus = {};
  projects.forEach(p => { byStatus[p.status] = (byStatus[p.status]||0) + 1; });
  const summaryLine = Object.entries(byStatus).map(([s,c]) => c + ' ' + s.replace(/_/g,' ')).join(' | ');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Projects Report</title>
    <style>
      @page { size: landscape; margin: 0.5in; }
      body { font-family: -apple-system,Helvetica,Arial,sans-serif; color:#222; margin:0; padding:24px; }
      table { width:100%; border-collapse:collapse; }
      h1 { font-size:20px; margin:0 0 4px; }
      .meta { font-size:12px; color:#888; margin-bottom:16px; }
      .summary { font-size:12px; color:#555; margin-bottom:20px; padding:10px 14px; background:#f5f5f5; border-radius:6px; }
      th { text-align:left; padding:8px 10px; border-bottom:2px solid #333; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#555; }
      @media print { body { padding:0; } }
    </style></head><body>
    <h1>Digit2Ai Projects Report</h1>
    <p class="meta">Generated: ${now} | ${projects.length} project${projects.length===1?'':'s'}</p>
    <div class="summary">${summaryLine}</div>
    <table>
      <thead><tr>
        <th>Project</th><th>Vertical</th><th>Status</th><th>Priority</th><th>Start</th><th>Due</th><th>Progress</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// =====================================================
// CALENDAR
// =====================================================
let calYear, calMonth;
async function renderCalendar(container) {
  const now = new Date();
  if (!calYear) { calYear = now.getFullYear(); calMonth = now.getMonth(); }

  const monthStart = new Date(calYear, calMonth, 1);
  const monthEnd = new Date(calYear, calMonth + 1, 0);
  const startParam = new Date(calYear, calMonth, 1 - monthStart.getDay()).toISOString();
  const endParam = new Date(calYear, calMonth + 1, 6 - monthEnd.getDay()).toISOString();

  const res = await api(`/calendar?start=${startParam}&end=${endParam}`);
  const events = res.success ? res.data : [];

  // Group events by LOCAL date (not UTC)
  const eventsByDate = {};
  events.forEach(e => {
    const local = new Date(e.start_time);
    const d = `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`;
    if (!eventsByDate[d]) eventsByDate[d] = [];
    eventsByDate[d].push(e);
  });

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  container.innerHTML = `
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:16px">
        <button class="btn btn-ghost btn-sm" onclick="calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar(document.getElementById('view-container'))">&#9664;</button>
        <h3>${monthNames[calMonth]} ${calYear}</h3>
        <button class="btn btn-ghost btn-sm" onclick="calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar(document.getElementById('view-container'))">&#9654;</button>
        <button class="btn btn-ghost btn-sm" onclick="calYear=${now.getFullYear()};calMonth=${now.getMonth()};renderCalendar(document.getElementById('view-container'))">Today</button>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openEventModal()">+ New Event</button>
    </div>
    <div class="calendar-grid" id="cal-grid"></div>
  `;

  const grid = document.getElementById('cal-grid');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  grid.innerHTML = days.map(d => `<div class="calendar-header-cell">${d}</div>`).join('');

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = now.toISOString().split('T')[0];

  // Prev month fill
  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    grid.innerHTML += `<div class="calendar-cell other-month"><div class="calendar-day">${day}</div></div>`;
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const dayEvents = eventsByDate[dateStr] || [];
    const typeColors = { meeting: '#2563eb', deadline: '#ef4444', followup: '#f59e0b', milestone: '#10b981', event: '#3b82f6', task: '#8b5cf6' };
    grid.innerHTML += `<div class="calendar-cell${isToday ? ' today' : ''}"><div class="calendar-day">${d}</div>${dayEvents.slice(0,3).map(e => {
      const click = e.source === 'task' ? `showTaskDetail(${e.task_id})` : `showEventDetail(${e.id})`;
      return `<div class="calendar-event-dot" style="background:${typeColors[e.event_type]||'#2563eb'};color:white;cursor:pointer" onclick="${click}">${e.source === 'task' ? '&#9989; ' : ''}${e.title}</div>`;
    }).join('')}${dayEvents.length > 3 ? `<div style="font-size:10px;color:var(--text-muted)">+${dayEvents.length-3} more</div>` : ''}</div>`;
  }

  // Next month fill
  const totalCells = firstDay + daysInMonth;
  const remaining = 7 - (totalCells % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      grid.innerHTML += `<div class="calendar-cell other-month"><div class="calendar-day">${d}</div></div>`;
    }
  }
}

// =====================================================
// CALENDAR EVENT DETAIL
// =====================================================
async function showEventDetail(id) {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="spinner"></div>';
  const res = await api(`/calendar/${id}`);
  if (!res.success) { container.innerHTML = '<div class="empty-state"><h3>Event not found</h3><button class="btn btn-ghost" onclick="navigateTo(\'calendar\')">Back</button></div>'; return; }
  const e = res.data;
  const isPast = e.start_time && new Date(e.start_time) < new Date();
  const typeColors = { meeting: '#2563eb', deadline: '#ef4444', followup: '#f59e0b', milestone: '#10b981', event: '#3b82f6' };

  container.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('calendar')" style="margin-bottom:8px">&#8592; Back to Calendar</button>
          <h2>${e.title}</h2>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="openEventEditModal(${e.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEvent(${e.id})">Delete</button>
        </div>
      </div>
      <div class="detail-meta">
        <span class="status-badge" style="background:${typeColors[e.event_type] || '#2563eb'}20;color:${typeColors[e.event_type] || '#2563eb'}">${e.event_type || 'event'}</span>
        ${isPast ? '<span class="status-badge status-completed">Past</span>' : '<span class="status-badge status-active">Upcoming</span>'}
        ${e.all_day ? '<span class="status-badge status-planning">All Day</span>' : ''}
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-top:24px">
        <div>
          ${e.description ? `<div class="detail-section"><h4>Description</h4><p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${e.description}</p></div>` : '<div class="detail-section"><h4>Description</h4><p style="font-size:14px;color:var(--text-muted);font-style:italic">No description</p></div>'}

          ${e.project ? `<div class="detail-section"><h4>Linked Project</h4><div class="timeline-item" style="cursor:pointer" onclick="showProjectDetail(${e.project.id})"><div class="timeline-dot" style="background:var(--accent)"></div><div class="timeline-content"><strong>${e.project.name}</strong><br><span style="font-size:12px;color:var(--text-muted)">${e.project.status || ''}</span></div></div></div>` : ''}

          ${e.contact ? `<div class="detail-section"><h4>Linked Contact</h4><div class="timeline-item" style="cursor:pointer" onclick="showContactDetail(${e.contact.id})"><div class="timeline-dot" style="background:var(--success)"></div><div class="timeline-content"><strong>${e.contact.first_name} ${e.contact.last_name || ''}</strong>${e.contact.email ? '<br><span style="font-size:12px;color:var(--text-muted)">'+e.contact.email+'</span>' : ''}</div></div></div>` : ''}
        </div>

        <div>
          <div class="detail-section">
            <h4>Schedule</h4>
            <div style="font-size:14px;display:flex;flex-direction:column;gap:8px">
              <div><span style="color:var(--text-muted)">Start:</span> <strong>${fmtDateTime(e.start_time)}</strong></div>
              ${e.end_time ? `<div><span style="color:var(--text-muted)">End:</span> <strong>${fmtDateTime(e.end_time)}</strong></div>` : ''}
              ${e.location ? `<div><span style="color:var(--text-muted)">Location:</span> ${e.location}</div>` : ''}
              <div><span style="color:var(--text-muted)">Type:</span> ${e.event_type || 'event'}</div>
              <div><span style="color:var(--text-muted)">Created:</span> ${fmtDateTime(e.created_at)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function openEventEditModal(id) {
  const res = await api(`/calendar/${id}`);
  if (!res.success) return;
  const e = res.data;

  openModal('Edit Event', `
    <div class="form-group"><label>Title *</label><input type="text" id="m-etitle" value="${e.title || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label>Type</label>
        <select id="m-etype">
          <option value="meeting" ${e.event_type==='meeting'?'selected':''}>Meeting</option>
          <option value="deadline" ${e.event_type==='deadline'?'selected':''}>Deadline</option>
          <option value="followup" ${e.event_type==='followup'?'selected':''}>Follow-up</option>
          <option value="milestone" ${e.event_type==='milestone'?'selected':''}>Milestone</option>
          <option value="event" ${e.event_type==='event'?'selected':''}>Event</option>
        </select>
      </div>
      <div class="form-group"><label>Location</label><input type="text" id="m-elocation" value="${e.location || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Start *</label><input type="datetime-local" id="m-estart" value="${e.start_time ? e.start_time.substring(0,16) : ''}"></div>
      <div class="form-group"><label>End</label><input type="datetime-local" id="m-eend" value="${e.end_time ? e.end_time.substring(0,16) : ''}"></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="m-edesc">${e.description || ''}</textarea></div>
  `, async () => {
    const data = {
      title: document.getElementById('m-etitle').value.trim(),
      event_type: document.getElementById('m-etype').value,
      location: document.getElementById('m-elocation').value.trim(),
      start_time: document.getElementById('m-estart').value || null,
      end_time: document.getElementById('m-eend').value || null,
      description: document.getElementById('m-edesc').value.trim()
    };
    if (!data.title) { alert('Title is required'); return; }
    if (!data.start_time) { alert('Start time is required'); return; }
    await api(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    closeModal();
    showEventDetail(id);
  });
}

async function deleteEvent(id) {
  if (!confirm('Delete this event permanently?')) return;
  await api(`/calendar/${id}`, { method: 'DELETE' });
  navigateTo('calendar');
}

// =====================================================
// TASKS
// =====================================================
let _allTasksCache = [];

async function renderTasks(container) {
  const res = await api('/tasks');
  if (!res.success) return;
  _allTasksCache = res.data;

  container.innerHTML = `
    <div class="section-header">
      <div class="filter-bar">
        <select id="task-status-filter" onchange="filterTasks()">
          <option value="">Show All</option>
          <option value="pending" selected>Still To Do</option>
          <option value="completed">Already Done</option>
        </select>
        <select id="task-type-filter" onchange="filterTasks()">
          <option value="">All Types</option>
          <option value="task">Tasks</option>
          <option value="reminder">Reminders</option>
          <option value="followup">Follow-ups</option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openTaskModal()">+ Add To-Do</button>
    </div>
    <div id="tasks-list"></div>
  `;

  filterTasks();
}

function filterTasks() {
  const statusEl = document.getElementById('task-status-filter');
  const typeEl = document.getElementById('task-type-filter');
  const statusVal = statusEl ? statusEl.value : 'pending';
  const typeVal = typeEl ? typeEl.value : '';
  let filtered = _allTasksCache;
  if (statusVal) filtered = filtered.filter(t => t.status === statusVal);
  if (typeVal) filtered = filtered.filter(t => t.task_type === typeVal);
  renderTasksList(filtered);
}

function renderTasksList(tasks) {
  const container = document.getElementById('tasks-list');
  if (!container) return;
  const now = new Date();

  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9989;</div><h3>Your to-do list is empty!</h3><p>Nothing on your plate right now.</p><button class="get-started-btn" onclick="openTaskModal()">&#9989; Add Your First To-Do</button><p class="empty-action-hint">Tip: You can also say "Remind me to call John tomorrow" to the AI assistant</p></div>';
    return;
  }

  // Group by assignee
  const groups = {};
  tasks.forEach(t => {
    const name = t.assignee ? `${t.assignee.first_name} ${t.assignee.last_name || ''}`.trim() : 'Unassigned';
    if (!groups[name]) groups[name] = [];
    groups[name].push(t);
  });

  // Sort group names: assigned first (alphabetical), Unassigned last
  const sortedNames = Object.keys(groups).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  let html = '';
  sortedNames.forEach(name => {
    const items = groups[name];
    const groupId = 'tg-' + name.replace(/\s+/g, '-').toLowerCase();
    html += `
      <div class="task-group">
        <div class="task-group-header collapsed" onclick="toggleTaskGroup('${groupId}')">
          <span class="task-group-chevron" id="chev-${groupId}">&#9654;</span>
          <span class="task-group-name">&#128100; ${name}</span>
          <span class="task-group-badge">${items.length}</span>
        </div>
        <div class="task-group-body" id="${groupId}" style="display:none">
          <table class="data-table"><thead><tr><th>Task</th><th>Type</th><th>Priority</th><th>Project</th><th>Due</th><th>Actions</th></tr></thead><tbody>` +
          items.map(t => {
            const isOverdue = t.due_date && new Date(t.due_date) < now && t.status === 'pending';
            return `<tr class="clickable" onclick="showTaskDetail(${t.id})">
              <td><strong>${t.title}</strong>${t.description ? '<br><span style="font-size:12px;color:var(--text-muted)">'+t.description.substring(0,60)+'</span>' : ''}</td>
              <td><span class="status-badge status-${t.task_type === 'reminder' ? 'on_hold' : 'planning'}">${t.task_type}</span></td>
              <td><span class="priority-badge priority-${t.priority}">${t.priority}</span></td>
              <td>${t.project?.name || '-'}</td>
              <td><span style="color:${isOverdue ? 'var(--danger)' : 'var(--text-secondary)'}">${t.due_date ? fmtDate(t.due_date) : '-'}${isOverdue ? ' (overdue)' : ''}</span></td>
              <td>${t.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();completeTask(${t.id})">Done</button>` : '<span class="status-badge status-completed">completed</span>'}</td>
            </tr>`;
          }).join('') +
          `</tbody></table>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

function toggleTaskGroup(groupId) {
  const body = document.getElementById(groupId);
  const chev = document.getElementById('chev-' + groupId);
  const header = body?.previousElementSibling;
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (chev) chev.innerHTML = isHidden ? '&#9660;' : '&#9654;';
  if (header) header.classList.toggle('collapsed', !isHidden);
}

async function completeTask(id) {
  await api(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
  renderView('tasks');
}

async function completeTaskFromDetail(id) {
  await api(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
  showTaskDetail(id);
}

async function deleteTask(id) {
  if (!confirm('Delete this task permanently?')) return;
  await api(`/tasks/${id}`, { method: 'DELETE' });
  navigateTo('tasks');
}

async function showTaskDetail(id) {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="spinner"></div>';
  const res = await api(`/tasks/${id}`);
  if (!res.success) { container.innerHTML = '<div class="empty-state"><h3>Task not found</h3><button class="btn btn-ghost" onclick="navigateTo(\'tasks\')">Back</button></div>'; return; }
  const t = res.data;
  const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status === 'pending';
  const backAction = _lastDrilldown ? `drillDown('${_lastDrilldown.metric}'${_lastDrilldown.filterValue ? ",'" + _lastDrilldown.filterValue + "'" : ''})` : "navigateTo('tasks')";
  const backLabel = _lastDrilldown ? '&#8592; Back to List' : '&#8592; Back to Tasks';

  container.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="${backAction}" style="margin-bottom:8px">${backLabel}</button>
          <h2>${t.title}</h2>
        </div>
        <div style="display:flex;gap:8px">
          ${t.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="completeTaskFromDetail(${t.id})">&#10003; Complete</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openTaskEditModal(${t.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTask(${t.id})">Delete</button>
        </div>
      </div>
      <div class="detail-meta">
        <span class="status-badge status-${t.status === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'pending'}">${t.status === 'completed' ? 'COMPLETED' : isOverdue ? 'OVERDUE' : t.status.toUpperCase()}</span>
        <span class="priority-badge priority-${t.priority}">${t.priority}</span>
        <span class="status-badge status-${t.task_type === 'reminder' ? 'on_hold' : 'planning'}">${t.task_type}</span>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-top:24px">
        <div>
          ${t.description ? `<div class="detail-section"><h4>Description</h4><p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${t.description}</p></div>` : '<div class="detail-section"><h4>Description</h4><p style="font-size:14px;color:var(--text-muted);font-style:italic">No description</p></div>'}

          ${t.project ? `<div class="detail-section"><h4>Linked Project</h4><div class="timeline-item" style="cursor:pointer" onclick="showProjectDetail(${t.project.id})"><div class="timeline-dot" style="background:var(--accent)"></div><div class="timeline-content"><strong>${t.project.name}</strong><br><span style="font-size:12px;color:var(--text-muted)">${t.project.status || ''}</span></div></div></div>` : ''}

          ${t.contact ? `<div class="detail-section"><h4>Linked Contact</h4><div class="timeline-item" style="cursor:pointer" onclick="showContactDetail(${t.contact.id})"><div class="timeline-dot" style="background:var(--success)"></div><div class="timeline-content"><strong>${t.contact.first_name} ${t.contact.last_name || ''}</strong>${t.contact.email ? '<br><span style="font-size:12px;color:var(--text-muted)">'+t.contact.email+'</span>' : ''}</div></div></div>` : ''}

          ${t.assignee ? `<div class="detail-section"><h4>Assigned Staff Member</h4><div class="timeline-item" style="cursor:pointer" onclick="showStaffDetail(${t.assignee.id})"><div class="timeline-dot" style="background:var(--accent)"></div><div class="timeline-content"><strong>&#128100; ${t.assignee.first_name} ${t.assignee.last_name || ''}</strong>${t.assignee.position ? '<br><span style="font-size:12px;color:var(--text-muted)">'+t.assignee.position+'</span>' : ''}</div></div></div>` : ''}
        </div>

        <div>
          <div class="detail-section">
            <h4>Details</h4>
            <div style="font-size:14px;display:flex;flex-direction:column;gap:8px">
              <div><span style="color:var(--text-muted)">Status:</span> <span class="status-badge status-${t.status}">${t.status}</span></div>
              <div><span style="color:var(--text-muted)">Priority:</span> <span class="priority-badge priority-${t.priority}">${t.priority}</span></div>
              <div><span style="color:var(--text-muted)">Type:</span> ${t.task_type}</div>
              ${t.due_date ? `<div><span style="color:var(--text-muted)">Due:</span> <strong style="color:${isOverdue ? 'var(--danger)' : 'var(--text-primary)'}">${fmtDateTime(t.due_date)}</strong></div>` : '<div><span style="color:var(--text-muted)">Due:</span> Not set</div>'}
              ${t.completed_at ? `<div><span style="color:var(--text-muted)">Completed:</span> ${fmtDateTime(t.completed_at)}</div>` : ''}
              <div><span style="color:var(--text-muted)">Created:</span> ${fmtDateTime(t.created_at)}</div>
              ${t.assignee ? `<div><span style="color:var(--text-muted)">Assigned to:</span> &#128100; ${t.assignee.first_name} ${t.assignee.last_name || ''}</div>` : t.user_email ? `<div><span style="color:var(--text-muted)">Assigned to:</span> ${t.user_email}</div>` : '<div><span style="color:var(--text-muted)">Assigned to:</span> <span style="color:var(--text-muted);font-style:italic">Unassigned</span></div>'}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function openTaskEditModal(id) {
  const res = await api(`/tasks/${id}`);
  if (!res.success) return;
  const t = res.data;

  openModal('Edit Task', `
    <div class="form-group"><label>Title *</label><input type="text" id="m-ttitle" value="${t.title || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label>Type</label>
        <select id="m-ttype">
          <option value="task" ${t.task_type==='task'?'selected':''}>Task</option>
          <option value="reminder" ${t.task_type==='reminder'?'selected':''}>Reminder</option>
          <option value="followup" ${t.task_type==='followup'?'selected':''}>Follow-up</option>
        </select>
      </div>
      <div class="form-group"><label>Priority</label>
        <select id="m-tpriority">
          <option value="low" ${t.priority==='low'?'selected':''}>Low</option>
          <option value="medium" ${t.priority==='medium'?'selected':''}>Medium</option>
          <option value="high" ${t.priority==='high'?'selected':''}>High</option>
          <option value="critical" ${t.priority==='critical'?'selected':''}>Critical</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Status</label>
        <select id="m-tstatus">
          <option value="pending" ${t.status==='pending'?'selected':''}>Pending</option>
          <option value="completed" ${t.status==='completed'?'selected':''}>Completed</option>
        </select>
      </div>
      <div class="form-group"><label>Due Date</label><input type="datetime-local" id="m-tdue" value="${t.due_date ? t.due_date.substring(0,16) : ''}"></div>
    </div>
    <div class="form-group"><label>Assign To</label><select id="m-tstaff">${staffOptions(t.assigned_staff_id)}</select></div>
    <div class="form-group"><label>Description</label><textarea id="m-tdesc">${t.description || ''}</textarea></div>
  `, async () => {
    const data = {
      title: document.getElementById('m-ttitle').value.trim(),
      task_type: document.getElementById('m-ttype').value,
      priority: document.getElementById('m-tpriority').value,
      status: document.getElementById('m-tstatus').value,
      due_date: document.getElementById('m-tdue').value || null,
      assigned_staff_id: document.getElementById('m-tstaff').value || null,
      description: document.getElementById('m-tdesc').value.trim()
    };
    if (!data.title) { alert('Title is required'); return; }
    await api(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    closeModal();
    showTaskDetail(id);
  });
}

// =====================================================
// NOTIFICATIONS
// =====================================================
async function renderNotifications(container) {
  const res = await api('/notifications');
  if (!res.success) return;

  container.innerHTML = `
    <div class="section-header">
      <h3>${res.data.length} Notifications</h3>
      <button class="btn btn-ghost btn-sm" onclick="markAllRead()">Mark All Read</button>
    </div>
    <div class="timeline" id="notif-list"></div>
  `;

  document.getElementById('notif-list').innerHTML = res.data.length > 0
    ? res.data.map(n => `<div class="timeline-item" style="${n.read ? 'opacity:0.6' : ''}" onclick="markRead(${n.id})">
        <div class="timeline-dot" style="background:${n.read ? 'var(--text-muted)' : 'var(--accent)'}"></div>
        <div class="timeline-content"><strong>${n.title || n.type}</strong><br>${n.message || ''}<br><span class="timeline-time">${fmtDateTime(n.created_at)}</span></div>
      </div>`).join('')
    : '<div class="empty-state"><div class="empty-icon">&#128276;</div><h3>No alerts right now</h3><p>You\'re all caught up! Alerts will appear here when something needs your attention.</p></div>';
}

async function markRead(id) {
  await api(`/notifications/${id}/read`, { method: 'PUT' });
  renderView('notifications');
}
async function markAllRead() {
  await api('/notifications/read-all', { method: 'PUT' });
  renderView('notifications');
}

// =====================================================
// AI WORKSPACE
// =====================================================
function renderAIWorkspace(container) {
  container.innerHTML = `
    <div class="card" style="max-width:800px">
      <h3 style="margin-bottom:8px">&#10024; Ask AI - Your Smart Assistant</h3>
      <p style="color:var(--text-secondary);margin-bottom:20px">Just type what you need in plain English. No special commands needed! Here are some things you can try:</p>
      <div class="ai-suggestion-grid" style="margin-bottom:20px">
        <div class="ai-suggestion-card" onclick="document.getElementById('ai-input').value='What do I need to do today?';sendAICommand('ai')">
          <div class="ai-sug-label">&#9989; What do I need to do?</div>
          <div class="ai-sug-hint">See your pending tasks and reminders</div>
        </div>
        <div class="ai-suggestion-card" onclick="document.getElementById('ai-input').value='How are my projects going?';sendAICommand('ai')">
          <div class="ai-sug-label">&#128203; How are my projects going?</div>
          <div class="ai-sug-hint">Get a summary of all your projects</div>
        </div>
        <div class="ai-suggestion-card" onclick="document.getElementById('ai-input').value='Anything overdue?';sendAICommand('ai')">
          <div class="ai-sug-label">&#9888; Anything overdue?</div>
          <div class="ai-sug-hint">Check if anything needs urgent attention</div>
        </div>
        <div class="ai-suggestion-card" onclick="document.getElementById('ai-input').value='What\\'s coming up this week?';sendAICommand('ai')">
          <div class="ai-sug-label">&#128197; What's coming up?</div>
          <div class="ai-sug-hint">See your upcoming events and deadlines</div>
        </div>
        <div class="ai-suggestion-card" onclick="document.getElementById('ai-input').value='Create a new project called Marketing Campaign';sendAICommand('ai')">
          <div class="ai-sug-label">&#128640; Create a project</div>
          <div class="ai-sug-hint">Just describe what you want to create</div>
        </div>
        <div class="ai-suggestion-card" onclick="document.getElementById('ai-input').value='help';sendAICommand('ai')">
          <div class="ai-sug-label">&#128218; Show all commands</div>
          <div class="ai-sug-hint">See everything the AI can do for you</div>
        </div>
      </div>
      <div id="ai-messages" class="nlp-messages" style="max-height:400px;min-height:150px">
        <div class="nlp-msg system">Hi! I'm your AI assistant. Just tell me what you need in plain words. Click any suggestion above, or type your own question below.</div>
      </div>
      <div class="nlp-input-area" style="border-top:1px solid var(--border);padding-top:12px">
        <input type="text" id="ai-input" placeholder='Ask me anything, e.g. "Show my overdue tasks"' autocomplete="off">
        <button class="btn btn-primary" onclick="sendAICommand('ai')">Send</button>
      </div>
    </div>
  `;

  document.getElementById('ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendAICommand('ai');
  });
}

// =====================================================
// ACTIVITY
// =====================================================
async function renderActivity(container) {
  const res = await api('/activity?limit=50');
  if (!res.success) return;

  container.innerHTML = `
    <div class="section-header"><h3>Activity Log</h3></div>
    <div class="timeline" id="full-activity"></div>
  `;

  document.getElementById('full-activity').innerHTML = res.data.length > 0
    ? res.data.map(a => `<div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-content">${a.user_email || 'System'} <strong>${a.action}</strong> ${a.entity_type} "${a.entity_name || ''}"${a.details?.via ? ' <span class="tag">via '+a.details.via+'</span>' : ''}<br><span class="timeline-time">${fmtDateTime(a.created_at)}</span></div>
      </div>`).join('')
    : '<div class="empty-state"><div class="empty-icon">&#128336;</div><h3>No history yet</h3><p>As you create projects, add contacts, and complete tasks, a record of everything will show up here.</p></div>';
}

// =====================================================
// SETTINGS
// =====================================================
function renderSettings(container) {
  container.innerHTML = `
    <div class="card" style="max-width:700px">
      <h3 style="margin-bottom:20px">Settings</h3>
      <div class="detail-section">
        <h4>Account</h4>
        <p style="color:var(--text-secondary);font-size:14px">Logged in as: <strong>${USER?.email || '-'}</strong></p>
      </div>
      <div class="detail-section">
        <h4>Verticals</h4>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Organize contacts and projects by vertical. Click Edit to modify or Delete to remove.</p>
        <div id="verticals-list" style="margin-bottom:16px"></div>
        <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px">
          <p style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">Add New Vertical</p>
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="margin:0;flex:1;min-width:150px"><input type="text" id="new-vertical-name" placeholder="Name"></div>
            <div class="form-group" style="margin:0;width:100px"><input type="color" id="new-vertical-color" value="#2563eb" style="height:38px;padding:4px"></div>
            <div class="form-group" style="margin:0"><button class="btn btn-primary" onclick="addVertical()">Add</button></div>
          </div>
        </div>
      </div>
      <div class="detail-section">
        <h4>Appearance</h4>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Choose your preferred look</p>
        <div style="display:flex;gap:12px">
          <button class="btn ${getTheme() === 'dark' ? 'btn-primary' : 'btn-ghost'}" onclick="setTheme('dark')">&#127769; Dark Mode</button>
          <button class="btn ${getTheme() === 'light' ? 'btn-primary' : 'btn-ghost'}" onclick="setTheme('light')">&#9728; Light Mode</button>
        </div>
      </div>
      <div class="detail-section">
        <h4>Need Help?</h4>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">Click the &#10024; button in the bottom-right corner to ask the AI assistant for help. You can say things like "help" or "what can you do?"</p>
      </div>
      <div class="detail-section">
        <h4>About</h4>
        <p style="color:var(--text-secondary);font-size:13px">Digit2AI Contacts & Projects Hub v1.0<br>Part of the RinglyPro ecosystem.</p>
      </div>
    </div>
  `;

  renderVerticalsList();
}

function renderVerticalsList() {
  document.getElementById('verticals-list').innerHTML = VERTICALS.map(v =>
    `<div id="vert-row-${v.id}" style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span class="vertical-dot" style="background:${v.color};width:12px;height:12px"></span>
      <span style="font-weight:500;flex:1">${v.name}</span>
      <span style="color:var(--text-muted);font-size:12px">${v.slug}</span>
      <button class="btn btn-ghost btn-sm" onclick="editVertical(${v.id},'${v.name.replace(/'/g,"\\'")}','${v.color}','${v.description||''}')">Edit</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteVertical(${v.id},'${v.name.replace(/'/g,"\\'")}')">Delete</button>
    </div>`
  ).join('') || '<p style="color:var(--text-muted);font-size:13px">No verticals configured.</p>';
}

async function addVertical() {
  const name = document.getElementById('new-vertical-name').value.trim();
  const color = document.getElementById('new-vertical-color').value || '#2563eb';
  if (!name) { alert('Vertical name is required'); return; }
  await api('/verticals', { method: 'POST', body: JSON.stringify({ name, color }) });
  document.getElementById('new-vertical-name').value = '';
  await loadVerticals();
  renderVerticalsList();
}

function editVertical(id, name, color, description) {
  openModal('Edit Vertical', `
    <div class="form-group"><label>Name *</label><input type="text" id="m-vname" value="${name}"></div>
    <div class="form-group"><label>Color</label><input type="color" id="m-vcolor" value="${color}" style="height:40px;width:100%"></div>
    <div class="form-group"><label>Description</label><textarea id="m-vdesc">${description}</textarea></div>
  `, async () => {
    const data = {
      name: document.getElementById('m-vname').value.trim(),
      color: document.getElementById('m-vcolor').value,
      description: document.getElementById('m-vdesc').value.trim()
    };
    if (!data.name) { alert('Name is required'); return; }
    await api(`/verticals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    closeModal();
    await loadVerticals();
    renderVerticalsList();
  });
}

async function deleteVertical(id, name) {
  if (!confirm(`Delete vertical "${name}"? Contacts and projects using this vertical will be unlinked.`)) return;
  await api(`/verticals/${id}`, { method: 'DELETE' });
  await loadVerticals();
  renderVerticalsList();
}

// =====================================================
// DETAIL VIEWS
// =====================================================
async function showContactDetail(id) {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="spinner"></div>';
  const [res, histRes] = await Promise.all([api(`/contacts/${id}`), api(`/pipeline/${id}/history`).catch(() => ({ success: false, data: [] }))]);
  if (!res.success) return;
  const c = res.data;
  const pipelineHistory = histRes.success ? histRes.data : [];
  const stage = c.pipeline_stage || 'prospect';

  const cBackAction = _lastDrilldown ? `drillDown('${_lastDrilldown.metric}'${_lastDrilldown.filterValue ? ",'" + _lastDrilldown.filterValue + "'" : ''})` : "navigateTo('contacts')";
  const cBackLabel = _lastDrilldown ? '&#8592; Back to List' : '&#8592; Back to Contacts';

  container.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="${cBackAction}" style="margin-bottom:8px">${cBackLabel}</button>
          <h2>${c.first_name} ${c.last_name || ''}</h2>
          ${c.title ? `<p style="color:var(--text-secondary)">${c.title}${c.company ? ' at ' + c.company.name : ''}</p>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="openContactModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="archiveContact(${c.id})">Archive</button>
        </div>
      </div>
      <div class="detail-meta">
        <div class="detail-meta-item"><span class="status-badge" style="background:${STAGE_COLORS[stage]}20;color:${STAGE_COLORS[stage]};font-weight:600">${STAGE_LABELS[stage] || stage}</span></div>
        ${c.vertical ? `<div class="detail-meta-item"><span class="vertical-dot" style="background:${c.vertical.color}"></span>${c.vertical.name}</div>` : ''}
        ${c.contact_type ? `<div class="detail-meta-item">${c.contact_type}</div>` : ''}
        ${c.last_email_event ? `<div class="detail-meta-item" style="font-size:12px;color:var(--text-muted)">Last email: ${c.last_email_event}${c.last_email_event_at ? ' (' + fmtDate(c.last_email_event_at) + ')' : ''}</div>` : ''}
      </div>

      <!-- Pipeline Stage Selector -->
      <div style="margin:16px 0;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius)">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:600">PIPELINE STAGE</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${PIPELINE_STAGES.map(s => `<button class="btn btn-sm" style="background:${s===stage ? STAGE_COLORS[s] : 'transparent'};color:${s===stage ? 'white' : STAGE_COLORS[s]};border:1px solid ${STAGE_COLORS[s]}40;font-size:12px;padding:4px 12px" onclick="changeContactStage(${c.id},'${s}')">${STAGE_LABELS[s]}</button>`).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div>
          <div class="detail-section">
            <h4>Contact Info</h4>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:14px">
              ${c.email ? `<div><span style="color:var(--text-muted)">Email:</span> ${c.email}</div>` : ''}
              ${c.phone ? `<div><span style="color:var(--text-muted)">Phone:</span> ${c.phone}</div>` : ''}
              ${c.whatsapp ? `<div><span style="color:var(--text-muted)">WhatsApp:</span> ${c.whatsapp}</div>` : ''}
              ${c.website ? `<div><span style="color:var(--text-muted)">Website:</span> ${c.website}</div>` : ''}
              ${c.source ? `<div><span style="color:var(--text-muted)">Source:</span> ${c.source}</div>` : ''}
            </div>
          </div>
          ${c.notes ? `<div class="detail-section"><h4>Notes</h4><p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${c.notes}</p></div>` : ''}
          ${c.tags?.length ? `<div class="detail-section"><h4>Tags</h4>${c.tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</div>` : ''}

          <div class="detail-section">
            <h4>Pipeline History</h4>
            <div class="timeline">
              ${pipelineHistory.length > 0 ? pipelineHistory.map(h => `<div class="timeline-item">
                <div class="timeline-dot" style="background:${STAGE_COLORS[h.to_stage] || 'var(--accent)'}"></div>
                <div class="timeline-content">
                  <span class="status-badge" style="background:${STAGE_COLORS[h.from_stage]||'#64748b'}20;color:${STAGE_COLORS[h.from_stage]||'#64748b'};font-size:11px">${STAGE_LABELS[h.from_stage]||h.from_stage||'?'}</span>
                  <span style="color:var(--text-muted)">&#8594;</span>
                  <span class="status-badge" style="background:${STAGE_COLORS[h.to_stage]||'#64748b'}20;color:${STAGE_COLORS[h.to_stage]||'#64748b'};font-size:11px">${STAGE_LABELS[h.to_stage]||h.to_stage}</span>
                  <br><span class="timeline-time">${h.trigger_type || ''} — ${fmtDateTime(h.created_at)}</span>
                  ${h.trigger_detail ? `<br><span style="font-size:11px;color:var(--text-muted)">${h.trigger_detail}</span>` : ''}
                </div>
              </div>`).join('') : '<p style="font-size:13px;color:var(--text-muted)">No stage changes yet</p>'}
            </div>
          </div>
        </div>
        <div>
          <div class="detail-section">
            <h4>Dates</h4>
            <div style="font-size:14px">
              ${c.next_followup_date ? `<div style="margin-bottom:4px"><span style="color:var(--text-muted)">Next Follow-up:</span> <strong>${fmtDate(c.next_followup_date)}</strong></div>` : ''}
              ${c.last_interaction_date ? `<div style="margin-bottom:4px"><span style="color:var(--text-muted)">Last Interaction:</span> ${fmtDate(c.last_interaction_date)}</div>` : ''}
              <div><span style="color:var(--text-muted)">Created:</span> ${fmtDate(c.created_at)}</div>
            </div>
          </div>
          ${c.projects?.length ? `<div class="detail-section"><h4>Linked Projects</h4>${c.projects.map(p => `<div class="timeline-item" style="cursor:pointer" onclick="showProjectDetail(${p.id})"><div class="timeline-dot" style="background:var(--accent)"></div><div class="timeline-content"><strong>${p.name}</strong><br><span style="font-size:12px;color:var(--text-muted)">${p.status}</span></div></div>`).join('')}</div>` : ''}
          <div class="detail-section">
            <h4>Activity</h4>
            <div class="timeline">${c.activity?.length ? c.activity.map(a => `<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content">${a.action} <br><span class="timeline-time">${fmtDateTime(a.created_at)}</span></div></div>`).join('') : '<p style="font-size:13px;color:var(--text-muted)">No activity</p>'}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function changeContactStage(contactId, newStage) {
  await api(`/pipeline/${contactId}/stage`, { method: 'PUT', body: JSON.stringify({ stage: newStage, trigger_type: 'manual' }) });
  showContactDetail(contactId);
}

function renderProjectTimeline(p) {
  if (!p.start_date && !p.due_date) return '';
  const start = p.start_date ? new Date(p.start_date) : (p.created_at ? new Date(p.created_at) : null);
  const end = p.due_date ? new Date(p.due_date) : null;
  if (!start || !end || end <= start) return '';

  const now = new Date();
  const total = end - start;
  const elapsed = Math.max(0, Math.min(total, now - start));
  const timePct = (elapsed / total) * 100;
  const progressPct = Math.max(0, Math.min(100, p.progress || 0));
  const daysLeft = Math.ceil((end - now) / 86400000);
  const totalDays = Math.ceil(total / 86400000);
  const isOver = now > end;

  const milestoneDots = (p.milestones || [])
    .filter(m => m.due_date)
    .map(m => {
      const md = new Date(m.due_date);
      const pct = Math.max(0, Math.min(100, ((md - start) / total) * 100));
      const color = m.status === 'completed' ? 'var(--success)' : md < now ? 'var(--danger)' : 'var(--accent)';
      const side = pct > 70 ? 'right' : 'left';
      const safeTitle = (m.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      return `<div class="timeline-milestone" style="position:absolute;left:calc(${pct}% - 6px);top:-3px;width:12px;height:12px;border-radius:50%;background:${color};border:2px solid var(--bg-card);z-index:2">
        <span class="timeline-milestone-tip tip-${side}" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary)">
          <strong>${safeTitle}</strong><br>
          <span style="font-size:11px;color:var(--text-muted)">${m.status === 'completed' ? 'Completed' : 'Due'} &middot; ${fmtDate(m.due_date)}</span>
        </span>
      </div>`;
    }).join('');

  return `
    <div class="detail-section" style="margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;gap:12px">
        <div style="display:flex;align-items:baseline;gap:12px">
          <h4 style="margin:0">Timeline</h4>
          <span style="font-size:13px;font-weight:600;color:var(--accent)">${progressPct}%</span>
        </div>
        <span style="font-size:12px;color:${isOver ? 'var(--danger)' : 'var(--text-muted)'}">
          ${isOver ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left of ${totalDays}`}
        </span>
      </div>
      <div style="position:relative;height:12px;background:rgba(148,163,184,0.15);border-radius:6px;overflow:visible">
        <div style="position:absolute;left:0;top:0;height:100%;width:${timePct}%;background:linear-gradient(90deg,rgba(59,130,246,0.25),rgba(59,130,246,0.45));border-radius:6px 0 0 6px"></div>
        <div style="position:absolute;left:0;top:0;height:100%;width:${progressPct}%;background:linear-gradient(90deg,var(--accent),var(--success));border-radius:6px 0 0 6px;z-index:1"></div>
        <div style="position:absolute;left:calc(${Math.min(100, timePct)}% - 1px);top:-4px;bottom:-4px;width:2px;background:${isOver ? 'var(--danger)' : 'var(--warning)'};z-index:3"></div>
        ${milestoneDots}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:8px">
        <span>${fmtDate(start)} <span style="color:var(--text-secondary)">Start</span></span>
        <span style="color:${isOver ? 'var(--danger)' : 'var(--warning)'}">Today</span>
        <span><span style="color:var(--text-secondary)">Due</span> ${fmtDate(end)}</span>
      </div>
    </div>
  `;
}

async function showProjectDetail(id) {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="spinner"></div>';
  const [res, tasksRes] = await Promise.all([api(`/projects/${id}`), api(`/tasks?project_id=${id}`)]);
  if (!res.success) return;
  const p = res.data;
  const projectTasks = tasksRes.success ? tasksRes.data : [];
  const isOverdue = p.due_date && new Date(p.due_date) < new Date() && !['completed','cancelled'].includes(p.status);

  const pBackAction = _lastDrilldown ? `drillDown('${_lastDrilldown.metric}'${_lastDrilldown.filterValue ? ",'" + _lastDrilldown.filterValue + "'" : ''})` : "navigateTo('projects')";
  const pBackLabel = _lastDrilldown ? '&#8592; Back to List' : '&#8592; Back to Projects';

  container.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="${pBackAction}" style="margin-bottom:8px">${pBackLabel}</button>
          <h2>${p.name}</h2>
          ${p.code ? `<p style="color:var(--text-muted);font-size:13px">${p.code}</p>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick='openProjectModal(${JSON.stringify(p).replace(/"/g,"&quot;").replace(/'/g,"&#39;")})'>Edit</button>
          <button class="btn btn-danger btn-sm" onclick="archiveProject(${p.id})">Archive</button>
        </div>
      </div>
      <div class="detail-meta">
        <span class="status-badge status-${isOverdue ? 'overdue' : p.status}">${isOverdue ? 'OVERDUE' : p.status}</span>
        <span class="priority-badge priority-${p.priority}">${p.priority}</span>
        ${p.vertical ? `<div class="detail-meta-item"><span class="vertical-dot" style="background:${p.vertical.color}"></span>${p.vertical.name}</div>` : ''}
        ${p.company ? `<div class="detail-meta-item">${p.company.name}</div>` : ''}
      </div>
      ${renderProjectTimeline(p)}

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px">
        <div>
          ${p.description ? `<div class="detail-section"><h4>Description</h4><p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${p.description}</p></div>` : ''}
          ${p.blockers ? `<div class="detail-section"><h4>Blockers</h4><p style="font-size:14px;color:var(--danger)">${p.blockers}</p></div>` : ''}
          ${p.next_step ? `<div class="detail-section"><h4>Next Step</h4><p style="font-size:14px;color:var(--success)">${p.next_step}</p></div>` : ''}

          <div class="detail-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h4 style="margin:0">Milestones</h4>
              <button class="btn btn-ghost btn-sm" onclick="openMilestoneModal(${p.id})">+ Add</button>
            </div>
            ${p.milestones?.length ? p.milestones.map(m => `<div class="timeline-item" style="border-left:3px solid ${m.status === 'completed' ? 'var(--success)' : m.due_date && new Date(m.due_date) < new Date() ? 'var(--danger)' : 'var(--accent)'}">
              <div class="timeline-content">
                <strong>${m.title}</strong> <span class="status-badge status-${m.status}">${m.status}</span>
                ${m.due_date ? `<br><span class="timeline-time">Due: ${fmtDate(m.due_date)}</span>` : ''}
                ${m.status !== 'completed' ? `<br><button class="btn btn-success btn-sm" style="margin-top:4px" onclick="completeMilestone(${p.id},${m.id})">Complete</button>` : ''}
              </div>
            </div>`).join('') : '<p style="font-size:13px;color:var(--text-muted)">No milestones</p>'}
          </div>

          <div class="detail-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h4 style="margin:0">Tasks</h4>
              <button class="btn btn-ghost btn-sm" onclick="openTaskModalForProject(${p.id})">+ Add Task</button>
            </div>
            ${projectTasks.length ? projectTasks.map(t => {
              const tOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status === 'pending';
              return `<div class="timeline-item" style="cursor:pointer;border-left:3px solid ${t.status === 'completed' ? 'var(--success)' : tOverdue ? 'var(--danger)' : 'var(--accent)'}" onclick="showTaskDetail(${t.id})">
                <div class="timeline-content">
                  <strong>${t.title}</strong> <span class="status-badge status-${t.status === 'completed' ? 'completed' : tOverdue ? 'overdue' : 'pending'}">${t.status === 'completed' ? 'done' : tOverdue ? 'overdue' : t.status}</span>
                  <span class="priority-badge priority-${t.priority}" style="margin-left:4px">${t.priority}</span>
                  ${t.assignee ? '<br><span style="font-size:12px;color:var(--text-secondary)">&#128100; '+t.assignee.first_name+' '+(t.assignee.last_name||'')+'</span>' : ''}
                  ${t.due_date ? '<br><span class="timeline-time">Due: '+fmtDate(t.due_date)+'</span>' : ''}
                </div>
              </div>`;
            }).join('') : '<p style="font-size:13px;color:var(--text-muted)">No tasks for this project</p>'}
          </div>

          <div class="detail-section">
            <h4>Updates</h4>
            <div style="margin-bottom:12px;display:flex;gap:8px">
              <input type="text" id="update-input" placeholder="Add an update..." style="flex:1;padding:8px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:13px">
              <button class="btn btn-primary btn-sm" onclick="addProjectUpdate(${p.id})">Post</button>
            </div>
            ${p.updates?.length ? p.updates.map(u => `<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content">${u.content}<br><span class="timeline-time">${u.user_email || ''} - ${fmtDateTime(u.created_at)}</span></div></div>`).join('') : '<p style="font-size:13px;color:var(--text-muted)">No updates</p>'}
          </div>
        </div>

        <div>
          <div class="detail-section">
            <h4>Details</h4>
            <div style="font-size:14px;display:flex;flex-direction:column;gap:6px">
              ${p.lead ? `<div><span style="color:var(--text-muted)">Lead:</span> <span style="cursor:pointer;color:var(--accent)" onclick="showStaffDetail(${p.lead.id})">&#128100; ${p.lead.first_name} ${p.lead.last_name || ''}</span></div>` : ''}
              ${p.start_date ? `<div><span style="color:var(--text-muted)">Start:</span> ${fmtDate(p.start_date)}</div>` : ''}
              ${p.due_date ? `<div><span style="color:var(--text-muted)">Due:</span> <strong style="color:${isOverdue ? 'var(--danger)' : 'var(--text-primary)'}">${fmtDate(p.due_date)}</strong></div>` : ''}
              ${p.stage ? `<div><span style="color:var(--text-muted)">Stage:</span> ${p.stage}</div>` : ''}
              ${p.category ? `<div><span style="color:var(--text-muted)">Category:</span> ${p.category}</div>` : ''}
              <div><span style="color:var(--text-muted)">Created:</span> ${fmtDate(p.created_at)}</div>
            </div>
          </div>

          <div class="detail-section">
            <h4>Linked Contacts</h4>
            ${p.contacts?.length ? p.contacts.map(c => `<div class="timeline-item" style="cursor:pointer" onclick="showContactDetail(${c.id})"><div class="timeline-dot" style="background:var(--success)"></div><div class="timeline-content"><strong>${c.first_name} ${c.last_name || ''}</strong>${c.ProjectContact?.role ? '<br><span style="font-size:12px;color:var(--text-muted)">'+c.ProjectContact.role+'</span>' : ''}</div></div>`).join('') : '<p style="font-size:13px;color:var(--text-muted)">No contacts linked</p>'}
          </div>

          ${p.notes ? `<div class="detail-section"><h4>Notes</h4><p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${p.notes}</p></div>` : ''}
          ${p.tags?.length ? `<div class="detail-section"><h4>Tags</h4>${p.tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function archiveContact(id) { if (confirm('Archive this contact?')) { await api(`/contacts/${id}/archive`, { method: 'PUT' }); navigateTo('contacts'); } }
async function archiveProject(id) { if (confirm('Archive this project?')) { await api(`/projects/${id}/archive`, { method: 'PUT' }); navigateTo('projects'); } }

async function completeMilestone(projectId, milestoneId) {
  await api(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
  showProjectDetail(projectId);
}

function openTaskModalForProject(projectId) {
  openModal('New Task for Project', `
    <div class="form-group"><label>Title *</label><input type="text" id="m-ttitle"></div>
    <div class="form-row">
      <div class="form-group"><label>Type</label>
        <select id="m-ttype"><option value="task">Task</option><option value="reminder">Reminder</option><option value="followup">Follow-up</option></select>
      </div>
      <div class="form-group"><label>Priority</label>
        <select id="m-tpriority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
      </div>
    </div>
    <div class="form-group"><label>Assign To</label><select id="m-tstaff">${staffOptions()}</select></div>
    <div class="form-group"><label>Due Date</label><input type="datetime-local" id="m-tdue"></div>
    <div class="form-group"><label>Description</label><textarea id="m-tdesc"></textarea></div>
  `, async () => {
    const data = {
      title: document.getElementById('m-ttitle').value.trim(),
      task_type: document.getElementById('m-ttype').value,
      priority: document.getElementById('m-tpriority').value,
      due_date: document.getElementById('m-tdue').value || null,
      assigned_staff_id: document.getElementById('m-tstaff').value || null,
      description: document.getElementById('m-tdesc').value.trim(),
      project_id: projectId
    };
    if (!data.title) { alert('Title is required'); return; }
    await api('/tasks', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    showProjectDetail(projectId);
  });
}

async function addProjectUpdate(projectId) {
  const input = document.getElementById('update-input');
  const content = input.value.trim();
  if (!content) return;
  await api(`/projects/${projectId}/updates`, { method: 'POST', body: JSON.stringify({ content }) });
  showProjectDetail(projectId);
}

// =====================================================
// MODALS
// =====================================================
let modalSaveHandler = null;

function openModal(title, bodyHtml, onSave) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
  modalSaveHandler = onSave;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  modalSaveHandler = null;
}

function openContactModal(existing) {
  const c = existing || {};
  openModal(c.id ? 'Edit Contact' : 'New Contact', `
    <div class="form-row">
      <div class="form-group"><label>First Name *</label><input type="text" id="m-first-name" value="${c.first_name || ''}"></div>
      <div class="form-group"><label>Last Name</label><input type="text" id="m-last-name" value="${c.last_name || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" id="m-email" value="${c.email || ''}"></div>
      <div class="form-group"><label>Phone</label><input type="text" id="m-phone" value="${c.phone || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Title / Role</label><input type="text" id="m-title" value="${c.title || ''}"></div>
      <div class="form-group"><label>Company</label><input type="text" id="m-company" value="${c.company?.name || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Vertical</label><select id="m-vertical">${verticalOptions(c.vertical_id)}</select></div>
      <div class="form-group"><label>Status</label>
        <select id="m-status">
          <option value="active" ${c.status==='active'?'selected':''}>Active</option>
          <option value="lead" ${c.status==='lead'?'selected':''}>Lead</option>
          <option value="prospect" ${c.status==='prospect'?'selected':''}>Prospect</option>
          <option value="client" ${c.status==='client'?'selected':''}>Client</option>
          <option value="partner" ${c.status==='partner'?'selected':''}>Partner</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Pipeline Stage</label>
        <select id="m-pipeline-stage">
          ${PIPELINE_STAGES.map(s => `<option value="${s}" ${(c.pipeline_stage||'prospect')===s?'selected':''}>${STAGE_LABELS[s]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Contact Type</label>
        <select id="m-contact-type">
          <option value="general" ${c.contact_type==='general'?'selected':''}>General</option>
          <option value="decision_maker" ${c.contact_type==='decision_maker'?'selected':''}>Decision Maker</option>
          <option value="technical" ${c.contact_type==='technical'?'selected':''}>Technical</option>
          <option value="vendor" ${c.contact_type==='vendor'?'selected':''}>Vendor</option>
          <option value="investor" ${c.contact_type==='investor'?'selected':''}>Investor</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>Source</label><input type="text" id="m-source" value="${c.source || ''}"></div>
    <div class="form-group"><label>Next Follow-up Date</label><input type="date" id="m-followup" value="${c.next_followup_date || ''}"></div>
    <div class="form-group"><label>Notes</label><textarea id="m-notes">${c.notes || ''}</textarea></div>
  `, async () => {
    const data = {
      first_name: document.getElementById('m-first-name').value.trim(),
      last_name: document.getElementById('m-last-name').value.trim(),
      email: document.getElementById('m-email').value.trim(),
      phone: document.getElementById('m-phone').value.trim(),
      title: document.getElementById('m-title').value.trim(),
      vertical_id: document.getElementById('m-vertical').value || null,
      status: document.getElementById('m-status').value,
      pipeline_stage: document.getElementById('m-pipeline-stage').value,
      contact_type: document.getElementById('m-contact-type').value,
      source: document.getElementById('m-source').value.trim(),
      next_followup_date: document.getElementById('m-followup').value || null,
      notes: document.getElementById('m-notes').value.trim()
    };
    if (!data.first_name) { alert('First name is required'); return; }
    if (c.id) {
      await api(`/contacts/${c.id}`, { method: 'PUT', body: JSON.stringify(data) });
      showContactDetail(c.id);
    } else {
      await api('/contacts', { method: 'POST', body: JSON.stringify(data) });
      navigateTo('contacts');
    }
    closeModal();
  });
}

function openProjectModal(existing) {
  const p = existing || {};
  openModal(p.id ? 'Edit Project' : 'New Project', `
    <div class="form-group"><label>Project Name *</label><input type="text" id="m-pname" value="${p.name || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label>Vertical</label><select id="m-pvertical">${verticalOptions(p.vertical_id)}</select></div>
      <div class="form-group"><label>Category</label><input type="text" id="m-pcategory" value="${p.category || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Status</label>
        <select id="m-pstatus">
          <option value="planning" ${p.status==='planning'?'selected':''}>Planning</option>
          <option value="active" ${p.status==='active'?'selected':''}>Active</option>
          <option value="in_progress" ${p.status==='in_progress'?'selected':''}>In Progress</option>
          <option value="on_hold" ${p.status==='on_hold'?'selected':''}>On Hold</option>
          <option value="review" ${p.status==='review'?'selected':''}>Review</option>
          <option value="completed" ${p.status==='completed'?'selected':''}>Completed</option>
        </select>
      </div>
      <div class="form-group"><label>Priority</label>
        <select id="m-ppriority">
          <option value="low" ${p.priority==='low'?'selected':''}>Low</option>
          <option value="medium" ${p.priority==='medium'?'selected':''}>Medium</option>
          <option value="high" ${p.priority==='high'?'selected':''}>High</option>
          <option value="critical" ${p.priority==='critical'?'selected':''}>Critical</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Start Date</label><input type="date" id="m-pstart" value="${p.start_date || ''}"></div>
      <div class="form-group"><label>Due Date</label><input type="date" id="m-pdue" value="${p.due_date || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Progress (%)</label><input type="number" id="m-pprogress" min="0" max="100" value="${p.progress || 0}"></div>
      <div class="form-group"><label>Project Lead</label><select id="m-plead">${staffOptions(p.lead_staff_id)}</select></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="m-pdesc">${p.description || ''}</textarea></div>
    <div class="form-group"><label>Next Step</label><input type="text" id="m-pnext" value="${p.next_step || ''}"></div>
    <div class="form-group"><label>Blockers</label><input type="text" id="m-pblockers" value="${p.blockers || ''}"></div>
    <div class="form-group"><label>Notes</label><textarea id="m-pnotes">${p.notes || ''}</textarea></div>
  `, async () => {
    const data = {
      name: document.getElementById('m-pname').value.trim(),
      vertical_id: document.getElementById('m-pvertical').value || null,
      category: document.getElementById('m-pcategory').value.trim(),
      status: document.getElementById('m-pstatus').value,
      priority: document.getElementById('m-ppriority').value,
      start_date: document.getElementById('m-pstart').value || null,
      due_date: document.getElementById('m-pdue').value || null,
      progress: parseInt(document.getElementById('m-pprogress').value) || 0,
      lead_staff_id: document.getElementById('m-plead').value || null,
      description: document.getElementById('m-pdesc').value.trim(),
      next_step: document.getElementById('m-pnext').value.trim(),
      blockers: document.getElementById('m-pblockers').value.trim(),
      notes: document.getElementById('m-pnotes').value.trim()
    };
    if (!data.name) { alert('Project name is required'); return; }
    if (p.id) {
      await api(`/projects/${p.id}`, { method: 'PUT', body: JSON.stringify(data) });
      showProjectDetail(p.id);
    } else {
      await api('/projects', { method: 'POST', body: JSON.stringify(data) });
      navigateTo('projects');
    }
    closeModal();
  });
}

function openTaskModal() {
  openModal('New Task', `
    <div class="form-group"><label>Title *</label><input type="text" id="m-ttitle"></div>
    <div class="form-row">
      <div class="form-group"><label>Type</label>
        <select id="m-ttype"><option value="task">Task</option><option value="reminder">Reminder</option><option value="followup">Follow-up</option></select>
      </div>
      <div class="form-group"><label>Priority</label>
        <select id="m-tpriority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
      </div>
    </div>
    <div class="form-group"><label>Assign To</label><select id="m-tstaff">${staffOptions()}</select></div>
    <div class="form-group"><label>Due Date</label><input type="datetime-local" id="m-tdue"></div>
    <div class="form-group"><label>Description</label><textarea id="m-tdesc"></textarea></div>
  `, async () => {
    const data = {
      title: document.getElementById('m-ttitle').value.trim(),
      task_type: document.getElementById('m-ttype').value,
      priority: document.getElementById('m-tpriority').value,
      due_date: document.getElementById('m-tdue').value || null,
      assigned_staff_id: document.getElementById('m-tstaff').value || null,
      description: document.getElementById('m-tdesc').value.trim()
    };
    if (!data.title) { alert('Title is required'); return; }
    await api('/tasks', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    navigateTo('tasks');
  });
}

function openEventModal() {
  openModal('New Calendar Event', `
    <div class="form-group"><label>Title *</label><input type="text" id="m-etitle"></div>
    <div class="form-row">
      <div class="form-group"><label>Type</label>
        <select id="m-etype"><option value="meeting">Meeting</option><option value="deadline">Deadline</option><option value="followup">Follow-up</option><option value="milestone">Milestone</option><option value="event">Event</option></select>
      </div>
      <div class="form-group"><label>Location</label><input type="text" id="m-elocation"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Start *</label><input type="datetime-local" id="m-estart"></div>
      <div class="form-group"><label>End</label><input type="datetime-local" id="m-eend"></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="m-edesc"></textarea></div>
  `, async () => {
    const data = {
      title: document.getElementById('m-etitle').value.trim(),
      event_type: document.getElementById('m-etype').value,
      location: document.getElementById('m-elocation').value.trim(),
      start_time: document.getElementById('m-estart').value,
      end_time: document.getElementById('m-eend').value || null,
      description: document.getElementById('m-edesc').value.trim()
    };
    if (!data.title || !data.start_time) { alert('Title and start time required'); return; }
    await api('/calendar', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    navigateTo('calendar');
  });
}

function openMilestoneModal(projectId) {
  openModal('Add Milestone', `
    <div class="form-group"><label>Title *</label><input type="text" id="m-mtitle"></div>
    <div class="form-group"><label>Due Date</label><input type="date" id="m-mdue"></div>
    <div class="form-group"><label>Description</label><textarea id="m-mdesc"></textarea></div>
  `, async () => {
    const data = {
      title: document.getElementById('m-mtitle').value.trim(),
      due_date: document.getElementById('m-mdue').value || null,
      description: document.getElementById('m-mdesc').value.trim()
    };
    if (!data.title) { alert('Title required'); return; }
    await api(`/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    showProjectDetail(projectId);
  });
}

// Quick Add menu
function showQuickAdd() {
  openModal('What would you like to create?', `
    <p style="color:var(--text-secondary);font-size:14px;margin-bottom:16px">Choose what you'd like to add:</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn-ghost" onclick="closeModal();openContactModal()" style="padding:20px;font-size:15px;flex-direction:column;gap:4px">
        <span style="font-size:24px">&#128100;</span>
        <strong>Add a Person</strong>
        <span style="font-size:11px;color:var(--text-muted)">Contact, client, partner</span>
      </button>
      <button class="btn btn-ghost" onclick="closeModal();openProjectModal()" style="padding:20px;font-size:15px;flex-direction:column;gap:4px">
        <span style="font-size:24px">&#128203;</span>
        <strong>Start a Project</strong>
        <span style="font-size:11px;color:var(--text-muted)">Track work from start to finish</span>
      </button>
      <button class="btn btn-ghost" onclick="closeModal();openTaskModal()" style="padding:20px;font-size:15px;flex-direction:column;gap:4px">
        <span style="font-size:24px">&#9989;</span>
        <strong>Add a To-Do</strong>
        <span style="font-size:11px;color:var(--text-muted)">Task, reminder, follow-up</span>
      </button>
      <button class="btn btn-ghost" onclick="closeModal();openEventModal()" style="padding:20px;font-size:15px;flex-direction:column;gap:4px">
        <span style="font-size:24px">&#128197;</span>
        <strong>Schedule Event</strong>
        <span style="font-size:11px;color:var(--text-muted)">Meeting, deadline, milestone</span>
      </button>
    </div>
  `, null);
  document.querySelector('.modal-footer').classList.add('hidden');
}

// =====================================================
// NLP WIDGET
// =====================================================
async function sendAICommand(target) {
  const inputId = target === 'ai' ? 'ai-input' : 'nlp-input';
  const msgContainerId = target === 'ai' ? 'ai-messages' : 'nlp-messages';
  const input = document.getElementById(inputId);
  const text = input.value.trim();
  if (!text) return;

  const msgContainer = document.getElementById(msgContainerId);
  msgContainer.innerHTML += `<div class="nlp-msg user">${escHtml(text)}</div>`;
  input.value = '';

  try {
    const res = await api('/nlp/command', { method: 'POST', body: JSON.stringify({ text }) });
    const response = res.data?.response || res.error || (res.success ? 'Done.' : 'Sorry, I could not process that.');
    msgContainer.innerHTML += `<div class="nlp-msg system">${escHtml(response)}</div>`;
  } catch (err) {
    msgContainer.innerHTML += `<div class="nlp-msg system" style="color:var(--danger)">Error: ${err.message}</div>`;
  }
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

// =====================================================
// STAFF & ROLES
// =====================================================
let ROLES = [];
let STAFF = [];

async function loadRoles() {
  try {
    const res = await api('/staff/roles/list');
    if (res.success) ROLES = res.data;
  } catch (e) { console.log('Roles load error'); }
}

async function loadStaff() {
  try {
    const res = await api('/staff');
    if (res.success) STAFF = res.data;
  } catch (e) { console.log('Staff load error'); }
}

async function renderStaff(container) {
  await Promise.all([loadRoles(), loadStaff()]);
  const staff = STAFF;

  container.innerHTML = `
    <div class="section-header">
      <div class="filter-bar">
        <input type="text" placeholder="Search staff..." id="staff-search" style="width:250px">
        <select id="staff-dept-filter">
          <option value="">All Departments</option>
          ${[...new Set(staff.map(s => s.department).filter(Boolean))].map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="showRolesManager()">&#128119; Manage Roles</button>
        <button class="btn btn-primary btn-sm" onclick="openStaffModal()">+ Add Staff</button>
      </div>
    </div>
    <p class="section-hint">Your team members. Click on a person to see their details, roles, and responsibilities.</p>
    <div id="staff-list"></div>
  `;

  renderStaffList(staff);

  const searchInput = document.getElementById('staff-search');
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    const dept = document.getElementById('staff-dept-filter').value;
    const filtered = STAFF.filter(s => {
      const matchSearch = !q || `${s.first_name} ${s.last_name} ${s.email} ${s.position}`.toLowerCase().includes(q);
      const matchDept = !dept || s.department === dept;
      return matchSearch && matchDept;
    });
    renderStaffList(filtered);
  });
  document.getElementById('staff-dept-filter')?.addEventListener('change', () => {
    searchInput.dispatchEvent(new Event('input'));
  });
}

function renderStaffList(staff) {
  document.getElementById('staff-list').innerHTML = staff.length > 0
    ? `<table class="data-table"><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Email</th><th>Roles</th><th>Status</th></tr></thead><tbody>` +
      staff.map(s => `<tr class="clickable" onclick="showStaffDetail(${s.id})">
        <td><strong>${s.first_name} ${s.last_name || ''}</strong></td>
        <td>${s.position || '-'}</td>
        <td>${s.department || '-'}</td>
        <td>${s.email || '-'}</td>
        <td>${s.roles?.length ? s.roles.map(r => `<span class="tag" style="background:${r.color}20;color:${r.color}">${r.name}</span>`).join(' ') : '<span style="color:var(--text-muted)">None</span>'}</td>
        <td><span class="status-badge status-${s.status}">${s.status}</span></td>
      </tr>`).join('') + '</tbody></table>'
    : '<div class="empty-state"><div class="empty-icon">&#128119;</div><h3>No staff members yet</h3><p>Add your team members to assign them to projects and tasks.</p><button class="get-started-btn" onclick="openStaffModal()">&#128119; Add Your First Staff Member</button></div>';
}

async function showStaffDetail(id) {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="spinner"></div>';
  const res = await api(`/staff/${id}`);
  if (!res.success) { container.innerHTML = '<div class="empty-state"><h3>Staff member not found</h3><button class="btn btn-ghost" onclick="navigateTo(\'staff\')">Back</button></div>'; return; }
  const s = res.data;

  container.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('staff')" style="margin-bottom:8px">&#8592; Back to Staff</button>
          <h2>${s.first_name} ${s.last_name || ''}</h2>
          ${s.position ? `<p style="color:var(--text-secondary)">${s.position}${s.department ? ' — ' + s.department : ''}</p>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="openStaffModal(${JSON.stringify(s).replace(/"/g,'&quot;')})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="archiveStaff(${s.id})">Archive</button>
        </div>
      </div>
      <div class="detail-meta">
        <span class="status-badge status-${s.status}">${s.status}</span>
        ${s.department ? `<div class="detail-meta-item">&#127970; ${s.department}</div>` : ''}
        ${s.hire_date ? `<div class="detail-meta-item">&#128197; Hired: ${fmtDate(s.hire_date)}</div>` : ''}
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-top:24px">
        <div>
          <div class="detail-section">
            <h4>Roles & Responsibilities</h4>
            ${s.roles?.length ? s.roles.map(r => `
              <div class="card" style="margin-bottom:12px;border-left:3px solid ${r.color}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <strong style="color:${r.color}">${r.name}</strong>
                </div>
                ${r.description ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">${r.description}</p>` : ''}
                ${r.responsibilities?.length ? `<div style="font-size:13px"><strong style="color:var(--text-muted)">Responsibilities:</strong><ul style="margin:4px 0 0 16px;color:var(--text-secondary)">` +
                  r.responsibilities.map(resp => `<li>${resp.name}${resp.description ? ' — <span style="color:var(--text-muted)">'+resp.description+'</span>' : ''}</li>`).join('') +
                  '</ul></div>' : '<p style="font-size:12px;color:var(--text-muted);font-style:italic">No responsibilities defined for this role</p>'}
              </div>
            `).join('') : '<p style="font-size:13px;color:var(--text-muted)">No roles assigned. <a href="#" onclick="event.preventDefault();openStaffModal(${JSON.stringify(s).replace(/"/g,\'&quot;\')})" style="color:var(--accent)">Edit to add roles</a></p>'}
          </div>

          <div class="detail-section">
            <h4>Assigned Tasks</h4>
            ${s.tasks?.length ? s.tasks.map(t => {
              const tOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status === 'pending';
              return `<div class="timeline-item" style="cursor:pointer;border-left:3px solid ${t.status === 'completed' ? 'var(--success)' : tOverdue ? 'var(--danger)' : 'var(--accent)'}" onclick="showTaskDetail(${t.id})">
                <div class="timeline-content">
                  <strong>${t.title}</strong> <span class="priority-badge priority-${t.priority}">${t.priority}</span>
                  ${t.due_date ? '<br><span class="timeline-time">Due: '+fmtDate(t.due_date)+'</span>' : ''}
                </div>
              </div>`;
            }).join('') : '<p style="font-size:13px;color:var(--text-muted)">No pending tasks assigned</p>'}
          </div>

          <div class="detail-section">
            <h4>Leading Projects</h4>
            ${s.led_projects?.length ? s.led_projects.map(p => `<div class="timeline-item" style="cursor:pointer" onclick="showProjectDetail(${p.id})">
              <div class="timeline-dot" style="background:var(--accent)"></div>
              <div class="timeline-content"><strong>${p.name}</strong> <span class="status-badge status-${p.status}">${p.status}</span></div>
            </div>`).join('') : '<p style="font-size:13px;color:var(--text-muted)">Not leading any projects</p>'}
          </div>
        </div>

        <div>
          <div class="detail-section">
            <h4>Contact Info</h4>
            <div style="font-size:14px;display:flex;flex-direction:column;gap:8px">
              ${s.email ? `<div><span style="color:var(--text-muted)">Email:</span> ${s.email}</div>` : ''}
              ${s.phone ? `<div><span style="color:var(--text-muted)">Phone:</span> ${s.phone}</div>` : ''}
              ${s.hire_date ? `<div><span style="color:var(--text-muted)">Hire Date:</span> ${fmtDate(s.hire_date)}</div>` : ''}
              <div><span style="color:var(--text-muted)">Created:</span> ${fmtDate(s.created_at)}</div>
            </div>
          </div>
          ${s.notes ? `<div class="detail-section"><h4>Notes</h4><p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${s.notes}</p></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function roleCheckboxes(selectedIds = []) {
  return ROLES.map(r => `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
    <input type="checkbox" class="role-cb" value="${r.id}" ${selectedIds.includes(r.id) ? 'checked' : ''}>
    <span class="tag" style="background:${r.color}20;color:${r.color}">${r.name}</span>
    ${r.description ? `<span style="font-size:11px;color:var(--text-muted)">${r.description}</span>` : ''}
  </label>`).join('');
}

function staffOptions(selectedId) {
  return `<option value="">-- No Assignee --</option>` +
    STAFF.map(s => `<option value="${s.id}" ${s.id == selectedId ? 'selected' : ''}>${s.first_name} ${s.last_name || ''}${s.position ? ' (' + s.position + ')' : ''}</option>`).join('');
}

async function openStaffModal(existing) {
  await loadRoles();
  const s = existing || {};
  const selectedRoleIds = (s.roles || []).map(r => r.id);

  openModal(s.id ? 'Edit Staff Member' : 'Add Staff Member', `
    <div class="form-row">
      <div class="form-group"><label>First Name *</label><input type="text" id="m-sfirst" value="${s.first_name || ''}"></div>
      <div class="form-group"><label>Last Name</label><input type="text" id="m-slast" value="${s.last_name || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" id="m-semail" value="${s.email || ''}"></div>
      <div class="form-group"><label>Phone</label><input type="text" id="m-sphone" value="${s.phone || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Position / Title</label><input type="text" id="m-sposition" value="${s.position || ''}"></div>
      <div class="form-group"><label>Department</label><input type="text" id="m-sdept" value="${s.department || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Status</label>
        <select id="m-sstatus">
          <option value="active" ${s.status==='active'?'selected':''}>Active</option>
          <option value="inactive" ${s.status==='inactive'?'selected':''}>Inactive</option>
          <option value="on_leave" ${s.status==='on_leave'?'selected':''}>On Leave</option>
        </select>
      </div>
      <div class="form-group"><label>Hire Date</label><input type="date" id="m-shire" value="${s.hire_date || ''}"></div>
    </div>
    <div class="form-group">
      <label>Roles</label>
      <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:8px">
        ${ROLES.length ? roleCheckboxes(selectedRoleIds) : '<p style="font-size:13px;color:var(--text-muted)">No roles defined yet. <a href="#" onclick="event.preventDefault();closeModal();showRolesManager()" style="color:var(--accent)">Create roles first</a></p>'}
      </div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="m-snotes">${s.notes || ''}</textarea></div>
  `, async () => {
    const role_ids = [...document.querySelectorAll('.role-cb:checked')].map(cb => parseInt(cb.value));
    const data = {
      first_name: document.getElementById('m-sfirst').value.trim(),
      last_name: document.getElementById('m-slast').value.trim(),
      email: document.getElementById('m-semail').value.trim(),
      phone: document.getElementById('m-sphone').value.trim(),
      position: document.getElementById('m-sposition').value.trim(),
      department: document.getElementById('m-sdept').value.trim(),
      status: document.getElementById('m-sstatus').value,
      hire_date: document.getElementById('m-shire').value || null,
      notes: document.getElementById('m-snotes').value.trim(),
      role_ids
    };
    if (!data.first_name) { alert('First name is required'); return; }
    if (s.id) {
      await api(`/staff/${s.id}`, { method: 'PUT', body: JSON.stringify(data) });
      closeModal();
      showStaffDetail(s.id);
    } else {
      await api('/staff', { method: 'POST', body: JSON.stringify(data) });
      closeModal();
      navigateTo('staff');
    }
  });
}

async function archiveStaff(id) {
  if (!confirm('Archive this staff member?')) return;
  await api(`/staff/${id}/archive`, { method: 'PUT' });
  navigateTo('staff');
}

// =====================================================
// ROLES MANAGER
// =====================================================
async function showRolesManager() {
  await loadRoles();
  const container = document.getElementById('view-container');
  document.getElementById('page-title').textContent = 'Manage Roles & Responsibilities';

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('staff')">&#8592; Back to Staff</button>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openRoleModal()">+ Add Role</button>
    </div>
    <p class="section-hint">Define roles and their responsibilities. Roles can then be assigned to staff members.</p>
    <div id="roles-list"></div>
  `;

  renderRolesList();
}

function renderRolesList() {
  document.getElementById('roles-list').innerHTML = ROLES.length > 0
    ? ROLES.map(r => `
      <div class="card" style="margin-bottom:16px;border-left:3px solid ${r.color}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <h3 style="font-size:16px;margin-bottom:4px;color:${r.color}">${r.name}</h3>
            ${r.description ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">${r.description}</p>` : ''}
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${r.staff?.length || 0} staff member(s)</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="openRoleModal(${JSON.stringify(r).replace(/"/g,'&quot;')})">Edit</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteRole(${r.id},'${r.name.replace(/'/g,"\\'")}')">Delete</button>
          </div>
        </div>
        <div style="margin-top:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:13px;color:var(--text-secondary)">Responsibilities</strong>
            <button class="btn btn-ghost btn-sm" onclick="openResponsibilityModal(${r.id})">+ Add</button>
          </div>
          ${r.responsibilities?.length ? r.responsibilities.map(resp => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:var(--radius);background:var(--bg-hover);margin-bottom:4px">
              <div>
                <span style="font-size:13px">${resp.name}</span>
                ${resp.description ? `<span style="font-size:11px;color:var(--text-muted)"> — ${resp.description}</span>` : ''}
                ${resp.category ? `<span class="tag" style="margin-left:4px">${resp.category}</span>` : ''}
              </div>
              <div style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" onclick="openResponsibilityModal(${r.id},${JSON.stringify(resp).replace(/"/g,'&quot;')})">Edit</button>
                <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;color:var(--danger)" onclick="deleteResponsibility(${resp.id},${r.id})">&#10005;</button>
              </div>
            </div>
          `).join('') : '<p style="font-size:12px;color:var(--text-muted);font-style:italic;padding:4px 8px">No responsibilities defined yet</p>'}
        </div>
      </div>
    `).join('')
    : '<div class="empty-state"><div class="empty-icon">&#128119;</div><h3>No roles defined yet</h3><p>Create roles to organize your team\'s responsibilities.</p><button class="get-started-btn" onclick="openRoleModal()">&#128119; Create Your First Role</button></div>';
}

function openRoleModal(existing) {
  const r = existing || {};
  openModal(r.id ? 'Edit Role' : 'New Role', `
    <div class="form-group"><label>Role Name *</label><input type="text" id="m-rname" value="${r.name || ''}"></div>
    <div class="form-group"><label>Description</label><textarea id="m-rdesc">${r.description || ''}</textarea></div>
    <div class="form-group"><label>Color</label><input type="color" id="m-rcolor" value="${r.color || '#2563eb'}" style="height:40px;width:100%"></div>
  `, async () => {
    const data = {
      name: document.getElementById('m-rname').value.trim(),
      description: document.getElementById('m-rdesc').value.trim(),
      color: document.getElementById('m-rcolor').value
    };
    if (!data.name) { alert('Role name is required'); return; }
    if (r.id) {
      await api(`/staff/roles/${r.id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/staff/roles', { method: 'POST', body: JSON.stringify(data) });
    }
    closeModal();
    await loadRoles();
    renderRolesList();
  });
}

async function deleteRole(id, name) {
  if (!confirm(`Delete role "${name}"? Staff members will be unlinked from this role.`)) return;
  await api(`/staff/roles/${id}`, { method: 'DELETE' });
  await loadRoles();
  renderRolesList();
}

function openResponsibilityModal(roleId, existing) {
  const r = existing || {};
  openModal(r.id ? 'Edit Responsibility' : 'Add Responsibility', `
    <div class="form-group"><label>Name *</label><input type="text" id="m-respname" value="${r.name || ''}"></div>
    <div class="form-group"><label>Description</label><textarea id="m-respdesc">${r.description || ''}</textarea></div>
    <div class="form-group"><label>Category</label><input type="text" id="m-respcat" value="${r.category || ''}" placeholder="e.g. Operations, Finance, HR"></div>
  `, async () => {
    const data = {
      name: document.getElementById('m-respname').value.trim(),
      description: document.getElementById('m-respdesc').value.trim(),
      category: document.getElementById('m-respcat').value.trim(),
      role_id: roleId
    };
    if (!data.name) { alert('Name is required'); return; }
    if (r.id) {
      await api(`/staff/responsibilities/${r.id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/staff/responsibilities', { method: 'POST', body: JSON.stringify(data) });
    }
    closeModal();
    await loadRoles();
    renderRolesList();
  });
}

async function deleteResponsibility(id, roleId) {
  if (!confirm('Remove this responsibility?')) return;
  await api(`/staff/responsibilities/${id}`, { method: 'DELETE' });
  await loadRoles();
  renderRolesList();
}

// =====================================================
// UX HELPERS (user-friendly features)
// =====================================================
function dismissWelcome() {
  localStorage.setItem('d2ai_welcome_dismissed', '1');
  const banner = document.getElementById('welcome-banner');
  if (banner) banner.style.display = 'none';
}

function nlpChip(text) {
  const input = document.getElementById('nlp-input');
  if (input) {
    input.value = text;
    sendAICommand('nlp');
  }
}

// =====================================================
// UTILITIES
// =====================================================
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

// =====================================================
// EVENT LISTENERS
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  initTheme();

  // Auth
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Navigation
  document.querySelectorAll('.sidebar-nav li').forEach(li => {
    li.addEventListener('click', () => {
      if (li.dataset.view) navigateTo(li.dataset.view);
      // Close sidebar on mobile after selection
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('mobile-open');
        document.getElementById('sidebar-overlay').classList.add('hidden');
      }
    });
  });

  // Sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', () => { if (modalSaveHandler) modalSaveHandler(); });
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  // NLP Widget
  document.getElementById('nlp-toggle').addEventListener('click', () => {
    document.getElementById('nlp-panel').classList.toggle('hidden');
  });
  document.getElementById('nlp-close').addEventListener('click', () => {
    document.getElementById('nlp-panel').classList.add('hidden');
  });
  document.getElementById('nlp-send').addEventListener('click', () => sendAICommand('nlp'));
  document.getElementById('nlp-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendAICommand('nlp');
  });

  // Quick Add
  document.getElementById('quick-add-btn').addEventListener('click', showQuickAdd);

  // Notification button
  document.getElementById('notif-btn').addEventListener('click', () => navigateTo('notifications'));

  // Check auth state
  checkAuth();

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/projects/sw.js').catch(() => {});
  }
});
