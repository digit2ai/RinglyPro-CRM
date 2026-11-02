'use strict';
/**
 * MANUEL'S STYLE STUDIO — private AI wardrobe. Mounted at /style-studio.
 *
 * WHO SIGNS IN: only the owner (STYLE_STUDIO_OWNER_EMAILS, default
 * mstagg@digit2ai.com), with the SAME password as the RinglyPro CRM `users`
 * table. There is no second password, no default and no signup. tenant_id is
 * that CRM user's id, read from the database on every request; a password
 * change ends every session (the token carries a fingerprint of the hash).
 *
 * PRIVACY: every photo and render is served only to a signed-in owner, never
 * from a public path. Nothing is sent to an image provider without recorded
 * consent for that provider, and everything can be deleted.
 */
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('./db');
const catalog = require('./catalog');
const stylist = require('./stylist');
const W = require('./wardrobe');
const images = require('./images');
const tryon = require('./tryon');
const llm = require('./llm');
const weather = require('./weather');
const exporter = require('./exporter');

const router = express.Router();
const BASE = '/style-studio';
const COOKIE = 'sty_token';
const AUD = 'stylestudio';
const SECRET = () => process.env.STYLE_STUDIO_JWT_SECRET || process.env.JWT_SECRET || '';
const OWNERS = () => String(process.env.STYLE_STUDIO_OWNER_EMAILS || 'mstagg@digit2ai.com').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
const PUBLIC = path.join(__dirname, '..', 'public');
const PATTERNS = ['solid', 'oxford', 'stripe', 'gingham', 'plaid'];
const CATEGORIES = ['shirt', 'pants', 'shoes'];

let ready = db.migrate().catch((e) => { console.error('[stylestudio] migrate failed:', e.message); throw e; });
ready.catch(() => {});
ready.then(() => tryon.start()).catch(() => {});

/* ── helpers ─────────────────────────────────────────────────────────── */
const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);
const intId = (v) => (/^\d{1,9}$/.test(String(v || '')) ? Number(v) : null);
const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : null);
const dateOk = (v) => { const s = String(v || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s ? s : null; };
// The session fingerprint is an HMAC of the CRM hash, never a piece of it: a JWT
// payload is readable, and part of a bcrypt hash would allow offline guessing.
const fingerprint = (hash) => crypto.createHmac('sha256', SECRET()).update(String(hash)).digest('hex').slice(0, 24);
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.STYLE_STUDIO_TZ || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  console.error('[stylestudio]', req.method, req.path, e.message);
  if (!res.headersSent) res.status(e.status || 500).json({ error: e.status ? e.message : 'server_error' });
});
function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setCookie(res, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=${BASE}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

// The CRM user lookup is injectable so the SIT never touches the users table.
let lookupUser = async (where) => {
  if (where.email) return db.one('SELECT id, email, password_hash FROM users WHERE LOWER(email)=:e LIMIT 1', { e: where.email });
  return db.one('SELECT id, email, password_hash FROM users WHERE id=:id', { id: where.id });
};

const attempts = new Map();
const tooMany = (k) => { const n = Date.now(); const a = (attempts.get(k) || []).filter((t) => n - t < 15 * 60 * 1000); attempts.set(k, a); return a.length >= 10; };
const note = (k) => { const a = attempts.get(k) || []; a.push(Date.now()); attempts.set(k, a); };

const seeded = new Set();
const exporting = new Set(); // one heavy export per tenant at a time
async function ensureTenant(t) {
  if (seeded.has(t)) return;
  await catalog.seed(db, t);
  await W.ensureMatrix(t);
  seeded.add(t);
}

/* ── shell ───────────────────────────────────────────────────────────── */
router.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
router.get('/health', async (req, res) => {
  let ok = false; try { await ready; await db.sel('SELECT 1'); ok = true; } catch (_) {}
  res.json({ service: 'stylestudio', ok: ok && !!SECRET(), database: ok, signing_secret: !!SECRET(), tryon_provider: tryon.provider().id, ai_text: llm.aiEnabled() });
});
router.use(express.static(PUBLIC, { index: false }));
router.get(['/', '/login'], (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(PUBLIC, 'app.html')); });

