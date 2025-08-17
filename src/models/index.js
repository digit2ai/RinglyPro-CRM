const sequelize = require('../config/database');
const Contact = require('./Contact');

// Define model associations here when you add more models
// Example:
// Contact.hasMany(Appointment);
// Appointment.belongsTo(Contact);

// Initialize all models
const models = {
  Contact,
  sequelize
};

// Sync database (create tables if they don't exist)
const syncDatabase = async (options = {}) => {
  try {
    console.log('🔄 Synchronizing database...');
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Sync models
    await sequelize.sync(options);
    console.log('✅ Database synchronized successfully');

    // Log table creation
    const tableNames = Object.keys(sequelize.models);
    console.log('📋 Active tables:', tableNames.join(', '));

    return true;
  } catch (error) {
    console.error('❌ Database sync error:', error);
    throw error;
  }
};

// Export models and utilities
module.exports = {
  ...models,
  syncDatabase
};
