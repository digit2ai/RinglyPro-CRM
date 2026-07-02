// =====================================================
// Championship API (`/api/v1/champ`) — el "juez de campeonato".
//
//   POST /demo-setup                 -> crea evento+categoría+caballo+inscripción
//                                       de demo y devuelve los ids (JWT)
//   POST /sessions                   -> sube VIDEO (+AUDIO opcional) + pose_frames,
//                                       corre el pipeline, devuelve el fallo (JWT)
//   GET  /sessions/:id               -> fallo completo de una sesión (público)
//   GET  /results?categoria_id=      -> ranking de la categoría (público)
//   GET  /eventos | /categorias | /inscripciones  -> selectores de la UI (público)
//   POST /eventos | /categorias | /caballos | /inscripciones -> alta manual (JWT)
//
// El video crudo NO se decodifica en el servidor (sin deps nativas): los
// pose_frames llegan como contrato JSON (modelo de pose equina en producción;
// sintetizados por el cliente para la demo sin instalación). El audio sí se
// analiza en JS puro (reusa lib/gaitAnalyzer). Solo se guarda una referencia del
// video (video_raw_url), nunca los bytes ni el nombre de archivo (disciplina PII).
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');

const store = require('../models/championship');
const gait = require('../lib/gaitAnalyzer');
const synth = require('../lib/synth');
const { runPipeline, rankingCategoria } = require('../lib/pipeline');
const dictamen = require('../lib/dictamen');
const neural = require('../lib/neuralEngine');
const account = require('../models/account');
const { requireAccount, optionalAccount } = require('./account');
const crypto = require('crypto');

// Magic link: token HMAC corto e inadivinable por sesión. Permite compartir el
// informe COMPLETO con cualquiera (marketing) sin exponer todos los informes a
// enumeración por id secuencial. El dueño (misma cuenta) no necesita token.
const REPORT_SECRET = process.env.ECPF_JWT_SECRET || process.env.JWT_SECRET || 'ecpf-report-secret';
function reportToken(sesionId) {
  return crypto.createHmac('sha256', REPORT_SECRET).update('ecpf-report:' + String(sesionId)).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 22);
}
function reportUrl(sesionId) {
  // Dominio público canónico para marketing (equimind.app sirve la app en raíz).
  return 'https://equimind.app/juez?session=' + sesionId + '&k=' + reportToken(sesionId);
}

// Tenant = account id when logged in, else the shared DEMO tenant (0). Keeps the
// free simulation flow open while isolating each real user's shows/results.
const DEMO_TENANT = 0;
function withTenant(req, res, next) {
  optionalAccount(req, res, function () { req.tenantId = req.accountId != null ? req.accountId : DEMO_TENANT; next(); });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });

function err(res, code, msg) { return res.status(code).json({ error: msg }); }

