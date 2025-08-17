const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const { Op } = require('sequelize');

// Get all contacts with pagination and search
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      status = 'active',
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {
      status
    };

    // Add search functionality
    if (search.trim()) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }

    // Get contacts with count
    const { count, rows: contacts } = await Contact.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]],
      attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'notes', 'status', 'source', 'lastContactedAt', 'createdAt']
    });

    // Calculate pagination info
    const totalPages = Math.ceil(count / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        contacts: contacts.map(contact => ({
          ...contact.toJSON(),
          fullName: contact.getFullName()
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalContacts: count,
          hasNext,
          hasPrev,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch contacts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    // Check for existing contact with same phone or email
    const existingContact = await Contact.findOne({
      where: {
        [Op.or]: [
          { phone },
          { email }
        ]
      }
    });

    if (existingContact) {
      return res.status(409).json({
        success: false,
        error: 'Contact already exists with this phone number or email',
        existingContact: {
          id: existingContact.id,
          fullName: existingContact.getFullName(),
          phone: existingContact.phone,
          email: existingContact.email
        }
      });
    }

    // Create new contact
    const contact = await Contact.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      notes: notes ? notes.trim() : null,
      source
    });

    res.status(201).json({
      success: true,
      message: `Contact "${contact.getFullName()}" created successfully`,
      data: {
        ...contact.toJSON(),
        fullName: contact.getFullName()
      }
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    
    // Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    // Handle unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        error: 'Contact with this phone number or email already exists'
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Failed to create contact',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        fullName: contact.getFullName()
      }
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch contact',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    // Check for conflicts with other contacts
    if (phone || email) {
      const conflictCheck = await Contact.findOne({
        where: {
          id: { [Op.ne]: id }, // Exclude current contact
          [Op.or]: [
            ...(phone ? [{ phone }] : []),
            ...(email ? [{ email }] : [])
          ]
        }
      });

      if (conflictCheck) {
        return res.status(409).json({
          success: false,
          error: 'Another contact already exists with this phone number or email'
        });
      }
    }

    // Update contact
    const updatedData = {};
    if (firstName !== undefined) updatedData.firstName = firstName.trim();
    if (lastName !== undefined) updatedData.lastName = lastName.trim();
    if (phone !== undefined) updatedData.phone = phone.trim();
    if (email !== undefined) updatedData.email = email.trim().toLowerCase();
    if (notes !== undefined) updatedData.notes = notes ? notes.trim() : null;
    if (status !== undefined) updatedData.status = status;

    await contact.update(updatedData);

    res.json({
      success: true,
      message: `Contact "${contact.getFullName()}" updated successfully`,
      data: {
        ...contact.toJSON(),
        fullName: contact.getFullName()
      }
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Failed to update contact',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete contact (soft delete - set status to inactive)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    if (permanent === 'true') {
      // Permanent deletion
      await contact.destroy();
      res.json({
        success: true,
        message: `Contact "${contact.getFullName()}" permanently deleted`
      });
    } else {
      // Soft delete - set status to inactive
      await contact.update({ status: 'inactive' });
      res.json({
        success: true,
        message: `Contact "${contact.getFullName()}" deactivated`,
        data: {
          ...contact.toJSON(),
          fullName: contact.getFullName()
        }
      });
    }
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete contact',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Search contacts
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 20 } = req.query;

    const contacts = await Contact.searchContacts(query);

    res.json({
      success: true,
      data: {
        query,
        contacts: contacts.slice(0, limit).map(contact => ({
          ...contact.toJSON(),
          fullName: contact.getFullName()
        })),
        total: contacts.length
      }
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search contacts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get recent contacts
router.get('/recent/:limit?', async (req, res) => {
  try {
    const { limit = 10 } = req.params;

    const contacts = await Contact.getRecentContacts(parseInt(limit));

    res.json({
      success: true,
      data: {
        contacts: contacts.map(contact => ({
          ...contact.toJSON(),
          fullName: contact.getFullName()
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching recent contacts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch recent contacts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    await contact.updateLastContacted();

    res.json({
      success: true,
      message: `Updated last contacted time for "${contact.getFullName()}"`,
      data: {
        ...contact.toJSON(),
        fullName: contact.getFullName()
      }
    });
  } catch (error) {
    console.error('Error updating last contacted:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update last contacted time',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;