/* ── api ─────────────────────────────────────────────────────────────── */
const api = express.Router();
router.use('/api/v1', api);
api.use(express.json({ limit: '200kb' }));
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.use(wrap(async (req, res, next) => {
  if (!SECRET()) return res.status(503).json({ error: 'not_configured' });
  try { await ready; } catch (_) { return res.status(503).json({ error: 'database_unavailable' }); }
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Studio') !== '1') return res.status(403).json({ error: 'missing_header' });
  // The global parser in src/app.js runs first, so the route-level cap above is not what holds.
  if (req.is('json') && Number(req.get('content-length') || 0) > 200 * 1024) return res.status(413).json({ error: 'too_large' });
  next();
}));

api.post('/auth/login', wrap(async (req, res) => {
  const email = str(req.body && req.body.email, 200).toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const key = (req.ip || '') + '|' + email;
  if (tooMany(key)) return res.status(429).json({ error: 'too_many_attempts' });
  if (!email || !password) return res.status(400).json({ error: 'missing_credentials' });
  const u = OWNERS().includes(email) ? await lookupUser({ email }) : null;
  const ok = u && u.password_hash ? await bcrypt.compare(password, u.password_hash) : (await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuuJcB6W6fK3k0n1i3m3e0YcJ9mL0pQkS.'), false);
  if (!ok) { note(key); return res.status(401).json({ error: 'invalid_credentials' }); }
  const token = jwt.sign({ uid: u.id, fp: fingerprint(u.password_hash) }, SECRET(), { audience: AUD, expiresIn: '30d' });
  setCookie(res, token, 30 * 24 * 3600);
  res.json({ ok: true });
}));
api.post('/auth/logout', (req, res) => { setCookie(res, '', 0); res.json({ ok: true }); });

// Everything below requires the owner.
api.use(wrap(async (req, res, next) => {
  const tok = readCookie(req);
  let p = null; try { p = tok ? jwt.verify(tok, SECRET(), { audience: AUD }) : null; } catch (_) {}
  if (!p) return res.status(401).json({ error: 'not_signed_in' });
  const u = await lookupUser({ id: p.uid });
  if (!u || !u.password_hash || fingerprint(u.password_hash) !== p.fp || !OWNERS().includes(String(u.email).toLowerCase())) return res.status(401).json({ error: 'not_signed_in' });
  req.tenant = u.id; req.owner = { id: u.id, email: u.email };
  await ensureTenant(req.tenant);
  next();
}));

api.get('/auth/me', (req, res) => res.json({ ok: true, email: req.owner.email }));

api.get('/meta', wrap(async (req, res) => {
  const set = await db.one('SELECT consent_at, consent_provider FROM sty_settings WHERE tenant_id=:t', { t: req.tenant });
  const model = await db.one(`SELECT id, full_body, width, height FROM sty_photos WHERE tenant_id=:t AND kind='model' ORDER BY is_primary DESC, id DESC LIMIT 1`, { t: req.tenant });
  const p = tryon.provider();
  res.json({
    occasions: stylist.OCCASIONS, patterns: PATTERNS, disclaimer: stylist.DISCLAIMER,
    provider: p, consent: !!(set && set.consent_at && set.consent_provider === p.id), consent_at: set && set.consent_at,
    model_photo: model, ai_text: llm.aiEnabled(), today: todayLocal(), labels: exporter.LABEL
  });
}));

/* items */
api.get('/items', wrap(async (req, res) => res.json({ items: await W.items(req.tenant, { includeArchived: req.query.archived === '1' }) })));

function itemFields(b, partial) {
  const f = {};
  if (!partial || b.name !== undefined) { f.name = str(b.name, 120); if (!f.name) { const e = new Error('name_required'); e.status = 400; throw e; } }
  for (const [k, n] of [['brand', 80], ['garment_type', 80], ['color_name', 80], ['notes', 2000]]) if (!partial || b[k] !== undefined) f[k] = str(b[k], n) || null;
  if (!partial || b.color_hex !== undefined) f.color_hex = hex(b.color_hex) || '#dddddd';
  if (!partial || b.color2_hex !== undefined) f.color2_hex = hex(b.color2_hex);
  if (!partial || b.pattern !== undefined) f.pattern = PATTERNS.includes(b.pattern) ? b.pattern : 'solid';
  for (const k of ['favorite', 'archived']) if (b[k] !== undefined) f[k] = b[k] === true;
  return f;
}

api.post('/items', wrap(async (req, res) => {
  const cat = req.body && req.body.category;
  if (!CATEGORIES.includes(cat)) return res.status(400).json({ error: 'bad_category' });
  const f = itemFields(req.body, false);
  const [rows] = await db.exec(`INSERT INTO sty_items (tenant_id,category,name,brand,garment_type,color_name,color_hex,color2_hex,pattern,notes,favorite,sort)
    VALUES (:t,:cat,:name,:brand,:garment_type,:color_name,:color_hex,:color2_hex,:pattern,:notes,:favorite,
      (SELECT COALESCE(MAX(sort),0)+1 FROM sty_items WHERE tenant_id=:t AND category=:cat)) RETURNING id`,
    { t: req.tenant, cat, ...f, favorite: !!f.favorite });
  await W.ensureMatrix(req.tenant);
  res.status(201).json({ id: rows[0].id });
}));

api.patch('/items/:id', wrap(async (req, res) => {
  const id = intId(req.params.id); if (!id) return res.status(404).json({ error: 'not_found' });
  const f = itemFields(req.body || {}, true);
  // Editing a starting slot makes it a real garment.
  if (f.name || f.color_hex) f.is_slot = false;
  const keys = Object.keys(f); if (!keys.length) return res.json({ ok: true });
  const [, meta] = await db.exec(`UPDATE sty_items SET ${keys.map((k) => `${k}=:${k}`).join(', ')}, updated_at=NOW() WHERE id=:id AND tenant_id=:t`, { ...f, id, t: req.tenant });
  if (!meta.rowCount) return res.status(404).json({ error: 'not_found' });
  await W.ensureMatrix(req.tenant);
  res.json({ ok: true });
}));

api.delete('/items/:id', wrap(async (req, res) => {
  const id = intId(req.params.id); if (!id) return res.status(404).json({ error: 'not_found' });
  if (req.query.hard === '1') {
    const [, meta] = await db.exec('DELETE FROM sty_items WHERE id=:id AND tenant_id=:t', { id, t: req.tenant });
    return meta.rowCount ? res.json({ ok: true, deleted: true }) : res.status(404).json({ error: 'not_found' });
  }
  const [, meta] = await db.exec('UPDATE sty_items SET archived=TRUE, updated_at=NOW() WHERE id=:id AND tenant_id=:t', { id, t: req.tenant });
  return meta.rowCount ? res.json({ ok: true, archived: true }) : res.status(404).json({ error: 'not_found' });
}));

/* photos */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: images.MAX_BYTES, files: 8 } });
const uploadMw = (field, max) => (req, res, next) => upload.array(field, max)(req, res, (err) => err ? res.status(413).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_failed' }) : next());

api.get('/items/:id/photos', wrap(async (req, res) => {
  const id = intId(req.params.id);
  res.json({ photos: await db.sel(`SELECT id, is_primary, width, height, created_at FROM sty_photos WHERE tenant_id=:t AND item_id=:i AND kind='garment' ORDER BY is_primary DESC, id DESC`, { t: req.tenant, i: id || 0 }) });
}));

api.post('/items/:id/photos', uploadMw('photos', 8), wrap(async (req, res) => {
  const id = intId(req.params.id);
  const item = id && await db.one('SELECT id FROM sty_items WHERE id=:id AND tenant_id=:t', { id, t: req.tenant });
  if (!item) return res.status(404).json({ error: 'not_found' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'no_files' });
  const out = [];
  for (const f of req.files) {
    try {
      const p = await images.processUpload(f.buffer, { trim: req.query.trim === '1' });
      const has = await db.one(`SELECT id FROM sty_photos WHERE tenant_id=:t AND item_id=:i AND kind='garment' AND is_primary LIMIT 1`, { t: req.tenant, i: id });
      const [rows] = await db.exec(`INSERT INTO sty_photos (tenant_id,item_id,kind,data,thumb,texture,mime,width,height,sha,is_primary)
        VALUES (:t,:i,'garment',:data,:thumb,:texture,:mime,:w,:h,:sha,:prim) RETURNING id`,
        { t: req.tenant, i: id, ...p, w: p.width, h: p.height, prim: !has });
      out.push({ name: f.originalname, id: rows[0].id, ok: true });
    } catch (e) { out.push({ name: f.originalname, ok: false, error: e.status ? e.message : 'could_not_read_image' }); }
  }
  await db.exec('UPDATE sty_items SET is_slot=FALSE WHERE id=:id AND tenant_id=:t AND EXISTS (SELECT 1 FROM sty_photos WHERE item_id=:id AND tenant_id=:t)', { id, t: req.tenant });
  res.status(out.some((o) => o.ok) ? 201 : 400).json({ results: out });
}));

api.patch('/photos/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const ph = id && await db.one('SELECT id, item_id, kind FROM sty_photos WHERE id=:id AND tenant_id=:t', { id, t: req.tenant });
  if (!ph) return res.status(404).json({ error: 'not_found' });
  if (req.body && req.body.is_primary === true) {
    await db.exec(`UPDATE sty_photos SET is_primary=(id=:id) WHERE tenant_id=:t AND kind=:k AND ${ph.item_id ? 'item_id=:i' : 'item_id IS NULL'}`, { id, t: req.tenant, k: ph.kind, i: ph.item_id });
  }
  res.json({ ok: true });
}));

