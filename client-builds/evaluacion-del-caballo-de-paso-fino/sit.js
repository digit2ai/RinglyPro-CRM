// =====================================================
// SIT harness — Evaluación del Caballo de Paso Fino.
//
//   node sit.js   -> boots the sub-app in-process on an ephemeral port with
//                    ECPF_FORCE_MEMORY=1 (no DB needed) and runs the full
//                    acceptance suite, generating synthetic 16-bit PCM mono WAVs
//                    in-memory for the analyzer.
//   SIT_BASE_URL=https://aiagent.ringlypro.com/evaluacion-del-caballo-de-paso-fino node sit.js
//                 -> tests a live remote instance over HTTP (signs tokens with
//                    JWT_SECRET; uses an isolated high test tenant).
//
// Exit 0 when every check passes; exit 1 with a markdown failure summary.
// =====================================================

'use strict';

process.env.ECPF_FORCE_MEMORY = process.env.ECPF_FORCE_MEMORY || '1';

const jwt = require('jsonwebtoken');
const http = require('http');
const synth = require('./lib/synth');
const { classify } = require('./lib/classifier');
const { score, CRITERIOS_PASO_FINO } = require('./lib/scoring');
const { sequenceAndIntervals } = require('./lib/footfall');
const { movimiento } = require('./lib/metrics');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TENANT_A = 970001;
const TENANT_B = 970002;
const VERDICTS = ['vet_review', 'training_adjustment', 'normal'];

function tokenFor(tenant_id) {
  return jwt.sign({ tenant_id, clientId: tenant_id, email: 'sit@digit2ai.com' }, JWT_SECRET, { expiresIn: '10m' });
}

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail || '' }); }

// ---- Synthetic WAV generation (16-bit PCM mono) ----------------------------
// Place a short decaying-sine "hoof beat" burst at each onset time. The bursts
// are well-separated and far above the silent floor, so the energy-envelope
// onset detector recovers exactly one onset per burst.
function buildWav(onsetTimes, sampleRate, totalSec) {
  const N = Math.round(sampleRate * totalSec);
  const samples = new Float32Array(N);
  const burstSec = 0.04, freq = 800, decay = 0.012;
  for (const t0 of onsetTimes) {
    const start = Math.round(t0 * sampleRate);
    const len = Math.round(burstSec * sampleRate);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx >= N) break;
      const tt = i / sampleRate;
      samples[idx] += 0.85 * Math.exp(-tt / decay) * Math.sin(2 * Math.PI * freq * tt);
    }
  }
  // PCM16 little-endian mono WAV.
  const dataBytes = N * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);          // fmt chunk size
  buf.writeUInt16LE(1, 20);           // PCM
  buf.writeUInt16LE(1, 22);           // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);           // block align
  buf.writeUInt16LE(16, 34);          // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < N; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// Evenly spaced beats -> very low CV. 0.5s apart = 120 BPM (< gallop 150).
function regularWav() {
  const onsets = [];
  for (let t = 0.5; t <= 6.0; t += 0.5) onsets.push(Number(t.toFixed(3)));
  return { wav: buildWav(onsets, 22050, 6.5), onsets };
}
// Irregular spacing -> high CV (alternating long/short intervals).
function irregularWav() {
  const gaps = [0.30, 0.64, 0.32, 0.66, 0.31, 0.63, 0.34, 0.65, 0.30, 0.62];
  const onsets = [];
  let t = 0.4;
  for (const g of gaps) { onsets.push(Number(t.toFixed(3))); t += g; }
  onsets.push(Number(t.toFixed(3)));
  return { wav: buildWav(onsets, 22050, t + 0.5), onsets };
}

// ---- HTTP helpers ----------------------------------------------------------
async function reqJson(base, method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const resp = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: resp.status, json, text };
}

async function reqUpload(base, path, { token, wavBuffer, filename, mime, horseId }) {
  const fd = new FormData();
  if (wavBuffer != null) {
    fd.append('audio', new Blob([wavBuffer], { type: mime || 'audio/wav' }), filename || 'gait.wav');
  }
  if (horseId != null) fd.append('horse_id', String(horseId));
  fd.append('lang', 'es');
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const resp = await fetch(base + path, { method: 'POST', headers, body: fd });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: resp.status, json, text };
}

