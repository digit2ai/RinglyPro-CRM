// =====================================================
// Transaction store — solicitud_por_voz_contexto_del_cliente_e_transactions
//
// Sequelize-backed with a graceful in-memory fallback (stuck-loop heuristic:
// if Postgres is unreachable, switch to an in-memory array keyed by tenant_id
// and mark the persistence TODO). The route layer only calls init() / create()
// / listByTenant() / allByTenant(), so the interface is identical either way.
//
// Multi-tenant: every row carries tenant_id; every read is tenant-scoped.
// =====================================================

const { DataTypes } = require('sequelize');
const { getSequelize } = require('./index');

const TABLE = 'solicitud_por_voz_contexto_del_cliente_e_transactions';
const TYPES = ['sale', 'purchase', 'import'];

let Model = null;
let usingMemory = false;
const memory = [];
let memSeq = 0;

function defineModel(sequelize) {
  return sequelize.define('PalmTransaction', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'sale' },
    amount_usd: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    counterparty: { type: DataTypes.STRING(255), allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: true },
    source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'form' }, // form | voice
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
    console.error(JSON.stringify({ svc: 'solicitud-por-voz', event: 'db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

function normType(t) {
  const s = String(t || '').toLowerCase();
  return TYPES.includes(s) ? s : 'sale';
}

async function create({ tenant_id, type, amount_usd, counterparty, note, source }) {
  const row = {
    tenant_id: parseInt(tenant_id, 10),
    type: normType(type),
    amount_usd: Math.round((Number(amount_usd) || 0) * 100) / 100,
    counterparty: counterparty ? String(counterparty).slice(0, 255) : null,
    note: note ? String(note).slice(0, 500) : null,
    source: source === 'voice' ? 'voice' : 'form',
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

async function allByTenant(tenant_id) {
  const tid = parseInt(tenant_id, 10);
  if (usingMemory || !Model) {
    return memory.filter((r) => r.tenant_id === tid).map((r) => Object.assign({}, r));
  }
  const rows = await Model.findAll({ where: { tenant_id: tid }, order: [['id', 'DESC']] });
  return rows.map((r) => r.toJSON());
}

async function listByTenant(tenant_id, limit) {
  const rows = await allByTenant(tenant_id);
  return typeof limit === 'number' ? rows.slice(0, limit) : rows;
}

// P&L + net USD position computed from stored rows.
//   sales      = Σ amount where type = sale          (USD in)
//   purchases  = Σ amount where type in (purchase, import)  (USD out)
//   margin     = sales - purchases
//   net pos    = sales - purchases  (net USD exposure for this slice)
async function summaryByTenant(tenant_id) {
  const rows = await allByTenant(tenant_id);
  let sales = 0, purchases = 0;
  for (const r of rows) {
    const amt = Number(r.amount_usd) || 0;
    if (r.type === 'sale') sales += amt;
    else purchases += amt; // purchase + import = USD outflow
  }
  const round = (n) => Math.round(n * 100) / 100;
  return {
    total_sales_usd: round(sales),
    total_purchases_usd: round(purchases),
    gross_margin_usd: round(sales - purchases),
    net_position_usd: round(sales - purchases),
    transaction_count: rows.length
  };
}

module.exports = { init, create, allByTenant, listByTenant, summaryByTenant, TYPES };
