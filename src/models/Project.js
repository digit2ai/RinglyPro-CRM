// =====================================================
// Project Model
// File: src/models/Project.js
// Purpose: Track custom modification projects for clients
// =====================================================

const { DataTypes, Model } = require('sequelize');

class Project extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                comment: 'The RinglyPro user who owns this project'
            },
            title: {
                type: DataTypes.STRING(255),
                allowNull: false,
                comment: 'Project title'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Detailed project description'
            },
            status: {
                type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'on_hold', 'cancelled'),
                defaultValue: 'pending',
                comment: 'Current project status'
            },
            priority: {
                type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
                defaultValue: 'medium',
                comment: 'Project priority level'
            },
            estimated_completion: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'Estimated completion date'
            },
            actual_completion: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'Actual completion date'
            },
            client_requirements: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Client requirements and specifications'
            },
            created_by_admin: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                comment: 'Admin user who created this project'
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
            modelName: 'Project',
            tableName: 'projects',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['user_id'] },
                { fields: ['status'] },
                { fields: ['priority'] },
                { fields: ['created_at'] }
            ]
        });
    }

    static associate(models) {
        // Project belongs to a User (client)
        this.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'owner'
        });

        // Project was created by an Admin
        this.belongsTo(models.User, {
            foreignKey: 'created_by_admin',
            as: 'creator'
        });

        // Project has many Milestones
        this.hasMany(models.ProjectMilestone, {
            foreignKey: 'project_id',
            as: 'milestones'
        });
    }

    // Get project with all milestones and messages
    static async getFullProject(projectId) {
        return this.findByPk(projectId, {
            include: [
                {
                    model: this.sequelize.models.ProjectMilestone,
                    as: 'milestones',
                    include: [{
                        model: this.sequelize.models.ProjectMessage,
                        as: 'messages',
                        order: [['created_at', 'ASC']]
                    }],
                    order: [['order', 'ASC']]
                },
                {
                    model: this.sequelize.models.User,
                    as: 'owner',
                    attributes: ['id', 'email', 'first_name', 'last_name', 'business_name']
                }
            ]
        });
    }

    // Get all projects for a user
    static async getProjectsForUser(userId) {
        return this.findAll({
            where: { user_id: userId },
            include: [{
                model: this.sequelize.models.ProjectMilestone,
                as: 'milestones',
                attributes: ['id', 'title', 'status']
            }],
            order: [['created_at', 'DESC']]
        });
    }

    // Get all projects (for admin)
    static async getAllProjectsGroupedByUser() {
        return this.findAll({
            include: [
                {
                    model: this.sequelize.models.User,
                    as: 'owner',
                    attributes: ['id', 'email', 'first_name', 'last_name', 'business_name']
                },
                {
                    model: this.sequelize.models.ProjectMilestone,
                    as: 'milestones',
                    attributes: ['id', 'title', 'status']
                }
            ],
            order: [
                ['user_id', 'ASC'],
                ['created_at', 'DESC']
            ]
        });
    }

    // Calculate project progress (percentage of completed milestones)
    async getProgress() {
        const milestones = await this.getMilestones();
        if (milestones.length === 0) return 0;

        const completed = milestones.filter(m => m.status === 'completed').length;
        return Math.round((completed / milestones.length) * 100);
    }
}

module.exports = Project;
