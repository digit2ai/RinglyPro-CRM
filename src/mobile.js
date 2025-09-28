// src/routes/mobile.js - Mobile CRM API endpoints
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');

// ============= TODAY'S DASHBOARD API =============

// Get today's appointments and recent communications in one call
router.get('/dashboard/today/:client_id', async (req, res) => {
  const { client_id } = req.params;
  
  try {
    // Get today's appointments using raw SQL for compatibility
    const appointmentsQuery = `
      SELECT 
        id,
        "customerName" as name,
        "customerPhone" as phone,
        "appointmentDate" as time,
        notes,
        status,
        "createdAt"
      FROM "Appointments" 
      WHERE "clientId" = $1 
        AND DATE("appointmentDate") = CURRENT_DATE
      ORDER BY "appointmentDate" ASC
    `;

    // Get recent communications (last 24 hours) using raw SQL
    const communicationsQuery = `
      SELECT * FROM (
        SELECT 
          'sms' as type,
          "customerPhone" as contact_phone,
          "customerName" as contact_name,
          "content" as content,
          "createdAt",
          'received' as direction
        FROM "Messages" 
        WHERE "clientId" = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'
        
        UNION ALL
        
        SELECT 
          'call' as type,
          "fromNumber" as contact_phone,
          COALESCE("fromNumber", 'Unknown Caller') as contact_name,
          CONCAT('Duration: ', "duration", ' seconds') as content,
          "createdAt",
          "direction"
        FROM "Calls" 
        WHERE "clientId" = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'
      ) combined_communications
      ORDER BY "createdAt" DESC
      LIMIT 10
    `;

    const [appointmentsResult, communicationsResult] = await Promise.all([
      sequelize.query(appointmentsQuery, { 
        bind: [client_id], 
        type: sequelize.QueryTypes.SELECT 
      }),
      sequelize.query(communicationsQuery, { 
        bind: [client_id], 
        type: sequelize.QueryTypes.SELECT 
      })
    ]);

    // Format time for mobile display
    const formatTime = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    };

    const appointments = appointmentsResult.map(apt => ({
      id: apt.id,
      name: apt.name || 'Unknown',
      phone: apt.phone || '',
      time: formatTime(apt.time),
      notes: apt.notes || 'No notes',
      status: apt.status || 'confirmed'
    }));

    const communications = communicationsResult.map(comm => ({
      id: `${comm.type}_${Date.now()}_${Math.random()}`,
      type: comm.type,
      contact: comm.contact_name || 'Unknown',
      content: comm.content,
      time: getRelativeTime(comm.createdAt),
      direction: comm.direction || 'incoming',
      phone: comm.contact_phone
    }));

    res.json({
      success: true,
      data: {
        appointments,
        communications,
        summary: {
          total_appointments: appointments.length,
          pending_appointments: appointments.filter(a => a.status === 'pending').length,
          recent_messages: communications.filter(c => c.type === 'sms').length
        }
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

// ============= HELPER FUNCTIONS =============

function getRelativeTime(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hour${Math.floor(diffInSeconds / 3600) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffInSeconds / 86400)} day${Math.floor(diffInSeconds / 86400) > 1 ? 's' : ''} ago`;
}

module.exports = router;