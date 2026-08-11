'use strict';

/**
 * JOBUP SOCIAL MEDIA IMAGE POSTER
 *
 * Publishes an approved JobUp marketing image with its caption to every
 * destination named in the request, and returns one record per destination.
 *
 * IT IS NOT AN LLM AGENT, AND THAT IS DELIBERATE. The spec's temperature is 0
 * and all eight constraints are absolutes about what must never be invented. A
 * model asked to "return the post id" can produce a plausible one when a call
 * fails; this cannot, because no step that produces an id is written by a
 * model. The procedure in `instructions` is executed as code, in order, and the
 * declared output shape is assembled from platform responses only.
 *
 * THE EIGHT CONSTRAINTS, AND WHERE EACH IS ENFORCED:
 *  1. Never fabricate a value  -> post_id/post_url/posted_at are copied from a
 *     connector result and are null on every path that did not reach the
 *     platform. shape() cannot construct them.
 *  2. Only the declared JSON   -> shape() builds the object key by key.
 *  3. Never post outside the supplied list -> destinations are loaded BY ID
 *     from the request; nothing else is ever read.
 *  4. Never alter the image    -> the image is passed to the platform as a URL.
 *     There is no image processing code in this vertical at all.
 *  5. Never invent claims      -> captions are truncated, never generated.
 *  6. No duplicate in a run    -> a (destination, image) key is held per run.
 *  7. Never expose secrets     -> tokens are decrypted at the call site, never
 *     stored on a result, and platform messages are token-scrubbed.
 *  8. Never post without a live credential -> checked before the call; missing
 *     or expired is a recorded failure, not an attempt.
 */

const crypto = require('crypto');
const { models, scoped } = require('../models');
const rules = require('./social-rules');
const connectors = require('./social-connectors');
const cryptoSvc = require('./crypto');

const PLATFORM_TENANT = parseInt(process.env.JOBUP_PLATFORM_TENANT_ID || '0', 10);
const MAX_ATTEMPTS = 2;   // the original plus one retry, transient only

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Constraint 2: the declared shape, assembled key by key. Nothing else leaks. */
function shapePost(p) {
  return {
    destination_name: p.destination_name,
    platform: p.platform,
    account_or_page_id: p.account_or_page_id,
    caption_posted: p.caption_posted,
    status: p.status,
    post_id: p.post_id == null ? null : String(p.post_id),
    post_url: p.post_url == null ? null : String(p.post_url),
    posted_at: p.posted_at == null ? null : String(p.posted_at),
    failure_reason: p.failure_reason == null ? null : String(p.failure_reason),
  };
}

function shape(campaignId, imageRef, runTs, posts) {
  const out = posts.map(shapePost);
  return {
    campaign_id: String(campaignId),
    image_reference: String(imageRef),
    run_timestamp: runTs,
    posts: out,
    summary: {
      total_destinations: out.length,
      posted: out.filter((p) => p.status === 'posted').length,
      failed: out.filter((p) => p.status === 'failed').length,
      skipped: out.filter((p) => p.status === 'skipped').length,
    },
  };
}

/** Step 2: does this image satisfy this destination's rules? */
function validateImage(image, platform) {
  const r = rules.forPlatform(platform);
  if (!image || !image.url) return 'no image supplied';
  if (!/^https:\/\//i.test(image.url)) {
    // Meta fetches the image itself; it must be publicly reachable over https.
    return 'image must be a public https URL the platform can fetch';
  }
  const ext = (String(image.url).split('?')[0].split('.').pop() || '').toLowerCase();
  if (ext && !r.formats.includes(ext)) {
    return `format .${ext} not accepted by ${r.label} (accepts ${r.formats.join(', ')})`;
  }
  if (image.bytes && image.bytes > r.max_bytes) {
    return `image is ${Math.round(image.bytes / 1024)}KB, over the ${Math.round(r.max_bytes / 1024)}KB limit for ${r.label}`;
  }
  if (image.width && image.height) {
    const ar = image.width / image.height;
    if (ar < r.aspect_min || ar > r.aspect_max) {
      return `aspect ratio ${ar.toFixed(2)} outside ${r.aspect_min}–${r.aspect_max} for ${r.label}`;
    }
  }
  return null;
}

/** Step 4: is there a usable credential? Never returns the token itself. */
function credentialState(account) {
  if (!account.access_token_enc) return { ok: false, reason: 'no access token stored for this account' };
  if (account.token_expires_at && new Date(account.token_expires_at) <= new Date()) {
    return { ok: false, reason: `access token expired ${new Date(account.token_expires_at).toISOString().slice(0, 10)}` };
  }
  const token = cryptoSvc.decrypt(account.access_token_enc);
  if (!token) {
    return { ok: false, reason: 'stored token could not be decrypted (secret rotated?) — re-enter it' };
  }
  if (!account.account_or_page_id) return { ok: false, reason: 'no page or account id on file' };
  return { ok: true, token };
}

/**
 * Run the agent.
 *
 * @param {object} req
 *   destination_ids  REQUIRED. Constraint 3 — only these are ever touched.
 *   image            { url, bytes?, width?, height? }
 *   caption          verbatim text, or copy_id to pull from the copy library
 *   dry_run          validate and report without calling any platform
 */
