// GET /            — camera capture UI (rPPG), i18n via ?lang (ES default)
// GET /dashboard   — reading history table
// GET /disclaimer  — non-medical wellness disclaimer (AC8)
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { selectLang } = require('../i18n/dict');

const INDEX = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const DASH = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
const DISC = fs.readFileSync(path.join(__dirname, '..', 'public', 'disclaimer.html'), 'utf8');

function render(tpl, lang) {
  const d = selectLang(lang);
  return tpl
    .replace(/\{\{LANG\}\}/g, lang === 'en' ? 'en' : 'es')
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in d ? String(d[k]) : m));
}

function langOf(req) { return req.query.lang === 'en' ? 'en' : 'es'; }

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache').type('html').send(render(INDEX, langOf(req)));
});

router.get('/dashboard', (req, res) => {
  res.set('Cache-Control', 'no-cache').type('html').send(render(DASH, langOf(req)));
});

router.get('/disclaimer', (req, res) => {
  res.set('Cache-Control', 'no-cache').type('html').send(render(DISC, langOf(req)));
});

module.exports = router;
