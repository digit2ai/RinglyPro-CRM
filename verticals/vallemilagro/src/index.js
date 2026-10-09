'use strict';
/**
 * Valle Milagro: Portal de Miembros, Módulo de Backend y dos agentes.
 * Router propio; se monta en /vallemilagro (y /ValleMilagro).
 *
 * REGLAS QUE NO SE NEGOCIAN
 *  - El portal SOLO lee filas publicadas o aprobadas. El filtro va en el SQL.
 *  - No existe ninguna ruta que reciba o mueva dinero.
 *  - El miembro sale de la sesión; nunca del cuerpo de la petición.
 *  - Ninguna página lleva el prefijo escrito a mano: se sustituye {{BASE}}.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { q, one, run, init, TENANT, audit } = require('./db');
const auth = require('./auth');
const core = require('./core');
const agents = require('./agents');
const llm = require('./llm');
const mail = require('./mail');

const router = express.Router();
const PUBLIC = path.join(__dirname, '..', 'public');
const VIEWS = path.join(__dirname, 'views');
const VERSION = '1';
let lastError = null;

/* ---------- arranque perezoso ---------- */
let booted = null;
function boot() {
  if (!booted) {
    booted = (async () => {
      await init();
      await auth.seedFounder(TENANT());
      if (String(process.env.VALLEMILAGRO_SEED_DEMO || 'on') !== 'off') await core.seedDemo(TENANT());
      // El Scout programado gasta tokens y búsquedas: solo corre si se enciende a propósito.
      if (String(process.env.VALLEMILAGRO_SCOUT || '').toLowerCase() === 'on') {
        const timer = setInterval(() => { agents.scoutTick(TENANT()).catch(() => {}); }, 15 * 60 * 1000);
        if (timer.unref) timer.unref();
      }
      return true;
    })().catch((e) => { booted = null; lastError = String((e && e.message) || e); throw e; });
  }
  return booted;
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ready = wrap(async (req, res, next) => { await boot(); next(); });

/* La ruta de la cookie distingue mayúsculas: una sola forma canónica, en minúsculas. */
router.use((req, res, next) => {
  const base = req.baseUrl || '';
  req.vmBase = base; // el punto de montaje; dentro de los sub-routers req.baseUrl ya incluye /api/v1
  if (base && base !== base.toLowerCase() && (req.method === 'GET' || req.method === 'HEAD')) return res.redirect(301, base.toLowerCase() + req.url);
  next();
});

/* ---------- salud (abierta: solo estado, nunca datos) ---------- */
router.get('/health', wrap(async (req, res) => {
  let dbOk = false;
  try { await boot(); dbOk = true; } catch (e) { /* se informa abajo */ }
  let lastRun = null;
  if (dbOk) lastRun = await one('SELECT status, started_at, finished_at, found, error FROM vm_scout_runs WHERE tenant_id = :t ORDER BY id DESC LIMIT 1', { t: TENANT() });
  res.json({ ok: dbOk, service: 'vallemilagro', database: dbOk ? 'ok' : 'error', error: dbOk ? null : lastError,
    login: auth.configured() ? (mail.configured() ? 'ok' : 'falta_correo') : 'cerrado_falta_secreto',
    ai: llm.enabled() ? 'modelo' : 'sin_modelo', scout_programado: String(process.env.VALLEMILAGRO_SCOUT || '').toLowerCase() === 'on',
    ultima_corrida_scout: lastRun });
}));

/* ---------- páginas ---------- */
const shell = (file, dir) => {
  let cached = null;
  return (req, res) => {
    if (!cached || process.env.NODE_ENV !== 'production') cached = fs.readFileSync(path.join(dir, file), 'utf8');
    const base = req.baseUrl || '';
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').send(cached.replace(/\{\{BASE\}\}/g, base).replace(/\{\{VERSION\}\}/g, VERSION));
  };
};
const portalPage = shell('portal.html', PUBLIC);
// Presentación narrada: pública, sin sesión. No lee la base de datos; sus pantallas son capturas con datos de ejemplo.
router.get(['/presentacion', '/presentation'], shell('presentacion.html', PUBLIC));
router.get(['/', '/entrar', '/privacidad', '/portal', '/portal/*'], portalPage);
router.get('/admin', ready, wrap(async (req, res, next) => {
  const m = await auth.loadSession(req);
  if (!m || !m.is_admin) return res.status(404).type('html').send(notFound(req));
  return shell('admin.html', VIEWS)(req, res);
}));
router.get('/manifest.webmanifest', (req, res) => {
  const base = (req.baseUrl || '') + '/';
  res.set('Cache-Control', 'no-store').type('application/manifest+json').send(JSON.stringify({
    id: base, name: 'Asociación Valle Milagro', short_name: 'Valle Milagro', start_url: base + 'portal', scope: base,
    display: 'standalone', background_color: '#F5F0E6', theme_color: '#21392B', lang: 'es-CO',
    icons: [{ src: base + 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: base + 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
  }));
});
router.use(express.static(PUBLIC, { index: false, maxAge: '1h' }));

/* ---------- API ---------- */
const api = express.Router();
api.use(ready);
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const T = () => TENANT();
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const int = (v) => { const n = parseInt(v, 10); return isFinite(n) ? n : null; };

api.get('/public/texts', wrap(async (req, res) => {
  const tx = await core.texts(T());
  res.json({ bienvenida: tx.bienvenida, lema: tx.lema, pie: tx.pie, privacidad: tx.privacidad, consent: auth.CONSENT_TEXT, today: core.bogotaToday() });
}));

/* acceso */
api.post('/auth/register', auth.sameOrigin, wrap(async (req, res) => { const r = await auth.register(req, req.body || {}); res.status(r.status).json(r.body); }));
api.post('/auth/request-code', auth.sameOrigin, wrap(async (req, res) => { const r = await auth.requestCode(req, req.body || {}); res.status(r.status).json(r.body); }));
api.post('/auth/verify', auth.sameOrigin, wrap(async (req, res) => {
  const r = await auth.verify(req, req.body || {});
  if (r.token) auth.setCookie(req, res, r.token);
  res.status(r.status).json(r.body);
}));
api.post('/auth/logout', auth.sameOrigin, wrap(async (req, res) => { await auth.logout(req, res); res.json({ ok: true }); }));
api.get('/auth/me', wrap(async (req, res) => {
  const m = await auth.loadSession(req);
  if (!m) return res.status(401).json({ error: 'auth' });
  res.json({ first_name: m.first_name, last_name: m.last_name, code: m.code, is_founder: !!m.is_founder, is_admin: m.is_admin });
}));

/* portal */
const portal = express.Router();
portal.use(auth.requireMember);
portal.use((req, res, next) => (req.method === 'GET' ? next() : auth.sameOrigin(req, res, next)));

portal.get('/home', wrap(async (req, res) => res.json(await core.home(T(), req.member))));

portal.get('/editions', wrap(async (req, res) => {
  const rows = await q(`SELECT edition_date FROM vm_editions WHERE tenant_id = :t AND status = 'published' ORDER BY edition_date DESC LIMIT 60`, { t: T() });
  res.json({ dates: rows.map((r) => r.edition_date) });
}));
portal.get('/editions/:date', wrap(async (req, res) => {
  const date = req.params.date === 'latest' ? null : req.params.date;
  if (date && !core.isDate(date)) return res.status(404).json({ error: 'not_found' });
  const ed = await one(`SELECT edition_date, headline, summary, today_line, composed_by, is_demo FROM vm_editions
    WHERE tenant_id = :t AND status = 'published' ${date ? 'AND edition_date = :d' : ''} ORDER BY edition_date DESC LIMIT 1`, { t: T(), d: date });
  if (!ed) return res.json({ edition: null, news: [] });
  const news = await q(`SELECT id, tema, title, summary, medio, published_on, source_url, is_demo FROM vm_findings
    WHERE tenant_id = :t AND status = 'approved' AND edition_date = :d ORDER BY id`, { t: T(), d: ed.edition_date });
  res.json({ edition: ed, news });
}));

portal.get('/projects', wrap(async (req, res) => {
  const rows = await core.publishedProjects(T());
  const mine = await q('SELECT project_id FROM vm_interests WHERE tenant_id = :t AND member_id = :m', { t: T(), m: req.member.id });
  const follows = await q('SELECT project_id FROM vm_follows WHERE tenant_id = :t AND member_id = :m', { t: T(), m: req.member.id });
  const tx = await core.texts(T());
  res.json({ stages: core.STAGES, categories: core.CATEGORIES,
    projects: rows.filter((p) => p.layer !== 'Necesidades' || p.lat != null).map(core.projectView),
    interested: mine.map((r) => r.project_id), following: follows.map((r) => r.project_id),
    texts: { nota_fiduciaria: tx.nota_fiduciaria, interes_registrado: tx.interes_registrado, postulacion_enviada: tx.postulacion_enviada, aviso_fotos: tx.aviso_fotos } });
}));
const publishedById = (id) => one("SELECT id, sector FROM vm_projects WHERE tenant_id = :t AND id = :id AND status = 'published'", { t: T(), id });
/** "Me interesa vincular a mi empresa": SOLO registra el interés. No hay pago ni monto. */
portal.post('/projects/:id/interest', wrap(async (req, res) => {
  const p = await publishedById(int(req.params.id));
  if (!p || p.sector !== 'oxi') return res.status(404).json({ error: 'not_found' });
  await run('INSERT INTO vm_interests (tenant_id, member_id, project_id) VALUES (:t, :m, :p) ON CONFLICT DO NOTHING', { t: T(), m: req.member.id, p: p.id });
  await audit(T(), req.member.id, 'interest.register', p.id);
  res.json({ ok: true });
}));
portal.post('/projects/:id/follow', wrap(async (req, res) => {
  const p = await publishedById(int(req.params.id));
  if (!p) return res.status(404).json({ error: 'not_found' });
  await run('INSERT INTO vm_follows (tenant_id, member_id, project_id) VALUES (:t, :m, :p) ON CONFLICT DO NOTHING', { t: T(), m: req.member.id, p: p.id });
  res.json({ ok: true });
}));
portal.delete('/projects/:id/follow', wrap(async (req, res) => {
  await run('DELETE FROM vm_follows WHERE tenant_id = :t AND member_id = :m AND project_id = :p', { t: T(), m: req.member.id, p: int(req.params.id) });
  res.json({ ok: true });
}));

portal.get('/map', wrap(async (req, res) => {
  const rows = await core.publishedProjects(T());
  res.json({ layers: core.LAYERS, points: rows.filter((p) => p.lat != null && p.lng != null).map(core.projectView) });
}));

/* fotos: tipo por bytes, recodificadas (se pierde el EXIF, que suele traer la ubicación) */
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}
async function storeImage(dataUrl, ownerKind, ownerId, memberId) {
  const buf = Buffer.from(String(dataUrl || '').replace(/^data:[^,]*,/, ''), 'base64');
  if (!buf.length || buf.length > 8 * 1024 * 1024) throw Object.assign(new Error('Cada foto debe pesar menos de 8 MB.'), { status: 400 });
  if (!sniffImage(buf)) throw Object.assign(new Error('Solo se aceptan fotos JPG, PNG o WebP.'), { status: 400 });
  const out = await require('sharp')(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const rows = await run(`INSERT INTO vm_files (tenant_id, owner_kind, owner_id, member_id, mime, bytes, size)
    VALUES (:t, :k, :o, :m, 'image/jpeg', :b, :s) RETURNING id`, { t: T(), k: ownerKind, o: ownerId, m: memberId, b: out, s: out.length });
  return rows[0].id;
}

portal.post('/submissions', wrap(async (req, res) => {
  const b = req.body || {};
  if (auth.limited('sub:' + req.member.id, 6, 3600e3)) return res.status(429).json({ error: 'rate', message: 'Ya enviaste varias postulaciones. Intenta más tarde.' });
  const category = str(b.category, 40), municipio = str(b.municipio, 80);
  if (!core.CATEGORIES.includes(category)) return res.status(400).json({ error: 'category', message: 'Elige una categoría.' });
  if (!municipio) return res.status(400).json({ error: 'municipio', message: 'Escribe el municipio.' });
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 6) : [];
  const pop = int(b.population);
  const rows = await run(`INSERT INTO vm_submissions (tenant_id, member_id, category, municipio, place, map_point, conditions, population, time_unattended, source)
    VALUES (:t, :m, :c, :mu, :pl, :mp, :co, :po, :ti, :so) RETURNING id`,
    { t: T(), m: req.member.id, c: category, mu: municipio, pl: str(b.place, 120) || null, mp: str(b.map_point, 80) || null,
      co: str(b.conditions, 2000) || null, po: pop != null && pop >= 0 && pop < 100000000 ? pop : null, ti: str(b.time_unattended, 80) || null, so: str(b.source, 200) || null });
  const id = rows[0].id;
  let saved = 0; const failed = [];
  for (const p of photos) { try { await storeImage(p, 'submission', id, req.member.id); saved++; } catch (e) { failed.push(e.message); } }
  await audit(T(), req.member.id, 'submission.create', id, { photos: saved });
  res.json({ ok: true, id, photos_saved: saved, photos_failed: failed });
}));

portal.post('/valle/chat', wrap(async (req, res) => {
  const max = parseInt(process.env.VALLEMILAGRO_CHAT_PER_10MIN || '30', 10);
  if (auth.limited('chat:' + req.member.id, max, 600e3)) return res.status(429).json({ error: 'rate', message: 'Espera un momento antes de seguir conversando.' });
  const out = await agents.valleChat(T(), req.member, (req.body || {}).messages);
  await audit(T(), req.member.id, 'valle.chat', null, { composed_by: out.composed_by, reason: out.reason || null }); // sin el texto de la conversación
  res.json({ reply: out.reply, composed_by: out.composed_by, is_simulated: !!out.is_simulated });
}));

portal.get('/profile', wrap(async (req, res) => {
  const m = req.member;
  res.json({ first_name: m.first_name, last_name: m.last_name, email: m.email, code: m.code, is_founder: !!m.is_founder, joined_at: m.joined_at, dues_status: m.dues_status });
}));
portal.patch('/profile', wrap(async (req, res) => {
  const f = auth.cleanName((req.body || {}).first_name), l = auth.cleanName((req.body || {}).last_name);
  if (!f || !l) return res.status(400).json({ error: 'name', message: 'Escribe tu nombre y tu apellido.' });
  await run('UPDATE vm_members SET first_name = :f, last_name = :l WHERE tenant_id = :t AND id = :id', { f, l, t: T(), id: req.member.id });
  res.json({ ok: true });
}));
portal.post('/profile/delete', wrap(async (req, res) => {
  if (req.member.is_admin) return res.status(400).json({ error: 'admin', message: 'Una cuenta administradora no se puede eliminar desde aquí.' });
  if ((req.body || {}).confirm !== true) return res.status(400).json({ error: 'confirm' });
  // Se borran los datos personales; el número queda retirado para que no se reasigne.
  await run(`UPDATE vm_members SET status = 'deleted', first_name = 'Cuenta', last_name = 'eliminada', email = :e WHERE tenant_id = :t AND id = :id`,
    { e: 'eliminada-' + req.member.id + '@invalid', t: T(), id: req.member.id });
  await run('UPDATE vm_sessions SET revoked_at = NOW() WHERE tenant_id = :t AND member_id = :id', { t: T(), id: req.member.id });
  await audit(T(), req.member.id, 'member.delete', req.member.id);
  auth.setCookie(req, res, null);
  res.json({ ok: true });
}));

portal.get('/files/:id', wrap(async (req, res) => {
  const f = await one('SELECT id, owner_kind, member_id, mime, bytes FROM vm_files WHERE tenant_id = :t AND id = :id', { t: T(), id: int(req.params.id) });
  if (!f) return res.status(404).end();
  // Fotos del Inicio: cualquier miembro. Fotos de postulaciones: quien la envió o el administrador.
  if (f.owner_kind !== 'home_photo' && !(req.member.is_admin || f.member_id === req.member.id)) return res.status(404).end();
  res.set('Content-Type', f.mime).set('X-Content-Type-Options', 'nosniff').set('Cache-Control', 'private, max-age=3600').send(f.bytes);
}));
api.use('/portal', portal);

/* ---------- backend (administrador) ---------- */
const admin = express.Router();
admin.use(auth.requireAdmin);
const A = (req) => req.member.id;

admin.get('/overview', wrap(async (req, res) => {
  const c = async (sql) => Number((await one(sql, { t: T() })).n);
  res.json({
    pending_findings: await c("SELECT COUNT(*) AS n FROM vm_findings WHERE tenant_id = :t AND status = 'pending'"),
    submissions: await c("SELECT COUNT(*) AS n FROM vm_submissions WHERE tenant_id = :t AND status = 'en_revision'"),
    members: await c("SELECT COUNT(*) AS n FROM vm_members WHERE tenant_id = :t AND status = 'active'"),
    interests: await c('SELECT COUNT(*) AS n FROM vm_interests WHERE tenant_id = :t AND contacted_at IS NULL'),
    demo_rows: await c('SELECT COUNT(*) AS n FROM vm_projects WHERE tenant_id = :t AND is_demo = TRUE'),
    ai: llm.enabled() ? 'modelo' : 'sin_modelo', today: core.bogotaToday(),
    constants: { stages: core.STAGES, layers: core.LAYERS, categories: core.CATEGORIES, sectors: core.SECTORS, temas: core.TEMAS, types: agents.TYPES, urgency: core.URGENCY_LABELS, dues: core.DUES }
  });
}));

/* 1. Entrenamiento de Valle */
admin.get('/kb', wrap(async (req, res) => res.json({ docs: await agents.kbList(T(), { all: true }), max_chars: parseInt(process.env.VALLEMILAGRO_KB_MAX_CHARS || '60000', 10) })));
admin.post('/kb', wrap(async (req, res) => {
  const r = await agents.kbAdd(T(), A(req), req.body || {});
  if (r.error) return res.status(r.status).json({ error: 'kb', message: r.error });
  res.json({ ok: true, doc: r.doc });
}));
admin.post('/kb/:id/deactivate', wrap(async (req, res) => {
  await run('UPDATE vm_kb_docs SET active = FALSE WHERE tenant_id = :t AND id = :id', { t: T(), id: int(req.params.id) });
  await audit(T(), A(req), 'kb.deactivate', req.params.id);
  res.json({ ok: true });
}));
/** La misma pregunta con y sin los documentos, lado a lado. */
admin.post('/kb/test', wrap(async (req, res) => {
  if (auth.limited('kbtest:' + A(req), 20, 3600e3)) return res.status(429).json({ error: 'rate' });
  const question = str((req.body || {}).question, 600);
  if (!question) return res.status(400).json({ error: 'question' });
  const msgs = [{ role: 'user', content: question }];
  const [withKb, without] = await Promise.all([agents.valleChat(T(), req.member, msgs, { withKb: true }), agents.valleChat(T(), req.member, msgs, { withKb: false })]);
  res.json({ with_docs: withKb, without_docs: without });
}));

/* 2. Directrices del Scout */
admin.get('/scout', wrap(async (req, res) => {
  const runs = await q('SELECT id, trigger, status, searches, found, discarded, error, started_at, finished_at FROM vm_scout_runs WHERE tenant_id = :t ORDER BY id DESC LIMIT 15', { t: T() });
  res.json({ directives: await agents.directives(T()), runs, min_interval_hours: parseInt(process.env.VALLEMILAGRO_SCOUT_MIN_INTERVAL_HOURS || '6', 10),
    scheduled: String(process.env.VALLEMILAGRO_SCOUT || '').toLowerCase() === 'on', ai: llm.enabled() });
}));
admin.put('/scout', wrap(async (req, res) => {
  const b = req.body || {};
  const floor = parseInt(process.env.VALLEMILAGRO_SCOUT_MIN_INTERVAL_HOURS || '6', 10);
  const freq = Math.max(floor, Math.min(168, int(b.frequency_hours) || 24));
  const topics = str(b.topics, 3000);
  if (!topics) return res.status(400).json({ error: 'topics', message: 'Escribe al menos un tema.' });
  const prev = await one('SELECT COALESCE(MAX(version), 0) AS v FROM vm_scout_directives WHERE tenant_id = :t', { t: T() });
  await run('UPDATE vm_scout_directives SET active = FALSE WHERE tenant_id = :t', { t: T() });
  await run(`INSERT INTO vm_scout_directives (tenant_id, topics, sources, municipios, frequency_hours, version, created_by)
    VALUES (:t, :to, :so, :mu, :f, :v, :b)`, { t: T(), to: topics, so: str(b.sources, 3000), mu: str(b.municipios, 3000), f: freq, v: Number(prev.v) + 1, b: A(req) });
  await audit(T(), A(req), 'scout.directives', null, { frequency_hours: freq });
  res.json({ ok: true, frequency_hours: freq });
}));
admin.post('/scout/run', wrap(async (req, res) => {
  const r = await agents.scoutStart(T(), { trigger: 'manual', by: A(req) });
  if (r.error) return res.status(r.status).json({ error: 'scout', message: r.error });
  res.json(r);
}));

/* 3. Bandeja de reportes */
admin.get('/findings', wrap(async (req, res) => {
  const status = ['pending', 'approved', 'discarded'].includes(req.query.status) ? req.query.status : 'pending';
  res.json({ findings: await q(`SELECT id, run_id, type, tema, municipio, title, summary, medio, published_on, source_url, url_seen, flags, status, edition_date, is_demo, created_at
    FROM vm_findings WHERE tenant_id = :t AND status = :s ORDER BY id DESC LIMIT 200`, { t: T(), s: status }) });
}));
const httpUrl = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') && !/^[\d.]+$/.test(x.hostname) && !x.hostname.includes(':') ? x.toString() : null; } catch (e) { return null; } };
admin.post('/findings', wrap(async (req, res) => {
  const b = req.body || {};
  const title = str(b.title, 200);
  if (!title) return res.status(400).json({ error: 'title', message: 'Escribe el título.' });
  const rows = await run(`INSERT INTO vm_findings (tenant_id, type, tema, municipio, title, summary, medio, published_on, source_url, url_seen, status)
    VALUES (:t, :ty, :te, :mu, :ti, :su, :me, :pd, :u, FALSE, 'pending') RETURNING id`,
    { t: T(), ty: agents.TYPES.includes(b.type) ? b.type : 'noticia', te: core.TEMAS.includes(b.tema) ? b.tema : 'Sin clasificar', mu: str(b.municipio, 80) || null,
      ti: title, su: str(b.summary, 400), me: str(b.medio, 120) || null, pd: core.isDate(b.published_on) ? b.published_on : null, u: httpUrl(b.source_url) });
  res.json({ ok: true, id: rows[0].id });
}));
admin.patch('/findings/:id', wrap(async (req, res) => {
  const b = req.body || {}; const id = int(req.params.id);
  const f = await one('SELECT * FROM vm_findings WHERE tenant_id = :t AND id = :id', { t: T(), id });
  if (!f) return res.status(404).json({ error: 'not_found' });
  await run(`UPDATE vm_findings SET title = :ti, summary = :su, medio = :me, published_on = :pd, source_url = :u, tema = :te, type = :ty, municipio = :mu WHERE id = :id`,
    { id, ti: 'title' in b ? str(b.title, 200) || f.title : f.title, su: 'summary' in b ? str(b.summary, 400) : f.summary,
      me: 'medio' in b ? str(b.medio, 120) || null : f.medio, pd: 'published_on' in b ? (core.isDate(b.published_on) ? b.published_on : null) : f.published_on,
      u: 'source_url' in b ? httpUrl(b.source_url) : f.source_url, te: 'tema' in b && core.TEMAS.includes(b.tema) ? b.tema : f.tema,
      ty: 'type' in b && agents.TYPES.includes(b.type) ? b.type : f.type, mu: 'municipio' in b ? str(b.municipio, 80) || null : f.municipio });
  await audit(T(), A(req), 'finding.edit', id);
  res.json({ ok: true });
}));
async function linkWorks(url) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
  try { const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'ValleMilagroPortal/1.0 (verificacion de enlace)' } }); return r.status < 400; }
  catch (e) { return false; } finally { clearTimeout(timer); }
}
/** Aprobar exige medio, fecha y un enlace que responde. Solo lo aprobado llega al portal. */
admin.post('/findings/:id/approve', wrap(async (req, res) => {
  const id = int(req.params.id); const b = req.body || {};
  const f = await one('SELECT * FROM vm_findings WHERE tenant_id = :t AND id = :id', { t: T(), id });
  if (!f) return res.status(404).json({ error: 'not_found' });
  const missing = [];
  if (!f.title) missing.push('título'); if (!f.summary) missing.push('resumen'); if (!f.medio) missing.push('medio');
  if (!f.published_on) missing.push('fecha'); if (!httpUrl(f.source_url)) missing.push('enlace');
  if (missing.length) return res.status(400).json({ error: 'incomplete', message: 'Falta: ' + missing.join(', ') + '.' });
  if (b.link_checked_by_hand !== true && !(await linkWorks(f.source_url))) {
    return res.status(409).json({ error: 'link', message: 'El enlace no respondió. Ábrelo tú; si funciona, confirma y aprueba de nuevo.' });
  }
  const date = core.isDate(b.edition_date) ? b.edition_date : core.bogotaToday();
  await run(`UPDATE vm_findings SET status = 'approved', edition_date = :d, approved_by = :a, approved_at = NOW() WHERE id = :id`, { d: date, a: A(req), id });
  await audit(T(), A(req), 'finding.approve', id, { edition_date: date, link_checked_by_hand: b.link_checked_by_hand === true });
  res.json({ ok: true, edition_date: date });
}));
admin.post('/findings/:id/discard', wrap(async (req, res) => {
  await run("UPDATE vm_findings SET status = 'discarded', edition_date = NULL WHERE tenant_id = :t AND id = :id", { t: T(), id: int(req.params.id) });
  await audit(T(), A(req), 'finding.discard', req.params.id);
  res.json({ ok: true });
}));

