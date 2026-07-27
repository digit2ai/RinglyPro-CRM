'use strict';

/**
 * AI Radar — the save path. ONE job: get the link into the bucket instantly.
 *
 * Sharing a post must feel like sending it to yourself on WhatsApp: tap, saved,
 * back to scrolling. No form, no waiting on a network fetch, no AI in the way.
 *
 * saveLink() inserts the row and returns immediately. Anything clever happens
 * AFTER the response, in the background: the link is read and the company name
 * / website / description are filled in only if they are still empty, so by the
 * time you come back to the list it has quietly labelled itself. If that fails,
 * nothing is lost — the link is already saved.
 */

const { Item, Enrichment } = require('../models');
const { enrich } = require('./enrich');
const { detectPlatform } = require('./metadata');

/**
 * saveLink({ user, url, text, note }) -> Item (already persisted)
 * Does NOT wait on the network.
 */
async function saveLink({ user, url, text, note }) {
  const tenant_id = user.tenant_id || user.id;
  const source_url = String(url || '').trim().slice(0, 4000);
  const shared_text = String(text || '').trim().slice(0, 8000);

  const item = await Item.create({
    tenant_id,
    user_id: user.id,
    source_url,
    shared_text,
    source_platform: detectPlatform(source_url) || 'web',
    notes: String(note || '').slice(0, 4000),
    status: 'inbox',
    enriched_by: 'manual',
    enrich_status: source_url ? 'pending' : 'none',
    needs_review: true,
    created_at: new Date(), updated_at: new Date()
  });

  if (source_url) enrichLater(item);
  return item;
}

/**
 * Fire-and-forget. Runs after the caller already has its response.
 * Never throws into the request cycle.
 */
function enrichLater(item) {
  setImmediate(async () => {
    try {
      const draft = await enrich({ url: item.source_url, text: item.shared_text || '' });

      const fresh = await Item.findByPk(item.id);
      if (!fresh) return;

      // Only ever fill blanks. Anything the owner typed in the meantime wins.
      if (!fresh.company_name && draft.company_name) fresh.company_name = draft.company_name;
      if (!fresh.company_url && draft.company_url) fresh.company_url = draft.company_url;
      if (!fresh.description && draft.description) fresh.description = draft.description;
      if (!fresh.category && draft.category) fresh.category = draft.category;
      if (!(fresh.tags || []).length && (draft.tags || []).length) fresh.tags = draft.tags;
      if (!fresh.source_title && draft.source_title) fresh.source_title = draft.source_title;
      if (!fresh.thumbnail_url && draft.thumbnail_url) fresh.thumbnail_url = draft.thumbnail_url;

      if (fresh.enriched_by === 'manual') fresh.enriched_by = draft.enriched_by;
      fresh.is_simulated = draft.is_simulated && !!fresh.company_name;
      fresh.needs_review = !fresh.company_name;
      fresh.enrich_status = 'done';
      fresh.updated_at = new Date();
      await fresh.save();

      await Enrichment.create({
        tenant_id: item.tenant_id, item_id: item.id, input_url: item.source_url,
        page_meta: draft.page_meta || {},
        suggestion: {
          company_name: draft.company_name, company_url: draft.company_url,
          description: draft.description, category: draft.category, tags: draft.tags,
          needs_review: draft.needs_review, reason: draft.reason
        },
        model: draft.model, is_simulated: draft.is_simulated
      });
    } catch (e) {
      console.error('AI Radar background enrich error:', e.message);
      try {
        const fresh = await Item.findByPk(item.id);
        if (fresh && fresh.enrich_status === 'pending') {
          fresh.enrich_status = 'failed';
          await fresh.save();
        }
      } catch (e2) { /* the link is saved; that is what matters */ }
    }
  });
}

module.exports = { saveLink, enrichLater };
