'use strict';

// =============================================================
// appSimulatorGenerator — turns a project description (+ optional
// triage plan) into an INTERACTIVE APP MOCKUP BLUEPRINT that the
// deterministic renderer (routes/appSimulator.js) paints inside a
// phone/desktop frame. The client literally "sees the app they are
// requisitioning" before a single line is built.
//
// Design choice: the LLM returns a STRUCTURED JSON blueprint (screens
// + a fixed vocabulary of block types), NOT raw HTML. The renderer is
// deterministic, so the simulator is always well-formed and on-brand,
// and a zero-key heuristic fallback still produces a usable demo.
//
//   generate(project, { lang }) -> blueprint object (see SHAPE below)
// =============================================================

const BLOCK_TYPES = ['hero', 'metric_row', 'list', 'card', 'cta', 'form', 'feed', 'chart', 'chat', 'note'];
const TAB_ICONS = ['home', 'grid', 'plus', 'chart', 'bell', 'user', 'search', 'calendar', 'chat', 'settings'];

const SIM_SYSTEM_PROMPT = `You are the Senior Conversation & Voice UX Designer + Senior Frontend Engineer inside the Digit2AI / OrbUp 83-agent workforce.

Your job: read a prospect's plain-language description of the software they want, and design an INTERACTIVE APP MOCKUP the prospect can click through — so they see the product they are requesting before it is built.

Return ONE JSON object (no markdown, no prose) with this EXACT shape:

{
  "app_name": "short product name you invent that fits the request",
  "tagline": "one short line describing what the app does",
  "platform": "mobile" | "web",          // mobile = phone frame, web = desktop/browser frame
  "brand_hue": 210,                        // 0-360 HSL hue for the accent color; pick to fit the industry
  "industry": "one or two words",
  "tabs": [                                // 3-5 bottom-nav (mobile) / side-nav (web) destinations
    { "id": "home", "label": "Home", "icon": "home" }
  ],
  "screens": [                             // 4-7 screens; EVERY tab.id must have >=1 screen whose "tab" equals it
    {
      "id": "home",
      "tab": "home",                       // which tab this screen belongs to
      "title": "Screen title in the app top bar",
      "blocks": [ ...see block vocabulary... ]
    }
  ],
  "primary_flow": ["home", "detail", "..."] // ordered screen ids that tell the app's core story
}

BLOCK VOCABULARY (use only these "type" values; keep every block realistic to the described product):
- {"type":"hero","title":"...","subtitle":"...","cta":{"label":"...","goto":"<screenId>"}}
- {"type":"metric_row","metrics":[{"label":"...","value":"...","delta":"+12%"}]}   // 2-4 KPI tiles
- {"type":"list","title":"optional section title","items":[{"title":"...","subtitle":"...","badge":"optional","goto":"<screenId optional>"}]}
- {"type":"card","title":"...","body":"...","tag":"optional","goto":"<screenId optional>"}
- {"type":"cta","label":"button text","goto":"<screenId>","style":"primary|ghost"}
- {"type":"form","title":"...","fields":[{"label":"...","kind":"text|email|number|select|textarea","options":["a","b"]}],"submit":"button text"}
- {"type":"feed","items":[{"who":"Name","when":"2h","text":"...","meta":"optional"}]}
- {"type":"chart","title":"...","kind":"bars|line","series":[{"label":"Mon","value":40}]}   // 4-8 points, values 0-100
- {"type":"chat","messages":[{"from":"user|ai","text":"..."}]}   // for AI/assistant products
- {"type":"note","text":"a short helper/empty-state line"}

RULES
- Invent realistic sample data that matches the prospect's exact domain (names, metrics, statuses). Never use lorem ipsum.
- Wire navigation: use "goto" so hero CTAs, list items, and cta buttons jump between screens — the mockup must be clickable and tell the primary_flow story.
- 4-7 screens total. Keep each screen to 2-5 blocks. Prefer showing the app's core value on the first screen.
- Choose platform "mobile" unless the product is clearly a back-office/analytics/desktop tool.
- If the product is AI/assistant/voice-driven, include at least one "chat" block.
- LANGUAGE: write all visible copy (labels, titles, sample data) in the requested response language.
- Respond with the JSON object ONLY.`;

function pick(arr, i) { return arr[i % arr.length]; }
function clampHue(h) { const n = Number(h); return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 210; }

