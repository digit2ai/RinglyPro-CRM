'use strict';

/**
 * AI Radar — auto-enrich brain.
 *
 * Input : a shared link (+ whatever caption text the share sheet handed over).
 * Output: a DRAFT of { company_name, company_url, description, category, tags }.
 *
 * Honesty rules, enforced in code and in the prompt:
 *  - We never invent a company name or a website. If the only evidence is an
 *    Instagram reel with a login wall, the draft comes back empty with
 *    needs_review:true and the reason stated.
 *  - A company_url is only proposed when it appears in the evidence (the page
 *    itself, its canonical link, or a URL in the shared caption) — never guessed
 *    from a product name.
 *  - With no ANTHROPIC_API_KEY the heuristic path runs and every result is
 *    labelled is_simulated:true / enriched_by:'heuristic'.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { fetchMetadata, fetchOembed, detectPlatform, isSocial, safeHost, urlsInText, fetchable } = require('./metadata');

const MODEL = process.env.AIRADAR_MODEL || 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

const CATEGORIES = [
  'agents', 'voice', 'video', 'image', 'coding', 'writing', 'productivity',
  'data', 'search', 'infra', 'robotics', 'health', 'finance', 'marketing',
  'sales', 'legal', 'education', 'hardware', 'other'
];

function activeModel() { return anthropic ? MODEL : 'heuristic-fallback'; }

// Hosts that are never a company's own website.
const NOT_A_COMPANY_SITE = /(^|\.)(instagram\.com|facebook\.com|fb\.watch|tiktok\.com|x\.com|twitter\.com|t\.co|youtube\.com|youtu\.be|linkedin\.com|reddit\.com|redd\.it|threads\.net|threads\.com|medium\.com|substack\.com|news\.ycombinator\.com|google\.com|bing\.com)$/i;

function titleCaseHost(host) {
  if (!host) return null;
  const core = String(host).replace(/^www\./i, '').split('.')[0].replace(/[-_]+/g, ' ');
  return core.replace(/\b\w/g, (c) => c.toUpperCase()).trim() || null;
}

/**
 * enrich({ url, text }) -> {
 *   company_name, company_url, description, category, tags[],
 *   source_platform, source_title, thumbnail_url,
 *   enriched_by, is_simulated, needs_review, reason, page_meta, model
 * }
 * Never throws.
 */
async function enrich({ url, text } = {}) {
  const source_url = String(url || '').trim();
  const shared_text = String(text || '').trim();
  const source_platform = detectPlatform(source_url) || 'web';

  let meta = scrubSocialNoise(
    source_url ? await fetchMetadata(source_url) : { ok: false, blocked: true, error: 'no_url', platform: source_platform },
    source_platform
  );

  // Login wall, but the platform publishes a keyless oEmbed (TikTok, YouTube,
  // Vimeo)? Take the real title and author from there.
  if (!meta.ok && source_url) {
    const oe = await fetchOembed(source_url);
    if (oe) {
      meta = {
        ...meta, ok: true,
        title: oe.title,
        description: meta.description || (oe.author ? `Posted by ${oe.author}.` : null),
        site_name: meta.site_name || oe.provider,
        image: meta.image || oe.thumbnail
      };
    }
  }

  // Any candidate company site: the shared link itself (when it is not a social
  // host), its canonical, or a link inside the caption. Evidence only.
  const candidates = [];
  const host = safeHost(source_url);
  const usable = (u) => {
    const h = safeHost(u);
    // A company website must be a public host that is not a social platform.
    return h && !NOT_A_COMPANY_SITE.test(h) && fetchable(u);
  };
  if (usable(source_url)) candidates.push(originOf(source_url));
  if (meta.canonical && usable(meta.canonical)) candidates.push(originOf(meta.canonical));
  for (const u of urlsInText(shared_text)) if (usable(u)) candidates.push(originOf(u));
  const candidateSites = [...new Set(candidates.filter(Boolean))].slice(0, 5);
  const companyHost = usable(source_url) ? host : null;

  // SECOND HOP. The shared page told us nothing — a login-walled reel, or a
  // sponsored post — but the caption carried the advertiser's own link. Read
  // THAT page instead: it is the thing actually worth cataloguing. The reel
  // stays the source_url, so provenance is not lost.
  let second_hop = null;
  let meta2 = null;
  if (!meta.ok && candidateSites.length) {
    const m2 = await fetchMetadata(candidateSites[0]);
    if (m2.ok) { meta2 = m2; second_hop = candidateSites[0]; }
  }
  const evidence = meta2
    ? { ...meta, ok: true, title: meta2.title, description: meta2.description,
        site_name: meta2.site_name, canonical: meta2.canonical || meta.canonical }
    : meta;

  const evidenceThin = !evidence.ok && !shared_text && candidateSites.length === 0;

  const base = {
    source_url,
    source_platform,
    source_title: meta.title || (meta2 && meta2.title) || null,
    thumbnail_url: meta.image || (meta2 && meta2.image) || null,
    page_meta: {
      ok: !!evidence.ok, status: meta.status || null, blocked: !!meta.blocked, error: meta.error || null,
      title: evidence.title || null, description: evidence.description || null,
      site_name: evidence.site_name || null, canonical: evidence.canonical || null,
      second_hop
    },
    model: activeModel()
  };

  // Nothing to work from — say so instead of guessing.
  if (evidenceThin) {
    return {
      ...base,
      company_name: '', company_url: '', description: '', category: '', tags: [],
      enriched_by: anthropic ? 'model' : 'heuristic',
      is_simulated: !anthropic,
      needs_review: true,
      reason: reasonFor(meta, source_platform)
    };
  }

  if (!anthropic) return { ...base, ...heuristic({ meta: evidence, shared_text, source_platform, candidateSites, host: companyHost, second_hop }) };

  try {
    const out = await askClaude({ source_url, shared_text, meta: evidence, source_platform, candidateSites, second_hop });
    return { ...base, ...out, enriched_by: 'model', is_simulated: false };
  } catch (e) {
    console.error('AI Radar enrich error:', e.message);
    const h = heuristic({ meta: evidence, shared_text, source_platform, candidateSites, host: companyHost, second_hop });
    return { ...base, ...h, reason: h.reason || ('model unavailable: ' + e.message) };
  }
}

