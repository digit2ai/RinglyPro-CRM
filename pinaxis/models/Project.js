'use strict';

module.exports = (sequelize, DataTypes) => {
  const Project = sequelize.define('PinaxisProject', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    contact_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    contact_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    business_info: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Shift schedules, growth forecast, VAS, regulations'
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'uploading', 'validating', 'analyzing', 'completed', 'error']]
      }
    },
    analysis_started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    analysis_completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'pinaxis_projects',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['status'] },
      { unique: true, fields: ['project_code'] }
    ]
  });

  Project.associate = (models) => {
    Project.hasMany(models.PinaxisUploadedFile, { foreignKey: 'project_id', as: 'files' });
    Project.hasMany(models.PinaxisItemMaster, { foreignKey: 'project_id', as: 'items' });
    Project.hasMany(models.PinaxisInventoryData, { foreignKey: 'project_id', as: 'inventory' });
    Project.hasMany(models.PinaxisGoodsInData, { foreignKey: 'project_id', as: 'goodsIn' });
    Project.hasMany(models.PinaxisGoodsOutData, { foreignKey: 'project_id', as: 'goodsOut' });
    Project.hasMany(models.PinaxisAnalysisResult, { foreignKey: 'project_id', as: 'results' });
    Project.hasMany(models.PinaxisProductRecommendation, { foreignKey: 'project_id', as: 'recommendations' });
    Project.hasMany(models.PinaxisApiKey, { foreignKey: 'project_id', as: 'apiKeys' });
  };

  return Project;
};