// ---- Horse-centric helpers: cada cuenta tiene un evento/categoría "personales"
// invisibles para que el cliente solo piense en CABALLOS y ANÁLISIS, no en la
// maquinaria de campeonato (evento/categoría/inscripción). ----------------------
const MOD_NOMBRE = { paso_fino: 'Paso Fino', trocha: 'Trocha', trocha_galope: 'Trocha y Galope', trote_galope: 'Trote y Galope' };
async function ensureDefaultEvento(tenantId) {
  let ev = (await store.repo.findAll('eventos', { tenant_id: tenantId, nombre: 'Mis Análisis' }))[0];
  if (!ev) ev = await store.repo.create('eventos', { nombre: 'Mis Análisis', grado: 'A', anio: 2026, sede: 'EquiMind', tenant_id: tenantId });
  return ev;
}
async function ensureCategoria(tenantId, evento_id, modalidad) {
  const m = modalidad || 'paso_fino';
  let cat = (await store.repo.findAll('categorias', { tenant_id: tenantId, evento_id, modalidad: m }))[0];
  if (!cat) cat = await store.repo.create('categorias', { evento_id, nombre: MOD_NOMBRE[m] || m, modalidad: m, tenant_id: tenantId });
  return cat;
}
async function ensureInscripcion(tenantId, caballo_id, categoria_id) {
  let ins = (await store.repo.findAll('inscripciones', { tenant_id: tenantId, caballo_id, categoria_id }))[0];
  if (!ins) {
    const existing = await store.repo.findAll('inscripciones', { tenant_id: tenantId, categoria_id });
    ins = await store.repo.create('inscripciones', { caballo_id, categoria_id, numero_competidor: existing.length + 1, tenant_id: tenantId });
  }
  return ins;
}
// Un caballo es ÚNICO por nombre dentro de la cuenta: reusar si ya existe (evita
// duplicados en el selector). Un mismo caballo puede tener MÚLTIPLES disciplinas
// (una inscripción por categoría), así que nunca se ata a una sola modalidad.
async function ensureCaballo(tenantId, nombre, extra) {
  const n = String(nombre || '').trim() || 'Sin asignar';
  const all = await store.repo.findAll('caballos', { tenant_id: tenantId });
  const existing = all.find((c) => String(c.nombre || '').trim().toLowerCase() === n.toLowerCase());
  if (existing) return existing;
  return store.repo.create('caballos', {
    nombre: n.slice(0, 150), sexo: (extra && extra.sexo) || null, capa: (extra && extra.capa) || null,
    criadero: (extra && extra.criadero) || null, tenant_id: tenantId
  });
}
function dedupeByName(rows) {
  const seen = new Set(); const out = [];
  for (const c of rows) { const k = String(c.nombre || '').trim().toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(c); }
  return out;
}

// ---- Caballos del cliente (select o alta) — SIEMPRE únicos por nombre --------
router.get('/horses', requireAccount, async (req, res) => {
  try {
    const rows = await store.repo.findAll('caballos', { tenant_id: req.accountId }, ['id', 'DESC']);
    res.json(dedupeByName(rows).map((c) => ({ id: c.id, nombre: c.nombre, sexo: c.sexo, capa: c.capa, criadero: c.criadero, registro_fedequinas: c.registro_fedequinas })));
  } catch (e) { err(res, 500, 'could not list horses'); }
});
router.post('/horses', requireAccount, async (req, res) => {
  try {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    if (!nombre) return err(res, 400, 'nombre required');
    // Reusar si ya existe un caballo con ese nombre (no duplicar en el selector).
    const cab = await ensureCaballo(req.accountId, nombre, { sexo: b.sexo, capa: b.capa, criadero: b.criadero });
    res.status(201).json({ id: cab.id, nombre: cab.nombre, sexo: cab.sexo, capa: cab.capa, criadero: cab.criadero, registro_fedequinas: cab.registro_fedequinas });
  } catch (e) { err(res, 500, 'could not create horse'); }
});

// ---- Mis análisis: historial completo del cliente (permalinks) --------------
router.get('/my-sessions', requireAccount, async (req, res) => {
  try {
    const sesiones = await store.repo.findAll('sesiones', { tenant_id: req.accountId }, ['id', 'DESC']);
    const out = [];
    for (const s of sesiones) {
      const ins = s.inscripcion_id ? await store.repo.find('inscripciones', { id: s.inscripcion_id }) : null;
      const cab = ins ? await store.repo.find('caballos', { id: ins.caballo_id }) : null;
      const clas = (await store.repo.findAll('clasificaciones', { sesion_id: s.id }))[0] || null;
      const resu = ins ? await store.repo.find('resultados', { inscripcion_id: ins.id }) : null;
      out.push({
        sesion_id: s.id,
        fecha: s.fecha_hora_inicio || s.created_at || null,
        caballo: cab ? cab.nombre : null,
        modalidad: clas ? clas.modalidad_detectada : null,
        puntaje: resu ? resu.puntaje_total : null,
        simulado: s.modelo_pose === 'synthetic-demo',
        share_token: reportToken(s.id),
        share_url: reportUrl(s.id)
      });
    }
    res.json(out);
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'my_sessions_error', error: e.message }));
    err(res, 500, 'could not list analyses');
  }
});