function originOf(u) {
  try { return new URL(String(u)).origin; } catch (e) { return null; }
}

// A login-walled reel answers with its own brand name as the whole page title
// ("Instagram", "TikTok - Make Your Day"). That is not evidence about anything;
// drop it so the draft reports an honest blank instead of a platform name.
const PLATFORM_NOISE = /^(instagram|facebook|meta|tiktok|x|twitter|youtube|linkedin|threads|reddit)\b[\s\-|·:]*(make your day|watch|log in|login|sign up)?[\s.!]*$/i;

function scrubSocialNoise(meta, platform) {
  if (!isSocial(platform)) return meta;
  const out = { ...meta };
  for (const k of ['title', 'description', 'site_name']) {
    const v = out[k];
    if (v && (PLATFORM_NOISE.test(v.trim()) || v.trim().length < 3)) out[k] = null;
  }
  out.ok = Boolean(out.title || out.description);
  out.blocked = !out.ok;
  return out;
}

function reasonFor(meta, platform) {
  if (meta.error === 'no_url') return 'No link supplied.';
  if (isSocial(platform)) {
    return `${platform} did not return public page details to the server (login wall). ` +
      'Paste the caption or the company site and enrich again, or fill the fields in yourself.';
  }
  if (meta.error === 'timeout') return 'The page took too long to answer.';
  if (meta.error) return 'Could not read the page (' + meta.error + ').';
  return 'The page returned no usable title or description.';
}

// ── Model path ───────────────────────────────────────────────────────────────
async function askClaude({ source_url, shared_text, meta, source_platform, candidateSites, second_hop }) {
  const system =
    'You catalogue AI products that someone spotted on social media. ' +
    'You work ONLY from the evidence given. Never invent a company name, and never invent or guess a URL — ' +
    'a company_url may only be one of the candidate_sites listed, or empty. ' +
    'If the evidence does not identify a real company or product, return empty strings and needs_review true. ' +
    'Reply with ONLY a JSON object, no prose, no emojis.';

  const user =
    'Evidence:\n' +
    JSON.stringify({
      shared_link: source_url,
      platform: source_platform,
      // When metadata_read_from is set, the title/description below came from
      // that company site, NOT from the shared post.
      metadata_read_from: second_hop || (source_url || null),
      page_title: meta.title || null,
      page_description: meta.description || null,
      page_site_name: meta.site_name || null,
      caption_or_note: shared_text || null,
      candidate_sites: candidateSites
    }, null, 2) +
    '\n\nReturn exactly this shape:\n' +
    '{\n' +
    '  "company_name": "the company or product behind the AI feature, or \\"\\" if not identifiable",\n' +
    '  "company_url": "one of candidate_sites, or \\"\\" if none is the company site",\n' +
    '  "description": "2-3 plain sentences: what the AI does and why it matters. \\"\\" if unknown",\n' +
    `  "category": "one of: ${CATEGORIES.join(', ')}",\n` +
    '  "tags": ["3-6 short lowercase keywords"],\n' +
    '  "needs_review": true if you were unable to identify the company from the evidence,\n' +
    '  "reason": "one short sentence, only when needs_review is true"\n' +
    '}';

  const resp = await anthropic.messages.create({
    model: MODEL, max_tokens: 900, system,
    messages: [{ role: 'user', content: user }]
  });
  const raw = (resp.content || []).map(b => b.text || '').join('').trim();
  const p = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));

  const company_url = candidateSites.includes(String(p.company_url || '').replace(/\/+$/, ''))
    ? String(p.company_url).replace(/\/+$/, '')
    : (candidateSites.includes(String(p.company_url || '')) ? String(p.company_url) : '');

  const company_name = String(p.company_name || '').trim().slice(0, 160);
  const description = String(p.description || '').trim().slice(0, 2000);
  const needs_review = Boolean(p.needs_review) || !company_name;

  return {
    company_name,
    company_url,
    description,
    category: CATEGORIES.includes(String(p.category)) ? p.category : 'other',
    tags: Array.isArray(p.tags) ? p.tags.filter(Boolean).map(t => String(t).toLowerCase().slice(0, 40)).slice(0, 8) : [],
    needs_review,
    reason: needs_review ? (String(p.reason || '').slice(0, 300) || 'Company not identifiable from the shared link.') : null
  };
}

