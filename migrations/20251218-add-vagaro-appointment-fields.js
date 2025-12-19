'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add Vagaro appointment ID column
      await queryInterface.addColumn('appointments', 'vagaro_appointment_id', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Vagaro appointment ID for synced appointments'
      }, { transaction });

      // Add Vagaro contact ID column
      await queryInterface.addColumn('appointments', 'vagaro_contact_id', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Vagaro customer ID associated with this appointment'
      }, { transaction });

      // Add CRM last synced timestamp
      await queryInterface.addColumn('appointments', 'crm_last_synced_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last time this appointment was synced from any CRM'
      }, { transaction });

      // Update source enum to include new sync sources
      // First check current enum values
      await queryInterface.sequelize.query(`
        DO $$
        BEGIN
          -- Add hubspot_sync if not exists
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'hubspot_sync'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_appointments_source')
          ) THEN
            ALTER TYPE enum_appointments_source ADD VALUE IF NOT EXISTS 'hubspot_sync';
          END IF;

          -- Add vagaro_sync if not exists
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'vagaro_sync'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_appointments_source')
          ) THEN
            ALTER TYPE enum_appointments_source ADD VALUE IF NOT EXISTS 'vagaro_sync';
          END IF;
        EXCEPTION WHEN others THEN
          -- Enum type might not exist if source is varchar
          NULL;
        END;
        $$;
      `, { transaction });

      // Add indexes for the new columns
      await queryInterface.addIndex('appointments', ['vagaro_appointment_id'], {
        name: 'idx_appointments_vagaro_appointment_id',
        transaction
      });

      await queryInterface.addIndex('appointments', ['crm_last_synced_at'], {
        name: 'idx_appointments_crm_last_synced_at',
        transaction
      });

      await transaction.commit();
      console.log('Migration completed: Added Vagaro appointment fields');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeIndex('appointments', 'idx_appointments_crm_last_synced_at', { transaction });
      await queryInterface.removeIndex('appointments', 'idx_appointments_vagaro_appointment_id', { transaction });
      await queryInterface.removeColumn('appointments', 'crm_last_synced_at', { transaction });
      await queryInterface.removeColumn('appointments', 'vagaro_contact_id', { transaction });
      await queryInterface.removeColumn('appointments', 'vagaro_appointment_id', { transaction });

      await transaction.commit();
      console.log('Migration rolled back: Removed Vagaro appointment fields');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
