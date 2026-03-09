'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Contact, PipelineHistory, Vertical, Company, sequelize } = require('../models');
const { logActivity } = require('../services/activityService');

const STAGES = ['prospect', 'lead', 'cold_lead', 'warm_lead', 'hot_lead', 'client'];
const STAGE_LABELS = {
  prospect: 'Prospect',
  lead: 'Lead',
  cold_lead: 'Cold Lead',
  warm_lead: 'Warm Lead',
  hot_lead: 'Hot Lead',
  client: 'Client'
};

// GET /api/v1/pipeline — Pipeline board (counts + contacts per stage)
router.get('/', async (req, res) => {
  try {
    const { vertical_id } = req.query;
    const where = { workspace_id: 1, archived_at: null };
    if (vertical_id) where.vertical_id = vertical_id;

    const contacts = await Contact.findAll({
      where,
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'] },
        { model: Vertical, as: 'vertical', attributes: ['id', 'name', 'color'] }
      ],
      order: [['updated_at', 'DESC']]
    });

    const pipeline = {};
    STAGES.forEach(s => { pipeline[s] = { label: STAGE_LABELS[s], count: 0, contacts: [] }; });

    contacts.forEach(c => {
      const stage = STAGES.includes(c.pipeline_stage) ? c.pipeline_stage : 'prospect';
      pipeline[stage].count++;
      pipeline[stage].contacts.push(c);
    });

    res.json({ success: true, data: pipeline, stages: STAGES, labels: STAGE_LABELS, total: contacts.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/pipeline/:contactId/stage — Change pipeline stage
router.put('/:contactId/stage', async (req, res) => {
  try {
    const { stage, trigger_type, trigger_detail } = req.body;
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ success: false, error: `Invalid stage. Valid: ${STAGES.join(', ')}` });
    }

    const contact = await Contact.findOne({ where: { id: req.params.contactId, workspace_id: 1 } });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    const fromStage = contact.pipeline_stage || 'prospect';
    if (fromStage === stage) return res.json({ success: true, data: contact, message: 'Already at this stage' });

    await contact.update({ pipeline_stage: stage, last_interaction_date: new Date() });

    await PipelineHistory.create({
      workspace_id: 1,
      contact_id: contact.id,
      from_stage: fromStage,
      to_stage: stage,
      trigger_type: trigger_type || 'manual',
      trigger_detail: trigger_detail || `Moved from ${STAGE_LABELS[fromStage]} to ${STAGE_LABELS[stage]}`
    });

    await logActivity(req.user?.email, 'pipeline_move', 'contact', contact.id,
      `${contact.first_name} ${contact.last_name || ''}: ${STAGE_LABELS[fromStage]} → ${STAGE_LABELS[stage]}`);

    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/pipeline/bulk-stage — Bulk change stage
router.put('/bulk-stage', async (req, res) => {
  try {
    const { contact_ids, stage, trigger_type } = req.body;
    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'contact_ids array required' });
    }
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ success: false, error: 'Invalid stage' });
    }

    const contacts = await Contact.findAll({ where: { id: contact_ids, workspace_id: 1 } });
    let moved = 0;

    for (const contact of contacts) {
      const from = contact.pipeline_stage || 'prospect';
      if (from === stage) continue;
      await contact.update({ pipeline_stage: stage });
      await PipelineHistory.create({
        workspace_id: 1, contact_id: contact.id, from_stage: from, to_stage: stage,
        trigger_type: trigger_type || 'bulk', trigger_detail: `Bulk move to ${STAGE_LABELS[stage]}`
      });
      moved++;
    }

    res.json({ success: true, moved, total: contact_ids.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/pipeline/:contactId/history — Stage change history
router.get('/:contactId/history', async (req, res) => {
  try {
    const history = await PipelineHistory.findAll({
      where: { contact_id: req.params.contactId },
      order: [['created_at', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/pipeline/import — CSV/text import
router.post('/import', express.text({ limit: '10mb', type: '*/*' }), async (req, res) => {
  try {
    const { vertical_id, pipeline_stage, delimiter } = req.query;
    const stage = pipeline_stage || 'prospect';
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ success: false, error: 'Invalid pipeline_stage' });
    }

    const rawText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const sep = delimiter === 'tab' ? '\t' : (delimiter || ',');
    const lines = rawText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'Need header row + at least 1 data row' });
    }

    // Parse header
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    const fieldMap = {
      first_name: ['first_name', 'firstname', 'first', 'nombre'],
      last_name: ['last_name', 'lastname', 'last', 'apellido', 'surname'],
      email: ['email', 'correo', 'e_mail', 'email_address'],
      phone: ['phone', 'telefono', 'tel', 'phone_number', 'mobile'],
      company: ['company', 'empresa', 'company_name', 'organization'],
      title: ['title', 'titulo', 'job_title', 'position', 'cargo'],
      notes: ['notes', 'notas', 'description', 'comments']
    };

    // Map header indices
    const colMap = {};
    for (const [field, aliases] of Object.entries(fieldMap)) {
      const idx = headers.findIndex(h => aliases.includes(h));
      if (idx >= 0) colMap[field] = idx;
    }

    if (colMap.first_name === undefined && colMap.email === undefined) {
      return res.status(400).json({
        success: false,
        error: 'CSV must have at least a "first_name" or "email" column',
        detected_headers: headers
      });
    }

    let imported = 0, skipped = 0, duplicates = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
      try {
        const firstName = colMap.first_name !== undefined ? cols[colMap.first_name] : '';
        const email = colMap.email !== undefined ? cols[colMap.email] : '';

        if (!firstName && !email) { skipped++; continue; }

        // Duplicate check by email
        if (email) {
          const existing = await Contact.findOne({ where: { email, workspace_id: 1 } });
          if (existing) { duplicates++; continue; }
        }

        const contactData = {
          workspace_id: 1,
          first_name: firstName || email.split('@')[0],
          last_name: colMap.last_name !== undefined ? cols[colMap.last_name] : '',
          email: email || null,
          phone: colMap.phone !== undefined ? cols[colMap.phone] : null,
          title: colMap.title !== undefined ? cols[colMap.title] : null,
          notes: colMap.notes !== undefined ? cols[colMap.notes] : null,
          vertical_id: vertical_id ? parseInt(vertical_id) : null,
          pipeline_stage: stage,
          source: 'csv_import',
          status: 'active',
          tags: ['imported']
        };

        await Contact.create(contactData);
        imported++;
      } catch (rowErr) {
        errors.push(`Row ${i + 1}: ${rowErr.message.substring(0, 80)}`);
        skipped++;
      }
    }

    // If company column exists, try to link companies
    if (colMap.company !== undefined && imported > 0) {
      // Re-read imported contacts and create/link companies
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
        const companyName = cols[colMap.company];
        const email = colMap.email !== undefined ? cols[colMap.email] : '';
        if (companyName && email) {
          try {
            const [company] = await Company.findOrCreate({
              where: { name: companyName, workspace_id: 1 },
              defaults: { workspace_id: 1, name: companyName }
            });
            await Contact.update({ company_id: company.id }, { where: { email, workspace_id: 1 } });
          } catch (e) { /* ignore company link errors */ }
        }
      }
    }

    await logActivity(req.user?.email, 'csv_import', 'contact', null,
      `Imported ${imported} contacts (${duplicates} duplicates, ${skipped} skipped)`);

    res.json({
      success: true,
      imported,
      duplicates,
      skipped,
      errors: errors.slice(0, 10),
      total_rows: lines.length - 1
    });
  } catch (error) {
    console.error('[D2AI] CSV import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
