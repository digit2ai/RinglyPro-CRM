'use strict';

const { ActivityLog, Notification } = require('../models');

const logActivity = async (userEmail, action, entityType, entityId, entityName, details = {}) => {
  try {
    await ActivityLog.create({
      workspace_id: 1,
      user_email: userEmail,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      details
    });
  } catch (err) {
    console.log('[D2AI] Activity log error:', err.message);
  }
};

const createNotification = async (userEmail, type, title, message, entityType, entityId) => {
  try {
    await Notification.create({
      workspace_id: 1,
      user_email: userEmail,
      type,
      title,
      message,
      entity_type: entityType,
      entity_id: entityId
    });
  } catch (err) {
    console.log('[D2AI] Notification error:', err.message);
  }
};

module.exports = { logActivity, createNotification };
