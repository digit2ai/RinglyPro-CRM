'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');
const { authenticateAndGetClient } = require('../middleware/wcc-auth');

/**
 * Generate a unique widget ID with wcc_ prefix
 */
function generateWidgetId() {
  return 'wcc_' + crypto.randomBytes(12).toString('hex');
}

/**
 * GET / - Get widget config for logged-in client
 * Auto-creates config if none exists
 */
router.get('/', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;

    // Try to find existing config
    let [config] = await sequelize.query(`
      SELECT * FROM wcc_widget_configs WHERE client_id = :clientId
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    // Auto-create if none exists
    if (!config) {
      const widgetId = generateWidgetId();
      await sequelize.query(`
        INSERT INTO wcc_widget_configs (client_id, widget_id, enabled, agent_name, greeting_message, primary_color, position, allowed_domains)
        VALUES (:clientId, :widgetId, true, 'AI Assistant', 'Hi! How can I help you today?', '#4F46E5', 'bottom-right', '[]')
      `, {
        replacements: { clientId, widgetId },
        type: QueryTypes.INSERT
      });

      [config] = await sequelize.query(`
        SELECT * FROM wcc_widget_configs WHERE client_id = :clientId
      `, {
        replacements: { clientId },
        type: QueryTypes.SELECT
      });
    }

    res.json({
      success: true,
      config: {
        id: config.id,
        clientId: config.client_id,
        widgetId: config.widget_id,
        enabled: config.enabled,
        agentName: config.agent_name,
        greetingMessage: config.greeting_message,
        primaryColor: config.primary_color,
        position: config.position,
        allowedDomains: config.allowed_domains || [],
        customCss: config.custom_css,
        createdAt: config.created_at,
        updatedAt: config.updated_at
      }
    });
  } catch (error) {
    console.error('Web Call Center get widget config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch widget config'
    });
  }
});

/**
 * PUT / - Update widget config
 */
router.put('/', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;
    const {
      enabled,
      agentName,
      greetingMessage,
      primaryColor,
      position,
      allowedDomains,
      customCss
    } = req.body;

    // Check config exists
    const [existing] = await sequelize.query(`
      SELECT id FROM wcc_widget_configs WHERE client_id = :clientId
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Widget config not found. Fetch GET / first to auto-create.'
      });
    }

    // Build dynamic update
    const updates = [];
    const replacements = { clientId };

    if (enabled !== undefined) {
      updates.push('enabled = :enabled');
      replacements.enabled = enabled;
    }
    if (agentName !== undefined) {
      updates.push('agent_name = :agentName');
      replacements.agentName = agentName;
    }
    if (greetingMessage !== undefined) {
      updates.push('greeting_message = :greetingMessage');
      replacements.greetingMessage = greetingMessage;
    }
    if (primaryColor !== undefined) {
      updates.push('primary_color = :primaryColor');
      replacements.primaryColor = primaryColor;
    }
    if (position !== undefined) {
      updates.push('position = :position');
      replacements.position = position;
    }
    if (allowedDomains !== undefined) {
      updates.push('allowed_domains = :allowedDomains');
      replacements.allowedDomains = JSON.stringify(allowedDomains);
    }
    if (customCss !== undefined) {
      updates.push('custom_css = :customCss');
      replacements.customCss = customCss;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = NOW()');

    await sequelize.query(`
      UPDATE wcc_widget_configs
      SET ${updates.join(', ')}
      WHERE client_id = :clientId
    `, {
      replacements,
      type: QueryTypes.UPDATE
    });

    // Fetch updated config
    const [config] = await sequelize.query(`
      SELECT * FROM wcc_widget_configs WHERE client_id = :clientId
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      config: {
        id: config.id,
        clientId: config.client_id,
        widgetId: config.widget_id,
        enabled: config.enabled,
        agentName: config.agent_name,
        greetingMessage: config.greeting_message,
        primaryColor: config.primary_color,
        position: config.position,
        allowedDomains: config.allowed_domains || [],
        customCss: config.custom_css,
        createdAt: config.created_at,
        updatedAt: config.updated_at
      }
    });
  } catch (error) {
    console.error('Web Call Center update widget config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update widget config'
    });
  }
});

/**
 * GET /embed-code - Generate embed code snippet
 */
router.get('/embed-code', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;

    const [config] = await sequelize.query(`
      SELECT widget_id, agent_name, primary_color, position
      FROM wcc_widget_configs
      WHERE client_id = :clientId
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Widget config not found. Create one first via GET /api/v1/widget'
      });
    }

    const baseUrl = process.env.APP_URL || 'https://aiagent.ringlypro.com/wcc';
    const embedCode = `<!-- RinglyPro Web Call Center Widget -->
<script>
  (function() {
    var s = document.createElement('script');
    s.src = '${baseUrl}/widget/wcc-widget.js';
    s.setAttribute('data-widget-id', '${config.widget_id}');
    s.async = true;
    document.head.appendChild(s);
  })();
</script>`;

    res.json({
      success: true,
      widgetId: config.widget_id,
      embedCode
    });
  } catch (error) {
    console.error('Web Call Center embed code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate embed code'
    });
  }
});

module.exports = router;
