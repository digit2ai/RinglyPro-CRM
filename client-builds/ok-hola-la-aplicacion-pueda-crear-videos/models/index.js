'use strict';
// =====================================================
// Storage layer for OK Hola.
// - When DATABASE_URL is present (production/Render) -> Sequelize/Postgres.
// - When absent OR OKHOLA_INMEM=1 (SIT / local smoke) -> deterministic in-memory store.
// Both expose the SAME async repository API, so routes never branch on backend.
// =====================================================
const { Sequelize } = require('sequelize');

const USE_INMEM = process.env.OKHOLA_INMEM === '1' || !process.env.DATABASE_URL;

let repo;

if (USE_INMEM) {
  // ---- In-memory backend (no DB dependency) ----
  const users = new Map();       // id -> {id, tenant_id, email, created_at}
  const usersByEmail = new Map(); // email -> user
  const links = new Map();       // token -> {..}
  const prompts = new Map();     // id -> {..}
  let userSeq = 1, linkSeq = 1, promptSeq = 1;

  repo = {
    backend: 'memory',
    ready: async () => true,
    async findOrCreateUserByEmail(email) {
      email = String(email).toLowerCase().trim();
      if (usersByEmail.has(email)) return usersByEmail.get(email);
      const id = userSeq++;
      const u = { id, tenant_id: id, email, created_at: new Date() };
      users.set(id, u); usersByEmail.set(email, u);
      return u;
    },
    async createMagicLink({ tenant_id, email, token, expires_at }) {
      const id = linkSeq++;
      const row = { id, tenant_id, email, token, expires_at, used_at: null, created_at: new Date() };
      links.set(token, row);
      return row;
    },
    async consumeMagicLink(token) {
      const row = links.get(token);
      if (!row) return null;
      if (row.used_at) return null;
      if (new Date(row.expires_at).getTime() < Date.now()) return null;
      row.used_at = new Date();
      return row;
    },
    async createPrompt(data) {
      const id = promptSeq++;
      const now = new Date();
      const row = { id, created_at: now, updated_at: now, ...data };
      prompts.set(id, row);
      return row;
    },
    async listPrompts(tenant_id) {
      return [...prompts.values()]
        .filter(p => p.tenant_id === tenant_id)
        .sort((a, b) => b.id - a.id);
    },
    async getPrompt(id, tenant_id) {
      const row = prompts.get(Number(id));
      if (!row || row.tenant_id !== tenant_id) return null;
      return row;
    },
    async updatePrompt(id, tenant_id, patch) {
      const row = prompts.get(Number(id));
      if (!row || row.tenant_id !== tenant_id) return null;
      Object.assign(row, patch, { updated_at: new Date() });
      return row;
    },
    // Test helper: seed a row under an arbitrary tenant (used by SIT cross-tenant check)
    async _seedPrompt(data) { return this.createPrompt(data); }
  };
} else {
  // ---- Sequelize/Postgres backend ----
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
  });
  const User = require('./user')(sequelize);
  const MagicLink = require('./magicLink')(sequelize);
  const Prompt = require('./prompt')(sequelize);

  let syncDone = null;
  async function ensure() {
    if (!syncDone) {
      syncDone = (async () => {
        await sequelize.authenticate();
        // alter:false — schema managed by migrations/001_init.sql; sync only creates if missing.
        await User.sync();
        await MagicLink.sync();
        await Prompt.sync();
      })();
    }
    return syncDone;
  }

  repo = {
    backend: 'postgres',
    ready: async () => { await ensure(); return true; },
    async findOrCreateUserByEmail(email) {
      await ensure();
      email = String(email).toLowerCase().trim();
      let u = await User.findOne({ where: { email } });
      if (u) return u.get({ plain: true });
      // create then set tenant_id = id (one user = one tenant)
      u = await User.create({ email, tenant_id: 0 });
      await u.update({ tenant_id: u.id });
      return u.get({ plain: true });
    },
    async createMagicLink(d) { await ensure(); return (await MagicLink.create(d)).get({ plain: true }); },
    async consumeMagicLink(token) {
      await ensure();
      const row = await MagicLink.findOne({ where: { token } });
      if (!row || row.used_at) return null;
      if (new Date(row.expires_at).getTime() < Date.now()) return null;
      await row.update({ used_at: new Date() });
      return row.get({ plain: true });
    },
    async createPrompt(d) { await ensure(); return (await Prompt.create(d)).get({ plain: true }); },
    async listPrompts(tenant_id) {
      await ensure();
      const rows = await Prompt.findAll({ where: { tenant_id }, order: [['id', 'DESC']] });
      return rows.map(r => r.get({ plain: true }));
    },
    async getPrompt(id, tenant_id) {
      await ensure();
      const row = await Prompt.findOne({ where: { id, tenant_id } });
      return row ? row.get({ plain: true }) : null;
    },
    async updatePrompt(id, tenant_id, patch) {
      await ensure();
      const row = await Prompt.findOne({ where: { id, tenant_id } });
      if (!row) return null;
      await row.update({ ...patch, updated_at: new Date() });
      return row.get({ plain: true });
    },
    async _seedPrompt(d) { return this.createPrompt(d); },
    sequelize
  };
}

module.exports = repo;
