// =====================================================
// Project Tracker Routes (Client-Facing)
// File: src/routes/projects.js
// Purpose: API routes for client project tracker
// =====================================================

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { Project, ProjectMilestone, ProjectMessage, User } = require('../models');

// ============================================
// GET /api/projects - Get all projects for the logged-in user
// ============================================
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const projects = await Project.findAll({
            where: { user_id: userId },
            include: [{
                model: ProjectMilestone,
                as: 'milestones',
                attributes: ['id', 'title', 'status', 'order', 'due_date']
            }],
            order: [
                ['created_at', 'DESC'],
                [{ model: ProjectMilestone, as: 'milestones' }, 'order', 'ASC']
            ]
        });

        // Calculate progress for each project
        const projectsWithProgress = projects.map(project => {
            const milestones = project.milestones || [];
            const completed = milestones.filter(m => m.status === 'completed').length;
            const progress = milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;

            return {
                ...project.toJSON(),
                progress,
                totalMilestones: milestones.length,
                completedMilestones: completed
            };
        });

        res.json({
            success: true,
            projects: projectsWithProgress
        });

    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch projects'
        });
    }
});

// ============================================
// GET /api/projects/:projectId - Get single project with milestones and messages
// ============================================
router.get('/:projectId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { projectId } = req.params;

        const project = await Project.findOne({
            where: {
                id: projectId,
                user_id: userId  // Ensure user owns this project
            },
            include: [
                {
                    model: ProjectMilestone,
                    as: 'milestones',
                    include: [{
                        model: ProjectMessage,
                        as: 'messages',
                        include: [{
                            model: User,
                            as: 'author',
                            attributes: ['id', 'first_name', 'last_name', 'isAdmin']
                        }],
                        order: [['created_at', 'ASC']]
                    }],
                    order: [['order', 'ASC']]
                }
            ],
            order: [
                [{ model: ProjectMilestone, as: 'milestones' }, 'order', 'ASC']
            ]
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Calculate progress
        const milestones = project.milestones || [];
        const completed = milestones.filter(m => m.status === 'completed').length;
        const progress = milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;

        // Mark admin messages as read
        for (const milestone of milestones) {
            await ProjectMessage.update(
                { read_at: new Date() },
                {
                    where: {
                        milestone_id: milestone.id,
                        is_admin: true,
                        read_at: null
                    }
                }
            );
        }

        res.json({
            success: true,
            project: {
                ...project.toJSON(),
                progress,
                totalMilestones: milestones.length,
                completedMilestones: completed
            }
        });

    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project'
        });
    }
});

// ============================================
// POST /api/projects/:projectId/milestones/:milestoneId/messages - Add a message to a milestone
// ============================================
router.post('/:projectId/milestones/:milestoneId/messages', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { projectId, milestoneId } = req.params;
        const { message } = req.body;

        if (!message || message.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        // Verify user owns this project
        const project = await Project.findOne({
            where: {
                id: projectId,
                user_id: userId
            }
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Verify milestone belongs to project
        const milestone = await ProjectMilestone.findOne({
            where: {
                id: milestoneId,
                project_id: projectId
            }
        });

        if (!milestone) {
            return res.status(404).json({
                success: false,
                error: 'Milestone not found'
            });
        }

        // Create message
        const newMessage = await ProjectMessage.create({
            milestone_id: milestoneId,
            user_id: userId,
            is_admin: false,  // Client message
            message: message.trim()
        });

        // Fetch with author info
        const messageWithAuthor = await ProjectMessage.findByPk(newMessage.id, {
            include: [{
                model: User,
                as: 'author',
                attributes: ['id', 'first_name', 'last_name', 'isAdmin']
            }]
        });

        res.status(201).json({
            success: true,
            message: messageWithAuthor
        });

    } catch (error) {
        console.error('Error adding message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add message'
        });
    }
});

// ============================================
// GET /api/projects/unread-count - Get unread message count
// ============================================
router.get('/stats/unread-count', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Count unread messages from admin for this user's projects
        const unreadCount = await ProjectMessage.count({
            where: {
                is_admin: true,
                read_at: null
            },
            include: [{
                model: ProjectMilestone,
                as: 'milestone',
                required: true,
                include: [{
                    model: Project,
                    as: 'project',
                    required: true,
                    where: { user_id: userId }
                }]
            }]
        });

        res.json({
            success: true,
            unreadCount
        });

    } catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get unread count'
        });
    }
});

module.exports = router;