api.delete('/photos/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const ph = id && await db.one('SELECT id, item_id, kind, is_primary FROM sty_photos WHERE id=:id AND tenant_id=:t', { id, t: req.tenant });
  if (!ph) return res.status(404).json({ error: 'not_found' });
  await db.exec('DELETE FROM sty_photos WHERE id=:id AND tenant_id=:t', { id, t: req.tenant });
  if (ph.is_primary) {
    await db.exec(`UPDATE sty_photos SET is_primary=TRUE WHERE id=(SELECT id FROM sty_photos WHERE tenant_id=:t AND kind=:k AND ${ph.item_id ? 'item_id=:i' : 'item_id IS NULL'} ORDER BY id DESC LIMIT 1)`, { t: req.tenant, k: ph.kind, i: ph.item_id });
  }
  res.json({ ok: true });
}));

api.get('/photos/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const col = req.query.size === 'thumb' ? 'thumb' : 'data';
  const ph = id && await db.one(`SELECT ${col} AS img, mime FROM sty_photos WHERE id=:id AND tenant_id=:t`, { id, t: req.tenant });
  if (!ph || !ph.img) return res.status(404).json({ error: 'not_found' });
  res.set({ 'Content-Type': ph.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.from(ph.img));
}));

/* the owner's reference photo */
api.post('/model-photo', uploadMw('photo', 1), wrap(async (req, res) => {
  if (!req.files || !req.files[0]) return res.status(400).json({ error: 'no_file' });
  if (String(req.body.full_body) !== 'true') return res.status(400).json({ error: 'confirm_full_body', message: 'Confirm the photo shows your whole body, head to shoes, wearing the white Vejas.' });
  let p; try { p = await images.processUpload(req.files[0].buffer); } catch (e) { return res.status(e.status || 400).json({ error: e.status ? e.message : 'could_not_read_image' }); }
  const ratio = p.height / p.width;
  await db.exec(`UPDATE sty_photos SET is_primary=FALSE WHERE tenant_id=:t AND kind='model'`, { t: req.tenant });
  const [rows] = await db.exec(`INSERT INTO sty_photos (tenant_id,item_id,kind,data,thumb,texture,mime,width,height,sha,is_primary,full_body)
    VALUES (:t,NULL,'model',:data,:thumb,NULL,:mime,:w,:h,:sha,TRUE,TRUE) RETURNING id`, { t: req.tenant, ...p, w: p.width, h: p.height });
  res.status(201).json({ id: rows[0].id, warning: ratio < 1.5 ? 'This photo is wider than a typical full-body portrait. Renders keep its framing, so make sure your head and both shoes are in it.' : null });
}));
api.get('/model-photos', wrap(async (req, res) => res.json({ photos: await db.sel(`SELECT id, is_primary, width, height, created_at FROM sty_photos WHERE tenant_id=:t AND kind='model' ORDER BY id DESC`, { t: req.tenant }) })));

