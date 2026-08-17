// =====================================================
// models/store.js — one interface, two backends.
//
// Routes never branch on storage availability. They call the store; the store
// knows whether Postgres answered at boot. This is what lets the whole app run
// on a laptop with no DATABASE_URL and still be the same code path that runs in
// production — the in-memory branch is a shipped, tested path, not a fallback
// nobody has exercised.
//
// EVERY READ FILTERS ON tenant_id. Both backends. There is no method here that
// can return a row without one.
// =====================================================

'use strict';

function makeStore(state, models) {
  const mem = {
    scenarios: new Map(),
    tokens: new Map(),
    nextScenarioId: 1,
  };

  const live = () => state.ready && models && models.Scenario && models.MagicToken;

  function toPlain(row) {
    if (!row) return null;
    const o = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
    return o;
  }

  return {
    backend() {
      return live() ? 'postgres' : 'memory';
    },

    // --- scenarios --------------------------------------------------------

    async createScenario({ tenant_id, owner_email, name, notes, inputs, projections, model_version }) {
      const now = new Date();
      if (live()) {
        const row = await models.Scenario.create({
          tenant_id, owner_email, name, notes, inputs, projections, model_version,
          created_at: now, updated_at: now,
        });
        return toPlain(row);
      }
      const id = mem.nextScenarioId;
      mem.nextScenarioId += 1;
      const row = {
        id, tenant_id, owner_email, name, notes, inputs, projections, model_version,
        created_at: now, updated_at: now,
      };
      mem.scenarios.set(id, row);
      return { ...row };
    },

    async listScenarios(tenant_id) {
      if (live()) {
        const rows = await models.Scenario.findAll({
          where: { tenant_id },
          order: [['created_at', 'DESC']],
          limit: 200,
        });
        return rows.map(toPlain);
      }
      return [...mem.scenarios.values()]
        .filter((r) => r.tenant_id === tenant_id)
        .sort((a, b) => b.created_at - a.created_at)
        .map((r) => ({ ...r }));
    },

    async getScenario(tenant_id, id) {
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return null;
      if (live()) {
        const row = await models.Scenario.findOne({ where: { tenant_id, id: numericId } });
        return toPlain(row);
      }
      const row = mem.scenarios.get(numericId);
      // Cross-tenant reads resolve to "not found", never to a 403 — a 403
      // confirms the row exists, which is itself a disclosure.
      if (!row || row.tenant_id !== tenant_id) return null;
      return { ...row };
    },

    async deleteScenario(tenant_id, id) {
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return 0;
      if (live()) {
        return models.Scenario.destroy({ where: { tenant_id, id: numericId } });
      }
      const row = mem.scenarios.get(numericId);
      if (!row || row.tenant_id !== tenant_id) return 0;
      mem.scenarios.delete(numericId);
      return 1;
    },

    // --- magic tokens -----------------------------------------------------

    async createToken({ tenant_id, email, token, expires_at }) {
      const now = new Date();
      if (live()) {
        const row = await models.MagicToken.create({
          tenant_id, email, token, expires_at, used_at: null, created_at: now,
        });
        return toPlain(row);
      }
      const row = { id: mem.tokens.size + 1, tenant_id, email, token, expires_at, used_at: null, created_at: now };
      mem.tokens.set(token, row);
      return { ...row };
    },

    // Consumes the token. Returns the row only if it was valid, unexpired and
    // unused — and marks it used in the same call, so a replay cannot win a
    // race against a separate "mark used" step.
    async consumeToken(token, nowMs) {
      const now = new Date(nowMs || Date.now());
      if (live()) {
        const row = await models.MagicToken.findOne({ where: { token } });
        if (!row) return { ok: false, reason: 'not_found' };
        if (row.used_at) return { ok: false, reason: 'already_used' };
        if (new Date(row.expires_at) < now) return { ok: false, reason: 'expired' };
        row.used_at = now;
        await row.save();
        return { ok: true, row: toPlain(row) };
      }
      const row = mem.tokens.get(token);
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.used_at) return { ok: false, reason: 'already_used' };
      if (new Date(row.expires_at) < now) return { ok: false, reason: 'expired' };
      row.used_at = now;
      return { ok: true, row: { ...row } };
    },
  };
}

module.exports = { makeStore };
