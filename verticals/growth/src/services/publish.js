'use strict';

/**
 * Digit2AI Growth — publish a draft to the brand's blog.
 *
 * Turns an approved SEO/Contenido draft into a live gr_posts row, rendered as
 * crawlable HTML at https://<brand host>/blog/<slug>. Marks the source draft
 * 'published'. Only SEO/content drafts are publishable (X/LinkedIn go to social;
 * GEO items are site to-dos, not posts).
 */

const { Brand, Draft, Post } = require('../models');
const { markdownToHtml, slugify, excerpt } = require('./render');

const PUBLISHABLE = ['seo', 'content'];

function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return null; }
}

async function uniqueSlug(brandId, base) {
  let slug = base, n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Post.findOne({ where: { brand_id: brandId, slug } })) { n++; slug = `${base}-${n}`; }
  return slug;
}

async function publishDraft(draftId, ownerId) {
  const draft = await Draft.findOne({ where: { id: draftId, owner_id: ownerId } });
  if (!draft) throw new Error('Draft not found');
  if (!PUBLISHABLE.includes(draft.channel)) {
    throw new Error(`Solo se pueden publicar al blog borradores de SEO o Contenido (este es ${draft.channel}).`);
  }
  const brand = await Brand.findOne({ where: { id: draft.brand_id, owner_id: ownerId } });
  if (!brand) throw new Error('Brand not found');

  const title = (draft.title || `${brand.name} post`).replace(/\s*\(heuristico\)\s*$/i, '').trim();
  const slug = await uniqueSlug(brand.id, slugify(title));
  const md = draft.body || '';
  const post = await Post.create({
    owner_id: ownerId, brand_id: brand.id, slug, title,
    meta_description: excerpt(md), html: markdownToHtml(md), source_markdown: md,
    keywords: brand.keywords || [], status: 'published', draft_id: draft.id, published_at: new Date()
  });
  await draft.update({ status: 'published' });

  const host = hostOf(brand.url) || 'aiagent.ringlypro.com';
  const url = `https://${host}/blog/${slug}`;
  return { url, slug, post_id: post.id };
}

module.exports = { publishDraft, hostOf, PUBLISHABLE };
