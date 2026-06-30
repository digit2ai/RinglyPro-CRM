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

const { requireAuth } = require('../lib/auth');
const { resolveTenant } = require('../lib/tenant');
const store = require('../models/championship');
const gait = require('../lib/gaitAnalyzer');
const synth = require('../lib/synth');
const { runPipeline, rankingCategoria } = require('../lib/pipeline');
const dictamen = require('../lib/dictamen');
const neural = require('../lib/neuralEngine');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });

function err(res, code, msg) { return res.status(code).json({ error: msg }); }

// ---- Demo setup: one click -> full event/category/horse/inscription ----------
router.post('/demo-setup', requireAuth, async (req, res) => {
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
router.post('/sessions', requireAuth, upload.any(), async (req, res) => {
  try {
    const body = req.body || {};
    const inscripcion_id = parseInt(body.inscripcion_id, 10);
    if (!inscripcion_id) return err(res, 400, 'inscripcion_id is required');
    const superficie = body.superficie || 'tablado';

    const inscripcion = await store.repo.find('inscripciones', { id: inscripcion_id });
    if (!inscripcion) return err(res, 404, 'inscripcion not found');
    const categoria = await store.repo.find('categorias', { id: inscripcion.categoria_id });

    // pose_frames: contrato JSON [{numero_frame,timestamp_ms,keypoints:{casco_*:{x,y}}}]
    let frames = [];
    if (body.pose_frames) {
      try { frames = JSON.parse(body.pose_frames); } catch (e) { return err(res, 400, 'pose_frames must be valid JSON'); }
    }
    if (!Array.isArray(frames)) frames = [];

    // Audio (opcional): WAV -> onsets via JS puro.
    let audioOnsets = [];
    let audioMeta = {};
    let audio_raw_url = null;

    // MODO DEMOSTRACIÓN: sin pose estimation equina real en el navegador, el
    // cliente puede pedir una marcha sintética (demo_modalidad) y el pipeline
    // REAL corre de punta a punta sobre keypoints generados. Marcado en la
    // sesión vía modelo_pose='synthetic-demo' para trazabilidad/reproducibilidad.
    const demoMod = body.demo_modalidad;
    let isDemo = false;
    if (!frames.length && demoMod) {
      const map = { paso_fino: 'paso_fino', trocha: 'trocha', trote: 'trote', trote_galope: 'trote', galope: 'galope' };
      const m = map[demoMod] || 'paso_fino';
      const jitter = body.demo_jitter != null ? Math.max(0, Math.min(0.5, parseFloat(body.demo_jitter))) : 0.04;
      frames = synth.syntheticFrames(m, { jitter, ciclos: 6 });
      audioOnsets = synth.syntheticAudioOnsets(m, { jitter, ciclos: 6 });
      audioMeta = { nivel_db: -12, duracion_contacto_ms: 35 };
      isDemo = true;
    }
    const audioFile = (req.files || []).find((f) => /audio|wav/i.test(f.fieldname) || /\.wav$/i.test(f.originalname || '') || /audio\/(wav|x-wav|wave)/i.test(f.mimetype || ''));
    if (audioFile) {
      try {
        const a = gait.analyze(audioFile.buffer);
        audioOnsets = a.onsets || [];
        audioMeta = { nivel_db: -12, duracion_contacto_ms: 35 };
        audio_raw_url = `stored://audio/${Date.now()}.wav`;
      } catch (e) { /* audio no usable: seguimos solo con video */ }
    }

    // Video (opcional): NO se decodifica; solo se guarda una referencia.
    let video_raw_url = null;
    const videoFile = (req.files || []).find((f) => /video/i.test(f.fieldname) || /\.(mp4|mov|m4v)$/i.test(f.originalname || '') || /video\//i.test(f.mimetype || ''));
    if (videoFile) video_raw_url = `stored://video/${Date.now()}`;

    if (!frames.length && !audioOnsets.length) return err(res, 400, 'provide pose_frames and/or an audio WAV');

    // duración.
    let durSec = parseFloat(body.duracion_seg) || 0;
    if (!durSec && frames.length) durSec = (frames[frames.length - 1].timestamp_ms - frames[0].timestamp_ms) / 1000;
    if (!durSec && audioOnsets.length) durSec = audioOnsets[audioOnsets.length - 1] - audioOnsets[0];

    const sesion = await store.repo.create('sesiones', {
      inscripcion_id, fecha_hora_inicio: new Date(), duracion_seg: durSec || null, superficie,
      video_raw_url, fps: parseFloat(body.fps) || (frames.length && durSec ? frames.length / durSec : null),
      resolucion: body.resolucion || null, modelo_pose: isDemo ? 'synthetic-demo' : (body.modelo_pose || 'equine-pose-v1'),
      audio_raw_url, audio_sample_rate_hz: body.audio_sample_rate_hz ? parseInt(body.audio_sample_rate_hz, 10) : null,
      audio_canales: 1, audio_formato: audioFile ? 'wav' : null, tenant_id: req.tenantId
    });

    const fallo = await runPipeline(store, { sesion, inscripcion, categoria, frames, audioOnsets, audioMeta, durSec, lang: body.lang || 'es' });
    console.log(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'session_judged', sesion_id: sesion.id, modalidad: fallo.clasificacion.modalidad_detectada, puntaje: fallo.puntaje_total }));
    res.status(201).json(fallo);
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'session_pipeline_error', error: e.message, stack: e.stack }));
    err(res, 500, 'pipeline failed: ' + e.message);
  }
});

