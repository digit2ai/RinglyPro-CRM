// =====================================================
// models/agent.js — a saved agent definition, scoped to one tenant.
//
// Table: ai_agent_prompt_builder_for_data_writing_agents
//
// The JSON-shaped fields (data_sources, instructions, constraints,
// output_schema) are JSONB, not text — the wizard round-trips them as arrays
// and objects, and JSONB means a saved agent loads back into the form without a
// parse step that could fail on a value we ourselves wrote.
//
// timestamps:false — the DDL owns created_at/updated_at with DEFAULT NOW(), so
// the columns exist regardless of which writer touched the row.
// =====================================================

'use strict';

module.exports = (sequelize, DataTypes) => {
  const Agent = sequelize.define('PromptBuilderAgent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Multi-tenant isolation. NOT NULL, indexed, and filtered on every query.
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },

    name: { type: DataTypes.STRING(200), allowNull: false },
    role: { type: DataTypes.STRING(500), allowNull: true },
    goal: { type: DataTypes.TEXT, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },

    data_sources: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    instructions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    constraints: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    output_schema: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

    // Which seeded template this agent started from, if any. Read-only
    // provenance; the gallery itself is never mutated by a save.
    source_template: { type: DataTypes.STRING(100), allowNull: true },

    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'ai_agent_prompt_builder_for_data_writing_agents',
    timestamps: false,
    // No `indexes:` block on purpose. sequelize.sync() would re-issue
    // CREATE INDEX on every boot with a generated name derived from this very
    // long table name; those names truncate at Postgres's 63-char identifier
    // limit and collide with the previous boot's. The idempotent migration
    // owns the indexes with short, explicit names instead.
    freezeTableName: true
  });

  return Agent;
};
