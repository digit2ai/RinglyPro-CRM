'use strict';

/**
 * AI Radar — items API. Every query is scoped to req.user.tenant_id.
 *
 * GET    /api/v1/items                 list + search + filter
 * POST   /api/v1/items                 create (optionally auto-enrich from a link)
 * GET    /api/v1/items/stats           counts for the dashboard chips
 * GET    /api/v1/items/export          csv | json | md
 * GET    /api/v1/items/:id
 * PATCH  /api/v1/items/:id
 * DELETE /api/v1/items/:id
 * POST   /api/v1/items/:id/enrich      re-run the AI draft on an existing item
 * POST   /api/v1/enrich                draft from a link WITHOUT saving anything
 */

const express = require('express');
const { Op, fn, col } = require('sequelize');
const router = express.Router();
const { Item, Enrichment } = require('../models');
const { enrich, CATEGORIES } = require('../services/enrich');
const { enrichLater } = require('../services/save');
const { detectPlatform } = require('../services/metadata');

const STATUSES = ['inbox', 'saved', 'archived'];

function ctx(req) {
  return { tenant_id: req.user.tenant_id || req.user.id, user_id: req.user.id };
}

function cleanTags(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(t => String(t).toLowerCase().trim().slice(0, 40)).slice(0, 12);
  if (typeof v === 'string') return cleanTags(v.split(','));
  return [];
}

function shape(body) {
  const out = {};
  const strs = ['company_name', 'company_url', 'description', 'source_url', 'source_platform',
    'source_title', 'shared_text', 'category', 'status', 'notes', 'thumbnail_url'];
  for (const k of strs) if (body[k] !== undefined) out[k] = body[k] === null ? null : String(body[k]).slice(0, 8000);
  if (body.tags !== undefined) out.tags = cleanTags(body.tags);
  if (body.rating !== undefined) out.rating = Math.max(0, Math.min(5, parseInt(body.rating, 10) || 0));
  if (body.needs_review !== undefined) out.needs_review = Boolean(body.needs_review);
  if (out.status && !STATUSES.includes(out.status)) delete out.status;
  if (out.category && !CATEGORIES.includes(out.category)) out.category = 'other';
  return out;
}

