const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        password_hash: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        first_name: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        last_name: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        business_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        business_phone: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        email_verified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        email_verification_token: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    }, {
        tableName: 'users',
        underscored: true,
        timestamps: true
    });

    return User;
};