// spark-ai/models/SparkRevenue.js
// Revenue tracking for martial arts schools

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SparkRevenue = sequelize.define('SparkRevenue', {
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
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('membership', 'retail', 'event', 'private_lesson', 'testing_fee', 'other'),
      allowNull: false
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Sub-category for more detail'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'spark_students', key: 'id' }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    payment_method: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Card, Cash, ACH, Check, etc.'
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
      defaultValue: 'manual',
      comment: 'manual, spark_membership, stripe, square, etc.'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'spark_revenue',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['date'] },
      { fields: ['type'] },
      { fields: ['student_id'] },
      { fields: ['school_id', 'date'] }
    ]
  });

  SparkRevenue.associate = (models) => {
    SparkRevenue.belongsTo(models.SparkSchool, { foreignKey: 'school_id', as: 'school' });
    SparkRevenue.belongsTo(models.SparkStudent, { foreignKey: 'student_id', as: 'student' });
  };

  return SparkRevenue;
};
