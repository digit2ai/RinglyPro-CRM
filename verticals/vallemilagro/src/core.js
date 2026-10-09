'use strict';
/**
 * Reglas del portal que no son de un agente: fechas de Colombia, foto del día,
 * índices, vistas de proyecto y datos de ejemplo.
 *
 * LOS ÍNDICES SON ARITMÉTICA SOBRE FILAS PUBLICADAS. Ningún modelo participa.
 * Un componente sin dato deja el proyecto SIN puntaje; nunca se rellena.
 */
const { q, one, run } = require('./db');

const STAGES = ['Necesidad', 'Postulación', 'Evaluación', 'Estructuración', 'Articulación', 'Ejecución', 'Cierre e impacto'];
const LAYERS = ['Obras públicas', 'Obras por Impuestos', 'Proyectos privados', 'Reconstrucción Terremoto 2026', 'Necesidades'];
const CATEGORIES = ['Agua', 'Salud', 'Energía', 'Vivienda', 'Educación', 'Vías'];
const SECTORS = ['publico', 'privado', 'oxi'];
const TEMAS = ['Obras por Impuestos', 'Reconstrucción', 'Gobernación', 'Alcaldía', 'Gobierno Nacional', 'Legislativo', 'Economía regional'];
const URGENCY_KEYS = ['u_need', 'u_people', 'u_quake', 'u_time', 'u_viability'];
const URGENCY_LABELS = { u_need: 'Nivel de necesidad', u_people: 'Personas beneficiadas', u_quake: 'Afectación por el sismo', u_time: 'Tiempo sin atender', u_viability: 'Viabilidad Obras por Impuestos' };
const DUES = ['al_dia', 'pendiente', 'sin_registro'];

/* ---- fechas de Colombia ---- */
function bogotaToday(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function dayNumber(iso) { return Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000); }
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s + 'T00:00:00Z'));

/* ---- foto del día: determinista, cambia a medianoche de Colombia ---- */
function pickOfDay(count, iso = bogotaToday()) { return count > 0 ? dayNumber(iso) % count : -1; }
async function photoOfDay(tenantId, iso = bogotaToday()) {
  const photos = await q('SELECT id, file_id, caption FROM vm_home_photos WHERE tenant_id = :t AND active = TRUE ORDER BY position, id', { t: tenantId });
  const i = pickOfDay(photos.length, iso);
  return { photo: i < 0 ? null : photos[i], count: photos.length, gradient: (dayNumber(iso) % 4) + 1 };
}

