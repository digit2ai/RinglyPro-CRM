'use strict';

/**
 * Product Intelligence — which contractor categories are likely to buy a product.
 *
 * The rules pass is deterministic: each tenant category carries keywords; a
 * keyword found in the product's name/category (weight 2) or its description,
 * material and subcategory (weight 1) adds to the evidence, and the score is a
 * saturating curve of that evidence (8 = no evidence, ~98 = overwhelming).
 * The reason string names the words that matched, so a score can be checked.
 *
 * An optional model pass may adjust scores ONLY for categories that exist on
 * the tenant (unknown names are dropped), clamped to 0-100, and each change
 * must carry a reason. A score a person set (source 'manual') is never
 * overwritten by either pass.
 */

const db = require('../db');
const llm = require('../llm');
const { httpError } = require('../util');

function words(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' '); }
function hit(text, kw) {
  const k = kw.trim().toLowerCase(); if (!k) return false;
  return new RegExp('(^|\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es|ing)?(\\s|$)').test(text);
}

function scoreRules(product, categories) {
  const primary = ' ' + words([product.name, product.category].join(' ')) + ' ';
  const secondary = ' ' + words([product.subcategory, product.description, product.material, product.model].join(' ')) + ' ';
  return categories.map((c) => {
    const kws = String(c.keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
    let w = 0; const matched = [];
    for (const k of kws) {
      if (hit(primary, k)) { w += 2; matched.push(k); } else if (hit(secondary, k)) { w += 1; matched.push(k); }
    }
    const score = Math.round(8 + 90 * (1 - Math.exp(-0.45 * w)));
    return { category_id: c.id, category: c.name, relevance_score: score,
      reasoning_summary: matched.length ? `Matched ${matched.slice(0, 6).join(', ')} in the product text` : 'No category keyword appears in the product text' };
  });
}

async function modelAdjust(product, scored) {
  const out = await llm.json({
    system: 'You rate which contractor categories buy a building-material product. Return JSON {"scores":[{"category":"<exact name from the list>","score":0-100,"reason":"<one sentence>"}]}. Use ONLY category names from the list. No prices, no numbers other than scores.',
    user: JSON.stringify({ product: { name: product.name, category: product.category, subcategory: product.subcategory, description: product.description, material: product.material },
      categories: scored.map((s) => ({ category: s.category, rules_score: s.relevance_score })) })
  });
  if (!out || !Array.isArray(out.scores)) return null;
  const byName = new Map(scored.map((s) => [s.category.toLowerCase(), s]));
  let changed = 0;
  for (const m of out.scores) {
    const s = byName.get(String(m.category || '').toLowerCase());
    const v = Number(m.score);
    if (!s || !Number.isFinite(v) || !m.reason) continue; // unknown category or unexplained score: dropped
    s.relevance_score = Math.max(0, Math.min(100, Math.round(v)));
    s.reasoning_summary = String(m.reason).slice(0, 300);
    s.source = 'model'; changed++;
  }
  return changed;
}

async function analyzeProduct(tenantId, productId, { useModel = true } = {}) {
  const product = await db.tone(tenantId, 'SELECT * FROM sup_products WHERE tenant_id = :tenant AND id = :id', { id: Number(productId) });
  if (!product) throw httpError(404, 'Product not found');
  const categories = await db.tq(tenantId, 'SELECT id, name, keywords FROM sup_categories WHERE tenant_id = :tenant AND active ORDER BY id');
  const scored = scoreRules(product, categories).map((s) => Object.assign(s, { source: 'rules' }));
  if (useModel && llm.configured()) await modelAdjust(product, scored);
  for (const s of scored) {
    await db.trun(tenantId, `INSERT INTO sup_product_relevance (tenant_id, product_id, category_id, relevance_score, reasoning_summary, source)
      VALUES (:tenant, :p, :c, :sc, :r, :src)
      ON CONFLICT (product_id, category_id) DO UPDATE SET relevance_score = EXCLUDED.relevance_score, reasoning_summary = EXCLUDED.reasoning_summary,
        source = EXCLUDED.source, updated_at = now()
      WHERE sup_product_relevance.source <> 'manual' AND sup_product_relevance.tenant_id = EXCLUDED.tenant_id`,
    { p: product.id, c: s.category_id, sc: s.relevance_score, r: s.reasoning_summary, src: s.source });
  }
  return relevanceFor(tenantId, product.id);
}

async function relevanceFor(tenantId, productId) {
  return db.tq(tenantId, `SELECT r.*, c.name AS category FROM sup_product_relevance r JOIN sup_categories c ON c.id = r.category_id AND c.tenant_id = r.tenant_id
    WHERE r.tenant_id = :tenant AND r.product_id = :p ORDER BY r.relevance_score DESC`, { p: Number(productId) });
}

async function setManual(tenantId, productId, categoryId, score, reason) {
  const v = Math.max(0, Math.min(100, Math.round(Number(score))));
  if (!Number.isFinite(v)) throw httpError(400, 'Score must be 0-100');
  const cat = await db.tone(tenantId, 'SELECT id FROM sup_categories WHERE tenant_id = :tenant AND id = :id', { id: Number(categoryId) });
  if (!cat) throw httpError(404, 'Category not found');
  await db.trun(tenantId, `INSERT INTO sup_product_relevance (tenant_id, product_id, category_id, relevance_score, reasoning_summary, source)
    VALUES (:tenant, :p, :c, :v, :r, 'manual') ON CONFLICT (product_id, category_id) DO UPDATE SET relevance_score = :v, reasoning_summary = :r, source = 'manual', updated_at = now()`,
  { p: Number(productId), c: cat.id, v, r: String(reason || 'Set by a person').slice(0, 300) });
  return relevanceFor(tenantId, productId);
}

async function analyzeAll(tenantId) {
  const ps = await db.tq(tenantId, 'SELECT id FROM sup_products WHERE tenant_id = :tenant AND active');
  for (const p of ps) await analyzeProduct(tenantId, p.id, { useModel: false });
  return { analyzed: ps.length };
}

module.exports = { scoreRules, analyzeProduct, analyzeAll, relevanceFor, setManual };
