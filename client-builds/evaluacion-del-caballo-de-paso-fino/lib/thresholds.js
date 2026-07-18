// =====================================================
// Umbrales de clasificación y puntuación — VERSIONADOS (no hardcodear en el
// motor). Viven en ecpf_modelos_clasificacion.umbrales_json (JSONB) para
// trazabilidad, apelaciones y ajuste por un juez certificado SIN tocar código.
// Este archivo es solo el DEFAULT que se siembra como modelo activo.
//
// CALIBRACIÓN v2.0.0 (2026-07) — valores derivados de biomecánica REAL, no demo:
//   Fuente primaria: Novoa-Bravo et al. (2018), "Selection on the Colombian paso
//   horse's gaits has produced kinematic differences partly explained by the
//   DMRT3 gene", NCBI PMC6097835. Frecuencia de zancada medida:
//     · Paso fino (4 tiempos lateral, isócrono): 2.60–2.85 zancadas/s
//     · Trocha   (4 tiempos diagonal, no isócrono): 2.70–2.96 zancadas/s
//     · Trote colombiano (2 tiempos diagonal): frecuencia MENOR que fino/trocha
//   Cadencia de PISADAS/min = zancadas/s × tiempos_por_ciclo × 60.
//     · Paso fino: 4 × (2.60–2.85) × 60 = 624–684 pisadas/min  → ideal ~654
//     · Trocha:    4 × (2.70–2.96) × 60 = 648–710 pisadas/min  → ideal ~680
//     · Trote:     2 × (~2.0–2.6)  × 60 = 240–312 pisadas/min  (estimado*)
//   (*) Trote/galope: el estudio reporta "menor" sin cifra exacta; bandas
//       marcadas `estimado:true` para validación por juez certificado.
//   Los tres aires del paso fino (Fino Clásico, Paso Corto, Paso Largo) caen
//   dentro de la banda paso_fino: el Fino Clásico tiene la pisada más rápida
//   (extremo alto), el Largo la más extendida (extremo bajo).
// =====================================================

'use strict';

const DEFAULT_MODEL = {
  version: 'v2.0.0',
  modalidad: null, // aplica a todas las modalidades
  activo: true,
  fuente: 'Novoa-Bravo et al. 2018, NCBI PMC6097835 (frecuencia de zancada del caballo de paso colombiano)',
  umbrales: {
    // Agrupación de pisadas casi simultáneas en un mismo "tiempo" (beat).
    cluster_beat_ms: 55,
    // Ventana de fusión audio+video para unificar un mismo golpe.
    fusion_window_ms: 40,
    // Refractario del detector de onsets (ms). El paso fino real tiene pisadas a
    // ~90 ms (≈660 ppm) y la trocha a ~85 ms (≈710 ppm); el refractario DEBE ser
    // menor para poder resolverlas, pero mayor que la resonancia de un casco
    // (~20–50 ms) para no doblar golpes. 60 ms cumple ambos.
    refractory_ms: 60,
    // Regularidad: coeficiente de variación de los intervalos entre tiempos.
    cv_paso_fino_max: 0.10,   // <= => isócrono (paso fino)
    cv_regular_max: 0.18,     // referencia para normalizar ritmo
    // Apoyos: fracción de transiciones que deben ser laterales/diagonales.
    lateral_ratio_min: 0.60,
    diagonal_ratio_min: 0.60,
    // Bandas de cadencia (PISADAS/min) por modalidad. Triangular: ideal = 100,
    // cae a 0 en min/max. Derivadas de la frecuencia de zancada real × tiempos.
    cadencia_bands: {
      paso_fino:     { min: 540, ideal: 654, max: 760, estimado: false },
      trocha:        { min: 560, ideal: 680, max: 800, estimado: false },
      trocha_galope: { min: 520, ideal: 660, max: 800, estimado: true },
      trote_galope:  { min: 190, ideal: 285, max: 400, estimado: true },
      // Asnales y mulares: no hay estudio cinemático publicado; bandas amplias
      // marcadas estimado:true para validación por juez certificado.
      asnal:         { min: 150, ideal: 240, max: 360, estimado: true },
      mular:         { min: 150, ideal: 260, max: 420, estimado: true }
    },
    // Referencias de normalización para las métricas de pose (0..1). Derivan del
    // rango vertical del tronco/cabeza relativo al cuadro; calibrables por juez.
    // Un tronco que "cabecea" poco (paso fino suave) => suavidad alta.
    suavidad_bob_ref: 0.14,      // rango vertical de cruz/dorso que ~anula suavidad
    quietud_anca_vert_ref: 0.12, // rango vertical de grupa que ~anula la quietud
    quietud_anca_sway_ref: 0.06, // vaivén horizontal (detrend) que ~anula la quietud
    posicion_cabeza_ref: 0.10,   // oscilación de nuca/hocico que ~anula la estabilidad
    compensacion_ref: 0.45,      // |elev_ant - elev_post| que ~anula la compensación
    sostenimiento_drift_k: 3.0,  // sensibilidad a la deriva de cadencia (1a vs 2a mitad)
    // Compat (motor viejo): banda paso fino en las claves planas.
    cadencia_paso_fino_min_ppm: 540,
    cadencia_paso_fino_ideal_ppm: 654,
    cadencia_paso_fino_max_ppm: 760
  }
};

// Banda de cadencia para una modalidad (con fallback a paso_fino).
function cadenciaBand(umbrales, modalidad) {
  const U = umbrales || DEFAULT_MODEL.umbrales;
  const bands = U.cadencia_bands || DEFAULT_MODEL.umbrales.cadencia_bands;
  return bands[modalidad] || bands.paso_fino || {
    min: U.cadencia_paso_fino_min_ppm, ideal: U.cadencia_paso_fino_ideal_ppm, max: U.cadencia_paso_fino_max_ppm
  };
}

module.exports = { DEFAULT_MODEL, cadenciaBand };
