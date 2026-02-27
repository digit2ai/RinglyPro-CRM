'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');
const { authenticateAndGetClient } = require('../middleware/wcc-auth');

/**
 * GET / - List calls for client (paginated)
 * Query params: page (default 1), limit (default 20), search
 */
router.get('/', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let whereClause = `
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
    `;
    const replacements = { clientId, limit, offset };

    // Add search filter if provided
    if (search) {
      whereClause += `
        AND (
          caller_number ILIKE :search
          OR body ILIKE :search
          OR call_summary ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }

    // Get total count
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM messages
      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    const total = parseInt(countResult.total) || 0;
    const totalPages = Math.ceil(total / limit);

    // Get paginated calls
    const calls = await sequelize.query(`
      SELECT
        id,
        caller_number,
        call_duration,
        call_summary,
        body,
        direction,
        status,
        created_at,
        updated_at
      FROM messages
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      calls: calls.map(call => ({
        id: call.id,
        callerNumber: call.caller_number,
        callDuration: call.call_duration,
        callSummary: call.call_summary,
        transcript: call.body,
        direction: call.direction,
        status: call.status,
        createdAt: call.created_at,
        updatedAt: call.updated_at
      })),
      total,
      page,
      totalPages
    });
  } catch (error) {
    console.error('Web Call Center calls list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch calls'
    });
  }
});

/**
 * GET /:id - Get single call detail
 */
router.get('/:id', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;
    const callId = parseInt(req.params.id);

    if (!callId || isNaN(callId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid call ID'
      });
    }

    const [call] = await sequelize.query(`
      SELECT
        id,
        caller_number,
        call_duration,
        call_summary,
        body,
        direction,
        status,
        message_type,
        message_source,
        created_at,
        updated_at
      FROM messages
      WHERE id = :callId
        AND client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
    `, {
      replacements: { callId, clientId },
      type: QueryTypes.SELECT
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.json({
      success: true,
      call: {
        id: call.id,
        callerNumber: call.caller_number,
        callDuration: call.call_duration,
        callSummary: call.call_summary,
        transcript: call.body,
        direction: call.direction,
        status: call.status,
        messageType: call.message_type,
        messageSource: call.message_source,
        createdAt: call.created_at,
        updatedAt: call.updated_at
      }
    });
  } catch (error) {
    console.error('Web Call Center call detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch call details'
    });
  }
});

module.exports = router;
