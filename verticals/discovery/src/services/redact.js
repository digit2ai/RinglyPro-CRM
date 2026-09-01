'use strict';

/**
 * THE REDACTOR — the privacy boundary, enforced on the server.
 *
 * Scribe records screenshots and the text you typed, because it is building a
 * document a human will read. This module is building a cost model, and a cost
 * model needs the SHAPE of the work and nothing else: which system, what kind
 * of action, how long. It never needs the customer's name, the invoice total,
 * the patient id or the contents of the email.
 *
 * So it never accepts them. This runs on every ingested step regardless of
 * what the client sent, and the columns in dsc_steps have nowhere to put the
 * things it strips. Two halves of one guarantee: a client that is buggy,
 * malicious, or a forked build of our own extension still cannot land a value
 * in this database.
 *
 * WHY SERVER-SIDE AND NOT IN THE EXTENSION. An extension can be modified by
 * whoever installs it, and "our client redacts before sending" is a promise
 * about software running on someone else's machine. A compliance officer can
 * verify this file. They cannot verify a build on an employee's laptop.
 *
 * Every strip is COUNTED and returned in a redaction report stored alongside
 * the capture, so a company can see that the boundary did work rather than
 * being asked to trust that it was never tested.
 */

const crypto = require('crypto');

/* Actions we understand. Anything else becomes `other` — an unknown verb is
 * never passed through, because "whatever the client called it" is a text
 * field by another name. */
const ACTIONS = new Set([
  'navigate', 'click', 'type', 'submit', 'copy', 'paste',
  'upload', 'download', 'search', 'wait', 'switch_app', 'scroll', 'other'
]);

/* Element ROLES, not labels. "button" is shape; "Approve Invoice #4471" is
 * content, and would leak both a customer's process and an identifier. */
const ROLES = new Set([
  'button', 'link', 'field', 'select', 'checkbox', 'table', 'row',
  'file', 'tab', 'menu', 'dialog', 'editor', 'other'
]);

/* Hosts we can name in a report. A recognised host is a business system; an
 * unrecognised one is kept as a bare registrable domain, which is the least
 * that still makes the finding actionable. */
const APP_MAP = [
  [/(^|\.)salesforce\.com$/, 'Salesforce', 'crm'],
  [/(^|\.)force\.com$/, 'Salesforce', 'crm'],
  [/(^|\.)hubspot\.com$/, 'HubSpot', 'crm'],
  [/(^|\.)zoho\.com$/, 'Zoho', 'crm'],
  [/(^|\.)dynamics\.com$/, 'Microsoft Dynamics', 'erp'],
  [/(^|\.)sap\.com$/, 'SAP', 'erp'],
  [/(^|\.)netsuite\.com$/, 'NetSuite', 'erp'],
  [/(^|\.)odoo\.com$/, 'Odoo', 'erp'],
  [/(^|\.)quickbooks\.(com|intuit\.com)$/, 'QuickBooks', 'accounting'],
  [/(^|\.)intuit\.com$/, 'Intuit', 'accounting'],
  [/(^|\.)xero\.com$/, 'Xero', 'accounting'],
  [/(^|\.)docs\.google\.com$/, 'Google Docs', 'spreadsheets'],
  [/(^|\.)sheets\.google\.com$/, 'Google Sheets', 'spreadsheets'],
  [/(^|\.)drive\.google\.com$/, 'Google Drive', 'saas_tools'],
  [/(^|\.)mail\.google\.com$/, 'Gmail', 'email'],
  [/(^|\.)outlook\.(com|office\.com|office365\.com)$/, 'Outlook', 'email'],
  [/(^|\.)office\.com$/, 'Microsoft 365', 'saas_tools'],
  [/(^|\.)sharepoint\.com$/, 'SharePoint', 'saas_tools'],
  [/(^|\.)slack\.com$/, 'Slack', 'saas_tools'],
  [/(^|\.)atlassian\.net$/, 'Jira / Confluence', 'saas_tools'],
  [/(^|\.)notion\.so$/, 'Notion', 'saas_tools'],
  [/(^|\.)airtable\.com$/, 'Airtable', 'spreadsheets'],
  [/(^|\.)monday\.com$/, 'Monday', 'saas_tools'],
  [/(^|\.)zendesk\.com$/, 'Zendesk', 'saas_tools'],
  [/(^|\.)freshdesk\.com$/, 'Freshdesk', 'saas_tools'],
  [/(^|\.)shopify\.com$/, 'Shopify', 'saas_tools'],
  [/(^|\.)stripe\.com$/, 'Stripe', 'saas_tools'],
  [/(^|\.)sagecloud\.com$/, 'Sage', 'accounting'],
  [/(^|\.)workday\.com$/, 'Workday', 'saas_tools'],
  [/(^|\.)servicenow\.com$/, 'ServiceNow', 'saas_tools'],
  [/(^|\.)dropbox\.com$/, 'Dropbox', 'saas_tools'],
  [/(^|\.)box\.com$/, 'Box', 'saas_tools'],
  [/(^|\.)adobe\.com$/, 'Adobe', 'saas_tools'],
  [/(^|\.)docusign\.(com|net)$/, 'DocuSign', 'saas_tools']
];

