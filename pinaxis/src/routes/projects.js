'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Generate project code
function generateProjectCode() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PINAXIS-${year}-${rand}`;
}

// POST /api/v1/projects — Create a new project
router.post('/', async (req, res) => {
  try {
    const { company_name, contact_name, contact_email, industry, country, business_info } = req.body;

    if (!company_name) {
      return res.status(400).json({ success: false, error: 'company_name is required' });
    }

    const project = await req.models.PinaxisProject.create({
      project_code: generateProjectCode(),
      company_name,
      contact_name: contact_name || null,
      contact_email: contact_email || null,
      industry: industry || null,
      country: country || null,
      business_info: business_info || {},
      status: 'pending'
    });

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('PINAXIS create project error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects — List all projects
router.get('/', async (req, res) => {
  try {
    const projects = await req.models.PinaxisProject.findAll({
      order: [['created_at', 'DESC']],
      attributes: ['id', 'project_code', 'company_name', 'status', 'created_at', 'updated_at']
    });

    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('PINAXIS list projects error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/:id — Get project details
router.get('/:id', async (req, res) => {
  try {
    const where = isNaN(req.params.id)
      ? { project_code: req.params.id }
      : { id: req.params.id };

    const project = await req.models.PinaxisProject.findOne({
      where,
      include: [
        { model: req.models.PinaxisUploadedFile, as: 'files' },
        { model: req.models.PinaxisAnalysisResult, as: 'results' },
        { model: req.models.PinaxisProductRecommendation, as: 'recommendations' }
      ]
    });

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    res.json({ success: true, data: project });
  } catch (error) {
    console.error('PINAXIS get project error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/v1/projects/:id — Update project
router.patch('/:id', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const allowedFields = ['company_name', 'contact_name', 'contact_email', 'industry', 'country', 'business_info', 'status'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    await project.update(updates);
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('PINAXIS update project error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

// POST /api/v1/projects/:projectId/api-key — Generate a new API key
router.post('/:projectId/api-key', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Check for existing active key
    const existingKey = await req.models.PinaxisApiKey.findOne({
      where: { project_id: project.id, is_active: true }
    });
    if (existingKey) {
      return res.status(409).json({
        success: false,
        error: 'Project already has an active API key. Revoke the existing key first.',
        key_prefix: existingKey.key_prefix
      });
    }

    // Generate key: pnx_ + 32 hex chars
    const rawKey = `pnx_${crypto.randomBytes(16).toString('hex')}`;
    const prefix = rawKey.substring(0, 12);
    const hash = await bcrypt.hash(rawKey, 10);

    const label = req.body.label || 'Production API Key';
    const expires_at = req.body.expires_at || null;

    const apiKeyRecord = await req.models.PinaxisApiKey.create({
      project_id: project.id,
      key_prefix: prefix,
      key_hash: hash,
      label,
      is_active: true,
      expires_at
    });

    // Raw key returned ONCE — cannot be retrieved again
    res.status(201).json({
      success: true,
      data: {
        id: apiKeyRecord.id,
        key: rawKey,
        prefix,
        label,
        created_at: apiKeyRecord.created_at,
        expires_at,
        warning: 'Save this key now. It cannot be retrieved again.'
      }
    });
  } catch (error) {
    console.error('PINAXIS API key generate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/:projectId/api-key — Check key status (masked)
router.get('/:projectId/api-key', async (req, res) => {
  try {
    const key = await req.models.PinaxisApiKey.findOne({
      where: { project_id: req.params.projectId, is_active: true },
      attributes: ['id', 'key_prefix', 'label', 'is_active', 'last_used_at', 'request_count', 'created_at', 'expires_at']
    });

    res.json({
      success: true,
      data: key ? { has_key: true, ...key.toJSON() } : { has_key: false }
    });
  } catch (error) {
    console.error('PINAXIS API key status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/projects/:projectId/api-key — Revoke active key
router.delete('/:projectId/api-key', async (req, res) => {
  try {
    const updated = await req.models.PinaxisApiKey.update(
      { is_active: false },
      { where: { project_id: req.params.projectId, is_active: true } }
    );

    res.json({ success: true, data: { revoked: updated[0] } });
  } catch (error) {
    console.error('PINAXIS API key revoke error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
