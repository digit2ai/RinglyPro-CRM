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
    admin_title: 'Operaciones GS', jobs_flight: 'Trabajos en curso', spend: 'Gasto GPU vs créditos', failrate: 'Tasa de fallo',
    rep_eyebrow: 'Escaneo de conformación · Informe 3D',
    rep_hero: 'Tu caballo, en tres dimensiones — gíralo, mídelo, compártelo.',
    rep_sub: 'EquiMind convirtió tu captura en un modelo 3D navegable, a escala, medible desde cualquier teléfono.',
    rep_orbit360: 'Órbita 360°', rep_orbit360_d: 'Míralo desde todos los ángulos, no una foto plana.',
    rep_measure: 'Medidas a escala', rep_measure_d: 'Alzada, largo, aplomos — en cm y manos.',
    rep_compare: 'Compara en el tiempo', rep_compare_d: 'Antes/después de un plan de trabajo o crecimiento.',
    rep_sharelink: 'Comparte un link', rep_sharelink_d: 'Al veterinario o al comprador — sin instalar nada.',
    rep_meas_title: 'Medidas de conformación', rep_meas_from: 'extraídas del análisis',
    rep_find_title: 'Hallazgos · Neural Intelligence', rep_find_n: 'hallazgos',
    rep_deliver: 'Entrega y compartir', rep_copy: 'Copiar enlace', rep_open3d: 'Abrir en 3D',
    rep_copied: 'Copiado', rep_public_note: 'Enlace público de solo lectura — el veterinario o comprador lo abre en su teléfono, sin cuenta.',
    rep_status_ok: 'En estándar', rep_status_watch: 'Vigilar', rep_status_info: 'Referencia',
    rep_grab: 'Arrastra para orbitar · el modelo gira solo',
    rep_disc: 'El modelo 3D es una representación generada a partir de las medidas del análisis — no es un escaneo fotográfico de este animal. Con la GPU de splatting conectada, sería el escaneo real desde tu video. Las medidas y hallazgos provienen del análisis.',
    rep_no_measures: 'Aún no hay medidas para este informe.', rep_no_findings: 'Sin hallazgos registrados.',
    rep_studio: 'Vista del estudio · no se muestra al cliente'
  },
  en: {
    lang: 'en', title: 'EquiMind 3D · Gaussian Splatting Engine',
    h1: 'EquiMind 3D', tagline: '3D capture: course walks and conformation scans.',
    cap_title: '3D Capture', cap_video: 'Course video (.mp4 / .mov)', cap_photos: 'Photo burst',
    cap_kind: 'Type', kind_course: 'Course walk', kind_conf: 'Conformation scan',
    cap_process: 'Process in 3D', cap_hint: 'Film one slow, complete loop around the subject, in good light.',
    scenes_title: 'My 3D scenes', open_viewer: 'View in 3D', share: 'Share', sim_note: 'Reference scene (simulated) — no splatting GPU configured.',
    view_orbit: 'Drag to orbit · pinch to zoom', waypoint_add: 'Add waypoint',
    admin_title: 'GS Ops', jobs_flight: 'Jobs in flight', spend: 'GPU spend vs credits', failrate: 'Failure rate',
    rep_eyebrow: 'Conformation scan · 3D report',
    rep_hero: 'Your horse, in three dimensions — spin it, measure it, share it.',
    rep_sub: 'EquiMind turned your capture into a navigable, to-scale 3D model you can measure from any phone.',
    rep_orbit360: '360° orbit', rep_orbit360_d: 'See it from every angle, not a flat photo.',
    rep_measure: 'Measured to scale', rep_measure_d: 'Height, length, legs — in cm and hands.',
    rep_compare: 'Compare over time', rep_compare_d: 'Before/after a work plan or growth.',
    rep_sharelink: 'Share a link', rep_sharelink_d: 'To the vet or buyer — nothing to install.',
    rep_meas_title: 'Conformation measurements', rep_meas_from: 'extracted from the analysis',
    rep_find_title: 'Findings · Neural Intelligence', rep_find_n: 'findings',
    rep_deliver: 'Deliver & share', rep_copy: 'Copy link', rep_open3d: 'Open in 3D',
    rep_copied: 'Copied', rep_public_note: 'Read-only public link — the vet or buyer opens it on their phone, no account.',
    rep_status_ok: 'In standard', rep_status_watch: 'Watch', rep_status_info: 'Reference',
    rep_grab: 'Drag to orbit · the model spins on its own',
    rep_disc: 'The 3D model is a generated representation built from the analysis measurements — not a photographic scan of this animal. With the splatting GPU connected it would be the real scan from your video. Measurements and findings come from the analysis.',
    rep_no_measures: 'No measurements on this report yet.', rep_no_findings: 'No findings recorded.',
    rep_studio: 'Studio view · not shown to the client'
  }
};

function pickLang(raw) { return String(raw || '').toLowerCase().slice(0, 2) === 'en' ? 'en' : 'es'; }
function dict(lang) { return DICTS[pickLang(lang)] || DICTS.es; }
module.exports = { pickLang, dict, DICTS };
