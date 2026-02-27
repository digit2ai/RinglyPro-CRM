'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');

/**
 * POST / - Public token endpoint (no auth required)
 * Called by the widget from customer websites to get a signed WebSocket URL
 * Body: { widget_id }
 */
router.post('/', async (req, res) => {
  try {
    const { widget_id } = req.body;

    if (!widget_id) {
      return res.status(400).json({
        success: false,
        error: 'widget_id is required'
      });
    }

    // Validate widget_id against wcc_widget_configs (must be enabled)
    const [widgetConfig] = await sequelize.query(`
      SELECT
        wc.client_id,
        wc.widget_id,
        wc.enabled,
        wc.agent_name,
        wc.greeting_message,
        wc.primary_color,
        wc.allowed_domains
      FROM wcc_widget_configs wc
      WHERE wc.widget_id = :widgetId
        AND wc.enabled = true
    `, {
      replacements: { widgetId: widget_id },
      type: QueryTypes.SELECT
    });

    if (!widgetConfig) {
      return res.status(404).json({
        success: false,
        error: 'Widget not found or disabled'
      });
    }

    // Check Origin header against allowed_domains (if any configured)
    const allowedDomains = widgetConfig.allowed_domains || [];
    if (Array.isArray(allowedDomains) && allowedDomains.length > 0) {
      const origin = req.headers.origin || req.headers.referer || '';
      const originHost = origin ? new URL(origin).hostname : '';

      const isAllowed = allowedDomains.some(domain => {
        if (domain === '*') return true;
        return originHost === domain || originHost.endsWith('.' + domain);
      });

      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          error: 'Domain not authorized for this widget'
        });
      }
    }

    // Load active knowledge base content for this client
    const knowledgeBases = await sequelize.query(`
      SELECT content, name, type
      FROM wcc_knowledge_bases
      WHERE client_id = :clientId
        AND status = 'active'
        AND content IS NOT NULL
      ORDER BY updated_at DESC
    `, {
      replacements: { clientId: widgetConfig.client_id },
      type: QueryTypes.SELECT
    });

    // Combine knowledge base content
    const knowledgeBaseContent = knowledgeBases.map(kb => {
      return `--- ${kb.name} (${kb.type}) ---\n${kb.content}`;
    }).join('\n\n');

    // Get client's elevenlabs_agent_id from clients table
    const [client] = await sequelize.query(`
      SELECT elevenlabs_agent_id FROM clients WHERE id = :clientId
    `, {
      replacements: { clientId: widgetConfig.client_id },
      type: QueryTypes.SELECT
    });

    if (!client || !client.elevenlabs_agent_id) {
      return res.status(500).json({
        success: false,
        error: 'Voice agent not configured for this client'
      });
    }

    const agentId = client.elevenlabs_agent_id;

    // Get signed WebSocket URL from ElevenLabs API
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs signed URL error:', response.status, errorText);
      return res.status(502).json({
        success: false,
        error: 'Failed to get signed URL from ElevenLabs'
      });
    }

    const elevenLabsData = await response.json();

    res.json({
      success: true,
      signed_url: elevenLabsData.signed_url,
      agent_name: widgetConfig.agent_name,
      greeting: widgetConfig.greeting_message,
      knowledge_base: knowledgeBaseContent || null,
      primary_color: widgetConfig.primary_color
    });
  } catch (error) {
    console.error('Web Call Center token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate conversation token'
    });
  }
});

module.exports = router;