/* ---- textos editables ---- */
const TEXT_DEFAULTS = {
  bienvenida: 'Bienvenido',
  ciudad: 'Cali, Colombia',
  lema: 'No manejamos dinero. Conectamos a quien sí.',
  pie: 'Cali, Valle del Cauca',
  nota_fiduciaria: 'No manejamos dinero. Los recursos los administra la fiduciaria aliada.',
  interes_registrado: 'Registramos tu interés. El equipo de la Asociación te contactará.',
  postulacion_enviada: 'Tu postulación quedó en revisión.',
  aviso_fotos: 'Aviso: no subas fotos donde se identifiquen menores de edad.',
  privacidad: 'La Asociación Valle Milagro es responsable del tratamiento de tus datos personales. Guardamos tu nombre, tu apellido y tu correo electrónico para crear y administrar tu cuenta en el Portal de Miembros. No vendemos ni compartimos tus datos. Puedes corregir tu nombre o pedir la eliminación de tu cuenta desde Mi perfil. Este aviso se rige por la Ley 1581 de 2012. Texto provisional: pendiente de validación por el abogado de la Asociación.'
};
async function texts(tenantId) {
  const rows = await q('SELECT key, value FROM vm_texts WHERE tenant_id = :t', { t: tenantId });
  const out = { ...TEXT_DEFAULTS };
  rows.forEach((r) => { if (r.key in TEXT_DEFAULTS) out[r.key] = r.value; });
  return out;
}
async function setText(tenantId, key, value, by) {
  await run(`INSERT INTO vm_texts (tenant_id, key, value, updated_by) VALUES (:t, :k, :v, :b)
             ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    { t: tenantId, k: key, v: value, b: by || null });
}

/* ---- Índice de Urgencia ---- */
const EQUAL = { u_need: 0.2, u_people: 0.2, u_quake: 0.2, u_time: 0.2, u_viability: 0.2 };
function validWeights(w) {
  if (!w || typeof w !== 'object') return false;
  let sum = 0;
  for (const k of URGENCY_KEYS) { const v = Number(w[k]); if (!isFinite(v) || v < 0 || v > 1) return false; sum += v; }
  return Math.abs(sum - 1) < 0.0005;
}
async function weights(tenantId) {
  const row = await one("SELECT value FROM vm_texts WHERE tenant_id = :t AND key = 'urgency_weights'", { t: tenantId });
  if (row) { try { const w = JSON.parse(row.value); if (validWeights(w)) return w; } catch (e) { /* cae a iguales */ } }
  return { ...EQUAL };
}
/** Devuelve null si falta CUALQUIER componente: un vacío no se rellena. */
function urgency(row, w = EQUAL) {
  let total = 0;
  const parts = [];
  for (const k of URGENCY_KEYS) {
    const v = row[k];
    if (v == null || !isFinite(Number(v))) return null;
    const n = Math.max(0, Math.min(100, Number(v)));
    total += n * w[k];
    parts.push({ key: k, label: URGENCY_LABELS[k], value: n, weight: w[k] });
  }
  return { score: Math.round(total), parts };
}

/* ---- vistas ---- */
function projectView(r) {
  const out = {
    id: r.id, name: r.name, municipio: r.municipio, entity: r.entity, sector: r.sector, layer: r.layer, category: r.category,
    stage: r.stage, stage_name: STAGES[r.stage] || null, progress_pct: r.progress_pct, delivery_date: r.delivery_date,
    lat: r.lat, lng: r.lng, updated_at: r.updated_at, is_demo: !!r.is_demo
  };
  if (r.sector === 'oxi') {
    out.oxi = { contributors_count: r.contributors_count, fiduciary: r.fiduciary,
      quota_committed_cop: r.quota_committed_cop == null ? null : Number(r.quota_committed_cop),
      work_value_cop: r.work_value_cop == null ? null : Number(r.work_value_cop) };
  }
  return out;
}

/** SOLO lo publicado. Toda lectura del portal pasa por aquí. */
async function publishedProjects(tenantId) {
  return q("SELECT * FROM vm_projects WHERE tenant_id = :t AND status = 'published' ORDER BY id", { t: tenantId });
}

async function home(tenantId, member) {
  const [projects, w, tx, pod] = await Promise.all([publishedProjects(tenantId), weights(tenantId), texts(tenantId), photoOfDay(tenantId)]);
  const today = bogotaToday();
  const edition = await one(`SELECT edition_date, headline, today_line, is_demo FROM vm_editions
    WHERE tenant_id = :t AND status = 'published' ORDER BY edition_date DESC LIMIT 1`, { t: tenantId });

  // Cifras: conteos de filas. Ninguna se escribe a mano.
  const active = projects.filter((p) => p.stage < 6);
  const municipios = new Set(projects.map((p) => p.municipio));
  const empresas = projects.reduce((s, p) => s + (p.sector === 'oxi' && p.contributors_count ? Number(p.contributors_count) : 0), 0);

  // Milagros en convocatoria: Obras por Impuestos con cupo por debajo del valor.
  const convocatoria = projects.filter((p) => p.sector === 'oxi' && p.work_value_cop != null && p.quota_committed_cop != null
    && Number(p.quota_committed_cop) < Number(p.work_value_cop)).map(projectView);

  // Índice de Progreso: promedio del avance por categoría. Sin proyectos, no se dibuja.
  const byCat = {};
  projects.forEach((p) => { if (p.category && p.progress_pct != null && p.layer !== 'Necesidades') (byCat[p.category] = byCat[p.category] || []).push(Number(p.progress_pct)); });
  const progress = CATEGORIES.filter((c) => byCat[c]).map((c) => ({ category: c, value: Math.round(byCat[c].reduce((a, b) => a + b, 0) / byCat[c].length), projects: byCat[c].length }));

  // Lo más urgente: solo proyectos con los cinco componentes.
  const urgent = projects.map((p) => { const u = urgency(p, w); return u ? { id: p.id, name: p.name, municipio: p.municipio, score: u.score, parts: u.parts, is_demo: !!p.is_demo } : null; })
    .filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 8);

  const mine = await q(`SELECT DISTINCT p.* FROM vm_projects p
    WHERE p.tenant_id = :t AND p.status = 'published' AND (
      EXISTS (SELECT 1 FROM vm_follows f WHERE f.tenant_id = p.tenant_id AND f.project_id = p.id AND f.member_id = :m) OR
      EXISTS (SELECT 1 FROM vm_interests i WHERE i.tenant_id = p.tenant_id AND i.project_id = p.id AND i.member_id = :m))
    ORDER BY p.id`, { t: tenantId, m: member.id });

  return {
    member: { first_name: member.first_name, code: member.code },
    today, city: tx.ciudad,
    photo: pod.photo ? { url: 'files/' + pod.photo.file_id, caption: pod.photo.caption } : null, gradient: pod.gradient,
    edition: edition ? { date: edition.edition_date, headline: edition.headline, today_line: edition.today_line, is_demo: !!edition.is_demo } : null,
    figures: projects.length ? { active_projects: active.length, companies: empresas, municipios: municipios.size } : null,
    convocatoria, progress, urgent, mine: mine.map(projectView),
    has_demo: projects.some((p) => p.is_demo) || !!(edition && edition.is_demo),
    weights: w
  };
}

/* ---- datos de ejemplo: los del prototipo, marcados is_demo ---- */
const MM = 1000000000;
const DEMO_PROJECTS = [
  ['Acueducto veredal La Buitrera', 'Cali', 'Alcaldía de Cali', 'oxi', 'Obras por Impuestos', 'Agua', 4, 58, '2027-03-15', 3.37, -76.58, 4, 'Fiduciaria Aliada S.A.', 2.1 * MM, 3.4 * MM],
  ['Puesto de salud El Queremal', 'Dagua', 'Gobernación del Valle', 'oxi', 'Obras por Impuestos', 'Salud', 3, 35, '2027-06-30', 3.55, -76.75, 2, 'Fiduciaria Aliada S.A.', 0.9 * MM, 2.6 * MM],
  ['Paneles solares escuela rural Tenjo', 'Pradera', 'Secretaría de Educación', 'oxi', 'Obras por Impuestos', 'Energía', 4, 46, '2027-02-20', 3.42, -76.24, 3, 'Fiduciaria Aliada S.A.', 0.7 * MM, 1.2 * MM],
  ['Reconstrucción colegio Tulio Enrique Tascón', 'Guadalajara de Buga', 'Gobierno Nacional', 'publico', 'Reconstrucción Terremoto 2026', 'Educación', 5, 72, '2026-12-10', 3.9, -76.3],
  ['Pavimentación vía Tuluá – Barragán', 'Tuluá', 'INVÍAS', 'publico', 'Obras públicas', 'Vías', 5, 64, '2027-04-01', 4.08, -76.1],
  ['Viviendas reforzadas barrio El Retiro', 'Palmira', 'Fundación privada aliada', 'privado', 'Proyectos privados', 'Vivienda', 2, 22, '2027-08-15', 3.53, -76.3],
  ['Biblioteca comunitaria Puerto', 'Buenaventura', 'Empresa portuaria', 'privado', 'Proyectos privados', null, 6, 95, '2026-10-20', 3.88, -77.03],
  ['Planta de agua potable Cartago norte', 'Cartago', 'Acuavalle', 'publico', 'Necesidades', 'Agua', 1, 10, null, 4.75, -75.91]
];
// Necesidades con los cinco componentes del prototipo. Sin coordenadas: no se inventa un punto.
const DEMO_NEEDS = [
  ['Colegio afectado por el sismo', 'Guadalajara de Buga', 'Educación', [95, 88, 100, 70, 85]],
  ['Puesto de salud sin agua', 'Dagua', 'Salud', [90, 70, 40, 95, 80]],
  ['Puente peatonal veredal', 'El Cairo', 'Vías', [55, 30, 10, 80, 50]]
];
const DEMO_NEWS = [
  ['Obras por Impuestos', 'Aprueban tres nuevos proyectos para municipios del Valle', 'La agencia nacional habilitó tres iniciativas de agua y educación que podrán financiarse con este mecanismo.', 'Medio regional de ejemplo'],
  ['Reconstrucción', 'Buga recibe el segundo frente de obra en colegios', 'Las obras de reforzamiento estructural avanzan en dos instituciones afectadas.', 'Diario de ejemplo'],
  ['Gobernación', 'Balance de la temporada de lluvias', 'Se priorizan vías terciarias en el norte del departamento.', 'Emisora de ejemplo'],
  ['Alcaldía', 'Cali anuncia plan de acueductos veredales', 'La alcaldía busca alianzas para llevar agua potable a la zona rural de ladera.', 'Portal de ejemplo'],
  ['Gobierno Nacional', 'Nuevo decreto sobre cupos tributarios', 'Se amplía el cupo disponible para proyectos en zonas afectadas.', 'Medio nacional de ejemplo'],
  ['Legislativo', 'Proyecto de ley de reconstrucción pasa a segundo debate', 'La iniciativa incluye incentivos para la participación privada.', 'Diario de ejemplo'],
  ['Economía regional', 'Exportaciones del Valle crecen en el tercer trimestre', 'El sector agroindustrial lidera el crecimiento.', 'Revista de ejemplo']
];

async function seedDemo(tenantId) {
  const any = await one('SELECT id FROM vm_projects WHERE tenant_id = :t LIMIT 1', { t: tenantId });
  if (any) return { seeded: false };
  for (const p of DEMO_PROJECTS) {
    const cartago = p[0].startsWith('Planta de agua');
    await run(`INSERT INTO vm_projects (tenant_id, name, municipio, entity, sector, layer, category, stage, progress_pct, delivery_date, lat, lng,
        contributors_count, fiduciary, quota_committed_cop, work_value_cop, u_need, u_people, u_quake, u_time, u_viability, status, origin, is_demo)
      VALUES (:t, :n, :m, :e, :s, :l, :c, :st, :pr, :dd, :lat, :lng, :cc, :f, :qc, :wv, :u1, :u2, :u3, :u4, :u5, 'published', 'demo', TRUE)`,
      { t: tenantId, n: p[0], m: p[1], e: p[2], s: p[3], l: p[4], c: p[5], st: p[6], pr: p[7], dd: p[8], lat: p[9], lng: p[10],
        cc: p[11] || null, f: p[12] || null, qc: p[13] || null, wv: p[14] || null,
        u1: cartago ? 80 : null, u2: cartago ? 85 : null, u3: cartago ? 20 : null, u4: cartago ? 75 : null, u5: cartago ? 60 : null });
  }
  for (const n of DEMO_NEEDS) {
    await run(`INSERT INTO vm_projects (tenant_id, name, municipio, sector, layer, category, stage, u_need, u_people, u_quake, u_time, u_viability, status, origin, is_demo)
      VALUES (:t, :n, :m, 'publico', 'Necesidades', :c, 0, :u1, :u2, :u3, :u4, :u5, 'published', 'demo', TRUE)`,
      { t: tenantId, n: n[0], m: n[1], c: n[2], u1: n[3][0], u2: n[3][1], u3: n[3][2], u4: n[3][3], u5: n[3][4] });
  }
  const today = bogotaToday();
  await run(`INSERT INTO vm_editions (tenant_id, edition_date, headline, summary, today_line, status, composed_by, is_demo, published_at)
    VALUES (:t, :d, :h, :s, :y, 'published', 'demo', TRUE, NOW()) ON CONFLICT (tenant_id, edition_date) DO NOTHING`,
    { t: tenantId, d: today,
      h: 'Avanza la reconstrucción en el centro del Valle mientras crece la apuesta privada por Obras por Impuestos',
      s: 'Jornada marcada por nuevas aprobaciones de proyectos de Obras por Impuestos en el Valle, el avance de la reconstrucción en Buga y Tuluá, y debates sobre presupuesto regional en la Asamblea.',
      y: 'Hoy: la Gobernación presenta el balance de reconstrucción del Terremoto 2026 a las 10:00 a. m.' });
  for (const n of DEMO_NEWS) {
    await run(`INSERT INTO vm_findings (tenant_id, type, tema, title, summary, medio, published_on, source_url, url_seen, status, edition_date, is_demo, approved_at)
      VALUES (:t, 'noticia', :tema, :ti, :su, :me, :d, 'https://example.com', FALSE, 'approved', :d, TRUE, NOW())`,
      { t: tenantId, tema: n[0], ti: n[1], su: n[2], me: n[3], d: today });
  }
  return { seeded: true };
}

module.exports = { STAGES, LAYERS, CATEGORIES, SECTORS, TEMAS, URGENCY_KEYS, URGENCY_LABELS, DUES, TEXT_DEFAULTS,
  bogotaToday, dayNumber, isDate, pickOfDay, photoOfDay, texts, setText, weights, validWeights, urgency, projectView,
  publishedProjects, home, seedDemo };
