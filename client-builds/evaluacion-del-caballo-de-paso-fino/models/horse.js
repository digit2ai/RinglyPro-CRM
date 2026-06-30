// =====================================================
// Horse registry store — evaluacion_del_caballo_de_paso_fino_horses
//
// Sequelize-backed with a graceful in-memory fallback (shared init lives in
// models/evaluation.js via ensureDb()). Every read/write is tenant-scoped so a
// caller can only ever see or mutate horses belonging to its own tenant_id.
//
// Columns: id, tenant_id, name, breed, created_at.
// =====================================================

'use strict';

const { DataTypes } = require('sequelize');

const TABLE = 'evaluacion_del_caballo_de_paso_fino_horses';

let Model = null;
let usingMemory = false;
const memory = [];
let memSeq = 0;

function define(sequelize) {
  return sequelize.define('ECPFHorse', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(160), allowNull: false },
    breed: { type: DataTypes.STRING(160), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }]
  });
}

function bind(sequelize) {
  if (sequelize) { Model = define(sequelize); return Model; }
  usingMemory = true; Model = null; return null;
}

async function syncModel() {
  if (Model) await Model.sync({ alter: false });
}

async function create({ tenant_id, name, breed }) {
  const row = {
    tenant_id,
    name: String(name).slice(0, 160),
    breed: breed != null ? String(breed).slice(0, 160) : null,
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

async function findForTenant(id, tenant_id) {
  const pid = parseInt(id, 10);
  if (!Number.isInteger(pid)) return null;
  if (usingMemory || !Model) {
    return memory.find((m) => m.id === pid && m.tenant_id === tenant_id) || null;
  }
  const r = await Model.findOne({ where: { id: pid, tenant_id } });
  return r ? r.get({ plain: true }) : null;
}

async function listByTenant(tenant_id) {
  if (usingMemory || !Model) {
    return memory.filter((m) => m.tenant_id === tenant_id).sort((a, b) => b.id - a.id);
  }
  const rows = await Model.findAll({ where: { tenant_id }, order: [['id', 'DESC']], limit: 500 });
  return rows.map((r) => r.get({ plain: true }));
}

module.exports = { TABLE, bind, syncModel, create, findForTenant, listByTenant };
