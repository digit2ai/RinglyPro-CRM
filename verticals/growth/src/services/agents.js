'use strict';

/**
 * Digit2AI Growth — the agent fleet (the "AI CMO" for our own portfolio).
 *
 * Each agent takes a brand and returns one draft descriptor. NOTHING publishes:
 * every output is persisted as a `gr_drafts` row with status 'draft' for the
 * owner to review, edit, and post. When ANTHROPIC_API_KEY is absent, each agent
 * falls back to a labeled heuristic (is_simulated:true) so the tool always runs.
 *
 * runBrand() fans all (or a subset of) agents over a brand, records a gr_run,
 * and respects GROWTH_COST_CAP_USD so a single fan-out can't run away on tokens.
 */

const { Brand, Draft, Run } = require('../models');
const { callClaude, extractJson } = require('./ai');

const COST_CAP = parseFloat(process.env.GROWTH_COST_CAP_USD || '2.0');

function brandContext(b) {
  return [
    `Product: ${b.name}`,
    b.url ? `URL: ${b.url}` : '',
    b.tagline ? `Tagline: ${b.tagline}` : '',
    b.positioning ? `Positioning: ${b.positioning}` : '',
    b.icp ? `Ideal customer: ${b.icp}` : '',
    b.voice ? `Brand voice: ${b.voice}` : '',
    (b.keywords && b.keywords.length) ? `Target keywords: ${b.keywords.join(', ')}` : ''
  ].filter(Boolean).join('\n');
}

// ── Individual agents ───────────────────────────────────────────────────────
// Each returns { channel, kind, title, body, meta, is_simulated, cost_usd }.

async function seoAudit(b) {
  const sys = 'You are an SEO strategist. Return ONLY JSON: {"opportunities":[{"keyword":"","intent":"","why":""}],"title":"suggested blog post title","outline":["h2","h2","h2"]}. 4-6 opportunities, concrete and specific to the product.';
  const r = await callClaude(sys, brandContext(b), 900);
  const j = r.text && extractJson(r.text);
  if (j) {
    return {
      channel: 'seo', kind: 'audit',
      title: `SEO opportunities: ${b.name}`,
      body: j.title ? `Suggested post: ${j.title}\n\nOutline:\n- ${(j.outline || []).join('\n- ')}` : '',
      meta: { opportunities: j.opportunities || [], suggested_title: j.title, outline: j.outline || [] },
      is_simulated: false, cost_usd: r.cost_usd
    };
  }
  // Heuristic fallback: derive opportunities from the brand's own keywords.
  const opps = (b.keywords || []).slice(0, 5).map(k => ({
    keyword: k, intent: 'informational', why: `Core term for ${b.name}; likely low-competition long-tail variants exist.`
  }));
  return {
    channel: 'seo', kind: 'audit',
    title: `SEO opportunities: ${b.name} (heuristic)`,
    body: `Target these keywords with a comparison/how-to post:\n- ${(b.keywords || []).join('\n- ')}`,
    meta: { opportunities: opps }, is_simulated: true, cost_usd: 0
  };
}

async function contentDraft(b) {
  const sys = `You are a content marketer. Write a tight 250-350 word blog intro + section headers for ${b.name}, in the brand voice. No emojis. Return ONLY JSON: {"title":"","body":"markdown"}.`;
  const r = await callClaude(sys, brandContext(b), 1200);
  const j = r.text && extractJson(r.text);
  if (j) {
    return { channel: 'content', kind: 'article', title: j.title || `${b.name}: article`, body: j.body || '', meta: {}, is_simulated: false, cost_usd: r.cost_usd };
  }
  return {
    channel: 'content', kind: 'article',
    title: `${b.name}: ${b.tagline || 'article draft'} (heuristic)`,
    body: `# ${b.name}\n\n${b.positioning || ''}\n\n## Who it's for\n${b.icp || ''}\n\n## Why now\n(Draft this section — no LLM key configured.)`,
    meta: {}, is_simulated: true, cost_usd: 0
  };
}

