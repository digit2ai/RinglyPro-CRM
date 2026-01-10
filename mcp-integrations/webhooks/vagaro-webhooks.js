/**
 * Vagaro Webhook Handlers
 *
 * Processes incoming webhooks from Vagaro and emits normalized events
 * for the workflow engine and other listeners.
 *
 * Webhook events are received at:
 * POST /api/mcp/webhooks/vagaro
 *
 * Vagaro Webhook Event Types (from docs.vagaro.com):
 * - Appointment: created, updated, deleted
 * - Customer: updated, attached, removed
 * - Transaction: created
 * - Form Response: submitted
 * - Employee: created, updated, deleted
 * - Business Location: created, updated, deleted
 *
 * Vagaro sends eventType in the payload body, not headers.
 */

class VagaroWebhooks {
  constructor(webhookManager) {
    this.webhookManager = webhookManager;
    this.setupHandlers();
  }

  setupHandlers() {
    // Appointment events (eventType: created, updated, deleted)
    this.webhookManager.onEvent('vagaro', 'appointment', async (data, webhookEvent) => {
      const eventType = data.eventType || 'unknown';
      console.log(`[VagaroWebhooks] Appointment ${eventType}:`, data.appointmentId);

      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: `appointment-${eventType}`,
        data: this._normalizeAppointmentData(data),
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    // Also handle dotted event names for flexibility
    this.webhookManager.onEvent('vagaro', 'appointment.created', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Appointment created:', data.appointmentId);
      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: 'appointment-created',
        data: this._normalizeAppointmentData(data),
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    this.webhookManager.onEvent('vagaro', 'appointment.updated', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Appointment updated:', data.appointmentId);
      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: 'appointment-updated',
        data: this._normalizeAppointmentData(data),
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    this.webhookManager.onEvent('vagaro', 'appointment.cancelled', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Appointment cancelled:', data.appointmentId);
      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: 'appointment-cancelled',
        data: this._normalizeAppointmentData(data),
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    this.webhookManager.onEvent('vagaro', 'appointment.deleted', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Appointment deleted:', data.appointmentId);
      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: 'appointment-deleted',
        data: this._normalizeAppointmentData(data),
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    // Customer events
    this.webhookManager.onEvent('vagaro', 'customer', async (data, webhookEvent) => {
      const eventType = data.eventType || 'updated';
      console.log(`[VagaroWebhooks] Customer ${eventType}:`, data.customerId);
      this.webhookManager.emit('crm-event', {
        crm: 'vagaro',
        type: `customer-${eventType}`,
        data: this._normalizeCustomerData(data),
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    this.webhookManager.onEvent('vagaro', 'customer.updated', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Customer updated:', data.customerId);
      this.webhookManager.emit('crm-event', {
        crm: 'vagaro',
        type: 'customer-updated',
        data: this._normalizeCustomerData(data),
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    // Transaction events
    this.webhookManager.onEvent('vagaro', 'transaction', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Transaction:', data.transactionId);
      this.webhookManager.emit('payment-event', {
        crm: 'vagaro',
        type: 'transaction-created',
        data: this._normalizeTransactionData(data),
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    // Form Response events
    this.webhookManager.onEvent('vagaro', 'form_response', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Form response:', data.responseId);
      this.webhookManager.emit('form-event', {
        crm: 'vagaro',
        type: 'form-submitted',
        data: {
          responseId: data.responseId,
          formId: data.formId,
          formTitle: data.formTitle,
          customerId: data.customerId,
          businessId: data.businessId,
          appointmentId: data.appointmentId,
          questionsAndAnswers: data.questionsAndAnswers
        },
        raw: data,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });
  }

  /**
   * Normalize appointment data to match Vagaro's actual payload structure
   * @param {object} data - Raw Vagaro appointment webhook payload
   * @returns {object} Normalized appointment
   */
  _normalizeAppointmentData(data) {
    return {
      appointmentId: data.appointmentId,
      customerId: data.customerId,
      serviceProviderId: data.serviceProviderId,
      businessId: data.businessId,
      businessAlias: data.businessAlias,
      serviceId: data.serviceId,
      serviceTitle: data.serviceTitle,
      serviceCategory: data.serviceCategory,
      startTime: data.startTime,
      endTime: data.endTime,
      bookingStatus: data.bookingStatus,
      bookingSource: data.bookingSource,
      appointmentTypeCode: data.appointmentTypeCode,
      amount: data.amount,
      eventType: data.eventType,
      formResponseIds: data.formResponseIds
    };
  }

  /**
   * Normalize customer data to match Vagaro's actual payload structure
   * @param {object} data - Raw Vagaro customer webhook payload
   * @returns {object} Normalized customer
   */
  _normalizeCustomerData(data) {
    return {
      customerId: data.customerId,
      firstName: data.customerFirstName,
      lastName: data.customerLastName,
      fullName: `${data.customerFirstName || ''} ${data.customerLastName || ''}`.trim(),
      email: data.email,
      phone: data.mobilePhone,
      streetAddress: data.streetAddress,
      city: data.city,
      regionCode: data.regionCode,
      countryCode: data.countryCode,
      postalCode: data.postalCode,
      businessIds: data.businessIds,
      createdDate: data.createdDate,
      modifiedDate: data.modifiedDate
    };
  }

  /**
   * Normalize transaction data
   * @param {object} data - Raw Vagaro transaction webhook payload
   * @returns {object} Normalized transaction
   */
  _normalizeTransactionData(data) {
    return {
      transactionId: data.transactionId,
      transactionDate: data.transactionDate,
      businessId: data.businessId,
      customerId: data.customerId,
      appointmentId: data.appointmentId,
      serviceProviderId: data.serviceProviderId,
      itemSold: data.itemSold,
      purchaseType: data.purchaseType,
      quantity: data.quantity,
      ccAmount: data.ccAmount,
      cashAmount: data.cashAmount,
      amountDue: data.amountDue,
      serviceCategory: data.serviceCategory
    };
  }
}

module.exports = VagaroWebhooks;
