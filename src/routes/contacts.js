const express = require('express');
const router = express.Router();

// Temporary in-memory storage (will be replaced with database later)
let contacts = [];
let contactIdCounter = 1;

// Get all contacts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    
    let filteredContacts = contacts;
    
    // Simple search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filteredContacts = contacts.filter(contact => 
        contact.firstName.toLowerCase().includes(searchLower) ||
        contact.lastName.toLowerCase().includes(searchLower) ||
        contact.phone.includes(search) ||
        contact.email.toLowerCase().includes(searchLower)
      );
    }
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedContacts = filteredContacts.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        contacts: paginatedContacts.map(contact => ({
          ...contact,
          fullName: `${contact.firstName} ${contact.lastName}`
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(filteredContacts.length / limit),
          totalContacts: filteredContacts.length,
          hasNext: endIndex < filteredContacts.length,
          hasPrev: page > 1,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch contacts'
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

    // Check for existing contact
    const existingContact = contacts.find(c => c.phone === phone || c.email === email);
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

    // Create new contact
    const contact = {
      id: contactIdCounter++,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      notes: notes ? notes.trim() : '',
      source,
      status: 'active',
      lastContactedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    contacts.unshift(contact); // Add to beginning of array

    res.status(201).json({
      success: true,
      message: `Contact "${contact.firstName} ${contact.lastName}" created successfully`,
      data: {
        ...contact,
        fullName: `${contact.firstName} ${contact.lastName}`
      }
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create contact'
    });
  }
});

// Get contact by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contact = contacts.find(c => c.id === parseInt(id));

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...contact,
        fullName: `${contact.firstName} ${contact.lastName}`
      }
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch contact'
    });
  }
});

// Update contact
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, email, notes, status } = req.body;

    const contactIndex = contacts.findIndex(c => c.id === parseInt(id));
    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Update contact
    if (firstName !== undefined) contacts[contactIndex].firstName = firstName.trim();
    if (lastName !== undefined) contacts[contactIndex].lastName = lastName.trim();
    if (phone !== undefined) contacts[contactIndex].phone = phone.trim();
    if (email !== undefined) contacts[contactIndex].email = email.trim().toLowerCase();
    if (notes !== undefined) contacts[contactIndex].notes = notes ? notes.trim() : '';
    if (status !== undefined) contacts[contactIndex].status = status;
    contacts[contactIndex].updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: `Contact "${contacts[contactIndex].firstName} ${contacts[contactIndex].lastName}" updated successfully`,
      data: {
        ...contacts[contactIndex],
        fullName: `${contacts[contactIndex].firstName} ${contacts[contactIndex].lastName}`
      }
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update contact'
    });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contactIndex = contacts.findIndex(c => c.id === parseInt(id));

    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    const contact = contacts[contactIndex];
    contacts.splice(contactIndex, 1);

    res.json({
      success: true,
      message: `Contact "${contact.firstName} ${contact.lastName}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete contact'
    });
  }
});

// Search contacts
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 20 } = req.query;

    const searchLower = query.toLowerCase();
    const searchResults = contacts.filter(contact => 
      contact.firstName.toLowerCase().includes(searchLower) ||
      contact.lastName.toLowerCase().includes(searchLower) ||
      contact.phone.includes(query) ||
      contact.email.toLowerCase().includes(searchLower)
    );

    res.json({
      success: true,
      data: {
        query,
        contacts: searchResults.slice(0, limit).map(contact => ({
          ...contact,
          fullName: `${contact.firstName} ${contact.lastName}`
        })),
        total: searchResults.length
      }
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search contacts'
    });
  }
});

// Update last contacted timestamp
router.patch('/:id/contact', async (req, res) => {
  try {
    const { id } = req.params;
    const contactIndex = contacts.findIndex(c => c.id === parseInt(id));

    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    contacts[contactIndex].lastContactedAt = new Date().toISOString();
    contacts[contactIndex].updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: `Updated last contacted time for "${contacts[contactIndex].firstName} ${contacts[contactIndex].lastName}"`,
      data: {
        ...contacts[contactIndex],
        fullName: `${contacts[contactIndex].firstName} ${contacts[contactIndex].lastName}`
      }
    });
  } catch (error) {
    console.error('Error updating last contacted:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update last contacted time'
    });
  }
});

module.exports = router;