// ---- Demo setup: one click -> full event/category/horse/inscription ----------
router.post('/demo-setup', withTenant, async (req, res) => {
  try {
    const { repo } = store;
    const prop = await repo.create('propietarios', { nombre: 'Criadero Demo', tenant_id: req.tenantId });
    const cab = await repo.create('caballos', { nombre: (req.body && req.body.caballo) || 'Relámpago de la Sierra', sexo: 'macho', capa: 'castaño', criadero: 'Criadero Demo', propietario_id: prop.id, tenant_id: req.tenantId });
    const ev = await repo.create('eventos', { nombre: (req.body && req.body.evento) || 'Exposición Nacional Demo', grado: 'A', anio: 2026, sede: 'Colombia', tenant_id: req.tenantId });
    const cat = await repo.create('categorias', { evento_id: ev.id, nombre: 'Paso Fino Adultos', modalidad: (req.body && req.body.modalidad) || 'paso_fino', tenant_id: req.tenantId });
    const ins = await repo.create('inscripciones', { caballo_id: cab.id, categoria_id: cat.id, numero_competidor: (req.body && req.body.numero) || 1, jinete: (req.body && req.body.jinete) || 'Jinete Demo', tenant_id: req.tenantId });
    res.status(201).json({ evento: ev, categoria: cat, caballo: cab, inscripcion: ins });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'demo_setup_error', error: e.message }));
    err(res, 500, 'demo setup failed');
  }
});

