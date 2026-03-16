const express = require('express');
const router = express.Router();

// Import Contact model from models
const { Contact, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const { normalizePhoneFromSpeech } = require('../utils/phoneNormalizer');

// Get all contacts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    
    let whereClause = {};
    
    // Search functionality
    if (search.trim()) {
      const { Op } = require('sequelize');
      const searchTerm = search.toLowerCase();
      whereClause = {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${searchTerm}%` } },
          { lastName: { [Op.iLike]: `%${searchTerm}%` } },
          { email: { [Op.iLike]: `%${searchTerm}%` } },
          { phone: { [Op.like]: `%${search}%` } }
        ]
      };
    }
    
    // Get total count for pagination
    const totalContacts = await Contact.count({ where: whereClause });
    
    // Get paginated results
    const contacts = await Contact.findAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [[sortBy, sortOrder.toUpperCase()]],
      attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'notes', 'status', 'source', 'lastContactedAt', 'createdAt', 'updatedAt']
    });
    
    // Add fullName to each contact
    const contactsWithFullName = contacts.map(contact => ({
      ...contact.toJSON(),
      fullName: `${contact.firstName} ${contact.lastName}`
    }));
    
    res.json({
      success: true,
      data: {
        contacts: contactsWithFullName,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalContacts / limit),
          totalContacts: totalContacts,
          hasNext: (parseInt(page) * parseInt(limit)) < totalContacts,
          hasPrev: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch contacts',
      details: error.message
    });
  }
});

// Create new contact
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, phone, email, notes, source = 'manual' } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !phone || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: firstName, lastName, phone, email'
      });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneFromSpeech(phone.trim());
    console.log(`📞 Creating contact - normalized phone: ${phone} → ${normalizedPhone}`);

    // Check for existing contact by phone or email - use normalized phone
    const { Op } = require('sequelize');
    const existingContact = await Contact.findOne({
      where: {
        [Op.or]: [
          { phone: normalizedPhone },
          { email: email }
        ]
      }
    });

    if (existingContact) {
      return res.status(409).json({
        success: false,
        error: 'Contact already exists with this phone number or email',
        existingContact: {
          id: existingContact.id,
          fullName: `${existingContact.firstName} ${existingContact.lastName}`,
          phone: existingContact.phone,
          email: existingContact.email
        }
      });
    }

    // Create new contact in database with normalized phone
    const contact = await Contact.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: normalizedPhone,
      email: email.trim().toLowerCase(),
      notes: notes ? notes.trim() : '',
      source,
      status: 'active',
      lastContactedAt: null
    });

    res.status(201).json({
      success: true,
      message: `Contact "${contact.firstName} ${contact.lastName}" created successfully`,
      data: {
        ...contact.toJSON(),
        fullName: `${contact.firstName} ${contact.lastName}`
      }
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create contact',
      details: error.message
    });
  }
});

// ─── Export (must be before /:id) ─────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });
    const contacts = await sequelize.query(
      'SELECT first_name, last_name, phone, email, status, source, lifecycle_stage, lead_score, company, notes, tags, created_at FROM contacts WHERE client_id = :clientId ORDER BY created_at DESC',
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );
    const headers = 'first_name,last_name,phone,email,status,source,lifecycle_stage,lead_score,company,notes,tags,created_at';
    const rows = contacts.map(c =>
      [c.first_name, c.last_name, c.phone, c.email, c.status, c.source, c.lifecycle_stage, c.lead_score, c.company, (c.notes||'').replace(/,/g, ';'), JSON.stringify(c.tags||[]), c.created_at].map(v => `"${(v||'').toString().replace(/"/g, '""')}"`).join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=contacts_${clientId}_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(headers + '\n' + rows.join('\n'));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Import (must be before /:id) ────────────────────────────
router.post('/import', async (req, res) => {
  try {
    const { client_id, contacts: importRows } = req.body;
    if (!client_id || !importRows || !Array.isArray(importRows)) return res.status(400).json({ success: false, error: 'client_id and contacts array required' });
    let created = 0, skipped = 0, errors = 0;
    for (const row of importRows) {
      try {
        const phone = (row.phone || '').replace(/[^\d+]/g, '');
        if (!phone) { skipped++; continue; }
        const [existing] = await sequelize.query('SELECT id FROM contacts WHERE client_id = :cid AND phone = :phone LIMIT 1', { replacements: { cid: client_id, phone }, type: QueryTypes.SELECT });
        if (existing) { skipped++; continue; }
        await sequelize.query(
          `INSERT INTO contacts (client_id, first_name, last_name, phone, email, source, status, tags, lifecycle_stage, company, notes, created_at, updated_at)
           VALUES (:cid, :fn, :ln, :phone, :email, :src, 'active', :tags, 'lead', :company, :notes, NOW(), NOW())`,
          { replacements: { cid: client_id, fn: row.first_name||'', ln: row.last_name||'', phone, email: row.email||null, src: row.source||'import', tags: JSON.stringify(row.tags||[]), company: row.company||null, notes: row.notes||null } }
        );
        created++;
      } catch (e) { errors++; }
    }
    res.json({ success: true, created, skipped, errors, total: importRows.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Get contact by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...contact.toJSON(),
        fullName: `${contact.firstName} ${contact.lastName}`
      }
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch contact',
      details: error.message
    });
  }
});

