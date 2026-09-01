/**
 * ENRUTA - Puerta de acceso (opcional, se activa por variable de entorno)
 *
 * El módulo nació sin autenticación de ningún tipo: el tablero y toda la API
 * (cédulas, teléfonos, comparendos, multas) respondían a cualquiera que
 * conociera la URL. Aquí está la puerta.
 *
 * ESTÁ APAGADA MIENTRAS NO EXISTA `ENRUTA_PASSWORD`. Encenderla es poner esa
 * variable en Render: no hay que tocar código y no cambia nada hasta entonces,
 * para no tumbar una demostración en curso.
 *
 * Las rutas /voice/* las llama ElevenLabs de servidor a servidor y no pueden
 * llevar cookie: se autentican con `ENRUTA_TOOLS_KEY`. Si la puerta está
 * encendida pero esa clave no está configurada, /voice/* queda abierta y el
 * arranque lo dice en voz alta — antes que cortar una llamada en vivo.
 */
const crypto = require('crypto');

const COOKIE = 'enruta_token';
const VIGENCIA_MS = 12 * 60 * 60 * 1000; // 12 h

function clave() {
  return process.env.ENRUTA_PASSWORD || null;
}

function secreto() {
  return process.env.ENRUTA_JWT_SECRET || process.env.JWT_SECRET || 'enruta-dev-inseguro';
}

function protegido() {
  return !!clave();
}

function iguales(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function firmar(expiraEn = Date.now() + VIGENCIA_MS) {
  const cuerpo = Buffer.from(JSON.stringify({ exp: expiraEn })).toString('base64url');
  const firma = crypto.createHmac('sha256', secreto()).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

function verificar(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [cuerpo, firma] = token.split('.');
  const esperada = crypto.createHmac('sha256', secreto()).update(cuerpo).digest('base64url');
  if (firma.length !== esperada.length || !iguales(firma, esperada)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

function leerCookie(req) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

function claveHerramientas() {
  return process.env.ENRUTA_TOOLS_KEY || process.env.ENRUTA_ADMIN_KEY || null;
}

/** Rutas que nunca pasan por la puerta. */
function exenta(ruta) {
  return ruta === '/health'
    || ruta === '/login'
    || ruta.startsWith('/static')
    || ruta.startsWith('/api/auth/');
}

function puerta(req, res, next) {
  if (!protegido()) return next();
  if (exenta(req.path)) return next();

  if (verificar(leerCookie(req))) return next();

  // Endpoints máquina de Laura: clave de herramientas en vez de cookie.
  if (req.path.startsWith('/voice')) {
    const esperada = claveHerramientas();
    if (!esperada) return next(); // sin clave configurada, no se corta la voz
    const enviada = req.get('x-enruta-tools-key');
    if (enviada && iguales(enviada, esperada)) return next();
    return res.status(401).json({ success: false, error: 'No autorizado' });
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'No autorizado' });
  }
  return res.redirect('/enruta/login');
}

function montarRutas(app) {
  app.get('/login', (req, res) => {
    if (!protegido()) return res.redirect('/enruta/');
    res.type('html').send(paginaLogin());
  });

  app.post('/api/auth/login', (req, res) => {
    if (!protegido()) return res.json({ success: true, protegido: false });
    const enviada = req.body && req.body.password;
    if (!enviada || !iguales(enviada, clave())) {
      return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }
    res.cookie(COOKIE, firmar(), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: VIGENCIA_MS,
      path: '/enruta'
    });
    res.json({ success: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/enruta' });
    res.json({ success: true });
  });
}

function paginaLogin() {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>ENRUTA - Ingreso</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%)}
  form{background:#fff;padding:2rem;border-radius:1rem;width:min(340px,90vw);
       box-shadow:0 10px 30px rgba(0,0,0,.25)}
  h1{margin:0 0 .25rem;font-size:1.25rem;color:#1e3a8a}
  p{margin:0 0 1.25rem;color:#64748b;font-size:.85rem}
  input{width:100%;box-sizing:border-box;padding:.7rem;font-size:16px;
        border:1px solid #cbd5e1;border-radius:.5rem;margin-bottom:.75rem}
  button{width:100%;padding:.7rem;font-size:1rem;border:0;border-radius:.5rem;
         background:#1e3a8a;color:#fff;cursor:pointer}
  .err{color:#dc2626;font-size:.85rem;min-height:1.2em;margin-top:.5rem}
</style></head><body>
<form id="f">
  <h1>ENRUTA</h1>
  <p>Gestión documental vehicular</p>
  <input id="p" type="password" placeholder="Contraseña" autocomplete="current-password" autofocus>
  <button type="submit">Ingresar</button>
  <div class="err" id="e"></div>
</form>
<script>
document.getElementById('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const e = document.getElementById('e');
  e.textContent = '';
  const r = await fetch('/enruta/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('p').value })
  });
  if (r.ok) location.href = '/enruta/';
  else e.textContent = 'Contraseña incorrecta';
});
</script></body></html>`;
}

module.exports = { puerta, montarRutas, protegido, claveHerramientas, COOKIE };
