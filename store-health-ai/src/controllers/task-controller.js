'use strict';

const { Task, Store, Alert, KpiDefinition } = require('../../models');
const { Op } = require('sequelize');

/**
 * Task Controller
 * Handles task management endpoints
 */

/**
 * Get all tasks (with filters)
 * GET /api/v1/tasks
 */
exports.getAllTasks = async (req, res) => {
  const { store_id, status, priority, assigned_to_role, limit = 50, offset = 0 } = req.query;

  const where = {};
  if (store_id) where.store_id = store_id;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (assigned_to_role) where.assigned_to_role = assigned_to_role;

  const tasks = await Task.findAll({
    where,
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name']
      },
      {
        model: Alert,
        as: 'alert',
        attributes: ['id', 'severity', 'title']
      },
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name']
      }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['priority', 'ASC'], ['due_date', 'ASC']]
  });

  res.json({
    success: true,
    data: tasks,
    count: tasks.length
  });
};

/**
 * Get task by ID
 * GET /api/v1/tasks/:id
 */
exports.getTaskById = async (req, res) => {
  const { id } = req.params;

  const task = await Task.findByPk(id, {
    include: [
      {
        model: Store,
        as: 'store'
      },
      {
        model: Alert,
        as: 'alert',
        include: [
          {
            model: KpiDefinition,
            as: 'kpiDefinition'
          }
        ]
      }
    ]
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: { message: 'Task not found', statusCode: 404 }
    });
  }

  res.json({
    success: true,
    data: task
  });
};

/**
 * Mark task as complete
 * POST /api/v1/tasks/:id/complete
 * Body: { completed_by, outcome }
 */
exports.completeTask = async (req, res) => {
  const { id } = req.params;
  const { completed_by, outcome } = req.body;

  const task = await Task.findByPk(id);

  if (!task) {
    return res.status(404).json({
      success: false,
      error: { message: 'Task not found', statusCode: 404 }
    });
  }

  await task.update({
    status: 'completed',
    completed_at: new Date(),
    completed_by: completed_by || 'System',
    outcome: outcome || 'Task completed'
  });

  res.json({
    success: true,
    data: task,
    message: 'Task completed successfully'
  });
};

/**
 * Update task status
 * POST /api/v1/tasks/:id/update-status
 * Body: { status }
 */
exports.updateTaskStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      error: { message: 'status is required', statusCode: 400 }
    });
  }

  const task = await Task.findByPk(id);

  if (!task) {
    return res.status(404).json({
      success: false,
      error: { message: 'Task not found', statusCode: 404 }
    });
  }

  await task.update({ status });

  res.json({
    success: true,
    data: task,
    message: 'Task status updated successfully'
  });
};

/**
 * Get pending tasks
 * GET /api/v1/tasks/status/pending
 */
exports.getPendingTasks = async (req, res) => {
  const { limit = 50 } = req.query;

  const tasks = await Task.findAll({
    where: {
      status: {
        [Op.in]: ['pending', 'in_progress']
      }
    },
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name']
      }
    ],
    limit: parseInt(limit),
    order: [['priority', 'ASC'], ['due_date', 'ASC']]
  });

  res.json({
    success: true,
    data: tasks,
    count: tasks.length
  });
};

/**
 * Get overdue tasks
 * GET /api/v1/tasks/status/overdue
 */
exports.getOverdueTasks = async (req, res) => {
  const { limit = 50 } = req.query;

  const tasks = await Task.findAll({
    where: {
      status: {
        [Op.in]: ['pending', 'in_progress']
      },
      due_date: {
        [Op.lt]: new Date()
      }
    },
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name', 'manager_name']
      }
    ],
    limit: parseInt(limit),
    order: [['due_date', 'ASC']]
  });

  res.json({
    success: true,
    data: tasks,
    count: tasks.length
  });
};
