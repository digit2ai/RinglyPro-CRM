'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {
  sequelize,
  Company,
  Project,
  ProjectMilestone,
  IntakeBatch,
  ProjectIntake,
  ProjectQuestion,
  QuestionResponse,
  ProjectComment,
  PriorityVote,
  CompanyAccessToken
} = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TOKEN_AUDIENCE = 'd2ai-intake';

// =====================================================
// HEALTH (unauthenticated)
// =====================================================
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'D2AI Intake & Discussion',
    timestamp: new Date().toISOString()
  });
});

// =====================================================
// PUBLIC PROSPECT REQUEST (no auth) -- Neural AI Projects intake
// =====================================================
// POST /public/request { full_name, email, phone, company_name, company_website,
//   industry, country, project_title, project_description, problem, target_users,
//   current_process, data_sources, timeline, budget_range, success_metrics,
//   ai_category, sensitive_data, existing_stack, heard_from, best_time }
// -> creates company + batch (status=pending_review) + project + intake +
//    questions/responses + access token; returns { url, token }
router.post('/public/request', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const b = req.body || {};
    const required = ['full_name', 'email', 'project_title', 'problem'];
    for (const f of required) {
      if (!b[f] || !String(b[f]).trim()) {
        await t.rollback();
        return res.status(400).json({ success: false, error: `${f} is required` });
      }
    }

    const companyName = (b.company_name || b.full_name).toString().trim();

    // 1) Company (find-or-create by name)
    let [company] = await Company.findOrCreate({
      where: { workspace_id: 1, name: companyName },
      defaults: {
        workspace_id: 1,
        name: companyName,
        website: b.company_website || null,
        industry: b.industry || null,
        email: b.email,
        phone: b.phone || null,
        notes: `Auto-created from Neural AI prospect intake on ${new Date().toISOString()}.\nSubmitter: ${b.full_name} <${b.email}>${b.country ? '\nCountry: ' + b.country : ''}`
      },
      transaction: t
    });

    // 2) Batch (one per submission, status=pending_review)
    const batch = await IntakeBatch.create({
      workspace_id: 1,
      company_id: company.id,
      title: `Neural AI Project Request -- ${b.project_title}`,
      meeting_date: null,
      submitted_by_email: b.email,
      submitted_by_name: b.full_name,
      status: 'pending_review',
      notes: `Prospect-submitted Neural AI project intake.${b.heard_from ? '\nReferral: ' + b.heard_from : ''}${b.best_time ? '\nBest contact time: ' + b.best_time : ''}`
    }, { transaction: t });

    // Normalize ai_category to TEXT[] (multi-select)
    let aiCategoryArr = [];
    if (Array.isArray(b.ai_category)) {
      aiCategoryArr = b.ai_category.map(s => String(s).trim()).filter(Boolean);
    } else if (b.ai_category && String(b.ai_category).trim()) {
      aiCategoryArr = [String(b.ai_category).trim()];
    }
    const aiCategoryJoined = aiCategoryArr.join(', ') || 'Neural AI';
    // d2_projects.category is VARCHAR(100) — truncate the display label.
    // Full multi-select stays in ai_category TEXT[] untruncated.
    const aiCategoryDisplay = aiCategoryJoined.length > 100
      ? aiCategoryJoined.slice(0, 97) + '...'
      : aiCategoryJoined;

    // Sensitive data: collapse free-text answer to boolean + keep detail
    const sensitiveAnswer = (b.sensitive_data || '').toString().trim();
    const sensitiveBool = sensitiveAnswer.length > 0
      && /^yes|pii|phi|hipaa|financial|banking|regulated/i.test(sensitiveAnswer);

    // 3) Project + intake row
    const project = await Project.create({
      workspace_id: 1,
      company_id: company.id,
      name: b.project_title,
      description: b.project_description || b.problem,
      status: 'planning',
      stage: 'initiation',
      priority: b.timeline && /urgent|asap|now/i.test(b.timeline) ? 'high' : 'medium',
      tags: ['neural-ai-intake', 'pending-review'],
      category: aiCategoryDisplay,
      // Intake fields (migration 003)
      submitter_name: b.full_name || null,
      submitter_email: b.email || null,
      submitter_phone: b.phone || null,
      country: b.country || null,
      target_users: b.target_users || null,
      current_process: b.current_process || null,
      data_sources: b.data_sources || null,
      timeline: b.timeline || null,
      budget_range: b.budget_range || null,
      success_metrics: b.success_metrics || null,
      ai_category: aiCategoryArr,
      sensitive_data: sensitiveBool,
      sensitive_data_detail: sensitiveAnswer || null,
      existing_stack: b.existing_stack || null,
      heard_from: b.heard_from || null,
      best_contact_time: b.best_time || null,
      intake_status: 'pending_review',
      // Partner attribution + UTM tracking (migration 014). All optional;
      // populated from query string params parsed client-side on load.
      partner_slug: (b.partner_slug || '').toString().trim().slice(0, 120) || null,
      utm_source:   (b.utm_source   || '').toString().trim().slice(0, 120) || null,
      utm_campaign: (b.utm_campaign || '').toString().trim().slice(0, 255) || null,
      utm_medium:   (b.utm_medium   || '').toString().trim().slice(0, 120) || null,
      utm_content:  (b.utm_content  || '').toString().trim().slice(0, 255) || null,
      utm_term:     (b.utm_term     || '').toString().trim().slice(0, 255) || null,
      referrer_url: (b.referrer_url || '').toString().trim() || null
    }, { transaction: t });

    await ProjectIntake.create({
      project_id: project.id,
      batch_id: batch.id,
      contacts_notes: `Submitter: ${b.full_name} <${b.email}>${b.phone ? ' / ' + b.phone : ''}`,
      intake_status: 'discussion'
    }, { transaction: t });

    // 4) Auto-create Q&A pairs from the prospect's answers
    const qa = [
      ['What problem are you trying to solve?', b.problem],
      ['Who are the target users / audience?', b.target_users],
      ['What is the current process or system in place?', b.current_process],
      ['What data sources or volume are involved?', b.data_sources],
      ['Timeline / urgency?', b.timeline],
      ['Budget range?', b.budget_range],
      ['Expected outcomes / success metrics?', b.success_metrics],
      ['Which Neural AI categories fit best?', aiCategoryArr.length ? aiCategoryArr.join(', ') : ''],
      ['Does this involve sensitive / regulated data?', b.sensitive_data],
      ['Existing tech stack / integration requirements?', b.existing_stack]
    ];
    for (let i = 0; i < qa.length; i++) {
      const [qText, answer] = qa[i];
      const q = await ProjectQuestion.create({
        project_id: project.id,
        question_text: qText,
        position: i,
        created_by_email: 'intake-form'
      }, { transaction: t });
      if (answer && String(answer).trim()) {
        await QuestionResponse.create({
          question_id: q.id,
          responder_email: b.email,
          responder_name: b.full_name,
          response_text: String(answer).trim()
        }, { transaction: t });
      }
    }

    // 5) Access token for the prospect to revisit / track
    const accessToken = await CompanyAccessToken.create({
      company_id: company.id,
      batch_id: batch.id,
      grantee_email: b.email,
      grantee_name: b.full_name,
      role: 'reviewer',
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
    }, { transaction: t });

    await t.commit();

    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com';
    res.status(201).json({
      success: true,
      batch_id: batch.id,
      project_id: project.id,
      token: accessToken.token,
      url: `${baseUrl}/projects/intake/batch.html?token=${accessToken.token}`,
      // Echo attribution back so the Partner can verify their code wired
      // correctly (the dashboard will read partner_slug to attribute deals).
      partner_slug: project.partner_slug || null,
      utm_source:   project.utm_source   || null,
      utm_campaign: project.utm_campaign || null
    });

    // Schedule the Inbox Triage Agent for the freshly-submitted intake.
    // 3s delay so any post-commit triggers settle before we hit Claude + web.
    setTimeout(() => {
      try {
        const inboxTriageAgent = require('../services/agents/inboxTriageAgent');
        inboxTriageAgent.runById(project.id).then(r => {
          if (r && r.ok) console.log(`[D2AI-Intake] triage agent done for project ${project.id} (fit=${r.structured?.fit_score})`);
          else console.warn(`[D2AI-Intake] triage agent failed for project ${project.id}:`, r?.error);
        }).catch(e => console.warn('[D2AI-Intake] triage agent crashed:', e.message));
      } catch (e) { console.warn('[D2AI-Intake] triage agent dispatch failed:', e.message); }
    }, 3000);
  } catch (err) {
    try { await t.rollback(); } catch (_) {}
    console.error('[D2AI-Intake] public request error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PUBLIC TRIAGE PREVIEW (champion-facing demo) — no auth
// =====================================================
// POST /public-triage-preview
//   Body: { description, name?, email?, company?, country? }
//   Returns: { verdict, fit_score, fit_reasoning, problem_in_our_words,
//             technical_solution{...}, week_1_deliverables[], verify_flags[],
//             language, project_title_suggested }
//
// Powers the "Try it now" form at the bottom of /champion-teaser.html. A
// champion (or their prospect) pastes a problem in plain language, and
// Claude returns a shorter triage verdict PLUS a technical-solution sketch
// (which Neural Intelligence agents would handle it, what we'd build,
// rough delivery window). The champion reviews + edits the result, then
// clicks "Accept & Submit" which forwards to /public/request to create the
// real intake.
//
// Defaults: claude-sonnet-4-6 (cheaper, faster for triage); language
// auto-detected from the description (Spanish-leaning text -> Spanish
// output); rate-limited 10/hour per IP via in-process token bucket
// (sufficient for v1; promote to Redis if abuse becomes a problem).

const _triageBuckets = new Map();
function _triageRateLimit(ip) {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const LIMIT = 10;
  let b = _triageBuckets.get(ip);
  if (!b || now - b.windowStart > HOUR) {
    b = { windowStart: now, count: 0 };
    _triageBuckets.set(ip, b);
  }
  if (b.count >= LIMIT) {
    const retryInSec = Math.ceil((HOUR - (now - b.windowStart)) / 1000);
    return { allowed: false, retryInSec };
  }
  b.count += 1;
  return { allowed: true };
}

function _detectLang(text) {
  const s = String(text || '').toLowerCase();
  // Strong signals: tildes / ñ / common Spanish stop-words
  if (/[áéíóúñ¿¡]/i.test(s)) return 'es';
  if (/\b(que|para|con|los|las|una|por|nuestro|empresa|cliente|necesito|proyecto|cámara|cámaras|colombia|argentina|méxico|españa|peru|chile)\b/.test(s)) return 'es';
  return 'en';
}

function _safeParseJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = cleaned.indexOf('{');
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) { return null; }
          }
        }
      }
    }
  }
  return null;
}

const TRIAGE_SYSTEM_PROMPT = `You are a senior solutions architect at Digit2AI, evaluating an incoming prospect request for the Neural Intelligence platform.

ABOUT DIGIT2AI
- We build custom AI-powered software for any business that needs to act faster than its tooling allows
- Our Neural Intelligence stack includes 8 specialized agents coordinated via the MCP (Model Context Protocol) standard:
  - Senior Business Analyst (decks, business plans, market research, strategy)
  - Research Brief (web search + synthesis, competitive scans, regulatory checks)
  - Outreach Drafter (emails, WhatsApp, follow-ups in EN/ES)
  - Architect & Builder (scopes the build, writes code, runs UAT, ships the app)
  - Inbox Triage (scores incoming requests, flags risks)
  - Meeting Minutes Synthesizer (summary + action items + auto-task creation)
  - Voice AI Agents (Rachel EN / Ana & Lina ES — answer phones, qualify leads)
  - Neural Findings (proactive monitoring of project risks, stalls, missing owners)
- 21 live platforms across 22 verticals: chambers of commerce, financial wellness, logistics, mobility, healthcare, urban innovation, hospitality, language training
- Customers in 5+ countries, EN + ES native, regulatory experience from Colombian habeas data to US HIPAA

YOUR JOB
Read the prospect's problem description. Produce a SHORT triage verdict PLUS a concrete technical-solution sketch. Be specific. Never invent numbers. If the problem is vague, set verdict to "poc" and ask for the clarifying questions in verify_flags.

DELIVERY-WINDOW RULE — CRITICAL
Digit2AI's market positioning is "days, not months." Every delivery_window MUST be expressed in DAYS. Never use "weeks." Never use "months." Examples of valid windows:
- "3-7 days" (existing-platform deployment)
- "14-21 days" (lightly-customized platform)
- "30-45 days" (custom-build MVP)
- "60-90 days" (complex multi-system integration)
Do not write "2 weeks" — write "10-14 days." Do not write "3 months" — write "60-90 days." This is non-negotiable.

VERDICT KEY
- "go" — clear fit with an existing platform or an obvious custom build path; fit_score 8-10
- "poc" — promising but needs a small validation phase; fit_score 5-7
- "stop" — out of scope, regulated in ways we can't handle, or so vague we can't help yet; fit_score 0-4

OUTPUT FORMAT
Respond with a single JSON object. No prose before or after. No markdown fences. The JSON must conform to this schema:

{
  "language": "en" | "es",
  "project_title_suggested": "short auto-suggested project name, 4-8 words",
  "verdict": "go" | "poc" | "stop",
  "fit_score": 7,
  "fit_reasoning": "one sentence explaining the score",
  "problem_in_our_words": "2 sentences confirming we understood the prospect's problem in plain language",
  "technical_solution": {
    "summary": "one-paragraph approach to the build",
    "agents_involved": ["Senior Business Analyst", "Architect & Builder"],
    "what_we_build": ["concrete deliverable 1", "concrete deliverable 2", "concrete deliverable 3"],
    "data_sources_via_mcp": ["specific system 1", "specific system 2"],
    "delivery_window": "X-Y days  (ALWAYS express in DAYS. Never weeks. Never months. Digit2AI's market positioning is days-not-months. Even a complex custom build expresses as e.g. '21-30 days' or '45-60 days', never '4-6 weeks'.)"
  },
  "week_1_deliverables": ["concrete first thing they see", "second thing"],
  "verify_flags": ["specific thing the human reviewer needs to confirm or that the prospect needs to clarify"]
}

Respond with the JSON object only.`;

