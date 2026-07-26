'use strict';

/**
 * AI Radar — one-shot capture endpoint for the phone share sheet.
 *
 * This is the path that does NOT carry the session cookie: an iOS Shortcut, an
 * Android intent, a bookmarklet or a curl. Auth is the per-user capture_token,
 * passed as ?key= or the X-Radar-Key header.
 *
 * POST /api/v1/capture?key=TOKEN   { url, text?, note?, enrich?:true }
 *   -> creates an inbox item, auto-enriched by default, and returns the item id
 *      plus the deep link to finish editing it in the app.
 *
 * GET  /api/v1/capture?key=TOKEN&url=...   same thing for share targets that can
 *      only issue a GET. Returns JSON, or redirects to the app when &redirect=1.
 */

const express = require('express');
const router = express.Router();
const { User, Item, Enrichment } = require('../models');
const { enrich } = require('../services/enrich');
const { detectPlatform } = require('../services/metadata');

async function userForKey(req) {
  const key = String(req.query.key || req.get('X-Radar-Key') || req.body?.key || '').trim();
  if (!key || key.length < 20) return null;
  return User.findOne({ where: { capture_token: key } });
}

async function doCapture(user, { url, text, note, wantEnrich }) {
  const tenant_id = user.tenant_id || user.id;
  const source_url = String(url || '').trim().slice(0, 4000);
  const shared_text = String(text || '').trim().slice(0, 8000);

  let draft = null;
  if (wantEnrich && source_url) {
    try { draft = await enrich({ url: source_url, text: shared_text }); }
    catch (e) { console.error('AI Radar capture enrich error:', e.message); }
  }

  const item = await Item.create({
    tenant_id,
    user_id: user.id,
    source_url,
    shared_text,
    source_platform: (draft && draft.source_platform) || detectPlatform(source_url) || 'web',
    source_title: draft ? draft.source_title : null,
    thumbnail_url: draft ? draft.thumbnail_url : null,
    company_name: draft ? draft.company_name : '',
    company_url: draft ? draft.company_url : '',
    description: draft ? draft.description : '',
    category: draft ? draft.category : null,
    tags: draft ? draft.tags : [],
    notes: String(note || '').slice(0, 4000),
    status: 'inbox',
    enriched_by: draft ? draft.enriched_by : 'manual',
    is_simulated: draft ? draft.is_simulated : false,
    needs_review: draft ? (draft.needs_review || !draft.company_name) : true,
    created_at: new Date(), updated_at: new Date()
  });

  if (draft) {
    await Enrichment.create({
      tenant_id, item_id: item.id, input_url: source_url,
      page_meta: draft.page_meta || {},
      suggestion: {
        company_name: draft.company_name, company_url: draft.company_url,
        description: draft.description, category: draft.category, tags: draft.tags,
        needs_review: draft.needs_review, reason: draft.reason
      },
      model: draft.model, is_simulated: draft.is_simulated
    });
  }

  return { item, draft };
}

function payload(item, draft) {
  return {
    success: true,
    saved: true,
    item_id: item.id,
    company_name: item.company_name || null,
    needs_review: item.needs_review,
    is_simulated: item.is_simulated,
    reason: draft ? (draft.reason || null) : null,
    open: `/airadar/?item=${item.id}`,
    message: item.company_name
      ? `Saved: ${item.company_name}`
      : 'Saved to the inbox. Company details still need to be filled in.'
  };
}

router.post('/', async (req, res) => {
  try {
    const user = await userForKey(req);
    if (!user) return res.status(401).json({ error: 'Invalid capture key' });
    const url = req.body.url || req.body.link || req.query.url;
    const text = req.body.text || req.body.caption || req.query.text;
    if (!url && !text) return res.status(400).json({ error: 'url or text required' });
    const wantEnrich = req.body.enrich !== false && req.body.enrich !== '0';
    const { item, draft } = await doCapture(user, { url, text, note: req.body.note, wantEnrich });
    res.status(201).json(payload(item, draft));
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
    const wantEnrich = req.query.enrich !== '0';
    const { item, draft } = await doCapture(user, { url, text, note: req.query.note, wantEnrich });
    if (req.query.redirect === '1') return res.redirect(`/airadar/?item=${item.id}`);
    res.status(201).json(payload(item, draft));
  } catch (e) {
    console.error('AI Radar capture error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
