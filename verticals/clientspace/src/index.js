'use strict';
/**
 * Client Workspace — a private, shared space per client (first one: Grupo HITTES).
 * Projects and tasks, documents (proposals, contracts, invoices) and an activity log.
 *
 * WHY A SEPARATE APP AND NOT THE PROJECTS HUB: the Hub is the owner's internal
 * command center (client 15). Sharing it with a client would expose every other
 * client. Here every row carries workspace_id and a client user can only ever
 * reach their own workspace — enforced in each query, cross-workspace reads 404.
 *
 * WHO SIGNS IN
 *  - owner: the platform owner, CLIENTSPACE_OWNER_EMAIL (default mstagg@digit2ai.com).
 *    Signs in with the SAME password as the RinglyPro CRM (users table), so there
 *    is no second password and no default. Sees and manages every workspace.
 *  - member: a client user. Edits projects/tasks, uploads documents.
 *  - viewer: a client user who can only read and download.
 *  Client users are created by the owner with a one-time temporary password and
 *  must change it on first sign-in. There is no public signup.
 */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { QueryTypes } = require('sequelize');
const db = require('./db');
const schema = require('./schema');

const router = express.Router();
const OWNER_EMAIL = String(process.env.CLIENTSPACE_OWNER_EMAIL || 'mstagg@digit2ai.com').toLowerCase();
const SECRET = process.env.CLIENTSPACE_JWT_SECRET || process.env.JWT_SECRET || '';
const COOKIE = 'cws_token';
const AUD = 'clientspace';
const MAX_FILE = Number(process.env.CLIENTSPACE_MAX_FILE_MB || 15) * 1024 * 1024;
const CATEGORIES = ['propuesta', 'contrato', 'factura', 'documento'];
const PROJECT_STATUS = ['planeado', 'en_curso', 'en_pausa', 'terminado', 'archivado'];
const TASK_STATUS = ['pendiente', 'en_curso', 'bloqueado', 'hecho'];
const ROLES = ['member', 'viewer'];

let ready = schema.init(db).catch((e) => { console.error('[clientspace] schema init failed:', e.message); throw e; });
ready.catch(() => {});

/* ── helpers ─────────────────────────────────────────────────────────── */
const sel = (sql, replacements = {}) => db.query(sql, { replacements, type: QueryTypes.SELECT });
const one = async (sql, r) => (await sel(sql, r))[0] || null;
const exec = (sql, replacements = {}) => db.query(sql, { replacements });
const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const intId = (v) => (/^\d{1,9}$/.test(String(v || '')) ? Number(v) : null);
function audit(wsId, user, action, detail) {
  exec('INSERT INTO cws_activity (workspace_id,user_id,user_email,action,detail) VALUES (:w,:u,:e,:a,:d)',
    { w: wsId || null, u: user ? user.id : null, e: user ? user.email : null, a: action, d: str(detail, 500) || null })
    .catch((e) => console.error('[clientspace] audit:', e.message));
}
function tempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = ''; const b = crypto.randomBytes(14);
  for (let i = 0; i < 14; i++) s += abc[b[i] % abc.length];
  return s;
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setCookie(res, value, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

// Login attempts, in memory per instance: 10 per 15 minutes per IP+email.
const attempts = new Map();
function tooMany(key) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, a); return a.length >= 10;
}
function noteAttempt(key) { const a = attempts.get(key) || []; a.push(Date.now()); attempts.set(key, a); }

/* ── shell ───────────────────────────────────────────────────────────── */
router.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
router.get('/health', async (req, res) => {
  let dbOk = false; try { await ready; await sel('SELECT 1 AS ok'); dbOk = true; } catch (_) {}
  res.json({ service: 'clientspace', ok: dbOk && !!SECRET, database: dbOk, signing_secret: !!SECRET, owner_email_set: !!OWNER_EMAIL });
});
router.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

/* ── api ─────────────────────────────────────────────────────────────── */
const api = express.Router();
router.use('/api/v1', api);
api.use(express.json({ limit: '200kb' }));
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.use(async (req, res, next) => {
  if (!SECRET) return res.status(503).json({ error: 'not_configured' });
  try { await ready; } catch (_) { return res.status(503).json({ error: 'database_unavailable' }); }
  // CSRF: every state-changing call must carry this header (a form on another site cannot set it).
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Workspace') !== '1') return res.status(403).json({ error: 'missing_header' });
  next();
});

