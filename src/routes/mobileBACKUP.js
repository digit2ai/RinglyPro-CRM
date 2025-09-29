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
        customer_name as name,
        customer_phone as phone,
        appointment_date as time,
        notes,
        status,
        created_at
      FROM appointments 
      WHERE client_id = $1 
        AND DATE(appointment_date) = CURRENT_DATE
      ORDER BY appointment_date ASC
    `;

    // Get recent communications (last 24 hours) using raw SQL
    const communicationsQuery = `
      SELECT * FROM (
        SELECT 
          'sms' as type,
          customer_phone as contact_phone,
          customer_name as contact_name,
          content as content,
          created_at,
          'received' as direction
        FROM messages 
        WHERE client_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
        
        UNION ALL
        
        SELECT 
          'call' as type,
          from_number as contact_phone,
          COALESCE(from_number, 'Unknown Caller') as contact_name,
          CONCAT('Duration: ', duration, ' seconds') as content,
          created_at,
          direction
        FROM calls 
        WHERE client_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      ) combined_communications
      ORDER BY created_at DESC
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

// Enhanced smart contact search for voice commands and quick actions
router.get('/contacts/smart-search/:client_id', async (req, res) => {
  const { client_id } = req.params;
  const { q, limit = 8 } = req.query;

  if (!q || q.length < 2) {
    return res.json({
      success: true,
      contacts: [],
      query: q,
      message: 'Enter at least 2 characters to search'
    });
  }

  try {
    // Search contacts from appointments and calls using raw SQL
    const searchQuery = `
      WITH contact_data AS (
        -- Get contacts from appointments
        SELECT DISTINCT
          customer_phone as phone,
          customer_name as name,
          MAX(appointment_date) as last_interaction,
          COUNT(*) as interaction_count,
          'appointment' as source
        FROM appointments 
        WHERE client_id = $1 AND customer_name IS NOT NULL
        GROUP BY customer_phone, customer_name
        
        UNION ALL
        
        -- Get contacts from calls
        SELECT DISTINCT
          from_number as phone,
          COALESCE(from_number, 'Unknown Contact') as name,
          MAX(created_at) as last_interaction,
          COUNT(*) as interaction_count,
          'call' as source
        FROM calls 
        WHERE client_id = $1 AND from_number IS NOT NULL
        GROUP BY from_number
        
        UNION ALL
        
        -- Get contacts from messages
        SELECT DISTINCT
          customer_phone as phone,
          customer_name as name,
          MAX(created_at) as last_interaction,
          COUNT(*) as interaction_count,
          'sms' as source
        FROM messages 
        WHERE client_id = $1 AND customer_name IS NOT NULL
        GROUP BY customer_phone, customer_name
      ),
      
      ranked_contacts AS (
        SELECT 
          phone,
          name,
          last_interaction,
          SUM(interaction_count) as total_interactions,
          ARRAY_AGG(DISTINCT source) as sources
        FROM contact_data
        WHERE 
          (LOWER(name) LIKE LOWER($2) OR phone LIKE $2)
          AND name != 'Unknown Contact'
          AND name IS NOT NULL
        GROUP BY phone, name, last_interaction
        ORDER BY total_interactions DESC, last_interaction DESC
      )
      
      SELECT 
        phone,
        name,
        last_interaction,
        total_interactions,
        sources,
        CASE 
          WHEN last_interaction > NOW() - INTERVAL '1 day' THEN 'Today'
          WHEN last_interaction > NOW() - INTERVAL '7 days' THEN 'This week'
          WHEN last_interaction > NOW() - INTERVAL '30 days' THEN 'This month'
          ELSE 'Older'
        END as recency
      FROM ranked_contacts
      LIMIT $3
    `;

    const result = await sequelize.query(searchQuery, { 
      bind: [client_id, `%${q}%`, limit], 
      type: sequelize.QueryTypes.SELECT 
    });

    const contacts = result.map(contact => ({
      id: contact.phone,
      name: contact.name,
      phone: contact.phone,
      last_interaction: contact.recency,
      interaction_count: contact.total_interactions,
      sources: contact.sources,
      display_name: contact.name,
      display_details: `${contact.phone} • Last contact: ${contact.recency}`
    }));

    res.json({
      success: true,
      contacts,
      query: q,
      total: contacts.length
    });

  } catch (error) {
    console.error('Contact search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ============= VOICE COMMAND PROCESSING =============

// Parse and execute voice commands
router.post('/voice/command/:client_id', async (req, res) => {
  const { client_id } = req.params;
  const { transcript } = req.body;

  if (!transcript) {
    return res.status(400).json({
      success: false,
      error: 'Transcript is required'
    });
  }

  try {
    // Simple command parsing - can be enhanced with NLP
    const commands = {
      sms: /(?:text|message|sms)\s+(\w+)(?:\s+(?:about|saying|that)\s+(.+))?/i,
      call: /(?:call|phone)\s+(\w+)(?:\s+about\s+(.+))?/i,
      schedule: /(?:schedule|book)\s+(?:with\s+)?(\w+)\s+(?:for\s+)?(.+)/i
    };

    let parsedCommand = null;
    
    for (const [action, pattern] of Object.entries(commands)) {
      const match = transcript.match(pattern);
      if (match) {
        parsedCommand = {
          action,
          contactName: match[1],
          message: match[2] || '',
          originalTranscript: transcript
        };
        break;
      }
    }

    if (!parsedCommand) {
      return res.json({
        success: false,
        error: 'Could not understand command',
        suggestion: 'Try saying "Text [name] about [message]" or "Call [name]"',
        transcript
      });
    }

    // Find the contact using raw SQL
    const contactQuery = `
      SELECT DISTINCT customer_phone as phone, customer_name as name
      FROM appointments 
      WHERE client_id = $1 AND LOWER(customer_name) LIKE LOWER($2)
      ORDER BY appointment_date DESC
      LIMIT 1
    `;

    const contactResult = await sequelize.query(contactQuery, {
      bind: [client_id, `%${parsedCommand.contactName}%`],
      type: sequelize.QueryTypes.SELECT
    });

    if (contactResult.length === 0) {
      return res.json({
        success: false,
        error: `Contact "${parsedCommand.contactName}" not found`,
        suggestion: 'Make sure the name matches someone in your appointments',
        searched_for: parsedCommand.contactName
      });
    }

    const contact = contactResult[0];

    res.json({
      success: true,
      command: parsedCommand,
      contact,
      next_action: {
        action: parsedCommand.action,
        contact_name: contact.name,
        contact_phone: contact.phone,
        message: parsedCommand.message,
        ready_to_execute: true
      }
    });

  } catch (error) {
    console.error('Voice command error:', error);
    res.status(500).json({ success: false, error: 'Command processing failed' });
  }
});

// ============= HELPER FUNCTIONS =============

function getRelativeTime(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600) hour${Math.floor(diffInSeconds / 3600) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffInSeconds / 86400)} day${Math.floor(diffInSeconds / 86400) > 1 ? 's' : ''} ago`;
}

module.exports = router;
