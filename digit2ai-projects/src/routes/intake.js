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
      intake_status: 'pending_review'
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
      url: `${baseUrl}/projects/intake/batch.html?token=${accessToken.token}`
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
