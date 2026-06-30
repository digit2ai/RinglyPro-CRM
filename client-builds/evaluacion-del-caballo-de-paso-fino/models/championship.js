// =====================================================
// Championship store — todas las tablas del "juez de campeonato".
//
// DECISIÓN DE ARQUITECTURA: el esquema del brief usa nombres genéricos
// (eventos, categorias, resultados, inscripciones…) que colisionarían en el
// Postgres COMPARTIDO de RinglyPro. Por eso TODAS las tablas y enums se
// prefijan `ecpf_` (Evaluación Caballo Paso Fino). El esquema lógico es idéntico
// al de la sección 6 del brief; solo cambia el namespace. La migración
// versionada (migrations/002_championship.sql) es la fuente de verdad.
//
// Patrón igual que models/evaluation.js: Sequelize contra DATABASE_URL con
// FALLBACK EN MEMORIA (ECPF_FORCE_MEMORY=1 o BD inalcanzable) detrás de la misma
// interfaz, para que el SIT y la demo nunca se bloqueen.
//
// VOLUMEN: pose_keypoints crece rápido (~30 fps × 22 puntos). Para el MVP solo
// persistimos los 4 puntos casco_* (los que detectan pisada) y dejamos la
// partición por sesion_id documentada como trabajo futuro (sección 7 del brief).
// =====================================================

'use strict';

const { DataTypes } = require('sequelize');
const { getSequelize } = require('./index');
const { PUNTOS } = require('../lib/anatomy');
const { CRITERIOS_PASO_FINO } = require('../lib/scoring');
const { DEFAULT_MODEL } = require('../lib/thresholds');

const P = 'ecpf_'; // prefijo de tabla
let usingMemory = false;
let started = false;
const M = {}; // modelos Sequelize por nombre lógico
const mem = {}; // arrays en memoria por nombre lógico
const seqn = {}; // contadores autoincrement en memoria

