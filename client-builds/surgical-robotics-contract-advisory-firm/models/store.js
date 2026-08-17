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
    nextScenarioId: 1,
  };

  const live = () => state.ready && models && models.Scenario;

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

  };
}

module.exports = { makeStore };
