'use strict';

// CRM Bridge - Connects KanchoAI to the RinglyPro CRM database
// This allows KanchoAI to create/read/update User, Client, and CRM records
// On production, CRM_DATABASE_URL points to the RinglyPro database (separate from DATABASE_URL)

const { Sequelize, DataTypes } = require('sequelize');

const crmDatabaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

if (!crmDatabaseUrl) {
  console.error('CRM Bridge: No database URL found');
  module.exports = { ready: false };
  return;
}

const crmSequelize = new Sequelize(crmDatabaseUrl, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  define: { timestamps: true, underscored: true, freezeTableName: true }
});

// ==================== MINIMAL CRM MODELS ====================
// These mirror the main app's models but only define fields we need

const User = crmSequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  first_name: { type: DataTypes.STRING(100) },
  last_name: { type: DataTypes.STRING(100) },
  business_name: { type: DataTypes.STRING(255) },
  business_phone: { type: DataTypes.STRING(20) },
  business_type: { type: DataTypes.STRING(100) },
  website_url: { type: DataTypes.STRING(500) },
  phone_number: { type: DataTypes.STRING(20) },
  business_description: { type: DataTypes.TEXT },
  business_hours: { type: DataTypes.JSONB },
  services: { type: DataTypes.TEXT },
  terms_accepted: { type: DataTypes.BOOLEAN, defaultValue: false },
  free_trial_minutes: { type: DataTypes.INTEGER, defaultValue: 100 },
  onboarding_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
  tokens_balance: { type: DataTypes.INTEGER, defaultValue: 100 },
  tokens_used_this_month: { type: DataTypes.INTEGER, defaultValue: 0 },
  token_package: { type: DataTypes.STRING(50), defaultValue: 'free' },
  tokens_rollover: { type: DataTypes.INTEGER, defaultValue: 0 },
  subscription_plan: { type: DataTypes.STRING(50), defaultValue: 'free' },
  subscription_status: { type: DataTypes.STRING(20) },
  billing_frequency: { type: DataTypes.STRING(10), defaultValue: 'monthly' },
  monthly_token_allocation: { type: DataTypes.INTEGER, defaultValue: 100 },
  stripe_customer_id: { type: DataTypes.STRING(255) },
  stripe_subscription_id: { type: DataTypes.STRING(255) }
}, { tableName: 'users' });

const Client = crmSequelize.define('Client', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  business_name: { type: DataTypes.STRING(255), allowNull: false },
  business_phone: { type: DataTypes.STRING(20), allowNull: false },
  ringlypro_number: { type: DataTypes.STRING(20), allowNull: false },
  twilio_number_sid: { type: DataTypes.STRING(50) },
  forwarding_status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
  owner_name: { type: DataTypes.STRING(255), allowNull: false },
  owner_phone: { type: DataTypes.STRING(20), allowNull: false },
  owner_email: { type: DataTypes.STRING(255), allowNull: false },
  website_url: { type: DataTypes.STRING(500) },
  custom_greeting: { type: DataTypes.TEXT },
  business_hours_start: { type: DataTypes.TIME, defaultValue: '09:00:00' },
  business_hours_end: { type: DataTypes.TIME, defaultValue: '17:00:00' },
  business_days: { type: DataTypes.STRING(20), defaultValue: 'Mon-Fri' },
  timezone: { type: DataTypes.STRING(50), defaultValue: 'America/New_York' },
  appointment_duration: { type: DataTypes.INTEGER, defaultValue: 30 },
  booking_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  calendar_settings: { type: DataTypes.JSON },
  booking_system: { type: DataTypes.STRING(20) },
  settings: { type: DataTypes.JSONB },
  sms_notifications: { type: DataTypes.BOOLEAN, defaultValue: true },
  ivr_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  ivr_options: { type: DataTypes.JSON },
  monthly_free_minutes: { type: DataTypes.INTEGER, defaultValue: 100 },
  per_minute_rate: { type: DataTypes.DECIMAL(10, 3), defaultValue: 0.45 },
  rachel_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  referral_code: { type: DataTypes.STRING(10) },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  user_id: { type: DataTypes.INTEGER },
  // ElevenLabs agent provisioning fields
  elevenlabs_agent_id: { type: DataTypes.STRING(100), allowNull: true },
  elevenlabs_phone_number_id: { type: DataTypes.STRING(100), allowNull: true }
}, { tableName: 'clients' });

