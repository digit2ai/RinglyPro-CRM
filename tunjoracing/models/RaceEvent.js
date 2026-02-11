'use strict';

/**
 * RaceEvent Model - TunjoRacing Race Calendar
 * Stores race calendar and event data
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RaceEvent = sequelize.define('TunjoRaceEvent', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Multi-tenant isolation'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    series: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., F4, Formula Regional, etc.'
    },
    track_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    track_location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    // Results
    qualifying_position: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    race1_position: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    race2_position: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    race3_position: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    points_earned: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    fastest_lap: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // Analytics
    estimated_attendance: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    tv_viewership: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    social_mentions: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // Status
    status: {
      type: DataTypes.ENUM('upcoming', 'in_progress', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'upcoming'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    image_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'tunjo_race_events',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['start_date'] },
      { fields: ['status'] },
      { fields: ['series'] },
      { fields: ['country'] }
    ],
    hooks: {
      beforeUpdate: async (event) => {
        event.updated_at = new Date();
      }
    }
  });

  return RaceEvent;
};