/* Native (non-browser) applications an integration may report. Same rule:
 * a known name, or the generic bucket. */
const NATIVE_MAP = [
  [/^excel(\.exe)?$/i, 'Microsoft Excel', 'spreadsheets'],
  [/^winword(\.exe)?$/i, 'Microsoft Word', 'saas_tools'],
  [/^outlook(\.exe)?$/i, 'Outlook', 'email'],
  [/^numbers$/i, 'Numbers', 'spreadsheets'],
  [/^pages$/i, 'Pages', 'saas_tools'],
  [/^mail$/i, 'Mail', 'email'],
  [/^acrobat|^acrord32/i, 'Adobe Acrobat', 'saas_tools'],
  [/^sap(gui)?/i, 'SAP', 'erp'],
  [/^quickbooks/i, 'QuickBooks', 'accounting']
];

/* ── host handling ─────────────────────────────────────────────────────────
 * A URL is the single richest leak in a capture: the query string carries
 * search terms, the fragment carries state, and the path carries record ids.
 * We keep the host and a PATH SHAPE with every identifier-looking segment
 * replaced. `/orders/8837/edit` becomes `/orders/:id/edit`, which is exactly
 * as useful for spotting a repeated process and carries no record.
 */

const ID_LIKE = [
  /^\d+$/,                                    // 8837
  /^[0-9a-f]{8,}$/i,                          // hex ids, sha fragments
  /^[0-9a-f-]{32,}$/i,                        // uuids
  /^[A-Z0-9]{10,}$/,                          // Salesforce-style ids
  /^[\w.+-]+@[\w-]+\.[\w.]+$/,                // an email in a path
  /\d{4,}/,                                   // any segment carrying a long number
  // A long segment mixing letters and digits is a generated key — a Google
  // Docs id, a Notion page, a Stripe object. Route names are words and do not
  // carry digits, so this does not eat `/invoices` or `/spreadsheets`.
  /^(?=.{8,})(?=.*\d)(?=.*[a-z])[A-Za-z0-9_-]+$/i,
  // A very long opaque segment with no separators is an id even without a
  // digit (Gmail thread refs, base64url tokens).
  /^[A-Za-z0-9_-]{16,}$/
];

function hostOf(raw) {
  if (!raw) return null;
  let h = String(raw).trim().toLowerCase();
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(h)) h = new URL(h).hostname;
    else if (h.includes('/')) h = h.split('/')[0];
  } catch (e) { h = h.split('/')[0]; }
  h = h.replace(/^www\./, '').split(':')[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : null;
}

