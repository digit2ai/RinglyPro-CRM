// =====================================================
// models/template.js — a seeded gallery entry.
//
// Table: ai_agent_prompt_builder_for_data_writing_templates
//
// The gallery is READ-ONLY and seeded (no user-authored publishing this
// sprint). It still carries tenant_id — every table in this app does, per the
// convention — with the seeded set owned by tenant 0, the shared/system tenant.
// Reads return `tenant_id IN (0, <caller>)`, so the day a tenant authors their
// own template it slots in with no migration.
//
// `slug` is the stable identifier the wizard loads by; it is unique per tenant,
// which is what makes re-seeding on every boot an upsert rather than a
// duplicate-row generator.
// =====================================================

'use strict';

module.exports = (sequelize, DataTypes) => {
  const Template = sequelize.define('PromptBuilderTemplate', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    slug: { type: DataTypes.STRING(100), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    category: { type: DataTypes.STRING(60), allowNull: true },
    summary: { type: DataTypes.TEXT, allowNull: true },

    // The wizard-shaped payload this template loads into the form.
    definition: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'ai_agent_prompt_builder_for_data_writing_templates',
    timestamps: false,
    freezeTableName: true
  });

  return Template;
};