/* 4. Periódico */
admin.get('/editions/:date', wrap(async (req, res) => {
  const date = core.isDate(req.params.date) ? req.params.date : core.bogotaToday();
  const edition = await one('SELECT * FROM vm_editions WHERE tenant_id = :t AND edition_date = :d', { t: T(), d: date });
  const news = await q(`SELECT id, tema, title, summary, medio, published_on, source_url FROM vm_findings WHERE tenant_id = :t AND status = 'approved' AND edition_date = :d ORDER BY id`, { t: T(), d: date });
  res.json({ date, edition, news });
}));
admin.put('/editions/:date', wrap(async (req, res) => {
  if (!core.isDate(req.params.date)) return res.status(400).json({ error: 'date' });
  const b = req.body || {};
  await run(`INSERT INTO vm_editions (tenant_id, edition_date, headline, summary, today_line, status, composed_by)
    VALUES (:t, :d, :h, :s, :y, 'draft', 'admin')
    ON CONFLICT (tenant_id, edition_date) DO UPDATE SET headline = EXCLUDED.headline, summary = EXCLUDED.summary, today_line = EXCLUDED.today_line, is_demo = FALSE`,
    { t: T(), d: req.params.date, h: str(b.headline, 240), s: str(b.summary, 900), y: str(b.today_line, 240) });
  await audit(T(), A(req), 'edition.edit', req.params.date);
  res.json({ ok: true });
}));
/** Publicar es un acto del administrador. El sistema nunca publica solo. */
admin.post('/editions/:date/publish', wrap(async (req, res) => {
  if (!core.isDate(req.params.date)) return res.status(400).json({ error: 'date' });
  const ed = await one('SELECT id, headline FROM vm_editions WHERE tenant_id = :t AND edition_date = :d', { t: T(), d: req.params.date });
  if (!ed || !ed.headline) return res.status(400).json({ error: 'headline', message: 'La edición necesita un titular.' });
  const on = (req.body || {}).publish !== false;
  await run(`UPDATE vm_editions SET status = :s, published_by = :a, published_at = CASE WHEN :s = 'published' THEN NOW() ELSE NULL END WHERE id = :id`,
    { s: on ? 'published' : 'draft', a: A(req), id: ed.id });
  await audit(T(), A(req), on ? 'edition.publish' : 'edition.unpublish', req.params.date);
  res.json({ ok: true, status: on ? 'published' : 'draft' });
}));

