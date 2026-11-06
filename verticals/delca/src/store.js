'use strict';
/**
 * Delca store. Postgres when a database is configured, an in-memory store with
 * the SAME interface otherwise (SIT, or DELCA_STORE=memory). Every query
 * filters on tenant_id, which comes from DELCA_TENANT_ID and never a request.
 *
 * Prices live HERE once seeded: the seed only inserts missing rows, so a price
 * or availability the owner edits in the admin table survives every redeploy.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ITEMS, CATEGORIES } = require('./menu');

const TENANT = () => parseInt(process.env.DELCA_TENANT_ID || '1', 10);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const catSort = (c) => { const i = CATEGORIES.findIndex((x) => x.id === c); return i < 0 ? 99 : i; };
const SEED = ITEMS.map((it, i) => ({ code: it.code, category: it.cat, name: it.name, description: it.desc || '', price_cents: it.price_cents,
  kind: it.kind || 'product', options: it.options || null, available: true, sort: catSort(it.cat) * 1000 + i }));
const numberOf = (id) => 'DLC-' + String(id).padStart(5, '0');

/* ---------------- memory backend ---------------- */
function memory() {
  const products = new Map(), sessions = new Map(), orders = [], items = [];
  let oid = 0;
  const pk = (t, c) => t + ':' + c;
  return {
    backend: 'memory',
    async init() { return true; },
    async seed(t) { for (const s of SEED) if (!products.has(pk(t, s.code))) products.set(pk(t, s.code), Object.assign({ tenant_id: t }, s)); },
    async products(t) { return [...products.values()].filter((p) => p.tenant_id === t).sort((a, b) => a.sort - b.sort); },
    async setProduct(t, code, patch) {
      const p = products.get(pk(t, code)); if (!p) return null;
      if (patch.price_cents != null) p.price_cents = patch.price_cents;
      if (patch.available != null) p.available = patch.available;
      return p;
    },
    async getSession(t, sid) { const s = sessions.get(t + ':' + sha(sid)); return s ? JSON.parse(JSON.stringify(s.state)) : null; },
    async saveSession(t, sid, state) { const k = t + ':' + sha(sid); const prev = sessions.get(k); sessions.set(k, { id: prev ? prev.id : sessions.size + 1, state: JSON.parse(JSON.stringify(state)) }); return true; },
    async sessionId(t, sid) { const s = sessions.get(t + ':' + sha(sid)); return s ? s.id : null; },
    async createOrder(t, o, lines) {
      const id = ++oid;
      const row = Object.assign({ id, tenant_id: t, number: numberOf(id), status: 'nuevo', whatsapp_status: 'pending', whatsapp_detail: null, created_at: new Date().toISOString() }, o);
      orders.push(row);
      lines.forEach((l) => items.push(Object.assign({ tenant_id: t, order_id: id }, l)));
      return row;
    },
    async listOrders(t, limit) {
      return orders.filter((o) => o.tenant_id === t).slice().reverse().slice(0, limit || 100)
        .map((o) => Object.assign({}, o, { items: items.filter((i) => i.tenant_id === t && i.order_id === o.id) }));
    },
    async setOrder(t, id, patch) {
      const o = orders.find((x) => x.tenant_id === t && x.id === id); if (!o) return null;
      Object.assign(o, patch); return o;
    }
  };
}

