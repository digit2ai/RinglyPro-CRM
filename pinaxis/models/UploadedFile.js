'use strict';

module.exports = (sequelize, DataTypes) => {
  const UploadedFile = sequelize.define('PinaxisUploadedFile', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    file_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['item_master', 'inventory', 'goods_in', 'goods_out']]
      }
    },
    original_filename: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    row_count: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    column_count: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    parse_status: {
      type: DataTypes.STRING(50),
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'parsing', 'parsed', 'error']]
      }
    },
    parse_errors: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    plausibility_warnings: {
      type: DataTypes.JSONB,
      defaultValue: []
    }
  }, {
    tableName: 'pinaxis_uploaded_files',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'file_type'] }
    ]
  });

  UploadedFile.associate = (models) => {
    UploadedFile.belongsTo(models.PinaxisProject, { foreignKey: 'project_id', as: 'project' });
  };

  return UploadedFile;
};