/* 5. Proyectos y mapa */
function projectFields(b, base = {}) {
  const pick = (k, fn) => (k in b ? fn(b[k]) : base[k]);
  const pct = (v) => { const n = int(v); return n == null ? null : Math.max(0, Math.min(100, n)); };
  const num = (v) => { const n = Number(v); return v === '' || v == null || !isFinite(n) ? null : n; };
  const cop = (v) => { const n = num(v); return n == null || n < 0 ? null : Math.round(n); };
  const out = {
    name: pick('name', (v) => str(v, 160)), municipio: pick('municipio', (v) => str(v, 80)), entity: pick('entity', (v) => str(v, 160) || null),
    sector: pick('sector', (v) => (core.SECTORS.includes(v) ? v : 'publico')), layer: pick('layer', (v) => (core.LAYERS.includes(v) ? v : 'Obras públicas')),
    category: pick('category', (v) => (core.CATEGORIES.includes(v) ? v : null)), stage: pick('stage', (v) => Math.max(0, Math.min(6, int(v) || 0))),
    progress_pct: pick('progress_pct', pct), delivery_date: pick('delivery_date', (v) => (core.isDate(v) ? v : null)),
    lat: pick('lat', num), lng: pick('lng', num), contributors_count: pick('contributors_count', (v) => { const n = int(v); return n == null || n < 0 ? null : n; }),
    fiduciary: pick('fiduciary', (v) => str(v, 160) || null), quota_committed_cop: pick('quota_committed_cop', cop), work_value_cop: pick('work_value_cop', cop)
  };
  core.URGENCY_KEYS.forEach((k) => { out[k] = pick(k, pct); });
  if (out.lat != null && (out.lat < -5 || out.lat > 14)) out.lat = null;
  if (out.lng != null && (out.lng < -82 || out.lng > -66)) out.lng = null;
  return out;
}
const PCOLS = ['name', 'municipio', 'entity', 'sector', 'layer', 'category', 'stage', 'progress_pct', 'delivery_date', 'lat', 'lng', 'contributors_count', 'fiduciary', 'quota_committed_cop', 'work_value_cop', ...core.URGENCY_KEYS];
admin.get('/projects', wrap(async (req, res) => {
  const w = await core.weights(T());
  const rows = await q('SELECT * FROM vm_projects WHERE tenant_id = :t ORDER BY id DESC', { t: T() });
  res.json({ weights: w, projects: rows.map((r) => ({ ...r, quota_committed_cop: r.quota_committed_cop == null ? null : Number(r.quota_committed_cop),
    work_value_cop: r.work_value_cop == null ? null : Number(r.work_value_cop), urgency: core.urgency(r, w) })) });
}));
admin.post('/projects', wrap(async (req, res) => {
  const f = projectFields(req.body || {}, {});
  if (!f.name || !f.municipio) return res.status(400).json({ error: 'required', message: 'Nombre y municipio son obligatorios.' });
  const params = { t: T() }; PCOLS.forEach((k) => { params[k] = f[k] == null ? null : f[k]; });
  if (params.stage == null) params.stage = 0; if (!params.sector) params.sector = 'publico'; if (!params.layer) params.layer = 'Obras públicas';
  const rows = await run(`INSERT INTO vm_projects (tenant_id, ${PCOLS.join(', ')}, status, origin) VALUES (:t, ${PCOLS.map((k) => ':' + k).join(', ')}, 'draft', 'admin') RETURNING id`, params);
  await audit(T(), A(req), 'project.create', rows[0].id);
  res.json({ ok: true, id: rows[0].id });
}));
admin.patch('/projects/:id', wrap(async (req, res) => {
  const id = int(req.params.id);
  const cur = await one('SELECT * FROM vm_projects WHERE tenant_id = :t AND id = :id', { t: T(), id });
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const f = projectFields(req.body || {}, cur);
  if (!f.name || !f.municipio) return res.status(400).json({ error: 'required', message: 'Nombre y municipio son obligatorios.' });
  const params = { id }; PCOLS.forEach((k) => { params[k] = f[k] == null ? null : f[k]; });
  await run(`UPDATE vm_projects SET ${PCOLS.map((k) => k + ' = :' + k).join(', ')}, is_demo = FALSE, updated_at = NOW() WHERE id = :id`, params);
  await audit(T(), A(req), 'project.edit', id);
  res.json({ ok: true });
}));
admin.post('/projects/:id/publish', wrap(async (req, res) => {
  const on = (req.body || {}).publish !== false;
  const rows = await run('UPDATE vm_projects SET status = :s, updated_at = NOW() WHERE tenant_id = :t AND id = :id RETURNING id', { s: on ? 'published' : 'draft', t: T(), id: int(req.params.id) });
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  await audit(T(), A(req), on ? 'project.publish' : 'project.unpublish', req.params.id);
  res.json({ ok: true, status: on ? 'published' : 'draft' });
}));
/** Quita TODOS los datos de ejemplo (proyectos, noticias y ediciones de muestra). */
admin.post('/demo/clear', wrap(async (req, res) => {
  if ((req.body || {}).confirm !== true) return res.status(400).json({ error: 'confirm' });
  await run('DELETE FROM vm_findings WHERE tenant_id = :t AND is_demo = TRUE', { t: T() });
  await run('DELETE FROM vm_editions WHERE tenant_id = :t AND is_demo = TRUE', { t: T() });
  await run('DELETE FROM vm_follows WHERE tenant_id = :t AND project_id IN (SELECT id FROM vm_projects WHERE tenant_id = :t AND is_demo = TRUE)', { t: T() });
  await run('DELETE FROM vm_interests WHERE tenant_id = :t AND project_id IN (SELECT id FROM vm_projects WHERE tenant_id = :t AND is_demo = TRUE)', { t: T() });
  await run('DELETE FROM vm_projects WHERE tenant_id = :t AND is_demo = TRUE', { t: T() });
  await audit(T(), A(req), 'demo.clear', null);
  res.json({ ok: true });
}));

