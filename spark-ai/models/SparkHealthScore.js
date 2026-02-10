// spark-ai/models/SparkHealthScore.js
// School health scoring for martial arts businesses

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SparkHealthScore = sequelize.define('SparkHealthScore', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'spark_schools', key: 'id' }
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    // Individual component scores (0-100)
    retention_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Student retention health'
    },
    revenue_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Revenue vs target performance'
    },
    lead_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Lead pipeline health'
    },
    attendance_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Class attendance rates'
    },
    engagement_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Student engagement metrics'
    },
    growth_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Month-over-month growth'
    },
    // Overall score
    overall_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Weighted average of all scores'
    },
    grade: {
      type: DataTypes.ENUM('A', 'B', 'C', 'D', 'F'),
      defaultValue: 'C'
    },
    // Key metrics snapshot
    metrics: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Detailed metrics used to calculate scores'
    },
    // AI-generated insights
    insights: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      comment: 'AI-generated insights and recommendations'
    },
    alerts: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: [],
      comment: 'Active alerts for this snapshot'
    },
    // Comparisons
    vs_last_week: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Change from last week (-100 to +100)'
    },
    vs_last_month: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Change from last month'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'spark_health_scores',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['date'] },
      { fields: ['overall_score'] },
      { fields: ['grade'] },
      { unique: true, fields: ['school_id', 'date'] }
    ]
  });

  SparkHealthScore.associate = (models) => {
    SparkHealthScore.belongsTo(models.SparkSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return SparkHealthScore;
};