/* ---------------- postgres backend ---------------- */
function postgres(url) {
  const { Sequelize, QueryTypes } = require('sequelize');
  const db = new Sequelize(url, { dialect: 'postgres', logging: false, pool: { max: 5, min: 0, idle: 10000 },
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } });
  const q = (sql, r) => db.query(sql, { replacements: r || {}, type: QueryTypes.SELECT, logging: false });
  const run = async (sql, r, opts) => { const [rows] = await db.query(sql, Object.assign({ replacements: r || {}, type: QueryTypes.RAW, logging: false }, opts || {})); return Array.isArray(rows) ? rows : []; };
  let ready = null;
  return {
    backend: 'postgres',
    init() {
      if (!ready) {
        ready = (async () => {
          const dir = path.join(__dirname, '..', 'migrations');
          const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
          const t = await db.transaction();
          try {
            await db.query('SELECT pg_advisory_xact_lock(761106)', { transaction: t, logging: false });
            for (const f of files) await db.query(fs.readFileSync(path.join(dir, f), 'utf8'), { transaction: t, logging: false, raw: true });
            await t.commit();
          } catch (e) { await t.rollback(); ready = null; throw e; }
          return true;
        })();
      }
      return ready;
    },
    async seed(t) {
      for (const s of SEED) {
        await run(`INSERT INTO dlc_products (tenant_id, code, category, name, description, price_cents, kind, options, sort)
          VALUES (:t, :code, :category, :name, :description, :price_cents, :kind, :options, :sort)
          ON CONFLICT (tenant_id, code) DO UPDATE SET sort = EXCLUDED.sort`,
        { t, code: s.code, category: s.category, name: s.name, description: s.description, price_cents: s.price_cents, kind: s.kind, options: s.options ? JSON.stringify(s.options) : null, sort: s.sort });
      }
    },
    async products(t) {
      return q('SELECT code, category, name, description, price_cents, kind, options, available, sort FROM dlc_products WHERE tenant_id = :t ORDER BY sort', { t });
    },
    async setProduct(t, code, patch) {
      const rows = await run(`UPDATE dlc_products SET price_cents = COALESCE(:p, price_cents), available = COALESCE(:a, available), updated_at = NOW()
        WHERE tenant_id = :t AND code = :code RETURNING code, name, price_cents, available`,
      { t, code, p: patch.price_cents == null ? null : patch.price_cents, a: patch.available == null ? null : patch.available });
      return rows[0] || null;
    },
    async getSession(t, sid) {
      const rows = await q('SELECT state FROM dlc_sessions WHERE tenant_id = :t AND sid_hash = :h', { t, h: sha(sid) });
      return rows[0] ? rows[0].state : null;
    },
    async saveSession(t, sid, state) {
      await run(`INSERT INTO dlc_sessions (tenant_id, sid_hash, state) VALUES (:t, :h, :s)
        ON CONFLICT (tenant_id, sid_hash) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`, { t, h: sha(sid), s: JSON.stringify(state) });
      return true;
    },
    async sessionId(t, sid) {
      const rows = await q('SELECT id FROM dlc_sessions WHERE tenant_id = :t AND sid_hash = :h', { t, h: sha(sid) });
      return rows[0] ? rows[0].id : null;
    },
    async createOrder(t, o, lines) {
      return db.transaction(async (tx) => {
        const [row] = await run(`INSERT INTO dlc_orders (tenant_id, session_id, customer_name, customer_phone, mode, address, notes, total_cents, currency, composed_by)
          VALUES (:t, :session_id, :customer_name, :customer_phone, :mode, :address, :notes, :total_cents, :currency, :composed_by) RETURNING *`,
        Object.assign({ t, notes: null, address: null, session_id: null, composed_by: null }, o), { transaction: tx });
        const [num] = await run('UPDATE dlc_orders SET number = :n WHERE tenant_id = :t AND id = :id RETURNING number', { n: numberOf(row.id), t, id: row.id }, { transaction: tx });
        row.number = num.number;
        for (const l of lines) {
          await run(`INSERT INTO dlc_order_items (tenant_id, order_id, product_code, name, qty, unit_price_cents, line_cents, note)
            VALUES (:t, :oid, :product_code, :name, :qty, :unit_price_cents, :line_cents, :note)`, Object.assign({ t, oid: row.id, note: null }, l), { transaction: tx });
        }
        return row;
      });
    },
    async listOrders(t, limit) {
      const orders = await q('SELECT * FROM dlc_orders WHERE tenant_id = :t ORDER BY created_at DESC LIMIT :l', { t, l: Math.min(limit || 100, 500) });
      if (!orders.length) return [];
      const items = await q('SELECT order_id, product_code, name, qty, unit_price_cents, line_cents, note FROM dlc_order_items WHERE tenant_id = :t AND order_id IN (:ids)', { t, ids: orders.map((o) => o.id) });
      return orders.map((o) => Object.assign(o, { items: items.filter((i) => i.order_id === o.id) }));
    },
    async setOrder(t, id, patch) {
      const sets = [], r = { t, id };
      for (const k of ['status', 'whatsapp_status', 'whatsapp_detail']) if (patch[k] !== undefined) { sets.push(`${k} = :${k}`); r[k] = patch[k]; }
      if (!sets.length) return null;
      const rows = await run(`UPDATE dlc_orders SET ${sets.join(', ')}, updated_at = NOW() WHERE tenant_id = :t AND id = :id RETURNING *`, r);
      return rows[0] || null;
    }
  };
}

let instance = null;
function store() {
  if (!instance) {
    const url = process.env.DELCA_DATABASE_URL || process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
    instance = (!url || process.env.DELCA_STORE === 'memory') ? memory() : postgres(url);
  }
  return instance;
}
function _setStore(s) { instance = s; }

module.exports = { store, memory, TENANT, sha, _setStore, numberOf };
