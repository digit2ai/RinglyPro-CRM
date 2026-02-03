'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const taskController = require('../controllers/task-controller');

/**
 * Task Routes
 */

// GET /api/v1/tasks - Get all tasks (with filters)
router.get('/', asyncHandler(taskController.getAllTasks));

// GET /api/v1/tasks/:id - Get task by ID
router.get('/:id', asyncHandler(taskController.getTaskById));

// POST /api/v1/tasks/:id/complete - Mark task as complete
router.post('/:id/complete', asyncHandler(taskController.completeTask));

// POST /api/v1/tasks/:id/update-status - Update task status
router.post('/:id/update-status', asyncHandler(taskController.updateTaskStatus));

// GET /api/v1/tasks/pending/all - Get all pending tasks
router.get('/status/pending', asyncHandler(taskController.getPendingTasks));

// GET /api/v1/tasks/overdue/all - Get overdue tasks
router.get('/status/overdue', asyncHandler(taskController.getOverdueTasks));

module.exports = router;
