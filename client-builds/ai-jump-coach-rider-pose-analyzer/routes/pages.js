// =====================================================
// Pages — GET / (upload UI), /dashboard (history), /privacy.
//
// Rendered SERVER-SIDE with the requested language so a raw GET (no JS) already
// shows the correct <h1> and copy: GET / => Spanish (default), GET /?lang=en =>
// English. The full dictionary is also inlined as window.__I18N for the client.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pickLang, dict } = require('../lib/i18n');

const PUB = path.join(__dirname, '..', 'public');
const INDEX_TPL = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const DASH_TPL = fs.readFileSync(path.join(PUB, 'dashboard.html'), 'utf8');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Replace the shared placeholders in a template with localized values.
function render(tpl, req) {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  // Mount base = where the sub-app is mounted in the parent app (e.g.
  // /ai-jump-coach-rider-pose-analyzer). baseUrl is '' when run standalone.
  const base = (req.baseUrl || '') + '/';
  return tpl
    .replace(/\{\{LANG\}\}/g, esc(lang))
    .replace(/\{\{BASE\}\}/g, esc(base))
    .replace(/\{\{TITLE\}\}/g, esc(d.title))
    .replace(/\{\{H1\}\}/g, esc(d.h1))
    .replace(/\{\{TAGLINE\}\}/g, esc(d.tagline))
    .replace(/\{\{POC_BADGE\}\}/g, esc(d.poc_badge))
    .replace(/\{\{DICT_JSON\}\}/g, JSON.stringify(d).replace(/</g, '\\u003c'));
}

router.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(INDEX_TPL, req));
});

router.get('/dashboard', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(DASH_TPL, req));
});

// /privacy — server-rendered data-handling statement (acceptance #6).
router.get('/privacy', (req, res) => {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  const html = `<!doctype html><html lang="${esc(lang)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.privacy_title)} — ${esc(d.title)}</title>
<style>
:root{--bg:#0b0f1a;--card:#141b29;--line:#243049;--txt:#e9eef7;--mut:#8a98b0;--accent:#9b7bff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);
font:16px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;padding:40px 20px}
.wrap{max-width:760px;margin:0 auto}.card{background:var(--card);border:1px solid var(--line);
border-radius:16px;padding:28px}h1{margin:0 0 16px;font-size:24px}p{color:var(--mut)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.back{display:inline-block;margin-top:22px}
</style></head><body><div class="wrap"><div class="card">
<h1>${esc(d.privacy_title)}</h1>
<p data-i18n="privacy_body">${esc(d.privacy_body)}</p>
<a class="back" href="${esc(base)}?lang=${esc(lang)}">&larr; ${esc(d.back_home)}</a>
</div></div></body></html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

module.exports = router;
