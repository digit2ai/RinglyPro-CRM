'use strict';

// =============================================================
// WordPress como proveedor de identidad — los dos canales.
//
//   Canal A  GET  /:slug/auth/wp          handoff SSO (esto hace el login)
//            GET  /:slug/auth/logout      cierre encadenado
//   Canal B  POST /api/v1/webhooks/wordpress/users
//
// El canal B no es opcional. Sin el, un usuario desactivado en WordPress
// conserva su sesion hasta que caduque, y un cambio de rol solo se aplica en el
// siguiente acceso.
//
// EL WEBHOOK NECESITA EL CUERPO SIN TOCAR. El HMAC se calcula sobre los bytes
// exactos que envio WordPress; si express.json() los parsea antes, cualquier
// diferencia de reserializacion —espacios, orden— rompe todas las firmas. Por
// eso la ruta monta su propio express.raw ANTES que el parser global.
// =============================================================

const express = require('express');
const { Sequelize, QueryTypes } = require('sequelize');
const jwtLib = require('jsonwebtoken');
const wp = require('../services/wpIdentity');
const secretos = require('../services/tenantSecrets');

const router = express.Router();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

const CHAMBER_JWT_SECRET = process.env.CHAMBER_JWT_SECRET || 'chamber-multitenant-secret-change-me';

// ---- utilidades -------------------------------------------------------------
async function integracionPorSlug(slug) {
  const [fila] = await sequelize.query(
    `SELECT i.*, c.id AS chamber_id_real, c.name AS chamber_name
       FROM cv_tenant_integrations i
       JOIN chambers c ON c.id = i.chamber_id
      WHERE LOWER(i.tenant_slug) = :s AND i.provider = 'wordpress'`,
    { replacements: { s: String(slug || '').toLowerCase() }, type: QueryTypes.SELECT });
  return fila || null;
}

// Bilingue: la camara puede ser ES o EN. No se adivina por el navegador, se
// toma del idioma del tenant y se permite forzarlo con ?lang=.
const T = {
  es: {
    titulo: 'No se pudo iniciar sesion',
    volver: 'Volver a la camara',
    sso_off: 'El acceso desde WordPress no esta activado para esta camara.',
    no_tenant: 'Esta camara no tiene configurada la integracion con WordPress.',
    sin_miembro: 'No existe ningun miembro en esta camara para esa cuenta de WordPress. '
               + 'El aprovisionamiento automatico esta desactivado: WordPress debe enviar primero el alta.',
    inactivo: 'Esta cuenta esta inactiva en la camara.',
    reintentar: 'Vuelve a WordPress e intenta entrar de nuevo. El enlace de acceso caduca en dos minutos y solo sirve una vez.',
  },
  en: {
    titulo: 'Could not sign you in',
    volver: 'Back to the chamber',
    sso_off: 'WordPress sign-in is not enabled for this chamber.',
    no_tenant: 'This chamber has no WordPress integration configured.',
    sin_miembro: 'No member in this chamber matches that WordPress account. '
               + 'Auto-provisioning is off: WordPress must send the user first.',
    inactivo: 'This account is inactive in the chamber.',
    reintentar: 'Go back to WordPress and try again. The sign-in link lasts two minutes and works once.',
  },
};
function idioma(req, fila) {
  const q = String((req.query && req.query.lang) || '').toLowerCase();
  if (q === 'es' || q === 'en') return q;
  return 'es';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function paginaError(mensaje, pista, volverA, t) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.titulo)}</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f8f9fa;
color:#212529;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.c{background:#fff;border:1px solid #e9ecef;border-radius:14px;padding:32px;max-width:460px;
box-shadow:0 2px 12px rgba(0,0,0,.06)}h1{font-size:19px;margin:0 0 10px}
p{color:#495057;font-size:14.5px;line-height:1.6;margin:0 0 8px}
.p{color:#6c757d;font-size:13px}a{display:inline-block;margin-top:18px;background:#003DA5;color:#fff;
padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600}</style></head>
<body><div class="c"><h1>${esc(t.titulo)}</h1><p>${esc(mensaje)}</p>
${pista ? `<p class="p">${esc(pista)}</p>` : ''}
<a href="${esc(volverA)}">${esc(t.volver)}</a></div></body></html>`;
}

// El token de camara se entrega en una pagina diminuta, no en la URL: el
// dashboard lo lee de localStorage y asi nunca aparece en el historial ni en
// una cabecera Referer.
function paginaEntrega(slug, token, destino) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Entrando…</title><style>body{font-family:system-ui,sans-serif;background:#f8f9fa;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#495057}</style></head>
<body><div>Entrando a la camara…</div><script>
try{localStorage.setItem('cv_${esc(slug)}_token', ${JSON.stringify(token)});}catch(e){}
location.replace(${JSON.stringify(destino)});
</script></body></html>`;
}

