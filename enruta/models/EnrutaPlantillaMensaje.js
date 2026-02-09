/**
 * EnrutaPlantillaMensaje Model
 * SMS/WhatsApp message templates
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnrutaPlantillaMensaje = sequelize.define('EnrutaPlantillaMensaje', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false
    },

    nombre_plantilla: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    tipo_plantilla: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['sms', 'whatsapp']]
      }
    },
    evento_disparador: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'post_llamada_recordatorio, confirmacion_cita, aviso_vencimiento, renovacion_completa, llamada_perdida'
    },

    // Content (supports variables: {nombre}, {documento}, {fecha_vencimiento}, etc.)
    asunto: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    cuerpo: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    // Status
    esta_activa: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    whatsapp_template_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Approved template ID in Twilio WhatsApp'
    }
  }, {
    tableName: 'enruta_plantillas_mensajes',
    timestamps: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en'
  });

  // Class method to render template with data
  EnrutaPlantillaMensaje.prototype.renderizar = function(datos) {
    let contenido = this.cuerpo;

    // Replace all variables
    Object.keys(datos).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      contenido = contenido.replace(regex, datos[key] || '');
    });

    return contenido;
  };

  return EnrutaPlantillaMensaje;
};
