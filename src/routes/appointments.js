const express = require('express');
const jwt = require('jsonwebtoken');
const { Appointment, sequelize } = require('../models');
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
router.get('/', async (req, res) => {
  try {
    const appointments = await Appointment.findAll({
      where: {
        clientId: req.clientId
      },
      order: [['appointmentDate', 'DESC'], ['appointmentTime', 'ASC']]
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

// Cancel appointment FOR THIS CLIENT
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
    
    await appointment.update({ status: 'cancelled' });
    
    console.log(`✅ Client ${req.clientId}: Cancelled appointment ${appointment.id}`);
    
    let smsResult = null;
    try {
      smsResult = await sendAppointmentCancellationSMS({
        appointmentId: appointment.id,
        customerPhone: appointment.customerPhone,
        customerName: appointment.customerName,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        confirmationCode: appointment.confirmationCode,
        reason: reason || 'scheduling conflict'
      });
    } catch (smsError) {
      console.error(`⚠️ Failed to send cancellation SMS:`, smsError.message);
    }
    
    res.json({
      success: true,
      message: 'Appointment cancelled successfully',
      appointment: {
        id: appointment.id,
        customerName: appointment.customerName,
        status: appointment.status
      },
      smsNotification: smsResult ? {
        sent: true,
        messageId: smsResult.messageId,
        twilioSid: smsResult.twilioSid
      } : { sent: false }
    });
    
  } catch (error) {
    console.error('❌ Error cancelling appointment:', error);
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
      duration: 30,
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

module.exports = router;