async function verifyOwnerAgainstCrm(email, password) {
  try {
    const u = await one('SELECT password_hash FROM users WHERE LOWER(email)=:e LIMIT 1', { e: email });
    if (!u || !u.password_hash) return false;
    return await bcrypt.compare(password, u.password_hash);
  } catch (_) { return false; }
}

api.post('/auth/login', async (req, res) => {
  const email = str(req.body && req.body.email, 200).toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const key = (req.ip || '') + '|' + email;
  if (tooMany(key)) return res.status(429).json({ error: 'too_many_attempts' });
  if (!email || !password) return res.status(400).json({ error: 'missing_credentials' });
  let user = await one('SELECT * FROM cws_users WHERE LOWER(email)=:e', { e: email });
  let ok = false;
  if (user && user.password_hash) ok = await bcrypt.compare(password, user.password_hash);
  else if (email === OWNER_EMAIL && (!user || user.role === 'owner')) {
    ok = await verifyOwnerAgainstCrm(email, password);
    if (ok && !user) {
      await exec("INSERT INTO cws_users (workspace_id,email,name,role) VALUES (NULL,:e,'Owner','owner') ON CONFLICT DO NOTHING", { e: email });
      user = await one('SELECT * FROM cws_users WHERE LOWER(email)=:e', { e: email });
    }
  } else await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuuJcB6W6fK3k0n1i3m3e0YcJ9mL0pQkS.'); // equal timing
  if (!ok || !user || !user.active) { noteAttempt(key); return res.status(401).json({ error: 'invalid_credentials' }); }
  await exec('UPDATE cws_users SET last_login=NOW() WHERE id=:id', { id: user.id });
  const token = jwt.sign({ uid: user.id, fp: (user.password_hash || 'crm').slice(-12) }, SECRET, { audience: AUD, expiresIn: '12h' });
  setCookie(res, token, 12 * 3600);
  audit(user.workspace_id, user, 'login', null);
  res.json({ ok: true, must_change: !!user.must_change });
});

api.post('/auth/logout', (req, res) => { setCookie(res, '', 0); res.json({ ok: true }); });

// Every route below needs a session. The user is re-read from the database on
// each request, so a deactivated account or a changed password ends access at once.
api.use(async (req, res, next) => {
  const t = readCookie(req, COOKIE);
  if (!t) return res.status(401).json({ error: 'not_signed_in' });
  let p; try { p = jwt.verify(t, SECRET, { audience: AUD }); } catch (_) { return res.status(401).json({ error: 'not_signed_in' }); }
  const u = await one('SELECT id,workspace_id,email,name,role,must_change,active,password_hash FROM cws_users WHERE id=:id', { id: p.uid });
  if (!u || !u.active || (u.password_hash || 'crm').slice(-12) !== p.fp) return res.status(401).json({ error: 'not_signed_in' });
  delete u.password_hash;
  req.user = u;
  next();
});

api.get('/auth/me', async (req, res) => {
  const ws = req.user.role === 'owner'
    ? await sel('SELECT id,name,slug FROM cws_workspaces ORDER BY name')
    : await sel('SELECT id,name,slug FROM cws_workspaces WHERE id=:w', { w: req.user.workspace_id });
  res.json({ user: req.user, workspaces: ws });
});

api.post('/auth/password', async (req, res) => {
  const cur = String((req.body && req.body.current) || ''), nw = String((req.body && req.body.new) || '');
  if (req.user.role === 'owner') return res.status(400).json({ error: 'owner_uses_crm_password' });
  if (nw.length < 10) return res.status(400).json({ error: 'password_too_short' });
  const row = await one('SELECT password_hash FROM cws_users WHERE id=:id', { id: req.user.id });
  if (!row || !(await bcrypt.compare(cur, row.password_hash))) return res.status(401).json({ error: 'wrong_current_password' });
  const hash = await bcrypt.hash(nw, 12);
  await exec('UPDATE cws_users SET password_hash=:h, must_change=FALSE WHERE id=:id', { h: hash, id: req.user.id });
  const token = jwt.sign({ uid: req.user.id, fp: hash.slice(-12) }, SECRET, { audience: AUD, expiresIn: '12h' });
  setCookie(res, token, 12 * 3600);
  audit(req.user.workspace_id, req.user, 'password_changed', null);
  res.json({ ok: true });
});

// A user who must change their password can do nothing else.
api.use((req, res, next) => (req.user.must_change ? res.status(403).json({ error: 'must_change_password' }) : next()));

