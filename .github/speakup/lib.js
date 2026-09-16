'use strict';

/**
 * SpeakUp AI Factory — shared helpers for the GitHub Actions scripts.
 *
 * THE REPOSITORY IS PUBLIC, SO ARE ITS ACTION LOGS. Nothing here prints the brief,
 * the plan, a requirement, a transcript or a test log to stdout. Private material
 * lives in $WORK (the runner's temp directory) and dies with the runner.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WORK = process.env.WORK || path.join(process.env.RUNNER_TEMP || '/tmp', 'speakup');
fs.mkdirSync(WORK, { recursive: true });

function base() {
  const b = String(process.env.SPEAKUP_BASE_URL || 'https://aiagent.ringlypro.com/speakup').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._\/-]*)?$/.test(b)) throw new Error('SPEAKUP_BASE_URL must be an https URL');
  return b;
}

function jobId() {
  const id = String(process.env.JOB_ID || '');
  if (!/^\d{1,9}$/.test(id)) throw new Error('JOB_ID must be digits');
  return id;
}

// Trimmed: a secret pasted into GitHub often carries a trailing newline, and an
// invisible character is otherwise indistinguishable from a wrong value.
function secret() {
  const s = String(process.env.SPEAKUP_FACTORY_SECRET || '').trim();
  if (!s) throw new Error('SPEAKUP_FACTORY_SECRET is not set on GitHub (repository secret)');
  return s;
}
function fingerprint() { return crypto.createHash('sha256').update(secret()).digest('hex').slice(0, 8); }

function hmac(s, body) { return crypto.createHmac('sha256', s).update(body).digest('hex'); }
function sha16(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(WORK, name), 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(name, data) { fs.writeFileSync(path.join(WORK, name), JSON.stringify(data, null, 2)); }
function readText(name) { try { return fs.readFileSync(path.join(WORK, name), 'utf8'); } catch (e) { return ''; } }
function fail(message) { fs.writeFileSync(path.join(WORK, 'error.txt'), message); console.error(message.replace(/[^\x20-\x7E]/g, '?').slice(0, 200)); process.exit(1); }

function setOutput(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const v = String(value);
  if (/[\r\n]/.test(v)) {
    const d = 'EOF_' + crypto.randomBytes(8).toString('hex');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}<<${d}\n${v}\n${d}\n`);
  } else fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${v}\n`);
}

// Accent/case/punctuation-insensitive words, same rule as the server's normalizeSpoken.
function words(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
}
const SHINGLE = 5;
function shingles(ws) {
  const out = [];
  for (let i = 0; i + SHINGLE <= ws.length; i++) out.push(ws.slice(i, i + SHINGLE).join(' '));
  return out;
}

module.exports = { WORK, base, jobId, secret, fingerprint, hmac, sha16, readJSON, writeJSON, readText, fail, setOutput, words, shingles, SHINGLE };