// ---- Full judge result for one session (public read) ------------------------
router.get('/sessions/:id', resolveTenant, async (req, res) => {
  try {
    const sesion_id = parseInt(req.params.id, 10);
    const sesion = await store.repo.find('sesiones', { id: sesion_id });
    if (!sesion) return err(res, 404, 'sesion not found');
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
      neural_findings: findings
    });
  } catch (e) { err(res, 500, e.message); }
});

// ---- Neural Intelligence: findings list (public read) ----------------------
router.get('/neural/findings', resolveTenant, async (req, res) => {
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
router.get('/neural/dashboard', resolveTenant, async (req, res) => {
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
router.patch('/neural/findings/:id', requireAuth, async (req, res) => {
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
router.get('/results', resolveTenant, async (req, res) => {
  try {
    const categoria_id = parseInt(req.query.categoria_id, 10);
    if (!categoria_id) return err(res, 400, 'categoria_id is required');
    const ranking = await rankingCategoria(store, categoria_id);
    res.json(ranking);
  } catch (e) { err(res, 500, e.message); }
});

// ---- Selectors (public reads) ----------------------------------------------
router.get('/eventos', resolveTenant, async (req, res) => {
  res.json(await store.repo.findAll('eventos', { tenant_id: req.tenantId }, ['id', 'DESC']));
});
router.get('/categorias', resolveTenant, async (req, res) => {
  const where = {}; if (req.query.evento_id) where.evento_id = parseInt(req.query.evento_id, 10);
  res.json(await store.repo.findAll('categorias', where, ['id', 'DESC']));
});
router.get('/inscripciones', resolveTenant, async (req, res) => {
  const where = {}; if (req.query.categoria_id) where.categoria_id = parseInt(req.query.categoria_id, 10);
  const ins = await store.repo.findAll('inscripciones', where, ['id', 'ASC']);
  for (const i of ins) { const c = await store.repo.find('caballos', { id: i.caballo_id }); i.caballo = c ? c.nombre : null; }
  res.json(ins);
});

// ---- Manual create (JWT writes) --------------------------------------------
router.post('/eventos', requireAuth, async (req, res) => {
  const b = req.body || {}; if (!b.nombre) return err(res, 400, 'nombre required');
  res.status(201).json(await store.repo.create('eventos', { nombre: b.nombre, grado: b.grado || 'A', anio: b.anio || 2026, sede: b.sede || null, tenant_id: req.tenantId }));
});
router.post('/categorias', requireAuth, async (req, res) => {
  const b = req.body || {}; if (!b.evento_id || !b.nombre || !b.modalidad) return err(res, 400, 'evento_id, nombre, modalidad required');
  res.status(201).json(await store.repo.create('categorias', { evento_id: b.evento_id, nombre: b.nombre, modalidad: b.modalidad, tenant_id: req.tenantId }));
});
router.post('/caballos', requireAuth, async (req, res) => {
  const b = req.body || {}; if (!b.nombre || !b.sexo) return err(res, 400, 'nombre, sexo required');
  res.status(201).json(await store.repo.create('caballos', { nombre: b.nombre, sexo: b.sexo, capa: b.capa || null, criadero: b.criadero || null, tenant_id: req.tenantId }));
});
router.post('/inscripciones', requireAuth, async (req, res) => {
  const b = req.body || {}; if (!b.caballo_id || !b.categoria_id) return err(res, 400, 'caballo_id, categoria_id required');
  res.status(201).json(await store.repo.create('inscripciones', { caballo_id: b.caballo_id, categoria_id: b.categoria_id, numero_competidor: b.numero_competidor || null, jinete: b.jinete || null, tenant_id: req.tenantId }));
});

module.exports = router;
