// src/models/NeuralInsight.js - RinglyPro Neural Intelligence Layer
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NeuralInsight = sequelize.define('NeuralInsight', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  clientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'client_id',
    comment: 'Multi-tenant isolation'
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [[
        'missed_revenue',
        'call_conversion',
        'lead_response',
        'scheduling',
        'voice_conversation',
        'lead_source',
        'outbound_campaign',
        'customer_sentiment',
        'script_optimization',
        'revenue_forecast'
      ]]
    },
    comment: 'Insight category type'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Short insight title for the card'
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Human-readable insight summary'
  },
  evidence: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Supporting data points and metrics'
  },
  impact: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'medium',
    validate: {
      isIn: [['critical', 'high', 'medium', 'low']]
    },
    comment: 'Estimated business impact level'
  },
  impactEstimate: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'impact_estimate',
    comment: 'Estimated business impact description (e.g. "5-7 lost bookings")'
  },
  recommendedAction: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'recommended_action',
    comment: 'Specific actionable recommendation'
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'active',
    validate: {
      isIn: [['active', 'acknowledged', 'resolved', 'dismissed']]
    }
  },
  analysisDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'analysis_date',
    comment: 'Date the analysis covers'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional analysis metadata'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at',
    comment: 'When this insight should auto-expire'
  }
}, {
  tableName: 'neural_insights',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['client_id'] },
    { fields: ['category'] },
    { fields: ['impact'] },
    { fields: ['status'] },
    { fields: ['analysis_date'] },
    { fields: ['client_id', 'category', 'analysis_date'] }
  ]
});

module.exports = NeuralInsight;
