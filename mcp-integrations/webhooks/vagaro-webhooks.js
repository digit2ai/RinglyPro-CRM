/**
 * Vagaro Webhook Handlers
 *
 * Processes incoming webhooks from Vagaro and emits normalized events
 * for the workflow engine and other listeners.
 *
 * Webhook events are received at:
 * POST /api/mcp/webhooks/vagaro
 * Headers: x-webhook-event, x-webhook-signature (optional)
 *
 * Supported events:
 * - appointment.created
 * - appointment.updated
 * - appointment.cancelled
 * - customer.updated
 */

class VagaroWebhooks {
  constructor(webhookManager) {
    this.webhookManager = webhookManager;
    this.setupHandlers();
  }

  setupHandlers() {
    // Appointment created
    this.webhookManager.onEvent('vagaro', 'appointment.created', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Appointment created:', data.appointmentId || data.id);

      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: 'appointment-created',
        data: this._normalizeAppointmentData(data),
        raw: data,
        timestamp: webhookEvent.timestamp
      });
    });

    // Appointment updated
    this.webhookManager.onEvent('vagaro', 'appointment.updated', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Appointment updated:', data.appointmentId || data.id);

      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: 'appointment-updated',
        data: this._normalizeAppointmentData(data),
        raw: data,
        timestamp: webhookEvent.timestamp
      });
    });

    // Appointment cancelled
    this.webhookManager.onEvent('vagaro', 'appointment.cancelled', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Appointment cancelled:', data.appointmentId || data.id);

      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: 'appointment-cancelled',
        data: this._normalizeAppointmentData(data),
        raw: data,
        timestamp: webhookEvent.timestamp
      });
    });

    // Customer updated
    this.webhookManager.onEvent('vagaro', 'customer.updated', async (data, webhookEvent) => {
      console.log('[VagaroWebhooks] Customer updated:', data.customerId || data.id);

      this.webhookManager.emit('crm-event', {
        crm: 'vagaro',
        type: 'customer-updated',
        data: this._normalizeCustomerData(data),
        raw: data,
        timestamp: webhookEvent.timestamp
      });
    });
  }

  /**
   * Normalize appointment data to a consistent format
   * @param {object} data - Raw Vagaro appointment data
   * @returns {object} Normalized appointment
   */
  _normalizeAppointmentData(data) {
    return {
      appointmentId: data.appointmentId || data.id,
      customerId: data.customerId || data.customer?.id,
      customerName: data.customerName || (data.customer ? `${data.customer.firstName} ${data.customer.lastName}` : null),
      customerPhone: data.customerPhone || data.customer?.phone,
      customerEmail: data.customerEmail || data.customer?.email,
      serviceId: data.serviceId || data.service?.id,
      serviceName: data.serviceName || data.service?.name,
      employeeId: data.employeeId || data.employee?.id,
      employeeName: data.employeeName || data.employee?.name,
      locationId: data.locationId || data.location?.id,
      startTime: data.startTime || data.startDateTime,
      endTime: data.endTime || data.endDateTime,
      status: data.status,
      notes: data.notes
    };
  }

  /**
   * Normalize customer data to a consistent format
   * @param {object} data - Raw Vagaro customer data
   * @returns {object} Normalized customer
   */
  _normalizeCustomerData(data) {
    return {
      customerId: data.customerId || data.id,
      firstName: data.firstName,
      lastName: data.lastName,
      fullName: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      phone: data.phone,
      email: data.email,
      updatedFields: data.updatedFields || null
    };
  }
}

module.exports = VagaroWebhooks;
