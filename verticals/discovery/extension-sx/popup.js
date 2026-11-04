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
    $('recmsg').textContent = `Grabando: ${s.steps} ${s.steps === 1 ? 'paso' : 'pasos'}`;
    $('label').value = s.label || '';
    $('label').disabled = true;
  } else {
    $('label').disabled = false;
  }
}

$('save').addEventListener('click', async () => {
  const key = $('key').value.trim();
  const api = $('api').value.trim();
  if (!key.startsWith('synthex_dk_')) return say('Eso no parece una clave de ingesta de Synthex SAI.', 'err');
  const r = await send({ type: 'orbup_config', key, api, actor: $('actor').value.trim() || null });
  if (r && r.ok) { say('Conectado.', 'ok'); refresh(); }
  else say(r && r.status === 401
    ? 'La clave fue rechazada. Revisa que tenga el permiso de ingesta.'
    : 'No se pudo contactar a Synthex SAI. Revisa la dirección.', 'err');
});

$('start').addEventListener('click', async () => {
  await send({ type: 'orbup_start', label: $('label').value.trim() || null });
  say('Grabando. Trabaja normalmente y detén la captura al terminar la tarea.', 'ok');
  refresh();
});

$('stop').addEventListener('click', async () => {
  const r = await send({ type: 'orbup_stop' });
  if (r && r.ok && r.empty) say('No se registró nada.', 'err');
  else if (r && r.ok) {
    const red = r.redaction || {};
    say(`Se enviaron ${r.steps} pasos. Antes de guardar, el servidor descartó ${(red.text_values_dropped || 0)} valores de texto y ${(red.query_strings_dropped || 0)} parámetros de dirección.`, 'ok');
  } else say((r && r.error) || 'No se pudo enviar. Tus pasos se guardan y se irán con el próximo envío.', 'err');
  refresh();
});

$('reset').addEventListener('click', async () => {
  await chrome.storage.local.remove('cfg');
  location.reload();
});

refresh();
