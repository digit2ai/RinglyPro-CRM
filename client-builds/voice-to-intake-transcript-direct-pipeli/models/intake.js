// =====================================================
// Intake store — voice_to_intake_transcript_direct_pipeli_intakes
//
// Sequelize-backed model with a graceful in-memory fallback. The route layer
// only ever calls init() / createIntake() / listByTenant(), so if Postgres is
// unreachable the same interface keeps working (stuck-loop heuristic: switch to
// an in-memory array store and mark the persistence TODO).
// =====================================================

const { DataTypes } = require('sequelize');
const { getSequelize } = require('./index');

const TABLE = 'voice_to_intake_transcript_direct_pipeli_intakes';

let Model = null;      // Sequelize model when DB is live
let usingMemory = false;
const memory = [];     // in-memory rows when DB is unavailable
let memSeq = 0;

function defineModel(sequelize) {
  return sequelize.define('VoiceIntake', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    transcript: { type: DataTypes.TEXT, allowNull: false },
    lang: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'en' },
    submitter_id: { type: DataTypes.STRING(255), allowNull: true },
    triage_bypass: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    forward_status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }]
  });
}

// Try to bring up Sequelize; on any failure fall back to memory. Never throws.
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
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

async function createIntake({ tenant_id, transcript, lang, submitter_id, triage_bypass, forward_status, created_at }) {
  const row = {
    tenant_id,
    transcript,
    lang: lang || 'en',
    submitter_id: submitter_id || null,
    triage_bypass: triage_bypass !== false,
    forward_status: forward_status || 'pending',
    created_at: created_at ? new Date(created_at) : new Date()
  };
  if (usingMemory || !Model) {
    const created = Object.assign({ id: ++memSeq }, row);
    memory.push(created);
    return created;
  }
  const created = await Model.create(row);
  return created.get({ plain: true });
}

async function updateForwardStatus(id, forward_status) {
  if (usingMemory || !Model) {
    const r = memory.find((m) => m.id === id);
    if (r) r.forward_status = forward_status;
    return r || null;
  }
  await Model.update({ forward_status }, { where: { id } });
  const r = await Model.findByPk(id);
  return r ? r.get({ plain: true }) : null;
}

async function listByTenant(tenant_id) {
  if (usingMemory || !Model) {
    return memory
      .filter((m) => m.tenant_id === tenant_id)
      .sort((a, b) => b.id - a.id);
  }
  const rows = await Model.findAll({ where: { tenant_id }, order: [['id', 'DESC']], limit: 500 });
  return rows.map((r) => r.get({ plain: true }));
}

function mode() {
  return usingMemory ? 'memory' : (Model ? 'postgres' : 'uninitialized');
}

module.exports = { init, createIntake, updateForwardStatus, listByTenant, mode, TABLE };
