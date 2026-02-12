// kancho-ai/models/KanchoLead.js
// Lead/prospect entity for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoLead = sequelize.define('KanchoLead', {
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
      allowNull: true
    },
    campaign: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    interest: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'new',
      validate: {
        isIn: [['new', 'contacted', 'trial_scheduled', 'trial_completed', 'follow_up', 'converted', 'lost', 'unresponsive']]
      }
    },
    lead_score: {
      type: DataTypes.INTEGER,
      defaultValue: 50
    },
    temperature: {
      type: DataTypes.STRING(10),
      defaultValue: 'warm',
      validate: {
        isIn: [['hot', 'warm', 'cold']]
      }
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
      type: DataTypes.STRING(20),
      defaultValue: 'any',
      validate: {
        isIn: [['phone', 'email', 'sms', 'any']]
      }
    },
    best_time_to_call: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ai_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
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
      allowNull: true
    },
    converted_to_student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'kancho_students',
        key: 'id'
      }
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
    tableName: 'kancho_leads',
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

  KanchoLead.associate = (models) => {
    KanchoLead.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoLead.belongsTo(models.KanchoStudent, { foreignKey: 'converted_to_student_id', as: 'convertedStudent' });
    KanchoLead.hasMany(models.KanchoAiCall, { foreignKey: 'lead_id', as: 'calls' });
  };

  return KanchoLead;
};
