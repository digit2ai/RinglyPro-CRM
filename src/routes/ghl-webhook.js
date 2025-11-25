// src/routes/ghl-webhook.js
// GoHighLevel Webhook Receiver for Contact and Appointment Sync
const express = require('express');
const router = express.Router();
const Contact = require('../models/contact');
const Appointment = require('../models/Appointment');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * GoHighLevel Webhook Event Handler
 *
 * Handles webhook events from GoHighLevel:
 * - ContactCreate: When a new contact is created in GHL
 * - ContactUpdate: When a contact is updated in GHL
 * - ContactDelete: When a contact is deleted in GHL
 * - AppointmentCreate: When a new appointment is booked in GHL
 * - AppointmentUpdate: When an appointment is updated in GHL
 * - AppointmentDelete: When an appointment is cancelled/deleted in GHL
 *
 * Webhook URL: https://aiagent.ringlypro.com/api/webhooks/gohighlevel
 *
 * Multi-tenant: Uses locationId from webhook payload to map to clientId
 */

// Helper: Map GHL locationId to RinglyPro clientId
async function getClientIdFromLocationId(locationId) {
  try {
    const [result] = await sequelize.query(
      `SELECT client_id FROM ghl_integrations WHERE ghl_location_id = :locationId LIMIT 1`,
      {
        replacements: { locationId },
        type: QueryTypes.SELECT
      }
    );

    if (!result) {
      console.error(`❌ No client found for GHL locationId: ${locationId}`);
      return null;
    }

    return result.client_id;
  } catch (error) {
    console.error('❌ Error mapping locationId to clientId:', error);
    return null;
  }
}

// Helper: Sync contact from GHL to RinglyPro
async function syncContact(contactData, clientId, customData = null) {
  try {
    // Try to get contact data from multiple sources
    const ghlContactId = contactData?.id || customData?.['contact.id'] || contactData?.contact_id;
    const firstName = contactData?.firstName || customData?.['contact.firstName'] || contactData?.first_name;
    const lastName = contactData?.lastName || customData?.['contact.lastName'] || contactData?.last_name;
    const email = contactData?.email || customData?.['contact.email'];
    const phone = contactData?.phone || customData?.['contact.phone'];
    const dateAdded = contactData?.dateAdded || customData?.['contact.dateAdded'];
    const dateUpdated = contactData?.dateUpdated || customData?.['contact.dateUpdated'];

    console.log(`📇 Syncing contact from GHL: ${firstName} ${lastName} (${ghlContactId})`);

    // Check if contact already exists by ghlContactId
    const existingContact = await Contact.findOne({
      where: { ghlContactId, clientId }
    });

    if (existingContact) {
      // Update existing contact
      await existingContact.update({
        firstName: firstName || existingContact.firstName,
        lastName: lastName || existingContact.lastName,
        email: email || existingContact.email,
        phone: phone || existingContact.phone,
        ghlSyncedAt: new Date(),
        source: 'ghl_sync'
      });

      console.log(`✅ Updated existing contact: ${existingContact.id}`);
      return existingContact;
    } else {
      // Create new contact
      const newContact = await Contact.create({
        clientId,
        firstName: firstName || 'Unknown',
        lastName: lastName || 'Contact',
        email: email || `no-email-${ghlContactId}@ghl.sync`,
        phone: phone || `+1000000${ghlContactId.slice(-4)}`,
        ghlContactId,
        ghlSyncedAt: new Date(),
        source: 'ghl_sync',
        status: 'active'
      });

      console.log(`✅ Created new contact: ${newContact.id}`);
      return newContact;
    }
  } catch (error) {
    console.error('❌ Error syncing contact:', error);
    throw error;
  }
}

