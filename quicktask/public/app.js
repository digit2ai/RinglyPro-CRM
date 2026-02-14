// === DOM Elements ===
const taskInput = document.getElementById('taskInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const taskList = document.getElementById('taskList');
const calendarView = document.getElementById('calendarView');
const toast = document.getElementById('toast');

// === Base path detection (works standalone at / or mounted at /quicktask/) ===
const BASE = window.location.pathname.replace(/\/$/, '') || '';

// === State ===
let tasks = [];
let recognition = null;
let isRecording = false;
let currentView = 'tasks';
let calendarEvents = [];
let calendarWeekStart = getWeekStart(new Date());

// === API Calls ===
async function fetchTasks() {
  try {
    const res = await fetch(`${BASE}/api/tasks`);
    const json = await res.json();
    if (json.success) {
      tasks = json.data;
      renderTasks();
    }
  } catch (err) {
    showToast('Failed to load tasks', true);
  }
}

async function fetchCalendarEvents() {
  try {
    const start = calendarWeekStart.toISOString().split('T')[0];
    const endDate = new Date(calendarWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const end = endDate.toISOString().split('T')[0];

    const res = await fetch(`${BASE}/api/calendar?start=${start}&end=${end}`);
    const json = await res.json();
    if (json.success) {
      calendarEvents = json.data;
      renderCalendar();
    }
  } catch (err) {
    showToast('Failed to load calendar', true);
  }
}

async function createTask(message, source = 'text') {
  try {
    const res = await fetch(`${BASE}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, source })
    });
    const json = await res.json();
    if (json.success) {
      taskInput.value = '';
      fetchTasks();
      if (json.data.event_date && currentView === 'calendar') {
        fetchCalendarEvents();
      }
    } else {
      showToast(json.error || 'Failed to create task', true);
    }
  } catch (err) {
    showToast('Failed to create task', true);
  }
}

async function updateTask(id, data) {
  try {
    const res = await fetch(`${BASE}/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (json.success) {
      fetchTasks();
    } else {
      showToast(json.error || 'Failed to update task', true);
    }
  } catch (err) {
    showToast('Failed to update task', true);
  }
}

async function deleteTask(id) {
  try {
    const res = await fetch(`${BASE}/api/tasks/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      fetchTasks();
      if (currentView === 'calendar') fetchCalendarEvents();
    } else {
      showToast(json.error || 'Failed to delete task', true);
    }
  } catch (err) {
    showToast('Failed to delete task', true);
  }
}

// === Task List Render ===
function renderTasks() {
  const pending = tasks.filter(t => t.status === 'pending');
  const completed = tasks.filter(t => t.status === 'completed');

  const manuel = pending.filter(t => t.assigned_to === 'manuel' || !t.assigned_to);
  const gonzalo = pending.filter(t => t.assigned_to === 'gonzalo');

  if (tasks.length === 0) {
    taskList.innerHTML = `
      <div class="empty-state">
        <div class="emoji">&#127937;</div>
        <p>No tasks yet.<br>Type or speak to add one!</p>
      </div>
    `;
    return;
  }

  let html = '';

  if (manuel.length > 0) {
    html += renderSection('Manuel', manuel, manuel.length);
  }

  if (gonzalo.length > 0) {
    html += renderSection('Gonzalo', gonzalo, gonzalo.length);
  }

  if (completed.length > 0) {
    html += renderCompletedSection(completed);
  }

  taskList.innerHTML = html;
  attachEventListeners();
}

function renderSection(title, items, count) {
  return `
    <div class="section">
      <div class="section-header">
        ${title} <span class="count">${count}</span>
      </div>
      ${items.map(t => renderTaskItem(t, false)).join('')}
    </div>
  `;
}

function renderCompletedSection(items) {
  return `
    <div class="section">
      <div class="section-header completed-header">
        Completed <span class="count">${items.length}</span>
      </div>
      ${items.map(t => renderTaskItem(t, true)).join('')}
    </div>
  `;
}

function renderTaskItem(task, isCompleted) {
  const sourceIcon = task.source === 'voice' ? '&#127908;' : '';
  const timeAgo = getTimeAgo(task.created_at);

  const eventBadge = task.event_date
    ? `<span class="task-event-badge">&#128197; ${new Date(task.event_date).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      })}</span>`
    : '';

  return `
    <div class="task-item ${isCompleted ? 'completed' : ''}">
      <div class="task-checkbox ${isCompleted ? 'checked' : ''}" data-id="${task.id}" data-status="${task.status}"></div>
      <div class="task-content">
        <div class="task-message">${escapeHtml(task.message)}${eventBadge}</div>
        <div class="task-meta">
          ${sourceIcon ? `<span class="task-source">${sourceIcon}</span>` : ''}
          <span class="task-time">${timeAgo}</span>
        </div>
      </div>
      <button class="task-delete" data-id="${task.id}" aria-label="Delete">&times;</button>
    </div>
  `;
}

function attachEventListeners() {
  document.querySelectorAll('.task-checkbox').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const newStatus = el.dataset.status === 'pending' ? 'completed' : 'pending';
      updateTask(id, { status: newStatus });
    });
  });

  document.querySelectorAll('.task-delete').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      deleteTask(id);
    });
  });
}

