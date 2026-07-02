// =====================================================
// Analysis store — ai_jump_coach_rider_pose_analyzer_analyses
//
// Sequelize-backed model with a graceful in-memory fallback. The route layer
// only calls init() / create() / findForTenant() / listByTenant() / remove(),
// so if Postgres is unreachable (or AIJUMP_FORCE_MEMORY=1) the same interface
// keeps working — stuck-loop heuristic #4 (sync()/in-memory fallback).
//
// We persist ONLY metadata + the computed faults[]. The raw keypoint frames
// and the video itself are never stored (PII + size): the video lives in the
// browser as an object URL for the side-by-side playback right after upload.
// =====================================================

'use strict';

const { DataTypes } = require('sequelize');
const { getSequelize } = require('./index');

const TABLE = 'ai_jump_coach_rider_pose_analyzer_analyses';

let Model = null;
let usingMemory = false;
const memory = [];
let memSeq = 0;

function defineModel(sequelize) {
  return sequelize.define('JumpAnalysis', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    filename: { type: DataTypes.STRING(255), allowNull: true },
    duration_sec: { type: DataTypes.FLOAT, allowNull: true },
    frame_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    apex_sec: { type: DataTypes.FLOAT, allowNull: true },
    faults: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    lang: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'es' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }]
  });
}

// Bring up Sequelize; on any failure fall back to memory. Never throws.
async function init() {
  if (Model || usingMemory) return { mode: usingMemory ? 'memory' : 'postgres' };
  if (process.env.AIJUMP_FORCE_MEMORY === '1') {
    usingMemory = true;
    return { mode: 'memory' };
  }
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    Model = defineModel(sequelize);
    await Model.sync({ alter: false });
    return { mode: 'postgres' };
  } catch (err) {
    usingMemory = true;
    Model = null;
    console.error(JSON.stringify({ svc: 'ai-jump-coach', event: 'db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

async function create({ tenant_id, filename, duration_sec, frame_count, apex_sec, faults, lang }) {
  const row = {
    tenant_id,
    filename: filename || null,
    duration_sec: duration_sec != null ? Number(duration_sec) : null,
    frame_count: frame_count || 0,
    apex_sec: apex_sec != null ? Number(apex_sec) : null,
    faults: Array.isArray(faults) ? faults : [],
    lang: lang || 'es',
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

// Tenant-scoped read: returns the row ONLY if it belongs to tenant_id, else
// null (the route maps null -> 404, so cross-tenant reads can't leak).
async function findForTenant(id, tenant_id) {
  const pid = parseInt(id, 10);
  if (!Number.isInteger(pid)) return null;
  if (usingMemory || !Model) {
    return memory.find((m) => m.id === pid && m.tenant_id === tenant_id) || null;
  }
  const r = await Model.findOne({ where: { id: pid, tenant_id } });
  return r ? r.get({ plain: true }) : null;
}

// Untenanted read by id — used ONLY by the public magic-link report endpoint,
// which gates access with an HMAC token (not the account). Never expose this
// without that token check.
async function findById(id) {
  const pid = parseInt(id, 10);
  if (!Number.isInteger(pid)) return null;
  if (usingMemory || !Model) return memory.find((m) => m.id === pid) || null;
  const r = await Model.findOne({ where: { id: pid } });
  return r ? r.get({ plain: true }) : null;
}

async function listByTenant(tenant_id) {
  if (usingMemory || !Model) {
    return memory.filter((m) => m.tenant_id === tenant_id).sort((a, b) => b.id - a.id);
  }
  const rows = await Model.findAll({ where: { tenant_id }, order: [['id', 'DESC']], limit: 500 });
  return rows.map((r) => r.get({ plain: true }));
}

// Tenant-scoped delete: returns true only if a row owned by tenant_id was removed.
async function remove(id, tenant_id) {
  const pid = parseInt(id, 10);
  if (!Number.isInteger(pid)) return false;
  if (usingMemory || !Model) {
    const idx = memory.findIndex((m) => m.id === pid && m.tenant_id === tenant_id);
    if (idx === -1) return false;
    memory.splice(idx, 1);
    return true;
  }
  const n = await Model.destroy({ where: { id: pid, tenant_id } });
  return n > 0;
}

function mode() {
  return usingMemory ? 'memory' : (Model ? 'postgres' : 'uninitialized');
}

module.exports = { init, create, findById, findForTenant, listByTenant, remove, mode, TABLE };
