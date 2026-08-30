'use strict';

// =============================================================
// WordPress como proveedor de identidad — verificacion y sincronizacion.
//
// Compartido por los dos canales: el handoff SSO y el webhook de
// aprovisionamiento. Que ambos pasen por el mismo mapeo de roles y el mismo
// upsert es lo que evita que un usuario tenga un rol distinto segun por donde
// entro la ultima actualizacion.
//
// LA CLAVE DE UNION ES wp_user_id (el claim `sub`), NO EL EMAIL.
// El SSO que ya existia emparejaba por correo: si alguien cambia su email en
// WordPress deja de ser reconocido y se crea un miembro nuevo, con su historial
// perdido. El identificador de WordPress no cambia nunca.
// =============================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const secretos = require('./tenantSecrets');

// Jerarquia: si un usuario llega con varios roles de WordPress, gana el mayor.
// Un rol NO mapeado nunca escala — cae a default_role.
const JERARQUIA = { chamber_admin: 4, chamber_staff: 3, empresario: 2, member: 1 };

// El rol de plataforma se traduce al access_level que ya entiende la camara.
const A_ACCESS_LEVEL = {
  chamber_admin: 'admin_global',
  chamber_staff: 'admin_regional',
  empresario: 'member',
  member: 'member',
};

function mapearRoles(rolesWp, cfg) {
  const mapa = (cfg && cfg.role_map) || {};
  const porDefecto = (cfg && cfg.default_role) || 'member';
  const lista = Array.isArray(rolesWp) ? rolesWp : (rolesWp ? [rolesWp] : []);

  let mejor = porDefecto, sinMapear = [];
  for (const r of lista) {
    const destino = mapa[String(r)];
    if (!destino) { sinMapear.push(String(r)); continue; }
    if ((JERARQUIA[destino] || 0) > (JERARQUIA[mejor] || 0)) mejor = destino;
  }
  return {
    rol: mejor,
    access_level: A_ACCESS_LEVEL[mejor] || 'member',
    sin_mapear: sinMapear,
    // Un rol desconocido se REPORTA. Silenciarlo es como se descubre tarde que
    // media camara entro como 'member' porque nadie mapeo 'cv_socio'.
    nota: sinMapear.length
      ? `Roles de WordPress sin mapear (tratados como ${porDefecto}): ${sinMapear.join(', ')}`
      : null,
  };
}

/**
 * Verifica el JWT del handoff.
 *
 * Cada comprobacion esta aqui porque su ausencia es una via de entrada:
 *  - algorithms explicito: sin el, un token con alg:none o alg:RS256 y la clave
 *    publica como HMAC pasa la firma.
 *  - exp - iat contra la politica: una firma valida con caducidad de un ano es
 *    una credencial permanente. La firma dice quien lo emitio, no cuanto vale.
 *  - aud contra el slug: sin el, un token legitimo de cv-106 abre cv-105.
 *  - jti: el replay se corta en base de datos (ver consumirJti), no aqui.
 */
function verificarToken(token, cfg, slug) {
  if (!token) return { ok: false, error: 'falta el token' };

  const permitidos = [String((cfg && cfg.jwt_algorithm) || 'HS256')];
  const tolerancia = Number((cfg && cfg.clock_tolerance_sec) || 60);
  const ttlMax = Number((cfg && cfg.max_token_ttl_sec) || 120);

  for (const cand of secretos.candidatos(cfg)) {
    let payload;
    try {
      payload = jwt.verify(token, cand.secreto, {
        algorithms: permitidos,          // lista blanca explicita, nunca la del header
        audience: slug,
        clockTolerance: tolerancia,
        issuer: cfg.wp_issuer || undefined,
      });
    } catch (e) {
      continue;                          // prueba el secreto siguiente
    }

    // Firma valida. Ahora la POLITICA, que la firma no cubre.
    if (!payload.jti) return { ok: false, error: 'el token no lleva jti: no se puede impedir la reutilizacion' };
    if (!payload.sub) return { ok: false, error: 'el token no lleva sub (wp_user_id)' };
    if (!payload.iat || !payload.exp) return { ok: false, error: 'el token no lleva iat/exp' };

    const vida = Number(payload.exp) - Number(payload.iat);
    if (vida > ttlMax) {
      return { ok: false,
        error: `la vigencia del token (${vida}s) supera la politica del tenant (${ttlMax}s)` };
    }
    return { ok: true, payload, secreto_usado: cand.cual };
  }
  return { ok: false, error: 'firma no valida o token caducado' };
}

/**
 * Consume el jti. Devuelve false si ya se habia usado.
 * El unico arbitro es el indice primario: dos instancias que reciban el mismo
 * token a la vez no pueden ganar las dos.
 */
async function consumirJti(sequelize, QueryTypes, { jti, chamberId, wpUserId, exp }) {
  try {
    await sequelize.query(
      `INSERT INTO cv_sso_used_tokens (jti, chamber_id, wp_user_id, expires_at)
       VALUES (:jti, :c, :u, to_timestamp(:exp))`,
      { replacements: { jti: String(jti).slice(0, 64), c: chamberId,
                        u: wpUserId || null, exp: Number(exp) }, type: QueryTypes.INSERT });
    return true;
  } catch (e) {
    return false;                        // clave duplicada = ya usado
  }
}

/** HMAC del webhook sobre `${timestamp}.${rawBody}` — el cuerpo SIN tocar. */
function firmaWebhook(secreto, timestamp, rawBody) {
  return crypto.createHmac('sha256', secreto)
    .update(`${timestamp}.${rawBody}`).digest('hex');
}

