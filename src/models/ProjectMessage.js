// =====================================================
// Project Message Model
// File: src/models/ProjectMessage.js
// Purpose: Two-way messaging between admin and client per milestone
// =====================================================

const { DataTypes, Model } = require('sequelize');

class ProjectMessage extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            milestone_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'project_milestones',
                    key: 'id'
                },
                onDelete: 'CASCADE',
                comment: 'Parent milestone'
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                comment: 'User who sent this message'
            },
            is_admin: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
                comment: 'Whether message was sent by admin'
            },
            message: {
                type: DataTypes.TEXT,
                allowNull: false,
                comment: 'Message content'
            },
            attachment_url: {
                type: DataTypes.STRING(500),
                allowNull: true,
                comment: 'Optional attachment URL'
            },
            attachment_name: {
                type: DataTypes.STRING(255),
                allowNull: true,
                comment: 'Original attachment filename'
            },
            read_at: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'When the recipient read this message'
            },
            created_at: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW
            }
        }, {
            sequelize,
            modelName: 'ProjectMessage',
            tableName: 'project_messages',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: false, // Messages are immutable
            indexes: [
                { fields: ['milestone_id'] },
                { fields: ['user_id'] },
                { fields: ['is_admin'] },
                { fields: ['created_at'] }
            ]
        });
    }

    static associate(models) {
        // Message belongs to a Milestone
        this.belongsTo(models.ProjectMilestone, {
            foreignKey: 'milestone_id',
            as: 'milestone'
        });

        // Message belongs to a User (author)
        this.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'author'
        });
    }

    // Get messages for a milestone
    static async getMessagesForMilestone(milestoneId) {
        return this.findAll({
            where: { milestone_id: milestoneId },
            include: [{
                model: this.sequelize.models.User,
                as: 'author',
                attributes: ['id', 'first_name', 'last_name', 'email', 'isAdmin']
            }],
            order: [['created_at', 'ASC']]
        });
    }

    // Mark messages as read
    static async markAsRead(milestoneId, isAdmin) {
        // Mark messages from the "other side" as read
        return this.update(
            { read_at: new Date() },
            {
                where: {
                    milestone_id: milestoneId,
                    is_admin: !isAdmin, // Mark messages from the other party
                    read_at: null
                }
            }
        );
    }

    // Get unread count for a user across all their projects
    static async getUnreadCountForUser(userId) {
        const { Op } = require('sequelize');

        // This is a simplified version - in production you'd want a more optimized query
        const messages = await this.findAll({
            where: {
                is_admin: true, // Messages from admin
                read_at: null
            },
            include: [{
                model: this.sequelize.models.ProjectMilestone,
                as: 'milestone',
                required: true,
                include: [{
                    model: this.sequelize.models.Project,
                    as: 'project',
                    required: true,
                    where: { user_id: userId }
                }]
            }]
        });

        return messages.length;
    }

    // Get unread count for admin (messages from clients)
    static async getUnreadCountForAdmin() {
        return this.count({
            where: {
                is_admin: false,
                read_at: null
            }
        });
    }
}

module.exports = ProjectMessage;
