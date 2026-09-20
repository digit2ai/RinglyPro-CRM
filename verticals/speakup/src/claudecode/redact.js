'use strict';

/**
 * Claude Code — secret redaction for anything persisted or streamed.
 *
 * A run event is written to the database AND pushed down an SSE stream to a browser.
 * The workspace holds a clone URL carrying the GitHub token, the agent may echo an
 * environment variable, and a tool result can contain whatever the repository holds.
 * So redaction happens HERE, on the way in, not at the point of display: a value
 * scrubbed only in the UI is still a value sitting in cc_run_events for ever.
 *
 * It works two ways, because neither alone is enough:
 *   - by VALUE: the exact secrets this process holds are replaced wherever they appear
 *     (this is what catches the clone URL and an accidental `env` dump);
 *   - by SHAPE: the published prefixes of Anthropic and GitHub credentials, so a key
 *     belonging to someone else — pasted into a repo, printed by a test — is caught too.
 */

const MASK = '[redacted]';

// Shapes are matched before values, so a token this process does not hold is still hidden.
const SHAPES = [
  /sk-ant-[A-Za-z0-9_\-]{16,}/g,                    // Anthropic API key
  /gh[pousr]_[A-Za-z0-9]{20,}/g,                    // GitHub PAT / OAuth / server / refresh
  /github_pat_[A-Za-z0-9_]{20,}/g,                  // GitHub fine-grained PAT
  /x-access-token:[^@\s/]+@/g,                      // the token inside a clone URL
  /\bAKIA[0-9A-Z]{16}\b/g,                          // AWS access key id
  /\bsk_live_[A-Za-z0-9]{10,}/g                     // Stripe live secret
];

// Values held by THIS process, found by KEY PATTERN rather than by an enumerated list. The list
// was a deny-list on a surface that has to be an allow-list: TWILIO_AUTH_TOKEN,
// AWS_SECRET_ACCESS_KEY, EMAIL_CRED_SECRET, GOOGLE_CLIENT_SECRET and every INCENTIVA_*/PLANEA_*
// credential matched none of the fifteen names and none of the six shapes, so `env` printed by a
// Bash turn landed verbatim in cc_run_events and went down the SSE stream. Short values are
// ignored: replacing a six-character "secret" everywhere would scrub ordinary words out of a log.
const SECRET_KEY = /(TOKEN|SECRET|KEY|PASSWORD|PASSPHRASE|CREDENTIAL|AUTH|PRIVATE|SALT|DSN|COOKIE)/i;
// A key whose name matches but whose value is public, so masking it only makes a log unreadable.
const NOT_SECRET_KEY = /^(.*_PUBLIC|.*_PUBLIC_KEY|.*_KEY_ID|NODE_.*|npm_.*|.*_URL_PUBLIC)$/i;
const CONNECTION_STRING = /^[a-z][a-z0-9+.-]*:\/\/[^/\s]*:[^@/\s]+@/i;   // any scheme://user:pass@host

let cachedFrom = null, cachedValues = [];
function secretValues() {
  // process.env is stable within a process; recomputing it per event would walk it thousands of
  // times during one run. The cache is keyed on the variable count so a late set is picked up.
  const stamp = Object.keys(process.env).length;
  if (cachedFrom === stamp) return cachedValues;
  const out = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || String(v).length < 12) continue;
    if (NOT_SECRET_KEY.test(k)) continue;
    if (SECRET_KEY.test(k) || CONNECTION_STRING.test(String(v))) out.push(String(v));
  }
  // Longest first: a secret that contains another must be masked as a whole.
  out.sort((a, b) => b.length - a.length);
  cachedFrom = stamp; cachedValues = out;
  return out;
}

function redactText(s) {
  let t = String(s == null ? '' : s);
  if (!t) return t;
  for (const v of secretValues()) {
    if (t.includes(v)) t = t.split(v).join(MASK);
  }
  for (const re of SHAPES) t = t.replace(re, MASK);
  return t;
}

// Walks a payload before it is stored. Keys are left alone; only values are scrubbed,
// and the walk is depth- and size-bounded so a huge tool result cannot stall the worker.
function redact(value, depth) {
  const d = depth || 0;
  if (d > 8) return null;
  if (value == null) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map(v => redact(v, d + 1));
  if (typeof value === 'object') {
    const out = {};
    let n = 0;
    for (const k of Object.keys(value)) {
      if (++n > 100) break;
      out[k] = redact(value[k], d + 1);
    }
    return out;
  }
  return null;
}

// Long text is clipped for storage: the console shows a head, and the whole thing would
// otherwise make cc_run_events the largest table in the database.
function clip(s, max) {
  const t = redactText(s);
  const m = max || 4000;
  return t.length > m ? t.slice(0, m) + '\n… (' + (t.length - m) + ' more characters)' : t;
}

module.exports = { redact, redactText, clip, MASK };
