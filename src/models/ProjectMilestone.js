// =====================================================
// Project Milestone Model
// File: src/models/ProjectMilestone.js
// Purpose: Track milestones within projects
// =====================================================

const { DataTypes, Model } = require('sequelize');

class ProjectMilestone extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            project_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'projects',
                    key: 'id'
                },
                onDelete: 'CASCADE',
                comment: 'Parent project'
            },
            title: {
                type: DataTypes.STRING(255),
                allowNull: false,
                comment: 'Milestone title'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Detailed milestone description'
            },
            status: {
                type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'blocked'),
                defaultValue: 'pending',
                comment: 'Current milestone status'
            },
            order: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
                comment: 'Display order within project'
            },
            due_date: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'Milestone due date'
            },
            completed_at: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'When milestone was completed'
            },
            admin_notes: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Internal admin notes (visible to client)'
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
            sequelize,
            modelName: 'ProjectMilestone',
            tableName: 'project_milestones',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['project_id'] },
                { fields: ['status'] },
                { fields: ['order'] },
                { fields: ['due_date'] }
            ]
        });
    }

    static associate(models) {
        // Milestone belongs to a Project
        this.belongsTo(models.Project, {
            foreignKey: 'project_id',
            as: 'project'
        });

        // Milestone has many Messages
        this.hasMany(models.ProjectMessage, {
            foreignKey: 'milestone_id',
            as: 'messages'
        });
    }

    // Get milestone with all messages
    static async getMilestoneWithMessages(milestoneId) {
        return this.findByPk(milestoneId, {
            include: [{
                model: this.sequelize.models.ProjectMessage,
                as: 'messages',
                include: [{
                    model: this.sequelize.models.User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'isAdmin']
                }],
                order: [['created_at', 'ASC']]
            }]
        });
    }

    // Mark milestone as completed
    async markCompleted() {
        this.status = 'completed';
        this.completed_at = new Date();
        await this.save();
        return this;
    }

    // Get unread message count for this milestone
    async getUnreadMessageCount(userId, isAdmin) {
        const messages = await this.getMessages();
        // For now, count messages from the "other side"
        return messages.filter(m => m.is_admin !== isAdmin).length;
    }
}

module.exports = ProjectMilestone;