// ---- Upload a session + run the full judge pipeline -------------------------
router.post('/sessions', upload.any(), optionalAccount, async (req, res) => {
  try {
    const body = req.body || {};
    const superficie = body.superficie || 'tablado';

    // Resolución del competidor. Flujo NUEVO (horse-centric): el cliente manda un
    // caballo (existente `caballo_id`, o nuevo `caballo_nombre`) + la disciplina
    // `modalidad`; auto-armamos evento/categoría/inscripción "personales" (invisibles).
    // Flujo LEGACY: `inscripcion_id` explícito (campeonato). Se conserva.
    let inscripcion = null;
    let inscripcion_id = parseInt(body.inscripcion_id, 10) || null;
    if (inscripcion_id) {
      inscripcion = await store.repo.find('inscripciones', { id: inscripcion_id });
      if (!inscripcion) return err(res, 404, 'inscripcion not found');
    } else {
      // El análisis se define por VIDEO/AUDIO + CATEGORÍA (modalidad). El caballo
      // es OPCIONAL (solo etiqueta): existente `caballo_id`, nuevo `caballo_nombre`
      // (reusado si ya existe), o por defecto "Sin asignar". Un caballo puede tener
      // varias disciplinas: se crea una inscripción por categoría, sin atarlo a una.
      if (req.accountId == null) return err(res, 401, 'Inicia sesión para analizar.');
      let caballo_id = parseInt(body.caballo_id, 10) || null;
      if (caballo_id) {
        const c = await store.repo.find('caballos', { id: caballo_id });
        if (!c || String(c.tenant_id) !== String(req.accountId)) return err(res, 404, 'caballo not found');
      } else {
        // Sin caballo elegido: reusar/crear por nombre (o "Sin asignar"). Nunca falla.
        const cab = await ensureCaballo(req.accountId, body.caballo_nombre, { sexo: body.caballo_sexo, capa: body.caballo_capa, criadero: body.caballo_criadero });
        caballo_id = cab.id;
      }
      const ev = await ensureDefaultEvento(req.accountId);
      const cat = await ensureCategoria(req.accountId, ev.id, body.modalidad || 'paso_fino'); // CATEGORÍA = eje del análisis
      inscripcion = await ensureInscripcion(req.accountId, caballo_id, cat.id);
      inscripcion_id = inscripcion.id;
    }
    const categoria = await store.repo.find('categorias', { id: inscripcion.categoria_id });

    // pose_frames: contrato JSON [{numero_frame,timestamp_ms,keypoints:{casco_*:{x,y}}}]
    let frames = [];
    if (body.pose_frames) {
      try { frames = JSON.parse(body.pose_frames); } catch (e) { return err(res, 400, 'pose_frames must be valid JSON'); }
    }
    if (!Array.isArray(frames)) frames = [];
    // ¿El cliente envió datos REALES (pose del modelo o media subida)? Eso cobra
    // 1 crédito y exige cuenta. La simulación (demo_modalidad) es GRATIS.
    const hadClientFrames = frames.length > 0;

    // Audio (opcional): WAV -> onsets via JS puro. Se procesa PRIMERO: la marcha
    // se mide del audio REAL de los cascos. Saber si hay señal real decide si
    // cobramos (análisis real) o si sintetizamos una referencia GRATIS.
    let audioOnsets = [];
    let audioMeta = {};
    let audio_raw_url = null;
    const audioFile = (req.files || []).find((f) => /audio|wav/i.test(f.fieldname) || /\.wav$/i.test(f.originalname || '') || /audio\/(wav|x-wav|wave)/i.test(f.mimetype || ''));
    if (audioFile) {
      try {
        const a = gait.analyze(audioFile.buffer);
        audioOnsets = a.onsets || [];
        audioMeta = { nivel_db: -12, duracion_contacto_ms: 35 };
        audio_raw_url = `stored://audio/${Date.now()}.wav`;
      } catch (e) { /* audio no usable: seguimos solo con video */ }
    }
    // ¿Hay audio REAL de cascos? (onsets detectados del WAV del cliente)
    const hasRealAudio = !!(audioFile && audioOnsets.length);

    // Video (opcional): NO se decodifica; se guarda solo como evidencia visual.
    // Por sí solo NO constituye un análisis (no se puntúa el video).
    let video_raw_url = null;
    const videoFile = (req.files || []).find((f) => /video/i.test(f.fieldname) || /\.(mp4|mov|m4v)$/i.test(f.originalname || '') || /video\//i.test(f.mimetype || ''));
    if (videoFile) video_raw_url = `stored://video/${Date.now()}`;

    // REFERENCIA (simulación): SOLO si no hay señal real (ni pose del cliente ni
    // audio real). Sintetiza la disciplina del caballo (body.modalidad) para
    // previsualizar el juez. NUNCA se cobra: no analiza el caballo real. Se etiqueta.
    const demoMod = body.demo_modalidad || body.modalidad;
    let isDemo = false;
    if (!frames.length && !hasRealAudio && demoMod) {
      const map = { paso_fino: 'paso_fino', trocha: 'trocha', trote: 'trote', trote_galope: 'trote', galope: 'galope', trocha_galope: 'trocha_galope' };
      const m = map[demoMod] || 'paso_fino';
      const jitter = body.demo_jitter != null ? Math.max(0, Math.min(0.5, parseFloat(body.demo_jitter))) : 0.04;
      frames = synth.syntheticFrames(m, { jitter, ciclos: 6 });
      audioOnsets = synth.syntheticAudioOnsets(m, { jitter, ciclos: 6 });
      audioMeta = { nivel_db: -12, duracion_contacto_ms: 35 };
      isDemo = true;
    }

    if (!frames.length && !audioOnsets.length) return err(res, 400, 'provide pose_frames and/or an audio WAV');

    // duración.
    let durSec = parseFloat(body.duracion_seg) || 0;
    if (!durSec && frames.length) durSec = (frames[frames.length - 1].timestamp_ms - frames[0].timestamp_ms) / 1000;
    if (!durSec && audioOnsets.length) durSec = audioOnsets[audioOnsets.length - 1] - audioOnsets[0];

    // ---- Cobro de créditos: análisis REAL = cuenta + 1 crédito ---------------
    // SOLO cobra si hay señal REAL del caballo del cliente: pose del modelo, o
    // audio real de cascos. Un video sin audio (que NO se decodifica) o una
    // simulación de referencia NO se cobran — sería cobrar por datos sintéticos.
    const isRealAnalysis = !!(hadClientFrames || hasRealAudio);
    let creditDebited = false;
    if (isRealAnalysis) {
      if (req.accountId == null) return err(res, 401, 'Inicia sesión y ten créditos para un análisis real. La simulación es gratis.');
      const debit = await account.debitOne(req.accountId, { analysis_type: 'video', description: 'Juez de campeonato (video)' });
      if (!debit.ok) return res.status(402).json({ error: 'Sin créditos. Recarga tu cuenta para continuar.', code: 'NO_CREDITS', credits: debit.balance });
      creditDebited = true;
      req._debitedAccount = req.accountId;
      req.tenantId = req.accountId;
    } else {
      req.tenantId = req.accountId != null ? req.accountId : DEMO_TENANT; // demo gratis
    }

    const sesion = await store.repo.create('sesiones', {
      inscripcion_id, fecha_hora_inicio: new Date(), duracion_seg: durSec || null, superficie,
      video_raw_url, fps: parseFloat(body.fps) || (frames.length && durSec ? frames.length / durSec : null),
      resolucion: body.resolucion || null, modelo_pose: isDemo ? 'synthetic-demo' : (body.modelo_pose || 'equine-pose-v1'),
      audio_raw_url, audio_sample_rate_hz: body.audio_sample_rate_hz ? parseInt(body.audio_sample_rate_hz, 10) : null,
      audio_canales: 1, audio_formato: audioFile ? 'wav' : null, tenant_id: req.tenantId
    });

    const fallo = await runPipeline(store, { sesion, inscripcion, categoria, frames, audioOnsets, audioMeta, durSec, lang: body.lang || 'es' });
    fallo.credits = req.accountId != null ? await account.getBalance(req.accountId) : null;
    fallo.charged = creditDebited;
    // Marca de referencia: si el resultado viene de una simulación (no del caballo
    // real), el cliente debe verlo claramente y NO se le cobró.
    fallo.simulado = isDemo;
    // Magic link público del informe (para compartir + marketing).
    fallo.share_token = reportToken(sesion.id);
    fallo.share_url = reportUrl(sesion.id);
    console.log(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'session_judged', sesion_id: sesion.id, modalidad: fallo.clasificacion.modalidad_detectada, puntaje: fallo.puntaje_total, charged: creditDebited }));
    res.status(201).json(fallo);
  } catch (e) {
    // Reembolsa el crédito si ya se cobró y el análisis falló.
    if (req._debitedAccount != null) { try { await account.refundOne(req._debitedAccount, { description: 'refund: análisis falló' }); } catch (_) {} }
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'session_pipeline_error', error: e.message, stack: e.stack }));
    // No filtrar el detalle interno al cliente (ya quedó en logs). Mensaje genérico.
    const detail = process.env.NODE_ENV === 'production' ? '' : (': ' + e.message);
    err(res, 500, 'No se pudo completar el análisis' + detail);
  }
});

