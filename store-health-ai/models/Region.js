'use strict';

module.exports = (sequelize, DataTypes) => {
  const Region = sequelize.define('Region', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    organization_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    manager_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    manager_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    manager_phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    tableName: 'regions',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Region.associate = (models) => {
    Region.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });
    Region.hasMany(models.District, {
      foreignKey: 'region_id',
      as: 'districts'
    });
    Region.hasMany(models.Store, {
      foreignKey: 'region_id',
      as: 'stores'
    });
  };

  return Region;
};
