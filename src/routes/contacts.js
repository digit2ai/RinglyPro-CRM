const express = require('express');
const router = express.Router();

// Import Contact model from models
const { Contact } = require('../models');

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

    // Check for existing contact by phone or email
    const { Op } = require('sequelize');
    const existingContact = await Contact.findOne({
      where: {
        [Op.or]: [
          { phone: phone },
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

    // Create new contact in database
    const contact = await Contact.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
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

module.exports = router;
