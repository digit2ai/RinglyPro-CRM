/**
 * Email Marketing Routes for RinglyPro
 * Handles email sending, webhooks, and analytics
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Pool } = require('pg');
const { sendEmail, sendBulkEmails, previewEmail, getEmailStats, TEMPLATES } = require('../services/sendgrid');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.CRM_DATABASE_URL
});

/**
 * Send single email
 * POST /api/email/send
 */
router.post('/send', async (req, res) => {
    try {
        const { to, template, data, category, subject, html } = req.body;

        if (!to) {
            return res.status(400).json({
                success: false,
                error: 'Recipient email (to) is required'
            });
        }

        const result = await sendEmail({
            to,
            template,
            data,
            category: category || 'transactional',
            subject,
            html
        });

        res.json({
            success: true,
            message: 'Email sent successfully',
            messageId: result[0].headers['x-message-id']
        });
    } catch (error) {
        console.error('Email send error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send email'
        });
    }
});

/**
 * Send bulk emails
 * POST /api/email/send-bulk
 */
router.post('/send-bulk', async (req, res) => {
    try {
        const { emails } = req.body;

        if (!Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'emails array is required'
            });
        }

        const result = await sendBulkEmails(emails);

        res.json({
            success: true,
            message: `${emails.length} emails sent successfully`,
            count: emails.length
        });
    } catch (error) {
        console.error('Bulk email send error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send bulk emails'
        });
    }
});

/**
 * Preview email (sandbox mode)
 * POST /api/email/preview
 */
router.post('/preview', async (req, res) => {
    try {
        const { template, data } = req.body;

        if (!template) {
            return res.status(400).json({
                success: false,
                error: 'template is required'
            });
        }

        await previewEmail(template, data);

        res.json({
            success: true,
            message: 'Preview email sent (sandbox mode)'
        });
    } catch (error) {
        console.error('Email preview error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to preview email'
        });
    }
});

/**
 * Get email statistics
 * GET /api/email/stats?range=7d&category=marketing
 */
router.get('/stats', async (req, res) => {
    try {
        const { range, category } = req.query;

        const stats = await getEmailStats(range || '7d', category, pool);

        res.json({
            success: true,
            stats,
            range: range || '7d',
            category: category || 'all'
        });
    } catch (error) {
        console.error('Email stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch email stats'
        });
    }
});

/**
 * Get available templates
 * GET /api/email/templates
 */
router.get('/templates', (req, res) => {
    res.json({
        success: true,
        templates: TEMPLATES
    });
});

/**
 * SendGrid Event Webhook
 * POST /api/email/webhooks/sendgrid
 *
 * Receives events: delivered, open, click, bounce, dropped, spamreport, unsubscribe, etc.
 */
router.post('/webhooks/sendgrid', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        // Verify SendGrid signature (optional but recommended)
        const signature = req.header('X-Twilio-Email-Event-Webhook-Signature');
        const timestamp = req.header('X-Twilio-Email-Event-Webhook-Timestamp');

        if (signature && timestamp && process.env.SENDGRID_EVENT_PUBLIC_KEY) {
            const publicKeyPem = process.env.SENDGRID_EVENT_PUBLIC_KEY;
            const verifyData = Buffer.concat([
                Buffer.from(timestamp),
                Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body))
            ]);

            try {
                const isValid = crypto.verify(
                    null, // Ed25519
                    verifyData,
                    crypto.createPublicKey(publicKeyPem),
                    Buffer.from(signature, 'base64')
                );

                if (!isValid) {
                    console.warn('⚠️ Invalid SendGrid webhook signature');
                    return res.status(401).send('Invalid signature');
                }
            } catch (verifyError) {
                console.error('Signature verification error:', verifyError);
                // Continue anyway if verification fails (for development)
            }
        }

        // Parse events
        const bodyStr = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
        const events = JSON.parse(bodyStr);

        console.log(`📬 Received ${events.length} SendGrid webhook events`);

        // Store events in database
        const client = await pool.connect();
        try {
            for (const event of events) {
                const sgEventId = event.sg_event_id || crypto.randomUUID();
                const messageId = event.sg_message_id || event['smtp-id'] || null;
                const templateId = event.template_id || null;
                const eventType = event.event;
                const email = event.email;
                const eventTimestamp = event.timestamp;
                const category = Array.isArray(event.category) ? event.category.join(',') : (event.category || null);

                await client.query(
                    `INSERT INTO email_events (sg_event_id, message_id, template_id, event, email, timestamp, category, payload)
                     VALUES ($1, $2, $3, $4, $5, TO_TIMESTAMP($6), $7, $8)
                     ON CONFLICT (sg_event_id) DO NOTHING`,
                    [sgEventId, messageId, templateId, eventType, email, eventTimestamp, category, event]
                );

                console.log(`  ✓ ${eventType} - ${email}`);
            }
        } finally {
            client.release();
        }

        res.send('ok');
    } catch (error) {
        console.error('❌ SendGrid webhook error:', error);
        res.status(500).send('error');
    }
});

/**
 * Get recent email events
 * GET /api/email/events?limit=50&event=open
 */
router.get('/events', async (req, res) => {
    try {
        const { limit = 50, event, email, category } = req.query;

        let query = 'SELECT * FROM email_events WHERE 1=1';
        const params = [];
        let paramCount = 1;

        if (event) {
            query += ` AND event = $${paramCount}`;
            params.push(event);
            paramCount++;
        }

        if (email) {
            query += ` AND email = $${paramCount}`;
            params.push(email);
            paramCount++;
        }

        if (category) {
            query += ` AND category = $${paramCount}`;
            params.push(category);
            paramCount++;
        }

        query += ` ORDER BY timestamp DESC LIMIT $${paramCount}`;
        params.push(parseInt(limit));

        const result = await pool.query(query, params);

        res.json({
            success: true,
            events: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Email events error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch email events'
        });
    }
});

module.exports = router;
