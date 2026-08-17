// =====================================================
// models/scenario.js — srcaf_scenarios
//
// The table prefix is `srcaf_`, not the full slug. Postgres truncates
// identifiers at 63 bytes and Sequelize builds index and constraint names by
// appending to the table name, so
// `surgical_robotics_contract_advisory_firm_scenarios_tenant_id_idx` overflows
// and silently truncates — which is how two indexes end up colliding on one
// name. The mount path keeps the long slug; only the SQL identifiers shorten.
//
// `inputs` and `projections` are both stored. Storing only the inputs would
// mean a model change silently rewrites a saved scenario Greg already showed
// someone; storing only the projections would make it unreproducible. Keeping
// both, with the model version alongside, makes a saved scenario an artifact
// rather than a query.
// =====================================================

'use strict';

const { DataTypes } = require('sequelize');

const TABLE = 'srcaf_scenarios';

function defineScenario(sequelize) {
  return sequelize.define('SrcafScenario', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    owner_email: { type: DataTypes.STRING(255), allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    inputs: { type: DataTypes.JSONB, allowNull: false },
    projections: { type: DataTypes.JSONB, allowNull: false },
    model_version: { type: DataTypes.STRING(20), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [{ name: 'idx_srcaf_scenarios_tenant', fields: ['tenant_id'] }],
  });
}

module.exports = { defineScenario, TABLE };
