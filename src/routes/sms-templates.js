// src/routes/sms-templates.js — SMS template CRUD with auto-seeding defaults
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// Default templates seeded on first access per client
const DEFAULT_TEMPLATES = [
  {
    name: 'greeting',
    body: 'Hi {{first_name}}, this is {{business_name}}. How can we help you today?',
    description: 'Initial greeting message'
  },
  {
    name: 'confirmation',
    body: 'Hi {{first_name}}, your appointment on {{date}} at {{time}} is confirmed. Reply STOP to opt out.',
    description: 'Appointment confirmation'
  },
  {
    name: 'reminder',
    body: 'Reminder: {{first_name}}, you have an appointment tomorrow at {{time}} with {{business_name}}. See you then!',
    description: 'Appointment reminder (day before)'
  },
  {
    name: 'missed_you',
    body: "Hi {{first_name}}, we missed you! It's been a while since your last visit to {{business_name}}. Book your next appointment today: {{booking_link}}",
    description: 'Re-engagement for inactive customers'
  },
  {
    name: 'thank_you',
    body: 'Thank you for visiting {{business_name}}, {{first_name}}! We appreciate your business. Leave us a review: {{review_link}}',
    description: 'Post-visit thank you'
  }
];

/**
 * Ensure the sms_templates table exists
 */
async function ensureTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sms_templates (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      body TEXT NOT NULL,
      description VARCHAR(255),
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/**
 * Seed default templates for a client if none exist
 */
async function seedDefaults(clientId) {
  const existing = await sequelize.query(
    'SELECT id FROM sms_templates WHERE client_id = :clientId LIMIT 1',
    { replacements: { clientId: parseInt(clientId) }, type: QueryTypes.SELECT }
  );

  if (existing.length > 0) return false;

  for (const tpl of DEFAULT_TEMPLATES) {
    await sequelize.query(
      `INSERT INTO sms_templates (client_id, name, body, description, is_default)
       VALUES (:clientId, :name, :body, :description, true)`,
      {
        replacements: {
          clientId: parseInt(clientId),
          name: tpl.name,
          body: tpl.body,
          description: tpl.description
        },
        type: QueryTypes.INSERT
      }
    );
  }

  return true;
}

/**
 * GET /api/sms-templates?client_id=X
 * List all SMS templates for a client (auto-seeds defaults on first access)
 */
router.get('/', async (req, res) => {
  try {
    const { client_id } = req.query;

    if (!client_id) {
      return res.status(400).json({ success: false, error: 'client_id is required' });
    }

    await ensureTable();
    const seeded = await seedDefaults(client_id);

    const templates = await sequelize.query(
      'SELECT * FROM sms_templates WHERE client_id = :clientId ORDER BY created_at ASC',
      { replacements: { clientId: parseInt(client_id) }, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      seeded,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching SMS templates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SMS templates', details: error.message });
  }
});

/**
 * POST /api/sms-templates
 * Create a new SMS template
 * Body: { client_id, name, body, description? }
 */
router.post('/', async (req, res) => {
  try {
    const { client_id, name, body, description } = req.body;

    if (!client_id || !name || !body) {
      return res.status(400).json({ success: false, error: 'client_id, name, and body are required' });
    }

    await ensureTable();

    const [result] = await sequelize.query(
      `INSERT INTO sms_templates (client_id, name, body, description, is_default)
       VALUES (:clientId, :name, :body, :description, false)
       RETURNING *`,
      {
        replacements: {
          clientId: parseInt(client_id),
          name,
          body,
          description: description || null
        },
        type: QueryTypes.INSERT
      }
    );

    // RETURNING * with QueryTypes.INSERT returns the rows in result
    const created = result[0] || result;

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error) {
    console.error('Error creating SMS template:', error);
    res.status(500).json({ success: false, error: 'Failed to create SMS template', details: error.message });
  }
});

/**
 * PUT /api/sms-templates/:id
 * Update an existing SMS template
 * Body: { name?, body?, description? }
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, body, description } = req.body;

    await ensureTable();

    // Verify it exists
    const [existing] = await sequelize.query(
      'SELECT * FROM sms_templates WHERE id = :id',
      { replacements: { id: parseInt(id) }, type: QueryTypes.SELECT }
    );

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    await sequelize.query(
      `UPDATE sms_templates
       SET name = :name, body = :body, description = :description, updated_at = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id: parseInt(id),
          name: name || existing.name,
          body: body || existing.body,
          description: description !== undefined ? description : existing.description
        }
      }
    );

    const [updated] = await sequelize.query(
      'SELECT * FROM sms_templates WHERE id = :id',
      { replacements: { id: parseInt(id) }, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating SMS template:', error);
    res.status(500).json({ success: false, error: 'Failed to update SMS template', details: error.message });
  }
});

/**
 * DELETE /api/sms-templates/:id
 * Delete an SMS template
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await ensureTable();

    const [existing] = await sequelize.query(
      'SELECT * FROM sms_templates WHERE id = :id',
      { replacements: { id: parseInt(id) }, type: QueryTypes.SELECT }
    );

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    await sequelize.query(
      'DELETE FROM sms_templates WHERE id = :id',
      { replacements: { id: parseInt(id) } }
    );

    res.json({
      success: true,
      message: `Template "${existing.name}" deleted`
    });
  } catch (error) {
    console.error('Error deleting SMS template:', error);
    res.status(500).json({ success: false, error: 'Failed to delete SMS template', details: error.message });
  }
});

module.exports = router;
