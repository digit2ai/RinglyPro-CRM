// kancho-ai/models/KanchoStudent.js
// Student/member entity for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoStudent = sequelize.define('KanchoStudent', {
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
      allowNull: true
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
      defaultValue: 0
    },
    total_classes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    membership_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    monthly_rate: {
      type: DataTypes.DECIMAL(8, 2),
      defaultValue: 0
    },
    lifetime_value: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'inactive', 'frozen', 'cancelled', 'prospect']]
      }
    },
    churn_risk: {
      type: DataTypes.STRING(20),
      defaultValue: 'low',
      validate: {
        isIn: [['low', 'medium', 'high', 'critical']]
      }
    },
    churn_risk_score: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0
    },
    last_payment_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    payment_status: {
      type: DataTypes.STRING(20),
      defaultValue: 'current',
      validate: {
        isIn: [['current', 'past_due', 'failed', 'cancelled']]
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: []
    },
    emergency_contact: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    parent_guardian: {
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
    tableName: 'kancho_students',
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

  KanchoStudent.associate = (models) => {
    KanchoStudent.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoStudent.hasMany(models.KanchoRevenue, { foreignKey: 'student_id', as: 'payments' });
    KanchoStudent.hasMany(models.KanchoAiCall, { foreignKey: 'student_id', as: 'calls' });
    KanchoStudent.hasMany(models.KanchoAttendance, { foreignKey: 'student_id', as: 'attendance' });
  };

  return KanchoStudent;
};
