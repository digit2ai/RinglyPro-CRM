// GET /            — camera capture UI (multi-vital rPPG), i18n via ?lang (ES default)
// GET /dashboard   — reading history table
// GET /disclaimer  — non-medical wellness disclaimer (AC8)
// GET /embed       — chromeless capture widget for <iframe allow="camera">
// GET /embed-code  — iframe snippet generator (click-to-copy)
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { selectLang } = require('../i18n/dict');

const PUB = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const INDEX = read('index.html');
const DASH = read('dashboard.html');
const DISC = read('disclaimer.html');
const EMBED = read('embed.html');
const EMBEDCODE = read('embed-code.html');

function render(tpl, lang) {
  const d = selectLang(lang);
  return tpl
    .replace(/\{\{LANG\}\}/g, lang === 'en' ? 'en' : 'es')
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in d ? String(d[k]) : m));
}

function langOf(req) { return req.query.lang === 'en' ? 'en' : 'es'; }
function send(res, tpl, lang) { res.set('Cache-Control', 'no-cache').type('html').send(render(tpl, lang)); }

router.get('/', (req, res) => send(res, INDEX, langOf(req)));
router.get('/dashboard', (req, res) => send(res, DASH, langOf(req)));
router.get('/disclaimer', (req, res) => send(res, DISC, langOf(req)));
router.get('/embed', (req, res) => {
  // Embeddable widget can be framed anywhere; allow same-origin camera in iframe.
  res.set('Cache-Control', 'no-cache');
  send(res, EMBED, langOf(req));
});
router.get('/embed-code', (req, res) => send(res, EMBEDCODE, langOf(req)));

module.exports = router;
