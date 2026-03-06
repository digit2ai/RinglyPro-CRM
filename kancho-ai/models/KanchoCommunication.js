// kancho-ai/models/KanchoCommunication.js
// Communications hub - SMS, email, and call log tracking

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoCommunication = sequelize.define('KanchoCommunication', {
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
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'sms, email, voice, push'
    },
    direction: {
      type: DataTypes.STRING(10),
      defaultValue: 'outbound',
      comment: 'inbound, outbound'
    },
    from_number: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    to_number: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    from_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    to_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'sent',
      comment: 'queued, sent, delivered, failed, opened, clicked, bounced'
    },
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_students', key: 'id' }
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_leads', key: 'id' }
    },
    automation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_automations', key: 'id' }
    },
    campaign: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    template_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    external_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Twilio SID or email provider message ID'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_communications',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['channel'] },
      { fields: ['student_id'] },
      { fields: ['lead_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] }
    ]
  });

  KanchoCommunication.associate = (models) => {
    KanchoCommunication.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoCommunication.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
    KanchoCommunication.belongsTo(models.KanchoLead, { foreignKey: 'lead_id', as: 'lead' });
    KanchoCommunication.belongsTo(models.KanchoAutomation, { foreignKey: 'automation_id', as: 'automation' });
  };

  return KanchoCommunication;
};
