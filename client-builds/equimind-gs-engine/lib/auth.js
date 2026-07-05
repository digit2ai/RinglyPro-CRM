// =====================================================
// Multi-tenant JWT auth — reuses the EquiMind account system (ecpf_users), the
// same identity used across Paso Fino + Jump Coach. Token arrives via
// Authorization: Bearer, cookie ecpf_token, or ?token= (panel embed token).
// req.tenantId / req.account are set. NO endpoint mounts without requireAccount.
// =====================================================
'use strict';

const jwt = require('jsonwebtoken');
const account = require('../../evaluacion-del-caballo-de-paso-fino/models/account');

const SECRET = process.env.ECPF_JWT_SECRET || process.env.JWT_SECRET || 'ecpf-dev-secret';

function getToken(req) {
  const h = req.headers['authorization'] || '';
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  if (req.query && req.query.token) return String(req.query.token);
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)ecpf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function resolve(req) {
  const token = getToken(req);
  if (!token) return null;
  let dec;
  try { dec = jwt.verify(token, SECRET); } catch (e) { return null; }
  const uid = dec.uid != null ? dec.uid : (dec.user_id != null ? dec.user_id : dec.id);
  if (uid == null) return null;
  let u = null;
  try { u = await account.findById(uid); } catch (e) { /* ignore */ }
  if (!u) return null;
  return { user: u, jwt: dec };
}

async function requireAccount(req, res, next) {
  const r = await resolve(req);
  if (!r) return res.status(401).json({ error: 'Inicia sesión en EquiMind para usar el motor 3D.', code: 'NO_ACCOUNT' });
  req.account = r.user; req.tenantId = r.user.id; req.jwt = r.jwt;
  next();
}

// Public read gated by the scene share token (validated in the route), no account.
async function optionalAccount(req, res, next) {
  const r = await resolve(req);
  if (r) { req.account = r.user; req.tenantId = r.user.id; req.jwt = r.jwt; }
  next();
}

module.exports = { requireAccount, optionalAccount, getToken, account };
