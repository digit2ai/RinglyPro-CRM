// =====================================================
// Neural Intelligence — capa de "hallazgos" (findings) para el juez de caballos,
// replicando el patrón de RinglyPro Neural (src/services/neuralEngine.js):
// detectores deterministas que escanean una sesión juzgada (y su categoría) y
// emiten findings accionables con CÓDIGO tipo OBD, severidad y recomendación.
//
//   analizarSesion(fallo, ctx, lang) -> [ finding, ... ]
//   analizarCategoria(rankingRows, lang) -> [ finding, ... ]
//
// finding = {
//   code,                // OBD-style: GAIT-CV-HIGH, GAIT-ASYM, MOD-MISMATCH...
//   category,            // grupo lógico (rhythm|modality|symmetry|cadence|...)
//   scope,               // 'session' | 'category'
//   title, summary,      // tarjeta legible
//   evidence,            // {} datos de soporte
//   impact,              // critical | high | medium | low | info
//   impact_estimate,     // frase corta de impacto
//   recommended_action,  // qué hacer
//   workflow             // treatment/automatización sugerida (gancho a futuro)
// }
//
// Como el Neural de RinglyPro, cada detector devuelve un finding o null. Esto es
// el "Neural Findings" que vigila cada evaluación y alerta antes de que un
// problema (claudicación, descalificación, ritmo irregular) pase desapercibido.
// =====================================================

'use strict';

const { DEFAULT_MODEL } = require('./thresholds');
const { modLabel } = require('./dictamen');

function pct(x) { return x != null ? Math.round(x * 100) + '%' : '—'; }
function num(x, d) { return x != null ? Number(x).toFixed(d == null ? 0 : d) : '—'; }

