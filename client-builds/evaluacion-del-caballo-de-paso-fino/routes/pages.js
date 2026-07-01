// =====================================================
// Pages — server-rendered, language-aware HTML.
//   GET /            -> upload + diagnostic-card UI (ES default; #8)
//   GET /dashboard   -> per-horse evaluation history
//   GET /privacidad  -> Ley 1581 data-protection note (#9)
//
// Rendered SERVER-SIDE so a raw GET (no JS) already shows the correct <h1>:
// GET / => Spanish "Evaluación…"; GET /?lang=en => English. The full dictionary
// is inlined as window.__I18N for the client.
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
const JUEZ_TPL = fs.readFileSync(path.join(PUB, 'juez.html'), 'utf8');
const LOGIN_TPL = fs.readFileSync(path.join(PUB, 'login.html'), 'utf8');
const SIGNUP_TPL = fs.readFileSync(path.join(PUB, 'signup.html'), 'utf8');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function render(tpl, req) {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  return tpl
    .replace(/\{\{LANG\}\}/g, esc(lang))
    .replace(/\{\{BASE\}\}/g, esc(base))
    .replace(/\{\{TITLE\}\}/g, esc(d.title))
    .replace(/\{\{H1\}\}/g, esc(d.h1))
    .replace(/\{\{TAGLINE\}\}/g, esc(d.tagline))
    .replace(/\{\{DICT_JSON\}\}/g, JSON.stringify(d).replace(/</g, '\\u003c'));
}

router.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(INDEX_TPL, req));
});

router.get('/dashboard', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(DASH_TPL, req));
});

// /juez — the championship judge (video + audio -> modality + score + ranking).
router.get('/juez', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(JUEZ_TPL, req));
});

// Account pages (own auth system): login + signup.
router.get('/login', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(LOGIN_TPL, req));
});
router.get('/signup', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(SIGNUP_TPL, req));
});

// /privacidad — Ley 1581 de 2012 statement: no personal data is processed.
router.get('/privacidad', (req, res) => {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  const body = lang === 'en'
    ? `<h1>Data Protection</h1>
<p>This proof-of-concept processes <strong>no personal data</strong>. It stores only horse names and gait metrics derived from an uploaded audio clip. No owner identifiers, contact details, or other personal information are collected, stored, or shared.</p>
<p>Because no personal data is processed, the requirements of Colombia's <strong>Ley 1581 de 2012</strong> (Habeas Data) are met by design. Uploaded audio is analyzed in memory and discarded; it is never persisted.</p>
<p><a href="${esc(base)}">&larr; Back</a></p>`
    : `<h1>Protección de Datos</h1>
<p>Esta prueba de concepto <strong>no procesa datos personales</strong>. Solo almacena nombres de caballos y métricas de marcha derivadas de un audio cargado. No se recopilan, almacenan ni comparten identificadores del propietario, datos de contacto ni ninguna otra información personal.</p>
<p>Dado que no se procesan datos personales, los requisitos de la <strong>Ley 1581 de 2012</strong> (Habeas Data) de Colombia se cumplen por diseño. El audio cargado se analiza en memoria y se descarta; nunca se persiste.</p>
<p><a href="${esc(base)}">&larr; Volver</a></p>`;
  const html = `<!doctype html><html lang="${esc(lang)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.privacy_title || 'Privacidad')} — ${esc(d.title)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-slate-950 text-slate-100 min-h-screen">
<main class="max-w-2xl mx-auto px-6 py-16 prose prose-invert">${body}</main>
</body></html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

module.exports = router;
