// kancho-ai/models/KanchoPromotion.js
// Belt promotion history tracking

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoPromotion = sequelize.define('KanchoPromotion', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    from_belt: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    to_belt: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    promotion_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    promoted_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'instructor_id who promoted'
    },
    testing_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Test score percentage if applicable'
    },
    testing_fee_paid: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    payment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Links to kancho_payments for testing fee'
    },
    classes_at_promotion: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total classes attended at time of promotion'
    },
    months_training: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    certificate_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_promotions',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['student_id'] },
      { fields: ['promotion_date'] }
    ]
  });

  KanchoPromotion.associate = (models) => {
    KanchoPromotion.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
    KanchoPromotion.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return KanchoPromotion;
};
