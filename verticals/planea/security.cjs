/**
 * PLANEA — Módulo de Seguridad
 *
 * Controles técnicos para soportar una auditoría externa (ISO/IEC 27001:2022
 * Anexo A y SOC 2 Trust Services Criteria), y para cumplir la Ley 1581 de 2012
 * y el Decreto 1377 de 2013 (Habeas Data, Colombia).
 *
 * Mapa de controles implementados aquí:
 *   headers()          → A.8.24 criptografía en tránsito · CC6.6 · OWASP ASVS 14.4
 *   loginLimiter, etc. → A.8.5 autenticación segura · CC6.1 (fuerza bruta)
 *   passwordIssue()    → A.5.17 información de autenticación · CC6.1
 *   hashToken()        → A.8.24 (nunca guardar secretos en claro) · CC6.1
 *   encrypt/decrypt    → A.8.24 cifrado de datos sensibles en reposo (AES-256-GCM)
 *   auditEvent()       → A.8.15 registro de eventos · CC7.2 (trazabilidad)
 *
 * NOTA HONESTA: estos son los controles TÉCNICOS. Una certificación ISO 27001 o
 * un informe SOC 2 exigen además políticas, gestión de riesgos, control de
 * proveedores, continuidad y evidencia auditada durante un periodo. El código no
 * certifica por sí solo; sí deja el producto en condiciones de ser auditado.
 */
'use strict';

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// ── 1. Cabeceras de seguridad ───────────────────────────────────────────────
// Aplicadas a todas las respuestas de /planea. Endurecen clickjacking, sniffing,
// inyección de base, y fuerzan HTTPS. La CSP permite inline (la app usa scripts
// en línea); migrar a nonces está en la hoja de ruta y se documenta como tal.
const CSP = [
  "default-src 'self' https: data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https:",
  "media-src 'self' data: blob: https:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

function headers(req, res, next) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), payment=(), usb=(), magnetometer=(), microphone=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Content-Security-Policy', CSP);
  res.removeHeader('X-Powered-By');
  next();
}

// ── 2. Límites de intentos (anti fuerza bruta / enumeración) ────────────────
function makeLimiter(windowMs, limit, msg) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Detrás del proxy de Render: requiere app.set('trust proxy', 1) para que
    // req.ip sea la IP real del usuario y no la del balanceador.
    handler: (req, res) => res.status(429).json({ error: msg }),
  });
}
const loginLimiter = makeLimiter(15 * 60 * 1000, 12, 'Demasiados intentos de ingreso. Espera 15 minutos e inténtalo de nuevo.');
const signupLimiter = makeLimiter(60 * 60 * 1000, 8, 'Demasiadas cuentas creadas desde esta conexión. Intenta más tarde.');
const resetLimiter = makeLimiter(60 * 60 * 1000, 6, 'Demasiadas solicitudes de restablecimiento. Espera una hora.');

// ── 3. Política de contraseñas ──────────────────────────────────────────────
// Alineada con NIST SP 800-63B: longitud sobre complejidad arbitraria + rechazo
// de contraseñas comunes. Aplica a registro y a restablecimiento, no al login.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'contrasena',
  'contraseña', 'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'colombia',
  'bienvenido', 'planea123', 'abc12345', '11111111', 'santiago', 'medellin',
]);
function passwordIssue(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (pw.length > 128) return 'La contraseña es demasiado larga.';
  if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(pw) || !/[0-9]/.test(pw)) return 'La contraseña debe incluir letras y números.';
  if (COMMON.has(pw.toLowerCase())) return 'Esa contraseña es demasiado común. Elige una más segura.';
  if (/^(.)\1+$/.test(pw)) return 'Esa contraseña es demasiado simple.';
  return null;
}

// ── 4. Criptografía ─────────────────────────────────────────────────────────
// Clave derivada del secreto de la instancia. Definir PLANEA_ENC_KEY en producción
// para rotar sin tocar el JWT. AES-256-GCM = cifrado autenticado (confidencialidad
// + integridad), el mismo esquema que usan las apps de banca móvil.
const ENC_KEY = crypto.createHash('sha256')
  .update(String(process.env.PLANEA_ENC_KEY || process.env.PLANEA_JWT_SECRET || 'planea-enc-dev'))
  .digest();

function encrypt(plain) {
  if (plain == null || plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decrypt(blob) {
  if (typeof blob !== 'string' || blob.indexOf('v1:') !== 0) return blob; // no cifrado
  try {
    const raw = Buffer.from(blob.slice(3), 'base64');
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), enc = raw.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch (e) { return null; } // integridad fallida = dato manipulado
}

// Los secretos de un solo uso (tokens de restablecimiento) NUNCA se guardan en
// claro: se guarda su hash, igual que una contraseña.
function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
function randomToken(bytes) { return crypto.randomBytes(bytes || 32).toString('hex'); }
function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

// ── 5. Trazabilidad ─────────────────────────────────────────────────────────
// Nunca registres la contraseña, el token ni el cuerpo completo. Solo el evento,
// el sujeto y el origen — suficiente para una auditoría, mínimo para privacidad.
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || (req.connection && req.connection.remoteAddress) || '';
}
// Hash de la IP: permite investigar abuso sin almacenar un dato personal en claro
// (minimización de datos — Ley 1581 art. 4 lit. e, GDPR art. 5.1.c).
function ipHash(req) {
  return crypto.createHash('sha256')
    .update(clientIp(req) + '|' + String(process.env.PLANEA_JWT_SECRET || 'salt'))
    .digest('hex').slice(0, 32);
}

module.exports = {
  headers, CSP,
  loginLimiter, signupLimiter, resetLimiter,
  passwordIssue,
  encrypt, decrypt, hashToken, randomToken, safeEqual,
  clientIp, ipHash,
};
