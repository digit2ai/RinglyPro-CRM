'use strict';

// =============================================================
// Ajustes de la integracion con WordPress — API de administracion.
//
// Montado en /:slug/api/integrations. Solo administradores de la camara.
//
// EL SECRETO EN CLARO SALE UNA SOLA VEZ, en la respuesta de generacion. Ningun
// endpoint de lectura lo devuelve: se devuelve una huella de 12 caracteres,
// suficiente para que un administrador confirme que los dos lados tienen el
// mismo, e insuficiente para reconstruirlo.
// =============================================================

const express = require('express');
const crypto = require('crypto');
const { sequelize, QueryTypes, authMiddleware } = require('./lib/shared');
const secretos = require('../../services/tenantSecrets');
const wp = require('../../services/wpIdentity');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);
router.use((req, res, next) => {
  const nivel = String((req.member && req.member.access_level) || '').toLowerCase();
  if (!['superadmin', 'admin_global', 'admin_regional'].includes(nivel)) {
    return res.status(403).json({ success: false,
      error: 'Solo los administradores de la camara pueden configurar la integracion.' });
  }
  next();
});

async function fila(chamberId) {
  const [f] = await sequelize.query(
    "SELECT * FROM cv_tenant_integrations WHERE chamber_id = :c AND provider = 'wordpress'",
    { replacements: { c: chamberId }, type: QueryTypes.SELECT });
  return f || null;
}

/** Proyeccion publica: nunca el secreto, solo su huella. */
function publica(f, slug) {
  if (!f) return null;
  return {
    id: f.id, tenant_slug: f.tenant_slug, provider: f.provider,
    sso_enabled: f.sso_enabled, webhook_enabled: f.webhook_enabled,
    auto_provision: f.auto_provision, direct_login_enabled: f.direct_login_enabled,
    wp_base_url: f.wp_base_url, wp_issuer: f.wp_issuer, wp_logout_url: f.wp_logout_url,
    jwt_algorithm: f.jwt_algorithm, max_token_ttl_sec: f.max_token_ttl_sec,
    clock_tolerance_sec: f.clock_tolerance_sec, session_ttl_minutes: f.session_ttl_minutes,
    allowed_redirects: f.allowed_redirects, role_map: f.role_map, default_role: f.default_role,
    last_sso_at: f.last_sso_at, last_webhook_at: f.last_webhook_at,
    secret_rotated_at: f.secret_rotated_at,
    secreto: {
      configurado: Boolean(f.shared_secret_enc),
      huella: secretos.huella(f.shared_secret_enc),
      anterior_activo: Boolean(f.shared_secret_prev_enc),
      huella_anterior: secretos.huella(f.shared_secret_prev_enc),
    },
    urls: {
      sso: `https://www.camaravirtual.app/${slug}/auth/wp?token=<JWT>&redirect=/${slug}/dashboard/`,
      webhook: 'https://www.camaravirtual.app/api/v1/webhooks/wordpress/users',
      logout: `https://www.camaravirtual.app/${slug}/auth/logout`,
    },
  };
}

router.get('/', async (req, res) => {
  const f = await fila(req.chamber_id);
  res.json({ success: true, data: publica(f, req.chamber.slug),
    nota: f ? null : 'Esta camara todavia no tiene integracion. Genera un secreto para crearla.' });
});

const EDITABLES = ['sso_enabled', 'webhook_enabled', 'auto_provision', 'wp_base_url',
  'wp_issuer', 'wp_logout_url', 'max_token_ttl_sec', 'clock_tolerance_sec',
  'session_ttl_minutes', 'allowed_redirects', 'role_map', 'default_role'];

