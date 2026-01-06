const express = require('express');
const jwt = require('jsonwebtoken');
const { Appointment, sequelize } = require('../models');
const crmAppointmentService = require('../services/crmAppointmentService');
const router = express.Router();

// Middleware to extract and verify client_id from JWT token
const authenticateClient = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required: No token provided' 
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify and decode JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
    
    if (!decoded.clientId) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required: No client associated with this account' 
      });
    }
    
    // Attach client info to request
    req.clientId = decoded.clientId;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    
    console.log(`🔐 Authenticated request for client ${req.clientId} (user: ${req.userEmail})`);
    
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ 
      success: false,
      error: 'Invalid or expired token' 
    });
  }
};

// Apply authentication middleware to all routes
router.use(authenticateClient);

// Get all appointments FOR THIS CLIENT ONLY
// Includes auto-sync from GHL if configured
router.get('/', async (req, res) => {
  try {
    // Auto-sync from GHL in background (non-blocking) - only sync 7 days
    const syncFromGHL = req.query.sync !== 'false';
    if (syncFromGHL) {
      // Run sync in background - don't block response
      setImmediate(async () => {
        try {
          const today = new Date();
          const startDate = today.toISOString().split('T')[0];
          const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          const crmData = await crmAppointmentService.fetchAllCRMAppointments(req.clientId, startDate, endDate);
          if (crmData.appointments && crmData.appointments.length > 0) {
            await crmAppointmentService.syncToLocalDB(req.clientId, crmData.appointments);
            console.log(`🔄 Auto-synced ${crmData.appointments.length} GHL appointments for client ${req.clientId}`);
          }
        } catch (syncError) {
          console.log(`⚠️ GHL sync skipped for client ${req.clientId}:`, syncError.message);
        }
      });
    }

    const appointments = await Appointment.findAll({
      where: {
        clientId: req.clientId
      },
      order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']]
    });

    console.log(`📋 Client ${req.clientId}: Found ${appointments.length} total appointments`);

    res.json({
      success: true,
      count: appointments.length,
      appointments: appointments
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get today's appointments FOR THIS CLIENT ONLY
router.get('/today', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`📅 Fetching today's appointments for client ${req.clientId}: ${today}`);
    
    const appointments = await Appointment.findAll({
      where: {
        clientId: req.clientId,
        appointmentDate: today,
        status: {
          [Op.notIn]: ['cancelled', 'completed']
        }
      },
      order: [['appointmentTime', 'ASC']]
    });
    
    console.log(`📊 Client ${req.clientId}: Found ${appointments.length} active appointments for today`);
    
    res.json({
      success: true,
      count: appointments.length,
      appointments: appointments
    });
    
  } catch (error) {
    console.error('❌ Error fetching today\'s appointments:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Create appointment FOR THIS CLIENT
router.post('/', async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      appointmentDate,
      appointmentTime,
      purpose,
      confirmationCode,
      source = 'online',
      contactId,
      duration = 30,
      notes,
      sendSMS = true
    } = req.body;
    
    if (!customerName || !customerEmail || !customerPhone || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ 
        error: 'Missing required fields: customerName, customerEmail, customerPhone, appointmentDate, appointmentTime' 
      });
    }
    
    // Check if slot is available FOR THIS CLIENT
    const existing = await sequelize.query(
      'SELECT id FROM appointments WHERE client_id = :client_id AND appointment_date = :date AND appointment_time = :time AND status NOT IN (:cancelled, :completed)',
      {
        replacements: {
          client_id: req.clientId,
          date: appointmentDate,
          time: appointmentTime,
          cancelled: 'cancelled',
          completed: 'completed'
        },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ 
        error: 'Time slot is already booked' 
      });
    }
    
    const finalConfirmationCode = confirmationCode || 
      `APPT${Date.now().toString().slice(-6).toUpperCase()}`;
    
    const appointment = await Appointment.create({
      clientId: req.clientId,
      customerName,
      customerEmail,
      customerPhone,
      appointmentDate,
      appointmentTime,
      purpose: purpose || 'General consultation',
      confirmationCode: finalConfirmationCode,
      source,
      contactId,
      duration,
      notes,
      status: 'confirmed'
    });
    
    console.log(`✅ Client ${req.clientId}: Created appointment ${appointment.id} for ${customerName}`);
    
    let smsResult = null;
    if (sendSMS) {
      try {
        smsResult = await sendAppointmentConfirmationSMS({
          appointmentId: appointment.id,
          customerPhone: appointment.customerPhone,
          customerName: appointment.customerName,
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
          duration: appointment.duration,
          confirmationCode: appointment.confirmationCode
        });
      } catch (smsError) {
        console.error(`⚠️ Failed to send SMS confirmation:`, smsError.message);
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      appointment: appointment,
      smsConfirmation: smsResult ? {
        sent: true,
        messageId: smsResult.messageId,
        twilioSid: smsResult.twilioSid
      } : { sent: false }
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors.map(e => e.message)
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Send SMS confirmation for existing appointment
router.post('/:id/send-confirmation', async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      where: {
        id: req.params.id,
        clientId: req.clientId
      }
    });
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    const smsResult = await sendAppointmentConfirmationSMS({
      appointmentId: appointment.id,
      customerPhone: appointment.customerPhone,
      customerName: appointment.customerName,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      duration: appointment.duration,
      confirmationCode: appointment.confirmationCode
    });
    
    res.json({
      success: true,
      message: 'SMS confirmation sent successfully',
      appointment: {
        id: appointment.id,
        customerName: appointment.customerName,
        customerPhone: appointment.customerPhone
      },
      smsConfirmation: {
        sent: true,
        messageId: smsResult.messageId,
        twilioSid: smsResult.twilioSid
      }
    });
  } catch (error) {
    console.error('Error sending SMS confirmation:', error);
    res.status(500).json({ 
      error: 'Failed to send SMS confirmation',
      details: error.message 
    });
  }
});

// Get appointment by ID FOR THIS CLIENT
router.get('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      where: {
        id: req.params.id,
        clientId: req.clientId
      }
    });
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    res.json({
      success: true,
      appointment: appointment
    });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get appointment by confirmation code FOR THIS CLIENT
