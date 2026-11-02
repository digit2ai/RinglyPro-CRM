'use strict';
/**
 * Virtual try-on: a pluggable provider, a cache, and a background job runner.
 *
 * PROVIDER: FASHN (api.fashn.ai, model tryon-v1.6), selected by FASHN_API_KEY.
 * It dresses a photo of a person in a photo of a garment, one garment per call,
 * so an outfit is two calls: the shirt onto Manuel's reference photo, then the
 * trousers onto that result. It does not change shoes, so the sneakers come
 * from the reference photo itself, which is why the Settings screen asks for a
 * full-body photo taken WEARING the white Vejas. Full-body framing likewise
 * comes from the reference photo: the provider keeps the photo's framing.
 *
 * WHAT IS GUARANTEED AND WHAT IS NOT: a render is an AI image. Garment patterns
 * and logos can drift; every render is labelled "AI render, not an exact copy".
 *
 * NOTHING IS SENT WITHOUT CONSENT: enqueue() refuses unless the owner has
 * recorded consent for THIS provider in sty_settings.
 *
 * CACHE: a render is keyed on the exact photos used (sha of model, shirt,
 * trousers) plus the provider. Same key = reuse, no second paid call.
 */
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('./db');

const API = () => process.env.FASHN_API_BASE || 'https://api.fashn.ai/v1';
const PROVIDER_VERSION = 'fashn:tryon-v1.6';
let transport = null; // injected by the SIT; default is global fetch

function provider() {
  if (process.env.FASHN_API_KEY) return { id: 'fashn', name: 'FASHN virtual try-on', configured: true };
  return { id: 'none', name: 'No try-on provider configured', configured: false };
}

