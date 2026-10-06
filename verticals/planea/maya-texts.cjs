/* PLANEA — Maya escribe los textos de las pantallas (anotaciones de Planea, 2-oct-2026).
 *
 * QUÉ RESUELVE. Los textos de Inicio, Puntaje Planea, el aviso de Mis metas y el saludo
 * del chat se leen como mensajes de Maya, pero estaban escritos en el código del
 * navegador: entrenar a Maya no los cambiaba. Aquí los redacta Maya con la MISMA
 * instrucción del chat más todo lo que el equipo de Planea le enseñó (reglas y
 * documentos), así que una corrección en "Entrenar a Maya" llega también a la pantalla.
 *
 * LO QUE EL MODELO NO PUEDE HACER (se revisa en CÓDIGO, no se le pide por favor):
 *  - EL MODELO ESCRIBE PALABRAS, NUNCA UN DATO. El puntaje, el rango y el área
 *    prioritaria salen de la ficha de hechos, que arma el servidor desde la sesión.
 *  - UN NÚMERO SOLO PASA SI ESTÁ EN LA FICHA O EN EL ENTRENAMIENTO DE PLANEA. Un número
 *    que no viene de ninguno de los dos descarta ese texto.
 *  - CADA TEXTO SE REVISA POR SEPARADO. El que falla vuelve al texto fijo de la app (el
 *    servidor devuelve null y la página conserva el suyo); los demás no se pierden.
 *  - SIN CLAVE DEL MODELO, CON EL INTERRUPTOR APAGADO O CON UNA FICHA INVÁLIDA, la app
 *    muestra los textos fijos. Nunca un texto vacío ni uno inventado.
 *
 * COSTO. Los textos se guardan por usuario y se reutilizan. Se reescriben solo cuando
 * cambia la ficha (tope diario) o cuando Planea cambia el entrenamiento (sin ese tope,
 * para que una corrección se vea el mismo día), y siempre bajo un techo duro por día.
 * La reescritura corre FUERA de la petición: la página nunca espera al modelo.
 *
 * No guarda conversaciones ni montos: la ficha lleva nombre, puntaje, rango y pilares.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PILARES = ['ahorro', 'flujo', 'deuda', 'retiro', 'seguros', 'inversion', 'impuestos', 'patrimonio'];
const PILAR_LABEL = { ahorro: 'Ahorro', flujo: 'Flujo de Caja', deuda: 'Deuda', retiro: 'Retiro / Pensión', seguros: 'Seguros', inversion: 'Inversión', impuestos: 'Impuestos', patrimonio: 'Patrimonio y Sucesión' };
// Palabras con las que un texto puede nombrar cada pilar (sin tildes, en minúscula).
const PILAR_ALIAS = {
  ahorro: ['ahorro', 'ahorros', 'ahorrar'], flujo: ['flujo de caja', 'flujo'], deuda: ['deuda', 'deudas'],
  retiro: ['retiro', 'pension'], seguros: ['seguros', 'seguro', 'proteccion'], inversion: ['inversion', 'inversiones', 'invertir'],
  impuestos: ['impuestos', 'tributari'], patrimonio: ['patrimonio', 'sucesion'],
};
// Rangos §7 del Documento Maestro: los mismos cortes que planea-motor.js y planea-data.js.
const RANGOS = [[35, 'Punto de partida'], [52, 'Construyendo'], [68, 'En camino'], [83, 'Sólido'], [100, 'Planeado']];
function rangoDe(s) { for (let i = 0; i < RANGOS.length; i++) if (s <= RANGOS[i][0]) return RANGOS[i][1]; return 'Planeado'; }

const BIENVENIDA = (n) => 'Hola' + (n ? ' ' + n : '') + ', soy Maya, tu agente de planeación financiera. ¿Cómo te puedo ayudar hoy?';

// Los textos que Maya redacta. `req` dice qué hecho DEBE nombrar el texto; `solo` limita
// qué pilares puede nombrar (un texto sobre la prioridad no puede señalar otra área).
const SLOTS = [
  { key: 'inicio_resumen', max: 140, donde: 'Inicio, la línea debajo de "Hola, {nombre}"', req: 'prioridad', solo: 'prioridad', ref: (f) => 'Hoy tu mayor palanca es ' + low(f.principal) + '.' },
  { key: 'inicio_rango', max: 90, donde: 'Inicio, tarjeta del puntaje (dice en qué rango está)', req: 'rango', ref: (f) => 'Estás en ' + f.rango + '.' },
  { key: 'inicio_rango_nota', max: 150, donde: 'Inicio, nota pequeña debajo del rango', ref: () => 'Base de la encuesta: cambiará según registres tus datos.' },
  { key: 'inicio_prioridad', max: 230, donde: 'Inicio, bloque "Lo más importante para ti" (el nombre del área ya va como título encima)', solo: 'prioridad', ref: () => 'Es el frente que más mueve tu Puntaje Planea hoy. Registra o revisa tu información en esta área.' },
  { key: 'puntaje_apertura', max: 270, donde: 'Puntaje Planea, lectura principal de "Hallazgos de Maya"', req: 'prioridad', solo: 'prioridad+secundario', ref: (f) => (f.nombre ? f.nombre + ', ' : '') + 'tu mayor palanca ahora es ' + tuyo(f.principal) + '. Es el frente que más mueve tu puntaje hoy; abajo tienes la lectura de cada área.' },
  { key: 'puntaje_empieza', max: 120, donde: 'Puntaje Planea, línea de orden debajo de la lectura principal', req: 'prioridad', solo: 'prioridad+secundario', ref: (f) => 'Empieza por ' + tuyo(f.principal).replace(/^tus? /, '') + (f.secundario ? ', y luego ' + tuyo(f.secundario).replace(/^tus? /, '') : '') + '.' },
].concat(PILARES.map((k) => ({ key: 'puntaje_pilar_' + k, max: 260, pilar: k, donde: 'Puntaje Planea, hallazgo de la tarjeta "' + PILAR_LABEL[k] + '"' })), [
  { key: 'metas_prioridad', max: 190, donde: 'Mis metas, aviso que invita a crear una meta en el área prioritaria', req: 'prioridad', solo: 'prioridad', ref: (f) => 'Tu prioridad es ' + PILAR_LABEL[f.principal] + '. Ponte una meta en esta área y Maya te acompaña.' },
  { key: 'chat_bienvenida', max: 230, donde: 'Chat, primer mensaje cada vez que el usuario abre el chat', req: 'bienvenida', ref: (f) => BIENVENIDA(f.nombre) },
]);
// Igual que la pantalla de Puntaje Planea («tu ahorro», «tu protección»).
const TUYO = { ahorro: 'tu ahorro', flujo: 'tu flujo de caja', deuda: 'tu deuda', retiro: 'tu retiro', seguros: 'tu protección', inversion: 'tu inversión', impuestos: 'tus impuestos', patrimonio: 'tu patrimonio' };
function tuyo(k) { return TUYO[k] || low(k); }
function low(k) { return (PILAR_LABEL[k] || k || '').toLowerCase(); }

// Hallazgos fijos por pilar, leídos del MISMO archivo que usa el navegador, para darle a
// Maya el texto actual como referencia. Si no se pueden leer, se redacta sin referencia.
let HALLAZGO = null;
function loadHallazgo() {
  if (HALLAZGO) return HALLAZGO;
  try {
    const src = fs.readFileSync(path.join(__dirname, 'portal', 'planea-diagnostico.js'), 'utf8');
    const a = src.indexOf('var HALLAZGO = {'); const b = src.indexOf('\n  };', a);
    if (a >= 0 && b > a) HALLAZGO = new Function('return ' + src.slice(a + 15, b + 4))();
  } catch (e) { HALLAZGO = null; }
  return HALLAZGO || {};
}
function band(v) { return v >= 70 ? 2 : v >= 45 ? 1 : 0; }

function fold(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
// Nombre de pila para saludar: letras, espacios, guiones y apóstrofos; nada más.
function safeFirstName(full) {
  const n = String(full || '').trim().split(/\s+/)[0] || '';
  return /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,40}$/.test(n) ? n : '';
}

// FICHA DE HECHOS. Sale del perfil guardado del usuario en sesión, nunca del cuerpo de la
// petición. El puntaje lo calcula el navegador y el servidor solo lo guarda: por eso aquí
// se RECHAZA todo lo que esté fuera de rango en vez de confiar en ello.
function factsFrom(fullName, scoreData) {
  const sd = scoreData && typeof scoreData === 'object' ? scoreData : null;
  const nombre = safeFirstName(fullName);
  if (!sd || sd.score == null) return { ok: false, why: 'sin_puntaje', nombre };
  const score = Number(sd.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return { ok: false, why: 'puntaje_invalido', nombre };
  const pr = sd.prioridad && typeof sd.prioridad === 'object' ? sd.prioridad : {};
  if (PILARES.indexOf(pr.principal) < 0) return { ok: false, why: 'sin_prioridad', nombre };
  const pilares = {};
  for (const k of PILARES) {
    const v = Number(sd.pilares && sd.pilares[k]);
    if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, why: 'pilares_invalidos', nombre };
    pilares[k] = Math.round(v);
  }
  const secundario = PILARES.indexOf(pr.secundario) >= 0 && pr.secundario !== pr.principal ? pr.secundario : null;
  const s = Math.round(score);
  return { ok: true, nombre, score: s, rango: rangoDe(s), principal: pr.principal, secundario, pilares };
}
function factsHash(f) { return sha(JSON.stringify([f.nombre, f.score, f.rango, f.principal, f.secundario, PILARES.map((k) => f.pilares[k])])); }
// Lo que la página necesita para decidir si un texto corresponde a lo que tiene en pantalla.
function publicFacts(f) { return f && f.ok ? { nombre: f.nombre, score: f.score, rango: f.rango, principal: f.principal, secundario: f.secundario } : { nombre: (f && f.nombre) || '' }; }

// Un separador de miles se quita (1.500 -> 1500); un decimal se conserva (1,5 -> 1.5), para
// que «1,5» no se confunda con un 15 permitido.
function numbersIn(text) { return (String(text || '').match(/\d+(?:[.,]\d+)*/g) || []).map((x) => x.replace(/[.,](?=\d{3}(?!\d))/g, '').replace(',', '.')); }
// Cifras escritas en palabras: el modelo no puede decir «cincuenta millones» para saltarse
// la revisión de números. (Uno, dos, tres... sí se permiten: «dos áreas», «un paso».)
const NUM_PALABRA = /(^|[^a-z])(mil|millon|millones|cien|ciento|cientos|doscient|trescient|cuatrocient|quinient|seiscient|setecient|ochocient|novecient|veinte|veinti|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|por ciento|porcentaje)/;
function mentions(textFolded, pilar) {
  return PILAR_ALIAS[pilar].some((a) => new RegExp('(^|[^a-z])' + a.replace(/ /g, '\\s+')).test(textFolded));
}
// Limpia lo que nunca debe llegar a la pantalla (emojis, markdown, saltos de línea).
function tidy(t) {
  return String(t == null ? '' : t)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{2022}]/gu, '')
    .replace(/(\*\*|__)([\s\S]*?)\1/g, '$2').replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ').trim();
}

