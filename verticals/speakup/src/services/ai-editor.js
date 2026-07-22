'use strict';

/**
 * SpeakUp — AI editing brain (the ONE external dependency: Claude).
 * Reuses ANTHROPIC_API_KEY. Model = SPEAKUP_MODEL (default Haiku).
 *
 *  - summarize(text, lang)             -> { summary, bullets[], action_items[] }
 *  - translate(text, targetLang)       -> { text, source_lang }
 *  - rewrite(text, tone, customPrompt) -> string
 *
 * Every function has a deterministic ZERO-KEY heuristic fallback so the whole
 * app works end-to-end with no API key. Translation NEVER fabricates a result:
 * with no key it returns the original text plus an explicit notice.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.SPEAKUP_MODEL || 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

function activeModel() { return anthropic ? MODEL : 'heuristic-fallback'; }

async function callClaude({ system, user, max_tokens = 1200 }) {
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens,
    system,
    messages: [{ role: 'user', content: user }]
  });
  return (resp.content || []).map(b => b.text || '').join('').trim();
}

// ── Summaries + bullets + action items ──────────────────────────────────────
async function summarize(text, lang) {
  const clean = String(text || '').trim();
  if (!anthropic || !clean) return heuristicSummary(clean);

  const system = 'You summarize meeting/voice transcripts. Reply with ONLY a JSON object, no prose.';
  const user = `Transcript:\n"""${clean.slice(0, 24000)}"""\n\n` +
    `Return this exact shape:\n{\n  "summary": "3-6 sentence summary",\n  "bullets": ["key point", "..."],\n  "action_items": ["concrete next action", "..."]\n}\n` +
    `Match the language of the transcript. 3-8 bullets. 0-8 action items (imperative). No emojis.`;

  try {
    const raw = await callClaude({ system, user });
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const p = JSON.parse(json);
    return {
      summary: String(p.summary || '').slice(0, 4000),
      bullets: Array.isArray(p.bullets) ? p.bullets.filter(Boolean).slice(0, 10).map(b => String(b).slice(0, 400)) : [],
      action_items: Array.isArray(p.action_items) ? p.action_items.filter(Boolean).slice(0, 10).map(a => String(a).slice(0, 400)) : []
    };
  } catch (e) {
    console.error('SpeakUp summarize error:', e.message);
    return heuristicSummary(clean);
  }
}

function heuristicSummary(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 4);
  const cues = /(voy a|tengo que|debo|hay que|necesito|will |i'?ll |need to|have to|let'?s|todo:|acción|action)/i;
  const bullets = sentences.slice(0, 6).map(s => s.trim().slice(0, 200));
  const action_items = sentences.filter(s => cues.test(s)).slice(0, 6).map(s => s.trim().slice(0, 200));
  return {
    summary: sentences.slice(0, 4).join(' ').slice(0, 1200) || '(sin contenido para resumir)',
    bullets,
    action_items
  };
}

// ── Translation (never fabricated) ──────────────────────────────────────────
async function translate(text, targetLang) {
  const clean = String(text || '').trim();
  if (!clean) return { text: '', source_lang: null };
  if (!anthropic) {
    return {
      text: `[Traducción no disponible sin ANTHROPIC_API_KEY. Texto original abajo.]\n\n${clean}`,
      source_lang: null
    };
  }
  const system = 'You are a professional translator. Auto-detect the source language. Output ONLY the translation, no notes.';
  const user = `Translate the following into ${targetLang}. Preserve meaning, tone and line breaks.\n\n"""${clean.slice(0, 24000)}"""`;
  try {
    const out = await callClaude({ system, user, max_tokens: 2000 });
    return { text: out || clean, source_lang: null };
  } catch (e) {
    console.error('SpeakUp translate error:', e.message);
    return { text: `[No se pudo traducir: ${e.message}]\n\n${clean}`, source_lang: null };
  }
}

// ── Tone adjustment / rewrite ────────────────────────────────────────────────
const TONES = {
  professional: 'Rewrite in a clear, professional tone. Fix grammar and punctuation.',
  concise: 'Rewrite to be as concise as possible while keeping all key information.',
  friendly: 'Rewrite in a warm, friendly, approachable tone.',
  email: 'Rewrite as a well-structured professional email with a greeting and sign-off.',
  bullets: 'Rewrite the content as a clean bulleted list of the key points.',
  grammar: 'Fix only grammar, spelling and punctuation. Keep wording and meaning intact.'
};

async function rewrite(text, tone, customPrompt) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  const instruction = customPrompt && customPrompt.trim()
    ? customPrompt.trim()
    : (TONES[tone] || TONES.professional);

  if (!anthropic) return heuristicRewrite(clean, tone);

  const system = 'You rewrite text as instructed. Output ONLY the rewritten text, no preamble. Match the input language. No emojis.';
  const user = `Instruction: ${instruction}\n\nText:\n"""${clean.slice(0, 24000)}"""`;
  try {
    return (await callClaude({ system, user, max_tokens: 2000 })) || heuristicRewrite(clean, tone);
  } catch (e) {
    console.error('SpeakUp rewrite error:', e.message);
    return heuristicRewrite(clean, tone);
  }
}

function heuristicRewrite(text, tone) {
  // Minimal, honest transformations without an LLM.
  if (tone === 'bullets') {
    return String(text).split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3)
      .map(s => '- ' + s.trim()).join('\n');
  }
  if (tone === 'concise') {
    const s = String(text).split(/(?<=[.!?])\s+/).filter(Boolean);
    return s.slice(0, Math.max(1, Math.ceil(s.length / 2))).join(' ');
  }
  // grammar/professional/friendly/email: tidy whitespace + capitalization only.
  const tidy = String(text).replace(/\s+/g, ' ').trim();
  const cap = tidy.charAt(0).toUpperCase() + tidy.slice(1);
  return cap + '\n\n[Edición completa disponible al configurar ANTHROPIC_API_KEY.]';
}

// ── Deliverables: turn one recording into a chosen document ───────────────────
// minutes | details | next_steps | presentation | project_plan
const DOC_SPECS = {
  minutes: {
    title: { es: 'Acta de reunión', en: 'Meeting minutes' },
    instr: 'Write formal meeting MINUTES in Markdown. Include: a title, date/context if inferable, attendees or speakers if identifiable, an agenda/topics-discussed section, key decisions made, and an action-items table (task, owner if mentioned, due date if mentioned). Be faithful to the transcript; do not invent facts.'
  },
  details: {
    title: { es: 'Detalle completo', en: 'Full details' },
    instr: 'Write a COMPREHENSIVE, detailed set of notes in Markdown that captures everything discussed, organized by topic with clear headings and sub-bullets. Preserve nuance, numbers, names and context. This is the long-form record, not a summary.'
  },
  next_steps: {
    title: { es: 'Próximos pasos', en: 'Next steps' },
    instr: 'Extract the NEXT STEPS in Markdown: a prioritized, numbered list of concrete action items. For each, include the owner (if mentioned) and a suggested timeframe. End with any open questions or blockers. Imperative phrasing.'
  },
  presentation: {
    title: { es: 'Presentación', en: 'Presentation' },
    instr: 'Turn this into a PRESENTATION outline in Markdown, slide by slide. Use "## Slide N: <title>" for each slide followed by 3-6 concise bullet points. Include an opening title slide and a closing next-steps slide. 6-12 slides. Ready to paste into slides.'
  },
  project_plan: {
    title: { es: 'Plan de proyecto', en: 'Project plan' },
    instr: 'Produce a PROJECT PLAN in Markdown: objective, scope, phases with milestones, a task breakdown (task, owner, estimate in weeks), a simple week-by-week timeline (weeks, never months), risks/mitigations, and success criteria. Keep the timeline realistic and short.'
  }
};

async function generateDocument(text, type, lang, instruction) {
  const uiLang = lang === 'en' ? 'en' : 'es';
  let spec;
  if (type === 'custom') {
    const instr = String(instruction || '').trim();
    spec = {
      title: { es: 'Personalizado', en: 'Custom' },
      instr: `Follow the user's own instruction to produce a Markdown document from the transcript. If it fits, give the document a short "# " title. USER INSTRUCTION: "${instr.slice(0, 1000)}"`
    };
  } else {
    spec = DOC_SPECS[type] || DOC_SPECS.minutes;
  }
  const clean = String(text || '').trim();
  if (!anthropic || !clean) return heuristicDocument(clean, type, uiLang, spec);

  const system = 'You transform a meeting/conversation transcript into a specific business deliverable. ' +
    'Reply with ONLY the Markdown document, no preamble. Match the language of the transcript. No emojis. Never fabricate facts not supported by the transcript.';
  const user = `${spec.instr}\n\nTRANSCRIPT:\n"""${clean.slice(0, 28000)}"""`;
  try {
    const md = await callClaude({ system, user, max_tokens: 3000 });
    return { title: firstHeading(md) || spec.title[uiLang], content: md || heuristicDocument(clean, type, uiLang, spec).content };
  } catch (e) {
    console.error('SpeakUp generateDocument error:', e.message);
    return heuristicDocument(clean, type, uiLang, spec);
  }
}

function firstHeading(md) {
  const m = String(md || '').match(/^#+\s+(.+)$/m);
  return m ? m[1].trim().slice(0, 160) : null;
}

function heuristicDocument(text, type, uiLang, spec) {
  const s = heuristicSummary(text);
  const T = spec.title[uiLang];
  let body = `# ${T}\n\n`;
  if (type === 'presentation') {
    body += `## Slide 1: ${T}\n\n`;
    s.bullets.forEach((b, i) => { body += `## Slide ${i + 2}: ${b.slice(0, 60)}\n\n- ${b}\n\n`; });
    body += `## Slide ${s.bullets.length + 2}: ${uiLang === 'en' ? 'Next steps' : 'Próximos pasos'}\n\n${s.action_items.map(a => `- ${a}`).join('\n')}\n`;
  } else if (type === 'next_steps') {
    body += (s.action_items.length ? s.action_items.map((a, i) => `${i + 1}. ${a}`).join('\n') : (uiLang === 'en' ? '_No explicit next steps found._' : '_No se encontraron próximos pasos explícitos._'));
  } else if (type === 'project_plan') {
    body += `**${uiLang === 'en' ? 'Objective' : 'Objetivo'}:** ${s.summary}\n\n## ${uiLang === 'en' ? 'Tasks' : 'Tareas'}\n\n${s.bullets.map(b => `- ${b}`).join('\n')}\n\n## ${uiLang === 'en' ? 'Next steps' : 'Próximos pasos'}\n\n${s.action_items.map(a => `- ${a}`).join('\n')}\n`;
  } else { // minutes / details
    body += `## ${uiLang === 'en' ? 'Summary' : 'Resumen'}\n\n${s.summary}\n\n## ${uiLang === 'en' ? 'Key points' : 'Puntos clave'}\n\n${s.bullets.map(b => `- ${b}`).join('\n')}\n\n## ${uiLang === 'en' ? 'Action items' : 'Acciones'}\n\n${s.action_items.map(a => `- ${a}`).join('\n')}\n`;
  }
  body += `\n\n_${uiLang === 'en' ? 'Full AI deliverable available with ANTHROPIC_API_KEY.' : 'Entrega AI completa disponible al configurar ANTHROPIC_API_KEY.'}_`;
  return { title: T, content: body };
}

module.exports = { summarize, translate, rewrite, generateDocument, activeModel,
  TONES: Object.keys(TONES), DOC_TYPES: [...Object.keys(DOC_SPECS), 'custom'] };