admin.get('/submissions', wrap(async (req, res) => {
  const rows = await q(`SELECT s.*, m.first_name, m.last_name, m.member_no,
      (SELECT COALESCE(json_agg(f.id ORDER BY f.id), '[]'::json) FROM vm_files f WHERE f.tenant_id = s.tenant_id AND f.owner_kind = 'submission' AND f.owner_id = s.id) AS photos
    FROM vm_submissions s JOIN vm_members m ON m.id = s.member_id AND m.tenant_id = s.tenant_id
    WHERE s.tenant_id = :t ORDER BY s.id DESC LIMIT 200`, { t: T() });
  res.json({ submissions: rows.map((r) => ({ ...r, member: auth.memberCode(r.member_no) + ' · ' + r.first_name + ' ' + r.last_name })) });
}));
admin.post('/submissions/:id/to-project', wrap(async (req, res) => {
  const s = await one('SELECT * FROM vm_submissions WHERE tenant_id = :t AND id = :id', { t: T(), id: int(req.params.id) });
  if (!s) return res.status(404).json({ error: 'not_found' });
  if (s.project_id) return res.json({ ok: true, project_id: s.project_id });
  let lat = null, lng = null;
  const m = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(String(s.map_point || ''));
  if (m && Number(m[1]) > -5 && Number(m[1]) < 14 && Number(m[2]) > -82 && Number(m[2]) < -66) { lat = Number(m[1]); lng = Number(m[2]); }
  const rows = await run(`INSERT INTO vm_projects (tenant_id, name, municipio, sector, layer, category, stage, lat, lng, status, origin)
    VALUES (:t, :n, :mu, 'publico', 'Necesidades', :c, 1, :lat, :lng, 'draft', 'postulacion') RETURNING id`,
    { t: T(), n: (s.category + ' · ' + (s.place || s.municipio)).slice(0, 160), mu: s.municipio, c: s.category, lat, lng });
  await run("UPDATE vm_submissions SET status = 'convertida', project_id = :p WHERE id = :id", { p: rows[0].id, id: s.id });
  await audit(T(), A(req), 'submission.to_project', s.id, { project_id: rows[0].id });
  res.json({ ok: true, project_id: rows[0].id });
}));
admin.post('/submissions/:id/discard', wrap(async (req, res) => {
  await run("UPDATE vm_submissions SET status = 'descartada' WHERE tenant_id = :t AND id = :id", { t: T(), id: int(req.params.id) });
  res.json({ ok: true });
}));

