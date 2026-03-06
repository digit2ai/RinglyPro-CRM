// kancho-ai/models/KanchoTask.js
// Task management - manual and automation-generated tasks

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoTask = sequelize.define('KanchoTask', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'kancho_schools', key: 'id' }
    },
    automation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_automations', key: 'id' }
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.STRING(30),
      defaultValue: 'general',
      comment: 'general, follow_up, call, meeting, billing, retention, onboarding'
    },
    priority: {
      type: DataTypes.STRING(10),
      defaultValue: 'medium',
      comment: 'low, medium, high, urgent'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      comment: 'pending, in_progress, completed, cancelled, overdue'
    },
    assigned_to: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Instructor/staff name or email'
    },
    related_student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_students', key: 'id' }
    },
    related_lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_leads', key: 'id' }
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    result: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
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
    tableName: 'kancho_tasks',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['status'] },
      { fields: ['due_date'] },
      { fields: ['priority'] },
      { fields: ['automation_id'] }
    ]
  });

  KanchoTask.associate = (models) => {
    KanchoTask.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoTask.belongsTo(models.KanchoAutomation, { foreignKey: 'automation_id', as: 'automation' });
    KanchoTask.belongsTo(models.KanchoStudent, { foreignKey: 'related_student_id', as: 'student' });
    KanchoTask.belongsTo(models.KanchoLead, { foreignKey: 'related_lead_id', as: 'lead' });
  };

  return KanchoTask;
};