async function socialX(b) {
  const sys = `Write 3 distinct X (Twitter) posts for ${b.name} in the brand voice. Under 280 chars each, no hashtags spam, no emojis. Return ONLY JSON: {"posts":["","",""]}.`;
  const r = await callClaude(sys, brandContext(b), 700);
  const j = r.text && extractJson(r.text);
  if (j && Array.isArray(j.posts)) {
    return { channel: 'x', kind: 'post', title: `${b.name}: X posts`, body: j.posts.join('\n\n---\n\n'), meta: { posts: j.posts }, is_simulated: false, cost_usd: r.cost_usd };
  }
  return {
    channel: 'x', kind: 'post', title: `${b.name}: X post (heuristic)`,
    body: `${b.tagline || b.name}. ${b.url || ''}`.trim(),
    meta: {}, is_simulated: true, cost_usd: 0
  };
}

async function socialLinkedIn(b) {
  const sys = `Write one professional LinkedIn post for ${b.name} in the brand voice. 120-180 words, a strong first line, one clear CTA, no emojis. Return ONLY JSON: {"body":""}.`;
  const r = await callClaude(sys, brandContext(b), 800);
  const j = r.text && extractJson(r.text);
  if (j && j.body) {
    return { channel: 'linkedin', kind: 'post', title: `${b.name}: LinkedIn post`, body: j.body, meta: {}, is_simulated: false, cost_usd: r.cost_usd };
  }
  return {
    channel: 'linkedin', kind: 'post', title: `${b.name}: LinkedIn post (heuristic)`,
    body: `${b.positioning || b.tagline || b.name}\n\nLearn more: ${b.url || ''}`,
    meta: {}, is_simulated: true, cost_usd: 0
  };
}

async function geoMonitor(b) {
  // GEO = get cited by AI answer engines. We ask the model how it would describe
  // the brand, then flag gaps to fix on the site (the review-and-improve loop).
  const sys = `You are a GEO (generative engine optimization) analyst. Describe how an AI assistant would currently summarize ${b.name} to a user, then list 3 concrete facts/pages the product should publish so AI engines cite it accurately. Return ONLY JSON: {"current_summary":"","gaps":["","",""]}.`;
  const r = await callClaude(sys, brandContext(b), 800);
  const j = r.text && extractJson(r.text);
  if (j) {
    return {
      channel: 'geo', kind: 'monitor',
      title: `GEO check: ${b.name}`,
      body: `How AI describes it:\n${j.current_summary || ''}\n\nPublish to improve citations:\n- ${(j.gaps || []).join('\n- ')}`,
      meta: { current_summary: j.current_summary, gaps: j.gaps || [] },
      is_simulated: false, cost_usd: r.cost_usd
    };
  }
  return {
    channel: 'geo', kind: 'monitor',
    title: `GEO check: ${b.name} (heuristic)`,
    body: `Ensure a crisp "What is ${b.name}" page, a facts/FAQ block, and clear who-it's-for copy so AI engines cite the product accurately.`,
    meta: {}, is_simulated: true, cost_usd: 0
  };
}

const AGENTS = {
  'seo.audit': seoAudit,
  'content.draft': contentDraft,
  'social.x': socialX,
  'social.linkedin': socialLinkedIn,
  'geo.monitor': geoMonitor
};

const ALL_AGENTS = Object.keys(AGENTS);

/**
 * Fan a set of agents over one brand. Persists each output as a draft, records a
 * run, and stops early if the cost cap is hit. `trigger` = 'manual' | 'scheduled'.
 */
async function runBrand(brandId, ownerId, { agents = ALL_AGENTS, trigger = 'manual' } = {}) {
  const brand = await Brand.findOne({ where: { id: brandId, owner_id: ownerId } });
  if (!brand) throw new Error('Brand not found');

  const run = await Run.create({ owner_id: ownerId, brand_id: brandId, trigger, agents });
  let cost = 0, created = 0, errored = 0;

  for (const name of agents) {
    const fn = AGENTS[name];
    if (!fn) continue;
    if (cost >= COST_CAP) break; // cost guard
    try {
      const out = await fn(brand);
      cost += out.cost_usd || 0;
      await Draft.create({
        owner_id: ownerId, brand_id: brandId, agent: name,
        channel: out.channel, kind: out.kind, title: out.title, body: out.body,
        meta: out.meta || {}, is_simulated: !!out.is_simulated, run_id: run.id
      });
      created++;
    } catch (e) {
      errored++;
    }
  }

  await run.update({
    drafts_created: created, cost_usd: cost,
    status: errored === 0 ? 'ok' : (created > 0 ? 'partial' : 'error')
  });
  return { run_id: run.id, drafts_created: created, cost_usd: cost, errored };
}

module.exports = { AGENTS, ALL_AGENTS, runBrand, runAgent: (name, brand) => AGENTS[name](brand) };
