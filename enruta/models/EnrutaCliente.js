/**
 * EnrutaCliente Model
 * Stores client/citizen information for vehicle document management
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnrutaCliente = sequelize.define('EnrutaCliente', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Multi-tenant isolation - links to RinglyPro tenant'
    },

    // Personal Information
    tipo_documento: {
      type: DataTypes.STRING(5),
      defaultValue: 'CC',
      validate: {
        isIn: [['CC', 'CE', 'TI', 'PP', 'NIT']]
      },
      comment: 'CC=Cedula, CE=Cedula Extranjeria, TI=Tarjeta Identidad, PP=Pasaporte, NIT'
    },
    numero_documento: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Cedula/document number'
    },
    primer_nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    segundo_nombre: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    primer_apellido: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    segundo_apellido: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    nombre_completo: {
      type: DataTypes.VIRTUAL,
      get() {
        const parts = [
          this.primer_nombre,
          this.segundo_nombre,
          this.primer_apellido,
          this.segundo_apellido
        ].filter(Boolean);
        return parts.join(' ');
      }
    },
    fecha_nacimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    genero: {
      type: DataTypes.STRING(10),
      allowNull: true,
      validate: {
        isIn: [['masculino', 'femenino', 'otro']]
      }
    },

    // Contact Information
    telefono_principal: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Colombian format: +573XXXXXXXXX'
    },
    telefono_secundario: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    correo_electronico: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    whatsapp_habilitado: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    metodo_contacto_preferido: {
      type: DataTypes.STRING(20),
      defaultValue: 'telefono',
      validate: {
        isIn: [['telefono', 'sms', 'whatsapp', 'correo']]
      }
    },

    // Location
    departamento: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., Valle del Cauca, Cundinamarca'
    },
    ciudad: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., Cali, Bogota, Medellin'
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

    // Client Status
    estado: {
      type: DataTypes.STRING(20),
      defaultValue: 'activo',
      validate: {
        isIn: [['activo', 'inactivo', 'no_contactar', 'eliminado']]
      }
    },
    fuente_registro: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'manual, importacion, referido, web, aliado, cdav'
    },
    codigo_referido: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    notas: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Communication Preferences
    horario_contacto_preferido: {
      type: DataTypes.STRING(20),
      defaultValue: 'manana',
      validate: {
        isIn: [['manana', 'tarde', 'noche']]
      },
      comment: 'manana=8-12, tarde=12-5, noche=5-8'
    },
    idioma: {
      type: DataTypes.STRING(10),
      defaultValue: 'es'
    },
    zona_horaria: {
      type: DataTypes.STRING(50),
      defaultValue: 'America/Bogota'
    },
    no_llamar: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    no_sms: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    no_whatsapp: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    // Consent (Ley 1581 de 2012)
    consentimiento_datos: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    consentimiento_llamadas: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    consentimiento_sms: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    consentimiento_whatsapp: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_consentimiento: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Timestamps
    ultimo_contacto_en: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'enruta_clientes',
    timestamps: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [
      { unique: true, fields: ['tenant_id', 'numero_documento'] },
      { fields: ['telefono_principal'] },
      { fields: ['tenant_id', 'estado'] },
      { fields: ['tenant_id', 'ciudad'] }
    ]
  });

  EnrutaCliente.associate = (models) => {
    EnrutaCliente.hasMany(models.EnrutaDocumento, {
      foreignKey: 'cliente_id',
      as: 'documentos'
    });
    EnrutaCliente.hasMany(models.EnrutaRegistroContacto, {
      foreignKey: 'cliente_id',
      as: 'contactos'
    });
    EnrutaCliente.hasMany(models.EnrutaRenovacion, {
      foreignKey: 'cliente_id',
      as: 'renovaciones'
    });
    EnrutaCliente.hasMany(models.EnrutaComparendo, {
      foreignKey: 'cliente_id',
      as: 'comparendos'
    });
  };

  return EnrutaCliente;
};