// Update contact
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, email, notes, status } = req.body;

    const contact = await Contact.findByPk(id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Update contact fields
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (notes !== undefined) updateData.notes = notes ? notes.trim() : '';
    if (status !== undefined) updateData.status = status;

    await contact.update(updateData);

    res.json({
      success: true,
      message: `Contact "${contact.firstName} ${contact.lastName}" updated successfully`,
      data: {
        ...contact.toJSON(),
        fullName: `${contact.firstName} ${contact.lastName}`
      }
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update contact',
      details: error.message
    });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    const contactName = `${contact.firstName} ${contact.lastName}`;
    await contact.destroy();

    res.json({
      success: true,
      message: `Contact "${contactName}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete contact',
      details: error.message
    });
  }
});

// Search contacts
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 20 } = req.query;

    if (!query || query.trim().length === 0) {
      return res.json({
        success: true,
        data: {
          query,
          contacts: [],
          total: 0
        }
      });
    }

    const { Op } = require('sequelize');
    const searchTerm = query.toLowerCase();
    
    const contacts = await Contact.findAll({
      where: {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${searchTerm}%` } },
          { lastName: { [Op.iLike]: `%${searchTerm}%` } },
          { email: { [Op.iLike]: `%${searchTerm}%` } },
          { phone: { [Op.like]: `%${query}%` } }
        ]
      },
      limit: parseInt(limit),
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    const contactsWithFullName = contacts.map(contact => ({
      ...contact.toJSON(),
      fullName: `${contact.firstName} ${contact.lastName}`
    }));

    res.json({
      success: true,
      data: {
        query,
        contacts: contactsWithFullName,
        total: contacts.length
      }
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search contacts',
      details: error.message
    });
  }
});

// Update last contacted timestamp
router.patch('/:id/contact', async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    await contact.update({
      lastContactedAt: new Date()
    });

    res.json({
      success: true,
      message: `Updated last contacted time for "${contact.firstName} ${contact.lastName}"`,
      data: {
        ...contact.toJSON(),
        fullName: `${contact.firstName} ${contact.lastName}`
      }
    });
  } catch (error) {
    console.error('Error updating last contacted:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update last contacted time',
      details: error.message
    });
  }
});

