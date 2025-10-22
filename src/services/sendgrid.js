/**
 * SendGrid Email Service for RinglyPro (Multi-Tenant)
 * Handles transactional and marketing emails via SendGrid API
 * Each client can have their own SendGrid configuration
 */

const sgMail = require('@sendgrid/mail');
const { sequelize } = require('../models');

/**
 * Get SendGrid credentials for a specific client
 * @param {Number} clientId Client ID
 * @returns {Promise<Object>} Client's SendGrid configuration
 */
async function getClientSendGridConfig(clientId) {
    if (!clientId) {
        throw new Error('Client ID is required for email sending');
    }

    try {
        const result = await sequelize.query(
            'SELECT sendgrid_api_key, sendgrid_from_email, sendgrid_from_name, sendgrid_reply_to FROM clients WHERE id = :client_id',
            {
                replacements: { client_id: clientId },
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!result || result.length === 0) {
            throw new Error(`Client ${clientId} not found`);
        }

        const client = result[0];

        if (!client.sendgrid_api_key) {
            throw new Error(`SendGrid not configured for client ${clientId}. Please configure SendGrid in CRM Settings.`);
        }

        if (!client.sendgrid_from_email) {
            throw new Error(`SendGrid From Email not configured for client ${clientId}`);
        }

        return {
            apiKey: client.sendgrid_api_key,
            fromEmail: client.sendgrid_from_email,
            fromName: client.sendgrid_from_name || 'RinglyPro',
            replyTo: client.sendgrid_reply_to || client.sendgrid_from_email
        };
    } catch (error) {
        console.error(`Error fetching SendGrid config for client ${clientId}:`, error);
        throw error;
    }
}

// SendGrid Dynamic Template IDs
// TODO: Replace with actual template IDs after creating in SendGrid
const TEMPLATES = {
    missed_call_followup: process.env.SENDGRID_TEMPLATE_MISSED_CALL || 'd-XXXXXXXXXXXXXXX',
    appointment_confirm: process.env.SENDGRID_TEMPLATE_APPOINTMENT || 'd-XXXXXXXXXXXXXXX',
    password_reset: process.env.SENDGRID_TEMPLATE_PASSWORD_RESET || 'd-XXXXXXXXXXXXXXX',
    chamber_invite: process.env.SENDGRID_TEMPLATE_CHAMBER || 'd-XXXXXXXXXXXXXXX',
    custom_marketing: process.env.SENDGRID_TEMPLATE_MARKETING || 'd-XXXXXXXXXXXXXXX'
};

/**
 * Send email via SendGrid (Multi-Tenant)
 * @param {Object} options Email options
 * @param {Number} options.clientId Client ID (REQUIRED for multi-tenant)
 * @param {String} options.to Recipient email
 * @param {String} options.template Template name from TEMPLATES
 * @param {Object} options.data Dynamic template data
 * @param {String} options.category Category for tracking (transactional, marketing, etc.)
 * @param {Boolean} options.sandbox Use sandbox mode (preview only, no delivery)
 * @param {Object} options.from Override from address
 * @param {String} options.subject Subject line (for non-template emails)
 * @param {String} options.html HTML content (for non-template emails)
 * @returns {Promise} SendGrid response
 */
async function sendEmail({
    clientId,
    to,
    template = null,
    data = {},
    category = 'transactional',
    sandbox = false,
    from = null,
    subject = null,
    html = null
}) {
    // Get client-specific SendGrid configuration
    const config = await getClientSendGridConfig(clientId);

    // Initialize SendGrid with client's API key
    const clientSgMail = require('@sendgrid/mail');
    clientSgMail.setApiKey(config.apiKey);

    // Determine from address
    const fromAddress = from || {
        email: config.fromEmail,
        name: config.fromName
    };

    // Build message
    const msg = {
        to,
        from: fromAddress,
        replyTo: config.replyTo,
        categories: [category, `client_${clientId}`]
    };

    // Use template or raw content
    if (template && TEMPLATES[template]) {
        msg.templateId = TEMPLATES[template];
        msg.dynamicTemplateData = data;
    } else if (subject && html) {
        msg.subject = subject;
        msg.html = html;
    } else {
        throw new Error('Must provide either template or subject+html');
    }

    // Add marketing compliance headers
    if (category === 'marketing') {
        msg.headers = {
            'List-Unsubscribe': `<mailto:unsubscribe@ringlypro.com>, <${process.env.APP_BASE_URL || 'https://ringlypro.com'}/unsubscribe>`
        };

        // Only add ASM unsubscribe group if a valid group ID is configured
        const unsubscribeGroupId = parseInt(process.env.SENDGRID_UNSUBSCRIBE_GROUP_ID || '0');
        if (unsubscribeGroupId > 0) {
            msg.asm = {
                groupId: unsubscribeGroupId
            };
        }
    }

    // Sandbox mode for testing
    if (sandbox) {
        msg.mailSettings = {
            sandboxMode: { enable: true }
        };
    }

    // Send email using client's SendGrid configuration
    try {
        console.log(`📧 [Client ${clientId}] Sending ${category} email to ${to} (template: ${template || 'custom'})`);
        console.log(`📧 [Client ${clientId}] From: ${msg.from.email || msg.from} (${msg.from.name || 'no name'})`);
        console.log(`📧 [Client ${clientId}] Reply-To: ${msg.replyTo}`);

        const response = await clientSgMail.send(msg);
        console.log(`✅ [Client ${clientId}] Email sent successfully (msg ID: ${response[0].headers['x-message-id']})`);
        return response;
    } catch (error) {
        console.error(`❌ [Client ${clientId}] SendGrid error:`, error.response?.body || error.message);

        // Extract detailed error information
        if (error.response?.body?.errors) {
            const errorMessages = error.response.body.errors.map(e => e.message).join(', ');
            console.error(`❌ [Client ${clientId}] SendGrid detailed errors: ${errorMessages}`);
            throw new Error(`SendGrid error: ${errorMessages}`);
        }

        throw new Error(error.message || 'SendGrid send failed');
    }
}

/**
 * Send bulk emails (batch) - Multi-Tenant
 * @param {Number} clientId Client ID
 * @param {Array} emails Array of email objects
 * @returns {Promise} SendGrid response
 */
async function sendBulkEmails(clientId, emails) {
    // Get client-specific SendGrid configuration
    const config = await getClientSendGridConfig(clientId);

    // Initialize SendGrid with client's API key
    const clientSgMail = require('@sendgrid/mail');
    clientSgMail.setApiKey(config.apiKey);

    const messages = emails.map(email => ({
        to: email.to,
        from: email.from || {
            email: config.fromEmail,
            name: config.fromName
        },
        replyTo: config.replyTo,
        templateId: email.template ? TEMPLATES[email.template] : undefined,
        dynamicTemplateData: email.data || {},
        subject: email.subject,
        html: email.html,
        categories: [email.category || 'transactional', `client_${clientId}`]
    }));

    try {
        console.log(`📧 [Client ${clientId}] Sending ${messages.length} bulk emails`);
        const response = await clientSgMail.send(messages);
        console.log(`✅ [Client ${clientId}] Bulk emails sent successfully`);
        return response;
    } catch (error) {
        console.error(`❌ [Client ${clientId}] SendGrid bulk error:`, error.response?.body || error.message);
        throw error;
    }
}

/**
 * Preview email in sandbox mode (no actual delivery) - Multi-Tenant
 * @param {Number} clientId Client ID
 * @param {String} template Template name
 * @param {Object} data Dynamic template data
 * @returns {Promise} SendGrid response
 */
async function previewEmail(clientId, template, data = {}) {
    return sendEmail({
        clientId,
        to: 'test@example.com',
        template,
        data,
        sandbox: true,
        category: 'preview'
    });
}

/**
 * Get email statistics from database (Multi-Tenant)
 * @param {String} range Time range: 24h, 7d, 30d
 * @param {String} category Optional category filter
 * @param {Object} pool Database connection pool
 * @param {Number} clientId Client ID for filtering
 * @returns {Promise<Object>} Stats object
 */
async function getEmailStats(range = '7d', category = null, pool, clientId) {
    const intervals = {
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days'
    };

    const interval = intervals[range] || '7 days';

    let query = `
        SELECT
            COUNT(*) FILTER (WHERE event = 'delivered') as delivered,
            COUNT(*) FILTER (WHERE event = 'open') as opens,
            COUNT(*) FILTER (WHERE event = 'click') as clicks,
            COUNT(*) FILTER (WHERE event = 'bounce') as bounces,
            COUNT(*) FILTER (WHERE event = 'spamreport') as spam_reports,
            COUNT(DISTINCT email) as unique_recipients
        FROM email_events
        WHERE timestamp >= NOW() - INTERVAL '${interval}'
    `;

    const params = [];
    let paramCount = 1;

    // Filter by client_id (categories include client_X tag)
    if (clientId) {
        query += ` AND category LIKE $${paramCount}`;
        params.push(`%client_${clientId}%`);
        paramCount++;
    }

    if (category) {
        query += ` AND category = $${paramCount}`;
        params.push(category);
        paramCount++;
    }

    try {
        const result = await pool.query(query, params);
        const stats = result.rows[0];

        // Calculate rates
        const deliveredCount = parseInt(stats.delivered) || 0;
        stats.open_rate = deliveredCount > 0 ? ((parseInt(stats.opens) / deliveredCount) * 100).toFixed(2) : 0;
        stats.click_rate = deliveredCount > 0 ? ((parseInt(stats.clicks) / deliveredCount) * 100).toFixed(2) : 0;
        stats.bounce_rate = deliveredCount > 0 ? ((parseInt(stats.bounces) / deliveredCount) * 100).toFixed(2) : 0;

        return stats;
    } catch (error) {
        console.error('Error fetching email stats:', error);
        throw error;
    }
}

module.exports = {
    sendEmail,
    sendBulkEmails,
    previewEmail,
    getEmailStats,
    getClientSendGridConfig,
    TEMPLATES
};
