/**
 * ENRUTA Models Index
 * Exports all Sequelize models for the ENRUTA vehicle document management system
 */
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Initialize Sequelize with database connection
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Import models
const EnrutaCliente = require('./EnrutaCliente')(sequelize);
const EnrutaDocumento = require('./EnrutaDocumento')(sequelize);
const EnrutaRegistroContacto = require('./EnrutaRegistroContacto')(sequelize);
const EnrutaRenovacion = require('./EnrutaRenovacion')(sequelize);
const EnrutaSede = require('./EnrutaSede')(sequelize);
const EnrutaCampana = require('./EnrutaCampana')(sequelize);
const EnrutaPlantillaMensaje = require('./EnrutaPlantillaMensaje')(sequelize);
const EnrutaComparendo = require('./EnrutaComparendo')(sequelize);

// Create models object
const models = {
  EnrutaCliente,
  EnrutaDocumento,
  EnrutaRegistroContacto,
  EnrutaRenovacion,
  EnrutaSede,
  EnrutaCampana,
  EnrutaPlantillaMensaje,
  EnrutaComparendo,
  sequelize,
  Sequelize
};

// Run associations
Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = models;
