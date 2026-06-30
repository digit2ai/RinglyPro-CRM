// =====================================================
// Evaluation store — evaluacion_del_caballo_de_paso_fino_evaluations
//
// Owns the shared data-layer bootstrap (init) for BOTH this model and the horse
// model: one Sequelize authenticate() + sync() brings up both tables, and on any
// failure (or ECPF_FORCE_MEMORY=1) both fall back to in-memory behind the same
// interface — stuck-loop heuristic: the sprint is never blocked by the DB.
//
// We persist ONLY gait metrics + the verdict — never the raw audio bytes and
// never the uploaded filename (it could contain an owner's name). The route
// layer logs a generated evaluation id instead (Ley 1581 / PII discipline).
//
// Columns: id, tenant_id, horse_id, cadence_bpm, regularity_cv, verdict,
//          recommendation, beat_count, created_at.
// =====================================================

'use strict';

const { DataTypes } = require('sequelize');
const { getSequelize } = require('./index');
const horse = require('./horse');

const TABLE = 'evaluacion_del_caballo_de_paso_fino_evaluations';

let Model = null;
let usingMemory = false;
let started = false;
const memory = [];
let memSeq = 0;

function define(sequelize) {
  return sequelize.define('ECPFEvaluation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    horse_id: { type: DataTypes.INTEGER, allowNull: false },
    cadence_bpm: { type: DataTypes.FLOAT, allowNull: true },
    regularity_cv: { type: DataTypes.FLOAT, allowNull: true },
    verdict: { type: DataTypes.STRING(40), allowNull: false },
    recommendation: { type: DataTypes.TEXT, allowNull: true },
    beat_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }, { fields: ['horse_id'] }]
  });
}

// Bring up Sequelize for BOTH models; on any failure fall back to memory.
// Never throws — the caller (index.js) does not await this on the hot path.
async function init() {
  if (started) return { mode: usingMemory ? 'memory' : 'postgres' };
  started = true;
  if (process.env.ECPF_FORCE_MEMORY === '1') {
    usingMemory = true;
    horse.bind(null);
    return { mode: 'memory' };
  }
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    Model = define(sequelize);
    horse.bind(sequelize);
    await Model.sync({ alter: false });
    await horse.syncModel();
    return { mode: 'postgres' };
  } catch (err) {
    usingMemory = true;
    Model = null;
    horse.bind(null);
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

async function create({ tenant_id, horse_id, cadence_bpm, regularity_cv, verdict, recommendation, beat_count }) {
  const row = {
    tenant_id,
    horse_id: parseInt(horse_id, 10),
    cadence_bpm: cadence_bpm != null ? Number(cadence_bpm) : null,
    regularity_cv: regularity_cv != null ? Number(regularity_cv) : null,
    verdict,
    recommendation: recommendation || null,
    beat_count: beat_count || 0,
    created_at: new Date()
  };
  if (usingMemory || !Model) {
    const created = Object.assign({ id: ++memSeq }, row);
    memory.push(created);
    return created;
  }
  const created = await Model.create(row);
  return created.get({ plain: true });
}

// History for one horse, newest first, scoped by tenant_id (acceptance #7).
async function listByHorse(horse_id, tenant_id) {
  const hid = parseInt(horse_id, 10);
  if (!Number.isInteger(hid)) return [];
  if (usingMemory || !Model) {
    return memory
      .filter((m) => m.horse_id === hid && m.tenant_id === tenant_id)
      .sort((a, b) => b.id - a.id);
  }
  const rows = await Model.findAll({
    where: { horse_id: hid, tenant_id },
    order: [['id', 'DESC']],
    limit: 500
  });
  return rows.map((r) => r.get({ plain: true }));
}

async function listByTenant(tenant_id) {
  if (usingMemory || !Model) {
    return memory.filter((m) => m.tenant_id === tenant_id).sort((a, b) => b.id - a.id);
  }
  const rows = await Model.findAll({ where: { tenant_id }, order: [['id', 'DESC']], limit: 500 });
  return rows.map((r) => r.get({ plain: true }));
}

function mode() {
  return usingMemory ? 'memory' : (Model ? 'postgres' : 'uninitialized');
}

module.exports = { TABLE, init, create, listByHorse, listByTenant, mode };
