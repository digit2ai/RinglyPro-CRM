/**
 * PLANEA — copiloto financiero personal (Colombia).
 * Self-contained static mount for the Ionic React + Vite SPA.
 *
 * The app is a pure client-side SPA that talks directly to its own Supabase
 * backend (auth + Postgres + edge functions) — see src/configurations/supabase.ts.
 * There is NO server-side API here; this module only serves the built `dist/`
 * under /planea with an SPA history fallback.
 *
 * Mounted in src/app.js:  app.use('/planea', require('../verticals/planea/server.cjs'));
 * NOTE: this folder's package.json is "type":"module", so this file MUST be .cjs
 * to be require()-able from the CommonJS main CRM app.
 * Built by build.sh (skips if dist/ already committed).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();
const distDir = path.join(__dirname, 'dist');
const indexHtml = path.join(distDir, 'index.html');
const hasBuild = fs.existsSync(indexHtml);
const privateDir = path.join(__dirname, 'private');

// Portal v2 — static design-preview of the new dashboard screens (Inicio,
// Patrimonio, Metas, Cuentas). Plain HTML/CSS, no build step. Served at
// /planea/portal. Registered BEFORE the SPA fallback so it isn't swallowed.
const portalDir = path.join(__dirname, 'portal');
const hasPortal = fs.existsSync(path.join(portalDir, 'inicio.html'));

// Self-owned backend (auth + data on OUR Postgres) — replaces the third-party
// Supabase dependency. Mounted at /planea/api/v1 below. No email confirmation.
let planeaBackend = null;
try { planeaBackend = require('./backend.cjs'); } catch (e) { console.log('planea backend not loaded:', e.message); }

// TEMPORARY: auto-confirm new signups when a Supabase service_role key is set
// (PLANEA_SERVICE_ROLE_KEY), so users log in without email verification while SMTP
// is unconfigured. No-op when the key is absent. See emailAutoConfirm.cjs.
try { require('./emailAutoConfirm.cjs').start(); } catch (e) { console.log('planea auto-confirm not started:', e.message); }

// ── Private technical architecture doc — GET /planea/tech_architecture ──
// Gated behind a single admin credential. Signed HttpOnly cookie (HMAC), 30d.
// Override the defaults with env on prod: PLANEA_DOCS_PASSWORD / PLANEA_DOCS_SECRET.
const DOCS_SECRET = process.env.PLANEA_DOCS_SECRET || process.env.VERITAS_JWT_SECRET || process.env.JWT_SECRET || 'planea-docs-secret';
const DOCS_EMAIL = (process.env.PLANEA_DOCS_EMAIL || 'admin@planea.com.co').toLowerCase();
const DOCS_PASSWORD = process.env.PLANEA_DOCS_PASSWORD || 'Digit2Ai@7';

function signDocs() {
  const payload = Buffer.from(JSON.stringify({ e: DOCS_EMAIL, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url');
  const mac = crypto.createHmac('sha256', DOCS_SECRET).update(payload).digest('base64url');
  return payload + '.' + mac;
}
function verifyDocs(tok) {
  if (!tok || tok.indexOf('.') < 0) return false;
  const parts = tok.split('.');
  const expect = crypto.createHmac('sha256', DOCS_SECRET).update(parts[0]).digest('base64url');
  if (parts[1] !== expect) return false;
  try { const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); return p.exp > Date.now(); } catch (e) { return false; }
}
function docsCookie(req) {
  const h = req.headers.cookie || '';
  const m = h.match(/(?:^|;\s*)planea_docs=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function setDocsCookie(req, res, value, maxAge) {
  const https = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    'planea_docs=' + value + '; HttpOnly; Path=/planea/tech_architecture; Max-Age=' + maxAge + '; SameSite=Lax' + (https ? '; Secure' : ''));
}

router.get('/tech_architecture/login', (req, res) => res.sendFile(path.join(privateDir, 'login.html')));
router.post('/tech_architecture/login', express.urlencoded({ extended: false }), (req, res) => {
  const email = (req.body && req.body.email || '').trim().toLowerCase();
  const password = (req.body && req.body.password) || '';
  if (email === DOCS_EMAIL && password === DOCS_PASSWORD) {
    setDocsCookie(req, res, signDocs(), 60 * 60 * 24 * 30);
    return res.redirect(302, '/planea/tech_architecture');
  }
  return res.redirect(302, '/planea/tech_architecture/login?e=1');
});
router.post('/tech_architecture/logout', (req, res) => {
  setDocsCookie(req, res, '', 0);
  res.redirect(302, '/planea/tech_architecture/login');
});
router.get('/tech_architecture', (req, res) => {
  if (!verifyDocs(docsCookie(req))) return res.redirect(302, '/planea/tech_architecture/login');
  res.sendFile(path.join(privateDir, 'tech_architecture.html'));
});

// Health check — GET /planea/health
router.get('/health', (req, res) => {
  res.json({
    service: 'planea',
    status: hasBuild ? 'ok' : 'no-build',
    app: 'Planea - copiloto financiero personal',
    dist: hasBuild,
    portal: hasPortal,
    admin: { service_key: !!SB_SERVICE_KEY, endpoints: !!SB_SERVICE_KEY },
    backend: planeaBackend ? planeaBackend.status() : { ready: false, error: 'not-loaded' },
    ts: new Date().toISOString(),
  });
});

// ── The new dark app IS the product now ──
// Point the app root and the legacy SPA landing routes at the portal so
// /planea, /planea/home, etc. all show the new dark mirror (drawer nav, all
// module screens). The old Ionic SPA stays reachable at /planea/app/* for
// auth/diagnostic flows that haven't been ported yet.
if (hasPortal) {
  const PORTAL_HOME = '/planea/portal/inicio';
  const legacyToPortal = {
    '/': PORTAL_HOME, '/index.html': PORTAL_HOME, '/home': PORTAL_HOME,
    '/dashboard': PORTAL_HOME, '/mi-planea': PORTAL_HOME,
    '/patrimony': '/planea/portal/patrimonio', '/patrimonio': '/planea/portal/patrimonio',
    '/progress': '/planea/portal/metas', '/goals': '/planea/portal/metas', '/metas': '/planea/portal/metas',
    '/accounts': '/planea/portal/cuentas', '/cuentas': '/planea/portal/cuentas',
    '/profile': '/planea/portal/mas', '/settings': '/planea/portal/configuracion',
  };
  Object.keys(legacyToPortal).forEach((from) => {
    router.get(from, (req, res) => res.redirect(302, legacyToPortal[from]));
  });
}

// ── Maya — conversational financial guide (Flow 1: Financial Planner + Compliance) ──
// POST /planea/api/v1/maya/chat  { messages:[{role,content}], profile:{...} }
// Calls Claude with the Financial Planner operating manual (decision tree A–I + CFP
// pyramid) grounded on THIS user's data, gated by the Compliance rules. Voice in/out
// happen in the browser (Web Speech API + the zero-key /api/tts/edge route).
const MAYA_MODEL = process.env.PLANEA_MAYA_MODEL || 'claude-haiku-4-5-20251001';

function copFmt(n) {
  if (n == null || isNaN(n)) return 'n/d';
  return '$' + Number(n).toLocaleString('es-CO');
}

function buildMayaSystem(profile) {
  const p = profile || {};
  const perfil = JSON.stringify(p, null, 2);
  return `Eres Maya, la guía financiera de Planea (Planea Financiera S.A.S., Cali, Colombia). Hablas español colombiano con un tono motivador, cercano y honesto. Sin emojis. Ortografía correcta (tildes, ñ).

QUIÉN ERES
- Acompañas al usuario a entender su situación financiera y a dar el siguiente paso concreto.
- Planea es una plataforma de EDUCACIÓN financiera, NO de asesoría de inversión regulada.

DATOS DEL USUARIO (úsalos siempre; responde sobre SU realidad, nunca genérico):
${perfil}

REGLAS SOBRE LOS DATOS:
- Dirígete al usuario por el nombre que aparece en los datos. NUNCA uses un nombre que no esté en los datos.
- Si el usuario aún no tiene Planea Score (campo "sin_diagnostico": true, o "planea_score" ausente/nulo):
  salúdalo por su nombre, explícale brevemente qué es Planea, e invítalo a hacer su diagnóstico gratuito
  de dos minutos. NO inventes cifras, ni score, ni patrimonio, ni metas que no estén en los datos.
- Solo menciona cifras (score, patrimonio, activos, pasivos, metas) si están presentes en los datos del usuario.

MANUAL DE RECOMENDACIÓN (Financial Planner — no improvises fuera de esto):
Pirámide de prioridades (de abajo hacia arriba, se sube solo si el nivel previo está resuelto):
  1) Colchón mínimo de supervivencia (~$500.000 COP)
  2) Pagar deuda cara (tasa > 20% E.A.: tarjetas, libre inversión)
  3) Fondo de emergencia completo (3 a 6 meses de gastos)
  4) Ahorrar para metas grandes (casa, educación, retiro)
  5) Invertir y hacer crecer
Orden de diagnóstico SIEMPRE: primero flujo de caja, luego deuda cara, luego fondo de emergencia, luego inversión.
Regla de honestidad: si el objetivo declarado del usuario no es lo más inteligente ahora, díselo con empatía:
  "Sé que quieres [objetivo]. Vamos a llegar ahí. Pero primero [razón honesta]. Cuando lo resolvamos, [cómo conecta con su objetivo]."
Escenarios A–I: A flujo negativo · B flujo crítico (colchón $500.000) · C deuda cara + DTI>20% (método avalancha) · D deuda cara + DTI<=20% (50/50 deuda-fondo) · E sin ahorro (primer mes) · F <1 mes de fondo · G 1–3 meses de fondo · H sólido con deuda buena (invertir) · I sin deuda y fondo completo (invertir >=20% del ingreso).

CUMPLIMIENTO (Compliance — obligatorio):
- NUNCA des recomendaciones individualizadas de inversión como asesoría regulada. Si hablas de productos, son "información de referencia del mercado", con el aviso: "Las sugerencias son información de referencia sobre productos disponibles en el mercado. Planea no ofrece recomendaciones individualizadas de inversión."
- NUNCA prometas rendimientos garantizados.
- NUNCA menciones datos de otro usuario.
- Cumple Ley 1581 de 2012 y Decreto 1377 de 2013 sobre datos personales.

ESTILO DE RESPUESTA (IMPORTANTE — tus respuestas se leen en voz alta)
- Habla como una persona, en TEXTO PLANO. PROHIBIDO usar markdown: nada de asteriscos (*), almohadillas (#), guiones bajos (_), viñetas, ni negritas. Si necesitas enumerar, hazlo dentro de la frase ("primero…, luego…").
- Sé BREVE y natural: 2 a 4 frases cortas. Ve al grano. No repitas los datos como una lista; convérsalos.
- Di las cifras en palabras naturales para que se escuchen bien (por ejemplo "cien millones de pesos", no "$100.000.000").
- Cuando resuman su salud financiera: una frase de cómo está, una del punto débil, y una del siguiente paso. Nada más.`;
}

router.post('/api/v1/maya/chat', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const KEY = process.env.ANTHROPIC_API_KEY;
    const { messages, profile } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] requerido' });
    }
    if (!KEY) {
      return res.json({
        reply: 'Maya se está configurando en este entorno (falta la clave del modelo). Muy pronto podré responder sobre tus finanzas.',
        configured: false,
      });
    }
    const clean = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MAYA_MODEL,
        max_tokens: 380,
        system: buildMayaSystem(profile),
        messages: clean,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('Maya Anthropic error', r.status, t.slice(0, 300));
      return res.status(502).json({ error: 'maya_upstream', reply: 'Tuve un problema para responder en este momento. Intenta de nuevo en unos segundos.' });
    }
    const data = await r.json();
    const reply = (data && data.content && data.content[0] && data.content[0].text) || 'No pude generar una respuesta.';
    res.json({ reply, configured: true });
  } catch (e) {
    console.error('Maya chat error', e.message);
    res.status(500).json({ error: e.message, reply: 'Ocurrió un error. Intenta de nuevo.' });
  }
});

// ── Admin: users list + email confirm (server-side, on Render) ──────────────
// Brings the local scripts/confirm-user.mjs capability into the running app so
// user management (list / confirm) works from a URL on Render — no local script,
// no per-run key handling. Uses the SAME Supabase service_role key the poller
// reads (PLANEA_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY, set on Render) via
// plain fetch (no @supabase/supabase-js runtime dependency).
//   GET  /planea/api/v1/admin/users?token=...[&html=1]     → list all users + status
//   POST /planea/api/v1/admin/confirm?token=...  {email} | {all:true}  → confirm
// Gated by an admin token (PLANEA_ADMIN_TOKEN; falls back to the docs password).
// Returns 503 until the service_role key is set on Render.
const SB_ADMIN_URL = 'https://mfxujzvvrnsbiqcefvtg.supabase.co';
const SB_SERVICE_KEY = process.env.PLANEA_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_TOKEN = process.env.PLANEA_ADMIN_TOKEN || DOCS_PASSWORD;

function adminAuthed(req) {
  const t = (req.query && req.query.token) || req.headers['x-planea-admin'] || (req.body && req.body.token) || '';
  return !!t && String(t) === String(ADMIN_TOKEN);
}
function sbAdmin(pathQuery, opts) {
  return fetch(SB_ADMIN_URL + '/auth/v1/admin/' + pathQuery, Object.assign({
    headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY, 'Content-Type': 'application/json' },
  }, opts || {}));
}
async function listAllUsers() {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const r = await sbAdmin('users?page=' + page + '&per_page=200');
    if (!r.ok) throw new Error('list ' + r.status);
    const j = await r.json();
    const users = (j && j.users) || (Array.isArray(j) ? j : []);
    out.push(...users);
    if (!users.length || users.length < 200) break;
  }
  return out;
}
function normUser(u) {
  return {
    email: u.email || '',
    id: u.id,
    confirmed: !!(u.email_confirmed_at || u.confirmed_at),
    created_at: u.created_at || null,
    last_sign_in_at: u.last_sign_in_at || null,
  };
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

router.get('/api/v1/admin/users', async (req, res) => {
  if (!SB_SERVICE_KEY) return res.status(503).json({ error: 'service_role_key_not_set', hint: 'Set PLANEA_SERVICE_ROLE_KEY on Render.' });
  if (!adminAuthed(req)) return res.status(401).json({ error: 'unauthorized', hint: 'Pass ?token=<PLANEA_ADMIN_TOKEN>' });
  try {
    const rows = (await listAllUsers()).map(normUser)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const unconfirmed = rows.filter((r) => !r.confirmed).length;
    if (req.query.html) {
      const trs = rows.map((r) => '<tr class="' + (r.confirmed ? '' : 'u') + '"><td>' + esc(r.email) +
        '</td><td>' + (r.confirmed ? 'Sí' : '<b>No</b>') + '</td><td>' + esc((r.created_at || '').slice(0, 10)) +
        '</td><td>' + esc((r.last_sign_in_at || '').slice(0, 10) || '—') + '</td></tr>').join('');
      return res.type('html').send('<!doctype html><meta charset="utf-8"><title>Planea — Usuarios</title>' +
        '<style>body{font-family:system-ui,sans-serif;background:#0d1f1c;color:#eaf1ec;padding:24px}h1{font-size:20px}' +
        'table{border-collapse:collapse;width:100%;max-width:820px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #24413b;font-size:14px}' +
        'th{color:#8fd9ac}tr.u{background:#2a1414}small{color:#7fa}</style>' +
        '<h1>Usuarios de Planea — ' + rows.length + ' total · ' + unconfirmed + ' sin confirmar</h1>' +
        '<table><tr><th>Correo</th><th>Confirmado</th><th>Creado</th><th>Último ingreso</th></tr>' + trs + '</table>');
    }
    res.json({ count: rows.length, unconfirmed, users: rows });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post('/api/v1/admin/confirm', express.json(), async (req, res) => {
  if (!SB_SERVICE_KEY) return res.status(503).json({ error: 'service_role_key_not_set', hint: 'Set PLANEA_SERVICE_ROLE_KEY on Render.' });
  if (!adminAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const all = req.body && (req.body.all === true || req.body.all === 'true');
    const email = req.body && req.body.email;
    if (!all && !email) return res.status(400).json({ error: 'provide {email} or {all:true}' });
    const users = await listAllUsers();
    let targets;
    if (all) targets = users.filter((u) => !(u.email_confirmed_at || u.confirmed_at));
    else {
      const u = users.find((x) => (x.email || '').toLowerCase() === String(email).toLowerCase());
      if (!u) return res.status(404).json({ error: 'not_found', email });
      targets = [u];
    }
    const results = [];
    for (const u of targets) {
      const r = await sbAdmin('users/' + u.id, { method: 'PUT', body: JSON.stringify({ email_confirm: true }) });
      results.push({ email: u.email, ok: r.ok });
    }
    res.json({ confirmed: results.filter((r) => r.ok).length, total: targets.length, results });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Self-owned auth + data API (our Postgres) ──
if (planeaBackend) {
  try { router.use('/api/v1', planeaBackend.build()); } catch (e) { console.log('planea backend mount failed:', e.message); }
}

// ── Our own login / signup pages (replace the Supabase-bound SPA auth screens) ──
// Registered BEFORE the SPA catch-all so /planea/login + /planea/signup serve OUR
// dark-theme pages that talk to /planea/api/v1/auth/* (no email confirmation).
if (hasPortal) {
  const noCache = (res) => res.set('Cache-Control', 'no-store, must-revalidate');
  router.get('/login', (req, res) => { noCache(res); res.sendFile(path.join(portalDir, 'login.html')); });
  router.get(['/signup', '/register', '/start'], (req, res) => { noCache(res); res.sendFile(path.join(portalDir, 'signup.html')); });
  // Public marketing landing (planea.vip/main). Assets served from planea.co.
  if (fs.existsSync(path.join(portalDir, 'main.html'))) {
    router.get(['/main', '/main/'], (req, res) => { res.sendFile(path.join(portalDir, 'main.html')); });
  }
}

if (hasPortal) {
  // /planea/portal → inicio; /planea/portal/<page> → <page>.html; plus the css.
  router.get(['/portal', '/portal/'], (req, res) => res.sendFile(path.join(portalDir, 'inicio.html')));
  router.use('/portal', express.static(portalDir, { extensions: ['html'], index: 'inicio.html' }));
}

if (hasBuild) {
  // Inject the Maya floating chat into every SPA page (landing/login/score/home/...).
  // Done at serve time so it survives Vite rebuilds and needs no source change.
  const MAYA_TAG = '<script src="/planea/portal/maya-chat.js" defer></script>';
  let spaHtml = null;
  try {
    const raw = fs.readFileSync(indexHtml, 'utf8');
    spaHtml = raw.includes('maya-chat.js')
      ? raw
      : raw.replace('</body>', MAYA_TAG + '</body>');
  } catch (e) {
    spaHtml = null;
  }

  // Static assets (/planea/assets/*, /planea/images/*, /planea/manifest.json, etc.)
  router.use(express.static(distDir, { index: false, maxAge: '1h' }));

  // SPA history fallback — any non-file route returns index.html (with Maya injected)
  // so the client router (basename="/planea") can take over (/planea/score, /home, ...).
  router.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (spaHtml) return res.type('html').send(spaHtml);
    res.sendFile(indexHtml);
  });
} else {
  router.get('*', (req, res) => {
    res
      .status(503)
      .type('html')
      .send('<h1>Planea</h1><p>Build no encontrado. Ejecuta el build (build.sh o npm run build en verticals/planea).</p>');
  });
}

module.exports = router;
