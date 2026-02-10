// spark-ai/models/SparkSchool.js
// Martial Arts School entity - core of the Spark ecosystem

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SparkSchool = sequelize.define('SparkSchool', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Multi-tenant isolation - links to RinglyPro client'
    },
    external_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'External ID from Spark Membership or other system'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    owner_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    owner_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    owner_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    zip: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(50),
      defaultValue: 'USA'
    },
    timezone: {
      type: DataTypes.STRING(50),
      defaultValue: 'America/New_York'
    },
    martial_art_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'BJJ, Karate, Taekwondo, MMA, Kickboxing, etc.'
    },
    plan_type: {
      type: DataTypes.ENUM('starter', 'growth', 'pro', 'enterprise'),
      defaultValue: 'starter'
    },
    monthly_revenue_target: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    student_capacity: {
      type: DataTypes.INTEGER,
      defaultValue: 100
    },
    active_students: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    logo_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'School-specific settings (notification preferences, AI config, etc.)'
    },
    ai_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    voice_agent: {
      type: DataTypes.ENUM('sensei', 'maestro', 'both', 'none'),
      defaultValue: 'sensei',
      comment: 'Which voice agent is active for this school'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'trial', 'suspended'),
      defaultValue: 'trial'
    },
    trial_ends_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'spark_schools',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['external_id'] },
      { fields: ['status'] },
      { fields: ['martial_art_type'] }
    ]
  });

  SparkSchool.associate = (models) => {
    SparkSchool.hasMany(models.SparkStudent, { foreignKey: 'school_id', as: 'students' });
    SparkSchool.hasMany(models.SparkLead, { foreignKey: 'school_id', as: 'leads' });
    SparkSchool.hasMany(models.SparkClass, { foreignKey: 'school_id', as: 'classes' });
    SparkSchool.hasMany(models.SparkRevenue, { foreignKey: 'school_id', as: 'revenue' });
    SparkSchool.hasMany(models.SparkHealthScore, { foreignKey: 'school_id', as: 'healthScores' });
    SparkSchool.hasMany(models.SparkAiCall, { foreignKey: 'school_id', as: 'aiCalls' });
  };

  return SparkSchool;
};
