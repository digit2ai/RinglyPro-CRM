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

const router = express.Router();
const distDir = path.join(__dirname, 'dist');
const indexHtml = path.join(distDir, 'index.html');
const hasBuild = fs.existsSync(indexHtml);

// Portal v2 — static design-preview of the new dashboard screens (Inicio,
// Patrimonio, Metas, Cuentas). Plain HTML/CSS, no build step. Served at
// /planea/portal. Registered BEFORE the SPA fallback so it isn't swallowed.
const portalDir = path.join(__dirname, 'portal');
const hasPortal = fs.existsSync(path.join(portalDir, 'inicio.html'));

// Health check — GET /planea/health
router.get('/health', (req, res) => {
  res.json({
    service: 'planea',
    status: hasBuild ? 'ok' : 'no-build',
    app: 'Planea - copiloto financiero personal',
    dist: hasBuild,
    portal: hasPortal,
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
