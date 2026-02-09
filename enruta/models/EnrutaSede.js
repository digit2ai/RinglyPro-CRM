/**
 * EnrutaSede Model
 * Stores transit offices and CDA locations
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnrutaSede = sequelize.define('EnrutaSede', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false
    },

    // Location Information
    nombre_sede: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    tipo_sede: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: [[
          'organismo_transito',
          'cda',
          'crc',
          'cea',
          'aseguradora',
          'punto_simit',
          'patio_oficial'
        ]]
      }
    },
    codigo_runt: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'RUNT code if applicable'
    },

    // Address
    departamento: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    ciudad: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    barrio: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    direccion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    codigo_postal: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    latitud: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true
    },
    longitud: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true
    },

    // Contact
    telefono: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    correo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sitio_web: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    whatsapp: {
      type: DataTypes.STRING(20),
      allowNull: true
    },

    // Hours
    horario_lunes_viernes: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'e.g., 7:45 a.m. a 1:00 p.m. / 2:15 p.m. a 4:55 p.m.'
    },
    horario_sabado: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., 8:00 a.m. a 12:00 m'
    },
    horario_domingo: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Usually Cerrado'
    },
    horario_festivos: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    // Services Offered
    servicios_ofrecidos: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      comment: 'licencia_expedicion, licencia_renovacion, rtmyec, soat, curso_vial, patio, grua, etc.'
    },
    tipos_vehiculos_atendidos: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      comment: 'liviano, pesado, motocicleta, electrico'
    },

    // Status
    esta_activa: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    notas: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'enruta_sedes',
    timestamps: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [
      { fields: ['tenant_id', 'ciudad'] },
      { fields: ['tenant_id', 'tipo_sede'] }
    ]
  });

  return EnrutaSede;
};