/* 6. Fotografías del Inicio */
admin.get('/photos', wrap(async (req, res) => {
  const photos = await q('SELECT id, file_id, caption, active, position FROM vm_home_photos WHERE tenant_id = :t ORDER BY position, id', { t: T() });
  const act = photos.filter((p) => p.active); const today = core.bogotaToday();
  const tomorrow = core.bogotaToday(new Date(Date.now() + 86400000));
  res.json({ photos, today_id: act.length ? act[core.pickOfDay(act.length, today)].id : null, tomorrow_id: act.length ? act[core.pickOfDay(act.length, tomorrow)].id : null,
    note: act.length < 2 ? 'Con menos de dos fotos activas la foto del Inicio no puede cambiar de un día a otro.' : null });
}));
admin.post('/photos', wrap(async (req, res) => {
  let fileId;
  try { fileId = await storeImage((req.body || {}).image, 'home_photo', null, A(req)); } catch (e) { return res.status(e.status || 400).json({ error: 'image', message: e.message }); }
  const pos = await one('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM vm_home_photos WHERE tenant_id = :t', { t: T() });
  const rows = await run('INSERT INTO vm_home_photos (tenant_id, file_id, caption, position) VALUES (:t, :f, :c, :p) RETURNING id', { t: T(), f: fileId, c: str((req.body || {}).caption, 200) || null, p: pos.p });
  await audit(T(), A(req), 'photo.add', rows[0].id);
  res.json({ ok: true, id: rows[0].id });
}));
admin.patch('/photos/:id', wrap(async (req, res) => {
  const b = req.body || {}; const cur = await one('SELECT * FROM vm_home_photos WHERE tenant_id = :t AND id = :id', { t: T(), id: int(req.params.id) });
  if (!cur) return res.status(404).json({ error: 'not_found' });
  await run('UPDATE vm_home_photos SET caption = :c, active = :a, position = :p WHERE id = :id',
    { c: 'caption' in b ? str(b.caption, 200) || null : cur.caption, a: 'active' in b ? !!b.active : cur.active, p: 'position' in b ? int(b.position) || 0 : cur.position, id: cur.id });
  res.json({ ok: true });
}));
admin.delete('/photos/:id', wrap(async (req, res) => {
  const rows = await run('DELETE FROM vm_home_photos WHERE tenant_id = :t AND id = :id RETURNING file_id', { t: T(), id: int(req.params.id) });
  if (rows.length) await run("DELETE FROM vm_files WHERE tenant_id = :t AND id = :f AND owner_kind = 'home_photo'", { t: T(), f: rows[0].file_id });
  res.json({ ok: true });
}));