// ── List / search / filter ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { tenant_id } = ctx(req);
    const where = { tenant_id };

    if (req.query.status && STATUSES.includes(req.query.status)) where.status = req.query.status;
    if (req.query.category) where.category = String(req.query.category);
    if (req.query.platform) where.source_platform = String(req.query.platform);
    if (req.query.needs_review === '1') where.needs_review = true;

    const q = String(req.query.q || '').trim();
    if (q) {
      const like = { [Op.iLike]: `%${q}%` };
      where[Op.or] = [
        { company_name: like }, { company_url: like }, { description: like },
        { notes: like }, { source_url: like }, { source_title: like }
      ];
    }

    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    const items = await Item.findAll({ where, order: [['created_at', 'DESC']], limit, offset });

    // Tag filter applied in JS (JSONB array; keeps the query portable).
    const tag = String(req.query.tag || '').toLowerCase().trim();
    const filtered = tag ? items.filter(i => (i.tags || []).includes(tag)) : items;

    res.json({ success: true, count: filtered.length, items: filtered });
  } catch (e) {
    console.error('AI Radar list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard counts ─────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { tenant_id } = ctx(req);
    const [total, inbox, saved, archived, review] = await Promise.all([
      Item.count({ where: { tenant_id } }),
      Item.count({ where: { tenant_id, status: 'inbox' } }),
      Item.count({ where: { tenant_id, status: 'saved' } }),
      Item.count({ where: { tenant_id, status: 'archived' } }),
      Item.count({ where: { tenant_id, needs_review: true } })
    ]);
    const byCategory = await Item.findAll({
      where: { tenant_id },
      attributes: ['category', [fn('COUNT', col('id')), 'n']],
      group: ['category'], raw: true
    });
    const byPlatform = await Item.findAll({
      where: { tenant_id },
      attributes: ['source_platform', [fn('COUNT', col('id')), 'n']],
      group: ['source_platform'], raw: true
    });
    res.json({
      success: true,
      total, inbox, saved, archived, needs_review: review,
      by_category: byCategory.map(r => ({ category: r.category || 'other', n: Number(r.n) })),
      by_platform: byPlatform.map(r => ({ platform: r.source_platform || 'web', n: Number(r.n) }))
    });
  } catch (e) {
    console.error('AI Radar stats error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Export ───────────────────────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const { tenant_id } = ctx(req);
    const where = { tenant_id };
    if (req.query.status && STATUSES.includes(req.query.status)) where.status = req.query.status;
    const items = await Item.findAll({ where, order: [['created_at', 'DESC']] });
    const stamp = new Date().toISOString().slice(0, 10);
    const format = String(req.query.format || 'csv').toLowerCase();

    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="ai-radar-${stamp}.json"`);
      return res.json({ exported_at: new Date().toISOString(), count: items.length, items });
    }

    if (format === 'md') {
      const md = [`# AI Radar — ${items.length} discoveries`, `Exported ${stamp}`, '']
        .concat(items.map(i => [
          `## ${i.company_name || '(company not identified)'}`,
          i.company_url ? `Website: ${i.company_url}` : 'Website: (unknown)',
          i.description ? `\n${i.description}\n` : '',
          `- Source: ${i.source_url || '(none)'} (${i.source_platform || 'web'})`,
          `- Category: ${i.category || 'other'}${(i.tags || []).length ? ' · Tags: ' + i.tags.join(', ') : ''}`,
          `- Status: ${i.status}${i.rating ? ' · Rating: ' + i.rating + '/5' : ''}`,
          i.notes ? `- Notes: ${i.notes}` : '',
          i.is_simulated ? '- Draft generated without a language model; fields may be incomplete.' : '',
          `- Captured: ${new Date(i.created_at).toISOString().slice(0, 10)}`,
          ''
        ].filter(Boolean).join('\n'))).join('\n');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ai-radar-${stamp}.md"`);
      return res.send(md);
    }

    const cols = ['company_name', 'company_url', 'description', 'category', 'tags', 'source_url',
      'source_platform', 'status', 'rating', 'notes', 'needs_review', 'enriched_by', 'created_at'];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = Array.isArray(v) ? v.join(' ') : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [cols.join(',')]
      .concat(items.map(i => cols.map(c => esc(i[c])).join(',')))
      .join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ai-radar-${stamp}.csv"`);
    return res.send('﻿' + csv); // BOM so Excel reads UTF-8
  } catch (e) {
    console.error('AI Radar export error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Create ───────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { tenant_id, user_id } = ctx(req);
    const body = shape(req.body || {});
    const autoEnrich = req.body.auto_enrich === true || req.body.auto_enrich === '1';

    if (!body.source_url && !body.company_name) {
      return res.status(400).json({ error: 'A source link or a company name is required' });
    }
    if (body.source_url && !body.source_platform) body.source_platform = detectPlatform(body.source_url) || 'web';

    let draft = null;
    if (autoEnrich && body.source_url) {
      draft = await enrich({ url: body.source_url, text: body.shared_text || req.body.text || '' });
      // The user's own typed values always win over the AI draft.
      body.company_name = body.company_name || draft.company_name;
      body.company_url = body.company_url || draft.company_url;
      body.description = body.description || draft.description;
      body.category = body.category || draft.category;
      body.source_title = body.source_title || draft.source_title;
      body.thumbnail_url = body.thumbnail_url || draft.thumbnail_url;
      body.source_platform = body.source_platform || draft.source_platform;
      if (!body.tags || !body.tags.length) body.tags = draft.tags;
      body.enriched_by = draft.enriched_by;
      body.is_simulated = draft.is_simulated;
      body.needs_review = draft.needs_review || !body.company_name;
    }

    // An item with no company on it is, by definition, still unfinished.
    if (body.needs_review === undefined) body.needs_review = !body.company_name;

    // Pasting a bare link is the same act as sharing one: save now, label later.
    const labelLater = !draft && body.source_url && !body.company_name;
    if (labelLater) body.enrich_status = 'pending';

    const item = await Item.create({
      tenant_id, user_id,
      status: body.status || 'inbox',
      ...body,
      created_at: new Date(), updated_at: new Date()
    });
    if (labelLater) enrichLater(item);

    if (draft) {
      await Enrichment.create({
        tenant_id, item_id: item.id, input_url: body.source_url,
        page_meta: draft.page_meta || {}, suggestion: {
          company_name: draft.company_name, company_url: draft.company_url,
          description: draft.description, category: draft.category, tags: draft.tags,
          needs_review: draft.needs_review, reason: draft.reason
        },
        model: draft.model, is_simulated: draft.is_simulated
      });
    }

    res.status(201).json({ success: true, item, enrichment: draft ? summarizeDraft(draft) : null });
  } catch (e) {
    console.error('AI Radar create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Draft only (nothing saved) ───────────────────────────────────────────────
// Mounted at /api/v1/enrich by index.js as well as /api/v1/items/enrich.
router.post('/enrich', async (req, res) => {
  try {
    const url = String(req.body.url || '').trim();
    const text = String(req.body.text || '').trim();
    if (!url && !text) return res.status(400).json({ error: 'url or text required' });
    const draft = await enrich({ url, text });
    res.json({ success: true, draft });
  } catch (e) {
    console.error('AI Radar enrich error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Read one ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { tenant_id } = ctx(req);
    const item = await Item.findOne({ where: { id: req.params.id, tenant_id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    const enrichments = await Enrichment.findAll({
      where: { tenant_id, item_id: item.id }, order: [['created_at', 'DESC']], limit: 5
    });
    res.json({ success: true, item, enrichments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update ───────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { tenant_id } = ctx(req);
    const item = await Item.findOne({ where: { id: req.params.id, tenant_id } });
    if (!item) return res.status(404).json({ error: 'Not found' });

    const body = shape(req.body || {});
    // Touching the three core fields by hand means a human vouched for them.
    const manualTouch = ['company_name', 'company_url', 'description'].some(k => body[k] !== undefined);
    Object.assign(item, body);
    if (manualTouch) {
      item.enriched_by = 'manual';
      item.is_simulated = false;
      if (req.body.needs_review === undefined) item.needs_review = false;
    }
    item.updated_at = new Date();
    await item.save();
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Re-enrich an existing item ───────────────────────────────────────────────
router.post('/:id/enrich', async (req, res) => {
  try {
    const { tenant_id } = ctx(req);
    const item = await Item.findOne({ where: { id: req.params.id, tenant_id } });
    if (!item) return res.status(404).json({ error: 'Not found' });

    const url = String(req.body.url || item.company_url || item.source_url || '').trim();
    const text = String(req.body.text || item.shared_text || item.notes || '').trim();
    if (!url && !text) return res.status(400).json({ error: 'Nothing to enrich from' });

    const draft = await enrich({ url, text });
    await Enrichment.create({
      tenant_id, item_id: item.id, input_url: url,
      page_meta: draft.page_meta || {},
      suggestion: {
        company_name: draft.company_name, company_url: draft.company_url,
        description: draft.description, category: draft.category, tags: draft.tags,
        needs_review: draft.needs_review, reason: draft.reason
      },
      model: draft.model, is_simulated: draft.is_simulated
    });

    // apply=1 writes the draft into empty fields only; never overwrites the owner's text.
    if (req.body.apply === true || req.body.apply === '1') {
      if (!item.company_name && draft.company_name) item.company_name = draft.company_name;
      if (!item.company_url && draft.company_url) item.company_url = draft.company_url;
      if (!item.description && draft.description) item.description = draft.description;
      if (!item.category && draft.category) item.category = draft.category;
      if (!(item.tags || []).length && draft.tags.length) item.tags = draft.tags;
      if (!item.thumbnail_url && draft.thumbnail_url) item.thumbnail_url = draft.thumbnail_url;
      item.enriched_by = draft.enriched_by;
      item.is_simulated = draft.is_simulated;
      item.needs_review = !item.company_name;
      item.updated_at = new Date();
      await item.save();
    }

    res.json({ success: true, item, draft: summarizeDraft(draft) });
  } catch (e) {
    console.error('AI Radar re-enrich error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { tenant_id } = ctx(req);
    const item = await Item.findOne({ where: { id: req.params.id, tenant_id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    await Enrichment.destroy({ where: { tenant_id, item_id: item.id } });
    await item.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function summarizeDraft(d) {
  return {
    company_name: d.company_name, company_url: d.company_url, description: d.description,
    category: d.category, tags: d.tags, source_platform: d.source_platform,
    source_title: d.source_title, thumbnail_url: d.thumbnail_url,
    enriched_by: d.enriched_by, is_simulated: d.is_simulated,
    needs_review: d.needs_review, reason: d.reason || null, model: d.model,
    page_fetched: !!(d.page_meta && d.page_meta.ok),
    second_hop: (d.page_meta && d.page_meta.second_hop) || null
  };
}

module.exports = router;
module.exports.summarizeDraft = summarizeDraft;
