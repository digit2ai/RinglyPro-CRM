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
// PWA INSTALL
// =====================================================
let _deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); _deferredInstall = e; showInstallBanner('android'); });
window.addEventListener('appinstalled', () => { _deferredInstall = null; hideInstallBanner(); });
function pwaStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function pwaIsIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function maybeShowIosInstallHint() { if (pwaIsIOS() && !pwaStandalone()) showInstallBanner('ios'); }
function hideInstallBanner() { const b = document.getElementById('pwa-install-banner'); if (b) b.remove(); }
function showInstallBanner(kind) {
  if (pwaStandalone() || document.getElementById('pwa-install-banner')) return;
  if (localStorage.getItem('d2ai_install_dismissed')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9000;background:linear-gradient(135deg,#7c5cff,#2563eb);color:#fff;display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.4);font-size:14px;max-width:520px;margin:0 auto';
  banner.innerHTML = kind === 'ios'
    ? `<span style="flex:1">Install this app &mdash; tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.</span><button id="pwa-x" style="background:rgba(255,255,255,.2);border:0;color:#fff;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer">Got it</button>`
    : `<span style="flex:1">Install Digit2AI Projects as an app</span><button id="pwa-go" style="background:#fff;border:0;color:#2563eb;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer">Install</button><button id="pwa-x" style="background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1">&times;</button>`;
  document.body.appendChild(banner);
  const x = document.getElementById('pwa-x'); if (x) x.addEventListener('click', () => { localStorage.setItem('d2ai_install_dismissed', '1'); hideInstallBanner(); });
  const go = document.getElementById('pwa-go'); if (go) go.addEventListener('click', async () => { if (!_deferredInstall) return; _deferredInstall.prompt(); try { await _deferredInstall.userChoice; } catch (e) {} _deferredInstall = null; hideInstallBanner(); });
}
window.showInstallBanner = showInstallBanner;

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

async function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('user-info').textContent = USER?.email || '';

  // Single sign-on: mirror the Hub's CRM JWT into the key embedded CRM pages read
  // ('token'), so users with an existing Hub session also skip the CRM login.
  if (TOKEN) localStorage.setItem('token', TOKEN);

  // Restore RinglyPro group collapse state (collapsed by default).
  if (typeof toggleRinglyProGroup === 'function') {
    toggleRinglyProGroup(localStorage.getItem('d2ai_rp_open') === '1');
  }

  // When the embedded Messages iframe marks something read, refresh the unread badge.
  if (!window._crmMsgListener) {
    window._crmMsgListener = true;
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin) return;
      if (e.data && e.data.type === 'crm-messages-read' && typeof loadCrmCallStats === 'function') {
        loadCrmCallStats();
      }
      if (e.data && e.data.type === 'email-stats-changed' && typeof refreshEmailBadge === 'function') {
        refreshEmailBadge();
      }
    });
  }

  // Resolve role + apply per-role nav restrictions before loading anything heavy
  let role = 'admin';
  try {
    const meRes = await api('/me');
    if (meRes && meRes.success) role = meRes.data.role || 'admin';
  } catch (e) {}
  USER = USER || {}; USER.role = role;
  localStorage.setItem('d2ai_user', JSON.stringify(USER));

  if (role === 'calendar_only') {
    // Hide every nav item except Calendar
    document.querySelectorAll('.nav li[data-view]').forEach(li => {
      if (li.getAttribute('data-view') !== 'calendar') li.style.display = 'none';
    });
    // Skip the heavy loaders that hit forbidden endpoints
    navigateTo('calendar');
    return;
  }

  loadVerticals();
  loadStaff();
  loadRoles();
  refreshInboxBadge();
  refreshMessagesBadge();
  refreshEmailBadge();
  refreshNotifBadge();
  maybeShowIosInstallHint(); // iOS has no install prompt event — show the hint
  if (!window._inboxBadgePoll) {
    window._inboxBadgePoll = setInterval(() => {
      if (document.hidden) return;
      refreshInboxBadge();
      refreshMessagesBadge();
      refreshEmailBadge();
      refreshNotifBadge();
    }, 60000);
  }
  // PWA shortcut deep-links: /projects/?view=email|messages|calendar|...
  const vp = new URLSearchParams(location.search).get('view');
  const allowed = ['overview', 'inbox', 'messages', 'email', 'contacts', 'projects', 'calendar', 'tasks', 'minutes', 'staff', 'settings', 'followups'];
  navigateTo(allowed.includes(vp) ? vp : 'overview');
}

// =====================================================
// INBOX BADGE (pending project requests)
// =====================================================
// Unread CRM messages badge on the Messages nav item (client 15).
function setMessagesBadge(unread) {
  const badge = document.getElementById('messages-badge');
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function refreshMessagesBadge() {
  try {
    const res = await fetch(`${location.origin}/api/projects-bridge/call-stats`);
    const d = await res.json();
    setMessagesBadge(d.unread_messages ?? 0);
  } catch (e) { /* silent */ }
}

// Unread email badge on the Email nav item (client 15, across all inboxes).
function setEmailBadge(unread) {
  const badge = document.getElementById('email-badge');
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function refreshEmailBadge() {
  if (!TOKEN) return;
  try {
    const res = await fetch(`${location.origin}/api/projects-bridge/email-stats`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const d = await res.json();
    if (d && d.success) {
      const unread = d.total_unread ?? 0;
      setEmailBadge(unread);                  // left-pane nav badge
      paintQaBadge('qa-email-badge', unread, '#ef4444'); // Home quick-action badge
      const ef = document.getElementById('kpi-email-followups'); // Home "Emails to Follow Up" card
      if (ef) ef.textContent = d.emails_followup ?? 0;
    }
  } catch (e) { /* silent */ }
}

// Paint a Home quick-action corner badge (matches Messages quick-action styling).
function paintQaBadge(elId, n, color) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (n > 0) {
    el.textContent = n > 99 ? '99+' : String(n);
    el.style.cssText = `position:absolute;top:-6px;right:-6px;background:${color};color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;min-width:20px;text-align:center;line-height:1.2;box-shadow:0 2px 6px ${color}66`;
  } else {
    el.textContent = '';
    el.style.cssText = '';
  }
}

// Unread alerts badge on the topbar bell (Alerts & Updates / reminders).
async function refreshNotifBadge() {
  try {
    const res = await api('/notifications?unread_only=true');
    const badge = document.getElementById('bell-badge');
    if (!badge) return;
    const n = (res && res.success && Array.isArray(res.data)) ? res.data.length : 0;
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) { /* silent */ }
}

async function refreshInboxBadge() {
  try {
    const res = await api('/projects/inbox/count');
    const badge = document.getElementById('inbox-badge');
    if (!badge) return;
    if (res && res.success && res.count > 0) {
      badge.textContent = res.count > 99 ? '99+' : res.count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) { /* silent */ }
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
      // Single sign-on: the Hub authenticates against the main CRM (/api/auth/login),
      // so this token is a valid CRM JWT. Mirror it into the key the embedded CRM
      // pages read ('token') so Call Management / Messages etc. don't re-prompt.
      localStorage.setItem('token', TOKEN);
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
  localStorage.removeItem('token'); // also clear the mirrored CRM SSO token
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
function navigateTo(view, opts) {
  _lastDrilldown = null;
  currentView = view;
  _pendingViewOpts = opts || null;
  document.querySelectorAll('.sidebar-nav li').forEach(li => {
    li.classList.toggle('active', li.dataset.view === view);
  });
  const titles = {
    overview: 'Home', inbox: 'Project Request Inbox', messages: 'Calls & Messages', email: 'Email', followups: 'Calls To Follow Up', emailfollowups: 'Emails to Follow Up', contacts: 'People & Pipeline', projects: 'My Projects',
    calendar: 'Calendar', tasks: 'My To-Do List', minutes: 'Meeting Minutes', staff: 'Staff & Roles',
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
      case 'messages': renderMessages(container); break;
      case 'email': renderEmails(container); break;
      case 'emailfollowups': renderEmailFollowups(container); break;
      case 'followups': await renderFollowups(container); break;
      case 'inbox': await renderInbox(container); break;
      case 'contacts': await renderContacts(container); break;
      case 'projects': await renderProjects(container); break;
      case 'calendar': await renderCalendar(container); break;
      case 'tasks': await renderTasks(container); break;
      case 'minutes': await renderMeetingMinutes(container); break;
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
// MESSAGES (embedded CRM calls/voicemails/SMS for client 15)
// "Embed now, native later" — iframes the standalone /projects-messages.html
// page, which pulls from /api/projects-bridge/messages on the main CRM.
// =====================================================
function renderMessages(container) {
  // Cache-bust so the freshest embed page always loads after a deploy.
  const v = (window.BUILD_VERSION || Date.now());
  container.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;height:calc(100vh - 160px);min-height:520px">
      <iframe src="${location.origin}/projects-messages.html?v=${v}"
              style="width:100%;height:100%;border:0;display:block;background:transparent"
              title="Calls & Messages"></iframe>
    </div>`;
}

// Calls To Follow Up — the same Calls & Messages window, filtered to just the
// leads needing a callback, each with a "Mark followed up" button.
function renderFollowups(container) {
  const v = (window.BUILD_VERSION || Date.now());
  container.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;height:calc(100vh - 160px);min-height:520px">
      <iframe src="${location.origin}/projects-messages.html?mode=followups&v=${v}"
              style="width:100%;height:100%;border:0;display:block;background:transparent"
              title="Calls To Follow Up"></iframe>
    </div>`;
}

function renderEmails(container) {
  const v = (window.BUILD_VERSION || Date.now());
  container.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;height:calc(100vh - 160px);min-height:520px">
      <iframe src="${location.origin}/projects-emails.html?v=${v}"
              style="width:100%;height:100%;border:0;display:block;background:transparent"
              title="Email"></iframe>
    </div>`;
}

function renderEmailFollowups(container) {
  const v = (window.BUILD_VERSION || Date.now());
  container.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;height:calc(100vh - 160px);min-height:520px">
      <iframe src="${location.origin}/projects-emails.html?mode=followups&v=${v}"
              style="width:100%;height:100%;border:0;display:block;background:transparent"
              title="Emails to Follow Up"></iframe>
    </div>`;
}

// Generic embed for RinglyPro CRM screens in the Hub left pane ("embed now").
// Same-origin iframe; SSO token is mirrored to localStorage 'token' at login so
// these pages don't re-prompt. el = clicked <li> (for active highlight).
function openCrmEmbed(url, title, el) {
  _lastDrilldown = null;
  currentView = 'crm-embed';
  document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
  if (el) el.classList.add('active');
  const t = document.getElementById('page-title');
  if (t) t.textContent = title;
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;height:calc(100vh - 150px);min-height:520px">
      <iframe src="${url}" style="width:100%;height:100%;border:0;display:block;background:#fff" title="${escapeHtml(title)}"></iframe>
    </div>`;
}
window.openCrmEmbed = openCrmEmbed;

// Collapsible RinglyPro nav group. Collapsed by default; state persists.
function toggleRinglyProGroup(forceOpen) {
  const items = document.querySelectorAll('.rp-item');
  const caret = document.getElementById('rp-caret');
  const open = typeof forceOpen === 'boolean'
    ? forceOpen
    : !(items[0] && items[0].style.display !== 'none');
  items.forEach(li => { li.style.display = open ? '' : 'none'; });
  if (caret) caret.innerHTML = open ? '&#9662;' : '&#9656;'; // ▾ / ▸
  try { localStorage.setItem('d2ai_rp_open', open ? '1' : '0'); } catch (e) {}
}
window.toggleRinglyProGroup = toggleRinglyProGroup;

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
        <p>This is your control center. Click on any card below to see details, use the <strong>+ Create</strong> button to add new items, or click the <strong>AI button</strong> in the bottom-right corner to ask questions in plain English.</p>
      </div>
      <button class="welcome-dismiss" onclick="dismissWelcome()" title="Hide this message">&times;</button>
    </div>` : '';

  // Quick actions bar
  const mkBadge = (n, color) => {
    if (!n || n <= 0) return '';
    const label = n > 99 ? '99+' : String(n);
    return `<span style="position:absolute;top:-6px;right:-6px;background:${color};color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;min-width:20px;text-align:center;line-height:1.2;box-shadow:0 2px 6px ${color}66">${label}</span>`;
  };
  const calendarBadge    = mkBadge(s.meetings_today ?? 0, '#2563eb');
  const outstandingBadge = mkBadge(s.pending_tasks ?? 0, '#ef4444');
  // Messages replaces the old Reminder quick-action. Its unread badge is filled
  // async by loadCrmCallStats() from /api/projects-bridge/call-stats (client 15).
  const quickActionsHtml = `
    <div class="quick-actions">
      <button class="quick-action-btn" style="position:relative" onclick="openCalendarWeek()"><span class="qa-label">Calendar</span>${calendarBadge}</button>
      <button class="quick-action-btn" style="position:relative" onclick="openOutstandingTasks()"><span class="qa-label">Outstanding</span>${outstandingBadge}</button>
      <button class="quick-action-btn" style="position:relative" onclick="navigateTo('messages')"><span class="qa-label">Messages</span><span id="qa-msg-badge"></span></button>
      <button class="quick-action-btn" style="position:relative" onclick="navigateTo('email')"><span class="qa-label">Email</span><span id="qa-email-badge"></span></button>
    </div>`;

  // Lina voice orb — zero-key Edge neural TTS (reuses /api/tts/edge). Non-conversational
  // scripted narration that greets the owner and summarizes the Hub. Wired by initLinaOrb().
  const linaOrbHtml = `
    <div class="lina" id="lina-orb">
      <div class="orb" id="linaOrb"></div>
      <div class="lina-meta">
        <div class="lina-name">Lina &middot; Voz AI de Digit2AI</div>
        <div class="lina-role">Tu asistente del Centro de Proyectos</div>
        <div class="controls">
          <button class="primary" id="linaPlayAll">&#9654; Que Lina te d&eacute; el resumen</button>
          <button id="linaPause" disabled>&#10074;&#10074; Pausar</button>
          <button id="linaStop" disabled>&#9632; Detener</button>
        </div>
        <div class="status" id="linaStatus">Pulsa el bot&oacute;n para escuchar el resumen de tu centro de proyectos.</div>
        <div class="voicepick">
          <label><input type="checkbox" id="linaNeuralToggle" checked> Voz neural HD</label>
          &nbsp;&middot;&nbsp; Acento:
          <select id="linaVoiceSel">
            <option value="lina" selected>M&eacute;xico (Dalia)</option>
            <option value="paloma">EE. UU. (Paloma)</option>
            <option value="salome">Colombia (Salom&eacute;)</option>
            <option value="elvira">Espa&ntilde;a (Elvira)</option>
          </select>
          <span id="linaVoiceMode" style="margin-left:8px;color:#10b981"></span>
        </div>
      </div>
    </div>`;

  container.innerHTML = `
    ${welcomeHtml}
    ${quickActionsHtml}
    ${linaOrbHtml}

    <div class="card card-accent-blue" style="margin-bottom:24px">
      <div class="section-header"><h3>Coming Up — Today &amp; Tomorrow</h3></div>
      <p class="section-hint">Your meetings and events for today and tomorrow</p>
      <div id="upcoming-list"></div>
    </div>

    <div class="card-grid" style="margin-bottom:24px">
      <div class="card card-stat card-accent-cyan card-clickable" onclick="navigateTo('emailfollowups')" data-tooltip="Open emails you flagged to follow up">
        <div class="stat-label">Emails to Follow Up</div>
        <div class="stat-value" id="kpi-email-followups">&middot;</div>
        <div class="stat-change stat-neutral">Emails you flagged to follow up</div>
        <div class="kpi-hint">Click to view</div>
      </div>
      <div class="card card-stat card-accent-blue card-clickable ${s.overdue_tasks > 0 ? 'card-needs-attention' : ''}" onclick="navigateTo('tasks', {due:'overdue_today'})" data-tooltip="Open overdue + due today">
        <div class="stat-label">To-Do Items Due Today</div>
        <div class="stat-value">${s.tasks_due_today ?? 0}</div>
        <div class="stat-change ${s.overdue_tasks > 0 ? 'stat-down' : 'stat-up'}">${s.overdue_tasks > 0 ? s.overdue_tasks + ' overdue from prior days' : ((s.tasks_due_today ?? 0) > 0 ? 'Due today' : 'Nothing due today')}</div>
      </div>
      <div class="card card-stat card-accent-purple card-clickable" onclick="navigateTo('followups')" data-tooltip="Open the leads waiting on a callback">
        <div class="stat-label">Calls To Follow Up</div>
        <div class="stat-value" id="kpi-followups">&middot;</div>
        <div class="stat-change stat-neutral">Calls/messages you flagged to follow up</div>
        <div class="kpi-hint">Click to view messages</div>
      </div>
    </div>

    <div id="neural-findings-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <h2 style="margin:0;background:linear-gradient(135deg,#a78bfa,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:1.4rem">Neural Findings</h2>
          <span id="findings-count-badge" style="display:none;background:#1e293b;color:#94a3b8;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:600">0</span>
        </div>
      </div>
      <div id="findings-list"><div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">Loading findings...</div></div>
    </div>
  `;

  // Upcoming events - clickable (still wired since Coming Up Next is above the stat cards)
  document.getElementById('upcoming-list').innerHTML = d.upcoming_events.length > 0
    ? d.upcoming_events.map(e => `<div class="timeline-item" style="cursor:pointer" onclick="showEventDetail(${e.id})"><div class="timeline-dot" style="background:var(--info)"></div><div class="timeline-content"><strong>${e.title}</strong><br><span class="timeline-time">${fmtDateTime(e.start_time)}</span>${e.event_type ? ' <span class="status-badge status-planning">'+e.event_type+'</span>' : ''}</div></div>`).join('')
    : '<p style="color:var(--text-muted);font-size:13px;padding:12px">Nothing scheduled for today or tomorrow. <a href="#" onclick="event.preventDefault();openEventModal()" style="color:var(--accent)">Schedule something</a></p>';

  // Neural Findings — fetched async so the rest of the page renders first
  loadNeuralFindings();

  // CRM call/message stats (client 15) — fills the two KPI cards + Messages badge
  loadCrmCallStats();

  // Email unread (paints the Email quick-action badge)
  refreshEmailBadge();

  // Lina voice orb playback engine
  initLinaOrb();
}

// =====================================================
// LINA VOICE ORB — zero-key Edge neural TTS narration
// Neural-first via /api/tts/edge, automatic browser-speech fallback.
// Non-conversational scripted segments (canonical "Lina" pattern).
// =====================================================
function initLinaOrb() {
  const orb = document.getElementById('linaOrb');
  if (!orb) return;

  const segments = [
    'Hola, soy Lina, la voz de inteligencia artificial de Digit2AI. Te doy la bienvenida a tu Centro de Proyectos.',
    'Este es tu centro de mando. Desde aquí ves de un vistazo tus reuniones de hoy y de mañana, las tareas pendientes, los correos que marcaste para seguimiento y las llamadas y mensajes que esperan respuesta.',
    'Más abajo encontrarás los Hallazgos Neurales: nuestra red de agentes vigila cada proyecto y te avisa cuando algo se atrasa, le falta un responsable o un hito está por vencer, antes de que se convierta en un problema.',
    'En la barra lateral tienes Proyectos, Personas, Calendario, la lista de tareas, las minutas de reunión y el grupo de RinglyPro, con Inteligencia Neural, llamadas, prospectos y tus campañas.',
    '¿No sabes por dónde empezar? Pulsa el botón de inteligencia artificial, abajo a la derecha, y pídeme lo que necesites en lenguaje natural. Estoy aquí para ayudarte a que nada se te escape.'
  ];

  const synth = window.speechSynthesis;
  const status = document.getElementById('linaStatus');
  const playAll = document.getElementById('linaPlayAll');
  const pauseBtn = document.getElementById('linaPause');
  const stopBtn = document.getElementById('linaStop');
  const voiceSel = document.getElementById('linaVoiceSel');
  const neuralToggle = document.getElementById('linaNeuralToggle');
  const voiceMode = document.getElementById('linaVoiceMode');

  const NEURAL_URL = '/api/tts/edge';
  let queue = [], qi = 0, runToken = 0, paused = false;
  let playbackMode = null, currentAudio = null, neuralOK = true, audioCache = {};
  let browserVoice = null, voiceName = 'lina';

  function pickBrowserVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    const pref = vs.filter(v => v.lang && v.lang.toLowerCase().indexOf('es') === 0);
    browserVoice = pref[0] || vs[0] || null;
  }
  if (synth) { pickBrowserVoice(); synth.onvoiceschanged = pickBrowserVoice; }

  const useNeural = () => neuralToggle.checked && neuralOK;
  const setMode = () => { voiceMode.textContent = useNeural() ? '● HD' : '○ navegador'; };
  setMode();

  function clearCache() { Object.keys(audioCache).forEach(k => { try { URL.revokeObjectURL(audioCache[k]); } catch (e) {} }); audioCache = {}; }
  voiceSel.addEventListener('change', function () { voiceName = this.value; clearCache(); });
  neuralToggle.addEventListener('change', setMode);

  function fetchNeural(idx) {
    const key = voiceName + '|' + idx;
    if (audioCache[key]) return Promise.resolve(audioCache[key]);
    return fetch(NEURAL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: segments[idx], voice: voiceName }) })
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
      .then(b => { if (!b || b.size < 200) throw new Error('empty'); const u = URL.createObjectURL(b); audioCache[key] = u; return u; });
  }

  function statusSpeaking() { status.textContent = 'Lina está hablando… (' + (qi + 1) + ' de ' + queue.length + ')'; }

  function runQueue(token) {
    if (token !== runToken) return;
    if (qi >= queue.length) { finish(); return; }
    const idx = queue[qi];
    function advance() { if (token !== runToken) return; qi++; runQueue(token); }
    if (useNeural()) {
      status.textContent = 'Preparando voz neural…';
      if (qi + 1 < queue.length) fetchNeural(queue[qi + 1]).catch(() => {});
      fetchNeural(idx).then(url => {
        if (token !== runToken) return;
        playbackMode = 'neural'; currentAudio = new Audio(url);
        currentAudio.onended = advance;
        currentAudio.onerror = function () { neuralOK = false; setMode(); advance(); };
        orb.classList.add('speaking'); statusSpeaking();
        currentAudio.play().catch(() => { neuralOK = false; setMode(); browserSpeak(idx, advance); });
      }).catch(() => { if (token !== runToken) return; neuralOK = false; setMode(); browserSpeak(idx, advance); });
    } else { browserSpeak(idx, advance); }
  }

  function browserSpeak(idx, onEnd) {
    if (!synth) { onEnd(); return; }
    playbackMode = 'browser';
    const u = new SpeechSynthesisUtterance(segments[idx]);
    if (browserVoice) u.voice = browserVoice;
    u.lang = browserVoice ? browserVoice.lang : 'es-MX';
    u.rate = 0.98; u.pitch = 1.05;
    u.onstart = function () { orb.classList.add('speaking'); statusSpeaking(); };
    u.onend = onEnd; u.onerror = onEnd;
    synth.speak(u);
  }

  function start(q) {
    if (synth) synth.cancel();
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
    queue = q; qi = 0; paused = false; runToken++;
    pauseBtn.disabled = false; stopBtn.disabled = false; playAll.disabled = true; pauseBtn.innerHTML = '&#10074;&#10074; Pausar';
    runQueue(runToken);
  }

  function finish() {
    runToken++; orb.classList.remove('speaking');
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
    pauseBtn.disabled = true; stopBtn.disabled = true; playAll.disabled = false;
    status.textContent = 'Resumen terminado. Pulsa de nuevo para repetir.';
  }

  playAll.addEventListener('click', () => start(segments.map((_, i) => i)));
  pauseBtn.addEventListener('click', function () {
    if (!paused) { paused = true; this.innerHTML = '&#9654; Reanudar'; orb.classList.remove('speaking'); status.textContent = 'En pausa.';
      if (playbackMode === 'neural' && currentAudio) currentAudio.pause(); else if (synth) synth.pause(); }
    else { paused = false; this.innerHTML = '&#10074;&#10074; Pausar'; orb.classList.add('speaking'); statusSpeaking();
      if (playbackMode === 'neural' && currentAudio) currentAudio.play(); else if (synth) synth.resume(); }
  });
  stopBtn.addEventListener('click', finish);
}
window.initLinaOrb = initLinaOrb;

// Renders the RinglyPro Neural Intelligence health score + KPI panels on the
// Hub home, sourced from /api/projects-bridge/neural (proxies the CRM neural API).
async function loadNeuralKpis() {
  const panel = document.getElementById('neural-kpi-panel');
  if (!panel) return;
  try {
    const res = await fetch(`${location.origin}/api/projects-bridge/neural`);
    const d = await res.json();
    if (!d || !d.success) { panel.style.display = 'none'; return; }

    const scoreColor = d.healthScore >= 80 ? '#10b981' : d.healthScore >= 65 ? '#22d3ee' : d.healthScore >= 45 ? '#f59e0b' : '#ef4444';
    const arrow = (t) => t && t.direction === 'up' ? '&#9650;' : t && t.direction === 'down' ? '&#9660;' : '&#8722;';
    const arrowColor = (t) => t && t.direction === 'up' ? '#10b981' : t && t.direction === 'down' ? '#ef4444' : 'var(--text-muted)';
    const usd = (n) => '$' + (Number(n) || 0).toLocaleString('en-US');

    const panels = (d.panels || []).map(p => {
      const c = p.score >= 80 ? '#10b981' : p.score >= 65 ? '#22d3ee' : p.score >= 45 ? '#f59e0b' : '#ef4444';
      return `
        <div class="card" style="padding:16px 18px;border-top:3px solid ${c}">
          <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">${escapeHtml(p.name || '')}</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
            <span style="font-size:28px;font-weight:800;color:${c}">${p.score ?? 0}</span>
            <span style="font-size:12px;color:${arrowColor(p.trend)}">${arrow(p.trend)} ${p.trend ? (p.trend.points ?? 0) : 0} pts</span>
          </div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45">${escapeHtml(p.topFinding || '')}</div>
        </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="card card-accent-blue" style="margin-bottom:16px;display:flex;align-items:center;gap:24px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:16px;cursor:pointer" onclick="openCrmEmbed('${location.origin}/neural/intelligence.html','Neural Intelligence')" title="Open full Neural Intelligence">
          <div style="width:74px;height:74px;border-radius:50%;border:5px solid ${scoreColor};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:${scoreColor}">${d.healthScore ?? 0}</div>
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted)">RinglyPro Business Copilot</div>
            <div style="font-size:18px;font-weight:700">${escapeHtml(d.scoreLabel || '')}</div>
            <div style="font-size:12px;color:${arrowColor(d.trend)}">${arrow(d.trend)} ${d.trend ? (d.trend.points ?? 0) : 0} pts vs last ${d.trend ? (d.trend.period || '30 days') : '30 days'}</div>
          </div>
        </div>
        <div style="display:flex;gap:28px;margin-left:auto">
          <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Revenue at Risk</div><div style="font-size:20px;font-weight:700;color:#ef4444">${usd(d.revenueAtRisk)}</div></div>
          <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Recovery Potential</div><div style="font-size:20px;font-weight:700;color:#10b981">${usd(d.recoveryPotential)}</div></div>
        </div>
      </div>
      <div class="card-grid">${panels}</div>`;
  } catch (e) {
    panel.style.display = 'none';
  }
}

// Pulls client-15 call/message counts from the main CRM via the projects-bridge.
// Fills: #kpi-calls-today, #kpi-followups, and the Messages quick-action badge.
async function loadCrmCallStats() {
  try {
    const res = await fetch(`${location.origin}/api/projects-bridge/call-stats`);
    const d = await res.json();
    const callsEl = document.getElementById('kpi-calls-today');
    const followEl = document.getElementById('kpi-followups');
    if (callsEl) callsEl.textContent = d.calls_today ?? 0;
    if (followEl) followEl.textContent = d.follow_ups_pending ?? 0;

    const unread = d.unread_messages ?? 0;
    setMessagesBadge(unread); // keep the left-pane Messages nav badge in sync
    const badge = document.getElementById('qa-msg-badge');
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.style.cssText = 'position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;min-width:20px;text-align:center;line-height:1.2;box-shadow:0 2px 6px #ef444466';
      } else {
        badge.textContent = '';
        badge.style.cssText = '';
      }
    }
  } catch (e) {
    const callsEl = document.getElementById('kpi-calls-today');
    const followEl = document.getElementById('kpi-followups');
    if (callsEl && callsEl.textContent === '·') callsEl.textContent = '0';
    if (followEl && followEl.textContent === '·') followEl.textContent = '0';
  }
}

// =====================================================
// NEURAL FINDINGS PANEL
// =====================================================
async function loadNeuralFindings() {
  const list = document.getElementById('findings-list');
  const badge = document.getElementById('findings-count-badge');
  if (!list) return;
  try {
    const res = await api('/findings');
    if (!res.success) { list.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px">Could not load findings: ${res.error || 'unknown error'}</p>`; return; }
    const findings = (res.data && res.data.findings) || [];
    if (badge) {
      badge.textContent = findings.length;
      badge.style.display = 'inline-block';
      if (findings.length === 0) {
        badge.style.background = 'rgba(16,185,129,0.15)';
        badge.style.color = '#10b981';
      }
    }
    if (!findings.length) {
      list.innerHTML = `
        <div class="card" style="text-align:center;padding:32px 16px;border:1px solid rgba(16,185,129,0.3)">
          <div style="font-size:36px;margin-bottom:6px">&#10003;</div>
          <div style="font-size:16px;font-weight:600;color:#10b981;margin-bottom:4px">All clear</div>
          <div style="font-size:13px;color:var(--text-muted)">No active findings. The system has not detected gaps or risks in your project tracker right now.</div>
        </div>`;
      return;
    }
    list.innerHTML = findings.map(renderFindingCard).join('');
  } catch (err) {
    list.innerHTML = `<p style="color:var(--danger);font-size:13px;padding:12px">Failed to load findings: ${err.message}</p>`;
  }
}

function renderFindingCard(f) {
  const palette = {
    critical: { bar: '#ef4444', badgeBg: 'rgba(239,68,68,0.15)', badgeFg: '#ef4444', label: 'CRITICAL' },
    warning:  { bar: '#f59e0b', badgeBg: 'rgba(245,158,11,0.15)', badgeFg: '#f59e0b', label: 'WARNING'  },
    info:     { bar: '#3b82f6', badgeBg: 'rgba(59,130,246,0.15)', badgeFg: '#3b82f6', label: 'INFO'     }
  };
  const p = palette[f.severity] || palette.info;
  const keyEsc = String(f.key).replace(/'/g, "\\'");
  const fixView = f.fix_view ? String(f.fix_view).replace(/'/g, "\\'") : '';
  const fixDrill = f.fix_drill ? String(f.fix_drill).replace(/'/g, "\\'") : '';
  const hasAction = fixView || fixDrill;
  // Whole card is clickable when there's a destination — drill-down (specific
  // underlying rows) wins over generic view nav. Dismiss button stops
  // propagation so it doesn't also trigger the open.
  const cardAttrs = hasAction
    ? `style="margin-bottom:14px;border-top:3px solid ${p.bar};padding:18px 20px;cursor:pointer" onclick="findingFix('${keyEsc}','${fixView}','${fixDrill}')"`
    : `style="margin-bottom:14px;border-top:3px solid ${p.bar};padding:18px 20px"`;
  return `
    <div class="card" ${cardAttrs}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
        <h3 style="margin:0;font-size:16px;color:var(--text-primary)">${escapeHtml(f.title)}</h3>
        <span style="background:${p.badgeBg};color:${p.badgeFg};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:0.05em;white-space:nowrap">${p.label}</span>
      </div>
      <p style="margin:0 0 14px;font-size:13.5px;line-height:1.55;color:var(--text-secondary)">${escapeHtml(f.description)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${f.impact_label ? `<span style="background:rgba(139,92,246,0.12);color:#a78bfa;padding:6px 12px;border-radius:14px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px">&#128176; ${escapeHtml(f.impact_label)}</span>` : ''}
        ${f.source_label ? `<span style="background:rgba(34,211,238,0.10);color:#22d3ee;padding:6px 12px;border-radius:14px;font-size:12px;font-weight:600">${escapeHtml(f.source_label)}</span>` : ''}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();findingFix('${keyEsc}','${fixView}','${fixDrill}')" style="background:linear-gradient(135deg,#7c5cff,#22d3ee);border:none">Fix This</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();findingDismiss('${keyEsc}')">Dismiss</button>
      </div>
    </div>`;
}

async function findingFix(key, view, drill) {
  // 'finding' is the generic drill — backend returns the underlying rows
  // via GET /findings/:key/items so we can show them in renderDrillTable
  // without hardcoding per-finding endpoints in the frontend.
  if (drill === 'finding') { findingDrillByKey(key); return; }
  if (drill) { drillDown(drill); return; }
  if (view) navigateTo(view);
}
window.findingFix = findingFix;

async function findingDrillByKey(key) {
  const container = document.getElementById('view-container');
  if (!container) return;
  container.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await api('/findings/' + encodeURIComponent(key) + '/items');
    if (!res.success) {
      container.innerHTML = `<p style="color:var(--danger);padding:24px">Could not load items: ${escapeHtml(res.error || 'unknown error')}</p>`;
      return;
    }
    const { items = [], type = 'project', title = 'Items' } = (res.data || {});
    renderDrillTable(container, title, items, type);
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger);padding:24px">Failed to load items: ${escapeHtml(err.message)}</p>`;
  }
}
window.findingDrillByKey = findingDrillByKey;

async function findingDismiss(key) {
  try {
    const res = await api('/findings/dismiss', { method: 'POST', body: JSON.stringify({ key, days: 7 }) });
    if (!res.success) { alert('Dismiss failed: ' + (res.error || 'unknown')); return; }
    if (typeof showCopyToast === 'function') showCopyToast('Dismissed — will reappear in 7 days if still applicable');
    loadNeuralFindings();
  } catch (err) {
    alert('Dismiss failed: ' + err.message);
  }
}
window.findingDismiss = findingDismiss;

// =====================================================
// DRILL-DOWN: Click a KPI card to see the underlying data
// =====================================================
let _lastDrilldown = null;
let _pendingViewOpts = null;

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
        // Use start-of-today (00:00) as the lower bound so projects due TODAY
        // are included — matches the backend's date-only count. Using new Date()
        // (current time, e.g. 3pm) excludes projects whose due_date parses to
        // 00:00 today, which is why the KPI said 1 but the drill-down showed 0.
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const weekEnd = new Date(startOfToday.getTime() + 7 * 86400000);

        // Show projects due this week AND upcoming calendar events this week
        // in one consolidated view, since the user wants "what is coming up".
        const [projRes, evRes] = await Promise.all([
          api('/projects'),
          api(`/calendar?start=${encodeURIComponent(startOfToday.toISOString())}&end=${encodeURIComponent(weekEnd.toISOString())}`).catch(() => ({ data: [] }))
        ]);
        const projects = (projRes.data || []).filter(p =>
          p.due_date && new Date(p.due_date) >= startOfToday && new Date(p.due_date) <= weekEnd
          && !['completed','cancelled'].includes(p.status)
        );
        const events = (evRes.data || []).filter(e =>
          e.start_time && new Date(e.start_time) >= startOfToday && new Date(e.start_time) <= weekEnd
        ).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        renderComingUpThisWeek(container, projects, events);
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
      case 'agents_failed': {
        const res = await api('/tasks/agents-failed');
        renderDrillTable(container, 'Tasks With Failed AI Agent Runs', res.data || [], 'task');
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
  } else if (type === 'minute') {
    tableHtml = `<table class="data-table"><thead><tr><th>Subject</th><th>Project</th><th>Meeting Date</th><th>Action</th></tr></thead><tbody>` +
      (items.length > 0 ? items.map(m => `<tr class="clickable" onclick="navigateTo('minutes')">
        <td><strong>${escapeHtml(m.title || '(untitled)')}</strong></td>
        <td>${m.project ? `<span style="cursor:pointer;color:var(--accent)" onclick="event.stopPropagation();showProjectDetail(${m.project.id})">${escapeHtml(m.project.name)}</span>` : '-'}</td>
        <td>${m.meeting_date ? fmtDate(m.meeting_date) : '-'}</td>
        <td><span class="status-badge status-overdue">Never sent</span></td>
      </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted)">No items found</td></tr>') +
      '</tbody></table>';
  } else if (type === 'milestone') {
    tableHtml = `<table class="data-table"><thead><tr><th>Milestone</th><th>Project</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>` +
      (items.length > 0 ? items.map(m => `<tr class="clickable" onclick="showProjectDetail(${m.project?.id || 0})">
        <td><strong>${escapeHtml(m.title || '(untitled)')}</strong></td>
        <td>${m.project ? escapeHtml(m.project.name) : '-'}</td>
        <td>${m.owner ? escapeHtml(m.owner) : '-'}</td>
        <td><span style="color:var(--danger)">${m.due_date ? fmtDate(m.due_date) : '-'} (overdue)</span></td>
        <td><span class="status-badge status-${m.status || 'pending'}">${escapeHtml(m.status || 'pending')}</span></td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">No items found</td></tr>') +
      '</tbody></table>';
  } else if (type === 'contract') {
    tableHtml = `<table class="data-table"><thead><tr><th>Project</th><th>Status</th><th>Amount</th><th>Drafted</th></tr></thead><tbody>` +
      (items.length > 0 ? items.map(c => {
        const amt = c.total_amount != null ? Number(c.total_amount).toLocaleString('en-US', { style: 'currency', currency: c.currency || 'USD' }) : '-';
        return `<tr class="clickable" onclick="showProjectDetail(${c.project?.id || 0})">
          <td><strong>${c.project ? escapeHtml(c.project.name) : '(unlinked)'}</strong></td>
          <td><span class="status-badge status-${c.status || 'draft'}">${escapeHtml(c.status || 'draft')}</span></td>
          <td>${amt}</td>
          <td>${c.created_at ? fmtDate(c.created_at) : '-'}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted)">No items found</td></tr>') +
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

// "Due This Week" drill-down: combined view of projects due in the next 7
// days + calendar events in the next 7 days. Two stacked sections so the
// user can see everything coming up at a glance.
function renderComingUpThisWeek(container, projects, events) {
  const projWord = projects.length === 1 ? 'project' : 'projects';
  const evWord = events.length === 1 ? 'event' : 'events';

  const projTable = projects.length > 0
    ? `<table class="data-table"><thead><tr><th>Project</th><th>Vertical</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Progress</th></tr></thead><tbody>` +
      projects.map(p => {
        const isOverdue = p.due_date && new Date(p.due_date) < new Date() && !['completed','cancelled'].includes(p.status);
        return `<tr class="clickable" onclick="showProjectDetail(${p.id})">
          <td><strong>${p.name}</strong>${p.code ? '<br><span style="font-size:11px;color:var(--text-muted)">'+p.code+'</span>' : ''}</td>
          <td>${p.vertical ? '<span class="vertical-dot" style="background:'+p.vertical.color+'"></span>'+p.vertical.name : '-'}</td>
          <td><span class="status-badge status-${isOverdue ? 'overdue' : p.status}">${isOverdue ? 'OVERDUE' : p.status}</span></td>
          <td><span class="priority-badge priority-${p.priority}">${p.priority}</span></td>
          <td>${p.due_date ? fmtDate(p.due_date) : '-'}</td>
          <td><div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:${p.progress}%"></div></div> <span style="font-size:11px;color:var(--text-muted)">${p.progress}%</span></td>
        </tr>`;
      }).join('') +
      '</tbody></table>'
    : '<p style="color:var(--text-muted);font-size:13px;padding:14px 0">No projects due this week.</p>';

  const evTable = events.length > 0
    ? `<table class="data-table"><thead><tr><th>Title</th><th>Type</th><th>When</th><th>Project</th><th>Links</th></tr></thead><tbody>` +
      events.map(e => {
        const onClick = e.source === 'task' && e.task_id ? `showTaskDetail(${e.task_id})` : `showEventDetail(${e.id})`;
        const projLink = e.project ? `<span style="cursor:pointer;color:var(--accent)" onclick="event.stopPropagation();showProjectDetail(${e.project.id})">${e.project.name}</span>` : '-';
        const zoomLink = e.zoom_join_url ? `<a href="${e.zoom_join_url}" target="_blank" rel="noopener" style="color:#2D8CFF" onclick="event.stopPropagation()">Join Zoom</a>` : '';
        return `<tr class="clickable" onclick="${onClick}">
          <td><strong>${e.title}</strong></td>
          <td><span class="status-badge status-planning">${e.event_type || 'event'}</span></td>
          <td>${fmtDateTime(e.start_time)}</td>
          <td>${projLink}</td>
          <td>${zoomLink}</td>
        </tr>`;
      }).join('') +
      '</tbody></table>'
    : '<p style="color:var(--text-muted);font-size:13px;padding:14px 0">No events scheduled this week.</p>';

  const empty = projects.length === 0 && events.length === 0;
  container.innerHTML = `
    <div class="section-header" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('overview')">&#8592; Back to Home</button>
        <h3 style="margin:0">Coming Up This Week</h3>
        <span class="status-badge status-planning">${projects.length} ${projWord}</span>
        <span class="status-badge status-planning">${events.length} ${evWord}</span>
      </div>
    </div>
    ${empty
      ? '<div class="empty-state"><div class="empty-icon">&#128269;</div><h3>Nothing on the calendar</h3><p>No projects are due and no events are scheduled in the next 7 days.</p><button class="btn btn-ghost" onclick="navigateTo(\'overview\')">Go Back Home</button></div>'
      : `
        <div style="margin-bottom:24px">
          <h4 style="margin:0 0 10px;color:var(--text-secondary);font-size:13px;letter-spacing:0.04em;text-transform:uppercase">Projects Due (${projects.length})</h4>
          ${projTable}
        </div>
        <div>
          <h4 style="margin:0 0 10px;color:var(--text-secondary);font-size:13px;letter-spacing:0.04em;text-transform:uppercase">Upcoming Events (${events.length})</h4>
          ${evTable}
        </div>
      `}
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
// INBOX (Project request queue)
// =====================================================
function fmtRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString();
}

async function renderInbox(container) {
  const res = await api('/projects/inbox');
  if (!res.success) {
    container.innerHTML = `<div class="empty-state"><h3>Inbox unavailable</h3><p>${res.error || 'Could not load pending requests'}</p></div>`;
    return;
  }
  const items = res.data || [];
  const countLine = items.length === 0
    ? 'No pending requests right now.'
    : `<strong>${items.length}</strong> request${items.length === 1 ? '' : 's'} awaiting review`;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="detail-panel">
        <h2 style="margin-top:0">Project Request Inbox</h2>
        <p style="color:var(--text-muted)">${countLine}</p>
        <div class="empty-state" style="margin-top:24px">
          <h3>All caught up</h3>
          <p>New prospect submissions from <a href="/projects/intake/request.html" target="_blank" style="color:var(--accent)">/projects/intake/request.html</a> will appear here.</p>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="detail-panel">
      <h2 style="margin-top:0">Project Request Inbox</h2>
      <p style="color:var(--text-muted);margin-bottom:18px">${countLine}</p>
      <div id="inbox-list" style="display:flex;flex-direction:column;gap:14px">
        ${items.map(p => renderInboxCard(p)).join('')}
      </div>
    </div>`;
}

function buildMeetingEmail({ toEmail, toName, company, projectName, shareUrl }) {
  const firstName = (toName || '').trim().split(/\s+/)[0] || 'there';
  const subject = `Initial meeting -- ${projectName || 'your project request'}`;
  const lines = [
    `Hi ${firstName},`,
    '',
    `Thank you for submitting your project request${company ? ' on behalf of ' + company : ''}. I'd like to schedule a brief 20-30 minute call so I can ask a few clarifying questions before we lock the scope and timeline.`,
    '',
    'A few times that work on my side this week and next:',
    '  - [propose 2-3 windows in your timezone]',
    '',
    'If none of those work, please reply with two or three times that suit you and I will send a calendar invite.',
    ''
  ];
  if (shareUrl) {
    lines.push('In the meantime you can review and add notes to the request directly in our shared workspace:');
    lines.push(shareUrl);
    lines.push('');
  }
  lines.push('Looking forward to speaking with you.');
  lines.push('');
  lines.push('Best,');
  lines.push('Manuel Stagg');
  lines.push('Digit2AI');
  lines.push('mstagg@digit2ai.com');
  return { subject, body: lines.join('\n'), toEmail, toName, projectName };
}

let __meetingDraft = null;
function openMeetingChooser(projectId) {
  const draft = window.__meetingDrafts && window.__meetingDrafts[projectId];
  if (!draft) return;
  __meetingDraft = draft;
  const eTo = encodeURIComponent(draft.toEmail);
  const eSu = encodeURIComponent(draft.subject);
  const eBody = encodeURIComponent(draft.body);
  const gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + eTo + '&su=' + eSu + '&body=' + eBody;
  const outlook = 'https://outlook.live.com/mail/0/deeplink/compose?to=' + eTo + '&subject=' + eSu + '&body=' + eBody;
  const yahoo = 'https://compose.mail.yahoo.com/?to=' + eTo + '&subject=' + eSu + '&body=' + eBody;
  const apple = 'mailto:' + draft.toEmail + '?subject=' + eSu + '&body=' + eBody;

  let modal = document.getElementById('meetingChooserModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'meetingChooserModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;max-width:480px;width:100%;padding:24px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.5);color:#fff">
      <button onclick="document.getElementById('meetingChooserModal').remove()" aria-label="Close" style="position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:8px;background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:20px">&times;</button>
      <div style="font-size:1.15rem;font-weight:700;margin-bottom:4px">Send Meeting Request</div>
      <div style="font-size:.85rem;color:#94a3b8;margin-bottom:6px">To: <span style="color:#cbd5e1">${escHtml(draft.toName || draft.toEmail)} &lt;${escHtml(draft.toEmail)}&gt;</span></div>
      <div style="font-size:.78rem;color:#64748b;margin-bottom:18px">Choose your email client -- the message is already prefilled.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <a href="${gmail}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#1e293b;border:1px solid #334155;border-radius:10px;color:#fff;text-decoration:none;font-weight:600;font-size:.92rem"><span style="width:10px;height:10px;border-radius:50%;background:#ea4335"></span>Gmail</a>
        <a href="${outlook}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#1e293b;border:1px solid #334155;border-radius:10px;color:#fff;text-decoration:none;font-weight:600;font-size:.92rem"><span style="width:10px;height:10px;border-radius:50%;background:#0078d4"></span>Outlook</a>
        <a href="${yahoo}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#1e293b;border:1px solid #334155;border-radius:10px;color:#fff;text-decoration:none;font-weight:600;font-size:.92rem"><span style="width:10px;height:10px;border-radius:50%;background:#6001d2"></span>Yahoo</a>
        <a href="${apple}" onclick="onAppleMailClick()" style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#1e293b;border:1px solid #334155;border-radius:10px;color:#fff;text-decoration:none;font-weight:600;font-size:.92rem"><span style="width:10px;height:10px;border-radius:50%;background:#94a3b8"></span>Apple Mail</a>
      </div>
      <div id="meetingChooserHint" style="display:none;margin-top:12px;padding:12px 14px;background:rgba(124,92,255,.1);border:1px solid rgba(124,92,255,.3);border-radius:8px;font-size:.8rem;color:#cbd5e1;line-height:1.55">
        <strong style="color:#fff">Apple Mail did not open?</strong> Chrome needs a one-time setup to route mailto: links to Mail.app:
        <ol style="margin:8px 0 0 18px;padding:0">
          <li>In Chrome, paste this in the address bar and press Enter: <code style="background:#1e293b;padding:1px 6px;border-radius:4px;color:#a5b4fc">chrome://settings/handlers</code></li>
          <li>Toggle <strong>Sites can ask to handle protocols</strong> ON.</li>
          <li>Open <strong>Mail.app</strong> &rarr; <strong>Settings</strong> &rarr; <strong>General</strong> &rarr; set <strong>Default email reader</strong> to <em>Mail</em>.</li>
          <li>Come back here, click <strong>Apple Mail</strong> again -- Chrome will prompt to allow Mail.app to open mailto: links. Click <strong>Allow</strong>.</li>
        </ol>
        <div style="margin-top:6px;color:#94a3b8">After that, every Apple Mail click in this dashboard opens Mail.app instantly with the draft prefilled.</div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #1e293b;font-size:.78rem;color:#64748b;text-align:center">
        Or <a onclick="copyMeetingDraft(this)" style="color:#94a3b8;cursor:pointer;text-decoration:underline">copy the message to clipboard</a> and paste anywhere.
      </div>
    </div>`;
}
function onAppleMailClick() {
  // Detect whether the mailto: actually triggered a handler.
  // If Chrome routes it to Mail.app, the page loses focus within ~400ms;
  // if no handler is registered, focus stays put -- show the setup hint then.
  let triggered = false;
  const onBlur = function () { triggered = true; };
  window.addEventListener('blur', onBlur, { once: true });
  setTimeout(function () {
    window.removeEventListener('blur', onBlur);
    if (!triggered) {
      const hint = document.getElementById('meetingChooserHint');
      if (hint) hint.style.display = 'block';
    }
  }, 700);
}
function copyMeetingDraft(el) {
  if (!__meetingDraft) return;
  const text = 'To: ' + __meetingDraft.toEmail + '\nSubject: ' + __meetingDraft.subject + '\n\n' + __meetingDraft.body;
  navigator.clipboard.writeText(text).then(function () {
    const orig = el.textContent;
    el.textContent = 'Copied to clipboard';
    setTimeout(function () { el.textContent = orig; }, 1500);
  });
}

function renderInboxCard(p) {
  const cats = Array.isArray(p.ai_category) && p.ai_category.length ? p.ai_category : (p.category ? [p.category] : []);
  const catChips = cats.map(c => `<span class="tag">${escHtml(String(c))}</span>`).join(' ');
  const company = p.company ? p.company.name : (p.submitter_name || 'Unknown');
  const sub = p.submitter_name || p.submitter_email || '';
  const meta = [
    p.country ? '&#127759; ' + escHtml(p.country) : null,
    p.timeline ? '&#9201; ' + escHtml(p.timeline) : null,
    p.budget_range ? '&#128176; ' + escHtml(p.budget_range) : null
  ].filter(Boolean).join('  &middot;  ');
  const qaList = (p.intake_qa || []).filter(q => q.answers && q.answers.length).map(q => `
    <div style="margin-top:10px">
      <div style="font-size:12px;color:var(--accent);font-weight:600">${escHtml(q.question)}</div>
      <div style="font-size:13px;color:var(--text-secondary);white-space:pre-wrap;margin-top:2px">${escHtml(q.answers.join('\n'))}</div>
    </div>`).join('');
  const shareUrl = p.share_token ? `/projects/intake/batch.html?token=${p.share_token}` : null;
  const absShareUrl = shareUrl ? (location.origin + shareUrl) : null;
  let hasMeetingDraft = false;
  if (p.submitter_email) {
    window.__meetingDrafts = window.__meetingDrafts || {};
    window.__meetingDrafts[p.id] = buildMeetingEmail({
      toEmail: p.submitter_email,
      toName: p.submitter_name || '',
      company: company,
      projectName: p.name,
      shareUrl: absShareUrl
    });
    hasMeetingDraft = true;
  }

  return `
    <details class="card" style="border:1px solid var(--border);border-radius:var(--radius);padding:16px;background:var(--bg-card)" data-project-id="${p.id}">
      <summary style="cursor:pointer;list-style:none">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <strong style="font-size:15px;color:var(--text-primary)">${escHtml(p.name)}</strong>
              ${catChips}
            </div>
            <div style="font-size:13px;color:var(--text-secondary)">
              ${escHtml(company)}${sub && sub !== company ? ' &middot; ' + escHtml(sub) : ''}
              ${p.submitter_email ? ' &middot; <span style="color:var(--text-muted)">' + escHtml(p.submitter_email) + '</span>' : ''}
            </div>
            ${meta ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${meta}</div>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text-muted);white-space:nowrap">${fmtRelative(p.created_at)}</div>
        </div>
      </summary>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        ${renderInboxTriagePanel(p)}
        ${p.description ? `<div style="font-size:13px;color:var(--text-secondary);white-space:pre-wrap;margin-bottom:10px"><strong style="color:var(--text-primary)">Description:</strong> ${escHtml(p.description)}</div>` : ''}
        ${qaList}
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
          ${(() => {
            const hasTriage = !!(p.triage_structured && (Array.isArray(p.triage_structured.stakeholder_questions_es) || Array.isArray(p.triage_structured.stakeholder_questions_en)));
            const disabled = hasTriage ? '' : 'disabled';
            const tip = hasTriage ? '' : 'title="Run AI Triage first to populate stakeholder questions"';
            const opacity = hasTriage ? '' : 'style="opacity:.45;cursor:not-allowed"';
            return `
              <button class="btn btn-sm" ${disabled} ${tip} ${opacity}
                onclick="openQualifyMeetingModal(${p.id})"
                style="background:#10b981;color:#fff;border-color:#10b981">&#128197; Qualify Meeting</button>
              <button class="btn btn-sm" ${disabled} ${tip} ${opacity}
                onclick="openQualifyPdfModal(${p.id})"
                style="background:#3b82f6;color:#fff;border-color:#3b82f6">&#128194; Send Qualify PDF</button>`;
          })()}
          <button class="btn btn-success btn-sm" onclick="approveInboxItem(${p.id})" id="approve-btn-${p.id}">&#10003; Approve &amp; generate plan</button>
          <button class="btn btn-danger btn-sm" onclick="rejectInboxItem(${p.id})" id="reject-btn-${p.id}">&times; Reject</button>
          ${hasMeetingDraft ? `<button class="btn btn-ghost btn-sm" onclick="openMeetingChooser(${p.id})">&#128231; Meeting Request</button>` : ''}
          ${shareUrl ? `<a class="btn btn-ghost btn-sm" href="${shareUrl}" target="_blank" rel="noopener">Open discussion</a>` : ''}
          <span id="inbox-status-${p.id}" style="margin-left:auto;font-size:12px;color:var(--text-muted);align-self:center"></span>
        </div>
      </div>
    </details>`;
}

async function approveInboxItem(projectId) {
  const card = document.querySelector(`details[data-project-id="${projectId}"]`);
  const status = document.getElementById(`inbox-status-${projectId}`);
  const aBtn = document.getElementById(`approve-btn-${projectId}`);
  const rBtn = document.getElementById(`reject-btn-${projectId}`);
  if (aBtn) aBtn.disabled = true;
  if (rBtn) rBtn.disabled = true;
  if (status) status.textContent = 'Calling Claude to generate milestones...';

  try {
    const res = await api(`/intake/projects/${projectId}/approve`, { method: 'POST', body: JSON.stringify({}) });
    if (!res.success) {
      if (status) status.textContent = 'Error: ' + (res.error || 'approve failed');
      if (aBtn) aBtn.disabled = false;
      if (rBtn) rBtn.disabled = false;
      return;
    }
    if (status) status.textContent = `Approved. ${res.milestones_created} milestones created. Preparing email draft…`;
    if (card) card.style.opacity = '0.5';
    refreshInboxBadge();
    // The approval IIFE schedules the kickoff Zoom + calendar event after
    // res.json returns; wait briefly so the payload reflects the meeting
    // details, then open the draft modal.
    setTimeout(() => openIntakeEmailDraft(projectId, 'approval'), 1800);
  } catch (e) {
    if (status) status.textContent = 'Error: ' + e.message;
    if (aBtn) aBtn.disabled = false;
    if (rBtn) rBtn.disabled = false;
  }
}

// =====================================================
// INBOX TRIAGE PANEL (Task Agent Loop v1)
// =====================================================

// Traffic-light + score banner. Renders the persistent indicator used in
// both the Inbox card and the Project detail page so the AI verdict is
// always one glance away — never just a fading toast.
//   accept                  -> GREEN  🟢
//   accept_with_conditions  -> AMBER  🟡
//   reject                  -> RED    🔴
//   (anything else)         -> GREY indicator
function triageLightFromRec(rec) {
  const r = String(rec || '').toLowerCase();
  if (r === 'accept' || r === 'go')      return { light: '🟢', label: 'GO',     fg: '#10b981', bg: 'rgba(16,185,129,0.10)', border: '#10b981' };
  if (r === 'accept_with_conditions')    return { light: '🟡', label: 'Proof of Concept (PoC)',fg: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: '#f59e0b' };
  if (r === 'reject' || r === 'no_go')   return { light: '🔴', label: 'STOP',   fg: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: '#ef4444' };
  return { light: '⚪', label: 'REVIEW', fg: '#64748b', bg: 'rgba(100,116,139,0.10)', border: '#64748b' };
}

// Build a chunky banner with the traffic light, fit score, and
// recommendation text. Always rendered at the top of any place that
// displays the triage brief.
function renderTriageScoreBanner(structured) {
  if (!structured) return '';
  const fit = typeof structured.fit_score !== 'undefined' ? Number(structured.fit_score) : null;
  const recRaw = structured.go_no_go_recommendation || 'review';
  const recReadable = String(recRaw).replace(/_/g, ' ');
  const tl = triageLightFromRec(recRaw);
  const fitColor = fit === null ? tl.fg : (fit >= 7 ? '#10b981' : fit >= 4 ? '#f59e0b' : '#ef4444');
  return `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 18px;margin-bottom:14px;background:${tl.bg};border:2px solid ${tl.border};border-radius:10px;flex-wrap:wrap">
      <span style="font-size:32px;line-height:1">${tl.light}</span>
      <div style="flex:1;min-width:200px">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${tl.fg};font-weight:700;margin-bottom:2px">AI Recommendation</div>
        <div style="font-size:18px;font-weight:700;color:${tl.fg}">${tl.label} — ${escHtml(recReadable)}</div>
      </div>
      ${fit !== null ? `
        <div style="text-align:center;padding:8px 16px;background:var(--bg-card);border:2px solid ${fitColor};border-radius:10px;min-width:90px">
          <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);font-weight:600">Fit Score</div>
          <div style="font-size:28px;font-weight:800;color:${fitColor};line-height:1.1">${fit}<span style="font-size:14px;color:var(--text-muted);font-weight:600">/10</span></div>
        </div>` : ''}
    </div>`;
}

function renderInboxTriagePanel(p) {
  if (!p) return '';
  const brief = p.triage_brief;
  const structured = p.triage_structured || null;
  // No triage yet — show a "Run Triage Now" link
  if (!brief) {
    return `
      <div style="margin-bottom:12px;padding:10px 12px;background:rgba(124,92,255,0.06);border:1px solid rgba(124,92,255,0.25);border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text-muted)">🤖 AI Triage pending — no analysis yet for this intake.</span>
        <button class="btn btn-primary btn-sm" onclick="runInboxTriage(${p.id})">Run Triage Now</button>
      </div>`;
  }
  const fit = structured && typeof structured.fit_score !== 'undefined' ? Number(structured.fit_score) : null;
  const recRaw = (structured && structured.go_no_go_recommendation) || 'review';
  const tl = triageLightFromRec(recRaw);
  const summary = `${tl.light} AI Triage — ${tl.label}${fit !== null ? ' · Fit ' + fit + '/10' : ''}`;
  // Auto-open whenever the verdict is anything other than a clean GO 7+ —
  // critical/cautionary cases deserve attention without an extra click.
  const openAttr = (fit !== null && fit >= 7 && recRaw === 'accept') ? '' : 'open';
  return `
    <details ${openAttr} style="margin-bottom:14px;padding:0;background:rgba(124,92,255,0.04);border:1px solid rgba(124,92,255,0.25);border-radius:6px">
      <summary style="cursor:pointer;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;list-style:none">
        <strong style="color:${tl.fg}">${escHtml(summary)}</strong>
        <button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation();event.preventDefault();runInboxTriage(${p.id})" style="font-size:11px">Re-run</button>
      </summary>
      <div style="padding:12px 14px;border-top:1px solid rgba(124,92,255,0.2);font-size:13px;line-height:1.55;color:var(--text-secondary)">
        ${renderTriageScoreBanner(structured)}
        ${simpleMarkdownToHtml(brief)}
      </div>
    </details>`;
}

// Project-detail variant — same brief and banner, but always expanded by
// default since the user clicked into a specific project, and styled as a
// standalone detail-section block.
function renderProjectTriagePanel(p) {
  if (!p) return '';
  const brief = p.triage_brief;
  const structured = p.triage_structured || null;
  if (!brief) {
    return `
      <div class="detail-section">
        <h4>🤖 AI Triage</h4>
        <div style="padding:12px 14px;background:rgba(124,92,255,0.06);border:1px solid rgba(124,92,255,0.25);border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:13px;color:var(--text-muted)">No AI triage analysis on file for this project.</span>
          <button class="btn btn-primary btn-sm" onclick="runProjectTriage(${p.id})">Run Triage Now</button>
        </div>
      </div>`;
  }
  const stamp = p.triage_at ? ` · Generated ${fmtDateTime(p.triage_at)}` : '';
  return `
    <div class="detail-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap">
        <h4 style="margin:0">🤖 AI Triage</h4>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="openTriageEditModal(${p.id})" title="Edit the Neural Intelligence Brief — fit score, recommendation, and markdown body">&#9998; Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="runProjectTriage(${p.id})">Re-run</button>
        </div>
      </div>
      ${renderTriageScoreBanner(structured)}
      <div style="font-size:13px;line-height:1.55;color:var(--text-secondary);background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:14px 16px">${simpleMarkdownToHtml(brief)}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">${p.triage_model ? 'Model: ' + escHtml(p.triage_model) : ''}${stamp}</div>
    </div>`;
}
window.renderProjectTriagePanel = renderProjectTriagePanel;

async function openTriageEditModal(projectId) {
  const projRes = await api('/projects/' + projectId);
  if (!projRes.success) { alert('Could not load project'); return; }
  const p = projRes.data;
  const brief = p.triage_brief || '';
  const struct = p.triage_structured || {};
  const currentFit = typeof struct.fit_score === 'number' ? struct.fit_score : '';
  const currentRec = struct.go_no_go_recommendation || 'review';
  const recOpts = ['accept', 'accept_with_conditions', 'reject', 'review']
    .map(v => `<option value="${v}"${v === currentRec ? ' selected' : ''}>${v.replace(/_/g, ' ')}</option>`)
    .join('');
  const escA = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  openModal('Edit Neural Intelligence Brief', `
    <p style="margin:0 0 12px;font-size:12px;color:var(--text-muted)">
      Edit the markdown brief and (optionally) the fit score + verdict. Saving stamps the model as <em>edited</em> and updates the generated-at timestamp.
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="form-group" style="margin:0">
        <label>Fit score (1-10)</label>
        <input type="number" id="m-triage-fit" min="1" max="10" step="1" value="${currentFit}" />
      </div>
      <div class="form-group" style="margin:0">
        <label>Verdict</label>
        <select id="m-triage-rec">${recOpts}</select>
      </div>
    </div>
    <div class="form-group">
      <label>Brief (markdown)</label>
      <textarea id="m-triage-brief" rows="22" style="font-family:'SF Mono','Monaco','Menlo',monospace;font-size:12px;line-height:1.5;width:100%">${escA(brief)}</textarea>
      <small style="color:var(--text-muted)">Headings start with <code>##</code>. Bullets use <code>-</code>. Bold uses <code>**text**</code>. The triage banner colors are driven by the verdict above, not the markdown.</small>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="saveTriageEdit(${p.id})">Save</button>
    </div>
  `, () => {});
}
window.openTriageEditModal = openTriageEditModal;

async function saveTriageEdit(projectId) {
  const briefEl = document.getElementById('m-triage-brief');
  const fitEl = document.getElementById('m-triage-fit');
  const recEl = document.getElementById('m-triage-rec');
  if (!briefEl) return;
  const body = { triage_brief: briefEl.value };
  const fitNum = Number(fitEl?.value);
  if (Number.isFinite(fitNum) && fitNum >= 1 && fitNum <= 10) body.fit_score = fitNum;
  if (recEl && recEl.value) body.go_no_go_recommendation = recEl.value;
  const r = await api('/agents/triage/' + projectId, { method: 'PUT', body: JSON.stringify(body) });
  if (!r.success) { alert('Save failed: ' + (r.error || 'unknown')); return; }
  if (typeof showCopyToast === 'function') showCopyToast('Neural Intelligence Brief updated');
  closeModal();
  showProjectDetail(projectId);
}
window.saveTriageEdit = saveTriageEdit;

async function runInboxTriage(projectId) {
  if (typeof showCopyToast === 'function') showCopyToast('Triage agent running… (15-25s)');
  const r = await api('/agents/triage/' + projectId, { method: 'POST', body: JSON.stringify({}) });
  if (!r.success) { alert('Triage failed: ' + (r.error || 'unknown')); return; }
  navigateTo('inbox');
}
window.runInboxTriage = runInboxTriage;

async function runProjectTriage(projectId) {
  if (typeof showCopyToast === 'function') showCopyToast('AI Triage running… (15-25s) — fit score, regulatory flags, stakeholder questions');
  try {
    const r = await api('/agents/triage/' + projectId, { method: 'POST', body: JSON.stringify({}) });
    if (!r.success) {
      const msg = r.error === 'no_api_key'
        ? 'AI Triage unavailable: ANTHROPIC_API_KEY is not configured on the server.'
        : 'AI Triage failed: ' + (r.error || 'unknown');
      alert(msg);
      return;
    }
    if (typeof showCopyToast === 'function') showCopyToast('AI Triage complete · Fit ' + (r.fit_score || '?') + '/10 · ' + (r.recommendation || '').replace(/_/g, ' '));
  } catch (e) {
    alert('AI Triage error: ' + (e.message || e));
    return;
  }
  showProjectDetail(projectId);
}
window.runProjectTriage = runProjectTriage;

// =====================================================
// INBOX QUALIFY ACTIONS — Qualify Meeting + Send Qualify PDF
// =====================================================
const SPANISH_COUNTRIES_FE = new Set(['colombia','mexico','méxico','argentina','chile','peru','perú','spain','españa','venezuela','ecuador','bolivia','paraguay','uruguay','dominican republic','guatemala','honduras','nicaragua','costa rica','panama','panamá','cuba','puerto rico','el salvador']);
function detectLangFromCountry(country) {
  return SPANISH_COUNTRIES_FE.has(String(country || '').toLowerCase()) ? 'es' : 'en';
}

// Next weekday at 10am ET (basic helper — uses local timezone of the user's
// browser; the existing openEventModal stores as UTC ISO via localInputToIso)
function nextWeekday10am() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

// Action 1 — Qualify Meeting: opens the existing Event modal pre-filled with
// the requestor + AI Triage questions as the agenda.
async function openQualifyMeetingModal(projectId) {
  const inboxRes = await api('/projects/inbox');
  const p = inboxRes.success ? (inboxRes.data || []).find(x => x.id === projectId) : null;
  if (!p) { alert('Could not load project'); return; }
  const s = p.triage_structured;
  if (!s) { alert('Run AI Triage first to populate stakeholder questions.'); return; }
  const lang = detectLangFromCountry(p.country);
  const qs = (lang === 'es' && Array.isArray(s.stakeholder_questions_es) && s.stakeholder_questions_es.length)
    ? s.stakeholder_questions_es
    : (Array.isArray(s.stakeholder_questions_en) ? s.stakeholder_questions_en : []);

  const start = nextWeekday10am();
  const end = new Date(start.getTime() + 45 * 60000);
  const isoStart = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}T${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;
  const isoEnd   = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}T${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;

  const intro = lang === 'es'
    ? `Reunión de calificación del proyecto "${p.name}". Por favor venga preparado para discutir las siguientes preguntas.\n\nResumen del proyecto:\n${(p.description || '').slice(0, 600)}\n\n--- Preguntas para el stakeholder ---`
    : `Qualification meeting for project "${p.name}". Please come prepared to discuss the following questions.\n\nProject summary:\n${(p.description || '').slice(0, 600)}\n\n--- Stakeholder questions ---`;
  const description = intro + '\n' + qs.map((q, i) => `${i+1}. ${q}`).join('\n');

  // Open existing event modal then pre-fill its fields
  openEventModal();
  setTimeout(() => {
    const titleEl = document.getElementById('m-etitle');
    const startEl = document.getElementById('m-estart');
    const endEl = document.getElementById('m-eend');
    const descEl = document.getElementById('m-edesc');
    const inviteEl = document.getElementById('m-einvite');
    const zoomEl = document.getElementById('m-ezoom');
    if (titleEl) titleEl.value = (lang === 'es' ? 'Reunión de calificación — ' : 'Qualification Meeting — ') + (p.name || '');
    if (startEl) startEl.value = isoStart;
    if (endEl) endEl.value = isoEnd;
    if (descEl) descEl.value = description;
    if (inviteEl && p.submitter_email) inviteEl.value = p.submitter_email;
    if (zoomEl) zoomEl.checked = true;
  }, 80);
}
window.openQualifyMeetingModal = openQualifyMeetingModal;

// Action 2 — Send Qualify PDF: small modal with phone + language + 3 send buttons.
// Every channel includes BOTH the PDF link AND the magic link (open discussion)
// so the recipient can pick: read the PDF offline, or answer questions in-app.
async function openQualifyPdfModal(projectId) {
  const inboxRes = await api('/projects/inbox');
  const p = inboxRes.success ? (inboxRes.data || []).find(x => x.id === projectId) : null;
  if (!p) { alert('Could not load project'); return; }
  if (!p.share_token) { alert('No share token on this project — open discussion at least once to mint it.'); return; }
  const initialLang = detectLangFromCountry(p.country);
  const pdfBase = `${location.origin}/projects/api/v1/intake/projects/${p.id}/triage-pdf?token=${encodeURIComponent(p.share_token)}`;
  const magicLink = `${location.origin}/projects/intake/batch.html?token=${encodeURIComponent(p.share_token)}`;
  const recName = p.submitter_name || p.submitter_email || 'requestor';
  const phoneInit = p.submitter_phone || '';
  const escA = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

  openModal('Send Qualify PDF', `
    <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted)">
      <strong>${escHtml(p.name)}</strong><br>
      Sending to: <strong>${escHtml(recName)}</strong>${p.submitter_email ? ' &lt;' + escHtml(p.submitter_email) + '&gt;' : ''}
    </p>
    <input type="hidden" id="m-qpdf-magic" value="${escA(magicLink)}">
    <div class="form-group">
      <label>Language</label>
      <div style="display:inline-flex;border:1px solid var(--border);border-radius:6px;overflow:hidden">
        <button type="button" id="m-qpdf-lang-es" class="btn btn-sm ${initialLang === 'es' ? 'btn-primary' : 'btn-ghost'}" style="border-radius:0;border:none;padding:6px 14px" onclick="setQualifyPdfLang('es')">ES</button>
        <button type="button" id="m-qpdf-lang-en" class="btn btn-sm ${initialLang === 'en' ? 'btn-primary' : 'btn-ghost'}" style="border-radius:0;border:none;border-left:1px solid var(--border);padding:6px 14px" onclick="setQualifyPdfLang('en')">EN</button>
      </div>
      <input type="hidden" id="m-qpdf-lang" value="${initialLang}">
    </div>
    <div class="form-group">
      <label>WhatsApp / SMS phone</label>
      <input type="tel" id="m-qpdf-phone" value="${escA(phoneInit)}" placeholder="+57 312 783 0181">
      <small style="color:var(--text-muted)">Include country code. Spaces and dashes are fine.</small>
    </div>
    <div class="form-group">
      <label>PDF link (read-only handout)</label>
      <input type="text" id="m-qpdf-url" value="${escA(pdfBase + '&lang=' + initialLang)}" readonly style="font-size:11px">
    </div>
    <div class="form-group">
      <label>Discussion link (where they answer the questions live)</label>
      <input type="text" value="${escA(magicLink)}" readonly style="font-size:11px">
      <small style="color:var(--text-muted)">Both links are token-gated. Every send below includes BOTH the PDF and the discussion link so the recipient can pick: read the PDF offline, or answer questions in the app.</small>
    </div>
    <div class="form-group" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
      <button type="button" class="btn btn-sm" style="background:#25D366;color:#fff;border-color:#25D366" onclick="sendQualifyPdfVia('whatsapp', ${p.id})">📱 WhatsApp</button>
      <button type="button" class="btn btn-sm" style="background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="sendQualifyPdfVia('sms', ${p.id})">💬 SMS / Messages</button>
      <button type="button" class="btn btn-sm" style="background:#0066CC;color:#fff;border-color:#0066CC" onclick="sendQualifyPdfVia('mail', ${p.id})">✉ Mail</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="window.open(document.getElementById('m-qpdf-url').value, '_blank', 'noopener')">Preview PDF</button>
    </div>
  `, () => {}); // submit handler unused — buttons trigger sends directly
}
window.openQualifyPdfModal = openQualifyPdfModal;

function setQualifyPdfLang(lang) {
  const langInput = document.getElementById('m-qpdf-lang');
  const urlInput = document.getElementById('m-qpdf-url');
  if (!langInput || !urlInput) return;
  langInput.value = lang;
  // Swap lang= in the URL
  urlInput.value = urlInput.value.replace(/&lang=(es|en)/, '&lang=' + lang);
  const esBtn = document.getElementById('m-qpdf-lang-es');
  const enBtn = document.getElementById('m-qpdf-lang-en');
  if (esBtn && enBtn) {
    esBtn.classList.toggle('btn-primary', lang === 'es');
    esBtn.classList.toggle('btn-ghost', lang !== 'es');
    enBtn.classList.toggle('btn-primary', lang === 'en');
    enBtn.classList.toggle('btn-ghost', lang !== 'en');
  }
}
window.setQualifyPdfLang = setQualifyPdfLang;

function sendQualifyPdfVia(channel, projectId) {
  const phoneRaw = (document.getElementById('m-qpdf-phone') || {}).value || '';
  const pdfUrl   = (document.getElementById('m-qpdf-url')   || {}).value || '';
  const magicUrl = (document.getElementById('m-qpdf-magic') || {}).value || '';
  const lang     = (document.getElementById('m-qpdf-lang')  || {}).value || 'en';

  // Every channel ships both links so the recipient picks how to engage:
  //   PDF link  -> read offline, fill in by hand, print
  //   Magic link -> open the discussion in-app, type answers in the threaded Q&A
  const msg = lang === 'es'
    ? [
        'Hola, le comparto el resumen de calificación del proyecto con las preguntas para discutir.',
        '',
        '📄 Resumen en PDF (para revisar o imprimir):',
        pdfUrl,
        '',
        '💬 Responder las preguntas en línea (acceso directo a la discusión):',
        magicUrl,
        '',
        '— Manuel Stagg / Digit2AI'
      ].join('\n')
    : [
        'Hi, sharing the qualification brief with the stakeholder questions.',
        '',
        '📄 PDF brief (review or print):',
        pdfUrl,
        '',
        '💬 Answer the questions online (direct discussion link):',
        magicUrl,
        '',
        '— Manuel Stagg / Digit2AI'
      ].join('\n');

  const subjectEn = 'Project qualification brief — questions to review';
  const subjectEs = 'Resumen de calificación del proyecto — preguntas a revisar';

  if (channel === 'mail') {
    // Use mailto: so the OS opens the default mail client (Apple Mail on macOS/iOS,
    // Outlook on Windows if set as default, etc.). No more Gmail-web bias.
    api('/projects/inbox').then(r => {
      const p = r.success ? (r.data || []).find(x => x.id === projectId) : null;
      const to = (p && p.submitter_email) || '';
      const subject = lang === 'es' ? subjectEs : subjectEn;
      const mailto = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(msg);
      window.location.href = mailto;
      closeModal();
    });
    return;
  }
  const digits = String(phoneRaw).replace(/[^\d]/g, '');
  if (channel === 'whatsapp') {
    if (!digits || digits.length < 7) { alert('Add a phone number with country code (e.g. +57 ...) before sending via WhatsApp.'); return; }
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    closeModal();
    return;
  }
  if (channel === 'sms') {
    window.location.href = `sms:${digits ? digits : ''}?body=${encodeURIComponent(msg)}`;
    closeModal();
    return;
  }
}
window.sendQualifyPdfVia = sendQualifyPdfVia;

// =====================================================
// PROJECT DETAIL — Share Project (open-access public summary link)
// =====================================================
// Unlike the Inbox Qualify modal, this one is for ANY project at any
// status. The link it sends is the public summary URL — no email gate.
// Anyone you forward it to can open and read the project + AI Triage
// brief. The interactive discussion (existing magic link) is offered
// from inside the public summary page as a secondary CTA.
async function openShareProjectModal(projectId) {
  // Pull the project + its share token. Project detail endpoint returns
  // p with the stakeholder_share_token, but the public summary endpoint
  // uses the company access token. We need the company access token —
  // look it up via the existing inbox endpoint if the project is still
  // pending_review, otherwise mint/fetch via the access tokens table.
  const projRes = await api('/projects/' + projectId);
  if (!projRes.success) { alert('Could not load project'); return; }
  const p = projRes.data;
  // Find or mint a token that can open the public-summary page. Resolution order:
  //   1. Existing company-scoped token (intake-submitted projects with a company)
  //   2. Mint a fresh project-scoped token (works for any project, including
  //      manually-created ones without a company / intake batch)
  let tokenStr = null;
  if (p.company_id) {
    try {
      const tokRes = await api('/intake/companies/' + p.company_id + '/tokens');
      if (tokRes && tokRes.success && Array.isArray(tokRes.data) && tokRes.data.length) {
        const now = new Date();
        const live = tokRes.data
          .filter(t => !t.expires_at || new Date(t.expires_at) > now)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (live.length) tokenStr = live[0].token;
      }
    } catch (_) {}
  }
  if (!tokenStr) {
    try {
      const mintRes = await api('/intake/projects/' + p.id + '/share-token', { method: 'POST', body: JSON.stringify({}) });
      if (mintRes && mintRes.success && mintRes.data && mintRes.data.token) {
        tokenStr = mintRes.data.token;
      }
    } catch (e) {
      console.error('Share-token mint failed:', e);
    }
  }
  if (!tokenStr) {
    alert('Could not create a share link for this project. Check the server logs.');
    return;
  }

  const initialLang = detectLangFromCountry(p.country);
  const summaryUrl = `${location.origin}/projects/summary/${tokenStr}`;
  const magicUrl   = `${location.origin}/projects/intake/batch.html?token=${tokenStr}`;
  const recipient  = p.submitter_name || p.submitter_email || 'recipient';
  const phoneInit  = p.submitter_phone || '';
  const escA = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

  openModal('Share Project — open access', `
    <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted)">
      <strong>${escHtml(p.name)}</strong><br>
      The public link below has <strong>no email gate</strong> — anyone you forward it to can open it. The interactive discussion (where they can post comments and answer questions) lives behind a separate magic link offered inside the page.
    </p>
    <input type="hidden" id="m-share-summary" value="${escA(summaryUrl)}">
    <input type="hidden" id="m-share-magic" value="${escA(magicUrl)}">
    <div class="form-group">
      <label>Language</label>
      <div style="display:inline-flex;border:1px solid var(--border);border-radius:6px;overflow:hidden">
        <button type="button" id="m-share-lang-es" class="btn btn-sm ${initialLang === 'es' ? 'btn-primary' : 'btn-ghost'}" style="border-radius:0;border:none;padding:6px 14px" onclick="setShareLang('es')">ES</button>
        <button type="button" id="m-share-lang-en" class="btn btn-sm ${initialLang === 'en' ? 'btn-primary' : 'btn-ghost'}" style="border-radius:0;border:none;border-left:1px solid var(--border);padding:6px 14px" onclick="setShareLang('en')">EN</button>
      </div>
      <input type="hidden" id="m-share-lang" value="${initialLang}">
    </div>
    <div class="form-group">
      <label>Recipient (default: ${escHtml(recipient)})</label>
      <input type="email" id="m-share-email" value="${escA(p.submitter_email || '')}" placeholder="someone@example.com">
    </div>
    <div class="form-group">
      <label>WhatsApp / SMS phone</label>
      <input type="tel" id="m-share-phone" value="${escA(phoneInit)}" placeholder="+57 312 783 0181">
      <small style="color:var(--text-muted)">Include country code. Spaces and dashes are fine.</small>
    </div>
    <div class="form-group">
      <label>Open-access summary link</label>
      <input type="text" value="${escA(summaryUrl)}" readonly style="font-size:11px">
      <small style="color:var(--text-muted)">No login required. Forward freely.</small>
    </div>
    <div class="form-group" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
      <button type="button" class="btn btn-sm" style="background:#25D366;color:#fff;border-color:#25D366" onclick="sendShareProjectVia('whatsapp')">📱 WhatsApp</button>
      <button type="button" class="btn btn-sm" style="background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="sendShareProjectVia('sms')">💬 SMS / Messages</button>
      <button type="button" class="btn btn-sm" style="background:#0066CC;color:#fff;border-color:#0066CC" onclick="sendShareProjectVia('mail')">✉ Mail</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="window.open(document.getElementById('m-share-summary').value, '_blank', 'noopener')">Preview Page</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="navigator.clipboard.writeText(document.getElementById('m-share-summary').value).then(()=>showCopyToast && showCopyToast('Link copied'))">Copy Link</button>
    </div>
  `, () => {});

  // Stash the project name + description for the message builder
  window._shareProjectCtx = {
    id: p.id,
    name: p.name,
    description: p.description || '',
    submitter_name: p.submitter_name || ''
  };
}
window.openShareProjectModal = openShareProjectModal;

// =====================================================
// VOICE POC TEASER — one-click AI teaser + voice, send to client
// =====================================================
async function generateVoiceTeaser(projectId) {
  let p = null;
  try {
    const projRes = await api('/projects/' + projectId);
    if (!projRes.success) { alert('Could not load project'); return; }
    p = projRes.data;
  } catch (e) { alert('Could not load project: ' + e.message); return; }

  const lang = (typeof detectLangFromCountry === 'function') ? detectLangFromCountry(p.country) : 'en';

  openModal('Generating Voice Teaser…', `
    <div style="text-align:center;padding:30px 10px">
      <div style="font-size:40px;line-height:1">&#127908;</div>
      <p style="margin:14px 0 4px;font-weight:600">Lina is building the POC teaser for <strong>${escHtml(p.name)}</strong>…</p>
      <p style="font-size:13px;color:var(--text-muted)">Generating the simulated product, the walkthrough copy, and the voice narration. ~20-40s.</p>
      <div class="spinner" style="margin:18px auto"></div>
    </div>
  `, () => {});
  const sb0 = document.getElementById('modal-save'); if (sb0) sb0.style.display = 'none';

  try {
    const res = await api('/teaser-admin/projects/' + projectId + '/generate', {
      method: 'POST', body: JSON.stringify({ lang })
    });
    if (!res.success) {
      document.getElementById('modal-body').innerHTML = '<p style="color:#f87171">Error: ' + escHtml(res.error || 'generation failed') + '</p>';
      return;
    }
    renderTeaserModal(p, res.token, res.url, res.teaser);
  } catch (e) {
    document.getElementById('modal-body').innerHTML = '<p style="color:#f87171">Error: ' + escHtml(e.message) + '</p>';
  }
}
window.generateVoiceTeaser = generateVoiceTeaser;

function renderTeaserModal(p, token, url, teaser) {
  const escA = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const es = teaser.lang === 'es';
  document.getElementById('modal-title').textContent = 'Voice Teaser — ' + (teaser.title || p.name);
  document.getElementById('modal-body').innerHTML = `
    <p style="margin:0 0 10px;font-size:13px;color:var(--text-muted)">
      <strong>${escHtml(teaser.title || p.name)}</strong> — ${es ? 'adelanto en español, narrado por Lina' : 'English teaser, narrated by Lina'}.
      Preview it below, then send to the client.
    </p>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:12px;background:#070b16">
      <iframe src="${escA(url)}" style="width:100%;height:380px;border:0" title="Teaser preview"></iframe>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn btn-sm btn-ghost" onclick="window.open('${escA(url)}','_blank','noopener')">&#8599; Open full page</button>
      <button class="btn btn-sm btn-ghost" onclick="navigator.clipboard.writeText('${escA(url)}').then(()=>showCopyToast&&showCopyToast('Link copied'))">&#128203; Copy link</button>
      <button class="btn btn-sm btn-ghost" onclick="generateVoiceTeaser(${p.id})" title="Generate a fresh version">&#8635; Regenerate</button>
    </div>
    <div class="form-group">
      <label>Recipient email</label>
      <input type="email" id="teaser-email" value="${escA(p.submitter_email || '')}" placeholder="client@example.com">
    </div>
    <div class="form-group">
      <label>WhatsApp / SMS phone</label>
      <input type="tel" id="teaser-phone" value="${escA(p.submitter_phone || '')}" placeholder="+1 305 555 0142">
      <small style="color:var(--text-muted)">Include country code. Spaces and dashes are fine.</small>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
      <button class="btn btn-sm" style="background:#25D366;color:#fff;border-color:#25D366" onclick="sendTeaserVia('${token}','whatsapp')">&#128241; WhatsApp</button>
      <button class="btn btn-sm" style="background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="sendTeaserVia('${token}','sms')">&#128172; SMS</button>
      <button class="btn btn-sm" style="background:#0066CC;color:#fff;border-color:#0066CC" onclick="sendTeaserVia('${token}','email')">&#9993; Email</button>
    </div>
    <div id="teaser-send-status" style="margin-top:12px;font-size:13px;color:var(--text-muted);min-height:18px"></div>
  `;
  const sb = document.getElementById('modal-save'); if (sb) sb.style.display = 'none';
}

async function sendTeaserVia(token, channel) {
  const email = (document.getElementById('teaser-email') || {}).value;
  const phone = (document.getElementById('teaser-phone') || {}).value;
  const to = (channel === 'email' ? email : phone || '').trim();
  const statusEl = document.getElementById('teaser-send-status');
  if (!to) { statusEl.style.color = '#f87171'; statusEl.textContent = channel === 'email' ? 'Enter a recipient email.' : 'Enter a phone with country code.'; return; }
  statusEl.style.color = 'var(--text-muted)';
  statusEl.textContent = 'Sending via ' + channel + '…';
  try {
    const res = await api('/teaser-admin/' + token + '/send', { method: 'POST', body: JSON.stringify({ channel, to }) });
    if (!res.success) { statusEl.style.color = '#f87171'; statusEl.textContent = 'Error: ' + escHtml(res.error || 'failed'); return; }
    const r = res.result || {};
    if (r.sent) {
      statusEl.style.color = '#34d399';
      statusEl.textContent = '✓ Sent via ' + channel + (r.status ? ' (' + r.status + ')' : r.sid ? ' (' + r.sid + ')' : '');
    } else {
      const link = r.mailto || r.sms_link || r.wa_link;
      if (link) {
        window.open(link, '_blank');
        statusEl.style.color = 'var(--text-muted)';
        statusEl.textContent = 'Opened your ' + channel + ' app to send manually (server auto-send ' + (r.reason || 'unavailable') + ').';
      } else {
        statusEl.style.color = '#f87171';
        statusEl.textContent = 'Could not send: ' + (r.reason || 'unknown');
      }
    }
  } catch (e) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = 'Error: ' + e.message;
  }
}
window.sendTeaserVia = sendTeaserVia;

function setShareLang(lang) {
  const langInput = document.getElementById('m-share-lang');
  if (langInput) langInput.value = lang;
  const esBtn = document.getElementById('m-share-lang-es');
  const enBtn = document.getElementById('m-share-lang-en');
  if (esBtn && enBtn) {
    esBtn.classList.toggle('btn-primary', lang === 'es');
    esBtn.classList.toggle('btn-ghost', lang !== 'es');
    enBtn.classList.toggle('btn-primary', lang === 'en');
    enBtn.classList.toggle('btn-ghost', lang !== 'en');
  }
}
window.setShareLang = setShareLang;

function sendShareProjectVia(channel) {
  const phoneRaw = (document.getElementById('m-share-phone') || {}).value || '';
  const emailTo  = (document.getElementById('m-share-email') || {}).value || '';
  const summary  = (document.getElementById('m-share-summary') || {}).value || '';
  const lang     = (document.getElementById('m-share-lang')    || {}).value || 'en';
  const ctx = window._shareProjectCtx || {};
  const pname = ctx.name || '';
  const pdesc = (ctx.description || '').slice(0, 500);

  // Message body — single open-access link. The batch.html magic link now
  // auto-redirects project-scoped tokens to the summary page anyway, so
  // sending two URLs would just confuse the recipient.
  const msg = lang === 'es'
    ? [
        `Hola, le comparto el proyecto "${pname}":`,
        '',
        pdesc,
        '',
        '🔗 Ver el proyecto completo + brief de Inteligencia Neural (acceso abierto, sin login):',
        summary,
        '',
        '— Manuel Stagg / Digit2AI'
      ].join('\n')
    : [
        `Hi, sharing the project "${pname}":`,
        '',
        pdesc,
        '',
        '🔗 Open the full project + Neural Intelligence brief (no login required):',
        summary,
        '',
        '— Manuel Stagg / Digit2AI'
      ].join('\n');

  const subject = lang === 'es' ? `Proyecto Digit2AI — ${pname}` : `Digit2AI Project — ${pname}`;

  if (channel === 'mail') {
    const mailto = 'mailto:' + encodeURIComponent(emailTo) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(msg);
    window.location.href = mailto;
    closeModal();
    return;
  }
  const digits = String(phoneRaw).replace(/[^\d]/g, '');
  if (channel === 'whatsapp') {
    if (!digits || digits.length < 7) { alert('Add a phone number with country code before sending via WhatsApp.'); return; }
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    closeModal();
    return;
  }
  if (channel === 'sms') {
    window.location.href = `sms:${digits ? digits : ''}?body=${encodeURIComponent(msg)}`;
    closeModal();
    return;
  }
}
window.sendShareProjectVia = sendShareProjectVia;

async function rejectInboxItem(projectId) {
  const reason = prompt('Reason for rejection (optional):', '');
  if (reason === null) return; // cancelled
  const card = document.querySelector(`details[data-project-id="${projectId}"]`);
  const status = document.getElementById(`inbox-status-${projectId}`);
  if (status) status.textContent = 'Rejecting...';
  try {
    const res = await api(`/intake/projects/${projectId}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason || '' }) });
    if (!res.success) {
      if (status) status.textContent = 'Error: ' + (res.error || 'reject failed');
      return;
    }
    if (status) status.textContent = 'Rejected. Preparing email draft…';
    if (card) card.style.opacity = '0.5';
    refreshInboxBadge();
    // Open the rejection email draft modal so the user can send the notice
    // via Apple Mail. Pass the reason so the body matches what was logged.
    setTimeout(() => openIntakeEmailDraft(projectId, 'rejection', reason || ''), 400);
  } catch (e) {
    if (status) status.textContent = 'Error: ' + e.message;
  }
}

// =====================================================
// INTAKE EMAIL DRAFT MODAL — "Open in Apple Mail" for
// approval / rejection notices. Sidesteps SendGrid spam-folder issue by
// letting the user review + send each notice through their own client.
// =====================================================
async function openIntakeEmailDraft(projectId, kind, reason) {
  const path = `/intake/projects/${projectId}/${kind}-email-payload`;
  let payload = null;
  try {
    const body = kind === 'rejection' ? { reason: reason || '' } : {};
    const r = await api(path, { method: 'POST', body: JSON.stringify(body) });
    if (!r || !r.success) {
      alert('Could not build the email draft: ' + ((r && r.error) || 'unknown error'));
      return;
    }
    payload = r.data;
  } catch (err) {
    alert('Could not build the email draft: ' + err.message);
    return;
  }
  _showIntakeEmailDraftModal(payload, projectId);
}
window.openIntakeEmailDraft = openIntakeEmailDraft;

function _showIntakeEmailDraftModal(payload, projectId) {
  const kindLabel = payload.kind === 'rejection' ? 'Rejection' : 'Approval';
  const headerColor = payload.kind === 'rejection' ? '#dc2626' : '#10b981';
  const headerBg = payload.kind === 'rejection' ? 'rgba(220,38,38,0.08)' : 'rgba(16,185,129,0.08)';
  const recipientText = payload.to
    ? `<strong>To:</strong> ${escapeHtml(payload.to)}`
    : `<span style="color:#f59e0b"><strong>⚠ No recipient on file</strong> — Mail will open with empty To: field</span>`;
  const meetingHint = payload.kind === 'approval' && payload.meeting && payload.meeting.start_time
    ? `<div style="font-size:12px;color:var(--text-muted);margin:6px 0">Kickoff scheduled for ${escapeHtml(new Date(payload.meeting.start_time).toLocaleString())}${payload.meeting.zoom_join_url ? ' · Zoom link included in body' : ''}</div>`
    : (payload.kind === 'approval' ? `<div style="font-size:12px;color:#f59e0b;margin:6px 0">⚠ No kickoff meeting was auto-scheduled — body falls back to "reply with times"</div>` : '');
  const modalId = `intake-email-modal-${projectId}`;
  const html = `
    <div id="${modalId}" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px" onclick="if(event.target.id==='${modalId}')document.getElementById('${modalId}').remove()">
      <div style="background:var(--bg-card);border:1px solid ${headerColor};border-radius:10px;max-width:760px;width:100%;max-height:90vh;overflow:auto;padding:0">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);background:${headerBg};border-radius:10px 10px 0 0">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <h3 style="margin:0;color:${headerColor};font-size:16px">📧 ${kindLabel} Email Draft</h3>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('${modalId}').remove()">Close</button>
          </div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:6px">${recipientText} · <strong>Subject:</strong> ${escapeHtml(payload.subject || '(no subject)')}</div>
          ${meetingHint}
        </div>
        <div style="padding:18px 20px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
            <button class="btn btn-primary btn-sm" onclick="_intakeEmailOpenInMail(${projectId})">📧 Open in Mail</button>
            <button class="btn btn-ghost btn-sm" onclick="_intakeEmailCopyHtml(${projectId})">Copy as HTML</button>
            <button class="btn btn-ghost btn-sm" onclick="_intakeEmailCopyText(${projectId})">Copy Plain Text</button>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">SendGrid auto-send is OFF — recipient spam folders triggered the switch. Open this in Apple Mail to send through your own account. "Copy as HTML" preserves the styled card formatting.</div>
          <div style="background:var(--bg-base);border:1px solid var(--border);border-radius:6px;padding:14px;font-size:13px;white-space:pre-wrap;line-height:1.55;max-height:50vh;overflow:auto">${escapeHtml(payload.body_text || '(empty)')}</div>
        </div>
      </div>
    </div>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstElementChild);
  // Stash payload so the action buttons can reach it without re-fetching
  window._lastIntakeDraft = window._lastIntakeDraft || {};
  window._lastIntakeDraft[projectId] = payload;
}

function _intakeEmailOpenInMail(projectId) {
  const p = (window._lastIntakeDraft || {})[projectId];
  if (!p) { alert('Draft expired — re-open the modal.'); return; }
  let body = p.body_text || '';
  const MAX = 1800;
  if (body.length > MAX) body = body.slice(0, MAX) + '\n\n[...truncated. Use Copy as HTML for the full version.]';
  const url = `mailto:${encodeURIComponent(p.to || '')}?subject=${encodeURIComponent(p.subject || '')}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
  if (typeof showCopyToast === 'function') showCopyToast('Opening Mail…');
}
window._intakeEmailOpenInMail = _intakeEmailOpenInMail;

async function _intakeEmailCopyHtml(projectId) {
  const p = (window._lastIntakeDraft || {})[projectId];
  if (!p) return;
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([p.body_html || ''], { type: 'text/html' }),
        'text/plain': new Blob([p.body_text || ''], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
      if (typeof showCopyToast === 'function') showCopyToast('HTML email copied — paste into Mail compose');
      return;
    }
  } catch (_) {}
  try {
    await navigator.clipboard.writeText(p.body_text || '');
    if (typeof showCopyToast === 'function') showCopyToast('Plain text copied (browser blocked rich copy)');
  } catch (_) { alert('Copy failed.'); }
}
window._intakeEmailCopyHtml = _intakeEmailCopyHtml;

async function _intakeEmailCopyText(projectId) {
  const p = (window._lastIntakeDraft || {})[projectId];
  if (!p) return;
  try {
    await navigator.clipboard.writeText(p.body_text || '');
    if (typeof showCopyToast === 'function') showCopyToast('Plain text copied');
  } catch (_) { alert('Copy failed.'); }
}
window._intakeEmailCopyText = _intakeEmailCopyText;

// =====================================================
// PROJECTS
// =====================================================
async function renderProjects(container) {
  // include_archived=1 so the user can switch to the Archived view from the
  // status filter without refetching. Default UI still hides archived rows.
  const res = await api('/projects?include_archived=1&limit=500');
  if (!res.success) return;

  // KPIs computed from the loaded project list. One card per status value
  // shown in the Status dropdown, plus a synthetic Dormant card (30d+ no
  // update, excluding completed/cancelled).
  const DORMANT_DAYS = 30;
  const dormantCutoff = Date.now() - DORMANT_DAYS * 86400000;
  const inactiveStatuses = new Set(['completed', 'cancelled']);
  const STATUS_CARDS = [
    { key: 'planning', label: 'Planning', accent: 'purple', hint: 'In scoping' },
    { key: 'active',   label: 'Active',   accent: 'green',  hint: 'Active sprint' },
    { key: 'backlog',  label: 'Backlog',  accent: 'blue',   hint: 'Everything not active' }
  ];
  // Backlog = every non-archived project that isn't status "active".
  const counts = { planning: 0, active: 0, backlog: 0 };
  for (const p of res.data) {
    if (p.archived_at) continue;
    if (counts[p.status] !== undefined) counts[p.status]++;
    if (p.status !== 'active') counts.backlog++;
  }
  // Distinct project leads for the filter dropdown.
  const leadsMap = new Map();
  res.data.forEach(p => { if (p.lead) leadsMap.set(p.lead.id, ((p.lead.first_name || '') + ' ' + (p.lead.last_name || '')).trim()); });
  const leadOptions = '<option value="">All Leads</option>' +
    Array.from(leadsMap.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<option value="${id}">${name || '(unnamed)'}</option>`).join('') +
    '<option value="__none__">Unassigned</option>';

  const statusCardsHtml = STATUS_CARDS.map(c => {
    const n = counts[c.key] || 0;
    return `
      <div class="card card-stat card-stat-compact card-accent-${c.accent} card-clickable" onclick="projectsKpiFilter('${c.key}')" data-tooltip="Click to filter the table to ${c.label} projects">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${n}</div>
        <div class="stat-change stat-neutral">${c.hint}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card-grid" style="margin-bottom:20px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
      ${statusCardsHtml}
    </div>
    <div class="section-header">
      <div class="filter-bar">
        <input type="text" placeholder="Search projects..." id="project-search" style="width:250px">
        <select id="project-status-filter">
          <option value="">All Status</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="backlog">Backlog (not active)</option>
          <option value="in_progress">In Progress</option>
          <option value="on_hold">On Hold</option>
          <option value="review">Review</option>
          <option value="completed">Completed</option>
          <option value="dormant">Dormant (30d+ no update)</option>
          <option value="archived">Archived</option>
        </select>
        <select id="project-priority-filter">
          <option value="">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select id="project-lead-filter">${leadOptions}</select>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openZoomMeeting()" title="Open Zoom (info@digit2ai.com) in a new tab" style="color:#2D8CFF;border-color:#2D8CFF">&#127909; Zoom Meeting</button>
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

  // Cache full list + dormant cutoff on the container for client-side filtering.
  container._projectsAll = res.data;
  container._dormantCutoff = dormantCutoff;
  container._inactiveStatuses = inactiveStatuses;

  // Wire client-side filters (search + status + priority). Status="dormant" is
  // synthetic — it filters by the same updated_at cutoff used for the KPI card.
  const applyFilters = () => {
    const q = (document.getElementById('project-search').value || '').trim().toLowerCase();
    const st = document.getElementById('project-status-filter').value;
    const pr = document.getElementById('project-priority-filter').value;
    const ld = document.getElementById('project-lead-filter').value;
    let list = container._projectsAll.slice();
    // Archived rows are loaded for the "Archived" view but hidden everywhere
    // else — they would otherwise pollute "All Status" with completed-and-
    // archived projects the user is no longer working on.
    if (st !== 'archived') {
      list = list.filter(p => !p.archived_at);
    }
    if (q) list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q));
    if (st === 'archived') {
      list = list.filter(p => !!p.archived_at);
    } else if (st === 'backlog') {
      list = list.filter(p => p.status !== 'active');
    } else if (st === 'dormant') {
      list = list.filter(p => !container._inactiveStatuses.has(p.status) && p.updated_at && new Date(p.updated_at).getTime() < container._dormantCutoff);
    } else if (st) {
      list = list.filter(p => p.status === st);
    }
    if (pr) list = list.filter(p => p.priority === pr);
    if (ld === '__none__') list = list.filter(p => !p.lead);
    else if (ld) list = list.filter(p => p.lead && String(p.lead.id) === ld);
    renderProjectsTable(list);
  };
  document.getElementById('project-search').addEventListener('input', applyFilters);
  document.getElementById('project-status-filter').addEventListener('change', applyFilters);
  document.getElementById('project-priority-filter').addEventListener('change', applyFilters);
  document.getElementById('project-lead-filter').addEventListener('change', applyFilters);
  // Stash for the KPI click handler so it can re-apply.
  window._projectsApplyFilters = applyFilters;

  renderProjectsTable(res.data);
}

// Render the projects table body (sorted by priority then due date).
// Called from renderProjects() and any client-side filter change.
// Badge precedence: OVERDUE (past due_date) > DORMANT (30d+ no update) > raw status.
function renderProjectsTable(list) {
  const DORMANT_DAYS = 30;
  const dormantCutoff = Date.now() - DORMANT_DAYS * 86400000;
  const inactiveStatuses = new Set(['completed', 'cancelled']);
  const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...list].sort((a, b) => {
    const pa = prioOrder[a.priority] ?? 9;
    const pb = prioOrder[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return da - db;
  });
  const tbody = document.getElementById('projects-tbody');
  if (!tbody) return;

  const backlogCollapsed = _backlogCollapsed; // collapsed by default each page load

  const rowHtml = (p, isBacklog) => {
    const isOverdue = p.due_date && new Date(p.due_date) < new Date() && !inactiveStatuses.has(p.status);
    const isDormant = !isOverdue && !inactiveStatuses.has(p.status) && p.updated_at && new Date(p.updated_at).getTime() < dormantCutoff;
    const badgeClass = isOverdue ? 'overdue' : (isDormant ? 'dormant' : p.status);
    const badgeLabel = isOverdue ? 'OVERDUE' : (isDormant ? 'DORMANT' : p.status);
    const cls = isBacklog ? 'clickable backlog-row' : 'clickable';
    const hide = isBacklog && backlogCollapsed ? 'display:none' : '';
    return `<tr class="${cls}" style="${hide}" onclick="showProjectDetail(${p.id})">
      <td><strong>${p.name}</strong>${p.code ? '<br><span style="font-size:11px;color:var(--text-muted)">'+p.code+'</span>' : ''}</td>
      <td>${p.vertical ? '<span class="vertical-dot" style="background:'+p.vertical.color+'"></span>'+p.vertical.name : '-'}</td>
      <td><span class="status-badge status-${badgeClass}" ${isDormant ? `title="No update in ${DORMANT_DAYS}+ days"` : ''}>${badgeLabel}</span></td>
      <td><span class="priority-badge priority-${p.priority}">${p.priority}</span></td>
      <td>${p.due_date ? fmtDate(p.due_date) : '-'}</td>
      <td><div class="progress-bar" style="width:100px"><div class="progress-fill" style="width:${p.progress}%"></div></div><span style="font-size:11px;color:var(--text-muted);margin-left:8px">${p.progress}%</span></td>
    </tr>`;
  };

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No matching projects.</td></tr>';
    return;
  }

  // Agile split: Active Sprint = status "active", Backlog = everything else.
  const sprint = sorted.filter(p => p.status === 'active');
  const backlog = sorted.filter(p => p.status !== 'active');
  const sprintHeader = (label, n, color, hint) =>
    `<tr><td colspan="6" style="background:rgba(148,163,184,0.06);border-left:3px solid ${color};padding:11px 14px">
       <span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${color}">${label}</span>
       <span style="background:${color}22;color:${color};border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;margin-left:8px">${n}</span>
       <span style="color:var(--text-muted);font-size:11.5px;margin-left:10px">${hint}</span>
     </td></tr>`;
  const backlogHeader = (n, color, hint) =>
    `<tr><td colspan="6" onclick="toggleBacklog()" style="cursor:pointer;background:rgba(148,163,184,0.06);border-left:3px solid ${color};padding:11px 14px;user-select:none">
       <span id="backlog-caret" style="color:${color};font-size:11px;margin-right:6px">${backlogCollapsed ? '&#9656;' : '&#9662;'}</span>
       <span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${color}">Backlog</span>
       <span style="background:${color}22;color:${color};border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;margin-left:8px">${n}</span>
       <span style="color:var(--text-muted);font-size:11.5px;margin-left:10px">${hint}</span>
     </td></tr>`;
  const emptyRow = (msg, isBacklog) => `<tr class="${isBacklog ? 'backlog-row' : ''}" style="${isBacklog && backlogCollapsed ? 'display:none' : ''}"><td colspan="6" style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px">${msg}</td></tr>`;

  tbody.innerHTML =
    sprintHeader('Active Sprint', sprint.length, '#f87171', 'Status: Active — what you are working on now') +
    (sprint.length ? sprint.map(p => rowHtml(p, false)).join('') : emptyRow('No critical projects in the sprint.', false)) +
    backlogHeader(backlog.length, '#94a3b8', 'Everything else, by priority — tap to expand') +
    (backlog.length ? backlog.map(p => rowHtml(p, true)).join('') : emptyRow('Backlog is empty.', true));
}

// Backlog collapse state — collapsed by default on each page load; remembered
// in memory so filter re-renders within the session keep the user's choice.
let _backlogCollapsed = true;
function toggleBacklog() {
  const rows = document.querySelectorAll('#projects-tbody .backlog-row');
  const caret = document.getElementById('backlog-caret');
  const isCollapsed = rows.length && rows[0].style.display === 'none';
  const willCollapse = !isCollapsed;
  rows.forEach(r => { r.style.display = willCollapse ? 'none' : ''; });
  if (caret) caret.innerHTML = willCollapse ? '&#9656;' : '&#9662;';
  _backlogCollapsed = willCollapse;
}
window.toggleBacklog = toggleBacklog;

// Set the status filter from a KPI card click and re-run the table filter.
function projectsKpiFilter(value) {
  const sel = document.getElementById('project-status-filter');
  if (!sel) return;
  sel.value = value;
  if (typeof window._projectsApplyFilters === 'function') window._projectsApplyFilters();
}

// Open Zoom Meetings dashboard (info@digit2ai.com session) in a new tab.
// If the user is signed into Zoom in this browser, it lands on the Meetings page;
// otherwise Zoom prompts for login first, then redirects.
function openZoomMeeting() {
  const url = 'https://zoom.us/meeting/schedule?login_hint=' + encodeURIComponent('info@digit2ai.com');
  window.open(url, '_blank', 'noopener');
}

// Print Projects as PDF — full detail for every project
async function printProjectsPDF() {
  const listRes = await api('/projects');
  if (!listRes.success || !listRes.data.length) { alert('No projects to print.'); return; }

  // Respect the Priority + Project Lead filters selected on the dashboard.
  const prFilter = (document.getElementById('project-priority-filter')?.value) || '';
  const ldFilter = (document.getElementById('project-lead-filter')?.value) || '';
  let filteredList = prFilter ? listRes.data.filter(p => p.priority === prFilter) : listRes.data;
  if (ldFilter === '__none__') filteredList = filteredList.filter(p => !p.lead);
  else if (ldFilter) filteredList = filteredList.filter(p => p.lead && String(p.lead.id) === ldFilter);
  if (!filteredList.length) { alert('No projects to print for the current filters.'); return; }

  const now = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  // Fetch full detail + tasks for each project in parallel
  const detailsUnsorted = await Promise.all(filteredList.map(async p => {
    const [det, tasksRes] = await Promise.all([api(`/projects/${p.id}`), api(`/tasks?project_id=${p.id}`)]);
    return { ...(det.success ? det.data : p), tasks: tasksRes.success ? tasksRes.data : [] };
  }));

  // Sort by priority: critical > high > medium > low
  const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const details = detailsUnsorted.sort((a, b) => (prioOrder[a.priority] ?? 9) - (prioOrder[b.priority] ?? 9));

  const fmtD = d => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '-';
  const esc = s => (s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const byStatus = {};
  details.forEach(p => { byStatus[p.status] = (byStatus[p.status]||0) + 1; });
  const summaryLine = Object.entries(byStatus).map(([s,c]) => c + ' ' + s.replace(/_/g,' ')).join(' | ');

  const cards = details.map(p => {
    const isOverdue = p.due_date && new Date(p.due_date) < new Date() && !['completed','cancelled'].includes(p.status);
    const tasks = (p.tasks||[]).map(t => {
      const tOver = t.due_date && new Date(t.due_date) < new Date() && t.status === 'pending';
      return `<li style="margin-bottom:4px;color:${t.status==='completed'?'#16a34a':tOver?'#dc2626':'#333'}">${esc(t.title)} <span style="color:#888">[${t.status}${t.priority?' - '+t.priority:''}${t.due_date?' - '+fmtD(t.due_date):''}${t.assignee?' - '+t.assignee.first_name+' '+(t.assignee.last_name||''):''}]</span></li>`;
    }).join('');
    const contacts = (p.contacts||[]).map(c => `<li>${esc(c.first_name+' '+(c.last_name||''))}${c.ProjectContact?.role?' <span style="color:#888">('+c.ProjectContact.role+')</span>':''}</li>`).join('');

    return `
      <div style="page-break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <h2 style="margin:0;font-size:18px">${esc(p.name)}</h2>
            ${p.code ? '<span style="font-size:11px;color:#888">'+esc(p.code)+'</span>' : ''}
          </div>
          <div style="text-align:right;font-size:12px">
            <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-weight:600;font-size:11px;color:white;background:${isOverdue?'#dc2626':p.status==='completed'?'#16a34a':p.status==='active'||p.status==='in_progress'?'#2563eb':'#888'}">${isOverdue?'OVERDUE':p.status?.replace(/_/g,' ').toUpperCase()}</span>
            <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-weight:600;font-size:11px;margin-left:4px;color:white;background:${p.priority==='critical'?'#dc2626':p.priority==='high'?'#ea580c':p.priority==='medium'?'#2563eb':'#888'}">${p.priority?.toUpperCase()}</span>
          </div>
        </div>

        <table style="width:100%;font-size:12px;margin-bottom:12px;border-collapse:collapse">
          <tr>
            <td style="padding:4px 0;color:#888;width:100px">Vertical:</td><td style="padding:4px 0">${esc(p.vertical?.name||'-')}</td>
            <td style="padding:4px 0;color:#888;width:100px">Category:</td><td style="padding:4px 0">${esc(p.category||'-')}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#888">Start:</td><td style="padding:4px 0">${fmtD(p.start_date)}</td>
            <td style="padding:4px 0;color:#888">Due:</td><td style="padding:4px 0;font-weight:${isOverdue?'700':'400'};color:${isOverdue?'#dc2626':'#222'}">${fmtD(p.due_date)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#888">Progress:</td><td style="padding:4px 0">${p.progress||0}%</td>
            <td style="padding:4px 0;color:#888">Lead:</td><td style="padding:4px 0">${p.lead ? esc(p.lead.first_name+' '+(p.lead.last_name||'')) : '-'}</td>
          </tr>
        </table>

        ${p.description ? '<div style="margin-bottom:10px"><strong style="font-size:12px;color:#555">Description</strong><p style="font-size:12px;margin:4px 0;line-height:1.5;color:#333">'+esc(p.description)+'</p></div>' : ''}
        ${p.next_step ? '<div style="margin-bottom:10px"><strong style="font-size:12px;color:#16a34a">Next Step</strong><p style="font-size:12px;margin:4px 0;color:#333">'+esc(p.next_step)+'</p></div>' : ''}

        ${tasks ? '<div style="margin-bottom:10px"><strong style="font-size:12px;color:#555">Tasks ('+p.tasks.length+')</strong><ul style="font-size:12px;margin:4px 0;padding-left:18px">'+tasks+'</ul></div>' : ''}
        ${contacts ? '<div style="margin-bottom:10px"><strong style="font-size:12px;color:#555">Linked Contacts</strong><ul style="font-size:12px;margin:4px 0;padding-left:18px">'+contacts+'</ul></div>' : ''}
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Projects Report</title>
    <style>
      @page { size: landscape; margin: 0.5in; }
      body { font-family: -apple-system,Helvetica,Arial,sans-serif; color:#222; margin:0; padding:24px; }
      h1 { font-size:22px; margin:0 0 4px; }
      .meta { font-size:12px; color:#888; margin-bottom:12px; }
      .summary { font-size:12px; color:#555; margin-bottom:20px; padding:10px 14px; background:#f5f5f5; border-radius:6px; }
      @media print { body { padding:0; } }
    </style></head><body>
    <h1>Digit2Ai Projects Report${prFilter ? ' — ' + prFilter.toUpperCase() : ''}</h1>
    <p class="meta">Generated: ${now} | ${details.length}${prFilter ? ' ' + prFilter : ''} project${details.length===1?'':'s'}</p>
    <div class="summary">${summaryLine}</div>
    ${cards}
  </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// =====================================================
// CALENDAR
// =====================================================
let calYear, calMonth;
// =====================================================
// CALENDAR (Outlook-style Month / Week / Day views)
// =====================================================
// Default = week on every screen size now (mobile day-columns shrink but stay readable).
// One-time migration: bump CAL_VIEW_VERSION to force-reset stored preferences when
// the default changes (otherwise users keep stale 'day' / 'month' from earlier builds).
const CAL_VIEW_VERSION = '2026-04-30';
if (localStorage.getItem('cal_view_version') !== CAL_VIEW_VERSION) {
  localStorage.setItem('cal_view', 'week');
  localStorage.setItem('cal_view_version', CAL_VIEW_VERSION);
}
let calView = localStorage.getItem('cal_view') || 'week';
let calCursor = null; // YYYY-MM-DD anchor date for week/day views

const TYPE_COLORS = {
  meeting: '#2563eb', deadline: '#ef4444', followup: '#f59e0b',
  milestone: '#10b981', event: '#3b82f6', task: '#8b5cf6'
};
const HOUR_START = 6;   // earliest hour shown
const HOUR_END = 22;    // last hour shown (exclusive)
const PX_PER_HOUR = 56;
const PX_PER_MIN = PX_PER_HOUR / 60;

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function startOfWeek(d) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtTimeLabel(h) { const ap = h < 12 ? 'AM' : 'PM'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh} ${ap}`; }

async function renderCalendar(container) {
  const now = new Date();
  if (!calCursor) calCursor = ymd(now);
  if (!calYear) { calYear = now.getFullYear(); calMonth = now.getMonth(); }

  const headerHTML = `
    <div style="margin-bottom:12px">
      <button class="btn btn-ghost btn-sm" onclick="navigateTo('overview')">&#8592; Back to Home</button>
    </div>
    <div class="section-header cal-section-header">
      <div class="cal-nav-row">
        <button class="btn btn-ghost btn-sm cal-nav-btn" onclick="calNav(-1)" aria-label="Previous">&#9664;</button>
        <h3 id="cal-title" class="cal-title"></h3>
        <button class="btn btn-ghost btn-sm cal-nav-btn" onclick="calNav(1)" aria-label="Next">&#9654;</button>
      </div>
      <div class="cal-actions-row">
        <button class="btn btn-ghost btn-sm" onclick="calToday()">Today</button>
        <div class="cal-view-group" style="display:inline-flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
          <button class="btn btn-sm ${calView==='month'?'btn-primary':'btn-ghost'}" style="border-radius:0;border:none" onclick="setCalView('month')">Month</button>
          <button class="btn btn-sm ${calView==='week'?'btn-primary':'btn-ghost'}" style="border-radius:0;border:none;border-left:1px solid var(--border)" onclick="setCalView('week')">Week</button>
          <button class="btn btn-sm ${calView==='day'?'btn-primary':'btn-ghost'}" style="border-radius:0;border:none;border-left:1px solid var(--border)" onclick="setCalView('day')">Day</button>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openZoomMeeting()" title="Open Zoom (info@digit2ai.com) in a new tab" style="color:#2D8CFF;border-color:#2D8CFF">&#127909; Zoom Meeting</button>
        <button class="btn btn-ghost btn-sm" onclick="window.open('https://aiagent.ringlypro.com/quicktask/', '_blank', 'noopener')" title="Open Quick Task in a new tab" style="color:#F59E0B;border-color:#F59E0B">&#9889; Quick Task</button>
        <button class="btn btn-primary btn-sm cal-new-event-btn" onclick="openEventModal()">+ New Event</button>
      </div>
    </div>
    <div id="cal-body"></div>
  `;
  container.innerHTML = headerHTML;

  if (calView === 'month') await renderMonthGrid();
  else if (calView === 'week') await renderTimeGrid(7);
  else await renderTimeGrid(1);
}

function setCalView(v) {
  calView = v;
  localStorage.setItem('cal_view', v);
  renderCalendar(document.getElementById('view-container'));
}

// Home page shortcut — open the Calendar view forced into Week mode,
// regardless of whatever view the user last left it on.
function openCalendarWeek() {
  calView = 'week';
  localStorage.setItem('cal_view', 'week');
  navigateTo('calendar');
}
window.openCalendarWeek = openCalendarWeek;

function calToday() {
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();
  calCursor = ymd(now);
  renderCalendar(document.getElementById('view-container'));
}

function calNav(dir) {
  if (calView === 'month') {
    calMonth += dir;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0; calYear++; }
    calCursor = ymd(new Date(calYear, calMonth, 1));
  } else {
    const step = calView === 'week' ? 7 : 1;
    const cur = new Date(calCursor + 'T00:00:00');
    const next = addDays(cur, dir * step);
    calCursor = ymd(next);
    calYear = next.getFullYear(); calMonth = next.getMonth();
  }
  renderCalendar(document.getElementById('view-container'));
}

// ----- Month view (original) -----
async function renderMonthGrid() {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-title').textContent = `${monthNames[calMonth]} ${calYear}`;

  const monthStart = new Date(calYear, calMonth, 1);
  const monthEnd = new Date(calYear, calMonth + 1, 0);
  const startParam = new Date(calYear, calMonth, 1 - monthStart.getDay()).toISOString();
  const endParam = new Date(calYear, calMonth + 1, 6 - monthEnd.getDay()).toISOString();
  const res = await api(`/calendar?start=${startParam}&end=${endParam}`);
  const events = res.success ? res.data : [];

  const eventsByDate = {};
  events.forEach(e => {
    const startD = new Date(e.start_time);
    const endD = e.end_time ? new Date(e.end_time) : startD;
    const cur = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
    const last = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate());
    while (cur <= last) {
      const d = ymd(cur);
      if (!eventsByDate[d]) eventsByDate[d] = [];
      eventsByDate[d].push(e);
      cur.setDate(cur.getDate() + 1);
    }
  });

  const body = document.getElementById('cal-body');
  body.innerHTML = '<div class="calendar-grid" id="cal-grid"></div>';
  const grid = document.getElementById('cal-grid');
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  grid.innerHTML = dayNames.map(d => `<div class="calendar-header-cell">${d}</div>`).join('');

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = ymd(new Date());

  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    grid.innerHTML += `<div class="calendar-cell other-month"><div class="calendar-day">${day}</div></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const dayEvents = eventsByDate[dateStr] || [];
    grid.innerHTML += `<div class="calendar-cell${isToday ? ' today' : ''}" onclick="jumpToDay('${dateStr}')"><div class="calendar-day">${d}</div>${dayEvents.slice(0,3).map(e => {
      const click = e.source === 'task' ? `showTaskDetail(${e.task_id})` : `showEventDetail(${e.id})`;
      return `<div class="calendar-event-dot" style="background:${TYPE_COLORS[e.event_type]||'#2563eb'};color:white;cursor:pointer" onclick="event.stopPropagation();${click}">${e.source === 'task' ? '&#9989; ' : ''}${escapeHtml(e.title)}</div>`;
    }).join('')}${dayEvents.length > 3 ? `<div style="font-size:10px;color:var(--text-muted)">+${dayEvents.length-3} more</div>` : ''}</div>`;
  }
  const totalCells = firstDay + daysInMonth;
  const remaining = 7 - (totalCells % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      grid.innerHTML += `<div class="calendar-cell other-month"><div class="calendar-day">${d}</div></div>`;
    }
  }
}

function jumpToDay(dateStr) {
  calCursor = dateStr;
  setCalView('day');
}

// ----- Outlook-style Week (7-day) and Day (1-day) time grid -----
async function renderTimeGrid(numDays) {
  const cursor = new Date(calCursor + 'T00:00:00');
  const start = numDays === 7 ? startOfWeek(cursor) : new Date(cursor);
  start.setHours(0,0,0,0);
  const end = addDays(start, numDays); end.setHours(23,59,59,999);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (numDays === 1) {
    document.getElementById('cal-title').textContent =
      `${start.toLocaleDateString(undefined,{weekday:'long'})}, ${monthNames[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}`;
  } else {
    const last = addDays(start, 6);
    document.getElementById('cal-title').textContent =
      `${monthNames[start.getMonth()]} ${start.getDate()} - ${monthNames[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
  }

  const res = await api(`/calendar?start=${start.toISOString()}&end=${end.toISOString()}`);
  const events = res.success ? res.data : [];

  // Build day columns. Events are expanded into every day they span:
  //   - a "timed" event has both start_time and end_time on the same calendar day
  //   - a "spanning" event covers >= 1 calendar day; rendered as an all-day bar
  function eventTouchesDay(e, dStr) {
    const startD = new Date(e.start_time);
    const endD = e.end_time ? new Date(e.end_time) : startD;
    const sStr = ymd(startD);
    const eStr = ymd(endD);
    return dStr >= sStr && dStr <= eStr;
  }
  function isSpanning(e) {
    const startD = new Date(e.start_time);
    const endD = e.end_time ? new Date(e.end_time) : startD;
    return ymd(startD) !== ymd(endD);
  }
  const days = [];
  for (let i = 0; i < numDays; i++) days.push(addDays(start, i));
  const dayCols = days.map(d => {
    const dStr = ymd(d);
    const dayEvents = events.filter(e => eventTouchesDay(e, dStr));
    return {
      date: d,
      dateStr: dStr,
      timedEvents: dayEvents.filter(e => !isSpanning(e)),
      spanEvents: dayEvents.filter(e => isSpanning(e))
    };
  });

  const body = document.getElementById('cal-body');
  const totalHours = HOUR_END - HOUR_START;
  const gridHeight = totalHours * PX_PER_HOUR;

  // Column header row + all-day spanning row
  const anySpan = dayCols.some(c => c.spanEvents.length > 0);
  const allDayRow = anySpan ? `
    <div class="cal-allday-row" data-days="${numDays}" style="grid-template-columns: 60px repeat(${numDays}, 1fr)">
      <div class="cal-allday-label">all-day</div>
      ${dayCols.map(c => `
        <div class="cal-allday-cell">
          ${c.spanEvents.map(e => {
            const click = e.source === 'task' ? `showTaskDetail(${e.task_id})` : `showEventDetail(${e.id})`;
            const color = TYPE_COLORS[e.event_type] || '#2563eb';
            const isStart = c.dateStr === ymd(new Date(e.start_time));
            return `<div class="cal-span-bar" style="background:${color};color:white"
                    onclick="event.stopPropagation();${click}">${isStart ? escapeHtml(e.title) : '&nbsp;'}</div>`;
          }).join('')}
        </div>`).join('')}
    </div>` : '';

  const headerRow = `
    <div class="cal-week-headers" data-days="${numDays}" style="grid-template-columns: 60px repeat(${numDays}, 1fr)">
      <div></div>
      ${dayCols.map(c => {
        const isToday = c.dateStr === ymd(new Date());
        return `<div class="cal-week-day-header${isToday?' is-today':''}" onclick="jumpToDay('${c.dateStr}')">
          <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted)">${c.date.toLocaleDateString(undefined,{weekday:'short'})}</div>
          <div style="font-size:18px;font-weight:600;color:${isToday?'var(--accent)':'var(--text-primary)'}">${c.date.getDate()}</div>
        </div>`;
      }).join('')}
    </div>
    ${allDayRow}`;

  // Time gutter + day columns body
  const timeLabels = [];
  for (let h = HOUR_START; h < HOUR_END; h++) {
    timeLabels.push(`<div class="cal-hour-label" style="height:${PX_PER_HOUR}px">${fmtTimeLabel(h)}</div>`);
  }
  const dayColumnsHTML = dayCols.map((c, idx) => {
    const slots = [];
    for (let h = HOUR_START; h < HOUR_END; h++) {
      // Drag-to-create handled by .cal-day-col mousedown -- slots are visual hover guides only
      slots.push(`
        <div class="cal-slot cal-slot-half" style="top:${(h-HOUR_START)*PX_PER_HOUR}px;height:${PX_PER_HOUR/2}px"></div>
        <div class="cal-slot cal-slot-half" style="top:${(h-HOUR_START)*PX_PER_HOUR + PX_PER_HOUR/2}px;height:${PX_PER_HOUR/2}px"></div>
      `);
    }
    // Position events (timed only — spanning multi-day events render in the all-day row)
    const evHTML = c.timedEvents.map(e => {
      const startD = new Date(e.start_time);
      const endD = e.end_time ? new Date(e.end_time) : new Date(startD.getTime() + 60*60*1000);
      const startMin = startD.getHours()*60 + startD.getMinutes();
      const endMin = endD.getHours()*60 + endD.getMinutes();
      const top = Math.max(0, (startMin - HOUR_START*60) * PX_PER_MIN);
      const height = Math.max(20, (Math.min(endMin, HOUR_END*60) - Math.max(startMin, HOUR_START*60)) * PX_PER_MIN);
      const click = e.source === 'task' ? `showTaskDetail(${e.task_id})` : `showEventDetail(${e.id})`;
      const color = TYPE_COLORS[e.event_type] || '#2563eb';
      const timeStr = startD.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
      return `<div class="cal-event" style="top:${top}px;height:${height}px;background:${color}1f;border-left:3px solid ${color};color:var(--text-primary)"
              onclick="event.stopPropagation();${click}">
        <div class="cal-event-time" style="color:${color}">${timeStr}</div>
        <div class="cal-event-title">${escapeHtml(e.title)}</div>
      </div>`;
    }).join('');
    const isToday = c.dateStr === ymd(new Date());
    return `<div class="cal-day-col${isToday?' is-today':''}" data-date-str="${c.dateStr}" style="height:${gridHeight}px">${slots.join('')}${evHTML}</div>`;
  }).join('');

  // Now-line indicator
  const now = new Date();
  let nowLineHTML = '';
  if (now.getHours() >= HOUR_START && now.getHours() < HOUR_END) {
    const nowMin = now.getHours()*60 + now.getMinutes();
    const top = (nowMin - HOUR_START*60) * PX_PER_MIN;
    nowLineHTML = `<div class="cal-now-line" style="top:${top}px"></div>`;
  }

  body.innerHTML = `
    ${headerRow}
    <div class="cal-week-body" data-days="${numDays}" style="grid-template-columns: 60px 1fr">
      <div class="cal-time-gutter">${timeLabels.join('')}</div>
      <div class="cal-week-columns" data-days="${numDays}" style="grid-template-columns: repeat(${numDays}, 1fr); height:${gridHeight}px; position:relative">
        ${dayColumnsHTML}
        ${nowLineHTML}
      </div>
    </div>
  `;

  // Auto-scroll so 8 AM is near the top
  const scrollWrap = body.querySelector('.cal-week-body');
  if (scrollWrap) scrollWrap.scrollTop = (8 - HOUR_START) * PX_PER_HOUR - 10;

  setupCalendarDrag();
}

// =====================================================
// Drag-to-create (Outlook-style) on Week / Day views
// =====================================================
let _calDrag = null;

function _calClampY(y) {
  const max = (HOUR_END - HOUR_START) * PX_PER_HOUR;
  return Math.max(0, Math.min(max, y));
}
function _calSnapDown(y) { return Math.floor(y / (PX_PER_HOUR/2)) * (PX_PER_HOUR/2); }
function _calSnapUp(y)   { return Math.ceil (y / (PX_PER_HOUR/2)) * (PX_PER_HOUR/2); }

function _fmtMinLabel(m) {
  const h = Math.floor(m/60), min = m % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(min).padStart(2,'0')} ${ap}`;
}

function setupCalendarDrag() {
  const wrap = document.querySelector('.cal-week-columns');
  if (!wrap) return;
  wrap.addEventListener('mousedown', _onCalMouseDown);
  // Touch support: route touch events through the same mouse handlers
  wrap.addEventListener('touchstart', _onCalTouchStart, { passive: false });
}

function _touchToMouseEvent(touchEvent, type) {
  const t = touchEvent.touches[0] || touchEvent.changedTouches[0];
  return {
    button: 0,
    clientX: t.clientX,
    clientY: t.clientY,
    target: document.elementFromPoint(t.clientX, t.clientY) || touchEvent.target,
    preventDefault: () => touchEvent.preventDefault(),
    type: type
  };
}
// Long-press pattern so vertical scrolling stays the default touch
// behaviour. The user must hold a finger still for ~350 ms on a slot
// before drag-to-create activates. A short tap still creates a 30-min
// slot via the existing single-tap path. Any move within the threshold
// cancels the long press so the page can scroll normally.
const LONG_PRESS_MS = 350;
const TOUCH_MOVE_TOLERANCE = 8; // px before we treat the gesture as scroll
let _calTouchTimer = null;
let _calTouchStartXY = null;
let _calPendingTouch = null;

function _clearLongPressTimer() {
  if (_calTouchTimer) { clearTimeout(_calTouchTimer); _calTouchTimer = null; }
}

function _onCalTouchStart(e) {
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  const target = document.elementFromPoint(t.clientX, t.clientY);
  if (target && target.closest('.cal-event')) return; // tapping an existing event
  // Don't preventDefault yet -- let the browser scroll until the long press fires
  _calTouchStartXY = { x: t.clientX, y: t.clientY };
  _calPendingTouch = e;
  _clearLongPressTimer();
  _calTouchTimer = setTimeout(() => {
    _calTouchTimer = null;
    if (!_calPendingTouch) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
    _onCalMouseDown(_touchToMouseEvent(_calPendingTouch, 'mousedown'));
  }, LONG_PRESS_MS);
  document.addEventListener('touchmove', _onCalTouchMove, { passive: false });
  document.addEventListener('touchend', _onCalTouchEnd);
  document.addEventListener('touchcancel', _onCalTouchEnd);
}

function _onCalTouchMove(e) {
  // If we haven't activated a drag yet, watch for a move that signals scroll
  if (!_calDrag) {
    if (_calTouchStartXY) {
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - _calTouchStartXY.x);
      const dy = Math.abs(t.clientY - _calTouchStartXY.y);
      if (dx > TOUCH_MOVE_TOLERANCE || dy > TOUCH_MOVE_TOLERANCE) {
        // User is scrolling -- cancel the long press and let the browser handle it
        _clearLongPressTimer();
        _calPendingTouch = null;
        _calTouchStartXY = null;
        document.removeEventListener('touchmove', _onCalTouchMove);
        document.removeEventListener('touchend', _onCalTouchEnd);
        document.removeEventListener('touchcancel', _onCalTouchEnd);
      }
    }
    return;
  }
  e.preventDefault();
  _onCalMouseMove(_touchToMouseEvent(e, 'mousemove'));
}

function _onCalTouchEnd(e) {
  document.removeEventListener('touchmove', _onCalTouchMove);
  document.removeEventListener('touchend', _onCalTouchEnd);
  document.removeEventListener('touchcancel', _onCalTouchEnd);
  if (_calTouchTimer) {
    // Tap ended before long-press fired -> treat as a single-slot tap
    _clearLongPressTimer();
    if (_calPendingTouch) {
      _onCalMouseDown(_touchToMouseEvent(_calPendingTouch, 'mousedown'));
      _onCalMouseUp(_touchToMouseEvent(_calPendingTouch, 'mouseup'));
    }
    _calPendingTouch = null;
    _calTouchStartXY = null;
    return;
  }
  if (_calDrag) {
    _onCalMouseUp(_touchToMouseEvent(e, 'mouseup'));
  }
  _calPendingTouch = null;
  _calTouchStartXY = null;
}

function _onCalMouseDown(e) {
  if (e.button !== 0) return; // left click only
  if (e.target.closest('.cal-event')) return; // clicking an existing event
  const dayCol = e.target.closest('.cal-day-col');
  if (!dayCol) return;
  const dateStr = dayCol.dataset.dateStr;
  if (!dateStr) return;

  const rect = dayCol.getBoundingClientRect();
  const startY = _calClampY(e.clientY - rect.top);

  const ghost = document.createElement('div');
  ghost.className = 'cal-drag-ghost';
  dayCol.appendChild(ghost);

  _calDrag = { dateStr, dayCol, startY, currentY: startY, ghost };
  _updateCalGhost();

  e.preventDefault();
  document.addEventListener('mousemove', _onCalMouseMove);
  document.addEventListener('mouseup', _onCalMouseUp);
}

function _onCalMouseMove(e) {
  if (!_calDrag) return;
  const rect = _calDrag.dayCol.getBoundingClientRect();
  _calDrag.currentY = _calClampY(e.clientY - rect.top);
  _updateCalGhost();
}

function _updateCalGhost() {
  const { startY, currentY, ghost } = _calDrag;
  const top = _calSnapDown(Math.min(startY, currentY));
  const bot = _calSnapUp(Math.max(startY, currentY));
  const height = Math.max(PX_PER_HOUR/2, bot - top);
  ghost.style.top = top + 'px';
  ghost.style.height = height + 'px';
  const startMin = HOUR_START*60 + (top / (PX_PER_HOUR/2)) * 30;
  const endMin = startMin + (height / (PX_PER_HOUR/2)) * 30;
  ghost.innerHTML = `<div class="cal-drag-label">${_fmtMinLabel(startMin)} - ${_fmtMinLabel(endMin)}</div>`;
}

function _onCalMouseUp(e) {
  if (!_calDrag) return;
  document.removeEventListener('mousemove', _onCalMouseMove);
  document.removeEventListener('mouseup', _onCalMouseUp);

  const { dateStr, startY, currentY, ghost } = _calDrag;
  const top = _calSnapDown(Math.min(startY, currentY));
  const bot = _calSnapUp(Math.max(startY, currentY));
  const startSlot = top / (PX_PER_HOUR/2);
  const endSlot = Math.max(startSlot + 1, bot / (PX_PER_HOUR/2));
  const startMin = HOUR_START * 60 + startSlot * 30;
  const endMin   = HOUR_START * 60 + endSlot   * 30;

  if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
  _calDrag = null;

  const pad = n => String(n).padStart(2,'0');
  const startISO = `${dateStr}T${pad(Math.floor(startMin/60))}:${pad(startMin%60)}`;
  const endISO   = `${dateStr}T${pad(Math.floor(endMin/60))}:${pad(endMin%60)}`;
  openEventModalRange(startISO, endISO);
}

function openEventModalRange(startISO, endISO) {
  openEventModal();
  setTimeout(() => {
    const startEl = document.getElementById('m-estart');
    const endEl = document.getElementById('m-eend');
    if (startEl) startEl.value = startISO;
    if (endEl) endEl.value = endISO;
  }, 50);
}

function escapeHtml(s) { return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// ----- Timezone helpers (datetime-local <-> UTC ISO) -----
// datetime-local inputs use the BROWSER's local time but emit a string
// without an offset; the server stores TIMESTAMPTZ in UTC. Convert both
// ways so the user always sees / enters the wall-clock time they expect.
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(s) {
  if (!s) return null;
  const d = new Date(s); // JS parses 'YYYY-MM-DDTHH:MM' as local time
  if (isNaN(d)) return null;
  return d.toISOString();
}
function shiftIsoForRecurrence(iso, mode, n) {
  if (!iso || !n) return iso;
  const d = new Date(iso);
  if (mode === 'daily') d.setDate(d.getDate() + n);
  else if (mode === 'weekly') d.setDate(d.getDate() + n*7);
  else if (mode === 'biweekly') d.setDate(d.getDate() + n*14);
  else if (mode === 'monthly') d.setMonth(d.getMonth() + n);
  else return iso;
  return d.toISOString();
}

// Open New-Event modal pre-filled with a clicked time slot
// isoSlot format: "YYYY-MM-DDTHH:MM"
function openEventModalAt(isoSlot) {
  openEventModal();
  setTimeout(() => {
    const startEl = document.getElementById('m-estart');
    const endEl = document.getElementById('m-eend');
    if (startEl) startEl.value = isoSlot;
    if (endEl) {
      const d = new Date(isoSlot);
      d.setHours(d.getHours() + 1);
      endEl.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
  }, 50);
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

  // If the event is linked to a project, fetch the project's stakeholders so
  // we can surface them in the Attendees panel even when they were never
  // explicitly added to event.invited_emails.
  const norm = (s) => String(s || '').trim().toLowerCase();
  const invitedSet = new Set((Array.isArray(e.invited_emails) ? e.invited_emails : []).map(norm));
  let projectStakeholders = []; // [{ email, role: 'requestor' | 'stakeholder' }]
  if (e.project_id || (e.project && e.project.id)) {
    const projectId = e.project_id || e.project.id;
    try {
      const pres = await api(`/projects/${projectId}`);
      if (pres.success && pres.data) {
        const p = pres.data;
        if (p.submitter_email) {
          projectStakeholders.push({ email: norm(p.submitter_email), role: 'requestor' });
        }
        if (Array.isArray(p.team_members)) {
          p.team_members.forEach(m => {
            if (m && m.email) projectStakeholders.push({ email: norm(m.email), role: 'stakeholder' });
          });
        }
        // Dedupe — keep the strongest role (requestor wins over stakeholder)
        const seen = new Map();
        projectStakeholders.forEach(s => {
          if (!seen.has(s.email)) seen.set(s.email, s);
          else if (s.role === 'requestor') seen.set(s.email, s);
        });
        projectStakeholders = Array.from(seen.values());
      }
    } catch (_) { /* non-fatal */ }
  }
  const stakeholdersNotInvited = projectStakeholders.filter(s => !invitedSet.has(s.email));

  container.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('calendar')" style="margin-bottom:8px">&#8592; Back to Calendar</button>
          <h2>${e.title}</h2>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="openRescheduleModal(${e.id})">Reschedule</button>
          <button class="btn btn-ghost btn-sm" onclick="openEventEditModal(${e.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEvent(${e.id}, ${e.recurrence_group_id ? 'true' : 'false'})">Delete</button>
        </div>
      </div>
      <div class="detail-meta">
        <span class="status-badge" style="background:${typeColors[e.event_type] || '#2563eb'}20;color:${typeColors[e.event_type] || '#2563eb'}">${e.event_type || 'event'}</span>
        ${isPast ? '<span class="status-badge status-completed">Past</span>' : '<span class="status-badge status-active">Upcoming</span>'}
        ${e.all_day ? '<span class="status-badge status-planning">All Day</span>' : ''}
        ${e.recurrence_group_id ? '<span class="status-badge" style="background:rgba(167,139,250,.15);color:#c4b5fd">Recurring</span>' : ''}
        ${e.zoom_join_url ? '<span class="status-badge" style="background:rgba(45,140,255,.15);color:#2D8CFF">&#127909; Zoom</span>' : ''}
      </div>
      ${e.zoom_join_url ? `
        <div style="margin-top:14px;padding:12px 14px;background:rgba(45,140,255,.08);border:1px solid rgba(45,140,255,.3);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-weight:600;color:#2D8CFF">&#127909; Zoom meeting ready</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;word-break:break-all">${e.zoom_join_url}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${e.zoom_join_url}').then(()=>alert('Join link copied'))">Copy</button>
            <a class="btn btn-primary btn-sm" href="${e.zoom_join_url}" target="_blank" rel="noopener" style="background:#2D8CFF;border-color:#2D8CFF">Join Zoom</a>
          </div>
        </div>
      ` : ''}
      <div style="margin-top:14px;padding:12px 14px;background:#f8fafc;border:1px solid var(--border);border-radius:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-weight:600">&#9993; Attendees</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              ${(e.invited_emails && e.invited_emails.length)
                ? e.invited_emails.length + ' explicitly invited'
                : (stakeholdersNotInvited.length ? 'No one explicitly invited' : 'No one invited yet')}
              ${stakeholdersNotInvited.length ? ' &middot; ' + stakeholdersNotInvited.length + ' from linked project' : ''}
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openInviteMoreModal(${e.id})">+ Invite${(e.invited_emails && e.invited_emails.length) ? ' more' : ' attendees'}</button>
        </div>
        ${(e.invited_emails && e.invited_emails.length) ? `
          <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
            ${e.invited_emails.map(em => `<span style="background:#e0e7ff;color:#3730a3;padding:4px 10px;border-radius:12px;font-size:12px">${escapeHtml(em)}</span>`).join('')}
          </div>
        ` : ''}
        ${stakeholdersNotInvited.length ? `
          <div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)">
            <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">From linked project (not yet explicitly invited)</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${stakeholdersNotInvited.map(s => `<span style="background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:12px;font-size:12px" title="${s.role === 'requestor' ? 'Project requestor' : 'Project stakeholder'}">${escapeHtml(s.email)}${s.role === 'requestor' ? ' &#9733;' : ''}</span>`).join('')}
            </div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">These will be auto-included if you click Reschedule with notification enabled.</div>
          </div>
        ` : ''}
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

function openInviteMoreModal(eventId) {
  openModal('Invite attendees', `
    <div class="form-group">
      <label>Email addresses *</label>
      <input type="text" id="m-iv-emails" placeholder="alice@example.com, bob@example.com">
      <small style="color:var(--text-muted)">Comma-separated. Anyone already invited will be silently deduped.</small>
    </div>
    <div class="form-group">
      <label>Personal note (optional)</label>
      <textarea id="m-iv-msg" rows="3" placeholder="Adding you to the meeting we discussed."></textarea>
    </div>
  `, async () => {
    const emails = document.getElementById('m-iv-emails').value.trim();
    const message = document.getElementById('m-iv-msg').value.trim();
    if (!emails) { alert('Add at least one email address'); return; }
    const res = await api(`/calendar/${eventId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails, message })
    });
    if (!res.success) { alert('Send failed: ' + (res.error || 'unknown')); return; }
    closeModal();
    const ir = res.invite_result || { sent: [], failed: [] };
    let msg = '';
    if (ir.sent.length) msg += `Invites sent to ${ir.sent.length} attendee${ir.sent.length === 1 ? '' : 's'}.`;
    if (ir.failed.length) msg += (msg ? '\n\n' : '') + `Failed: ${ir.failed.map(f => f.email + ' (' + f.error + ')').join(', ')}`;
    if (msg) alert(msg);
    showEventDetail(eventId);
  });
}

// Quick reschedule — just change start/end + optionally notify attendees.
// When the event is linked to a project, also pulls project stakeholders
// (submitter_email + team_members) and merges them with event.invited_emails
// so people who care about the project are not silently skipped.
async function openRescheduleModal(id) {
  const res = await api(`/calendar/${id}`);
  if (!res.success) { alert('Could not load event'); return; }
  const e = res.data;

  // Build merged recipient list with provenance labels.
  const norm = (s) => String(s || '').trim().toLowerCase();
  const recipients = new Map(); // email -> Set of source labels
  const addRecipient = (email, source) => {
    const ne = norm(email);
    if (!ne || !ne.includes('@')) return;
    if (!recipients.has(ne)) recipients.set(ne, new Set());
    recipients.get(ne).add(source);
  };

  if (Array.isArray(e.invited_emails)) {
    e.invited_emails.forEach(em => addRecipient(em, 'Event attendee'));
  }

  // If the event is linked to a project, pull stakeholders too.
  let projectName = null;
  if (e.project_id || (e.project && e.project.id)) {
    const projectId = e.project_id || e.project.id;
    try {
      const pres = await api(`/projects/${projectId}`);
      if (pres.success && pres.data) {
        const p = pres.data;
        projectName = p.name;
        if (p.submitter_email) addRecipient(p.submitter_email, 'Project requestor');
        if (Array.isArray(p.team_members)) {
          p.team_members.forEach(m => {
            if (m && m.email) addRecipient(m.email, 'Project stakeholder');
          });
        }
      }
    } catch (err) { /* non-fatal — still let them reschedule */ }
  }

  const recipientList = Array.from(recipients.entries()).map(([email, sources]) => ({
    email,
    labels: Array.from(sources)
  }));
  const hasRecipients = recipientList.length > 0;
  const safeTitle = (e.title || '').replace(/'/g, "&#39;").replace(/</g, '&lt;');
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const recipientsHtml = hasRecipients ? `
    <div class="form-group">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <label style="margin:0;font-weight:600">Notify these recipients with the new time (fresh .ics)</label>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('.m-rs-recipient').forEach(c => c.checked = true)">All</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('.m-rs-recipient').forEach(c => c.checked = false)">None</button>
        </div>
      </div>
      <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:6px 12px;max-height:220px;overflow-y:auto">
        ${recipientList.map((r, i) => `
          <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;font-size:13px;cursor:pointer;border-bottom:${i === recipientList.length - 1 ? 'none' : '1px solid var(--border)'}">
            <span style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
              <input type="checkbox" class="m-rs-recipient" data-email="${esc(r.email)}" checked style="width:auto;margin:0;flex-shrink:0">
              <span style="color:var(--text-primary);overflow:hidden;text-overflow:ellipsis">${esc(r.email)}</span>
            </span>
            <span style="display:flex;gap:4px;flex-wrap:wrap;flex-shrink:0">
              ${r.labels.map(l => `<span style="background:${l === 'Event attendee' ? '#dbeafe' : '#e0e7ff'};color:${l === 'Event attendee' ? '#1e40af' : '#3730a3'};padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap">${esc(l)}</span>`).join('')}
            </span>
          </label>
        `).join('')}
      </div>
      <small style="color:var(--text-muted);display:block;margin-top:6px">
        Untick anyone you do NOT want to email. ${projectName ? `Stakeholders pulled from <strong>${esc(projectName)}</strong>.` : ''}
      </small>
    </div>
  ` : '<p style="font-size:13px;color:var(--text-muted);margin:0 0 8px 0">No recipients — this event has no attendees and is not linked to a project.</p>';

  openModal('Reschedule Meeting', `
    <p style="margin:0 0 12px 0;font-size:13px;color:var(--text-muted)">
      <strong>${safeTitle}</strong><br>
      Current time: ${fmtDateTime(e.start_time)}${e.end_time ? ' &mdash; ' + fmtDateTime(e.end_time) : ''}
    </p>
    <div class="form-group">
      <label>New Start *</label>
      <input type="datetime-local" id="m-rs-start" value="${isoToLocalInput(e.start_time)}">
    </div>
    <div class="form-group">
      <label>New End</label>
      <input type="datetime-local" id="m-rs-end" value="${isoToLocalInput(e.end_time)}">
    </div>
    <div class="form-group">
      <label>Reason / note (optional)</label>
      <textarea id="m-rs-reason" rows="2" placeholder="e.g. conflict with another meeting"></textarea>
    </div>
    ${recipientsHtml}
  `, async () => {
    const startVal = document.getElementById('m-rs-start').value;
    const endVal = document.getElementById('m-rs-end').value;
    const reason = document.getElementById('m-rs-reason').value.trim();
    if (!startVal) { alert('New Start is required'); return; }
    const startIso = localInputToIso(startVal);
    const endIso = endVal ? localInputToIso(endVal) : null;
    if (endIso && new Date(endIso) <= new Date(startIso)) {
      alert('End time must be after Start time'); return;
    }

    const oldDescription = e.description || '';
    const stamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const noteLine = `Rescheduled on ${stamp}. Previous time: ${fmtDateTime(e.start_time)}.${reason ? ' Reason: ' + reason : ''}`;
    const newDescription = oldDescription ? `${oldDescription}\n\n${noteLine}` : noteLine;

    const updateBody = { start_time: startIso, description: newDescription };
    if (endIso) updateBody.end_time = endIso;

    const upd = await api(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(updateBody) });
    if (!upd.success) { alert('Reschedule failed: ' + (upd.error || 'unknown')); return; }

    let notifyResult = null;
    let skippedCount = 0;
    if (hasRecipients) {
      const checked = Array.from(document.querySelectorAll('.m-rs-recipient'))
        .filter(c => c.checked)
        .map(c => c.dataset.email);
      skippedCount = recipientList.length - checked.length;
      if (checked.length) {
        const customMsg = `This meeting has been rescheduled.\n\nNew time: ${fmtDateTime(startIso)}${endIso ? ' – ' + fmtDateTime(endIso) : ''}.${reason ? '\n\nReason: ' + reason : ''}\n\nA fresh calendar invite (.ics) is attached. If this time does not work, please reply with two or three alternatives.`;
        const inv = await api(`/calendar/${id}/invite`, {
          method: 'POST',
          body: JSON.stringify({ emails: checked.join(','), message: customMsg })
        });
        notifyResult = inv.invite_result || null;
      }
    }

    closeModal();
    let msg = 'Meeting rescheduled.';
    if (notifyResult) {
      if (notifyResult.sent && notifyResult.sent.length) msg += ` Notified ${notifyResult.sent.length} ${notifyResult.sent.length === 1 ? 'person' : 'people'}.`;
      if (notifyResult.failed && notifyResult.failed.length) msg += ` Failed: ${notifyResult.failed.map(f => f.email).join(', ')}.`;
    } else if (hasRecipients && skippedCount === recipientList.length) {
      msg += ' No notifications sent (everyone was unticked).';
    }
    if (skippedCount > 0 && notifyResult) msg += ` Skipped ${skippedCount}.`;
    if (typeof showCopyToast === 'function') showCopyToast(msg);
    else alert(msg);
    showEventDetail(id);
  });
}
window.openRescheduleModal = openRescheduleModal;

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
      <div class="form-group"><label>Start *</label><input type="datetime-local" id="m-estart" value="${isoToLocalInput(e.start_time)}"></div>
      <div class="form-group"><label>End</label><input type="datetime-local" id="m-eend" value="${isoToLocalInput(e.end_time)}"></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="m-edesc">${e.description || ''}</textarea></div>
  `, async () => {
    const data = {
      title: document.getElementById('m-etitle').value.trim(),
      event_type: document.getElementById('m-etype').value,
      location: document.getElementById('m-elocation').value.trim(),
      start_time: localInputToIso(document.getElementById('m-estart').value),
      end_time: localInputToIso(document.getElementById('m-eend').value),
      description: document.getElementById('m-edesc').value.trim()
    };
    if (!data.title) { alert('Title is required'); return; }
    if (!data.start_time) { alert('Start time is required'); return; }
    await api(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    closeModal();
    showEventDetail(id);
  });
}

async function deleteEvent(id, hasSeries) {
  let scope = '';
  if (hasSeries) {
    const choice = prompt(
      'This event is part of a recurring series.\n\n' +
      'Type "1" to delete ONLY this occurrence,\n' +
      'or  "2" to delete the ENTIRE series,\n' +
      'or leave blank to cancel.', '1');
    if (choice === null || choice.trim() === '') return;
    if (choice.trim() === '2') scope = '?scope=series';
    else if (choice.trim() !== '1') return;
  } else {
    if (!confirm('Delete this event permanently?')) return;
  }
  try {
    const r = await api(`/calendar/${id}${scope}`, { method: 'DELETE' });
    if (r && r.success === false) { alert('Delete failed: ' + (r.error || 'unknown')); return; }
    navigateTo('calendar');
  } catch (err) {
    alert('Delete failed: ' + (err && err.message ? err.message : err));
  }
}

// =====================================================
// TASKS
// =====================================================
let _allTasksCache = [];

async function renderTasks(container) {
  const res = await api('/tasks');
  if (!res.success) return;
  _allTasksCache = res.data;

  // Build the project dropdown options from projects that actually have tasks
  // (so the filter list stays relevant — no empty options for projects with
  // zero tasks). Sorted alphabetically.
  const projectMap = new Map(); // id -> name
  (_allTasksCache || []).forEach(t => {
    if (t.project && t.project.id) projectMap.set(t.project.id, t.project.name || ('Project #' + t.project.id));
  });
  const projectOptions = Array.from(projectMap.entries())
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`)
    .join('');
  const noProjectCount = (_allTasksCache || []).filter(t => !t.project_id).length;

  // Initial owner-options build — defaults to all tasks. The dropdown is
  // rebuilt by onTaskProjectChange() whenever the Project filter changes,
  // so the owner list cascades: pick a project → only owners appearing in
  // that project's tasks show.
  const initialOwnerData = computeOwnerOptions(_allTasksCache || []);
  const ownerOptions = initialOwnerData.html;
  const noOwnerCount = initialOwnerData.noOwnerCount;

  container.innerHTML = `
    <div style="margin-bottom:12px">
      <button class="btn btn-ghost btn-sm" onclick="navigateTo('overview')">&#8592; Back to Home</button>
    </div>
    <div class="section-header">
      <div class="filter-bar" style="flex-wrap:wrap;gap:8px">
        <select id="task-project-filter" onchange="onTaskProjectChange()">
          <option value="">All Projects</option>
          ${noProjectCount > 0 ? `<option value="__none__">(No project · ${noProjectCount})</option>` : ''}
          ${projectOptions}
        </select>
        <select id="task-due-filter" onchange="filterTasks()">
          <option value="">All Due Dates</option>
          <option value="overdue_today">Overdue + Due Today</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due Today</option>
          <option value="this_week">Next 7 Days</option>
          <option value="this_month">Next 30 Days</option>
          <option value="none">No Due Date</option>
        </select>
        <select id="task-owner-filter" onchange="filterTasks()">
          <option value="">All Suggested Owners</option>
          ${noOwnerCount > 0 ? `<option value="__none__">(No suggested · ${noOwnerCount})</option>` : ''}
          ${ownerOptions}
        </select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openTaskModal()">+ Add To-Do</button>
    </div>
    <div id="tasks-list"></div>
  `;

  // Apply a preset from navigateTo('tasks', {due:'...'}) — used by the home
  // KPI card "To-Do Items Due Today" so the list opens already scoped to
  // Overdue + Due Today instead of dumping the full backlog.
  if (_pendingViewOpts && _pendingViewOpts.due) {
    const dueEl = document.getElementById('task-due-filter');
    if (dueEl) dueEl.value = _pendingViewOpts.due;
    _pendingViewOpts = null;
  }

  filterTasks();
}

// Given a task subset, build the <option> HTML for the Suggested Owner
// dropdown. Splits combo names ("Manuel and Eduardo") into individual
// names so picking "Manuel" via substring match later catches all
// variants. Returns { html, noOwnerCount } so the caller can render
// the "(No suggested · N)" option too.
function computeOwnerOptions(tasks) {
  const ownerCounts = new Map();
  let noOwnerCount = 0;
  (tasks || []).forEach(t => {
    const raw = extractSuggestedOwner(t.description);
    if (!raw) { if (!t.assignee) noOwnerCount++; return; }
    const parts = raw
      .replace(/\(.*?\)/g, '')
      .split(/\s+(?:and|or|with|y|o|,|&|\/)\s+|,/i)
      .map(s => s.trim())
      .filter(s => s.length >= 2);
    parts.forEach(p => {
      const k = p.toLowerCase();
      const existing = ownerCounts.get(k);
      if (existing) existing.count += 1;
      else ownerCounts.set(k, { display: p, count: 1 });
    });
  });
  const html = Array.from(ownerCounts.values())
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
    .map(o => `<option value="${escapeHtml(o.display.toLowerCase())}">${escapeHtml(o.display)} (${o.count})</option>`)
    .join('');
  return { html, noOwnerCount };
}

// When the Project filter changes, rebuild the Suggested Owner dropdown
// so it only lists owners that appear in the tasks of the selected
// project. Preserves the user's current owner selection if it still
// exists in the new options, otherwise resets to "All Suggested Owners".
function onTaskProjectChange() {
  const projectEl = document.getElementById('task-project-filter');
  const ownerEl = document.getElementById('task-owner-filter');
  if (!projectEl || !ownerEl) { filterTasks(); return; }
  const projectVal = projectEl.value;
  // Compute the task subset that matches just the project filter
  let scoped = _allTasksCache || [];
  if (projectVal === '__none__') {
    scoped = scoped.filter(t => !t.project_id);
  } else if (projectVal) {
    const pid = parseInt(projectVal, 10);
    scoped = scoped.filter(t => t.project_id === pid);
  }
  const previousOwner = ownerEl.value;
  const { html, noOwnerCount } = computeOwnerOptions(scoped);
  ownerEl.innerHTML = `
    <option value="">All Suggested Owners</option>
    ${noOwnerCount > 0 ? `<option value="__none__">(No suggested · ${noOwnerCount})</option>` : ''}
    ${html}`;
  // Restore the previous selection if still valid; otherwise default to "all"
  const stillValid = Array.from(ownerEl.options).some(o => o.value === previousOwner);
  ownerEl.value = stillValid ? previousOwner : '';
  filterTasks();
}
window.onTaskProjectChange = onTaskProjectChange;

// Single source of truth: reads every active filter from the DOM and
// returns the resulting task subset. Used by filterTasks (renders the
// list), printTaskGroup (PDF), and copyTaskGroupText (clipboard) so all
// three views stay in sync.
function applyActiveTaskFilters(allTasks) {
  const statusEl = document.getElementById('task-status-filter');
  const typeEl = document.getElementById('task-type-filter');
  const projectEl = document.getElementById('task-project-filter');
  const dueEl = document.getElementById('task-due-filter');
  const ownerEl = document.getElementById('task-owner-filter');
  const statusVal = statusEl ? statusEl.value : 'pending';
  const typeVal = typeEl ? typeEl.value : '';
  const projectVal = projectEl ? projectEl.value : '';
  const dueVal = dueEl ? dueEl.value : '';
  const ownerVal = ownerEl ? ownerEl.value : '';
  let filtered = allTasks || [];
  if (statusVal) filtered = filtered.filter(t => t.status === statusVal);
  if (typeVal) filtered = filtered.filter(t => t.task_type === typeVal);
  if (projectVal === '__none__') {
    filtered = filtered.filter(t => !t.project_id);
  } else if (projectVal) {
    const pid = parseInt(projectVal, 10);
    filtered = filtered.filter(t => t.project_id === pid);
  }
  if (ownerVal === '__none__') {
    filtered = filtered.filter(t => !t.assignee && !extractSuggestedOwner(t.description));
  } else if (ownerVal) {
    // Substring match (case-insensitive) so picking "Manuel" catches
    // "Manuel", "Manuel and Eduardo", "Manuel (advisor)", etc.
    const needle = ownerVal.toLowerCase();
    filtered = filtered.filter(t => {
      const raw = extractSuggestedOwner(t.description);
      return raw && raw.toLowerCase().includes(needle);
    });
  }
  if (dueVal) {
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);
    const in7 = new Date(startOfToday); in7.setDate(in7.getDate() + 7);
    const in30 = new Date(startOfToday); in30.setDate(in30.getDate() + 30);
    filtered = filtered.filter(t => {
      const d = t.due_date ? new Date(t.due_date) : null;
      switch (dueVal) {
        case 'overdue':       return d && d < startOfToday && t.status === 'pending';
        case 'today':         return d && d >= startOfToday && d < endOfToday;
        case 'overdue_today': return d && ((d < startOfToday && t.status === 'pending') || (d >= startOfToday && d < endOfToday));
        case 'this_week':     return d && d >= startOfToday && d < in7;
        case 'this_month':    return d && d >= startOfToday && d < in30;
        case 'none':          return !d;
        default:              return true;
      }
    });
  }
  return filtered;
}

function filterTasks() {
  renderTasksList(applyActiveTaskFilters(_allTasksCache));
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

  // Sort each group by due date ascending (no due date last). Within the
  // same due date, fall back to priority weight so urgent floats above low.
  const prioWeight = { urgent: 0, high: 1, medium: 2, low: 3 };
  Object.values(groups).forEach(items => {
    items.sort((a, b) => {
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return (prioWeight[a.priority] ?? 9) - (prioWeight[b.priority] ?? 9);
    });
  });

  let html = '';
  sortedNames.forEach(name => {
    const items = groups[name];
    const groupId = 'tg-' + name.replace(/\s+/g, '-').toLowerCase();
    const safeName = name.replace(/'/g, "\\'");
    html += `
      <div class="task-group">
        <div class="task-group-header collapsed" onclick="toggleTaskGroup('${groupId}')">
          <span class="task-group-chevron" id="chev-${groupId}">&#9654;</span>
          <span class="task-group-name">&#128100; ${name}</span>
          <span class="task-group-badge">${items.length}</span>
          <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="event.stopPropagation();copyTaskGroupText('${safeName}')" title="Copy this list as plain text (paste into email or SMS)">Copy Text</button>
          <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="event.stopPropagation();printTaskGroup('${safeName}')" title="Print this list as PDF">Print PDF</button>
        </div>
        <div class="task-group-body" id="${groupId}" style="display:none">
          <table class="data-table"><thead><tr><th>Task</th><th>Project</th><th>Due</th></tr></thead><tbody>` +
          items.map(t => {
            const isOverdue = t.due_date && new Date(t.due_date) < now && t.status === 'pending';
            const suggested = !t.assignee ? extractSuggestedOwner(t.description) : '';
            const suggestedChip = suggested
              ? `<br><span style="display:inline-block;margin-top:3px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:11px"><span style="font-style:italic">Suggested:</span> <strong>${escapeHtml(suggested)}</strong></span>`
              : '';
            const projectId = t.project_id || (t.project && t.project.id) || null;
            const waIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
            const smsIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM7 9h10v2H7V9zm6 5H7v-2h6v2zm4-6H7V6h10v2z"/></svg>';
            const actionRow = `
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                ${t.status === 'pending'
                  ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();completeTask(${t.id})" style="padding:5px 12px;font-size:12px">&#10003; Done</button>`
                  : '<span class="status-badge status-completed">completed</span>'}
                <button class="btn btn-sm" style="background:#25D366;color:#fff;border-color:#25D366;padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:5px" onclick="event.stopPropagation();openTaskWhatsAppModal(${t.id},${projectId || 'null'})" title="Send via WhatsApp">${waIcon}<span>WhatsApp</span></button>
                <button class="btn btn-sm" style="background:#3b82f6;color:#fff;border-color:#3b82f6;padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:5px" onclick="event.stopPropagation();openTaskSms(${t.id})" title="Send via Messages (SMS)">${smsIcon}<span>Messages</span></button>
              </div>`;
            return `<tr class="clickable" onclick="showTaskDetail(${t.id})">
              <td><strong>${t.title}</strong>${t.description ? '<br><span style="font-size:12px;color:var(--text-muted)">'+t.description.substring(0,60)+'</span>' : ''}${suggestedChip}${actionRow}</td>
              <td>${t.project?.name || '-'}</td>
              <td><span style="color:${isOverdue ? 'var(--danger)' : 'var(--text-secondary)'}">${t.due_date ? fmtDate(t.due_date) : '-'}${isOverdue ? ' (overdue)' : ''}</span></td>
            </tr>`;
          }).join('') +
          `</tbody></table>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

// Pulls a "Suggested owner: X" or "Owner: X" line out of a task or milestone
// description text. AI-generated rows from the plan generator + action-item
// extractor stash the owner role/name there rather than in a first-class field.
// Returns the trimmed value, or '' if not found.
function extractSuggestedOwner(description) {
  if (!description) return '';
  const m = String(description).match(/(?:^|\n)\s*(?:Suggested owner|Owner)\s*:\s*(.+?)(?:\n|$)/i);
  return m ? m[1].trim() : '';
}
window.extractSuggestedOwner = extractSuggestedOwner;

// =====================================================
// WHATSAPP — send a task to project stakeholders
// =====================================================
// wa.me requires digits only (with country code, no +/spaces/dashes)
function normalizeWaPhone(raw) {
  return String(raw || '').replace(/[^\d]/g, '');
}

function buildTaskWhatsAppMessage(task, project, lang) {
  const title = task.title || '';
  const desc = (task.description || '').replace(/(?:^|\s)\s*(?:Suggested owner|Owner)\s*:\s*[^\n.]+\.?/i, '').trim();
  const suggested = extractSuggestedOwner(task.description);
  const dueRaw = task.due_date ? new Date(task.due_date) : null;
  const localeFmt = lang === 'es' ? 'es-ES' : 'en-US';
  const dueStr = dueRaw ? dueRaw.toLocaleDateString(localeFmt, { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const priorityMap = lang === 'es'
    ? { urgent: 'urgente', high: 'alta', medium: 'media', low: 'baja' }
    : { urgent: 'urgent', high: 'high', medium: 'medium', low: 'low' };
  const prio = priorityMap[task.priority] || task.priority || '';

  if (lang === 'es') {
    const lines = [];
    lines.push(`*Tarea del proyecto: ${project ? project.name : ''}*`);
    lines.push('');
    lines.push(`📌 ${title}`);
    if (dueStr) lines.push(`📅 Fecha límite: *${dueStr}*`);
    if (prio) lines.push(`⚡ Prioridad: ${prio}`);
    if (suggested) lines.push(`👤 Sugerido para: ${suggested}`);
    if (desc) { lines.push(''); lines.push(desc); }
    lines.push('');
    lines.push('— Manuel Stagg / Digit2AI');
    return lines.join('\n');
  }
  // English default
  const lines = [];
  lines.push(`*Task from project: ${project ? project.name : ''}*`);
  lines.push('');
  lines.push(`📌 ${title}`);
  if (dueStr) lines.push(`📅 Due: *${dueStr}*`);
  if (prio) lines.push(`⚡ Priority: ${prio}`);
  if (suggested) lines.push(`👤 Suggested owner: ${suggested}`);
  if (desc) { lines.push(''); lines.push(desc); }
  lines.push('');
  lines.push('— Manuel Stagg / Digit2AI');
  return lines.join('\n');
}

async function openTaskWhatsAppModal(taskId, projectId) {
  // Load fresh task always; load project only when one is linked. Without a
  // project the recipient list starts empty and the user types a phone manually.
  const taskRes = await api(`/tasks/${taskId}`);
  if (!taskRes.success || !taskRes.data) { alert('Could not load task'); return; }
  const task = taskRes.data;
  let project = null;
  if (projectId) {
    const projRes = await api(`/projects/${projectId}`);
    if (projRes.success && projRes.data) project = projRes.data;
  }
  if (!project) {
    project = { id: null, name: task.project?.name || '(no linked project)', submitter_email: null, submitter_phone: null, team_members: [] };
  }

  // Build recipient list: submitter (with submitter_phone) + team_members[*]
  const norm = (s) => String(s || '').trim().toLowerCase();
  const seen = new Map(); // email -> { email, name, phone, role }
  if (project.submitter_email) {
    seen.set(norm(project.submitter_email), {
      email: norm(project.submitter_email),
      name: project.submitter_name || '',
      phone: project.submitter_phone || '',
      role: 'requestor'
    });
  }
  if (Array.isArray(project.team_members)) {
    project.team_members.forEach(m => {
      if (!m || !m.email) return;
      const e = norm(m.email);
      if (seen.has(e)) {
        // Merge phone in if team_member has one
        if (m.phone && !seen.get(e).phone) seen.get(e).phone = m.phone;
      } else {
        seen.set(e, {
          email: e,
          name: m.name || '',
          phone: m.phone || '',
          role: m.role || 'stakeholder'
        });
      }
    });
  }
  const recipients = Array.from(seen.values());

  let lang = 'es'; // default Spanish (most active projects are CO/MX)
  let messageDraft = buildTaskWhatsAppMessage(task, project, lang);

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const rowsHtml = recipients.length
    ? recipients.map((r, i) => `
      <div style="display:grid;grid-template-columns:24px 1fr 200px;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px">
        <input type="checkbox" class="m-wa-recip" data-idx="${i}" ${r.phone ? 'checked' : ''} style="width:auto;margin:0">
        <div style="min-width:0">
          <div style="color:var(--text-primary)${r.name ? ';font-weight:600' : ''}">${esc(r.name || r.email)}</div>
          <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis">${esc(r.email)} · <span style="background:#e0e7ff;color:#3730a3;padding:1px 6px;border-radius:8px;font-size:10px">${esc(r.role)}</span></div>
        </div>
        <input type="tel" class="m-wa-phone" data-idx="${i}" value="${esc(r.phone)}" placeholder="+57 312 783 0181" style="font-size:12px;padding:6px 8px">
      </div>
    `).join('')
    : '<p style="font-size:13px;color:var(--text-muted);margin:8px 0">No stakeholders on this project. Add some on the project detail page first.</p>';

  openModal('Send Task via WhatsApp', `
    <p style="margin:0 0 8px 0;font-size:13px;color:var(--text-muted)">
      <strong>Task:</strong> ${esc(task.title)}<br>
      <strong>Project:</strong> ${esc(project.name)}
    </p>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <label style="margin:0;font-weight:600">Recipients</label>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('.m-wa-recip').forEach(c => c.checked = true)">All</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('.m-wa-recip').forEach(c => c.checked = false)">None</button>
        </div>
      </div>
      <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:4px 12px;max-height:240px;overflow-y:auto">
        <div style="display:grid;grid-template-columns:24px 1fr 200px;gap:8px;font-size:10px;color:var(--text-muted);letter-spacing:0.06em;text-transform:uppercase;padding:6px 0 4px 0;border-bottom:1px solid var(--border)">
          <div></div><div>Stakeholder</div><div>WhatsApp phone (incl. country code)</div>
        </div>
        ${rowsHtml}
      </div>
      <small style="color:var(--text-muted);display:block;margin-top:6px">
        Enter phones for recipients without one. Include country code (e.g. +57 for Colombia, +1 for US).
      </small>
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <label style="margin:0;font-weight:600">Message</label>
        <div style="display:inline-flex;border:1px solid var(--border);border-radius:6px;overflow:hidden">
          <button type="button" id="m-wa-lang-es" class="btn btn-sm btn-primary" style="border-radius:0;border:none;padding:4px 12px" onclick="switchWaLang('es', ${task.id}, ${project.id})">ES</button>
          <button type="button" id="m-wa-lang-en" class="btn btn-sm btn-ghost" style="border-radius:0;border:none;border-left:1px solid var(--border);padding:4px 12px" onclick="switchWaLang('en', ${task.id}, ${project.id})">EN</button>
        </div>
      </div>
      <textarea id="m-wa-msg" rows="10" style="width:100%;font-size:13px;font-family:inherit;line-height:1.5">${esc(messageDraft)}</textarea>
      <small style="color:var(--text-muted);display:block;margin-top:6px">WhatsApp supports *bold*, _italic_, ~strikethrough~, and \`monospace\`.</small>
    </div>
    <div class="form-group" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px">
      <input type="checkbox" id="m-wa-save-phones" checked style="width:auto;margin:0">
      <label for="m-wa-save-phones" style="margin:0;cursor:pointer;font-size:13px">
        <strong>Save phone numbers back to project stakeholders</strong>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">So you do not have to retype them next time.</div>
      </label>
    </div>
  `, async () => {
    const messageText = document.getElementById('m-wa-msg').value || '';
    if (!messageText.trim()) { alert('Message is empty'); return; }
    // Collect the checked rows with their (possibly edited) phones
    const checks = Array.from(document.querySelectorAll('.m-wa-recip'));
    const phones = Array.from(document.querySelectorAll('.m-wa-phone'));
    const targets = [];
    const updatedRecipients = recipients.map(r => ({ ...r })); // clone
    checks.forEach(c => {
      const idx = parseInt(c.dataset.idx, 10);
      const phoneInput = phones.find(p => parseInt(p.dataset.idx, 10) === idx);
      const rawPhone = phoneInput ? phoneInput.value.trim() : '';
      if (rawPhone) updatedRecipients[idx].phone = rawPhone;
      if (!c.checked) return;
      const digits = normalizeWaPhone(rawPhone);
      if (!digits || digits.length < 7) {
        return; // silently skip invalid; reported below
      }
      targets.push({ name: updatedRecipients[idx].name || updatedRecipients[idx].email, phone: digits });
    });

    if (!targets.length) {
      alert('No recipients selected with a valid phone number.\n\nTick at least one box and make sure the phone field includes a country code (digits only or with +).');
      return;
    }

    // Open one WhatsApp tab per recipient (encoded message + phone)
    const encoded = encodeURIComponent(messageText);
    let opened = 0;
    targets.forEach((t, i) => {
      const url = `https://wa.me/${t.phone}?text=${encoded}`;
      // Stagger window.open by a hair so popup blockers do not nuke all-but-one
      setTimeout(() => {
        const w = window.open(url, '_blank', 'noopener');
        if (w) opened++;
      }, i * 80);
    });

    // Persist updated phones back to team_members if checkbox is on
    const savePhones = document.getElementById('m-wa-save-phones')?.checked;
    if (savePhones) {
      const existingTeam = Array.isArray(project.team_members) ? project.team_members : [];
      // Build a new team_members array, merging in any phones the user typed
      const teamByEmail = new Map();
      existingTeam.forEach(m => {
        if (m && m.email) teamByEmail.set(String(m.email).trim().toLowerCase(), { ...m });
      });
      updatedRecipients.forEach(r => {
        if (r.role === 'requestor') return; // submitter_phone lives on project, not team_members
        const key = r.email;
        if (!r.phone) return;
        if (teamByEmail.has(key)) {
          const existing = teamByEmail.get(key);
          if (existing.phone !== r.phone) {
            existing.phone = r.phone;
            teamByEmail.set(key, existing);
          }
        } else {
          teamByEmail.set(key, { email: key, role: r.role || 'stakeholder', phone: r.phone });
        }
      });
      const newTeam = Array.from(teamByEmail.values());
      // Also update submitter_phone if the requestor row's phone changed
      const requestorRow = updatedRecipients.find(r => r.role === 'requestor');
      const projectPatch = { team_members: newTeam };
      if (requestorRow && requestorRow.phone && requestorRow.phone !== (project.submitter_phone || '')) {
        projectPatch.submitter_phone = requestorRow.phone;
      }
      try {
        await api(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(projectPatch) });
      } catch (err) {
        console.warn('Could not save stakeholder phones:', err.message);
      }
    }

    closeModal();
    const msg = `Opened ${targets.length} WhatsApp tab${targets.length === 1 ? '' : 's'}. Click Send in each WhatsApp window to deliver.`;
    if (typeof showCopyToast === 'function') showCopyToast(msg);
    else alert(msg);
  });
}
window.openTaskWhatsAppModal = openTaskWhatsAppModal;

// Open the native SMS/Messages app (mobile) with a pre-filled task body.
// No recipient picker — user chooses the contact inside their Messages app
// after the compose sheet opens.
function openTaskSms(taskId) {
  const task = (_allTasksCache || []).find(t => t.id === taskId);
  if (!task) { alert('Task not loaded'); return; }
  const descRaw = task.description || '';
  const desc = descRaw.replace(/(?:^|\s)\s*(?:Suggested owner|Owner)\s*:\s*[^\n.]+\.?/i, '').replace(/\s+/g, ' ').trim();
  const due = task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
  const lines = [];
  lines.push(task.title || 'Task');
  if (due) lines.push(`Due: ${due}`);
  if (task.project && task.project.name) lines.push(`Project: ${task.project.name}`);
  if (desc) { lines.push(''); lines.push(desc); }
  lines.push('');
  lines.push('— Manuel Stagg / Digit2AI');
  const body = encodeURIComponent(lines.join('\n'));
  // sms:?body= works on iOS (>= 8) and modern Android. Some Android variants
  // prefer "sms:&body=" — we use the question-mark form which is the spec.
  window.location.href = `sms:?body=${body}`;
}
window.openTaskSms = openTaskSms;

function switchWaLang(lang, taskId, projectId) {
  // Re-fetch + rebuild draft so toggling EN/ES is correct even after edits
  api(`/tasks/${taskId}`).then(taskRes => {
    api(`/projects/${projectId}`).then(projRes => {
      if (!taskRes.success || !projRes.success) return;
      const newDraft = buildTaskWhatsAppMessage(taskRes.data, projRes.data, lang);
      const ta = document.getElementById('m-wa-msg');
      if (ta) ta.value = newDraft;
      const esBtn = document.getElementById('m-wa-lang-es');
      const enBtn = document.getElementById('m-wa-lang-en');
      if (esBtn && enBtn) {
        if (lang === 'es') {
          esBtn.classList.remove('btn-ghost'); esBtn.classList.add('btn-primary');
          enBtn.classList.remove('btn-primary'); enBtn.classList.add('btn-ghost');
        } else {
          enBtn.classList.remove('btn-ghost'); enBtn.classList.add('btn-primary');
          esBtn.classList.remove('btn-primary'); esBtn.classList.add('btn-ghost');
        }
      }
    });
  });
}
window.switchWaLang = switchWaLang;

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

// Home page shortcut — open the To-Do List view (filtered to outstanding
// "Still To Do" tasks, which is already the default) and auto-expand the
// Unassigned group so the user sees what needs attention immediately.
function openOutstandingTasks() {
  navigateTo('tasks');
  const tryExpand = (attempts = 0) => {
    const body = document.getElementById('tg-unassigned');
    if (body) {
      if (body.style.display === 'none') toggleTaskGroup('tg-unassigned');
      body.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (attempts < 25) setTimeout(() => tryExpand(attempts + 1), 100);
  };
  setTimeout(tryExpand, 150);
}
window.openOutstandingTasks = openOutstandingTasks;

// Open a plain-text print view for a single assignee group and trigger the
// browser print dialog so the user can pick "Save as PDF" as destination.
// Mirrors every active filter (Project + Due Date + any others) via
// applyActiveTaskFilters, so what you print matches what you see.
function printTaskGroup(assigneeName) {
  const statusEl = document.getElementById('task-status-filter');
  const dueEl = document.getElementById('task-due-filter');
  const statusVal = statusEl ? statusEl.value : 'pending';
  const dueVal = dueEl ? dueEl.value : '';

  let tasks = applyActiveTaskFilters(_allTasksCache).filter(t => {
    const grp = t.assignee ? `${t.assignee.first_name} ${t.assignee.last_name || ''}`.trim() : 'Unassigned';
    return grp === assigneeName;
  });

  // Sort by due date (no date last), then priority weight
  const prioWeight = { urgent: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => {
    const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return (prioWeight[a.priority] ?? 9) - (prioWeight[b.priority] ?? 9);
  });

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const now = new Date();
  const generated = now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  const dueLabel = { overdue: 'Overdue', today: 'Due Today', overdue_today: 'Overdue + Due Today', this_week: 'Next 7 Days', this_month: 'Next 30 Days', none: 'No Due Date' }[dueVal];
  const statusLabel = statusVal === 'completed' ? 'Completed' : statusVal === 'pending' ? 'Outstanding' : 'All';
  const headerLabel = dueLabel ? `${statusLabel} · ${dueLabel}` : statusLabel;
  const title = `To-Do List — ${assigneeName} (${headerLabel})`;

  const rows = tasks.map((t, i) => {
    const overdue = t.due_date && new Date(t.due_date) < now && t.status === 'pending';
    const due = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    const proj = t.project?.name || '';
    const descRaw = t.description ? t.description.replace(/\s+/g, ' ').trim() : '';
    const suggested = !t.assignee ? extractSuggestedOwner(t.description) : '';
    const ownerStr = t.assignee
      ? ((t.assignee.first_name + ' ' + (t.assignee.last_name || '')).trim())
      : (suggested ? 'Suggested: ' + suggested : '');
    // Strip the "Suggested owner:" line from the description preview to avoid duplication
    const desc = descRaw.replace(/(?:^|\s)\s*(?:Suggested owner|Owner)\s*:\s*[^\n.]+\.?/i, '').trim();
    return `<div class="row">
  <div class="num">${i + 1}.</div>
  <div class="body">
    <div class="line1"><span class="ttl">${esc(t.title)}</span> <span class="meta">[${esc(t.task_type || 'task')} · ${esc(t.priority || 'medium')}]</span></div>
    <div class="line2">Due: <strong${overdue ? ' class="overdue"' : ''}>${esc(due)}${overdue ? ' (OVERDUE)' : ''}</strong>${ownerStr ? '  ·  Owner: ' + esc(ownerStr) : ''}${proj ? '  ·  Project: ' + esc(proj) : ''}  ·  Status: ${esc(t.status)}</div>
    ${desc ? `<div class="line3">${esc(desc)}</div>` : ''}
  </div>
</div>`;
  }).join('');

  const body = tasks.length === 0
    ? '<p class="empty">No tasks in this list.</p>'
    : rows;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { margin: 0.6in; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color: #000; font-size: 12pt; line-height: 1.4; margin: 0; padding: 0.2in; }
  h1 { font-size: 18pt; margin: 0 0 4px 0; }
  .gen { font-size: 10pt; color: #444; margin: 0 0 18px 0; }
  hr { border: none; border-top: 1px solid #999; margin: 12px 0 18px 0; }
  .row { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px dotted #bbb; page-break-inside: avoid; }
  .num { min-width: 26px; font-weight: 600; }
  .body { flex: 1; }
  .ttl { font-weight: 700; }
  .meta { color: #555; font-size: 11pt; }
  .line2 { font-size: 10.5pt; margin-top: 3px; color: #333; }
  .line3 { font-size: 10.5pt; margin-top: 4px; color: #222; padding-left: 8px; border-left: 2px solid #ccc; }
  .overdue { color: #b91c1c; }
  .empty { color: #555; font-style: italic; }
  .footer { margin-top: 24px; font-size: 9pt; color: #777; text-align: right; }
  @media print { .noprint { display: none; } }
  .noprint { margin: 12px 0; }
  .noprint button { font: inherit; padding: 6px 14px; cursor: pointer; }
</style>
</head><body>
  <div class="noprint"><button onclick="window.print()">Print / Save as PDF</button> <button onclick="window.close()">Close</button></div>
  <h1>${esc(title)}</h1>
  <div class="gen">Generated: ${esc(generated)}  ·  ${tasks.length} item${tasks.length === 1 ? '' : 's'}</div>
  <hr>
  ${body}
  <div class="footer">Digit2AI Projects · ${esc(generated)}</div>
  <script>setTimeout(function(){ try { window.print(); } catch(e){} }, 300);<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) {
    alert('Pop-up blocked. Allow pop-ups for this site to print the list.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
window.printTaskGroup = printTaskGroup;

// Build the same filtered + sorted list as printTaskGroup, but emit plain
// text and copy it to the clipboard so the user can paste into email/SMS.
function copyTaskGroupText(assigneeName) {
  const statusEl = document.getElementById('task-status-filter');
  const dueEl = document.getElementById('task-due-filter');
  const statusVal = statusEl ? statusEl.value : 'pending';
  const dueVal = dueEl ? dueEl.value : '';

  let tasks = applyActiveTaskFilters(_allTasksCache).filter(t => {
    const grp = t.assignee ? `${t.assignee.first_name} ${t.assignee.last_name || ''}`.trim() : 'Unassigned';
    return grp === assigneeName;
  });

  const prioWeight = { urgent: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => {
    const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return (prioWeight[a.priority] ?? 9) - (prioWeight[b.priority] ?? 9);
  });

  const now = new Date();
  const generated = now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  const dueLabel = { overdue: 'Overdue', today: 'Due Today', overdue_today: 'Overdue + Due Today', this_week: 'Next 7 Days', this_month: 'Next 30 Days', none: 'No Due Date' }[dueVal];
  const statusLabel = statusVal === 'completed' ? 'Completed' : statusVal === 'pending' ? 'Outstanding' : 'All';
  const headerLabel = dueLabel ? `${statusLabel} · ${dueLabel}` : statusLabel;

  const lines = [];
  lines.push(`To-Do List — ${assigneeName} (${headerLabel})`);
  lines.push(`Generated: ${generated}  ·  ${tasks.length} item${tasks.length === 1 ? '' : 's'}`);
  lines.push('');
  if (tasks.length === 0) {
    lines.push('(No tasks in this list.)');
  } else {
    tasks.forEach((t, i) => {
      const overdue = t.due_date && new Date(t.due_date) < now && t.status === 'pending';
      const due = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'no due date';
      const suggested = !t.assignee ? extractSuggestedOwner(t.description) : '';
      const ownerStr = t.assignee
        ? ((t.assignee.first_name + ' ' + (t.assignee.last_name || '')).trim())
        : (suggested ? 'Suggested: ' + suggested : 'Unassigned');
      const parts = [];
      parts.push(`Owner: ${ownerStr}`);
      parts.push(`Due: ${due}${overdue ? ' (OVERDUE)' : ''}`);
      parts.push(`Priority: ${t.priority || 'medium'}`);
      parts.push(`Type: ${t.task_type || 'task'}`);
      if (t.project?.name) parts.push(`Project: ${t.project.name}`);
      parts.push(`Status: ${t.status}`);
      lines.push(`${i + 1}. ${t.title}`);
      lines.push(`   ${parts.join(' · ')}`);
      if (t.description) {
        // Strip the "Suggested owner:" line so it does not duplicate the Owner: in parts
        const clean = t.description.replace(/(?:^|\s)\s*(?:Suggested owner|Owner)\s*:\s*[^\n.]+\.?/i, '').replace(/\s+/g, ' ').trim();
        lines.push(`   ${clean}`);
      }
      lines.push('');
    });
  }
  const text = lines.join('\n').replace(/\n+$/, '') + '\n';

  const finish = (ok) => {
    if (ok) {
      showCopyToast(`Copied ${tasks.length} item${tasks.length === 1 ? '' : 's'} — paste into email or SMS`);
    } else {
      // Last-resort fallback: show a textarea the user can manually copy from
      const win = window.open('', '_blank', 'width=720,height=600');
      if (win) {
        const escTxt = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        win.document.open();
        win.document.write(`<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;padding:18px"><p>Copy the text below (Cmd/Ctrl+A then Cmd/Ctrl+C):</p><textarea style="width:100%;height:80vh;font-family:Menlo,Consolas,monospace;font-size:12pt;padding:10px">${escTxt}</textarea></body></html>`);
        win.document.close();
      } else {
        alert('Could not copy to clipboard automatically. Allow pop-ups to see the text in a new window.');
      }
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => finish(true)).catch(() => finish(false));
  } else {
    // Older browsers: textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    finish(ok);
  }
}
window.copyTaskGroupText = copyTaskGroupText;

// Lightweight ephemeral toast for copy confirmation (no toast lib needed).
function showCopyToast(msg) {
  let toast = document.getElementById('copy-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'copy-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,0.25);z-index:99999;opacity:0;transition:opacity 0.18s ease';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(window._copyToastTimer);
  window._copyToastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2600);
}

async function completeTask(id) {
  await api(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
  // If we're on the To-Do List page, refresh data and re-apply the current
  // filter selections instead of re-rendering the whole view (which would
  // reset the Project / Due / Owner dropdowns the user had picked).
  if (document.getElementById('task-project-filter')) {
    const res = await api('/tasks');
    if (res && res.success) {
      _allTasksCache = res.data;
      filterTasks();
      return;
    }
  }
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

      ${renderAgentPanel(t)}

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

// =====================================================
// TASK AGENT PANEL (Task Agent Loop v1)
// =====================================================
function renderAgentPanel(t) {
  // Wrap so _showAgentProcessing can locate and swap the panel by id when
  // the user clicks Run Agent (lets us flip to a "running…" indicator
  // immediately while the inline /run endpoint blocks for 30-60s).
  return `<div id="agent-panel-${t.id}" data-agent-panel-task="${t.id}">${_renderAgentPanelInner(t)}</div>`;
}

// Inline "Switch agent" + language dropdowns rendered next to Re-run buttons.
// Lets the user swap the agent (e.g. Outreach Drafter -> Senior BA) and/or
// change the response language without going through the reclassify path.
function _renderAgentSwitchControls(t) {
  const sid = `switch-agent-sel-${t.id}`;
  const lid = `switch-agent-lang-${t.id}`;
  const lang = t.agent_language || 'auto';
  const opts = [
    { v: '', l: 'Switch agent…' },
    { v: 'senior_ba', l: 'Senior Business Analyst' },
    { v: 'research', l: 'Research Brief' },
    { v: 'draft', l: 'Outreach Drafter' }
  ].filter(o => o.v !== t.agent_type)
   .map(o => `<option value="${o.v}">${o.l}</option>`).join('');
  return `
    <select id="${sid}" style="padding:5px 10px;font-size:12px">${opts}</select>
    <select id="${lid}" title="Response language" style="padding:5px 10px;font-size:12px">
      <option value="auto"${lang === 'auto' ? ' selected' : ''}>Lang: Auto</option>
      <option value="en"${lang === 'en' ? ' selected' : ''}>English</option>
      <option value="es"${lang === 'es' ? ' selected' : ''}>Spanish</option>
    </select>
    <button class="btn btn-ghost btn-sm" onclick="switchAgent(${t.id}, '${sid}', '${lid}')">Switch &amp; Run</button>`;
}

function _renderAgentPanelInner(t) {
  const status = t.agent_status;
  const agentLabels = { research: 'Research Brief', draft: 'Outreach Drafter', triage: 'Inbox Triage', senior_ba: 'Senior Business Analyst' };
  const agentLabel = agentLabels[t.agent_type] || (t.agent_type || 'agent');

  // Language dropdown shared by every agent-trigger surface. 'auto' is the
  // default; user can force EN or ES. Selection is persisted on the task
  // by the route handler so re-runs remember it.
  const lang = t.agent_language || 'auto';
  const langSelect = (id) => `
    <select id="${id}" title="Response language" style="padding:5px 10px;font-size:12px">
      <option value="auto"${lang === 'auto' ? ' selected' : ''}>Lang: Auto</option>
      <option value="en"${lang === 'en' ? ' selected' : ''}>English</option>
      <option value="es"${lang === 'es' ? ' selected' : ''}>Spanish</option>
    </select>`;

  // No status yet — offer manual run dropdown
  if (!status) {
    return `
      <div class="card" style="margin-top:18px;padding:14px 16px;background:linear-gradient(135deg,rgba(124,92,255,0.06),rgba(34,211,238,0.06));border:1px solid rgba(124,92,255,0.25)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div>
            <strong style="background:linear-gradient(135deg,#a78bfa,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent">🤖 AI Agent</strong>
            <span style="color:var(--text-muted);font-size:12px;margin-left:8px">No agent run yet on this task</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <select id="manual-agent-type" style="padding:5px 10px;font-size:12px">
              <option value="">Auto-classify</option>
              <option value="research">Research Brief</option>
              <option value="draft">Outreach Drafter</option>
              <option value="senior_ba">Senior Business Analyst</option>
            </select>
            ${langSelect('manual-agent-lang')}
            <button class="btn btn-primary btn-sm" onclick="runAgentManual(${t.id})">Run Agent</button>
          </div>
        </div>
      </div>`;
  }

  // Skipped (classifier decided this task doesn't need an agent)
  if (status === 'skipped') {
    return `
      <div class="card" style="margin-top:18px;padding:12px 16px;background:#f8fafc;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="color:var(--text-muted);font-size:13px">🤖 No agent assigned — task does not match any agent's triggers.</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <select id="manual-agent-type" style="padding:5px 10px;font-size:12px">
              <option value="research">Research Brief</option>
              <option value="draft">Outreach Drafter</option>
              <option value="senior_ba">Senior Business Analyst</option>
            </select>
            ${langSelect('manual-agent-lang')}
            <button class="btn btn-ghost btn-sm" onclick="runAgentManual(${t.id})">Force Run</button>
          </div>
        </div>
      </div>`;
  }

  // Pending — queued for the worker
  if (status === 'pending') {
    return `
      <div class="card" style="margin-top:18px;padding:14px 16px;border:1px solid #f59e0b;background:rgba(245,158,11,0.05)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="color:#92400e"><strong>🤖 ${agentLabel}</strong> — queued. Will run within 2 minutes.</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="runAgentNow(${t.id}, '${t.agent_type || ''}')">Run Now</button>
            <button class="btn btn-ghost btn-sm" onclick="reclassifyAgent(${t.id})">Re-classify</button>
          </div>
        </div>
      </div>`;
  }

  if (status === 'processing') {
    return `
      <div class="card" style="margin-top:18px;padding:14px 16px;border:1px solid #38bdf8;background:rgba(56,189,248,0.05)">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="spinner" style="width:18px;height:18px"></div>
          <span style="color:#0369a1"><strong>🤖 ${agentLabel}</strong> — running...</span>
        </div>
      </div>`;
  }

  if (status === 'failed') {
    const err = escapeHtml((t.agent_error || 'unknown error').slice(0, 400));
    return `
      <div class="card" style="margin-top:18px;padding:14px 16px;border:1px solid #ef4444;background:rgba(239,68,68,0.05)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div>
            <strong style="color:#ef4444">🤖 ${agentLabel} — failed</strong>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${err}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <button class="btn btn-primary btn-sm" onclick="runAgentNow(${t.id}, '${t.agent_type || ''}')">Retry ${escapeHtml(agentLabel)}</button>
            ${_renderAgentSwitchControls(t)}
          </div>
        </div>
      </div>`;
  }

  if (status === 'rejected') {
    return `
      <div class="card" style="margin-top:18px;padding:14px 16px;border:1px solid var(--border);background:#f8fafc">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="color:var(--text-muted)">🤖 ${agentLabel} — rejected. ${escapeHtml((t.agent_error || '').slice(0, 200))}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <button class="btn btn-ghost btn-sm" onclick="runAgentNow(${t.id}, '${t.agent_type || ''}')">Re-run ${escapeHtml(agentLabel)}</button>
            ${_renderAgentSwitchControls(t)}
          </div>
        </div>
      </div>`;
  }

  // out_of_scope — Senior BA detected this task is purely human-only
  // (live meeting, phone call, in-person, signature) and refused cleanly.
  // The prep materials (agenda, talking points, draft email) are in
  // agent_output / structured.human_action_queue, so we still render them.
  if (status === 'out_of_scope') {
    const bodyHtmlOOS = simpleMarkdownToHtml(t.agent_output || '(no prep materials)');
    return `
      <div class="card" style="margin-top:18px;padding:16px 18px;border:1px solid #f59e0b;background:rgba(245,158,11,0.06)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <strong style="color:#b45309">🤖 ${agentLabel} — out of scope (human action required)</strong>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="approveAgentOutput(${t.id})">Approve &amp; Append Prep to Task</button>
            <button class="btn btn-ghost btn-sm" onclick="editAgentOutput(${t.id})">Edit &amp; Save</button>
            <button class="btn btn-ghost btn-sm" onclick="runAgentNow(${t.id}, '${t.agent_type || ''}')">Re-run ${escapeHtml(agentLabel)}</button>
            ${_renderAgentSwitchControls(t)}
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">
          Senior BA declined to execute — task needs a person. Prep materials below are ready to use.
          ${t.agent_model ? ' · Model: ' + escapeHtml(t.agent_model) : ''}${t.agent_cost_usd ? ' · Cost: $' + Number(t.agent_cost_usd).toFixed(4) : ''}${t.agent_processed_at ? ' · ' + fmtDateTime(t.agent_processed_at) : ''}
        </div>
        <div class="agent-output-body" style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:14px 16px;font-size:13.5px;line-height:1.55;color:var(--text-primary)">${bodyHtmlOOS}</div>
      </div>`;
  }

  // ready_for_review OR approved — render the markdown output
  const bodyHtml = simpleMarkdownToHtml(t.agent_output || '(no output)');
  const isApproved = status === 'approved';
  const headerColor = isApproved ? '#10b981' : '#a78bfa';
  const headerBg = isApproved ? 'rgba(16,185,129,0.06)' : 'rgba(124,92,255,0.06)';
  const emailHelper = _renderEmailHelper(t);
  return `
    <div class="card" style="margin-top:18px;padding:16px 18px;border:1px solid ${headerColor};background:${headerBg}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <strong style="color:${headerColor}">🤖 ${agentLabel} — ${isApproved ? 'approved' : 'ready for review'}</strong>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${!isApproved ? `<button class="btn btn-primary btn-sm" onclick="approveAgentOutput(${t.id})">Approve &amp; Append to Task</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="editAgentOutput(${t.id})">Edit &amp; Save</button>
          <button class="btn btn-ghost btn-sm" onclick="runAgentNow(${t.id}, '${t.agent_type || ''}')">Re-run ${escapeHtml(agentLabel)}</button>
          ${_renderAgentSwitchControls(t)}
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">
        ${t.agent_model ? 'Model: ' + escapeHtml(t.agent_model) + ' · ' : ''}${t.agent_cost_usd ? 'Cost: $' + Number(t.agent_cost_usd).toFixed(4) : ''}${t.agent_language && t.agent_language !== 'auto' ? ' · Lang: ' + escapeHtml(t.agent_language.toUpperCase()) : ''}${t.agent_processed_at ? ' · ' + fmtDateTime(t.agent_processed_at) : ''}
      </div>
      ${emailHelper}
      <div class="agent-output-body" style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:14px 16px;font-size:13.5px;line-height:1.55;color:var(--text-primary)">${bodyHtml}</div>
    </div>`;
}

// =====================================================
// EMAIL HELPER — opens Mail with subject/body/recipient prefilled and
// downloads artifacts as files (since mailto can't carry attachments)
// =====================================================
//
// Why this shape: RFC 6068 forbids attachments in mailto URLs and every
// mail client refuses them for security reasons. The best a browser can
// do is (1) pre-fill the To/Subject/Body and (2) drop the artifacts on
// the user's filesystem. The user then drags the downloaded files into
// the open Mail compose window.
//
// Supports two agent shapes:
//   - Outreach Drafter: structured.subject + .body_text + .suggested_recipients
//   - Senior BA compound: structured.artifacts[] (with optional cover_email
//     artifact) + structured.human_action_queue (drafts)
function _renderEmailHelper(t) {
  const s = t.agent_structured;
  if (!s || typeof s !== 'object') return '';
  const info = _extractEmailInfo(s);
  // agent_artifacts is the persistent store and wins over agent_structured.artifacts
  // (which gets wiped when a different agent re-runs on the same task). The
  // backend already does this swap when building the email payload — we
  // mirror it here so the preview count stays accurate.
  if (Array.isArray(t.agent_artifacts) && t.agent_artifacts.length) {
    info.artifacts = t.agent_artifacts
      .filter(a => a && a.content_md)
      .filter(a => !['cover_email', 'email', 'outreach_email'].includes(String(a.type || '').toLowerCase()))
      .map((a, i) => ({ title: String(a.title || ('Artifact ' + (i + 1))), type: String(a.type || ''), content_md: a.content_md }));
  }
  if (!info.subject && !info.body && !info.artifacts.length) return '';
  const recipientLine = info.recipients.length
    ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">To: ${info.recipients.map(r => escapeHtml(r.email + (r.name ? ' (' + r.name + ')' : ''))).join(', ')}</div>`
    : `<div style="font-size:12px;color:#f59e0b;margin-bottom:6px">⚠ No recipient on file — Mail will open with empty To: field</div>`;
  const subjectLine = info.subject ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Subject: ${escapeHtml(info.subject)}</div>` : '';
  const artifactsLineMagic = info.artifacts.length
    ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${info.artifacts.length} artifact${info.artifacts.length === 1 ? '' : 's'} will be included as private links in the email — recipient sees the title and clicks to view.</div>`
    : '';
  return `
    <div style="margin-bottom:12px;padding:12px 14px;border:1px solid #3b82f6;background:rgba(59,130,246,0.06);border-radius:6px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px">
        <strong style="color:#1d4ed8">📧 Send via Mail</strong>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="openInMailWithMagicLinks(${t.id})">📧 Open in Mail</button>
          <button class="btn btn-ghost btn-sm" onclick="copyEmailAsHtml(${t.id})" title="Copy a rich-text version that shows only the artifact title as a hyperlink (paste into Apple Mail / Gmail compose for the cleanest look)">Copy as HTML</button>
          <button class="btn btn-ghost btn-sm" onclick="copyEmailBody(${t.id})">Copy Plain Text</button>
        </div>
      </div>
      ${recipientLine}
      ${subjectLine}
      ${artifactsLineMagic}
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Artifacts are served as private magic links — recipient clicks the title in the email and sees the artifact rendered as a web page (printable / save as PDF).</div>
    </div>`;
}

// Pull email subject / body / recipients / artifacts out of whichever agent
// shape produced this task. Returns a unified object the email helper can
// render and the open-in-mail action can consume.
function _extractEmailInfo(s) {
  const out = { subject: '', body: '', recipients: [], artifacts: [] };
  if (!s) return out;
  // Outreach Drafter shape
  if (s.subject) out.subject = String(s.subject);
  if (s.body_text) out.body = String(s.body_text);
  if (Array.isArray(s.suggested_recipients)) {
    s.suggested_recipients.forEach(r => {
      if (r && r.email) out.recipients.push({ email: String(r.email).trim(), name: r.name ? String(r.name).trim() : '' });
    });
  }
  // Senior BA compound shape: look for a cover_email artifact + non-cover artifacts
  if (Array.isArray(s.artifacts)) {
    s.artifacts.forEach(a => {
      if (!a) return;
      const type = String(a.type || '').toLowerCase();
      if ((type === 'cover_email' || type === 'email' || type === 'outreach_email') && a.content_md) {
        if (!out.body) out.body = String(a.content_md);
        if (!out.subject && a.title) out.subject = String(a.title);
      } else if (a.content_md) {
        out.artifacts.push({ title: String(a.title || 'artifact'), type: type || 'other', content_md: String(a.content_md) });
      }
    });
  }
  return out;
}

// Fetch the server-built email payload — backend mints the share token
// (if not set), generates magic-link URLs for each non-cover artifact,
// and assembles plain-text + HTML bodies with the artifacts embedded
// as labeled links. Returns null on error.
async function _fetchEmailPayload(taskId) {
  try {
    const r = await api('/agents/email-payload/' + taskId, { method: 'POST', body: JSON.stringify({}) });
    if (!r || !r.success) {
      alert('Could not build email payload: ' + (r && r.error ? r.error : 'unknown error'));
      return null;
    }
    return r.data;
  } catch (err) {
    alert('Could not build email payload: ' + err.message);
    return null;
  }
}

async function openInMailWithMagicLinks(taskId) {
  const p = await _fetchEmailPayload(taskId);
  if (!p) return;
  let body = p.body_text || '';
  // mailto URLs cap around 2000 chars in some clients. Truncate body and
  // add a pointer note if oversized — the magic links are still in the
  // truncated section so the recipient can still access materials.
  const MAX = 1800;
  if (body.length > MAX) {
    body = body.slice(0, MAX) + '\n\n[...truncated. See the materials links above for full content.]';
  }
  const url = `mailto:${encodeURIComponent(p.to || '')}?subject=${encodeURIComponent(p.subject || '')}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
  if (typeof showCopyToast === 'function') {
    const n = (p.links && p.links.length) || 0;
    showCopyToast(n ? `Opening Mail — ${n} artifact link${n === 1 ? '' : 's'} included` : 'Opening Mail…');
  }
}
window.openInMailWithMagicLinks = openInMailWithMagicLinks;

// Backwards-compat alias (old SW caches may still call the old name).
window.openInMailWithArtifacts = openInMailWithMagicLinks;

async function copyEmailBody(taskId) {
  const p = await _fetchEmailPayload(taskId);
  if (!p) return;
  try {
    await navigator.clipboard.writeText(p.body_text || '');
    if (typeof showCopyToast === 'function') showCopyToast('Plain-text email body copied');
  } catch (_) { alert('Copy failed — your browser blocked clipboard access.'); }
}
window.copyEmailBody = copyEmailBody;

// Copy the HTML version to clipboard. When pasted into Apple Mail / Gmail
// compose, the artifact links render as proper Title-only hyperlinks
// (no raw URLs visible) — which is what mailto cannot do.
async function copyEmailAsHtml(taskId) {
  const p = await _fetchEmailPayload(taskId);
  if (!p) return;
  const html = p.body_html || '';
  const text = p.body_text || '';
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
      if (typeof showCopyToast === 'function') showCopyToast('HTML email copied — paste into Mail compose');
      return;
    }
  } catch (_) { /* fall through to plain-text fallback */ }
  // Fallback: plain-text copy (mail clients won't render hyperlinks)
  try {
    await navigator.clipboard.writeText(text);
    if (typeof showCopyToast === 'function') showCopyToast('Plain text copied (browser blocked rich-text copy)');
  } catch (_) { alert('Copy failed — your browser blocked clipboard access.'); }
}
window.copyEmailAsHtml = copyEmailAsHtml;

// Minimal markdown-to-HTML — handles headings, bold, italics, links, lists,
// code blocks, paragraphs. Theme-aware: uses CSS variables so headings stay
// readable on both dark and light themes (the original hardcoded #0f172a
// was invisible on the dark theme — dark text on dark background).
function simpleMarkdownToHtml(md) {
  if (!md) return '';
  let s = String(md);
  // Escape HTML first
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Code fences
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre style="background:var(--bg-tertiary,#f1f5f9);color:var(--text-primary);padding:10px;border-radius:4px;overflow-x:auto;font-size:12px"><code>${code}</code></pre>`);
  // Headings — use --text-primary so they read on dark + light themes
  s = s.replace(/^### (.+)$/gm, '<h3 style="margin:14px 0 6px;font-size:15px;color:var(--text-primary)">$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2 style="margin:18px 0 8px;font-size:17px;color:var(--text-primary)">$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1 style="margin:0 0 12px;font-size:20px;color:var(--text-primary)">$1</h1>');
  // Bold + italic
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*]+?)\*([\s.,;)]|$)/g, '$1<em>$2</em>$3');
  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#38bdf8">$1</a>');
  // Lists
  s = s.replace(/^(?:- |\* )(.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>.*<\/li>)(\n(?!<li>))/g, '<ul style="margin:6px 0 6px 20px;padding:0">$1</ul>$2');
  // Numbered lists (1. )
  s = s.replace(/^(\d+)\. (.+)$/gm, '<li data-num="$1">$2</li>');
  // Paragraphs (blank-line separated)
  s = s.split(/\n{2,}/).map(block => {
    if (/^<(h1|h2|h3|ul|pre|li)/.test(block.trim())) return block;
    return '<p style="margin:8px 0">' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
  return s;
}

// Show a live "running…" indicator while the inline /run endpoint blocks
// (Senior BA on Opus 4.7 takes 30-60s; users need to see it's working).
// We optimistically swap the agent panel to a processing state with an
// elapsed-time counter, then refresh from server when the API responds.
function _showAgentProcessing(taskId, agentLabel) {
  const slots = document.querySelectorAll('[data-agent-panel-task="' + taskId + '"], #agent-panel-' + taskId);
  // Fallback: locate by scanning for the existing agent card
  const startedAt = Date.now();
  const html = `
    <div class="card" id="agent-panel-${taskId}" data-agent-panel-task="${taskId}" style="margin-top:18px;padding:14px 16px;border:1px solid #38bdf8;background:rgba(56,189,248,0.08)">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="spinner" style="width:18px;height:18px"></div>
        <div style="flex:1">
          <strong style="color:#0369a1">🤖 ${escapeHtml(agentLabel)} — running</strong>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
            Senior BA reads the task + project context, then drafts a structured deliverable. Typically 20-60 seconds.
            <span id="agent-elapsed-${taskId}" style="margin-left:6px;font-variant-numeric:tabular-nums">0s</span>
          </div>
        </div>
      </div>
    </div>`;
  if (slots.length) {
    slots.forEach(el => { el.outerHTML = html; });
  } else {
    // Fallback: append above the description card if we can't find the existing panel
    const detail = document.getElementById('view-container');
    if (detail) {
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      detail.insertBefore(wrap.firstElementChild, detail.firstChild.nextSibling);
    }
  }
  const tick = () => {
    const el = document.getElementById('agent-elapsed-' + taskId);
    if (!el) return; // panel was replaced (run finished) — stop ticking
    el.textContent = Math.round((Date.now() - startedAt) / 1000) + 's';
    setTimeout(tick, 1000);
  };
  setTimeout(tick, 1000);
}

function _readLang(elementId) {
  const el = elementId ? document.getElementById(elementId) : null;
  const v = el ? el.value : '';
  return (v === 'en' || v === 'es' || v === 'auto') ? v : null;
}

async function runAgentManual(taskId) {
  const sel = document.getElementById('manual-agent-type');
  const explicit = sel ? sel.value : '';
  const language = _readLang('manual-agent-lang');
  const body = {};
  if (explicit) body.agent_type = explicit;
  if (language) body.language = language;
  const agentLabels = { research: 'Research Brief', draft: 'Outreach Drafter', triage: 'Inbox Triage', senior_ba: 'Senior Business Analyst' };
  _showAgentProcessing(taskId, agentLabels[explicit] || 'AI Agent');
  if (typeof showCopyToast === 'function') showCopyToast('Agent running…');
  const r = await api('/agents/run/' + taskId, { method: 'POST', body: JSON.stringify(body) });
  if (!r.success) { alert('Agent run failed: ' + (r.error || 'unknown')); }
  showTaskDetail(taskId);
}
window.runAgentManual = runAgentManual;

// Re-run the SAME agent already chosen for this task. If you want to switch
// agent, use switchAgent(taskId, selectId, langSelectId). If you want to
// wipe the choice and re-classify, use reclassifyAgent(taskId).
async function runAgentNow(taskId, agentType, language) {
  const agentLabels = { research: 'Research Brief', draft: 'Outreach Drafter', triage: 'Inbox Triage', senior_ba: 'Senior Business Analyst' };
  _showAgentProcessing(taskId, agentLabels[agentType] || 'AI Agent');
  if (typeof showCopyToast === 'function') showCopyToast('Agent running…');
  const body = {};
  if (agentType) body.agent_type = agentType;
  if (language) body.language = language;
  const r = await api('/agents/run/' + taskId, { method: 'POST', body: JSON.stringify(body) });
  if (!r.success) { alert('Agent run failed: ' + (r.error || 'unknown')); }
  showTaskDetail(taskId);
}
window.runAgentNow = runAgentNow;

// Reads the per-panel "switch agent" + language dropdowns and runs the
// chosen agent in the chosen language. Picking only a language (and no
// new agent) just re-runs the current agent in that language.
async function switchAgent(taskId, selectId, langSelectId) {
  const sel = document.getElementById(selectId);
  const newType = sel ? sel.value : '';
  const language = _readLang(langSelectId);
  if (!newType && !language) { alert('Pick an agent or language first.'); return; }
  await runAgentNow(taskId, newType, language);
}
window.switchAgent = switchAgent;

async function reclassifyAgent(taskId) {
  _showAgentProcessing(taskId, 'AI Agent');
  await api('/agents/run/' + taskId, { method: 'POST', body: JSON.stringify({ reclassify: true }) });
  showTaskDetail(taskId);
}
window.reclassifyAgent = reclassifyAgent;

async function approveAgentOutput(taskId) {
  const merge = confirm('Append the agent output to this task\'s description?\n\nClick OK to merge, Cancel to approve without changing the task description.');
  const r = await api('/agents/approve/' + taskId, { method: 'POST', body: JSON.stringify({ merge_into_description: merge }) });
  if (!r.success) { alert('Approve failed: ' + (r.error || 'unknown')); return; }
  if (typeof showCopyToast === 'function') showCopyToast('Agent output approved' + (merge ? ' and appended to task' : ''));
  showTaskDetail(taskId);
}
window.approveAgentOutput = approveAgentOutput;

async function editAgentOutput(taskId) {
  const res = await api('/tasks/' + taskId);
  if (!res.success) return;
  const current = res.data.agent_output || '';
  const updated = prompt('Edit agent output (markdown):', current);
  if (updated === null || updated === current) return;
  const upd = await api('/tasks/' + taskId, { method: 'PUT', body: JSON.stringify({ agent_output: updated }) });
  if (!upd.success) { alert('Save failed: ' + (upd.error || 'unknown')); return; }
  showTaskDetail(taskId);
}
window.editAgentOutput = editAgentOutput;

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
  // Only OPEN (unread) reminders/alerts — reading one clears it from the list.
  const res = await api('/notifications?unread_only=true');
  if (!res.success) return;

  container.innerHTML = `
    <div class="section-header">
      <h3>${res.data.length} Open</h3>
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
  refreshNotifBadge();
}
async function markAllRead() {
  await api('/notifications/read-all', { method: 'PUT' });
  renderView('notifications');
  refreshNotifBadge();
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
          <button class="btn btn-danger btn-sm" onclick="deleteContact(${c.id})" title="Permanently delete">Delete</button>
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
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="chooseScheduleMeetingLanguage(${p.id})" title="Schedule an on-demand meeting with selected stakeholders. Creates a Zoom + calendar event and sends a styled HTML email." style="color:#2D8CFF;border-color:#2D8CFF">Schedule Meeting</button>
          <button class="btn btn-sm" onclick="runProjectTriage(${p.id})" title="${p.triage_brief ? 'Re-run AI Triage to refresh the fit score, stakeholder questions, and recommendation.' : 'Run AI Triage on this project: fit score, regulatory flags, portfolio synergies, bilingual stakeholder questions, and go/no-go recommendation. Takes 15-25s.'}" style="background:linear-gradient(90deg,#7c5cff,#a78bfa);border:none;color:#fff">&#129302; ${p.triage_brief ? 'Re-run AI Triage' : 'Run AI Triage'}</button>
          <button class="btn btn-sm" onclick="openShareProjectModal(${p.id})" title="Send the project summary + open-access magic link via WhatsApp, SMS, or Mail. Anyone you forward the link to can view it (no login required)." style="background:#10b981;color:#fff;border-color:#10b981">&#128229; Share Project</button>
          <button class="btn btn-sm" onclick="generateVoiceTeaser(${p.id})" title="AI-generate a sophisticated POC teaser: a branded simulation of the finished product plus Lina narrating it in voice. Then send to the client by Email, SMS, or WhatsApp. Takes 20-40s." style="background:linear-gradient(90deg,#22d3ee,#7c5cff);border:none;color:#06122b;font-weight:700">&#127908; Voice Teaser</button>
          <button class="btn btn-ghost btn-sm" onclick='openProjectModal(${JSON.stringify(p).replace(/"/g,"&quot;").replace(/'/g,"&#39;")})'>Edit</button>
          ${p.archived_at
            ? `<button class="btn btn-sm" onclick="unarchiveProject(${p.id})" title="Restore this project to active status" style="background:#10b981;color:#fff;border-color:#10b981">&#8634; Unarchive</button>`
            : `<button class="btn btn-ghost btn-sm" onclick="archiveProject(${p.id})">Archive</button>`}
          <button class="btn btn-danger btn-sm" onclick="deleteProject(${p.id}, ${JSON.stringify(p.name).replace(/"/g,'&quot;')})">Delete</button>
          ${p.business_plan_generated_at
            ? `<button class="btn btn-primary btn-sm" onclick="openBusinessPlan(${p.id})" style="background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;color:#020617">View Business Plan</button>
               <button class="btn btn-primary btn-sm" onclick="generateBusinessPlan(${p.id})" style="background:linear-gradient(90deg,#a78bfa,#f472b6);border:none;color:#020617" title="Set new targets and regenerate the plan + contract">&#8635; Regenerate Plan</button>`
            : `<button class="btn btn-primary btn-sm" onclick="generateBusinessPlan(${p.id})" style="background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;color:#020617">&#10024; AI Generate Business Plan</button>`
          }
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
          ${p.share_token ? (() => {
            const reqUrl = `${location.origin}/projects/intake/batch.html?token=${p.share_token}`;
            return `<div class="detail-section">
              <h4>Requestor Link</h4>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:var(--radius);padding:10px 12px">
                <a href="${reqUrl}" target="_blank" rel="noopener" style="flex:1;min-width:200px;font-size:12px;color:#38bdf8;word-break:break-all;text-decoration:none">${reqUrl}</a>
                <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${reqUrl}').then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
                <a class="btn btn-ghost btn-sm" href="${reqUrl}" target="_blank" rel="noopener">Open</a>
              </div>
              <p style="font-size:11px;color:var(--text-muted);margin-top:6px">Magic link sent to the requestor after approve/reject. Use it to see what they see.</p>
            </div>`;
          })() : ''}
          ${(p.submitter_name || p.submitter_email || p.submitter_phone) ? `
          <div class="detail-section" style="border:1px solid rgba(56,189,248,0.25);background:linear-gradient(120deg,rgba(56,189,248,0.06),rgba(167,139,250,0.04));border-radius:var(--radius);padding:14px 16px">
            <h4 style="margin-top:0;margin-bottom:10px">Project Requestor</h4>
            <div style="font-size:14px;color:var(--text-secondary);display:grid;grid-template-columns:auto 1fr;column-gap:14px;row-gap:6px;align-items:center">
              ${p.submitter_name ? `<div style="color:var(--text-muted);font-size:12px;letter-spacing:0.04em;text-transform:uppercase">Name</div><div style="color:var(--text-primary);font-weight:600">${escHtml(p.submitter_name)}</div>` : ''}
              ${p.submitter_email ? `<div style="color:var(--text-muted);font-size:12px;letter-spacing:0.04em;text-transform:uppercase">Email</div><div><a href="mailto:${escHtml(p.submitter_email)}" style="color:var(--accent);text-decoration:none">${escHtml(p.submitter_email)}</a></div>` : ''}
              ${p.submitter_phone ? `<div style="color:var(--text-muted);font-size:12px;letter-spacing:0.04em;text-transform:uppercase">Phone</div><div><a href="tel:${escHtml(p.submitter_phone)}" style="color:var(--accent);text-decoration:none">${escHtml(p.submitter_phone)}</a></div>` : ''}
              ${p.country ? `<div style="color:var(--text-muted);font-size:12px;letter-spacing:0.04em;text-transform:uppercase">Country</div><div style="color:var(--text-primary)">${escHtml(p.country)}</div>` : ''}
            </div>
          </div>` : ''}
          <div class="detail-section">
            <h4 style="display:flex;justify-content:space-between;align-items:center">Workflow
              <button class="btn btn-ghost btn-sm" onclick="overridePhase(${p.id}, '${escHtml(p.workflow_phase || 'pending_review')}')" title="Admin: override workflow_phase">Override Phase</button>
            </h4>
            <div style="font-size:13px;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px">
              <div><strong>Phase:</strong> <span class="status-badge status-${p.workflow_phase || 'pending_review'}">${p.workflow_phase || 'pending_review'}</span></div>
              ${p.kickoff_scheduled_at ? `<div><strong>Kickoff scheduled:</strong> ${fmtDateTime(p.kickoff_scheduled_at)}</div>` : ''}
              ${p.contract_status && p.contract_status !== 'none' ? `<div><strong>Contract status:</strong> ${p.contract_status}</div>` : ''}
            </div>
          </div>
          ${renderBuildAndUatCard(p)}
          <div class="detail-section" style="border:1px solid rgba(167,139,250,0.3);background:linear-gradient(120deg,rgba(56,189,248,0.04),rgba(167,139,250,0.04));border-radius:var(--radius);padding:14px">
            <h4 style="display:flex;justify-content:space-between;align-items:center;margin-top:0">Project Targets
              <button class="btn btn-ghost btn-sm" onclick="editProjectTargets(${p.id})">${(p.target_delivery_weeks || p.target_total_usd) ? 'Edit' : '+ Set'}</button>
            </h4>
            ${(p.target_delivery_weeks || p.target_total_usd)
              ? `<div style="font-size:13px;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px">
                   ${p.target_delivery_weeks ? `<div><strong>Delivery window:</strong> ${p.target_delivery_weeks} weeks</div>` : ''}
                   ${p.target_total_usd ? `<div><strong>Total price:</strong> ${Number(p.target_total_usd).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</div>` : ''}
                   ${p.target_total_usd ? `<div><strong>Monthly (total / 12):</strong> ${Number(p.target_total_usd / 12).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</div>` : ''}
                 </div>
                 <div style="margin-top:12px">
                   <button class="btn btn-primary btn-sm" onclick="generateBusinessPlan(${p.id})" style="background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;color:#020617;width:100%">${p.business_plan_generated_at ? '&#8635; Regenerate Plan & Contract' : '&#10024; Generate Plan & Contract'}</button>
                 </div>`
              : `<p style="font-size:13px;color:var(--text-muted);font-style:italic;margin-bottom:10px">Set the delivery window and total price before generating the AI business plan. The plan will honor these as hard constraints; the contract is fixed at 12 months with monthly = total / 12.</p>
                 <button class="btn btn-primary btn-sm" onclick="editProjectTargets(${p.id})" style="background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;color:#020617;width:100%">&#43; Set Targets to Start</button>`}
          </div>
          <div class="detail-section">
            <h4 style="display:flex;justify-content:space-between;align-items:center">Business Requirements
              <button class="btn btn-ghost btn-sm" onclick="editBusinessRequirements(${p.id})">${p.business_requirements ? 'Edit' : '+ Add'}</button>
            </h4>
            ${p.business_requirements
              ? `<p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${escHtml(p.business_requirements)}</p>`
              : `<p style="font-size:13px;color:var(--text-muted);font-style:italic">Captured after the kickoff meeting. Click Add to record stakeholder needs, success criteria, constraints, and any details gathered during requirements discovery.</p>`}
          </div>
          <div class="detail-section" style="border:1px solid rgba(56,189,248,0.25);background:linear-gradient(120deg,rgba(56,189,248,0.04),rgba(167,139,250,0.04));border-radius:var(--radius);padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap">
              <h4 style="margin:0">Notes</h4>
              <div style="display:flex;align-items:center;gap:8px">
                <span id="notes-status-${p.id}" style="font-size:11px;color:var(--text-muted)"></span>
                <button id="notes-save-btn-${p.id}" class="btn btn-primary btn-sm" onclick="saveProjectNotes(${p.id})" style="background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;color:#020617" disabled>Save Notes</button>
              </div>
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin:0 0 8px">Free-form working notes for this project. Paste with formatting (bold, lists, links, tables) — anything you copy in keeps its rich formatting.</p>
            <div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:rgba(56,189,248,0.05);border:1px solid var(--border);border-bottom:none;border-radius:var(--radius) var(--radius) 0 0">
              <button type="button" class="notes-tool" onclick="notesCmd('${p.id}','bold')" title="Bold (Cmd/Ctrl+B)" style="font-weight:700;min-width:30px;padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">B</button>
              <button type="button" class="notes-tool" onclick="notesCmd('${p.id}','italic')" title="Italic (Cmd/Ctrl+I)" style="font-style:italic;min-width:30px;padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">I</button>
              <button type="button" class="notes-tool" onclick="notesCmd('${p.id}','underline')" title="Underline (Cmd/Ctrl+U)" style="text-decoration:underline;min-width:30px;padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">U</button>
              <button type="button" class="notes-tool" onclick="notesCmd('${p.id}','strikeThrough')" title="Strikethrough" style="text-decoration:line-through;min-width:30px;padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">S</button>
              <span style="width:1px;background:var(--border);margin:0 4px"></span>
              <button type="button" class="notes-tool" onclick="notesCmd('${p.id}','formatBlock','H3')" title="Heading" style="font-weight:700;padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">H</button>
              <button type="button" class="notes-tool" onclick="notesCmd('${p.id}','insertUnorderedList')" title="Bulleted list" style="padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">&bull; List</button>
              <button type="button" class="notes-tool" onclick="notesCmd('${p.id}','insertOrderedList')" title="Numbered list" style="padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">1. List</button>
              <button type="button" class="notes-tool" onclick="notesLink('${p.id}')" title="Insert link" style="padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">&#128279; Link</button>
              <span style="width:1px;background:var(--border);margin:0 4px"></span>
              <button type="button" class="notes-tool" onclick="notesCmd('${p.id}','removeFormat')" title="Clear formatting" style="padding:4px 8px;background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">Clear</button>
            </div>
            <div id="project-notes-${p.id}" contenteditable="true" data-original="${escHtml(renderNotesHtml(p.notes || ''))}" oninput="onProjectNotesChange(${p.id})" style="width:100%;font-family:inherit;font-size:14px;line-height:1.55;padding:12px;border-radius:0 0 var(--radius) var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);min-height:260px;max-height:600px;overflow-y:auto;outline:none" data-placeholder="Write notes for this project. Paste meeting summaries, decisions, follow-ups, links — anything you want kept with the project record.">${renderNotesHtml(p.notes || '')}</div>
          </div>
          ${renderProjectTriagePanel(p)}
          ${p.description ? `<div class="detail-section"><h4>Description</h4><p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${p.description}</p></div>` : ''}
          ${p.blockers ? `<div class="detail-section"><h4>Blockers</h4><p style="font-size:14px;color:var(--danger)">${p.blockers}</p></div>` : ''}
          ${p.next_step ? `<div class="detail-section"><h4>Next Step</h4><p style="font-size:14px;color:var(--success)">${p.next_step}</p></div>` : ''}

          <div class="detail-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h4 style="margin:0">Milestones</h4>
              <button class="btn btn-ghost btn-sm" onclick="openMilestoneModal(${p.id})">+ Add</button>
            </div>
            ${p.milestones?.length ? p.milestones.map(m => {
              // Legacy fallback: AI-generated milestones embedded the owner inside the description
              // as a trailing "Owner: <role>" line. Surface that if no first-class owner is set yet.
              let displayOwner = m.owner || '';
              if (!displayOwner && m.description) {
                const mm = m.description.match(/(?:^|\n)\s*Owner:\s*(.+?)(?:\n|$)/i);
                if (mm) displayOwner = mm[1].trim();
              }
              return `<div class="timeline-item" style="border-left:3px solid ${m.status === 'completed' ? 'var(--success)' : m.due_date && new Date(m.due_date) < new Date() ? 'var(--danger)' : 'var(--accent)'}">
              <div class="timeline-content">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
                  <div style="flex:1;min-width:200px">
                    <strong>${escapeHtml(m.title)}</strong> <span class="status-badge status-${m.status}">${m.status}</span>
                    ${m.due_date ? `<br><span class="timeline-time">Due: ${fmtDate(m.due_date)}</span>` : ''}
                    ${displayOwner ? `<br><span style="font-size:12px;color:var(--text-secondary)"><span style="color:var(--text-muted)">Owner:</span> <strong>${escapeHtml(displayOwner)}</strong></span>` : ''}
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${m.status !== 'completed' ? `<button class="btn btn-success btn-sm" onclick="completeMilestone(${p.id},${m.id})">Complete</button>` : ''}
                    <button class="btn btn-ghost btn-sm" onclick="openMilestoneEditModal(${p.id},${m.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteMilestone(${p.id},${m.id},${JSON.stringify(m.title)})">Delete</button>
                  </div>
                </div>
              </div>
            </div>`;
            }).join('') : '<p style="font-size:13px;color:var(--text-muted)">No milestones</p>'}
          </div>

          <div class="detail-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h4 style="margin:0">Tasks</h4>
              <button class="btn btn-ghost btn-sm" onclick="openTaskModalForProject(${p.id})">+ Add Task</button>
            </div>
            ${projectTasks.length ? projectTasks.map(t => {
              const tOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status === 'pending';
              const suggested = extractSuggestedOwner(t.description);
              let ownerHtml = '';
              if (t.assignee) {
                const name = (t.assignee.first_name + ' ' + (t.assignee.last_name || '')).trim();
                ownerHtml = `<br><span style="font-size:12px;color:var(--text-secondary)">&#128100; <strong>${escapeHtml(name)}</strong></span>`;
              } else if (suggested) {
                ownerHtml = `<br><span style="font-size:12px;color:var(--text-secondary)">&#128100; <span style="color:var(--text-muted);font-style:italic">Suggested:</span> <strong>${escapeHtml(suggested)}</strong></span>`;
              } else {
                ownerHtml = `<br><span style="font-size:12px;color:var(--text-muted);font-style:italic">&#128100; Unassigned</span>`;
              }
              return `<div class="timeline-item" style="border-left:3px solid ${t.status === 'completed' ? 'var(--success)' : tOverdue ? 'var(--danger)' : 'var(--accent)'}">
                <div class="timeline-content" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
                  <div style="flex:1;min-width:200px;cursor:pointer" onclick="showTaskDetail(${t.id})">
                    <strong>${t.title}</strong> <span class="status-badge status-${t.status === 'completed' ? 'completed' : tOverdue ? 'overdue' : 'pending'}">${t.status === 'completed' ? 'done' : tOverdue ? 'overdue' : t.status}</span>
                    <span class="priority-badge priority-${t.priority}" style="margin-left:4px">${t.priority}</span>
                    ${ownerHtml}
                    ${t.due_date ? '<br><span class="timeline-time">Due: '+fmtDate(t.due_date)+'</span>' : ''}
                  </div>
                  <button class="btn btn-sm" style="background:#25D366;color:#fff;border-color:#25D366;flex-shrink:0" onclick="openTaskWhatsAppModal(${t.id},${p.id})" title="Send via WhatsApp">&#128241; WhatsApp</button>
                </div>
              </div>`;
            }).join('') : '<p style="font-size:13px;color:var(--text-muted)">No tasks for this project</p>'}
          </div>

          <div class="detail-section" id="project-meetings-${p.id}">
            <h4>Upcoming Meetings &amp; Attendance</h4>
            <p style="font-size:13px;color:var(--text-muted)">Loading meetings...</p>
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
            <h4 style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">Stakeholders (email recipients)
              <span style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="generateStakeholderShareLink(${p.id})" title="Generate a magic-link the stakeholders can use to view this project — no account or password required">${p.stakeholder_share_token ? '&#128279; Share Link' : '&#43; Share Link'}</button>
                <button class="btn btn-ghost btn-sm" onclick="editStakeholders(${p.id})">${(Array.isArray(p.team_members) && p.team_members.length) ? 'Edit' : '+ Add'}</button>
              </span>
            </h4>
            <p style="font-size:11px;color:var(--text-muted);margin:0 0 8px">Everyone listed here is CC'd on contract emails, UAT handoff emails, and shipped confirmations. They can also access a read-only project view via the Share Link button.</p>
            ${(Array.isArray(p.team_members) && p.team_members.length)
              ? `<div style="display:flex;flex-direction:column;gap:6px">
                   ${p.team_members.map(m => `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:6px;font-size:12px">
                     <span style="color:var(--text-primary);font-weight:500;flex:1;word-break:break-all">${escHtml(m.email || '')}</span>
                     ${m.role ? `<span class="tag" style="font-size:10px">${escHtml(m.role)}</span>` : ''}
                     <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px" onclick="sendNda(${p.id}, '${escHtml(m.email || '').replace(/'/g, "\\'")}', '${escHtml(m.role || '').replace(/'/g, "\\'")}')" title="Generate an NDA magic-link bound to this stakeholder">&#9999;&#65039; NDA</button>
                   </div>`).join('')}
                 </div>`
              : '<p style="font-size:13px;color:var(--text-muted);font-style:italic">No additional stakeholders. The project submitter and Manuel always receive emails.</p>'}
          </div>

          <div class="detail-section">
            <h4 style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">NDA Signatures
              <span style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="openNewNdaModal(${p.id})" title="Send an NDA magic-link to any email">&#43; New NDA</button>
                <button class="btn btn-ghost btn-sm" onclick="refreshNdaList(${p.id})" title="Refresh">&#8635;</button>
              </span>
            </h4>
            <p style="font-size:11px;color:var(--text-muted);margin:0 0 8px">Send a per-stakeholder magic link to sign an NDA between DIGIT2AI LLC and the stakeholder before sharing technical details. Signatures are recorded with timestamp, IP, and user-agent.</p>
            <div id="nda-list-${p.id}" style="display:flex;flex-direction:column;gap:6px">
              <p style="font-size:12px;color:var(--text-muted);font-style:italic">Loading...</p>
            </div>
          </div>

          <div class="detail-section">
            <h4>Linked Contacts</h4>
            ${p.contacts?.length ? p.contacts.map(c => `<div class="timeline-item" style="cursor:pointer" onclick="showContactDetail(${c.id})"><div class="timeline-dot" style="background:var(--success)"></div><div class="timeline-content"><strong>${c.first_name} ${c.last_name || ''}</strong>${c.ProjectContact?.role ? '<br><span style="font-size:12px;color:var(--text-muted)">'+c.ProjectContact.role+'</span>' : ''}</div></div>`).join('') : '<p style="font-size:13px;color:var(--text-muted)">No contacts linked</p>'}
          </div>

          ${p.tags?.length ? `<div class="detail-section"><h4>Tags</h4>${p.tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  // Lazy-load NDA list into the section once the detail HTML is in the DOM.
  if (typeof refreshNdaList === 'function') {
    refreshNdaList(p.id);
  }
  // Lazy-load upcoming meetings + RSVP attendance into the section.
  loadProjectMeetingsAttendance(p.id);
}

// Fetches upcoming meetings linked to the project, then fetches RSVPs
// for each, and renders the Attendance card list into #project-meetings-:id.
async function loadProjectMeetingsAttendance(projectId) {
  const wrap = document.getElementById('project-meetings-' + projectId);
  if (!wrap) return;
  try {
    const nowIso = new Date().toISOString();
    const horizon = new Date(Date.now() + 90 * 86400000).toISOString();
    const evRes = await api(`/calendar?start=${encodeURIComponent(nowIso)}&end=${encodeURIComponent(horizon)}&event_type=meeting`);
    const meetings = (evRes.data || []).filter(e => e.project_id === projectId && e.source !== 'task');
    if (!meetings.length) {
      wrap.innerHTML = '<h4>Upcoming Meetings &amp; Attendance</h4><p style="font-size:13px;color:var(--text-muted)">No upcoming meetings scheduled for this project. Click <strong>Schedule Meeting</strong> at the top to send one.</p>';
      return;
    }
    // Fetch RSVPs per meeting in parallel
    const rsvpRess = await Promise.all(meetings.map(m =>
      api(`/projects/${projectId}/meetings/${m.id}/rsvps`).catch(() => ({ success: false }))
    ));
    const cardsHtml = meetings.map((m, i) => {
      const r = rsvpRess[i];
      const counts = (r && r.success && r.data && r.data.counts) || { yes: 0, no: 0, maybe: 0, pending: 0 };
      const rows = (r && r.success && r.data && r.data.rsvps) || [];
      const respondedTotal = counts.yes + counts.no + counts.maybe;
      const total = respondedTotal + counts.pending;
      const rsvpRowsHtml = rows.length
        ? rows.map(row => {
            const status = row.response || 'pending';
            const color = status === 'yes' ? 'var(--success)'
                        : status === 'no' ? 'var(--danger)'
                        : status === 'maybe' ? 'var(--warning)'
                        : 'var(--text-muted)';
            const label = status === 'yes' ? 'Confirmed' : status === 'no' ? 'Declined' : status === 'maybe' ? 'Tentative' : 'No response';
            const when = row.responded_at ? ' &middot; ' + fmtDateTime(row.responded_at) : '';
            return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
              <span style="flex:1;color:var(--text-primary);word-break:break-all">${escHtml(row.email)}</span>
              <span style="font-size:11px;color:${color};font-weight:600">${label}</span>
              <span style="font-size:11px;color:var(--text-muted)">${when}</span>
            </div>`;
          }).join('')
        : '<p style="font-size:12px;color:var(--text-muted);font-style:italic;padding:6px 0">No invites sent yet for this meeting.</p>';

      const zoomLink = m.zoom_join_url
        ? `<a href="${m.zoom_join_url}" target="_blank" rel="noopener" style="color:#2D8CFF;font-size:12px;text-decoration:none">Join Zoom</a>`
        : '';

      return `
        <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:12px;background:rgba(56,189,248,0.03)">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${escHtml(m.title || 'Meeting')}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${fmtDateTime(m.start_time)}${m.end_time ? ' – ' + new Date(m.end_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}</div>
            </div>
            <div style="display:flex;gap:10px;align-items:center">${zoomLink}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <span style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(16,185,129,0.15);color:var(--success)">Confirmed: ${counts.yes}</span>
            <span style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(245,158,11,0.15);color:var(--warning)">Tentative: ${counts.maybe}</span>
            <span style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(239,68,68,0.15);color:var(--danger)">Declined: ${counts.no}</span>
            <span style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(148,163,184,0.15);color:var(--text-secondary)">Pending: ${counts.pending}</span>
            <span style="font-size:11px;color:var(--text-muted);align-self:center">${respondedTotal}/${total} responded</span>
          </div>
          <div>${rsvpRowsHtml}</div>
        </div>
      `;
    }).join('');
    wrap.innerHTML = `<h4>Upcoming Meetings &amp; Attendance</h4>${cardsHtml}`;
  } catch (e) {
    wrap.innerHTML = '<h4>Upcoming Meetings &amp; Attendance</h4><p style="font-size:13px;color:var(--danger)">Could not load meetings: ' + (e.message || 'unknown error') + '</p>';
  }
}

// =====================================================
// Build & UAT card (post-payment orchestrator surface)
// Visible whenever the project has reached build_authorized or beyond.
// =====================================================
function renderBuildAndUatCard(p) {
  const phase = p.workflow_phase || '';
  const buildPhases = ['build_authorized', 'awaiting_human_greenlight', 'queued', 'manual_build', 'sit_running', 'uat_ready', 'uat_revision', 'shipped', 'build_stuck'];
  if (!buildPhases.includes(phase)) return '';
  const phaseColor = ({
    build_authorized: '#0ea5e9',
    awaiting_human_greenlight: '#f59e0b',
    queued: '#94a3b8',
    manual_build: '#0ea5e9',
    sit_running: '#a78bfa',
    uat_ready: '#10b981',
    uat_revision: '#f59e0b',
    shipped: '#22c55e',
    build_stuck: '#f43f5e'
  })[phase] || '#94a3b8';
  const prodUrl = p.production_url || (p.short_name ? `https://aiagent.ringlypro.com/${p.short_name}` : '');
  // ====== PRIMARY "PLAY" ACTION ======
  // The single biggest button on the card — what the user is meant to press
  // next, given the current phase. Full-width, large padding, gradient.
  let primaryAction = '';
  if (phase === 'awaiting_human_greenlight') {
    primaryAction = `<button onclick="grantHumanGreenlight(${p.id})" style="display:block;width:100%;padding:18px 24px;font-size:16px;font-weight:700;background:linear-gradient(90deg,#f59e0b,#f97316);border:none;border-radius:10px;color:#020617;cursor:pointer;box-shadow:0 4px 14px rgba(245,158,11,0.4);margin-bottom:10px;letter-spacing:0.5px">GREENLIGHT BUILD &mdash; START PIPELINE</button>`;
  } else if (phase === 'manual_build' || phase === 'uat_revision') {
    primaryAction = `<button onclick="markBuildComplete(${p.id})" style="display:block;width:100%;padding:18px 24px;font-size:16px;font-weight:700;background:linear-gradient(90deg,#10b981,#22c55e);border:none;border-radius:10px;color:#020617;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,0.4);margin-bottom:10px;letter-spacing:0.5px">BUILD COMPLETE &mdash; RUN SIT &amp; HANDOFF UAT</button>`;
  } else if (phase === 'build_authorized' || phase === 'queued') {
    primaryAction = `<button onclick="regenerateArchitectPrompt(${p.id})" style="display:block;width:100%;padding:18px 24px;font-size:16px;font-weight:700;background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;border-radius:10px;color:#020617;cursor:pointer;box-shadow:0 4px 14px rgba(56,189,248,0.4);margin-bottom:10px;letter-spacing:0.5px">GENERATE ARCHITECT PROMPT</button>`;
  } else if (phase === 'uat_ready') {
    primaryAction = `<div style="display:block;width:100%;padding:14px 18px;font-size:14px;font-weight:600;background:linear-gradient(90deg,#10b981,#22c55e);border-radius:10px;color:#020617;margin-bottom:10px;text-align:center;letter-spacing:0.5px">UAT IN PROGRESS &mdash; STAKEHOLDERS TESTING</div>`;
  } else if (phase === 'shipped') {
    primaryAction = `<div style="display:block;width:100%;padding:14px 18px;font-size:14px;font-weight:600;background:linear-gradient(90deg,#22c55e,#16a34a);border-radius:10px;color:#020617;margin-bottom:10px;text-align:center;letter-spacing:0.5px">SHIPPED</div>`;
  } else if (phase === 'build_stuck') {
    primaryAction = `<div style="display:block;width:100%;padding:14px 18px;font-size:14px;font-weight:600;background:linear-gradient(90deg,#f43f5e,#dc2626);border-radius:10px;color:#fff;margin-bottom:10px;text-align:center;letter-spacing:0.5px">BUILD STUCK &mdash; MANUAL INTERVENTION REQUIRED</div>`;
  }

  // ====== SECONDARY ACTIONS (small ghost buttons) ======
  const actions = [];
  if (p.architect_prompt) {
    actions.push(`<button class="btn btn-ghost btn-sm" onclick="viewArchitectPrompt(${p.id})">View Architect Prompt</button>`);
  }
  // Regenerate the synthesizer at any time (except shipped/stuck) without firing the pipeline.
  if (phase !== 'shipped' && phase !== 'build_stuck') {
    actions.push(`<button class="btn btn-ghost btn-sm" onclick="regenerateArchitectPrompt(${p.id})" title="Re-run the Senior Prompt Engineer synthesizer (no email, no phase change)">Regenerate Prompt</button>`);
  }
  if (p.sit_report_md) {
    actions.push(`<button class="btn btn-ghost btn-sm" onclick="viewSitReport(${p.id})">View SIT Report</button>`);
  }
  if (phase !== 'shipped' && phase !== 'build_stuck') {
    actions.push(`<button class="btn btn-ghost btn-sm" onclick="cancelStripeSubscription(${p.id})" title="Cancel the active Stripe subscription">Cancel Stripe</button>`);
  }
  if (!p.short_name) {
    actions.push(`<button class="btn btn-ghost btn-sm" onclick="recomputeShortName(${p.id})">Generate short_name</button>`);
  }
  return `<div class="detail-section" style="border:1px solid ${phaseColor};border-radius:var(--radius);padding:14px;background:linear-gradient(120deg,${hexToRgba(phaseColor,0.06)},transparent)">
    <h4 style="margin-top:0;display:flex;align-items:center;gap:8px">Build & UAT
      <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${phaseColor};color:#020617">${escHtml(phase.toUpperCase())}</span>
    </h4>
    <div style="font-size:13px;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px">
      ${p.short_name ? `<div><strong>Short name:</strong> <code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">${escHtml(p.short_name)}</code></div>` : '<div style="color:var(--text-muted);font-style:italic">No short_name yet</div>'}
      ${prodUrl ? `<div><strong>Production URL:</strong> <a href="${escHtml(prodUrl)}" target="_blank" style="color:var(--accent);word-break:break-all">${escHtml(prodUrl)}</a></div>` : ''}
      ${p.build_iterations ? `<div><strong>Build iterations:</strong> ${p.build_iterations}</div>` : ''}
      ${p.build_started_at ? `<div><strong>Build started:</strong> ${fmtDateTime(p.build_started_at)}</div>` : ''}
      ${p.build_completed_at ? `<div><strong>Build completed:</strong> ${fmtDateTime(p.build_completed_at)}</div>` : ''}
      ${p.uat_approved_at ? `<div><strong>UAT approved:</strong> ${fmtDateTime(p.uat_approved_at)}${p.uat_approved_by ? ' by ' + escHtml(p.uat_approved_by) : ''}</div>` : ''}
    </div>
    ${primaryAction ? `<div style="margin-top:14px">${primaryAction}</div>` : ''}
    ${actions.length ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${actions.join('')}</div>` : ''}
  </div>`;
}

function hexToRgba(hex, a) {
  const m = String(hex).replace('#','').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return `rgba(56,189,248,${a})`;
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
}

async function overridePhase(projectId, currentPhase) {
  const phases = [
    'pending_review', 'approved', 'rejected', 'kickoff_scheduled',
    'contract_drafted', 'awaiting_deposit', 'deposit_paid',
    'build_authorized', 'awaiting_human_greenlight', 'queued',
    'manual_build', 'sit_running', 'uat_ready', 'uat_revision',
    'shipped', 'build_stuck'
  ];
  const opts = phases.map(p =>
    `<option value="${p}" ${p === currentPhase ? 'selected' : ''}>${p}${p === 'build_authorized' ? '  -- triggers architect pipeline' : ''}</option>`
  ).join('');
  openModal('Override workflow_phase', `
    <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px">Admin override. Setting phase to <code>build_authorized</code> fires the architect pipeline immediately (gathers context, renders the Master Architect Prompt, emails Manuel the manual-build handoff). Use this to test the pipeline end-to-end without a real Stripe payment.</p>
    <div class="form-group">
      <label>New phase</label>
      <select id="m-phase-new" style="width:100%;padding:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius)">${opts}</select>
    </div>
    <div style="padding:10px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:11px;color:var(--text-secondary)">
      <strong>Heads up:</strong> this writes <code>project.workflow_phase</code> directly. State transitions normally fire side effects (emails, contract drafts, Stripe). The only side effect this override triggers is the architect pipeline on <code>build_authorized</code>. Other phases just update the field.
    </div>
  `, async () => {
    const newPhase = document.getElementById('m-phase-new').value;
    if (newPhase === currentPhase) { closeModal(); return; }
    const r = await api(`/projects/${projectId}/set-phase`, { method: 'POST', body: JSON.stringify({ phase: newPhase }) });
    closeModal();
    if (!r.success) { alert('Phase override failed: ' + (r.error || 'unknown')); return; }
    if (r.pipeline_fired) {
      alert('Phase set to build_authorized. Architect pipeline is running in the background — check your email for the manual-build handoff.');
    }
    showProjectDetail(projectId);
  });
}

async function grantHumanGreenlight(projectId) {
  if (!confirm('Greenlight this sensitive-data project for the build pipeline? An email will be sent to Manuel and the build will start.')) return;
  try {
    const r = await api(`/projects/${projectId}/human-greenlight`, { method: 'POST', body: JSON.stringify({}) });
    if (!r.success) { alert('Greenlight failed: ' + (r.error || 'unknown')); return; }
    showProjectDetail(projectId);
  } catch (e) { alert('Greenlight failed: ' + e.message); }
}

async function markBuildComplete(projectId) {
  openModal('Mark Build Complete', `
    <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px">The orchestrator will hit <code>/${'<short_name>'}/health</code> to verify the production URL is up. Add any extra SIT notes you want stored on the project.</p>
    <div class="form-group">
      <label>Additional SIT notes (optional, markdown)</label>
      <textarea id="m-sit-md" rows="6" placeholder="e.g. Tested checkout, login, admin dashboard. All green."></textarea>
    </div>
  `, async () => {
    const sit_report_md = document.getElementById('m-sit-md').value || null;
    const r = await api(`/projects/${projectId}/build-complete`, {
      method: 'POST',
      body: JSON.stringify({ sit_report_md })
    });
    closeModal();
    if (!r.success) { alert('Build-complete failed: ' + (r.error || 'unknown')); return; }
    if (r.sit && r.sit.pass) {
      alert('SIT passed. UAT email sent to stakeholders.');
    } else {
      alert('SIT failed: ' + (r.sit && r.sit.summary || 'unknown') + '\n\nProject moved back to manual_build.');
    }
    showProjectDetail(projectId);
  });
}

async function regenerateArchitectPrompt(projectId) {
  if (!confirm('Re-run the Senior Prompt Engineer synthesizer for this project?\n\nThis pulls the current project context (intake Q&A, business plan, milestones, contract, stakeholders, targets, business requirements), regenerates the raw template, then passes it through the Claude synthesizer to produce a fresh focused sprint brief.\n\nNo email is sent. No phase change. ~$0.10 in Claude tokens.')) return;

  const progress = showPromptGenProgress();
  try {
    const r = await api(`/projects/${projectId}/regenerate-prompt`, { method: 'POST', body: JSON.stringify({}) });
    progress.close();
    if (!r.success) { alert('Regenerate failed: ' + (r.error || 'unknown')); return; }
    alert(`Prompt regenerated (${r.prompt_length} chars).\n\nSource: ${r.used_synth ? 'Senior Prompt Engineer synthesizer (Claude)' : 'raw template (synth unavailable)'}\n\nClick "View Architect Prompt" to see it.`);
    showProjectDetail(projectId);
  } catch (e) {
    progress.close();
    alert('Regenerate failed: ' + e.message);
  }
}

// Progress modal shown while the Senior Prompt Engineer synthesizer runs.
// Reuses the global modal; hides save/cancel; cycles stage labels every
// 4s so the operator can see the pipeline is alive while Claude streams
// (~30–60s end-to-end).
function showPromptGenProgress() {
  const stages = [
    { icon: '◐', text: 'Gathering project context — intake, plan, milestones, contract, stakeholders…' },
    { icon: '◓', text: 'Rendering raw architect template from gathered context…' },
    { icon: '◑', text: 'Sending to Senior Prompt Engineer (Claude) for synthesis…' },
    { icon: '◒', text: 'Claude is composing the focused sprint brief — this is the slow part…' },
    { icon: '◐', text: 'Almost there — finalizing and saving to project record…' }
  ];

  openModal('Generating Architect Prompt', `
    <div id="pgen-wrap" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:8px 4px 12px;gap:18px">
      <div class="spinner" style="width:48px;height:48px;border-width:4px"></div>
      <div style="font-size:14px;font-weight:600;color:var(--text-primary);letter-spacing:0.3px">Senior Prompt Engineer is working…</div>
      <div id="pgen-stage" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:8px;min-height:48px;width:100%;max-width:520px">
        <span id="pgen-icon" style="font-size:18px;color:#38bdf8;font-family:ui-monospace,monospace">◐</span>
        <span id="pgen-text" style="font-size:13px;color:var(--text-secondary);text-align:left;line-height:1.5">${stages[0].text}</span>
      </div>
      <div id="pgen-elapsed" style="font-family:ui-monospace,monospace;font-size:11px;color:var(--text-muted);letter-spacing:1px">elapsed 00:00</div>
      <div style="font-size:11px;color:var(--text-muted);max-width:520px;line-height:1.5;font-style:italic">Average runtime is 30–60 seconds. The modal closes automatically when the prompt is saved. Do not close this tab.</div>
    </div>
  `, null);

  // Hide save + repurpose cancel so this is a true blocking progress dialog.
  const saveBtn = document.getElementById('modal-save');
  const cancelBtn = document.getElementById('modal-cancel');
  if (saveBtn) saveBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';

  // Cycle the stage text + icon.
  let stageIdx = 0;
  const iconEl = document.getElementById('pgen-icon');
  const textEl = document.getElementById('pgen-text');
  const stageTimer = setInterval(() => {
    stageIdx = Math.min(stageIdx + 1, stages.length - 1);
    if (iconEl) iconEl.textContent = stages[stageIdx].icon;
    if (textEl) textEl.textContent = stages[stageIdx].text;
  }, 4000);

  // Spin the icon on a faster timer to suggest activity.
  const spinFrames = ['◐', '◓', '◑', '◒'];
  let frame = 0;
  const spinTimer = setInterval(() => {
    frame = (frame + 1) % spinFrames.length;
    if (iconEl) iconEl.textContent = spinFrames[frame];
  }, 350);

  // Elapsed counter (mm:ss).
  const startedAt = Date.now();
  const elapsedEl = document.getElementById('pgen-elapsed');
  const elapsedTimer = setInterval(() => {
    if (!elapsedEl) return;
    const s = Math.floor((Date.now() - startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    elapsedEl.textContent = `elapsed ${mm}:${ss}`;
  }, 1000);

  return {
    close: () => {
      clearInterval(stageTimer);
      clearInterval(spinTimer);
      clearInterval(elapsedTimer);
      closeModal();
    }
  };
}

async function viewArchitectPrompt(projectId) {
  try {
    const r = await api(`/projects/${projectId}`);
    if (!r.success) { alert('Could not load project'); return; }
    const prompt = (r.data && r.data.architect_prompt) || '(no prompt stored yet)';
    openModal('Master Architect Prompt', `
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 8px">This is the prompt the orchestrator built from intake + plan + contract + milestones. Push #2 will pipe this to a Claude Agent SDK loop; Push #1 expects Manuel to paste it into a Claude Code session via <code>/ringlypro-architect</code>.</p>
      <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('m-arch-prompt').textContent).then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy prompt',1500)})">Copy prompt</button>
      <pre id="m-arch-prompt" style="margin-top:8px;padding:14px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:11px;line-height:1.5;max-height:60vh;overflow:auto;white-space:pre-wrap;word-wrap:break-word">${escHtml(prompt)}</pre>
    `, null);
    document.getElementById('modal-save').style.display = 'none';
    document.getElementById('modal-cancel').textContent = 'Close';
  } catch (e) { alert('Error: ' + e.message); }
}

async function viewSitReport(projectId) {
  try {
    const r = await api(`/projects/${projectId}`);
    if (!r.success) { alert('Could not load project'); return; }
    const md = (r.data && r.data.sit_report_md) || '(no SIT report yet)';
    openModal('SIT Report', `
      <pre style="padding:14px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:12px;line-height:1.5;max-height:60vh;overflow:auto;white-space:pre-wrap">${escHtml(md)}</pre>
    `, null);
    document.getElementById('modal-save').style.display = 'none';
    document.getElementById('modal-cancel').textContent = 'Close';
  } catch (e) { alert('Error: ' + e.message); }
}

async function cancelStripeSubscription(projectId) {
  const reason = prompt('Reason for canceling the Stripe subscription? (optional)');
  if (reason === null) return; // user hit Cancel on the prompt
  if (!confirm('Cancel the active Stripe subscription for this project? This stops the monthly recurring billing.')) return;
  try {
    const r = await api(`/projects/${projectId}/cancel-stripe`, { method: 'POST', body: JSON.stringify({ reason }) });
    if (!r.success) { alert('Cancel failed: ' + (r.error || 'unknown')); return; }
    if (r.stripe && r.stripe.canceled) {
      alert('Subscription canceled.');
    } else {
      alert('Cancel result: ' + JSON.stringify(r.stripe));
    }
    showProjectDetail(projectId);
  } catch (e) { alert('Cancel failed: ' + e.message); }
}

async function recomputeShortName(projectId) {
  try {
    const r = await api(`/projects/${projectId}/recompute-short-name`, { method: 'POST', body: JSON.stringify({}) });
    if (!r.success) { alert('Failed: ' + (r.error || 'unknown')); return; }
    showProjectDetail(projectId);
  } catch (e) { alert('Failed: ' + e.message); }
}

// Mint / rotate a per-project magic-link share token, then show the URL in a modal
// so the admin can copy it and send to the stakeholders.
async function generateStakeholderShareLink(projectId) {
  let project = null;
  try {
    const r = await api(`/projects/${projectId}`);
    project = r && r.data ? r.data : null;
  } catch (_) {}
  if (!project) { alert('Could not load project.'); return; }
  const team = Array.isArray(project.team_members) ? project.team_members : [];
  if (!team.length) {
    if (!confirm('No stakeholders are listed yet. The link will only work for emails in the Stakeholders list. Continue anyway and add stakeholders after?')) return;
  }

  // Mint or rotate the token
  let resp;
  try {
    resp = await api(`/projects/${projectId}/share-token`, { method: 'POST', body: JSON.stringify({}) });
  } catch (e) {
    alert('Could not create share link: ' + e.message);
    return;
  }
  if (!resp || !resp.success) { alert('Could not create share link: ' + (resp && resp.error || 'unknown')); return; }

  const url = resp.share_url;
  const expires = resp.expires_at ? new Date(resp.expires_at).toLocaleDateString() : 'never';
  const teamRows = team.length
    ? team.map(m => `<li style="padding:2px 0;font-family:monospace;font-size:12px;color:var(--text-primary)">${escHtml(m.email || '')}</li>`).join('')
    : '<li style="color:var(--text-muted);font-style:italic">(none yet — add stakeholders so the link works for them)</li>';

  openModal('Stakeholder Share Link', `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.55">
      Send this magic link to the stakeholders below. When they open it, they will be asked to enter their email — only emails on the Stakeholders list can access the project. No account or password needed.
    </p>
    <div style="background:#0f172a;border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--text-muted);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">Share URL</div>
      <code id="m-share-url" style="display:block;word-break:break-all;color:#38bdf8;font-size:12px;line-height:1.5;user-select:all">${url}</code>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="copyShareLink('${url}', this)" style="background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;color:#020617">&#128203; Copy Link</button>
      <button class="btn btn-ghost btn-sm" onclick="emailShareLink('${url}', ${projectId})">&#9993;&#65039; Email Stakeholders</button>
      <button class="btn btn-ghost btn-sm" onclick="revokeShareLink(${projectId})" style="color:var(--danger)">&#10006; Revoke</button>
    </div>
    <div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:6px;padding:10px 12px;font-size:12px;color:var(--text-secondary);margin-bottom:12px">
      <strong style="color:var(--text-primary)">Authorized emails</strong> (the link only works for these):
      <ul style="margin:6px 0 0 16px;padding:0">${teamRows}</ul>
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin:0">Link expires: ${expires}. Clicking the button again rotates the token (the old link stops working).</p>
  `, null);
  document.getElementById('modal-save').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
}

function copyShareLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '&#10003; Copied';
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  }).catch(() => alert('Copy failed. Select and copy the link manually.'));
}

async function emailShareLink(url, projectId) {
  // Refetch the project so we can prefill recipients + subject from the
  // current stakeholder list and project name.
  let project = null;
  try {
    const r = await api(`/projects/${projectId}`);
    project = r && r.data ? r.data : null;
  } catch (_) {}

  const team = (project && Array.isArray(project.team_members)) ? project.team_members : [];
  const recipients = team
    .map(m => (m && m.email ? String(m.email).trim() : ''))
    .filter(Boolean)
    .join(',');
  const projectName = (project && project.name) ? project.name : '';

  const subject = encodeURIComponent(projectName ? `Project access link: ${projectName}` : 'Project access link');
  const body = encodeURIComponent(
    `Hi,\n\nYou have read-only access to ${projectName ? `"${projectName}"` : 'a project'} on the Digit2AI platform. Click the link below and confirm your email to view it.\n\n${url}\n\nIf you have questions, just reply to this email.\n\nThanks,\nManuel`
  );
  window.location.href = `mailto:${encodeURIComponent(recipients)}?subject=${subject}&body=${body}`;
}

async function revokeShareLink(projectId) {
  if (!confirm('Revoke this share link?\n\nThe link will stop working immediately. Generating a new link later creates a different URL.')) return;
  try {
    const r = await api(`/projects/${projectId}/share-token`, { method: 'DELETE' });
    if (!r.success) { alert('Revoke failed: ' + (r.error || 'unknown')); return; }
    alert('Share link revoked.');
    closeModal();
    showProjectDetail(projectId);
  } catch (e) { alert('Revoke failed: ' + e.message); }
}

// =====================================================
// PROJECT NDAs — per-stakeholder magic-link signing
// =====================================================
async function refreshNdaList(projectId) {
  const host = document.getElementById('nda-list-' + projectId);
  if (!host) return;
  host.innerHTML = '<p style="font-size:12px;color:var(--text-muted);font-style:italic">Loading...</p>';
  try {
    const r = await api(`/projects/${projectId}/nda-tokens`);
    const rows = (r && r.success && Array.isArray(r.data)) ? r.data : [];
    if (!rows.length) {
      host.innerHTML = '<p style="font-size:12px;color:var(--text-muted);font-style:italic">No NDAs sent yet. Click "+ New NDA" or the &#9999;&#65039; NDA button on a stakeholder above.</p>';
      return;
    }
    host.innerHTML = rows.map(n => {
      const signed = n.status === 'signed';
      const revoked = n.status === 'revoked';
      const color = signed ? '#22c55e' : (revoked ? '#94a3b8' : '#f59e0b');
      const bg = signed ? 'rgba(34,197,94,0.08)' : (revoked ? 'rgba(148,163,184,0.06)' : 'rgba(245,158,11,0.08)');
      const border = signed ? 'rgba(34,197,94,0.25)' : (revoked ? 'rgba(148,163,184,0.2)' : 'rgba(245,158,11,0.25)');
      const label = signed ? 'Signed' : (revoked ? 'Revoked' : 'Pending');
      const signedAt = n.signed_at ? new Date(n.signed_at).toLocaleString() : '';
      const langCode = (n.language === 'es') ? 'ES' : 'EN';
      const langColor = (n.language === 'es') ? '#a78bfa' : '#38bdf8';
      const actions = signed
        ? `<button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px" onclick="viewNda(${n.id})" title="View signature">View</button>`
        : (revoked
          ? ''
          : `<button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px" onclick="copyNdaLink('${escHtml(n.share_url || '').replace(/'/g, "\\'")}', this)" title="Copy magic link">&#128203; Copy</button>
             <button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px" onclick="emailNdaLink('${escHtml(n.share_url || '').replace(/'/g, "\\'")}', '${escHtml(n.stakeholder_email || '').replace(/'/g, "\\'")}', ${projectId}, '${n.language || 'en'}')" title="Email link">&#9993;&#65039; Email</button>
             <button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px;color:var(--danger)" onclick="revokeNda(${n.id}, ${projectId})" title="Revoke">&times;</button>`);
      return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;background:${bg};border:1px solid ${border};border-radius:6px;font-size:12px">
        <span style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;border-radius:10px;background:${color}22;color:${color}">${label}</span>
        <span title="Language" style="display:inline-block;padding:2px 6px;font-size:10px;font-weight:700;border-radius:4px;background:${langColor}22;color:${langColor}">${langCode}</span>
        <span style="color:var(--text-primary);font-weight:500;flex:1;min-width:140px;word-break:break-all">${escHtml(n.stakeholder_email || '')}</span>
        ${signedAt ? `<span style="font-size:11px;color:var(--text-muted)" title="Signed at">${escHtml(signedAt)}</span>` : ''}
        <span style="display:flex;gap:4px">${actions}</span>
      </div>`;
    }).join('');
  } catch (e) {
    host.innerHTML = `<p style="font-size:12px;color:var(--danger)">Failed to load NDAs: ${escHtml(e.message)}</p>`;
  }
}

function sendNda(projectId, email, role) {
  // Per-stakeholder one-click: open the modal pre-filled so language can be picked.
  openNewNdaModal(projectId, { email: email || '', title: role || '' });
}

function openNewNdaModal(projectId, prefill) {
  const pre = prefill || {};
  openModal('Send NDA Magic Link', `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">Enter the email of the person who must sign the NDA. The link is bound to that exact email &mdash; only they can complete it.</p>
    <div class="form-row" style="gap:8px">
      <div class="form-group" style="flex:1">
        <label>Email *</label>
        <input type="email" id="m-nda-email" placeholder="stakeholder@example.com" value="${escHtml(pre.email || '')}" style="width:100%">
      </div>
      <div class="form-group" style="flex:0 0 180px">
        <label>NDA language *</label>
        <select id="m-nda-language" style="width:100%">
          <option value="en">English</option>
          <option value="es">Espa&ntilde;ol (Spanish)</option>
        </select>
      </div>
    </div>
    <div class="form-row" style="gap:8px">
      <div class="form-group" style="flex:1">
        <label>Name</label>
        <input type="text" id="m-nda-name" placeholder="Jane Doe" value="${escHtml(pre.name || '')}" style="width:100%">
      </div>
      <div class="form-group" style="flex:1">
        <label>Company</label>
        <input type="text" id="m-nda-company" placeholder="Acme Inc." value="${escHtml(pre.company || '')}" style="width:100%">
      </div>
      <div class="form-group" style="flex:0 0 140px">
        <label>Title</label>
        <input type="text" id="m-nda-title" placeholder="CTO" value="${escHtml(pre.title || '')}" style="width:100%">
      </div>
    </div>
    <div class="form-group">
      <label>Purpose (optional)</label>
      <textarea id="m-nda-purpose" rows="2" placeholder="Defaults to: discussing the technical details of this project" style="width:100%"></textarea>
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin:0">Tip: pick <strong>Espa&ntilde;ol</strong> for Latin American stakeholders &mdash; the entire signing page (and the NDA itself) renders in Spanish.</p>
  `, async () => {
    const email = (document.getElementById('m-nda-email').value || '').trim();
    if (!email) { alert('Email is required.'); return; }
    const payload = {
      email,
      language: document.getElementById('m-nda-language').value || 'en',
      name: (document.getElementById('m-nda-name').value || '').trim() || null,
      company: (document.getElementById('m-nda-company').value || '').trim() || null,
      title: (document.getElementById('m-nda-title').value || '').trim() || null,
      purpose: (document.getElementById('m-nda-purpose').value || '').trim() || null
    };
    try {
      const r = await api(`/projects/${projectId}/nda-tokens`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!r || !r.success) { alert('Failed: ' + (r && r.error || 'unknown')); return; }
      closeModal();
      showNdaLinkModal(r.share_url, email, projectId, r.expires_at, payload.language);
      refreshNdaList(projectId);
    } catch (e) { alert('Failed: ' + e.message); }
  });
  // Detect Spanish-y domains and default the picker accordingly
  setTimeout(() => {
    try {
      const langSel = document.getElementById('m-nda-language');
      if (!langSel) return;
      const e = (pre.email || '').toLowerCase();
      if (/\.(co|mx|ar|cl|pe|ve|ec|uy|py|bo|cr|gt|hn|sv|ni|pa|do|cu|pr|es)$/.test(e)) {
        langSel.value = 'es';
      }
    } catch (_) {}
  }, 0);
  document.getElementById('modal-save').textContent = 'Create Link';
}

function showNdaLinkModal(url, email, projectId, expiresAt, language) {
  const expires = expiresAt ? new Date(expiresAt).toLocaleDateString() : '60 days';
  const lang = (language === 'es') ? 'es' : 'en';
  const langLabel = (lang === 'es') ? 'Espa&ntilde;ol' : 'English';
  openModal('NDA Magic Link Ready', `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.55">
      Send this link to <strong style="color:var(--text-primary)">${escHtml(email)}</strong>. They will see the NDA in <strong style="color:var(--text-primary)">${langLabel}</strong> between DIGIT2AI LLC and themselves, and can sign electronically. This link is bound to that exact email.
    </p>
    <div style="background:#0f172a;border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--text-muted);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">NDA URL &middot; ${lang.toUpperCase()}</div>
      <code style="display:block;word-break:break-all;color:#38bdf8;font-size:12px;line-height:1.5;user-select:all">${escHtml(url)}</code>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="copyNdaLink('${escHtml(url).replace(/'/g, "\\'")}', this)" style="background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;color:#020617">&#128203; Copy Link</button>
      <button class="btn btn-ghost btn-sm" onclick="emailNdaLink('${escHtml(url).replace(/'/g, "\\'")}', '${escHtml(email).replace(/'/g, "\\'")}', ${projectId}, '${lang}')">&#9993;&#65039; Email Stakeholder</button>
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:14px">Expires: ${expires}. Signed NDAs are stored in the project tracker database with IP, user-agent, and timestamp.</p>
  `, null);
  document.getElementById('modal-save').style.display = 'none';
  document.getElementById('modal-cancel').textContent = 'Close';
}

function copyNdaLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '&#10003; Copied';
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  }).catch(() => alert('Copy failed. Select and copy the link manually.'));
}

async function emailNdaLink(url, email, projectId, language) {
  let projectName = '';
  try {
    const r = await api(`/projects/${projectId}`);
    projectName = (r && r.data && r.data.name) ? r.data.name : '';
  } catch (_) {}
  const lang = (language === 'es') ? 'es' : 'en';
  let subject, body;
  if (lang === 'es') {
    subject = encodeURIComponent(projectName ? `NDA para ${projectName}` : 'NDA — Digit2AI');
    body = encodeURIComponent(
      `Hola,\n\nAntes de discutir los detalles tecnicos de ${projectName ? `"${projectName}"` : 'la solucion propuesta'}, por favor revisa y firma el NDA en el enlace de abajo. Es entre DIGIT2AI LLC y tu persona, y el enlace esta asociado a este correo.\n\n${url}\n\nGracias,\nManuel\nDIGIT2AI LLC`
    );
  } else {
    subject = encodeURIComponent(projectName ? `NDA for ${projectName}` : 'NDA — Digit2AI');
    body = encodeURIComponent(
      `Hi,\n\nBefore we discuss the technical details of ${projectName ? `"${projectName}"` : 'the proposed solution'}, please review and sign the NDA at the link below. It is between DIGIT2AI LLC and you, and the link is bound to this email address.\n\n${url}\n\nThanks,\nManuel\nDIGIT2AI LLC`
    );
  }
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

async function revokeNda(ndaId, projectId) {
  if (!confirm('Revoke this NDA?\n\nThe link will stop working immediately. Already-signed NDAs cannot be revoked.')) return;
  try {
    const r = await api(`/projects/nda-tokens/${ndaId}`, { method: 'DELETE' });
    if (!r || !r.success) { alert('Failed: ' + (r && r.error || 'unknown')); return; }
    refreshNdaList(projectId);
  } catch (e) { alert('Failed: ' + e.message); }
}

async function viewNda(ndaId) {
  try {
    const r = await api(`/projects/nda-tokens/${ndaId}`);
    if (!r || !r.success) { alert('Failed to load NDA.'); return; }
    const d = r.data;
    const signedAt = d.signed_at ? new Date(d.signed_at).toLocaleString() : '';
    openModal(`NDA — ${d.stakeholder_email}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Signer</div>
          <div style="font-size:14px;color:var(--text-primary);margin-top:4px">${escHtml(d.stakeholder_name || '')}</div>
          <div style="font-size:12px;color:var(--text-muted)">${escHtml(d.stakeholder_title || '')} &middot; ${escHtml(d.stakeholder_company || '')}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${escHtml(d.stakeholder_email || '')}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Signed at</div>
          <div style="font-size:13px;color:var(--text-primary);margin-top:4px">${escHtml(signedAt)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Language: <span style="color:var(--text-primary)">${(d.language === 'es') ? 'Espa&ntilde;ol' : 'English'}</span></div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">IP: ${escHtml(d.signed_ip || '-')}</div>
        </div>
      </div>
      ${d.signature_data ? `<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Signature</div>
        <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:14px">
          <img src="${d.signature_data}" alt="signature" style="max-width:100%;display:block">
        </div>` : ''}
      <details style="margin-top:6px">
        <summary style="font-size:12px;color:var(--accent);cursor:pointer">View frozen NDA text</summary>
        <pre style="white-space:pre-wrap;font-size:11px;color:var(--text-secondary);background:#0f172a;border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:8px;max-height:300px;overflow-y:auto;font-family:inherit">${escHtml(d.nda_text || '')}</pre>
      </details>
    `, null);
    document.getElementById('modal-save').style.display = 'none';
    document.getElementById('modal-cancel').textContent = 'Close';
  } catch (e) { alert('Failed: ' + e.message); }
}

async function editStakeholders(projectId) {
  let current = [];
  try {
    const r = await api(`/projects/${projectId}`);
    current = (r && r.data && Array.isArray(r.data.team_members)) ? r.data.team_members.slice() : [];
  } catch (_) {}
  // Always have at least one empty row to encourage adding
  if (!current.length) current.push({ email: '', role: 'stakeholder' });
  const renderRows = () => current.map((m, i) => `
    <div class="form-row" data-row="${i}" style="gap:8px;align-items:center">
      <div class="form-group" style="flex:1">
        <input type="email" class="m-sh-email" placeholder="email@example.com" value="${escHtml(m.email || '')}" style="width:100%">
      </div>
      <div class="form-group" style="flex:0 0 140px">
        <input type="text" class="m-sh-role" placeholder="role (optional)" value="${escHtml(m.role || 'stakeholder')}" style="width:100%">
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="window._sh_remove(${i})" style="color:var(--danger);flex:0 0 auto" title="Remove">&times;</button>
    </div>`).join('');

  openModal('Project Stakeholders', `
    <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px">Add the email addresses that should receive: contract send, UAT handoff, revision alerts, and shipped confirmations. The project submitter and Manuel are always included automatically.</p>
    <div id="m-sh-rows">${renderRows()}</div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="window._sh_add()" style="margin-top:8px">+ Add another stakeholder</button>
  `, async () => {
    const rows = Array.from(document.querySelectorAll('#m-sh-rows .form-row'));
    const team_members = rows.map(row => {
      const email = (row.querySelector('.m-sh-email').value || '').trim().toLowerCase();
      const role = (row.querySelector('.m-sh-role').value || 'stakeholder').trim() || 'stakeholder';
      return { email, role };
    }).filter(m => m.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email));

    // Dedupe by email
    const seen = new Set();
    const deduped = team_members.filter(m => seen.has(m.email) ? false : (seen.add(m.email), true));

    await api(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ team_members: deduped }) });
    closeModal();
    showProjectDetail(projectId);
  });

  // Wire up dynamic add/remove on the modal
  window._sh_add = function() {
    current.push({ email: '', role: 'stakeholder' });
    document.getElementById('m-sh-rows').innerHTML = renderRows();
  };
  window._sh_remove = function(i) {
    current.splice(i, 1);
    if (!current.length) current.push({ email: '', role: 'stakeholder' });
    document.getElementById('m-sh-rows').innerHTML = renderRows();
  };
}

async function editRevenuePricing(projectId) {
  let plan = null;
  try {
    const r = await api(`/projects/${projectId}`);
    plan = (r && r.data && r.data.business_plan_json) || null;
  } catch (_) {}
  if (!plan) { alert('No business plan to edit.'); return; }
  const tiers = (plan.revenue_model && Array.isArray(plan.revenue_model.pricing_tiers))
    ? plan.revenue_model.pricing_tiers.map(t => ({ name: t.name || '', price_usd: Number(t.price_usd || 0), period: t.period || 'monthly' }))
    : [];

  const rows = tiers.map((t, i) => `
    <div class="form-row" data-tier="${i}" style="gap:8px;align-items:flex-end">
      <div class="form-group" style="flex:2">
        <label style="font-size:11px;color:var(--text-muted)">Name</label>
        <input type="text" class="m-rt-name" value="${escHtml(t.name)}" style="width:100%">
      </div>
      <div class="form-group" style="flex:1">
        <label style="font-size:11px;color:var(--text-muted)">Price (USD)</label>
        <input type="number" class="m-rt-price" step="0.01" min="0" value="${t.price_usd}" style="width:100%">
      </div>
      <div class="form-group" style="flex:1">
        <label style="font-size:11px;color:var(--text-muted)">Period</label>
        <input type="text" class="m-rt-period" value="${escHtml(t.period)}" placeholder="monthly / yearly / per project" style="width:100%">
      </div>
    </div>`).join('');

  openModal('Edit Pricing Tiers', `
    <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px">Adjust the Revenue Model pricing tiers Claude generated. Changes are saved to the business plan JSON immediately and reflected in the dashboard.</p>
    ${tiers.length ? rows : '<p style="color:var(--text-muted);font-style:italic">This business plan has no pricing tiers to edit. Regenerate the plan first.</p>'}
    <p style="font-size:11px;color:var(--text-muted);margin-top:12px">Tip: the Year 1 / Year 3 revenue estimates and the service contract terms are NOT updated automatically — those reflect different math. Edit them separately if needed.</p>
  `, async () => {
    const rowEls = Array.from(document.querySelectorAll('[data-tier]'));
    const updatedTiers = rowEls.map(el => ({
      name: (el.querySelector('.m-rt-name').value || '').trim(),
      price_usd: Number(el.querySelector('.m-rt-price').value || 0),
      period: (el.querySelector('.m-rt-period').value || 'monthly').trim()
    })).filter(t => t.name);

    const updatedPlan = JSON.parse(JSON.stringify(plan));
    updatedPlan.revenue_model = updatedPlan.revenue_model || {};
    updatedPlan.revenue_model.pricing_tiers = updatedTiers;

    await api(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ business_plan_json: updatedPlan }) });
    closeModal();
    showBusinessPlanView(projectId, updatedPlan, new Date().toISOString(), window._currentBpContract);
  });
}

async function editProjectTargets(projectId) {
  let current = {};
  try {
    const r = await api(`/projects/${projectId}`);
    current = (r && r.data) || {};
  } catch (_) {}
  openModal('Project Targets', `
    <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px">Delivery window + total price drive the AI plan (as hard constraints) and the 12-month service contract (monthly = total / 12).</p>
    <div class="form-row">
      <div class="form-group">
        <label>Delivery Timeframe (weeks)</label>
        <input type="number" id="m-pt-delivery" min="1" max="260" step="1" value="${current.target_delivery_weeks || ''}">
      </div>
      <div class="form-group">
        <label>Total Price (USD)</label>
        <input type="number" id="m-pt-total" min="1" step="100" value="${current.target_total_usd || ''}">
      </div>
    </div>
  `, async () => {
    const weeks = Number(document.getElementById('m-pt-delivery').value) || null;
    const total = Number(document.getElementById('m-pt-total').value) || null;
    await api(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify({ target_delivery_weeks: weeks, target_total_usd: total })
    });
    closeModal();
    showProjectDetail(projectId);
  });
}

async function editBusinessRequirements(projectId) {
  let current = '';
  try {
    const r = await api(`/projects/${projectId}`);
    current = r?.data?.business_requirements || '';
  } catch (_) {}
  openModal('Business Requirements', `
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Capture stakeholder needs, success criteria, constraints, and assumptions gathered during the kickoff meeting. Markdown ok.</p>
    <textarea id="m-breq" rows="14" style="width:100%;font-family:inherit;font-size:13px;line-height:1.5;resize:vertical;padding:10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary)">${escHtml(current)}</textarea>
  `, async () => {
    const body = { business_requirements: document.getElementById('m-breq').value };
    await api(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(body) });
    closeModal();
    showProjectDetail(projectId);
  });
}

// Render existing notes into HTML for the rich-text editor.
// Backward-compat: plain-text (no HTML tags) -> escape + convert newlines to <br>.
// Already-HTML notes (contain a tag) -> render as-is.
function renderNotesHtml(s) {
  if (!s) return '';
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(s);
  if (looksLikeHtml) return s;
  return escHtml(s).replace(/\n/g, '<br>');
}

function onProjectNotesChange(projectId) {
  const ed = document.getElementById(`project-notes-${projectId}`);
  const btn = document.getElementById(`notes-save-btn-${projectId}`);
  const status = document.getElementById(`notes-status-${projectId}`);
  if (!ed || !btn) return;
  const dirty = ed.innerHTML !== (ed.dataset.original || '');
  btn.disabled = !dirty;
  if (status) status.textContent = dirty ? 'Unsaved changes' : '';
}

function notesCmd(projectId, command, value) {
  const ed = document.getElementById(`project-notes-${projectId}`);
  if (!ed) return;
  ed.focus();
  document.execCommand(command, false, value || null);
  onProjectNotesChange(projectId);
}

function notesLink(projectId) {
  const ed = document.getElementById(`project-notes-${projectId}`);
  if (!ed) return;
  const url = prompt('Link URL:', 'https://');
  if (!url) return;
  ed.focus();
  document.execCommand('createLink', false, url);
  onProjectNotesChange(projectId);
}

async function saveProjectNotes(projectId) {
  const ed = document.getElementById(`project-notes-${projectId}`);
  const btn = document.getElementById(`notes-save-btn-${projectId}`);
  const status = document.getElementById(`notes-status-${projectId}`);
  if (!ed) return;
  const notes = ed.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  if (status) status.textContent = 'Saving...';
  try {
    const r = await api(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ notes }) });
    if (!r.success) throw new Error(r.error || 'unknown');
    ed.dataset.original = notes;
    if (status) {
      status.textContent = 'Saved';
      setTimeout(() => { if (status) status.textContent = ''; }, 2000);
    }
    if (btn) { btn.textContent = 'Save Notes'; btn.disabled = true; }
  } catch (e) {
    if (status) status.textContent = 'Save failed';
    if (btn) { btn.textContent = 'Save Notes'; btn.disabled = false; }
    alert('Could not save notes: ' + e.message);
  }
}

async function archiveContact(id) { if (confirm('Archive this contact?')) { await api(`/contacts/${id}/archive`, { method: 'PUT' }); navigateTo('contacts'); } }
async function deleteContact(id) { if (confirm('Permanently delete this contact? This cannot be undone.')) { await api(`/contacts/${id}`, { method: 'DELETE' }); navigateTo('contacts'); } }
async function archiveProject(id) { if (confirm('Archive this project?')) { await api(`/projects/${id}/archive`, { method: 'PUT' }); navigateTo('projects'); } }
async function unarchiveProject(id) {
  if (!confirm('Restore this project from the archive?\n\nIt will return to the "Active" status.')) return;
  const r = await api(`/projects/${id}/unarchive`, { method: 'PUT', body: JSON.stringify({ status: 'active' }) });
  if (!r.success) { alert('Unarchive failed: ' + (r.error || 'unknown')); return; }
  if (typeof showCopyToast === 'function') showCopyToast('Project restored');
  showProjectDetail(id);
}
window.unarchiveProject = unarchiveProject;

async function deleteProject(id, name) {
  const label = name || 'this project';
  if (!confirm('PERMANENTLY DELETE "' + label + '"?\n\nThis cannot be undone. All milestones, intake answers, comments, votes, and Q&A will be removed. Linked tasks and calendar events will be unlinked.')) return;
  const typed = prompt('Type DELETE to confirm:');
  if (typed !== 'DELETE') return;
  try {
    const res = await api(`/projects/${id}`, { method: 'DELETE' });
    if (!res.success) { alert('Delete failed: ' + (res.error || 'unknown')); return; }
    navigateTo('projects');
    refreshInboxBadge();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

// =====================================================
// AI BUSINESS PLAN GENERATION (full-view, not modal)
// Pre-flight modal: capture delivery_months + total_price
// so the AI plan honors them and the contract uses
// total / 12 for the monthly recurring fee.
// =====================================================
async function generateBusinessPlan(projectId) {
  // Load current project values to pre-fill the pre-flight modal
  let current = {};
  try {
    const r = await api(`/projects/${projectId}`);
    current = (r && r.data) || {};
  } catch (_) {}

  openModal('Generate Business Plan & Contract', `
    <p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px">
      Set the delivery window and total price <strong>before</strong> generating. The AI plan will honor these as hard constraints, and the service contract will use them for the 12-month engagement (monthly fee = total / 12).
    </p>
    <div class="form-row">
      <div class="form-group">
        <label>Delivery Timeframe (weeks) *</label>
        <input type="number" id="m-bp-delivery" min="1" max="260" step="1" value="${current.target_delivery_weeks || 24}">
        <small style="display:block;color:var(--text-muted);font-size:11px;margin-top:4px">How many weeks until the project is delivered.</small>
      </div>
      <div class="form-group">
        <label>Total Price (USD) *</label>
        <input type="number" id="m-bp-total" min="1" step="100" value="${current.target_total_usd || 50000}">
        <small style="display:block;color:var(--text-muted);font-size:11px;margin-top:4px">Full project cost. Monthly = total / 12.</small>
      </div>
    </div>
    <div style="padding:10px 12px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:6px;font-size:12px;color:var(--text-secondary);margin-top:8px">
      <strong>Contract terms (fixed):</strong> 12-month engagement, 10% deposit on signature, monthly recurring billing for the remaining 11 months. Delivery window is independent of the billing term. Generation takes ~30 seconds.
    </div>
  `, async () => {
    const weeks = Number(document.getElementById('m-bp-delivery').value);
    const total = Number(document.getElementById('m-bp-total').value);
    if (!weeks || weeks < 1) { alert('Delivery timeframe must be at least 1 week.'); return; }
    if (!total || total < 1) { alert('Total price must be greater than zero.'); return; }

    // Persist targets on the project first
    try {
      const save = await api(`/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({ target_delivery_weeks: weeks, target_total_usd: total })
      });
      if (!save.success) { alert('Could not save targets: ' + (save.error || 'unknown')); return; }
    } catch (e) { alert('Could not save targets: ' + e.message); return; }

    closeModal();
    await runBusinessPlanGeneration(projectId);
  });
  // Relabel the save button so the intent is obvious
  const saveBtn = document.getElementById('modal-save');
  if (saveBtn) saveBtn.textContent = 'Save & Generate';
}

async function runBusinessPlanGeneration(projectId) {
  const container = document.getElementById('view-container');
  document.getElementById('page-title').textContent = 'Generating Business Plan...';
  container.innerHTML = `
    <div class="detail-panel" style="max-width:720px;margin:60px auto;text-align:center">
      <h2 style="margin-top:0">Generating Business Plan</h2>
      <div class="spinner" style="margin:24px auto"></div>
      <p style="color:var(--text-secondary)" id="bp-status">Calling Claude...</p>
      <p style="font-size:12px;color:var(--text-muted)">This usually takes 20-40 seconds. Do not close the tab.</p>
    </div>`;
  setTimeout(() => { const s = document.getElementById('bp-status'); if (s) s.textContent = 'Building plan (TAM, GTM, team roles, budget...)'; }, 4000);
  setTimeout(() => { const s = document.getElementById('bp-status'); if (s) s.textContent = 'Drafting service contract...'; }, 18000);
  try {
    const res = await api(`/projects/${projectId}/generate-business-plan`, { method: 'POST', body: JSON.stringify({}) });
    if (!res.success) {
      container.innerHTML = `<div class="detail-panel" style="max-width:600px;margin:60px auto"><h2>Generation failed</h2><p style="color:var(--danger)">${res.error || 'Unknown error'}</p><button class="btn btn-ghost" onclick="showProjectDetail(${projectId})">&#8592; Back to project</button></div>`;
      return;
    }
    showBusinessPlanView(projectId, res.plan, res.generated_at, res.contract);
  } catch (e) {
    container.innerHTML = `<div class="detail-panel" style="max-width:600px;margin:60px auto"><h2>Generation failed</h2><p style="color:var(--danger)">${e.message}</p><button class="btn btn-ghost" onclick="showProjectDetail(${projectId})">&#8592; Back to project</button></div>`;
  }
}

async function openBusinessPlan(projectId) {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="spinner"></div>';
  document.getElementById('page-title').textContent = 'Business Plan';
  const res = await api(`/projects/${projectId}/business-plan`);
  if (!res.success) {
    alert('No business plan: ' + (res.error || 'not generated yet'));
    showProjectDetail(projectId);
    return;
  }
  // Pull the latest contract for this project (if any) so we can render
  // the Review / Edit / Send card alongside the business plan.
  let contract = null;
  try {
    const cRes = await api(`/contracts?project_id=${projectId}`);
    if (cRes && cRes.success && Array.isArray(cRes.data) && cRes.data.length) {
      contract = cRes.data[0]; // most recent (route orders by created_at DESC)
    }
  } catch (_) { /* contract panel is optional */ }
  showBusinessPlanView(projectId, res.plan, res.generated_at, contract);
}

function fmtUsd(n) {
  if (typeof n !== 'number' || isNaN(n)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function showBusinessPlanView(projectId, plan, generatedAt, contract) {
  document.getElementById('page-title').textContent = 'Business Plan';
  const container = document.getElementById('view-container');
  // Stash for refresh after edit/send
  window._currentBpProjectId = projectId;
  window._currentBpPlan = plan;
  window._currentBpGeneratedAt = generatedAt;
  window._currentBpContract = contract || null;
  const tabs = [
    { key: 'summary', label: 'Executive Summary' },
    { key: 'market', label: 'Problem & Market' },
    { key: 'solution', label: 'Solution' },
    { key: 'gtm', label: 'Go-to-Market' },
    { key: 'revenue', label: 'Revenue Model' },
    { key: 'team', label: 'Team Roles' },
    { key: 'budget', label: 'Budget' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'risks', label: 'Risks' },
    { key: 'kpis', label: 'KPIs' }
  ];
  const tabBar = tabs.map((t, i) => `
    <button class="bp-tab ${i === 0 ? 'active' : ''}" data-tab="${t.key}"
      style="padding:10px 16px;font-size:13px;font-weight:600;background:transparent;border:none;border-bottom:2px solid ${i === 0 ? 'var(--accent)' : 'transparent'};color:${i === 0 ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;white-space:nowrap"
      onclick="switchBusinessPlanTab('${t.key}', this)">${t.label}</button>`).join('');

  const sections = {
    summary: `
      <h3 style="margin-top:0">${escHtml(plan.title || 'Business Plan')}</h3>
      <p style="font-size:14px;line-height:1.6;color:var(--text-secondary);white-space:pre-wrap">${escHtml(plan.executive_summary || '')}</p>`,
    market: (() => {
      const pm = plan.problem_market || {};
      return `
        <h4>Problem statement</h4>
        <p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${escHtml(pm.problem_statement || '-')}</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px">
          <div class="card" style="padding:14px;text-align:center"><div style="font-size:11px;color:var(--text-muted)">TAM</div><div style="font-size:20px;font-weight:700;color:var(--accent)">${fmtUsd(pm.tam_usd)}</div></div>
          <div class="card" style="padding:14px;text-align:center"><div style="font-size:11px;color:var(--text-muted)">SAM</div><div style="font-size:20px;font-weight:700;color:var(--accent)">${fmtUsd(pm.sam_usd)}</div></div>
          <div class="card" style="padding:14px;text-align:center"><div style="font-size:11px;color:var(--text-muted)">SOM</div><div style="font-size:20px;font-weight:700;color:var(--accent)">${fmtUsd(pm.som_usd)}</div></div>
        </div>
        <h4 style="margin-top:18px">Target segments</h4>
        <ul style="font-size:13px;color:var(--text-secondary);padding-left:20px">${(pm.target_segments || []).map(s => `<li>${escHtml(s)}</li>`).join('') || '<li>-</li>'}</ul>`;
    })(),
    solution: (() => {
      const s = plan.solution || {};
      return `
        <h4>Description</h4>
        <p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${escHtml(s.description || '-')}</p>
        <h4>Key differentiators</h4>
        <ul style="font-size:13px;color:var(--text-secondary);padding-left:20px">${(s.key_differentiators || []).map(d => `<li>${escHtml(d)}</li>`).join('') || '<li>-</li>'}</ul>
        <h4>Tech stack / methodology</h4>
        <ul style="font-size:13px;color:var(--text-secondary);padding-left:20px">${(s.tech_stack_or_methodology || []).map(d => `<li>${escHtml(d)}</li>`).join('') || '<li>-</li>'}</ul>`;
    })(),
    gtm: (() => {
      const g = plan.go_to_market || {};
      const phases = (g.phases || []).map(p => `
        <div class="card" style="padding:12px;margin-bottom:8px">
          <strong>${escHtml(p.name || '')}</strong> <span style="color:var(--text-muted);font-size:12px">(${p.duration_months || '-'} months)</span>
          <ul style="font-size:13px;color:var(--text-secondary);padding-left:20px;margin-top:6px">${(p.activities || []).map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>
        </div>`).join('');
      const regions = (g.regional_priorities || []).map(r => `<li><strong>${escHtml(r.region || '')}:</strong> ${escHtml(r.rationale || '')}</li>`).join('');
      return `
        <h4>Phases</h4>${phases || '<p style="color:var(--text-muted)">-</p>'}
        <h4>Channel strategy</h4><p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${escHtml(g.channel_strategy || '-')}</p>
        <h4>Regional priorities</h4><ul style="font-size:13px;color:var(--text-secondary);padding-left:20px">${regions || '<li>-</li>'}</ul>`;
    })(),
    revenue: (() => {
      const r = plan.revenue_model || {};
      const tiers = (r.pricing_tiers || []).map(t => `
        <div class="card" style="padding:12px"><div style="font-size:13px;color:var(--text-muted)">${escHtml(t.name || '')}</div><div style="font-size:18px;font-weight:700">${fmtUsd(t.price_usd)} <span style="font-size:11px;color:var(--text-muted)">/ ${escHtml(t.period || '')}</span></div></div>`).join('');
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h4 style="margin:0">Pricing tiers</h4>
          <button class="btn btn-ghost btn-sm" onclick="editRevenuePricing(${projectId})">&#9881; Edit Pricing</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">${tiers || '<p style="color:var(--text-muted)">-</p>'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px">
          <div class="card" style="padding:14px"><div style="font-size:11px;color:var(--text-muted)">Year 1 estimate</div><div style="font-size:20px;font-weight:700;color:var(--success)">${fmtUsd(r.year1_revenue_estimate_usd)}</div></div>
          <div class="card" style="padding:14px"><div style="font-size:11px;color:var(--text-muted)">Year 3 estimate</div><div style="font-size:20px;font-weight:700;color:var(--success)">${fmtUsd(r.year3_revenue_estimate_usd)}</div></div>
        </div>`;
    })(),
    team: (() => {
      const roles = plan.team_roles_required || [];
      return roles.map(r => `
        <div class="card" style="padding:14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
            <strong style="font-size:15px">${escHtml(r.role_title || '')}</strong>
            <div>${r.must_have ? '<span class="tag" style="background:rgba(244,63,94,.14);color:#fb7185">Must-have</span>' : ''} <span class="tag">${r.commitment_pct || 0}% commitment</span></div>
          </div>
          ${(r.responsibilities || []).length ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">Responsibilities</div><ul style="font-size:13px;color:var(--text-secondary);padding-left:20px">${r.responsibilities.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul>` : ''}
          ${(r.required_skills || []).length ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">Required skills:</div> <div>${r.required_skills.map(x => `<span class="tag">${escHtml(x)}</span>`).join(' ')}</div>` : ''}
        </div>`).join('') || '<p style="color:var(--text-muted)">-</p>';
    })(),
    budget: (() => {
      const items = plan.budget_breakdown || [];
      const total = items.reduce((s, b) => s + (Number(b.amount_usd) || 0), 0);
      return `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:8px">Category</th><th style="text-align:left;padding:8px">Phase</th><th style="text-align:right;padding:8px">Amount</th></tr></thead>
          <tbody>${items.map(b => `<tr style="border-bottom:1px solid var(--border)"><td style="padding:8px">${escHtml(b.category || '')}</td><td style="padding:8px;color:var(--text-muted)">${escHtml(b.phase || '')}</td><td style="padding:8px;text-align:right;font-family:monospace">${fmtUsd(b.amount_usd)}</td></tr>`).join('') || '<tr><td colspan=3 style="padding:8px;color:var(--text-muted)">-</td></tr>'}</tbody>
          <tfoot><tr><td colspan=2 style="padding:8px;font-weight:700">Total</td><td style="padding:8px;text-align:right;font-weight:700;color:var(--accent);font-family:monospace">${fmtUsd(total)}</td></tr></tfoot>
        </table>`;
    })(),
    timeline: (() => {
      const ms = plan.timeline_milestones || [];
      return ms.map(m => `<div class="timeline-item" style="border-left:3px solid var(--accent);padding-left:14px;margin-bottom:10px"><div class="timeline-content"><strong>Month ${m.month || '?'}: ${escHtml(m.milestone || '')}</strong><br><span style="font-size:13px;color:var(--text-secondary)">${escHtml(m.deliverable || '')}</span></div></div>`).join('') || '<p style="color:var(--text-muted)">-</p>';
    })(),
    risks: (() => {
      const rs = plan.risks || [];
      return rs.map(r => `<div class="card" style="padding:12px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${escHtml(r.risk || '')}</strong><span class="tag">${escHtml(String(r.likelihood || ''))}</span></div><div style="font-size:13px;color:var(--text-secondary);margin-top:6px">Mitigation: ${escHtml(r.mitigation || '')}</div></div>`).join('') || '<p style="color:var(--text-muted)">-</p>';
    })(),
    kpis: (() => {
      const ks = plan.success_kpis || [];
      return `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:8px">KPI</th><th style="text-align:left;padding:8px">Target</th><th style="text-align:left;padding:8px">Period</th></tr></thead><tbody>${ks.map(k => `<tr style="border-bottom:1px solid var(--border)"><td style="padding:8px">${escHtml(k.kpi || '')}</td><td style="padding:8px;color:var(--accent)">${escHtml(k.target || '')}</td><td style="padding:8px;color:var(--text-muted)">${escHtml(k.measurement_period || '')}</td></tr>`).join('') || '<tr><td colspan=3 style="padding:8px;color:var(--text-muted)">-</td></tr>'}</tbody></table>`;
    })()
  };

  // Stash sections globally so tab switcher can read them
  window._bpSections = sections;

  const contractCard = renderContractCard(projectId, contract);

  container.innerHTML = `
    <div class="detail-panel" style="max-width:1100px;margin:0 auto">
      <div class="detail-header" style="margin-bottom:8px">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="showProjectDetail(${projectId})" style="margin-bottom:8px">&#8592; Back to Project</button>
          <h2 style="margin:0;background:linear-gradient(90deg,#38bdf8,#a78bfa,#f472b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${escHtml(plan.title || 'AI-Generated Business Plan')}</h2>
          <p style="color:var(--text-muted);font-size:12px;margin-top:4px">Generated ${generatedAt ? new Date(generatedAt).toLocaleString() : ''}</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window.print()" title="Print or save as PDF">&#128424; Print</button>
          <button class="btn btn-ghost btn-sm" onclick="generateBusinessPlan(${projectId})" title="Regenerate (overwrites)">&#8635; Regenerate</button>
        </div>
      </div>
      ${contractCard}
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);overflow-x:auto;margin-bottom:18px;white-space:nowrap;position:sticky;top:0;background:var(--bg-base);z-index:5">${tabBar}</div>
      <div id="bp-content" style="padding:8px 4px 60px">${sections.summary}</div>
    </div>`;
}

// =====================================================
// SERVICE CONTRACT CARD (rendered above business plan tabs)
// =====================================================
function renderContractCard(projectId, contract) {
  if (!contract) {
    return `<div class="card" style="padding:16px;margin:16px 0;border:1px dashed var(--border);background:rgba(248,250,252,0.02)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Service Contract</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">No contract drafted yet for this project.</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="autoDraftContract(${projectId})">Draft Contract</button>
      </div>
    </div>`;
  }
  const fmt = n => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: contract.currency || 'USD', maximumFractionDigits: 0 });
  const statusColor = ({
    draft: '#94a3b8',
    sent: '#38bdf8',
    signed: '#a78bfa',
    active: '#22c55e',
    canceled: '#f43f5e'
  })[contract.status] || '#94a3b8';
  const statusLabel = (contract.status || 'draft').toUpperCase();
  const sentLine = contract.sent_at ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Sent ${new Date(contract.sent_at).toLocaleString()}</div>` : '';

  return `<div class="card" style="padding:18px;margin:16px 0;border:1px solid rgba(167,139,250,0.35);background:linear-gradient(120deg,rgba(56,189,248,0.06),rgba(167,139,250,0.06))">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:14px;font-weight:700;color:var(--text-primary)">Service Contract</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${statusColor};color:#020617">${statusLabel}</span>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:12px">
          <div><span style="color:var(--text-muted)">Total</span><br><strong style="font-size:14px">${fmt(contract.total_amount_usd)}</strong></div>
          <div><span style="color:var(--text-muted)">Deposit (${Number(contract.deposit_percent || 0)}%)</span><br><strong style="font-size:14px">${fmt(contract.deposit_amount_usd)}</strong></div>
          <div><span style="color:var(--text-muted)">Monthly</span><br><strong style="font-size:14px">${fmt(contract.monthly_amount_usd)}</strong></div>
        </div>
        ${sentLine}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="reviewContract(${contract.id})" title="View full contract text">Review</button>
        <button class="btn btn-ghost btn-sm" onclick="editContract(${contract.id})" title="Edit amounts & scope">Edit</button>
        <button class="btn btn-primary btn-sm" onclick="sendContract(${contract.id}, ${projectId})" style="background:linear-gradient(90deg,#38bdf8,#a78bfa);border:none;color:#020617" title="Email contract to stakeholders">Send</button>
      </div>
    </div>
  </div>`;
}

async function autoDraftContract(projectId) {
  // If the user wants to manually draft (e.g., business plan didn't auto-draft for some reason)
  if (!confirm('Draft a service contract for this project? Defaults to 10% deposit + monthly subscription derived from the business plan budget.')) return;
  try {
    const res = await api('/contracts', { method: 'POST', body: JSON.stringify({ project_id: projectId }) });
    if (!res.success) { alert('Draft failed: ' + (res.error || 'unknown')); return; }
    openBusinessPlan(projectId);
  } catch (e) { alert('Draft failed: ' + e.message); }
}

async function reviewContract(contractId) {
  try {
    const res = await api(`/contracts/${contractId}`);
    if (!res.success) { alert('Could not load contract: ' + (res.error || 'unknown')); return; }
    const c = res.data;
    const fmt = n => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: c.currency || 'USD' });
    openModal('Service Contract', `
      <div style="max-height:60vh;overflow-y:auto;padding:8px 12px;background:#fff;color:#222;border-radius:6px">${c.contract_html || '<em>No contract text</em>'}</div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:10px"><strong>Signoff URL:</strong> <a href="${c.signoff_url}" target="_blank" style="color:var(--accent);word-break:break-all">${c.signoff_url}</a></p>
      <p style="font-size:12px;color:var(--text-muted);margin-top:6px">Total: ${fmt(c.total_amount_usd)} | Deposit ${c.deposit_percent}%: ${fmt(c.deposit_amount_usd)} | Monthly: ${fmt(c.monthly_amount_usd)} | Status: <strong>${c.status}</strong></p>
    `, null);
    // Hide Save button for review-only mode and relabel Cancel -> Close
    document.getElementById('modal-save').style.display = 'none';
    document.getElementById('modal-cancel').textContent = 'Close';
  } catch (e) { alert('Could not load contract: ' + e.message); }
}

async function editContract(contractId) {
  try {
    const res = await api(`/contracts/${contractId}`);
    if (!res.success) { alert('Could not load contract: ' + (res.error || 'unknown')); return; }
    const c = res.data;
    openModal('Edit Contract', `
      <div class="form-row">
        <div class="form-group"><label>Total amount (USD)</label><input type="number" id="m-c-total" step="0.01" value="${Number(c.total_amount_usd || 0)}"></div>
        <div class="form-group"><label>Deposit %</label><input type="number" id="m-c-deposit" step="0.5" value="${Number(c.deposit_percent || 10)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Monthly recurring (USD)</label><input type="number" id="m-c-monthly" step="0.01" value="${Number(c.monthly_amount_usd || 0)}"></div>
        <div class="form-group"><label>Currency</label><input type="text" id="m-c-currency" value="${c.currency || 'USD'}" maxlength="10"></div>
      </div>
      <div class="form-group"><label>Scope summary</label><textarea id="m-c-scope" rows="4">${escHtml(c.scope_summary || '')}</textarea></div>
      <div class="form-group"><label>Terms summary (optional)</label><textarea id="m-c-terms" rows="3">${escHtml(c.terms_summary || '')}</textarea></div>
    `, async () => {
      const body = {
        total_amount_usd: Number(document.getElementById('m-c-total').value),
        deposit_percent: Number(document.getElementById('m-c-deposit').value),
        monthly_amount_usd: Number(document.getElementById('m-c-monthly').value),
        currency: document.getElementById('m-c-currency').value || 'USD',
        scope_summary: document.getElementById('m-c-scope').value,
        terms_summary: document.getElementById('m-c-terms').value
      };
      const save = await api(`/contracts/${contractId}`, { method: 'PUT', body: JSON.stringify(body) });
      if (!save.success) { alert('Save failed: ' + (save.error || 'unknown')); return; }
      closeModal();
      openBusinessPlan(window._currentBpProjectId);
    });
  } catch (e) { alert('Could not load contract: ' + e.message); }
}

async function sendContract(contractId, projectId) {
  if (!confirm('Send the contract + business plan summary to all project stakeholders (submitter + team members)?')) return;
  try {
    const res = await api(`/contracts/${contractId}/send`, { method: 'POST', body: JSON.stringify({}) });
    if (!res.success) {
      alert('Send failed: ' + (res.error || 'unknown'));
      return;
    }
    alert('Sent to:\n' + (res.sent_to || []).join('\n') + '\n\nSignoff link: ' + (res.signoff_url || ''));
    openBusinessPlan(projectId);
  } catch (e) { alert('Send failed: ' + e.message); }
}

function switchBusinessPlanTab(key, btn) {
  document.querySelectorAll('.bp-tab').forEach(b => {
    b.classList.remove('active');
    b.style.borderBottomColor = 'transparent';
    b.style.color = 'var(--text-muted)';
  });
  btn.classList.add('active');
  btn.style.borderBottomColor = 'var(--accent)';
  btn.style.color = 'var(--accent)';
  const content = document.getElementById('bp-content');
  if (content && window._bpSections && window._bpSections[key]) {
    content.innerHTML = window._bpSections[key];
  }
}

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
  // Reset the Save button so it does NOT inherit disabled/custom-text state
  // from a previous modal whose save handler failed or hung.
  const saveBtn = document.getElementById('modal-save');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; saveBtn.style.display = ''; }
  modalSaveHandler = onSave;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  const saveBtn = document.getElementById('modal-save');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; saveBtn.style.display = ''; }
  document.getElementById('modal-cancel').style.display = '';
  document.getElementById('modal-cancel').textContent = 'Cancel';
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
    <div class="form-row">
      <div class="form-group"><label>Repeat</label>
        <select id="m-erecur" onchange="document.getElementById('m-ecount-wrap').style.display=this.value==='none'?'none':'block'">
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      <div class="form-group" id="m-ecount-wrap" style="display:none">
        <label>Number of occurrences</label>
        <input type="number" id="m-ecount" value="4" min="1" max="52">
      </div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="m-edesc"></textarea></div>
    <div class="form-group" style="background:rgba(45,140,255,.08);border:1px solid rgba(45,140,255,.3);border-radius:8px;padding:10px 12px;margin-top:4px">
      <label style="display:flex;align-items:center;gap:8px;margin:0;cursor:pointer;font-weight:500">
        <input type="checkbox" id="m-ezoom" style="width:16px;height:16px;cursor:pointer">
        <span style="color:#2D8CFF">&#127909; Add Zoom meeting</span>
      </label>
      <small style="color:var(--text-muted);display:block;margin-top:4px;margin-left:24px">Auto-creates a Zoom meeting on info@digit2ai.com and adds the join link to this event.</small>
    </div>
    <div class="form-group">
      <label>Invite attendees (optional)</label>
      <input type="text" id="m-einvitees" placeholder="alice@example.com, bob@example.com">
      <small style="color:var(--text-muted)">Comma-separated emails. Each attendee gets a meeting invite with the Zoom link and an .ics calendar attachment.</small>
    </div>
    <div class="form-group">
      <label>Personal note to attendees (optional)</label>
      <textarea id="m-einvitemsg" rows="3" placeholder="Looking forward to chatting!"></textarea>
    </div>
  `, async () => {
    const baseStart = localInputToIso(document.getElementById('m-estart').value);
    const baseEnd   = localInputToIso(document.getElementById('m-eend').value);
    const recur = document.getElementById('m-erecur').value;
    const count = recur === 'none' ? 1 : Math.max(1, Math.min(52, Number(document.getElementById('m-ecount').value) || 1));
    const wantsZoom = document.getElementById('m-ezoom').checked;
    const inviteRaw = document.getElementById('m-einvitees').value.trim();
    const inviteMsg = document.getElementById('m-einvitemsg').value.trim();
    const base = {
      title: document.getElementById('m-etitle').value.trim(),
      event_type: document.getElementById('m-etype').value,
      location: document.getElementById('m-elocation').value.trim(),
      description: document.getElementById('m-edesc').value.trim()
    };
    if (!base.title || !baseStart) { alert('Title and start time required'); return; }
    const saveBtn = document.getElementById('modal-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = wantsZoom ? 'Creating Zoom + event...' : 'Saving...'; }
    // Stamp all occurrences of a recurrence with the same group id so the
    // backend can recognise and bulk-delete the whole series later.
    const groupId = (count > 1 && typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null;
    const calls = [];
    for (let i = 0; i < count; i++) {
      // Only the first occurrence of a recurring series gets a Zoom meeting —
      // attendees can reuse the same join link, and we avoid spamming the
      // Zoom account with N meetings for a weekly series.
      const isFirst = i === 0;
      calls.push(api('/calendar', { method: 'POST', body: JSON.stringify({
        ...base,
        start_time: shiftIsoForRecurrence(baseStart, recur, i),
        end_time: baseEnd ? shiftIsoForRecurrence(baseEnd, recur, i) : null,
        recurrence_group_id: groupId,
        create_zoom: wantsZoom && isFirst,
        // Only invite on the first occurrence of a series — same reasoning as Zoom:
        // attendees don't need N invites for a recurring weekly meeting.
        invite_emails: isFirst ? inviteRaw : null,
        invite_message: isFirst ? inviteMsg : null
      }) }));
    }
    let results;
    try {
      results = await Promise.all(calls);
    } catch (err) {
      alert('Could not create event: ' + (err && err.message ? err.message : 'unknown error'));
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
      return;
    }
    closeModal();
    // Surface a soft warning if Zoom creation failed (event still saved).
    const warn = results.find(r => r && r.zoom_warning);
    if (warn) alert('Note: ' + warn.zoom_warning);
    // Surface invite send results
    const inviteResult = results.find(r => r && r.invite_result)?.invite_result;
    if (inviteResult) {
      const sent = inviteResult.sent || [];
      const failed = inviteResult.failed || [];
      let msg = '';
      if (sent.length) msg += `Invites sent to ${sent.length} attendee${sent.length === 1 ? '' : 's'}.`;
      if (failed.length) {
        msg += (msg ? '\n\n' : '') + `Failed: ${failed.map(f => f.email + ' (' + f.error + ')').join(', ')}`;
      }
      if (msg) alert(msg);
    }
    navigateTo('calendar');
  });
}

// On-demand project meeting: prefilled with project stakeholders.
// Creates a calendar event with a Zoom meeting, ensures a magic-link share
// token exists, then opens a prefilled mailto: so the user can send the
// invite manually from their own email client (no SendGrid roundtrip).
// Lightweight language picker shown BEFORE the Schedule Meeting modal.
// User clicks English or Espanol; we then open the modal with all
// defaults + labels localized and pass the choice through to the
// send-invite endpoint so the email is generated in the right language.
function chooseScheduleMeetingLanguage(projectId) {
  openModal('Schedule Meeting — choose language', `
    <p style="color:var(--text-secondary);font-size:14px;margin-bottom:18px">Pick the language for the meeting invite. The modal labels, default agenda, and the email body all switch to your selection.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn-ghost" style="padding:24px;font-size:16px;font-weight:600;flex-direction:column" onclick="closeModal();openScheduleMeetingModal(${projectId},'en')">
        <div style="font-size:20px;margin-bottom:4px">English</div>
        <div style="font-size:11px;color:var(--text-muted);font-weight:400">EN</div>
      </button>
      <button class="btn btn-ghost" style="padding:24px;font-size:16px;font-weight:600;flex-direction:column" onclick="closeModal();openScheduleMeetingModal(${projectId},'es')">
        <div style="font-size:20px;margin-bottom:4px">Espa&ntilde;ol</div>
        <div style="font-size:11px;color:var(--text-muted);font-weight:400">ES</div>
      </button>
    </div>
  `);
  // Hide the standard Save button — choice is made by clicking either tile.
  setTimeout(() => {
    const saveBtn = document.getElementById('modal-save');
    if (saveBtn) saveBtn.style.display = 'none';
  }, 0);
}
window.chooseScheduleMeetingLanguage = chooseScheduleMeetingLanguage;

async function openScheduleMeetingModal(projectId, language) {
  const LANG = language === 'es' ? 'es' : 'en';
  const isEs = LANG === 'es';
  const T = isEs ? {
    title: 'Agendar reunión',
    objective: 'Objetivo',
    objectiveHint: 'Resumen breve del motivo de la reunión. Va cerca del inicio del correo.',
    objectivePh: 'p. ej., Revisar el plan de negocio generado por IA y capturar los requerimientos de negocio.',
    day: 'Día',
    time: 'Hora',
    duration: 'Duración (min)',
    agenda: 'Agenda',
    agendaHint: 'Negrita, cursiva y listas. Se muestra como lista numerada en el correo y la invitación de calendario. Deja el cuadro vacío para omitir la agenda.',
    boldT: 'Negrita', italicT: 'Cursiva', underlineT: 'Subrayado',
    numList: '1. Lista', bulList: '• Lista', clear: 'Limpiar',
    participants: 'Participantes',
    participantsHint: 'desde los stakeholders del proyecto',
    participantsFoot: 'Desmarca a quien no quieras invitar. Los emails nuevos reciben un checkbox extra "Agregar como stakeholder" — déjalo marcado para guardarlos en la lista permanente del proyecto.',
    addPh: 'agregar otro email (o lista separada por comas)',
    add: '+ Agregar',
    autoSelected: 'Auto-seleccionado: próximo horario libre',
    noConflict: 'Sin conflicto con reuniones existentes · Lun-Vie 9am-5pm Bogotá',
    nextFree: 'Próximo libre',
    onSave: 'Al guardar: se crea una reunión de Zoom en info@digit2ai.com, se guarda el evento de calendario en este proyecto y se envía un correo HTML con el enlace de Zoom, el enlace mágico del proyecto, el objetivo, fecha/hora y participantes.',
    requiredErr: 'Objetivo, día y hora son obligatorios.',
    invalidErr: 'Fecha u hora inválida.',
    pastConfirm: 'Esa hora ya pasó. ¿Agendar de todos modos?',
    conflictHint: 'Conflicto: "%s" ya está agendado a esa hora (%t).\n\nClic en OK para agendar igual, o Cancelar para elegir otro horario.',
    movedTo: 'Mover esta reunión a',
    eventErr: 'No se pudo crear el evento: ',
    saving: 'Verificando disponibilidad...',
    creating: 'Creando Zoom + evento...',
    sending: 'Enviando invitaciones...',
    sentOk: 'Reunión agendada. Invitaciones enviadas a %n participante%s',
    sentFail: '(%n fallaron)',
    sendgridErr: 'Reunión agendada. No se pudo enviar el correo — revisa la configuración de SendGrid.',
    addedStake: 'Se agregaron %n stakeholder%s nuevos al proyecto.',
    zoomWarn: 'Aviso de Zoom: ',
    defaultObjective: 'Discutir el estado del proyecto, próximos pasos y bloqueos.',
    defaultAgendaItems: [
      'Estado y avances del proyecto desde la última sincronización',
      'Hitos completados y revisión de entregables',
      'Próximos pasos e hitos por venir',
      'Bloqueos, riesgos y decisiones pendientes',
      'Acciones a tomar, responsables y fechas objetivo'
    ],
    cancel: 'Cancelar',
    save: 'Guardar',
    requestor: 'solicitante',
    stakeholder: 'stakeholder',
    newTag: '(nuevo)',
    addAsStake: 'Agregar como stakeholder',
    remove: 'Quitar',
    noStake: 'Este proyecto aún no tiene stakeholders — usa el cuadro de abajo para agregar participantes a esta reunión.',
    noStakeConfirm: 'Este proyecto aún no tiene stakeholders. ¿Continuar de todos modos?',
    couldNotLoad: 'No se pudo cargar el proyecto.',
    noNewEmails: 'No se encontraron emails nuevos válidos. Verifica el formato y que no estén ya en la lista.'
  } : {
    title: 'Schedule Meeting',
    objective: 'Objective',
    objectiveHint: 'Short summary of why we are meeting. Goes near the top of the email.',
    objectivePh: 'e.g., Walk through the AI-generated business plan and capture detailed business requirements.',
    day: 'Day',
    time: 'Time',
    duration: 'Duration (min)',
    agenda: 'Agenda',
    agendaHint: 'Bold, italic, lists supported. Renders in the email and calendar invite as a formatted list. Clear the box to skip the agenda block.',
    boldT: 'Bold', italicT: 'Italic', underlineT: 'Underline',
    numList: '1. List', bulList: '• List', clear: 'Clear',
    participants: 'Participants',
    participantsHint: 'from project stakeholders',
    participantsFoot: 'Uncheck anyone you don\'t want to invite. New emails get an extra "Add as stakeholder" checkbox — leave it on to save them to the project\'s permanent stakeholders list.',
    addPh: 'add another email (or comma-separated list)',
    add: '+ Add',
    autoSelected: 'Auto-selected: next available slot',
    noConflict: 'No conflict with existing meetings · Mon-Fri 9am-5pm Bogota',
    nextFree: 'Next free slot',
    onSave: 'On Save: a Zoom meeting is created on info@digit2ai.com, a calendar event is saved on this project, and a styled HTML email is sent containing the Zoom link, the project magic link, the objective, day/time, and participants.',
    requiredErr: 'Objective, day, and time are all required.',
    invalidErr: 'Invalid date/time.',
    pastConfirm: 'That time is in the past. Schedule anyway?',
    conflictHint: 'Conflict: "%s" already runs at this time (%t).\n\nClick OK to book anyway, or Cancel to pick another slot.',
    movedTo: 'Move this meeting to',
    eventErr: 'Could not create event: ',
    saving: 'Checking availability...',
    creating: 'Creating Zoom + event...',
    sending: 'Sending invites...',
    sentOk: 'Meeting scheduled. Invites sent to %n participant%s',
    sentFail: '(%n failed)',
    sendgridErr: 'Meeting scheduled. Invite email could not be sent — check SendGrid config.',
    addedStake: 'Added %n new stakeholder%s to the project.',
    zoomWarn: 'Zoom warning: ',
    defaultObjective: 'Discuss the project updates, next steps, and any blockers.',
    defaultAgendaItems: [
      'Project status &amp; progress since last sync',
      'Milestones completed and deliverables review',
      'Next steps &amp; upcoming milestones',
      'Blockers, risks &amp; open decisions',
      'Action items, owners &amp; target dates'
    ],
    cancel: 'Cancel',
    save: 'Save',
    requestor: 'requestor',
    stakeholder: 'stakeholder',
    newTag: '(new)',
    addAsStake: 'Add as stakeholder',
    remove: 'Remove',
    noStake: 'No project stakeholders yet — use the input below to add participants for this meeting.',
    noStakeConfirm: 'No stakeholders are listed on this project yet. Continue anyway?',
    couldNotLoad: 'Could not load project.',
    noNewEmails: 'No valid new emails found. Check format and that they are not already on the list.'
  };
  // Stash translations on window so the helpers (addScheduleMeetingParticipant,
  // findNextScheduleMeetingSlot) can show the right strings.
  window._scheduleMeetingT = T;
  window._scheduleMeetingLang = LANG;
  // Pull project so we have the latest team_members + submitter + share token
  let project = null;
  try {
    const r = await api(`/projects/${projectId}`);
    project = r && r.data ? r.data : null;
  } catch (_) {}
  if (!project) { alert(T.couldNotLoad); return; }

  // Build the candidate participant list. The submitter is always included.
  // team_members can be strings or objects { email, role }.
  const teamList = Array.isArray(project.team_members) ? project.team_members : [];
  const participants = [];
  const seen = new Set();
  const pushEmail = (email, label, defaultChecked) => {
    const e = String(email || '').trim().toLowerCase();
    if (!e || seen.has(e)) return;
    seen.add(e);
    participants.push({ email: e, label: label || e, checked: defaultChecked });
  };
  if (project.submitter_email) pushEmail(project.submitter_email, `${project.submitter_name || project.submitter_email} (${T.requestor})`, true);
  for (const m of teamList) {
    if (typeof m === 'string') pushEmail(m, m, true);
    else if (m && m.email) pushEmail(m.email, m.role ? `${m.email} (${m.role})` : `${m.email} (${T.stakeholder})`, true);
  }

  if (!participants.length) {
    if (!confirm(T.noStakeConfirm)) return;
  }

  // Ask the server for the next conflict-free 30-min slot in workspace
  // business hours (America/Bogota Mon-Fri 09:00-17:00). Falls back to
  // tomorrow 10:00 if the endpoint errors.
  let defaultDate, defaultTime;
  try {
    const avail = await api('/calendar/next-available?duration=30');
    if (avail && avail.success && avail.data && avail.data.start_time) {
      const start = new Date(avail.data.start_time);
      defaultDate = start.toISOString().slice(0, 10);
      defaultTime = start.toTimeString().slice(0, 5);
    }
  } catch (_) {}
  if (!defaultDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    defaultDate = tomorrow.toISOString().slice(0, 10);
    defaultTime = '10:00';
  }
  const defaultObjective = T.defaultObjective;
  const defaultAgendaItems = T.defaultAgendaItems;
  // Rich-text default — rendered into the contenteditable as a real <ol>
  const defaultAgendaHtml = '<ol>' + defaultAgendaItems.map(t => `<li>${t}</li>`).join('') + '</ol>';

  // Existing stakeholders render with a single "Invite" checkbox.
  // New emails (added via the "+ Add participant" input below) render with
  // TWO checkboxes: "Invite to meeting" + "Add as stakeholder".
  const partRows = participants.map(p => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:6px;font-size:12px;cursor:pointer" data-existing="1">
      <input type="checkbox" class="m-smp-invite" data-email="${escHtml(p.email)}" ${p.checked ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
      <span style="color:var(--text-primary);flex:1;word-break:break-all">${escHtml(p.label)}</span>
    </label>
  `).join('') || `<p id="m-smparts-empty" style="font-size:12px;color:var(--text-muted);font-style:italic">${escHtml(T.noStake)}</p>`;

  openModal(`${T.title} - ${project.name}`, `
    <div class="form-group">
      <label>${escHtml(T.objective)} *</label>
      <textarea id="m-smobjective" rows="2" placeholder="${escHtml(T.objectivePh)}">${escHtml(defaultObjective)}</textarea>
      <small style="color:var(--text-muted)">${escHtml(T.objectiveHint)}</small>
    </div>
    <div class="form-group">
      <label>${escHtml(T.agenda)}</label>
      <div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:rgba(56,189,248,0.05);border:1px solid var(--border);border-bottom:none;border-radius:var(--radius) var(--radius) 0 0">
        <button type="button" onclick="agendaCmd('bold')" title="${escHtml(T.boldT)}" style="font-weight:700;min-width:30px;padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">B</button>
        <button type="button" onclick="agendaCmd('italic')" title="${escHtml(T.italicT)}" style="font-style:italic;min-width:30px;padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">I</button>
        <button type="button" onclick="agendaCmd('underline')" title="${escHtml(T.underlineT)}" style="text-decoration:underline;min-width:30px;padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">U</button>
        <span style="width:1px;background:var(--border);margin:0 4px"></span>
        <button type="button" onclick="agendaCmd('insertOrderedList')" title="${escHtml(T.numList)}" style="padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">${escHtml(T.numList)}</button>
        <button type="button" onclick="agendaCmd('insertUnorderedList')" title="${escHtml(T.bulList)}" style="padding:4px 8px;background:transparent;color:var(--text-primary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">${escHtml(T.bulList)}</button>
        <span style="width:1px;background:var(--border);margin:0 4px"></span>
        <button type="button" onclick="agendaCmd('removeFormat')" title="${escHtml(T.clear)}" style="padding:4px 8px;background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">${escHtml(T.clear)}</button>
      </div>
      <div id="m-smagenda" contenteditable="true" style="width:100%;font-family:inherit;font-size:14px;line-height:1.55;padding:12px;border-radius:0 0 var(--radius) var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);min-height:140px;max-height:280px;overflow-y:auto;outline:none">${defaultAgendaHtml}</div>
      <small style="color:var(--text-muted)">${escHtml(T.agendaHint)}</small>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${escHtml(T.day)} *</label>
        <input type="date" id="m-smdate" value="${defaultDate}">
      </div>
      <div class="form-group">
        <label>${escHtml(T.time)} *</label>
        <input type="time" id="m-smtime" value="${defaultTime}">
      </div>
      <div class="form-group">
        <label>${escHtml(T.duration)}</label>
        <input type="number" id="m-smduration" value="30" min="15" max="240" step="15">
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:-8px;margin-bottom:8px;padding:8px 12px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-size:12px">
      <span style="color:var(--success);font-weight:600">${escHtml(T.autoSelected)}</span>
      <span style="color:var(--text-muted);flex:1">${escHtml(T.noConflict)}</span>
      <button type="button" class="btn btn-ghost btn-sm" style="padding:3px 10px;font-size:11px" onclick="findNextScheduleMeetingSlot()">${escHtml(T.nextFree)}</button>
    </div>
    <div class="form-group">
      <label>${escHtml(T.participants)} <span style="color:var(--text-muted);font-weight:normal">(${escHtml(T.participantsHint)})</span></label>
      <div id="m-smparts" style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;padding:4px">
        ${partRows}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;align-items:center">
        <input type="email" id="m-smp-newemail" placeholder="${escHtml(T.addPh)}" style="flex:1;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:13px">
        <button type="button" class="btn btn-ghost btn-sm" onclick="addScheduleMeetingParticipant()" style="padding:7px 14px">${escHtml(T.add)}</button>
      </div>
      <small style="color:var(--text-muted)">${escHtml(T.participantsFoot)}</small>
    </div>
    <div class="form-group" style="background:rgba(45,140,255,.08);border:1px solid rgba(45,140,255,.3);border-radius:8px;padding:10px 12px">
      <small style="color:var(--text-muted)">${escHtml(T.onSave)}</small>
    </div>
  `, async () => {
    const saveBtn = document.getElementById('modal-save');
    const objective = document.getElementById('m-smobjective').value.trim();
    const date = document.getElementById('m-smdate').value;
    const time = document.getElementById('m-smtime').value;
    const durationMin = Math.max(15, Math.min(240, Number(document.getElementById('m-smduration').value) || 30));
    // Agenda is rich-text. Extract <li> items if present (the default
    // structure), otherwise fall back to splitting plain text by line.
    // Each item may contain inline HTML (<strong>, <em>, <u>) which the
    // backend renders directly in the email.
    const agendaEl = document.getElementById('m-smagenda');
    const lis = agendaEl ? agendaEl.querySelectorAll('li') : [];
    let agendaItems;
    if (lis.length) {
      agendaItems = Array.from(lis).map(li => li.innerHTML.trim()).filter(Boolean);
    } else {
      const text = agendaEl ? (agendaEl.innerText || agendaEl.textContent || '') : '';
      agendaItems = text.split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (!objective || !date || !time) { alert(T.requiredErr); return; }
    const selected = Array.from(document.querySelectorAll('#m-smparts input.m-smp-invite:checked'))
      .map(el => (el.getAttribute('data-email') || '').toLowerCase()).filter(Boolean);
    // New emails that the user also wants saved as permanent project stakeholders
    const newStakeholderEmails = Array.from(document.querySelectorAll('#m-smparts input.m-smp-stakeholder:checked'))
      .map(el => (el.getAttribute('data-email') || '').toLowerCase()).filter(Boolean);

    const startLocal = new Date(`${date}T${time}`);
    if (isNaN(startLocal.getTime())) { alert(T.invalidErr); return; }
    if (startLocal < new Date()) { if (!confirm(T.pastConfirm)) return; }
    const endLocal = new Date(startLocal.getTime() + durationMin * 60000);
    const startISO = startLocal.toISOString();
    const endISO = endLocal.toISOString();

    saveBtn.disabled = true;
    const origText = saveBtn.textContent;
    saveBtn.textContent = T.saving;

    // Final conflict recheck — even if the user edited the auto-selected
    // time manually or another booking landed between modal-open and Save.
    try {
      const winStart = new Date(startLocal.getTime() - 60 * 60000).toISOString();
      const winEnd   = new Date(endLocal.getTime() + 60 * 60000).toISOString();
      const conflictRes = await api(`/calendar?start=${encodeURIComponent(winStart)}&end=${encodeURIComponent(winEnd)}`);
      const overlap = (conflictRes.data || []).find(ev => {
        if (!ev.start_time || ev.source === 'task') return false;
        const evStart = new Date(ev.start_time).getTime();
        const evEnd = new Date(ev.end_time || ev.start_time).getTime();
        return startLocal.getTime() < evEnd && endLocal.getTime() > evStart;
      });
      if (overlap) {
        const proceed = confirm(
          T.conflictHint.replace('%s', overlap.title).replace('%t', new Date(overlap.start_time).toLocaleString())
        );
        if (!proceed) {
          saveBtn.disabled = false;
          saveBtn.textContent = origText;
          return;
        }
      }
    } catch (_) { /* soft fail — proceed with booking */ }
    saveBtn.textContent = T.creating;

    // Ensure the project has a magic-link share token; mint one if missing.
    // The backend reads project.stakeholder_share_token directly when
    // composing the invite email, so we don't need the URL locally.
    if (!project.stakeholder_share_token) {
      try {
        await api(`/projects/${projectId}/share-token`, { method: 'POST', body: JSON.stringify({}) });
      } catch (_) {}
    }

    // Merge any "Add as stakeholder" emails into the project's team_members.
    // Existing emails are filtered out so we don't create duplicates. The
    // updated array is PUT back via /projects/:id — same endpoint used by
    // the Edit Stakeholders modal.
    let stakeholdersAdded = 0;
    if (newStakeholderEmails.length) {
      const currentTeam = Array.isArray(project.team_members) ? project.team_members.slice() : [];
      const existingEmails = new Set(currentTeam.map(m => {
        if (typeof m === 'string') return m.trim().toLowerCase();
        if (m && m.email) return String(m.email).trim().toLowerCase();
        return '';
      }).filter(Boolean));
      const submitterLc = String(project.submitter_email || '').trim().toLowerCase();
      const toAdd = newStakeholderEmails.filter(e => e && !existingEmails.has(e) && e !== submitterLc);
      if (toAdd.length) {
        const updatedTeam = currentTeam.concat(toAdd.map(email => ({ email, role: 'stakeholder' })));
        try {
          await api(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ team_members: updatedTeam }) });
          stakeholdersAdded = toAdd.length;
        } catch (sErr) {
          console.warn('[Schedule Meeting] Could not save new stakeholders:', sErr.message);
        }
      }
    }

    // Create the calendar event with Zoom enabled. invite_emails is null —
    // the styled HTML invite is sent server-side after via /meetings/:id/send-invite.
    let zoomWarning = null;
    let eventId = null;
    try {
      const evResp = await api('/calendar', { method: 'POST', body: JSON.stringify({
        title: `Meeting - ${project.name}`,
        event_type: 'meeting',
        project_id: projectId,
        start_time: startISO,
        end_time: endISO,
        description: `Objective:\n${objective}\n\nProject: ${project.name}\nParticipants: ${selected.join(', ')}`,
        create_zoom: true,
        invite_emails: null
      }) });
      if (evResp && evResp.success) {
        eventId = evResp.data && evResp.data.id;
        zoomWarning = evResp.zoom_warning || null;
      } else {
        alert(T.eventErr + (evResp && evResp.error || 'unknown'));
        saveBtn.disabled = false;
        saveBtn.textContent = origText;
        return;
      }
    } catch (e) {
      alert(T.eventErr + e.message);
      saveBtn.disabled = false;
      saveBtn.textContent = origText;
      return;
    }

    // Send the styled HTML + .ics invite via SendGrid using the same
    // template as the kickoff email. Replaces the legacy mailto: flow.
    saveBtn.textContent = T.sending;
    let inviteResult = null;
    try {
      const sendResp = await api(`/projects/${projectId}/meetings/${eventId}/send-invite`, {
        method: 'POST',
        body: JSON.stringify({
          recipients: selected,
          objective: objective || '',
          agenda: agendaItems,
          language: LANG
        })
      });
      if (sendResp && sendResp.success) {
        inviteResult = sendResp.data;
      } else if (sendResp && sendResp.error) {
        console.warn('[Schedule Meeting] send-invite returned error:', sendResp.error);
      }
    } catch (sendErr) {
      console.error('[Schedule Meeting] send-invite call failed:', sendErr.message);
    }

    closeModal();
    let toastMsg;
    if (inviteResult) {
      const sentCount = (inviteResult.sent || []).length;
      const failedCount = (inviteResult.failed || []).length;
      toastMsg = T.sentOk.replace('%n', sentCount).replace('%s', sentCount === 1 ? '' : 's');
      if (failedCount) toastMsg += ' ' + T.sentFail.replace('%n', failedCount);
      toastMsg += '.';
    } else {
      toastMsg = T.sendgridErr;
    }
    if (zoomWarning) toastMsg += ' ' + T.zoomWarn + zoomWarning + '.';
    if (stakeholdersAdded > 0) {
      toastMsg += ' ' + T.addedStake.replace('%n', stakeholdersAdded).replace('%s', stakeholdersAdded === 1 ? '' : 's');
    }
    if (typeof showToast === 'function') {
      try { showToast(toastMsg, inviteResult ? 'success' : 'error'); } catch (_) {}
    } else {
      alert(toastMsg);
    }
    // Refresh the project detail so the new event shows up under Linked Events
    showProjectDetail(projectId);
  });

  // Localize the shared modal Save / Cancel buttons. openModal already
  // reset them to enabled + default labels; override the labels here.
  const sb = document.getElementById('modal-save'); if (sb) sb.textContent = T.save;
  const cb = document.getElementById('modal-cancel'); if (cb) cb.textContent = T.cancel;
}
window.openScheduleMeetingModal = openScheduleMeetingModal;

// Toolbar handler for the Schedule Meeting Agenda field. document.execCommand
// is technically deprecated but still works in every shipping browser and is
// what the project Notes editor already uses.
function agendaCmd(command, value) {
  const ed = document.getElementById('m-smagenda');
  if (!ed) return;
  ed.focus();
  document.execCommand(command, false, value || null);
}
window.agendaCmd = agendaCmd;

// Helper used by the Schedule Meeting modal's "+ Add" button. Reads the
// email input, validates + dedupes against rows already in the list, and
// appends one new row per email with TWO checkboxes: Invite + Stakeholder.
function addScheduleMeetingParticipant() {
  const input = document.getElementById('m-smp-newemail');
  if (!input) return;
  const raw = (input.value || '').trim();
  if (!raw) return;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = raw.split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const list = document.getElementById('m-smparts');
  if (!list) return;
  const existing = new Set(
    Array.from(list.querySelectorAll('input.m-smp-invite[data-email]'))
      .map(el => (el.getAttribute('data-email') || '').toLowerCase())
  );
  // Clear empty-state placeholder once we add anything
  const empty = document.getElementById('m-smparts-empty');
  let added = 0;
  for (const e of emails) {
    if (!EMAIL_RE.test(e)) continue;
    if (existing.has(e)) continue;
    existing.add(e);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:6px 8px;background:rgba(167,139,250,0.07);border:1px dashed rgba(167,139,250,0.4);border-radius:6px;font-size:12px';
    row.setAttribute('data-new', '1');
    const T = window._scheduleMeetingT || { newTag: '(new)', addAsStake: 'Add as stakeholder', remove: 'Remove', noNewEmails: 'No valid new emails found. Check format and that they are not already on the list.' };
    row.innerHTML = `
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" class="m-smp-invite" data-email="${escHtml(e)}" checked style="width:14px;height:14px;cursor:pointer">
        <span style="color:var(--text-primary);word-break:break-all">${escHtml(e)}</span>
        <span style="color:var(--text-muted);font-size:11px">${escHtml(T.newTag)}</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-left:auto" title="${escHtml(T.addAsStake)}">
        <input type="checkbox" class="m-smp-stakeholder" data-email="${escHtml(e)}" checked style="width:14px;height:14px;cursor:pointer">
        <span style="color:var(--text-secondary);font-size:11px">${escHtml(T.addAsStake)}</span>
      </label>
      <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;color:var(--danger)" onclick="this.closest('div[data-new]').remove()">${escHtml(T.remove)}</button>
    `;
    list.appendChild(row);
    added++;
  }
  if (empty && added > 0) empty.remove();
  input.value = '';
  if (!added) {
    const T = window._scheduleMeetingT;
    alert((T && T.noNewEmails) || 'No valid new emails found. Check format and that they are not already on the list.');
  }
}
window.addScheduleMeetingParticipant = addScheduleMeetingParticipant;

// Re-fetch the next conflict-free slot and update the Day/Time inputs.
// Used by the "Next free slot" button next to the auto-selected status.
async function findNextScheduleMeetingSlot() {
  const dateEl = document.getElementById('m-smdate');
  const timeEl = document.getElementById('m-smtime');
  const durEl = document.getElementById('m-smduration');
  if (!dateEl || !timeEl) return;
  const duration = Math.max(15, Math.min(240, Number(durEl && durEl.value) || 30));
  try {
    const avail = await api(`/calendar/next-available?duration=${duration}`);
    if (avail && avail.success && avail.data && avail.data.start_time) {
      const start = new Date(avail.data.start_time);
      dateEl.value = start.toISOString().slice(0, 10);
      timeEl.value = start.toTimeString().slice(0, 5);
    } else {
      alert('Could not find a free slot. Please pick a time manually.');
    }
  } catch (e) {
    alert('Could not check availability: ' + e.message);
  }
}
window.findNextScheduleMeetingSlot = findNextScheduleMeetingSlot;

function openMilestoneModal(projectId, existing) {
  const m = existing || { title: '', due_date: '', description: '', owner: '', status: 'pending' };
  // If editing and owner is empty but description has a trailing "Owner: X", pre-extract it
  let ownerHint = m.owner || '';
  let descriptionHint = m.description || '';
  if (!ownerHint && descriptionHint) {
    const mm = descriptionHint.match(/(?:^|\n)\s*Owner:\s*(.+?)(?:\n|$)/i);
    if (mm) {
      ownerHint = mm[1].trim();
      descriptionHint = descriptionHint.replace(/(?:^|\n)\s*Owner:\s*.+?(?:\n|$)/i, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
  }
  const escAttr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const isEdit = !!existing;
  openModal(isEdit ? 'Edit Milestone' : 'Add Milestone', `
    <div class="form-group"><label>Title *</label><input type="text" id="m-mtitle" value="${escAttr(m.title)}"></div>
    <div class="form-row" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label>Due Date</label><input type="date" id="m-mdue" value="${m.due_date ? String(m.due_date).slice(0,10) : ''}"></div>
      <div class="form-group">
        <label>Status</label>
        <select id="m-mstatus">
          <option value="pending" ${m.status === 'pending' ? 'selected' : ''}>pending</option>
          <option value="in_progress" ${m.status === 'in_progress' ? 'selected' : ''}>in_progress</option>
          <option value="completed" ${m.status === 'completed' ? 'selected' : ''}>completed</option>
          <option value="blocked" ${m.status === 'blocked' ? 'selected' : ''}>blocked</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Owner / Suggested Owner</label>
      <input type="text" id="m-mowner" placeholder="e.g. AI Engineer Lead, Manuel Stagg, juan.bueno@planea.co" value="${escAttr(ownerHint)}">
      <small style="color:var(--text-muted)">Who is responsible for delivering this milestone? A role, a name, or an email — all work.</small>
    </div>
    <div class="form-group"><label>Description</label><textarea id="m-mdesc" rows="4">${escAttr(descriptionHint)}</textarea></div>
  `, async () => {
    const data = {
      title: document.getElementById('m-mtitle').value.trim(),
      due_date: document.getElementById('m-mdue').value || null,
      status: document.getElementById('m-mstatus').value,
      owner: document.getElementById('m-mowner').value.trim() || null,
      description: document.getElementById('m-mdesc').value.trim()
    };
    if (!data.title) { alert('Title required'); return; }
    const url = isEdit
      ? `/projects/${projectId}/milestones/${m.id}`
      : `/projects/${projectId}/milestones`;
    const method = isEdit ? 'PUT' : 'POST';
    const res = await api(url, { method, body: JSON.stringify(data) });
    if (!res.success) { alert((isEdit ? 'Update' : 'Add') + ' failed: ' + (res.error || 'unknown')); return; }
    closeModal();
    showProjectDetail(projectId);
  });
}

async function openMilestoneEditModal(projectId, milestoneId) {
  // We don't have a single-milestone GET endpoint, so re-fetch the project and pluck the row.
  const res = await api(`/projects/${projectId}`);
  if (!res.success) { alert('Could not load project'); return; }
  const m = (res.data.milestones || []).find(x => x.id === milestoneId);
  if (!m) { alert('Milestone not found'); return; }
  openMilestoneModal(projectId, m);
}
window.openMilestoneEditModal = openMilestoneEditModal;

async function deleteMilestone(projectId, milestoneId, title) {
  const label = title || 'this milestone';
  if (!confirm(`Delete milestone "${label}"?\n\nThis cannot be undone.`)) return;
  const res = await api(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' });
  if (!res.success) { alert('Delete failed: ' + (res.error || 'unknown')); return; }
  showProjectDetail(projectId);
}
window.deleteMilestone = deleteMilestone;

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
// Voice dictation for the AI chat — uses the browser's built-in speech-to-text
// (Web Speech API; Chrome + iOS Safari). Speaks → fills the input → auto-sends.
function startDictation(inputId, target) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById(target === 'ai' ? 'ai-mic' : 'nlp-mic');
  if (!SR) {
    alert('Voice input isn\'t supported in this browser. Try Chrome on desktop or Safari on iPhone.');
    return;
  }
  // Toggle off if already listening.
  if (window._dictating) { try { window._dictating.stop(); } catch (e) {} return; }

  const rec = new SR();
  rec.lang = (typeof getLang === 'function' && getLang() === 'es') ? 'es-ES' : 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  window._dictating = rec;
  if (micBtn) micBtn.classList.add('listening');

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const input = document.getElementById(inputId);
    if (input) input.value = text;
    // Small delay so the user sees what was heard, then send.
    setTimeout(() => sendAICommand(target), 150);
  };
  const cleanup = () => { window._dictating = null; if (micBtn) micBtn.classList.remove('listening'); };
  rec.onerror = cleanup;
  rec.onend = cleanup;
  try { rec.start(); } catch (e) { cleanup(); }
}
window.startDictation = startDictation;

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
    // A new reminder is an alert — refresh the bell badge (and the Alerts view if open).
    if (res.data?.intent === 'create_reminder') {
      refreshNotifBadge();
      if (currentView === 'notifications') renderView('notifications');
    }
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

// =====================================================
// MEETING MINUTES
// =====================================================
let _minutesProjectsCache = null;

async function renderMeetingMinutes(container) {
  // Load minutes + project list (for the dropdown) in parallel
  const [minutesRes, projectsRes] = await Promise.all([
    api('/meeting-minutes'),
    _minutesProjectsCache ? Promise.resolve({ success: true, data: _minutesProjectsCache })
                          : api('/projects')
  ]);
  if (projectsRes.success) _minutesProjectsCache = projectsRes.data;
  const minutes = (minutesRes.success && minutesRes.data) || [];
  // Sort projects A→Z by name so the dropdown is alphabetical (case-insensitive,
  // locale-aware so accented Spanish names sort correctly).
  const projects = ((projectsRes.success && projectsRes.data) || [])
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

  container.innerHTML = `
    <div class="section-header">
      <div></div>
      <button class="btn btn-primary btn-sm" onclick="openMinutesModal()">+ New Meeting Minute</button>
    </div>
    <div id="minutes-list"></div>
  `;
  renderMinutesList(minutes);

  // Stash projects on a global so the modal can access without re-fetch
  window._minutesProjects = projects;
}

function renderMinutesList(minutes) {
  const wrap = document.getElementById('minutes-list');
  if (!wrap) return;
  if (!minutes.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128221;</div><h3>No meeting minutes yet</h3><p>Capture notes from a Zoom call, a client conversation, or a planning session.</p><button class="get-started-btn" onclick="openMinutesModal()">+ Create Your First Meeting Minute</button></div>';
    return;
  }
  let html = '<table class="data-table"><thead><tr><th style="width:110px">Date</th><th>Subject</th><th>Project</th><th style="width:140px">Notes</th><th style="width:130px">Sent</th><th style="width:230px">Actions</th></tr></thead><tbody>';
  minutes.forEach(m => {
    const proj = m.project ? `<span class="status-badge status-planning">${escapeHtml(m.project.name)}</span>` : '<span style="color:var(--text-muted)">—</span>';
    // Small AI indicator so it's obvious the extractor ran and how many tasks it spun off.
    const hasNotes = m.notes && String(m.notes).trim();
    const aiBadge = m.ai_processed_at
      ? `<span title="AI processed — ${m.auto_tasks_created || 0} task(s) auto-created" style="margin-left:8px;font-size:10px;font-weight:600;color:#6366f1;border:1px solid #6366f1;border-radius:8px;padding:1px 7px">🤖 ${m.auto_tasks_created || 0} task${(m.auto_tasks_created || 0) === 1 ? '' : 's'}</span>`
      : (hasNotes ? `<span title="AI extraction pending — reopen shortly" style="margin-left:8px;font-size:10px;color:var(--text-muted)">⏳ AI…</span>` : '');
    const notesPreview = m.notes ? (m.notes.length > 40 ? m.notes.substring(0, 40) + '…' : m.notes) : '<span style="color:var(--text-muted)">empty</span>';
    const sentTo = Array.isArray(m.sent_to) ? m.sent_to : [];
    const sentCell = m.sent_at
      ? `<span title="Sent ${fmtDateTime(m.sent_at)} to: ${sentTo.map(escapeHtml).join(', ')}" style="background:rgba(16,185,129,.15);color:#10b981;padding:3px 9px;border-radius:10px;font-size:11px;font-weight:600">&#10003; Sent (${sentTo.length})</span>`
      : '<span style="color:var(--text-muted);font-size:11px;font-style:italic">not sent</span>';
    const sendDisabled = !m.project_id || !m.notes || !String(m.notes).trim();
    // Apple Mail button uses the same disabled criteria as SendGrid (needs
    // a linked project + non-empty notes — otherwise there's no recipient
    // list and no body). When auto-send is off (default), this is the
    // primary send path; the SendGrid button is a fallback.
    const mailBtn = sendDisabled
      ? ''
      : `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openMinuteInMail(${m.id})" title="Open Apple Mail (or your default mail client) with the recap pre-filled — recommended for client recaps that have been landing in spam">📧 Mail</button>`;
    const sendBtn = sendDisabled
      ? `<button class="btn btn-sm btn-ghost" disabled title="${!m.project_id ? 'Link to a project first' : 'Add notes first'}" style="opacity:.4;cursor:not-allowed">Send</button>`
      : `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();sendMinuteToStakeholders(${m.id})" id="send-mm-${m.id}" title="Send via SendGrid (server-side). Auto-send is OFF — this is a manual fallback.">${m.sent_at ? 'Resend' : 'SendGrid'}</button>`;
    html += `<tr class="clickable" onclick="openMinutesModal(${m.id})">
      <td>${fmtDate(m.meeting_date)}</td>
      <td><strong>${escapeHtml(m.subject)}</strong>${aiBadge}</td>
      <td>${proj}</td>
      <td><span style="color:var(--text-muted);font-size:12px">${escapeHtml(notesPreview)}</span></td>
      <td>${sentCell}</td>
      <td>
        ${mailBtn}
        ${sendBtn}
        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openMinutesModal(${m.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteMinute(${m.id})">Delete</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// Open the meeting-minutes recap in the user's default mail client (Apple
// Mail) with the body + recipients pre-filled. Server returns the same
// HTML/text body the SendGrid path would have sent so the recipient sees
// identical formatting whichever channel is chosen.
//
// Why two buttons (Mail + SendGrid): SendGrid auto-send is disabled and
// recipient spam folders were the trigger. Apple Mail is now the default
// path; SendGrid is a labeled fallback for cases where the user prefers
// the server to send (e.g. bulk recipients).
async function openMinuteInMail(id) {
  let payload = null;
  try {
    const r = await api('/meeting-minutes/' + id + '/email-payload', { method: 'POST', body: JSON.stringify({}) });
    if (!r || !r.success) {
      alert('Could not build email payload: ' + ((r && r.error) || 'unknown error'));
      return;
    }
    payload = r.data;
  } catch (err) {
    alert('Could not build email payload: ' + err.message);
    return;
  }
  if (!payload.to) {
    if (!confirm('No recipients on file for this project — Apple Mail will open with an empty To: field. Continue?')) return;
  }
  let body = payload.body_text || '';
  // mailto URLs cap around 2000 chars in some clients. Plain-text recap
  // can be long (notes + action items) — truncate body with a note. The
  // user can also use "Copy as HTML" to paste the full rich version.
  const MAX = 1800;
  let truncated = false;
  if (body.length > MAX) {
    body = body.slice(0, MAX) + '\n\n[...truncated. Use "Copy HTML Body" + paste into Mail for the full version.]';
    truncated = true;
  }
  const url = `mailto:${encodeURIComponent(payload.to || '')}?subject=${encodeURIComponent(payload.subject || '')}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
  if (typeof showCopyToast === 'function') {
    const n = (payload.recipients || []).length;
    showCopyToast(n ? `Opening Mail — ${n} recipient${n === 1 ? '' : 's'}${truncated ? ' (body truncated)' : ''}` : 'Opening Mail…');
  }
  // Stash payload for the "Copy as HTML" quick-action — user can paste
  // the rich version into Mail compose if they want the styled card.
  window._lastMinutePayload = payload;
}
window.openMinuteInMail = openMinuteInMail;

async function copyMinuteAsHtml(id) {
  let payload = window._lastMinutePayload;
  // If no cached payload (page refresh, different minute), re-fetch.
  if (!payload || !payload.body_html) {
    try {
      const r = await api('/meeting-minutes/' + id + '/email-payload', { method: 'POST', body: JSON.stringify({}) });
      if (!r || !r.success) { alert('Could not build payload'); return; }
      payload = r.data;
    } catch (err) { alert('Could not build payload: ' + err.message); return; }
  }
  const html = payload.body_html || '';
  const text = payload.body_text || '';
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
      if (typeof showCopyToast === 'function') showCopyToast('Rich HTML copied — paste into Mail compose for the styled recap');
      return;
    }
  } catch (_) { /* fall through */ }
  try {
    await navigator.clipboard.writeText(text);
    if (typeof showCopyToast === 'function') showCopyToast('Plain text copied (browser blocked rich-text copy)');
  } catch (_) { alert('Copy failed — your browser blocked clipboard access.'); }
}
window.copyMinuteAsHtml = copyMinuteAsHtml;

async function sendMinuteToStakeholders(id) {
  const btn = document.getElementById('send-mm-' + id);
  if (!btn) return;
  if (!confirm('Send these meeting minutes to all stakeholders on the linked project? They will receive an email with the summary, action items, and full notes.')) return;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const res = await api('/meeting-minutes/' + id + '/send', { method: 'POST', body: JSON.stringify({}) });
    if (!res.success) {
      alert('Could not send: ' + (res.error || 'unknown error'));
      btn.disabled = false;
      btn.textContent = originalLabel;
      return;
    }
    const sentCount = (res.sent || []).length;
    const failedCount = (res.failed || []).length;
    let msg = `Sent to ${sentCount} stakeholder${sentCount === 1 ? '' : 's'}.`;
    if (failedCount) msg += ` ${failedCount} failed: ${res.failed.map(f => f.email).join(', ')}`;
    if (typeof showCopyToast === 'function') showCopyToast(msg);
    else alert(msg);
    navigateTo('minutes');
  } catch (err) {
    alert('Send failed: ' + err.message);
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}
window.sendMinuteToStakeholders = sendMinuteToStakeholders;

async function openMinutesModal(id) {
  let row = { meeting_date: new Date().toISOString().slice(0, 10), subject: '', notes: '', project_id: null };
  if (id) {
    const r = await api('/meeting-minutes/' + id);
    if (r.success) row = r.data;
  }
  const projects = (window._minutesProjects || [])
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  const projectOptions = ['<option value="">— No project (general note) —</option>']
    .concat(projects.map(p => `<option value="${p.id}" ${row.project_id == p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`))
    .join('');

  // AI results panel — shows the summary + action items the extractor produced
  // and how many tasks were auto-created in the linked project. Without this,
  // the AI work is invisible and looks like "the agent isn't running".
  const aiItems = Array.isArray(row.action_items_json) ? row.action_items_json : [];
  const agentBadge = (t) => {
    const map = {
      research: ['🔎 Research agent', '#6366f1'],
      draft:    ['✍️ Draft agent', '#0ea5e9'],
      none:     ['Manual', 'var(--text-muted)']
    };
    const [label, color] = map[t] || map.none;
    return `<span style="font-size:10px;font-weight:600;color:${color};border:1px solid ${color};border-radius:8px;padding:1px 7px">${label}</span>`;
  };
  const prioBadge = (p) => {
    const colors = { critical: '#ef4444', high: '#f59e0b', medium: '#10b981', low: '#94a3b8' };
    const c = colors[p] || colors.medium;
    return `<span style="font-size:10px;font-weight:600;color:${c};text-transform:uppercase">${escapeHtml(p || 'medium')}</span>`;
  };
  let aiPanelInner;
  if (row.ai_processed_at) {
    const itemsHtml = aiItems.length
      ? aiItems.map(it => `<li style="margin-bottom:8px;list-style:none;padding-left:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <strong style="font-size:13px">${escapeHtml(it.title || '')}</strong>
              ${prioBadge(it.priority)} ${agentBadge(it.agent_type)}
            </div>
            ${it.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escapeHtml(it.description)}</div>` : ''}
            ${it.assignee_hint ? `<div style="font-size:11px;color:var(--text-muted)">Owner: ${escapeHtml(it.assignee_hint)}</div>` : ''}
          </li>`).join('')
      : '<li style="list-style:none;color:var(--text-muted);font-size:12px">No action items were extracted from these notes.</li>';
    aiPanelInner = `
      ${row.ai_summary ? `<div style="font-size:13px;line-height:1.55;margin-bottom:10px">${escapeHtml(row.ai_summary)}</div>` : ''}
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
        ${row.auto_tasks_created || 0} task${(row.auto_tasks_created || 0) === 1 ? '' : 's'} auto-created${row.project_id ? ' in the linked project' : ''} · processed ${fmtDateTime(row.ai_processed_at)}
      </div>
      <ul style="margin:0;padding:0">${itemsHtml}</ul>`;
  } else if (id && row.notes && String(row.notes).trim()) {
    aiPanelInner = `<div style="font-size:12px;color:var(--text-muted)">⏳ AI is reading these notes and extracting action items. Reopen this minute in a few seconds, or click <strong>Reprocess with AI</strong>.</div>`;
  } else {
    aiPanelInner = `<div style="font-size:12px;color:var(--text-muted)">Add notes and save — AI will extract a summary plus action items and auto-create tasks under the linked project.</div>`;
  }
  const aiPanel = id ? `
    <div class="form-group" style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:12px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
        <label style="margin:0">🤖 AI Summary &amp; Action Items</label>
        <button class="btn btn-sm btn-ghost" onclick="reprocessMinute(${id})" title="Re-run the AI extractor on the current notes (re-creates tasks)">Reprocess with AI</button>
      </div>
      ${aiPanelInner}
    </div>` : '';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:760px;width:96%">
      <div class="modal-header">
        <h3>${id ? 'Edit Meeting Minute' : 'New Meeting Minute'}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-row" style="grid-template-columns:200px 1fr">
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="mm-date" value="${row.meeting_date || ''}">
          </div>
          <div class="form-group">
            <label>Subject *</label>
            <input type="text" id="mm-subject" placeholder="e.g. Zoom call with Acme Corp" value="${escapeHtml(row.subject || '')}">
          </div>
        </div>
        <div class="form-group">
          <label>Project (optional)</label>
          <select id="mm-project">${projectOptions}</select>
          <small style="color:var(--text-muted)">Link these minutes to an existing project, or leave blank for a general note.</small>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="mm-notes" rows="18" placeholder="Paste your Zoom transcript or meeting notes here..." style="width:100%;font-family:inherit;font-size:13px;line-height:1.5;resize:vertical">${escapeHtml(row.notes || '')}</textarea>
        </div>
        ${aiPanel}
        <div class="form-group" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f8fafc;border:1px solid var(--border);border-radius:8px">
          <input type="checkbox" id="mm-auto-send" ${row.sent_at ? '' : 'checked'} style="width:auto;margin:0">
          <label for="mm-auto-send" style="margin:0;cursor:pointer;font-size:13px">
            <strong>Auto-send to project stakeholders on save</strong>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
              ${row.sent_at
                ? 'Already sent ' + fmtDateTime(row.sent_at) + ' — leave unchecked to avoid duplicate. Use the Resend button on the list to send again with current content.'
                : 'Only fires the first time notes are saved with a linked project. After that use the Send button on the list.'}
            </div>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="saveMinute(${id || 'null'})">${id ? 'Save Changes' : 'Create Meeting Minute'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => { document.getElementById('mm-subject')?.focus(); }, 50);
}

async function saveMinute(id) {
  const autoSendEl = document.getElementById('mm-auto-send');
  const payload = {
    meeting_date: document.getElementById('mm-date').value,
    subject: document.getElementById('mm-subject').value.trim(),
    notes: document.getElementById('mm-notes').value,
    project_id: document.getElementById('mm-project').value || null,
    auto_send: autoSendEl ? autoSendEl.checked : true
  };
  if (!payload.subject) { alert('Subject is required'); return; }
  const url = id ? '/meeting-minutes/' + id : '/meeting-minutes';
  const method = id ? 'PUT' : 'POST';
  const res = await api(url, { method, body: JSON.stringify(payload) });
  if (!res.success) { alert('Save failed: ' + (res.error || 'unknown')); return; }
  document.querySelector('.modal-overlay')?.remove();
  if (payload.auto_send && payload.project_id && payload.notes && payload.notes.trim() && typeof showCopyToast === 'function') {
    showCopyToast('Saved. Auto-sending to stakeholders in the background…');
  }
  navigateTo('minutes');
}

async function deleteMinute(id) {
  if (!confirm('Delete this meeting minute? This cannot be undone.')) return;
  const res = await api('/meeting-minutes/' + id, { method: 'DELETE' });
  if (!res.success) { alert('Delete failed: ' + (res.error || 'unknown')); return; }
  navigateTo('minutes');
}

// Re-run the AI extractor on an existing minute's notes. Processing is async
// on the server (~few seconds for extraction + agent dispatch), so we close
// the modal, toast, and refresh the list so the user can reopen to see the
// refreshed summary + action items once it lands.
async function reprocessMinute(id) {
  if (!confirm('Re-run the AI extractor on the current notes? This re-creates action-item tasks in the linked project.')) return;
  try {
    const res = await api('/meeting-minutes/' + id + '/reprocess', { method: 'POST', body: JSON.stringify({}) });
    if (!res.success) { alert('Could not reprocess: ' + (res.error || 'unknown')); return; }
    document.querySelector('.modal-overlay')?.remove();
    if (typeof showCopyToast === 'function') showCopyToast('AI is reprocessing — reopen this minute in a few seconds to see the refreshed summary.');
    navigateTo('minutes');
  } catch (err) {
    alert('Reprocess failed: ' + err.message);
  }
}
window.reprocessMinute = reprocessMinute;
