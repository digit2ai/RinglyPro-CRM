/**
 * EnrutaDocumento Model
 * Stores vehicle and driving documents (licenses, RTMyEC, SOAT, etc.)
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnrutaDocumento = sequelize.define('EnrutaDocumento', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    cliente_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false
    },

    // Document Type
    tipo_documento: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [[
          'licencia_conduccion',
          'soat',
          'revision_tecnicomecanica',
          'tarjeta_propiedad',
          'impuesto_vehicular',
          'registro_runt'
        ]]
      }
    },

    // Document Details
    numero_documento: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    fecha_expedicion: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    // License-Specific Fields
    categoria_licencia: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'A1, A2, B1, B2, B3, C1, C2, C3'
    },
    restriccion_licencia: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'e.g., uso de lentes correctivos'
    },
    tipo_servicio: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['particular', 'publico']]
      }
    },
    organismo_expedicion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    // Vehicle-Specific Fields
    placa_vehiculo: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Colombian format: ABC123 or ABC-123'
    },
    marca_vehiculo: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., Chevrolet, Renault, Mazda, KIA'
    },
    linea_vehiculo: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., Spark GT, Logan, Mazda 3'
    },
    modelo_vehiculo: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Year model'
    },
    tipo_vehiculo: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: [[
          'automovil', 'motocicleta', 'camioneta', 'campero',
          'camion', 'bus', 'microbus', 'volqueta'
        ]]
      }
    },
    color_vehiculo: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    numero_vin: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    numero_motor: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    cilindraje: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'In cc'
    },
    tipo_combustible: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: {
        isIn: [['gasolina', 'diesel', 'gas_natural', 'electrico', 'hibrido']]
      }
    },
    servicio_vehiculo: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['particular', 'publico', 'diplomatico', 'oficial']]
      }
    },

    // SOAT-Specific Fields
    aseguradora_soat: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    numero_poliza_soat: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    // RTMyEC-Specific Fields
    cda_ultimo_revision: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'CDA where last revision was done'
    },
    resultado_ultima_revision: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['aprobado', 'rechazado', 'pendiente']]
      }
    },

    // Status Tracking
    estado: {
      type: DataTypes.STRING(30),
      defaultValue: 'vigente',
      validate: {
        isIn: [[
          'vigente',
          'por_vencer_30_dias',
          'por_vencer_15_dias',
          'por_vencer_7_dias',
          'vencido',
          'renovado',
          'suspendido'
        ]]
      }
    },

    // Renewal Information
    costo_estimado_renovacion: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'In COP (Colombian pesos)'
    },
    sede_recomendada: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    requisitos_renovacion: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'JSON array of required documents'
    },

    // Fine Information
    tipo_multa_asociada: {
      type: DataTypes.STRING(5),
      allowNull: true,
      comment: 'A, B, C, D, E (Colombian categories)'
    },
    valor_multa_cop: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Fine value if driving with expired document'
    },
    riesgo_inmovilizacion: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    // Metadata
    notas: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    verificado_runt: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'If verified against RUNT'
    },
    ultima_actualizacion_estado: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'enruta_documentos',
    timestamps: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [
      { fields: ['cliente_id'] },
      { fields: ['tenant_id', 'fecha_vencimiento'] },
      { fields: ['tenant_id', 'estado'] },
      { fields: ['tenant_id', 'tipo_documento'] },
      { fields: ['placa_vehiculo'] },
      {
        fields: ['tenant_id', 'estado', 'fecha_vencimiento'],
        where: {
          estado: ['por_vencer_30_dias', 'por_vencer_15_dias', 'por_vencer_7_dias', 'vencido']
        }
      }
    ]
  });

  EnrutaDocumento.associate = (models) => {
    EnrutaDocumento.belongsTo(models.EnrutaCliente, {
      foreignKey: 'cliente_id',
      as: 'cliente'
    });
    EnrutaDocumento.hasMany(models.EnrutaRegistroContacto, {
      foreignKey: 'documento_id',
      as: 'contactos'
    });
    EnrutaDocumento.hasMany(models.EnrutaRenovacion, {
      foreignKey: 'documento_id',
      as: 'renovaciones'
    });
  };

  return EnrutaDocumento;
};
