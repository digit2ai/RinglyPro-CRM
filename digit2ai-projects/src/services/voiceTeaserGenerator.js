'use strict';

// =============================================================
// voiceTeaserGenerator — turns a project request into a sophisticated,
// comprehensive POC teaser the client can SEE (branded HTML walkthrough +
// a simulated working product) and HEAR (Lina neural voice narration).
//
// One LLM call (Claude Opus 4.8) produces a strict-JSON teaser:
//   - hero, challenge, solution, value, deliverables sections
//   - a concrete "live POC simulation" (clean HTML mock of the real product
//     with realistic sample data — no scripts, no external assets)
//   - a plan (timeline + investment, pulled from the project's targets)
//   - a CTA
//   - Lina narration segments (intro + one per section), in the client's
//     language, numbers spelled out for natural TTS
//
// Always returns a teaser: when ANTHROPIC_API_KEY is unset or the call/parse
// fails, a deterministic template built from the project fields is used.
// =============================================================

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) { /* optional */ }

const MODEL = process.env.TEASER_MODEL || process.env.ARCHITECT_MODEL || 'claude-opus-4-8';

const SPANISH_COUNTRIES = new Set([
  'mexico', 'méxico', 'colombia', 'argentina', 'peru', 'perú', 'chile', 'venezuela',
  'ecuador', 'guatemala', 'cuba', 'bolivia', 'dominican republic', 'república dominicana',
  'honduras', 'paraguay', 'el salvador', 'nicaragua', 'costa rica', 'panama', 'panamá',
  'uruguay', 'spain', 'españa', 'puerto rico'
]);

function pickLang(project, override) {
  if (override === 'es' || override === 'en') return override;
  const c = String(project.country || '').trim().toLowerCase();
  if (SPANISH_COUNTRIES.has(c)) return 'es';
  return 'en';
}

// Strip anything executable/styling out of AI-authored POC HTML. The POC is
// rendered read-only inside the teaser page; we keep structural + text markup
// only (divs, tables, spans, headings, lists, basic inline style attrs).
function sanitizePocHtml(html) {
  let s = String(html || '');
  s = s.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  s = s.replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '');
  s = s.replace(/<\s*(iframe|object|embed|link|meta|form|input|button|textarea|select)\b[\s\S]*?>/gi, '');
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/javascript:/gi, '');
  return s.trim();
}

const SYSTEM_PROMPT = `You are the lead Solutions Architect and conversion copywriter at Digit2AI, an AI software studio that turns a client's problem into a working AI product. Your job: from a single project request, produce a SOPHISTICATED, COMPREHENSIVE "proof-of-concept teaser" that makes a prospective client feel they are already looking at — and hearing about — their finished product.

This teaser is sent to the client by email / SMS / WhatsApp before any contract. It must impress: concrete, specific, confident, never generic. You are simulating the real product, not describing it abstractly.

OUTPUT: a SINGLE JSON object, no markdown fences, no prose around it. It MUST match this exact shape:

{
  "title": "short product name, e.g. 'Dispatch Auto-Pilot'",
  "tagline": "one punchy line under the title",
  "hero": { "headline": "big promise headline", "subhead": "1-2 sentence subhead naming the client's domain" },
  "challenge": { "heading": "...", "body_html": "2-3 short <p> paragraphs naming the client's real pain, with specifics" },
  "solution": { "heading": "...", "body_html": "2-3 <p> paragraphs: how the Digit2AI product solves it; name the AI capabilities concretely (agents, voice, automations, dashboards)" },
  "poc": {
    "heading": "Live POC simulation",
    "intro": "1 sentence telling the client this is a simulation of their actual product with sample data",
    "html": "A SELF-CONTAINED, REALISTIC mock of the working product UI. Use ONLY divs, spans, tables, headings, ul/ol, and inline style attributes (colors, padding, border, border-radius, flex via style). NO <script>, NO <style> blocks, NO images, NO forms/inputs/buttons. Simulate real screens with believable sample data: e.g. a dashboard with KPI cards and a data table, a chat/voice transcript between the AI agent and a customer, an automation flow with steps, sample records. Make it look like a real product screenshot rendered in HTML. Dark-theme friendly (use light text on transparent/dark cards; e.g. color:#e6eefc, cards with background:rgba(255,255,255,.04) and border:1px solid rgba(255,255,255,.08)). 250-500 words of mock UI."
  },
  "value": { "heading": "...", "bullets": ["4-6 concrete outcome bullets with numbers where credible"] },
  "deliverables": { "heading": "What you get", "items": ["4-6 concrete deliverables for the POC/MVP"] },
  "plan": { "heading": "Timeline & investment", "summary": "1 sentence", "phases": [ {"name":"Week 1-2: ...","detail":"..."}, {"name":"...","detail":"..."} ] },
  "cta": { "heading": "ready-to-act heading", "body": "1-2 sentences inviting them to greenlight the POC" },
  "segments": [ "Lina's narration, ONE string per beat, in this order: (0) warm intro naming the client/company and what she'll show, (1) the challenge, (2) the solution, (3) a walkthrough of the POC simulation as if pointing at the screen, (4) the value + plan, (5) a confident close inviting them to start. 2-4 sentences each." ]
}

RULES:
- Write everything in {{LANG_NAME}} ({{LANG}}).
- In "segments", spell numbers out as words for natural text-to-speech, use correct {{LANG_NAME}} orthography (accents/tildes/ñ when Spanish), and NEVER use emojis or symbols.
- Be specific to THIS project. Use the client's company name, domain vocabulary, and stated problem. Invent believable sample data for the POC (names, metrics, records) clearly in their context.
- exactly 6 strings in "segments".
- "poc.html" must be valid, self-contained HTML with NO scripts/styles/images/forms — structural tags + inline style attributes only.
- Output ONLY the JSON object.`;

