'use strict';

module.exports = (sequelize, DataTypes) => {
  const District = sequelize.define('District', {
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
    region_id: {
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
    tableName: 'districts',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  District.associate = (models) => {
    District.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });
    District.belongsTo(models.Region, {
      foreignKey: 'region_id',
      as: 'region'
    });
    District.hasMany(models.Store, {
      foreignKey: 'district_id',
      as: 'stores'
    });
  };

  return District;
};
