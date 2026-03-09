'use strict';

module.exports = (sequelize, DataTypes) => {
  const ApiKey = sequelize.define('LogisticsApiKey', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    key_prefix: {
      type: DataTypes.STRING(12),
      allowNull: false,
      comment: 'First 12 chars of key for identification (pnx_ + 8 hex)'
    },
    key_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'bcrypt hash of the full API key'
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: 'Production API Key'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    request_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Optional expiration date'
    }
  }, {
    tableName: 'logistics_api_keys',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['key_prefix'] },
      { fields: ['is_active'] }
    ]
  });

  ApiKey.associate = (models) => {
    ApiKey.belongsTo(models.LogisticsProject, { foreignKey: 'project_id', as: 'project' });
  };

  return ApiKey;
};
