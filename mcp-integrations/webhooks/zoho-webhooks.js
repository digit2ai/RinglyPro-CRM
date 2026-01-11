/**
 * Zoho CRM Webhook Handlers
 *
 * Processes Zoho CRM webhook events and emits normalized events
 * for internal consumption by other components.
 *
 * Follows the same pattern as HubSpotWebhooks and VagaroWebhooks.
 */

class ZohoWebhooks {
  constructor(webhookManager) {
    this.webhookManager = webhookManager;
    this.processedEvents = new Set();
    this.maxProcessedEvents = 1000;

    this.setupHandlers();
    console.log('[Zoho Webhooks] Handlers initialized');
  }

  /**
   * Set up webhook event handlers
   */
  setupHandlers() {
    // Contact events
    this.webhookManager.onEvent('zoho', 'Contacts.create', this.handleContactCreated.bind(this));
    this.webhookManager.onEvent('zoho', 'Contacts.edit', this.handleContactUpdated.bind(this));
    this.webhookManager.onEvent('zoho', 'Contacts.delete', this.handleContactDeleted.bind(this));
    this.webhookManager.onEvent('zoho', 'contact.created', this.handleContactCreated.bind(this));
    this.webhookManager.onEvent('zoho', 'contact.updated', this.handleContactUpdated.bind(this));

    // Lead events
    this.webhookManager.onEvent('zoho', 'Leads.create', this.handleLeadCreated.bind(this));
    this.webhookManager.onEvent('zoho', 'Leads.edit', this.handleLeadUpdated.bind(this));
    this.webhookManager.onEvent('zoho', 'Leads.delete', this.handleLeadDeleted.bind(this));
    this.webhookManager.onEvent('zoho', 'lead.created', this.handleLeadCreated.bind(this));
    this.webhookManager.onEvent('zoho', 'lead.updated', this.handleLeadUpdated.bind(this));

    // Deal events
    this.webhookManager.onEvent('zoho', 'Deals.create', this.handleDealCreated.bind(this));
    this.webhookManager.onEvent('zoho', 'Deals.edit', this.handleDealUpdated.bind(this));
    this.webhookManager.onEvent('zoho', 'Deals.delete', this.handleDealDeleted.bind(this));
    this.webhookManager.onEvent('zoho', 'deal.created', this.handleDealCreated.bind(this));
    this.webhookManager.onEvent('zoho', 'deal.updated', this.handleDealUpdated.bind(this));

    // Task events
    this.webhookManager.onEvent('zoho', 'Tasks.create', this.handleTaskCreated.bind(this));
    this.webhookManager.onEvent('zoho', 'Tasks.edit', this.handleTaskUpdated.bind(this));
    this.webhookManager.onEvent('zoho', 'task.created', this.handleTaskCreated.bind(this));
    this.webhookManager.onEvent('zoho', 'task.updated', this.handleTaskUpdated.bind(this));

    // Note events
    this.webhookManager.onEvent('zoho', 'Notes.create', this.handleNoteCreated.bind(this));

    // Call events
    this.webhookManager.onEvent('zoho', 'Calls.create', this.handleCallLogged.bind(this));

    console.log('[Zoho Webhooks] Event handlers registered');
  }

  /**
   * Check if event has already been processed (deduplication)
   */
  isDuplicateEvent(eventId) {
    if (!eventId) return false;

    if (this.processedEvents.has(eventId)) {
      console.log(`[Zoho Webhooks] Duplicate event skipped: ${eventId}`);
      return true;
    }

    this.processedEvents.add(eventId);

    // Prevent memory leak by limiting set size
    if (this.processedEvents.size > this.maxProcessedEvents) {
      const iterator = this.processedEvents.values();
      this.processedEvents.delete(iterator.next().value);
    }

    return false;
  }

  /**
   * Extract payload from Zoho webhook
   * Zoho sends different formats depending on notification type
   */
  extractPayload(data) {
    // Handle different Zoho webhook formats
    if (data.data) return data.data;
    if (data.module_api_name && data.ids) {
      // Notification-style webhook
      return {
        module: data.module_api_name,
        ids: data.ids,
        operation: data.operation
      };
    }
    return data;
  }