router.post('/public-triage-preview', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const rl = _triageRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many triage previews from this IP. Try again in ${Math.ceil(rl.retryInSec / 60)} minute(s).`,
        retry_in_seconds: rl.retryInSec
      });
    }

    const body = req.body || {};
    const description = String(body.description || '').trim();
    if (!description || description.length < 30) {
      return res.status(400).json({ success: false, error: 'Description must be at least 30 characters.' });
    }
    if (description.length > 5000) {
      return res.status(400).json({ success: false, error: 'Description must be under 5000 characters.' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ success: false, error: 'Triage service not configured (no API key on server).' });
    }
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {
      return res.status(503).json({ success: false, error: 'Triage SDK unavailable on server.' });
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const lang = body.language === 'en' || body.language === 'es' ? body.language : _detectLang(description);
    const userMsg = `Today is ${new Date().toISOString().slice(0, 10)}.

RESPONSE LANGUAGE: ${lang === 'es' ? 'Respond entirely in fluent business Spanish with proper orthography (tildes, ñ, ¿¡). The deliverable_type enum strings stay in English (they are code identifiers).' : 'Respond in English.'}

PROSPECT CONTEXT
- Name: ${body.name || '(not provided)'}
- Company: ${body.company || '(not provided)'}
- Country: ${body.country || '(not provided)'}

PROBLEM DESCRIPTION
${description}

Produce the triage verdict + technical solution as a single JSON object. Respond with the JSON only.`;

    const MODEL = process.env.TRIAGE_PREVIEW_MODEL || 'claude-sonnet-4-6';
    let resp;
    try {
      resp = await client.messages.create({
        model: MODEL,
        max_tokens: 2500,
        system: TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }]
      });
    } catch (err) {
      console.error('[D2AI-Intake] public-triage-preview Claude call failed:', err.message);
      return res.status(502).json({ success: false, error: 'Triage upstream call failed. Please try again.' });
    }
    const rawText = resp?.content?.[0]?.text || '';
    let parsed = _safeParseJson(rawText);
    if (!parsed) {
      // One retry asking for clean JSON
      try {
        const retry = await client.messages.create({
          model: MODEL,
          max_tokens: 2500,
          system: TRIAGE_SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: userMsg },
            { role: 'assistant', content: rawText || '(empty)' },
            { role: 'user', content: 'Your last response was not valid JSON. Reply again with the COMPLETE JSON object only, no preamble, no markdown fences. Begin with { and end with }.' }
          ]
        });
        parsed = _safeParseJson(retry?.content?.[0]?.text || '');
      } catch (_) {}
    }
    if (!parsed) {
      return res.status(502).json({ success: false, error: 'Triage returned a malformed response. Please rephrase your description and try again.' });
    }

    // Defensive normalization so the UI never crashes on missing fields
    const ts = parsed.technical_solution || {};
    const out = {
      language: parsed.language === 'es' ? 'es' : 'en',
      project_title_suggested: String(parsed.project_title_suggested || '').trim().slice(0, 120) || 'Untitled Project',
      verdict: ['go', 'poc', 'stop'].includes(parsed.verdict) ? parsed.verdict : 'poc',
      fit_score: Math.max(0, Math.min(10, Number(parsed.fit_score) || 5)),
      fit_reasoning: String(parsed.fit_reasoning || '').trim(),
      problem_in_our_words: String(parsed.problem_in_our_words || '').trim(),
      technical_solution: {
        summary: String(ts.summary || '').trim(),
        agents_involved: Array.isArray(ts.agents_involved) ? ts.agents_involved.map(a => String(a).trim()).filter(Boolean) : [],
        what_we_build: Array.isArray(ts.what_we_build) ? ts.what_we_build.map(a => String(a).trim()).filter(Boolean) : [],
        data_sources_via_mcp: Array.isArray(ts.data_sources_via_mcp) ? ts.data_sources_via_mcp.map(a => String(a).trim()).filter(Boolean) : [],
        delivery_window: String(ts.delivery_window || '').trim()
      },
      week_1_deliverables: Array.isArray(parsed.week_1_deliverables) ? parsed.week_1_deliverables.map(a => String(a).trim()).filter(Boolean) : [],
      verify_flags: Array.isArray(parsed.verify_flags) ? parsed.verify_flags.map(a => String(a).trim()).filter(Boolean) : [],
      model: MODEL
    };

    res.json({ success: true, data: out });
  } catch (err) {
    console.error('[D2AI-Intake] public-triage-preview error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PARTNERSHIP ORB — voice-driven triage (champion-teaser orb)
// =====================================================
//
// GET /partnership-orb-config
//   Public, no auth. Returns the ElevenLabs convai agent ID for the
//   requested language so the browser SDK can connect without leaking
//   the API key. Agent IDs are public per ElevenLabs convai design;
//   the API key stays server-side.
//
// =====================================================
// A/B HEADLINE VARIANTS (T3.4)
// =====================================================
// Three hero headline variants, deterministically assigned per
// session via hash(session_id) % 3. The client passes its
// session_id from localStorage; server returns the variant index
// + EN/ES copy. Client emits hero_variant_shown so the funnel
// analytics can compute conversion per variant.
//
// Variants explore different framing — outcome vs. capability vs.
// social proof — to find which hero copy converts best for the
// Partnership intake.

const HERO_VARIANTS = [
  {
    // Variant 0 — Outcome / speed (existing copy, kept as control)
    en: { eyebrow: 'Partnership Brief', h1_pre: 'Joint Venture —', h1_em: 'Partnership', sub: 'A 5-minute crash course so you can answer any prospect question with confidence — and turn the conversation into a real intake at digit2ai.com.' },
    es: { eyebrow: 'Brief del Partnership', h1_pre: 'Joint Venture —', h1_em: 'Partnership', sub: 'Un curso intensivo de 5 minutos para que puedas responder con confianza a cualquier pregunta de un prospecto — y convertir la conversación en una solicitud real en digit2ai.com.' }
  },
  {
    // Variant 1 — Problem-led (pain framing)
    en: { eyebrow: 'For decision makers', h1_pre: 'Stop guessing.', h1_em: 'Start shipping.', sub: 'Talk to the MCP Neural Brain. In 5 minutes you walk out with a verdict, fit score, technical solution and delivery window — ready to share with your team.' },
    es: { eyebrow: 'Para tomadores de decisiones', h1_pre: 'Deja de adivinar.', h1_em: 'Empieza a entregar.', sub: 'Habla con el MCP Neural Brain. En 5 minutos sales con un veredicto, puntuación de ajuste, solución técnica y ventana de entrega — listo para compartir con tu equipo.' }
  },
  {
    // Variant 2 — Social proof / scale framing
    en: { eyebrow: 'Trusted by 21 platforms', h1_pre: 'Your project,', h1_em: 'scoped in 5 minutes.', sub: 'The same Neural Intelligence stack that runs 22 verticals across the Americas. Tell it your problem in plain language — get a build plan back the same call.' },
    es: { eyebrow: 'Confiado por 21 plataformas', h1_pre: 'Tu proyecto,', h1_em: 'definido en 5 minutos.', sub: 'La misma pila Neural Intelligence que corre 22 verticales en las Américas. Cuéntale tu problema en lenguaje natural — recibe un plan de construcción en la misma llamada.' }
  }
];

function _variantForSession(sessionId) {
  if (!sessionId) return 0;
  const h = _crypto.createHash('md5').update(String(sessionId)).digest();
  return h[0] % HERO_VARIANTS.length;
}

// GET /hero-variant?session_id=...
//   Public. Returns the variant index + EN+ES copy for the given
//   session_id. Deterministic — same session always sees the same
//   variant. Client must pass its localStorage funnel session_id.
router.get('/hero-variant', (req, res) => {
  const sid = String(req.query.session_id || '').trim();
  const idx = _variantForSession(sid);
  res.json({
    success: true,
    variant: idx,
    copy: HERO_VARIANTS[idx]
  });
});

// =====================================================
// FUNNEL ANALYTICS (T3.3)
// =====================================================
// Lightweight client-side event log. Each visitor's session_id is a
// random UUID stored in localStorage. Events accumulate without
// linking to user identity. /funnel-summary returns Sankey-shaped
// counts so we can see drop-off between funnel stages.
//
// Admin view at /champion-funnel.html is BasicAuth-protected via
// BASIC_AUTH_USER / BASIC_AUTH_PASS. Document in CLAUDE.md.

const VALID_FUNNEL_EVENTS = new Set([
  'page_visible',
  'orb_visible',
  'orb_clicked',
  'mic_granted',
  'mic_denied',
  'session_started',
  'triage_started',
  'triage_completed',
  'submit_clicked',
  'submit_succeeded',
  'submit_failed',
  'abandoned',
  'transcript_emailed',
  'transcript_copied',
  'pdf_downloaded',
  'roi_calculated',
  'roi_shared',
  'faq_opened',
  'hero_variant_shown'
]);

router.post('/funnel-event', async (req, res) => {
  try {
    const b = req.body || {};
    const event = String(b.event || '').trim().slice(0, 64);
    if (!event || !VALID_FUNNEL_EVENTS.has(event)) {
      return res.status(400).json({ success: false, error: 'Invalid event name.' });
    }
    const sessionId = String(b.session_id || '').trim().slice(0, 64);
    if (!sessionId || sessionId.length < 8) return res.status(400).json({ success: false, error: 'session_id required.' });

    const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const ipHash = _crypto.createHash('sha256').update(ip + (process.env.SESSION_SALT || 'd2ai-default-salt')).digest('hex').slice(0, 32);

    const _str = (v, max) => (v == null ? null : String(v).trim().slice(0, max || 255) || null);

    await sequelize.query(
      `INSERT INTO d2_funnel_events
         (session_id, event_name, partner_slug, utm_source, utm_campaign,
          lang, hero_variant, metadata, ip_hash, user_agent)
       VALUES (:sid, :ev, :ps, :us, :uc, :lang, :hv, :meta::jsonb, :ip, :ua)`,
      {
        replacements: {
          sid: sessionId,
          ev: event,
          ps: _str(b.partner_slug, 120),
          us: _str(b.utm_source, 120),
          uc: _str(b.utm_campaign, 255),
          lang: _str(b.lang, 8),
          hv: Number.isInteger(b.hero_variant) ? b.hero_variant : null,
          meta: b.metadata ? JSON.stringify(b.metadata).slice(0, 2000) : null,
          ip: ipHash,
          ua: String(req.headers['user-agent'] || '').slice(0, 500) || null
        }
      }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[D2AI-Intake] funnel-event error:', err.message);
    res.status(500).json({ success: false, error: 'Save failed.' });
  }
});

// BasicAuth gate for admin views — checks BASIC_AUTH_USER / _PASS env.
function _basicAuthGate(req, res) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) {
    // If admin creds aren't configured, allow only from localhost
    // for development convenience.
    const ip = (req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
    res.status(503).json({ success: false, error: 'Admin not configured (BASIC_AUTH_USER + BASIC_AUTH_PASS env vars unset).' });
    return false;
  }
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Basic (.+)$/);
  if (!m) {
    res.set('WWW-Authenticate', 'Basic realm="Digit2AI Admin"');
    res.status(401).send('Authentication required.');
    return false;
  }
  let decoded = '';
  try { decoded = Buffer.from(m[1], 'base64').toString('utf8'); } catch (_) {}
  const [u, p] = decoded.split(':');
  if (u !== user || p !== pass) {
    res.set('WWW-Authenticate', 'Basic realm="Digit2AI Admin"');
    res.status(401).send('Bad credentials.');
    return false;
  }
  return true;
}

router.get('/funnel-summary', async (req, res) => {
  if (!_basicAuthGate(req, res)) return;
  try {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 7));
    const sinceClause = `created_at >= NOW() - INTERVAL '${days} days'`;
    // Step counts (one count per unique session per event)
    const stepRows = await sequelize.query(
      `SELECT event_name, COUNT(DISTINCT session_id)::int AS sessions
         FROM d2_funnel_events
        WHERE ${sinceClause}
        GROUP BY event_name`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const steps = {};
    stepRows.forEach(r => { steps[r.event_name] = r.sessions; });
    // Total unique sessions
    const totalRows = await sequelize.query(
      `SELECT COUNT(DISTINCT session_id)::int AS total FROM d2_funnel_events WHERE ${sinceClause}`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const totalSessions = (totalRows[0] && totalRows[0].total) || 0;
    // Variant breakdown for T3.4
    const variantRows = await sequelize.query(
      `SELECT hero_variant, COUNT(DISTINCT session_id)::int AS sessions,
              COUNT(DISTINCT CASE WHEN event_name='submit_succeeded' THEN session_id END)::int AS submits
         FROM d2_funnel_events
        WHERE ${sinceClause} AND hero_variant IS NOT NULL
        GROUP BY hero_variant
        ORDER BY hero_variant`,
      { type: sequelize.QueryTypes.SELECT }
    );
    // Partner breakdown
    const partnerRows = await sequelize.query(
      `SELECT partner_slug,
              COUNT(DISTINCT session_id)::int AS sessions,
              COUNT(DISTINCT CASE WHEN event_name='submit_succeeded' THEN session_id END)::int AS submits
         FROM d2_funnel_events
        WHERE ${sinceClause} AND partner_slug IS NOT NULL
        GROUP BY partner_slug
        ORDER BY sessions DESC
        LIMIT 20`,
      { type: sequelize.QueryTypes.SELECT }
    );
    res.json({
      success: true,
      days,
      total_sessions: totalSessions,
      steps,
      variants: variantRows,
      top_partners: partnerRows
    });
  } catch (err) {
    console.error('[D2AI-Intake] funnel-summary error:', err.message);
    res.status(500).json({ success: false, error: 'Summary failed.' });
  }
});

// GET /ab-summary — variant -> conversion rate (joins on funnel)
router.get('/ab-summary', async (req, res) => {
  if (!_basicAuthGate(req, res)) return;
  try {
    const days = Math.max(1, Math.min(180, parseInt(req.query.days, 10) || 30));
    const rows = await sequelize.query(
      `SELECT hero_variant,
              COUNT(DISTINCT session_id)::int AS sessions,
              COUNT(DISTINCT CASE WHEN event_name='triage_started' THEN session_id END)::int AS triaged,
              COUNT(DISTINCT CASE WHEN event_name='submit_succeeded' THEN session_id END)::int AS submitted
         FROM d2_funnel_events
        WHERE created_at >= NOW() - INTERVAL '${days} days' AND hero_variant IS NOT NULL
        GROUP BY hero_variant
        ORDER BY hero_variant`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const variants = rows.map(r => ({
      variant: r.hero_variant,
      sessions: r.sessions,
      triaged: r.triaged,
      submitted: r.submitted,
      triage_rate: r.sessions ? r.triaged / r.sessions : 0,
      submit_rate: r.sessions ? r.submitted / r.sessions : 0
    }));
    res.json({ success: true, days, variants });
  } catch (err) {
    console.error('[D2AI-Intake] ab-summary error:', err.message);
    res.status(500).json({ success: false, error: 'AB summary failed.' });
  }
});

// =====================================================
// PARTNER DASHBOARD (T3.1)
// =====================================================
// Magic-link auth for /champion-dashboard.html. Partner enters email
// + slug, server generates a 32-byte hex token, returns the magic URL.
// Clicking the URL sets an HttpOnly cookie + redirects to the
// dashboard. Cookie auth carries forward to /partner-stats.
//
// Email send via SendGrid if configured; otherwise the response
// surfaces the URL directly (matches the EMAIL_AUTOSEND_DISABLED
// project pattern documented in CLAUDE.md).
const _crypto = require('crypto');
const PARTNER_SESSION_DAYS = 7;
const PARTNER_COOKIE = 'd2ai_partner_session';

function _slug(s) {
  return String(s || '').trim().toLowerCase().slice(0, 120).replace(/[^a-z0-9_\-\.]/g, '').replace(/^-+|-+$/g, '');
}
function _ipHash(req) {
  const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').toString().split(',')[0].trim();
  return _crypto.createHash('sha256').update(ip + (process.env.SESSION_SALT || 'd2ai-default-salt')).digest('hex').slice(0, 32);
}
function _partnerLoginRateLimit(ip) {
  // Reuse the triage bucket — same shape, just shares the cap.
  return _triageRateLimit(ip);
}

// POST /partner-login { email, partner_slug }
//   Public. Generates a session token + magic URL. Always returns the
//   URL in the response so the partner can copy/click it directly
//   (production SendGrid may not be configured; the user-clicked
//   nature of the action bypasses EMAIL_AUTOSEND_DISABLED if SG is on).
router.post('/partner-login', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const rl = _partnerLoginRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({ success: false, error: `Too many login attempts. Try again in ${Math.ceil(rl.retryInSec / 60)} minute(s).` });
    }
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const slug = _slug(b.partner_slug);
    if (!email || email.indexOf('@') < 0) return res.status(400).json({ success: false, error: 'Valid email required.' });
    if (!slug) return res.status(400).json({ success: false, error: 'partner_slug required (e.g. "manuel-stagg").' });

    const token = _crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PARTNER_SESSION_DAYS * 24 * 60 * 60 * 1000);
    await sequelize.query(
      `INSERT INTO d2_partner_sessions (token, partner_slug, email, name, expires_at, ip_hash)
       VALUES (:token, :slug, :email, :name, :exp, :ip)`,
      {
        replacements: {
          token, slug, email,
          name: String(b.name || '').trim().slice(0, 255) || null,
          exp: expiresAt,
          ip: _ipHash(req)
        }
      }
    );
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com';
    const magicUrl = `${baseUrl}/projects/api/v1/intake/partner-verify?token=${token}`;

    // Best-effort SendGrid send if configured (user-clicked, bypasses
    // EMAIL_AUTOSEND_DISABLED). Failures are silent — magic URL is
    // always also in the response.
    if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: email,
          from: process.env.SENDGRID_FROM_EMAIL,
          subject: 'Your Digit2AI Partner Dashboard login',
          text: `Click here to access your Partner Dashboard:\n\n${magicUrl}\n\nThis link expires in ${PARTNER_SESSION_DAYS} days.`,
          html: `<p>Click here to access your Partner Dashboard:</p><p><a href="${magicUrl}" style="color:#22d3ee">${magicUrl}</a></p><p>This link expires in ${PARTNER_SESSION_DAYS} days.</p>`
        });
      } catch (e) { /* swallow — URL is in the response anyway */ }
    }
    res.json({ success: true, magic_url: magicUrl, expires_at: expiresAt });
  } catch (err) {
    console.error('[D2AI-Intake] partner-login error:', err.message);
    res.status(500).json({ success: false, error: 'Login failed.' });
  }
});

// GET /partner-verify?token=...
//   Validates the magic-link token, sets an HttpOnly cookie carrying
//   the same token, and redirects to /champion-dashboard.html.
router.get('/partner-verify', async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token || token.length !== 64) return res.status(400).send('Invalid token.');
    const rows = await sequelize.query(
      `SELECT partner_slug, email, expires_at, revoked_at FROM d2_partner_sessions WHERE token = :token LIMIT 1`,
      { replacements: { token }, type: sequelize.QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(401).send('Session not found or expired.');
    const s = rows[0];
    if (s.revoked_at) return res.status(401).send('Session revoked.');
    if (new Date(s.expires_at) < new Date()) return res.status(401).send('Session expired. Request a new link.');
    await sequelize.query(
      `UPDATE d2_partner_sessions SET last_used_at = NOW(), used_count = used_count + 1 WHERE token = :token`,
      { replacements: { token } }
    );
    // Set HttpOnly cookie — Secure flag if we're served over HTTPS
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const maxAge = PARTNER_SESSION_DAYS * 24 * 60 * 60;
    res.setHeader('Set-Cookie', `${PARTNER_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    res.redirect('/champion-dashboard.html?logged_in=1');
  } catch (err) {
    console.error('[D2AI-Intake] partner-verify error:', err.message);
    res.status(500).send('Verify failed.');
  }
});