function verificarWebhook(cfg, { timestamp, rawBody, firma, ventanaSeg = 300 }) {
  if (!timestamp || !firma) return { ok: false, error: 'faltan cabeceras de firma' };
  const ahora = Math.floor(Date.now() / 1000);
  const t = Number(timestamp);
  if (!Number.isFinite(t)) return { ok: false, error: 'timestamp no numerico' };
  if (Math.abs(ahora - t) > ventanaSeg) {
    return { ok: false, error: `timestamp fuera de la ventana de ${ventanaSeg}s` };
  }
  const limpia = String(firma).replace(/^sha256=/, '');
  for (const cand of secretos.candidatos(cfg)) {
    if (secretos.igualSeguro(firmaWebhook(cand.secreto, timestamp, rawBody), limpia)) {
      return { ok: true, secreto_usado: cand.cual };
    }
  }
  return { ok: false, error: 'firma no valida' };
}

/**
 * Destino tras el login. Relativo, sin '//', y dentro de la lista del tenant.
 * Cualquier otra cosa cae al inicio de la camara: un redirect abierto aqui
 * filtraria la sesion recien creada a otro dominio.
 */
function destinoSeguro(pedido, cfg, slug) {
  const casa = `/${slug}/dashboard/`;
  const d = String(pedido || '');
  if (!d.startsWith('/') || d.startsWith('//')) return casa;
  const permitidos = Array.isArray(cfg && cfg.allowed_redirects) ? cfg.allowed_redirects : ['/'];
  const ok = permitidos.some((p) => {
    const pref = String(p);
    return pref === '/' ? true : d === pref || d.startsWith(pref.replace(/\/$/, '') + '/');
  });
  return ok ? d : casa;
}

/**
 * Crea o actualiza el miembro. Un solo camino para los dos canales.
 * Empareja por (chamber_id, wp_user_id); si no existe, por email, y entonces
 * ADOPTA la fila enlazandola — asi un miembro que ya existia con contrasena
 * local no se duplica al entrar por primera vez desde WordPress.
 */
async function upsertMiembro(sequelize, QueryTypes, { chamberId, cfg, datos }) {
  const wpId = Number(datos.wp_user_id);
  const email = String(datos.email || '').trim().toLowerCase();
  const roles = mapearRoles(datos.roles, cfg);

  let [fila] = await sequelize.query(
    'SELECT * FROM members WHERE chamber_id = :c AND wp_user_id = :w',
    { replacements: { c: chamberId, w: wpId }, type: QueryTypes.SELECT });

  let accion = 'actualizado';
  if (!fila && email) {
    [fila] = await sequelize.query(
      'SELECT * FROM members WHERE chamber_id = :c AND LOWER(email) = :e',
      { replacements: { c: chamberId, e: email }, type: QueryTypes.SELECT });
    if (fila) accion = 'enlazado';
  }

  if (!fila) {
    if (!cfg.auto_provision) {
      return { ok: false, accion: 'omitido',
        error: 'auto_provision esta desactivado: el usuario debe existir antes del primer acceso. '
             + 'Enviad el webhook user.created desde WordPress.' };
    }
    // Contrasena inutilizable: en esta camara WordPress es el sistema de
    // registro y aqui no se guarda ninguna credencial.
    const inutilizable = 'wp!' + crypto.randomBytes(24).toString('hex');
    const [nuevo] = await sequelize.query(
      `INSERT INTO members (chamber_id, email, password_hash, first_name, last_name,
                            phone, company_name, access_level, status,
                            wp_user_id, identity_provider, wp_user_login, wp_roles, wp_synced_at,
                            created_at, updated_at)
       VALUES (:c,:e,:p,:fn,:ln,:tel,:emp,:al,:st,:w,'wordpress',:login,CAST(:roles AS jsonb),NOW(),NOW(),NOW())
       RETURNING *`,
      { replacements: { c: chamberId, e: email, p: inutilizable,
          fn: datos.first_name || (datos.display_name || '').split(' ')[0] || null,
          ln: datos.last_name || (datos.display_name || '').split(' ').slice(1).join(' ') || null,
          tel: datos.phone || null, emp: (datos.company && datos.company.name) || null,
          al: roles.access_level, st: datos.status === 'inactive' ? 'inactive' : 'active',
          w: wpId, login: datos.user_login || null,
          roles: JSON.stringify(Array.isArray(datos.roles) ? datos.roles : []) },
        type: QueryTypes.SELECT });
    return { ok: true, accion: 'creado', member: nuevo, roles };
  }

  const [act] = await sequelize.query(
    `UPDATE members SET
        email = COALESCE(:e, email),
        first_name = COALESCE(:fn, first_name),
        last_name  = COALESCE(:ln, last_name),
        phone      = COALESCE(:tel, phone),
        company_name = COALESCE(:emp, company_name),
        access_level = :al,
        status = :st,
        wp_user_id = :w,
        identity_provider = 'wordpress',
        wp_user_login = COALESCE(:login, wp_user_login),
        wp_roles = CAST(:roles AS jsonb),
        wp_synced_at = NOW(),
        updated_at = NOW()
      WHERE id = :id AND chamber_id = :c
      RETURNING *`,
    { replacements: { e: email || null,
        fn: datos.first_name || null, ln: datos.last_name || null,
        tel: datos.phone || null, emp: (datos.company && datos.company.name) || null,
        al: roles.access_level, st: datos.status === 'inactive' ? 'inactive' : 'active',
        w: wpId, login: datos.user_login || null,
        roles: JSON.stringify(Array.isArray(datos.roles) ? datos.roles : []),
        id: fila.id, c: chamberId },
      type: QueryTypes.SELECT });
  return { ok: true, accion, member: act, roles };
}

module.exports = {
  verificarToken, consumirJti, verificarWebhook, firmaWebhook,
  destinoSeguro, mapearRoles, upsertMiembro, JERARQUIA, A_ACCESS_LEVEL,
};
