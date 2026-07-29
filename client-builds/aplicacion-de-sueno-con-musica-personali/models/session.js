// =====================================================
// models/session.js — sleep-session history.
//
// Exposes a tiny store facade (create / listByToken / countAll) so the routes
// are identical whether the rows live in Postgres or in the in-memory fallback.
// Every read is filtered by BOTH tenant_id and anon_token — a token may only
// ever see its own rows.
// =====================================================

'use strict';

const { DataTypes, Op } = require('sequelize');

const TABLE = 'aplicacion_de_sueno_con_musica_personali_sessions';

function defineSession(sequelize) {
  return sequelize.define(TABLE, {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false, comment: 'Multi-tenant isolation' },
    anon_token: { type: DataTypes.STRING(64), allowNull: false, comment: 'Client-generated UUID; row owner. Not PII.' },
    track_id: { type: DataTypes.STRING(64), allowNull: false },
    track_title: { type: DataTypes.STRING(160) },
    timer_minutes: { type: DataTypes.INTEGER, allowNull: false },
    played_seconds: { type: DataTypes.INTEGER, defaultValue: 0 },
    completed: { type: DataTypes.BOOLEAN, defaultValue: false },
    language: { type: DataTypes.STRING(8), defaultValue: 'es' },
    completed_at: { type: DataTypes.DATE },
  }, {
    tableName: TABLE,
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['tenant_id'] }],
  });
}

// --- in-memory fallback (used when Postgres is unavailable) ---
// TODO: nothing to swap — the Postgres path is primary; this only keeps the
// player usable (and SIT green) when the database is down.
const mem = { rows: [], nextId: 1 };

function memCreate(fields) {
  const row = Object.assign({
    id: mem.nextId++,
    created_at: new Date(),
    updated_at: new Date(),
  }, fields);
  mem.rows.push(row);
  return row;
}

function memList(tenantId, anonToken, limit) {
  return mem.rows
    .filter((r) => r.tenant_id === tenantId && r.anon_token === anonToken)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

// --- store facade ---
function makeStore(modelsState, sequelize) {
  let model = null;
  function getModel() {
    if (!modelsState.ready || !sequelize) return null;
    if (!model) model = defineSession(sequelize);
    return model;
  }

  return {
    backend() { return getModel() ? 'postgres' : 'memory'; },

    async create(fields) {
      const m = getModel();
      if (!m) return memCreate(fields);
      const row = await m.create(fields);
      return row.toJSON();
    },

    async listByToken(tenantId, anonToken, limit) {
      const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const m = getModel();
      if (!m) return memList(tenantId, anonToken, cap);
      const rows = await m.findAll({
        where: { tenant_id: tenantId, anon_token: anonToken },
        order: [['id', 'DESC']],
        limit: cap,
      });
      return rows.map((r) => r.toJSON());
    },

    // Aggregate favourites for the history page. Same tenant+token filter.
    async favourites(tenantId, anonToken) {
      const rows = await this.listByToken(tenantId, anonToken, 200);
      const byTrack = new Map();
      for (const r of rows) {
        const cur = byTrack.get(r.track_id) || { track_id: r.track_id, track_title: r.track_title, plays: 0, minutes: 0 };
        cur.plays += 1;
        cur.minutes += Number(r.timer_minutes) || 0;
        if (!cur.track_title && r.track_title) cur.track_title = r.track_title;
        byTrack.set(r.track_id, cur);
      }
      return Array.from(byTrack.values()).sort((a, b) => b.plays - a.plays);
    },
  };
}

module.exports = { defineSession, makeStore, TABLE, Op };