// GET /partner-stats
//   Cookie-authed. Returns the partner's referrals + aggregate stats.
//   Reads the token from the HttpOnly cookie. Joins on d2_projects
//   WHERE partner_slug = me.
router.get('/partner-stats', async (req, res) => {
  try {
    const cookieHeader = req.headers.cookie || '';
    const m = cookieHeader.match(new RegExp(`(?:^|; )${PARTNER_COOKIE}=([^;]+)`));
    if (!m) return res.status(401).json({ success: false, error: 'Not logged in.' });
    const token = m[1];
    const rows = await sequelize.query(
      `SELECT partner_slug, email, name, expires_at, revoked_at FROM d2_partner_sessions WHERE token = :token LIMIT 1`,
      { replacements: { token }, type: sequelize.QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(401).json({ success: false, error: 'Session not found.' });
    const sess = rows[0];
    if (sess.revoked_at) return res.status(401).json({ success: false, error: 'Session revoked.' });
    if (new Date(sess.expires_at) < new Date()) return res.status(401).json({ success: false, error: 'Session expired.' });
    const slug = sess.partner_slug;

    // Referrals — every d2_projects row where partner_slug matches.
    const referrals = await sequelize.query(
      `SELECT id, name AS project_title, status, intake_status, workflow_phase,
              submitter_name, submitter_email, company_id,
              target_total_usd, target_delivery_weeks,
              created_at
         FROM d2_projects
        WHERE partner_slug = :slug
        ORDER BY created_at DESC
        LIMIT 200`,
      { replacements: { slug }, type: sequelize.QueryTypes.SELECT }
    );
    // Aggregate stats
    const totalSubs = referrals.length;
    const last30 = referrals.filter(r => (Date.now() - new Date(r.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000).length;
    const totalBudget = referrals.reduce((sum, r) => sum + (parseFloat(r.target_total_usd) || 0), 0);
    // Commission: 10% of stated budget as a placeholder. Document this.
    const COMMISSION_RATE = 0.10;
    const estCommission = totalBudget * COMMISSION_RATE;
    // Status breakdown
    const statusCounts = {};
    referrals.forEach(r => {
      const key = r.workflow_phase || r.intake_status || r.status || 'unknown';
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    });
    // Last 30d trend (per-day counts)
    const dayCounts = {};
    referrals.forEach(r => {
      const day = new Date(r.created_at).toISOString().slice(0, 10);
      if ((Date.now() - new Date(r.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000) {
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      }
    });

    res.json({
      success: true,
      partner: { slug, email: sess.email, name: sess.name },
      referrals,
      stats: {
        total_submissions: totalSubs,
        last_30_days: last30,
        total_stated_budget_usd: totalBudget,
        estimated_commission_usd: estCommission,
        commission_rate: COMMISSION_RATE,
        status_counts: statusCounts,
        last_30_days_trend: dayCounts
      }
    });
  } catch (err) {
    console.error('[D2AI-Intake] partner-stats error:', err.message);
    res.status(500).json({ success: false, error: 'Stats failed.' });
  }
});

// POST /partner-logout — clears the cookie
router.post('/partner-logout', (req, res) => {
  res.setHeader('Set-Cookie', `${PARTNER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  res.json({ success: true });
});

// POST /abandoned-conversation (T2.3)
//   Public. Captures the warm leads who started a voice conversation
//   but ended (Esc / click-stop / 10-min timeout) BEFORE running the
//   AI Triage. The transcript + email lands in d2_abandoned_conversations
//   for follow-up.
//
//   Body: { email, name?, company?, country?, transcript: [...],
//           language, partner_slug?, utm_*, referrer_url? }
//
//   Rate-limited per IP via the shared triage bucket. Email validated
//   server-side. ip_hash stored (not raw IP) for spam analysis without
//   PII baggage.
router.post('/abandoned-conversation', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const rl = _triageRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({ success: false, error: `Too many submissions. Try again in ${Math.ceil(rl.retryInSec / 60)} minute(s).` });
    }
    const b = req.body || {};
    // Email is now OPTIONAL. Auto-saved trails (10-min timeout, click-stop,
    // tab-close via sendBeacon) often have no email yet — we still persist
    // the transcript so requirements gathered in the call are never lost.
    // If an email IS provided it must look valid; otherwise we store null.
    const rawEmail = String(b.email || '').trim().toLowerCase();
    if (rawEmail && rawEmail.indexOf('@') < 0) return res.status(400).json({ success: false, error: 'Invalid email.' });
    const email = rawEmail || null;
    const autoSaved = !!b.auto; // true when the client saved this silently
    const transcript = Array.isArray(b.transcript) ? b.transcript.slice(0, 200) : [];
    // Don't persist truly empty auto-saves (orb clicked then instantly closed).
    if (autoSaved && transcript.length < 1 && !email) {
      return res.json({ success: true, skipped: 'empty' });
    }
    const lang = b.language === 'es' ? 'es' : 'en';
    const ua = String(req.headers['user-agent'] || '').slice(0, 500);
    const crypto = require('crypto');
    const ipHash = crypto.createHash('sha256').update(ip + (process.env.SESSION_SALT || 'd2ai-default-salt')).digest('hex').slice(0, 32);

    const _str = (v, max) => (v == null ? null : String(v).trim().slice(0, max || 255) || null);
    const row = await sequelize.query(
      `INSERT INTO d2_abandoned_conversations
         (email, name, company, country, transcript, transcript_len, language,
          partner_slug, utm_source, utm_campaign, utm_medium, utm_content, utm_term,
          referrer_url, user_agent, ip_hash, status)
       VALUES (:email, :name, :company, :country, :transcript::jsonb, :tlen, :lang,
               :partner_slug, :utm_source, :utm_campaign, :utm_medium, :utm_content, :utm_term,
               :referrer_url, :user_agent, :ip_hash, :status)
       RETURNING id, created_at`,
      {
        replacements: {
          email,
          status:       autoSaved ? 'auto_saved' : 'new',
          name:         _str(b.name, 255),
          company:      _str(b.company, 255),
          country:      _str(b.country, 120),
          transcript:   JSON.stringify(transcript),
          tlen:         transcript.length,
          lang,
          partner_slug: _str(b.partner_slug, 120),
          utm_source:   _str(b.utm_source, 120),
          utm_campaign: _str(b.utm_campaign, 255),
          utm_medium:   _str(b.utm_medium, 120),
          utm_content:  _str(b.utm_content, 255),
          utm_term:     _str(b.utm_term, 255),
          referrer_url: _str(b.referrer_url, 500),
          user_agent:   ua || null,
          ip_hash:      ipHash
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    res.json({ success: true, id: row[0][0].id });
  } catch (err) {
    console.error('[D2AI-Intake] abandoned-conversation error:', err.message);
    res.status(500).json({ success: false, error: 'Save failed.' });
  }
});

// POST /email-transcript
//   Public, user-clicked. Sends the orb conversation transcript to the
//   prospect's email so they can share it internally before submitting.
//
//   Body: { email, transcript: [{role, text, ts}], language, partner_slug? }
//
//   User-clicked sends bypass EMAIL_AUTOSEND_DISABLED (the guard only
//   gates background auto-triggers). Rate-limited: 5 transcripts per
//   hour per IP to prevent abuse.
router.post('/email-transcript', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').toString().split(',')[0].trim();
    // Reuse the triage rate limiter buckets — same window/key shape, smaller cap.
    const rl = _triageRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({ success: false, error: `Too many transcript requests. Try again in ${Math.ceil(rl.retryInSec / 60)} minute(s).` });
    }
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) return res.status(400).json({ success: false, error: 'Valid email required.' });
    const transcript = Array.isArray(b.transcript) ? b.transcript.slice(0, 200) : [];
    if (!transcript.length) return res.status(400).json({ success: false, error: 'Transcript is empty.' });
    const lang = b.language === 'es' ? 'es' : 'en';
    const partner = String(b.partner_slug || '').trim().slice(0, 120);

    if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
      return res.status(503).json({ success: false, error: 'Email transport not configured (SENDGRID_API_KEY or SENDGRID_FROM_EMAIL unset).' });
    }
    let sgMail;
    try { sgMail = require('@sendgrid/mail'); }
    catch (_) { return res.status(503).json({ success: false, error: 'SendGrid SDK unavailable.' }); }
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // Render transcript as a clean HTML email + plain-text fallback.
    const ESC = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const lines = transcript.map(m => {
      const who = m.role === 'user' ? (lang === 'es' ? 'Tú' : 'You')
                : m.role === 'agent' ? (lang === 'es' ? 'MCP Neural Brain' : 'MCP Neural Brain')
                : (m.role || 'system');
      const color = m.role === 'user' ? '#22d3ee' : '#8b5cf6';
      return `<div style="margin:0 0 12px 0;padding:10px 14px;background:#0c1733;border-left:3px solid ${color};border-radius:6px"><div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:${color};margin-bottom:4px">${ESC(who)}</div><div style="color:#e5e7eb;line-height:1.5">${ESC(m.text)}</div></div>`;
    }).join('');
    const heading = lang === 'es' ? 'Tu conversación con el MCP Neural Brain' : 'Your conversation with the MCP Neural Brain';
    const intro = lang === 'es' ? 'Aquí tienes una copia de la conversación que acabas de tener en aiagent.ringlypro.com. Compártela con tu equipo o úsala para refinar tu solicitud antes de enviarla al intake de Digit2AI.' : 'Here is a copy of the conversation you just had at aiagent.ringlypro.com. Share it with your team or use it to refine your request before submitting to the Digit2AI intake.';
    const footer = lang === 'es' ? 'Cuando estés listo para enviar: <a href="https://aiagent.ringlypro.com/champion-teaser.html" style="color:#22d3ee">vuelve a la página</a> y corre el AI Triage.' : 'When you are ready to submit: <a href="https://aiagent.ringlypro.com/champion-teaser.html" style="color:#22d3ee">return to the page</a> and run the AI Triage.';

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#05070e;font-family:Arial,sans-serif;color:#e5e7eb"><table width="100%" cellpadding="0" cellspacing="0" style="background:#05070e"><tr><td align="center" style="padding:32px 16px"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a0d1a;border-radius:14px;padding:32px"><tr><td><h1 style="font-size:22px;font-weight:800;color:#fff;margin:0 0 12px 0">${ESC(heading)}</h1><p style="font-size:14px;color:#9aa3b2;margin:0 0 24px 0;line-height:1.55">${ESC(intro)}</p>${lines}<p style="font-size:13px;color:#9aa3b2;margin:24px 0 0 0;line-height:1.55">${footer}</p>${partner ? `<p style="font-size:11px;color:#5a6378;margin:20px 0 0 0;font-family:monospace">Partner: ${ESC(partner)}</p>` : ''}</td></tr></table></td></tr></table></body></html>`;
    const text = transcript.map(m => `[${m.role}] ${m.text}`).join('\n\n');

    await sgMail.send({
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: heading,
      text,
      html
    });
    res.json({ success: true, sent_to: email });
  } catch (err) {
    console.error('[D2AI-Intake] email-transcript error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send. ' + (err.message || '') });
  }
});

// GET /partnership-trust-signals
//   Public. Returns the stats + trust signals shown on the social-proof
//   block above the orb on /champion-teaser.html. Server-driven so
//   numbers + partner list can be updated without a deploy.
//
//   Stats come from CLAUDE.md / memory company_digit2ai.md — never
//   invented. Bumping any number here requires updating that memory
//   first (single source of truth).
router.get('/partnership-trust-signals', (req, res) => {
  const lang = req.query.lang === 'es' ? 'es' : 'en';
  res.json({
    success: true,
    data: {
      language: lang,
      stats: [
        { value: '21',     label_en: 'Live Platforms',  label_es: 'Plataformas en Vivo' },
        { value: '22',     label_en: 'Verticals',       label_es: 'Verticales' },
        { value: '99.9%',  label_en: 'SLA',             label_es: 'SLA' },
        { value: '$300B',  label_en: 'TAM',             label_es: 'TAM' }
      ],
      // Verticals currently live in production. Logos optional — text
      // badges render when logo_url is null.
      partners: [
        { slug: 'camaravirtual', name: 'CamaraVirtual', logo_url: null, url: 'https://camaravirtual.com' },
        { slug: 'planea',        name: 'PLANEA',        logo_url: null, url: null },
        { slug: 'pinaxis',       name: 'Pinaxis',       logo_url: null, url: null },
        { slug: 'hispatec',      name: 'HISPATEC',      logo_url: null, url: null },
        { slug: 'torna-idioma',  name: 'Torna Idioma',  logo_url: null, url: null },
        { slug: 'cw-carriers',   name: 'CW Carriers',   logo_url: null, url: null },
        { slug: 'cali-citylab',  name: 'Cali CityLab',  logo_url: null, url: null },
        { slug: 'pacc-cfl',      name: 'PACC-CFL',      logo_url: null, url: null },
        { slug: 'pcci',          name: 'PCCI',          logo_url: null, url: null },
        { slug: 'surgical-mind', name: 'SurgicalMind',  logo_url: null, url: null },
        { slug: 'visionarium',   name: 'Visionarium',   logo_url: 'https://visionarium.app', url: 'https://visionarium.app' },
        { slug: 'tunjoracing',   name: 'Tunjo Racing',  logo_url: null, url: null }
      ],
      foot_en: 'Trusted by chambers, manufacturers, logistics, healthcare and education leaders across the Americas.',
      foot_es: 'Confiado por cámaras, manufactureras, logística, salud y líderes educativos a través de las Américas.'
    }
  });
});

// POST /voice-trigger-triage
//   Public. Called by the convai agent (via the orb) once it has
//   gathered enough context conversationally. Same shape as
//   /public-triage-preview but also accepts a conversation_summary
//   string the agent built up over the dialogue. We compose the final
//   description from { description, conversation_summary } and reuse
//   the existing triage prompt path so output stays consistent
//   regardless of whether intake came via keyboard or voice.
//
// Why a separate route: the orb's call path is conceptually different
// (the AI agent decides when to call this, not the user) and may grow
// orb-specific telemetry. Keeping them separate lets us evolve voice
// UX without destabilizing the keyboard demo.

// GET /partnership-orb-system-prompt?lang=en|es
//   Public. Returns the complete copy-paste-ready ElevenLabs convai
//   agent configuration: system prompt with the full teaser content
//   baked in, recommended voice settings, first-message greeting, and
//   the client-tool JSON to register. The user pastes these into the
//   ElevenLabs dashboard when creating each agent. Saves them from
//   hand-assembling 6 sections of teaser content.
router.get('/partnership-orb-system-prompt', (req, res) => {
  const lang = (req.query.lang === 'es') ? 'es' : 'en';
  const isEs = lang === 'es';

  // Voice recommendation — pick a premium ElevenLabs multilingual voice
  // appropriate for each language. The user can override in the dashboard.
  const voiceRec = isEs
    ? { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (multilingual, neutral LATAM-friendly accent)' }
    : { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (warm, confident, US English)' };

  const firstMessage = isEs
    ? '¡Hola! Soy el cerebro del Partnership de Digit2AI. Cuéntame sobre tu proyecto — o pregúntame lo que quieras sobre lo que hacemos.'
    : "Hi, I'm the Digit2AI Partnership brain. Tell me about your project, or ask me anything about what we do.";

  const systemPrompt = isEs ? `Eres el cerebro del Partnership de Digit2AI: un copiloto de IA en vivo que acompaña a un Partner durante demos con prospectos. Hablas en español natural con un tono profesional, cálido y directo. Nunca digas "soy un modelo de lenguaje" o frases similares — eres el cerebro de Digit2AI.

## QUÉ ES DIGIT2AI
Digit2AI construye software personalizado impulsado por IA para cualquier negocio que necesite moverse más rápido de lo que su tecnología actual le permite — operaciones, finanzas, ventas, servicio al cliente, operaciones ejecutivas. Lo hacemos con una pila coordinada de agentes de IA especializados llamada **Neural Intelligence**, conectada mediante el estándar abierto **MCP** (Model Context Protocol). Entregamos en DÍAS, no meses.

## LOS 8 AGENTES NEURAL INTELLIGENCE (núcleo)
1. Senior Business Analyst — redacta decks, planes de negocio, investigación de mercado, memos de estrategia
2. Research Brief — búsqueda web + síntesis. Análisis competitivos, revisiones regulatorias, listas cortas de socios
3. Outreach Drafter — escribe correos, mensajes de WhatsApp y seguimientos en inglés o español
4. Architect & Builder — define el alcance, escribe el código, ejecuta UAT, despliega la app en producción
5. Inbox Triage — califica cada solicitud entrante, marca riesgos regulatorios, recomienda continuar o detener
6. Meeting Minutes Synthesizer — convierte notas crudas de llamadas en resumen + items de acción + tareas asignadas
7. Voice AI Agents (Rachel EN, Ana y Lina ES) — contestan teléfonos 24/7
8. Neural Findings — vigila cada proyecto buscando estancamientos, dueños faltantes, hitos vencidos

## 52 ESPECIALISTAS A DISPOSICIÓN (detrás de los 8 principales)
Ingeniería: Senior Full Stack Developer, Frontend, Backend, DevOps/SRE, Database Architect, API Designer, Mobile Engineer, SIT Tester, UAT Coordinator, Production Release Manager, Security Engineer, Performance Engineer.
Datos/ML/Matemáticas: Data Engineer, Data Analyst, Data Scientist, Mathematics SME, ML/AI Engineer, Forecasting Analyst, BI/Dashboard Builder, Statistician.
Negocios/Estrategia: Project Manager, Product Manager, Strategy Consultant, Operations Analyst, Process Improvement, M&A Analyst, Pricing Analyst, Change Management.
Ventas/Marketing/Cliente: Sales Engineer, Lead Qualifier, Content Marketer, SEO Specialist, Brand Strategist, CRM Hygiene Specialist, Customer Success Manager, Churn Prevention Analyst, Onboarding Specialist.
Finanzas/Riesgo: Accountant, FP&A Analyst, Treasury Analyst, Tax Strategist, Auditor, Risk Modeler, Invoice Reconciler.
Legal/Cumplimiento/RRHH: Contract Drafter, NDA/IP Reviewer, Compliance Officer, Regulatory Researcher, Privacy Officer (GDPR/HIPAA), Recruiter, Performance Reviewer, Training Designer.

## ANALOGÍA DEL MÉDICO VS TERMÓMETRO (frase clave)
"La mayoría de la IA es un termómetro — te dice un número. Digit2AI es el médico: **detecta** la fuga, **diagnostica** la causa raíz, **trata** el problema entregando la solución ya en marcha."

## LAS 4 COSAS QUE ENTREGAMOS
1. Software personalizado construido por IA (semanas/días)
2. Senior Business Analyst bajo demanda (decks, planes, análisis)
3. 22 plataformas verticales pre-construidas (CamaraVirtual, PLANEA, Pinaxis, HISPATEC, Torna Idioma, CW Carriers, Cali CityLab)
4. Agentes de IA de voz (Rachel EN, Ana/Lina ES — contestan 24/7)

## FLUJO PROSPECT -> CLIENTE (5 pasos)
1. SUBMIT en digit2ai.com (descripción en sus propias palabras)
2. AI TRIAGE (puntuación de ajuste + recomendación en minutos)
3. REVISIÓN HUMANA (Manuel aprueba/rechaza en 48 horas)
4. KICKOFF (Zoom auto-agendado, Arquitecto escribe el plan, sale el contrato)
5. ENTREGA (Build → SIT → UAT → software en producción en su dominio)

## TU MODO DE OPERAR

Tienes DOS modos según lo que el prospecto te diga:

### Modo A: PREGUNTAS GENERALES sobre Digit2AI
Si el prospecto te pregunta sobre lo que hace Digit2AI, MCP, los agentes, los precios, ejemplos de proyectos, casos de uso, regulaciones — responde con confianza usando el contenido arriba. Sé conciso (2-4 frases por respuesta). Usa la analogía del médico cuando hable de IA en general.

### Modo B: INTAKE DE PROYECTO — REFINAMIENTO SOCRÁTICO + COMPUERTA DE PERMISO

Si el prospecto describe un problema o proyecto, CAMBIA a modo intake. Tu trabajo NO es tomar su primera versión como definitiva — es ayudarle a **reformular** la solicitud en un proyecto claro y listo para construir.

**Fase 1 — Reconoce.** Refleja lo que escuchaste para que sepan que captaste lo importante: "Entendido — entonces están perdiendo unas 10 cargas a la semana porque despacho es manual. Eso es dinero real sobre la mesa." Usa los datos específicos que mencionaron, no resúmenes genéricos.

**Fase 2 — Refina.** Haz 1-3 preguntas cortas que llenen vacíos REALES. El total de preguntas en toda la conversación NUNCA debe pasar de 4. Pregunta solo lo que aún no sabes:
- El dolor específico de negocio (costo, tiempo, ingresos perdidos, fricción)
- Estado actual (qué herramienta o proceso usan hoy)
- Tamaño del equipo y rol de los usuarios
- Cronograma o urgencia
- Pista de presupuesto (opcional — solo si surge natural)

NO preguntes todas. Elige los vacíos. No suenes a formulario.

**Fase 3 — Resume en voz alta.** Cuando tengas suficiente, repite el proyecto refinado en 2 oraciones: "Entonces lo que escucho es: necesitas [X] que [Y], en producción para [Z]. ¿Voy bien?"

**Fase 4 — COMPUERTA DE PERMISO (CRÍTICO).** Después de que confirmen, NO LLAMES al tool \`run_partnership_triage\` en silencio. PREGUNTA permiso primero: "Si te parece bien ese resumen, puedo correr el AI Triage ahora — aparece en pantalla con un veredicto, una puntuación de ajuste, un borrador de solución técnica y una ventana de entrega. Vas a poder editar cualquier cosa antes de enviarlo. ¿Lo corro?"

- Si dicen SÍ (o "adelante", "claro", "hazlo", "vamos a verlo"): di "Perfecto, dame un momento." y LLAMA a \`run_partnership_triage\` con:
  - description: el problema en sus propias palabras (1-2 oraciones)
  - conversation_summary: tu resumen refinado (3-6 oraciones con todo el contexto)
  - language: "es"
  - name, email, company, country: si los obtuviste
- Si dicen NO o quieren seguir refinando: sigue conversando, NO LLAMES al tool.

**Fase 5 — Narra el veredicto.** Cuando el tool regrese (verdict, fit_score, fit_reasoning, project_title, technical_summary, delivery_window), narra natural:
  - go: "Buenas noticias — esto encaja muy bien."
  - poc: "Es prometedor, pero recomiendo empezar con una prueba de concepto."
  - stop: "Voy a ser honesto contigo — esto no encaja bien con lo que hacemos."
  Luego: "Te doy un [X] sobre 10 de ajuste, porque [fit_reasoning]."
  Luego: "Lo llamaríamos [project_title]. [technical_summary]. Entrega estimada: [delivery_window]."

**Fase 6 — RECORDATORIO DE APROBACIÓN (CRÍTICO).** SIEMPRE termina con este recordatorio, en tus palabras: "Ya puedes ver todos los detalles en pantalla. Edita cualquier cosa que necesite ajuste — el título, el resumen, tu información de contacto. Cuando se vea bien, **presiona el botón 'Aceptar y Enviar a digit2ai.com' para enviar esto al equipo de Digit2AI Intake**. Importante: sin ese clic de aprobación, NADA se envía. Una vez que apruebes, Manuel lo revisa en 48 horas."

NUNCA omitas el recordatorio de aprobación. Es el paso MÁS IMPORTANTE de toda la conversación.

## ESTILO CONVERSACIONAL Y ROBUSTEZ

Suenas como un consultor senior atento en una llamada de descubrimiento — cálido, calmado, seguro. Habla en español natural con contracciones y ritmo natural. Reconoce lo que dijo el prospecto antes de avanzar. Nunca suenes a bot de encuesta.

**Ruido de fondo e interrupciones:** Si el audio no es claro, pregunta cortésmente: "Perdón, no te escuché bien — ¿podrías repetir esa parte?" Si tosen, estornudan, o tienen conversación paralela, ignóralo con gracia. Si te interrumpen, deja de hablar y déjalos liderar. Nunca te repitas sin que te lo pidan.

**Ritmo:** 2-4 oraciones por turno. Pausas naturales entre ideas. Esto es voz, no texto — corto y conversacional gana.

**Match de tono:** Si están breves y ocupados, sé conciso. Si están contando historia, dales espacio. Espeja su energía.

## REGLAS
- Nunca inventes números, plazos o nombres de clientes. Si no sabes, di "déjame conectarte con Manuel para confirmar eso".
- Si el prospecto pregunta sobre precios específicos: rangos son "proyecto de cinco cifras a seis cifras bajas dependiendo del alcance" — pero NO te comprometas a un número exacto. Manuel valida en kickoff.
- Si el prospecto pide hablar con un humano: "Perfecto. La forma más rápida es enviar tu solicitud en digit2ai.com — eso te agenda un Zoom con Manuel automáticamente en 48 horas."
- Mantén las respuestas cortas. Esto es voz, no texto. 2-4 frases por turno. Pausas naturales.
` : `You are the Digit2AI Partnership brain: a live AI co-pilot that accompanies a Partner during demos with prospects. You speak in natural English with a professional, warm, direct tone. Never say "I'm a language model" or similar — you are the Digit2AI brain.

## WHAT IS DIGIT2AI
Digit2AI builds custom AI-powered software for any business that needs to act faster than its current tooling allows — operations, finance, sales, customer service, executive ops. We do it with a coordinated stack of specialized AI agents called **Neural Intelligence**, wired through the open **MCP** (Model Context Protocol) standard. We deliver in DAYS, not months.

## THE 8 CORE NEURAL INTELLIGENCE AGENTS
1. Senior Business Analyst — drafts decks, business plans, market research, strategy memos
2. Research Brief — web search + synthesis. Competitive scans, regulatory checks, partner shortlists
3. Outreach Drafter — writes emails, WhatsApp messages, follow-ups in EN or ES
4. Architect & Builder — scopes the build, writes code, runs UAT, ships the live app
5. Inbox Triage — scores every incoming project request, flags regulatory risks, recommends go/no-go
6. Meeting Minutes Synthesizer — turns raw call notes into summary + action items + auto-assigned tasks
7. Voice AI Agents (Rachel EN, Ana & Lina ES) — answer phones 24/7
8. Neural Findings — watches every project for stalls, missing owners, overdue milestones

## 52 SPECIALISTS ON CALL (behind the 8 core)
Engineering: Senior Full Stack Developer, Frontend, Backend, DevOps/SRE, Database Architect, API Designer, Mobile Engineer, SIT Tester, UAT Coordinator, Production Release Manager, Security Engineer, Performance Engineer.
Data/ML/Math: Data Engineer, Data Analyst, Data Scientist, Mathematics SME, ML/AI Engineer, Forecasting Analyst, BI/Dashboard Builder, Statistician.
Business/Strategy: Project Manager, Product Manager, Strategy Consultant, Operations Analyst, Process Improvement, M&A Analyst, Pricing Analyst, Change Management.
Sales/Marketing/Customer: Sales Engineer, Lead Qualifier, Content Marketer, SEO Specialist, Brand Strategist, CRM Hygiene Specialist, Customer Success Manager, Churn Prevention Analyst, Onboarding Specialist.
Finance/Risk: Accountant, FP&A Analyst, Treasury Analyst, Tax Strategist, Auditor, Risk Modeler, Invoice Reconciler.
Legal/Compliance/HR: Contract Drafter, NDA/IP Reviewer, Compliance Officer, Regulatory Researcher, Privacy Officer (GDPR/HIPAA), Recruiter, Performance Reviewer, Training Designer.

## THE DOCTOR VS THERMOMETER FRAMING (signature line)
"Most AI is a thermometer — it tells you a number. Digit2AI is the doctor: **detects** the leak, **diagnoses** the root cause, **treats** the problem by shipping the fix already in motion."

## THE 4 THINGS WE DELIVER
1. AI-built custom software (days)
2. Senior Business Analyst on tap (decks, plans, analyses)
3. 22 pre-built vertical platforms (CamaraVirtual, PLANEA, Pinaxis, HISPATEC, Torna Idioma, CW Carriers, Cali CityLab)
4. Voice AI agents (Rachel EN, Ana/Lina ES — answer phones 24/7)

## PROSPECT -> CUSTOMER FLOW (5 steps)
1. SUBMIT at digit2ai.com (description in their own words)
2. AI TRIAGE (fit score + recommendation in minutes)
3. HUMAN REVIEW (Manuel approves/rejects within 48 hours)
4. KICKOFF (auto-scheduled Zoom, Architect writes the plan, contract goes out)
5. SHIP (Build → SIT → UAT → live software on their domain)

## YOUR OPERATING MODES

You have TWO modes based on what the prospect says:

### Mode A: GENERAL QUESTIONS about Digit2AI
If the prospect asks about what Digit2AI does, MCP, the agents, pricing, example projects, use cases, regulations — answer confidently using the content above. Be concise (2-4 sentences per reply). Use the doctor analogy when talking about AI in general.

### Mode B: PROJECT INTAKE — SOCRATIC REFINEMENT + PERMISSION GATE

If the prospect describes a problem or project, SWITCH to intake mode. Your job is NOT to take their first version at face value — it's to help them **reshape** the request into a clear, build-ready project.

**Phase 1 — Acknowledge.** Reflect specifics back so they know you heard them: "Got it — so you're losing about 10 loads a week because dispatch is manual. That's real money on the table." Use the specific details they mentioned, not generic summaries.

**Phase 2 — Refine.** Ask 1-3 short questions that fill REAL gaps. Total questions across the whole intake should NEVER exceed 4. Only ask what you don't already know:
- The specific business pain (cost, time, lost revenue, friction)
- Current state (what tool or process is in place today)
- Team size and role of users
- Timeline / urgency
- Budget signal (optional — only if it comes up naturally)

Do NOT ask all of these. Pick the gaps. Don't sound like a form.

**Phase 3 — Summarize aloud.** When you have enough, restate the refined project in 2 sentences: "So what I'm hearing is: you need [X] that [Y], live by [Z]. Did I get that right?"

**Phase 4 — PERMISSION GATE (CRITICAL).** After they confirm, do NOT call the \`run_partnership_triage\` tool silently. ASK FIRST: "If that sounds right, I can run the AI triage now — it'll show up on screen with a verdict, a fit score, a draft technical solution and delivery window. You'll be able to edit any of it before sending it in. Want me to run it?"

- If they say YES (or "go ahead", "sure", "do it", "let's see it"): say "Perfect, give me a moment." and CALL \`run_partnership_triage\` with:
  - description: the prospect's problem in their own words (1-2 sentences)
  - conversation_summary: your refined summary (3-6 sentences with all context)
  - language: "en"
  - name, email, company, country: if obtained
- If they say NO or want to keep refining: keep talking, do NOT call the tool.

**Phase 5 — Narrate the verdict.** When the tool returns (verdict, fit_score, fit_reasoning, project_title, technical_summary, delivery_window), narrate naturally:
  - go: "Good news — this is a strong fit."
  - poc: "It's promising, but I'd recommend starting with a proof of concept."
  - stop: "I'll be honest with you — this isn't a great fit for what we do."
  Then: "I'd put it at [X] out of 10 fit, because [fit_reasoning]."
  Then: "We'd call it [project_title]. [technical_summary]. Estimated delivery: [delivery_window]."

**Phase 6 — APPROVAL REMINDER (CRITICAL).** ALWAYS end with this reminder, in your own words: "You can see all the details on screen now. Feel free to edit anything that needs adjusting — the title, the summary, your contact info. When it looks right, **click the 'Accept & Submit to digit2ai.com' button to send this to the Digit2AI Intake team**. Important: without that approval click, NOTHING gets sent. Once you click, Manuel reviews it within 48 hours."

NEVER skip the approval reminder. It is the MOST IMPORTANT step of the whole conversation.

## CONVERSATIONAL STYLE & ROBUSTNESS

You sound like a thoughtful senior consultant on a discovery call — warm, calm, confident. Speak in plain spoken English with contractions and natural rhythm. Acknowledge what the prospect said before moving on. Never sound like a survey bot.

**Background noise & interruptions:** If audio is unclear, politely ask: "Sorry, I missed that — could you say that again?" If they cough, sneeze, or have a side conversation, ignore it gracefully. If they interrupt you, stop talking and let them lead. Never repeat yourself unprompted.

**Pacing:** 2-4 sentences per turn. Pause naturally between thoughts. This is voice, not text — short and conversational beats long and complete.

**Tone matching:** If they're brief and busy, be crisp. If they're storytelling, give them space. Mirror their energy.

## RULES
- Never invent numbers, timelines, or customer names. If you don't know, say "let me connect you with Manuel to confirm that".
- If the prospect asks about specific pricing: ranges are "five-figure to low six-figure project depending on scope" — but DON'T commit to an exact number. Manuel validates at kickoff.
- If the prospect asks to talk to a human: "Perfect. The fastest path is to submit your request at digit2ai.com — that auto-schedules a Zoom with Manuel within 48 hours."
- Keep replies short. This is voice, not text. 2-4 sentences per turn. Natural pauses.
`;

  const clientTool = {
    name: 'run_partnership_triage',
    description: 'Run the AI Triage on the prospect\'s project description. Call this once you have gathered enough context through conversation (typically after 2-4 clarifying questions). The triage returns a verdict, fit score, and technical solution sketch that you should narrate back to the prospect.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'The prospect\'s problem statement in their own words (1-2 sentences).' },
        conversation_summary: { type: 'string', description: 'Your summary of everything you learned in the conversation (3-6 sentences). Include industry, problem, current state, timeline, budget hints, regulatory context.' },
        language: { type: 'string', enum: ['en', 'es'], description: 'The language to respond in.' },
        name: { type: 'string', description: 'Prospect\'s name if obtained, otherwise omit.' },
        email: { type: 'string', description: 'Prospect\'s email if obtained, otherwise omit.' },
        company: { type: 'string', description: 'Company name if obtained, otherwise omit.' },
        country: { type: 'string', description: 'Country if obtained, otherwise omit.' }
      },
      required: ['conversation_summary', 'language']
    }
  };

  res.json({
    success: true,
    data: {
      language: lang,
      agent_name_suggested: isEs ? 'Digit2AI Partnership Brain (ES)' : 'Digit2AI Partnership Brain (EN)',
      voice_recommendation: voiceRec,
      first_message: firstMessage,
      system_prompt: systemPrompt,
      client_tool: clientTool,
      env_var_to_set: isEs ? 'ELEVENLABS_CONVAI_PARTNERSHIP_ES' : 'ELEVENLABS_CONVAI_PARTNERSHIP_EN',
      setup_steps: [
        '1. Open https://elevenlabs.io/app/conversational-ai → Create New Agent',
        `2. Name: ${isEs ? 'Digit2AI Partnership Brain (ES)' : 'Digit2AI Partnership Brain (EN)'}`,
        `3. Voice: ${voiceRec.name} (voice_id: ${voiceRec.voice_id}) — or any other premium ${isEs ? 'Spanish' : 'English'} voice you prefer`,
        '4. Paste the system_prompt from this response into the agent\'s System Prompt field',
        '5. Paste the first_message into the agent\'s First Message field',
        '6. Under Tools tab: add a Client Tool with the JSON from client_tool field',
        '7. Save the agent → copy the Agent ID from the agent detail page',
        `8. In Render dashboard: set env var ${isEs ? 'ELEVENLABS_CONVAI_PARTNERSHIP_ES' : 'ELEVENLABS_CONVAI_PARTNERSHIP_EN'} = <agent_id>`,
        '9. Redeploy the service → reload the champion-teaser page → click the orb → it should connect'
      ]
    }
  });
});

// Default convai agent IDs — created via the ElevenLabs API on
// 2026-05-31, configured with the auto-generated teaser system prompt
// + run_partnership_triage client tool. Env vars override these so the
// user can swap to a custom agent without code change, but out-of-box
// the orb works on first deploy with these defaults.
const DEFAULT_CONVAI_EN = 'agent_7801ksz3yfcaedzbmt500a01br0k';
const DEFAULT_CONVAI_ES = 'agent_5001ksz3z3tteabvtgh6fjgz7yw8';

router.get('/partnership-orb-config', (req, res) => {
  const lang = (req.query.lang === 'es') ? 'es' : 'en';
  const agentId = lang === 'es'
    ? (process.env.ELEVENLABS_CONVAI_PARTNERSHIP_ES || DEFAULT_CONVAI_ES)
    : (process.env.ELEVENLABS_CONVAI_PARTNERSHIP_EN || DEFAULT_CONVAI_EN);
  res.json({
    success: true,
    data: {
      language: lang,
      agent_id: agentId,
      configured: !!agentId,
      // Hint to the client whether the orb is even usable. Frontend
      // falls back to the textarea path when configured = false.
      fallback_reason: agentId ? null : 'agent_id_not_set'
    }
  });
});

router.post('/voice-trigger-triage', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const rl = _triageRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many triage requests from this IP. Try again in ${Math.ceil(rl.retryInSec / 60)} minute(s).`,
        retry_in_seconds: rl.retryInSec
      });
    }

    const body = req.body || {};
    const rawDesc = String(body.description || '').trim();
    const summary = String(body.conversation_summary || '').trim();
    // Compose the final description. If the agent only sent a summary
    // (typical case — the orb conversation produces a summary, not a
    // raw description), use it. If both, concatenate so the triage
    // sees the original ask + the agent's distilled context.
    let description = rawDesc;
    if (summary) {
      description = rawDesc
        ? rawDesc + '\n\n— Conversation context —\n' + summary
        : summary;
    }
    if (!description || description.length < 30) {
      return res.status(400).json({ success: false, error: 'Description (or conversation_summary) must be at least 30 characters.' });
    }
    if (description.length > 8000) {
      return res.status(400).json({ success: false, error: 'Description must be under 8000 characters.' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ success: false, error: 'Triage service not configured (no API key on server).' });
    }
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {
      return res.status(503).json({ success: false, error: 'Triage SDK unavailable on server.' });
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const lang = body.language === 'en' || body.language === 'es' ? body.language : _detectLang(description);
    const userMsg = `Today is ${new Date().toISOString().slice(0, 10)}.

RESPONSE LANGUAGE: ${lang === 'es' ? 'Respond entirely in fluent business Spanish with proper orthography (tildes, ñ, ¿¡). The deliverable_type enum strings stay in English (they are code identifiers).' : 'Respond in English.'}

PROSPECT CONTEXT
- Name: ${body.name || '(not provided)'}
- Company: ${body.company || '(not provided)'}
- Country: ${body.country || '(not provided)'}
- Source: voice conversation via Partnership orb

PROBLEM DESCRIPTION (assembled from the prospect's voice conversation with the Partnership AI brain)
${description}

Produce the triage verdict + technical solution as a single JSON object. Respond with the JSON only.`;

    const MODEL = process.env.TRIAGE_PREVIEW_MODEL || 'claude-sonnet-4-6';
    let resp;
    try {
      resp = await client.messages.create({
        model: MODEL,
        max_tokens: 2500,
        system: TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }]
      });
    } catch (err) {
      console.error('[D2AI-Intake] voice-trigger-triage Claude call failed:', err.message);
      return res.status(502).json({ success: false, error: 'Triage upstream call failed. Please try again.' });
    }
    const rawText = resp?.content?.[0]?.text || '';
    let parsed = _safeParseJson(rawText);
    if (!parsed) {
      try {
        const retry = await client.messages.create({
          model: MODEL,
          max_tokens: 2500,
          system: TRIAGE_SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: userMsg },
            { role: 'assistant', content: rawText || '(empty)' },
            { role: 'user', content: 'Your last response was not valid JSON. Reply again with the COMPLETE JSON object only, no preamble, no markdown fences. Begin with { and end with }.' }
          ]
        });
        parsed = _safeParseJson(retry?.content?.[0]?.text || '');
      } catch (_) {}
    }
    if (!parsed) {
      return res.status(502).json({ success: false, error: 'Triage returned a malformed response.' });
    }

    const ts = parsed.technical_solution || {};
    const out = {
      language: parsed.language === 'es' ? 'es' : 'en',
      project_title_suggested: String(parsed.project_title_suggested || '').trim().slice(0, 120) || 'Untitled Project',
      verdict: ['go', 'poc', 'stop'].includes(parsed.verdict) ? parsed.verdict : 'poc',
      fit_score: Math.max(0, Math.min(10, Number(parsed.fit_score) || 5)),
      fit_reasoning: String(parsed.fit_reasoning || '').trim(),
      problem_in_our_words: String(parsed.problem_in_our_words || '').trim(),
      technical_solution: {
        summary: String(ts.summary || '').trim(),
        agents_involved: Array.isArray(ts.agents_involved) ? ts.agents_involved.map(a => String(a).trim()).filter(Boolean) : [],
        what_we_build: Array.isArray(ts.what_we_build) ? ts.what_we_build.map(a => String(a).trim()).filter(Boolean) : [],
        data_sources_via_mcp: Array.isArray(ts.data_sources_via_mcp) ? ts.data_sources_via_mcp.map(a => String(a).trim()).filter(Boolean) : [],
        delivery_window: String(ts.delivery_window || '').trim()
      },
      week_1_deliverables: Array.isArray(parsed.week_1_deliverables) ? parsed.week_1_deliverables.map(a => String(a).trim()).filter(Boolean) : [],
      verify_flags: Array.isArray(parsed.verify_flags) ? parsed.verify_flags.map(a => String(a).trim()).filter(Boolean) : [],
      // Echo the original description back so the orb client can hydrate
      // the keyboard-demo textarea (#d-desc) — otherwise the Accept &
      // Submit handler reads an empty value and the Intake endpoint
      // rejects with "problem is required".
      original_description: description,
      model: MODEL,
      source: 'voice'
    };

    res.json({ success: true, data: out });
  } catch (err) {
    console.error('[D2AI-Intake] voice-trigger-triage error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// VOICE-NOTE UPLOAD -> TRANSCRIPTION (ElevenLabs Scribe STT)
// =====================================================
// Champions collect project requests by WhatsApp voice note (to 813-641-4177).
// They save the audio and drop it into the "Upload a voice note" box on the
// champion teaser. We transcribe it with ElevenLabs Scribe and hand the text
// straight back so it can populate the same #d-desc textarea that the typed
// demo and the live orb already feed into /public-triage-preview.
//
// POST /public/transcribe-voice-note  (multipart/form-data)
//   field "audio": the voice note (ogg/opus, m4a, mp3, wav, webm) <= 25 MB
//   field "language" (optional): "en" | "es" hint passed to Scribe
//   -> { success, transcript, language, duration_seconds? }
const _multer = require('multer');
const _voiceUpload = _multer({
  storage: _multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB — well above any WhatsApp voice note
});
// ElevenLabs Scribe accepts a broad set; we additionally allow common WhatsApp/phone formats.
const _ALLOWED_AUDIO = new Set([
  'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
  'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm', 'video/mp4',
  'application/octet-stream'
]);

router.post('/public/transcribe-voice-note', (req, res) => {
  _voiceUpload.single('audio')(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        const tooBig = uploadErr.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({
          success: false,
          error: tooBig ? 'Audio file is larger than 25 MB. Trim or re-record the voice note.' : 'Could not read the uploaded audio.'
        });
      }

      const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const rl = _triageRateLimit(ip);
      if (!rl.allowed) {
        return res.status(429).json({ success: false, error: `Too many requests. Try again in ${rl.retryInSec}s.` });
      }

      if (!req.file || !req.file.buffer || !req.file.buffer.length) {
        return res.status(400).json({ success: false, error: 'No audio file received. Attach a voice note and try again.' });
      }

      const mime = (req.file.mimetype || '').toLowerCase();
      if (!_ALLOWED_AUDIO.has(mime)) {
        return res.status(415).json({ success: false, error: `Unsupported audio type "${mime || 'unknown'}". Send a WhatsApp voice note (ogg/opus), m4a, mp3, or wav.` });
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ success: false, error: 'Transcription service is not configured.' });
      }

      // ElevenLabs Scribe STT — multipart upload. Node 18+ provides global
      // fetch / FormData / Blob, matching the xi-api-key pattern already used
      // for ElevenLabs TTS elsewhere in the app.
      const langHint = (req.body && String(req.body.language || '').toLowerCase()) || '';
      const form = new FormData();
      form.append('file', new Blob([req.file.buffer], { type: mime }), req.file.originalname || 'voice-note');
      form.append('model_id', 'scribe_v1');
      if (langHint === 'es') form.append('language_code', 'spa');
      else if (langHint === 'en') form.append('language_code', 'eng');

      const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form
      });

      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[D2AI-Intake] Scribe STT failed:', r.status, detail.slice(0, 500));
        return res.status(502).json({ success: false, error: 'Transcription failed. Please try the file again or paste the text manually.' });
      }

      const out = await r.json();
      const transcript = (out && typeof out.text === 'string') ? out.text.trim() : '';
      if (!transcript) {
        return res.status(422).json({ success: false, error: 'No speech detected in that audio. Re-record the voice note and try again.' });
      }

      // Map Scribe's ISO-639-3 code back to the page's en/es toggle when possible.
      let language = langHint || '';
      if (!language && out.language_code) {
        language = (out.language_code === 'spa' || out.language_code === 'es') ? 'es'
          : (out.language_code === 'eng' || out.language_code === 'en') ? 'en' : '';
      }

      return res.json({
        success: true,
        transcript,
        language: language || undefined,
        duration_seconds: (out && typeof out.audio_duration_secs === 'number') ? out.audio_duration_secs : undefined
      });
    } catch (err) {
      console.error('[D2AI-Intake] transcribe-voice-note error:', err);
      res.status(500).json({ success: false, error: 'Unexpected error while transcribing. Please try again.' });
    }
  });
});

// =====================================================
// MAGIC-LINK IDENTIFY
// =====================================================
// GET /share/:token/discussion — no auth. Returns a single project (and its
// triage Q&A) for project-scoped open-access share tokens. Mirrors the shape
// of GET /batches/:id so batch.html can render with the same code paths.
router.get('/share/:token/discussion', async (req, res) => {
  try {
    const tokenStr = String(req.params.token || '').trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(tokenStr)) return res.status(404).json({ success: false, error: 'Invalid token' });
    const accessToken = await CompanyAccessToken.findOne({ where: { token: tokenStr } });
    if (!accessToken) return res.status(404).json({ success: false, error: 'Invalid token' });
    if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
      return res.status(403).json({ success: false, error: 'Link expired' });
    }
    if (!accessToken.project_id) {
      return res.status(400).json({ success: false, error: 'Token is not project-scoped — use /batches flow' });
    }
    const project = await Project.findOne({
      where: { id: accessToken.project_id, workspace_id: 1 },
      include: [
        { model: ProjectQuestion, as: 'questions', include: [{ model: QuestionResponse, as: 'responses' }] },
        { model: ProjectComment, as: 'comments' }
      ]
    });
    if (!project) return res.status(404).json({ success: false, error: 'project_not_found' });

    accessToken.last_used_at = new Date();
    await accessToken.save();

    // Wrap in a synthetic "batch + intakes" shape so the existing batch.html
    // render code can iterate over data.projects[].project without changes.
    res.json({
      success: true,
      data: {
        batch: { id: null, title: project.name, status: project.intake_status || 'pending_review', company: null, meeting_date: null },
        projects: [{
          intake_status: project.intake_status || 'pending_review',
          feasibility: null,
          risk_level: null,
          risk_notes: null,
          contacts_notes: null,
          priority_avg: null,
          project: project.toJSON()
        }]
      }
    });
  } catch (err) {
    console.error('[D2AI-Intake] share/discussion error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /share/:token/triage-answer — no auth. Open-access submission of an
// answer to a specific AI Triage stakeholder question. Records the answer
// as a comment with triage_question_index set. Caller may supply an
// optional name + email for attribution; otherwise stored as Anonymous.
router.post('/share/:token/triage-answer', async (req, res) => {
  try {
    const tokenStr = String(req.params.token || '').trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(tokenStr)) return res.status(404).json({ success: false, error: 'Invalid token' });
    const accessToken = await CompanyAccessToken.findOne({ where: { token: tokenStr } });
    if (!accessToken) return res.status(404).json({ success: false, error: 'Invalid token' });
    if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
      return res.status(403).json({ success: false, error: 'Link expired' });
    }
    if (!accessToken.project_id) {
      return res.status(400).json({ success: false, error: 'Token is not project-scoped' });
    }
    const { question_index, question_text, answer_text, language, author_name, author_email } = req.body || {};
    if (typeof question_index !== 'number' || Number.isNaN(question_index)) {
      return res.status(400).json({ success: false, error: 'question_index (number) required' });
    }
    if (!answer_text || !String(answer_text).trim()) {
      return res.status(400).json({ success: false, error: 'answer_text required' });
    }
    const comment = await ProjectComment.create({
      project_id: accessToken.project_id,
      author_email: author_email ? String(author_email).slice(0, 255) : (accessToken.grantee_email || null),
      author_name: author_name ? String(author_name).slice(0, 255) : (accessToken.grantee_name || 'Anonymous'),
      body: String(answer_text).trim(),
      triage_question_index: Math.max(0, Math.min(50, Math.round(question_index))),
      triage_question_text: question_text ? String(question_text).slice(0, 1000) : null,
      triage_language: language === 'es' ? 'es' : (language === 'en' ? 'en' : null)
    });
    accessToken.last_used_at = new Date();
    await accessToken.save();
    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    console.error('[D2AI-Intake] share/triage-answer error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /share/:token/info — lightweight, no auth. Lets the magic-link page
// decide its UX before rendering. Returns the token kind so project-scoped
// tokens (open-access shares) can skip the identify gate, and batch-scoped
// tokens (intake batches) keep the existing email gate.
router.get('/share/:token/info', async (req, res) => {
  try {
    const tokenStr = String(req.params.token || '').trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(tokenStr)) return res.status(404).json({ success: false, error: 'Invalid token' });
    const accessToken = await CompanyAccessToken.findOne({ where: { token: tokenStr } });
    if (!accessToken) return res.status(404).json({ success: false, error: 'Invalid token' });
    if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
      return res.status(403).json({ success: false, error: 'Link expired' });
    }
    res.json({
      success: true,
      kind: accessToken.project_id ? 'project' : (accessToken.batch_id ? 'batch' : 'unknown'),
      project_id: accessToken.project_id || null,
      batch_id: accessToken.batch_id || null,
      company_id: accessToken.company_id || null,
      requires_identify: !accessToken.project_id
    });
  } catch (err) {
    console.error('[D2AI-Intake] share/info error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /share/:token/identify { email, name }
//   -> returns { jwt, company_id, batch_id, role, expires_at }
router.post('/share/:token/identify', async (req, res) => {
  try {
    const { token } = req.params;
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email required' });

    const accessToken = await CompanyAccessToken.findOne({ where: { token } });
    if (!accessToken) return res.status(404).json({ success: false, error: 'Invalid share link' });

    if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
      return res.status(403).json({ success: false, error: 'Share link expired' });
    }

    // Persist identity (first time only) so the audit trail is locked
    if (!accessToken.grantee_email) {
      accessToken.grantee_email = email;
      accessToken.grantee_name = name || email;
    }
    accessToken.last_used_at = new Date();
    await accessToken.save();

    const sessionToken = jwt.sign(
      {
        aud: TOKEN_AUDIENCE,
        company_id: accessToken.company_id,
        batch_id: accessToken.batch_id,
        access_token_id: accessToken.id,
        email,
        name: name || email,
        role: accessToken.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      jwt: sessionToken,
      company_id: accessToken.company_id,
      batch_id: accessToken.batch_id,
      role: accessToken.role,
      email,
      name: name || email
    });
  } catch (err) {
    console.error('[D2AI-Intake] identify error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// AUTH MIDDLEWARE
// Accepts either:
//   (a) admin JWT (CRM userId/email -> auto-provisions UserAccess admin)
//   (b) intake share JWT (aud=d2ai-intake, scoped to company_id)
// Sets req.identity = { source, email, name, company_id?, role }
// =====================================================
async function intakeAuth(req, res, next) {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Missing bearer token' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (decoded.aud === TOKEN_AUDIENCE) {
      // share token
      req.identity = {
        source: 'share',
        email: decoded.email,
        name: decoded.name,
        company_id: decoded.company_id,
        batch_id: decoded.batch_id,
        role: decoded.role || 'reviewer'
      };
    } else {
      // admin token (existing CRM auth pattern)
      req.identity = {
        source: 'admin',
        email: decoded.email,
        name: decoded.businessName || decoded.email,
        role: 'admin'
      };
    }
    next();
  } catch (err) {
    console.error('[D2AI-Intake] auth error:', err);
    res.status(500).json({ success: false, error: 'Auth failed' });
  }
}

function isAdminIdentity(req) {
  return !!req.identity && (req.identity.source === 'admin' || req.identity.role === 'admin');
}

function requireAdmin(req, res, next) {
  if (isAdminIdentity(req)) return next();
  return res.status(403).json({ success: false, error: 'Admin access required' });
}

// Verify the requested resource belongs to the identity's company scope.
// Admin (CRM JWT or admin-role share token): always allowed.
// Reviewer share token: company_id must match.
function assertCompanyScope(req, resourceCompanyId) {
  if (!req.identity) return false;
  if (isAdminIdentity(req)) return true;
  return Number(resourceCompanyId) === Number(req.identity.company_id);
}

async function loadProjectAndAssertScope(req, projectId) {
  const project = await Project.findByPk(projectId, {
    include: [{ model: ProjectIntake, as: 'intake' }]
  });
  if (!project) return { error: 404, message: 'Project not found' };
  if (!assertCompanyScope(req, project.company_id)) {
    return { error: 403, message: 'Forbidden: cross-company access denied' };
  }
  return { project };
}

async function recomputePriorityAvg(project_id) {
  const votes = await PriorityVote.findAll({ where: { project_id } });
  if (!votes.length) {
    await ProjectIntake.update({ priority_avg: null }, { where: { project_id } });
    return null;
  }
  const avg = votes.reduce((s, v) => s + Number(v.score), 0) / votes.length;
  const rounded = Math.round(avg * 100) / 100;
  await ProjectIntake.update({ priority_avg: rounded }, { where: { project_id } });
  return rounded;
}

// =====================================================
// BATCHES
// =====================================================

// Create batch (admin)
router.post('/batches', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const { company_id, title, meeting_date, notes } = req.body;
    if (!company_id || !title) return res.status(400).json({ success: false, error: 'company_id and title required' });
    const company = await Company.findByPk(company_id);
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    const batch = await IntakeBatch.create({
      workspace_id: 1,
      company_id,
      title,
      meeting_date: meeting_date || null,
      submitted_by_email: req.identity.email,
      submitted_by_name: req.identity.name,
      status: 'draft',
      notes: notes || null
    });
    res.status(201).json({ success: true, data: batch });
  } catch (err) {
    console.error('[D2AI-Intake] create batch:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// List batches: admin sees all (filter by company_id), share sees only own
router.get('/batches', intakeAuth, async (req, res) => {
  try {
    const where = { workspace_id: 1 };
    if (req.identity.source === 'admin') {
      if (req.query.company_id) where.company_id = req.query.company_id;
    } else {
      where.company_id = req.identity.company_id;
    }
    const batches = await IntakeBatch.findAll({
      where,
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: batches });
  } catch (err) {
    console.error('[D2AI-Intake] list batches:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get full batch (with all projects + intake meta + questions + comments + votes)
router.get('/batches/:id', intakeAuth, async (req, res) => {
  try {
    const batch = await IntakeBatch.findByPk(req.params.id, {
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }]
    });
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    if (!assertCompanyScope(req, batch.company_id)) {
      return res.status(403).json({ success: false, error: 'Forbidden: cross-company access denied' });
    }

    // Pull all project intakes for this batch, with parent project
    const intakes = await ProjectIntake.findAll({
      where: { batch_id: batch.id },
      include: [
        {
          model: Project,
          as: 'project',
          include: [
            { model: ProjectQuestion, as: 'questions', include: [{ model: QuestionResponse, as: 'responses' }] },
            { model: ProjectComment, as: 'comments' },
            { model: PriorityVote, as: 'priority_votes' }
          ]
        }
      ],
      order: [['id', 'ASC']]
    });

    res.json({ success: true, data: { batch, projects: intakes } });
  } catch (err) {
    console.error('[D2AI-Intake] get batch:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add project to batch (admin)
router.post('/batches/:id/projects', intakeAuth, requireAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const batch = await IntakeBatch.findByPk(req.params.id, { transaction: t });
    if (!batch) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }
    const { name, description, feasibility, feasibility_notes, risk_level, risk_notes, contacts_notes, questions } = req.body;
    if (!name) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'name required' });
    }
    const project = await Project.create({
      workspace_id: 1,
      company_id: batch.company_id,
      name,
      description: description || null,
      status: 'planning',
      stage: 'initiation'
    }, { transaction: t });
    const intake = await ProjectIntake.create({
      project_id: project.id,
      batch_id: batch.id,
      feasibility: feasibility || null,
      feasibility_notes: feasibility_notes || null,
      risk_level: risk_level || null,
      risk_notes: risk_notes || null,
      contacts_notes: contacts_notes || null,
      intake_status: 'discussion'
    }, { transaction: t });
    if (Array.isArray(questions)) {
      for (let i = 0; i < questions.length; i++) {
        await ProjectQuestion.create({
          project_id: project.id,
          question_text: questions[i],
          position: i,
          created_by_email: req.identity.email
        }, { transaction: t });
      }
    }
    await t.commit();
    res.status(201).json({ success: true, data: { project, intake } });
  } catch (err) {
    await t.rollback();
    console.error('[D2AI-Intake] add project to batch:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PROJECT INTAKE PATCH (feasibility, risk, status)
// =====================================================
router.patch('/projects/:id/intake', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });

    const allowed = ['feasibility', 'feasibility_notes', 'risk_level', 'risk_notes', 'contacts_notes', 'intake_status'];
    const updates = {};
    for (const key of allowed) if (key in req.body) updates[key] = req.body[key];

    // Only admin can change intake_status to 'approved'/'rejected'/'converted'
    if (updates.intake_status && req.identity.source !== 'admin' && ['approved', 'rejected', 'converted'].includes(updates.intake_status)) {
      return res.status(403).json({ success: false, error: 'Only admin can finalize intake_status' });
    }

    await ProjectIntake.update(updates, { where: { project_id: req.params.id } });
    const fresh = await ProjectIntake.findOne({ where: { project_id: req.params.id } });
    res.json({ success: true, data: fresh });
  } catch (err) {
    console.error('[D2AI-Intake] patch intake:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// QUESTIONS
// =====================================================
router.post('/projects/:id/questions', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });

    const { question_text, position } = req.body;
    if (!question_text) return res.status(400).json({ success: false, error: 'question_text required' });
    const q = await ProjectQuestion.create({
      project_id: req.params.id,
      question_text,
      position: position || 0,
      created_by_email: req.identity.email
    });
    res.status(201).json({ success: true, data: q });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/questions/:id', intakeAuth, async (req, res) => {
  try {
    const q = await ProjectQuestion.findByPk(req.params.id);
    if (!q) return res.status(404).json({ success: false, error: 'Question not found' });
    const r = await loadProjectAndAssertScope(req, q.project_id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const { question_text, position } = req.body;
    if (question_text !== undefined) q.question_text = question_text;
    if (position !== undefined) q.position = position;
    await q.save();
    res.json({ success: true, data: q });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/questions/:id', intakeAuth, async (req, res) => {
  try {
    const q = await ProjectQuestion.findByPk(req.params.id);
    if (!q) return res.status(404).json({ success: false, error: 'Question not found' });
    const r = await loadProjectAndAssertScope(req, q.project_id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    if (req.identity.source !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    await q.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add response to a question
router.post('/questions/:id/responses', intakeAuth, async (req, res) => {
  try {
    const q = await ProjectQuestion.findByPk(req.params.id);
    if (!q) return res.status(404).json({ success: false, error: 'Question not found' });
    const r = await loadProjectAndAssertScope(req, q.project_id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });

    const { response_text } = req.body;
    if (!response_text) return res.status(400).json({ success: false, error: 'response_text required' });
    const resp = await QuestionResponse.create({
      question_id: q.id,
      responder_email: req.identity.email,
      responder_name: req.identity.name,
      response_text
    });
    res.status(201).json({ success: true, data: resp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// COMMENTS
// =====================================================
router.get('/projects/:id/comments', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const comments = await ProjectComment.findAll({
      where: { project_id: req.params.id },
      order: [['created_at', 'ASC']]
    });
    res.json({ success: true, data: comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/projects/:id/comments', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const { body, parent_comment_id } = req.body;
    if (!body) return res.status(400).json({ success: false, error: 'body required' });
    const c = await ProjectComment.create({
      project_id: req.params.id,
      parent_comment_id: parent_comment_id || null,
      author_email: req.identity.email,
      author_name: req.identity.name,
      body
    });

    // If the project is in UAT (uat_ready or uat_revision), a comment from a
    // stakeholder counts as feedback that needs rework. Fire the orchestrator
    // hook so Manuel gets an email + the project phase flips to uat_revision.
    try {
      const project = r.project || await Project.findByPk(req.params.id);
      if (project && ['uat_ready', 'uat_revision'].includes(project.workflow_phase)) {
        const pipeline = require('../services/architectPipeline');
        setImmediate(() => {
          pipeline.onUatFeedback(project, {
            commenter_email: req.identity.email,
            commenter_name: req.identity.name,
            comment_text: body
          }).catch(e => console.error('[D2AI] onUatFeedback failed:', e.message));
        });
      }
    } catch (e) {
      console.error('[D2AI] uat-feedback hook error:', e.message);
    }

    res.status(201).json({ success: true, data: c });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// UAT approval (magic-link, token-gated)
// =====================================================
// POST /projects/:id/uat-approve  — stakeholder clicks Approve on the magic-link page
router.post('/projects/:id/uat-approve', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const project = r.project || await Project.findByPk(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const pipeline = require('../services/architectPipeline');
    await pipeline.onUatApproval(project, req.identity.email);
    res.json({ success: true, data: project });
  } catch (err) {
    console.error('[D2AI] uat-approve error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PRIORITY VOTES
// =====================================================
router.get('/projects/:id/votes', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const votes = await PriorityVote.findAll({
      where: { project_id: req.params.id },
      order: [['created_at', 'ASC']]
    });
    const avg = votes.length
      ? Math.round((votes.reduce((s, v) => s + Number(v.score), 0) / votes.length) * 100) / 100
      : null;
    res.json({ success: true, data: { votes, average: avg, count: votes.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/projects/:id/votes', intakeAuth, async (req, res) => {
  try {
    const r = await loadProjectAndAssertScope(req, req.params.id);
    if (r.error) return res.status(r.error).json({ success: false, error: r.message });
    const { score, rationale } = req.body;
    if (!score || score < 1 || score > 10) {
      return res.status(400).json({ success: false, error: 'score must be 1-10' });
    }
    const [vote] = await PriorityVote.upsert({
      project_id: Number(req.params.id),
      voter_email: req.identity.email,
      voter_name: req.identity.name,
      score,
      rationale: rationale || null
    }, {
      conflictFields: ['project_id', 'voter_email']
    });
    const avg = await recomputePriorityAvg(req.params.id);
    res.status(201).json({ success: true, data: vote, average: avg });
  } catch (err) {
    console.error('[D2AI-Intake] vote:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// CONVERT TO PLAN
// =====================================================
router.post('/projects/:id/convert', intakeAuth, requireAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const project = await Project.findByPk(req.params.id, { transaction: t });
    if (!project) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    const intake = await ProjectIntake.findOne({ where: { project_id: project.id }, transaction: t });
    if (!intake || intake.intake_status !== 'approved') {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'Project must be approved before conversion' });
    }
    const { milestones, due_date, kickoff_date, acceptance_criteria } = req.body;
    project.status = 'active';
    project.stage = 'execution';
    if (kickoff_date) project.start_date = kickoff_date;
    if (due_date) project.due_date = due_date;
    if (acceptance_criteria) {
      project.notes = (project.notes ? project.notes + '\n\n' : '') + 'Acceptance Criteria:\n' + acceptance_criteria;
    }
    await project.save({ transaction: t });
    intake.intake_status = 'converted';
    intake.converted_at = new Date();
    await intake.save({ transaction: t });
    if (Array.isArray(milestones)) {
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        await ProjectMilestone.create({
          project_id: project.id,
          title: m.title,
          description: m.description || null,
          due_date: m.due_date || null,
          status: 'pending',
          sort_order: i
        }, { transaction: t });
      }
    }
    await t.commit();
    res.json({ success: true, data: { project, intake } });
  } catch (err) {
    await t.rollback();
    console.error('[D2AI-Intake] convert:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// COMPANY ACCESS TOKENS (admin)
// =====================================================
router.post('/companies/:id/tokens', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    const { batch_id, grantee_email, grantee_name, role, expires_at } = req.body;
    const t = await CompanyAccessToken.create({
      company_id: company.id,
      batch_id: batch_id || null,
      grantee_email: grantee_email || null,
      grantee_name: grantee_name || null,
      role: role || 'reviewer',
      expires_at: expires_at || null
    });
    res.status(201).json({ success: true, data: t });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/companies/:id/tokens', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const tokens = await CompanyAccessToken.findAll({
      where: { company_id: req.params.id },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: tokens });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Project-scoped share token. Used by the dashboard "Share Project" modal so
// every project (including manually-created ones without a company / intake
// batch) can produce an open-access magic link without depending on a
// company-wide token. Idempotent: returns the existing live token if one
// exists, otherwise mints a new one.
router.post('/projects/:id/share-token', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = await Project.findOne({ where: { id: projectId, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'project_not_found' });

    const existing = await CompanyAccessToken.findOne({
      where: { project_id: projectId },
      order: [['created_at', 'DESC']]
    });
    if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
      return res.json({ success: true, data: existing });
    }

    const t = await CompanyAccessToken.create({
      project_id: projectId,
      company_id: project.company_id || null,
      grantee_email: req.body?.grantee_email || null,
      grantee_name: req.body?.grantee_name || null,
      role: 'reviewer',
      expires_at: null
    });
    res.status(201).json({ success: true, data: t });
  } catch (err) {
    console.error('[D2AI-Intake] project share-token mint failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// INBOX APPROVE / REJECT (admin) — wired to Claude milestone-generator
// =====================================================
const milestoneGenerator = require('../services/milestone-generator');
const requestorNotification = require('../services/requestorNotification');
const zoomService = require('../services/zoom');
const { CalendarEvent } = require('../models');

// Compute the next business day at 10:00 America/New_York that is at
// least `minDaysOut` days from today. Returns { startISO, endISO }
// where end is 30 minutes after start.
function nextKickoffSlot(minDaysOut = 3) {
  const target = new Date();
  target.setUTCHours(15, 0, 0, 0); // 10:00 ET ~ 15:00 UTC (close enough for invite seed)
  let added = 0;
  while (added < minDaysOut || [0, 6].includes(target.getUTCDay())) {
    target.setUTCDate(target.getUTCDate() + 1);
    if (![0, 6].includes(target.getUTCDay())) added++;
  }
  const end = new Date(target.getTime() + 30 * 60 * 1000);
  return { startISO: target.toISOString(), endISO: end.toISOString() };
}

// POST /projects/:id/approve
// Generates milestones via Claude, inserts them, marks project approved.
router.post('/projects/:id/approve', intakeAuth, requireAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const project = await Project.findByPk(req.params.id, { transaction: t });
    if (!project) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (project.intake_status !== 'pending_review') {
      await t.rollback();
      return res.status(400).json({ success: false, error: `Project is not pending review (current: ${project.intake_status})` });
    }

    // Build intake_answers from joined Q&A
    const questions = await ProjectQuestion.findAll({
      where: { project_id: project.id },
      include: [{ model: QuestionResponse, as: 'responses' }],
      order: [['position', 'ASC']],
      transaction: t
    });
    const intakeAnswers = {};
    for (const q of questions) {
      const resps = q.responses || [];
      if (resps.length) intakeAnswers[q.question_text] = resps.map(r => r.response_text).join('\n');
    }
    // Also surface the structured fields directly
    if (project.target_users) intakeAnswers['target_users'] = project.target_users;
    if (project.current_process) intakeAnswers['current_process'] = project.current_process;
    if (project.data_sources) intakeAnswers['data_sources'] = project.data_sources;
    if (project.success_metrics) intakeAnswers['success_metrics'] = project.success_metrics;
    if (project.existing_stack) intakeAnswers['existing_stack'] = project.existing_stack;
    if (project.country) intakeAnswers['country'] = project.country;

    let result;
    try {
      result = await milestoneGenerator.generatePlan({
        project_name: project.name,
        description: project.description,
        intake_answers: intakeAnswers,
        timeline: project.timeline,
        budget_range: project.budget_range,
        ai_category: project.ai_category
      });
    } catch (genErr) {
      await t.rollback();
      console.error('[D2AI-Intake] milestone gen error:', genErr.message);
      return res.status(502).json({ success: false, error: 'Claude milestone generation failed: ' + genErr.message });
    }

    const { plan, usage } = result;

    // Insert milestones
    for (const m of plan.milestones) {
      await ProjectMilestone.create({
        project_id: project.id,
        title: m.title,
        description: m.description + (m.deliverable ? '\n\nDeliverable: ' + m.deliverable : '') + (m.owner_role ? '\nOwner: ' + m.owner_role : ''),
        due_date: m.due_date,
        status: 'pending',
        sort_order: m.order_index
      }, { transaction: t });
    }

    // Update project state
    project.intake_status = 'approved';
    project.ai_milestone_generation_at = new Date();
    project.status = 'active';
    project.workflow_phase = 'kickoff_scheduled';
    if (plan.estimated_completion_date) project.due_date = plan.estimated_completion_date;
    if (plan.kickoff_recommendation) {
      project.notes = (project.notes ? project.notes + '\n\n' : '') + 'Kickoff (AI-generated):\n' + plan.kickoff_recommendation;
    }
    if (Array.isArray(plan.next_steps) && plan.next_steps.length) {
      project.next_step = plan.next_steps[0];
    }
    await project.save({ transaction: t });

    // Also bump the discussion intake row
    await ProjectIntake.update(
      { intake_status: 'approved' },
      { where: { project_id: project.id }, transaction: t }
    );

    await t.commit();

    // Fire the merged approval + kickoff email (non-blocking — do not delay
    // the API response on SendGrid/Zoom latency). Flow:
    //   1. Resolve the magic link from the submitter's batch token.
    //   2. Auto-schedule the kickoff (Zoom + CalendarEvent) so the email
    //      can include the real time + Zoom URL + .ics attachment.
    //   3. Send ONE email containing acknowledgment, kickoff details,
    //      magic link, and reschedule instructions.
    (async () => {
      try {
        const intakeRow = await ProjectIntake.findOne({ where: { project_id: project.id } });
        let magicLink = null;
        if (intakeRow) {
          const token = await CompanyAccessToken.findOne({
            where: { batch_id: intakeRow.batch_id },
            order: [['created_at', 'ASC']]
          });
          if (token) {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            magicLink = requestorNotification.buildMagicLink(baseUrl, token.token);
          }
        }
        if (!magicLink) {
          console.log('[D2AI-Intake] No magic link resolvable for project', project.id, '— ack email skipped');
          return;
        }
        let companyName = '';
        if (project.company_id) {
          try {
            const co = await Company.findByPk(project.company_id);
            if (co) companyName = co.name || '';
          } catch (_) {}
        }

        // Auto-schedule the kickoff BEFORE sending the email so we can
        // embed the time, Zoom link, and .ics in a single message.
        let meetingForEmail = null;
        if (project.submitter_email) {
          try {
            const { startISO, endISO } = nextKickoffSlot(3);
            const proposedTitle = `Kickoff — ${project.name}`;
            let zoomData = {};
            if (zoomService.isConfigured()) {
              try {
                const z = await zoomService.createMeeting({
                  topic: proposedTitle,
                  startISO,
                  durationMinutes: 30,
                  timezone: 'America/New_York',
                  agenda: `Project kickoff for ${project.name}. We will walk the AI-generated plan, gather business requirements, and confirm milestones.`
                });
                zoomData = {
                  zoom_meeting_id: z.id,
                  zoom_join_url: z.join_url,
                  zoom_start_url: z.start_url,
                  zoom_password: z.password,
                  location: z.join_url
                };
              } catch (zErr) {
                console.error('[D2AI-Intake] Auto-kickoff Zoom create failed:', zErr.response?.data || zErr.message);
              }
            }
            const event = await CalendarEvent.create({
              workspace_id: 1,
              project_id: project.id,
              title: proposedTitle,
              description: `Auto-scheduled kickoff. Reschedule via the requestor magic link if this time does not work.\n\nProject: ${project.name}\nRequestor: ${project.submitter_email}`,
              start_time: startISO,
              end_time: endISO,
              all_day: false,
              event_type: 'meeting',
              user_email: 'info@digit2ai.com',
              invited_emails: [project.submitter_email],
              ...zoomData
            });
            project.kickoff_event_id = event.id;
            project.kickoff_scheduled_at = new Date(startISO);
            await project.save();
            console.log(`[D2AI-Intake] Auto-kickoff scheduled for project ${project.id} at ${startISO}`);
            meetingForEmail = {
              id: event.id,
              title: event.title,
              start_time: event.start_time,
              end_time: event.end_time,
              description: event.description,
              location: event.location,
              zoom_join_url: zoomData.zoom_join_url || null,
              zoom_password: zoomData.zoom_password || null
            };
          } catch (kickErr) {
            console.error('[D2AI-Intake] Auto-kickoff scheduling failed:', kickErr.message);
          }
        }

        // Single merged email: acknowledgment + kickoff + .ics + magic link
        await requestorNotification.sendApprovalAcknowledgment({
          toEmail: project.submitter_email,
          toName: project.submitter_name,
          company: companyName,
          projectName: project.name,
          description: project.description,
          magicLink,
          meeting: meetingForEmail
        });
      } catch (notifyErr) {
        console.error('[D2AI-Intake] Approval ack email failed:', notifyErr.message);
      }
    })();

    res.status(201).json({
      success: true,
      project_id: project.id,
      milestones_created: plan.milestones.length,
      estimated_completion_date: plan.estimated_completion_date,
      next_steps: plan.next_steps,
      kickoff_recommendation: plan.kickoff_recommendation,
      usage
    });
  } catch (err) {
    try { await t.rollback(); } catch (_) {}
    console.error('[D2AI-Intake] approve error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /projects/:id/reject
router.post('/projects/:id/reject', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (project.intake_status !== 'pending_review') {
      return res.status(400).json({ success: false, error: `Project is not pending review (current: ${project.intake_status})` });
    }
    const reason = (req.body && req.body.reason) ? String(req.body.reason).trim() : '';
    project.intake_status = 'rejected';
    project.workflow_phase = 'rejected';
    if (reason) {
      project.notes = (project.notes ? project.notes + '\n\n' : '') + 'Rejection reason:\n' + reason;
    }
    await project.save();
    await ProjectIntake.update(
      { intake_status: 'rejected' },
      { where: { project_id: project.id } }
    );

    // Fire the requestor rejection notice (non-blocking).
    (async () => {
      try {
        let companyName = '';
        if (project.company_id) {
          try {
            const co = await Company.findByPk(project.company_id);
            if (co) companyName = co.name || '';
          } catch (_) {}
        }
        await requestorNotification.sendRejectionNotice({
          toEmail: project.submitter_email,
          toName: project.submitter_name,
          company: companyName,
          projectName: project.name,
          reason
        });
      } catch (notifyErr) {
        console.error('[D2AI-Intake] Rejection email failed:', notifyErr.message);
      }
    })();

    res.json({ success: true, project_id: project.id });
  } catch (err) {
    console.error('[D2AI-Intake] reject error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/intake/projects/:id/approval-email-payload
// POST /api/v1/intake/projects/:id/rejection-email-payload
// Two thin endpoints that build the approval/rejection email body without
// sending. The UI calls them after a successful /approve or /reject so the
// user can review the draft and open it in Apple Mail (sidesteps SendGrid
// spam folder issue). Reuse the exact buildApprovalBody / buildRejectionBody
// the server-side path uses, so the recipient sees identical formatting
// whichever channel is chosen.
async function buildEmailDraftPayload({ project, kind, reason }) {
  let companyName = '';
  if (project.company_id) {
    try { const co = await Company.findByPk(project.company_id); if (co) companyName = co.name || ''; } catch (_) {}
  }
  if (kind === 'rejection') {
    const body = requestorNotification.buildRejectionBody({
      toName: project.submitter_name,
      company: companyName,
      projectName: project.name,
      reason
    });
    return {
      to: project.submitter_email || '',
      recipients: project.submitter_email ? [{ email: project.submitter_email, name: project.submitter_name || '' }] : [],
      subject: body.subject,
      body_text: body.text,
      body_html: body.html,
      reply_to: requestorNotification.REPLY_TO_EMAIL,
      kind: 'rejection'
    };
  }
  // approval — resolve magic link + kickoff meeting if scheduled
  let magicLink = null;
  try {
    const intakeRow = await ProjectIntake.findOne({ where: { project_id: project.id } });
    if (intakeRow) {
      const token = await CompanyAccessToken.findOne({
        where: { batch_id: intakeRow.batch_id },
        order: [['created_at', 'ASC']]
      });
      if (token) {
        const baseUrl = process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com';
        magicLink = requestorNotification.buildMagicLink(baseUrl, token.token);
      }
    }
  } catch (_) {}
  let meeting = null;
  if (project.kickoff_event_id) {
    try {
      const ev = await CalendarEvent.findByPk(project.kickoff_event_id);
      if (ev) {
        meeting = {
          id: ev.id,
          title: ev.title,
          start_time: ev.start_time,
          end_time: ev.end_time,
          description: ev.description,
          location: ev.location,
          zoom_join_url: ev.zoom_join_url || null,
          zoom_password: ev.zoom_password || null
        };
      }
    } catch (_) {}
  }
  const body = requestorNotification.buildApprovalBody({
    toEmail: project.submitter_email,
    toName: project.submitter_name,
    company: companyName,
    projectName: project.name,
    description: project.description,
    magicLink,
    meeting
  });
  return {
    to: project.submitter_email || '',
    recipients: project.submitter_email ? [{ email: project.submitter_email, name: project.submitter_name || '' }] : [],
    subject: body.subject,
    body_text: body.text,
    body_html: body.html,
    reply_to: requestorNotification.REPLY_TO_EMAIL,
    kind: 'approval',
    magic_link: magicLink,
    meeting: meeting ? { start_time: meeting.start_time, zoom_join_url: meeting.zoom_join_url } : null
  };
}

router.post('/projects/:id/approval-email-payload', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const payload = await buildEmailDraftPayload({ project, kind: 'approval' });
    res.json({ success: true, data: payload });
  } catch (err) {
    console.error('[D2AI-Intake] approval-email-payload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/projects/:id/rejection-email-payload', intakeAuth, requireAdmin, async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const reason = (req.body && req.body.reason) ? String(req.body.reason).trim() : '';
    const payload = await buildEmailDraftPayload({ project, kind: 'rejection', reason });
    res.json({ success: true, data: payload });
  } catch (err) {
    console.error('[D2AI-Intake] rejection-email-payload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// SUBMITTER-FACING RESCHEDULE
// =====================================================
// POST /api/v1/intake/events/:eventId/reschedule
// Submitters (share-token JWT) can propose a new time. We check the
// workspace calendar for conflicts; if the slot is free we auto-accept
// and update the event. If there is a conflict, we return the conflict
// and let the human reviewer decide.

const { Op } = require('sequelize');

router.post('/events/:eventId/reschedule', intakeAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    const { start_time, end_time, reason } = req.body || {};
    if (!start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'start_time and end_time required' });
    }
    const newStart = new Date(start_time);
    const newEnd = new Date(end_time);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
      return res.status(400).json({ success: false, error: 'Invalid start/end times' });
    }
    if (newStart < new Date()) {
      return res.status(400).json({ success: false, error: 'Cannot reschedule to a past time' });
    }

    const event = await CalendarEvent.findByPk(eventId);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    // Scope check — if caller is share-token (submitter), the event's
    // project must belong to a project in their batch.
    if (req.identity.source === 'share' && req.identity.role !== 'admin') {
      if (!event.project_id) return res.status(403).json({ success: false, error: 'Event not bound to a project' });
      const intakeRow = await ProjectIntake.findOne({ where: { project_id: event.project_id } });
      if (!intakeRow || intakeRow.batch_id !== req.identity.batch_id) {
        return res.status(403).json({ success: false, error: 'Out of scope' });
      }
    }

    // Conflict detection — any other event whose [start, end) overlaps.
    const conflicts = await CalendarEvent.findAll({
      where: {
        workspace_id: event.workspace_id,
        id: { [Op.ne]: event.id },
        start_time: { [Op.lt]: newEnd },
        end_time: { [Op.gt]: newStart }
      },
      limit: 5
    });

    if (conflicts.length) {
      return res.status(409).json({
        success: false,
        error: 'Time slot has a conflict',
        conflicts: conflicts.map(c => ({
          id: c.id, title: c.title, start_time: c.start_time, end_time: c.end_time
        })),
        message: 'Please propose another time, or contact us to coordinate.'
      });
    }

    // No conflict — auto-accept.
    const oldStart = event.start_time;
    event.start_time = newStart;
    event.end_time = newEnd;
    event.description = (event.description ? event.description + '\n\n' : '') + `Rescheduled by ${req.identity.email || 'requestor'} on ${new Date().toISOString().slice(0, 10)}. Previous time: ${oldStart}.${reason ? '\nReason: ' + reason : ''}`;
    await event.save();

    if (event.project_id) {
      const proj = await Project.findByPk(event.project_id);
      if (proj && proj.kickoff_event_id === event.id) {
        proj.kickoff_scheduled_at = newStart;
        await proj.save();
      }
    }

    res.json({ success: true, data: { id: event.id, start_time: event.start_time, end_time: event.end_time }, message: 'Reschedule accepted' });
  } catch (err) {
    console.error('[D2AI-Intake] reschedule error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PUBLIC SUMMARY (open access — anyone with the link)
// =====================================================
// Read-only project + triage brief endpoint that does NOT require the
// recipient to identify (no email gate). The token alone is the credential;
// anyone Manuel forwards the URL to can open and read. For interactive
// discussion (posting comments, answering questions), they fall through
// to the existing magic link which keeps its identify gate.
router.get('/public-summary/:token', async (req, res) => {
  try {
    const tokenStr = String(req.params.token || '').trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(tokenStr)) return res.status(404).json({ success: false, error: 'Invalid token' });

    const accessToken = await CompanyAccessToken.findOne({ where: { token: tokenStr } });
    if (!accessToken) return res.status(404).json({ success: false, error: 'Invalid token' });
    if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
      return res.status(403).json({ success: false, error: 'Link expired' });
    }

    // Two token modes:
    //   - project-scoped (project_id set) → return just that one project
    //   - batch-scoped (batch_id set)     → return every project in the batch
    let projectRows = [];
    if (accessToken.project_id) {
      const p = await Project.findOne({ where: { id: accessToken.project_id, workspace_id: 1 } });
      if (p) projectRows = [p];
    } else if (accessToken.batch_id) {
      const intakes = await ProjectIntake.findAll({
        where: { batch_id: accessToken.batch_id },
        include: [{ model: Project, as: 'project' }],
        order: [['id', 'ASC']]
      });
      projectRows = intakes.map(i => i.project).filter(Boolean);
    }
    const projects = projectRows.map(row => {
      const p = row.toJSON();
      if (!p) return null;
      // Strip internal admin fields; expose only what a viewer should see.
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        country: p.country,
        submitter_name: p.submitter_name,
        ai_category: p.ai_category,
        timeline: p.timeline,
        budget_range: p.budget_range,
        intake_status: p.intake_status,
        triage_brief: p.triage_brief,
        triage_structured: p.triage_structured,
        triage_at: p.triage_at,
        created_at: p.created_at
      };
    }).filter(Boolean);

    accessToken.last_used_at = new Date();
    await accessToken.save();

    res.json({
      success: true,
      data: {
        company_id: accessToken.company_id,
        batch_id: accessToken.batch_id,
        projects
      }
    });
  } catch (err) {
    console.error('[D2AI-Intake] public-summary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// INBOX QUALIFY ACTIONS — Triage PDF + Threaded Q&A
// =====================================================
// Surface the AI Triage Agent's stakeholder questions in three ways
// before the user approves/rejects an intake:
//   - GET  /projects/:id/triage-pdf?token=X&lang=es|en  (public, raw token)
//   - POST /projects/:id/triage-answer                  (intakeAuth)
//   - GET  /projects/:id/triage-answers                 (intakeAuth)

// GET /api/v1/intake/projects/:id/triage-pdf
// Public, token-gated. Anyone with the share-token (UUID in
// d2_company_access_tokens) for the project's company can fetch the PDF.
// Threat model is the same as the magic link — share carefully.
router.get('/projects/:id/triage-pdf', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const tokenStr = String(req.query.token || '').trim();
    const lang = (req.query.lang === 'es') ? 'es' : 'en';
    if (!tokenStr) return res.status(400).json({ success: false, error: 'token required' });
    // Token is stored as UUID — anything else is guaranteed-invalid, return
    // 404 without hitting the DB (postgres would throw on a non-UUID cast).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(tokenStr)) return res.status(404).json({ success: false, error: 'Invalid token' });

    const accessToken = await CompanyAccessToken.findOne({ where: { token: tokenStr } });
    if (!accessToken) return res.status(404).json({ success: false, error: 'Invalid token' });
    if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
      return res.status(403).json({ success: false, error: 'Token expired' });
    }
    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    // Authorize: token must either be project-scoped to this project, or
    // company-scoped to the project's company. Otherwise it's a different
    // owner's token being used against this project.
    const isProjectScoped = accessToken.project_id === project.id;
    const isCompanyScoped = !!project.company_id && project.company_id === accessToken.company_id;
    if (!isProjectScoped && !isCompanyScoped) {
      return res.status(403).json({ success: false, error: 'Token does not match project' });
    }
    if (!project.triage_brief && !project.triage_structured) {
      return res.status(409).json({ success: false, error: 'No AI triage yet for this project — run triage first.' });
    }

    accessToken.last_used_at = new Date();
    await accessToken.save();

    const { streamTriagePdf } = require('../services/triagePdf');
    await streamTriagePdf({ project, lang, res });
  } catch (err) {
    console.error('[D2AI-Intake] triage-pdf error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/intake/projects/:id/triage-answer
// Stakeholder submits a reply to a specific AI Triage question.
// Stores in d2_project_comments with triage_question_index/text set.
router.post('/projects/:id/triage-answer', intakeAuth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const { question_index, question_text, answer_text, language } = req.body || {};
    if (typeof question_index !== 'number' || Number.isNaN(question_index)) {
      return res.status(400).json({ success: false, error: 'question_index (number) required' });
    }
    if (!answer_text || !String(answer_text).trim()) {
      return res.status(400).json({ success: false, error: 'answer_text required' });
    }
    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    // Scope check: share-token user must be in the same company as the project
    if (req.identity.source === 'share' && project.company_id && project.company_id !== req.identity.company_id) {
      return res.status(403).json({ success: false, error: 'Out of scope' });
    }
    const comment = await ProjectComment.create({
      project_id: projectId,
      author_email: req.identity.email || null,
      author_name: req.identity.name || null,
      body: String(answer_text).trim(),
      triage_question_index: Math.max(0, Math.min(50, Math.round(question_index))),
      triage_question_text: question_text ? String(question_text).slice(0, 1000) : null,
      triage_language: (language === 'es' || language === 'en') ? language : null
    });
    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    console.error('[D2AI-Intake] triage-answer error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/intake/projects/:id/triage-answers
// Returns all triage Q&A replies for a project, sorted by question index then date.
router.get('/projects/:id/triage-answers', intakeAuth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (req.identity.source === 'share' && project.company_id && project.company_id !== req.identity.company_id) {
      return res.status(403).json({ success: false, error: 'Out of scope' });
    }
    const { Op } = require('sequelize');
    const rows = await ProjectComment.findAll({
      where: { project_id: projectId, triage_question_index: { [Op.ne]: null } },
      order: [['triage_question_index', 'ASC'], ['created_at', 'ASC']]
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[D2AI-Intake] triage-answers error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
