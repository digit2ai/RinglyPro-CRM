'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');
const { authenticateAndGetClient } = require('../middleware/wcc-auth');

/**
 * GET / - Get usage stats for client
 * Returns minutes used/remaining and daily breakdown for the current month
 */
router.get('/', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Get total minutes used this month
    const [minutesResult] = await sequelize.query(`
      SELECT COALESCE(SUM(call_duration) / 60.0, 0) as minutes_used
      FROM messages
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
        AND created_at >= :startOfMonth
    `, {
      replacements: { clientId, startOfMonth },
      type: QueryTypes.SELECT
    });

    // Get client plan info and credit account balance
    const [planResult] = await sequelize.query(`
      SELECT
        c.monthly_free_minutes,
        ca.balance,
        ca.total_minutes_used
      FROM clients c
      LEFT JOIN credit_accounts ca ON ca.client_id = c.id
      WHERE c.id = :clientId
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    const minutesUsed = Math.round((parseFloat(minutesResult.minutes_used) || 0) * 100) / 100;

    // Determine total available minutes
    let minutesTotal = 0;
    if (planResult) {
      if (planResult.balance !== null && planResult.balance !== undefined && parseFloat(planResult.balance) > 0) {
        // Credit-based: total is used + remaining balance
        minutesTotal = minutesUsed + (parseFloat(planResult.balance) || 0);
      } else if (planResult.monthly_free_minutes) {
        minutesTotal = parseFloat(planResult.monthly_free_minutes) || 0;
      }
    }

    const minutesRemaining = Math.max(0, Math.round((minutesTotal - minutesUsed) * 100) / 100);
    const percentUsed = minutesTotal > 0 ? Math.round((minutesUsed / minutesTotal) * 10000) / 100 : 0;

    // Daily breakdown for current month
    const dailyBreakdown = await sequelize.query(`
      SELECT
        created_at::date as date,
        COUNT(*) as call_count,
        COALESCE(SUM(call_duration) / 60.0, 0) as minutes
      FROM messages
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
        AND created_at >= :startOfMonth
      GROUP BY created_at::date
      ORDER BY date ASC
    `, {
      replacements: { clientId, startOfMonth },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        minutesUsed,
        minutesTotal: Math.round(minutesTotal * 100) / 100,
        minutesRemaining,
        percentUsed,
        dailyBreakdown: dailyBreakdown.map(row => ({
          date: row.date,
          callCount: parseInt(row.call_count),
          minutes: Math.round(parseFloat(row.minutes) * 100) / 100
        }))
      }
    });
  } catch (error) {
    console.error('Web Call Center usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage data'
    });
  }
});

module.exports = router;