// ── Zero-key heuristic path (always labelled) ────────────────────────────────
const CATEGORY_CUES = [
  [/\b(agent|agentic|autonomous|copilot|assistant)\b/i, 'agents'],
  [/\b(voice|speech|tts|stt|audio|call|podcast)\b/i, 'voice'],
  [/\b(video|film|animation|reel|avatar|lipsync)\b/i, 'video'],
  [/\b(image|photo|design|render|diffusion|logo)\b/i, 'image'],
  [/\b(code|coding|developer|ide|repo|debug|sdk)\b/i, 'coding'],
  [/\b(write|writing|copy|blog|essay|editor)\b/i, 'writing'],
  [/\b(robot|drone|humanoid|arm|embodied)\b/i, 'robotics'],
  [/\b(health|clinic|patient|medical|surgeon|diagnos)\b/i, 'health'],
  [/\b(finance|invoice|accounting|trading|payment|bank)\b/i, 'finance'],
  [/\b(marketing|seo|ads|campaign|brand|content)\b/i, 'marketing'],
  [/\b(sales|crm|lead|prospect|outreach)\b/i, 'sales'],
  [/\b(legal|contract|compliance|law)\b/i, 'legal'],
  [/\b(search|rag|retrieval|index|knowledge)\b/i, 'search'],
  [/\b(data|analytics|dashboard|etl|warehouse)\b/i, 'data'],
  [/\b(gpu|infra|inference|hosting|cluster|deploy)\b/i, 'infra'],
  [/\b(course|learn|tutor|student|school)\b/i, 'education'],
  [/\b(chip|device|glasses|wearable|hardware)\b/i, 'hardware'],
  [/\b(workflow|automation|productivity|calendar|notes)\b/i, 'productivity']
];

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was',
  'new', 'now', 'how', 'why', 'what', 'all', 'can', 'has', 'its', 'our', 'out', 'get', 'more', 'has']);

function heuristic({ meta, shared_text, source_platform, candidateSites, host, second_hop }) {
  const blob = [meta.title, meta.description, meta.site_name, shared_text].filter(Boolean).join(' ');

  let company_name = '';
  // With a second hop the site name describes the company site, not the reel.
  if (meta.site_name && (second_hop || !isSocial(source_platform))) company_name = meta.site_name.slice(0, 160);
  else if (candidateSites.length) company_name = titleCaseHost(safeHost(candidateSites[0])) || '';
  else if (!isSocial(source_platform) && host) company_name = titleCaseHost(host) || '';

  let category = 'other';
  for (const [re, c] of CATEGORY_CUES) { if (re.test(blob)) { category = c; break; } }

  const tags = [...new Set(
    (blob.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) || [])
      .filter(w => w.length > 3 && !STOP.has(w))
  )].slice(0, 5);

  const description = (meta.description || shared_text || meta.title || '').trim().slice(0, 600);
  const needs_review = !company_name || !description;

  return {
    company_name,
    company_url: candidateSites[0] || '',
    description,
    category,
    tags,
    enriched_by: 'heuristic',
    is_simulated: true,
    needs_review,
    reason: needs_review
      ? 'Drafted without a language model (no ANTHROPIC_API_KEY): fields taken straight from the page metadata. Review before saving.'
      : 'Drafted without a language model (no ANTHROPIC_API_KEY) from the page metadata.'
  };
}

module.exports = { enrich, activeModel, CATEGORIES };