// ---- Detectores de SESIÓN ---------------------------------------------------
function analizarSesion(fallo, ctx, lang) {
  const L = String(lang || 'es').slice(0, 2) === 'en';
  const U = DEFAULT_MODEL.umbrales;
  const c = fallo.clasificacion || {};
  const mov = fallo.metricas_movimiento || {};
  const son = fallo.metricas_sonido || {};
  const total = fallo.puntaje_total;
  const cv = c.coef_variacion_intervalos != null ? c.coef_variacion_intervalos : mov.coef_variacion_intervalos;
  const out = [];

  // 1. MODALIDAD NO COINCIDE (descalificación potencial) — crítico.
  if (c.es_modalidad_valida === false) {
    out.push({
      code: 'MOD-MISMATCH', category: 'modality', scope: 'session',
      title: L ? 'Detected gait does not match the entered category' : 'La marcha detectada no coincide con la categoría inscrita',
      summary: L
        ? `The horse was entered as ${modLabel(c.modalidad_categoria, L)} but performs ${modLabel(c.modalidad_detectada, L)} (${Math.round((c.confianza || 0) * 100)}% confidence). Under championship rules this is grounds for disqualification or re-classification.`
        : `El caballo fue inscrito como ${modLabel(c.modalidad_categoria, L)} pero ejecuta ${modLabel(c.modalidad_detectada, L)} (${Math.round((c.confianza || 0) * 100)}% de confianza). Bajo reglamento es causal de descalificación o reclasificación.`,
      evidence: { modalidad_categoria: c.modalidad_categoria, modalidad_detectada: c.modalidad_detectada, confianza: c.confianza, tiempos: c.tiempos, patron: c.patron },
      impact: 'critical',
      impact_estimate: L ? 'Disqualification risk' : 'Riesgo de descalificación',
      recommended_action: L ? 'Re-class the entry or review schooling before the class.' : 'Reclasificar la inscripción o revisar el adiestramiento antes de la categoría.',
      workflow: 'flag_reclassification'
    });
  }

  // 2. RITMO IRREGULAR (CV alto) — high; o DRIFT — medium.
  if (cv != null) {
    if (cv > U.cv_regular_max) {
      out.push({
        code: 'GAIT-CV-HIGH', category: 'rhythm', scope: 'session',
        title: L ? 'Irregular rhythm — coefficient of variation above ceiling' : 'Ritmo irregular — coeficiente de variación sobre el techo',
        summary: L
          ? `Inter-footfall CV is ${num(cv, 3)} (ceiling ${num(U.cv_regular_max, 2)}). The four-beat timing is uneven; this is heavily penalized and can signal lameness, imbalance or poor conditioning.`
          : `El CV entre pisadas es ${num(cv, 3)} (techo ${num(U.cv_regular_max, 2)}). El compás de cuatro tiempos es disparejo; se penaliza fuerte y puede indicar claudicación, desbalance o mala condición.`,
        evidence: { coef_variacion: cv, ceiling: U.cv_regular_max, regularidad_ritmo: mov.regularidad_ritmo },
        impact: 'high',
        impact_estimate: L ? 'Major score penalty on the 35% rhythm criterion' : 'Penalización mayor en el criterio de ritmo (35%)',
        recommended_action: L ? 'Veterinary lameness check, then structured rhythm schooling.' : 'Examen veterinario de claudicación, luego adiestramiento estructurado de ritmo.',
        workflow: 'schedule_vet_review'
      });
    } else if (cv > U.cv_paso_fino_max) {
      out.push({
        code: 'GAIT-CV-DRIFT', category: 'rhythm', scope: 'session',
        title: L ? 'Rhythm drift — above the championship ideal' : 'Deriva de ritmo — sobre el ideal de campeonato',
        summary: L
          ? `Inter-footfall CV is ${num(cv, 3)}, above the ${num(U.cv_paso_fino_max, 2)} ideal but within the acceptable band. The rhythm is regular but not yet metronomic.`
          : `El CV entre pisadas es ${num(cv, 3)}, sobre el ideal de ${num(U.cv_paso_fino_max, 2)} pero dentro de la banda aceptable. El ritmo es regular pero aún no de metrónomo.`,
        evidence: { coef_variacion: cv, ideal: U.cv_paso_fino_max },
        impact: 'medium',
        impact_estimate: L ? 'Points left on the table vs. a clean four-beat' : 'Puntos por ganar frente a un cuatro tiempos limpio',
        recommended_action: L ? 'Tempo/rhythm transitions to tighten the four-beat timing.' : 'Transiciones de tempo/ritmo para afinar el compás de cuatro tiempos.',
        workflow: 'schooling_plan'
      });
    }
  }

  // 3. ASIMETRÍA LATERAL (posible claudicación) — high/medium.
  if (mov.simetria_lateral != null && mov.simetria_lateral < 0.7) {
    const sev = mov.simetria_lateral < 0.5 ? 'high' : 'medium';
    out.push({
      code: 'GAIT-ASYM', category: 'symmetry', scope: 'session',
      title: L ? 'Lateral asymmetry detected' : 'Asimetría lateral detectada',
      summary: L
        ? `Left/right support balance is ${pct(mov.simetria_lateral)}. A marked imbalance can be an early sign of one-sided lameness or a developing soundness issue.`
        : `El balance de apoyos izquierda/derecha es ${pct(mov.simetria_lateral)}. Un desbalance marcado puede ser señal temprana de claudicación de un lado o de un problema de aplomo en desarrollo.`,
      evidence: { simetria_lateral: mov.simetria_lateral },
      impact: sev,
      impact_estimate: L ? 'Possible soundness concern' : 'Posible problema de aplomo',
      recommended_action: L ? 'In-hand lameness exam on both reins; flexion tests.' : 'Examen de claudicación a la mano en ambas manos; pruebas de flexión.',
      workflow: 'schedule_vet_review'
    });
  }

  // 4. CADENCIA fuera de banda — medium.
  if (mov.cadencia_ppm != null) {
    if (mov.cadencia_ppm < U.cadencia_paso_fino_min_ppm) {
      out.push({
        code: 'GAIT-CAD-LOW', category: 'cadence', scope: 'session',
        title: L ? 'Cadence below the Paso Fino floor' : 'Cadencia por debajo del piso del Paso Fino',
        summary: L
          ? `Cadence ${num(mov.cadencia_ppm)} steps/min is under the ${U.cadencia_paso_fino_min_ppm} floor — the gait lacks brío and may read as laboured.`
          : `La cadencia ${num(mov.cadencia_ppm)} pisadas/min está bajo el piso de ${U.cadencia_paso_fino_min_ppm} — la marcha carece de brío y puede percibirse trabajosa.`,
        evidence: { cadencia_ppm: mov.cadencia_ppm, floor: U.cadencia_paso_fino_min_ppm },
        impact: 'medium',
        impact_estimate: L ? 'Lower brío score' : 'Menor puntaje de brío',
        recommended_action: L ? 'Conditioning + impulsion work to raise cadence.' : 'Trabajo de condición e impulsión para subir la cadencia.',
        workflow: 'schooling_plan'
      });
    } else if (mov.cadencia_ppm > U.cadencia_paso_fino_max_ppm) {
      out.push({
        code: 'GAIT-CAD-HIGH', category: 'cadence', scope: 'session',
        title: L ? 'Cadence above the expected ceiling' : 'Cadencia sobre el techo esperado',
        summary: L
          ? `Cadence ${num(mov.cadencia_ppm)} steps/min exceeds the ${U.cadencia_paso_fino_max_ppm} ceiling — confirm it is genuine brío and not a rushed, tense tempo.`
          : `La cadencia ${num(mov.cadencia_ppm)} pisadas/min supera el techo de ${U.cadencia_paso_fino_max_ppm} — confirmar que sea brío genuino y no un tempo apresurado y tenso.`,
        evidence: { cadencia_ppm: mov.cadencia_ppm, ceiling: U.cadencia_paso_fino_max_ppm },
        impact: 'low',
        impact_estimate: L ? 'Rhythm-quality risk if rushed' : 'Riesgo de calidad de ritmo si va apresurado',
        recommended_action: L ? 'Relaxation/half-halt work to settle the tempo.' : 'Trabajo de relajación/medias paradas para asentar el tempo.',
        workflow: 'schooling_plan'
      });
    }
  }

  // 5. CLARIDAD DE 4 TIEMPOS baja — medium.
  const clar = son.claridad_4_tiempos != null ? son.claridad_4_tiempos : mov.uniformidad_4_tiempos;
  if (clar != null && clar < 0.5) {
    out.push({
      code: 'GAIT-4BEAT-BLUR', category: 'structure', scope: 'session',
      title: L ? 'Blurred four-beat — contacts not clearly separated' : 'Cuatro tiempos borroso — contactos poco separados',
      summary: L
        ? `Four-beat clarity is ${pct(clar)}. The four hoof contacts are not cleanly distinct; the gait may be drifting toward a two-beat structure.`
        : `La claridad de cuatro tiempos es ${pct(clar)}. Los cuatro contactos no son nítidamente distintos; la marcha puede estar desplazándose hacia una estructura de dos tiempos.`,
      evidence: { claridad_4_tiempos: clar },
      impact: 'medium',
      impact_estimate: L ? 'Penalty on the 25% clarity criterion' : 'Penalización en el criterio de claridad (25%)',
      recommended_action: L ? 'Surface/shoeing review + collection work to sharpen the beat.' : 'Revisión de superficie/herraje + trabajo de reunión para afinar el tiempo.',
      workflow: 'schooling_plan'
    });
  }

  // 6. CAPTURA DÉBIL: pocas pisadas con doble fuente (calidad de captura) — info.
  const pis = fallo.pisadas || [];
  const dual = pis.filter((p) => p.detectada_por_video && p.detectada_por_audio).length;
  if (pis.length && dual / pis.length < 0.3) {
    out.push({
      code: 'CAP-FUSION-WEAK', category: 'capture', scope: 'session',
      title: L ? 'Weak audio/video fusion — capture quality' : 'Fusión audio/video débil — calidad de captura',
      summary: L
        ? `Only ${dual} of ${pis.length} footfalls were confirmed by both video and audio. Single-source detection lowers confidence; re-capture with clearer hoof audio and a steady side view.`
        : `Solo ${dual} de ${pis.length} pisadas fueron confirmadas por video y audio. La detección de una sola fuente baja la confianza; recapturar con audio de cascos más claro y una toma lateral estable.`,
      evidence: { pisadas: pis.length, dual_source: dual },
      impact: 'info',
      impact_estimate: L ? 'Lower measurement confidence' : 'Menor confianza de medición',
      recommended_action: L ? 'Re-record on a sounding surface (tablado) with a tripod side view.' : 'Regrabar en superficie sonora (tablado) con toma lateral en trípode.',
      workflow: 'recapture'
    });
  }

  // 7. EXCELENCIA: marcha de calidad de campeonato — positivo/info.
  if (total != null && total >= 85 && c.es_modalidad_valida !== false) {
    out.push({
      code: 'GAIT-EXCELLENCE', category: 'quality', scope: 'session',
      title: L ? 'Championship-quality gait' : 'Marcha de calidad de campeonato',
      summary: L
        ? `Weighted score ${num(total, 1)}/100 with clean rhythm and clear four-beat. This entry is a strong contender for the class.`
        : `Puntaje ponderado ${num(total, 1)}/100 con ritmo limpio y cuatro tiempos claro. Esta inscripción es una fuerte contendiente para la categoría.`,
      evidence: { puntaje_total: total, regularidad_ritmo: mov.regularidad_ritmo },
      impact: 'info',
      impact_estimate: L ? 'Top-tier candidate' : 'Candidata de primer nivel',
      recommended_action: L ? 'Maintain conditioning; prioritize for finals.' : 'Mantener la condición; priorizar para finales.',
      workflow: 'none'
    });
  }

  return out;
}

