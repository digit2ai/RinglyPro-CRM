'use strict';

/**
 * Lawn Co-Pilot — customer communications
 *
 * Template-driven, channel-aware, consent-aware. Every send is logged to
 * lc_notifications whether or not it actually transmits.
 *
 * EMAIL_AUTOSEND_DISABLED (default ON repo-wide) kills server-initiated email.
 * Those notifications are recorded as 'queued' for the operator to review and
 * send. User-clicked sends pass { userInitiated: true } and go through.
 */

const { Notification, Customer } = require('../models');

const AUTOSEND_DISABLED = () => process.env.EMAIL_AUTOSEND_DISABLED !== '0';

// ── Templates ──────────────────────────────────────────────────────────────
const TEMPLATES = {
  quote_confirmation: {
    subject: 'Your Lawn Co-Pilot estimate',
    marketing: false,
    body: (v) => `Hi ${v.name},

Here is the estimate for ${v.address}.

Serviceable lawn area: ${fmtNum(v.serviceable_sqft)} sq ft
${v.frequency_label}: ${v.price}

${v.is_estimate ? 'This is a preliminary estimate based on available property records and is subject to final verification before service.\n\n' : ''}You can review it, pick a plan, and schedule your first service here:
${v.quote_url}

Lawn Co-Pilot`
  },
  account_registration: {
    subject: 'Welcome to Lawn Co-Pilot',
    marketing: false,
    body: (v) => `Hi ${v.name},

Your Lawn Co-Pilot account is ready. You can view your schedule, property details, service history, and billing anytime:

${v.portal_url}

Lawn Co-Pilot`
  },
  appointment_confirmation: {
    subject: 'Your lawn service is scheduled',
    marketing: false,
    body: (v) => `Hi ${v.name},

Your service is confirmed.

Date: ${v.date_display}
Arrival window: ${v.window}
Property: ${v.address}

Need to change it? Manage your schedule anytime at ${v.portal_url}

Lawn Co-Pilot`
  },
  service_reminder: {
    subject: 'Lawn service tomorrow',
    marketing: false,
    body: (v) => `Hi ${v.name},

A reminder that your lawn service is scheduled for ${v.date_display}, arriving between ${v.window}.

Please leave gates unlocked and pick up any loose items in the yard.

Lawn Co-Pilot`
  },
  on_the_way: {
    subject: 'Your crew is on the way',
    marketing: false,
    body: (v) => `Hi ${v.name}, your Lawn Co-Pilot crew is on the way to ${v.address} and should arrive within the hour.`
  },
  weather_delay: {
    subject: 'Weather delay on your lawn service',
    marketing: false,
    body: (v) => `Hi ${v.name},

Weather has delayed your service scheduled for ${v.date_display}. We will reschedule you for the next available day and confirm the new date.

No action is needed from you, and you are not charged for a visit we did not make.

Lawn Co-Pilot`
  },
  service_completed: {
    subject: 'Your lawn service is complete',
    marketing: false,
    body: (v) => `Hi ${v.name},

Your lawn service at ${v.address} is complete.

Serviced: ${fmtNum(v.area)} sq ft
${v.notes ? 'Crew notes: ' + v.notes + '\n' : ''}
See photos and the full service record in your portal: ${v.portal_url}

Lawn Co-Pilot`
  },
  invoice_issued: {
    subject: (v) => `Invoice ${v.invoice_number} from Lawn Co-Pilot`,
    marketing: false,
    body: (v) => `Hi ${v.name},

Invoice ${v.invoice_number} for ${v.amount} is ready.

Service date: ${v.date_display}
Due: ${v.due_display}

View or pay online: ${v.portal_url}

Lawn Co-Pilot`
  },
  payment_receipt: {
    subject: 'Payment received',
    marketing: false,
    body: (v) => `Hi ${v.name},

We received your payment of ${v.amount}. Thank you.

Invoice: ${v.invoice_number}
Method: ${v.method}

Lawn Co-Pilot`
  },
  payment_failed: {
    subject: 'We could not process your payment',
    marketing: false,
    body: (v) => `Hi ${v.name},

Your payment of ${v.amount} for invoice ${v.invoice_number} did not go through${v.reason ? ' (' + v.reason + ')' : ''}.

You can update your payment method or retry here: ${v.portal_url}

Your service is not affected while we sort this out.

Lawn Co-Pilot`
  },
  autopay_advance_notice: {
    subject: 'Upcoming automatic payment',
    marketing: false,
    body: (v) => `Hi ${v.name},

Your card ending in ${v.last4} will be charged ${v.amount} on ${v.date_display} for invoice ${v.invoice_number}.

To change the method or turn off automatic payments, visit ${v.portal_url}

Lawn Co-Pilot`
  },
  service_renewal: {
    subject: 'Your lawn care plan renews soon',
    marketing: false,
    body: (v) => `Hi ${v.name}, your ${v.frequency_label} plan continues into the new season. Nothing is required from you. Manage your plan anytime at ${v.portal_url}`
  },
  feedback_request: {
    subject: 'How did we do?',
    marketing: false,
    body: (v) => `Hi ${v.name},

We just finished your lawn at ${v.address}. If anything is not right, reply to this message and a person will handle it.

Lawn Co-Pilot`
  },
  seasonal_offer: {
    subject: 'A seasonal offer from Lawn Co-Pilot',
    marketing: true,
    body: (v) => `Hi ${v.name},

${v.offer_text}

Lawn Co-Pilot`
  }
};