const TABLES = {
  propietarios: {
    table: P + 'propietarios',
    attrs: { nombre: T(DataTypes.STRING(150), false), documento: DataTypes.STRING(50), telefono: DataTypes.STRING(40), email: DataTypes.STRING(150), tenant_id: T(DataTypes.INTEGER, false, 1) }
  },
  caballos: {
    table: P + 'caballos',
    attrs: { nombre: T(DataTypes.STRING(150), false), registro_fedequinas: DataTypes.STRING(60), microchip: DataTypes.STRING(60), fecha_nacimiento: DataTypes.DATEONLY, sexo: DataTypes.STRING(12), capa: DataTypes.STRING(60), criadero: DataTypes.STRING(150), propietario_id: DataTypes.BIGINT, tenant_id: T(DataTypes.INTEGER, false, 1) }
  },
  eventos: {
    table: P + 'eventos',
    attrs: { nombre: T(DataTypes.STRING(200), false), grado: DataTypes.STRING(2), anio: DataTypes.INTEGER, sede: DataTypes.STRING(150), fecha_inicio: DataTypes.DATEONLY, fecha_fin: DataTypes.DATEONLY, ente_organizador: DataTypes.STRING(150), tenant_id: T(DataTypes.INTEGER, false, 1) }
  },
  categorias: {
    table: P + 'categorias',
    attrs: { evento_id: T(DataTypes.BIGINT, false), nombre: T(DataTypes.STRING(150), false), modalidad: T(DataTypes.STRING(20), false), edad_min_meses: DataTypes.INTEGER, edad_max_meses: DataTypes.INTEGER, sexo_permitido: DataTypes.STRING(12), tenant_id: T(DataTypes.INTEGER, false, 1) }
  },
  inscripciones: {
    table: P + 'inscripciones',
    attrs: { caballo_id: T(DataTypes.BIGINT, false), categoria_id: T(DataTypes.BIGINT, false), numero_competidor: DataTypes.INTEGER, jinete: DataTypes.STRING(150), tenant_id: T(DataTypes.INTEGER, false, 1) }
  },
  sesiones: {
    table: P + 'sesiones_evaluacion',
    attrs: {
      inscripcion_id: T(DataTypes.BIGINT, false), fecha_hora_inicio: DataTypes.DATE, fecha_hora_fin: DataTypes.DATE,
      duracion_seg: DataTypes.FLOAT, superficie: T(DataTypes.STRING(20), false), video_raw_url: DataTypes.TEXT,
      fps: DataTypes.FLOAT, resolucion: DataTypes.STRING(20), modelo_pose: DataTypes.STRING(80),
      audio_raw_url: DataTypes.TEXT, audio_sample_rate_hz: DataTypes.INTEGER, audio_canales: DataTypes.SMALLINT,
      audio_formato: DataTypes.STRING(20), dispositivo_id: DataTypes.STRING(80), condiciones_ambientales: DataTypes.TEXT,
      tenant_id: T(DataTypes.INTEGER, false, 1)
    }
  },
  puntos: {
    table: P + 'puntos_anatomicos',
    attrs: { codigo: T(DataTypes.STRING(40), false), nombre: T(DataTypes.STRING(80), false), region: DataTypes.STRING(40) }
  },
  frames: {
    table: P + 'frames_video',
    attrs: { sesion_id: T(DataTypes.BIGINT, false), numero_frame: T(DataTypes.INTEGER, false), timestamp_ms: T(DataTypes.INTEGER, false) }
  },
  keypoints: {
    table: P + 'pose_keypoints',
    attrs: { frame_id: T(DataTypes.BIGINT, false), punto_id: T(DataTypes.SMALLINT, false), x: DataTypes.FLOAT, y: DataTypes.FLOAT, z: DataTypes.FLOAT, confianza: DataTypes.FLOAT, visible: T(DataTypes.BOOLEAN, true, true) }
  },
  pisadas: {
    table: P + 'pisadas',
    attrs: { sesion_id: T(DataTypes.BIGINT, false), timestamp_ms: T(DataTypes.INTEGER, false), extremidad: DataTypes.STRING(12), orden_secuencia: DataTypes.SMALLINT, intervalo_anterior_ms: DataTypes.INTEGER, intensidad_db: DataTypes.FLOAT, duracion_contacto_ms: DataTypes.INTEGER, detectada_por_video: T(DataTypes.BOOLEAN, true, true), detectada_por_audio: T(DataTypes.BOOLEAN, true, false), confianza: DataTypes.FLOAT }
  },
  metricas_mov: {
    table: P + 'metricas_movimiento',
    attrs: { sesion_id: T(DataTypes.BIGINT, false), cadencia_ppm: DataTypes.FLOAT, regularidad_ritmo: DataTypes.FLOAT, simetria_lateral: DataTypes.FLOAT, uniformidad_4_tiempos: DataTypes.FLOAT, coef_variacion_intervalos: DataTypes.FLOAT, elevacion_anterior: DataTypes.FLOAT, elevacion_posterior: DataTypes.FLOAT, longitud_paso: DataTypes.FLOAT, velocidad_promedio: DataTypes.FLOAT }
  },
  metricas_son: {
    table: P + 'metricas_sonido',
    attrs: { sesion_id: T(DataTypes.BIGINT, false), intervalo_promedio_ms: DataTypes.FLOAT, desviacion_intervalos_ms: DataTypes.FLOAT, claridad_4_tiempos: DataTypes.FLOAT, nivel_db_promedio: DataTypes.FLOAT, frecuencia_dominante_hz: DataTypes.FLOAT, relacion_senal_ruido: DataTypes.FLOAT }
  },
  modelos: {
    table: P + 'modelos_clasificacion',
    attrs: { version: T(DataTypes.STRING(40), false), modalidad: DataTypes.STRING(20), umbrales_json: DataTypes.JSONB, fecha_entrenamiento: DataTypes.DATEONLY, activo: T(DataTypes.BOOLEAN, true, false) }
  },
  clasificaciones: {
    table: P + 'clasificaciones',
    attrs: { sesion_id: T(DataTypes.BIGINT, false), modalidad_detectada: DataTypes.STRING(20), confianza: DataTypes.FLOAT, modelo_id: DataTypes.BIGINT, es_modalidad_valida: DataTypes.BOOLEAN }
  },
  criterios: {
    table: P + 'criterios_evaluacion',
    attrs: { nombre: T(DataTypes.STRING(80), false), modalidad: DataTypes.STRING(20), peso_porcentaje: DataTypes.FLOAT, formula: DataTypes.TEXT }
  },
  puntuaciones: {
    table: P + 'puntuaciones',
    attrs: { sesion_id: T(DataTypes.BIGINT, false), criterio_id: T(DataTypes.BIGINT, false), valor_medido: DataTypes.FLOAT, puntaje_normalizado: DataTypes.FLOAT }
  },
  resultados: {
    table: P + 'resultados',
    attrs: { inscripcion_id: T(DataTypes.BIGINT, false), puntaje_total: DataTypes.FLOAT, ranking: DataTypes.INTEGER, observaciones: DataTypes.TEXT, tenant_id: T(DataTypes.INTEGER, false, 1) }
  },
  // Neural Intelligence: hallazgos (findings) que vigilan cada sesión/categoría.
  findings: {
    table: P + 'neural_findings',
    attrs: {
      sesion_id: DataTypes.BIGINT, inscripcion_id: DataTypes.BIGINT, categoria_id: DataTypes.BIGINT,
      code: T(DataTypes.STRING(40), false), category: DataTypes.STRING(30), scope: DataTypes.STRING(20),
      title: T(DataTypes.STRING(255), false), summary: DataTypes.TEXT, evidence: DataTypes.JSONB,
      impact: T(DataTypes.STRING(20), true, 'info'), impact_estimate: DataTypes.TEXT,
      recommended_action: DataTypes.TEXT, workflow: DataTypes.STRING(40),
      status: T(DataTypes.STRING(20), true, 'active'), tenant_id: T(DataTypes.INTEGER, false, 1)
    }
  }
};

