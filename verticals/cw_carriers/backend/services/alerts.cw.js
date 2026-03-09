/**
 * Email/SMS Alert System
 * Handles hot lead alerts, escalation notifications, and daily digests.
 */
const twilio = require('twilio');
const sequelize = require('./db.cw');

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Alert types and their templates
const ALERT_TEMPLATES = {
  hot_lead: {
    sms: '🔥 HOT LEAD: {company_name} ({contact_name}) - {details}. Call back ASAP!',
    subject: 'Hot Lead Alert — {company_name}'
  },
  escalation: {
    sms: '⚠️ ESCALATION: {reason} — Load {load_ref}, Contact: {contact_name}. Needs immediate attention.',
    subject: 'Escalation Alert — {load_ref}'
  },
  load_covered: {
    sms: '✅ LOAD COVERED: {load_ref} ({origin} → {destination}) — Carrier: {carrier_name}, Rate: ${rate_usd}',
    subject: 'Load Covered — {load_ref}'
  },
  missed_call: {
    sms: '📞 MISSED: Inbound call from {from_number} at {time}. Rachel logged it — follow up needed.',
    subject: 'Missed Call Alert'
  },
  status_change: {
    sms: '📦 STATUS: Load {load_ref} → {status}. {details}',
    subject: 'Load Status Update — {load_ref}'
  },
  daily_digest: {
    subject: 'CW Carriers Daily Digest — {date}'
  }
};

/**
 * Send SMS alert via Twilio
 */