// ---- defensive normalization so the renderer never crashes ----
function normalizeBlueprint(bp, fallbackName) {
  bp = bp && typeof bp === 'object' ? bp : {};
  const platform = bp.platform === 'web' ? 'web' : 'mobile';
  let tabs = Array.isArray(bp.tabs) ? bp.tabs : [];
  tabs = tabs
    .map((t, i) => ({
      id: String(t && t.id || `tab${i + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || `tab${i + 1}`,
      label: String(t && t.label || `Tab ${i + 1}`).slice(0, 18),
      icon: TAB_ICONS.includes(t && t.icon) ? t.icon : pick(TAB_ICONS, i)
    }))
    .slice(0, 5);
  if (!tabs.length) tabs = [{ id: 'home', label: 'Home', icon: 'home' }];

  const tabIds = new Set(tabs.map(t => t.id));
  let screens = Array.isArray(bp.screens) ? bp.screens : [];
  screens = screens.map((s, i) => {
    const id = String(s && s.id || `screen${i + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || `screen${i + 1}`;
    let tab = String(s && s.tab || '').toLowerCase();
    if (!tabIds.has(tab)) tab = tabs[0].id;
    return {
      id,
      tab,
      title: String(s && s.title || 'Screen').slice(0, 60),
      blocks: normalizeBlocks(s && s.blocks)
    };
  }).slice(0, 8);

  if (!screens.length) {
    screens = [{ id: 'home', tab: tabs[0].id, title: fallbackName || 'Home', blocks: [{ type: 'hero', title: fallbackName || 'Your app', subtitle: bp.tagline || 'Preview' }] }];
  }
  // Guarantee every tab resolves to a screen.
  const screenIds = new Set(screens.map(s => s.id));
  for (const t of tabs) {
    if (!screens.some(s => s.tab === t.id)) {
      const first = screens.find(s => s.tab === t.id);
      if (!first) {
        // point the tab at an existing screen instead of inventing an empty one
        t.id = t.id; // keep, but the renderer falls back to the first screen
      }
    }
  }
  // Strip goto targets that don't exist.
  for (const s of screens) {
    for (const b of s.blocks) {
      if (b.cta && b.cta.goto && !screenIds.has(b.cta.goto)) delete b.cta.goto;
      if (b.goto && !screenIds.has(b.goto)) delete b.goto;
      if (Array.isArray(b.items)) b.items.forEach(it => { if (it.goto && !screenIds.has(it.goto)) delete it.goto; });
    }
  }

  const primary = Array.isArray(bp.primary_flow)
    ? bp.primary_flow.filter(id => screenIds.has(id))
    : [];

  return {
    app_name: String(bp.app_name || fallbackName || 'Your App').slice(0, 40),
    tagline: String(bp.tagline || '').slice(0, 120),
    platform,
    brand_hue: clampHue(bp.brand_hue),
    industry: String(bp.industry || '').slice(0, 40),
    tabs,
    screens,
    primary_flow: primary.length ? primary : screens.slice(0, 3).map(s => s.id)
  };
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter(b => b && BLOCK_TYPES.includes(b.type))
    .slice(0, 6)
    .map(b => {
      const t = b.type;
      if (t === 'metric_row') b.metrics = (Array.isArray(b.metrics) ? b.metrics : []).slice(0, 4);
      if (t === 'list') b.items = (Array.isArray(b.items) ? b.items : []).slice(0, 8);
      if (t === 'feed') b.items = (Array.isArray(b.items) ? b.items : []).slice(0, 8);
      if (t === 'chart') { b.series = (Array.isArray(b.series) ? b.series : []).slice(0, 8); b.kind = b.kind === 'line' ? 'line' : 'bars'; }
      if (t === 'chat') b.messages = (Array.isArray(b.messages) ? b.messages : []).slice(0, 8);
      if (t === 'form') b.fields = (Array.isArray(b.fields) ? b.fields : []).slice(0, 8);
      return b;
    });
}

// ---- zero-key heuristic fallback (no API key or upstream failure) ----
function heuristicBlueprint(desc, lang, name) {
  const es = lang === 'es';
  const words = String(desc || '').toLowerCase();
  const isAI = /(ai|voz|voice|assistant|asistente|chat|bot|agent|agente)/.test(words);
  const hue = /health|salud|clinic|medi/.test(words) ? 150
    : /finan|pago|pay|money|dinero|bank/.test(words) ? 205
    : /logist|freight|fleet|carga/.test(words) ? 25
    : /shop|market|store|tienda|venta/.test(words) ? 265 : 210;
  const T = es
    ? { home: 'Inicio', activity: 'Actividad', add: 'Nuevo', me: 'Perfil', hero: 'Tu producto, simulado', sub: 'Así se vería la app que estás pidiendo.', open: 'Ver detalle', book: 'Agendar y construir', ask: 'Pregúntale a la IA', send: 'Enviar' }
    : { home: 'Home', activity: 'Activity', add: 'New', me: 'Profile', hero: 'Your product, simulated', sub: 'A live preview of the app you are requesting.', open: 'Open detail', book: 'Book & build', ask: 'Ask the AI', send: 'Send' };

  const tabs = [
    { id: 'home', label: T.home, icon: 'home' },
    { id: 'activity', label: T.activity, icon: 'chart' },
    { id: 'add', label: T.add, icon: 'plus' },
    { id: 'me', label: T.me, icon: 'user' }
  ];
  const screens = [
    { id: 'home', tab: 'home', title: name, blocks: [
      { type: 'hero', title: T.hero, subtitle: T.sub, cta: { label: T.open, goto: 'detail' } },
      { type: 'metric_row', metrics: [
        { label: es ? 'Activos' : 'Active', value: '128', delta: '+12%' },
        { label: es ? 'Hoy' : 'Today', value: '24', delta: '+5' },
        { label: es ? 'Pendientes' : 'Pending', value: '7', delta: '-2' }
      ] },
      { type: 'list', title: es ? 'Reciente' : 'Recent', items: [
        { title: es ? 'Elemento 1' : 'Item 1', subtitle: es ? 'Actualizado hace 2h' : 'Updated 2h ago', badge: 'OK', goto: 'detail' },
        { title: es ? 'Elemento 2' : 'Item 2', subtitle: es ? 'En progreso' : 'In progress', badge: '•' }
      ] }
    ] },
    { id: 'detail', tab: 'home', title: es ? 'Detalle' : 'Detail', blocks: [
      { type: 'card', title: es ? 'Resumen' : 'Summary', body: T.sub, tag: name },
      { type: 'chart', title: es ? 'Tendencia' : 'Trend', kind: 'bars', series: [
        { label: 'Mon', value: 30 }, { label: 'Tue', value: 55 }, { label: 'Wed', value: 42 }, { label: 'Thu', value: 70 }, { label: 'Fri', value: 61 }
      ] },
      { type: 'cta', label: T.book, goto: 'me', style: 'primary' }
    ] },
    { id: 'activity', tab: 'activity', title: T.activity, blocks: [
      { type: 'feed', items: [
        { who: es ? 'Sistema' : 'System', when: '2h', text: es ? 'Nuevo registro creado.' : 'New record created.' },
        { who: es ? 'Equipo' : 'Team', when: '5h', text: es ? 'Tarea completada.' : 'Task completed.' }
      ] }
    ] },
    { id: 'add', tab: 'add', title: T.add, blocks: [
      { type: 'form', title: es ? 'Crear nuevo' : 'Create new', fields: [
        { label: es ? 'Nombre' : 'Name', kind: 'text' },
        { label: es ? 'Categoría' : 'Category', kind: 'select', options: ['A', 'B', 'C'] },
        { label: es ? 'Notas' : 'Notes', kind: 'textarea' }
      ], submit: es ? 'Guardar' : 'Save' }
    ] },
    { id: 'me', tab: 'me', title: T.me, blocks: [
      { type: 'card', title: es ? 'Tu plan' : 'Your plan', body: es ? 'Este simulador refleja lo que pediste. Agenda una llamada y lo construimos.' : 'This simulator reflects what you asked for. Book a call and we build it.' },
      { type: 'cta', label: T.book, goto: 'home', style: 'primary' }
    ] }
  ];
  if (isAI) {
    screens.splice(2, 0, { id: 'assistant', tab: 'activity', title: es ? 'Asistente IA' : 'AI Assistant', blocks: [
      { type: 'chat', messages: [
        { from: 'ai', text: es ? 'Hola, ¿en qué te ayudo hoy?' : 'Hi, how can I help today?' },
        { from: 'user', text: es ? 'Muéstrame el resumen.' : 'Show me the summary.' },
        { from: 'ai', text: es ? 'Claro, aquí está tu resumen del día.' : 'Sure — here is your summary for today.' }
      ] }
    ] });
  }
  return normalizeBlueprint({ app_name: name, tagline: T.sub, platform: 'mobile', brand_hue: hue, industry: '', tabs, screens, primary_flow: ['home', 'detail', 'me'] }, name);
}

async function generate(project, opts = {}) {
  // d2_projects stores the title in `name` and the brief in `description`.
  // Keep the legacy field names as fallbacks in case an object shape differs.
  const desc = String(
    project.description || project.project_description || project.problem || project.name || project.project_title || ''
  ).trim();
  const lang = opts.lang === 'es' || opts.lang === 'en'
    ? opts.lang
    : (/[áéíóúñ¿¡]/i.test(desc) || /\b(que|para|con|una|los|las|del)\b/i.test(desc) ? 'es' : 'en');
  const fallbackName = String(project.name || project.project_title || 'Your App').slice(0, 40);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...heuristicBlueprint(desc, lang, fallbackName), model: 'heuristic', lang };
  }
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {
    return { ...heuristicBlueprint(desc, lang, fallbackName), model: 'heuristic', lang };
  }

  const model = process.env.SIMULATOR_MODEL || 'claude-sonnet-4-6';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Fold in the triage plan if it was passed, so the mockup matches the scope card.
  const plan = opts.plan || {};
  const planLine = plan && (plan.problem_in_our_words || (plan.technical_solution && plan.technical_solution.summary))
    ? `\n\nSCOPED PLAN (from OrbUp triage — align the mockup to this):\n- Problem: ${plan.problem_in_our_words || ''}\n- Build: ${(plan.technical_solution && plan.technical_solution.summary) || ''}\n- What we build: ${((plan.technical_solution && plan.technical_solution.what_we_build) || []).join('; ')}`
    : '';

  const userMsg = `RESPONSE LANGUAGE: ${lang === 'es' ? 'Spanish (proper orthography: tildes, ñ, ¿¡).' : 'English.'}

PROSPECT PRODUCT DESCRIPTION:
${desc || project.name || '(no description)'}${planLine}

Design the interactive app mockup blueprint as a single JSON object per the required shape. Respond with JSON only.`;

  let raw = '';
  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 6000,   // rich, domain-specific blueprints run ~3-5k tokens; 3k truncated -> parse fail
      system: SIM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    });
    raw = resp && resp.content && resp.content[0] ? resp.content[0].text : '';
  } catch (err) {
    console.error('[AppSimulator] Claude call failed:', err.message);
    return { ...heuristicBlueprint(desc, lang, fallbackName), model: 'heuristic', lang };
  }

  const parsed = safeJson(raw);
  if (!parsed) {
    return { ...heuristicBlueprint(desc, lang, fallbackName), model: 'heuristic-fallback', lang };
  }
  const bp = normalizeBlueprint(parsed, fallbackName);
  return { ...bp, model, lang };
}

function safeJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('{');
  if (first === -1) return null;
  const last = s.lastIndexOf('}');
  if (last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch (_) {}
  }
  // Repair a truncated object: from the first '{', close any brackets/quotes
  // the model didn't finish (drops the incomplete tail so the rest survives).
  return repairTruncatedJson(s.slice(first));
}

function repairTruncatedJson(s) {
  let inStr = false, esc = false;
  const stack = [];
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') stack.pop();
    // a comma or closer at depth>=1 marks a point we can safely truncate to
    if (!inStr && stack.length >= 1 && (c === ',' || c === '}' || c === ']')) lastSafe = i;
  }
  const candidates = [];
  // 1) close everything still open from the full string
  candidates.push(closeOpen(s, inStr, cloneClosers(s)));
  // 2) truncate to the last safe boundary, then close
  if (lastSafe > 0) {
    let t = s.slice(0, lastSafe + 1).replace(/,\s*$/, '');
    candidates.push(closeOpen(t, false, cloneClosers(t)));
  }
  for (const cand of candidates) {
    try { const o = JSON.parse(cand); if (o && typeof o === 'object') return o; } catch (_) {}
  }
  return null;
}
function cloneClosers(s) {
  let inStr = false, esc = false; const stack = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  return stack;
}
function closeOpen(s, inStr, stack) {
  let out = s.replace(/,\s*$/, '');
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

module.exports = { generate, normalizeBlueprint, heuristicBlueprint, BLOCK_TYPES, safeJson };