function buildUserMessage(project, lang) {
  const plan = project.business_plan_json || {};
  const fmt = n => n ? Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : null;
  const lines = [
    `Client / company: ${project.submitter_name || ''}${project.company_name ? ' @ ' + project.company_name : ''}`.trim(),
    `Project name: ${project.name || ''}`,
    `Country: ${project.country || '(unspecified)'}`,
    `Category: ${project.category || '(unspecified)'}`,
    `Problem / request: ${project.description || '(none provided)'}`,
    `Target users: ${project.target_users || '(unspecified)'}`,
    `Current process: ${project.current_process || '(unspecified)'}`,
    `Data sources: ${project.data_sources || '(unspecified)'}`,
    `Existing stack: ${project.existing_stack || '(unspecified)'}`,
    `Success metrics: ${project.success_metrics || '(unspecified)'}`,
    `Desired timeline: ${project.timeline || '(unspecified)'}`,
    project.target_delivery_weeks ? `Target delivery: ${project.target_delivery_weeks} weeks` : null,
    project.target_total_usd ? `Target investment: ${fmt(project.target_total_usd)}` : null,
    plan.executive_summary ? `\nExisting business-plan executive summary:\n${plan.executive_summary}` : null,
    plan.solution ? `\nPlanned solution notes:\n${typeof plan.solution === 'string' ? plan.solution : JSON.stringify(plan.solution)}` : null
  ].filter(Boolean);
  return `Produce the POC teaser JSON for this project request. Language: ${lang}.\n\n${lines.join('\n')}`;
}

function extractJson(text) {
  let t = String(text || '').trim();
  // strip code fences if present
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object found');
  return JSON.parse(t.slice(start, end + 1));
}

async function generate(project, options = {}) {
  const lang = pickLang(project, options.lang);
  const voice = lang === 'es' ? 'lina' : 'ava';

  if (Anthropic && (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY });
      const sys = SYSTEM_PROMPT
        .replace(/\{\{LANG_NAME\}\}/g, lang === 'es' ? 'Spanish' : 'English')
        .replace(/\{\{LANG\}\}/g, lang);
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserMessage(project, lang) }]
      });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      const data = extractJson(text);
      const usage = response.usage || {};
      console.log(`[voiceTeaser] generated for project ${project.id} — tokens in=${usage.input_tokens} out=${usage.output_tokens}`);
      return normalize(data, { lang, voice, project, model: MODEL });
    } catch (e) {
      console.error('[voiceTeaser] LLM generation failed, using fallback:', e.message);
    }
  } else {
    console.log('[voiceTeaser] ANTHROPIC_API_KEY not set; using deterministic fallback teaser.');
  }
  return normalize(fallbackTeaser(project, lang), { lang, voice, project, model: 'fallback-template' });
}

