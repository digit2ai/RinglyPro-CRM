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
process.env.ECPF_TEST_CREDITS = process.env.ECPF_TEST_CREDITS || '1'; // enables /credits/test-grant for SIT

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
// Register a fresh account and return its bearer token. Unique email per run.
async function registerAccount(base, tag) {
  const email = 'sit+' + tag + '.' + TENANT_A + '@digit2ai.com';
  const r = await reqJson(base, 'POST', '/api/v1/account/register', { body: { email, password: 'sitpass123', nombre: 'SIT ' + tag } });
  // If already registered (remote re-run), log in instead.
  if (r.status === 409) {
    const l = await reqJson(base, 'POST', '/api/v1/account/login', { body: { email, password: 'sitpass123' } });
    return l.json && l.json.token;
  }
  return r.json && r.json.token;
}
async function grantCredits(base, token, n) {
  return reqJson(base, 'POST', '/api/v1/account/credits/test-grant', { token, body: { credits: n } });
}

async function run(base) {
  // Two OWN accounts (separate from the CRM). A is funded; B is a second tenant.
  const A = await registerAccount(base, 'a.' + Date.now());
  const B = await registerAccount(base, 'b.' + Date.now());
  await grantCredits(base, A, 200);
  await grantCredits(base, B, 50);

  // #1 health
  {
    const r = await reqJson(base, 'GET', '/health');
    check('health 200 + shape', r.status === 200 && r.json && r.json.status === 'ok'
      && r.json.service === 'evaluacion-del-caballo-de-paso-fino' && r.json.version === '1.1.0'
      && r.json.db && r.json.payments,
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
    check('POST /horses with account -> 201 + tenant_id', r.status === 201 && r.json && r.json.id != null
      && Number.isInteger(r.json.tenant_id) && r.json.tenant_id > 0, `status=${r.status} body=${r.text.slice(0, 160)}`);
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

  // ---- Cuentas + créditos (sistema propio) ---------------------------------
  {
    // Registro -> saldo inicial (bono; 0 por defecto).
    const email = 'sit+credits.' + Date.now() + '@digit2ai.com';
    const reg = await reqJson(base, 'POST', '/api/v1/account/register', { body: { email, password: 'sitpass123', nombre: 'Créditos' } });
    const tok = reg.json && reg.json.token;
    check('POST /account/register -> 201 + token + credits', reg.status === 201 && !!tok && reg.json.user && reg.json.user.credits === 0,
      `status=${reg.status} credits=${reg.json && reg.json.user && reg.json.user.credits}`);

    // /me refleja la cuenta.
    const me = await reqJson(base, 'GET', '/api/v1/account/me', { token: tok });
    check('GET /account/me -> account + 0 credits', me.status === 200 && me.json && me.json.email === email && me.json.credits === 0, `status=${me.status}`);

    // Duplicado -> 409.
    const dup = await reqJson(base, 'POST', '/api/v1/account/register', { body: { email, password: 'sitpass123' } });
    check('register duplicate email -> 409', dup.status === 409, `status=${dup.status}`);

    // Login válido / inválido.
    const badLogin = await reqJson(base, 'POST', '/api/v1/account/login', { body: { email, password: 'wrong' } });
    check('login wrong password -> 401', badLogin.status === 401, `status=${badLogin.status}`);
    const okLogin = await reqJson(base, 'POST', '/api/v1/account/login', { body: { email, password: 'sitpass123' } });
    check('login valid -> 200 + token', okLogin.status === 200 && okLogin.json && !!okLogin.json.token, `status=${okLogin.status}`);

    // Paquetes de recarga: 10,20,40,60,80,100 con créditos 1:1.
    const pk = await reqJson(base, 'GET', '/api/v1/account/credits/packages');
    const amounts = (pk.json && pk.json.packages || []).map((p) => p.amount).join(',');
    const oneToOne = (pk.json && pk.json.packages || []).every((p) => p.credits === p.amount);
    check('GET /credits/packages -> [10,20,40,60,80,100] @ 1:1', pk.status === 200 && amounts === '10,20,40,60,80,100' && oneToOne, `amounts=${amounts}`);

    // Análisis REAL sin créditos -> 402.
    const setup = await reqJson(base, 'POST', '/api/v1/champ/demo-setup', { body: {} });
    const ins = setup.json && setup.json.inscripcion;
    const frames = synth.syntheticFrames('paso_fino', { ciclos: 6 });
    const noCred = await reqChampSession(base, { token: tok, inscripcion_id: ins.id, superficie: 'tablado', frames });
    check('real analysis with 0 credits -> 402 NO_CREDITS', noCred.status === 402 && noCred.json && noCred.json.code === 'NO_CREDITS', `status=${noCred.status}`);

    // Concede 3 créditos; análisis real cobra 1 -> saldo 2.
    await grantCredits(base, tok, 3);
    const paid = await reqChampSession(base, { token: tok, inscripcion_id: ins.id, superficie: 'tablado', frames });
    check('real analysis debits 1 credit -> charged + credits 2', paid.status === 201 && paid.json && paid.json.charged === true && paid.json.credits === 2,
      `status=${paid.status} charged=${paid.json && paid.json.charged} credits=${paid.json && paid.json.credits}`);

    // Simulación (demo_modalidad) es GRATIS -> no cobra.
    const fd = new FormData();
    fd.append('inscripcion_id', String(ins.id));
    fd.append('demo_modalidad', 'paso_fino');
    const dresp = await fetch(base + '/api/v1/champ/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fd });
    const dj = await dresp.json().catch(() => null);
    check('simulation is FREE -> not charged, credits unchanged (2)', dresp.status === 201 && dj && dj.charged === false && dj.credits === 2,
      `status=${dresp.status} charged=${dj && dj.charged} credits=${dj && dj.credits}`);
    check('simulation is flagged simulado:true (honesty banner)', dj && dj.simulado === true,
      `simulado=${dj && dj.simulado}`);

    // ---- Horse-centric flow (select/add horse + my-sessions history) --------
    const newHorse = await reqJson(base, 'POST', '/api/v1/champ/horses', { token: tok, body: { nombre: 'Relámpago SIT', sexo: 'macho', capa: 'castaño' } });
    check('POST /champ/horses -> 201 + horse id', newHorse.status === 201 && newHorse.json && newHorse.json.id != null, `status=${newHorse.status}`);
    const horseList = await reqJson(base, 'GET', '/api/v1/champ/horses', { token: tok });
    check('GET /champ/horses -> includes my horse', horseList.status === 200 && Array.isArray(horseList.json) && horseList.json.some((h) => h.nombre === 'Relámpago SIT'), `n=${horseList.json && horseList.json.length}`);
    // Analyze by caballo_id (no inscripcion_id) — free reference (no audio) -> simulado, not charged.
    const balBefore = (await reqJson(base, 'GET', '/api/v1/account/credits/balance', { token: tok })).json.credits;
    const fdH = new FormData();
    fdH.append('caballo_id', String(newHorse.json.id));
    fdH.append('modalidad', 'trocha');
    const hSess = await fetch(base + '/api/v1/champ/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fdH });
    const hj = await hSess.json().catch(() => null);
    check('horse-centric session (caballo_id) -> 201 + simulado + not charged', hSess.status === 201 && hj && hj.simulado === true && hj.charged === false, `status=${hSess.status} simulado=${hj && hj.simulado}`);
    const balAfter = (await reqJson(base, 'GET', '/api/v1/account/credits/balance', { token: tok })).json.credits;
    check('horse-centric reference did NOT charge', balBefore === balAfter, `before=${balBefore} after=${balAfter}`);
    const mine = await reqJson(base, 'GET', '/api/v1/champ/my-sessions', { token: tok });
    check('GET /champ/my-sessions -> lists my analyses with caballo', mine.status === 200 && Array.isArray(mine.json) && mine.json.some((s) => s.caballo === 'Relámpago SIT' && s.sesion_id != null), `n=${mine.json && mine.json.length}`);
    // Dedup: registering the SAME horse name again reuses the row (no duplicate).
    const dupHorse = await reqJson(base, 'POST', '/api/v1/champ/horses', { token: tok, body: { nombre: 'Relámpago SIT' } });
    check('POST /champ/horses same name -> reuses (no duplicate id)', dupHorse.status === 201 && dupHorse.json && dupHorse.json.id === newHorse.json.id, `id=${dupHorse.json && dupHorse.json.id} orig=${newHorse.json.id}`);
    const list2 = await reqJson(base, 'GET', '/api/v1/champ/horses', { token: tok });
    const names = (list2.json || []).map((h) => h.nombre);
    check('GET /champ/horses -> names are unique (no repeats)', names.length === new Set(names.map((n) => n.toLowerCase())).size, `names=${JSON.stringify(names)}`);
    // Horse is OPTIONAL: analyze with category only (no caballo_id / caballo_nombre) -> 201.
    const fdNoHorse = new FormData();
    fdNoHorse.append('modalidad', 'paso_fino');
    const noHorse = await fetch(base + '/api/v1/champ/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fdNoHorse });
    const nhj = await noHorse.json().catch(() => null);
    check('POST /champ/sessions with NO horse (category only) -> 201', noHorse.status === 201 && nhj && nhj.sesion_id != null, `status=${noHorse.status} err=${nhj && nhj.error}`);

    // Balance endpoint.
    const bal = await reqJson(base, 'GET', '/api/v1/account/credits/balance', { token: tok });
    check('GET /credits/balance -> 2', bal.status === 200 && bal.json && bal.json.credits === 2, `credits=${bal.json && bal.json.credits}`);

    // Logout.
    const lo = await reqJson(base, 'POST', '/api/v1/account/logout', { token: tok });
    check('POST /account/logout -> ok', lo.status === 200 && lo.json && lo.json.ok === true, `status=${lo.status}`);
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

      check('POST /champ/sessions returns magic-link share_token + share_url', f && typeof f.share_token === 'string' && f.share_token.length >= 16 && /equimind\.app\/juez\?session=.*&k=/.test(f.share_url || ''), `token=${f && f.share_token}`);
      // Magic link: sin token y sin ser dueño -> 403 (no enumerable).
      const noTok = await reqJson(base, 'GET', `/api/v1/champ/sessions/${f.sesion_id}`);
      check('GET /champ/sessions/:id without token (not owner) -> 403', noTok.status === 403, `status=${noTok.status}`);
      const got = await reqJson(base, 'GET', `/api/v1/champ/sessions/${f.sesion_id}?k=${f.share_token}`);
      check('GET /champ/sessions/:id with magic token -> fallo completo', got.status === 200 && got.json && got.json.clasificacion
        && got.json.metricas_movimiento && Array.isArray(got.json.pisadas) && got.json.pisadas.length >= 12, `status=${got.status}`);
      const badTok = await reqJson(base, 'GET', `/api/v1/champ/sessions/${f.sesion_id}?k=deadbeefdeadbeefdeadbe`);
      check('GET /champ/sessions/:id with WRONG token -> 403', badTok.status === 403, `status=${badTok.status}`);

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

  // ---- Dictamen profesional + Neural Intelligence ---------------------------
  {
    // Sesión buena -> dictamen extenso + finding de excelencia o sin críticos.
    const setup = await reqJson(base, 'POST', '/api/v1/champ/demo-setup', { token: A, body: { numero: 10, caballo: 'Dictamen' } });
    const ins = setup.json && setup.json.inscripcion;
    const cat = setup.json && setup.json.categoria;
    let faSession = null;
    if (ins) {
      const frames = synth.syntheticFrames('paso_fino', { ciclos: 6 });
      const sess = await reqChampSession(base, { token: A, inscripcion_id: ins.id, superficie: 'tablado', frames });
      faSession = sess.json;
      const d = faSession && faSession.dictamen;
      check('fallo incluye dictamen profesional (titulo + >=5 secciones + recomendaciones)',
        !!d && typeof d.titulo === 'string' && Array.isArray(d.secciones) && d.secciones.length >= 5
        && Array.isArray(d.recomendaciones) && d.recomendaciones.length >= 1 && typeof d.texto_plano === 'string' && d.texto_plano.length > 300,
        `secciones=${d && d.secciones && d.secciones.length} texto=${d && d.texto_plano && d.texto_plano.length}`);
      check('fallo incluye neural_findings (array)', Array.isArray(faSession && faSession.neural_findings),
        `findings=${faSession && faSession.neural_findings && faSession.neural_findings.length}`);
    }

    // Sesión con discordancia -> finding crítico MOD-MISMATCH.
    const setupM = await reqJson(base, 'POST', '/api/v1/champ/demo-setup', { token: A, body: { numero: 11, caballo: 'Discorde' } });
    const insM = setupM.json && setupM.json.inscripcion;
    if (insM) {
      const frames = synth.syntheticFrames('trote', { ciclos: 6 });
      const sess = await reqChampSession(base, { token: A, inscripcion_id: insM.id, superficie: 'arena', frames });
      const fnds = (sess.json && sess.json.neural_findings) || [];
      const mismatch = fnds.find((x) => x.code === 'MOD-MISMATCH');
      check('Neural emite MOD-MISMATCH crítico cuando la modalidad no coincide',
        !!mismatch && mismatch.impact === 'critical', `codes=${fnds.map((x) => x.code).join(',')}`);
    }

    // Endpoints Neural: findings list + dashboard + status update.
    if (cat) {
      const list = await reqJson(base, 'GET', `/api/v1/champ/neural/findings?categoria_id=${cat.id}`);
      check('GET /neural/findings -> array', list.status === 200 && Array.isArray(list.json), `status=${list.status}`);

      const dash = await reqJson(base, 'GET', `/api/v1/champ/neural/dashboard?categoria_id=${cat.id}`);
      const okDash = dash.status === 200 && dash.json && typeof dash.json.total === 'number'
        && dash.json.counts && Array.isArray(dash.json.findings);
      check('GET /neural/dashboard -> counts + findings', okDash, `status=${dash.status} total=${dash.json && dash.json.total}`);

      // Status update on the first finding (if any).
      if (list.json && list.json.length) {
        const fid = list.json[0].id;
        const upd = await reqJson(base, 'PATCH', `/api/v1/champ/neural/findings/${fid}`, { token: A, body: { status: 'acknowledged' } });
        check('PATCH /neural/findings/:id -> status acknowledged', upd.status === 200 && upd.json && upd.json.status === 'acknowledged', `status=${upd.status}`);
        const noAuth = await reqJson(base, 'PATCH', `/api/v1/champ/neural/findings/${fid}`, { body: { status: 'resolved' } });
        check('PATCH /neural/findings/:id without JWT -> 401', noAuth.status === 401, `status=${noAuth.status}`);
      }
    }

    // GET session read-back includes regenerated dictamen + persisted findings.
    if (faSession && faSession.sesion_id) {
      const rd = await reqJson(base, 'GET', `/api/v1/champ/sessions/${faSession.sesion_id}?lang=en&k=${faSession.share_token}`);
      check('GET session read-back -> dictamen (EN) + neural_findings',
        rd.status === 200 && rd.json && rd.json.dictamen && /Paso Fino|gait/i.test(rd.json.dictamen.veredicto || '') && Array.isArray(rd.json.neural_findings),
        `status=${rd.status}`);
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
