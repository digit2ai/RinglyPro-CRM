'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

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

module.exports = router;