/* outfits */
function summary(o) {
  return {
    id: o.id, favorite: o.favorite, rating: o.rating, notes: o.notes, last_worn: o.last_worn, times_worn: o.times_worn,
    render_status: o.render_status, render_id: o.render_id,
    shirt: { id: o.shirt.id, name: o.shirt.name, color_name: o.shirt.color_name, color_hex: o.shirt.color_hex, pattern: o.shirt.pattern, is_slot: o.shirt.is_slot, photo_id: o.shirt.photo_id },
    pants: { id: o.pants.id, name: o.pants.name, color_name: o.pants.color_name, color_hex: o.pants.color_hex, photo_id: o.pants.photo_id },
    shoe: { id: o.shoe.id, name: o.shoe.name },
    eval: { overall: o.eval.overall, color: o.eval.color, recommended: o.eval.recommended, occasions: o.eval.occasions }
  };
}
const full = (o) => ({ ...summary(o), eval: o.eval, ai_note: o.ai_note });

api.get('/outfits', wrap(async (req, res) => {
  let list = await W.outfits(req.tenant);
  const occ = stylist.OCC_KEYS.includes(req.query.occasion) ? req.query.occasion : null;
  if (req.query.favorite === '1') list = list.filter((o) => o.favorite);
  if (intId(req.query.shirt)) list = list.filter((o) => o.shirt.id === Number(req.query.shirt));
  if (intId(req.query.pants)) list = list.filter((o) => o.pants.id === Number(req.query.pants));
  const q = str(req.query.q, 60).toLowerCase();
  if (q) list = list.filter((o) => [o.shirt.name, o.shirt.color_name, o.pants.name, o.pants.color_name].join(' ').toLowerCase().includes(q));
  if (occ) list = list.filter((o) => o.eval.occasions.find((x) => x.key === occ).fit >= 7)
    .sort((a, b) => b.eval.occasions.find((x) => x.key === occ).fit - a.eval.occasions.find((x) => x.key === occ).fit);
  res.json({ outfits: list.map(summary), total: list.length });
}));

