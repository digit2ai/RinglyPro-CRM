// kancho-ai/models/KanchoAppointment.js
// Native appointment entity for Kancho AI (replaces RinglyPro Appointment bridge)

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoAppointment = sequelize.define('KanchoAppointment', {
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
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'kancho_students',
        key: 'id'
      }
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'kancho_leads',
        key: 'id'
      }
    },
    customer_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    customer_phone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    customer_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    appointment_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    appointment_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    duration: {
      type: DataTypes.INTEGER,
      defaultValue: 60
    },
    purpose: {
      type: DataTypes.TEXT,
      defaultValue: 'Class trial'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'confirmed'
    },
    confirmation_code: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    source: {
      type: DataTypes.STRING(50),
      defaultValue: 'manual'
    },
    deposit_status: {
      type: DataTypes.STRING(20),
      defaultValue: 'not_required'
    },
    notes: {
      type: DataTypes.TEXT,
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
    tableName: 'kancho_appointments',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['appointment_date'] },
      { fields: ['status'] }
    ]
  });

  KanchoAppointment.associate = (models) => {
    KanchoAppointment.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoAppointment.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
    KanchoAppointment.belongsTo(models.KanchoLead, { foreignKey: 'lead_id', as: 'lead' });
  };

  return KanchoAppointment;
};
