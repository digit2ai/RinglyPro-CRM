// spark-ai/models/SparkStudent.js
// Student/Member entity for martial arts schools

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SparkStudent = sequelize.define('SparkStudent', {
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
    external_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'External ID from Spark Membership'
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    belt_rank: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'White, Yellow, Orange, Green, Blue, Purple, Brown, Black, etc.'
    },
    belt_stripes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    enrollment_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    last_attendance: {
      type: DataTypes.DATE,
      allowNull: true
    },
    attendance_streak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Consecutive weeks with at least one class'
    },
    total_classes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    membership_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Unlimited, 2x/week, 3x/week, Family, etc.'
    },
    monthly_rate: {
      type: DataTypes.DECIMAL(8, 2),
      defaultValue: 0
    },
    lifetime_value: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Total revenue from this student'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'frozen', 'cancelled', 'prospect'),
      defaultValue: 'active'
    },
    churn_risk: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'low',
      comment: 'AI-calculated churn risk'
    },
    churn_risk_score: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: '0-100 score for churn probability'
    },
    last_payment_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    payment_status: {
      type: DataTypes.ENUM('current', 'past_due', 'failed', 'cancelled'),
      defaultValue: 'current'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    emergency_contact: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Emergency contact info for minors'
    },
    parent_guardian: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Parent/guardian info if student is a minor'
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
    tableName: 'spark_students',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['external_id'] },
      { fields: ['email'] },
      { fields: ['phone'] },
      { fields: ['status'] },
      { fields: ['churn_risk'] },
      { fields: ['belt_rank'] }
    ]
  });

  SparkStudent.associate = (models) => {
    SparkStudent.belongsTo(models.SparkSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return SparkStudent;
};
