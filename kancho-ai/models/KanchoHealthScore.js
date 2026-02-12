// kancho-ai/models/KanchoHealthScore.js
// Health scoring for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoHealthScore = sequelize.define('KanchoHealthScore', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'kancho_schools',
        key: 'id'
      }
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    retention_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    revenue_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lead_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    attendance_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    engagement_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    growth_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    overall_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    grade: {
      type: DataTypes.CHAR(1),
      defaultValue: 'C',
      validate: {
        isIn: [['A', 'B', 'C', 'D', 'F']]
      }
    },
    metrics: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    insights: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: []
    },
    alerts: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: []
    },
    vs_last_week: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    vs_last_month: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_health_scores',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['date'] },
      { fields: ['overall_score'] },
      { fields: ['grade'] },
      { unique: true, fields: ['school_id', 'date'] }
    ]
  });

  KanchoHealthScore.associate = (models) => {
    KanchoHealthScore.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return KanchoHealthScore;
};
