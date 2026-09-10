'use strict';

// =============================================================
// Secretos compartidos por tenant — cifrado en reposo y rotacion.
//
// NO VIVEN EN VARIABLES DE ENTORNO, A PROPOSITO.
// Una variable por camara no escala y obliga a un redespliegue por cada alta.
// Viven cifrados en cv_tenant_integrations, y la clave que los cifra
// (APP_ENCRYPTION_KEY) es la unica que esta en el entorno.
//
// ROTACION SIN CORTE: al generar un secreto nuevo, el anterior pasa a
// shared_secret_prev_enc. La verificacion prueba el actual y luego el anterior,
// de modo que los tokens ya emitidos por WordPress siguen validando mientras el
// socio despliega la clave nueva. Sin esto, rotar es una caida.
// =============================================================

const crypto = require('crypto');

// Se reutiliza CHAMBER_WP_SECRET si existe para no invalidar lo ya cifrado por
// chamberWpSync.js, que usa la misma familia de claves.
function keyMaterial() {
  const raw = process.env.APP_ENCRYPTION_KEY
    || process.env.CHAMBER_WP_SECRET
    || process.env.CHAMBER_JWT_SECRET
    || process.env.JWT_SECRET;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY no esta configurada');
  // Acepta 32 bytes en hex o cualquier cadena, derivando siempre 32 bytes.
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

/** base64(iv).base64(authTag).base64(ciphertext) */
function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

function decrypt(blob) {
  if (!blob) return null;
  try {
    const [ivB, tagB, ctB] = String(blob).split('.');
    if (!ivB || !tagB || !ctB) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(ivB, 'base64'));
    d.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ctB, 'base64')), d.final()]).toString('utf8');
  } catch (e) {
    // Una clave rotada deja el valor indescifrable. Se REPORTA como null y el
    // llamante lo trata como "no configurado"; nunca se lanza hacia una ruta.
    return null;
  }
}

/** Secreto nuevo. 32 bytes, hex: lo que espera el lado WordPress. */
function generar() { return crypto.randomBytes(32).toString('hex'); }

/**
 * Huella para mostrar en la interfaz. NUNCA el secreto.
 * Basta para que un administrador confirme que los dos lados tienen el mismo,
 * y no basta para reconstruirlo.
 */
function huella(blob) {
  const s = decrypt(blob);
  if (!s) return null;
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

/** Comparacion en tiempo constante, con comprobacion de longitud previa. */
function igualSeguro(a, b) {
  const A = Buffer.from(String(a || ''), 'utf8');
  const B = Buffer.from(String(b || ''), 'utf8');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/** Los secretos a probar en verificacion: el actual y, si existe, el anterior. */
function candidatos(fila) {
  const out = [];
  const actual = decrypt(fila && fila.shared_secret_enc);
  if (actual) out.push({ secreto: actual, cual: 'actual' });
  const previo = decrypt(fila && fila.shared_secret_prev_enc);
  if (previo) out.push({ secreto: previo, cual: 'anterior' });
  return out;
}

module.exports = { encrypt, decrypt, generar, huella, igualSeguro, candidatos, keyMaterial };
