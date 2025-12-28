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
                isIn: [[
                    // Original RinglyPro types
                    'healthcare', 'legal', 'realestate', 'automotive', 'retail', 'restaurant', 'beauty', 'fitness', 'professional', 'technology', 'education', 'other',
                    // LaunchStack types
                    'consulting', 'ecommerce', 'marketing', 'construction', 'finance'
                ]]
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
        },

        // ADMIN FIELDS
        isAdmin: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'is_admin'  // Explicitly map to database column
        },
        adminPhone: {
            type: DataTypes.STRING(20),
            allowNull: true,
            field: 'admin_phone'  // Explicitly map to database column
        },

        // TOKEN BILLING FIELDS
        tokens_balance: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 100,
            validate: {
                min: 0
            },
            comment: 'Current token balance for the user'
        },
        tokens_used_this_month: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0,
            validate: {
                min: 0
            },
            comment: 'Tokens used in current billing cycle'
        },
        token_package: {
            type: DataTypes.STRING(50),
            allowNull: true,
            defaultValue: 'free',
            validate: {
                isIn: [['free', 'starter', 'growth', 'professional']]
            },
            comment: 'Current token package subscription'
        },
        tokens_rollover: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0,
            validate: {
                min: 0
            },
            comment: 'Rollover tokens from previous month'
        },
        billing_cycle_start: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Start date of current billing cycle'
        },
        last_token_reset: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Last time tokens were reset/renewed'
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
            },
            {
                fields: ['is_admin']  // Database column name, not model field
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