// ─── Tags Management ─────────────────────────────────────────
router.put('/:id/tags', async (req, res) => {
  try {
    const { tags } = req.body; // array of strings
    if (!Array.isArray(tags)) return res.status(400).json({ success: false, error: 'tags must be array' });
    await sequelize.query('UPDATE contacts SET tags = :tags WHERE id = :id', { replacements: { tags: JSON.stringify(tags), id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Lifecycle Stage ─────────────────────────────────────────
router.put('/:id/lifecycle', async (req, res) => {
  try {
    const { lifecycle_stage } = req.body;
    const valid = ['subscriber', 'lead', 'opportunity', 'customer', 'churned'];
    if (!valid.includes(lifecycle_stage)) return res.status(400).json({ success: false, error: 'Invalid stage' });
    await sequelize.query('UPDATE contacts SET lifecycle_stage = :stage WHERE id = :id', { replacements: { stage: lifecycle_stage, id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── All Tags Used ───────────────────────────────────────────
router.get('/tags/all', async (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });
    const rows = await sequelize.query(
      "SELECT DISTINCT jsonb_array_elements_text(tags) as tag FROM contacts WHERE client_id = :clientId AND tags != '[]'::jsonb ORDER BY tag",
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, tags: rows.map(r => r.tag) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Contact Notes ───────────────────────────────────────────
router.get('/:id/notes', async (req, res) => {
  try {
    const notes = await sequelize.query(
      'SELECT * FROM contact_notes WHERE contact_id = :id ORDER BY pinned DESC, created_at DESC',
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, notes });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/notes', async (req, res) => {
  try {
    const { note, note_type = 'general', client_id } = req.body;
    if (!note) return res.status(400).json({ success: false, error: 'note required' });
    const [created] = await sequelize.query(
      `INSERT INTO contact_notes (client_id, contact_id, note, note_type, created_at)
       VALUES (:clientId, :contactId, :note, :type, NOW()) RETURNING *`,
      { replacements: { clientId: client_id || 0, contactId: parseInt(req.params.id), note, type: note_type }, type: QueryTypes.SELECT }
    );
    res.status(201).json({ success: true, note: created });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/notes/:id/pin', async (req, res) => {
  try {
    await sequelize.query('UPDATE contact_notes SET pinned = NOT pinned WHERE id = :id', { replacements: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    await sequelize.query('DELETE FROM contact_notes WHERE id = :id', { replacements: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Lead Score Recalculation ─────────────────────────────────
router.post('/:id/recalculate-score', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const [contact] = await sequelize.query('SELECT * FROM contacts WHERE id = :id', { replacements: { id: contactId }, type: QueryTypes.SELECT });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    let score = 0;
    // +10 per answered inbound call >30s
    const [calls] = await sequelize.query(
      "SELECT COUNT(*) as cnt FROM calls WHERE contact_id = :id AND direction IN ('incoming','inbound') AND call_status = 'completed' AND duration > 30",
      { replacements: { id: contactId }, type: QueryTypes.SELECT }
    );
    score += parseInt(calls.cnt) * 10;

    // +5 per SMS received from contact
    const [sms] = await sequelize.query(
      "SELECT COUNT(*) as cnt FROM messages WHERE contact_id = :id AND direction = 'incoming'",
      { replacements: { id: contactId }, type: QueryTypes.SELECT }
    );
    score += parseInt(sms.cnt) * 5;

    // +15 per appointment booked
    const [appts] = await sequelize.query(
      "SELECT COUNT(*) as cnt FROM appointments WHERE contact_id = :id AND status NOT IN ('cancelled')",
      { replacements: { id: contactId }, type: QueryTypes.SELECT }
    );
    score += parseInt(appts.cnt) * 15;

    // -10 per no-show
    const [noShows] = await sequelize.query(
      "SELECT COUNT(*) as cnt FROM appointments WHERE contact_id = :id AND status = 'no-show'",
      { replacements: { id: contactId }, type: QueryTypes.SELECT }
    );
    score -= parseInt(noShows.cnt) * 10;

    // +20 per deal
    const [deals] = await sequelize.query(
      'SELECT COUNT(*) as cnt FROM deals WHERE contact_id = :id',
      { replacements: { id: contactId }, type: QueryTypes.SELECT }
    );
    score += parseInt(deals.cnt) * 20;

    // Inactivity penalty
    if (contact.last_contacted_at) {
      const daysSince = Math.floor((Date.now() - new Date(contact.last_contacted_at).getTime()) / 86400000);
      if (daysSince > 30) score -= 15;
      else if (daysSince > 14) score -= 5;
    }

    score = Math.max(0, Math.min(100, score));
    await sequelize.query('UPDATE contacts SET lead_score = :score WHERE id = :id', { replacements: { score, id: contactId } });
    res.json({ success: true, lead_score: score });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
