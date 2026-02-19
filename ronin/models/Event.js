'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Event = sequelize.define('RoninEvent', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    event_type: {
      type: DataTypes.ENUM('championship', 'seminar', 'promotion_ceremony', 'training_camp', 'conference', 'social'),
      allowNull: false,
      defaultValue: 'seminar'
    },
    group: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'RGRK, IRMAF, RPDTA, Red Belt, MMA, All'
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    max_attendees: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    current_attendees: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    registration_fee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    member_discount_pct: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    images: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    featured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('upcoming', 'registration_open', 'sold_out', 'in_progress', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'upcoming'
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
    tableName: 'ronin_events',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['slug'] },
      { fields: ['event_type'] },
      { fields: ['group'] },
      { fields: ['start_date'] },
      { fields: ['status'] },
      { fields: ['featured'] }
    ],
    hooks: {
      beforeCreate: async (event) => {
        if (!event.slug) {
          event.slug = event.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      },
      beforeUpdate: async (event) => {
        event.updated_at = new Date();
      }
    }
  });

  return Event;
};
