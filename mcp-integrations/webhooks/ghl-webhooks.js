class GoHighLevelWebhooks {
  constructor(webhookManager, ghlProxy) {
    this.webhookManager = webhookManager;
    this.ghlProxy = ghlProxy;
    this.setupHandlers();
  }

  setupHandlers() {
    this.webhookManager.onEvent('gohighlevel', 'ContactCreate', async (data) => {
      console.log('New GHL contact created:', data);
      this.webhookManager.emit('crm-event', {
        type: 'contact-created',
        crm: 'gohighlevel',
        data
      });
    });

    this.webhookManager.onEvent('gohighlevel', 'OpportunityStageUpdate', async (data) => {
      this.webhookManager.emit('deal-stage-changed', {
        crm: 'gohighlevel',
        opportunityId: data.id,
        oldStage: data.oldStage,
        newStage: data.newStage
      });
    });

    this.webhookManager.onEvent('gohighlevel', 'InboundMessage', async (data) => {
      this.webhookManager.emit('message-received', {
        crm: 'gohighlevel',
        from: data.contactId,
        message: data.body,
        type: data.type
      });
    });
  }
}

module.exports = GoHighLevelWebhooks;
