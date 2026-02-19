'use strict';

/**
 * Member Model - Ronin Brotherhood Membership Registry
 * Black belt registry with rank tracking, group affiliations, and member profiles
 */

const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const Member = sequelize.define('RoninMember', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Multi-tenant isolation'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { isEmail: true }
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    // Martial Arts Info
    rank: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Current belt rank: e.g. Shodan, Nidan, Sandan...'
    },
    dan_level: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
      comment: 'Dan level (1-10)'
    },
    title: {
      type: DataTypes.ENUM('Student', 'Sensei', 'Renshi', 'Shihan', 'Kyoshi', 'Hanshi'),
      allowNull: false,
      defaultValue: 'Student'
    },
    group_affiliation: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of group IDs: RGRK, IRMAF, RPDTA, Red Belt Society, MMA'
    },
    dojo_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Name of home dojo/school'
    },
    dojo_address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    instructor_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Name of primary instructor/sensei'
    },
    years_training: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    styles: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Martial arts styles practiced: Goju Ryu, Taekwondo, MMA, etc.'
    },
    // Membership
    membership_tier: {
      type: DataTypes.ENUM('basic', 'brotherhood', 'red_belt', 'rpdta', 'lifetime'),
      allowNull: false,
      defaultValue: 'basic'
    },
    membership_status: {
      type: DataTypes.ENUM('active', 'inactive', 'pending', 'suspended'),
      allowNull: false,
      defaultValue: 'pending'
    },
    membership_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Military/Law Enforcement (for RPDTA members)
    is_law_enforcement: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    agency: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Law enforcement agency or military branch'
    },
    badge_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    clearance_level: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Security clearance for RPDTA tactical courses'
    },
    // Profile
    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    profile_image: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    achievements: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of achievements: championships, certifications, etc.'
    },
    // Engagement
    email_subscribed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    total_orders: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_spent: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'ronin_members',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['email'] },
      { fields: ['tenant_id', 'email'], unique: true },
      { fields: ['country'] },
      { fields: ['membership_tier'] },
      { fields: ['membership_status'] },
      { fields: ['dan_level'] },
      { fields: ['is_law_enforcement'] },
      { fields: ['created_at'] }
    ],
    hooks: {
      beforeCreate: async (member) => {
        if (member.password_hash && !member.password_hash.startsWith('$2')) {
          member.password_hash = await bcrypt.hash(member.password_hash, 10);
        }
      },
      beforeUpdate: async (member) => {
        member.updated_at = new Date();
        if (member.changed('password_hash') && member.password_hash && !member.password_hash.startsWith('$2')) {
          member.password_hash = await bcrypt.hash(member.password_hash, 10);
        }
      }
    }
  });

  Member.prototype.validatePassword = async function(password) {
    if (!this.password_hash) return false;
    return bcrypt.compare(password, this.password_hash);
  };

  Member.associate = (models) => {
    Member.hasMany(models.RoninOrder, { foreignKey: 'member_id', as: 'orders' });
    Member.hasMany(models.RoninEnrollment, { foreignKey: 'member_id', as: 'enrollments' });
    Member.hasMany(models.RoninCartItem, { foreignKey: 'member_id', as: 'cart_items' });
  };

  return Member;
};