router.put('/', async (req, res) => {
  try {
    const f = await fila(req.chamber_id);
    if (!f) return res.status(404).json({ success: false,
      error: 'No hay integracion. Genera primero un secreto.' });

    const b = req.body || {};
    const sets = [], rep = { id: f.id };
    for (const campo of EDITABLES) {
      if (b[campo] === undefined) continue;
      // direct_login_enabled NO esta en la lista: la decision de no
      // implementar el relevo de contrasena no se cambia desde una interfaz.
      if (campo === 'allowed_redirects' || campo === 'role_map') {
        sets.push(`${campo} = CAST(:${campo} AS jsonb)`);
        rep[campo] = JSON.stringify(b[campo]);
      } else {
        sets.push(`${campo} = :${campo}`);
        rep[campo] = b[campo];
      }
    }
    if (!sets.length) return res.status(400).json({ success: false, error: 'Nada que actualizar.' });

    sets.push('updated_at = NOW()');
    await sequelize.query(
      `UPDATE cv_tenant_integrations SET ${sets.join(', ')} WHERE id = :id`,
      { replacements: rep, type: QueryTypes.UPDATE });
    res.json({ success: true, data: publica(await fila(req.chamber_id), req.chamber.slug) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/**
 * Genera (o rota) el secreto. UNICO sitio donde sale en claro.
 * Al rotar, el anterior se conserva para no cortar los tokens en vuelo.
 */
router.post('/secret', async (req, res) => {
  try {
    const nuevo = secretos.generar();
    const cifrado = secretos.encrypt(nuevo);
    if (secretos.decrypt(cifrado) !== nuevo) {
      return res.status(500).json({ success: false,
        error: 'El cifrado no es reversible. Revisa APP_ENCRYPTION_KEY antes de continuar.' });
    }
    const f = await fila(req.chamber_id);
    if (f) {
      await sequelize.query(
        `UPDATE cv_tenant_integrations
            SET shared_secret_prev_enc = shared_secret_enc, shared_secret_enc = :s,
                secret_rotated_at = NOW(), updated_at = NOW() WHERE id = :id`,
        { replacements: { s: cifrado, id: f.id }, type: QueryTypes.UPDATE });
    } else {
      await sequelize.query(
        `INSERT INTO cv_tenant_integrations (chamber_id, tenant_slug, provider, shared_secret_enc)
         VALUES (:c, :s, 'wordpress', :sec)`,
        { replacements: { c: req.chamber_id, s: req.chamber.slug, sec: cifrado },
          type: QueryTypes.INSERT });
    }
    res.json({ success: true, data: {
      secreto: nuevo,
      rotado: Boolean(f),
      aviso: 'Copialo ahora. No se volvera a mostrar. Solo veras una huella.',
      anterior_activo: Boolean(f),
      nota_rotacion: f
        ? 'El secreto anterior sigue validando hasta que pulses "Retirar el anterior". '
        + 'Despliega el nuevo en WordPress antes de retirarlo.' : null,
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/** Retira el secreto anterior. Se hace cuando el socio confirma el despliegue. */
router.delete('/secret/previous', async (req, res) => {
  const f = await fila(req.chamber_id);
  if (!f) return res.status(404).json({ success: false, error: 'No hay integracion.' });
  await sequelize.query(
    'UPDATE cv_tenant_integrations SET shared_secret_prev_enc = NULL, updated_at = NOW() WHERE id = :id',
    { replacements: { id: f.id }, type: QueryTypes.UPDATE });
  res.json({ success: true, data: { retirado: true,
    nota: 'Los tokens firmados con el secreto anterior ya no validan.' } });
});

/**
 * Webhook de prueba: se firma y se procesa por el mismo camino que uno real,
 * pero con un wp_user_id sintetico. Sirve para comprobar que el secreto y la
 * firma coinciden antes de que el socio conecte usuarios de verdad.
 */
router.post('/test-webhook', async (req, res) => {
  try {
    const f = await fila(req.chamber_id);
    if (!f) return res.status(404).json({ success: false, error: 'No hay integracion.' });
    const secreto = secretos.decrypt(f.shared_secret_enc);
    if (!secreto) return res.status(500).json({ success: false,
      error: 'El secreto guardado no se puede descifrar. Genera uno nuevo.' });

    const cuerpo = JSON.stringify({ event: 'user.updated', occurred_at: new Date().toISOString(),
      user: { wp_user_id: 0, email: 'prueba@example.invalid', user_login: 'prueba',
              display_name: 'Prueba de integracion', roles: ['subscriber'], status: 'active' } });
    const ts = Math.floor(Date.now() / 1000);
    const v = wp.verificarWebhook(f, { timestamp: ts, rawBody: cuerpo,
      firma: wp.firmaWebhook(secreto, ts, cuerpo) });

    res.json({ success: true, data: {
      firma_verifica: v.ok, secreto_usado: v.secreto_usado || null, error: v.error || null,
      // wp_user_id 0 a proposito: comprueba el camino de la firma sin crear
      // ningun miembro real en el directorio.
      nota: v.ok
        ? 'La firma se genera y se verifica correctamente con el secreto guardado. '
        + 'No se ha creado ningun usuario: la prueba usa wp_user_id 0.'
        : 'La firma NO verifica. Revisa APP_ENCRYPTION_KEY o vuelve a generar el secreto.',
      cabeceras_esperadas: ['X-CV-Tenant', 'X-CV-Event', 'X-CV-Delivery', 'X-CV-Timestamp', 'X-CV-Signature'],
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/** Registro de entregas: las 50 ultimas. */
router.get('/deliveries', async (req, res) => {
  const filas = await sequelize.query(
    `SELECT id, delivery_id, event, wp_user_id, status_code, action, error, received_at
       FROM cv_webhook_deliveries WHERE chamber_id = :c ORDER BY id DESC LIMIT 50`,
    { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT });
  res.json({ success: true, data: filas });
});

/**
 * Enlazar cuentas locales existentes — SOLO INFORME, no escribe.
 * El brief lo pide como stub a proposito: emparejar por correo y escribir sin
 * revisar es como se fusionan dos personas distintas que compartieron un alias.
 */
router.post('/link-existing', async (req, res) => {
  const filas = await sequelize.query(
    `SELECT id, email, first_name, last_name, wp_user_id, identity_provider, status
       FROM members WHERE chamber_id = :c ORDER BY email`,
    { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT });
  const yaEnlazados = filas.filter((m) => m.wp_user_id != null);
  const sinEnlazar = filas.filter((m) => m.wp_user_id == null);
  const porCorreo = {};
  filas.forEach((m) => { const e = String(m.email || '').toLowerCase();
    (porCorreo[e] = porCorreo[e] || []).push(m.id); });
  const colisiones = Object.entries(porCorreo).filter(([, ids]) => ids.length > 1)
    .map(([email, ids]) => ({ email, member_ids: ids }));

  res.json({ success: true, data: {
    total: filas.length, ya_enlazados: yaEnlazados.length, sin_enlazar: sinEnlazar.length,
    colisiones_por_correo: colisiones,
    escrito: false,
    nota: 'Informe unicamente: no se ha modificado ninguna fila. El enlace real de las '
        + 'cuentas con contrasena local es una tarea aparte, porque emparejar por correo y '
        + 'escribir sin revisar es como se fusionan dos personas distintas.',
  }});
});

module.exports = router;
