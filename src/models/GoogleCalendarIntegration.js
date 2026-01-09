const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GoogleCalendarIntegration = sequelize.define('GoogleCalendarIntegration', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  clientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'client_id'
  },
  googleEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'google_email'
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'access_token'
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'refresh_token'
  },
  tokenType: {
    type: DataTypes.STRING,
    defaultValue: 'Bearer',
    field: 'token_type'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at'
  },
  scope: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  calendarId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'primary',
    field: 'calendar_id'
  },
  calendarName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'calendar_name'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  syncAppointments: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'sync_appointments'
  },
  syncBlockedTimes: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'sync_blocked_times'
  },
  lastSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_synced_at'
  },
  lastError: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'last_error'
  }
}, {
  tableName: 'google_calendar_integrations',
  timestamps: true,
  underscored: true
});

// Check if token is expired (with 5 minute buffer)
GoogleCalendarIntegration.prototype.isTokenExpired = function() {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return new Date() >= new Date(this.expiresAt.getTime() - bufferMs);
};

// Get active integration for a client
GoogleCalendarIntegration.getActiveForClient = async function(clientId) {
  return this.findOne({
    where: { clientId, isActive: true }
  });
};

module.exports = GoogleCalendarIntegration;
