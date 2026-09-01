'use strict';

/**
 * SERVICE WORKER — buffers steps, notices application switches, ships a run.
 *
 * The one thing this does that a content script cannot: see that the operator
 * left one system for another. Swivel-chair work — carrying the same
 * information between two applications by hand — is the single most automatable
 * pattern in an office and the one least likely to be described in an
 * interview, because nobody remembers it as a process. It is only visible from
 * here, above the tabs.
 *
 * A run is shipped when the operator stops it, and also when the buffer gets
 * large: a laptop that dies mid-morning should not cost a company its morning.
 */

const MAX_BUFFER = 400;
const STORE = { key: null, api: null, label: null, actor: null, recording: false, steps: [], startedAt: null, lastApp: null, runId: null };

async function load() {
  const s = await chrome.storage.local.get(['cfg', 'session']);
  if (s.cfg) { STORE.key = s.cfg.key; STORE.api = s.cfg.api; STORE.actor = s.cfg.actor; }
  if (s.session) Object.assign(STORE, s.session);
}
async function saveSession() {
  await chrome.storage.local.set({
    session: {
      recording: STORE.recording, steps: STORE.steps, label: STORE.label,
      startedAt: STORE.startedAt, lastApp: STORE.lastApp, runId: STORE.runId
    }
  });
}

function badge() {
  chrome.action.setBadgeText({ text: STORE.recording ? String(STORE.steps.length || '•') : '' });
  chrome.action.setBadgeBackgroundColor({ color: STORE.recording ? '#e0483c' : '#00000000' });
}

async function broadcast() {
  const tabs = await chrome.tabs.query({});
  tabs.forEach(t => {
    chrome.tabs.sendMessage(t.id, { type: 'orbup_state', recording: STORE.recording }).catch(() => {});
  });
}

function pushStep(step) {
  if (!STORE.recording) return;
  // The application switch, recorded from above the tabs.
  if (step.host && STORE.lastApp && step.host !== STORE.lastApp) {
    STORE.steps.push({ action: 'switch_app', host: step.host, dwell_ms: 0 });
  }
  if (step.host) STORE.lastApp = step.host;
  STORE.steps.push(step);
  if (STORE.steps.length >= MAX_BUFFER) flush({ partial: true });
  badge(); saveSession();
}

/** Ship what we have. `partial` keeps recording; the server dedupes by ref. */
async function flush({ partial = false } = {}) {
  const steps = STORE.steps.slice();
  if (!steps.length) { if (!partial) { STORE.recording = false; badge(); broadcast(); saveSession(); } return { ok: true, empty: true }; }
  if (!STORE.key || !STORE.api) return { ok: false, error: 'No API key configured. Open the popup and paste your ingest key.' };

  const started = STORE.startedAt || Date.now();
  const body = {
    label: STORE.label || null,
    actor: STORE.actor || null,
    external_ref: `${STORE.runId || started}${partial ? '-p' + Math.ceil(steps.length / MAX_BUFFER) : ''}`,
    started_at: new Date(started).toISOString(),
    ended_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    steps
  };

  try {
    const res = await fetch(STORE.api.replace(/\/+$/, '') + '/discovery/api/v1/ingest/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + STORE.key },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || ('HTTP ' + res.status) };

    STORE.steps = [];
    if (!partial) { STORE.recording = false; STORE.startedAt = null; STORE.lastApp = null; STORE.runId = null; }
    badge(); broadcast(); saveSession();
    return { ok: true, capture_id: json.capture_id, redaction: json.redaction, steps: steps.length };
  } catch (e) {
    // The steps stay in the buffer. A failed upload must never lose a morning.
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    await load();
    switch (msg && msg.type) {
      case 'orbup_hello': reply({ recording: STORE.recording }); break;
      case 'orbup_step': pushStep(msg.step); reply({ ok: true }); break;
      case 'orbup_start':
        STORE.recording = true; STORE.steps = []; STORE.startedAt = Date.now();
        STORE.runId = Date.now(); STORE.label = msg.label || null; STORE.lastApp = null;
        badge(); broadcast(); await saveSession(); reply({ ok: true });
        break;
      case 'orbup_stop': reply(await flush({ partial: false })); break;
      case 'orbup_status':
        reply({
          recording: STORE.recording, steps: STORE.steps.length,
          label: STORE.label, configured: !!(STORE.key && STORE.api),
          started_at: STORE.startedAt
        });
        break;
      case 'orbup_config':
        STORE.key = msg.key; STORE.api = msg.api; STORE.actor = msg.actor || null;
        await chrome.storage.local.set({ cfg: { key: STORE.key, api: STORE.api, actor: STORE.actor } });
        try {
          const r = await fetch(STORE.api.replace(/\/+$/, '') + '/discovery/api/v1/ingest/ping', {
            headers: { 'Authorization': 'Bearer ' + STORE.key }
          });
          reply({ ok: r.ok, status: r.status });
        } catch (e) { reply({ ok: false, error: e.message }); }
        break;
      default: reply({ ok: false });
    }
  })();
  return true;
});

chrome.tabs.onActivated.addListener(async () => {
  await load();
  if (!STORE.recording) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  try {
    const host = new URL(tab.url).hostname;
    if (host && host !== STORE.lastApp) { pushStep({ action: 'switch_app', host, path: '/', dwell_ms: 0 }); }
  } catch (e) { /* chrome:// and friends carry no host */ }
});

load().then(badge);
