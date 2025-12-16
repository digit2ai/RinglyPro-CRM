// =====================================================
// Admin Project Tracker Routes
// File: src/routes/admin-projects.js
// Purpose: API routes for admin project management
// =====================================================

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { Project, ProjectMilestone, ProjectMessage, User } = require('../models');
const { Op } = require('sequelize');

// Admin whitelist check middleware
const requireAdmin = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const user = await User.findByPk(userId);

        if (!user || !user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        req.adminUser = user;
        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication error'
        });
    }
};

// ============================================
// GET /api/admin/projects - Get all projects grouped by user
// ============================================
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const projects = await Project.findAll({
            include: [
                {
                    model: User,
                    as: 'owner',
                    attributes: ['id', 'email', 'first_name', 'last_name', 'business_name']
                },
                {
                    model: ProjectMilestone,
                    as: 'milestones',
                    attributes: ['id', 'title', 'status', 'order']
                }
            ],
            order: [
                ['user_id', 'ASC'],
                ['created_at', 'DESC']
            ]
        });

        // Group by user and add progress
        const grouped = {};
        for (const project of projects) {
            const userId = project.user_id;
            if (!grouped[userId]) {
                grouped[userId] = {
                    user: project.owner,
                    projects: []
                };
            }

            const milestones = project.milestones || [];
            const completed = milestones.filter(m => m.status === 'completed').length;
            const progress = milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;

            grouped[userId].projects.push({
                ...project.toJSON(),
                progress,
                totalMilestones: milestones.length,
                completedMilestones: completed
            });
        }

        // Get unread count from clients
        const unreadCount = await ProjectMessage.count({
            where: {
                is_admin: false,
                read_at: null
            }
        });

        res.json({
            success: true,
            projectsByUser: Object.values(grouped),
            totalProjects: projects.length,
            unreadMessages: unreadCount
        });

    } catch (error) {
        console.error('Error fetching admin projects:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch projects'
        });
    }
});

// ============================================
// GET /api/admin/projects/users - Get all users (for creating new projects)
// ============================================
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await User.findAll({
            where: {
                isAdmin: { [Op.ne]: true }  // Exclude admin users
            },
            attributes: ['id', 'email', 'first_name', 'last_name', 'business_name'],
            order: [['business_name', 'ASC'], ['email', 'ASC']]
        });

        res.json({
            success: true,
            users
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
});

// ============================================
// POST /api/admin/projects - Create a new project
// ============================================
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { user_id, title, description, priority, estimated_completion, client_requirements } = req.body;

        if (!user_id || !title) {
            return res.status(400).json({
                success: false,
                error: 'User ID and title are required'
            });
        }

        // Verify user exists
        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const project = await Project.create({
            user_id,
            title,
            description: description || null,
            priority: priority || 'medium',
            estimated_completion: estimated_completion || null,
            client_requirements: client_requirements || null,
            created_by_admin: req.adminUser.id,
            status: 'pending'
        });

        // Fetch with associations
        const projectWithAssoc = await Project.findByPk(project.id, {
            include: [{
                model: User,
                as: 'owner',
                attributes: ['id', 'email', 'first_name', 'last_name', 'business_name']
            }]
        });

        res.status(201).json({
            success: true,
            project: projectWithAssoc
        });

    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create project'
        });
    }
});

// ============================================
// GET /api/admin/projects/:projectId - Get single project (admin view)
// ============================================
router.get('/:projectId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { projectId } = req.params;
        console.log(`📋 Fetching project ${projectId} for admin view`);

        // First fetch the project with owner
        const project = await Project.findByPk(projectId, {
            include: [
                {
                    model: User,
                    as: 'owner',
                    attributes: ['id', 'email', 'first_name', 'last_name', 'business_name']
                }
            ]
        });

        if (!project) {
            console.log(`❌ Project ${projectId} not found`);
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Fetch milestones separately with proper ordering
        const milestones = await ProjectMilestone.findAll({
            where: { project_id: projectId },
            order: [['order', 'ASC']],
            include: [{
                model: ProjectMessage,
                as: 'messages',
                include: [{
                    model: User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name', 'isAdmin']
                }],
                order: [['created_at', 'ASC']]
            }]
        });

        // Sort messages within each milestone
        for (const milestone of milestones) {
            if (milestone.messages) {
                milestone.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            }
        }

        // Mark client messages as read
        for (const milestone of milestones) {
            await ProjectMessage.update(
                { read_at: new Date() },
                {
                    where: {
                        milestone_id: milestone.id,
                        is_admin: false,
                        read_at: null
                    }
                }
            );
        }

        // Calculate progress
        const completed = milestones.filter(m => m.status === 'completed').length;
        const progress = milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;

        console.log(`✅ Project ${projectId} loaded with ${milestones.length} milestones`);

        res.json({
            success: true,
            project: {
                ...project.toJSON(),
                milestones: milestones.map(m => m.toJSON()),
                progress,
                totalMilestones: milestones.length,
                completedMilestones: completed
            }
        });

    } catch (error) {
        console.error('Error fetching project:', error);
        console.error('Error details:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project: ' + error.message
        });
    }
});

// ============================================
// PUT /api/admin/projects/:projectId - Update project
// ============================================
router.put('/:projectId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { title, description, status, priority, estimated_completion, client_requirements } = req.body;

        const project = await Project.findByPk(projectId);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Update fields
        if (title) project.title = title;
        if (description !== undefined) project.description = description;
        if (status) project.status = status;
        if (priority) project.priority = priority;
        if (estimated_completion !== undefined) project.estimated_completion = estimated_completion;
        if (client_requirements !== undefined) project.client_requirements = client_requirements;

        // Set completion date if status is completed
        if (status === 'completed' && !project.actual_completion) {
            project.actual_completion = new Date();
        }

        await project.save();

        res.json({
            success: true,
            project
        });

    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update project'
        });
    }
});