/* 7. Textos del portal y pesos del Índice de Urgencia */
admin.get('/texts', wrap(async (req, res) => res.json({ texts: await core.texts(T()), defaults: core.TEXT_DEFAULTS, weights: await core.weights(T()), labels: core.URGENCY_LABELS })));
admin.put('/texts', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.weights) {
    if (!core.validWeights(b.weights)) return res.status(400).json({ error: 'weights', message: 'Los cinco pesos deben sumar 1.' });
    const w = {}; core.URGENCY_KEYS.forEach((k) => { w[k] = Number(b.weights[k]); });
    await core.setText(T(), 'urgency_weights', JSON.stringify(w), A(req));
  }
  for (const k of Object.keys(b.texts || {})) if (k in core.TEXT_DEFAULTS) await core.setText(T(), k, str(b.texts[k], 3000), A(req));
  await audit(T(), A(req), 'texts.edit', null);
  res.json({ ok: true });
}));

admin.get('/members', wrap(async (req, res) => {
  const rows = await q(`SELECT id, member_no, first_name, last_name, email, joined_at, dues_status, is_founder FROM vm_members
    WHERE tenant_id = :t AND status = 'active' ORDER BY member_no`, { t: T() });
  res.json({ members: rows.map((r) => ({ ...r, code: auth.memberCode(r.member_no) })) });
}));
/** La cuota la marca el administrador a mano. El portal no cobra ni consulta pagos. */
admin.patch('/members/:id/dues', wrap(async (req, res) => {
  const v = (req.body || {}).dues_status;
  if (!core.DUES.includes(v)) return res.status(400).json({ error: 'dues' });
  await run('UPDATE vm_members SET dues_status = :v WHERE tenant_id = :t AND id = :id', { v, t: T(), id: int(req.params.id) });
  await audit(T(), A(req), 'member.dues', req.params.id, { dues_status: v });
  res.json({ ok: true });
}));
admin.get('/interests', wrap(async (req, res) => {
  res.json({ interests: await q(`SELECT i.id, i.created_at, i.contacted_at, p.name AS project, m.first_name, m.last_name, m.email, m.member_no
    FROM vm_interests i JOIN vm_projects p ON p.id = i.project_id AND p.tenant_id = i.tenant_id JOIN vm_members m ON m.id = i.member_id AND m.tenant_id = i.tenant_id
    WHERE i.tenant_id = :t ORDER BY i.id DESC LIMIT 200`, { t: T() }) });
}));
admin.post('/interests/:id/contacted', wrap(async (req, res) => {
  await run('UPDATE vm_interests SET contacted_at = NOW() WHERE tenant_id = :t AND id = :id', { t: T(), id: int(req.params.id) });
  res.json({ ok: true });
}));
api.use('/admin', admin);

router.use('/api/v1', api);
router.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

/* ---------- 404 propio y errores ---------- */
function notFound(req) {
  const base = req.baseUrl || '';
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No encontrado · Valle Milagro</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F0E6;color:#21392B;font-family:Georgia,serif;text-align:center;padding:24px">
<div><p style="font-family:Arial,sans-serif;letter-spacing:.25em;font-size:12px;text-transform:uppercase">Asociación Valle Milagro</p><h1 style="font-size:22px">Esta página no existe</h1>
<p><a href="${base}/" style="color:#21392B">Volver al portal</a></p></div></body></html>`;
}
router.use((req, res) => res.status(404).type('html').send(notFound(req)));
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  lastError = String((err && err.stack) || err).slice(0, 2000);
  console.error('[vallemilagro]', err && err.message);
  if (res.headersSent) return;
  const status = err && err.status ? err.status : 500;
  if (String(req.originalUrl || '').includes('/api/')) return res.status(status).json({ error: 'server', message: 'Algo falló de nuestro lado. Intenta de nuevo.' });
  res.status(status).type('html').send(notFound(req));
});

router.lastError = () => lastError;
router.boot = boot;
module.exports = router;
