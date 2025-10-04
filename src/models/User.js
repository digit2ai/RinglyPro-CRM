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
        
        // EXISTING BUSINESS FIELDS
        business_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        business_phone: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        
        // NEW BUSINESS FIELDS
        business_type: {
            type: DataTypes.STRING(100),
            allowNull: true,
            validate: {
                isIn: [['healthcare', 'legal', 'realestate', 'automotive', 'retail', 'restaurant', 'beauty', 'fitness', 'professional', 'technology', 'education', 'other']]
            }
        },
        website_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
            validate: {
                isUrl: {
                    msg: 'Must be a valid URL'
                }
            }
        },
        phone_number: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        business_description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        business_hours: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: null
        },
        services: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        terms_accepted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        free_trial_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 100,
            validate: {
                min: 0
            }
        },
        onboarding_completed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        
        // EXISTING EMAIL VERIFICATION FIELDS
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
        timestamps: true,
        
        // Add indexes for better performance
        indexes: [
            {
                unique: true,
                fields: ['email']
            },
            {
                fields: ['business_type']
            },
            {
                fields: ['onboarding_completed']
            }
        ],
        
        // Add validation at model level
        validate: {
            // Ensure terms are accepted for new users
            termsAcceptedRequired() {
                if (this.isNewRecord && !this.terms_accepted) {
                    throw new Error('Terms and conditions must be accepted');
                }
            }
        }
    });

    return User;
};