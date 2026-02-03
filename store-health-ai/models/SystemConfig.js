'use strict';

module.exports = (sequelize, DataTypes) => {
  const SystemConfig = sequelize.define('SystemConfig', {
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
    config_key: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    config_value: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    updated_by: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'system_config',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'config_key']
      },
      {
        fields: ['config_key']
      }
    ]
  });

  SystemConfig.associate = (models) => {
    SystemConfig.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });
  };

  return SystemConfig;
};
