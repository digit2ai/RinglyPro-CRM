// =====================================================
// Dictamen profesional del juez — genera un fallo extenso y estructurado, como
// el de un juez de campeonato de paso fino, a partir de las métricas reales.
//
//   generar(fallo, lang) -> {
//     titulo, resumen, veredicto, secciones:[{titulo, cuerpo, nivel}],
//     recomendaciones:[...], firma, texto_plano
//   }
//
// Determinista: las mismas métricas producen el mismo dictamen (trazabilidad
// y apelaciones). Bilingüe ES/EN. Sin emojis. Ancla todas las interpretaciones
// a los umbrales versionados (lib/thresholds.js) para que un cambio de modelo se
// refleje en la redacción sin tocar este archivo.
// =====================================================

'use strict';

const { DEFAULT_MODEL } = require('./thresholds');

const MOD_LABEL = {
  paso_fino: { es: 'Paso Fino', en: 'Paso Fino' },
  trocha: { es: 'Trocha', en: 'Trocha (broken-pace)' },
  trote_galope: { es: 'Trote / Galope', en: 'Trot / Canter' },
  trocha_galope: { es: 'Trocha y Galope', en: 'Trocha & Canter' }
};
const PATRON_LABEL = {
  lateral: { es: 'laterales (mismo lado)', en: 'lateral (same-side)' },
  diagonal: { es: 'diagonales (lados opuestos)', en: 'diagonal (opposite-side)' },
  indeterminado: { es: 'indeterminados', en: 'indeterminate' }
};

function modLabel(m, L) { return (MOD_LABEL[m] && MOD_LABEL[m][L ? 'en' : 'es']) || (m || (L ? 'undetermined' : 'indeterminada')); }
function pct(x) { return x != null ? Math.round(x * 100) + '%' : '—'; }
function num(x, d) { return x != null ? Number(x).toFixed(d == null ? 0 : d) : '—'; }

// Banda cualitativa 0..1 -> etiqueta.
function calidad(v, L) {
  if (v == null) return L ? 'not measurable' : 'no medible';
  if (v >= 0.85) return L ? 'excellent' : 'excelente';
  if (v >= 0.70) return L ? 'good' : 'buena';
  if (v >= 0.50) return L ? 'fair' : 'regular';
  if (v >= 0.30) return L ? 'weak' : 'deficiente';
  return L ? 'poor' : 'muy deficiente';
}

const TIPO_LABEL = {
  caballo: { es: 'Caballo Criollo Colombiano', en: 'Colombian Criollo horse' },
  campeon_joven: { es: 'Campeón/Campeona Joven', en: 'Young Champion' },
  grupo_yeguas: { es: 'Grupo de Yeguas', en: 'Group of Mares' },
  asnal: { es: 'Asnal', en: 'Donkey (asnal)' },
  mular: { es: 'Mular', en: 'Mule (mular)' }
};

