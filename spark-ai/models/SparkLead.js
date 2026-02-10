// spark-ai/models/SparkLead.js
// Lead/Prospect entity for martial arts schools

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SparkLead = sequelize.define('SparkLead', {
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
      allowNull: true
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Website, Facebook, Google, Referral, Walk-in, etc.'
    },
    campaign: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Marketing campaign that generated this lead'
    },
    interest: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'What program/class they are interested in'
    },
    status: {
      type: DataTypes.ENUM('new', 'contacted', 'trial_scheduled', 'trial_completed', 'follow_up', 'converted', 'lost', 'unresponsive'),
      defaultValue: 'new'
    },
    lead_score: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
      comment: '0-100 score indicating likelihood to convert'
    },
    temperature: {
      type: DataTypes.ENUM('hot', 'warm', 'cold'),
      defaultValue: 'warm'
    },
    trial_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    trial_completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    follow_up_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_contact_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    contact_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    preferred_contact_method: {
      type: DataTypes.ENUM('phone', 'email', 'sms', 'any'),
      defaultValue: 'any'
    },
    best_time_to_call: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Morning, Afternoon, Evening'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ai_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Notes from AI voice agent conversations'
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    utm_source: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    utm_medium: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    utm_campaign: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    assigned_to: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Staff member assigned to this lead'
    },
    converted_to_student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'spark_students', key: 'id' }
    },
    conversion_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lost_reason: {
      type: DataTypes.STRING(255),
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
    tableName: 'spark_leads',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['external_id'] },
      { fields: ['email'] },
      { fields: ['phone'] },
      { fields: ['status'] },
      { fields: ['temperature'] },
      { fields: ['lead_score'] },
      { fields: ['follow_up_date'] }
    ]
  });

  SparkLead.associate = (models) => {
    SparkLead.belongsTo(models.SparkSchool, { foreignKey: 'school_id', as: 'school' });
    SparkLead.belongsTo(models.SparkStudent, { foreignKey: 'converted_to_student_id', as: 'convertedStudent' });
  };

  return SparkLead;
};
