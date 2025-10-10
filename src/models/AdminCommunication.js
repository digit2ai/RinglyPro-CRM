const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const AdminCommunication = sequelize.define('AdminCommunication', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        adminUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            field: 'admin_user_id'
        },
        clientId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'clients',
                key: 'id'
            },
            field: 'client_id'
        },
        communicationType: {
            type: DataTypes.STRING(20),
            allowNull: false,
            validate: {
                isIn: [['sms', 'note', 'call']]
            },
            field: 'communication_type'
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        phoneNumber: {
            type: DataTypes.STRING(20),
            allowNull: true,
            field: 'phone_number'
        },
        twilioSid: {
            type: DataTypes.STRING(50),
            allowNull: true,
            field: 'twilio_sid'
        },
        direction: {
            type: DataTypes.STRING(10),
            allowNull: true,
            validate: {
                isIn: [['inbound', 'outbound']]
            }
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: true,
            validate: {
                isIn: [['sent', 'delivered', 'failed', 'received']]
            }
        }
    }, {
        tableName: 'admin_communications',
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ['admin_user_id']
            },
            {
                fields: ['client_id']
            },
            {
                fields: ['phone_number']
            },
            {
                fields: ['created_at']
            }
        ]
    });

    return AdminCommunication;
};
