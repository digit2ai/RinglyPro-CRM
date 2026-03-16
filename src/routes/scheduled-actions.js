// src/routes/scheduled-actions.js — Scheduled SMS actions with Twilio delivery
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

/**
 * Ensure the scheduled_actions table exists
 */
async function ensureTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS scheduled_actions (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      action_type VARCHAR(50) NOT NULL DEFAULT 'sms',
      recipient_phone VARCHAR(30) NOT NULL,
      recipient_name VARCHAR(255),
      template_id INTEGER,
      message_body TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      twilio_sid VARCHAR(64),
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      executed_at TIMESTAMPTZ
    )
  `);
}

/**
 * GET /api/scheduled-actions?client_id=X
 * List pending scheduled actions for a client
 */
router.get('/', async (req, res) => {
  try {
    const { client_id, status } = req.query;

    if (!client_id) {
      return res.status(400).json({ success: false, error: 'client_id is required' });
    }

    await ensureTable();

    const filterStatus = status || 'pending';

    const actions = await sequelize.query(
      `SELECT * FROM scheduled_actions
       WHERE client_id = :clientId AND status = :status
       ORDER BY scheduled_at ASC`,
      {
        replacements: { clientId: parseInt(client_id), status: filterStatus },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      count: actions.length,
      data: actions
    });
  } catch (error) {
    console.error('Error fetching scheduled actions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch scheduled actions', details: error.message });
  }
});

/**
 * POST /api/scheduled-actions
 * Create a new scheduled action
 * Body: { client_id, recipient_phone, recipient_name?, template_id?, message_body, scheduled_at }
 */
router.post('/', async (req, res) => {
  try {
    const { client_id, recipient_phone, recipient_name, template_id, message_body, scheduled_at } = req.body;

    if (!client_id || !recipient_phone || !message_body || !scheduled_at) {
      return res.status(400).json({
        success: false,
        error: 'client_id, recipient_phone, message_body, and scheduled_at are required'
      });
    }

    // Validate scheduled_at is in the future
    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ success: false, error: 'scheduled_at must be a valid date' });
    }

    if (scheduledDate <= new Date()) {
      return res.status(400).json({ success: false, error: 'scheduled_at must be in the future' });
    }

    await ensureTable();

    const [result] = await sequelize.query(
      `INSERT INTO scheduled_actions
         (client_id, recipient_phone, recipient_name, template_id, message_body, scheduled_at, status)
       VALUES
         (:clientId, :recipientPhone, :recipientName, :templateId, :messageBody, :scheduledAt, 'pending')
       RETURNING *`,
      {
        replacements: {
          clientId: parseInt(client_id),
          recipientPhone: recipient_phone,
          recipientName: recipient_name || null,
          templateId: template_id ? parseInt(template_id) : null,
          messageBody: message_body,
          scheduledAt: scheduledDate.toISOString()
        },
        type: QueryTypes.INSERT
      }
    );

    const created = result[0] || result;

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error) {
    console.error('Error creating scheduled action:', error);
    res.status(500).json({ success: false, error: 'Failed to create scheduled action', details: error.message });
  }
});

/**
 * DELETE /api/scheduled-actions/:id
 * Cancel a pending scheduled action
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await ensureTable();

    const [existing] = await sequelize.query(
      'SELECT * FROM scheduled_actions WHERE id = :id',
      { replacements: { id: parseInt(id) }, type: QueryTypes.SELECT }
    );

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Scheduled action not found' });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel action with status "${existing.status}". Only pending actions can be cancelled.`
      });
    }

    await sequelize.query(
      "UPDATE scheduled_actions SET status = 'cancelled' WHERE id = :id",
      { replacements: { id: parseInt(id) } }
    );

    res.json({
      success: true,
      message: `Scheduled action ${id} cancelled`
    });
  } catch (error) {
    console.error('Error cancelling scheduled action:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel scheduled action', details: error.message });
  }
});

/**
 * POST /api/scheduled-actions/process
 * Process all due scheduled actions — sends SMS via Twilio
 * Typically called by a cron job or manual trigger
 */
router.post('/process', async (req, res) => {
  try {
    await ensureTable();

    // Find all pending actions whose scheduled_at is now or in the past
    const dueActions = await sequelize.query(
      `SELECT sa.*, c.twilio_phone_number AS from_number
       FROM scheduled_actions sa
       LEFT JOIN clients c ON c.id = sa.client_id
       WHERE sa.status = 'pending' AND sa.scheduled_at <= NOW()
       ORDER BY sa.scheduled_at ASC`,
      { type: QueryTypes.SELECT }
    );

    if (dueActions.length === 0) {
      return res.json({ success: true, processed: 0, message: 'No actions due' });
    }

    // Lazy-load Twilio client
    let twilioClient = null;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const defaultFrom = process.env.TWILIO_PHONE_NUMBER;

    if (accountSid && authToken) {
      const twilio = require('twilio');
      twilioClient = twilio(accountSid, authToken);
    }

    const results = { sent: 0, failed: 0, errors: [] };

    for (const action of dueActions) {
      const fromNumber = action.from_number || defaultFrom;

      if (!twilioClient) {
        // Mark failed — no Twilio credentials
        await sequelize.query(
          `UPDATE scheduled_actions
           SET status = 'failed', error_message = 'Twilio not configured', executed_at = NOW()
           WHERE id = :id`,
          { replacements: { id: action.id } }
        );
        results.failed++;
        results.errors.push({ id: action.id, error: 'Twilio not configured' });
        continue;
      }

      if (!fromNumber) {
        await sequelize.query(
          `UPDATE scheduled_actions
           SET status = 'failed', error_message = 'No from number available', executed_at = NOW()
           WHERE id = :id`,
          { replacements: { id: action.id } }
        );
        results.failed++;
        results.errors.push({ id: action.id, error: 'No from number available' });
        continue;
      }

      try {
        const message = await twilioClient.messages.create({
          body: action.message_body,
          from: fromNumber,
          to: action.recipient_phone
        });

        await sequelize.query(
          `UPDATE scheduled_actions
           SET status = 'sent', twilio_sid = :sid, executed_at = NOW()
           WHERE id = :id`,
          { replacements: { id: action.id, sid: message.sid } }
        );
        results.sent++;
      } catch (twilioError) {
        console.error(`Twilio send failed for action ${action.id}:`, twilioError.message);

        await sequelize.query(
          `UPDATE scheduled_actions
           SET status = 'failed', error_message = :errMsg, executed_at = NOW()
           WHERE id = :id`,
          { replacements: { id: action.id, errMsg: twilioError.message } }
        );
        results.failed++;
        results.errors.push({ id: action.id, error: twilioError.message });
      }
    }

    res.json({
      success: true,
      processed: dueActions.length,
      ...results
    });
  } catch (error) {
    console.error('Error processing scheduled actions:', error);
    res.status(500).json({ success: false, error: 'Failed to process scheduled actions', details: error.message });
  }
});

module.exports = router;