function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }

// ── Consent ────────────────────────────────────────────────────────────────
// Checked at SEND time, not at template time.
function consentAllows(customer, channel, isMarketing) {
  if (!isMarketing) return { ok: true };
  const c = (customer && customer.consent) || {};
  if (channel === 'sms' && !c.sms_marketing) return { ok: false, reason: 'no_sms_marketing_consent' };
  if (channel === 'email' && !c.email_marketing) return { ok: false, reason: 'no_email_marketing_consent' };
  return { ok: true };
}

/**
 * Queue or send one notification. Always returns; never throws into a caller's
 * business logic — a failed email must not break a booking.
 */
async function notify({ tenant_id, customer_id, channel, template, vars = {}, to, userInitiated = false }) {
  const tpl = TEMPLATES[template];
  if (!tpl) return { success: false, error: `Unknown template: ${template}` };

  let customer = null;
  if (customer_id) {
    try { customer = await Customer.findOne({ where: { id: customer_id, tenant_id }, raw: true }); } catch (e) { /* best effort */ }
  }

  const isMarketing = !!tpl.marketing;
  const consent = consentAllows(customer, channel, isMarketing);

  const subject = typeof tpl.subject === 'function' ? tpl.subject(vars) : tpl.subject;
  const body = tpl.body(vars);
  const toAddress = to || (channel === 'sms' ? (customer && customer.phone) : (customer && customer.email)) || null;

  let status = 'queued';
  let reason = null;
  let providerId = null;

  if (!consent.ok) {
    status = 'suppressed';
    reason = consent.reason;
  } else if (channel === 'portal') {
    status = 'sent';
  } else if (channel === 'email') {
    if (AUTOSEND_DISABLED() && !userInitiated) {
      status = 'queued';
      reason = 'EMAIL_AUTOSEND_DISABLED';
    } else {
      const r = await sendEmail(toAddress, subject, body);
      status = r.ok ? 'sent' : 'failed';
      reason = r.ok ? null : r.error;
      providerId = r.id || null;
    }
  } else if (channel === 'sms') {
    const r = await sendSms(toAddress, body);
    status = r.ok ? 'sent' : 'failed';
    reason = r.ok ? null : r.error;
    providerId = r.id || null;
  }

  try {
    const row = await Notification.create({
      tenant_id, customer_id: customer_id || null, channel, template,
      to_address: toAddress, subject, body, status, provider_id: providerId, reason
    });
    return { success: status !== 'failed', status, reason, notification_id: row.id };
  } catch (e) {
    return { success: false, error: e.message, status, reason };
  }
}

async function sendEmail(to, subject, body, opts = {}) {
  const key = process.env.SENDGRID_API_KEY;
  const from = opts.from || process.env.SENDGRID_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: 'sendgrid_not_configured' };
  if (!to) return { ok: false, error: 'no_recipient' };
  try {
    const content = opts.html
      ? [{ type: 'text/plain', value: body }, { type: 'text/html', value: opts.html }]
      : [{ type: 'text/plain', value: body }];
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: opts.fromName || 'Lawn Co-Pilot' },
        subject,
        content
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (r.status >= 200 && r.status < 300) return { ok: true, id: r.headers.get('x-message-id') };
    return { ok: false, error: `sendgrid_http_${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.LAWNCOPILOT_VOICE_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return { ok: false, error: 'twilio_not_configured' };
  if (!to) return { ok: false, error: 'no_recipient' };
  try {
    const body_ = new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1500) });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body_,
      signal: AbortSignal.timeout(10000)
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, id: j.sid };
    return { ok: false, error: j.message || `twilio_http_${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { notify, TEMPLATES, sendEmail, sendSms, consentAllows };
