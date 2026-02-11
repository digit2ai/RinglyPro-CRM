'use strict';

/**
 * Press Release Manager API Routes
 *
 * API endpoints for TunjoRacing Press Release Manager (Clients 15 & 40 only)
 * - Contact management (CRUD, CSV upload)
 * - Press release management (CRUD, send)
 * - Analytics and stats
 */

const express = require('express');
const router = express.Router();
const { Sequelize, Op } = require('sequelize');

// Database connection
const sequelize = require('../models').sequelize;

// Middleware to validate client_id (only 15 and 40 allowed)
const validatePressClient = (req, res, next) => {
  const clientId = parseInt(req.query.client_id || req.body.client_id);

  if (!clientId || (clientId !== 15 && clientId !== 40)) {
    return res.status(403).json({
      success: false,
      error: 'Press Release Manager is only available for TunjoRacing (Clients 15 & 40)'
    });
  }

  req.clientId = clientId;
  next();
};

// Apply validation to all routes
router.use(validatePressClient);

// =====================================================
// CONTACTS ENDPOINTS
// =====================================================

/**
 * GET /api/press/contacts
 * Get all press contacts for a client
 */
router.get('/contacts', async (req, res) => {
  try {
    const { language, status, search } = req.query;

    let whereClause = `client_id = ${req.clientId}`;

    if (language && language !== 'all') {
      whereClause += ` AND language = '${language}'`;
    }

    if (status && status !== 'all') {
      whereClause += ` AND consent_status = '${status}'`;
    }

    if (search) {
      const searchLower = search.toLowerCase().replace(/'/g, "''");
      whereClause += ` AND (
        LOWER(email) LIKE '%${searchLower}%' OR
        LOWER(first_name) LIKE '%${searchLower}%' OR
        LOWER(last_name) LIKE '%${searchLower}%' OR
        LOWER(organization) LIKE '%${searchLower}%'
      )`;
    }

    const [contacts] = await sequelize.query(`
      SELECT
        id, email, first_name, last_name, organization,
        country, language, contact_type, consent_status,
        created_at, updated_at
      FROM press_contacts
      WHERE ${whereClause}
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      contacts,
      total: contacts.length
    });

  } catch (error) {
    console.error('Error loading press contacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load contacts'
    });
  }
});

/**
 * POST /api/press/contacts/upload
 * Upload contacts from CSV data
 */
router.post('/contacts/upload', async (req, res) => {
  try {
    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No contacts provided'
      });
    }

    let successCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    const errors = [];

    for (const contact of contacts) {
      try {
        // Validate email
        if (!contact.email || !isValidEmail(contact.email)) {
          invalidCount++;
          errors.push({ email: contact.email, reason: 'Invalid email format' });
          continue;
        }

        // Insert or update contact
        await sequelize.query(`
          INSERT INTO press_contacts (
            client_id, email, first_name, last_name, organization,
            country, language, contact_type, consent_status,
            consent_timestamp, consent_source, source, created_at, updated_at
          )
          VALUES (
            :client_id, :email, :first_name, :last_name, :organization,
            :country, :language, 'press', 'opted_in',
            NOW(), 'csv_upload', 'csv_upload', NOW(), NOW()
          )
          ON CONFLICT (client_id, email) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            organization = EXCLUDED.organization,
            country = EXCLUDED.country,
            language = EXCLUDED.language,
            updated_at = NOW()
        `, {
          replacements: {
            client_id: req.clientId,
            email: contact.email.toLowerCase().trim(),
            first_name: contact.first_name || '',
            last_name: contact.last_name || '',
            organization: contact.organization || '',
            country: (contact.country || 'US').toUpperCase().substring(0, 2),
            language: (contact.language || 'en').toLowerCase().substring(0, 2)
          }
        });

        successCount++;

      } catch (err) {
        if (err.message.includes('duplicate') || err.message.includes('unique')) {
          duplicateCount++;
        } else {
          invalidCount++;
          errors.push({ email: contact.email, reason: err.message });
        }
      }
    }

    res.json({
      success: true,
      results: {
        total: contacts.length,
        successful: successCount,
        duplicates: duplicateCount,
        invalid: invalidCount
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    });

  } catch (error) {
    console.error('Error uploading contacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload contacts'
    });
  }
});

/**
 * POST /api/press/contacts
 * Add a single contact
 */
router.post('/contacts', async (req, res) => {
  try {
    const { email, first_name, last_name, organization, country, language } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required'
      });
    }

    const [result] = await sequelize.query(`
      INSERT INTO press_contacts (
        client_id, email, first_name, last_name, organization,
        country, language, contact_type, consent_status,
        consent_timestamp, consent_source, source, created_at, updated_at
      )
      VALUES (
        :client_id, :email, :first_name, :last_name, :organization,
        :country, :language, 'press', 'opted_in',
        NOW(), 'manual', 'manual_add', NOW(), NOW()
      )
      ON CONFLICT (client_id, email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        organization = EXCLUDED.organization,
        updated_at = NOW()
      RETURNING *
    `, {
      replacements: {
        client_id: req.clientId,
        email: email.toLowerCase().trim(),
        first_name: first_name || '',
        last_name: last_name || '',
        organization: organization || '',
        country: (country || 'US').toUpperCase().substring(0, 2),
        language: (language || 'en').toLowerCase().substring(0, 2)
      }
    });

    res.json({
      success: true,
      contact: result[0]
    });

  } catch (error) {
    console.error('Error adding contact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add contact'
    });
  }
});

/**
 * DELETE /api/press/contacts/:id
 * Delete a contact
 */
router.delete('/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const [result] = await sequelize.query(`
      DELETE FROM press_contacts
      WHERE id = :id AND client_id = :client_id
      RETURNING id
    `, {
      replacements: {
        id: contactId,
        client_id: req.clientId
      }
    });

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    res.json({
      success: true,
      message: 'Contact deleted'
    });

  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contact'
    });
  }
});

// =====================================================
// PRESS RELEASES ENDPOINTS
// =====================================================

/**
 * GET /api/press/releases
 * Get all press releases for a client
 */
router.get('/releases', async (req, res) => {
  try {
    const [releases] = await sequelize.query(`
      SELECT
        id, title, race_event, race_date, status,
        subject_en, subject_es,
        body_en, body_es,
        total_recipients, sent_count, delivered_count, open_count, click_count,
        created_at, updated_at, sent_at
      FROM press_releases
      WHERE client_id = :client_id
      ORDER BY created_at DESC
    `, {
      replacements: { client_id: req.clientId }
    });

    res.json({
      success: true,
      releases,
      total: releases.length
    });

  } catch (error) {
    console.error('Error loading press releases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load press releases'
    });
  }
});

/**
 * POST /api/press/releases
 * Create a new press release
 */
router.post('/releases', async (req, res) => {
  try {
    const {
      title, race_event, race_date, status,
      content, created_by
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    // Extract bilingual content
    const subjectEn = content?.en?.subject || '';
    const bodyEn = content?.en?.body || '';
    const subjectEs = content?.es?.subject || '';
    const bodyEs = content?.es?.body || '';

    const [result] = await sequelize.query(`
      INSERT INTO press_releases (
        client_id, title, race_event, race_date, status,
        subject_en, body_en, subject_es, body_es,
        created_by, created_at, updated_at
      )
      VALUES (
        :client_id, :title, :race_event, :race_date, :status,
        :subject_en, :body_en, :subject_es, :body_es,
        :created_by, NOW(), NOW()
      )
      RETURNING *
    `, {
      replacements: {
        client_id: req.clientId,
        title,
        race_event: race_event || null,
        race_date: race_date || null,
        status: status || 'draft',
        subject_en: subjectEn,
        body_en: bodyEn,
        subject_es: subjectEs,
        body_es: bodyEs,
        created_by: created_by || null
      }
    });

    res.json({
      success: true,
      release: result[0]
    });

  } catch (error) {
    console.error('Error creating press release:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create press release'
    });
  }
});

/**
 * PUT /api/press/releases/:id
 * Update a press release
 */
router.put('/releases/:id', async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id);
    const {
      title, race_event, race_date, status,
      content
    } = req.body;

    // Extract bilingual content
    const subjectEn = content?.en?.subject;
    const bodyEn = content?.en?.body;
    const subjectEs = content?.es?.subject;
    const bodyEs = content?.es?.body;

    const [result] = await sequelize.query(`
      UPDATE press_releases SET
        title = COALESCE(:title, title),
        race_event = COALESCE(:race_event, race_event),
        race_date = COALESCE(:race_date, race_date),
        status = COALESCE(:status, status),
        subject_en = COALESCE(:subject_en, subject_en),
        body_en = COALESCE(:body_en, body_en),
        subject_es = COALESCE(:subject_es, subject_es),
        body_es = COALESCE(:body_es, body_es),
        updated_at = NOW()
      WHERE id = :id AND client_id = :client_id
      RETURNING *
    `, {
      replacements: {
        id: releaseId,
        client_id: req.clientId,
        title: title || null,
        race_event: race_event || null,
        race_date: race_date || null,
        status: status || null,
        subject_en: subjectEn || null,
        body_en: bodyEn || null,
        subject_es: subjectEs || null,
        body_es: bodyEs || null
      }
    });

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Press release not found'
      });
    }

    res.json({
      success: true,
      release: result[0]
    });

  } catch (error) {
    console.error('Error updating press release:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update press release'
    });
  }
});

/**
 * DELETE /api/press/releases/:id
 * Delete a press release
 */
router.delete('/releases/:id', async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id);

    const [result] = await sequelize.query(`
      DELETE FROM press_releases
      WHERE id = :id AND client_id = :client_id
      RETURNING id
    `, {
      replacements: {
        id: releaseId,
        client_id: req.clientId
      }
    });

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Press release not found'
      });
    }

    res.json({
      success: true,
      message: 'Press release deleted'
    });

  } catch (error) {
    console.error('Error deleting press release:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete press release'
    });
  }
});

// =====================================================
// STATS ENDPOINT
// =====================================================

/**
 * GET /api/press/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Get contact stats
    const [[contactStats]] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE consent_status = 'opted_in') as active,
        COUNT(*) FILTER (WHERE language = 'en') as english,
        COUNT(*) FILTER (WHERE language = 'es') as spanish
      FROM press_contacts
      WHERE client_id = :client_id
    `, {
      replacements: { client_id: req.clientId }
    });

    // Get release stats
    const [[releaseStats]] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'draft') as drafts,
        COALESCE(SUM(delivered_count), 0) as total_delivered,
        COALESCE(SUM(open_count), 0) as total_opens,
        COALESCE(SUM(click_count), 0) as total_clicks
      FROM press_releases
      WHERE client_id = :client_id
    `, {
      replacements: { client_id: req.clientId }
    });

    // Calculate rates
    const deliveredCount = parseInt(releaseStats.total_delivered) || 0;
    const openCount = parseInt(releaseStats.total_opens) || 0;
    const openRate = deliveredCount > 0 ? Math.round((openCount / deliveredCount) * 100) : 0;

    res.json({
      success: true,
      stats: {
        contacts: {
          total: parseInt(contactStats.total) || 0,
          active: parseInt(contactStats.active) || 0,
          english: parseInt(contactStats.english) || 0,
          spanish: parseInt(contactStats.spanish) || 0
        },
        releases: {
          total: parseInt(releaseStats.total) || 0,
          sent: parseInt(releaseStats.sent) || 0,
          drafts: parseInt(releaseStats.drafts) || 0
        },
        engagement: {
          delivered: deliveredCount,
          opens: openCount,
          clicks: parseInt(releaseStats.total_clicks) || 0,
          openRate: openRate
        }
      }
    });

  } catch (error) {
    console.error('Error loading press stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load statistics'
    });
  }
});

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

module.exports = router;
