// src/routes/mobile.js - Mobile CRM API with correct database schema
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');

// ============= TODAY'S DASHBOARD API =============

router.get('/dashboard/today/:client_id', async (req, res) => {
  const { client_id } = req.params;
  
  try {
    const appointmentsQuery = `
      SELECT id, customer_name as name, customer_phone as phone,
             appointment_date as time, notes, status, created_at
      FROM appointments 
      WHERE client_id = $1 AND DATE(appointment_date) = CURRENT_DATE
      ORDER BY appointment_date ASC
    `;

    const communicationsQuery = `
      SELECT * FROM (
        SELECT 'sms' as type, from_number as contact_phone, 
               from_number as contact_name, body as content,
               created_at, direction
        FROM messages 
        WHERE client_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
        
        UNION ALL
        
        SELECT 'call' as type, from_number as contact_phone,
               from_number as contact_name,
               CONCAT('Duration: ', COALESCE(duration, 0), ' seconds') as content,
               created_at, direction
        FROM calls 
        WHERE client_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      ) combined_communications
      ORDER BY created_at DESC LIMIT 10
    `;

    const [appointmentsResult, communicationsResult] = await Promise.all([
      sequelize.query(appointmentsQuery, { bind: [client_id], type: sequelize.QueryTypes.SELECT }),
      sequelize.query(communicationsQuery, { bind: [client_id], type: sequelize.QueryTypes.SELECT })
    ]);

    const formatTime = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
      time: getRelativeTime(comm.created_at),
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

// ============= SMART CONTACT SEARCH =============

router.get('/contacts/smart-search/:client_id', async (req, res) => {
  const { client_id } = req.params;
  const { q, limit = 8 } = req.query;

  if (!q || q.length < 2) {
    return res.json({ success: true, contacts: [], query: q });
  }

  try {
    const searchQuery = `
      SELECT DISTINCT customer_phone as phone, customer_name as name,
             MAX(appointment_date) as last_interaction, COUNT(*) as interaction_count
      FROM appointments 
      WHERE client_id = $1 AND customer_name IS NOT NULL
        AND (LOWER(customer_name) LIKE LOWER($2) OR customer_phone LIKE $2)
      GROUP BY customer_phone, customer_name
      ORDER BY interaction_count DESC, last_interaction DESC
      LIMIT $3
    `;

    const result = await sequelize.query(searchQuery, { 
      bind: [client_id, `%${q}%`, limit], 
      type: sequelize.QueryTypes.SELECT 
    });

    const contacts = result.map(c => ({
      id: c.phone,
      name: c.name,
      phone: c.phone,
      display_name: c.name,
      display_details: `${c.phone} • ${c.interaction_count} appointments`
    }));

    res.json({ success: true, contacts, query: q, total: contacts.length });

  } catch (error) {
    console.error('Contact search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ============= VOICE COMMAND PROCESSING =============

router.post('/voice/command/:client_id', async (req, res) => {
  const { client_id } = req.params;
  const { transcript } = req.body;

  if (!transcript) {
    return res.status(400).json({ success: false, error: 'Transcript is required' });
  }

  try {
    const match = transcript.match(/(?:text|message|sms|call|phone)\s+(\w+)(?:\s+(?:about|saying|that)\s+(.+))?/i);
    
    if (!match) {
      return res.json({
        success: false,
        error: 'Could not understand command',
        suggestion: 'Try: "Text [name] about [message]"'
      });
    }

    const contactQuery = `
      SELECT customer_phone as phone, customer_name as name, appointment_date
      FROM appointments 
      WHERE client_id = $1 AND LOWER(customer_name) LIKE LOWER($2)
      ORDER BY appointment_date DESC LIMIT 1
    `;

    const contactResult = await sequelize.query(contactQuery, {
      bind: [client_id, `%${match[1]}%`],
      type: sequelize.QueryTypes.SELECT
    });

    if (contactResult.length === 0) {
      return res.json({ success: false, error: `Contact "${match[1]}" not found` });
    }

    const contact = contactResult[0];
    const action = transcript.toLowerCase().includes('text') || transcript.toLowerCase().includes('message') ? 'sms' : 'call';

    res.json({
      success: true,
      contact,
      next_action: {
        action,
        contact_name: contact.name,
        contact_phone: contact.phone,
        message: match[2] || ''
      }
    });

  } catch (error) {
    console.error('Voice command error:', error);
    res.status(500).json({ success: false, error: 'Command failed' });
  }
});

// ============= HELPER FUNCTIONS =============

function getRelativeTime(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  const days = Math.floor(diffInSeconds / 86400);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

module.exports = router;