// ---- Full judge result for one session (magic-link read) --------------------
// Acceso: el DUEÑO (misma cuenta) siempre; cualquiera con el token del magic
// link (?k=). Sin token y sin ser dueño -> 403 (no enumerable).
router.get('/sessions/:id', withTenant, async (req, res) => {
  try {
    const sesion_id = parseInt(req.params.id, 10);
    const sesion = await store.repo.find('sesiones', { id: sesion_id });
    if (!sesion) return err(res, 404, 'sesion not found');
    const isOwner = req.accountId != null && String(sesion.tenant_id) === String(req.accountId);
    const tokenOk = (req.query && req.query.k) && String(req.query.k) === reportToken(sesion_id);
    if (!isOwner && !tokenOk) return err(res, 403, 'Este informe requiere un enlace válido.');
    const clas = (await store.repo.findAll('clasificaciones', { sesion_id }))[0] || null;
    const mov = await store.repo.find('metricas_mov', { sesion_id });
    const son = await store.repo.find('metricas_son', { sesion_id });
    const punt = await store.repo.findAll('puntuaciones', { sesion_id });
    const criterios = await store.repo.findAll('criterios', {});
    const critById = {}; criterios.forEach((c) => { critById[c.id] = c; });
    const pisadas = await store.repo.findAll('pisadas', { sesion_id }, ['timestamp_ms', 'ASC']);
    const inscripcion = await store.repo.find('inscripciones', { id: sesion.inscripcion_id });
    const categoria = inscripcion ? await store.repo.find('categorias', { id: inscripcion.categoria_id }) : null;
    const caballo = inscripcion ? await store.repo.find('caballos', { id: inscripcion.caballo_id }) : null;
    const resultado = inscripcion ? await store.repo.find('resultados', { inscripcion_id: inscripcion.id }) : null;
    const findings = neural.ordenarPorImpacto(await store.repo.findAll('findings', { sesion_id, status: 'active' }));

    const puntuaciones = punt.map((p) => ({ nombre: critById[p.criterio_id] ? critById[p.criterio_id].nombre : ('Criterio ' + p.criterio_id), peso_porcentaje: critById[p.criterio_id] ? critById[p.criterio_id].peso_porcentaje : null, valor_medido: p.valor_medido, puntaje_normalizado: p.puntaje_normalizado }));

    // Dictamen regenerado a partir de los datos persistidos (idioma por ?lang).
    const lang = (req.query.lang === 'en') ? 'en' : 'es';
    const falloLike = {
      clasificacion: clas, metricas_movimiento: mov, metricas_sonido: son,
      puntuaciones, puntaje_total: resultado ? resultado.puntaje_total : null,
      ranking: resultado ? resultado.ranking : null, pisadas
    };
    const dict = (clas && mov) ? dictamen.generar(falloLike, lang) : null;

    res.json({
      sesion, caballo, categoria, inscripcion,
      clasificacion: clas,
      metricas_movimiento: mov,
      metricas_sonido: son,
      puntuaciones,
      pisadas,
      resultado,
      dictamen: dict,
      neural_findings: findings,
      simulado: sesion && sesion.modelo_pose === 'synthetic-demo',
      share_token: reportToken(sesion_id),
      share_url: reportUrl(sesion_id)
    });
  } catch (e) { err(res, 500, e.message); }
});

