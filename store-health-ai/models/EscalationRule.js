'use strict';

module.exports = (sequelize, DataTypes) => {
  const EscalationRule = sequelize.define('EscalationRule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    organization_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    kpi_definition_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    trigger_condition: {
      type: DataTypes.ENUM('status_red', 'status_yellow', 'sla_breach', 'predicted_risk', 'multiple_yellow'),
      allowNull: false
    },
    duration_hours: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    from_level: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    to_level: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    action: {
      type: DataTypes.ENUM('create_task', 'send_alert', 'ai_call', 'regional_escalation'),
      allowNull: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'escalation_rules',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  EscalationRule.associate = (models) => {
    EscalationRule.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });
    EscalationRule.belongsTo(models.KpiDefinition, {
      foreignKey: 'kpi_definition_id',
      as: 'kpiDefinition'
    });
  };

  return EscalationRule;
};
