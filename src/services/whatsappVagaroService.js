// =====================================================
// WhatsApp + Vagaro Integration Service
// File: src/services/whatsappVagaroService.js
// Purpose: Connect WhatsApp appointment booking with Vagaro scheduling
// Features: Availability check, appointment creation, confirmation
// =====================================================

const vagaroService = require('./vagaroService');
const whatsappService = require('./whatsappService');
const logger = require('../utils/logger');

/**
 * Check if client has Vagaro integration enabled
 * @param {object} clientSettings - Client settings from database
 * @returns {object} Vagaro configuration status
 */
function isVagaroEnabled(clientSettings) {
  const vagaro = clientSettings?.integration?.vagaro;

  if (!vagaro?.enabled) {
    return { enabled: false, reason: 'Vagaro integration is disabled' };
  }

  if (!vagaro?.clientId || !vagaro?.clientSecretKey || !vagaro?.merchantId) {
    return { enabled: false, reason: 'Vagaro credentials not configured' };
  }

  return {
    enabled: true,
    credentials: {
      clientId: vagaro.clientId,
      clientSecretKey: vagaro.clientSecretKey,
      merchantId: vagaro.merchantId,
      region: vagaro.region || 'us01'
    }
  };
}

/**
 * Get available appointment slots from Vagaro
 * @param {object} credentials - Vagaro OAuth credentials
 * @param {object} params - Search parameters
 * @returns {Promise<object>} Available slots
 */
async function getAvailableSlots(credentials, params = {}) {
  const { serviceId, employeeId, date, duration } = params;

  try {
    logger.info(`[WA-VAGARO] Checking availability for date: ${date}`);

    const availability = await vagaroService.searchAppointmentAvailability(credentials, {
      serviceId,
      employeeId,
      date,
      duration
    });

    if (!availability || availability.length === 0) {
      return {
        success: true,
        hasSlots: false,
        slots: [],
        message: 'No availability for this date'
      };
    }

    // Format slots for display
    const formattedSlots = availability.slice(0, 5).map((slot, index) => ({
      id: index + 1,
      time: slot.time,
      employeeId: slot.employeeId,
      employeeName: slot.employeeName || 'Any available',
      formatted: formatTime(slot.time)
    }));

    return {
      success: true,
      hasSlots: true,
      slots: formattedSlots,
      total: availability.length
    };

  } catch (error) {
    logger.error('[WA-VAGARO] Get availability error:', error.message);
    return {
      success: false,
      hasSlots: false,
      error: error.message
    };
  }
}

/**
 * Get services available from Vagaro
 * @param {object} credentials - Vagaro OAuth credentials
 * @returns {Promise<Array>} Services list
 */
async function getServices(credentials) {
  try {
    const services = await vagaroService.getServices(credentials);

    return services.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      duration: s.duration,
      price: s.price
    }));

  } catch (error) {
    logger.error('[WA-VAGARO] Get services error:', error.message);
    return [];
  }
}

/**
 * Find or create customer in Vagaro
 * @param {object} credentials - Vagaro OAuth credentials
 * @param {object} customerData - Customer information
 * @returns {Promise<object>} Customer record
 */