// REVISIÓN DE UN TEXTO. Devuelve { ok, text } o { ok:false, why }. `kbNumbers` son los
// números que aparecen en el entrenamiento de Planea: esos sí se pueden decir.
function verifySlot(slot, raw, f, kbNumbers) {
  if (typeof raw !== 'string') return { ok: false, why: 'no_es_texto' };
  if (/[<>]/.test(raw)) return { ok: false, why: 'html' };
  const text = tidy(raw);
  if (text.length < 8) return { ok: false, why: 'vacio' };
  if (text.length > slot.max) return { ok: false, why: 'muy_largo' };
  if (/\$|\bCOP\b|\bpesos\b/i.test(text)) return { ok: false, why: 'monto' };
  const ft = fold(text);
  if (/tu asistente|tu guia financiera|asesor[a]?\b|asesoria/.test(ft)) return { ok: false, why: 'palabra_prohibida' };
  // Números: solo el puntaje, el puntaje del pilar de ESA tarjeta, o un número del entrenamiento.
  if (NUM_PALABRA.test(ft)) return { ok: false, why: 'cifra_en_palabras' };
  const allowed = new Set(kbNumbers || []);
  allowed.add(String(f.score)); allowed.add('100'); // «62 de 100»
  if (slot.pilar) allowed.add(String(f.pilares[slot.pilar]));
  for (const n of numbersIn(text)) if (!allowed.has(n)) return { ok: false, why: 'numero_no_respaldado:' + n };
  // Rango: si nombra un rango, tiene que ser el del usuario.
  // Solo cuenta como rango cuando va como NOMBRE (con mayúscula, como lo escribe la app):
  // «un ahorro sólido» o «estás construyendo» son palabras comunes, no un rango.
  for (const r of RANGOS) if (r[1] !== f.rango && text.indexOf(r[1]) >= 0) return { ok: false, why: 'rango_equivocado' };
  if (slot.req === 'rango' && ft.indexOf(fold(f.rango)) < 0) return { ok: false, why: 'falta_el_rango' };
  if (slot.req === 'prioridad' && !mentions(ft, f.principal)) return { ok: false, why: 'falta_el_area_prioritaria' };
  if (slot.req === 'bienvenida') {
    if (ft.indexOf('maya') < 0) return { ok: false, why: 'falta_maya' };
    if (f.nombre && ft.indexOf(fold(f.nombre)) < 0) return { ok: false, why: 'falta_el_nombre' };
  }
  if (slot.solo) {
    const ok = [f.principal].concat(slot.solo === 'prioridad+secundario' && f.secundario ? [f.secundario] : []);
    for (const k of PILARES) if (ok.indexOf(k) < 0 && mentions(ft, k)) return { ok: false, why: 'nombra_otra_area:' + k };
  }
  return { ok: true, text };
}