// Limitador simple por IP y por sub. En memoria a proposito: es una defensa
// contra fuerza bruta, no un control de seguridad — el control es la firma.
const golpes = new Map();
function demasiados(clave, max = 20, ventanaMs = 60000) {
  const ahora = Date.now();
  const lista = (golpes.get(clave) || []).filter((t) => t > ahora - ventanaMs);
  lista.push(ahora);
  golpes.set(clave, lista);
  if (golpes.size > 5000) golpes.clear();
  return lista.length > max;
}

// ---- CANAL A — handoff SSO --------------------------------------------------
router.get('/:slug/auth/wp', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  const t = T[idioma(req)] || T.es;
  const casa = `/${slug}/login`;
  const fallo = (msg, pista, code) => res.status(code || 401).type('html')
    .send(paginaError(msg, pista, casa, t));

  try {
    if (!/^(cv|vc)-\d+$/.test(slug)) return fallo(t.no_tenant, null, 404);

    const ip = req.headers['cf-connecting-ip'] || req.ip || '';
    if (demasiados('ip:' + ip)) return fallo('Demasiados intentos. Espera un minuto.', null, 429);

    const cfg = await integracionPorSlug(slug);
    if (!cfg) return fallo(t.no_tenant, null, 404);
    if (!cfg.sso_enabled) return fallo(t.sso_off, null, 403);

    const v = wp.verificarToken(req.query.token, cfg, slug);
    if (!v.ok) return fallo(t.reintentar, v.error, 401);

    const p = v.payload;
    if (demasiados('sub:' + slug + ':' + p.sub)) {
      return fallo('Demasiados intentos para esta cuenta. Espera un minuto.', null, 429);
    }

    // Un solo uso. Se consume ANTES de crear nada: si esto falla, el token ya
    // se gasto en otra pestana o es un reenvio.
    const nuevo = await wp.consumirJti(sequelize, QueryTypes, {
      jti: p.jti, chamberId: cfg.chamber_id, wpUserId: Number(p.sub) || null, exp: p.exp });
    if (!nuevo) return fallo(t.reintentar, 'Ese enlace de acceso ya se habia utilizado.', 401);

    const r = await wp.upsertMiembro(sequelize, QueryTypes, {
      chamberId: cfg.chamber_id, cfg, canal: 'sso',
      datos: { wp_user_id: Number(p.sub), email: p.email, user_login: p.wp_user_login,
               display_name: p.name, roles: p.roles,
               // Sin status a proposito: entrar no reactiva a nadie. Solo el
               // webhook, que es quien conoce el estado real en WordPress,
               // puede cambiarlo.
               company: p.company, phone: p.phone },
    });
    if (!r.ok) return fallo(t.sin_miembro, r.error, 403);
    if (r.member.status !== 'active') return fallo(t.inactivo, null, 403);

    const token = jwtLib.sign({
      member_id: r.member.id, chamber_id: cfg.chamber_id, chamber_slug: slug,
      email: r.member.email, access_level: r.member.access_level || 'member',
      governance_role: r.member.governance_role || 'member',
      identity_provider: 'wordpress',
    }, CHAMBER_JWT_SECRET, { expiresIn: `${cfg.session_ttl_minutes || 480}m` });

    // Cookie de sesion ademas del token en localStorage: el dashboard usa lo
    // segundo, pero una cookie httpOnly es lo que permite cerrar sesion de
    // verdad desde el servidor.
    res.cookie('cv_session', token, {
      httpOnly: true, secure: true, sameSite: 'lax',
      maxAge: (cfg.session_ttl_minutes || 480) * 60000, path: '/',
    });

    await sequelize.query(
      'UPDATE cv_tenant_integrations SET last_sso_at = NOW() WHERE id = :id',
      { replacements: { id: cfg.id }, type: QueryTypes.UPDATE });
    await sequelize.query('UPDATE members SET last_active_at = NOW() WHERE id = :id',
      { replacements: { id: r.member.id }, type: QueryTypes.UPDATE });

    const destino = wp.destinoSeguro(req.query.redirect, cfg, slug);
    return res.type('html').send(paginaEntrega(slug, token, destino));
  } catch (e) {
    // Nunca el token ni el secreto en el log.
    console.error('[wp-auth]', slug, e.message);
    return fallo('No se pudo completar el acceso.', null, 500);
  }
});

// ---- cierre de sesion encadenado -------------------------------------------
router.get('/:slug/auth/logout', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  res.clearCookie('cv_session', { path: '/' });
  try {
    const cfg = await integracionPorSlug(slug);
    // Encadenado por defecto: cerrar aqui y seguir abierto en WordPress es una
    // sesion que el usuario cree cerrada.
    if (cfg && cfg.wp_logout_url) return res.redirect(cfg.wp_logout_url);
  } catch (e) { /* el cierre local ya ocurrio */ }
  return res.redirect(`/${slug}/login`);
});

module.exports = router;
module.exports.integracionPorSlug = integracionPorSlug;
module.exports.sequelize = sequelize;
