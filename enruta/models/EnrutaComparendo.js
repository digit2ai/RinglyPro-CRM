/**
 * EnrutaComparendo Model
 * Traffic tickets and fines tracking
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnrutaComparendo = sequelize.define('EnrutaComparendo', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    cliente_id: {
      type: DataTypes.UUID,
      allowNull: false
    },

    // Ticket Details
    numero_comparendo: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    fecha_comparendo: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    tipo_infraccion: {
      type: DataTypes.STRING(5),
      allowNull: true,
      validate: {
        isIn: [['A', 'B', 'C', 'D', 'E']]
      },
      comment: 'Colombian fine categories'
    },
    descripcion_infraccion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    valor_multa_cop: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    // Status
    estado: {
      type: DataTypes.STRING(30),
      defaultValue: 'pendiente',
      validate: {
        isIn: [['pendiente', 'en_proceso', 'curso_pedagogico', 'pagado', 'resuelto']]
      }
    },

    // Pedagogical Course
    curso_realizado: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_curso: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    descuento_aplicado: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Discount percentage (up to 50%)'
    },

    // Payment Information
    valor_pagado_cop: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    fecha_pago: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    referencia_pago: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    // SIMIT Verification
    verificado_simit: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_verificacion_simit: {
      type: DataTypes.DATE,
      allowNull: true
    },

    notas: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'enruta_comparendos',
    timestamps: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [
      { fields: ['cliente_id'] },
      { fields: ['tenant_id', 'estado'] }
    ]
  });

  EnrutaComparendo.associate = (models) => {
    EnrutaComparendo.belongsTo(models.EnrutaCliente, {
      foreignKey: 'cliente_id',
      as: 'cliente'
    });
  };

  return EnrutaComparendo;
};
