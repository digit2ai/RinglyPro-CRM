/**
 * SendGrid Email Service for RinglyPro
 * Handles transactional and marketing emails via SendGrid API
 */

const sgMail = require('@sendgrid/mail');

// Initialize SendGrid with API key
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('✅ SendGrid initialized');
} else {
    console.warn('⚠️ SENDGRID_API_KEY not set - email sending disabled');
}

// Default from addresses
const FROM = {
    email: process.env.SENDGRID_FROM_EMAIL || 'notify@ringlypro.com',
    name: process.env.SENDGRID_FROM_NAME || 'RinglyPro'
};

const MARKETING_FROM = {
    email: process.env.SENDGRID_MARKETING_FROM || 'updates@ringlypro.com',
    name: process.env.SENDGRID_FROM_NAME || 'RinglyPro'
};

const REPLY_TO = process.env.SENDGRID_REPLY_TO || 'info@digit2ai.com';

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
 * Send email via SendGrid
 * @param {Object} options Email options
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
    to,
    template = null,
    data = {},
    category = 'transactional',
    sandbox = false,
    from = null,
    subject = null,
    html = null
}) {
    if (!process.env.SENDGRID_API_KEY) {
        throw new Error('SendGrid API key not configured');
    }

    // Determine from address based on category
    const fromAddress = from || (category === 'marketing' ? MARKETING_FROM : FROM);

    // Build message
    const msg = {
        to,
        from: fromAddress,
        replyTo: REPLY_TO,
        categories: [category]
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
        msg.asm = {
            groupId: parseInt(process.env.SENDGRID_UNSUBSCRIBE_GROUP_ID || '0')
        };
    }

    // Sandbox mode for testing
    if (sandbox) {
        msg.mailSettings = {
            sandboxMode: { enable: true }
        };
    }

    // Send email
    try {
        console.log(`📧 Sending ${category} email to ${to} (template: ${template || 'custom'})`);
        const response = await sgMail.send(msg);
        console.log(`✅ Email sent successfully (msg ID: ${response[0].headers['x-message-id']})`);
        return response;
    } catch (error) {
        console.error('❌ SendGrid error:', error.response?.body || error.message);
        throw error;
    }
}

/**
 * Send bulk emails (batch)
 * @param {Array} emails Array of email objects
 * @returns {Promise} SendGrid response
 */
async function sendBulkEmails(emails) {
    if (!process.env.SENDGRID_API_KEY) {
        throw new Error('SendGrid API key not configured');
    }

    const messages = emails.map(email => ({
        to: email.to,
        from: email.from || (email.category === 'marketing' ? MARKETING_FROM : FROM),
        replyTo: REPLY_TO,
        templateId: email.template ? TEMPLATES[email.template] : undefined,
        dynamicTemplateData: email.data || {},
        subject: email.subject,
        html: email.html,
        categories: [email.category || 'transactional']
    }));

    try {
        console.log(`📧 Sending ${messages.length} bulk emails`);
        const response = await sgMail.send(messages);
        console.log(`✅ Bulk emails sent successfully`);
        return response;
    } catch (error) {
        console.error('❌ SendGrid bulk error:', error.response?.body || error.message);
        throw error;
    }
}

/**
 * Preview email in sandbox mode (no actual delivery)
 * @param {String} template Template name
 * @param {Object} data Dynamic template data
 * @returns {Promise} SendGrid response
 */
async function previewEmail(template, data = {}) {
    return sendEmail({
        to: 'test@example.com',
        template,
        data,
        sandbox: true,
        category: 'preview'
    });
}

/**
 * Get email statistics from database
 * @param {String} range Time range: 24h, 7d, 30d
 * @param {String} category Optional category filter
 * @returns {Promise<Object>} Stats object
 */
async function getEmailStats(range = '7d', category = null, pool) {
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
    if (category) {
        query += ' AND category = $1';
        params.push(category);
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
    TEMPLATES,
    FROM,
    MARKETING_FROM
};