router.get('/confirmation/:code', async (req, res) => {
  try {
    const appointment = await sequelize.query(
      'SELECT * FROM appointments WHERE confirmation_code = :code AND client_id = :client_id',
      {
        replacements: {
          code: req.params.code,
          client_id: req.clientId
        },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!appointment || appointment.length === 0) {
      return res.status(404).json({ 
        error: 'Appointment not found with that confirmation code' 
      });
    }
    
    res.json({
      success: true,
      appointment: appointment[0]
    });
  } catch (error) {
    console.error('Error fetching appointment by confirmation code:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update appointment FOR THIS CLIENT
router.put('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      where: {
        id: req.params.id,
        clientId: req.clientId
      }
    });
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    const updates = req.body;
    
    // If updating date/time, check availability
    if (updates.appointmentDate || updates.appointmentTime) {
      const newDate = updates.appointmentDate || appointment.appointmentDate;
      const newTime = updates.appointmentTime || appointment.appointmentTime;
      
      const existing = await sequelize.query(
        'SELECT id FROM appointments WHERE client_id = :client_id AND appointment_date = :date AND appointment_time = :time AND id != :current_id AND status NOT IN (:cancelled, :completed)',
        {
          replacements: {
            client_id: req.clientId,
            date: newDate,
            time: newTime,
            current_id: req.params.id,
            cancelled: 'cancelled',
            completed: 'completed'
          },
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Time slot is already booked' });
      }
    }
    
    await appointment.update(updates);
    
    res.json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: appointment
    });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete appointment FOR THIS CLIENT (permanent deletion from database)
router.delete('/:id', async (req, res) => {
  try {
    const { reason } = req.body;

    const appointment = await Appointment.findOne({
      where: {
        id: req.params.id,
        clientId: req.clientId
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Store appointment data before deletion for SMS notification
    const appointmentData = {
      id: appointment.id,
      customerName: appointment.customerName,
      customerPhone: appointment.customerPhone,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      confirmationCode: appointment.confirmationCode
    };

    // Permanently delete the appointment from the database
    await appointment.destroy();

    console.log(`🗑️ Client ${req.clientId}: DELETED appointment ${appointmentData.id} for ${appointmentData.customerName} permanently`);

    // Send cancellation SMS to notify customer
    let smsResult = null;
    try {
      smsResult = await sendAppointmentCancellationSMS({
        appointmentId: appointmentData.id,
        customerPhone: appointmentData.customerPhone,
        customerName: appointmentData.customerName,
        appointmentDate: appointmentData.appointmentDate,
        appointmentTime: appointmentData.appointmentTime,
        confirmationCode: appointmentData.confirmationCode,
        reason: reason || 'scheduling conflict'
      });
    } catch (smsError) {
      console.error(`⚠️ Failed to send cancellation SMS:`, smsError.message);
    }

    res.json({
      success: true,
      message: 'Appointment deleted permanently',
      appointment: {
        id: appointmentData.id,
        customerName: appointmentData.customerName,
        deleted: true
      },
      smsNotification: smsResult ? {
        sent: true,
        messageId: smsResult.messageId,
        twilioSid: smsResult.twilioSid
      } : { sent: false }
    });

  } catch (error) {
    console.error('❌ Error deleting appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get availability for a specific date FOR THIS CLIENT
router.get('/availability/:clientId/:date', async (req, res) => {
  try {
    const { clientId, date } = req.params;

    // Verify this client has access to this data
    if (parseInt(clientId) !== parseInt(req.clientId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Define business hours (9 AM to 5 PM, 30-minute slots)
    const businessHours = {
      start: 9,  // 9 AM
      end: 17,   // 5 PM
      slotDuration: 30 // minutes
    };

    // Generate all possible time slots
    const allSlots = [];
    for (let hour = businessHours.start; hour < businessHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += businessHours.slotDuration) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        allSlots.push(timeStr);
      }
    }

    // Get existing appointments for this date
    const existingAppointments = await sequelize.query(
      'SELECT appointment_time FROM appointments WHERE client_id = :client_id AND appointment_date = :date AND status NOT IN (:cancelled, :completed)',
      {
        replacements: {
          client_id: clientId,
          date: date,
          cancelled: 'cancelled',
          completed: 'completed'
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const bookedTimes = existingAppointments.map(apt => apt.appointment_time);
    const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));

    console.log(`📅 Client ${clientId}: ${availableSlots.length}/${allSlots.length} slots available on ${date}`);

    res.json({
      success: true,
      date: date,
      available_slots: availableSlots,
      booked_slots: bookedTimes,
      business_hours: businessHours
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create appointment from dashboard (different from POST / to allow custom field names)
router.post('/create', async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      appointmentDate,
      appointmentTime,
      duration,
      notes
    } = req.body;

    if (!customerName || !customerPhone || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerName, customerPhone, appointmentDate, appointmentTime'
      });
    }

    // Check if slot is available FOR THIS CLIENT
    const existing = await sequelize.query(
      'SELECT id FROM appointments WHERE client_id = :client_id AND appointment_date = :date AND appointment_time = :time AND status NOT IN (:cancelled, :completed)',
      {
        replacements: {
          client_id: req.clientId,
          date: appointmentDate,
          time: appointmentTime,
          cancelled: 'cancelled',
          completed: 'completed'
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Time slot is already booked'
      });
    }

    const confirmationCode = `APPT${Date.now().toString().slice(-6).toUpperCase()}`;

    const appointment = await Appointment.create({
      clientId: req.clientId,
      customerName,
      customerEmail: customerEmail || null,
      customerPhone,
      appointmentDate,
      appointmentTime,
      purpose: notes || 'General consultation',
      confirmationCode: confirmationCode,
      source: 'manual',
      duration: duration || 30,
      notes: notes || null,
      status: 'confirmed'
    });

    console.log(`✅ Client ${req.clientId}: Created appointment ${appointment.id} for ${customerName} via CRM dashboard`);

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      appointment: appointment
    });
  } catch (error) {
    console.error('Error creating appointment from dashboard:', error);

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors.map(e => e.message)
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get appointments by phone number FOR THIS CLIENT
router.get('/phone/:phone', async (req, res) => {
  try {
    const appointments = await sequelize.query(
      'SELECT * FROM appointments WHERE customer_phone = :phone AND client_id = :client_id ORDER BY appointment_date DESC, appointment_time DESC',
      {
        replacements: {
          phone: req.params.phone,
          client_id: req.clientId
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      count: appointments.length,
      appointments: appointments
    });
  } catch (error) {
    console.error('Error fetching appointments by phone:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// CRM INTEGRATION ENDPOINTS
// =====================================================

/**
 * GET /api/appointments/dashboard
 * Get appointments for dashboard with CRM source badges
 * Query params:
 *   - days: Number of days to fetch (default 14)
 *   - refresh: If true, sync from CRMs first
 */
router.get('/dashboard', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const refresh = req.query.refresh === 'true';

    console.log(`📊 Dashboard appointments for client ${req.clientId}: days=${days}, refresh=${refresh}`);

    const result = await crmAppointmentService.getDashboardAppointments(req.clientId, {
      days,
      refresh
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching dashboard appointments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appointments/sync-crm
 * Manually trigger CRM sync
 * Body:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 *   - sources: Optional array of sources to sync ['ghl', 'hubspot', 'vagaro']
 */
router.post('/sync-crm', async (req, res) => {
  try {
    const { startDate, endDate, sources } = req.body;

    // Default to next 14 days if not specified
    const today = new Date();
    const start = startDate || today.toISOString().split('T')[0];
    const end = endDate || new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`🔄 CRM sync for client ${req.clientId}: ${start} to ${end}`);

    // Fetch from all CRMs
    const crmData = await crmAppointmentService.fetchAllCRMAppointments(req.clientId, start, end);

    // Filter by sources if specified
    let appointmentsToSync = crmData.appointments;
    if (sources && Array.isArray(sources)) {
      const sourceMap = {
        'ghl': ['ghl_sync', 'whatsapp_ghl'],
        'hubspot': ['hubspot_sync', 'whatsapp_hubspot'],
        'vagaro': ['vagaro_sync', 'whatsapp_vagaro']
      };
      const allowedSources = sources.flatMap(s => sourceMap[s] || []);
      appointmentsToSync = appointmentsToSync.filter(a => allowedSources.includes(a.source));
    }

    // Sync to local database
    let syncResults = { created: 0, updated: 0, errors: [] };
    if (appointmentsToSync.length > 0) {
      syncResults = await crmAppointmentService.syncToLocalDB(req.clientId, appointmentsToSync);
    }

    res.json({
      success: true,
      message: `Synced ${syncResults.created + syncResults.updated} appointments`,
      dateRange: { startDate: start, endDate: end },
      fetched: {
        ghl: crmData.sources.ghl.appointments.length,
        hubspot: crmData.sources.hubspot.appointments.length,
        vagaro: crmData.sources.vagaro.appointments.length
      },
      syncResults,
      syncErrors: syncResults.errors.length > 0 ? syncResults.errors.map(e => e.error) : [],
      integrations: crmData.integrations
    });
  } catch (error) {
    console.error('Error syncing CRM appointments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appointments/crm-status
 * Get status of CRM integrations
 */
router.get('/crm-status', async (req, res) => {
  try {
    const integrations = await crmAppointmentService.getEnabledIntegrations(req.clientId);

    res.json({
      success: true,
      integrations,
      message: Object.values(integrations).some(v => v)
        ? 'CRM integrations are configured'
        : 'No CRM integrations configured'
    });
  } catch (error) {
    console.error('Error checking CRM status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to send SMS confirmation
async function sendAppointmentConfirmationSMS({
  appointmentId,
  customerPhone,
  customerName,
  appointmentDate,
  appointmentTime,
  duration,
  confirmationCode
}) {
  const fetch = require('node-fetch');
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  try {
    const response = await fetch(`${baseUrl}/api/messages/appointment-confirmation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appointmentId,
        customerPhone,
        customerName,
        appointmentDate,
        appointmentTime,
        duration,
        confirmationCode
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'SMS API call failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error calling SMS confirmation API:', error);
    throw error;
  }
}

// =====================================================
// DEPOSIT CONFIRMATION ENDPOINTS
// =====================================================

/**
 * PUT /api/appointments/:id/deposit-status
 * Confirm or update deposit status for an appointment
 */
router.put('/:id/deposit-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, method, notes } = req.body;
    const clientId = req.clientId;

    console.log(`💰 Deposit status update request: appointment ${id}, status=${status}, method=${method}`);

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'not_required'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid deposit status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Get the appointment (must belong to this client - multi-tenant safety)
    const appointment = await Appointment.findOne({
      where: {
        id,
        clientId
      }
    });

    if (!appointment) {
      console.log(`❌ Appointment ${id} not found for client ${clientId}`);
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Update deposit status
    const updateData = {
      depositStatus: status,
      depositConfirmationMethod: method || null,
      depositNotes: notes || null
    };

    // If confirming deposit, record timestamp
    if (status === 'confirmed') {
      updateData.depositConfirmedAt = new Date();
    } else {
      updateData.depositConfirmedAt = null;
    }

    await appointment.update(updateData);

    console.log(`✅ Deposit status updated for appointment ${id}: ${status}`);

    // Send notification to customer if deposit was confirmed
    if (status === 'confirmed') {
      try {
        // Send SMS notification
        await sendDepositConfirmationNotification(appointment, 'sms');
        // Send Email notification
        await sendDepositConfirmationNotification(appointment, 'email');
        console.log(`📱 Deposit confirmation notifications sent to ${appointment.customerPhone}`);
      } catch (notifyError) {
        console.error('Error sending deposit notifications:', notifyError.message);
        // Don't fail the request if notifications fail
      }
    }

    res.json({
      success: true,
      message: `Deposit status updated to ${status}`,
      appointment: {
        id: appointment.id,
        customerName: appointment.customerName,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        depositStatus: status,
        depositConfirmedAt: updateData.depositConfirmedAt,
        depositConfirmationMethod: method
      }
    });

  } catch (error) {
    console.error('Error updating deposit status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appointments/pending-deposits
 * Get all appointments with pending deposits for this client
 */
router.get('/pending-deposits', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const today = new Date().toISOString().split('T')[0];

    const pendingDeposits = await Appointment.findAll({
      where: {
        clientId: req.clientId,
        depositStatus: 'pending',
        appointmentDate: {
          [Op.gte]: today  // Only future/today appointments
        },
        status: {
          [Op.notIn]: ['cancelled', 'completed', 'no-show']
        }
      },
      order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']]
    });

    console.log(`💰 Client ${req.clientId}: Found ${pendingDeposits.length} pending deposits`);

    res.json({
      success: true,
      count: pendingDeposits.length,
      appointments: pendingDeposits
    });

  } catch (error) {
    console.error('Error fetching pending deposits:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper: Send deposit confirmation notification (SMS or Email)
 */
async function sendDepositConfirmationNotification(appointment, type) {
  const fetch = require('node-fetch');
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  // Get client info for sending notifications
  const clientResult = await sequelize.query(
    `SELECT business_name, ringlypro_number, sendgrid_api_key, sendgrid_from_email, owner_email
     FROM clients WHERE id = :clientId`,
    {
      replacements: { clientId: appointment.clientId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const client = clientResult[0];
  if (!client) return;

  const formattedDate = new Date(appointment.appointmentDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  const formattedTime = appointment.appointmentTime.substring(0, 5);
  const hour = parseInt(formattedTime.split(':')[0]);
  const minute = formattedTime.split(':')[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  const timeDisplay = `${hour12}:${minute} ${ampm}`;

  if (type === 'sms') {
    // Send SMS via Twilio
    const message = `${client.business_name}: Great news! Your deposit has been received and confirmed. Your appointment on ${formattedDate} at ${timeDisplay} is now fully confirmed. We look forward to seeing you!`;

    try {
      const response = await fetch(`${baseUrl}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: appointment.clientId,
          to: appointment.customerPhone,
          message: message
        })
      });

      if (!response.ok) {
        throw new Error('SMS send failed');
      }
      console.log(`📱 Deposit confirmation SMS sent to ${appointment.customerPhone}`);
    } catch (smsError) {
      console.error('SMS notification error:', smsError.message);
    }
  }

  if (type === 'email' && appointment.customerEmail && client.sendgrid_api_key) {
    // Send Email via SendGrid
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(client.sendgrid_api_key);

    const msg = {
      to: appointment.customerEmail,
      from: client.sendgrid_from_email || client.owner_email,
      subject: `Deposit Confirmed - ${client.business_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Deposit Confirmed!</h2>
          <p>Dear ${appointment.customerName},</p>
          <p>Great news! Your deposit has been received and confirmed.</p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #166534;">Appointment Details</h3>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${timeDisplay}</p>
            <p><strong>Confirmation Code:</strong> ${appointment.confirmationCode}</p>
          </div>
          <p>Your appointment is now fully confirmed. We look forward to seeing you!</p>
          <p>Best regards,<br>${client.business_name}</p>
        </div>
      `
    };

    try {
      await sgMail.send(msg);
      console.log(`📧 Deposit confirmation email sent to ${appointment.customerEmail}`);
    } catch (emailError) {
      console.error('Email notification error:', emailError.message);
    }
  }
}

// Helper function to send SMS cancellation
async function sendAppointmentCancellationSMS({
  appointmentId,
  customerPhone,
  customerName,
  appointmentDate,
  appointmentTime,
  confirmationCode,
  reason
}) {
  const fetch = require('node-fetch');
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  try {
    const response = await fetch(`${baseUrl}/api/messages/appointment-cancellation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appointmentId,
        customerPhone,
        customerName,
        appointmentDate,
        appointmentTime,
        confirmationCode,
        reason
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'SMS API call failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error calling SMS cancellation API:', error);
    throw error;
  }
}

// =====================================================
// GHL CALENDAR SLOTS ENDPOINT (LIVE DATA)
// =====================================================

/**
 * GET /api/appointments/ghl-calendar-slots
 * Get live FREE/BUSY slots directly from GHL calendars
 * Returns data for all calendars with open hours and slots by date
 */
router.get('/ghl-calendar-slots', async (req, res) => {
  try {
    const axios = require('axios');
    const clientId = req.clientId;
    const days = parseInt(req.query.days) || 7;

    console.log(`📆 Fetching live GHL calendar slots for client ${clientId}`);

    // Get client's GHL credentials
    const [clients] = await sequelize.query(
      'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId',
      { replacements: { clientId }, type: sequelize.QueryTypes.SELECT }
    );

    if (!clients || !clients.ghl_api_key) {
      return res.json({
        success: false,
        error: 'GHL not configured for this client',
        calendars: []
      });
    }

    const apiKey = clients.ghl_api_key;
    const locationId = clients.ghl_location_id;

    // Get all calendars for this location
    const calendarsRes = await axios.get(
      'https://services.leadconnectorhq.com/calendars/',
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version': '2021-07-28'
        },
        params: { locationId }
      }
    );

    const calendars = calendarsRes.data.calendars || [];
    const result = [];

    // Generate date range
    const today = new Date();
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    // Process each calendar
    for (const calendar of calendars) {
      try {
        // Get calendar details (open hours)
        const calDetailRes = await axios.get(
          `https://services.leadconnectorhq.com/calendars/${calendar.id}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Version': '2021-07-28'
            }
          }
        );

        const calDetail = calDetailRes.data.calendar;

        // Build open hours map
        const openHoursConfig = {};
        if (calDetail.openHours) {
          calDetail.openHours.forEach(oh => {
            if (oh.hours && oh.hours[0]) {
              oh.daysOfTheWeek.forEach(day => {
                openHoursConfig[day] = {
                  openHour: oh.hours[0].openHour,
                  closeHour: oh.hours[0].closeHour
                };
              });
            }
          });
        }

        const calendarData = {
          id: calendar.id,
          name: calendar.name,
          openHours: openHoursConfig,
          slotsByDate: {}
        };

        // Get slots for each date
        for (const dateStr of dates) {
          const d = new Date(dateStr);
          const dayOfWeek = d.getDay();
          const dayConfig = openHoursConfig[dayOfWeek];

          if (!dayConfig) {
            calendarData.slotsByDate[dateStr] = {
              closed: true,
              dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
              freeSlots: [],
              busySlots: []
            };
            continue;
          }

          const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
          const dayEnd = dayStart + 24 * 60 * 60 * 1000;

          try {
            const freeSlotsRes = await axios.get(
              `https://services.leadconnectorhq.com/calendars/${calendar.id}/free-slots`,
              {
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Version': '2021-07-28'
                },
                params: { startDate: dayStart, endDate: dayEnd }
              }
            );

            const slotsData = freeSlotsRes.data?.slots || freeSlotsRes.data || {};
            const dateKeys = Object.keys(slotsData);
            const freeSlots = dateKeys.length > 0 ? (slotsData[dateKeys[0]]?.slots || []) : [];

            // Generate all possible slots
            const allPossibleSlots = [];
            for (let h = dayConfig.openHour; h < dayConfig.closeHour; h++) {
              allPossibleSlots.push(`${dateStr}T${h.toString().padStart(2, '0')}:00:00-05:00`);
            }

            // Calculate busy slots
            const busySlots = allPossibleSlots.filter(slot => !freeSlots.includes(slot));

            // Extract just the time portion (HH:MM)
            const freeHours = freeSlots.map(s => s.substring(11, 16));
            const busyHours = busySlots.map(s => s.substring(11, 16));

            calendarData.slotsByDate[dateStr] = {
              closed: false,
              dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
              openHour: dayConfig.openHour,
              closeHour: dayConfig.closeHour,
              freeSlots: freeHours,
              busySlots: busyHours,
              totalSlots: allPossibleSlots.length
            };

          } catch (slotErr) {
            calendarData.slotsByDate[dateStr] = {
              closed: false,
              dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
              error: slotErr.message,
              freeSlots: [],
              busySlots: []
            };
          }
        }

        result.push(calendarData);

      } catch (calErr) {
        console.error(`Error processing calendar ${calendar.name}:`, calErr.message);
        result.push({
          id: calendar.id,
          name: calendar.name,
          error: calErr.message,
          slotsByDate: {}
        });
      }
    }

    console.log(`📆 Fetched slots for ${result.length} calendars for client ${clientId}`);

    res.json({
      success: true,
      clientId,
      locationId,
      dateRange: { start: dates[0], end: dates[dates.length - 1] },
      calendars: result
    });

  } catch (error) {
    console.error('Error fetching GHL calendar slots:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      calendars: []
    });
  }
});

module.exports = router;