// Guarantee the stored shape is complete & safe regardless of LLM output drift.
function normalize(d, { lang, voice, project, model }) {
  d = d || {};
  const arr = (x, n) => Array.isArray(x) ? x.filter(Boolean).map(String) : [];
  const seg = arr(d.segments).slice(0, 6);
  while (seg.length < 6) seg.push(seg.length ? seg[seg.length - 1] : '');
  return {
    lang, voice, model,
    title: String(d.title || project.name || 'Your AI Product').slice(0, 120),
    tagline: String(d.tagline || '').slice(0, 240),
    client_name: project.submitter_name || '',
    company_name: project.company_name || '',
    project_name: project.name || '',
    hero: { headline: String(d.hero?.headline || d.title || project.name || ''), subhead: String(d.hero?.subhead || d.tagline || '') },
    challenge: { heading: String(d.challenge?.heading || (lang === 'es' ? 'El reto' : 'The challenge')), body_html: String(d.challenge?.body_html || '') },
    solution: { heading: String(d.solution?.heading || (lang === 'es' ? 'La solución de IA' : 'The AI solution')), body_html: String(d.solution?.body_html || '') },
    poc: {
      heading: String(d.poc?.heading || (lang === 'es' ? 'Simulación del POC en vivo' : 'Live POC simulation')),
      intro: String(d.poc?.intro || ''),
      html: sanitizePocHtml(d.poc?.html || '')
    },
    value: { heading: String(d.value?.heading || (lang === 'es' ? 'El valor' : 'The value')), bullets: arr(d.value?.bullets).slice(0, 8) },
    deliverables: { heading: String(d.deliverables?.heading || (lang === 'es' ? 'Lo que recibes' : 'What you get')), items: arr(d.deliverables?.items).slice(0, 8) },
    plan: {
      heading: String(d.plan?.heading || (lang === 'es' ? 'Cronograma e inversión' : 'Timeline & investment')),
      summary: String(d.plan?.summary || ''),
      phases: arr(d.plan?.phases).length ? d.plan.phases.map(p => ({ name: String(p.name || ''), detail: String(p.detail || '') })) : []
    },
    cta: { heading: String(d.cta?.heading || (lang === 'es' ? '¿Comenzamos?' : 'Ready to start?')), body: String(d.cta?.body || '') },
    segments: seg
  };
}