function taskBlock(f) {
  const H = loadHallazgo();
  const lines = SLOTS.map((s) => {
    let ref = s.ref ? s.ref(f) : '';
    if (s.pilar && H[s.pilar]) ref = H[s.pilar][band(f.pilares[s.pilar])] || '';
    return '- "' + s.key + '": ' + s.donde + '. Máximo ' + s.max + ' caracteres.' + (ref ? ' Texto actual de referencia: «' + ref + '»' : '');
  }).join('\n');
  const hechos = {
    nombre: f.nombre || null, puntaje: f.score, rango: f.rango,
    area_prioritaria: PILAR_LABEL[f.principal], area_siguiente: f.secundario ? PILAR_LABEL[f.secundario] : null,
    nivel_por_area: PILARES.reduce((o, k) => { o[PILAR_LABEL[k]] = ['por fortalecer', 'en desarrollo', 'fuerte'][band(f.pilares[k])]; return o; }, {}),
  };
  return '\n\nTAREA DE ESTE MENSAJE (prevalece sobre el modo de conversación de arriba)\n' +
    'No estás en el chat. Estás redactando los textos que el usuario LEE EN LAS PANTALLAS de Planea y el saludo del chat. Eres la única voz de Planea: estos textos son tuyos.\n' +
    'Aplica a estos textos TODAS las correcciones y documentos del equipo de Planea. Si una corrección o documento dice cómo debe decir uno de estos textos, úsalo tal cual, palabra por palabra.\n' +
    'HECHOS DEL USUARIO (no los cambies, no agregues otros, no menciones cifras que no estén aquí o en los documentos del equipo):\n' + JSON.stringify(hechos, null, 1) + '\n' +
    'REGLAS DE ESTOS TEXTOS: texto plano, sin markdown ni emojis; no escribas cifras ni porcentajes, ni en números ni en palabras, salvo el puntaje; sin montos en pesos; no cierres con una pregunta salvo en "chat_bienvenida"; nunca digas "tu asistente" ni "tu guía financiera IA"; ' +
    'los textos sobre el área prioritaria nombran SOLO esa área (y, donde se indica, la siguiente).\n' +
    'TEXTOS A ESCRIBIR:\n' + lines + '\n' +
    'Responde ÚNICAMENTE con un objeto JSON cuyas claves sean exactamente esas, cada una con su texto. Sin explicación antes ni después.';
}

