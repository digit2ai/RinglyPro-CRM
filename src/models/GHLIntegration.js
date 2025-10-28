const { DataTypes } = require('sequelize');

/**
 * GHLIntegration Model
 * Stores GoHighLevel OAuth tokens for multi-tenant support
 * Each client can connect their own GHL account
 */
module.exports = (sequelize) => {
    const GHLIntegration = sequelize.define('GHLIntegration', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        client_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'clients',
                key: 'id'
            },
            comment: 'Reference to clients table'
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            },
            comment: 'User who authorized OAuth'
        },
        ghl_location_id: {
            type: DataTypes.STRING(50),
            allowNull: false,
            comment: 'GHL Location ID (sub-account)'
        },
        ghl_company_id: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'GHL Company ID (agency)'
        },
        access_token: {
            type: DataTypes.TEXT,
            allowNull: false,
            comment: 'OAuth access token'
        },
        refresh_token: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'OAuth refresh token'
        },
        token_type: {
            type: DataTypes.STRING(20),
            defaultValue: 'Bearer'
        },
        scope: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Granted OAuth scopes (space-separated)'
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Access token expiration time'
        },
        user_type: {
            type: DataTypes.STRING(20),
            allowNull: true,
            comment: 'Location or Company'
        },
        location_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
            comment: 'Name of GHL location'
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            comment: 'Is this integration currently active'
        },
        last_synced_at: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Last token refresh/verification'
        }
    }, {
        tableName: 'ghl_integrations',
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ['client_id']
            },
            {
                fields: ['user_id']
            },
            {
                fields: ['ghl_location_id']
            },
            {
                fields: ['is_active']
            },
            {
                unique: true,
                fields: ['client_id', 'is_active'],
                where: {
                    is_active: true
                },
                name: 'one_active_integration_per_client'
            }
        ]
    });

    // Instance methods
    GHLIntegration.prototype.isExpired = function() {
        if (!this.expires_at) return false;
        return new Date() >= new Date(this.expires_at);
    };

    GHLIntegration.prototype.needsRefresh = function() {
        if (!this.expires_at) return false;
        // Refresh if expires in less than 5 minutes
        const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
        return new Date(this.expires_at) <= fiveMinutesFromNow;
    };

    // Class methods
    GHLIntegration.findByClient = async function(clientId) {
        return await this.findOne({
            where: {
                client_id: clientId,
                is_active: true
            }
        });
    };

    GHLIntegration.findByLocationId = async function(locationId) {
        return await this.findOne({
            where: {
                ghl_location_id: locationId,
                is_active: true
            }
        });
    };

    return GHLIntegration;
};
