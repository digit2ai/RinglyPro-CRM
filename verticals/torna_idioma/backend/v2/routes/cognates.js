'use strict';

/**
 * v2 Cognate Routes — Filipino-Spanish cognate engine
 *
 * Public (no auth required — this is reference data):
 *   GET  /api/v2/cognates                     — list all (paginated)
 *   GET  /api/v2/cognates?search=<q>          — search by ES or TL word
 *   GET  /api/v2/cognates/categories          — list categories with counts
 *   GET  /api/v2/cognates/category/:category  — list cognates in a category
 *   GET  /api/v2/cognates/lookup/:word        — lookup single word
 *   GET  /api/v2/cognates/highlight?text=...  — tokenize + mark cognates
 *   GET  /api/v2/cognates/stats               — totals + category breakdown
 */

const express = require('express');
const router = express.Router();
const engine = require('../services/cognate-engine');

// GET /api/v2/cognates?search=<q>&limit=<n>
router.get('/', async (req, res) => {
  try {
    const { search = '', limit = 50 } = req.query;
    const results = await engine.search(search, parseInt(limit, 10) || 50);
    res.json({ success: true, count: results.length, results });
  } catch (err) {
    console.error('[v2/cognates] search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/cognates/categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await engine.categories();
    res.json({ success: true, categories: cats });
  } catch (err) {
    console.error('[v2/cognates] categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/cognates/stats
router.get('/stats', async (req, res) => {
  try {
    const s = await engine.stats();
    res.json({ success: true, stats: s });
  } catch (err) {
    console.error('[v2/cognates] stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/cognates/highlight?text=<spanish_text>
router.get('/highlight', async (req, res) => {
  try {
    const { text = '' } = req.query;
    const result = await engine.highlight(text);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[v2/cognates] highlight error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/cognates/category/:category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const results = await engine.byCategory(category);
    res.json({ success: true, category, count: results.length, results });
  } catch (err) {
    console.error('[v2/cognates] category error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/cognates/lookup/:word
router.get('/lookup/:word', async (req, res) => {
  try {
    const { word } = req.params;
    const match = await engine.lookup(decodeURIComponent(word));
    if (!match) return res.status(404).json({ success: false, error: 'No cognate found' });
    res.json({ success: true, cognate: match });
  } catch (err) {
    console.error('[v2/cognates] lookup error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