// -------------------------------------------------------------
// Deterministic fallback (no API key) — still a real, sendable teaser.
// -------------------------------------------------------------
function fallbackTeaser(project, lang) {
  const name = project.name || 'Your AI Product';
  const who = project.submitter_name || (lang === 'es' ? 'tu equipo' : 'your team');
  const prob = project.description || (lang === 'es' ? 'tu reto operativo' : 'your operational challenge');
  const es = lang === 'es';
  const card = (t, v) => `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 16px;min-width:150px"><div style="font-size:12px;color:#8aa0c6">${t}</div><div style="font-size:22px;font-weight:700;color:#e6eefc">${v}</div></div>`;
  const pocHtml = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      ${card(es ? 'Casos hoy' : 'Cases today', '128')}
      ${card(es ? 'Resueltos por IA' : 'AI-resolved', '94%')}
      ${card(es ? 'Tiempo medio' : 'Avg. handle time', '38s')}
      ${card(es ? 'Ahorro/mes' : 'Saved / mo', '$11,400')}
    </div>
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 16px;color:#e6eefc">
      <div style="font-size:13px;color:#8aa0c6;margin-bottom:8px">${es ? 'Transcripción del agente de IA' : 'AI agent transcript'}</div>
      <div style="margin:6px 0"><b style="color:#7cf2c0">Lina (IA):</b> ${es ? 'Hola, gracias por contactarnos. ¿En qué puedo ayudarle hoy?' : 'Hi, thanks for reaching out. How can I help you today?'}</div>
      <div style="margin:6px 0"><b style="color:#9bc0ff">${es ? 'Cliente' : 'Customer'}:</b> ${es ? 'Necesito reprogramar mi cita.' : 'I need to reschedule my appointment.'}</div>
      <div style="margin:6px 0"><b style="color:#7cf2c0">Lina (IA):</b> ${es ? 'Claro. Tengo disponibilidad el martes a las diez o el jueves a las tres. ¿Cuál prefiere?' : 'Of course. I have Tuesday at ten or Thursday at three. Which works best?'}</div>
    </div>`;
  return {
    title: name,
    tagline: es ? 'Un vistazo a tu producto de IA, hecho realidad.' : 'A first look at your AI product, brought to life.',
    hero: { headline: name, subhead: es ? `Una simulación de cómo Digit2AI resuelve ${prob}.` : `A simulation of how Digit2AI solves ${prob}.` },
    challenge: { heading: es ? 'El reto' : 'The challenge', body_html: `<p>${prob}</p>` },
    solution: { heading: es ? 'La solución de IA' : 'The AI solution', body_html: es ? '<p>Digit2AI despliega agentes de IA, voz neural y automatizaciones que trabajan veinticuatro horas al día, integrados con tus sistemas actuales.</p>' : '<p>Digit2AI deploys AI agents, neural voice, and automations that work around the clock, integrated with your existing systems.</p>' },
    poc: { heading: es ? 'Simulación del POC en vivo' : 'Live POC simulation', intro: es ? 'Esto es una simulación de tu producto con datos de ejemplo.' : 'This is a simulation of your product with sample data.', html: pocHtml },
    value: { heading: es ? 'El valor' : 'The value', bullets: es ? ['Respuesta inmediata, sin esperas', 'Disponible 24/7 en español e inglés', 'Menor costo operativo', 'Cada interacción registrada y medible'] : ['Instant response, no waiting', 'Available 24/7 in English and Spanish', 'Lower operating cost', 'Every interaction logged and measurable'] },
    deliverables: { heading: es ? 'Lo que recibes' : 'What you get', items: es ? ['Un POC funcional desplegado', 'Agente de IA configurado', 'Panel de métricas', 'Sesión de revisión'] : ['A working deployed POC', 'A configured AI agent', 'A metrics dashboard', 'A review session'] },
    plan: { heading: es ? 'Cronograma e inversión' : 'Timeline & investment', summary: project.target_delivery_weeks ? (es ? `Entrega en ${project.target_delivery_weeks} semanas.` : `Delivered in ${project.target_delivery_weeks} weeks.`) : (es ? 'POC en dos semanas.' : 'POC in two weeks.'), phases: [ { name: es ? 'Semana 1: Diseño y datos' : 'Week 1: Design & data', detail: es ? 'Configuramos el agente y conectamos tus datos.' : 'We configure the agent and connect your data.' }, { name: es ? 'Semana 2: POC en vivo' : 'Week 2: Live POC', detail: es ? 'Desplegamos y revisamos juntos.' : 'We deploy and review together.' } ] },
    cta: { heading: es ? '¿Comenzamos?' : 'Ready to start?', body: es ? 'Aprueba el POC y lo tendrás funcionando en dos semanas.' : 'Greenlight the POC and you will have it running in two weeks.' },
    segments: [
      es ? `Hola ${who}, soy Lina, la voz de inteligencia artificial de Digit2AI. En menos de dos minutos te voy a mostrar cómo se vería tu producto: ${name}.`
         : `Hi ${who}, I'm Lina, the artificial intelligence voice of Digit2AI. In under two minutes I'll show you what your product, ${name}, could look like.`,
      es ? `Primero, el reto. ${prob}. Hoy eso cuesta tiempo y dinero, y deja clientes esperando.`
         : `First, the challenge. ${prob}. Today that costs time and money, and it leaves customers waiting.`,
      es ? 'Nuestra solución combina agentes de inteligencia artificial, voz neural y automatizaciones que trabajan las veinticuatro horas, conectadas a tus sistemas actuales.'
         : 'Our solution combines artificial intelligence agents, neural voice, and automations that work around the clock, connected to your existing systems.',
      es ? 'Mira esta simulación: a la izquierda, los casos resueltos automáticamente y el ahorro mensual; abajo, una conversación real entre el agente de IA y un cliente, resuelta en segundos.'
         : 'Look at this simulation: on the left, cases resolved automatically and the monthly savings; below, a real conversation between the AI agent and a customer, resolved in seconds.',
      es ? 'El valor es claro: respuesta inmediata, disponibilidad total, menor costo, y cada interacción medible. Entregamos el POC funcional en dos semanas.'
         : 'The value is clear: instant response, full availability, lower cost, and every interaction measurable. We deliver the working POC in two weeks.',
      es ? 'Si te gusta lo que ves y oyes, da luz verde al POC y comenzamos de inmediato. Estoy lista cuando tú lo estés.'
         : 'If you like what you see and hear, greenlight the POC and we begin right away. I am ready when you are.'
    ]
  };
}

module.exports = { generate, pickLang, sanitizePocHtml, MODEL };
