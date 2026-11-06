'use strict';
/**
 * Dalia's rule-based reader. No model: it finds menu items, quantities and the
 * customer's details in plain Spanish. It is the WHOLE brain when there is no
 * ANTHROPIC_API_KEY, and the safety net when the model fails.
 *
 * It never invents an item: a phrase either matches a menu row, is ambiguous
 * (Dalia asks which one), or is ignored.
 */
const { ITEMS, CATEGORIES } = require('./menu');

const NUM_WORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const UNIT_AFTER = new Set(['litro', 'lt', 'lts', 'gr', 'grs', 'gramo', 'unidade', 'unidad', 'kg', 'minuto', 'hora']);

function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bx\s+(\d)/g, 'x$1').replace(/[^a-z0-9/]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const stem = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
function tokens(s) {
  return fold(s).split(' ').filter(Boolean).map((w) => {
    if (NUM_WORDS[w] != null) return String(NUM_WORDS[w]);
    const xm = /^x(un|una|uno|dos|cuatro|seis)$/.exec(w);
    if (xm) return 'x' + NUM_WORDS[xm[1]];
    return stem(w);
  });
}
const phrase = (s) => tokens(s).join(' ');

/* ---- compile the match DSL once ---- */
const COMPILED = ITEMS.map((it) => {
  const groups = String(it.match).split(' + ').map((g) => {
    const variant = g.startsWith('?');
    return { variant, alts: g.replace(/^\?/, '').split('|').map(phrase).filter(Boolean) };
  });
  const not = it.not ? String(it.not).split('|').map(phrase) : [];
  return { code: it.code, cat: it.cat, groups, not };
});

function has(hay, alt) { return (' ' + hay + ' ').includes(' ' + alt + ' '); }

/** Full match = every group present; partial = every NON-variant group present. */
function score(text) {
  const t = phrase(text);
  const full = [], partial = [];
  for (const c of COMPILED) {
    if (c.not.some((n) => has(t, n))) continue;
    let ok = true, okNonVar = true, len = 0;
    for (const g of c.groups) {
      const hit = g.alts.find((a) => has(t, a));
      if (hit) len += hit.length;
      else { ok = false; if (!g.variant) okNonVar = false; }
    }
    if (ok) full.push({ code: c.code, s: c.groups.length * 100 + len });
    else if (okNonVar && c.groups.some((g) => g.variant)) partial.push({ code: c.code, s: c.groups.length * 100 + len });
  }
  full.sort((a, b) => b.s - a.s);
  partial.sort((a, b) => b.s - a.s);
  return { full, partial };
}

/** Best interpretation of one phrase: {code} | {ambiguous:[codes]} | null. */
function bestOf(text) {
  const { full, partial } = score(text);
  if (full.length) {
    const top = full.filter((f) => f.s === full[0].s);
    return top.length === 1 ? { code: top[0].code, s: top[0].s } : { ambiguous: top.map((x) => x.code), s: top[0].s };
  }
  if (partial.length) {
    const lead = Math.floor(partial[0].s / 100);
    const top = partial.filter((p) => Math.floor(p.s / 100) === lead);
    return top.length === 1 ? { code: top[0].code, s: top[0].s } : { ambiguous: top.map((x) => x.code), s: top[0].s - 1 };
  }
  return null;
}

/** Split an utterance into quantity segments, then into item mentions. */
function parseItems(text) {
  const toks = tokens(text);
  const segs = [];
  let cur = { qty: 1, toks: [], explicit: false };
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    const n = /^\d{1,2}$/.test(w) ? parseInt(w, 10) : null;
    const prev = toks[i - 1], next = toks[i + 1];
    const isQty = n && n >= 1 && n <= 50 && !UNIT_AFTER.has(next) && prev !== 'pa' && prev !== 'para' && prev !== 'x' && !(next === '5' || prev === '1');
    if (isQty) {
      if (cur.toks.length) segs.push(cur);
      cur = { qty: n, toks: [], explicit: true };
    } else cur.toks.push(w);
  }
  if (cur.toks.length) segs.push(cur);

  const out = [];
  for (const seg of segs) {
    // pieces split on connectors; greedy longest window that strictly improves the score
    const pieces = seg.toks.join(' ').split(/\s(?:y|mas|tambien|ademas|e)\s|,/).map((p) => p.trim()).filter(Boolean);
    let first = true;
    for (let i = 0; i < pieces.length;) {
      let best = null, bestJ = i;
      for (let j = i; j < pieces.length; j++) {
        const r = bestOf(pieces.slice(i, j + 1).join(' y '));
        if (r && (!best || r.s > best.s)) { best = r; bestJ = j; }
      }
      if (best) {
        out.push(Object.assign({ qty: first ? seg.qty : 1 }, best));
        first = false;
        i = bestJ + 1;
      } else i++;
    }
  }
  return out;
}

