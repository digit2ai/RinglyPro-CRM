// kancho-ai/models/KanchoSchool.js
// School/dojo entity for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoSchool = sequelize.define('KanchoSchool', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Multi-tenant isolation'
    },
    external_id: {
      type: DataTypes.STRING(100),
      allowNull: true
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
      allowNull: true
    },
    plan_type: {
      type: DataTypes.STRING(20),
      defaultValue: 'starter',
      validate: {
        isIn: [['starter', 'growth', 'pro', 'enterprise']]
      }
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
      defaultValue: {}
    },
    ai_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    voice_agent: {
      type: DataTypes.STRING(20),
      defaultValue: 'kancho',
      validate: {
        isIn: [['kancho', 'maestro', 'both', 'none']]
      }
    },
    ringlypro_client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Links to RinglyPro clients table for white-label CRM/voice integration'
    },
    ringlypro_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Links to RinglyPro users table for auth bridge'
    },
    ronin_member_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Links to ronin_members table for federation integration'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'trial',
      validate: {
        isIn: [['active', 'inactive', 'trial', 'suspended']]
      }
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
    tableName: 'kancho_schools',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['external_id'] },
      { fields: ['status'] },
      { fields: ['martial_art_type'] }
    ]
  });

  KanchoSchool.associate = (models) => {
    KanchoSchool.hasMany(models.KanchoStudent, { foreignKey: 'school_id', as: 'students' });
    KanchoSchool.hasMany(models.KanchoLead, { foreignKey: 'school_id', as: 'leads' });
    KanchoSchool.hasMany(models.KanchoClass, { foreignKey: 'school_id', as: 'classes' });
    KanchoSchool.hasMany(models.KanchoRevenue, { foreignKey: 'school_id', as: 'revenue' });
    KanchoSchool.hasMany(models.KanchoHealthScore, { foreignKey: 'school_id', as: 'healthScores' });
    KanchoSchool.hasMany(models.KanchoAiCall, { foreignKey: 'school_id', as: 'aiCalls' });
    KanchoSchool.hasMany(models.KanchoBusinessHealthMetrics, { foreignKey: 'school_id', as: 'businessHealthMetrics' });
    KanchoSchool.hasMany(models.KanchoAppointment, { foreignKey: 'school_id', as: 'appointments' });
  };

  return KanchoSchool;
};
