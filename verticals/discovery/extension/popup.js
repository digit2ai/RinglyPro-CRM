'use strict';

const $ = (id) => document.getElementById(id);
const send = (m) => new Promise(r => chrome.runtime.sendMessage(m, r));

function say(text, kind) {
  const el = $('msg');
  el.textContent = text;
  el.className = 'msg ' + (kind || 'ok');
}

async function refresh() {
  const s = await send({ type: 'orbup_status' });
  if (!s) return;
  $('setup').classList.toggle('hide', !!s.configured);
  $('panel').classList.toggle('hide', !s.configured);
  $('recbox').classList.toggle('hide', !s.recording);
  $('start').classList.toggle('hide', !!s.recording);
  $('stop').classList.toggle('hide', !s.recording);
  if (s.recording) {
    $('recmsg').textContent = `Recording — ${s.steps} step${s.steps === 1 ? '' : 's'}`;
    $('label').value = s.label || '';
    $('label').disabled = true;
  } else {
    $('label').disabled = false;
  }
}

$('save').addEventListener('click', async () => {
  const key = $('key').value.trim();
  const api = $('api').value.trim();
  if (!key.startsWith('orbup_dk_')) return say('That does not look like an OrbUp ingest key.', 'err');
  const r = await send({ type: 'orbup_config', key, api, actor: $('actor').value.trim() || null });
  if (r && r.ok) { say('Connected.', 'ok'); refresh(); }
  else say(r && r.status === 401
    ? 'The key was rejected. Check it carries the ingest scope.'
    : 'Could not reach OrbUp. Check the address.', 'err');
});

$('start').addEventListener('click', async () => {
  await send({ type: 'orbup_start', label: $('label').value.trim() || null });
  say('Recording. Work normally — stop when the task is done.', 'ok');
  refresh();
});

$('stop').addEventListener('click', async () => {
  const r = await send({ type: 'orbup_stop' });
  if (r && r.ok && r.empty) say('Nothing was recorded.', 'err');
  else if (r && r.ok) {
    const red = r.redaction || {};
    say(`Sent ${r.steps} steps. The server discarded ${(red.text_values_dropped || 0)} text values and ${(red.query_strings_dropped || 0)} query strings before storing.`, 'ok');
  } else say((r && r.error) || 'Send failed. Your steps are kept and will go with the next send.', 'err');
  refresh();
});

$('reset').addEventListener('click', async () => {
  await chrome.storage.local.remove('cfg');
  location.reload();
});

refresh();