function parseJson(raw) {
  const s = String(raw || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const o = JSON.parse(s.slice(a, b + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; }
}

// Redacta y revisa. No guarda nada: lo usan el trabajo en segundo plano y la vista previa.
async function compose({ facts, system, knowledge, model, fetchImpl }) {
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return { ok: false, reason: 'sin_clave' };
  const f = fetchImpl || fetch;
  const r = await f('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model || 'claude-haiku-4-5-20251001', max_tokens: 1800, system: String(system || '') + String(knowledge || '') + taskBlock(facts),
      messages: [{ role: 'user', content: 'Escribe los textos.' }] }),
  });
  if (!r.ok) return { ok: false, reason: 'modelo_' + r.status };
  const d = await r.json();
  const obj = parseJson(d && d.content && d.content[0] && d.content[0].text);
  if (!obj) return { ok: false, reason: 'respuesta_no_json' };
  const kbNums = numbersIn(knowledge);
  const texts = {}, rejected = {};
  SLOTS.forEach((s) => {
    const v = verifySlot(s, obj[s.key], facts, kbNums);
    if (v.ok) texts[s.key] = v.text; else { texts[s.key] = null; rejected[s.key] = v.why; }
  });
  return { ok: true, texts, rejected };
}

function fixedPayload(f, why) {
  // Todos null: la página conserva su texto fijo. El saludo sí viaja, porque es el texto
  // que Planea pidió y debe salir igual aunque no haya modelo.
  const texts = {}; SLOTS.forEach((s) => { texts[s.key] = null; });
  texts.chat_bienvenida = BIENVENIDA(f && f.nombre);
  return { texts, facts: publicFacts(f), composed_by: 'fixed', reason: why || null };
}