async function oneOutfit(req) {
  const id = intId(req.params.id);
  const list = id ? await W.outfits(req.tenant, { ids: [id] }) : [];
  return list[0] || null;
}

api.get('/outfits/:id', wrap(async (req, res) => {
  const o = await oneOutfit(req); if (!o) return res.status(404).json({ error: 'not_found' });
  res.json({ outfit: full(o) });
}));

api.patch('/outfits/:id', wrap(async (req, res) => {
  const id = intId(req.params.id); if (!id) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {}, f = {};
  if (b.favorite !== undefined) f.favorite = b.favorite === true;
  if (b.rating !== undefined) f.rating = b.rating === null ? null : (Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5 ? b.rating : undefined);
  if (f.rating === undefined) delete f.rating;
  if (b.notes !== undefined) f.notes = str(b.notes, 1000) || null;
  const keys = Object.keys(f); if (!keys.length) return res.status(400).json({ error: 'nothing_to_change' });
  const [, meta] = await db.exec(`UPDATE sty_outfits SET ${keys.map((k) => `${k}=:${k}`).join(', ')} WHERE id=:id AND tenant_id=:t`, { ...f, id, t: req.tenant });
  if (!meta.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

api.get('/outfits/:id/sketch.svg', wrap(async (req, res) => {
  const o = await oneOutfit(req); if (!o) return res.status(404).json({ error: 'not_found' });
  res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'" });
  res.send(await W.sketchFor(req.tenant, o));
}));

api.get('/outfits/:id/render', wrap(async (req, res) => {
  const o = await oneOutfit(req); if (!o || !o.render_id) return res.status(404).json({ error: 'not_found' });
  const r = await W.renderImage(req.tenant, o.render_id); if (!r) return res.status(404).json({ error: 'not_found' });
  res.set({ 'Content-Type': r.mime || 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.from(r.image));
}));

api.get('/outfits/:id/download.png', wrap(async (req, res) => {
  const o = await oneOutfit(req); if (!o) return res.status(404).json({ error: 'not_found' });
  const img = await exporter.outfitPng(req.tenant, o, 2400);
  const name = (o.shirt.name + ' with ' + o.pants.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${name}.png"`, 'X-Image-Kind': img.kind });
  res.send(img.buf);
}));

api.post('/outfits/:id/advice', wrap(async (req, res) => {
  const o = await oneOutfit(req); if (!o) return res.status(404).json({ error: 'not_found' });
  const base = o.eval.explanation;
  if (!llm.aiEnabled()) return res.json({ text: base, composed_by: 'rules', is_simulated: true, note: 'AI wording is off; this is the stylist rules text.' });
  const key = require('crypto').createHash('sha256').update(base + '|' + o.eval.tuck.advice + '|' + o.eval.sleeves.advice).digest('hex').slice(0, 64);
  if (o.ai_note && o.ai_note_key === key) return res.json({ text: o.ai_note, composed_by: 'model', cached: true });
  const evidence = [base, ...o.eval.reasons, ...o.eval.cautions, o.eval.tuck.advice, o.eval.tuck.why, o.eval.sleeves.advice, o.shirt.name, o.pants.name, 'Veja'].join(' | ');
  const text = await llm.prose({
    system: 'You are a warm, concise personal stylist writing to Manuel about one outfit. Use ONLY the facts given. Never write a number or a score. Never invent a garment, brand or occasion. Two to four sentences, plain English, no emojis.',
    user: 'Facts:\n' + evidence + '\nWrite the note.'
  });
  if (!llm.acceptRewrite(text, evidence)) return res.json({ text: base, composed_by: 'rules', is_simulated: true, note: text ? 'The AI wording added something not in the facts, so the rules text is shown.' : 'The model did not answer; the rules text is shown.' });
  await db.exec('UPDATE sty_outfits SET ai_note=:n, ai_note_key=:k WHERE id=:id AND tenant_id=:t', { n: text, k: key, id: o.id, t: req.tenant });
  res.json({ text, composed_by: 'model' });
}));

api.post('/outfits/:id/worn', wrap(async (req, res) => {
  const o = await oneOutfit(req); if (!o) return res.status(404).json({ error: 'not_found' });
  const d = dateOk(req.body && req.body.date) || todayLocal();
  const occ = stylist.OCC_KEYS.includes(req.body && req.body.occasion) ? req.body.occasion : null;
  await db.exec('INSERT INTO sty_wear (tenant_id,outfit_id,worn_on,occasion) VALUES (:t,:o,:d,:occ)', { t: req.tenant, o: o.id, d, occ });
  res.status(201).json({ ok: true, worn_on: d });
}));

/* compare one shirt with every pair of trousers */
api.get('/compare/:shirtId', wrap(async (req, res) => {
  const sid = intId(req.params.shirtId);
  const list = (await W.outfits(req.tenant)).filter((o) => o.shirt.id === sid);
  if (!list.length) return res.status(404).json({ error: 'not_found' });
  res.json({ shirt: list[0].shirt, outfits: list.map(full) });
}));
api.get('/compare/:shirtId/download.png', wrap(async (req, res) => {
  const sid = intId(req.params.shirtId);
  const list = (await W.outfits(req.tenant)).filter((o) => o.shirt.id === sid);
  if (!list.length) return res.status(404).json({ error: 'not_found' });
  if (exporting.has(req.tenant)) return res.status(429).json({ error: 'export_in_progress' });
  exporting.add(req.tenant);
  let buf; try { buf = await exporter.comparisonPng(req.tenant, list.slice(0, 8)); } finally { exporting.delete(req.tenant); }
  res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="compare-${list[0].shirt.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png"` });
  res.send(buf);
}));

/* what should I wear today / random */
api.get('/today', wrap(async (req, res) => {
  const occ = stylist.OCC_KEYS.includes(req.query.occasion) ? req.query.occasion : stylist.defaultOccasion(new Date(todayLocal() + 'T12:00:00'));
  const list = await W.outfits(req.tenant);
  const recent = await db.sel(`SELECT DISTINCT outfit_id FROM sty_wear WHERE tenant_id=:t AND worn_on >= (CAST(:d AS date) - 7)`, { t: req.tenant, d: todayLocal() });
  const plan = await db.one('SELECT outfit_id, occasion FROM sty_plan WHERE tenant_id=:t AND plan_date=:d', { t: req.tenant, d: todayLocal() });
  const w = req.query.weather === '0' ? null : await weather.today();
  const ranked = stylist.rankForOccasion(list, occ, { wornRecently: new Set(recent.map((r) => r.outfit_id)), weather: w });
  const picks = ranked.slice(0, 3).map((r) => ({ ...full(r.outfit), rank_score: r.score }));
  res.json({ date: todayLocal(), occasion: occ, weather: w, weather_used: !!w, planned: plan || null, picks, basis: 'Ranked by suitability for the occasion, overall style score, favourites and ratings; anything worn in the last 7 days is pushed down.' + (w ? '' : ' Weather was not used.') });
}));

api.get('/random', wrap(async (req, res) => {
  let list = (await W.outfits(req.tenant)).filter((o) => !o.shirt.is_slot);
  const occ = stylist.OCC_KEYS.includes(req.query.occasion) ? req.query.occasion : null;
  if (occ) list = list.filter((o) => o.eval.occasions.find((x) => x.key === occ).fit >= 6);
  if (!list.length) return res.status(404).json({ error: 'no_outfits' });
  res.json({ outfit: full(list[require('crypto').randomInt(list.length)]) });
}));

/* planner + history */
api.get('/plan', wrap(async (req, res) => {
  const from = dateOk(req.query.from) || todayLocal();
  const rows = await db.sel(`SELECT to_char(plan_date,'YYYY-MM-DD') AS date, outfit_id, occasion FROM sty_plan WHERE tenant_id=:t AND plan_date BETWEEN CAST(:f AS date) AND CAST(:f AS date) + 13 ORDER BY plan_date`, { t: req.tenant, f: from });
  res.json({ from, plan: rows });
}));
api.put('/plan/:date', wrap(async (req, res) => {
  const d = dateOk(req.params.date); const oid = intId(req.body && req.body.outfit_id);
  if (!d || !oid) return res.status(400).json({ error: 'bad_request' });
  const own = await db.one('SELECT id FROM sty_outfits WHERE id=:o AND tenant_id=:t', { o: oid, t: req.tenant });
  if (!own) return res.status(404).json({ error: 'not_found' });
  const occ = stylist.OCC_KEYS.includes(req.body.occasion) ? req.body.occasion : null;
  await db.exec(`INSERT INTO sty_plan (tenant_id,plan_date,outfit_id,occasion) VALUES (:t,:d,:o,:occ)
    ON CONFLICT ON CONSTRAINT sty_plan_day_uq DO UPDATE SET outfit_id=EXCLUDED.outfit_id, occasion=EXCLUDED.occasion`, { t: req.tenant, d, o: oid, occ });
  res.json({ ok: true });
}));
api.delete('/plan/:date', wrap(async (req, res) => {
  const d = dateOk(req.params.date); if (!d) return res.status(400).json({ error: 'bad_request' });
  await db.exec('DELETE FROM sty_plan WHERE tenant_id=:t AND plan_date=:d', { t: req.tenant, d });
  res.json({ ok: true });
}));
api.get('/history', wrap(async (req, res) => {
  res.json({ history: await db.sel(`SELECT w.id, to_char(w.worn_on,'YYYY-MM-DD') AS date, w.occasion, w.outfit_id, s.name AS shirt, p.name AS pants
    FROM sty_wear w JOIN sty_outfits o ON o.id=w.outfit_id AND o.tenant_id=w.tenant_id
    JOIN sty_items s ON s.id=o.shirt_id JOIN sty_items p ON p.id=o.pants_id
    WHERE w.tenant_id=:t ORDER BY w.worn_on DESC, w.id DESC LIMIT 60`, { t: req.tenant }) });
}));
api.delete('/history/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const [, meta] = await db.exec('DELETE FROM sty_wear WHERE id=:id AND tenant_id=:t', { id: id || 0, t: req.tenant });
  return meta.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'not_found' });
}));

/* try-on renders */
api.post('/renders', wrap(async (req, res) => {
  const b = req.body || {};
  let ids = Array.isArray(b.outfit_ids) ? b.outfit_ids.map(intId).filter(Boolean) : [];
  if (b.scope) {
    const list = await W.outfits(req.tenant);
    if (b.scope === 'favorites') ids = list.filter((o) => o.favorite).map((o) => o.id);
    else if (b.scope === 'all') ids = list.filter((o) => !o.shirt.is_slot).map((o) => o.id);
    else if (/^shirt:\d+$/.test(b.scope)) ids = list.filter((o) => o.shirt.id === Number(b.scope.slice(6))).map((o) => o.id);
  }
  if (!ids.length) return res.status(400).json({ error: 'nothing_to_render' });
  const r = await tryon.enqueue(req.tenant, ids);
  res.status(r.ok ? 202 : 409).json(r);
}));
api.get('/renders', wrap(async (req, res) => {
  const rows = await db.sel(`SELECT r.id, r.outfit_id, r.status, r.step, r.error, r.provider, r.created_at, r.finished_at
    FROM sty_renders r WHERE r.tenant_id=:t ORDER BY r.id DESC LIMIT 200`, { t: req.tenant });
  const count = (s) => rows.filter((r) => r.status === s).length;
  res.json({ renders: rows, queued: count('queued'), running: count('running'), done: count('done'), failed: count('failed') });
}));
api.delete('/renders/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const [, meta] = await db.exec('DELETE FROM sty_renders WHERE id=:id AND tenant_id=:t', { id: id || 0, t: req.tenant });
  return meta.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'not_found' });
}));

/* settings + privacy */
api.put('/settings', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.consent === true) {
    const p = tryon.provider();
    if (!p.configured) return res.status(409).json({ error: 'no_provider' });
    await db.exec(`INSERT INTO sty_settings (tenant_id,consent_at,consent_provider) VALUES (:t,NOW(),:p)
      ON CONFLICT (tenant_id) DO UPDATE SET consent_at=NOW(), consent_provider=:p, updated_at=NOW()`, { t: req.tenant, p: p.id });
  } else if (b.consent === false) {
    await db.exec(`INSERT INTO sty_settings (tenant_id) VALUES (:t) ON CONFLICT (tenant_id) DO UPDATE SET consent_at=NULL, consent_provider=NULL, updated_at=NOW()`, { t: req.tenant });
    // Withdrawing consent stops anything still waiting to be sent.
    await db.exec(`UPDATE sty_renders SET status='failed', error='consent withdrawn', finished_at=NOW() WHERE tenant_id=:t AND status='queued'`, { t: req.tenant });
  }
  res.json({ ok: true });
}));

api.post('/privacy/delete', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.confirm !== 'delete') return res.status(400).json({ error: 'confirm_required' });
  const what = ['renders', 'model', 'garments'].filter((k) => (b.what || []).includes(k));
  if (!what.length) return res.status(400).json({ error: 'nothing_selected' });
  const out = {};
  if (what.includes('renders')) { const [, m] = await db.exec('DELETE FROM sty_renders WHERE tenant_id=:t', { t: req.tenant }); out.renders = m.rowCount; }
  if (what.includes('model')) { const [, m] = await db.exec(`DELETE FROM sty_photos WHERE tenant_id=:t AND kind='model'`, { t: req.tenant }); out.model_photos = m.rowCount; }
  if (what.includes('garments')) { const [, m] = await db.exec(`DELETE FROM sty_photos WHERE tenant_id=:t AND kind='garment'`, { t: req.tenant }); out.garment_photos = m.rowCount; }
  res.json({ ok: true, deleted: out });
}));

/* exports */
api.get('/export/catalog.pdf', wrap(async (req, res) => {
  let list = await W.outfits(req.tenant);
  const scope = req.query.scope === 'favorites' ? 'favorites' : intId(req.query.shirt) ? 'shirt' : 'all';
  if (scope === 'favorites') list = list.filter((o) => o.favorite);
  if (scope === 'shirt') list = list.filter((o) => o.shirt.id === Number(req.query.shirt));
  if (!list.length) return res.status(404).json({ error: 'nothing_to_export' });
  if (exporting.has(req.tenant)) return res.status(429).json({ error: 'export_in_progress' });
  exporting.add(req.tenant);
  res.on('close', () => exporting.delete(req.tenant));
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="style-studio-${scope}.pdf"` });
  await exporter.catalogPdf(req.tenant, list, { subtitle: scope === 'favorites' ? 'Favourite outfits' : scope === 'shirt' ? list[0].shirt.name : 'Every combination' }, res);
}));

api.use((req, res) => res.status(404).json({ error: 'not_found' }));

router._internal = { setUserLookup: (fn) => { lookupUser = fn; }, ready: () => ready, ensureTenant, seeded };
module.exports = router;
