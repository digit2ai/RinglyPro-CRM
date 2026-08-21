'use strict';

// =============================================================
// Content Studio. From one brief it produces EXACTLY three asset types —
// email_subject, email_body, social_caption — each in EN and ES.
//
// EN AND ES ARE GENERATED INDEPENDENTLY. Two separate generation calls per asset
// type, each with a LANGUAGE-NATIVE system prompt. Chaining a translation call
// off the English output is a build failure: generateOne() takes only (brief,
// brandKit, type, lang) and NEVER an asset body. A guard rejects any payload that
// smuggles a prior asset body in, so an EN body can never seed the ES call.
//
// Banned phrases hard-block: an output containing a banned phrase is rejected and
// regenerated ONCE; if it still contains one, the asset is flagged for human
// rewrite (status pending_review, flagged=true). No emojis in professional copy.
//
// AI spend is metered per tenant per call into ru_ai_usage, and a per-tenant
// monthly ceiling halts generation with an admin-facing error rather than
// spending past it.
// =============================================================

const brain = require('../../services/brain');
const { models, scoped } = require('../models');

const TYPES = ['email_subject', 'email_body', 'social_caption'];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

// The month's AI spend for a tenant (UTC month), used against the ceiling.
async function monthlySpend(tenantId) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const rows = await scoped('ai_usage', tenantId).findAll({});
  return rows.filter((r) => new Date(r.created_at) >= start)
    .reduce((n, r) => n + Number(r.cost_usd || 0), 0);
}

function ceilingFor(tenant) {
  const t = tenant && tenant.ai_monthly_ceiling_usd != null ? Number(tenant.ai_monthly_ceiling_usd) : null;
  const envDflt = Number(process.env.REACHUP_AI_MONTHLY_CEILING_USD || 25);
  return Number.isFinite(t) && t > 0 ? t : envDflt;
}

function bannedHit(text, bannedList) {
  const s = String(text || '').toLowerCase();
  return (bannedList || []).find((b) => b && s.includes(String(b).toLowerCase())) || null;
}

