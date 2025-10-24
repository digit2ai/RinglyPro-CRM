/**
 * Migration: Create Business Directory Table
 *
 * Creates a table to store collected business data from the Business Collector
 * for building a searchable business directory for future use
 *
 * Fields:
 * - id: Primary key
 * - business_name: Name of the business
 * - phone_number: Business phone number
 * - website: Business website URL
 * - email: Business email (optional)
 * - street: Street address (optional)
 * - city: City (optional)
 * - state: State (optional)
 * - postal_code: Postal code (optional)
 * - country: Country (optional, defaults to US)
 * - category: Business category
 * - source_url: Original source URL
 * - confidence: Confidence score (0-1)
 * - notes: Additional notes (optional)
 * - client_id: Reference to the client who collected this business
 * - created_at: Timestamp of when the record was created
 * - updated_at: Timestamp of when the record was last updated
 */

module.exports = {
    up: async (queryInterface, Sequelize) => {
        console.log('🔄 Creating business_directory table...');

        try {
            await queryInterface.createTable('business_directory', {
                id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                business_name: {
                    type: Sequelize.STRING(255),
                    allowNull: false,
                    comment: 'Name of the business'
                },
                phone_number: {
                    type: Sequelize.STRING(50),
                    allowNull: true,
                    comment: 'Business phone number'
                },
                website: {
                    type: Sequelize.STRING(500),
                    allowNull: true,
                    comment: 'Business website URL'
                },
                email: {
                    type: Sequelize.STRING(255),
                    allowNull: true,
                    comment: 'Business email address'
                },
                street: {
                    type: Sequelize.STRING(255),
                    allowNull: true,
                    comment: 'Street address'
                },
                city: {
                    type: Sequelize.STRING(100),
                    allowNull: true,
                    comment: 'City'
                },
                state: {
                    type: Sequelize.STRING(50),
                    allowNull: true,
                    comment: 'State or province'
                },
                postal_code: {
                    type: Sequelize.STRING(20),
                    allowNull: true,
                    comment: 'Postal code or ZIP code'
                },
                country: {
                    type: Sequelize.STRING(50),
                    allowNull: true,
                    defaultValue: 'US',
                    comment: 'Country code'
                },
                category: {
                    type: Sequelize.STRING(255),
                    allowNull: true,
                    comment: 'Business category or industry'
                },
                source_url: {
                    type: Sequelize.STRING(1000),
                    allowNull: true,
                    comment: 'Original source URL where business was found'
                },
                confidence: {
                    type: Sequelize.DECIMAL(3, 2),
                    allowNull: true,
                    comment: 'Confidence score (0.00 to 1.00)'
                },
                notes: {
                    type: Sequelize.TEXT,
                    allowNull: true,
                    comment: 'Additional notes about the business'
                },
                client_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'clients',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE',
                    comment: 'Reference to the client who collected this business'
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });

            console.log('✅ Created business_directory table');

            // Add index on client_id for faster queries
            await queryInterface.addIndex('business_directory', ['client_id'], {
                name: 'business_directory_client_id_idx'
            });
            console.log('✅ Added index on client_id');

            // Add index on phone_number for faster lookups
            await queryInterface.addIndex('business_directory', ['phone_number'], {
                name: 'business_directory_phone_number_idx'
            });
            console.log('✅ Added index on phone_number');

            // Add index on business_name for faster searches
            await queryInterface.addIndex('business_directory', ['business_name'], {
                name: 'business_directory_business_name_idx'
            });
            console.log('✅ Added index on business_name');

            // Add composite index for duplicate detection
            await queryInterface.addIndex('business_directory', ['client_id', 'phone_number'], {
                name: 'business_directory_client_phone_idx'
            });
            console.log('✅ Added composite index for duplicate detection');

            console.log('✅ Business directory table migration completed successfully');

        } catch (error) {
            console.error('❌ Error during business directory table migration:', error);
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        console.log('🔄 Dropping business_directory table...');

        try {
            await queryInterface.dropTable('business_directory');
            console.log('✅ Dropped business_directory table');

            console.log('✅ Business directory table rollback completed successfully');

        } catch (error) {
            console.error('❌ Error during business directory table rollback:', error);
            throw error;
        }
    }
};
