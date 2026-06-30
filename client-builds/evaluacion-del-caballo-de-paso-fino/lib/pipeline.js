// =====================================================
// Pipeline del juez — orquesta TODO el procesamiento de una sesión:
//   frames(pose) + onsets(audio) -> pisadas (fusión) -> métricas ->
//   clasificación (modalidad + confianza + validez) -> puntuaciones ->
//   resultado + ranking de categoría.
//
// Devuelve el "fallo del juez" completo, listo para la UI y para una
// explicación tipo juez de competencia.
// =====================================================

'use strict';

const footfall = require('./footfall');
const metrics = require('./metrics');
const { classify, esModalidadValida } = require('./classifier');
const { score } = require('./scoring');
const { CASCOS } = require('./anatomy');
const dictamen = require('./dictamen');
const neural = require('./neuralEngine');

// store = models/championship (repo + puntoIdByCodigo).
// ctx = { sesion, inscripcion, categoria, frames, audioOnsets, audioMeta, durSec }
async function runPipeline(store, ctx) {
  const { repo } = store;
  const { sesion, inscripcion, categoria, frames, audioOnsets, audioMeta, durSec } = ctx;
  const superficie = sesion.superficie;

  // 1. Persistir frames + SOLO keypoints de casco_* (control de volumen).
  if (Array.isArray(frames) && frames.length) {
    const puntoMap = await store.puntoIdByCodigo();
    const frameRows = await repo.bulk('frames', frames.map((f) => ({
      sesion_id: sesion.id, numero_frame: f.numero_frame, timestamp_ms: f.timestamp_ms
    })));
    const kpRows = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const frameId = frameRows[i].id;
      for (const codigo of Object.keys(CASCOS)) {
        const kp = f.keypoints && f.keypoints[codigo];
        if (kp && typeof kp.y === 'number' && puntoMap[codigo] != null) {
          kpRows.push({ frame_id: frameId, punto_id: puntoMap[codigo], x: kp.x, y: kp.y, z: kp.z != null ? kp.z : null, confianza: kp.confianza != null ? kp.confianza : null, visible: true });
        }
      }
    }
    if (kpRows.length) await repo.bulk('keypoints', kpRows);
  }

  // 2. Detección + fusión de pisadas.
  const videoFalls = footfall.detectVideoFootfalls(frames || []);
  const audioFalls = footfall.detectAudioFootfalls(audioOnsets || [], audioMeta || {});
  const activeModel = (await repo.findAll('modelos', { activo: true }))[0] || null;
  const umbrales = (activeModel && activeModel.umbrales_json) || {};
  let pisadas = footfall.fuse(videoFalls, audioFalls, umbrales.fusion_window_ms || 40);
  pisadas = footfall.sequenceAndIntervals(pisadas);

  // Persistir pisadas.
  await repo.bulk('pisadas', pisadas.map((p) => ({
    sesion_id: sesion.id, timestamp_ms: p.timestamp_ms, extremidad: p.extremidad || null,
    orden_secuencia: p.orden_secuencia || null, intervalo_anterior_ms: p.intervalo_anterior_ms != null ? p.intervalo_anterior_ms : null,
    intensidad_db: p.intensidad_db != null ? p.intensidad_db : null, duracion_contacto_ms: p.duracion_contacto_ms != null ? p.duracion_contacto_ms : null,
    detectada_por_video: !!p.detectada_por_video, detectada_por_audio: !!p.detectada_por_audio, confianza: p.confianza != null ? p.confianza : null
  })));

  // 3. Clasificación (sobre las pisadas con extremidad asignada).
  const conLimb = pisadas.filter((p) => p.extremidad);
  const clas = classify(conLimb.length >= 3 ? conLimb : pisadas, umbrales);
  const valida = esModalidadValida(clas.modalidad_detectada, categoria && categoria.modalidad);
  await repo.create('clasificaciones', {
    sesion_id: sesion.id, modalidad_detectada: clas.modalidad_detectada, confianza: clas.confianza,
    modelo_id: activeModel ? activeModel.id : null, es_modalidad_valida: valida
  });

  // 4. Métricas.
  const mov = metrics.movimiento(pisadas, frames, durSec, clas);
  const son = metrics.sonido(pisadas, superficie, audioMeta || {});
  await repo.create('metricas_mov', Object.assign({ sesion_id: sesion.id }, mov));
  await repo.create('metricas_son', Object.assign({ sesion_id: sesion.id }, son));

  // 5. Puntuación por criterios de la modalidad (de la categoría, o detectada).
  const modalidadPuntuar = (categoria && categoria.modalidad) || clas.modalidad_detectada || 'paso_fino';
  let criterios = await repo.findAll('criterios', { modalidad: modalidadPuntuar });
  if (!criterios.length) criterios = await repo.findAll('criterios', { modalidad: 'paso_fino' });
  const { puntuaciones, puntaje_total } = score(criterios, mov, son, umbrales);
  await repo.bulk('puntuaciones', puntuaciones.map((p) => ({
    sesion_id: sesion.id, criterio_id: p.criterio_id, valor_medido: p.valor_medido, puntaje_normalizado: p.puntaje_normalizado
  })));

  // 6. Resultado + ranking de la categoría (puesto calculado dinámicamente).
  await upsertResultado(store, inscripcion.id, puntaje_total, clas);
  if (categoria) await recomputeRanking(store, categoria.id);
  let miRanking = null;
  if (categoria) {
    const tabla = await rankingCategoria(store, categoria.id);
    const mio = tabla.find((r) => String(r.inscripcion_id) === String(inscripcion.id));
    miRanking = mio ? mio.ranking : null;
  }

  // 7. Fallo base.
  const fallo = {
    sesion_id: sesion.id,
    superficie,
    clasificacion: Object.assign({ es_modalidad_valida: valida, modalidad_categoria: categoria ? categoria.modalidad : null }, clas),
    metricas_movimiento: mov,
    metricas_sonido: son,
    pisadas: pisadas.map((p) => ({ timestamp_ms: p.timestamp_ms, extremidad: p.extremidad, orden_secuencia: p.orden_secuencia, intervalo_anterior_ms: p.intervalo_anterior_ms, detectada_por_video: p.detectada_por_video, detectada_por_audio: p.detectada_por_audio })),
    puntuaciones,
    puntaje_total,
    ranking: miRanking
  };

  // 8. Dictamen profesional (ES+EN) — se persiste el texto en observaciones.
  const lang = (ctx && ctx.lang) || 'es';
  const dictES = dictamen.generar(fallo, 'es');
  const dictEN = dictamen.generar(fallo, 'en');
  fallo.dictamen = lang === 'en' ? dictEN : dictES;
  fallo.dictamen_en = dictEN;
  await repo.update('resultados', { inscripcion_id: inscripcion.id }, { observaciones: dictES.texto_plano });

  // 9. Neural Intelligence — hallazgos que vigilan la sesión + la categoría.
  let rankingRows = [];
  if (categoria) { try { rankingRows = await rankingCategoria(store, categoria.id); } catch (e) { rankingRows = []; } }
  const findings = neural.ordenarPorImpacto(
    neural.analizarSesion(fallo, { inscripcion, categoria }, lang)
      .concat(neural.analizarCategoria(rankingRows, lang))
  );
  // Persistir (reemplaza los findings activos previos de ESTA sesión).
  try {
    await repo.update('findings', { sesion_id: sesion.id, status: 'active' }, { status: 'superseded' });
    if (findings.length) {
      await repo.bulk('findings', findings.map((fd) => ({
        sesion_id: sesion.id, inscripcion_id: inscripcion.id, categoria_id: categoria ? categoria.id : null,
        code: fd.code, category: fd.category, scope: fd.scope, title: fd.title, summary: fd.summary,
        evidence: fd.evidence || {}, impact: fd.impact, impact_estimate: fd.impact_estimate,
        recommended_action: fd.recommended_action, workflow: fd.workflow || null, status: 'active',
        tenant_id: sesion.tenant_id || 1
      })));
    }
  } catch (e) { /* findings no bloquean el fallo */ }
  fallo.neural_findings = findings;

  return fallo;
}