const CreditAccount = crmSequelize.define('CreditAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: DataTypes.INTEGER, allowNull: false },
  balance: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  free_minutes_used: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_minutes_used: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_amount_spent: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }
}, { tableName: 'credit_accounts' });

const Contact = crmSequelize.define('Contact', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: DataTypes.INTEGER, allowNull: false },
  first_name: { type: DataTypes.STRING },
  last_name: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  source: { type: DataTypes.STRING, defaultValue: 'manual' },
  last_contacted_at: { type: DataTypes.DATE }
}, { tableName: 'contacts' });

const Appointment = crmSequelize.define('Appointment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: DataTypes.INTEGER, allowNull: false },
  contact_id: { type: DataTypes.INTEGER },
  customer_name: { type: DataTypes.STRING, allowNull: false },
  customer_phone: { type: DataTypes.STRING, allowNull: false },
  customer_email: { type: DataTypes.STRING },
  appointment_date: { type: DataTypes.DATEONLY, allowNull: false },
  appointment_time: { type: DataTypes.TIME, allowNull: false },
  duration: { type: DataTypes.INTEGER, defaultValue: 30 },
  purpose: { type: DataTypes.TEXT, defaultValue: 'General consultation' },
  status: { type: DataTypes.STRING, defaultValue: 'confirmed' },
  confirmation_code: { type: DataTypes.STRING(20) },
  source: { type: DataTypes.STRING, defaultValue: 'manual' },
  deposit_status: { type: DataTypes.STRING(20), defaultValue: 'not_required' }
}, { tableName: 'appointments' });

const Call = crmSequelize.define('Call', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: DataTypes.INTEGER, allowNull: false },
  contact_id: { type: DataTypes.INTEGER },
  twilio_call_sid: { type: DataTypes.STRING },
  direction: { type: DataTypes.STRING, allowNull: false },
  from_number: { type: DataTypes.STRING, allowNull: false },
  to_number: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'queued' },
  call_status: { type: DataTypes.STRING, defaultValue: 'initiated' },
  duration: { type: DataTypes.INTEGER },
  recording_url: { type: DataTypes.STRING },
  caller_name: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT }
}, { tableName: 'calls' });

const Message = crmSequelize.define('Message', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: DataTypes.INTEGER, allowNull: false },
  contact_id: { type: DataTypes.INTEGER },
  twilio_sid: { type: DataTypes.STRING },
  direction: { type: DataTypes.STRING, allowNull: false },
  from_number: { type: DataTypes.STRING, allowNull: false },
  to_number: { type: DataTypes.STRING, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'queued' },
  read: { type: DataTypes.BOOLEAN, defaultValue: false },
  message_type: { type: DataTypes.STRING, defaultValue: 'sms' }
}, { tableName: 'messages' });

// Associations
User.hasOne(Client, { foreignKey: 'user_id', as: 'client' });
Client.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Client.hasOne(CreditAccount, { foreignKey: 'client_id', as: 'creditAccount' });

// Test connection
(async () => {
  try {
    await crmSequelize.authenticate();
    console.log('KanchoAI CRM Bridge: Connected to RinglyPro database');
  } catch (error) {
    console.error('KanchoAI CRM Bridge: Connection failed:', error.message);
  }
})();

module.exports = {
  ready: true,
  crmSequelize,
  User,
  Client,
  CreditAccount,
  Contact,
  Appointment,
  Call,
  Message
};