// Helper: Sync appointment from GHL to RinglyPro
async function syncAppointment(appointmentData, clientId, webhookPayload = null) {
  try {
    const {
      id: ghlAppointmentId,
      contactId: ghlContactId,
      calendarId: ghlCalendarId,
      startTime,
      endTime,
      title,
      status,
      appointmentStatus
    } = appointmentData;

    console.log(`📅 Syncing appointment from GHL: ${title || 'Untitled'} (${ghlAppointmentId})`);

    // Parse appointment date and time
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const appointmentDate = startDate.toISOString().split('T')[0];
    const appointmentTime = startDate.toTimeString().split(' ')[0];
    const duration = Math.round((endDate - startDate) / (1000 * 60)); // minutes

    // Get contact information from webhook payload first (most reliable)
    let contactName = 'Unknown';
    let contactPhone = '+10000000000';
    let contactEmail = null;

    // Try to extract from webhook payload (root level)
    if (webhookPayload) {
      contactName = webhookPayload.full_name ||
                    webhookPayload.fullName ||
                    (webhookPayload.first_name && webhookPayload.last_name ?
                      `${webhookPayload.first_name} ${webhookPayload.last_name}` :
                      'Unknown');
      contactPhone = webhookPayload.phone || webhookPayload.customerPhone || '+10000000000';
      contactEmail = webhookPayload.email || null;

      console.log(`📇 Extracted contact from webhook payload: ${contactName}, ${contactPhone}`);
    }

    // If still unknown, try to find existing contact in database
    if (contactName === 'Unknown' && ghlContactId) {
      const contact = await Contact.findOne({
        where: { ghlContactId, clientId }
      });

      if (contact) {
        contactName = `${contact.firstName} ${contact.lastName}`;
        contactPhone = contact.phone;
        contactEmail = contact.email;
        console.log(`📇 Found contact in database: ${contactName}`);
      }
    }

    // Check if appointment already exists
    const existingAppointment = await Appointment.findOne({
      where: { ghlAppointmentId, clientId }
    });

    // Map GHL status to RinglyPro status
    const mappedStatus = mapGHLStatus(appointmentStatus || status);

    if (existingAppointment) {
      // Update existing appointment
      await existingAppointment.update({
        appointmentDate,
        appointmentTime,
        duration,
        purpose: title || existingAppointment.purpose,
        status: mappedStatus,
        ghlContactId,
        ghlCalendarId,
        ghlSyncedAt: new Date()
      });

      console.log(`✅ Updated existing appointment: ${existingAppointment.id}`);
      return existingAppointment;
    } else {
      // Create new appointment
      const newAppointment = await Appointment.create({
        clientId,
        contactId: null, // Will be linked later if contact exists
        customerName: contactName,
        customerPhone: contactPhone,
        customerEmail: contactEmail,
        appointmentDate,
        appointmentTime,
        duration,
        purpose: title || 'Appointment from GHL',
        status: mappedStatus,
        confirmationCode: `GHL-${ghlAppointmentId.slice(-8)}`,
        source: 'ghl_sync',
        ghlAppointmentId,
        ghlContactId,
        ghlCalendarId,
        ghlSyncedAt: new Date()
      });

      console.log(`✅ Created new appointment: ${newAppointment.id}`);
      return newAppointment;
    }
  } catch (error) {
    console.error('❌ Error syncing appointment:', error);
    throw error;
  }
}

// Helper: Map GHL appointment status to RinglyPro status
function mapGHLStatus(ghlStatus) {
  const statusMap = {
    'confirmed': 'confirmed',
    'pending': 'pending',
    'cancelled': 'cancelled',
    'completed': 'completed',
    'showed': 'completed',
    'noshow': 'no-show',
    'rescheduled': 'confirmed'
  };

  return statusMap[ghlStatus?.toLowerCase()] || 'confirmed';
}