// ---- Detector de CATEGORÍA --------------------------------------------------
// rankingRows: salida de rankingCategoria (con puntaje_total + ranking).
function analizarCategoria(rankingRows, lang) {
  const L = String(lang || 'es').slice(0, 2) === 'en';
  const rows = rankingRows || [];
  const juzgados = rows.filter((r) => r.puntaje_total != null);
  const out = [];

  if (!juzgados.length) return out;

  // Líder de categoría.
  const lider = juzgados[0];
  out.push({
    code: 'CAT-LEADER', category: 'ranking', scope: 'category',
    title: L ? 'Current category leader' : 'Líder actual de la categoría',
    summary: L
      ? `${lider.caballo || 'Entry'} (#${lider.numero_competidor != null ? lider.numero_competidor : '?'}) leads with ${num(lider.puntaje_total, 1)}/100 across ${juzgados.length} judged entries.`
      : `${lider.caballo || 'Inscripción'} (#${lider.numero_competidor != null ? lider.numero_competidor : '?'}) lidera con ${num(lider.puntaje_total, 1)}/100 sobre ${juzgados.length} inscripciones juzgadas.`,
    evidence: { caballo: lider.caballo, puntaje_total: lider.puntaje_total, juzgados: juzgados.length },
    impact: 'info',
    impact_estimate: L ? 'Provisional class leader' : 'Líder provisional de la categoría',
    recommended_action: L ? 'Confirm with the official judge before awarding.' : 'Confirmar con el juez oficial antes de premiar.',
    workflow: 'none'
  });

  // Definición reñida: top-2 muy cerca.
  if (juzgados.length >= 2) {
    const gap = juzgados[0].puntaje_total - juzgados[1].puntaje_total;
    if (gap <= 3) {
      out.push({
        code: 'CAT-CLOSE', category: 'ranking', scope: 'category',
        title: L ? 'Tight finish — top two within 3 points' : 'Definición reñida — los dos primeros a 3 puntos',
        summary: L
          ? `Only ${num(gap, 1)} points separate the top two entries. Consider a closer review or a second pass to break the tie cleanly.`
          : `Solo ${num(gap, 1)} puntos separan a las dos primeras inscripciones. Considerar una revisión más detallada o una segunda pasada para definir el desempate.`,
        evidence: { gap: gap, primero: juzgados[0].caballo, segundo: juzgados[1].caballo },
        impact: 'medium',
        impact_estimate: L ? 'Tie-break attention' : 'Atención a desempate',
        recommended_action: L ? 'Re-judge the top two on rhythm and four-beat clarity.' : 'Rejuzgar a los dos primeros en ritmo y claridad de cuatro tiempos.',
        workflow: 'rejudge'
      });
    }
  }

  // Pendientes por juzgar.
  const pendientes = rows.length - juzgados.length;
  if (pendientes > 0) {
    out.push({
      code: 'CAT-PENDING', category: 'ops', scope: 'category',
      title: L ? 'Entries still pending evaluation' : 'Inscripciones aún pendientes de evaluar',
      summary: L
        ? `${pendientes} of ${rows.length} entries have not been judged yet. The ranking is provisional until all entries are evaluated.`
        : `${pendientes} de ${rows.length} inscripciones aún no han sido juzgadas. El ranking es provisional hasta evaluar todas las inscripciones.`,
      evidence: { pendientes, total: rows.length },
      impact: 'low',
      impact_estimate: L ? 'Provisional ranking' : 'Ranking provisional',
      recommended_action: L ? 'Capture and judge the remaining entries.' : 'Capturar y juzgar las inscripciones restantes.',
      workflow: 'none'
    });
  }

  return out;
}

const IMPACT_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
function ordenarPorImpacto(findings) {
  return (findings || []).slice().sort((a, b) => (IMPACT_RANK[a.impact] ?? 9) - (IMPACT_RANK[b.impact] ?? 9));
}

module.exports = { analizarSesion, analizarCategoria, ordenarPorImpacto, IMPACT_RANK };
