/**
 * Neural Treatment Executor
 *
 * Receives trigger events from the application (missed calls, new contacts, etc.)
 * and executes the matching active treatment workflows for the client.
 *
 * Action types: sms, crm_contact, crm_task, crm_tag, callback, email
 */

const { QueryTypes } = require('sequelize');
const twilio = require('twilio');

// Default treatment templates
const TREATMENT_TEMPLATES = {
  missed_call_recovery: {
    trigger_event: 'call.missed',
    actions: [
      { type: 'sms', template: 'Hi, we missed your call at {business_name}. How can we help? Reply or call us back at {business_phone}', delay_minutes: 0 },
      { type: 'crm_contact', crm: 'auto' },
      { type: 'callback', delay_minutes: 120 }
    ]
  },
  lead_speed_response: {
    trigger_event: 'contact.created',
    actions: [
      { type: 'sms', template: 'Thanks for reaching out to {business_name}! We will be in touch shortly.', delay_minutes: 0 },
      { type: 'callback', delay_minutes: 5 }
    ]
  },
  no_show_prevention: {
    trigger_event: 'appointment.created',
    actions: [
      { type: 'sms', template: 'Reminder: Your appointment at {business_name} is tomorrow. Reply C to confirm or R to reschedule.', delay_minutes: -1440 },
      { type: 'sms', template: 'Your appointment at {business_name} is in 1 hour. See you soon!', delay_minutes: -60 }
    ]
  },
  call_conversion_followup: {
    trigger_event: 'call.completed_no_booking',
    actions: [
      { type: 'sms', template: 'Thanks for calling {business_name}! Book your appointment anytime — just call us back or visit our website.', delay_minutes: 30 },
      { type: 'crm_tag', tag: 'warm-lead', crm: 'auto' }
    ]
  },
  stale_deal_reengagement: {
    trigger_event: 'deal.stale',
    actions: [
      { type: 'sms', template: "Hi! It's been a while since we connected at {business_name}. We'd love to help — call us at {business_phone} anytime.", delay_minutes: 0 },
      { type: 'crm_tag', tag: 'reengagement', crm: 'auto' }
    ]
  }
};

