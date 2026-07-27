'use strict';

/**
 * AI Radar — one-shot capture endpoint for the phone share sheet.
 *
 * This is the path that does NOT carry the session cookie: an iOS Shortcut, an
 * Android intent, a bookmarklet or a curl. Auth is the per-user capture_token,
 * passed as ?key= or the X-Radar-Key header.
 *
 * It answers as soon as the row is written — no page fetch, no model call in
 * the request — so the Shortcut finishes the moment you tap it. The company
 * details fill themselves in a second later, in the background.
 *
 * POST /api/v1/capture?key=TOKEN   { url, text?, note? }
 * GET  /api/v1/capture?key=TOKEN&url=...   (share targets that can only GET;
 *      add &redirect=1 to land in the app instead of getting JSON)
 */

const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { saveLink } = require('../services/save');

async function userForKey(req) {
  const key = String(req.query.key || req.get('X-Radar-Key') || (req.body && req.body.key) || '').trim();
  if (!key || key.length < 20) return null;
  return User.findOne({ where: { capture_token: key } });
}

function payload(item) {
  return {
    success: true,
    saved: true,
    item_id: item.id,
    source_url: item.source_url,
    platform: item.source_platform,
    open: `/airadar/?item=${item.id}`,
    message: 'Saved to AI Radar'
  };
}

router.post('/', async (req, res) => {
  try {
    const user = await userForKey(req);
    if (!user) return res.status(401).json({ error: 'Invalid capture key' });
    const b = req.body || {};
    const url = b.url || b.link || req.query.url;
    const text = b.text || b.caption || req.query.text;
    if (!url && !text) return res.status(400).json({ error: 'url or text required' });
    const item = await saveLink({ user, url, text, note: b.note });
    res.status(201).json(payload(item));
  } catch (e) {
    console.error('AI Radar capture error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const user = await userForKey(req);
    if (!user) return res.status(401).json({ error: 'Invalid capture key' });
    const url = req.query.url || req.query.link;
    const text = req.query.text || req.query.caption;
    if (!url && !text) return res.status(400).json({ error: 'url or text required' });
    const item = await saveLink({ user, url, text, note: req.query.note });
    if (req.query.redirect === '1') return res.redirect('/airadar/?saved=' + item.id);
    res.status(201).json(payload(item));
  } catch (e) {
    console.error('AI Radar capture error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
