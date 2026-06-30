// GET /dashboard  — server-renders the dark-theme UI in the requested language
// GET /privacy    — Ley 1581 de 2012 privacy notice
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { selectLang } = require('../lib/i18n');

const DASH = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
const PRIV = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8');

function render(tpl, lang) {
  const d = selectLang(lang);
  return tpl
    .replace(/\{\{LANG\}\}/g, lang === 'en' ? 'en' : 'es')
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in d ? String(d[k]) : m));
}

router.get('/dashboard', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'es';
  res.set('Cache-Control', 'no-cache').type('html').send(render(DASH, lang));
});

router.get('/privacy', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'es';
  res.set('Cache-Control', 'no-cache').type('html').send(render(PRIV, lang));
});

module.exports = router;
