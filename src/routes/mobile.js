// src/routes/mobile.js - Mobile CRM API with JWT authentication
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { sequelize } = require('../models');

// Authentication middleware - CRITICAL for multi-tenant security
const authenticateClient = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
    
    if (!decoded.clientId) {
      return res.status(401).json({ 
        success: false,
        error: 'No client associated with this account' 
      });
    }
    
    // CRITICAL: Extract client_id from URL path (since req.params isn't available yet)
    // URL format: /api/mobile/dashboard/today/12 or /api/mobile/contacts/smart-search/12
    const urlMatch = req.path.match(/\/(\d+)(?:\/|$)/);
    const requestedClientId = urlMatch ? parseInt(urlMatch[1]) : NaN;
    
    // Verify the requested client_id matches the authenticated user's client_id
    if (isNaN(requestedClientId)) {
      console.log(`⚠️ No client_id found in URL path: ${req.path}`);
      return res.status(400).json({ 
        success: false,
        error: 'Client ID is required in URL' 
      });
    }
    
    if (decoded.clientId !== requestedClientId) {
      console.log(`🚨 Security violation: User ${decoded.email} (client ${decoded.clientId}) attempted to access client ${requestedClientId}`);
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized: You can only access your own data' 
      });
    }
    
    req.clientId = decoded.clientId;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    
    console.log(`✅ Authenticated: ${req.userEmail} accessing client ${req.clientId}`);
    
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ 
      success: false,
      error: 'Invalid or expired token' 
    });
  }
};

// Apply authentication to all routes
router.use(authenticateClient);

// ============= TODAY'S DASHBOARD API =============

router.get('/dashboard/today/:client_id', async (req, res) => {
  const { client_id } = req.params;
  
  try {
    console.log(`📊 Loading dashboard for client ${client_id}`);
    
    const appointmentsQuery = `
      SELECT id, customer_name as name, customer_phone as phone,
             appointment_time as time, appointment_date, notes, status, created_at
      FROM appointments 
      WHERE client_id = $1 AND DATE(appointment_date) = CURRENT_DATE
      ORDER BY appointment_time ASC
    `;

    const communicationsQuery = `
      SELECT * FROM (
        SELECT 'sms' as type, from_number as contact_phone, 
               from_number as contact_name, body as content,
               created_at, direction::text as direction
        FROM messages 
        WHERE client_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
        
        UNION ALL
        
        SELECT 'call' as type, from_number as contact_phone,
               from_number as contact_name,
               CONCAT('Duration: ', COALESCE(duration, 0), ' seconds') as content,
               created_at, direction::text as direction
        FROM calls 
        WHERE client_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      ) combined_communications
      ORDER BY created_at DESC LIMIT 10
    `;

    const [appointmentsResult, communicationsResult] = await Promise.all([
      sequelize.query(appointmentsQuery, { bind: [client_id], type: sequelize.QueryTypes.SELECT }),
      sequelize.query(communicationsQuery, { bind: [client_id], type: sequelize.QueryTypes.SELECT })
    ]);

    const formatTime = (timeString) => {
      if (!timeString) return 'N/A';
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
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
      message: comm.content,
      duration: comm.content,
      time: getRelativeTime(comm.created_at),
      direction: comm.direction || 'inbound',
      phone: comm.contact_phone
    }));

    console.log(`✅ Client ${client_id}: Loaded ${appointments.length} appointments, ${communications.length} communications`);

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