// ---- Neural Intelligence: findings list (public read) ----------------------
router.get('/neural/findings', withTenant, async (req, res) => {
  try {
    const where = { tenant_id: req.tenantId };
    if (req.query.status) where.status = req.query.status; else where.status = 'active';
    if (req.query.sesion_id) where.sesion_id = parseInt(req.query.sesion_id, 10);
    if (req.query.categoria_id) where.categoria_id = parseInt(req.query.categoria_id, 10);
    const rows = await store.repo.findAll('findings', where, ['id', 'DESC']);
    res.json(neural.ordenarPorImpacto(rows));
  } catch (e) { err(res, 500, e.message); }
});

// ---- Neural dashboard: counts by impact + active findings (public) ----------
router.get('/neural/dashboard', withTenant, async (req, res) => {
  try {
    const where = { tenant_id: req.tenantId, status: 'active' };
    if (req.query.categoria_id) where.categoria_id = parseInt(req.query.categoria_id, 10);
    const rows = neural.ordenarPorImpacto(await store.repo.findAll('findings', where));
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    rows.forEach((r) => { if (counts[r.impact] != null) counts[r.impact] += 1; });
    res.json({
      total: rows.length,
      counts,
      attention_required: counts.critical + counts.high,
      findings: rows.slice(0, 50)
    });
  } catch (e) { err(res, 500, e.message); }
});

