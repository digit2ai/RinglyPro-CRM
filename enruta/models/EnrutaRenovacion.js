/**
 * EnrutaRenovacion Model
 * Tracks the renewal process pipeline
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnrutaRenovacion = sequelize.define('EnrutaRenovacion', {
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
    documento_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    contacto_id: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // Renewal Pipeline Status
    estado_renovacion: {
      type: DataTypes.STRING(30),
      defaultValue: 'iniciada',
      validate: {
        isIn: [[
          'iniciada',
          'cita_agendada',
          'reuniendo_documentos',
          'documentos_entregados',
          'examen_medico_pendiente',
          'examen_medico_completado',
          'curso_cea_pendiente',
          'curso_cea_completado',
          'pago_pendiente',
          'pago_completado',
          'en_proceso',
          'completada',
          'cancelada',
          'fallida'
        ]]
      }
    },

    // Appointment Details
    fecha_cita: {
      type: DataTypes.DATE,
      allowNull: true
    },
    sede_cita: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Name and address of the location'
    },
    referencia_cita: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    // Financial Information
    costo_estimado_cop: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    costo_real_cop: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    metodo_pago: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: [['efectivo', 'tarjeta', 'PSE', 'Nequi', 'Daviplata']]
      }
    },
    referencia_pago: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    // New Document Information (after renewal)
    nuevo_numero_documento: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    nueva_fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // Tracking
    notas: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    historial_estados: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of {estado, fecha, nota}'
    },

    // Timestamps
    iniciada_en: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    completada_en: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'enruta_renovaciones',
    timestamps: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [
      { fields: ['cliente_id'] },
      { fields: ['documento_id'] },
      { fields: ['tenant_id', 'estado_renovacion'] },
      {
        fields: ['tenant_id', 'fecha_cita'],
        where: { fecha_cita: { [require('sequelize').Op.ne]: null } }
      }
    ]
  });

  EnrutaRenovacion.associate = (models) => {
    EnrutaRenovacion.belongsTo(models.EnrutaCliente, {
      foreignKey: 'cliente_id',
      as: 'cliente'
    });
    EnrutaRenovacion.belongsTo(models.EnrutaDocumento, {
      foreignKey: 'documento_id',
      as: 'documento'
    });
    EnrutaRenovacion.belongsTo(models.EnrutaRegistroContacto, {
      foreignKey: 'contacto_id',
      as: 'contacto'
    });
  };

  // Instance method to update status with history
  EnrutaRenovacion.prototype.actualizarEstado = async function(nuevoEstado, nota = null) {
    const historial = this.historial_estados || [];
    historial.push({
      estado: nuevoEstado,
      fecha: new Date().toISOString(),
      nota: nota
    });

    this.estado_renovacion = nuevoEstado;
    this.historial_estados = historial;

    if (nuevoEstado === 'completada') {
      this.completada_en = new Date();
    }

    await this.save();
    return this;
  };

  return EnrutaRenovacion;
};
