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
    // --- v2 rubric columns ---
    height_category: { type: DataTypes.STRING(16), allowNull: true },
    height_cm: { type: DataTypes.INTEGER, allowNull: true },
    horse_name: { type: DataTypes.STRING(120), allowNull: true },
    rider_name: { type: DataTypes.STRING(120), allowNull: true },
    discipline: { type: DataTypes.STRING(32), allowNull: true, defaultValue: 'show_jumping' },
    rider_score: { type: DataTypes.INTEGER, allowNull: true },
    dimension_scores: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    phase_metrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    metrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    manual_faults: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    optimal_time_sec: { type: DataTypes.FLOAT, allowNull: true },
    total_time_sec: { type: DataTypes.FLOAT, allowNull: true },
    journal: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    rubric_version: { type: DataTypes.STRING(16), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'horse_name'] }]
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
    // Auto-migrate v2 columns onto a pre-existing table (sync alter:false won't).
    // Idempotent ADD COLUMN IF NOT EXISTS — safe to run every boot.
    try {
      await sequelize.query(`ALTER TABLE ${TABLE}
        ADD COLUMN IF NOT EXISTS height_category VARCHAR(16),
        ADD COLUMN IF NOT EXISTS height_cm INTEGER,
        ADD COLUMN IF NOT EXISTS horse_name VARCHAR(120),
        ADD COLUMN IF NOT EXISTS rider_name VARCHAR(120),
        ADD COLUMN IF NOT EXISTS discipline VARCHAR(32) DEFAULT 'show_jumping',
        ADD COLUMN IF NOT EXISTS rider_score INTEGER,
        ADD COLUMN IF NOT EXISTS dimension_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS phase_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS manual_faults JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS optimal_time_sec REAL,
        ADD COLUMN IF NOT EXISTS total_time_sec REAL,
        ADD COLUMN IF NOT EXISTS journal JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS rubric_version VARCHAR(16)`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_ai_jump_coach_analyses_horse ON ${TABLE} (tenant_id, horse_name)`);
    } catch (mErr) {
      console.error(JSON.stringify({ svc: 'ai-jump-coach', event: 'automigrate_warn', error: mErr.message }));
    }
    return { mode: 'postgres' };
  } catch (err) {
    usingMemory = true;
    Model = null;
    console.error(JSON.stringify({ svc: 'ai-jump-coach', event: 'db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

async function create(input) {
  const {
    tenant_id, filename, duration_sec, frame_count, apex_sec, faults, lang,
    height_category, height_cm, horse_name, rider_name, discipline, rider_score,
    dimension_scores, phase_metrics, metrics, manual_faults, optimal_time_sec,
    total_time_sec, journal, rubric_version
  } = input;
  const row = {
    tenant_id,
    filename: filename || null,
    duration_sec: duration_sec != null ? Number(duration_sec) : null,
    frame_count: frame_count || 0,
    apex_sec: apex_sec != null ? Number(apex_sec) : null,
    faults: Array.isArray(faults) ? faults : [],
    lang: lang || 'es',
    height_category: height_category || null,
    height_cm: height_cm != null ? Number(height_cm) : null,
    horse_name: horse_name || null,
    rider_name: rider_name || null,
    discipline: discipline || 'show_jumping',
    rider_score: rider_score != null ? Number(rider_score) : null,
    dimension_scores: dimension_scores || {},
    phase_metrics: phase_metrics || {},
    metrics: metrics || {},
    manual_faults: Array.isArray(manual_faults) ? manual_faults : [],
    optimal_time_sec: optimal_time_sec != null ? Number(optimal_time_sec) : null,
    total_time_sec: total_time_sec != null ? Number(total_time_sec) : null,
    journal: Array.isArray(journal) ? journal : [],
    rubric_version: rubric_version || null,
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

// Append a journal entry (rider's subjective note) to an analysis IF owned by
// tenant. Returns the updated row or null. Used to cross subjective vs objective.
async function appendJournal(id, tenant_id, entry) {
  const pid = parseInt(id, 10);
  if (!Number.isInteger(pid)) return null;
  if (usingMemory || !Model) {
    const r = memory.find((m) => m.id === pid && m.tenant_id === tenant_id);
    if (!r) return null;
    r.journal = Array.isArray(r.journal) ? r.journal : [];
    r.journal.push(entry);
    return r;
  }
  const r = await Model.findOne({ where: { id: pid, tenant_id } });
  if (!r) return null;
  const j = Array.isArray(r.journal) ? r.journal.slice() : [];
  j.push(entry);
  r.journal = j;
  await r.save();
  return r.get({ plain: true });
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

module.exports = { init, create, appendJournal, findById, findForTenant, listByTenant, remove, mode, TABLE };