async function call(method, path, body) {
  const f = transport || fetch;
  const r = await f(API() + path, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.FASHN_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  if (!r.ok) { const e = new Error('provider_http_' + r.status + (j && j.error ? ': ' + (j.error.message || j.error) : '')); e.status = r.status; throw e; }
  return j || {};
}

const dataUrl = (buf) => 'data:image/jpeg;base64,' + buf.toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One garment onto one person. Returns a Buffer. */
async function tryOn(modelImage, garmentBuf, category, ids) {
  const run = await call('POST', '/run', {
    model_name: 'tryon-v1.6',
    inputs: { model_image: modelImage, garment_image: dataUrl(garmentBuf), category, mode: process.env.FASHN_MODE || 'quality', output_format: 'jpeg', return_base64: true }
  });
  if (!run.id) throw new Error('provider_no_id' + (run.error ? ': ' + JSON.stringify(run.error) : ''));
  ids.push(run.id);
  const deadline = Date.now() + Number(process.env.FASHN_TIMEOUT_MS || 180000);
  while (Date.now() < deadline) {
    await sleep(transport ? 5 : 3000);
    const st = await call('GET', '/status/' + encodeURIComponent(run.id));
    if (st.status === 'completed') {
      const out = Array.isArray(st.output) ? st.output[0] : st.output;
      if (!out) throw new Error('provider_empty_output');
      if (/^data:image\//.test(out)) return Buffer.from(out.split(',')[1], 'base64');
      // A URL is only followed to the provider's own host, with a timeout and a size cap.
      let u; try { u = new URL(out); } catch (_) { throw new Error('provider_bad_output'); }
      if (u.protocol !== 'https:' || !/(^|\.)fashn\.ai$/i.test(u.hostname)) throw new Error('provider_output_host_refused');
      const f = transport || fetch;
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
      try {
        const img = await f(out, { signal: ctl.signal, redirect: 'error' });
        const buf = Buffer.from(await img.arrayBuffer());
        if (buf.length > 20 * 1024 * 1024) throw new Error('provider_output_too_large');
        return buf;
      } finally { clearTimeout(t); }
    }
    if (st.status === 'failed' || st.status === 'canceled') throw new Error('provider_failed' + (st.error ? ': ' + (st.error.message || JSON.stringify(st.error)) : ''));
  }
  throw new Error('provider_timeout');
}

async function primaryPhoto(tenantId, itemId) {
  return db.one(`SELECT id, sha, data FROM sty_photos WHERE tenant_id=:t AND item_id=:i AND kind='garment'
    ORDER BY is_primary DESC, id DESC LIMIT 1`, { t: tenantId, i: itemId });
}
async function modelPhoto(tenantId) {
  return db.one(`SELECT id, sha, data, full_body FROM sty_photos WHERE tenant_id=:t AND kind='model' ORDER BY is_primary DESC, id DESC LIMIT 1`, { t: tenantId });
}

function cacheKey(model, shirt, pants) {
  return crypto.createHash('sha256').update([PROVIDER_VERSION, model.sha, shirt.sha, pants.sha].join('|')).digest('hex');
}

/**
 * Queue renders for outfits. Returns per-outfit results; never throws for one
 * outfit's missing photo, it names it.
 */
async function enqueue(tenantId, outfitIds) {
  const p = provider();
  if (!p.configured) return { ok: false, error: 'no_provider', message: 'No try-on provider is configured (FASHN_API_KEY is not set). The illustration is shown instead.' };
  const set = await db.one('SELECT consent_at, consent_provider FROM sty_settings WHERE tenant_id=:t', { t: tenantId });
  if (!set || !set.consent_at || set.consent_provider !== p.id) return { ok: false, error: 'consent_required', message: 'Give consent in Settings before your photos are sent to ' + p.name + '.' };
  const model = await modelPhoto(tenantId);
  if (!model) return { ok: false, error: 'no_model_photo', message: 'Upload your full-body reference photo in Settings first.' };

  const results = [];
  for (const oid of outfitIds.slice(0, 100)) {
    const o = await db.one(`SELECT o.id, o.shirt_id, o.pants_id, s.name AS shirt_name, p.name AS pants_name FROM sty_outfits o
      JOIN sty_items s ON s.id=o.shirt_id JOIN sty_items p ON p.id=o.pants_id WHERE o.id=:o AND o.tenant_id=:t`, { o: oid, t: tenantId });
    if (!o) { results.push({ outfit_id: oid, status: 'not_found' }); continue; }
    const sp = await primaryPhoto(tenantId, o.shirt_id);
    const pp = await primaryPhoto(tenantId, o.pants_id);
    const missing = [!sp && o.shirt_name, !pp && o.pants_name].filter(Boolean);
    if (missing.length) { results.push({ outfit_id: oid, status: 'needs_photo', missing }); continue; }
    const key = cacheKey(model, sp, pp);
    const existing = await db.one(`SELECT id, status FROM sty_renders WHERE tenant_id=:t AND outfit_id=:o AND cache_key=:k AND status IN ('queued','running','done') ORDER BY id DESC LIMIT 1`, { t: tenantId, o: oid, k: key });
    if (existing) { results.push({ outfit_id: oid, status: existing.status === 'done' ? 'cached' : existing.status, render_id: existing.id }); continue; }
    const [rows] = await db.exec(`INSERT INTO sty_renders (tenant_id,outfit_id,cache_key,provider,status) VALUES (:t,:o,:k,:p,'queued') RETURNING id`, { t: tenantId, o: oid, k: key, p: p.id });
    results.push({ outfit_id: oid, status: 'queued', render_id: rows[0].id });
  }
  kick();
  return { ok: true, provider: p.id, results };
}

/** Claim and run ONE queued render. Multi-instance safe. */
async function runOne() {
  if (!provider().configured) return false;
  const [claimed] = await db.exec(`UPDATE sty_renders SET status='running', attempts=attempts+1, updated_at=NOW(), step='shirt'
    WHERE id = (SELECT id FROM sty_renders WHERE status='queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
  const r = claimed[0];
  if (!r) return false;
  const ids = [];
  try {
    const o = await db.one('SELECT shirt_id, pants_id FROM sty_outfits WHERE id=:o AND tenant_id=:t', { o: r.outfit_id, t: r.tenant_id });
    const model = await modelPhoto(r.tenant_id);
    const sp = o && await primaryPhoto(r.tenant_id, o.shirt_id);
    const pp = o && await primaryPhoto(r.tenant_id, o.pants_id);
    if (!o || !model || !sp || !pp) throw new Error('photos_changed_or_removed');
    // Consent is re-checked at run time: it may have been withdrawn after queueing.
    const set = await db.one('SELECT consent_at, consent_provider FROM sty_settings WHERE tenant_id=:t', { t: r.tenant_id });
    if (!set || !set.consent_at || set.consent_provider !== provider().id) throw new Error('consent_withdrawn');
    const consentStill = async () => {
      const c = await db.one('SELECT consent_at, consent_provider FROM sty_settings WHERE tenant_id=:t', { t: r.tenant_id });
      if (!c || !c.consent_at || c.consent_provider !== provider().id) throw new Error('consent_withdrawn');
    };
    const step1 = await tryOn(dataUrl(model.data), sp.data, 'tops', ids);
    await consentStill(); // withdrawn mid-render: the second photo is not sent
    await db.exec(`UPDATE sty_renders SET step='trousers', provider_ids=CAST(:ids AS jsonb), updated_at=NOW() WHERE id=:id`, { id: r.id, ids: JSON.stringify(ids) });
    const step2 = await tryOn(dataUrl(step1), pp.data, 'bottoms', ids);
    // Re-encode whatever came back: it is stored and decoded again later.
    const clean = await sharp(step2, { limitInputPixels: 40e6 }).rotate().resize({ width: 2000, height: 3000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    await db.exec(`UPDATE sty_renders SET status='done', step=NULL, image=:img, mime='image/jpeg', provider_ids=CAST(:ids AS jsonb), error=NULL, finished_at=NOW(), updated_at=NOW()
      WHERE id=:id AND status='running'`, { id: r.id, img: clean, ids: JSON.stringify(ids) });
  } catch (e) {
    await db.exec(`UPDATE sty_renders SET status='failed', error=:e, provider_ids=CAST(:ids AS jsonb), finished_at=NOW(), updated_at=NOW() WHERE id=:id`,
      { id: r.id, e: String(e.message || e).slice(0, 500), ids: JSON.stringify(ids) });
  }
  return true;
}

let running = false, timer = null;
async function drain() {
  if (running) return; running = true;
  try { while (await runOne()) { /* keep going */ } } catch (e) { console.error('[stylestudio] runner:', e.message); }
  finally { running = false; }
}
function kick() { setImmediate(() => drain()); }

/** A render stuck in `running` after a restart goes back to the queue (max 3 tries). */
async function recoverStuck() {
  await db.exec(`UPDATE sty_renders SET status='queued', updated_at=NOW() WHERE status='running' AND updated_at < NOW() - INTERVAL '15 minutes' AND attempts < 3`);
  await db.exec(`UPDATE sty_renders SET status='failed', error='interrupted three times', finished_at=NOW() WHERE status='running' AND updated_at < NOW() - INTERVAL '15 minutes'`);
}
function start() {
  if (timer) return;
  const on = String(process.env.STYLE_STUDIO_RUNNER || '').toLowerCase();
  if (on === 'off' || (on !== 'on' && process.env.NODE_ENV !== 'production')) return;
  timer = setInterval(() => { recoverStuck().then(drain).catch(() => {}); }, 20000);
  timer.unref && timer.unref();
}

module.exports = { provider, enqueue, runOne, start, kick, cacheKey, _setTransport: (f) => { transport = f; }, PROVIDER_VERSION };