const isOwner = (req) => req.user.role === 'owner';
const canEdit = (req) => req.user.role === 'owner' || req.user.role === 'member';
function ownerOnly(req, res, next) { return isOwner(req) ? next() : res.status(404).json({ error: 'not_found' }); }
function editorOnly(req, res, next) { return canEdit(req) ? next() : res.status(403).json({ error: 'read_only' }); }

api.get('/workspaces', async (req, res) => {
  res.json(isOwner(req) ? await sel('SELECT id,name,slug FROM cws_workspaces ORDER BY name')
    : await sel('SELECT id,name,slug FROM cws_workspaces WHERE id=:w', { w: req.user.workspace_id }));
});
api.post('/workspaces', ownerOnly, async (req, res) => {
  const name = str(req.body && req.body.name, 160);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'cliente';
  const [rows] = await exec('INSERT INTO cws_workspaces (name,slug) VALUES (:n,:s) ON CONFLICT (slug) DO NOTHING RETURNING id,name,slug', { n: name, s: slug });
  if (!rows.length) return res.status(409).json({ error: 'exists' });
  audit(rows[0].id, req.user, 'workspace_created', name);
  res.status(201).json(rows[0]);
});

// Workspace gate: the id comes from the URL, and access is checked against the
// signed-in user. Not yours (or does not exist) = 404, never 403.
const ws = express.Router({ mergeParams: true });
api.use('/w/:ws', async (req, res, next) => {
  const id = intId(req.params.ws);
  if (!id) return res.status(404).json({ error: 'not_found' });
  if (!isOwner(req) && req.user.workspace_id !== id) return res.status(404).json({ error: 'not_found' });
  const w = await one('SELECT id,name,slug FROM cws_workspaces WHERE id=:id', { id });
  if (!w) return res.status(404).json({ error: 'not_found' });
  req.ws = w; next();
}, ws);

