const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Client = sequelize.define('Client', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        business_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        business_phone: {
            type: DataTypes.STRING(20),
            allowNull: false,
            unique: true
        },
        ringlypro_number: {
            type: DataTypes.STRING(20),
            allowNull: false,
            comment: 'Dedicated Twilio number for this client'
        },
        twilio_number_sid: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Twilio number SID (PN...) for API control'
        },
        forwarding_status: {
            type: DataTypes.STRING(20),
            defaultValue: 'pending',
            validate: {
                isIn: [['pending', 'active', 'inactive']]
            },
            comment: 'Status: pending, active, inactive'
        },
        owner_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        owner_phone: {
            type: DataTypes.STRING(20),
            allowNull: false
        },
        owner_email: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        custom_greeting: {
            type: DataTypes.TEXT,
            defaultValue: 'Thank you for calling. I\'m Rachel, your virtual assistant.'
        },
        business_hours_start: {
            type: DataTypes.TIME,
            defaultValue: '09:00:00'
        },
        business_hours_end: {
            type: DataTypes.TIME,
            defaultValue: '17:00:00'
        },
        business_days: {
            type: DataTypes.STRING(20),
            defaultValue: 'Mon-Fri'
        },
        timezone: {
            type: DataTypes.STRING(50),
            defaultValue: 'America/New_York'
        },
        appointment_duration: {
            type: DataTypes.INTEGER,
            defaultValue: 30
        },
        booking_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        calendar_settings: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: null,
            comment: 'Per-day calendar configuration: {monday: {enabled: true, start: "09:00", end: "17:00"}, ...}'
        },
        ghl_api_key: {
            type: DataTypes.STRING(255),
            allowNull: true,
            comment: 'GoHighLevel Private Integration Token (PIT)'
        },
        ghl_location_id: {
            type: DataTypes.STRING(20),
            allowNull: true,
            comment: 'GoHighLevel Location ID for MCP integration (20 characters)'
        },
        sms_notifications: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        ivr_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'Enable IVR (Interactive Voice Response) call transfer options'
        },
        ivr_options: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: null,
            comment: 'IVR department transfer options: [{name: "Sales", phone: "+1234567890", enabled: true}, ...]'
        },
        monthly_free_minutes: {
            type: DataTypes.INTEGER,
            defaultValue: 100
        },
        per_minute_rate: {
            type: DataTypes.DECIMAL(10, 3),
            defaultValue: 0.100
        },
        rachel_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'Client must toggle ON to enable Rachel AI and see forwarding instructions'
        },
        referral_code: {
            type: DataTypes.STRING(10),
            allowNull: true,
            unique: true,
            comment: 'Unique referral code for this client to share with others'
        },
        referred_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'clients',
                key: 'id'
            },
            comment: 'Client ID of the referrer (who referred this client)'
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        }
    }, {
        tableName: 'clients',
        underscored: true,
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['business_phone']
            },
            {
                unique: true,
                fields: ['ringlypro_number']
            },
            {
                fields: ['twilio_number_sid']
            },
            {
                fields: ['user_id']
            }
        ]
    });

    return Client;
};