async function upsertResultado(store, inscripcion_id, puntaje_total, clas) {
  const { repo } = store;
  const obs = `Modalidad detectada: ${clas.modalidad_detectada || 'n/d'} (confianza ${(clas.confianza * 100).toFixed(0)}%, ${clas.tiempos} tiempos, patrón ${clas.patron}).`;
  const existing = await repo.find('resultados', { inscripcion_id });
  if (existing) await repo.update('resultados', { inscripcion_id }, { puntaje_total, observaciones: obs });
  else await repo.create('resultados', { inscripcion_id, puntaje_total, ranking: null, observaciones: obs });
}

// Recalcula el ranking de TODOS los resultados de una categoría (mayor puntaje = 1).
// NOTA: Postgres devuelve columnas BIGINT como STRING, así que normalizamos los
// ids a Number antes de comparar (un Set de números no encuentra "1").
async function recomputeRanking(store, categoria_id) {
  const { repo } = store;
  const inscripciones = await repo.findAll('inscripciones', { categoria_id });
  const ids = new Set(inscripciones.map((i) => Number(i.id)));
  const resultados = (await repo.findAll('resultados', {})).filter((r) => ids.has(Number(r.inscripcion_id)));
  resultados.sort((a, b) => (b.puntaje_total || 0) - (a.puntaje_total || 0));
  let rank = 0, lastScore = null, seen = 0;
  for (const r of resultados) {
    seen += 1;
    if (lastScore === null || r.puntaje_total !== lastScore) { rank = seen; lastScore = r.puntaje_total; }
    await repo.update('resultados', { inscripcion_id: r.inscripcion_id }, { ranking: rank });
  }
}