ws.get('/summary', async (req, res) => {
  const w = req.ws.id;
  const projects = await sel(`SELECT p.id,p.name,p.status,p.start_date,p.end_date,
      COUNT(t.id)::int AS tasks, COUNT(t.id) FILTER (WHERE t.status='hecho')::int AS done,
      COUNT(t.id) FILTER (WHERE t.status<>'hecho' AND t.due_date < CURRENT_DATE)::int AS overdue
    FROM cws_projects p LEFT JOIN cws_tasks t ON t.project_id=p.id AND t.workspace_id=p.workspace_id
    WHERE p.workspace_id=:w AND p.status<>'archivado' GROUP BY p.id ORDER BY p.created_at`, { w });
  const files = await one(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE category='factura' AND invoice_status='pendiente')::int AS invoices_pending,
      COALESCE(SUM(amount) FILTER (WHERE category='factura' AND invoice_status='pendiente'),0) AS pending_amount
    FROM cws_files WHERE workspace_id=:w`, { w });
  res.json({ workspace: req.ws, projects, files });
});

/* projects */
ws.get('/projects', async (req, res) => {
  res.json(await sel(`SELECT p.*, COUNT(t.id)::int AS tasks, COUNT(t.id) FILTER (WHERE t.status='hecho')::int AS done
    FROM cws_projects p LEFT JOIN cws_tasks t ON t.project_id=p.id AND t.workspace_id=p.workspace_id
    WHERE p.workspace_id=:w GROUP BY p.id ORDER BY (p.status='archivado'), p.created_at`, { w: req.ws.id }));
});
ws.post('/projects', editorOnly, async (req, res) => {
  const b = req.body || {}; const name = str(b.name, 200);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const status = PROJECT_STATUS.includes(b.status) ? b.status : 'planeado';
  const [rows] = await exec(`INSERT INTO cws_projects (workspace_id,name,description,status,start_date,end_date,created_by)
    VALUES (:w,:n,:d,:s,:sd,:ed,:u) RETURNING *`, { w: req.ws.id, n: name, d: str(b.description, 4000) || null, s: status, sd: dateOrNull(b.start_date), ed: dateOrNull(b.end_date), u: req.user.id });
  audit(req.ws.id, req.user, 'project_created', name);
  res.status(201).json(rows[0]);
});
async function projectOf(req) {
  const id = intId(req.params.id);
  return id ? one('SELECT * FROM cws_projects WHERE id=:id AND workspace_id=:w', { id, w: req.ws.id }) : null;
}
ws.patch('/projects/:id', editorOnly, async (req, res) => {
  const p = await projectOf(req); if (!p) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const v = {
    n: b.name !== undefined ? (str(b.name, 200) || p.name) : p.name,
    d: b.description !== undefined ? (str(b.description, 4000) || null) : p.description,
    s: PROJECT_STATUS.includes(b.status) ? b.status : p.status,
    sd: b.start_date !== undefined ? dateOrNull(b.start_date) : p.start_date,
    ed: b.end_date !== undefined ? dateOrNull(b.end_date) : p.end_date
  };
  const [rows] = await exec(`UPDATE cws_projects SET name=:n,description=:d,status=:s,start_date=:sd,end_date=:ed,updated_at=NOW() WHERE id=:id AND workspace_id=:w RETURNING *`, { ...v, id: p.id, w: req.ws.id });
  audit(req.ws.id, req.user, 'project_updated', v.n + (v.s !== p.status ? ' → ' + v.s : ''));
  res.json(rows[0]);
});

/* tasks */
ws.get('/projects/:id/tasks', async (req, res) => {
  const p = await projectOf(req); if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(await sel('SELECT * FROM cws_tasks WHERE workspace_id=:w AND project_id=:p ORDER BY position, id', { w: req.ws.id, p: p.id }));
});
ws.post('/projects/:id/tasks', editorOnly, async (req, res) => {
  const p = await projectOf(req); if (!p) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {}; const title = str(b.title, 300);
  if (!title) return res.status(400).json({ error: 'title_required' });
  const pos = await one('SELECT COALESCE(MAX(position),0)+1 AS n FROM cws_tasks WHERE project_id=:p AND workspace_id=:w', { p: p.id, w: req.ws.id });
  const [rows] = await exec(`INSERT INTO cws_tasks (workspace_id,project_id,title,status,assignee,due_date,position,created_by)
    VALUES (:w,:p,:t,:s,:a,:d,:pos,:u) RETURNING *`, { w: req.ws.id, p: p.id, t: title, s: TASK_STATUS.includes(b.status) ? b.status : 'pendiente', a: str(b.assignee, 160) || null, d: dateOrNull(b.due_date), pos: pos.n, u: req.user.id });
  audit(req.ws.id, req.user, 'task_created', p.name + ': ' + title);
  res.status(201).json(rows[0]);
});
async function taskOf(req) {
  const id = intId(req.params.id);
  return id ? one('SELECT * FROM cws_tasks WHERE id=:id AND workspace_id=:w', { id, w: req.ws.id }) : null;
}
ws.patch('/tasks/:id', editorOnly, async (req, res) => {
  const t = await taskOf(req); if (!t) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const v = {
    t: b.title !== undefined ? (str(b.title, 300) || t.title) : t.title,
    s: TASK_STATUS.includes(b.status) ? b.status : t.status,
    a: b.assignee !== undefined ? (str(b.assignee, 160) || null) : t.assignee,
    d: b.due_date !== undefined ? dateOrNull(b.due_date) : t.due_date
  };
  const [rows] = await exec('UPDATE cws_tasks SET title=:t,status=:s,assignee=:a,due_date=:d,updated_at=NOW() WHERE id=:id AND workspace_id=:w RETURNING *', { ...v, id: t.id, w: req.ws.id });
  if (v.s !== t.status) audit(req.ws.id, req.user, 'task_status', v.t + ' → ' + v.s);
  res.json(rows[0]);
});
ws.delete('/tasks/:id', editorOnly, async (req, res) => {
  const t = await taskOf(req); if (!t) return res.status(404).json({ error: 'not_found' });
  await exec('DELETE FROM cws_tasks WHERE id=:id AND workspace_id=:w', { id: t.id, w: req.ws.id });
  audit(req.ws.id, req.user, 'task_deleted', t.title);
  res.json({ ok: true });
});

/* files: proposals, contracts, invoices, documents */
// Type is decided by the file's first bytes, never by its name or the browser's claim.
function sniff(buf) {
  if (!buf || buf.length < 4) return null;
  const h = buf.slice(0, 8);
  if (h.slice(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (h[0] === 0x89 && h.slice(1, 4).toString('latin1') === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04) {
    const body = buf.slice(0, Math.min(buf.length, 65536)).toString('latin1');
    if (body.includes('word/')) return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
    if (body.includes('xl/')) return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
    if (body.includes('ppt/')) return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' };
    return { mime: 'application/zip', ext: 'zip' };
  }
  return null;
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 1, fields: 20 } });
ws.get('/files', async (req, res) => {
  const cat = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const proj = intId(req.query.project);
  res.json(await sel(`SELECT f.id,f.project_id,f.category,f.title,f.filename,f.mime,f.size,f.amount,f.currency,f.invoice_status,f.due_date,f.created_at,
      p.name AS project_name, u.email AS uploaded_by_email
    FROM cws_files f LEFT JOIN cws_projects p ON p.id=f.project_id AND p.workspace_id=f.workspace_id LEFT JOIN cws_users u ON u.id=f.uploaded_by
    WHERE f.workspace_id=:w ${cat ? 'AND f.category=:c' : ''} ${proj ? 'AND f.project_id=:p' : ''}
    ORDER BY f.created_at DESC`, { w: req.ws.id, c: cat, p: proj }));
});
ws.post('/files', editorOnly, (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_failed' });
  next();
}), async (req, res) => {
  const f = req.file; if (!f) return res.status(400).json({ error: 'file_required' });
  const kind = sniff(f.buffer);
  if (!kind) return res.status(415).json({ error: 'type_not_allowed', allowed: 'PDF, Word, Excel, PowerPoint, PNG, JPG, ZIP' });
  const b = req.body || {};
  const category = CATEGORIES.includes(b.category) ? b.category : 'documento';
  // Proposals and invoices are issued by Digit2AI; client users upload documents and contracts.
  if (!isOwner(req) && (category === 'factura' || category === 'propuesta')) return res.status(403).json({ error: 'category_owner_only' });
  let projectId = intId(b.project_id);
  if (projectId && !(await one('SELECT id FROM cws_projects WHERE id=:id AND workspace_id=:w', { id: projectId, w: req.ws.id }))) projectId = null;
  const base = str(f.originalname, 200).replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_') || 'archivo';
  const filename = /\.[a-z0-9]{2,5}$/i.test(base) ? base : base + '.' + kind.ext;
  const amount = category === 'factura' && b.amount !== undefined && b.amount !== '' && isFinite(Number(b.amount)) ? Math.round(Number(b.amount) * 100) / 100 : null;
  const [rows] = await exec(`INSERT INTO cws_files (workspace_id,project_id,category,title,filename,mime,size,sha256,data,amount,currency,invoice_status,due_date,uploaded_by)
    VALUES (:w,:p,:c,:t,:fn,:m,:s,:h,:d,:a,:cur,:is,:dd,:u) RETURNING id,category,title,filename,size`, {
    w: req.ws.id, p: projectId, c: category, t: str(b.title, 250) || filename, fn: filename, m: kind.mime, s: f.size,
    h: crypto.createHash('sha256').update(f.buffer).digest('hex'), d: f.buffer,
    a: amount, cur: category === 'factura' ? (['USD', 'MXN'].includes(b.currency) ? b.currency : 'USD') : null,
    is: category === 'factura' ? 'pendiente' : null, dd: category === 'factura' ? dateOrNull(b.due_date) : null, u: req.user.id });
  audit(req.ws.id, req.user, 'file_uploaded', category + ': ' + rows[0].title);
  res.status(201).json(rows[0]);
});
ws.get('/files/:id/download', async (req, res) => {
  const id = intId(req.params.id); if (!id) return res.status(404).json({ error: 'not_found' });
  const f = await one('SELECT id,title,filename,mime,data FROM cws_files WHERE id=:id AND workspace_id=:w', { id, w: req.ws.id });
  if (!f) return res.status(404).json({ error: 'not_found' });
  const inline = req.query.view === '1' && f.mime === 'application/pdf';
  res.set('Content-Type', f.mime);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "sandbox; default-src 'none'");
  res.set('Content-Disposition', (inline ? 'inline' : 'attachment') + '; filename*=UTF-8\'\'' + encodeURIComponent(f.filename));
  audit(req.ws.id, req.user, 'file_downloaded', f.title);
  res.send(f.data);
});
ws.patch('/files/:id', ownerOnly, async (req, res) => {
  const id = intId(req.params.id); if (!id) return res.status(404).json({ error: 'not_found' });
  const f = await one('SELECT * FROM cws_files WHERE id=:id AND workspace_id=:w', { id, w: req.ws.id });
  if (!f) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const status = f.category === 'factura' && ['pendiente', 'pagada', 'cancelada'].includes(b.invoice_status) ? b.invoice_status : f.invoice_status;
  await exec('UPDATE cws_files SET title=:t, invoice_status=:s WHERE id=:id AND workspace_id=:w', { t: str(b.title, 250) || f.title, s: status, id, w: req.ws.id });
  audit(req.ws.id, req.user, 'file_updated', f.title + (status !== f.invoice_status ? ' → ' + status : ''));
  res.json({ ok: true });
});
ws.delete('/files/:id', ownerOnly, async (req, res) => {
  const id = intId(req.params.id); if (!id) return res.status(404).json({ error: 'not_found' });
  const f = await one('SELECT title FROM cws_files WHERE id=:id AND workspace_id=:w', { id, w: req.ws.id });
  if (!f) return res.status(404).json({ error: 'not_found' });
  await exec('DELETE FROM cws_files WHERE id=:id AND workspace_id=:w', { id, w: req.ws.id });
  audit(req.ws.id, req.user, 'file_deleted', f.title);
  res.json({ ok: true });
});

/* team (owner only) */
ws.get('/users', ownerOnly, async (req, res) => {
  res.json(await sel('SELECT id,email,name,role,active,must_change,last_login,created_at FROM cws_users WHERE workspace_id=:w ORDER BY created_at', { w: req.ws.id }));
});
ws.post('/users', ownerOnly, async (req, res) => {
  const b = req.body || {}; const email = str(b.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (email === OWNER_EMAIL) return res.status(400).json({ error: 'reserved_email' });
  const pw = tempPassword();
  const [rows] = await exec(`INSERT INTO cws_users (workspace_id,email,name,role,password_hash,must_change)
    VALUES (:w,:e,:n,:r,:h,TRUE) ON CONFLICT DO NOTHING RETURNING id,email,name,role`, {
    w: req.ws.id, e: email, n: str(b.name, 160) || null, r: ROLES.includes(b.role) ? b.role : 'member', h: await bcrypt.hash(pw, 12) });
  if (!rows.length) return res.status(409).json({ error: 'email_exists' });
  audit(req.ws.id, req.user, 'user_created', email);
  // Shown once. Never stored in clear, never returned again.
  res.status(201).json({ ...rows[0], temporary_password: pw });
});
ws.patch('/users/:id', ownerOnly, async (req, res) => {
  const id = intId(req.params.id); if (!id) return res.status(404).json({ error: 'not_found' });
  const u = await one('SELECT * FROM cws_users WHERE id=:id AND workspace_id=:w', { id, w: req.ws.id });
  if (!u) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {}; let pw = null;
  const role = ROLES.includes(b.role) ? b.role : u.role;
  const active = typeof b.active === 'boolean' ? b.active : u.active;
  let hash = u.password_hash, must = u.must_change;
  if (b.reset_password === true) { pw = tempPassword(); hash = await bcrypt.hash(pw, 12); must = true; }
  await exec('UPDATE cws_users SET role=:r, active=:a, password_hash=:h, must_change=:m WHERE id=:id AND workspace_id=:w', { r: role, a: active, h: hash, m: must, id, w: req.ws.id });
  audit(req.ws.id, req.user, 'user_updated', u.email + (pw ? ' (contraseña restablecida)' : '') + (active !== u.active ? (active ? ' activado' : ' desactivado') : ''));
  res.json(pw ? { ok: true, temporary_password: pw } : { ok: true });
});

ws.get('/activity', async (req, res) => {
  res.json(await sel('SELECT action,detail,user_email,created_at FROM cws_activity WHERE workspace_id=:w ORDER BY created_at DESC LIMIT 150', { w: req.ws.id }));
});

api.use((req, res) => res.status(404).json({ error: 'not_found' }));
// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => { console.error('[clientspace]', err.message); res.status(500).json({ error: 'server_error' }); });

// Express 4 does not catch a rejected promise from an async handler; without this a
// database error would become an unhandled rejection instead of a 500.
function protect(r) {
  for (const layer of r.stack) {
    if (layer.route) { layer.route.stack.forEach(wrap); continue; }
    if (layer.handle && Array.isArray(layer.handle.stack)) { protect(layer.handle); continue; }
    wrap(layer);
  }
}
function wrap(layer) {
  const h = layer.handle;
  if (typeof h !== "function" || h.length >= 4 || h.__safe) return;
  const s = (req, res, next) => { try { const p = h(req, res, next); if (p && typeof p.catch === "function") p.catch(next); } catch (e) { next(e); } };
  s.__safe = true; layer.handle = s;
}
protect(router);

router._internal = { sniff, ready: () => ready, OWNER_EMAIL };
module.exports = router;