async function findOrCreateVagaroCustomer(credentials, customerData) {
  const { phone, firstName, lastName, email } = customerData;

  try {
    // Search for existing customer
    const existingCustomers = await vagaroService.searchCustomers(credentials, { phone });

    if (existingCustomers && existingCustomers.length > 0) {
      logger.info(`[WA-VAGARO] Found existing Vagaro customer: ${existingCustomers[0].id}`);
      return {
        success: true,
        customer: existingCustomers[0],
        isNew: false
      };
    }

    // Create new customer
    const newCustomer = await vagaroService.createCustomer(credentials, {
      firstName: firstName || 'WhatsApp',
      lastName: lastName || 'Customer',
      phone,
      email: email || null
    });

    logger.info(`[WA-VAGARO] Created new Vagaro customer: ${newCustomer.id}`);

    return {
      success: true,
      customer: newCustomer,
      isNew: true
    };

  } catch (error) {
    logger.error('[WA-VAGARO] Find/create customer error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Book appointment in Vagaro
 * @param {object} credentials - Vagaro OAuth credentials
 * @param {object} appointmentData - Appointment details
 * @returns {Promise<object>} Booking result
 */
async function bookAppointment(credentials, appointmentData) {
  const {
    customerId,
    serviceId,
    employeeId,
    date,
    time,
    notes
  } = appointmentData;

  try {
    logger.info(`[WA-VAGARO] Booking appointment for customer ${customerId}`);

    const appointment = await vagaroService.createAppointment(credentials, {
      clientId: customerId,
      serviceId,
      providerId: employeeId,
      date,
      time,
      notes: notes || 'Booked via WhatsApp'
    });

    logger.info(`[WA-VAGARO] Appointment booked successfully: ${appointment.id}`);

    return {
      success: true,
      appointment: {
        id: appointment.id,
        date: appointment.date,
        time: appointment.time,
        service: appointment.service?.name,
        employee: appointment.employee?.name
      }
    };

  } catch (error) {
    logger.error('[WA-VAGARO] Book appointment error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cancel appointment in Vagaro
 * @param {object} credentials - Vagaro OAuth credentials
 * @param {string} appointmentId - Vagaro appointment ID
 * @returns {Promise<object>} Cancellation result
 */
async function cancelAppointment(credentials, appointmentId) {
  try {
    await vagaroService.cancelAppointment(credentials, appointmentId);

    logger.info(`[WA-VAGARO] Appointment ${appointmentId} cancelled`);

    return {
      success: true,
      message: 'Appointment cancelled successfully'
    };

  } catch (error) {
    logger.error('[WA-VAGARO] Cancel appointment error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process appointment booking request from WhatsApp
 * Complete flow: parse request -> check availability -> book -> confirm
 * @param {object} params - Booking parameters
 * @returns {Promise<object>} Booking result with response message
 */
async function processBookingRequest({
  clientSettings,
  customerPhone,
  customerName,
  serviceName,
  preferredDate,
  preferredTime,
  language = 'en'
}) {
  // Check if Vagaro is enabled
  const vagaroStatus = isVagaroEnabled(clientSettings);

  if (!vagaroStatus.enabled) {
    return {
      success: false,
      message: language === 'es'
        ? 'El sistema de reservas no está disponible en este momento. Por favor, llámanos directamente.'
        : 'The booking system is not available at this time. Please call us directly.',
      error: vagaroStatus.reason
    };
  }

  const credentials = vagaroStatus.credentials;

  try {
    // Step 1: Get services to find the right one
    const services = await getServices(credentials);
    let serviceId = null;

    if (serviceName) {
      const matchedService = services.find(s =>
        s.name.toLowerCase().includes(serviceName.toLowerCase())
      );
      serviceId = matchedService?.id;
    }

    // Step 2: Check availability
    const availability = await getAvailableSlots(credentials, {
      serviceId,
      date: preferredDate
    });

    if (!availability.success || !availability.hasSlots) {
      // No availability - offer alternatives
      return {
        success: false,
        action: 'no_availability',
        message: language === 'es'
          ? `Lo siento, no hay disponibilidad para el ${formatDate(preferredDate, 'es')}. ¿Te gustaría probar otro día?`
          : `Sorry, there's no availability for ${formatDate(preferredDate, 'en')}. Would you like to try another day?`,
        slots: []
      };
    }

    // Step 3: If we have time preference, try to match
    let selectedSlot = null;
    if (preferredTime) {
      selectedSlot = availability.slots.find(s =>
        s.time.includes(preferredTime) || s.formatted.includes(preferredTime)
      );
    }

    if (!selectedSlot) {
      // Show available slots
      const slotsText = availability.slots
        .map(s => `${s.id}. ${s.formatted}`)
        .join('\n');

      return {
        success: true,
        action: 'show_slots',
        message: language === 'es'
          ? `Tenemos disponibilidad para el ${formatDate(preferredDate, 'es')}:\n\n${slotsText}\n\nResponde con el número de la hora que prefieres.`
          : `We have availability for ${formatDate(preferredDate, 'en')}:\n\n${slotsText}\n\nReply with the number of your preferred time.`,
        slots: availability.slots
      };
    }

    // Step 4: Find or create customer
    const cleanPhone = customerPhone.replace(/^whatsapp:/i, '');
    const nameParts = (customerName || '').split(' ');

    const customerResult = await findOrCreateVagaroCustomer(credentials, {
      phone: cleanPhone,
      firstName: nameParts[0] || 'WhatsApp',
      lastName: nameParts.slice(1).join(' ') || 'Customer'
    });

    if (!customerResult.success) {
      return {
        success: false,
        message: language === 'es'
          ? 'Hubo un problema al procesar tu información. Por favor, intenta de nuevo.'
          : 'There was a problem processing your information. Please try again.',
        error: customerResult.error
      };
    }

    // Step 5: Book the appointment
    const bookingResult = await bookAppointment(credentials, {
      customerId: customerResult.customer.id,
      serviceId,
      date: preferredDate,
      time: selectedSlot.time,
      notes: `Booked via WhatsApp - ${customerName || 'Unknown'}`
    });

    if (!bookingResult.success) {
      return {
        success: false,
        message: language === 'es'
          ? 'No pudimos completar tu reserva. Por favor, intenta de nuevo o llámanos.'
          : 'We couldn\'t complete your booking. Please try again or call us.',
        error: bookingResult.error
      };
    }

    // Step 6: Send confirmation
    const apt = bookingResult.appointment;
    const serviceLookup = services.find(s => s.id === serviceId);

    return {
      success: true,
      action: 'booked',
      message: language === 'es'
        ? `✅ ¡Cita confirmada!\n\n📅 Fecha: ${formatDate(apt.date, 'es')}\n🕐 Hora: ${formatTime(apt.time)}\n📍 Servicio: ${serviceLookup?.name || 'Consulta'}\n\nVagaro te enviará un recordatorio automático. ¡Te esperamos!`
        : `✅ Appointment confirmed!\n\n📅 Date: ${formatDate(apt.date, 'en')}\n🕐 Time: ${formatTime(apt.time)}\n📍 Service: ${serviceLookup?.name || 'Consultation'}\n\nVagaro will send you an automatic reminder. We look forward to seeing you!`,
      appointment: apt
    };

  } catch (error) {
    logger.error('[WA-VAGARO] Process booking error:', error.message);

    return {
      success: false,
      message: language === 'es'
        ? 'Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo.'
        : 'An error occurred while processing your request. Please try again.',
      error: error.message
    };
  }
}

/**
 * Format time for display
 * @param {string} time - Time string (HH:MM or similar)
 * @returns {string} Formatted time (e.g., "10:30 AM")
 */
function formatTime(time) {
  if (!time) return '';

  try {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;

    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  } catch {
    return time;
  }
}

/**
 * Format date for display
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} language - 'es' or 'en'
 * @returns {string} Formatted date
 */
function formatDate(date, language = 'en') {
  if (!date) return '';

  try {
    const dateObj = new Date(date + 'T12:00:00'); // Avoid timezone issues
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

    return dateObj.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', options);
  } catch {
    return date;
  }
}

module.exports = {
  isVagaroEnabled,
  getAvailableSlots,
  getServices,
  findOrCreateVagaroCustomer,
  bookAppointment,
  cancelAppointment,
  processBookingRequest,
  formatTime,
  formatDate
};
