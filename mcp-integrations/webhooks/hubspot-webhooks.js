class HubSpotWebhooks {
  constructor(webhookManager, hubspotProxy) {
    this.webhookManager = webhookManager;
    this.hubspotProxy = hubspotProxy;
    this.setupHandlers();
  }

  setupHandlers() {
    this.webhookManager.onEvent('hubspot', 'contact.created', async (data) => {
      console.log('New HubSpot contact created:', data);
      this.webhookManager.emit('crm-event', {
        type: 'contact-created',
        crm: 'hubspot',
        data
      });
    });

    this.webhookManager.onEvent('hubspot', 'deal.propertyChange', async (data) => {
      if (data.propertyName === 'dealstage') {
        this.webhookManager.emit('deal-stage-changed', {
          crm: 'hubspot',
          dealId: data.objectId,
          oldStage: data.oldValue,
          newStage: data.newValue
        });
      }
    });
  }
}

module.exports = HubSpotWebhooks;