// Ranking de categoría con datos del caballo (para el dashboard).
//
// El puesto (ranking) se calcula DINÁMICAMENTE a partir del orden por puntaje,
// no del valor persistido en ecpf_resultados.ranking. En Postgres los BIGINT
// vuelven como strings, lo que hace frágil cualquier comparación de ids para
// reescribir la columna; ordenar aquí es a prueba de tipos y siempre correcto.
// Las inscripciones SIN resultado (puntaje null) quedan al final, sin puesto.
async function rankingCategoria(store, categoria_id) {
  const { repo } = store;
  const inscripciones = await repo.findAll('inscripciones', { categoria_id });
  const out = [];
  for (const ins of inscripciones) {
    const res = await repo.find('resultados', { inscripcion_id: ins.id });
    const cab = await repo.find('caballos', { id: ins.caballo_id });
    const clas = (await repo.findAll('sesiones', { inscripcion_id: ins.id }))[0];
    out.push({
      inscripcion_id: ins.id,
      numero_competidor: ins.numero_competidor,
      caballo: cab ? cab.nombre : null,
      jinete: ins.jinete,
      puntaje_total: res && res.puntaje_total != null ? res.puntaje_total : null,
      ranking: null,
      observaciones: res ? res.observaciones : null,
      sesion_id: clas ? clas.id : null
    });
  }
  // Ordena: con puntaje primero (desc), luego los sin puntaje. Asigna 1..N con
  // empates compartiendo puesto.
  out.sort((a, b) => {
    if (a.puntaje_total == null && b.puntaje_total == null) return 0;
    if (a.puntaje_total == null) return 1;
    if (b.puntaje_total == null) return -1;
    return b.puntaje_total - a.puntaje_total;
  });
  let rank = 0, lastScore = null, seen = 0;
  for (const row of out) {
    if (row.puntaje_total == null) { row.ranking = null; continue; }
    seen += 1;
    if (lastScore === null || row.puntaje_total !== lastScore) { rank = seen; lastScore = row.puntaje_total; }
    row.ranking = rank;
  }
  return out;
}

module.exports = { runPipeline, recomputeRanking, rankingCategoria };