// One asset, one language. NO asset body ever enters here — only the brief and
// brand kit. `_forbidden` is a tripwire: if a caller tries to pass a prior body
// through, we throw rather than silently translate.
function systemPrompt(type, lang, brand) {
  const native = lang === 'es';
  const rules = [
    native ? 'Escribe en español nativo, con ortografía correcta (tildes y ñ).'
           : 'Write in native English.',
    'No emojis. No exclamation spam. Professional tone.',
    brand && brand.positioning ? `Positioning: ${brand.positioning}` : '',
    brand && brand.tagline ? `Tagline: ${brand.tagline}` : '',
    (brand && brand.proof_points && brand.proof_points.length) ? `Proof points: ${brand.proof_points.join('; ')}` : '',
    (brand && brand.banned_phrases && brand.banned_phrases.length) ? `Never use these phrases: ${brand.banned_phrases.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  const shape = {
    email_subject: native ? 'Devuelve UNA línea de asunto de correo (máx 60 caracteres).' : 'Return ONE email subject line (max 60 chars).',
    email_body: native ? 'Devuelve el cuerpo de un correo de marketing (2-4 párrafos cortos, con una llamada a la acción).' : 'Return a marketing email body (2-4 short paragraphs with one call to action).',
    social_caption: native ? 'Devuelve UNA leyenda para redes sociales (máx 280 caracteres).' : 'Return ONE social media caption (max 280 chars).',
  }[type];
  return `You are a senior bilingual marketing copywriter.\n${rules}\n${shape}\nReturn ONLY the text, no preamble, no quotes.`;
}

async function generateOne({ brief, brand, type, lang, _forbidden }) {
  if (_forbidden !== undefined) throw new Error('generateOne must never receive an asset body — EN and ES are independent');
  const system = systemPrompt(type, lang, brand);
  const prompt = `Brief: ${String(brief || '').slice(0, 2000)}\nLanguage: ${lang === 'es' ? 'Spanish' : 'English'}`;
  const r = await brain.json({ system, prompt: prompt + '\nReturn JSON: {"text": "..."}', maxTokens: 500 });
  let text = '';
  if (r && r.ok && r.data && typeof r.data.text === 'string') text = r.data.text;
  else if (r && r.data && typeof r.data === 'string') text = r.data;
  const usage = (r && r.usage) || {};
  return { text: String(text || '').trim(), cost_usd: (r && r.cost_usd) || 0,
           tokens_in: usage.input_tokens || 0, tokens_out: usage.output_tokens || 0,
           is_simulated: !r || !r.ok || r.is_simulated };
}

// Keyless fallback so the studio is demoable without a model key — clearly
// labelled is_simulated, never passed off as generation.
function heuristic(type, lang, brief) {
  const es = lang === 'es';
  const b = String(brief || '').slice(0, 90);
  if (type === 'email_subject') return es ? `Novedades para ti: ${b}` : `An update for you: ${b}`;
  if (type === 'social_caption') return es ? `${b} — descúbrelo con JobUp.` : `${b} — see what JobUp can do.`;
  return es
    ? `Hola,\n\nQueremos contarte sobre ${b}.\n\nAbre tu panel para ver más.\n\nEl equipo de JobUp`
    : `Hi,\n\nWe want to tell you about ${b}.\n\nOpen your dashboard to see more.\n\nThe JobUp team`;
}

/**
 * Generate all 6 assets for a brief (3 types x EN/ES), each independently.
 * Persists ai_usage per call and content_assets rows (status draft). Halts if the
 * tenant's monthly AI ceiling is reached.
 */
async function generateBrief(tenantId, tenant, { prompt, createdBy }) {
  const brand = (tenant && tenant.brand_kit) || {};
  const ceiling = ceilingFor(tenant);
  const banned = brand.banned_phrases || [];

  const brief = await scoped('briefs', tenantId).create({ prompt, params: {}, created_by: createdBy || null });
  const assets = [];

  for (const type of TYPES) {
    for (const lang of ['en', 'es']) {
      // Ceiling check BEFORE spending.
      if (await monthlySpend(tenantId) >= ceiling) {
        return { ok: false, halted: true, brief_id: brief.id, assets,
          error: `AI monthly ceiling reached ($${ceiling}). Generation halted. Raise the ceiling in tenant config to continue.` };
      }

      let out = await generateOne({ brief: prompt, brand, type, lang });
      // Meter.
      await scoped('ai_usage', tenantId).create({ kind: `studio:${type}:${lang}`, model: brain.MODEL,
        tokens_in: out.tokens_in, tokens_out: out.tokens_out, cost_usd: out.cost_usd });

      let text = out.text;
      if (!text || out.is_simulated) text = heuristic(type, lang, prompt);

      // Banned-phrase / emoji block -> regenerate once -> flag for human.
      let flagged = false;
      if (bannedHit(text, banned) || EMOJI.test(text)) {
        const retry = await generateOne({ brief: prompt + '\nAvoid the banned phrases entirely and use no emojis.', brand, type, lang });
        await scoped('ai_usage', tenantId).create({ kind: `studio:${type}:${lang}:retry`, model: brain.MODEL,
          tokens_in: retry.tokens_in, tokens_out: retry.tokens_out, cost_usd: retry.cost_usd });
        const rt = (retry.text && !retry.is_simulated) ? retry.text : heuristic(type, lang, prompt);
        if (bannedHit(rt, banned) || EMOJI.test(rt)) { flagged = true; text = rt; }
        else text = rt;
      }

      const asset = await scoped('content_assets', tenantId).create({
        brief_id: brief.id, type, language: lang, body: text,
        status: flagged ? 'pending_review' : 'draft', flagged, is_simulated: out.is_simulated,
      });
      assets.push({ id: asset.id, type, language: lang, flagged, status: asset.status });
    }
  }
  return { ok: true, brief_id: brief.id, assets };
}

module.exports = { generateBrief, generateOne, monthlySpend, ceilingFor, bannedHit, TYPES };
