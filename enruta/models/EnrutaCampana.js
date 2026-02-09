/**
 * EnrutaCampana Model
 * Manages mass outreach call campaigns
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnrutaCampana = sequelize.define('EnrutaCampana', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false
    },

    // Campaign Details
    nombre_campana: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    tipo_campana: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: {
        isIn: [['recordatorio_30', 'recordatorio_15', 'recordatorio_7', 'vencidos', 'personalizada']]
      }
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Selection Criteria
    tipos_documentos_objetivo: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      comment: 'Which document types to include'
    },
    ciudades_objetivo: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      comment: 'Which cities (null = all)'
    },
    fecha_vencimiento_desde: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    fecha_vencimiento_hasta: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // Scheduling
    inicio_programado: {
      type: DataTypes.DATE,
      allowNull: true
    },
    fin_programado: {
      type: DataTypes.DATE,
      allowNull: true
    },
    hora_inicio_llamadas: {
      type: DataTypes.TIME,
      defaultValue: '08:00',
      comment: 'Do not call before (Colombia time)'
    },
    hora_fin_llamadas: {
      type: DataTypes.TIME,
      defaultValue: '18:00',
      comment: 'Do not call after'
    },
    max_llamadas_por_dia: {
      type: DataTypes.INTEGER,
      defaultValue: 500
    },
    max_reintentos: {
      type: DataTypes.INTEGER,
      defaultValue: 3
    },
    intervalo_reintento_horas: {
      type: DataTypes.INTEGER,
      defaultValue: 48
    },

    // Status
    estado: {
      type: DataTypes.STRING(20),
      defaultValue: 'borrador',
      validate: {
        isIn: [['borrador', 'programada', 'activa', 'pausada', 'completada', 'cancelada']]
      }
    },

    // Statistics (updated in real-time)
    total_objetivos: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    llamadas_realizadas: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    llamadas_contestadas: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    llamadas_exitosas: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    renovaciones_iniciadas: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'enruta_campanas',
    timestamps: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en'
  });

  // Instance methods
  EnrutaCampana.prototype.activar = async function() {
    this.estado = 'activa';
    await this.save();
    return this;
  };

  EnrutaCampana.prototype.pausar = async function() {
    this.estado = 'pausada';
    await this.save();
    return this;
  };

  EnrutaCampana.prototype.cancelar = async function() {
    this.estado = 'cancelada';
    await this.save();
    return this;
  };

  EnrutaCampana.prototype.incrementarEstadisticas = async function(campo) {
    const validFields = ['llamadas_realizadas', 'llamadas_contestadas', 'llamadas_exitosas', 'renovaciones_iniciadas'];
    if (validFields.includes(campo)) {
      this[campo] = (this[campo] || 0) + 1;
      await this.save();
    }
    return this;
  };

  return EnrutaCampana;
};
