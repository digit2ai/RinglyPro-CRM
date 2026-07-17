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

HARD REQUIREMENTS
- Output ONE HTML document ONLY. Start with <!doctype html> and end with </html>. No prose, no markdown fences, no explanation.
- Inline everything: all CSS in a <style> tag, all JS in a <script> tag. NO external resources of any kind — no CDN scripts, no external stylesheets, no remote fonts, no <img src="http...">, no fetch/XHR to third parties. Use system fonts, CSS, inline SVG, and emoji. Embed any imagery as inline SVG or a data: URI.
- The app must be genuinely FUNCTIONAL, not a static mock: real interactivity, working forms, add/edit/delete, filtering, calculations — whatever the description implies. Wire up every button.
- Persist user data with localStorage so it survives refresh (use a unique key). Seed with 2-4 realistic sample records so the app looks alive on first open.
- Responsive and polished: looks great on phone and desktop, thoughtful spacing, a coherent color system, hover/active states, empty states, and small touches (transitions, a header, a footer).
- Accessible: labels on inputs, sufficient contrast, keyboard-usable.
- Self-contained state only — no login/backend. If the description implies a backend feature, simulate it convincingly client-side.

STYLE
- Modern, clean, confident. Pick a palette that fits the product's domain. Avoid generic AI aesthetics (no default Inter-on-white purple-gradient look). Give it character.

Return ONLY the HTML.`;

const EDIT_SYSTEM = `You are a senior front-end engineer at OrbUp. You are given an existing single-file web application (one complete HTML document) and a change request. Apply the requested change and return the FULL updated HTML document.

HARD REQUIREMENTS
- Output ONE complete HTML document ONLY. Start with <!doctype html> (or <html>) and end with </html>. No prose, no markdown fences.
- Keep everything self-contained: inline CSS/JS, NO external resources, localStorage persistence preserved.
- Preserve existing functionality and data-shape unless the request says otherwise. Make the smallest change that satisfies the request well, then return the whole file.

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
    return { text: block ? block.text : '', model };
  } catch (err) {
    console.error('[orbupAppGenerator] Claude call failed:', err.message);
    return { text: '', model, error: err.message };
  }
}

async function generate({ prompt, name }) {
  const desc = String(prompt || '').trim();
  const title = (name && String(name).trim()) || titleFrom(desc);
  const user = `Build this web app:\n\n${desc || 'A simple, useful web app.'}\n\nApp name (use it as the document title and in the header): ${title}`;
  const res = await callClaude({ system: BUILD_SYSTEM, user, maxTokens: 14000 });
  if (!res || !res.text) return { code: fallbackApp(desc), model: 'fallback', title };
  return { code: stripToHtml(res.text), model: res.model, title };
}

async function edit({ code, instruction }) {
  const existing = String(code || '');
  const req = String(instruction || '').trim();
  if (!existing) return { code: fallbackApp(req), model: 'fallback' };
  const user = `Change request:\n${req}\n\n--- CURRENT APP (full HTML) ---\n${existing}`;
  const res = await callClaude({ system: EDIT_SYSTEM, user, maxTokens: 14000 });
  if (!res || !res.text) return { code: existing, model: 'fallback' };
  return { code: stripToHtml(res.text), model: res.model };
}

module.exports = { generate, edit, stripToHtml, titleFrom };
