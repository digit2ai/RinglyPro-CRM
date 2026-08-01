// =====================================================
// lib/store.js — persistence with an in-memory safety net.
//
// Postgres is primary. If DATABASE_URL is absent or the handshake fails, the
// store degrades to an in-memory Map behind an IDENTICAL interface, so /health,
// ingest, the dashboard and SIT all stay up. A stockout dashboard that 500s
// because a connection pool blinked is worse than one running on a warm cache —
// the store manager still needs this morning's number.
//
// /health reports which backend is live, so degraded mode is never silent.
// =====================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

const DB_URL = process.env.DATABASE_URL || process.env.CRM_DATABASE_URL || '';

let sequelize = null;
let models = null;
let backend = 'memory';
let initPromise = null;
let lastError = null;

// --- in-memory fallback tables ---
const mem = { events: [], inventory: [], batches: [], seq: 1 };

function buildModels(seq) {
  return {
    OosEvent: require('../models/oosEvent')(seq, DataTypes),
    InventorySnapshot: require('../models/inventorySnapshot')(seq, DataTypes),
    Batch: require('../models/batch')(seq, DataTypes)
  };
}

/**
 * Connect once, lazily, and never fatally. Repeated calls return the same
 * promise so a burst of concurrent requests does not open N pools.
 */
function init() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!DB_URL) {
      backend = 'memory';
      return { backend, reason: 'DATABASE_URL not set' };
    }
    try {
      sequelize = new Sequelize(DB_URL, {
        dialect: 'postgres',
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
        logging: false,
        pool: { max: 3, min: 0, idle: 10000, acquire: 15000 }
      });
      await sequelize.authenticate();
      models = buildModels(sequelize);

      // Schema is applied from the raw migration, NOT sequelize.sync().
      //
      // sync() re-issues CREATE INDEX on every boot with a generated index name
      // built from the table + column list. Our table names are long, so those
      // names truncate at Postgres's 63-character identifier limit and collide
      // with the indexes created on the previous boot — sync() then throws
      // 'relation ... already exists' on EVERY restart after the first. That
      // would drop this app into the in-memory fallback permanently and lose
      // every ingested batch on each redeploy.
      //
      // 001_init.sql is fully idempotent (CREATE TABLE / CREATE INDEX
      // IF NOT EXISTS) with short, explicit index names, so it is safe to run
      // unconditionally on every boot.
      const sqlPath = path.join(__dirname, '..', 'migrations', '001_init.sql');
      const ddl = fs.readFileSync(sqlPath, 'utf8');
      await sequelize.query(ddl);

      backend = 'postgres';
      return { backend };
    } catch (err) {
      lastError = err.message;
      console.error('[retail-oos] DB unavailable, using in-memory store:', err.message);
      sequelize = null;
      models = null;
      backend = 'memory';
      return { backend, reason: err.message };
    }
  })();

  return initPromise;
}

function status() {
  return { backend, error: lastError };
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

async function saveBatch(batch) {
  await init();
  if (backend === 'postgres') {
    await models.Batch.create(batch);
    return batch;
  }
  mem.batches.push({ ...batch });
  return batch;
}

async function saveInventory(rows) {
  await init();
  if (!rows.length) return 0;
  if (backend === 'postgres') {
    await models.InventorySnapshot.bulkCreate(rows);
    return rows.length;
  }
  for (const r of rows) mem.inventory.push({ ...r });
  return rows.length;
}

async function saveEvents(events) {
  await init();
  if (!events.length) return 0;
  if (backend === 'postgres') {
    await models.OosEvent.bulkCreate(events);
    return events.length;
  }
  for (const e of events) mem.events.push({ id: mem.seq++, ...e });
  return events.length;
}

// ---------------------------------------------------------------------------
// Read path — EVERY read filters on tenant_id. No exceptions.
// ---------------------------------------------------------------------------

async function findEvents({ tenant_id, store_id, limit = 500 }) {
  await init();
  const cap = Math.min(2000, Math.max(1, parseInt(limit, 10) || 500));

  if (backend === 'postgres') {
    const where = { tenant_id };
    if (store_id) where.store_id = store_id;
    const rows = await models.OosEvent.findAll({
      where,
      order: [['lost_sales_usd', 'DESC']],
      limit: cap
    });
    return rows.map((r) => r.get({ plain: true }));
  }

  return mem.events
    .filter((e) => e.tenant_id === tenant_id && (!store_id || e.store_id === store_id))
    .sort((a, b) => (b.lost_sales_usd || 0) - (a.lost_sales_usd || 0))
    .slice(0, cap);
}

async function findLatestBatch({ tenant_id, store_id }) {
  await init();
  if (backend === 'postgres') {
    const where = { tenant_id };
    if (store_id) where.store_id = store_id;
    const row = await models.Batch.findOne({ where, order: [['ingested_at', 'DESC']] });
    return row ? row.get({ plain: true }) : null;
  }
  const list = mem.batches
    .filter((b) => b.tenant_id === tenant_id && (!store_id || b.store_id === store_id))
    .sort((a, b) => new Date(b.ingested_at) - new Date(a.ingested_at));
  return list[0] || null;
}

async function listStores({ tenant_id }) {
  await init();
  if (backend === 'postgres') {
    const rows = await models.Batch.findAll({
      where: { tenant_id },
      attributes: ['store_id'],
      group: ['store_id']
    });
    return rows.map((r) => r.get('store_id')).filter(Boolean);
  }
  return Array.from(new Set(mem.batches
    .filter((b) => b.tenant_id === tenant_id)
    .map((b) => b.store_id)
    .filter(Boolean)));
}

// Test hook — SIT uses this to isolate its own fixtures.
async function purgeTenant(tenant_id) {
  await init();
  if (backend === 'postgres') {
    await models.OosEvent.destroy({ where: { tenant_id } });
    await models.InventorySnapshot.destroy({ where: { tenant_id } });
    await models.Batch.destroy({ where: { tenant_id } });
    return true;
  }
  mem.events = mem.events.filter((e) => e.tenant_id !== tenant_id);
  mem.inventory = mem.inventory.filter((e) => e.tenant_id !== tenant_id);
  mem.batches = mem.batches.filter((e) => e.tenant_id !== tenant_id);
  return true;
}

module.exports = {
  init,
  status,
  saveBatch,
  saveInventory,
  saveEvents,
  findEvents,
  findLatestBatch,
  listStores,
  purgeTenant
};
