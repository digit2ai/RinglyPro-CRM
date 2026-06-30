// =====================================================
// Diagnosis — deterministic rule engine: gait metrics -> verdict + recommendation.
//
// This replaces the deferred ML/data-fusion layer with the documented detection
// rule from the business plan:
//
//   - Frequency LAGGING but CONSTANT (cadence below the gallop threshold AND a
//     very low coefficient of variation) -> recommend VETERINARY review. A steady
//     but slow footfall points at a physical limitation, not a coordination one.
//   - IRREGULAR frequency (high CV) -> TRAINING adjustment. The horse can move
//     but its rhythm is inconsistent — a schooling/coordination issue.
//   - Otherwise -> NORMAL.
//
// verdict ∈ { vet_review, training_adjustment, normal }.
// =====================================================

'use strict';

// Tunable thresholds. Paso fino is a rapid, even four-beat gait; a cadence below
// the gallop threshold while perfectly steady is the "constant-but-lagging" flag.
const GALLOP_BPM_THRESHOLD = 150; // below this = "lagging" vs. expected fast gait
const CV_CONSTANT = 0.10;         // CV under this = "constant"
const CV_IRREGULAR = 0.25;        // CV over this = "irregular"

const TEXT = {
  es: {
    vet_review: 'Frecuencia constante pero por debajo del umbral de galope: el caballo mantiene un ritmo muy regular a una cadencia baja. Se recomienda revisión veterinaria para descartar una limitación física.',
    training_adjustment: 'Ritmo irregular (coeficiente de variación alto): la cadencia entre pisadas es inconsistente. Indica un problema de entrenamiento o coordinación; se sugiere ajuste de entrenamiento.',
    normal: 'Cadencia y regularidad dentro de los parámetros esperados para el paso fino. No se requiere acción.',
    insufficient: 'Pisadas insuficientes para un diagnóstico fiable. Suba una grabación más larga y con golpes de casco claros.'
  },
  en: {
    vet_review: 'Constant frequency but below the gallop threshold: the horse holds a very steady rhythm at a low cadence. Veterinary review is recommended to rule out a physical limitation.',
    training_adjustment: 'Irregular rhythm (high coefficient of variation): inter-step cadence is inconsistent. This points to a training or coordination issue; a training adjustment is suggested.',
    normal: 'Cadence and regularity within the expected range for the paso fino gait. No action required.',
    insufficient: 'Not enough beats for a reliable diagnosis. Upload a longer recording with clear hoof beats.'
  }
};

// metrics: { cadence_bpm, regularity_cv, beat_count }; lang: 'es' | 'en'.
function diagnose(metrics, lang = 'es') {
  const t = TEXT[lang === 'en' ? 'en' : 'es'];
  const cadence = metrics.cadence_bpm;
  const cv = metrics.regularity_cv;
  const beats = metrics.beat_count || 0;

  if (beats < 2 || cadence == null || cv == null) {
    return { verdict: 'normal', recommendation: t.insufficient, confidence: 'low' };
  }

  if (cv > CV_IRREGULAR) {
    return { verdict: 'training_adjustment', recommendation: t.training_adjustment, confidence: 'high' };
  }

  if (cv < CV_CONSTANT && cadence < GALLOP_BPM_THRESHOLD) {
    return { verdict: 'vet_review', recommendation: t.vet_review, confidence: 'high' };
  }

  return { verdict: 'normal', recommendation: t.normal, confidence: 'medium' };
}

module.exports = {
  diagnose,
  GALLOP_BPM_THRESHOLD,
  CV_CONSTANT,
  CV_IRREGULAR,
  TEXT
};