// Championship session upload: pose_frames JSON field (+ optional audio WAV).
async function reqChampSession(base, { token, inscripcion_id, superficie, frames, wavBuffer }) {
  const fd = new FormData();
  fd.append('inscripcion_id', String(inscripcion_id));
  if (superficie) fd.append('superficie', superficie);
  if (frames) fd.append('pose_frames', JSON.stringify(frames));
  if (wavBuffer != null) fd.append('audio', new Blob([wavBuffer], { type: 'audio/wav' }), 'gait.wav');
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const resp = await fetch(base + '/api/v1/champ/sessions', { method: 'POST', headers, body: fd });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: resp.status, json, text };
}

// ---- Suite -----------------------------------------------------------------
async function run(base) {
  const A = tokenFor(TENANT_A);
  const B = tokenFor(TENANT_B);

  // #1 health
  {
    const r = await reqJson(base, 'GET', '/health');
    check('health 200 + shape', r.status === 200 && r.json && r.json.status === 'ok'
      && r.json.service === 'evaluacion-del-caballo-de-paso-fino' && r.json.version === '1.0.0',
      `status=${r.status} body=${r.text.slice(0, 120)}`);
  }

  // #2 create horse requires JWT
  {
    const noAuth = await reqJson(base, 'POST', '/api/v1/horses', { body: { name: 'X', breed: 'Y' } });
    check('POST /horses without JWT -> 401', noAuth.status === 401, `status=${noAuth.status}`);
  }
  let horseA = null;
  {
    const r = await reqJson(base, 'POST', '/api/v1/horses', { token: A, body: { name: 'Relámpago', breed: 'Paso Fino Colombiano' } });
    horseA = r.json;
    check('POST /horses with JWT -> 201 + tenant_id', r.status === 201 && r.json && r.json.id != null
      && r.json.tenant_id === TENANT_A, `status=${r.status} body=${r.text.slice(0, 160)}`);
  }

  // #3 list filtered by tenant
  {
    const rA = await reqJson(base, 'GET', '/api/v1/horses', { token: A });
    const rB = await reqJson(base, 'GET', '/api/v1/horses', { token: B });
    const aHasIt = Array.isArray(rA.json) && rA.json.some((h) => horseA && h.id === horseA.id);
    const bLacksIt = Array.isArray(rB.json) && !rB.json.some((h) => horseA && h.id === horseA.id);
    check('GET /horses tenant-filtered', rA.status === 200 && aHasIt && bLacksIt,
      `A=${rA.status}/${(rA.json || []).length} B=${rB.status}/${(rB.json || []).length}`);
  }

  // #5 non-WAV -> 415  (run before #4 so a bad upload can't poison history)
  {
    const r = await reqUpload(base, '/api/v1/evaluations', {
      token: A, wavBuffer: Buffer.from('this is not audio'), filename: 'note.txt', mime: 'text/plain', horseId: horseA && horseA.id
    });
    check('POST /evaluations non-WAV -> 415', r.status === 415, `status=${r.status} body=${r.text.slice(0, 120)}`);
  }

  // #4 + #6 regular WAV -> 201 + vet_review
  let firstEval = null;
  {
    const { wav } = regularWav();
    const r = await reqUpload(base, '/api/v1/evaluations', { token: A, wavBuffer: wav, filename: 'reg.wav', horseId: horseA && horseA.id });
    firstEval = r.json;
    const shapeOk = r.status === 201 && r.json && r.json.cadence_bpm != null && r.json.regularity_cv != null
      && VERDICTS.includes(r.json.verdict) && typeof r.json.recommendation === 'string';
    check('POST /evaluations regular WAV -> 201 + shape', shapeOk,
      `status=${r.status} body=${r.text.slice(0, 200)}`);
    check('regular WAV -> verdict vet_review (constant + lagging)', r.json && r.json.verdict === 'vet_review',
      `verdict=${r.json && r.json.verdict} cadence=${r.json && r.json.cadence_bpm} cv=${r.json && r.json.regularity_cv} beats=${r.json && r.json.beat_count}`);
  }

  // #6 irregular WAV -> training_adjustment
  let regCv = firstEval ? firstEval.regularity_cv : null;
  {
    const { wav } = irregularWav();
    const r = await reqUpload(base, '/api/v1/evaluations', { token: A, wavBuffer: wav, filename: 'irr.wav', horseId: horseA && horseA.id });
    check('irregular WAV -> verdict training_adjustment', r.json && r.json.verdict === 'training_adjustment',
      `verdict=${r.json && r.json.verdict} cadence=${r.json && r.json.cadence_bpm} cv=${r.json && r.json.regularity_cv} beats=${r.json && r.json.beat_count}`);
    // Stuck-loop fallback assertion: irregular CV must exceed regular CV (ordering).
    const irrCv = r.json && r.json.regularity_cv;
    check('CV ordering: irregular > regular', regCv != null && irrCv != null && irrCv > regCv,
      `regCv=${regCv} irrCv=${irrCv}`);
  }

  // #7 history newest first
  {
    const r = await reqJson(base, 'GET', `/api/v1/evaluations?horse_id=${horseA && horseA.id}`, { token: A });
    const arr = r.json || [];
    const newestFirst = arr.length >= 2 && new Date(arr[0].created_at).getTime() >= new Date(arr[1].created_at).getTime() && arr[0].id >= arr[1].id;
    check('GET /evaluations history newest-first', r.status === 200 && arr.length >= 2 && newestFirst,
      `status=${r.status} count=${arr.length}`);
  }

  // #8 ES default + EN switch
  {
    const es = await reqJson(base, 'GET', '/');
    const en = await reqJson(base, 'GET', '/?lang=en');
    const esOk = es.status === 200 && /<h1[^>]*>[^<]*Evaluaci[oó]n/i.test(es.text);
    const enOk = en.status === 200 && /<h1[^>]*>[^<]*(Evaluation|Gait)/i.test(en.text) && /lang="en"/.test(en.text);
    check('GET / renders ES <h1> with "Evaluación"', esOk, `es=${es.status}`);
    check('GET /?lang=en renders English <h1>', enOk, `en=${en.status}`);
  }

  // #9 privacidad
  {
    const r = await reqJson(base, 'GET', '/privacidad');
    check('GET /privacidad -> 200 + Ley 1581', r.status === 200 && /1581/.test(r.text), `status=${r.status}`);
  }

  // demo session: server-minted token drives a write with no user-pasted JWT.
  {
    const sess = await reqJson(base, 'GET', '/api/v1/session/demo');
    const tok = sess.json && sess.json.token;
    const wrote = tok
      ? await reqJson(base, 'POST', '/api/v1/horses', { token: tok, body: { name: 'Demo', breed: 'POC' } })
      : { status: 0 };
    check('demo session mints a token + drives a write', sess.status === 200 && !!tok
      && sess.json.tenant_id === 1 && wrote.status === 201,
      `session=${sess.status} write=${wrote.status}`);
  }

  // ---- Clasificador (sección 4.5): tests deterministas sobre pisadas sintéticas
  {
    const pf = classify(synth.syntheticPisadas('paso_fino', { ciclos: 6 }));
    check('clasifica paso_fino (4 tiempos laterales)', pf.modalidad_detectada === 'paso_fino' && pf.tiempos === 4, JSON.stringify(pf));
    const tr = classify(synth.syntheticPisadas('trocha', { ciclos: 6 }));
    check('clasifica trocha (4 tiempos diagonales)', tr.modalidad_detectada === 'trocha' && tr.tiempos === 4, JSON.stringify(tr));
    const tg = classify(synth.syntheticPisadas('trote', { ciclos: 6 }));
    check('clasifica trote_galope (2 tiempos diagonales)', tg.modalidad_detectada === 'trote_galope' && tg.tiempos === 2, JSON.stringify(tg));

    const reg = synth.syntheticPisadas('paso_fino', { ciclos: 6, jitter: 0 });
    const irr = synth.syntheticPisadas('paso_fino', { ciclos: 6, jitter: 0.4, seed: 7 });
    const movR = movimiento(sequenceAndIntervals(reg), null, 6, classify(reg));
    const movI = movimiento(sequenceAndIntervals(irr), null, 6, classify(irr));
    const ritmoR = score(CRITERIOS_PASO_FINO, movR, {}, null).puntuaciones[0].puntaje_normalizado;
    const ritmoI = score(CRITERIOS_PASO_FINO, movI, {}, null).puntuaciones[0].puntaje_normalizado;
    check('CV alto baja el puntaje de regularidad', ritmoI < ritmoR, `ritmoReg=${ritmoR} ritmoIrr=${ritmoI}`);
  }

  // ---- Championship endpoint e2e: setup -> sesión (pose) -> fallo + ranking
  {
    const setup = await reqJson(base, 'POST', '/api/v1/champ/demo-setup', { token: A, body: {} });
    const inscripcion = setup.json && setup.json.inscripcion;
    const categoria = setup.json && setup.json.categoria;
    check('POST /champ/demo-setup -> 201 + inscripción', setup.status === 201 && inscripcion && inscripcion.id != null, `status=${setup.status}`);

    if (inscripcion) {
      const frames = synth.syntheticFrames('paso_fino', { ciclos: 6, cycleMs: 1000 });
      const sess = await reqChampSession(base, { token: A, inscripcion_id: inscripcion.id, superficie: 'tablado', frames });
      const f = sess.json;
      check('POST /champ/sessions clasifica paso_fino + puntúa', sess.status === 201 && f && f.clasificacion
        && f.clasificacion.modalidad_detectada === 'paso_fino' && typeof f.puntaje_total === 'number',
        `status=${sess.status} body=${sess.text.slice(0, 220)}`);
      check('es_modalidad_valida = true (detectada == categoría)', f && f.clasificacion && f.clasificacion.es_modalidad_valida === true, JSON.stringify(f && f.clasificacion));
      check('pipeline genera pisadas + 5 puntuaciones', f && Array.isArray(f.pisadas) && f.pisadas.length >= 12 && Array.isArray(f.puntuaciones) && f.puntuaciones.length === 5, `pisadas=${f && f.pisadas && f.pisadas.length}`);

      const got = await reqJson(base, 'GET', `/api/v1/champ/sessions/${f.sesion_id}`);
      check('GET /champ/sessions/:id -> fallo completo', got.status === 200 && got.json && got.json.clasificacion
        && got.json.metricas_movimiento && Array.isArray(got.json.pisadas) && got.json.pisadas.length >= 12, `status=${got.status}`);

      const ranking = await reqJson(base, 'GET', `/api/v1/champ/results?categoria_id=${categoria.id}`);
      check('GET /champ/results -> ranking de categoría', ranking.status === 200 && Array.isArray(ranking.json)
        && ranking.json.length >= 1 && ranking.json[0].ranking === 1, `status=${ranking.status} len=${(ranking.json || []).length}`);
    }

    // Bandera de modalidad: trote en categoría paso_fino -> es_modalidad_valida false
    const setup2 = await reqJson(base, 'POST', '/api/v1/champ/demo-setup', { token: A, body: { numero: 2, caballo: 'Tormenta' } });
    const ins2 = setup2.json && setup2.json.inscripcion;
    if (ins2) {
      const framesT = synth.syntheticFrames('trote', { ciclos: 6, cycleMs: 900 });
      const sess2 = await reqChampSession(base, { token: A, inscripcion_id: ins2.id, superficie: 'arena', frames: framesT });
      check('modalidad NO coincide -> es_modalidad_valida false', sess2.json && sess2.json.clasificacion
        && sess2.json.clasificacion.modalidad_detectada === 'trote_galope' && sess2.json.clasificacion.es_modalidad_valida === false,
        JSON.stringify(sess2.json && sess2.json.clasificacion));
    }

    // Modo demostración server-side (demo_modalidad, sin pose_frames del cliente)
    const setup3 = await reqJson(base, 'POST', '/api/v1/champ/demo-setup', { token: A, body: { numero: 3 } });
    const ins3 = setup3.json && setup3.json.inscripcion;
    if (ins3) {
      const fd = new FormData();
      fd.append('inscripcion_id', String(ins3.id));
      fd.append('superficie', 'tablado');
      fd.append('demo_modalidad', 'paso_fino');
      const resp = await fetch(base + '/api/v1/champ/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + A }, body: fd });
      const j = await resp.json().catch(() => null);
      check('modo demostración server-side (demo_modalidad) corre el pipeline', resp.status === 201 && j && j.clasificacion && j.clasificacion.modalidad_detectada === 'paso_fino', `status=${resp.status}`);
    }
  }
}

// ---- Boot + report ---------------------------------------------------------
(async () => {
  let server = null;
  let base = process.env.SIT_BASE_URL && process.env.SIT_BASE_URL.replace(/\/$/, '');
  try {
    if (!base) {
      const app = require('./index');
      server = http.createServer(app);
      await new Promise((res) => server.listen(0, res));
      base = `http://127.0.0.1:${server.address().port}`;
    }
    await run(base);
  } catch (e) {
    check('harness ran without throwing', false, e.message + '\n' + (e.stack || ''));
  } finally {
    if (server) server.close();
  }

  const failed = results.filter((r) => !r.pass);
  const pass = failed.length === 0;
  if (pass) {
    console.log(`# SIT PASS — Evaluación del Caballo de Paso Fino\n\nAll ${results.length} checks passed.`);
    results.forEach((r) => console.log(`- [x] ${r.name}`));
    process.exit(0);
  } else {
    console.log(`# SIT FAIL — Evaluación del Caballo de Paso Fino\n\n${failed.length}/${results.length} checks failed.\n`);
    results.forEach((r) => console.log(`- [${r.pass ? 'x' : ' '}] ${r.name}${r.pass ? '' : '  \n      ↳ ' + r.detail}`));
    process.exit(1);
  }
})();
