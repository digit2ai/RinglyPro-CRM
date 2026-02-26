/**
 * Call Report Routes
 *
 * Generates actionable daily reports from ElevenLabs conversation data.
 * Categorizes calls into: SMS sent, transferred, callback requested,
 * engaged humans, not interested, voicemail, IVR trap, brief, no engagement.
 */

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const elevenLabsConvAI = require('../services/elevenLabsConvAIService');

// In-memory report cache: key = "agentId:date" -> { report, generatedAt }
const reportCache = new Map();
const generatingSet = new Set();

/**
 * API key auth middleware (same pattern as admin routes)
 */
function requireApiKey(req, res, next) {
    const apiKey = req.query.apiKey || req.headers['x-api-key'] || req.body?.apiKey;
    const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
    if (apiKey !== expectedKey) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    next();
}

/**
 * Look up agent_id and business name for a client
 */
async function getClientInfo(clientId) {
    const [client] = await sequelize.query(
        'SELECT elevenlabs_agent_id, business_name FROM clients WHERE id = $1',
        { bind: [parseInt(clientId)], type: QueryTypes.SELECT }
    );
    return client;
}

/**
 * Check if a cached report is stale
 * Past dates: never stale. Today: stale after 10 minutes.
 */
function isStale(cached) {
    const reportDate = cached.report?.date;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
    if (reportDate !== today) return false;
    const ageMs = Date.now() - cached.generatedAt.getTime();
    return ageMs > 10 * 60 * 1000;
}

/**
 * Generate report and store in cache
 */
async function generateAndCache(agentId, date, cacheKey, businessName) {
    try {
        const report = await elevenLabsConvAI.generateDailyReport(agentId, date);
        report.businessName = businessName;
        reportCache.set(cacheKey, { report, generatedAt: new Date() });
        console.log(`📊 Report cached for ${cacheKey}: ${report.totalCalls} calls`);
    } catch (error) {
        console.error(`❌ Report generation failed for ${cacheKey}:`, error.message);
        reportCache.set(cacheKey, { error: error.message, generatedAt: new Date() });
    } finally {
        generatingSet.delete(cacheKey);
    }
}

/**
 * GET /api/call-report/daily
 * Returns cached report or starts generation
 * Query params: client_id, date (YYYY-MM-DD), apiKey
 */
router.get('/daily', requireApiKey, async (req, res) => {
    try {
        const { client_id, date } = req.query;

        if (!client_id) {
            return res.status(400).json({ success: false, error: 'client_id is required' });
        }

        const reportDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

        const client = await getClientInfo(client_id);
        if (!client || !client.elevenlabs_agent_id) {
            return res.status(404).json({ success: false, error: 'Client not found or no ElevenLabs agent configured' });
        }

        const cacheKey = `${client.elevenlabs_agent_id}:${reportDate}`;

        // Check cache
        const cached = reportCache.get(cacheKey);
        if (cached && !cached.error && !isStale(cached)) {
            return res.json({ success: true, cached: true, report: cached.report });
        }

        // Check if generation failed
        if (cached && cached.error) {
            return res.json({ success: false, error: cached.error, canRetry: true });
        }

        // Check if generation is in progress
        if (generatingSet.has(cacheKey)) {
            return res.json({ success: true, status: 'generating', message: 'Report is being generated... poll again in 2 seconds' });
        }

        // Start generation
        generatingSet.add(cacheKey);
        generateAndCache(client.elevenlabs_agent_id, reportDate, cacheKey, client.business_name);

        return res.json({ success: true, status: 'generating', message: 'Report generation started. Poll this endpoint.' });

    } catch (error) {
        console.error('❌ Call report error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/call-report/generate
 * Force re-generate a report (clears cache)
 * Body: { client_id, date, apiKey }
 */
router.post('/generate', requireApiKey, async (req, res) => {
    try {
        const { client_id, date } = req.body;

        if (!client_id) {
            return res.status(400).json({ success: false, error: 'client_id is required' });
        }

        const reportDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

        const client = await getClientInfo(client_id);
        if (!client || !client.elevenlabs_agent_id) {
            return res.status(404).json({ success: false, error: 'Client not found or no ElevenLabs agent configured' });
        }

        const cacheKey = `${client.elevenlabs_agent_id}:${reportDate}`;

        // Clear existing cache and start fresh
        reportCache.delete(cacheKey);

        if (generatingSet.has(cacheKey)) {
            return res.json({ success: true, status: 'generating', message: 'Report is already being generated' });
        }

        generatingSet.add(cacheKey);
        generateAndCache(client.elevenlabs_agent_id, reportDate, cacheKey, client.business_name);

        return res.json({ success: true, status: 'generating', message: 'Report generation started. Poll GET /api/call-report/daily.' });

    } catch (error) {
        console.error('❌ Call report generate error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/call-report/clients
 * List all clients with ElevenLabs agents configured
 */
router.get('/clients', requireApiKey, async (req, res) => {
    try {
        const clients = await sequelize.query(
            `SELECT id, business_name, elevenlabs_agent_id
             FROM clients
             WHERE elevenlabs_agent_id IS NOT NULL AND elevenlabs_agent_id != '' AND active = true
             ORDER BY business_name`,
            { type: QueryTypes.SELECT }
        );
        res.json({ success: true, clients });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cache cleanup: clear today's stale entries every 30 minutes
setInterval(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    for (const [key, cached] of reportCache) {
        if (cached.report?.date === today && isStale(cached)) {
            reportCache.delete(key);
        }
    }
}, 30 * 60 * 1000);

module.exports = router;