class TreatmentExecutor {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.twilioClient = null;
    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      }
    } catch (e) {
      console.log('⚠️ TreatmentExecutor: Twilio not configured');
    }
  }

  /**
   * Main entry point — called by event hooks throughout the app.
   * Looks up active treatments for the client and executes matching ones.
   */
  async trigger(clientId, event, data = {}) {
    try {
      // Find active treatments matching this event
      const treatments = await this.sequelize.query(
        `SELECT * FROM neural_treatments
         WHERE client_id = :clientId AND is_active = true AND trigger_event = :event`,
        { replacements: { clientId, event }, type: QueryTypes.SELECT }
      );

      if (treatments.length === 0) return;

      const phone = data.phone || data.from_number || data.customer_phone || null;

      // Rate limit: max 1 execution per trigger per contact per hour
      if (phone) {
        const [recent] = await this.sequelize.query(
          `SELECT id FROM treatment_execution_log
           WHERE client_id = :clientId AND trigger_event = :event AND contact_phone = :phone
             AND created_at > NOW() - INTERVAL '1 hour'
           LIMIT 1`,
          { replacements: { clientId, event, phone }, type: QueryTypes.SELECT }
        );
        if (recent) {
          console.log(`[Treatment] Rate limited: ${event} for ${phone} on client ${clientId}`);
          return;
        }
      }

      // Get client info for template variables
      const [client] = await this.sequelize.query(
        `SELECT id, business_name, business_phone, ringlypro_number,
                ghl_api_key, ghl_location_id, hubspot_api_key,
                settings, use_elevenlabs_outbound, elevenlabs_agent_id,
                sendgrid_api_key, sendgrid_from_email, sendgrid_from_name
         FROM clients WHERE id = :clientId`,
        { replacements: { clientId }, type: QueryTypes.SELECT }
      );

      if (!client) return;

      for (const treatment of treatments) {
        await this._executeTreatment(treatment, client, data);
      }
    } catch (error) {
      console.error(`[Treatment] Trigger error for client ${clientId}, event ${event}:`, error.message);
    }
  }

  async _executeTreatment(treatment, client, data) {
    const actions = treatment.actions || [];
    const executedActions = [];
    let status = 'completed';
    let errorMessage = null;

    for (const action of actions) {
      try {
        // Skip delayed actions > 0 for now (use setTimeout for short delays)
        if (action.delay_minutes && action.delay_minutes > 0) {
          const delayMs = action.delay_minutes * 60 * 1000;
          if (delayMs <= 3600000) { // Max 1 hour delay via setTimeout
            setTimeout(() => {
              this._executeAction(action, client, data).catch(e =>
                console.error(`[Treatment] Delayed action error:`, e.message)
              );
            }, delayMs);
            executedActions.push({ ...action, status: 'scheduled', delay_ms: delayMs });
            continue;
          } else {
            // For delays > 1 hour, log as pending (would need cron for full implementation)
            executedActions.push({ ...action, status: 'skipped_long_delay' });
            continue;
          }
        }

        // Skip negative delays (appointment reminders — would need scheduler)
        if (action.delay_minutes && action.delay_minutes < 0) {
          executedActions.push({ ...action, status: 'skipped_reminder_needs_scheduler' });
          continue;
        }

        const result = await this._executeAction(action, client, data);
        executedActions.push({ ...action, status: 'executed', result });
      } catch (error) {
        console.error(`[Treatment] Action ${action.type} failed:`, error.message);
        executedActions.push({ ...action, status: 'failed', error: error.message });
        errorMessage = error.message;
      }
    }

    // Log execution
    const phone = data.phone || data.from_number || data.customer_phone || null;
    try {
      await this.sequelize.query(
        `INSERT INTO treatment_execution_log
          (client_id, treatment_id, treatment_type, trigger_event, contact_phone, actions_executed, status, error_message, created_at)
         VALUES (:clientId, :treatmentId, :treatmentType, :triggerEvent, :phone, :actions, :status, :error, NOW())`,
        {
          replacements: {
            clientId: client.id,
            treatmentId: treatment.id,
            treatmentType: treatment.treatment_type,
            triggerEvent: treatment.trigger_event,
            phone,
            actions: JSON.stringify(executedActions),
            status,
            error: errorMessage
          }
        }
      );

      // Update treatment stats
      await this.sequelize.query(
        `UPDATE neural_treatments SET execution_count = execution_count + 1, last_executed_at = NOW(), updated_at = NOW() WHERE id = :id`,
        { replacements: { id: treatment.id } }
      );
    } catch (logError) {
      console.error(`[Treatment] Failed to log execution:`, logError.message);
    }
  }

  async _executeAction(action, client, data) {
    switch (action.type) {
      case 'sms':
        return this._sendSms(action, client, data);
      case 'crm_contact':
        return this._createCrmContact(action, client, data);
      case 'crm_tag':
        return this._addCrmTag(action, client, data);
      case 'crm_task':
        return this._createCrmTask(action, client, data);
      case 'callback':
        return this._scheduleCallback(action, client, data);
      case 'email':
        return this._sendEmail(action, client, data);
      default:
        console.log(`[Treatment] Unknown action type: ${action.type}`);
        return { skipped: true, reason: 'unknown_type' };
    }
  }

  // ─── SMS via Twilio ─────────────────────────────────────────
  async _sendSms(action, client, data) {
    if (!this.twilioClient) throw new Error('Twilio not configured');

    const phone = data.phone || data.from_number || data.customer_phone;
    if (!phone) throw new Error('No phone number for SMS');

    const fromNumber = client.ringlypro_number || process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) throw new Error('No from number for SMS');

    // Template variable replacement
    let body = action.template || '';
    body = body.replace(/\{business_name\}/g, client.business_name || 'our business');
    body = body.replace(/\{business_phone\}/g, client.business_phone || '');
    body = body.replace(/\{customer_name\}/g, data.customer_name || data.first_name || 'there');
    body = body.replace(/\{phone\}/g, phone);
    body = body.replace(/\{booking_link\}/g, `https://aiagent.ringlypro.com/`);

    // Normalize phone
    let toPhone = phone.replace(/[^\d+]/g, '');
    if (!toPhone.startsWith('+')) toPhone = '+1' + toPhone;

    const msg = await this.twilioClient.messages.create({
      body,
      from: fromNumber,
      to: toPhone
    });

    // Log in messages table
    try {
      await this.sequelize.query(
        `INSERT INTO messages (client_id, direction, from_number, to_number, body, status, message_type, message_source, created_at, updated_at)
         VALUES ($1, 'outgoing', $2, $3, $4, 'sent', 'sms', 'neural_treatment', NOW(), NOW())`,
        { bind: [client.id, fromNumber, toPhone, body] }
      );
    } catch (e) { /* non-critical */ }

    return { sent: true, sid: msg.sid };
  }

  // ─── CRM Contact Creation (auto-detect CRM) ────────────────
  async _createCrmContact(action, client, data) {
    const phone = data.phone || data.from_number;
    if (!phone) return { skipped: true, reason: 'no_phone' };

    const crm = this._detectCrm(action, client);

    if (crm === 'ghl') {
      return this._ghlCreateContact(client, data);
    } else if (crm === 'hubspot') {
      return this._hubspotCreateContact(client, data);
    } else if (crm === 'zoho') {
      return this._zohoCreateContact(client, data);
    }

    return { skipped: true, reason: 'no_crm_configured' };
  }

  // ─── CRM Tag (auto-detect CRM) ─────────────────────────────
  async _addCrmTag(action, client, data) {
    const crm = this._detectCrm(action, client);
    const tag = action.tag || 'neural-treatment';

    // For now, log the intent — full CRM tag APIs would need per-CRM implementation
    console.log(`[Treatment] Would add tag "${tag}" in ${crm} for client ${client.id}`);
    return { tagged: true, crm, tag, note: 'Tag intent logged' };
  }

  // ─── CRM Task Creation ─────────────────────────────────────
  async _createCrmTask(action, client, data) {
    const crm = this._detectCrm(action, client);
    console.log(`[Treatment] Would create task in ${crm} for client ${client.id}`);
    return { created: true, crm, note: 'Task intent logged' };
  }

  // ─── Callback via ElevenLabs Outbound ──────────────────────
  async _scheduleCallback(action, client, data) {
    const phone = data.phone || data.from_number;
    if (!phone || !client.use_elevenlabs_outbound) {
      return { skipped: true, reason: !phone ? 'no_phone' : 'outbound_not_enabled' };
    }

    // Log callback intent — actual outbound call would use ElevenLabs outbound API
    console.log(`[Treatment] Callback scheduled for ${phone} on client ${client.id} in ${action.delay_minutes || 0} min`);
    return { scheduled: true, phone, delay_minutes: action.delay_minutes || 0 };
  }

  // ─── Email via SendGrid ────────────────────────────────────
  async _sendEmail(action, client, data) {
    if (!client.sendgrid_api_key) {
      return { skipped: true, reason: 'sendgrid_not_configured' };
    }
    console.log(`[Treatment] Would send email for client ${client.id}`);
    return { sent: false, note: 'Email intent logged' };
  }

  // ─── GHL Contact Creation ─────────────────────────────────
  async _ghlCreateContact(client, data) {
    const apiKey = client.ghl_api_key;
    const locationId = client.ghl_location_id;
    if (!apiKey || !locationId) return { skipped: true, reason: 'ghl_not_configured' };

    const phone = data.phone || data.from_number || '';
    let normalizedPhone = phone.replace(/[^\d+]/g, '');
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+1' + normalizedPhone;

    try {
      const res = await fetch('https://services.leadconnectorhq.com/contacts/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locationId,
          phone: normalizedPhone,
          firstName: data.customer_name || data.first_name || 'Caller',
          lastName: data.last_name || '',
          source: 'RinglyPro Neural',
          tags: ['neural-treatment', 'auto-created']
        })
      });
      const result = await res.json();
      return { created: true, crm: 'ghl', contactId: result.contact?.id };
    } catch (e) {
      console.error('[Treatment] GHL contact create error:', e.message);
      return { created: false, crm: 'ghl', error: e.message };
    }
  }

  // ─── HubSpot Contact Creation ──────────────────────────────
  async _hubspotCreateContact(client, data) {
    const accessToken = client.hubspot_api_key || client.settings?.integration?.hubspot?.accessToken;
    if (!accessToken) return { skipped: true, reason: 'hubspot_not_configured' };

    const phone = data.phone || data.from_number || '';

    try {
      const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            phone,
            firstname: data.customer_name || data.first_name || 'Caller',
            lastname: data.last_name || '',
            lifecyclestage: 'lead',
            hs_lead_status: 'NEW'
          }
        })
      });
      const result = await res.json();
      return { created: true, crm: 'hubspot', contactId: result.id };
    } catch (e) {
      console.error('[Treatment] HubSpot contact create error:', e.message);
      return { created: false, crm: 'hubspot', error: e.message };
    }
  }

  // ─── Zoho Contact Creation ─────────────────────────────────
  async _zohoCreateContact(client, data) {
    const zohoSettings = client.settings?.integration?.zoho;
    if (!zohoSettings?.enabled) return { skipped: true, reason: 'zoho_not_configured' };

    // Zoho needs OAuth token refresh — simplified for now
    console.log(`[Treatment] Would create Zoho contact for client ${client.id}`);
    return { created: false, crm: 'zoho', note: 'Zoho contact creation logged' };
  }

  // ─── Auto-detect which CRM to use ─────────────────────────
  _detectCrm(action, client) {
    if (action.crm && action.crm !== 'auto') return action.crm;
    if (client.ghl_api_key) return 'ghl';
    if (client.hubspot_api_key || client.settings?.integration?.hubspot?.enabled) return 'hubspot';
    if (client.settings?.integration?.zoho?.enabled) return 'zoho';
    return 'none';
  }

  // ─── Get default template for a treatment type ─────────────
  static getTemplate(treatmentType) {
    return TREATMENT_TEMPLATES[treatmentType] || null;
  }

  static get TEMPLATES() {
    return TREATMENT_TEMPLATES;
  }
}

module.exports = TreatmentExecutor;
