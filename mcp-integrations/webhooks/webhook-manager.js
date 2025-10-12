const EventEmitter = require('events');
const crypto = require('crypto');

class WebhookManager extends EventEmitter {
  constructor() {
    super();
    this.webhooks = new Map();
    this.handlers = new Map();
    this.eventQueue = [];
  }

  register(id, config) {
    const webhook = {
      id,
      url: config.url,
      events: config.events || [],
      secret: config.secret || this.generateSecret(),
      active: true,
      createdAt: new Date(),
      lastTriggered: null,
      triggerCount: 0
    };

    this.webhooks.set(id, webhook);
    return webhook;
  }

  async processWebhook(source, event, data, signature = null) {
    const webhookEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source,
      event,
      data,
      timestamp: new Date(),
      processed: false
    };

    this.eventQueue.push(webhookEvent);
    this.emit('webhook-received', webhookEvent);

    await this.handleEvent(webhookEvent);
    return webhookEvent;
  }

  async handleEvent(webhookEvent) {
    const { source, event, data } = webhookEvent;
    const handlerKey = `${source}:${event}`;
    const handler = this.handlers.get(handlerKey);

    if (handler) {
      try {
        await handler(data, webhookEvent);
        webhookEvent.processed = true;
        webhookEvent.processedAt = new Date();
        this.emit('webhook-processed', webhookEvent);
      } catch (error) {
        console.error(`Error processing webhook ${handlerKey}:`, error);
        webhookEvent.error = error.message;
        this.emit('webhook-error', { webhookEvent, error });
      }
    }
  }

  onEvent(source, event, handler) {
    const key = `${source}:${event}`;
    this.handlers.set(key, handler);
  }

  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  generateSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  list() {
    return Array.from(this.webhooks.values());
  }
}

module.exports = WebhookManager;
