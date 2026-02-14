// === DOM Elements ===
const taskInput = document.getElementById('taskInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const taskList = document.getElementById('taskList');
const toast = document.getElementById('toast');

// === Base path detection (works standalone at / or mounted at /quicktask/) ===
const BASE = window.location.pathname.replace(/\/$/, '') || '';

// === State ===
let tasks = [];
let recognition = null;
let isRecording = false;

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
    } else {
      showToast(json.error || 'Failed to delete task', true);
    }
  } catch (err) {
    showToast('Failed to delete task', true);
  }
}

// === Render ===
function renderTasks() {
  const pending = tasks.filter(t => t.status === 'pending');
  const completed = tasks.filter(t => t.status === 'completed');

  const unassigned = pending.filter(t => !t.assigned_to);
  const manuel = pending.filter(t => t.assigned_to === 'manuel');
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

  if (unassigned.length > 0) {
    html += renderSection('Unassigned', unassigned, unassigned.length);
  }

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

  let assignBtns = '';
  if (!isCompleted && !task.assigned_to) {
    assignBtns = `
      <div class="assign-btns">
        <button class="assign-btn manuel" data-id="${task.id}" data-assign="manuel">Manuel</button>
        <button class="assign-btn gonzalo" data-id="${task.id}" data-assign="gonzalo">Gonzalo</button>
      </div>
    `;
  }

  return `
    <div class="task-item ${isCompleted ? 'completed' : ''}">
      <div class="task-checkbox ${isCompleted ? 'checked' : ''}" data-id="${task.id}" data-status="${task.status}"></div>
      <div class="task-content">
        <div class="task-message">${escapeHtml(task.message)}</div>
        <div class="task-meta">
          ${sourceIcon ? `<span class="task-source">${sourceIcon}</span>` : ''}
          <span class="task-time">${timeAgo}</span>
        </div>
        ${assignBtns}
      </div>
      <button class="task-delete" data-id="${task.id}" aria-label="Delete">&times;</button>
    </div>
  `;
}

function attachEventListeners() {
  // Checkboxes
  document.querySelectorAll('.task-checkbox').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const newStatus = el.dataset.status === 'pending' ? 'completed' : 'pending';
      updateTask(id, { status: newStatus });
    });
  });

  // Assign buttons
  document.querySelectorAll('.assign-btn').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const assigned_to = el.dataset.assign;
      updateTask(id, { assigned_to });
    });
  });

  // Delete buttons
  document.querySelectorAll('.task-delete').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      deleteTask(id);
    });
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
      // Auto-submit if there's text
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