/* ---- intents ---- */
const RX = {
  greet: /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|saludos)\b/,
  menu: /\b(menu|carta|que (venden|tienen|hay|ofrecen)|opciones)\b/,
  price: /\b(cuanto (cuesta|vale|sale|es)|precio|que (trae|lleva|tiene)|ingredientes)\b/,
  remove: /\b(quita|quitar|quitale|elimina|eliminar|borra|borrar|saca|sacar)\b/,
  view: /\b(mi pedido|ver (el )?pedido|que llevo|cuanto (es|va|llevo) (el )?total|el total|resumen|mi carrito)\b/,
  checkout: /\b(eso es todo|nada mas|seria todo|es todo|listo|confirmar|finalizar|terminar|hacer el pedido|ordenar ya|cerrar (el )?pedido|quiero pagar)\b/,
  yes: /^(si|sii|sí|claro|dale|ok|okay|confirmo|confirmado|correcto|de acuerdo|perfecto|exacto|si confirmo|si por favor|afirmativo)\b/,
  no: /^(no|nop|todavia no|aun no|espera|negativo)\b/,
  cancel: /\b(cancela|cancelar|vacia|vaciar|empezar de nuevo|borra todo|borrar todo)\b/,
  restart: /\b(nuevo pedido|otro pedido|pedir otra vez)\b/,
  hours: /\b(horario|abren|cierran|ubicacion|donde (estan|quedan)|direccion del local)\b/
};
function intent(text) {
  const t = fold(text);
  const hits = {};
  for (const k of Object.keys(RX)) hits[k] = RX[k].test(t);
  return hits;
}

/* ---- customer details ---- */
function phone(text) {
  const m = String(text || '').match(/\+?\d[\d\s\-().]{7,18}\d/);
  if (!m) return null;
  let d = m[0].replace(/[^\d+]/g, '');
  const plus = d.startsWith('+');
  d = d.replace(/\+/g, '');
  if (!plus && /^0(4\d{9})$/.test(d)) return '+58' + d.slice(1);
  if (!plus && /^4\d{9}$/.test(d)) return '+58' + d;
  if (/^58\d{10}$/.test(d)) return '+' + d;
  if (plus && d.length >= 10 && d.length <= 15) return '+' + d;
  if (!plus && /^1\d{10}$/.test(d)) return '+' + d;
  return null;
}
function name(text) {
  const raw = String(text || '').replace(/^(hola[, ]*)?(me llamo|mi nombre es|soy|a nombre de|el nombre es|nombre:?)\s*/i, '').trim();
  const clean = raw.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length < 2 || clean.length > 60) return null;
  if (clean.split(' ').length > 5) return null;
  return clean.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
function mode(text) {
  const t = fold(text);
  if (/\b(delivery|domicilio|envio|enviar|envien|llevar|llevenlo|traer|traigan|a mi casa|despacho)\b/.test(t)) return 'delivery';
  if (/\b(retiro|retirar|buscar|recoger|paso|pick|pickup|en el local|voy a buscar|para llevar)\b/.test(t)) return 'pickup';
  return null;
}
function address(text) {
  const a = String(text || '').replace(/^(mi direcci[oó]n es|direcci[oó]n:?|es en|en)\s*/i, '').replace(/[<>]/g, '').trim();
  return a.length >= 6 && a.length <= 200 ? a : null;
}

function categoryOf(text) {
  const t = phrase(text);
  const cats = new Set();
  for (const c of COMPILED) {
    const g0 = c.groups[0];
    if (g0 && g0.alts.some((a) => has(t, a))) cats.add(c.cat);
  }
  return [...cats];
}

module.exports = { fold, tokens, phrase, parseItems, bestOf, intent, phone, name, mode, address, categoryOf, CATEGORIES, _compiled: COMPILED };
