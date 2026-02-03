'use strict';

module.exports = (sequelize, DataTypes) => {
  const RiskPrediction = sequelize.define('RiskPrediction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    store_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    prediction_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    target_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    prediction_type: {
      type: DataTypes.ENUM('sales', 'labor', 'inventory', 'overall'),
      allowNull: false
    },
    predicted_status: {
      type: DataTypes.ENUM('green', 'yellow', 'red'),
      allowNull: false
    },
    confidence_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false
    },
    contributing_factors: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    model_version: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    tableName: 'risk_predictions',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['store_id', 'target_date', 'prediction_type']
      },
      {
        fields: ['prediction_date']
      }
    ]
  });

  RiskPrediction.associate = (models) => {
    RiskPrediction.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
  };

  return RiskPrediction;
};
