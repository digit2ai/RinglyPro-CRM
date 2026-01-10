/**
 * Vagaro Webhook Handlers
 *
 * Processes incoming webhooks from Vagaro and emits normalized events
 * for the workflow engine and other listeners.
 *
 * Webhook events are received at:
 * POST /api/mcp/webhooks/vagaro
 *
 * Vagaro Webhook Structure (from docs.vagaro.com):
 * {
 *   "id": "unique_event_id",           // For deduplication
 *   "createdDate": "2026-01-15T...",   // Event timestamp
 *   "type": "appointment",              // Event type
 *   "action": "created",                // Action: created/updated/deleted
 *   "payload": { ... }                  // Actual event data
 * }
 *
 * Event Types & Actions:
 * - appointment: created, updated, deleted
 * - customer: created, updated
 * - employee: created, updated, deleted
 * - transaction: created
 * - formResponse: created
 * - business_location: created, updated, deleted
 *
 * Refs:
 * - https://docs.vagaro.com/public/docs/appointment-events
 * - https://docs.vagaro.com/public/docs/customer-events
 * - https://docs.vagaro.com/public/docs/employee-events
 * - https://docs.vagaro.com/public/docs/transaction-events
 * - https://docs.vagaro.com/public/docs/form-response-events
 * - https://docs.vagaro.com/public/docs/business-location-events
 */

class VagaroWebhooks {
  constructor(webhookManager) {
    this.webhookManager = webhookManager;
    this.processedEventIds = new Set(); // For deduplication
    this.setupHandlers();
  }

  /**
   * Extract payload from Vagaro webhook (handles both wrapped and direct formats)
   * @param {object} data - Raw webhook data
   * @returns {object} { eventId, action, payload }
   */
  _extractPayload(data) {
    // Vagaro wraps data in: { id, createdDate, type, action, payload }
    if (data.payload) {
      return {
        eventId: data.id,
        action: data.action,
        payload: data.payload,
        eventCreatedDate: data.createdDate
      };
    }
    // Direct format (for testing or alternative webhook configs)
    return {
      eventId: null,
      action: data.action || data.eventType,
      payload: data,
      eventCreatedDate: null
    };
  }

  /**
   * Check if event was already processed (deduplication)
   * @param {string} eventId - Vagaro event ID
   * @returns {boolean}
   */
  _isDuplicate(eventId) {
    if (!eventId) return false;
    if (this.processedEventIds.has(eventId)) {
      console.log(`[VagaroWebhooks] Skipping duplicate event: ${eventId}`);
      return true;
    }
    this.processedEventIds.add(eventId);
    // Keep only last 1000 event IDs to prevent memory leak
    if (this.processedEventIds.size > 1000) {
      const firstId = this.processedEventIds.values().next().value;
      this.processedEventIds.delete(firstId);
    }
    return false;
  }

