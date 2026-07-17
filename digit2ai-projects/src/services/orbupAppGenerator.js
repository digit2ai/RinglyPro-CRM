'use strict';

// =============================================================
// orbupAppGenerator — turns a natural-language description into a REAL,
// working, self-contained single-file web application (Lovable-style),
// and edits an existing one from a follow-up instruction.
//
// The output is ONE complete HTML document with inline CSS + JS and no
// external resources — it runs as a genuine app the user can use and
// share, not a mockup. Persistence via localStorage. Served at a per-app
// magic link by routes/orbupApps.js.
//
//   generate({ prompt, name }) -> { code, model, title }
//   edit({ code, instruction }) -> { code, model }
// =============================================================

const BUILD_SYSTEM = `You are a senior front-end engineer at OrbUp. Build a COMPLETE, genuinely working, self-contained single-file web application from the user's description.

⚠️ NO EXTERNAL RESOURCES — THIS IS ENFORCED. The app runs under a strict Content-Security-Policy that BLOCKS every network request. Any CDN script, external stylesheet, remote font, remote image, or fetch/XHR to another host WILL be blocked and your app WILL appear broken/empty. Therefore:
- Do NOT use Chart.js, D3, Tailwind CDN, Bootstrap CDN, Google Fonts, Font Awesome, jQuery, React, or ANY library loaded from a URL.
- Build charts and graphs yourself with inline <svg> or a <canvas> drawn in plain JS (bars, lines, donuts, sparklines — all doable by hand).
- Icons = emoji or hand-written inline <svg>. Fonts = the system font stack (-apple-system, system-ui, sans-serif). Images = inline <svg> or a data: URI.
- No fetch/XHR/WebSocket to any external API.

MUST WORK ON FIRST LOAD — NO EMPTY SHELLS
- Never render an empty dashboard, list, table, chart, or log on first open. SEED 4-8 realistic sample records that match the domain and RENDER them immediately, so the app looks alive and populated the moment it opens.
- Every stat card shows a real number, every chart shows real data, every list shows real rows.

EVERYTHING MUST BE WIRED
- Wire EVERY interactive element. There are no dead buttons. The primary action button MUST produce an immediate, visible result.
- For any action the description implies a backend for (scan, analyze, monitor, fetch, search, generate, send, detect), SIMULATE it convincingly client-side: on click, generate realistic results, add them to the data, update every affected stat/chart/list, and give visible feedback (a toast, a spinner→result, a new row). It must feel live.
- Persist all state to localStorage under a unique key so it survives refresh.

CODE QUALITY — MUST RUN WITHOUT ERRORS
- Vanilla JS only. Put the <script> at the END of <body>, or initialize on DOMContentLoaded, so the DOM exists when it runs.
- Guard DOM lookups; wire listeners with addEventListener. No undefined-variable or null-reference errors. Assume the browser console must be clean.
- Render the initial UI from the seeded data in the same load — define a render() function and call it once on start.

SCOPE — COMPLETE BEATS AMBITIOUS
- A smaller app where EVERY feature works end-to-end is far better than a large shell with unfinished, non-functional parts. If the concept is broad, implement a focused, coherent, fully-working version. Do not leave placeholders or "TODO"s. Do not exceed what you can fully implement and wire in one file.

OUTPUT
- ONE HTML document ONLY. Start with <!doctype html> and end with </html>. No prose, no markdown fences.

STYLE
- Modern, clean, confident; responsive (phone + desktop); a coherent palette fitting the domain; hover/active states and small transitions. Accessible: labels, contrast, keyboard-usable.

Return ONLY the HTML.`;

const EDIT_SYSTEM = `You are a senior front-end engineer at OrbUp. You are given an existing single-file web application (one complete HTML document) and a change request. Apply the requested change and return the FULL updated HTML document.

HARD REQUIREMENTS
- Output ONE complete HTML document ONLY. Start with <!doctype html> (or <html>) and end with </html>. No prose, no markdown fences.
- The app runs under a strict CSP that BLOCKS all network requests — keep everything self-contained: inline CSS/JS, NO external resources (no CDN libs, fonts, or remote images). Charts = inline SVG/canvas. Icons = emoji/inline SVG.
- Preserve existing functionality, seeded data, and localStorage persistence unless the request says otherwise. Every button stays wired; the app must still be fully functional and populated on load.
- Make the smallest change that satisfies the request well, then return the WHOLE file (never a fragment or a diff).

Return ONLY the updated HTML.`;

