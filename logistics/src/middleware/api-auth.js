'use strict';

const bcrypt = require('bcryptjs');

/**
 * API Key Authentication Middleware for LOGISTICS Production Ingest API
 *
 * Reads X-API-Key header, extracts prefix for DB lookup,
 * then bcrypt-compares against the stored hash.
 */
const requireApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Missing X-API-Key header',
        docs: 'Include your API key in the X-API-Key header'
      });
    }

    const prefix = apiKey.substring(0, 12);

    const LogisticsApiKey = req.models.LogisticsApiKey;
    if (!LogisticsApiKey) {
      return res.status(500).json({ success: false, error: 'API key service not available' });
    }

    const candidates = await LogisticsApiKey.findAll({
      where: { key_prefix: prefix, is_active: true }
    });

    if (candidates.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    let matchedKey = null;
    for (const candidate of candidates) {
      if (candidate.expires_at && new Date(candidate.expires_at) < new Date()) {
        continue;
      }
      const valid = await bcrypt.compare(apiKey, candidate.key_hash);
      if (valid) {
        matchedKey = candidate;
        break;
      }
    }

    if (!matchedKey) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    // Validate project_id from URL matches the key's project_id
    const projectId = parseInt(req.params.projectId);
    if (projectId && matchedKey.project_id !== projectId) {
      return res.status(403).json({
        success: false,
        error: 'API key does not have access to this project'
      });
    }

    // Fire-and-forget usage tracking
    matchedKey.increment('request_count').catch(() => {});
    matchedKey.update({ last_used_at: new Date() }).catch(() => {});

    req.apiKey = matchedKey;
    req.authenticatedProjectId = matchedKey.project_id;
    next();
  } catch (error) {
    console.error('LOGISTICS API auth error:', error);
    return res.status(500).json({ success: false, error: 'Authentication service error' });
  }
};

module.exports = { requireApiKey };
