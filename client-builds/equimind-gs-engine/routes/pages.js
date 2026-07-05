// Server-rendered, language-aware product surfaces for the GS engine.
'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pickLang, dict } = require('../lib/i18n');

const PUB = path.join(__dirname, '..', 'public');
const TPL = {
  viewer: fs.readFileSync(path.join(PUB, 'viewer.html'), 'utf8'),
  capture: fs.readFileSync(path.join(PUB, 'capture.html'), 'utf8'),
  admin: fs.readFileSync(path.join(PUB, 'admin.html'), 'utf8'),
  report: fs.readFileSync(path.join(PUB, 'report.html'), 'utf8')
};

function esc(s) { return String(s == null ? '' : s).replace(/</g, '&lt;'); }
function render(tpl, req) {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  return tpl
    .replace(/\{\{LANG\}\}/g, esc(lang))
    .replace(/\{\{BASE\}\}/g, esc(base))
    .replace(/\{\{TITLE\}\}/g, esc(d.title))
    .replace(/\{\{DICT_JSON\}\}/g, JSON.stringify(d).replace(/</g, '\\u003c'));
}
function send(name) { return (req, res) => res.set('Content-Type', 'text/html; charset=utf-8').send(render(TPL[name], req)); }

router.get('/', send('capture'));
router.get('/capture', send('capture'));
router.get('/viewer', send('viewer'));
router.get('/report', send('report'));
router.get('/admin', send('admin'));

module.exports = router;