// ============================================
// DELETE /api/admin/projects/:projectId - Delete project
// ============================================
router.delete('/:projectId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { projectId } = req.params;

        const project = await Project.findByPk(projectId);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        await project.destroy();

        res.json({
            success: true,
            message: 'Project deleted'
        });

    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete project'
        });
    }
});

// ============================================
// POST /api/admin/projects/:projectId/milestones - Add milestone
// ============================================
router.post('/:projectId/milestones', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { title, description, due_date, admin_notes } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                error: 'Title is required'
            });
        }

        // Verify project exists
        const project = await Project.findByPk(projectId);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Get max order
        const maxOrder = await ProjectMilestone.max('order', {
            where: { project_id: projectId }
        }) || 0;

        const milestone = await ProjectMilestone.create({
            project_id: projectId,
            title,
            description: description || null,
            due_date: due_date || null,
            admin_notes: admin_notes || null,
            order: maxOrder + 1,
            status: 'pending'
        });

        // Update project status to in_progress if it was pending
        if (project.status === 'pending') {
            project.status = 'in_progress';
            await project.save();
        }

        res.status(201).json({
            success: true,
            milestone
        });

    } catch (error) {
        console.error('Error creating milestone:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create milestone'
        });
    }
});

// ============================================
// PUT /api/admin/projects/:projectId/milestones/:milestoneId - Update milestone
// ============================================
router.put('/:projectId/milestones/:milestoneId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { projectId, milestoneId } = req.params;
        const { title, description, status, due_date, admin_notes, order } = req.body;

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

        // Update fields
        if (title) milestone.title = title;
        if (description !== undefined) milestone.description = description;
        if (status) {
            milestone.status = status;
            if (status === 'completed' && !milestone.completed_at) {
                milestone.completed_at = new Date();
            }
        }
        if (due_date !== undefined) milestone.due_date = due_date;
        if (admin_notes !== undefined) milestone.admin_notes = admin_notes;
        if (order !== undefined) milestone.order = order;

        await milestone.save();

        // Check if all milestones are completed to update project status
        const project = await Project.findByPk(projectId, {
            include: [{ model: ProjectMilestone, as: 'milestones' }]
        });

        const allCompleted = project.milestones.every(m => m.status === 'completed');
        if (allCompleted && project.milestones.length > 0) {
            project.status = 'completed';
            project.actual_completion = new Date();
            await project.save();
        }

        res.json({
            success: true,
            milestone
        });

    } catch (error) {
        console.error('Error updating milestone:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update milestone'
        });
    }
});

// ============================================
// DELETE /api/admin/projects/:projectId/milestones/:milestoneId - Delete milestone
// ============================================
router.delete('/:projectId/milestones/:milestoneId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { projectId, milestoneId } = req.params;

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

        await milestone.destroy();

        res.json({
            success: true,
            message: 'Milestone deleted'
        });

    } catch (error) {
        console.error('Error deleting milestone:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete milestone'
        });
    }
});

// ============================================
// POST /api/admin/projects/:projectId/milestones/:milestoneId/messages - Admin adds message
// ============================================
router.post('/:projectId/milestones/:milestoneId/messages', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { projectId, milestoneId } = req.params;
        const { message } = req.body;

        if (!message || message.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
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

        // Create admin message
        const newMessage = await ProjectMessage.create({
            milestone_id: milestoneId,
            user_id: req.adminUser.id,
            is_admin: true,
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
        console.error('Error adding admin message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add message'
        });
    }
});

// ============================================
// GET /api/admin/projects/stats/unread - Get unread message count from clients
// ============================================
router.get('/stats/unread', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const unreadCount = await ProjectMessage.count({
            where: {
                is_admin: false,
                read_at: null
            }
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

// ============================================
// POST /api/admin/projects/generate-milestones - Generate milestones with AI
// ============================================
router.post('/generate-milestones', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { prompt, projectTitle } = req.body;

        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'Prompt is required'
            });
        }

        // Check for OpenAI API key
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            return res.status(500).json({
                success: false,
                error: 'OpenAI API key not configured'
            });
        }

        console.log(`🤖 Generating milestones for project: ${projectTitle}`);

        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a project manager assistant that creates detailed project milestones.
Given a project description, generate a list of milestones that break down the work into manageable phases.
Each milestone should have a clear title and description.
Return your response as a JSON array with this exact structure:
[
  {
    "title": "Milestone title",
    "description": "Brief description of what this milestone involves"
  }
]
Generate between 4-8 milestones depending on project complexity.
Focus on actionable, clear milestones that help track progress.
Always start with a planning/requirements phase and end with testing/deployment.`
                    },
                    {
                        role: 'user',
                        content: `Project Title: ${projectTitle || 'New Project'}

Project Description:
${prompt}

Generate milestones for this project as a JSON array.`
                    }
                ],
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API error:', errorText);
            return res.status(500).json({
                success: false,
                error: 'Failed to generate milestones from AI'
            });
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '';

        // Parse the JSON from the response
        let milestones = [];
        try {
            // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                milestones = JSON.parse(jsonMatch[0]);
            } else {
                milestones = JSON.parse(content);
            }
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            console.log('Raw AI response:', content);
            return res.status(500).json({
                success: false,
                error: 'Failed to parse AI response'
            });
        }

        console.log(`✅ Generated ${milestones.length} milestones`);

        res.json({
            success: true,
            milestones: milestones
        });

    } catch (error) {
        console.error('Error generating milestones:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate milestones'
        });
    }
});

module.exports = router;