function T(type, allowNull, def) {
  const a = { type };
  if (allowNull === false) a.allowNull = false;
  if (def !== undefined) a.defaultValue = def;
  return a;
}

// ---- Generic repo (memory OR sequelize), equality filters only -------------
function memMatch(row, where) {
  return Object.keys(where || {}).every((k) => row[k] === where[k]);
}
const repo = {
  async create(name, obj) {
    if (usingMemory) {
      const row = Object.assign({ id: ++seqn[name], created_at: new Date() }, obj);
      mem[name].push(row);
      return row;
    }
    const row = await M[name].create(obj);
    return row.get({ plain: true });
  },
  async bulk(name, objs) {
    if (!objs || !objs.length) return [];
    if (usingMemory) return objs.map((o) => { const r = Object.assign({ id: ++seqn[name], created_at: new Date() }, o); mem[name].push(r); return r; });
    const rows = await M[name].bulkCreate(objs, { returning: true });
    return rows.map((r) => r.get({ plain: true }));
  },
  async find(name, where) {
    if (usingMemory) return mem[name].find((r) => memMatch(r, where)) || null;
    const r = await M[name].findOne({ where });
    return r ? r.get({ plain: true }) : null;
  },
  async findAll(name, where, order) {
    if (usingMemory) {
      let rows = mem[name].filter((r) => memMatch(r, where || {}));
      if (order) rows = rows.slice().sort((a, b) => (order[1] === 'DESC' ? b[order[0]] - a[order[0]] : a[order[0]] - b[order[0]]));
      return rows;
    }
    const opt = { where: where || {} };
    if (order) opt.order = [order];
    const rows = await M[name].findAll(opt);
    return rows.map((r) => r.get({ plain: true }));
  },
  async update(name, where, patch) {
    if (usingMemory) { mem[name].filter((r) => memMatch(r, where)).forEach((r) => Object.assign(r, patch)); return; }
    await M[name].update(patch, { where });
  }
};

// ---- init + seed -----------------------------------------------------------
async function init() {
  if (started) return { mode: usingMemory ? 'memory' : 'postgres' };
  started = true;
  Object.keys(TABLES).forEach((n) => { mem[n] = []; seqn[n] = 0; });

  if (process.env.ECPF_FORCE_MEMORY === '1') { usingMemory = true; await seed(); return { mode: 'memory' }; }
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    for (const n of Object.keys(TABLES)) {
      M[n] = sequelize.define('ECPF_' + n, TABLES[n].attrs, { tableName: TABLES[n].table, timestamps: false });
    }
    for (const n of Object.keys(TABLES)) await M[n].sync({ alter: false });
    await seed();
    return { mode: 'postgres' };
  } catch (err) {
    usingMemory = true;
    Object.keys(TABLES).forEach((n) => { delete M[n]; });
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'champ_db_fallback_memory', error: err.message }));
    await seed();
    return { mode: 'memory' };
  }
}

let seeded = false;
async function seed() {
  if (seeded) return;
  seeded = true;
  // puntos anatómicos
  const existPuntos = await repo.findAll('puntos', {});
  if (!existPuntos.length) {
    await repo.bulk('puntos', PUNTOS.map((p) => ({ codigo: p.codigo, nombre: p.nombre, region: p.region })));
  }
  // modelo activo
  const existModel = await repo.find('modelos', { version: DEFAULT_MODEL.version });
  if (!existModel) {
    await repo.create('modelos', { version: DEFAULT_MODEL.version, modalidad: null, umbrales_json: DEFAULT_MODEL.umbrales, activo: true });
  }
  // criterios paso fino
  const existCrit = await repo.findAll('criterios', { modalidad: 'paso_fino' });
  if (!existCrit.length) {
    await repo.bulk('criterios', CRITERIOS_PASO_FINO.map((c) => ({ nombre: c.nombre, modalidad: c.modalidad, peso_porcentaje: c.peso_porcentaje, formula: c.formula })));
  }
}

function mode() { return usingMemory ? 'memory' : (Object.keys(M).length ? 'postgres' : 'uninitialized'); }

module.exports = { init, mode, repo, TABLES, puntoIdByCodigo };

// Resolve a punto_id by its codigo (for keypoint persistence).
async function puntoIdByCodigo() {
  const rows = await repo.findAll('puntos', {});
  const map = {};
  rows.forEach((r) => { map[r.codigo] = r.id; });
  return map;
}