  setupHandlers() {
    // =========================================
    // APPOINTMENT EVENTS
    // Actions: created, updated, deleted
    // =========================================

    this.webhookManager.onEvent('vagaro', 'appointment', async (data, webhookEvent) => {
      const { eventId, action, payload } = this._extractPayload(data);
      if (this._isDuplicate(eventId)) return;

      const actionName = action || 'unknown';
      console.log(`[VagaroWebhooks] Appointment ${actionName}:`, payload.appointmentId);

      this.webhookManager.emit('calendar-event', {
        crm: 'vagaro',
        type: `appointment-${actionName}`,
        data: this._normalizeAppointmentData(payload),
        raw: data,
        eventId,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    // Handle dotted event names for flexibility (from x-webhook-event header)
    ['created', 'updated', 'deleted', 'cancelled'].forEach(actionName => {
      this.webhookManager.onEvent('vagaro', `appointment.${actionName}`, async (data, webhookEvent) => {
        const { eventId, payload } = this._extractPayload(data);
        if (this._isDuplicate(eventId)) return;

        console.log(`[VagaroWebhooks] Appointment ${actionName}:`, payload.appointmentId);
        this.webhookManager.emit('calendar-event', {
          crm: 'vagaro',
          type: `appointment-${actionName}`,
          data: this._normalizeAppointmentData(payload),
          raw: data,
          eventId,
          timestamp: webhookEvent?.timestamp || new Date().toISOString()
        });
      });
    });

    // =========================================
    // CUSTOMER EVENTS
    // Actions: created, updated
    // =========================================

    this.webhookManager.onEvent('vagaro', 'customer', async (data, webhookEvent) => {
      const { eventId, action, payload } = this._extractPayload(data);
      if (this._isDuplicate(eventId)) return;

      const actionName = action || 'updated';
      console.log(`[VagaroWebhooks] Customer ${actionName}:`, payload.customerId);
      this.webhookManager.emit('crm-event', {
        crm: 'vagaro',
        type: `customer-${actionName}`,
        data: this._normalizeCustomerData(payload),
        raw: data,
        eventId,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    ['created', 'updated'].forEach(actionName => {
      this.webhookManager.onEvent('vagaro', `customer.${actionName}`, async (data, webhookEvent) => {
        const { eventId, payload } = this._extractPayload(data);
        if (this._isDuplicate(eventId)) return;

        console.log(`[VagaroWebhooks] Customer ${actionName}:`, payload.customerId);
        this.webhookManager.emit('crm-event', {
          crm: 'vagaro',
          type: `customer-${actionName}`,
          data: this._normalizeCustomerData(payload),
          raw: data,
          eventId,
          timestamp: webhookEvent?.timestamp || new Date().toISOString()
        });
      });
    });

    // =========================================
    // EMPLOYEE EVENTS
    // Actions: created, updated, deleted
    // =========================================

    this.webhookManager.onEvent('vagaro', 'employee', async (data, webhookEvent) => {
      const { eventId, action, payload } = this._extractPayload(data);
      if (this._isDuplicate(eventId)) return;

      const actionName = action || 'updated';
      console.log(`[VagaroWebhooks] Employee ${actionName}:`, payload.serviceProviderId);
      this.webhookManager.emit('staff-event', {
        crm: 'vagaro',
        type: `employee-${actionName}`,
        data: this._normalizeEmployeeData(payload),
        raw: data,
        eventId,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    ['created', 'updated', 'deleted'].forEach(actionName => {
      this.webhookManager.onEvent('vagaro', `employee.${actionName}`, async (data, webhookEvent) => {
        const { eventId, payload } = this._extractPayload(data);
        if (this._isDuplicate(eventId)) return;

        console.log(`[VagaroWebhooks] Employee ${actionName}:`, payload.serviceProviderId);
        this.webhookManager.emit('staff-event', {
          crm: 'vagaro',
          type: `employee-${actionName}`,
          data: this._normalizeEmployeeData(payload),
          raw: data,
          eventId,
          timestamp: webhookEvent?.timestamp || new Date().toISOString()
        });
      });
    });

    // =========================================
    // TRANSACTION EVENTS
    // Actions: created
    // =========================================

    this.webhookManager.onEvent('vagaro', 'transaction', async (data, webhookEvent) => {
      const { eventId, payload } = this._extractPayload(data);
      if (this._isDuplicate(eventId)) return;

      console.log('[VagaroWebhooks] Transaction:', payload.transactionId);
      this.webhookManager.emit('payment-event', {
        crm: 'vagaro',
        type: 'transaction-created',
        data: this._normalizeTransactionData(payload),
        raw: data,
        eventId,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    this.webhookManager.onEvent('vagaro', 'transaction.created', async (data, webhookEvent) => {
      const { eventId, payload } = this._extractPayload(data);
      if (this._isDuplicate(eventId)) return;

      console.log('[VagaroWebhooks] Transaction created:', payload.transactionId);
      this.webhookManager.emit('payment-event', {
        crm: 'vagaro',
        type: 'transaction-created',
        data: this._normalizeTransactionData(payload),
        raw: data,
        eventId,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    // =========================================
    // FORM RESPONSE EVENTS
    // Type: formResponse, Actions: created
    // =========================================

    // Handle both "form_response" and "formResponse" (Vagaro uses formResponse)
    ['form_response', 'formResponse'].forEach(eventType => {
      this.webhookManager.onEvent('vagaro', eventType, async (data, webhookEvent) => {
        const { eventId, payload } = this._extractPayload(data);
        if (this._isDuplicate(eventId)) return;

        console.log('[VagaroWebhooks] Form response:', payload.responseId);
        this.webhookManager.emit('form-event', {
          crm: 'vagaro',
          type: 'form-submitted',
          data: this._normalizeFormResponseData(payload),
          raw: data,
          eventId,
          timestamp: webhookEvent?.timestamp || new Date().toISOString()
        });
      });
    });

    // =========================================
    // BUSINESS LOCATION EVENTS
    // Actions: created, updated, deleted
    // =========================================

    this.webhookManager.onEvent('vagaro', 'business_location', async (data, webhookEvent) => {
      const { eventId, action, payload } = this._extractPayload(data);
      if (this._isDuplicate(eventId)) return;

      const actionName = action || 'updated';
      console.log(`[VagaroWebhooks] Business location ${actionName}:`, payload.businessId);
      this.webhookManager.emit('location-event', {
        crm: 'vagaro',
        type: `location-${actionName}`,
        data: this._normalizeBusinessLocationData(payload),
        raw: data,
        eventId,
        timestamp: webhookEvent?.timestamp || new Date().toISOString()
      });
    });

    ['created', 'updated', 'deleted'].forEach(actionName => {
      this.webhookManager.onEvent('vagaro', `business_location.${actionName}`, async (data, webhookEvent) => {
        const { eventId, payload } = this._extractPayload(data);
        if (this._isDuplicate(eventId)) return;

        console.log(`[VagaroWebhooks] Business location ${actionName}:`, payload.businessId);
        this.webhookManager.emit('location-event', {
          crm: 'vagaro',
          type: `location-${actionName}`,
          data: this._normalizeBusinessLocationData(payload),
          raw: data,
          eventId,
          timestamp: webhookEvent?.timestamp || new Date().toISOString()
        });
      });
    });
  }

  /**
   * Normalize appointment data
   * Ref: https://docs.vagaro.com/public/docs/appointment-events
   */
  _normalizeAppointmentData(payload) {
    return {
      // Core identifiers
      appointmentId: payload.appointmentId,
      customerId: payload.customerId,
      serviceProviderId: payload.serviceProviderId,
      businessId: payload.businessId,
      businessAlias: payload.businessAlias,
      businessGroupId: payload.businessGroupId,

      // Service info
      serviceId: payload.serviceId,
      serviceTitle: payload.serviceTitle,
      serviceCategory: payload.serviceCategory,

      // Time
      startTime: payload.startTime,
      endTime: payload.endTime,

      // Status & type
      bookingStatus: payload.bookingStatus,  // Accepted, Confirmed, Cancelled, No Show
      eventType: payload.eventType,           // Appointment, Class, PersonalOff
      appointmentTypeCode: payload.appointmentTypeCode,  // NR, NNR, RR, RNR
      appointmentTypeName: payload.appointmentTypeName,

      // Booking source
      bookingSource: payload.bookingSource,   // Vagaro Marketplace, Facebook, Google, etc.
      onlineVsInhouse: payload.onlineVsInhouse,  // Online or Inhouse

      // Financials
      amount: payload.amount,

      // Calendar
      calendarEventId: payload.calendarEventId,

      // Audit trail
      createdDate: payload.createdDate,
      createdBy: payload.createdBy,
      modifiedDate: payload.modifiedDate,
      modifiedBy: payload.modifiedBy,

      // Forms
      formResponseIds: payload.formResponseIds || []
    };
  }

  /**
   * Normalize customer data
   * Ref: https://docs.vagaro.com/public/docs/customer-events
   */
  _normalizeCustomerData(payload) {
    return {
      customerId: payload.customerId,
      businessIds: payload.businessIds || [],
      businessGroupId: payload.businessGroupId,

      // Name
      firstName: payload.customerFirstName,
      lastName: payload.customerLastName,
      fullName: `${payload.customerFirstName || ''} ${payload.customerLastName || ''}`.trim(),

      // Contact - multiple phone numbers
      email: payload.email,
      mobilePhone: payload.mobilePhone,
      dayPhone: payload.dayPhone,
      nightPhone: payload.nightPhone,

      // Address
      streetAddress: payload.streetAddress,
      city: payload.city,
      regionCode: payload.regionCode,
      regionName: payload.regionName,
      countryCode: payload.countryCode,
      countryName: payload.countryName,
      postalCode: payload.postalCode,

      // Audit trail
      createdDate: payload.createdDate,
      createdBy: payload.createdBy,
      modifiedDate: payload.modifiedDate,
      modifiedBy: payload.modifiedBy
    };
  }

  /**
   * Normalize employee data
   * Ref: https://docs.vagaro.com/public/docs/employee-events
   */
  _normalizeEmployeeData(payload) {
    return {
      // Identifiers
      serviceProviderId: payload.serviceProviderId,
      businessIds: payload.businessIds || [],
      businessGroupId: payload.businessGroupId,

      // Personal info
      firstName: payload.employeeFirstName,
      lastName: payload.employeeLastName,
      fullName: `${payload.employeeFirstName || ''} ${payload.employeeLastName || ''}`.trim(),
      email: payload.email,
      birthday: payload.birthday,

      // Contact - multiple phone numbers
      mobilePhone: payload.mobilePhone,
      dayPhone: payload.dayPhone,
      nightPhone: payload.nightPhone,

      // Address
      streetAddress: payload.streetAddress,
      city: payload.city,
      regionCode: payload.regionCode,
      regionName: payload.regionName,
      countryCode: payload.countryCode,
      countryName: payload.countryName,
      postalCode: payload.postalCode,

      // Employment
      startDate: payload.startDate,
      employeeType: payload.employeeType,
      employeeCardId: payload.employeeCardId,
      reportsTo: payload.reportsTo,
      accessLevelId: payload.accessLevelId,

      // Status flags
      isActive: payload.isActive,
      isOnlineBookingActive: payload.isOnlineBookingActive,
      isShownOnStaffPage: payload.isShownOnStaffPage,
      showContactInformation: payload.showContactInformation,

      // Working hours (conditional - only when updated)
      workingHours: payload.workingHours || null,

      // Audit trail
      createdDate: payload.createdDate,
      createdBy: payload.createdBy,
      modifiedDate: payload.modifiedDate,
      modifiedBy: payload.modifiedBy
    };
  }

  /**
   * Normalize transaction data
   * Ref: https://docs.vagaro.com/public/docs/transaction-events
   */
  _normalizeTransactionData(payload) {
    return {
      // Identifiers
      transactionId: payload.transactionId,
      transactionDate: payload.transactionDate,
      userPaymentId: payload.userPaymentId,
      userPaymentsMstId: payload.userPaymentsMstId,

      // Business info
      businessId: payload.businessId,
      businessAlias: payload.businessAlias,
      businessGroupId: payload.businessGroupId,

      // Item details
      itemSold: payload.itemSold,
      brandName: payload.brandName,
      purchaseType: payload.purchaseType,
      quantity: payload.quantity,
      serviceCategory: payload.serviceCategory,

      // Payment amounts breakdown
      ccAmount: payload.ccAmount,
      cashAmount: payload.cashAmount,
      checkAmount: payload.checkAmount,
      achAmount: payload.achAmount,
      bankAccountAmount: payload.bankAccountAmount,
      vagaroPayLaterAmount: payload.vagaroPayLaterAmount,
      otherAmount: payload.otherAmount,

      // Modifiers
      tax: payload.tax,
      tip: payload.tip,
      discount: payload.discount,
      memberShipAmount: payload.memberShipAmount,
      productDiscount: payload.productDiscount,
      points: payload.points,
      packageRedemption: payload.packageRedemption,
      gcRedemption: payload.gcRedemption,
      amountDue: payload.amountDue,

      // Card details
      ccType: payload.ccType,
      ccMode: payload.ccMode,

      // Associated records
      customerId: payload.customerId,
      serviceProviderId: payload.serviceProviderId,
      appointmentId: payload.appointmentId,
      createdBy: payload.createdBy
    };
  }

  /**
   * Normalize form response data
   * Ref: https://docs.vagaro.com/public/docs/form-response-events
   */
  _normalizeFormResponseData(payload) {
    return {
      // Identifiers
      responseId: payload.responseId,
      formId: payload.formId,
      formTitle: payload.formTitle,
      formPublishedDate: payload.formPublishedDate,

      // Business info
      businessId: payload.businessId,
      businessAlias: payload.businessAlias,
      businessGroupId: payload.businessGroupId,

      // Associated records
      customerId: payload.customerId,
      appointmentId: payload.appointmentId,
      membershipId: payload.membershipId,

      // Questions and answers
      // Each item: { id, order, questionType, question, answer (array) }
      // questionTypes: short_answer, long_answer, choose_one, multiple_choice, dropdown, scale, contact_information, date
      questionsAndAnswers: (payload.questionsAndAnswers || []).map(qa => ({
        id: qa.id,
        order: qa.order,
        questionType: qa.questionType,
        question: qa.question,
        answer: qa.answer || []
      }))
    };
  }

  /**
   * Normalize business location data
   * Ref: https://docs.vagaro.com/public/docs/business-location-events
   */
  _normalizeBusinessLocationData(payload) {
    return {
      // Identification
      businessId: payload.businessId,
      businessGroupId: payload.businessGroupId,
      businessName: payload.businessName,
      businessGroupName: payload.businessGroupName,
      businessAlias: payload.businessAlias,

      // Contact
      businessPhone: payload.businessPhone,
      businessEmail: payload.businessEmail,
      businessWebsite: payload.businessWebsite,

      // Address
      streetAddress: payload.streetAddress,
      city: payload.city,
      regionCode: payload.regionCode,
      regionName: payload.regionName,
      countryCode: payload.countryCode,
      countryName: payload.countryName,
      postalCode: payload.postalCode,

      // Listings
      listedOnVagaro: payload.listedOnVagaro,
      listedOnGoogle: payload.listedOnGoogle,
      listedOnAppleMaps: payload.listedOnAppleMaps,
      vagaroListingUrl: payload.vagaroListingUrl,
      showContactInformation: payload.showContactInformation,
      showVagaroConnect: payload.showVagaroConnect,

      // Operations
      serviceLocation: payload.serviceLocation,  // AtBusiness, AtClientsLocation, Both
      useEmployeeHours: payload.useEmployeeHours,

      // Facility info (nested object)
      facilityInfo: payload.facilityInfo ? {
        childrenPolicy: payload.facilityInfo.childrenPolicy,  // KidFriendly, KidsOnly, NoKids
        walkInsAccepted: payload.facilityInfo.walkInsAccepted,
        paymentMethods: payload.facilityInfo.paymentMethods || [],
        parking: payload.facilityInfo.parking || [],
        amenities: payload.facilityInfo.amenities || [],
        onlineGcStore: payload.facilityInfo.onlineGcStore,
        spokenLanguages: payload.facilityInfo.spokenLanguages || []
      } : null,

      // Business hours (array of day objects)
      // Each: { dayOfWeek, isOpen, opensAt, closesAt }
      businessHours: (payload.businessHours || []).map(day => ({
        dayOfWeek: day.dayOfWeek,  // MONDAY, TUESDAY, etc.
        isOpen: day.isOpen,
        opensAt: day.opensAt,      // 24-hour format "09:00"
        closesAt: day.closesAt     // 24-hour format "17:00"
      })),

      // Audit trail
      createdDate: payload.createdDate,
      createdBy: payload.createdBy,
      modifiedDate: payload.modifiedDate,
      modifiedBy: payload.modifiedBy
    };
  }
}

module.exports = VagaroWebhooks;
