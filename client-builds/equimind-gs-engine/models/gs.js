// =====================================================
// GS data layer — gs_sessions, gs_jobs, gs_scenes, gs_assets.
// Sequelize against Postgres with an in-memory FALLBACK (GS_FORCE_MEMORY=1 or DB
// unreachable) behind one generic repo, mirroring the EquiMind championship model
// so the SIT and demos never block. All rows tenant-scoped.
// =====================================================
'use strict';

const { DataTypes } = require('sequelize');
const { getSequelize } = require('./index');

let sequelize = null;
let M = {};
let usingMemory = false;
let started = false;
const mem = {};
const seqn = {};

function T(type, allowNull, def) {
  const a = { type };
  if (allowNull === false) a.allowNull = false;
  if (def !== undefined) a.defaultValue = def;
  return a;
}

const TABLES = {
  sessions: {
    table: 'gs_sessions',
    attrs: {
      tenant_id: T(DataTypes.INTEGER, false), kind: T(DataTypes.STRING(24), true, 'course_walk'),
      source_type: T(DataTypes.STRING(16), true, 'video'), status: T(DataTypes.STRING(20), true, 'created'),
      title: DataTypes.STRING(180), horse_id: DataTypes.BIGINT,
      frame_count: T(DataTypes.INTEGER, true, 0), source_bytes: T(DataTypes.BIGINT, true, 0),
      source_seconds: T(DataTypes.DECIMAL(8, 2), true, 0), meta: DataTypes.JSONB
    }
  },
  jobs: {
    table: 'gs_jobs',
    attrs: {
      tenant_id: T(DataTypes.INTEGER, false), session_id: T(DataTypes.BIGINT, false),
      provider: T(DataTypes.STRING(24), true, 'mock'), status: T(DataTypes.STRING(20), true, 'queued'),
      attempts: T(DataTypes.INTEGER, true, 0), credits_charged: T(DataTypes.DECIMAL(10, 2), true, 0),
      credits_refunded: T(DataTypes.DECIMAL(10, 2), true, 0), error: DataTypes.TEXT,
      external_id: DataTypes.STRING(120), started_at: DataTypes.DATE, finished_at: DataTypes.DATE
    }
  },
  scenes: {
    table: 'gs_scenes',
    attrs: {
      tenant_id: T(DataTypes.INTEGER, false), session_id: T(DataTypes.BIGINT, false), job_id: DataTypes.BIGINT,
      kind: T(DataTypes.STRING(24), true, 'course_walk'), title: DataTypes.STRING(180),
      status: T(DataTypes.STRING(20), true, 'ready'), splat_count: T(DataTypes.BIGINT, true, 0),
      storage_bytes: T(DataTypes.BIGINT, true, 0), share_token: DataTypes.STRING(40),
      waypoints: DataTypes.JSONB, is_simulated: T(DataTypes.BOOLEAN, true, false), last_viewed_at: DataTypes.DATE
    }
  },
  assets: {
    table: 'gs_assets',
    attrs: {
      tenant_id: T(DataTypes.INTEGER, false), scene_id: T(DataTypes.BIGINT, false),
      role: T(DataTypes.STRING(16), false), storage: T(DataTypes.STRING(10), true, 'disk'),
      bucket: DataTypes.STRING(120), object_key: T(DataTypes.TEXT, false),
      content_type: DataTypes.STRING(80), bytes: T(DataTypes.BIGINT, true, 0)
    }
  }
};

function memMatch(row, where) { return Object.keys(where || {}).every((k) => String(row[k]) === String(where[k])); }

const repo = {
  async create(name, obj) {
    if (usingMemory) { const row = Object.assign({ id: ++seqn[name], created_at: new Date(), updated_at: new Date() }, obj); mem[name].push(row); return row; }
    const row = await M[name].create(obj); return row.get({ plain: true });
  },
  async find(name, where) {
    if (usingMemory) return mem[name].find((r) => memMatch(r, where)) || null;
    const r = await M[name].findOne({ where }); return r ? r.get({ plain: true }) : null;
  },
  async findAll(name, where, order) {
    if (usingMemory) {
      let rows = mem[name].filter((r) => memMatch(r, where || {}));
      if (order) rows = rows.slice().sort((a, b) => (order[1] === 'DESC' ? b[order[0]] - a[order[0]] : a[order[0]] - b[order[0]]));
      return rows;
    }
    const opt = { where: where || {} }; if (order) opt.order = [order];
    return (await M[name].findAll(opt)).map((r) => r.get({ plain: true }));
  },
  async update(name, where, patch) {
    if (usingMemory) { mem[name].filter((r) => memMatch(r, where)).forEach((r) => Object.assign(r, patch, { updated_at: new Date() })); return; }
    await M[name].update(patch, { where });
  },
  async remove(name, where) {
    if (usingMemory) { mem[name] = mem[name].filter((r) => !memMatch(r, where)); return; }
    await M[name].destroy({ where });
  }
};

async function init() {
  if (started) return { mode: usingMemory ? 'memory' : 'postgres' };
  started = true;
  Object.keys(TABLES).forEach((n) => { mem[n] = []; seqn[n] = 0; });
  if (process.env.GS_FORCE_MEMORY === '1') { usingMemory = true; return { mode: 'memory' }; }
  try {
    sequelize = getSequelize();
    await sequelize.authenticate();
    for (const n of Object.keys(TABLES)) {
      // gs_assets is write-once (immutable) — created_at only, no updated_at
      // (matches the migration). The rest track both.
      const ts = { tableName: TABLES[n].table, timestamps: true, createdAt: 'created_at', updatedAt: n === 'assets' ? false : 'updated_at' };
      M[n] = sequelize.define('GS_' + n, TABLES[n].attrs, ts);
    }
    for (const n of Object.keys(TABLES)) await M[n].sync({ alter: false });
    return { mode: 'postgres' };
  } catch (err) {
    usingMemory = true; M = {};
    const critical = process.env.NODE_ENV === 'production';
    console.error(JSON.stringify({ svc: 'equimind-gs-engine', level: critical ? 'CRITICAL' : 'warn', event: 'gs_db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

function mode() { return usingMemory ? 'memory' : (Object.keys(M).length ? 'postgres' : 'uninitialized'); }

module.exports = { init, mode, repo, TABLES };