  /**
   * Generate event ID for deduplication
   */
  generateEventId(data, eventType) {
    const payload = this.extractPayload(data);
    const recordId = payload.id || payload.ids?.[0] || '';
    const timestamp = payload.Modified_Time || payload.Created_Time || Date.now();
    return `zoho_${eventType}_${recordId}_${timestamp}`;
  }

  // ==================== CONTACT HANDLERS ====================

  async handleContactCreated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'contact_created');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const contact = this.normalizeContactData(payload);

    console.log(`[Zoho Webhooks] Contact created: ${contact.id}`);

    this.webhookManager.emit('crm-event', {
      type: 'contact-created',
      crm: 'zoho',
      data: contact,
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  async handleContactUpdated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'contact_updated');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const contact = this.normalizeContactData(payload);

    console.log(`[Zoho Webhooks] Contact updated: ${contact.id}`);

    this.webhookManager.emit('crm-event', {
      type: 'contact-updated',
      crm: 'zoho',
      data: contact,
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  async handleContactDeleted(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'contact_deleted');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const contactId = payload.id || payload.ids?.[0];

    console.log(`[Zoho Webhooks] Contact deleted: ${contactId}`);

    this.webhookManager.emit('crm-event', {
      type: 'contact-deleted',
      crm: 'zoho',
      data: { id: contactId },
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  // ==================== LEAD HANDLERS ====================

  async handleLeadCreated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'lead_created');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const lead = this.normalizeLeadData(payload);

    console.log(`[Zoho Webhooks] Lead created: ${lead.id}`);

    this.webhookManager.emit('crm-event', {
      type: 'lead-created',
      crm: 'zoho',
      data: lead,
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  async handleLeadUpdated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'lead_updated');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const lead = this.normalizeLeadData(payload);

    console.log(`[Zoho Webhooks] Lead updated: ${lead.id}`);

    this.webhookManager.emit('crm-event', {
      type: 'lead-updated',
      crm: 'zoho',
      data: lead,
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  async handleLeadDeleted(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'lead_deleted');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const leadId = payload.id || payload.ids?.[0];

    console.log(`[Zoho Webhooks] Lead deleted: ${leadId}`);

    this.webhookManager.emit('crm-event', {
      type: 'lead-deleted',
      crm: 'zoho',
      data: { id: leadId },
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  // ==================== DEAL HANDLERS ====================

  async handleDealCreated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'deal_created');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const deal = this.normalizeDealData(payload);

    console.log(`[Zoho Webhooks] Deal created: ${deal.id}`);

    this.webhookManager.emit('deal-event', {
      type: 'deal-created',
      crm: 'zoho',
      data: deal,
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  async handleDealUpdated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'deal_updated');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const deal = this.normalizeDealData(payload);

    console.log(`[Zoho Webhooks] Deal updated: ${deal.id}`);

    // Check for stage change
    if (payload.Stage) {
      this.webhookManager.emit('deal-stage-changed', {
        crm: 'zoho',
        dealId: deal.id,
        stage: payload.Stage,
        previousStage: payload.$previous_stage,
        data: deal,
        timestamp: new Date().toISOString()
      });
    }

    this.webhookManager.emit('deal-event', {
      type: 'deal-updated',
      crm: 'zoho',
      data: deal,
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  async handleDealDeleted(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'deal_deleted');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const dealId = payload.id || payload.ids?.[0];

    console.log(`[Zoho Webhooks] Deal deleted: ${dealId}`);

    this.webhookManager.emit('deal-event', {
      type: 'deal-deleted',
      crm: 'zoho',
      data: { id: dealId },
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  // ==================== TASK HANDLERS ====================

  async handleTaskCreated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'task_created');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const task = this.normalizeTaskData(payload);

    console.log(`[Zoho Webhooks] Task created: ${task.id}`);

    this.webhookManager.emit('crm-event', {
      type: 'task-created',
      crm: 'zoho',
      data: task,
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  async handleTaskUpdated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'task_updated');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);
    const task = this.normalizeTaskData(payload);

    console.log(`[Zoho Webhooks] Task updated: ${task.id}`);

    this.webhookManager.emit('crm-event', {
      type: 'task-updated',
      crm: 'zoho',
      data: task,
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  // ==================== NOTE HANDLERS ====================

  async handleNoteCreated(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'note_created');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);

    console.log(`[Zoho Webhooks] Note created: ${payload.id}`);

    this.webhookManager.emit('crm-event', {
      type: 'note-created',
      crm: 'zoho',
      data: {
        id: payload.id,
        title: payload.Note_Title,
        content: payload.Note_Content,
        parentId: payload.Parent_Id?.id,
        parentModule: payload.se_module
      },
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  // ==================== CALL HANDLERS ====================

  async handleCallLogged(data, webhookEvent) {
    const eventId = this.generateEventId(data, 'call_logged');
    if (this.isDuplicateEvent(eventId)) return;

    const payload = this.extractPayload(data);

    console.log(`[Zoho Webhooks] Call logged: ${payload.id}`);

    this.webhookManager.emit('crm-event', {
      type: 'call-logged',
      crm: 'zoho',
      data: {
        id: payload.id,
        subject: payload.Subject,
        callType: payload.Call_Type,
        duration: payload.Call_Duration_in_seconds,
        result: payload.Call_Result,
        whoId: payload.Who_Id?.id,
        description: payload.Description,
        startTime: payload.Call_Start_Time
      },
      timestamp: new Date().toISOString(),
      raw: data
    });
  }

  // ==================== DATA NORMALIZATION ====================

  /**
   * Normalize Zoho contact data to standard format
   */
  normalizeContactData(payload) {
    return {
      id: payload.id,
      firstName: payload.First_Name,
      lastName: payload.Last_Name,
      fullName: payload.Full_Name || `${payload.First_Name || ''} ${payload.Last_Name || ''}`.trim(),
      email: payload.Email,
      phone: payload.Phone,
      mobile: payload.Mobile,
      accountId: payload.Account_Name?.id,
      accountName: payload.Account_Name?.name,
      ownerId: payload.Owner?.id,
      ownerName: payload.Owner?.name,
      createdAt: payload.Created_Time,
      updatedAt: payload.Modified_Time,
      leadSource: payload.Lead_Source
    };
  }

  /**
   * Normalize Zoho lead data to standard format
   */
  normalizeLeadData(payload) {
    return {
      id: payload.id,
      firstName: payload.First_Name,
      lastName: payload.Last_Name,
      fullName: payload.Full_Name || `${payload.First_Name || ''} ${payload.Last_Name || ''}`.trim(),
      email: payload.Email,
      phone: payload.Phone,
      mobile: payload.Mobile,
      company: payload.Company,
      status: payload.Lead_Status,
      source: payload.Lead_Source,
      ownerId: payload.Owner?.id,
      ownerName: payload.Owner?.name,
      createdAt: payload.Created_Time,
      updatedAt: payload.Modified_Time,
      rating: payload.Rating,
      annualRevenue: payload.Annual_Revenue,
      industry: payload.Industry
    };
  }

  /**
   * Normalize Zoho deal data to standard format
   */
  normalizeDealData(payload) {
    return {
      id: payload.id,
      name: payload.Deal_Name,
      amount: payload.Amount,
      stage: payload.Stage,
      probability: payload.Probability,
      closeDate: payload.Closing_Date,
      contactId: payload.Contact_Name?.id,
      contactName: payload.Contact_Name?.name,
      accountId: payload.Account_Name?.id,
      accountName: payload.Account_Name?.name,
      ownerId: payload.Owner?.id,
      ownerName: payload.Owner?.name,
      createdAt: payload.Created_Time,
      updatedAt: payload.Modified_Time,
      type: payload.Type,
      nextStep: payload.Next_Step,
      leadSource: payload.Lead_Source
    };
  }

  /**
   * Normalize Zoho task data to standard format
   */
  normalizeTaskData(payload) {
    return {
      id: payload.id,
      subject: payload.Subject,
      dueDate: payload.Due_Date,
      status: payload.Status,
      priority: payload.Priority,
      description: payload.Description,
      whoId: payload.Who_Id?.id,
      whatId: payload.What_Id?.id,
      ownerId: payload.Owner?.id,
      ownerName: payload.Owner?.name,
      createdAt: payload.Created_Time,
      updatedAt: payload.Modified_Time,
      remindAt: payload.Remind_At
    };
  }
}

module.exports = ZohoWebhooks;