function pathShape(raw, report) {
  if (!raw) return null;
  let p = String(raw);
  // Counted BEFORE any URL parse. `new URL().pathname` silently discards the
  // query, so checking after it would report zero drops on every URL that
  // carried one — the boundary would be working and claiming it had not run.
  if (p.includes('?') || p.includes('#')) report.query_strings_dropped++;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(p)) p = new URL(p).pathname;
  } catch (e) { /* treat as a path */ }
  // Anything after ? or # is dropped outright, never shaped. Query strings are
  // where search terms and tokens live.
  p = p.split(/[?#]/)[0];
  if (!p.startsWith('/')) p = '/' + p;
  const parts = p.split('/').filter(Boolean).slice(0, 6).map(seg => {
    const s = decodeURIComponent(seg);
    if (ID_LIKE.some(re => re.test(s))) { report.identifiers_masked++; return ':id'; }
    // A long segment is prose (a title, a name) rather than a route.
    if (s.length > 40) { report.identifiers_masked++; return ':seg'; }
    return s.toLowerCase().replace(/[^a-z0-9:_-]/g, '');
  });
  return '/' + parts.join('/');
}

function appFor(host, nativeApp, report) {
  if (nativeApp) {
    const hit = NATIVE_MAP.find(([re]) => re.test(String(nativeApp).trim()));
    if (hit) return { app: hit[1], system: hit[2] };
    // An unrecognised native app name could be anything — including a document
    // title in some window-title feeds. It becomes a generic bucket, and the
    // fact that we could not name it is reported rather than guessed.
    report.unnamed_apps++;
    return { app: 'Desktop application', system: 'saas_tools' };
  }
  if (!host) return { app: 'Unknown', system: 'saas_tools' };
  const hit = APP_MAP.find(([re]) => re.test(host));
  if (hit) return { app: hit[1], system: hit[2] };
  return { app: host, system: 'saas_tools' };
}

function newReport() {
  return {
    fields_dropped: 0,        // every key we refused to carry
    text_values_dropped: 0,   // anything that looked like typed content
    query_strings_dropped: 0,
    identifiers_masked: 0,
    unnamed_apps: 0,
    steps_in: 0,
    steps_kept: 0
  };
}

/* Keys we will read off an incoming step. EVERYTHING else is dropped and
 * counted — an allow-list, so a client that adds a new field next quarter
 * cannot widen what we store by doing so. */
const ALLOWED_STEP_KEYS = new Set([
  'seq', 'action', 'role', 'target_role', 'url', 'host', 'path',
  'app', 'native_app', 'dwell_ms', 'duration_ms', 'ms', 't', 'timestamp'
]);

function redactStep(raw, report, seq) {
  report.steps_in++;
  if (!raw || typeof raw !== 'object') return null;

  Object.keys(raw).forEach(k => {
    if (!ALLOWED_STEP_KEYS.has(k)) {
      report.fields_dropped++;
      // A dropped key whose value is a non-trivial string was almost certainly
      // content — a label, a typed value, a selector carrying text.
      if (typeof raw[k] === 'string' && raw[k].trim().length > 1) report.text_values_dropped++;
    }
  });

  const action = ACTIONS.has(String(raw.action || '').toLowerCase())
    ? String(raw.action).toLowerCase() : 'other';

  const roleRaw = String(raw.target_role || raw.role || '').toLowerCase();
  const target_role = ROLES.has(roleRaw) ? roleRaw : (roleRaw ? 'other' : null);
  if (roleRaw && !ROLES.has(roleRaw)) report.text_values_dropped++;

  const host = hostOf(raw.host || raw.url);
  const shape = pathShape(raw.path || raw.url, report);
  const { app } = appFor(host, raw.native_app || (!host ? raw.app : null), report);

  const dwell = Math.max(0, Math.min(
    Number(raw.dwell_ms || raw.duration_ms || raw.ms || 0) || 0,
    1000 * 60 * 60 * 4   // a single step longer than four hours is a stuck timer
  ));

  report.steps_kept++;
  return {
    seq: Number.isFinite(Number(raw.seq)) ? Number(raw.seq) : seq,
    app, host: host || null, path_shape: shape,
    action, target_role, dwell_ms: Math.round(dwell)
  };
}

/**
 * Redact a whole capture. Returns the storable capture plus the report.
 *
 * `actor` is hashed with the tenant's own salt before it is stored, so the
 * module can count distinct people without ever holding who they are — and
 * two tenants hashing the same employee email produce different pseudonyms.
 */
function redactCapture(raw = {}, opts = {}) {
  const report = newReport();
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .slice(0, 2000)
    .map((s, i) => redactStep(s, report, i))
    .filter(Boolean);

  // The label is the one free-text field a person deliberately writes, and it
  // is what makes the dashboard readable ("month-end invoice run"). It is
  // capped, stripped of anything identifier-shaped, and it is the ONLY text
  // that survives ingestion.
  let label = String(raw.label || '').trim().slice(0, 80);
  if (/\d{5,}/.test(label) || /[\w.+-]+@[\w-]+\.[\w.]+/.test(label)) {
    label = label.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '').replace(/\d{5,}/g, '').trim();
    report.identifiers_masked++;
  }

  const totalMs = steps.reduce((a, s) => a + s.dwell_ms, 0);
  const byApp = {};
  steps.forEach(s => {
    const k = s.app || 'Unknown';
    byApp[k] = byApp[k] || { app: k, steps: 0, ms: 0 };
    byApp[k].steps++; byApp[k].ms += s.dwell_ms;
  });

  return {
    label: label || null,
    actor_ref: pseudonym(raw.actor || raw.actor_ref, opts.tenant_id),
    started_at: safeDate(raw.started_at),
    ended_at: safeDate(raw.ended_at),
    duration_ms: Math.round(Number(raw.duration_ms) > 0 ? Number(raw.duration_ms) : totalMs),
    step_count: steps.length,
    app_summary: Object.values(byApp).sort((a, b) => b.ms - a.ms),
    fingerprint: fingerprint(steps),
    external_ref: raw.external_ref ? String(raw.external_ref).slice(0, 120) : null,
    steps,
    redaction_report: report
  };
}

