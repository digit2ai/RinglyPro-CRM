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
  const PW = process.env.SPEAKUP_TEAM_PASSWORD || 'Palindrome@7';

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

    // THE EDITING TOOLS ARE GONE (2026-09-16). Translate, rewrite, summarize, generate and
    // export were removed with the library screen; SpeakUp is the meeting notes taker and
    // the factory. Their endpoints must be absent, not merely unused — a route left behind
    // is a surface nobody maintains.
    for (const [method, path] of [['POST', '/api/v1/recordings/' + rid + '/summarize'], ['POST', '/api/v1/translate'],
      ['POST', '/api/v1/rewrite'], ['POST', '/api/v1/recordings/' + rid + '/generate'],
      ['GET', '/api/v1/recordings/' + rid + '/export?format=md'], ['POST', '/api/v1/recordings/import']]) {
      const r = await fetch(base + path, { method, headers: H, body: method === 'POST' ? JSON.stringify({ recording_id: rid }) : undefined });
      ok(r.status === 404 || r.status === 405, 'removed endpoint is gone: ' + method + ' ' + path.split('?')[0]);
    }

    // ── autosave + crash-recovery lifecycle ──
    const live = await fetch(base + '/api/v1/recordings', { method: 'POST', headers: H, body: JSON.stringify({ title: 'Live', source: 'call', lang: 'es', status: 'recording' }) }).then(j);
    ok(live.recording.status === 'recording', 'create live recording (status=recording)');
    const lid = live.recording.id;
    await fetch(base + '/api/v1/recordings/' + lid + '/transcript', { method: 'PUT', headers: H, body: JSON.stringify({ text: 'parte uno.', lang: 'es' }) });
    await fetch(base + '/api/v1/recordings/' + lid + '/transcript', { method: 'PUT', headers: H, body: JSON.stringify({ text: 'parte uno. parte dos.', lang: 'es' }) });
    const ld = await fetch(base + '/api/v1/recordings/' + lid, { headers: H }).then(j);
    ok(ld.transcript && ld.transcript.text === 'parte uno. parte dos.', 'autosave PUT replaces transcript');
    const pat = await fetch(base + '/api/v1/recordings/' + lid, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'done', duration_sec: 120 }) }).then(j);
    ok(pat.success && pat.recording.status === 'done', 'PATCH finalize (status=done)');
    // simulate a crash: a stale 'recording' row with autosaved text is recoverable
    const live2 = await fetch(base + '/api/v1/recordings', { method: 'POST', headers: H, body: JSON.stringify({ title: 'Crashed', source: 'call', lang: 'es', status: 'recording' }) }).then(j);
    await fetch(base + '/api/v1/recordings/' + live2.recording.id + '/transcript', { method: 'PUT', headers: H, body: JSON.stringify({ text: 'antes del corte', lang: 'es' }) });
    const listLive = await fetch(base + '/api/v1/recordings', { headers: H }).then(j);
    ok(listLive.recordings.some(r => r.id === live2.recording.id && r.status === 'recording'), 'stale recording discoverable for recovery');
    await fetch(base + '/api/v1/recordings/' + live2.recording.id, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'done' }) });
    const recd = await fetch(base + '/api/v1/recordings/' + live2.recording.id, { headers: H }).then(j);
    ok(recd.recording.status === 'done' && recd.transcript.text === 'antes del corte', 'recovery finalizes + keeps autosaved text');
    await fetch(base + '/api/v1/recordings/' + lid, { method: 'DELETE', headers: H });
    await fetch(base + '/api/v1/recordings/' + live2.recording.id, { method: 'DELETE', headers: H });

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
