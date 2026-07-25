'use strict';

/**
 * Digit2AI Growth — channel settings service.
 *
 * Owner-level config for the 5 channels. Secrets (X/LinkedIn tokens) are stored
 * AES-encrypted and NEVER returned raw — the API returns a { set, hint } mask so
 * the UI can show "connected" without exposing the token. Saving with an empty
 * secret field keeps the existing value (so re-saving prefs doesn't wipe tokens).
 */

const { Setting } = require('../models');
const { encrypt, mask } = require('./crypto');

// Which subfields are secrets, per channel.
const SECRET_FIELDS = {
  x: ['api_key', 'api_secret', 'access_token', 'access_secret'],
  linkedin: ['access_token']
};

const DEFAULTS = {
  seo: { site_url: '', gsc_property: '', ga4_property_id: '', target_keyword_count: 6 },
  content: { default_words: 300, tone: 'professional', cta: '', blog_url: '' },
  x: { handle: '', posts_per_run: 3, autopost: false },
  linkedin: { profile_url: '', org_id: '', autopost: false },
  geo: { engines: ['ChatGPT', 'Perplexity', 'Gemini', 'Claude', 'Google AI Overviews'], brand_facts: '' }
};

async function getRaw(ownerId) {
  const [row] = await Setting.findOrCreate({ where: { owner_id: ownerId }, defaults: { owner_id: ownerId, ...DEFAULTS } });
  return row;
}

// For the agents: full config WITH decrypted secrets available if needed later.
async function getConfig(ownerId) {
  const row = await getRaw(ownerId);
  return {
    seo: { ...DEFAULTS.seo, ...(row.seo || {}) },
    content: { ...DEFAULTS.content, ...(row.content || {}) },
    x: { ...DEFAULTS.x, ...(row.x || {}) },
    linkedin: { ...DEFAULTS.linkedin, ...(row.linkedin || {}) },
    geo: { ...DEFAULTS.geo, ...(row.geo || {}) }
  };
}

// For the UI: secrets replaced with { set, hint } masks.
async function getMasked(ownerId) {
  const cfg = await getConfig(ownerId);
  for (const [chan, fields] of Object.entries(SECRET_FIELDS)) {
    for (const f of fields) cfg[chan][f] = mask(cfg[chan][f]);
  }
  return cfg;
}

// Merge a patch. Non-secret fields overwrite; secret fields encrypt only when a
// non-empty new value is supplied, else keep the stored ciphertext.
async function save(ownerId, patch) {
  const row = await getRaw(ownerId);
  const next = {};
  for (const chan of ['seo', 'content', 'x', 'linkedin', 'geo']) {
    if (!(chan in patch)) continue;
    const cur = { ...(row[chan] || {}) };
    const incoming = patch[chan] || {};
    const secrets = SECRET_FIELDS[chan] || [];
    for (const [k, v] of Object.entries(incoming)) {
      if (secrets.includes(k)) {
        if (v && String(v).trim() !== '') cur[k] = encrypt(v); // replace only if provided
      } else {
        cur[k] = v;
      }
    }
    next[chan] = cur;
  }
  await row.update(next);
  return getMasked(ownerId);
}

module.exports = { getConfig, getMasked, save, DEFAULTS };
