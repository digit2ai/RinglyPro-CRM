// Bilingual UI strings (EN/ES) for the GS engine surfaces — day one.
'use strict';

const DICTS = {
  es: {
    lang: 'es', title: 'EquiMind 3D · Motor de Splatting Gaussiano',
    h1: 'EquiMind 3D', tagline: 'Captura en 3D: recorridos de pista y escaneos de conformación.',
    cap_title: 'Captura 3D', cap_video: 'Video del recorrido (.mp4 / .mov)', cap_photos: 'Ráfaga de fotos',
    cap_kind: 'Tipo', kind_course: 'Recorrido de pista', kind_conf: 'Escaneo de conformación',
    cap_process: 'Procesar en 3D', cap_hint: 'Filma una vuelta lenta y completa alrededor del sujeto, con buena luz.',
    scenes_title: 'Mis escenas 3D', open_viewer: 'Ver en 3D', share: 'Compartir', sim_note: 'Escena de referencia (simulada) — sin GPU de splatting configurada.',
    view_orbit: 'Arrastra para orbitar · pellizca para zoom', waypoint_add: 'Agregar punto',
    admin_title: 'Operaciones GS', jobs_flight: 'Trabajos en curso', spend: 'Gasto GPU vs créditos', failrate: 'Tasa de fallo'
  },
  en: {
    lang: 'en', title: 'EquiMind 3D · Gaussian Splatting Engine',
    h1: 'EquiMind 3D', tagline: '3D capture: course walks and conformation scans.',
    cap_title: '3D Capture', cap_video: 'Course video (.mp4 / .mov)', cap_photos: 'Photo burst',
    cap_kind: 'Type', kind_course: 'Course walk', kind_conf: 'Conformation scan',
    cap_process: 'Process in 3D', cap_hint: 'Film one slow, complete loop around the subject, in good light.',
    scenes_title: 'My 3D scenes', open_viewer: 'View in 3D', share: 'Share', sim_note: 'Reference scene (simulated) — no splatting GPU configured.',
    view_orbit: 'Drag to orbit · pinch to zoom', waypoint_add: 'Add waypoint',
    admin_title: 'GS Ops', jobs_flight: 'Jobs in flight', spend: 'GPU spend vs credits', failrate: 'Failure rate'
  }
};

function pickLang(raw) { return String(raw || '').toLowerCase().slice(0, 2) === 'en' ? 'en' : 'es'; }
function dict(lang) { return DICTS[pickLang(lang)] || DICTS.es; }
module.exports = { pickLang, dict, DICTS };
