'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');
const { authenticateAndGetClient } = require('../middleware/wcc-auth');

/**
 * GET / - Dashboard stats
 * Returns call stats for the authenticated client
 */
router.get(['/', '/stats'], authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
    const today = new Date().toISOString().split('T')[0];

    // Total calls this month
    const [totalCallsResult] = await sequelize.query(`
      SELECT COUNT(*) as total_calls
      FROM messages
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
        AND created_at >= :startOfMonth
    `, {
      replacements: { clientId, startOfMonth },
      type: QueryTypes.SELECT
    });

    // Total minutes this month (call_duration is in seconds)
    const [totalMinutesResult] = await sequelize.query(`
      SELECT COALESCE(SUM(call_duration) / 60.0, 0) as total_minutes
      FROM messages
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
        AND created_at >= :startOfMonth
    `, {
      replacements: { clientId, startOfMonth },
      type: QueryTypes.SELECT
    });

    // Minutes remaining - check credit_accounts first, fallback to monthly_free_minutes
    const [creditResult] = await sequelize.query(`
      SELECT ca.balance_minutes, c.monthly_free_minutes
      FROM clients c
      LEFT JOIN credit_accounts ca ON ca.client_id = c.id
      WHERE c.id = :clientId
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    const totalMinutes = parseFloat(totalMinutesResult.total_minutes) || 0;
    let minutesRemaining = 0;
    if (creditResult) {
      if (creditResult.balance_minutes !== null && creditResult.balance_minutes !== undefined) {
        minutesRemaining = parseFloat(creditResult.balance_minutes) || 0;
      } else if (creditResult.monthly_free_minutes) {
        minutesRemaining = Math.max(0, parseFloat(creditResult.monthly_free_minutes) - totalMinutes);
      }
    }

    // Average call duration this month (in seconds)
    const [avgDurationResult] = await sequelize.query(`
      SELECT COALESCE(AVG(call_duration), 0) as avg_duration
      FROM messages
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
        AND call_duration > 0
        AND created_at >= :startOfMonth
    `, {
      replacements: { clientId, startOfMonth },
      type: QueryTypes.SELECT
    });

    // Calls today
    const [callsTodayResult] = await sequelize.query(`
      SELECT COUNT(*) as calls_today
      FROM messages
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
        AND created_at::date = :today
    `, {
      replacements: { clientId, today },
      type: QueryTypes.SELECT
    });

    // Calls this week
    const [callsThisWeekResult] = await sequelize.query(`
      SELECT COUNT(*) as calls_this_week
      FROM messages
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
        AND created_at >= :startOfWeek
    `, {
      replacements: { clientId, startOfWeek },
      type: QueryTypes.SELECT
    });

    // Daily call volume (last 30 days grouped by date)
    const dailyCallVolume = await sequelize.query(`
      SELECT
        created_at::date as date,
        COUNT(*) as call_count,
        COALESCE(SUM(call_duration) / 60.0, 0) as minutes
      FROM messages
      WHERE client_id = :clientId
        AND message_type = 'call'
        AND message_source = 'elevenlabs'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY created_at::date
      ORDER BY date ASC
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        totalCalls: parseInt(totalCallsResult.total_calls) || 0,
        totalMinutes: Math.round(totalMinutes * 100) / 100,
        minutesRemaining: Math.round(minutesRemaining * 100) / 100,
        avgCallDuration: Math.round(parseFloat(avgDurationResult.avg_duration) || 0),
        callsToday: parseInt(callsTodayResult.calls_today) || 0,
        callsThisWeek: parseInt(callsThisWeekResult.calls_this_week) || 0,
        dailyCallVolume: dailyCallVolume.map(row => ({
          date: row.date,
          callCount: parseInt(row.call_count),
          minutes: Math.round(parseFloat(row.minutes) * 100) / 100
        }))
      }
    });
  } catch (error) {
    console.error('Web Call Center dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard stats'
    });
  }
});

module.exports = router;
