// =====================================================
// Reading store — solicitud_por_voz_okay_luis_carlos_tio_e_readings
//
// Sequelize-backed with a graceful in-memory fallback (stuck-loop heuristic:
// if Postgres is unreachable, switch to an in-memory array keyed by tenant_id
// and mark the persistence TODO). The route layer only calls init() / create()
// / listByTenant(), so the interface is identical either way.
//
// Multi-tenant: every row carries tenant_id; every read is tenant-scoped.
// PRIVACY: only the computed BPM integer + metadata are stored. No raw video,
// no biometric signal, no PII (name/email/phone) is ever persisted here.
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
    source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'rppg' }, // rppg | simulated
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
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    Model = defineModel(sequelize);
    await Model.sync({ alter: false });
    return { mode: 'postgres' };
  } catch (err) {
    // TODO: restore Sequelize persistence — DB unreachable, using in-memory store
    usingMemory = true;
    Model = null;
    console.error(JSON.stringify({ svc: 'solicitud-por-voz-rppg', event: 'db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

async function create({ tenant_id, bpm, confidence, duration_s, source }) {
  const conf = (confidence == null) ? null : Math.max(0, Math.min(1, Math.round(Number(confidence) * 1000) / 1000));
  const dur = (duration_s == null) ? null : Math.max(0, Math.min(3600, parseInt(duration_s, 10) || 0));
  const row = {
    tenant_id: parseInt(tenant_id, 10),
    bpm: parseInt(bpm, 10),
    confidence: conf,
    duration_s: dur,
    source: source === 'simulated' ? 'simulated' : 'rppg',
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

module.exports = { init, create, listByTenant };
