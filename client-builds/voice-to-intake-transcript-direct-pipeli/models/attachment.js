// =====================================================
// Intake attachments — voice_to_intake_transcript_direct_pipeli_attachments
//
// Stores uploaded files (txt/pdf/doc/docx/csv/rtf) as bytea, linked to an intake
// row. Mirrors models/intake.js: Sequelize-backed with a graceful in-memory
// fallback so a DB outage never blocks a submission.
// =====================================================

const { DataTypes } = require('sequelize');
const { getSequelize } = require('./index');

const TABLE = 'voice_to_intake_transcript_direct_pipeli_attachments';

let Model = null;
let usingMemory = false;
const memory = [];
let memSeq = 0;

function defineModel(sequelize) {
  return sequelize.define('VoiceIntakeAttachment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    intake_id: { type: DataTypes.INTEGER, allowNull: false },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    filename: { type: DataTypes.STRING(255), allowNull: false },
    mimetype: { type: DataTypes.STRING(128), allowNull: true },
    size_bytes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    data: { type: DataTypes.BLOB('long'), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [{ fields: ['intake_id'] }, { fields: ['tenant_id'] }]
  });
}

async function init() {
  if (Model || usingMemory) return { mode: usingMemory ? 'memory' : 'postgres' };
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    Model = defineModel(sequelize);
    await Model.sync({ alter: false });
    return { mode: 'postgres' };
  } catch (err) {
    usingMemory = true;
    Model = null;
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'attach_db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

async function createAttachment({ intake_id, tenant_id, filename, mimetype, size_bytes, data }) {
  const row = {
    intake_id,
    tenant_id,
    filename: String(filename || 'file').slice(0, 255),
    mimetype: mimetype ? String(mimetype).slice(0, 128) : null,
    size_bytes: size_bytes || (data ? data.length : 0),
    data,
    created_at: new Date()
  };
  if (usingMemory || !Model) {
    const created = Object.assign({ id: ++memSeq }, row);
    memory.push(created);
    return { id: created.id, filename: created.filename, mimetype: created.mimetype, size_bytes: created.size_bytes };
  }
  const created = await Model.create(row);
  const plain = created.get({ plain: true });
  return { id: plain.id, filename: plain.filename, mimetype: plain.mimetype, size_bytes: plain.size_bytes };
}

async function listByIntake(intake_id) {
  if (usingMemory || !Model) {
    return memory.filter((m) => m.intake_id === intake_id)
      .map((m) => ({ id: m.id, filename: m.filename, mimetype: m.mimetype, size_bytes: m.size_bytes }));
  }
  const rows = await Model.findAll({
    where: { intake_id },
    attributes: ['id', 'filename', 'mimetype', 'size_bytes'],
    order: [['id', 'ASC']]
  });
  return rows.map((r) => r.get({ plain: true }));
}

// Returns the full row incl. data buffer, or null.
async function getById(id) {
  if (usingMemory || !Model) {
    return memory.find((m) => m.id === id) || null;
  }
  const r = await Model.findByPk(id);
  return r ? r.get({ plain: true }) : null;
}

module.exports = { init, createAttachment, listByIntake, getById, TABLE };