/**
 * THE SHAPE HASH. Two runs of the same work produce the same fingerprint even
 * though they touched different records — which is precisely what lets the
 * deriver say "this happened 34 times" without ever comparing the records
 * themselves. Built from the ordered app + action + path-shape sequence,
 * collapsed so that repeating a click five times does not fork the hash.
 */
function fingerprint(steps) {
  const seq = steps
    .map(s => `${s.app}|${s.action}|${s.path_shape || ''}`)
    .filter((v, i, arr) => v !== arr[i - 1])
    .join('>');
  return crypto.createHash('sha256').update(seq).digest('hex').slice(0, 24);
}

function pseudonym(actor, tenantId) {
  if (!actor) return null;
  const salt = String(process.env.DISCOVERY_ACTOR_SALT || process.env.SESSION_SALT || 'orbup-discovery');
  return 'p_' + crypto.createHash('sha256')
    .update(`${salt}:${tenantId || 0}:${String(actor).trim().toLowerCase()}`)
    .digest('hex').slice(0, 16);
}

function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Which of the interview's `systems` options the observed apps imply. */
function systemsFrom(apps = []) {
  const out = new Set();
  apps.forEach(a => {
    const name = typeof a === 'string' ? a : a.app;
    const hit = APP_MAP.find(([, label]) => label === name) || NATIVE_MAP.find(([, label]) => label === name);
    if (hit) out.add(hit[2]);
    else out.add('saas_tools');
  });
  return Array.from(out);
}

module.exports = {
  redactCapture, redactStep, fingerprint, pseudonym,
  hostOf, pathShape, systemsFrom, appFor,
  ACTIONS, ROLES, APP_MAP, ALLOWED_STEP_KEYS
};
