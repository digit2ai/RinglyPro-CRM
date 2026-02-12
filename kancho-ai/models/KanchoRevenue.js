// kancho-ai/models/KanchoRevenue.js
// Revenue tracking for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoRevenue = sequelize.define('KanchoRevenue', {
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
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['membership', 'retail', 'event', 'private_lesson', 'testing_fee', 'other']]
      }
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'kancho_students',
        key: 'id'
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    payment_method: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    is_recurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    source: {
      type: DataTypes.STRING(100),
      defaultValue: 'manual'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_revenue',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['date'] },
      { fields: ['type'] },
      { fields: ['student_id'] },
      { fields: ['school_id', 'date'] }
    ]
  });

  KanchoRevenue.associate = (models) => {
    KanchoRevenue.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoRevenue.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
  };

  return KanchoRevenue;
};