async function run(req = {}) {
  const tenantId = Number.isInteger(req.tenant_id) ? req.tenant_id : PLATFORM_TENANT;
  const runTs = new Date().toISOString();
  const campaignId = String(req.campaign_id || `cmp_${crypto.randomUUID()}`);
  const dryRun = Boolean(req.dry_run);

  // ---- Step 1: collect image, caption, destinations -----------------------
  const image = req.image && typeof req.image === 'object' ? req.image : { url: req.image_url };
  const imageRef = String((image && image.url) || '');

  let caption = req.caption == null ? '' : String(req.caption);
  if (!caption && req.copy_id) {
    const copy = await scoped('social_copy', tenantId).findOne({ id: parseInt(req.copy_id, 10) });
    caption = copy ? String(copy.body || '') : '';
  }

  const ids = Array.isArray(req.destination_ids)
    ? req.destination_ids.map((n) => parseInt(n, 10)).filter(Number.isInteger) : [];

  // Constraint 3, enforced by construction: the ONLY read of social_accounts in
  // this function filters on the ids the caller supplied. There is no "all
  // enabled accounts" path that a bug could fall through to.
  const accounts = [];
  for (const id of ids) {
    const a = await scoped('social_accounts', tenantId).findOne({ id });
    if (a) accounts.push(a);
  }

  const posts = [];
  const seen = new Set();   // constraint 6

  for (const account of accounts) {
    const platform = String(account.platform || 'other');
    const r = rules.forPlatform(platform);
    const base = {
      destination_name: account.name,
      platform: rules.schemaPlatform(platform),
      account_or_page_id: String(account.account_or_page_id || ''),
      caption_posted: '',
      status: 'failed',
      post_id: null, post_url: null, posted_at: null, failure_reason: null,
      _account_id: account.id, _attempts: 0,
    };

    // ---- Constraint 6: never the same image to the same destination twice --
    const key = `${account.id}|${imageRef}`;
    if (seen.has(key)) {
      posts.push({ ...base, status: 'skipped',
        failure_reason: 'duplicate destination in this run — posted once already' });
      continue;
    }
    seen.add(key);

    if (account.enabled === false) {
      posts.push({ ...base, status: 'skipped', failure_reason: 'destination is disabled' });
      continue;
    }

    // ---- Step 2: image validation ----------------------------------------
    const imgProblem = validateImage(image, platform);
    if (imgProblem) {
      posts.push({ ...base, status: 'failed', failure_reason: imgProblem });
      continue;
    }

    // ---- Step 3: caption adaptation (truncate only, never rewrite) --------
    const adapted = rules.adaptCaption(caption, platform);
    base.caption_posted = adapted.text;
    if (!adapted.text.trim()) {
      posts.push({ ...base, status: 'failed', failure_reason: 'no caption supplied' });
      continue;
    }
    if (r.hashtag_max && rules.countHashtags(adapted.text) > r.hashtag_max) {
      posts.push({ ...base, status: 'failed',
        failure_reason: `caption has more than ${r.hashtag_max} hashtags, which ${r.label} rejects` });
      continue;
    }

    // ---- The platform has no API for this destination ---------------------
    // Reported as skipped with the reason, never as a silent success.
    if (!r.supported) {
      posts.push({ ...base, status: 'skipped', failure_reason: r.unsupported_reason });
      continue;
    }

    // ---- Step 4 / constraint 8: credential -------------------------------
    const cred = credentialState(account);
    if (!cred.ok) {
      posts.push({ ...base, status: 'failed', failure_reason: cred.reason });
      continue;
    }

    if (dryRun) {
      posts.push({ ...base, status: 'skipped',
        failure_reason: 'dry run — validated but nothing was sent to the platform' });
      continue;
    }

    // ---- Steps 5-7: post, one at a time, one retry on transient errors ----
    let result = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      base._attempts = attempt;
      result = platform === 'instagram'
        ? await connectors.postInstagram({ igUserId: account.account_or_page_id, imageUrl: image.url, caption: adapted.text, token: cred.token })
        : await connectors.postFacebookPage({ pageId: account.account_or_page_id, imageUrl: image.url, caption: adapted.text, token: cred.token });
      if (result.ok) break;
      // Constraint: retry ONLY transient. A permission or policy refusal is a
      // decision, not a hiccup, and repeating the call cannot change it.
      if (!result.transient || attempt === MAX_ATTEMPTS) break;
      await sleep(r.rate_delay_ms || 1000);
    }

    if (result && result.ok) {
      // Constraint 1: every one of these came back from the platform.
      posts.push({ ...base, status: 'posted',
        post_id: result.post_id, post_url: result.post_url, posted_at: result.posted_at,
        failure_reason: null });
    } else {
      posts.push({ ...base, status: 'failed',
        failure_reason: (result && result.error) || 'post failed' });
    }

    // Step 5: pause between destinations to respect rate limits.
    if (r.rate_delay_ms) await sleep(r.rate_delay_ms);
  }

  // ---- Persist the run --------------------------------------------------
  const out = shape(campaignId, imageRef, runTs, posts);
  try {
    await scoped('social_campaigns', tenantId).create({
      campaign_id: campaignId, image_reference: imageRef, caption,
      dry_run: dryRun, run_timestamp: new Date(runTs), result: out,
    });
    for (const p of posts) {
      await scoped('social_posts', tenantId).create({
        campaign_id: campaignId, account_id: p._account_id,
        destination_name: p.destination_name, platform: p.platform,
        account_or_page_id: p.account_or_page_id, caption_posted: p.caption_posted,
        status: p.status, post_id: p.post_id, post_url: p.post_url,
        posted_at: p.posted_at ? new Date(p.posted_at) : null,
        failure_reason: p.failure_reason, attempts: p._attempts,
      });
    }
  } catch (e) {
    // A logging failure must not turn a successful post into a reported failure.
    console.warn('[social-poster] run persistence failed:', e.message);
  }

  return out;
}

module.exports = { run, shape, validateImage, credentialState, PLATFORM_TENANT, MAX_ATTEMPTS };
