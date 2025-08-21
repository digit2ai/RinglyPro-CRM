'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('appointments', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      customerName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      customerEmail: {
        type: Sequelize.STRING,
        allowNull: false
      },
      customerPhone: {
        type: Sequelize.STRING,
        allowNull: false
      },
      appointmentDate: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      appointmentTime: {
        type: Sequelize.TIME,
        allowNull: false
      },
      duration: {
        type: Sequelize.INTEGER,
        defaultValue: 30
      },
      purpose: {
        type: Sequelize.TEXT,
        defaultValue: 'General consultation'
      },
      status: {
        type: Sequelize.ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'),
        defaultValue: 'scheduled'
      },
      confirmationCode: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true
      },
      source: {
        type: Sequelize.ENUM('web', 'phone', 'rachel_voice_ai', 'manual', 'api'),
        defaultValue: 'web'
      },
      timezone: {
        type: Sequelize.STRING(50),
        defaultValue: 'America/New_York'
      },
      zoomMeetingUrl: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      zoomMeetingId: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      zoomPassword: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      hubspotContactId: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      hubspotMeetingId: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      emailSent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      smsSent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      reminderSent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      cancelReason: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      rescheduleCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('appointments', ['appointmentDate', 'appointmentTime']);
    await queryInterface.addIndex('appointments', ['confirmationCode']);
    await queryInterface.addIndex('appointments', ['customerEmail']);
    await queryInterface.addIndex('appointments', ['status']);
    
    // Add unique constraint for preventing double bookings
    await queryInterface.addConstraint('appointments', {
      fields: ['appointmentDate', 'appointmentTime'],
      type: 'unique',
      name: 'unique_scheduled_slot',
      where: {
        status: 'scheduled'
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('appointments');
  }
};