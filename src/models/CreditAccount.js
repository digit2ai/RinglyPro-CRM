const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const CreditAccount = sequelize.define('CreditAccount', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        client_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            references: {
                model: 'clients',
                key: 'id'
            }
        },
        balance: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00,
            validate: {
                min: 0
            }
        },
        free_minutes_used: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        free_minutes_reset_date: {
            type: DataTypes.DATEONLY,
            defaultValue: DataTypes.NOW
        },
        total_minutes_used: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        total_amount_spent: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00,
            validate: {
                min: 0
            }
        },
        last_usage_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        low_balance_notified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'credit_accounts',
        underscored: true,
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['client_id']
            }
        ]
    });

    return CreditAccount;
};