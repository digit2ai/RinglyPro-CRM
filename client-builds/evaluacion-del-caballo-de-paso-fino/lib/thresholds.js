// =====================================================
// Umbrales de clasificación versionados — NUNCA hardcodear en el clasificador.
// Estos viven en ecpf_modelos_clasificacion.umbrales_json (JSONB) para
// trazabilidad y apelaciones. Este archivo es solo el DEFAULT que se siembra
// como el modelo activo v1.0.0; una vez en BD, se editan sin tocar código.
// =====================================================

'use strict';

const DEFAULT_MODEL = {
  version: 'v1.0.0',
  modalidad: null, // aplica a todas las modalidades
  activo: true,
  umbrales: {
    // Agrupación de pisadas casi simultáneas en un mismo "tiempo" (beat).
    cluster_beat_ms: 60,
    // Ventana de fusión audio+video para unificar un mismo golpe.
    fusion_window_ms: 40,
    // Regularidad: coeficiente de variación de los intervalos entre tiempos.
    cv_paso_fino_max: 0.10,   // <= => "muy parejo" (paso fino)
    cv_regular_max: 0.18,     // referencia para normalizar ritmo
    // Apoyos: fracción de transiciones que deben ser laterales/diagonales.
    lateral_ratio_min: 0.60,
    diagonal_ratio_min: 0.60,
    // Cadencia esperada (pisadas por minuto) del paso fino: rápida y corta.
    cadencia_paso_fino_min_ppm: 120,
    cadencia_paso_fino_ideal_ppm: 180,
    cadencia_paso_fino_max_ppm: 280
  }
};

module.exports = { DEFAULT_MODEL };