async function sendSms(toNumber, message) {
  if (!toNumber || !TWILIO_NUMBER) return { success: false, error: 'Phone number not configured' };
  try {
    const result = await twilioClient.messages.create({
      to: toNumber,
      from: TWILIO_NUMBER,
      body: message
    });
    await logAlert('sms', toNumber, message, 'sent', result.sid);
    return { success: true, sid: result.sid };
  } catch (err) {
    await logAlert('sms', toNumber, message, 'failed', null, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send email alert via configured SMTP or SendGrid
 * Falls back to logging if no email service configured
 */
async function sendEmail(toEmail, subject, htmlBody) {
  // Check for SendGrid
  const sgKey = process.env.SENDGRID_API_KEY;
  if (sgKey) {
    try {
      const axios = require('axios');
      await axios.post('https://api.sendgrid.com/v3/mail/send', {
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: process.env.ALERT_FROM_EMAIL || 'rachel@ringlypro.com', name: 'Rachel AI — CW Carriers' },
        subject,
        content: [{ type: 'text/html', value: htmlBody }]
      }, {
        headers: { 'Authorization': `Bearer ${sgKey}`, 'Content-Type': 'application/json' }
      });
      await logAlert('email', toEmail, subject, 'sent');
      return { success: true };
    } catch (err) {
      await logAlert('email', toEmail, subject, 'failed', null, err.message);
      return { success: false, error: err.message };
    }
  }

  // Fallback: just log the alert
  await logAlert('email', toEmail, subject, 'logged_only');
  return { success: true, message: 'Email logged (no email service configured)' };
}

/**
 * Send alert to configured recipients
 */
async function sendAlert(alertType, data = {}) {
  const template = ALERT_TEMPLATES[alertType];
  if (!template) return { success: false, error: `Unknown alert type: ${alertType}` };

  // Get alert recipients from settings
  const recipients = await getAlertRecipients(alertType);
  const results = [];

  // Interpolate template
  const smsBody = template.sms ? interpolate(template.sms, data) : null;
  const subject = interpolate(template.subject || `CW Alert: ${alertType}`, data);
  const htmlBody = buildEmailHtml(alertType, data);

  for (const recipient of recipients) {
    if (recipient.phone && smsBody) {
      const smsResult = await sendSms(recipient.phone, smsBody);
      results.push({ type: 'sms', to: recipient.phone, ...smsResult });
    }
    if (recipient.email) {
      const emailResult = await sendEmail(recipient.email, subject, htmlBody);
      results.push({ type: 'email', to: recipient.email, ...emailResult });
    }
  }

  // Fire outbound webhooks for this alert type
  await fireAlertWebhooks(alertType, data);

  return { success: true, alertType, recipients: results.length, results };
}

/**
 * Hot lead alert — triggered when Rachel qualifies a high-value inbound call
 */
async function alertHotLead(contact, details = '') {
  return sendAlert('hot_lead', {
    company_name: contact.company_name || 'Unknown',
    contact_name: contact.full_name || contact.company_name || 'Unknown',
    phone: contact.phone || '',
    details: details || 'High-value shipper inquiry',
    contact_id: contact.id
  });
}

/**
 * Escalation alert — triggered when Rachel can't handle a request
 */
async function alertEscalation(reason, load = {}, contact = {}) {
  return sendAlert('escalation', {
    reason,
    load_ref: load.load_ref || `#${load.id || 'N/A'}`,
    contact_name: contact.full_name || contact.company_name || 'Unknown',
    origin: load.origin || '',
    destination: load.destination || ''
  });
}

/**
 * Load covered alert
 */
async function alertLoadCovered(load, carrier) {
  return sendAlert('load_covered', {
    load_ref: load.load_ref || `#${load.id}`,
    origin: load.origin,
    destination: load.destination,
    carrier_name: carrier.company_name || carrier.full_name || 'Unknown',
    rate_usd: load.rate_usd || '—'
  });
}

/**
 * Build HTML email body
 */
function buildEmailHtml(alertType, data) {
  const typeLabels = {
    hot_lead: { icon: '🔥', color: '#F97316', label: 'HOT LEAD' },
    escalation: { icon: '⚠️', color: '#F85149', label: 'ESCALATION' },
    load_covered: { icon: '✅', color: '#238636', label: 'LOAD COVERED' },
    missed_call: { icon: '📞', color: '#C8962A', label: 'MISSED CALL' },
    status_change: { icon: '📦', color: '#1A4FA8', label: 'STATUS UPDATE' }
  };
  const meta = typeLabels[alertType] || { icon: '🔔', color: '#1A4FA8', label: alertType.toUpperCase() };

  const rows = Object.entries(data)
    .filter(([k]) => !['contact_id', 'load_id'].includes(k))
    .map(([k, v]) => `<tr><td style="padding:8px 12px;color:#8B949E;font-size:12px;text-transform:uppercase;border-bottom:1px solid #21262D;">${k.replace(/_/g, ' ')}</td><td style="padding:8px 12px;color:#E6EDF3;font-size:14px;border-bottom:1px solid #21262D;">${v || '—'}</td></tr>`)
    .join('');

  return `
    <div style="background:#0D1117;padding:32px;font-family:Arial,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#161B22;border-radius:12px;border:1px solid #21262D;overflow:hidden;">
        <div style="background:${meta.color};padding:16px 24px;text-align:center;">
          <span style="font-size:24px;">${meta.icon}</span>
          <span style="color:#fff;font-size:18px;font-weight:700;margin-left:8px;">${meta.label}</span>
        </div>
        <div style="padding:24px;">
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
        </div>
        <div style="padding:16px 24px;text-align:center;border-top:1px solid #21262D;">
          <a href="https://aiagent.ringlypro.com/cw_carriers/dashboard" style="color:#1A4FA8;text-decoration:none;font-size:13px;font-weight:600;">Open CRM Dashboard →</a>
        </div>
        <div style="padding:12px 24px;text-align:center;color:#484F58;font-size:10px;">
          Rachel AI — CW Carriers USA | Powered by RinglyPro
        </div>
      </div>
    </div>`;
}

/**
 * Get alert recipients from settings
 */
async function getAlertRecipients(alertType) {
  try {
    const [rows] = await sequelize.query(
      `SELECT setting_value FROM cw_settings WHERE setting_key = 'alert_recipients'`
    );
    if (rows.length && rows[0].setting_value) {
      return JSON.parse(rows[0].setting_value);
    }
  } catch {}

  // Default: return from env vars
  const defaults = [];
  if (process.env.CW_ALERT_PHONE) defaults.push({ phone: process.env.CW_ALERT_PHONE });
  if (process.env.CW_ALERT_EMAIL) defaults.push({ email: process.env.CW_ALERT_EMAIL });
  return defaults;
}

/**
 * Fire outbound webhooks for alert events
 */
async function fireAlertWebhooks(alertType, data) {
  try {
    const [webhooks] = await sequelize.query(
      `SELECT * FROM cw_webhooks WHERE is_active = true AND event_types ILIKE $1`,
      { bind: [`%${alertType}%`] }
    );
    const axios = require('axios');
    for (const wh of webhooks) {
      const headers = { 'Content-Type': 'application/json' };
      if (wh.auth_type === 'bearer') headers['Authorization'] = `Bearer ${wh.auth_value}`;
      if (wh.auth_type === 'api_key') headers['X-API-Key'] = wh.auth_value;
      axios({ method: wh.method || 'POST', url: wh.url, headers, data: { event: alertType, ...data, timestamp: new Date().toISOString() } })
        .catch(e => console.error(`CW webhook fire error (${wh.url}):`, e.message));
    }
  } catch {}
}

/**
 * Log alert to database
 */
async function logAlert(channel, recipient, message, status, externalId = null, error = null) {
  try {
    await sequelize.query(
      `INSERT INTO cw_alert_log (channel, recipient, message, status, external_id, error_msg, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      { bind: [channel, recipient, message, status, externalId, error] }
    );
  } catch (e) {
    // Table may not exist yet — will be created in migration
    console.error('CW alert log error:', e.message);
  }
}

/**
 * Get alert log
 */
async function getAlertLog(limit = 50) {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM cw_alert_log ORDER BY created_at DESC LIMIT $1`,
      { bind: [limit] }
    );
    return rows;
  } catch {
    return [];
  }
}

function interpolate(template, data) {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

module.exports = {
  sendSms,
  sendEmail,
  sendAlert,
  alertHotLead,
  alertEscalation,
  alertLoadCovered,
  getAlertLog,
  getAlertRecipients,
  ALERT_TEMPLATES
};
