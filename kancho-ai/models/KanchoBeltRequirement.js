// kancho-ai/models/KanchoBeltRequirement.js
// Belt promotion requirements defined by school

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoBeltRequirement = sequelize.define('KanchoBeltRequirement', {
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
    belt_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    belt_color: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    min_classes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    min_months: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    requirements: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    testing_fee: {
      type: DataTypes.DECIMAL(8, 2),
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_belt_requirements',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['school_id', 'sort_order'] }
    ]
  });

  KanchoBeltRequirement.associate = (models) => {
    KanchoBeltRequirement.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return KanchoBeltRequirement;
};
