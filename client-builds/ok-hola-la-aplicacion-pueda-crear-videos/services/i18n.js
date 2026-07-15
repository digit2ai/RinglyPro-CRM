'use strict';
const fs = require('fs');
const path = require('path');

const DICTS = {};
function load(lang) {
  if (DICTS[lang]) return DICTS[lang];
  try {
    const p = path.join(__dirname, '..', 'public', 'i18n', `${lang}.json`);
    DICTS[lang] = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    DICTS[lang] = {};
  }
  return DICTS[lang];
}

// Resolve requested language; Spanish is the default.
function resolveLang(req) {
  const q = (req.query && req.query.lang ? String(req.query.lang) : '').toLowerCase();
  return q === 'en' ? 'en' : 'es';
}

function dict(lang) {
  return load(lang === 'en' ? 'en' : 'es');
}

module.exports = { resolveLang, dict };
