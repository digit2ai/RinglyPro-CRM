/**
 * EnrutaRegistroContacto Model
 * Stores each AI agent call/contact record
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnrutaRegistroContacto = sequelize.define('EnrutaRegistroContacto', {
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
      allowNull: true
    },

    // Call Details
    direccion_llamada: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        isIn: [['saliente', 'entrante']]
      }
    },
    tipo_llamada: {
      type: DataTypes.STRING(30),
      allowNull: true,
      comment: 'recordatorio_30_dias, recordatorio_15_dias, recordatorio_7_dias, aviso_vencido, seguimiento, confirmacion_renovacion, consulta, solicitud_cita, queja, general'
    },

    // Twilio Integration
    call_sid: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Twilio Call SID'
    },
    numero_origen: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    numero_destino: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    duracion_llamada_segundos: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    costo_creditos: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      comment: 'RinglyPro credits consumed'
    },
    url_grabacion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // AI Conversation
    transcripcion_conversacion: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Full conversation transcript'
    },
    resumen_conversacion: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'AI-generated summary'
    },
    version_agente_ia: {
      type: DataTypes.STRING(20),
      allowNull: true
    },

    // Call Status
    estado_llamada: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: {
        isIn: [[
          'completada',
          'buzon_voz',
          'sin_respuesta',
          'ocupado',
          'fallida',
          'numero_equivocado',
          'no_llamar'
        ]]
      }
    },

    // Result
    resultado: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: {
        isIn: [[
          'informado_renovara',
          'cita_agendada',
          'ya_renovo',
          'necesita_seguimiento',
          'no_interesado',
          'solicito_info_sms',
          'escalado_a_humano',
          'solicito_retiro',
          'no_contactado'
        ]]
      }
    },

    // Follow-up
    requiere_seguimiento: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_seguimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    notas_seguimiento: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // SMS/WhatsApp sent after call
    sms_enviado: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    contenido_sms: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    whatsapp_enviado: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    contenido_whatsapp: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Timestamps
    llamada_inicio: {
      type: DataTypes.DATE,
      allowNull: true
    },
    llamada_fin: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'enruta_registro_contactos',
    timestamps: true,
    createdAt: 'creado_en',
    updatedAt: false,
    indexes: [
      { fields: ['cliente_id'] },
      { fields: ['documento_id'] },
      { fields: ['tenant_id', 'creado_en'] },
      { fields: ['tenant_id', 'resultado'] },
      {
        fields: ['tenant_id', 'requiere_seguimiento', 'fecha_seguimiento'],
        where: { requiere_seguimiento: true }
      }
    ]
  });

  EnrutaRegistroContacto.associate = (models) => {
    EnrutaRegistroContacto.belongsTo(models.EnrutaCliente, {
      foreignKey: 'cliente_id',
      as: 'cliente'
    });
    EnrutaRegistroContacto.belongsTo(models.EnrutaDocumento, {
      foreignKey: 'documento_id',
      as: 'documento'
    });
    EnrutaRegistroContacto.hasOne(models.EnrutaRenovacion, {
      foreignKey: 'contacto_id',
      as: 'renovacion'
    });
  };

  return EnrutaRegistroContacto;
};
