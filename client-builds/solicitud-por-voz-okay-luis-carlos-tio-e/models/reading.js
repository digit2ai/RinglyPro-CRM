// =====================================================
// Reading store — solicitud_por_voz_okay_luis_carlos_tio_e_readings  (v2 multi-vital)
//
// Sequelize-backed with a graceful in-memory fallback. The route layer calls
// init() / create() / listByTenant() / getById(), identical either way.
//
// Multi-tenant: every row carries tenant_id; every read is tenant-scoped.
// PRIVACY: only computed metrics + metadata are stored. No raw video, no
// biometric signal, no PII (name/email/phone) is ever persisted here.
// =====================================================

const { DataTypes } = require('sequelize');
const { getSequelize } = require('./index');

const TABLE = 'solicitud_por_voz_okay_luis_carlos_tio_e_readings';

let Model = null;
let usingMemory = false;
const memory = [];
let memSeq = 0;

function defineModel(sequelize) {
  return sequelize.define('RppgReading', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    bpm: { type: DataTypes.INTEGER, allowNull: false },
    confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    duration_s: { type: DataTypes.INTEGER, allowNull: true },
    // v2 multi-vital columns
    respiratory_bpm: { type: DataTypes.INTEGER, allowNull: true },
    hrv_sdnn_ms: { type: DataTypes.DECIMAL(7, 2), allowNull: true },
    hrv_rmssd_ms: { type: DataTypes.DECIMAL(7, 2), allowNull: true },
    // v3: BP + SpO2 are experimental, calibration-gated. Stress REMOVED.
    bp_systolic: { type: DataTypes.INTEGER, allowNull: true },
    bp_diastolic: { type: DataTypes.INTEGER, allowNull: true },
    spo2: { type: DataTypes.INTEGER, allowNull: true },
    sqi: { type: DataTypes.INTEGER, allowNull: true },
    is_validation: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reference_bpm: { type: DataTypes.INTEGER, allowNull: true },
    metrics: { type: DataTypes.JSONB, allowNull: true },
    source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'rppg' }, // rppg | simulated
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }]
  });
}

// Additive migration on boot: sync({alter:false}) will NOT add columns to an
// existing v1 table, so ADD COLUMN IF NOT EXISTS explicitly. Idempotent.
async function ensureColumns(sequelize) {
  const stmts = [
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS respiratory_bpm INTEGER",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS hrv_sdnn_ms NUMERIC(7,2)",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS hrv_rmssd_ms NUMERIC(7,2)",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS bp_systolic INTEGER",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS bp_diastolic INTEGER",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS spo2 INTEGER",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS sqi INTEGER",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS is_validation BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS reference_bpm INTEGER",
    "ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS metrics JSONB",
    "CREATE INDEX IF NOT EXISTS idx_" + TABLE + "_metrics ON " + TABLE + " USING GIN (metrics)"
  ];
  for (const s of stmts) { try { await sequelize.query(s); } catch (e) { /* non-fatal */ } }
}

// Bring up Sequelize; on any failure fall back to memory. Never throws.
async function init() {
  if (Model || usingMemory) return { mode: usingMemory ? 'memory' : 'postgres' };
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    Model = defineModel(sequelize);
    await Model.sync({ alter: false });
    await ensureColumns(sequelize);
    return { mode: 'postgres' };
  } catch (err) {
    usingMemory = true;
    Model = null;
    console.error(JSON.stringify({ svc: 'solicitud-por-voz-rppg', event: 'db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

function clampInt(v, lo, hi) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; }
function clampNum(v, lo, hi) { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 100) / 100)) : null; }

async function create(p) {
  const row = {
    tenant_id: parseInt(p.tenant_id, 10),
    bpm: parseInt(p.bpm, 10),
    confidence: (p.confidence == null) ? null : Math.max(0, Math.min(1, Math.round(Number(p.confidence) * 1000) / 1000)),
    duration_s: (p.duration_s == null) ? null : clampInt(p.duration_s, 0, 3600),
    respiratory_bpm: (p.respiratory_bpm == null) ? null : clampInt(p.respiratory_bpm, 0, 60),
    hrv_sdnn_ms: (p.hrv_sdnn_ms == null) ? null : clampNum(p.hrv_sdnn_ms, 0, 1000),
    hrv_rmssd_ms: (p.hrv_rmssd_ms == null) ? null : clampNum(p.hrv_rmssd_ms, 0, 1000),
    bp_systolic: (p.bp_systolic == null) ? null : clampInt(p.bp_systolic, 60, 260),
    bp_diastolic: (p.bp_diastolic == null) ? null : clampInt(p.bp_diastolic, 30, 160),
    spo2: (p.spo2 == null) ? null : clampInt(p.spo2, 70, 100),
    sqi: (p.sqi == null) ? null : clampInt(p.sqi, 0, 100),
    is_validation: !!p.is_validation,
    reference_bpm: (p.reference_bpm == null) ? null : clampInt(p.reference_bpm, 0, 300),
    metrics: (p.metrics && typeof p.metrics === 'object') ? p.metrics : null,
    source: p.source === 'simulated' ? 'simulated' : 'rppg',
    created_at: new Date()
  };
  if (usingMemory || !Model) {
    const created = Object.assign({ id: ++memSeq }, row);
    memory.push(created);
    return created;
  }
  const created = await Model.create(row);
  return created.toJSON();
}

async function listByTenant(tenant_id, limit) {
  const tid = parseInt(tenant_id, 10);
  if (usingMemory || !Model) {
    const rows = memory.filter((r) => r.tenant_id === tid).sort((a, b) => b.id - a.id).map((r) => Object.assign({}, r));
    return typeof limit === 'number' ? rows.slice(0, limit) : rows;
  }
  const rows = await Model.findAll({ where: { tenant_id: tid }, order: [['id', 'DESC']], limit: limit || 200 });
  return rows.map((r) => r.toJSON());
}

// Tenant-scoped single fetch (for FHIR export). Returns null if not owned.
async function getById(tenant_id, id) {
  const tid = parseInt(tenant_id, 10), rid = parseInt(id, 10);
  if (!Number.isInteger(rid)) return null;
  if (usingMemory || !Model) {
    const r = memory.find((x) => x.id === rid && x.tenant_id === tid);
    return r ? Object.assign({}, r) : null;
  }
  const r = await Model.findOne({ where: { id: rid, tenant_id: tid } });
  return r ? r.toJSON() : null;
}

module.exports = { init, create, listByTenant, getById };
