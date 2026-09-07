/* ─────────────────────────────────────────────────────────────────────────
   THE ARCHITECT DISPATCH BOARD — the /ringlypro-architect reference, gated.

   Served at /architect on the app, and at the root of architect.digit2ai.com
   once that CNAME exists.

   THE PAGE LIVES IN src/views/, NOT public/. `express.static(public)` in
   app.js would serve anything under public/ to the open internet with no
   credential at all — the gate below would still be mounted, and would still
   pass, and the file would still be readable by anyone who guessed the name.
   Keeping it outside the static root is what actually makes this private; the
   password is the second lock, not the first.

   CREDENTIALS COME FROM THE ENVIRONMENT AND HAVE NO DEFAULT. With either
   variable unset the board is CLOSED (503), never open. This repo has been
   bitten by the other choice: a console shipped with a fallback password that
   read as configured, and anyone who had read the repo could sign in. An
   unset secret must fail shut.

   ───────────────────────────────────────────────────────────────────────── */

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const BOARD = path.join(__dirname, '..', 'views', 'architect-board.html');
const REALM = 'Architect Dispatch Board';

function user() { return process.env.ARCHITECT_USER || ''; }
function pass() { return process.env.ARCHITECT_PASSWORD || ''; }
function configured() { return Boolean(user() && pass()); }

/**
 * Constant-time string compare.
 *
 * `timingSafeEqual` throws when the buffers differ in length, which by itself
 * leaks the length of the real secret through the error path — so both sides
 * are hashed to a fixed 32 bytes first and the comparison is always over
 * equal-length input.
 */
function same(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

function challenge(res) {
  res.set('WWW-Authenticate', 'Basic realm="' + REALM + '", charset="UTF-8"');
  return res.status(401).type('html').send(page401());
}

function gate(req, res, next) {
  if (!configured()) {
    return res.status(503).type('html').send(page503());
  }
  const header = req.get('authorization') || '';
  if (!/^basic /i.test(header)) return challenge(res);

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch (e) {
    return challenge(res);
  }
  const cut = decoded.indexOf(':');
  if (cut === -1) return challenge(res);

  const gotUser = decoded.slice(0, cut);
  const gotPass = decoded.slice(cut + 1);

  // Both compares always run — returning early on a bad username would make
  // "wrong user" measurably faster than "wrong password".
  const okUser = same(gotUser.trim().toLowerCase(), user().trim().toLowerCase());
  const okPass = same(gotPass, pass());
  if (!(okUser && okPass)) return challenge(res);

  return next();
}

/* ── the board ─────────────────────────────────────────────────────────── */
router.get('/', gate, (req, res) => {
  fs.readFile(BOARD, 'utf8', (err, html) => {
    if (err) {
      console.error('[architect-board] cannot read view:', err.message);
      return res.status(500).type('text').send('The board is not available.');
    }
    // An internal reference is never cached by a proxy and never indexed.
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.set('Referrer-Policy', 'no-referrer');
    res.type('html').send(html);
  });
});

/* Health is open on purpose: it reports service state, never content, and is
   what tells you the gate is configured without having to sign in. */
router.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'architect-board',
    configured: configured(),
    user_set: Boolean(user()),
    password_set: Boolean(pass()),
    view_present: fs.existsSync(BOARD),
    note: configured()
      ? 'Gated. Sign in with ARCHITECT_USER / ARCHITECT_PASSWORD.'
      : 'CLOSED — set ARCHITECT_USER and ARCHITECT_PASSWORD on Render. Unset fails shut, never open.'
  });
});

/* Anything else under /architect is a typo, not a page. */
router.use((req, res) => res.status(404).type('html').send(page404()));

/* ── the three responses that are not the board ────────────────────────── */
const SHELL = (title, heading, body, cta) =>
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="robots" content="noindex,nofollow">' +
  '<title>' + title + '</title><style>' +
  ':root{color-scheme:light dark;--bg:#F2F4F8;--surface:#fff;--ink:#10162B;--mut:#525C78;' +
  '--line:#DCE2EE;--accent:#2450DC}' +
  '@media(prefers-color-scheme:dark){:root{--bg:#0B0E17;--surface:#141926;--ink:#E9ECF5;' +
  '--mut:#9BA5BE;--line:#242C3E;--accent:#7EA0FF}}' +
  'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;' +
  'background:var(--bg);color:var(--ink);' +
  'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6}' +
  '.c{max-width:52ch;background:var(--surface);border:1px solid var(--line);border-radius:12px;' +
  'padding:30px 32px}h1{margin:0 0 10px;font-size:22px;letter-spacing:-.02em}' +
  'p{margin:0 0 12px;color:var(--mut)}p:last-child{margin-bottom:0}' +
  'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;' +
  'background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:1px 6px;color:var(--accent)}' +
  '</style></head><body><div class="c"><h1>' + heading + '</h1>' + body +
  (cta || '') + '</div></body></html>';

function page401() {
  return SHELL('Sign in — Architect Dispatch Board', 'Sign in required',
    '<p>The Architect Dispatch Board is an internal reference and is not public.</p>' +
    '<p>Your browser will prompt for the credential. If it did not, reload the page.</p>');
}

function page503() {
  return SHELL('Not configured — Architect Dispatch Board', 'The board is closed',
    '<p>No credential is configured, so the board refuses to serve rather than opening ' +
    'without one.</p>' +
    '<p>Set <code>ARCHITECT_USER</code> and <code>ARCHITECT_PASSWORD</code> on Render, ' +
    'then redeploy.</p>');
}

function page404() {
  return SHELL('Not found — Architect Dispatch Board', 'No such page',
    '<p>That path does not exist on the Architect Dispatch Board.</p>' +
    '<p><a href="/architect">Go to the board</a></p>');
}

module.exports = router;