// === Calendar Render ===
function renderCalendar() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(calendarWeekStart);
    d.setDate(d.getDate() + i);
    days.push({
      date: d,
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: d.getTime() === today.getTime(),
      events: calendarEvents.filter(e => {
        const ed = new Date(e.event_date);
        return ed.getFullYear() === d.getFullYear()
          && ed.getMonth() === d.getMonth()
          && ed.getDate() === d.getDate();
      }).sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
    });
  }

  const weekEnd = new Date(calendarWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${formatShortDate(calendarWeekStart)} - ${formatShortDate(weekEnd)}`;

  let html = `
    <div class="cal-nav">
      <button class="cal-nav-btn" id="calPrev" aria-label="Previous week">&larr;</button>
      <span class="cal-week-label">${weekLabel}</span>
      <button class="cal-nav-btn" id="calNext" aria-label="Next week">&rarr;</button>
    </div>
    <div class="cal-week">
      ${days.map(d => `
        <div class="cal-day-header ${d.isToday ? 'today' : ''}">
          ${d.dayName}
          <span class="cal-day-num">${d.dayNum}</span>
        </div>
      `).join('')}
    </div>
    <div class="cal-events">
  `;

  let hasEvents = false;
  for (const day of days) {
    for (const event of day.events) {
      hasEvents = true;
      const time = new Date(event.event_date).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const assignee = event.assigned_to || 'manuel';
      const title = event.event_title || event.message;

      html += `
        <div class="cal-event ${assignee}">
          <div class="cal-event-time">${day.dayName} ${day.dayNum} &middot; ${time}</div>
          <div class="cal-event-title">${escapeHtml(title)}</div>
          <div class="cal-event-assignee">${capitalize(assignee)}</div>
        </div>
      `;
    }
  }

  if (!hasEvents) {
    html += `<div class="cal-empty">No events this week</div>`;
  }

  html += `</div>`;
  calendarView.innerHTML = html;

  document.getElementById('calPrev').addEventListener('click', () => {
    calendarWeekStart.setDate(calendarWeekStart.getDate() - 7);
    fetchCalendarEvents();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calendarWeekStart.setDate(calendarWeekStart.getDate() + 7);
    fetchCalendarEvents();
  });
}

// === Helpers ===
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatShortDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.className = 'toast' + (isError ? ' error' : '');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// === Submit Handler ===
function submitTask() {
  const message = taskInput.value.trim();
  if (!message) return;
  const source = isRecording ? 'voice' : 'text';
  createTask(message, source);
}

sendBtn.addEventListener('click', submitTask);
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitTask();
  }
});

// === View Tabs ===
document.querySelectorAll('.view-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    if (view === currentView) return;

    currentView = view;
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    if (view === 'tasks') {
      taskList.classList.remove('hidden');
      calendarView.classList.add('hidden');
    } else {
      taskList.classList.add('hidden');
      calendarView.classList.remove('hidden');
      fetchCalendarEvents();
    }
  });
});

// === Speech Recognition ===
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    taskInput.value = transcript;
  };

  recognition.onend = () => {
    if (isRecording) {
      isRecording = false;
      micBtn.classList.remove('recording');
      if (taskInput.value.trim()) {
        createTask(taskInput.value.trim(), 'voice');
      }
    }
  };

  recognition.onerror = (event) => {
    isRecording = false;
    micBtn.classList.remove('recording');
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showToast('Speech recognition error', true);
    }
  };
}

micBtn.addEventListener('click', () => {
  if (!recognition) {
    showToast('Speech not supported in this browser', true);
    return;
  }

  if (isRecording) {
    isRecording = false;
    micBtn.classList.remove('recording');
    recognition.stop();
  } else {
    isRecording = true;
    micBtn.classList.add('recording');
    taskInput.value = '';
    recognition.start();
  }
});

// === Service Worker ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${BASE}/sw.js`).catch(() => {});
}

// === Init ===
initSpeechRecognition();
fetchTasks();
