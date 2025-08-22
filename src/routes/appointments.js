const express = require('express');
const { Appointment } = require('../models');
const router = express.Router();

// Get all appointments
router.get('/', async (req, res) => {
  try {
    const appointments = await Appointment.findAll({
      order: [['appointmentDate', 'DESC'], ['appointmentTime', 'ASC']]
    });
    
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

// Get today's appointments (for dashboard)
router.get('/today', async (req, res) => {
  try {
    const appointments = await Appointment.findTodaysAppointments();
    
    res.json({
      success: true,
      count: appointments.length,
      appointments: appointments
    });
  } catch (error) {
    console.error('Error fetching today\'s appointments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available slots for a date (for Rachel)
router.post('/available-slots', async (req, res) => {
  try {
    const { date, timezone = 'America/New_York' } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    
    const slots = await Appointment.getAvailableSlots(date);
    
    res.json({
      success: true,
      date: date,
      timezone: timezone,
      slots: slots
    });
  } catch (error) {
    console.error('Error getting available slots:', error);
    res.status(500).json({ error: 'Failed to get available slots' });
  }
});

// Create appointment (for Rachel and web bookings)
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
      sendSMS = true // Option to disable SMS sending
    } = req.body;
    
    // Validate required fields
    if (!customerName || !customerEmail || !customerPhone || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ 
        error: 'Missing required fields: customerName, customerEmail, customerPhone, appointmentDate, appointmentTime' 
      });
    }
    
    // Check if slot is available
    const existingAppointment = await Appointment.checkAvailability(appointmentDate, appointmentTime);
    if (existingAppointment) {
      return res.status(409).json({ 
        error: 'Time slot is already booked' 
      });
    }
    
    // Generate confirmation code if not provided
    const finalConfirmationCode = confirmationCode || 
      `APPT${Date.now().toString().slice(-6).toUpperCase()}`;
    
    const appointment = await Appointment.create({
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
    
    // Send SMS confirmation after successful appointment creation
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
        
        console.log(`✅ SMS confirmation sent for appointment ${appointment.id}`);
      } catch (smsError) {
        console.error(`⚠️ Failed to send SMS confirmation for appointment ${appointment.id}:`, smsError.message);
        // Don't fail the appointment creation if SMS fails
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
      } : { sent: false, reason: sendSMS ? 'SMS sending failed' : 'SMS disabled' }
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors.map(e => e.message)
      });
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        error: 'Appointment conflict or duplicate confirmation code' 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Send SMS confirmation for existing appointment
router.post('/:id/send-confirmation', async (req, res) => {
  try {
    const { id } = req.params;
    
    const appointment = await Appointment.findByPk(id);
    
    if (!appointment) {
      return res.status(404).json({ 
        error: 'Appointment not found' 
      });
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

// Get appointment by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const appointment = await Appointment.findByPk(id);
    
    if (!appointment) {
      return res.status(404).json({ 
        error: 'Appointment not found' 
      });
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

// Get appointment by confirmation code
router.get('/confirmation/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const appointment = await Appointment.findByConfirmationCode(code);
    
    if (!appointment) {
      return res.status(404).json({ 
        error: 'Appointment not found with that confirmation code' 
      });
    }
    
    res.json({
      success: true,
      appointment: appointment
    });
  } catch (error) {
    console.error('Error fetching appointment by confirmation code:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update appointment
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const appointment = await Appointment.findByPk(id);
    
    if (!appointment) {
      return res.status(404).json({ 
        error: 'Appointment not found' 
      });
    }
    
    // If updating date/time, check availability
    if (updates.appointmentDate || updates.appointmentTime) {
      const newDate = updates.appointmentDate || appointment.appointmentDate;
      const newTime = updates.appointmentTime || appointment.appointmentTime;
      
      const existingAppointment = await Appointment.checkAvailability(newDate, newTime);
      if (existingAppointment && existingAppointment.id !== parseInt(id)) {
        return res.status(409).json({ 
          error: 'Time slot is already booked' 
        });
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

// Cancel appointment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const appointment = await Appointment.findByPk(id);
    
    if (!appointment) {
      return res.status(404).json({ 
        error: 'Appointment not found' 
      });
    }
    
    // Update status to cancelled instead of deleting
    await appointment.update({ 
      status: 'cancelled',
      cancelReason: reason || 'Cancelled by request'
    });
    
    res.json({
      success: true,
      message: 'Appointment cancelled successfully',
      appointment: appointment
    });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get appointments by phone number (for Rachel lookups)
router.get('/phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const appointments = await Appointment.findByPhone(phone);
    
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
  const fetch = require('node-fetch'); // Make sure to install: npm install node-fetch@2
  
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
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error calling SMS confirmation API:', error);
    throw error;
  }
}

module.exports = router;
