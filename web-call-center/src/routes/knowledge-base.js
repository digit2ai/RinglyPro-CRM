'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');
const { authenticateAndGetClient } = require('../middleware/wcc-auth');

// Configure multer for file uploads - memory storage, max 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * GET / - List all knowledge bases for client
 */
router.get('/', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;

    const knowledgeBases = await sequelize.query(`
      SELECT
        id,
        client_id,
        name,
        type,
        status,
        config,
        file_url,
        original_filename,
        record_count,
        last_synced_at,
        created_at,
        updated_at
      FROM wcc_knowledge_bases
      WHERE client_id = :clientId
      ORDER BY created_at DESC
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      knowledgeBases: knowledgeBases.map(kb => ({
        id: kb.id,
        clientId: kb.client_id,
        name: kb.name,
        type: kb.type,
        status: kb.status,
        config: kb.config,
        fileUrl: kb.file_url,
        originalFilename: kb.original_filename,
        recordCount: kb.record_count,
        lastSyncedAt: kb.last_synced_at,
        createdAt: kb.created_at,
        updatedAt: kb.updated_at
      }))
    });
  } catch (error) {
    console.error('Web Call Center list knowledge bases error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch knowledge bases'
    });
  }
});

/**
 * POST / - Create new knowledge base
 * Body: { name, type, content, config }
 */
router.post('/', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;
    const { name, type, content, config } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: 'Name and type are required'
      });
    }

    const validTypes = ['text', 'url', 'file', 'faq', 'sitemap'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const [result] = await sequelize.query(`
      INSERT INTO wcc_knowledge_bases (client_id, name, type, status, config, content)
      VALUES (:clientId, :name, :type, 'pending', :config, :content)
      RETURNING *
    `, {
      replacements: {
        clientId,
        name,
        type,
        config: JSON.stringify(config || {}),
        content: content || null
      },
      type: QueryTypes.SELECT
    });

    res.status(201).json({
      success: true,
      knowledgeBase: {
        id: result.id,
        clientId: result.client_id,
        name: result.name,
        type: result.type,
        status: result.status,
        config: result.config,
        content: result.content,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      }
    });
  } catch (error) {
    console.error('Web Call Center create knowledge base error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create knowledge base'
    });
  }
});

/**
 * PUT /:id - Update knowledge base
 */
router.put('/:id', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;
    const kbId = parseInt(req.params.id);

    if (!kbId || isNaN(kbId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid knowledge base ID'
      });
    }

    // Verify ownership
    const [existing] = await sequelize.query(`
      SELECT id FROM wcc_knowledge_bases WHERE id = :kbId AND client_id = :clientId
    `, {
      replacements: { kbId, clientId },
      type: QueryTypes.SELECT
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Knowledge base not found'
      });
    }

    const { name, type, content, config, status } = req.body;
    const updates = [];
    const replacements = { kbId, clientId };

    if (name !== undefined) {
      updates.push('name = :name');
      replacements.name = name;
    }
    if (type !== undefined) {
      updates.push('type = :type');
      replacements.type = type;
    }
    if (content !== undefined) {
      updates.push('content = :content');
      replacements.content = content;
    }
    if (config !== undefined) {
      updates.push('config = :config');
      replacements.config = JSON.stringify(config);
    }
    if (status !== undefined) {
      updates.push('status = :status');
      replacements.status = status;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = NOW()');

    await sequelize.query(`
      UPDATE wcc_knowledge_bases
      SET ${updates.join(', ')}
      WHERE id = :kbId AND client_id = :clientId
    `, {
      replacements,
      type: QueryTypes.UPDATE
    });

    // Fetch updated record
    const [updated] = await sequelize.query(`
      SELECT * FROM wcc_knowledge_bases WHERE id = :kbId AND client_id = :clientId
    `, {
      replacements: { kbId, clientId },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      knowledgeBase: {
        id: updated.id,
        clientId: updated.client_id,
        name: updated.name,
        type: updated.type,
        status: updated.status,
        config: updated.config,
        content: updated.content,
        fileUrl: updated.file_url,
        originalFilename: updated.original_filename,
        recordCount: updated.record_count,
        lastSyncedAt: updated.last_synced_at,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
    });
  } catch (error) {
    console.error('Web Call Center update knowledge base error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update knowledge base'
    });
  }
});

/**
 * DELETE /:id - Delete knowledge base
 */
router.delete('/:id', authenticateAndGetClient, async (req, res) => {
  try {
    const clientId = req.client.id;
    const kbId = parseInt(req.params.id);

    if (!kbId || isNaN(kbId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid knowledge base ID'
      });
    }

    // Verify ownership
    const [existing] = await sequelize.query(`
      SELECT id FROM wcc_knowledge_bases WHERE id = :kbId AND client_id = :clientId
    `, {
      replacements: { kbId, clientId },
      type: QueryTypes.SELECT
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Knowledge base not found'
      });
    }

    await sequelize.query(`
      DELETE FROM wcc_knowledge_bases WHERE id = :kbId AND client_id = :clientId
    `, {
      replacements: { kbId, clientId },
      type: QueryTypes.DELETE
    });

    res.json({
      success: true,
      message: 'Knowledge base deleted successfully'
    });
  } catch (error) {
    console.error('Web Call Center delete knowledge base error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete knowledge base'
    });
  }
});

/**
 * POST /:id/upload - Upload file to knowledge base
 * Uses multer with memory storage, max 10MB
 */
router.post('/:id/upload', authenticateAndGetClient, upload.single('file'), async (req, res) => {
  try {
    const clientId = req.client.id;
    const kbId = parseInt(req.params.id);

    if (!kbId || isNaN(kbId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid knowledge base ID'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Verify ownership
    const [existing] = await sequelize.query(`
      SELECT id, type FROM wcc_knowledge_bases WHERE id = :kbId AND client_id = :clientId
    `, {
      replacements: { kbId, clientId },
      type: QueryTypes.SELECT
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Knowledge base not found'
      });
    }

    // Extract text content from the uploaded file buffer
    const fileContent = req.file.buffer.toString('utf-8');
    const originalFilename = req.file.originalname;

    // Update knowledge base with file content
    await sequelize.query(`
      UPDATE wcc_knowledge_bases
      SET content = :content,
          original_filename = :originalFilename,
          status = 'active',
          record_count = :recordCount,
          last_synced_at = NOW(),
          updated_at = NOW()
      WHERE id = :kbId AND client_id = :clientId
    `, {
      replacements: {
        content: fileContent,
        originalFilename,
        recordCount: fileContent.split('\n').filter(line => line.trim()).length,
        kbId,
        clientId
      },
      type: QueryTypes.UPDATE
    });

    // Fetch updated record
    const [updated] = await sequelize.query(`
      SELECT * FROM wcc_knowledge_bases WHERE id = :kbId AND client_id = :clientId
    `, {
      replacements: { kbId, clientId },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      knowledgeBase: {
        id: updated.id,
        clientId: updated.client_id,
        name: updated.name,
        type: updated.type,
        status: updated.status,
        originalFilename: updated.original_filename,
        recordCount: updated.record_count,
        lastSyncedAt: updated.last_synced_at,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
    });
  } catch (error) {
    console.error('Web Call Center file upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file'
    });
  }
});

module.exports = router;