function generar(fallo, lang) {
  const L = String(lang || 'es').slice(0, 2) === 'en';
  const U = DEFAULT_MODEL.umbrales;
  const tipo = fallo.tipo || 'caballo';
  const tipoLabel = (TIPO_LABEL[tipo] && TIPO_LABEL[tipo][L ? 'en' : 'es']) || tipo;
  const c = fallo.clasificacion || {};
  const mov = fallo.metricas_movimiento || {};
  const son = fallo.metricas_sonido || {};
  const punt = fallo.puntuaciones || [];
  const total = fallo.puntaje_total;
  const conf = c.confianza != null ? Math.round(c.confianza * 100) : null;
  const cv = c.coef_variacion_intervalos != null ? c.coef_variacion_intervalos : mov.coef_variacion_intervalos;

  const secciones = [];
  const recomendaciones = [];

  const mod = modLabel(c.modalidad_detectada, L);
  // tiempos + patrón de apoyos son definitorios por modalidad; si no se
  // persistieron (la tabla clasificaciones solo guarda modalidad+confianza), se
  // derivan de la modalidad para no mostrar nunca "?" ni "undefined".
  const PATRON_BY_MOD = { paso_fino: 'lateral', trocha: 'diagonal', trote_galope: 'diagonal', galope: 'diagonal' };
  const TIEMPOS_ES = { 2: 'dos', 3: 'tres', 4: 'cuatro' };
  const patronKey = (c.patron && c.patron !== 'indeterminado') ? c.patron : PATRON_BY_MOD[c.modalidad_detectada];
  const patron = patronKey ? ((PATRON_LABEL[patronKey] && PATRON_LABEL[patronKey][L ? 'en' : 'es']) || patronKey) : null;
  const nBeats = (c.tiempos != null && c.tiempos > 0) ? c.tiempos : (c.modalidad_detectada === 'trote_galope' ? 2 : (c.modalidad_detectada ? 4 : null));
  const beatEs = nBeats != null ? (TIEMPOS_ES[nBeats] || nBeats) : null;
  const seqEs = nBeats != null ? `sobre una secuencia de ${beatEs} tiempos` : 'sobre la secuencia de pisadas';
  const seqEn = nBeats != null ? `on a ${nBeats}-beat footfall sequence` : 'on the footfall sequence';
  const suppEs = patron ? ` con apoyos ${patron}` : '';
  const suppEn = patron ? ` with ${patron} supports` : '';

  // ---- Veredicto general ----
  const veredicto = L
    ? `The animal exhibits a ${mod} gait, classified with ${conf != null ? conf + '%' : 'n/a'} confidence ${seqEn}${suppEn}. ` +
      `This determination is grounded in the inter-footfall interval pattern and its uniformity, the biomechanical signature that separates the four-beat lateral gait of the Paso Fino from the diagonal gaits.`
    : `El ejemplar exhibe una marcha de ${mod}, clasificada con ${conf != null ? conf + '%' : 'n/d'} de confianza ${seqEs}${suppEs}. ` +
      `Esta determinación se fundamenta en el patrón de intervalos entre pisadas y su uniformidad, la firma biomecánica que separa la marcha lateral de cuatro tiempos del Paso Fino de las marchas diagonales.`;

  // ---- Validez de modalidad vs categoría ----
  if (c.es_modalidad_valida === false) {
    secciones.push({
      nivel: 'critico',
      titulo: L ? 'Modality vs. entered category' : 'Validez de modalidad',
      cuerpo: L
        ? `IMPORTANT: the detected gait (${mod}) does NOT match the modality of the entered category (${modLabel(c.modalidad_categoria, L)}). ` +
          `Under championship rules this is grounds for disqualification or re-classification: the horse is not performing the gait the class demands. The technical score below is reported for reference only.`
        : `IMPORTANTE: la marcha detectada (${mod}) NO corresponde a la modalidad de la categoría inscrita (${modLabel(c.modalidad_categoria, L)}). ` +
          `Bajo reglamento de campeonato esto es causal de descalificación o reclasificación: el caballo no está ejecutando la marcha que la categoría exige. El puntaje técnico siguiente se reporta solo como referencia.`
    });
    recomendaciones.push(L
      ? 'Re-enter the horse in the category matching its natural gait, or review schooling if Paso Fino was expected.'
      : 'Reinscribir al caballo en la categoría que corresponde a su marcha natural, o revisar el adiestramiento si se esperaba Paso Fino.');
  } else if (c.es_modalidad_valida === true) {
    secciones.push({
      nivel: 'ok',
      titulo: L ? 'Modality vs. entered category' : 'Validez de modalidad',
      cuerpo: L
        ? `The detected gait matches the entered category (${modLabel(c.modalidad_categoria, L)}). The entry is valid for judging.`
        : `La marcha detectada coincide con la categoría inscrita (${modLabel(c.modalidad_categoria, L)}). La inscripción es válida para juzgamiento.`
    });
  }

  // ---- Ritmo y regularidad ----
  let nivelRitmo = 'ok', cuerpoRitmo;
  if (cv == null) {
    cuerpoRitmo = L ? 'Rhythm regularity could not be measured (insufficient footfalls).' : 'No se pudo medir la regularidad del ritmo (pisadas insuficientes).';
    nivelRitmo = 'aviso';
  } else if (cv <= U.cv_paso_fino_max) {
    cuerpoRitmo = L
      ? `The coefficient of variation of the inter-footfall intervals is ${num(cv, 3)} — at or below the ${num(U.cv_paso_fino_max, 2)} threshold that defines an even, machine-like four-beat rhythm. ` +
        `This is the hallmark of a quality Paso Fino: each beat lands at a near-constant interval, the rhythm is clean and the cadence does not drift. It is the single most heavily weighted attribute in the class.`
      : `El coeficiente de variación de los intervalos entre pisadas es ${num(cv, 3)} — igual o por debajo del umbral de ${num(U.cv_paso_fino_max, 2)} que define un ritmo de cuatro tiempos parejo y de reloj. ` +
        `Este es el sello de un Paso Fino de calidad: cada tiempo cae a un intervalo casi constante, el ritmo es limpio y la cadencia no se desvía. Es el atributo de mayor peso en la categoría.`;
  } else if (cv <= U.cv_regular_max) {
    nivelRitmo = 'aviso';
    cuerpoRitmo = L
      ? `The coefficient of variation is ${num(cv, 3)}, above the ${num(U.cv_paso_fino_max, 2)} ideal but within the acceptable band (<= ${num(U.cv_regular_max, 2)}). ` +
        `The rhythm is broadly regular but shows perceptible drift between footfalls — the timing is not yet metronomic. A trained eye will notice slight unevenness, particularly under collection.`
      : `El coeficiente de variación es ${num(cv, 3)}, por encima del ideal de ${num(U.cv_paso_fino_max, 2)} pero dentro de la banda aceptable (<= ${num(U.cv_regular_max, 2)}). ` +
        `El ritmo es regular en términos generales pero muestra desviación perceptible entre pisadas — el compás aún no es de metrónomo. Un ojo entrenado notará leve disparejo, sobre todo en reunión.`;
    recomendaciones.push(L ? 'Schooling to stabilize the four-beat timing (rhythm work, tempo transitions).' : 'Adiestramiento para estabilizar el compás de cuatro tiempos (trabajo de ritmo, transiciones de tempo).');
  } else {
    nivelRitmo = 'critico';
    cuerpoRitmo = L
      ? `The coefficient of variation is ${num(cv, 3)}, well above the ${num(U.cv_regular_max, 2)} acceptable ceiling. The rhythm is irregular: intervals between footfalls vary substantially. ` +
        `This breaks the clean four-beat impression and is heavily penalized — it points to a coordination, balance or conditioning issue rather than a momentary lapse.`
      : `El coeficiente de variación es ${num(cv, 3)}, muy por encima del techo aceptable de ${num(U.cv_regular_max, 2)}. El ritmo es irregular: los intervalos entre pisadas varían sustancialmente. ` +
        `Esto rompe la impresión limpia de cuatro tiempos y se penaliza fuertemente — apunta a un problema de coordinación, equilibrio o condición, no a un desliz momentáneo.`;
    recomendaciones.push(L ? 'Veterinary check to rule out lameness/asymmetry, then structured rhythm schooling.' : 'Revisión veterinaria para descartar claudicación/asimetría, luego adiestramiento estructurado de ritmo.');
  }
  secciones.push({ nivel: nivelRitmo, titulo: L ? 'Rhythm and regularity' : 'Ritmo y regularidad', cuerpo: cuerpoRitmo });

  // ---- Estructura de apoyos / claridad de 4 tiempos ----
  const clar = son.claridad_4_tiempos != null ? son.claridad_4_tiempos : mov.uniformidad_4_tiempos;
  secciones.push({
    nivel: clar != null && clar >= 0.6 ? 'ok' : 'aviso',
    titulo: L ? 'Four-beat clarity & support structure' : 'Claridad de 4 tiempos y estructura de apoyos',
    cuerpo: L
      ? `The footfall sequence resolves into ${nBeats != null ? nBeats : 'four'} beats per cycle${suppEn}; four-beat clarity scores ${calidad(clar, L)} (${pct(clar)}). ` +
        `In the Paso Fino each hoof must strike the ground as a distinct, audible beat — the cleaner the separation between the four contacts, the higher the merit. A blurred or paired beat suggests the gait is drifting toward a two-beat (trochy/trot) structure.`
      : `La secuencia de pisadas resuelve en ${beatEs != null ? beatEs : 'cuatro'} tiempos por ciclo${suppEs}; la claridad de cuatro tiempos es ${calidad(clar, L)} (${pct(clar)}). ` +
        `En el Paso Fino cada casco debe golpear el suelo como un tiempo nítido y audible — cuanto más limpia la separación entre los cuatro contactos, mayor el mérito. Un tiempo borroso o apareado sugiere que la marcha se desplaza hacia una estructura de dos tiempos (trocha/trote).`
  });

  // ---- Cadencia y brío ----
  const cad = mov.cadencia_ppm;
  let nivelCad = 'ok', cuerpoCad;
  if (cad == null) { cuerpoCad = L ? 'Cadence could not be measured.' : 'No se pudo medir la cadencia.'; nivelCad = 'aviso'; }
  else if (cad < U.cadencia_paso_fino_min_ppm) {
    nivelCad = 'aviso';
    cuerpoCad = L
      ? `Cadence is ${num(cad)} footfalls/min, below the ${U.cadencia_paso_fino_min_ppm} expected floor. The gait is slow and lacks the rapid, short, brisk steps (brío) the Paso Fino prizes; it may read as laboured.`
      : `La cadencia es ${num(cad)} pisadas/min, por debajo del piso esperado de ${U.cadencia_paso_fino_min_ppm}. La marcha es lenta y carece de los pasos rápidos, cortos y briosos (brío) que el Paso Fino premia; puede percibirse trabajosa.`;
    recomendaciones.push(L ? 'Conditioning and impulsion work to raise cadence into the 120-280 range.' : 'Trabajo de condición e impulsión para subir la cadencia al rango 120-280.');
  } else if (cad > U.cadencia_paso_fino_max_ppm) {
    nivelCad = 'aviso';
    cuerpoCad = L
      ? `Cadence is ${num(cad)} footfalls/min, above the ${U.cadencia_paso_fino_max_ppm} ceiling. The steps are extremely rapid; verify this is genuine brío and not a rushed, tense tempo that sacrifices rhythm quality.`
      : `La cadencia es ${num(cad)} pisadas/min, por encima del techo de ${U.cadencia_paso_fino_max_ppm}. Los pasos son muy rápidos; verificar que sea brío genuino y no un tempo apresurado y tenso que sacrifique la calidad del ritmo.`;
  } else {
    cuerpoCad = L
      ? `Cadence is ${num(cad)} footfalls/min, inside the ideal ${U.cadencia_paso_fino_min_ppm}-${U.cadencia_paso_fino_max_ppm} band (target ~${U.cadencia_paso_fino_ideal_ppm}). The horse shows the rapid, short, energetic step that defines Paso Fino brío.`
      : `La cadencia es ${num(cad)} pisadas/min, dentro de la banda ideal ${U.cadencia_paso_fino_min_ppm}-${U.cadencia_paso_fino_max_ppm} (objetivo ~${U.cadencia_paso_fino_ideal_ppm}). El caballo muestra el paso rápido, corto y enérgico que define el brío del Paso Fino.`;
  }
  secciones.push({ nivel: nivelCad, titulo: L ? 'Cadence & brío' : 'Cadencia y brío', cuerpo: cuerpoCad });

  // ---- Simetría lateral ----
  const sim = mov.simetria_lateral;
  secciones.push({
    nivel: sim != null && sim >= 0.7 ? 'ok' : 'aviso',
    titulo: L ? 'Lateral symmetry' : 'Simetría lateral',
    cuerpo: L
      ? `Left/right balance of support scores ${pct(sim)} (${calidad(sim, L)}). A symmetric horse loads both sides evenly; a marked imbalance can indicate a one-sided preference, a developing lameness, or rider influence. ${sim != null && sim < 0.7 ? 'The asymmetry here is worth a closer in-hand inspection.' : 'No material asymmetry was detected.'}`
      : `El balance izquierda/derecha de los apoyos es ${pct(sim)} (${calidad(sim, L)}). Un caballo simétrico carga ambos lados por igual; un desbalance marcado puede indicar preferencia de un lado, una claudicación en desarrollo o influencia del jinete. ${sim != null && sim < 0.7 ? 'La asimetría aquí amerita una inspección a la mano más detallada.' : 'No se detectó asimetría material.'}`
  });
  if (sim != null && sim < 0.7) recomendaciones.push(L ? 'In-hand lameness check on both reins; balancing/straightness work.' : 'Examen de claudicación a la mano en ambas manos; trabajo de equilibrio/rectitud.');

  // ---- Elevación y amplitud ----
  const ea = mov.elevacion_anterior, ep = mov.elevacion_posterior;
  if (ea != null || ep != null) {
    secciones.push({
      nivel: 'info',
      titulo: L ? 'Elevation & reach' : 'Elevación y amplitud',
      cuerpo: L
        ? `Forelimb elevation reads ${pct(ea)} and hindlimb ${pct(ep)} of frame-normalized range. Elevation contributes to the showy, lofty action valued in the breed, but must not come at the expense of rhythm. ${(ea != null && ep != null && Math.abs(ea - ep) > 0.25) ? 'A notable front/hind elevation gap was observed.' : 'Front and hind action are reasonably matched.'}`
        : `La elevación anterior es ${pct(ea)} y la posterior ${pct(ep)} del rango normalizado al cuadro. La elevación aporta la acción vistosa y alta valorada en la raza, pero no debe lograrse a costa del ritmo. ${(ea != null && ep != null && Math.abs(ea - ep) > 0.25) ? 'Se observó una brecha notable de elevación entre tren anterior y posterior.' : 'La acción anterior y posterior están razonablemente equiparadas.'}`
    });
    if (ea != null && ea < 0.25) recomendaciones.push(L ? 'Cavaletti/pole work 3×/week to build the front-limb arc; recheck hoof balance and scapular freedom.' : 'Trabajo de cavaletti/varas 3×/semana para construir el arco de la mano; revisar aplomo de casco y libertad escapular.');
    if (ep != null && ep < 0.25) recomendaciones.push(L ? 'Hill and hind-engagement work to raise the hind arc and impulsion.' : 'Trabajo en pendiente y de enganche del posterior para subir el arco posterior y la impulsión.');
    if (ea != null && ep != null && Math.abs(ea - ep) > 0.15) recomendaciones.push(L ? 'Balance front vs. hind action with symmetry/straightness work; compare both elevation arcs on the next 3D scan.' : 'Equilibrar la acción anterior vs. posterior con trabajo de simetría/rectitud; comparar ambos arcos de elevación en el próximo escaneo 3D.');
  }

  // ---- Movimientos avanzados del rubro oficial (pose de tronco/cabeza) ----
  const adv = [
    ['suavidad', L ? 'Softness & naturalness (Suavidad)' : 'Suavidad y naturalidad', L ? 'the single highest-weighted line — comfort of the ride' : 'la línea de mayor peso — comodidad del transporte'],
    ['compensacion', L ? 'Compensation (fore/hind harmony)' : 'Compensación (armonía ant/post)', ''],
    ['quietud_anca', L ? 'Croup stillness (Quietud de anca)' : 'Quietud de anca', ''],
    ['sostenimiento', L ? 'Consistency (Sostenimiento)' : 'Sostenimiento (constancia)', ''],
    ['posicion_cabeza', L ? 'Head carriage / collection' : 'Posición de cabeza / reunión', '']
  ].filter(([k]) => mov[k] != null);
  if (adv.length) {
    const lineas = adv.map(([k, lbl, note]) => `- ${lbl}: ${pct(mov[k])} (${calidad(mov[k], L)})${note ? ' — ' + note : ''}`);
    secciones.push({
      nivel: 'info',
      titulo: L ? 'Advanced movement metrics' : 'Métricas de movimiento avanzadas',
      cuerpo: (L
        ? 'Derived from torso/head pose (withers, back, croup, poll). These map to the official Movimientos block lines beyond rhythm:\n'
        : 'Derivadas de la pose del tronco/cabeza (cruz, dorso, grupa, nuca). Mapean las líneas del bloque Movimientos más allá del ritmo:\n') + lineas.join('\n')
    });
  }

  // ---- Rubro oficial aplicado + subtotales por bloque ----
  if (punt.length) {
    const bloques = {};
    for (const p of punt) {
      const b = p.bloque || '—';
      if (!bloques[b]) bloques[b] = { peso: 0, medPeso: 0, acum: 0 };
      bloques[b].peso += Number(p.peso_porcentaje) || 0;
      if (p.medible !== false && p.puntaje_normalizado != null) {
        bloques[b].medPeso += Number(p.peso_porcentaje) || 0;
        bloques[b].acum += p.puntaje_normalizado * (Number(p.peso_porcentaje) || 0);
      }
    }
    const bloqueLineas = Object.keys(bloques).map((b) => {
      const x = bloques[b];
      const sub = x.medPeso > 0 ? (x.acum / x.medPeso) : null;
      const covPct = x.peso > 0 ? Math.round((x.medPeso / x.peso) * 100) : 0;
      const val = sub != null
        ? `${num(sub, 0)}/100 (${L ? 'measured ' : 'medido '}${covPct}% ${L ? 'of block' : 'del bloque'})`
        : (L ? 'pending — requires 3D scan / judge input' : 'pendiente — requiere escaneo 3D / evaluación del juez');
      return `- ${b} (${num(x.peso, 0)}%): ${val}`;
    });
    secciones.push({
      nivel: 'info',
      titulo: L ? `Official FEDEQUINAS rubric applied — ${tipoLabel}` : `Rubro oficial FEDEQUINAS aplicado — ${tipoLabel}`,
      cuerpo: (L
        ? `Scored against the official FEDEQUINAS scoring table for this entry type (see REGLAMENTO_FEDEQUINAS.md). Block subtotals:\n`
        : `Puntuado con la tabla oficial de puntajes FEDEQUINAS para este tipo de inscripción (ver REGLAMENTO_FEDEQUINAS.md). Subtotales por bloque:\n`)
        + bloqueLineas.join('\n')
        + (fallo.cobertura != null ? `\n\n${L ? 'Overall measured coverage' : 'Cobertura medida total'}: ${Math.round(fallo.cobertura * 100)}% — ${L ? 'the score is renormalized over the criteria that could be measured; Fenotipo/Aplomos come from the 3D conformation engine.' : 'el puntaje se renormaliza sobre los criterios que sí se pudieron medir; Fenotipo/Aplomos provienen del motor de conformación 3D.'}` : '')
    });

    // ---- Desglose por criterio (honesto sobre lo no medido) ----
    const lineas = punt.map((p) => {
      let val;
      if (p.puntaje_normalizado != null) val = `${num(p.puntaje_normalizado, 0)}/100 — ${calidad((p.puntaje_normalizado || 0) / 100, L)}`;
      else if (p.origen === 'gs') val = L ? 'requires 3D conformation scan' : 'requiere escaneo de conformación 3D';
      else if (p.origen === 'manual') val = L ? 'judge/rein input' : 'evaluación del juez / rienda';
      else val = L ? 'not measurable' : 'no medible';
      return `- ${p.nombre} (${num(p.peso_porcentaje, 0)}%): ${val}`;
    });
    secciones.push({
      nivel: 'info',
      titulo: L ? 'Criterion breakdown' : 'Desglose por criterio',
      cuerpo: (L ? 'Every line of the official table:\n' : 'Cada línea de la tabla oficial:\n') + lineas.join('\n')
    });
  }

  // ---- Resumen ejecutivo ----
  let banda;
  if (total == null) banda = L ? 'not scored' : 'sin puntuar';
  else if (total >= 85) banda = L ? 'championship quality' : 'calidad de campeonato';
  else if (total >= 70) banda = L ? 'very good' : 'muy bueno';
  else if (total >= 55) banda = L ? 'competitive' : 'competitivo';
  else if (total >= 40) banda = L ? 'developing' : 'en desarrollo';
  else banda = L ? 'below class standard' : 'por debajo del estándar';

  const resumen = L
    ? `${mod} gait, ${num(total, 1)}/100 (${banda})${fallo.ranking ? `, provisional rank #${fallo.ranking} in the category` : ''}. ` +
      `Rhythm ${calidad(mov.regularidad_ritmo, L)}, four-beat clarity ${calidad(clar, L)}, symmetry ${calidad(sim, L)}.`
    : `Marcha de ${mod}, ${num(total, 1)}/100 (${banda})${fallo.ranking ? `, puesto provisional #${fallo.ranking} en la categoría` : ''}. ` +
      `Ritmo ${calidad(mov.regularidad_ritmo, L)}, claridad de 4 tiempos ${calidad(clar, L)}, simetría ${calidad(sim, L)}.`;

  if (!recomendaciones.length) {
    recomendaciones.push(L ? 'Maintain current conditioning and schooling; the gait meets class standard.' : 'Mantener la condición y el adiestramiento actuales; la marcha cumple el estándar de la categoría.');
  }
  // Always close with a comparison-scan prompt so the report drives repeat value.
  recomendaciones.push(L ? 'Re-scan in 60 days and use this report as the baseline to measure progress side by side.' : 'Re-escanear en 60 días y usar este informe como línea base para medir el progreso lado a lado.');

  const titulo = L ? 'JUDGE\'S RULING — Paso Fino Gait Evaluation' : 'DICTAMEN DEL JUEZ — Evaluación de Marcha de Paso Fino';
  const firma = L
    ? 'Issued by the Digit2AI gait-evaluation engine (model ' + DEFAULT_MODEL.version + '). Deterministic, reproducible and traceable; not a substitute for the official judge of record.'
    : 'Emitido por el motor de evaluación de marcha de Digit2AI (modelo ' + DEFAULT_MODEL.version + '). Determinista, reproducible y trazable; no sustituye al juez oficial de la pista.';

  const texto_plano = [
    titulo, '',
    (L ? 'SUMMARY: ' : 'RESUMEN: ') + resumen, '',
    (L ? 'VERDICT: ' : 'VEREDICTO: ') + veredicto, '',
    ...secciones.map((s) => `## ${s.titulo}\n${s.cuerpo}`), '',
    (L ? 'RECOMMENDATIONS:' : 'RECOMENDACIONES:'),
    ...recomendaciones.map((r) => '- ' + r), '',
    firma
  ].join('\n');

  return { titulo, resumen, veredicto, secciones, recomendaciones, firma, texto_plano };
}

module.exports = { generar, modLabel };