// Helper: Delete synced appointment
async function deleteAppointment(ghlAppointmentId, clientId) {
  try {
    console.log(`🗑️ Deleting appointment from RinglyPro: ${ghlAppointmentId}`);

    const appointment = await Appointment.findOne({
      where: { ghlAppointmentId, clientId }
    });

    if (appointment) {
      await appointment.update({ status: 'cancelled' });
      console.log(`✅ Cancelled appointment: ${appointment.id}`);
      return appointment;
    } else {
      console.log(`⚠️ Appointment not found: ${ghlAppointmentId}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error deleting appointment:', error);
    throw error;
  }
}

// Helper: Delete synced contact
async function deleteContact(ghlContactId, clientId) {
  try {
    console.log(`🗑️ Deleting contact from RinglyPro: ${ghlContactId}`);

    const contact = await Contact.findOne({
      where: { ghlContactId, clientId }
    });

    if (contact) {
      await contact.update({ status: 'inactive' });
      console.log(`✅ Deactivated contact: ${contact.id}`);
      return contact;
    } else {
      console.log(`⚠️ Contact not found: ${ghlContactId}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error deleting contact:', error);
    throw error;
  }
}

/**
 * POST /api/webhooks/gohighlevel
 *
 * Main webhook receiver endpoint
 * Accepts webhook events from GoHighLevel and syncs data to RinglyPro
 */
router.post('/', async (req, res) => {
  try {
    const { type, locationId, contact, appointment, customData } = req.body;

    // Get type from customData if not at root level
    const eventType = type || customData?.type;

    console.log(`📨 Received GHL webhook: ${eventType}`);
    console.log(`📍 Location ID from body: ${locationId}`);
    console.log(`🔍 Full webhook payload:`, JSON.stringify(req.body, null, 2));

    // Try to get locationId from multiple possible sources
    let finalLocationId = locationId ||
                          customData?.locationId ||
                          req.body.location_id ||
                          req.body.location?.id ||
                          appointment?.locationId ||
                          contact?.locationId;

    console.log(`📍 Final Location ID: ${finalLocationId}`);

    // Map locationId to clientId
    const clientId = await getClientIdFromLocationId(finalLocationId);

    if (!clientId) {
      console.error(`❌ No client found for locationId: ${finalLocationId}`);
      console.error(`❌ Tried sources: locationId=${locationId}, location_id=${req.body.location_id}, location.id=${req.body.location?.id}`);
      return res.status(404).json({
        success: false,
        error: 'Client not found for this location'
      });
    }

    console.log(`👤 Mapped to clientId: ${clientId}`);

    // Handle different webhook event types
    switch (eventType) {
      case 'ContactCreate':
      case 'ContactUpdate':
        // Contact data might be in req.body or customData
        const contactData = contact || req.body;
        await syncContact(contactData, clientId, customData);
        break;

      case 'ContactDelete':
        if (!contact?.id) {
          return res.status(400).json({ success: false, error: 'Contact ID missing' });
        }
        await deleteContact(contact.id, clientId);
        break;

      case 'AppointmentCreate':
      case 'AppointmentUpdate':
        // Check if appointment data is in customData (GHL workflow format)
        let appointmentData = appointment;
        if (!appointmentData && customData) {
          // Construct appointment object from customData fields
          appointmentData = {
            id: customData['appointment.id'] || customData.appointmentId,
            contactId: customData['appointment.contactId'] || customData.contactId || req.body.contact_id,
            calendarId: customData['appointment.calendarId'] || customData.calendarId,
            startTime: customData['appointment.startTime'] || customData.startTime,
            endTime: customData['appointment.endTime'] || customData.endTime,
            title: customData['appointment.title'] || customData.title,
            status: customData['appointment.status'] || customData.status,
            appointmentStatus: customData['appointment.appointmentStatus'] || customData.appointmentStatus
          };
        }

        if (!appointmentData || !appointmentData.id) {
          console.error('❌ Appointment data missing or incomplete:', appointmentData);
          return res.status(400).json({ success: false, error: 'Appointment data missing or incomplete' });
        }

        // Pass full webhook payload for contact name extraction
        await syncAppointment(appointmentData, clientId, req.body);
        break;

      case 'AppointmentDelete':
        if (!appointment?.id) {
          return res.status(400).json({ success: false, error: 'Appointment ID missing' });
        }
        await deleteAppointment(appointment.id, clientId);
        break;

      default:
        console.log(`⚠️ Unhandled webhook event type: ${eventType}`);
        return res.status(200).json({
          success: true,
          message: 'Event type not handled'
        });
    }

    console.log(`✅ Successfully processed ${eventType} webhook`);

    return res.status(200).json({
      success: true,
      message: `${eventType} processed successfully`
    });

  } catch (error) {
    console.error('❌ Error processing GHL webhook:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/webhooks/gohighlevel/test
 *
 * Test endpoint to verify webhook is accessible
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'GHL Webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