function stripToHtml(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const lower = s.toLowerCase();
  let start = lower.indexOf('<!doctype');
  if (start === -1) start = lower.indexOf('<html');
  if (start > 0) s = s.slice(start);
  // ensure it closes
  if (!/<\/html>/i.test(s)) s += '\n</html>';
  return s.trim();
}

function titleFrom(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return 'Your App';
  // first ~6 words, title-cased-ish
  return p.split(/\s+/).slice(0, 7).join(' ').replace(/[.,;:]+$/, '').slice(0, 60);
}

function fallbackApp(prompt) {
  const t = titleFrom(prompt);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t}</title>
<style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#0b0f17;color:#e9eef7;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px}
.c{max-width:520px}.o{width:70px;height:70px;border-radius:50%;margin:0 auto 18px;background:radial-gradient(circle at 35% 30%,#bda4ff,#6a4bff 45%,#2a1f6b)}
h1{font-size:22px}p{color:#8ea0bd;line-height:1.6}</style></head>
<body><div class="c"><div class="o"></div><h1>${t}</h1><p>Your app builder is not fully configured yet (no AI key on the server). Once configured, describing an app here builds a real, working app.</p></div></body></html>`;
}

async function callClaude({ system, user, maxTokens }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) { return null; }
  const model = process.env.ORBUP_APP_MODEL || 'claude-sonnet-4-6';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    // Stream server-side and collect — avoids SDK HTTP timeouts on large output.
    const stream = await client.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    });
    const msg = await stream.finalMessage();
    const block = Array.isArray(msg.content) ? msg.content.find(c => c && c.type === 'text') : null;
    return { text: block ? block.text : '', model, stop_reason: msg && msg.stop_reason };
  } catch (err) {
    console.error('[orbupAppGenerator] Claude call failed:', err.message);
    return { text: '', model, error: err.message };
  }
}

// A cut-off app is a broken app. Truncation shows up as stop_reason "max_tokens"
// or a body that ends without closing its <script>/</html> — the JS at the tail
// (the wiring) is exactly what gets lost.
function looksTruncated(res, code) {
  if (res && res.stop_reason === 'max_tokens') return true;
  const raw = String((res && res.text) || '');
  if (raw && !/<\/html\s*>/i.test(raw)) return true;                 // never closed
  if (/<script[\s>]/i.test(code) && !/<\/script\s*>/i.test(code)) return true; // open script, no close
  return false;
}

async function generate({ prompt, name }) {
  const desc = String(prompt || '').trim();
  const title = (name && String(name).trim()) || titleFrom(desc);
  const user = `Build this web app:\n\n${desc || 'A simple, useful web app.'}\n\nApp name (use it as the document title and in the header): ${title}`;
  const res = await callClaude({ system: BUILD_SYSTEM, user, maxTokens: 16000 });
  if (!res || !res.text) return { code: fallbackApp(desc), model: 'fallback', title, truncated: false };
  const code = stripToHtml(res.text);
  return { code, model: res.model, title, truncated: looksTruncated(res, code) };
}

async function edit({ code, instruction }) {
  const existing = String(code || '');
  const req = String(instruction || '').trim();
  if (!existing) return { code: fallbackApp(req), model: 'fallback' };
  const user = `Change request:\n${req}\n\n--- CURRENT APP (full HTML) ---\n${existing}`;
  const res = await callClaude({ system: EDIT_SYSTEM, user, maxTokens: 16000 });
  if (!res || !res.text) return { code: existing, model: 'fallback' };
  return { code: stripToHtml(res.text), model: res.model };
}

module.exports = { generate, edit, stripToHtml, titleFrom };
