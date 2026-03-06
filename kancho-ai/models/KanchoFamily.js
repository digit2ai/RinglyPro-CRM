// kancho-ai/models/KanchoFamily.js
// Family/household grouping for parent accounts and family billing

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoFamily = sequelize.define('KanchoFamily', {
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
    family_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    primary_contact_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    primary_contact_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    primary_contact_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    secondary_contact_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    secondary_contact_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    secondary_contact_email: {
      type: DataTypes.STRING(255),
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
    billing_method: {
      type: DataTypes.STRING(30),
      defaultValue: 'combined',
      comment: 'combined (one invoice), separate (per student)'
    },
    stripe_customer_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
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
    tableName: 'kancho_families',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['is_active'] }
    ]
  });

  KanchoFamily.associate = (models) => {
    KanchoFamily.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoFamily.hasMany(models.KanchoStudent, { foreignKey: 'family_id', as: 'members' });
    KanchoFamily.hasMany(models.KanchoSubscription, { foreignKey: 'family_id', as: 'subscriptions' });
    KanchoFamily.hasMany(models.KanchoPayment, { foreignKey: 'family_id', as: 'payments' });
  };

  return KanchoFamily;
};
