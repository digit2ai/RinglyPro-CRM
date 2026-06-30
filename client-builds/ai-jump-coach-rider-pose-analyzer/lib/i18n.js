// =====================================================
// i18n — load en.json / es.json and pick by ?lang. Default ES (the submitter
// writes in Spanish). No i18next; just two flat JSON dictionaries.
// =====================================================

'use strict';

const fs = require('fs');
const path = require('path');

const DICTS = {};
for (const lang of ['es', 'en']) {
  try {
    DICTS[lang] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${lang}.json`), 'utf8'));
  } catch (e) {
    DICTS[lang] = { lang };
  }
}

// Normalize an incoming ?lang to a supported one. Default 'es'.
function pickLang(raw) {
  const l = String(raw || '').toLowerCase().slice(0, 2);
  return l === 'en' ? 'en' : 'es';
}

function dict(lang) {
  return DICTS[pickLang(lang)] || DICTS.es;
}

module.exports = { pickLang, dict, DICTS };
