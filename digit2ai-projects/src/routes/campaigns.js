'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { EmailCampaign, EmailSend, Contact, PipelineHistory, Vertical, sequelize } = require('../models');
const { logActivity } = require('../services/activityService');

// Load SendGrid from main CRM
let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }
} catch (e) { console.log('[D2AI] SendGrid not available:', e.message); }

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@ringlypro.com';
const FROM_NAME = process.env.FROM_NAME || 'Digit2AI';

// GET /api/v1/campaigns — List campaigns
router.get('/', async (req, res) => {
  try {
    const campaigns = await EmailCampaign.findAll({
      where: { workspace_id: 1 },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: campaigns });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/campaigns/:id — Campaign detail with send stats
router.get('/:id', async (req, res) => {
  try {
    const campaign = await EmailCampaign.findOne({
      where: { id: req.params.id, workspace_id: 1 }
    });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const sends = await EmailSend.findAll({
      where: { campaign_id: campaign.id },
      include: [{ model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name', 'email', 'pipeline_stage'] }],
      order: [['created_at', 'DESC']]
    });

    res.json({ success: true, data: { ...campaign.toJSON(), sends } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/campaigns — Create campaign
router.post('/', async (req, res) => {
  try {
    const data = { workspace_id: 1, ...req.body };
    const campaign = await EmailCampaign.create(data);
    await logActivity(req.user?.email, 'created', 'campaign', campaign.id, campaign.name);
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/campaigns/:id — Update campaign
router.put('/:id', async (req, res) => {
  try {
    const campaign = await EmailCampaign.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    await campaign.update(req.body);
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/campaigns/:id/send — Send campaign to target contacts
router.post('/:id/send', async (req, res) => {
  try {
    const campaign = await EmailCampaign.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (campaign.status === 'sent') return res.status(400).json({ success: false, error: 'Campaign already sent' });
    if (!sgMail) return res.status(500).json({ success: false, error: 'SendGrid not configured' });

    // Find target contacts
    const where = { workspace_id: 1, archived_at: null, email: { [Op.ne]: null } };
    if (campaign.target_stage) where.pipeline_stage = campaign.target_stage;
    if (campaign.target_vertical_id) where.vertical_id = campaign.target_vertical_id;

    // Allow override via request body
    if (req.body.contact_ids) {
      where.id = req.body.contact_ids;
    }

    const contacts = await Contact.findAll({ where });
    if (contacts.length === 0) {
      return res.status(400).json({ success: false, error: 'No contacts match the target criteria' });
    }

    let sentCount = 0, failCount = 0;

    for (const contact of contacts) {
      try {
        // Personalize body
        const personalizedHtml = campaign.body_html
          .replace(/{{first_name}}/g, contact.first_name || '')
          .replace(/{{last_name}}/g, contact.last_name || '')
          .replace(/{{email}}/g, contact.email || '')
          .replace(/{{company}}/g, '')
          .replace(/{{name}}/g, `${contact.first_name || ''} ${contact.last_name || ''}`.trim());

        const msg = {
          to: contact.email,
          from: { email: campaign.from_email || FROM_EMAIL, name: campaign.from_name || FROM_NAME },
          subject: campaign.subject.replace(/{{first_name}}/g, contact.first_name || ''),
          html: personalizedHtml,
          categories: ['d2ai_campaign', `campaign_${campaign.id}`],
          customArgs: { d2_campaign_id: String(campaign.id), d2_contact_id: String(contact.id) }
        };

        const [sgResponse] = await sgMail.send(msg);
        const messageId = sgResponse?.headers?.['x-message-id'] || null;

        await EmailSend.create({
          campaign_id: campaign.id,
          contact_id: contact.id,
          email: contact.email,
          status: 'sent',
          sg_message_id: messageId
        });

        sentCount++;
      } catch (sendErr) {
        await EmailSend.create({
          campaign_id: campaign.id,
          contact_id: contact.id,
          email: contact.email,
          status: 'failed'
        });
        failCount++;
      }
    }

    await campaign.update({
      status: 'sent',
      sent_count: sentCount,
      sent_at: new Date()
    });

    await logActivity(req.user?.email, 'sent_campaign', 'campaign', campaign.id,
      `${campaign.name}: ${sentCount} sent, ${failCount} failed`);

    res.json({ success: true, sent: sentCount, failed: failCount, total: contacts.length });
  } catch (error) {
    console.error('[D2AI] Campaign send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/campaigns/:id
router.delete('/:id', async (req, res) => {
  try {
    const campaign = await EmailCampaign.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    await EmailSend.destroy({ where: { campaign_id: campaign.id } });
    await campaign.destroy();
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/campaigns/webhook/sendgrid — SendGrid event webhook
router.post('/webhook/sendgrid', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      const messageId = event.sg_message_id?.split('.')[0];
      if (!messageId) continue;

      const send = await EmailSend.findOne({ where: { sg_message_id: messageId } });
      if (!send) continue;

      const eventType = event.event;
      const updates = {};

      switch (eventType) {
        case 'open':
          if (!send.opened_at) {
            updates.opened_at = new Date();
            updates.status = 'opened';
            await EmailCampaign.increment('open_count', { where: { id: send.campaign_id } });
            // Auto-tag: opened email → lead
            await autoAdvanceStage(send.contact_id, 'lead', 'email_open', `Opened campaign email`);
          }
          break;
        case 'click':
          if (!send.clicked_at) {
            updates.clicked_at = new Date();
            updates.status = 'clicked';
            await EmailCampaign.increment('click_count', { where: { id: send.campaign_id } });
            // Auto-tag: clicked → warm_lead
            await autoAdvanceStage(send.contact_id, 'warm_lead', 'email_click', `Clicked link in campaign email`);
          }
          break;
        case 'bounce':
        case 'dropped':
          updates.bounced_at = new Date();
          updates.status = 'bounced';
          await EmailCampaign.increment('bounce_count', { where: { id: send.campaign_id } });
          break;
        case 'spamreport':
          updates.status = 'spam';
          break;
      }

      if (Object.keys(updates).length > 0) {
        await send.update(updates);
      }

      // Update contact's last email event
      await Contact.update(
        { last_email_event: eventType, last_email_event_at: new Date() },
        { where: { id: send.contact_id } }
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[D2AI] SendGrid webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: auto-advance pipeline stage (only forward, never backward)
async function autoAdvanceStage(contactId, newStage, triggerType, triggerDetail) {
  const STAGE_ORDER = { prospect: 0, lead: 1, cold_lead: 2, warm_lead: 3, hot_lead: 4, client: 5 };
  try {
    const contact = await Contact.findByPk(contactId);
    if (!contact) return;
    const currentOrder = STAGE_ORDER[contact.pipeline_stage] || 0;
    const newOrder = STAGE_ORDER[newStage] || 0;
    if (newOrder <= currentOrder) return; // Don't move backward

    await contact.update({ pipeline_stage: newStage, last_interaction_date: new Date() });
    await PipelineHistory.create({
      workspace_id: 1, contact_id: contactId,
      from_stage: contact.pipeline_stage, to_stage: newStage,
      trigger_type: triggerType, trigger_detail: triggerDetail
    });
  } catch (e) {
    console.log('[D2AI] Auto-advance error:', e.message?.substring(0, 80));
  }
}

module.exports = router;
module.exports.autoAdvanceStage = autoAdvanceStage;