// ---- Neural: update finding status (JWT write) -----------------------------
router.patch('/neural/findings/:id', requireAccount, async (req, res) => {
  try {
    const status = (req.body && req.body.status) || '';
    if (!['active', 'acknowledged', 'resolved', 'dismissed'].includes(status)) {
      return err(res, 400, 'invalid status (active|acknowledged|resolved|dismissed)');
    }
    const id = parseInt(req.params.id, 10);
    await store.repo.update('findings', { id }, { status });
    res.json({ id, status });
  } catch (e) { err(res, 500, e.message); }
});

// ---- Ranking by category (public) ------------------------------------------
router.get('/results', withTenant, async (req, res) => {
  try {
    const categoria_id = parseInt(req.query.categoria_id, 10);
    if (!categoria_id) return err(res, 400, 'categoria_id is required');
    const ranking = await rankingCategoria(store, categoria_id);
    res.json(ranking);
  } catch (e) { err(res, 500, e.message); }
});

// ---- Selectors (public reads) ----------------------------------------------
router.get('/eventos', withTenant, async (req, res) => {
  res.json(await store.repo.findAll('eventos', { tenant_id: req.tenantId }, ['id', 'DESC']));
});
router.get('/categorias', withTenant, async (req, res) => {
  const where = {}; if (req.query.evento_id) where.evento_id = parseInt(req.query.evento_id, 10);
  res.json(await store.repo.findAll('categorias', where, ['id', 'DESC']));
});
router.get('/inscripciones', withTenant, async (req, res) => {
  const where = {}; if (req.query.categoria_id) where.categoria_id = parseInt(req.query.categoria_id, 10);
  const ins = await store.repo.findAll('inscripciones', where, ['id', 'ASC']);
  for (const i of ins) { const c = await store.repo.find('caballos', { id: i.caballo_id }); i.caballo = c ? c.nombre : null; }
  res.json(ins);
});

// ---- Manual create (JWT writes) --------------------------------------------
router.post('/eventos', requireAccount, async (req, res) => {
  const b = req.body || {}; if (!b.nombre) return err(res, 400, 'nombre required');
  res.status(201).json(await store.repo.create('eventos', { nombre: b.nombre, grado: b.grado || 'A', anio: b.anio || 2026, sede: b.sede || null, tenant_id: req.tenantId }));
});
router.post('/categorias', requireAccount, async (req, res) => {
  const b = req.body || {}; if (!b.evento_id || !b.nombre || !b.modalidad) return err(res, 400, 'evento_id, nombre, modalidad required');
  res.status(201).json(await store.repo.create('categorias', { evento_id: b.evento_id, nombre: b.nombre, modalidad: b.modalidad, tenant_id: req.tenantId }));
});
router.post('/caballos', requireAccount, async (req, res) => {
  const b = req.body || {}; if (!b.nombre || !b.sexo) return err(res, 400, 'nombre, sexo required');
  res.status(201).json(await store.repo.create('caballos', { nombre: b.nombre, sexo: b.sexo, capa: b.capa || null, criadero: b.criadero || null, tenant_id: req.tenantId }));
});
router.post('/inscripciones', requireAccount, async (req, res) => {
  const b = req.body || {}; if (!b.caballo_id || !b.categoria_id) return err(res, 400, 'caballo_id, categoria_id required');
  res.status(201).json(await store.repo.create('inscripciones', { caballo_id: b.caballo_id, categoria_id: b.categoria_id, numero_competidor: b.numero_competidor || null, jinete: b.jinete || null, tenant_id: req.tenantId }));
});

module.exports = router;
