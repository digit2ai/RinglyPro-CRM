'use strict';

/**
 * SpeakUp — System Integration Test (smoke test).
 * Boots the router against CRM_DATABASE_URL || DATABASE_URL and exercises the
 * full flow with NO external keys (STT stub + AI heuristic fallback).
 *
 * Run from the repo root:  node verticals/speakup/sit.js
 * Exit 0 = all green.
 */

require('dotenv').config();
const express = require('express');

const app = express();
app.use('/speakup', require('./src/index'));

const server = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/speakup';
  const j = (r) => r.json();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? (pass++, console.log('PASS ' + m)) : (fail++, console.log('FAIL ' + m)); };
  const PW = process.env.SPEAKUP_TEAM_PASSWORD || 'speakup@2026';

  try {
    await wait(4000); // let sync + seed finish

    const h = await fetch(base + '/health').then(j);
    ok(h.status === 'healthy', `health (db=${h.db}, stt=${h.stt_engine}, ai=${h.ai_model})`);

    ok((await fetch(base + '/api/v1/recordings')).status === 401, 'unauth recordings blocked (401)');

    const lr = await fetch(base + '/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mstagg@digit2ai.com', password: PW })
    });
    const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
    ok(lr.ok && cookie.includes('speakup_token'), 'login sets cookie');
    const H = { 'Content-Type': 'application/json', Cookie: cookie };

    const cr = await fetch(base + '/api/v1/recordings', { method: 'POST', headers: H,
      body: JSON.stringify({ title: 'SIT', source: 'mic', lang: 'es', duration_sec: 30,
        text: 'Voy a enviar el reporte hoy. Necesito revisar el presupuesto. Decidimos lanzar el martes.' }) }).then(j);
    ok(cr.success && cr.recording.id, 'create mic recording');
    const rid = cr.recording.id;

    ok((await fetch(base + '/api/v1/recordings', { headers: H }).then(j)).recordings.some(r => r.id === rid && r.has_transcript), 'library shows transcript');
    ok((await fetch(base + '/api/v1/recordings/' + rid, { headers: H }).then(j)).transcript.text.includes('reporte'), 'detail transcript');

    ok((await fetch(base + '/api/v1/recordings/' + rid + '/summarize', { method: 'POST', headers: H }).then(j)).summary, 'summarize');
    ok((await fetch(base + '/api/v1/translate', { method: 'POST', headers: H, body: JSON.stringify({ recording_id: rid, target_lang: 'English' }) }).then(j)).translation.text, 'translate');
    ok((await fetch(base + '/api/v1/rewrite', { method: 'POST', headers: H, body: JSON.stringify({ recording_id: rid, tone: 'bullets' }) }).then(j)).edit.output_text, 'rewrite');

    const ex = await fetch(base + '/api/v1/recordings/' + rid + '/export?format=md', { headers: H });
    ok(ex.ok && (await ex.text()).includes('# SIT'), 'export md');

    // Upload → async stub transcription → poll
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('audio')], { type: 'audio/mpeg' }), 'clip.mp3');
    const up = await fetch(base + '/api/v1/recordings/upload', { method: 'POST', headers: { Cookie: cookie }, body: fd }).then(j);
    ok(up.recording.status === 'processing', 'upload enqueued (processing)');
    let done = false;
    for (let i = 0; i < 12; i++) {
      const s = await fetch(base + '/api/v1/recordings/' + up.recording.id + '/status', { headers: H }).then(j);
      if (s.status === 'done') { done = true; break; } await wait(600);
    }
    ok(done, 'upload transcription finished (async)');

    ok((await fetch(base + '/api/v1/recordings/99999999', { headers: H })).status === 404, 'tenant isolation (unknown id 404)');

    ok((await fetch(base + '/api/v1/recordings/' + rid, { method: 'DELETE', headers: H }).then(j)).success, 'delete');
    await fetch(base + '/api/v1/recordings/' + up.recording.id, { method: 'DELETE', headers: H });
    ok((await fetch(base + '/api/v1/recordings/' + rid, { headers: H })).status === 404, 'deleted gone (404)');
  } catch (e) { console.log('ERROR', e.message); fail++; }

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  server.close();
  process.exit(fail ? 1 : 0);
});
