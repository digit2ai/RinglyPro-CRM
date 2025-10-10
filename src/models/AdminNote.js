const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const AdminNote = sequelize.define('AdminNote', {
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
        note: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        noteType: {
            type: DataTypes.STRING(20),
            defaultValue: 'general',
            validate: {
                isIn: [['general', 'technical', 'billing', 'support']]
            },
            field: 'note_type'
        }
    }, {
        tableName: 'admin_notes',
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ['client_id']
            },
            {
                fields: ['admin_user_id']
            },
            {
                fields: ['created_at']
            }
        ]
    });

    return AdminNote;
};