let ensured = null;
function ensure(sq) {
  if (!ensured) {
    ensured = (async () => {
      await sq.query(`CREATE TABLE IF NOT EXISTS planea_maya_texts (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, user_id INTEGER NOT NULL,
        is_current BOOLEAN NOT NULL DEFAULT TRUE, cause TEXT NOT NULL,
        texts JSONB NOT NULL, facts JSONB NOT NULL, facts_hash TEXT NOT NULL, kb_version TEXT NOT NULL,
        composed_by TEXT NOT NULL DEFAULT 'maya', rejected JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await sq.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_maya_texts_current ON planea_maya_texts (tenant_id, user_id) WHERE is_current');
      await sq.query('CREATE INDEX IF NOT EXISTS idx_planea_maya_texts_user ON planea_maya_texts (tenant_id, user_id, created_at)');
    })().catch((e) => { ensured = null; throw e; });
  }
  return ensured;
}

const isOff = () => String(process.env.PLANEA_MAYA_TEXTS || '').toLowerCase() === 'off';
const dailyData = () => Math.max(0, parseInt(process.env.PLANEA_MAYA_TEXTS_DAILY || '1', 10) || 0);
const dailyMax = () => Math.max(1, parseInt(process.env.PLANEA_MAYA_TEXTS_MAX_DAILY || '6', 10) || 6);
const KEEP = 5;

// Monta GET /me/maya-texts en el router del usuario y devuelve la vista previa del admin.
function mount(me, ctx) {
  const { db, tenant, userOf, ready, sec, mayaSystem, mayaModel, fetchImpl, knowledge } = ctx;
  const running = new Set(); // un trabajo a la vez por usuario en este proceso

  function systemFor(f) {
    // Perfil neutro (ya con puntaje y todo registrado) para que el modo de conversación
    // no hable del cuestionario ni pida datos: aquí solo se redactan textos.
    return mayaSystem({ nombre: f.nombre || undefined, planea_score: f.score, rango: f.rango,
      modulos_con_datos: ['ingreso', 'gasto', 'ahorro', 'inversion', 'deuda', 'seguros', 'retiro'], metas: [{}] });
  }

  async function rewrite(uid, f, fh, kv, kbText, cause) {
    const sq = db();
    try {
      const r = await compose({ facts: f, system: systemFor(f), knowledge: kbText, model: mayaModel, fetchImpl });
      if (!r.ok && r.reason !== 'respuesta_no_json') { console.log('[planea-maya-texts] no se redactó:', r.reason); return false; }
      // Una respuesta que el modelo sí cobró pero que no se pudo leer TAMBIÉN se guarda
      // (todo en null = textos fijos): así cuenta para los topes y no se reintenta en bucle.
      if (!r.ok) { r.texts = {}; r.rejected = { _todo: r.reason }; SLOTS.forEach((sl) => { r.texts[sl.key] = null; }); }
      await sq.transaction(async (t) => {
        await sq.query('UPDATE planea_maya_texts SET is_current = FALSE WHERE tenant_id = :t AND user_id = :u AND is_current', { replacements: { t: tenant(), u: uid }, transaction: t });
        await sq.query(`INSERT INTO planea_maya_texts (tenant_id, user_id, is_current, cause, texts, facts, facts_hash, kb_version, composed_by, rejected)
          VALUES (:t, :u, TRUE, :c, CAST(:tx AS JSONB), CAST(:f AS JSONB), :fh, :kv, 'maya', CAST(:rj AS JSONB))`,
          { replacements: { t: tenant(), u: uid, c: cause, tx: JSON.stringify(r.texts), f: JSON.stringify(publicFacts(f)), fh, kv, rj: JSON.stringify(r.rejected) }, transaction: t });
      });
      // Solo las últimas versiones: no se acumula historial sin límite.
      await sq.query(`DELETE FROM planea_maya_texts WHERE tenant_id = :t AND user_id = :u AND id NOT IN
        (SELECT id FROM planea_maya_texts WHERE tenant_id = :t AND user_id = :u ORDER BY id DESC LIMIT ${KEEP})`, { replacements: { t: tenant(), u: uid } });
      return true;
    } catch (e) { console.error('[planea-maya-texts] reescritura', e.message); return false; }
  }

  // ¿Se puede reescribir ahora? Los topes se cuentan con filas reales de las últimas 24 h.
  async function allowed(uid, cause) {
    const [rows] = await db().query(`SELECT cause, COUNT(*)::int AS n FROM planea_maya_texts
      WHERE tenant_id = :t AND user_id = :u AND created_at > NOW() - INTERVAL '24 hours' GROUP BY cause`, { replacements: { t: tenant(), u: uid } });
    const by = {}; let total = 0; rows.forEach((r) => { by[r.cause] = r.n; total += r.n; });
    if (total >= dailyMax()) return false;                               // techo duro del día
    if (cause === 'data' && (by.data || 0) >= dailyData()) return false; // tope de cambios de datos
    return true;                                                         // 'first' y 'training' no llevan ese tope
  }

  me.get('/me/maya-texts', async (req, res) => {
    const a = userOf(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    res.set('Cache-Control', 'no-store');
    if (!ready()) return res.status(503).json({ error: 'backend_not_ready' });
    try {
      const sq = db();
      const [rows] = await sq.query('SELECT u.full_name AS uname, p.full_name AS pname, p.score_data FROM planea_users u LEFT JOIN planea_profiles p ON p.user_id = u.id WHERE u.id = :u LIMIT 1', { replacements: { u: a.id } });
      if (!rows.length) return res.status(401).json({ error: 'unauthorized' });
      const f = factsFrom(rows[0].pname || rows[0].uname, rows[0].score_data);
      if (isOff()) return res.json(fixedPayload(f, 'apagado'));
      if (!f.ok) return res.json(fixedPayload(f, f.why));
      await ensure(sq);
      const kbText = await knowledge();
      const fh = factsHash(f), kv = sha(kbText);
      const [cur] = await sq.query('SELECT texts, facts, facts_hash, kb_version, rejected FROM planea_maya_texts WHERE tenant_id = :t AND user_id = :u AND is_current LIMIT 1', { replacements: { t: tenant(), u: a.id } });
      const row = cur[0] || null;
      const sameFacts = !!row && row.facts_hash === fh;
      const fresh = sameFacts && row.kb_version === kv;
      let pending = false;
      if (!fresh) {
        const cause = !row ? 'first' : (!sameFacts ? 'data' : 'training');
        const key = tenant() + ':' + a.id;
        if (process.env.ANTHROPIC_API_KEY && !running.has(key) && await allowed(a.id, cause)) {
          // Candado entre instancias (2 min) con el mismo almacén de los límites de ingreso.
          const hits = await sec.countHit('maya-texts|' + key, 120000);
          // Techo duro del día en un contador que NO se poda (las filas sí: solo quedan 5).
          if (hits === 1 && await sec.countHit('maya-texts-dia|' + key, 24 * 3600e3) <= dailyMax()) {
            pending = true; running.add(key);
            // El candado dura lo que dura el trabajo (y como mucho 2 min si el proceso muere).
            setImmediate(() => { // Si falló (modelo caído), el candado se queda sus 2 minutos: así no se reintenta en cada carga.
            rewrite(a.id, f, fh, kv, kbText, cause).then((done) => { if (done && sec.clearHit) return sec.clearHit('maya-texts|' + key); }).catch(() => {}).finally(() => running.delete(key)); });
          }
        }
      }
      // Un texto escrito para OTRA ficha (otro puntaje u otra área) no se muestra: se
      // devuelven los fijos hasta que termine la reescritura.
      if (!sameFacts) return res.json(Object.assign(fixedPayload(f, 'ficha_cambio'), { pending }));
      const texts = {}; SLOTS.forEach((s) => { texts[s.key] = typeof row.texts[s.key] === 'string' ? row.texts[s.key] : null; });
      if (!texts.chat_bienvenida) texts.chat_bienvenida = BIENVENIDA(f.nombre);
      res.json({ texts, facts: publicFacts(f), composed_by: 'maya', stale: !fresh, pending });
    } catch (e) { console.error('[planea-maya-texts]', e.message); res.json(fixedPayload(null, 'error')); }
  });

  // Vista previa para el admin: la misma redacción y la misma revisión sobre una ficha de
  // ejemplo. No toca a ningún usuario ni guarda nada.
  async function preview(sample) {
    const s = sample && typeof sample === 'object' ? sample : {};
    const prin = PILARES.indexOf(s.principal) >= 0 ? s.principal : 'deuda';
    const seg = PILARES.indexOf(s.secundario) >= 0 && s.secundario !== prin ? s.secundario : (prin === 'ahorro' ? 'deuda' : 'ahorro');
    const score = Number.isFinite(+s.score) && +s.score >= 0 && +s.score <= 100 ? Math.round(+s.score) : 62;
    const pilares = {}; PILARES.forEach((k, i) => { pilares[k] = k === prin ? 38 : k === seg ? 50 : [72, 80, 64, 76, 58, 70, 66, 74][i]; });
    const f = { ok: true, nombre: safeFirstName(s.nombre) || 'Camila', score, rango: rangoDe(score), principal: prin, secundario: seg, pilares };
    if (isOff()) return { ok: false, reason: 'apagado', facts: publicFacts(f) };
    const kbText = await knowledge();
    const r = await compose({ facts: f, system: systemFor(f), knowledge: kbText, model: mayaModel, fetchImpl });
    const slots = SLOTS.map((sl) => ({ key: sl.key, donde: sl.donde, actual: sl.pilar ? ((loadHallazgo()[sl.pilar] || [])[band(f.pilares[sl.pilar])] || '') : (sl.ref ? sl.ref(f) : ''),
      maya: r.ok ? r.texts[sl.key] : null, rechazado: r.ok ? (r.rejected[sl.key] || null) : null }));
    return { ok: r.ok, reason: r.ok ? null : r.reason, facts: publicFacts(f), slots };
  }
  return { preview };
}

function status() { return { off: isOff(), daily_data: dailyData(), daily_max: dailyMax(), slots: SLOTS.length }; }

module.exports = { mount, compose, verifySlot, factsFrom, factsHash, numbersIn, rangoDe, safeFirstName, tidy, ensure, status, SLOTS, PILARES, PILAR_LABEL, BIENVENIDA, fixedPayload, taskBlock };
