'use strict';
/**
 * Dalia — the ordering assistant of del Calor al Sabor.
 *
 * RULES ENFORCED HERE, NOT IN A PROMPT
 *  - Every price and total is computed from the catalog rows (dlc_products).
 *    A cart line stores only {code, qty, note}; its price is looked up on every read.
 *  - An item that is not on the menu, or is marked unavailable, cannot enter the cart.
 *  - An order is placed only when: the cart is not empty, name + phone + mode
 *    (+ address for delivery) are valid, the customer was SHOWN a summary of exactly
 *    this cart, and their latest message is a clear yes.
 *  - A model reply containing a price or a figure that is not on the menu or in the
 *    cart is discarded for the deterministic reply.
 */
const crypto = require('crypto');
const nlp = require('./nlp');
const llm = require('./llm');
const { BRAND, CATEGORIES } = require('./menu');

const MAX_LINES = 40, MAX_QTY = 30;

/* ---------------- money + cart ---------------- */
const fmt = (c) => '€' + (Math.round(c) / 100).toFixed(2).replace('.', ',');
const byCode = (catalog) => { const m = new Map(); catalog.forEach((p) => m.set(p.code, p)); return m; };

function newState() {
  return { cart: [], customer: { name: null, phone: null, mode: null, address: null }, awaiting: null, clarify: null,
    summary_hash: null, order: null, history: [] };
}

function lines(state, catalog) {
  const m = byCode(catalog);
  return state.cart.map((l) => {
    const p = m.get(l.code);
    if (!p) return null;
    return { code: l.code, name: p.name, qty: l.qty, note: l.note || null, unit_cents: p.price_cents, line_cents: p.price_cents * l.qty, available: p.available !== false };
  }).filter(Boolean);
}
function total(state, catalog) { return lines(state, catalog).reduce((s, l) => s + l.line_cents, 0); }

function addLine(state, catalog, code, qty, note) {
  const p = byCode(catalog).get(code);
  if (!p) return { ok: false, reason: 'not_on_menu' };
  if (p.available === false) return { ok: false, reason: 'unavailable', name: p.name };
  const q = Math.max(1, Math.min(MAX_QTY, parseInt(qty, 10) || 1));
  const n = note ? String(note).replace(/[<>]/g, '').slice(0, 80).trim() || null : null;
  const ex = state.cart.find((l) => l.code === code && (l.note || null) === n);
  if (ex) ex.qty = Math.min(MAX_QTY, ex.qty + q);
  else {
    if (state.cart.length >= MAX_LINES) return { ok: false, reason: 'cart_full' };
    state.cart.push({ code, qty: q, note: n });
  }
  state.summary_hash = null;
  return { ok: true, name: p.name, qty: q };
}
function removeLine(state, code, qty) {
  const i = state.cart.findIndex((l) => l.code === code);
  if (i < 0) return { ok: false, reason: 'not_in_cart' };
  const q = parseInt(qty, 10);
  if (q && q < state.cart[i].qty) state.cart[i].qty -= q; else state.cart.splice(i, 1);
  state.summary_hash = null;
  return { ok: true };
}

function summaryHash(state, catalog) {
  return crypto.createHash('sha256').update(JSON.stringify({ l: lines(state, catalog).map((l) => [l.code, l.qty, l.note, l.unit_cents]), c: state.customer })).digest('hex').slice(0, 24);
}

function cartText(state, catalog) {
  const ls = lines(state, catalog);
  if (!ls.length) return 'Tu pedido está vacío.';
  return ls.map((l) => `${l.qty} x ${l.name}${l.note ? ' (' + l.note + ')' : ''}: ${fmt(l.line_cents)}`).join('\n') + `\nTotal: ${fmt(total(state, catalog))}`;
}

/* ---------------- checkout steps ---------------- */
function missing(state) {
  const c = state.customer;
  if (!c.name) return 'name';
  if (!c.phone) return 'phone';
  if (!c.mode) return 'mode';
  if (c.mode === 'delivery' && !c.address) return 'address';
  return null;
}
const ASK = {
  name: '¿A nombre de quién va el pedido?',
  phone: '¿A qué número de WhatsApp te envío la confirmación? Por ejemplo 0414 123 4567.',
  mode: '¿Lo quieres por delivery o lo pasas a buscar al local?',
  address: '¿Cuál es la dirección de entrega? Incluye un punto de referencia.'
};
function confirmText(state, catalog) {
  const c = state.customer;
  const entrega = c.mode === 'delivery' ? `Delivery a: ${c.address}` : 'Retiro en el local';
  return `Este es tu pedido:\n${cartText(state, catalog)}\nA nombre de ${c.name}, WhatsApp ${c.phone}. ${entrega}.\n¿Lo confirmo? Responde "sí" para enviarlo.`;
}
/** Moves the checkout one step; shows the summary (and records its hash) when complete. */
function advance(state, catalog) {
  if (!state.cart.length) { state.awaiting = null; return 'Todavía no tienes nada en el pedido. ¿Qué te provoca?'; }
  const m = missing(state);
  if (m) { state.awaiting = m; return ASK[m]; }
  state.awaiting = 'confirm';
  state.summary_hash = summaryHash(state, catalog);
  return confirmText(state, catalog);
}

function describe(codes, catalog) {
  const m = byCode(catalog);
  return codes.map((c) => m.get(c)).filter(Boolean).map((p) => `${p.name}: ${fmt(p.price_cents)}${p.description ? ' (' + p.description + ')' : ''}${p.available === false ? ' — no disponible hoy' : ''}`).join('\n');
}
function listCategory(cat, catalog) {
  const c = CATEGORIES.find((x) => x.id === cat);
  const items = catalog.filter((p) => p.category === cat && p.available !== false);
  return `${c ? c.name : cat}:\n` + items.map((p) => `${p.name}: ${fmt(p.price_cents)}`).join('\n');
}

/* ---------------- placing the order (guards) ---------------- */
function yes(text) { return nlp.intent(text).yes; }
function canPlace(state, catalog, lastText) {
  if (state.order) return 'already_placed';
  if (!state.cart.length) return 'empty_cart';
  if (missing(state)) return 'missing_' + missing(state);
  if (lines(state, catalog).some((l) => !l.available)) return 'item_unavailable';
  if (!state.summary_hash || state.summary_hash !== summaryHash(state, catalog)) return 'summary_not_shown';
  if (!yes(lastText)) return 'no_explicit_yes';
  return null;
}

/* ---------------- rule-based turn ---------------- */
async function heuristicTurn(state, text, catalog, ctx) {
  const it = nlp.intent(text);
  const say = (s) => s;

  if (state.order) {
    if (it.restart) { const keep = state.customer; Object.assign(state, newState(), { customer: Object.assign({}, keep) }); return say('¡Dale! Empecemos un pedido nuevo. ¿Qué te provoca?'); }
    return say(`Tu pedido ${state.order.number} ya está registrado. Si quieres pedir algo más di "nuevo pedido".`);
  }
  if (it.cancel) { state.cart = []; state.awaiting = null; state.clarify = null; state.summary_hash = null; return say('Listo, vacié tu pedido. ¿Qué te provoca?'); }

  // a pending field
  const aw = state.awaiting;
  if (aw === 'clarify' && state.clarify) {
    const t = nlp.fold(text);
    const cands = state.clarify.codes;
    let pick = null;
    const idx = parseInt(t, 10);
    if (idx >= 1 && idx <= cands.length) pick = cands[idx - 1];
    if (!pick) {
      const hits = cands.filter((code) => {
        const c = nlp._compiled.find((x) => x.code === code);
        const v = c && c.groups.find((g) => g.variant);
        return v && v.alts.some((a) => (' ' + nlp.phrase(text) + ' ').includes(' ' + a + ' '));
      });
      if (hits.length === 1) pick = hits[0];
    }
    if (pick) {
      const r = addLine(state, catalog, pick, state.clarify.qty);
      state.clarify = null; state.awaiting = null;
      return say(r.ok ? `Anotado: ${r.qty} x ${r.name}.\n${cartText(state, catalog)}\n¿Algo más?` : 'Ese producto no está disponible hoy. ¿Quieres otro?');
    }
  }
  if (aw === 'name') { const n = nlp.name(text); const p = nlp.phone(text); if (p) state.customer.phone = p; if (n && !p) { state.customer.name = n; return say(advance(state, catalog)); } if (n && p) { state.customer.name = nlp.name(text.replace(/[\d+\-() ]{8,}/g, ' ')) || n; return say(advance(state, catalog)); } }
  if (aw === 'phone') { const p = nlp.phone(text); if (p) { state.customer.phone = p; const m = nlp.mode(text); if (m) state.customer.mode = m; return say(advance(state, catalog)); } if (!nlp.parseItems(text).length) return say('No pude leer ese número. Escríbelo así: 0414 123 4567, o con el código de país.'); }
  if (aw === 'mode') { const m = nlp.mode(text); if (m) { state.customer.mode = m; if (m === 'pickup') state.customer.address = null; return say(advance(state, catalog)); } if (!nlp.parseItems(text).length) return say('¿Delivery o lo pasas a buscar?'); }
  if (aw === 'address') { const a = nlp.address(text); if (a) { state.customer.address = a; return say(advance(state, catalog)); } }
  if (aw === 'confirm') {
    if (it.yes) {
      const why = canPlace(state, catalog, text);
      if (why) return say(advance(state, catalog));
      const o = await ctx.placeOrder(state);
      return say(o.reply);
    }
    if (it.no) { state.awaiting = null; state.summary_hash = null; return say('Sin problema. ¿Qué quieres cambiar? Puedes agregar o quitar productos.'); }
  }

  // items, questions, commands
  const items = nlp.parseItems(text);
  if (it.remove && items.length) {
    const done = [];
    items.forEach((x) => { const codes = x.code ? [x.code] : (x.ambiguous || []).filter((c) => state.cart.some((l) => l.code === c)); codes.slice(0, 1).forEach((c) => { if (removeLine(state, c, x.qty > 1 ? x.qty : null).ok) done.push(c); }); });
    if (state.awaiting === 'confirm') state.awaiting = null;
    return say(done.length ? `Listo, lo quité.\n${cartText(state, catalog)}` : 'Eso no estaba en tu pedido.');
  }
  if (it.price && items.length) {
    const codes = []; items.forEach((x) => (x.code ? codes.push(x.code) : codes.push(...x.ambiguous)));
    return say(describe(codes, catalog) + '\n¿Te lo anoto?');
  }
  if (items.length) {
    const added = [], issues = [];
    for (const x of items) {
      if (x.ambiguous) { if (!state.clarify) { state.clarify = { codes: x.ambiguous.slice(0, 6), qty: x.qty }; } continue; }
      const r = addLine(state, catalog, x.code, x.qty);
      if (r.ok) added.push(`${r.qty} x ${r.name}`); else if (r.reason === 'unavailable') issues.push(`${r.name} no está disponible hoy`);
    }
    let out = added.length ? `Anotado: ${added.join(', ')}.` : '';
    if (issues.length) out += (out ? '\n' : '') + issues.join('. ') + '.';
    if (state.clarify) {
      state.awaiting = 'clarify';
      const m = byCode(catalog);
      out += (out ? '\n' : '') + '¿Cuál prefieres?\n' + state.clarify.codes.map((c, i) => `${i + 1}. ${m.get(c).name}: ${fmt(m.get(c).price_cents)}`).join('\n');
      return say(out);
    }
    if (it.checkout) return say(out + '\n' + advance(state, catalog));
    if (state.awaiting && state.awaiting !== 'clarify') { state.summary_hash = null; return say(out + '\n' + cartText(state, catalog) + '\n' + advance(state, catalog)); }
    return say(out + '\n' + cartText(state, catalog) + '\n¿Algo más? Cuando termines di "eso es todo".');
  }
  if (it.view) return say(cartText(state, catalog));
  if (it.checkout) return say(advance(state, catalog));
  const cats = nlp.categoryOf(text);
  if (cats.length && (it.menu || it.price || cats.length === 1)) return say(cats.slice(0, 2).map((c) => listCategory(c, catalog)).join('\n\n'));
  if (it.menu) return say('Tenemos ' + CATEGORIES.filter((c) => c.id !== 'adicionales').map((c) => c.name).join(', ') + '. ¿De cuál te cuento?');
  if (it.hours) return say('Esa información no está en nuestro menú y no la quiero inventar. Escríbenos por Instagram ' + BRAND.instagram + ' y te responden.');
  if (it.greet) return say('¡Hola! Soy Dalia, de del Calor al Sabor. ¿Qué te provoca hoy? Puedes pedirme, por ejemplo, "dos hamburguesas de carne especiales y una lata".');
  if (aw && ASK[aw]) return say('No te entendí. ' + ASK[aw]);
  return say('No te entendí bien. Dime el producto, por ejemplo "un pepito de lomito", o pregúntame por el menú.');
}

/* ---------------- model turn (tools over the same state) ---------------- */
const TOOLS = [
  { name: 'add_item', description: 'Agrega un producto del menú al pedido. Usa SOLO un code de la lista del menú.',
    input_schema: { type: 'object', properties: { code: { type: 'string' }, qty: { type: 'integer', minimum: 1, maximum: 30 }, note: { type: 'string', description: 'Opción elegida o petición especial, por ejemplo "pollo crunchy" o "sin salsa".' } }, required: ['code'] } },
  { name: 'remove_item', description: 'Quita un producto del pedido (todo, o qty unidades).',
    input_schema: { type: 'object', properties: { code: { type: 'string' }, qty: { type: 'integer', minimum: 1 } }, required: ['code'] } },
  { name: 'set_customer', description: 'Guarda los datos del cliente que él mismo dijo. mode = delivery o pickup.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, mode: { type: 'string', enum: ['delivery', 'pickup'] }, address: { type: 'string' } } } },
  { name: 'show_summary', description: 'Muestra al cliente el resumen exacto del pedido con el total para que lo confirme. Obligatorio antes de place_order.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'place_order', description: 'Registra el pedido y envía la confirmación por WhatsApp. Solo después de show_summary y de que el cliente dijo "sí".',
    input_schema: { type: 'object', properties: {} } }
];

function menuForPrompt(catalog) {
  const out = [];
  for (const c of CATEGORIES) {
    const items = catalog.filter((p) => p.category === c.id && p.available !== false);
    if (!items.length) continue;
    out.push(`## ${c.name}${c.note ? ' — ' + c.note : ''}`);
    items.forEach((p) => out.push(`${p.code} | ${p.name} | ${fmt(p.price_cents)}${p.description ? ' | ' + p.description : ''}${p.options ? ' | opciones: ' + p.options.join(', ') : ''}`));
  }
  return out.join('\n');
}

function system(state, catalog) {
  return [
    `Eres Dalia, la asistente de pedidos de ${BRAND.name} (Delca), comida rápida en ${BRAND.city}, Venezuela. Instagram ${BRAND.instagram}. Lema: "${BRAND.slogan}".`,
    'Hablas español venezolano, cálido y breve (2 a 4 frases). Sin emojis. Tus respuestas se leen en voz alta: no uses listas largas ni markdown.',
    'Ayudas a conocer el menú y a tomar el pedido. Usa las herramientas para cambiar el pedido; nunca digas que agregaste algo sin llamar add_item.',
    'REGLAS: Solo existen los productos de la lista. Los precios están en euros, tal como el menú. Nunca menciones un precio ni un total que no aparezca abajo o en el estado del pedido.',
    'Si el cliente pide algo con variantes (sencilla o especial, X1/X2/X4/X6) y no dijo cuál, pregunta. Si un producto tiene opciones (carne, pollo o pollo crunchy), pregunta y ponla en note.',
    'No conoces horario, dirección del local, costo de delivery ni métodos de pago: dilo y sugiere escribir por Instagram. No inventes.',
    'Para cerrar: pide nombre, número de WhatsApp, si es delivery o retiro, y la dirección si es delivery; llama set_customer; luego show_summary y espera el "sí"; entonces place_order.',
    '', 'MENÚ (code | nombre | precio | descripción):', menuForPrompt(catalog), '',
    'ESTADO DEL PEDIDO (calculado por el sistema):', JSON.stringify({ lineas: lines(state, catalog).map((l) => ({ code: l.code, nombre: l.name, cantidad: l.qty, nota: l.note, subtotal: fmt(l.line_cents) })), total: fmt(total(state, catalog)), cliente: state.customer, esperando: state.awaiting })
  ].join('\n');
}

async function runTool(name, input, state, catalog, ctx, text) {
  input = input || {};
  if (name === 'add_item') {
    const r = addLine(state, catalog, String(input.code || ''), input.qty, input.note);
    return r.ok ? { ok: true, added: `${r.qty} x ${r.name}`, total: fmt(total(state, catalog)) } : r;
  }
  if (name === 'remove_item') { const r = removeLine(state, String(input.code || ''), input.qty); return Object.assign(r, { total: fmt(total(state, catalog)) }); }
  if (name === 'set_customer') {
    const out = {}, c = state.customer;
    if (input.name != null) { const n = nlp.name(input.name); if (n) c.name = n; else out.name = 'invalid'; }
    if (input.phone != null) { const p = nlp.phone(input.phone); if (p) c.phone = p; else out.phone = 'invalid: pide el número con código de área, ej. 0414 123 4567'; }
    if (input.mode != null) { if (['delivery', 'pickup'].includes(input.mode)) { c.mode = input.mode; if (c.mode === 'pickup') c.address = null; } else out.mode = 'invalid'; }
    if (input.address != null) { const a = nlp.address(input.address); if (a) c.address = a; else out.address = 'invalid'; }
    state.summary_hash = null;
    return { ok: !Object.keys(out).length, errors: out, missing: missing(state) };
  }
  if (name === 'show_summary') {
    const m = missing(state);
    if (!state.cart.length) return { ok: false, reason: 'empty_cart' };
    if (m) return { ok: false, reason: 'missing_' + m };
    state.awaiting = 'confirm';
    state.summary_hash = summaryHash(state, catalog);
    ctx.shown = confirmText(state, catalog);
    return { ok: true, summary: ctx.shown };
  }
  if (name === 'place_order') {
    const why = canPlace(state, catalog, text);
    if (why) return { ok: false, reason: why };
    const o = await ctx.placeOrder(state);
    ctx.placed = o;
    return { ok: true, order_number: state.order.number, whatsapp: o.whatsapp_status };
  }
  return { ok: false, reason: 'unknown_tool' };
}

/* figures a reply may contain: a price only if the item it belongs to is named in
   the same reply (or it is a cart line / the total). Being SOME item's price is not enough. */
function allowedFigures(reply, state, catalog, extra) {
  const money = new Set(), ints = new Set();
  const addMoney = (c) => money.add((c / 100).toFixed(2));
  const m = byCode(catalog);
  const said = ' ' + nlp.phrase(reply) + ' ';
  const named = new Set();
  catalog.forEach((p) => { if (said.includes(' ' + nlp.phrase(p.name) + ' ')) named.add(p.code); });
  nlp.parseItems(reply).forEach((x) => (x.code ? [x.code] : (x.ambiguous || [])).forEach((c) => named.add(c)));
  named.forEach((c) => { const p = m.get(c); if (p) addMoney(p.price_cents); });
  catalog.forEach((p) => (String(p.name) + ' ' + String(p.description || '')).replace(/\d+/g, (d) => { ints.add(d); return d; }));
  lines(state, catalog).forEach((l) => { addMoney(l.line_cents); addMoney(l.unit_cents); ints.add(String(l.qty)); });
  addMoney(total(state, catalog));
  (extra || []).forEach((x) => String(x || '').replace(/\d+/g, (d) => { ints.add(d); return d; }));
  return { money, ints };
}
function verifyReply(reply, state, catalog, extra) {
  const { money, ints } = allowedFigures(reply, state, catalog, extra);
  const bad = [];
  reply = String(reply).replace(/DLC-\d+/gi, ' ').replace(/\+?\d[\d\s-]{7,}\d/g, ' ');
  const rx = /(€\s*)?(\d+(?:[.,]\d{1,2})?)(\s*(?:euros?|€))?/gi;
  let mm;
  while ((mm = rx.exec(reply))) {
    const raw = mm[2], isMoney = !!(mm[1] || mm[3]) || /[.,]\d{1,2}$/.test(raw);
    const v = parseFloat(raw.replace(',', '.'));
    if (isMoney) { if (!money.has(v.toFixed(2))) bad.push(mm[0].trim()); }
    else if (v > 50 && !ints.has(raw)) bad.push(raw);
  }
  return bad;
}

async function modelTurn(state, text, catalog, ctx) {
  const messages = state.history.slice(-10).map((h) => ({ role: h.role, content: h.text }));
  messages.push({ role: 'user', content: text });
  let reply = '';
  for (let i = 0; i < 6; i++) {
    const msg = await llm.toolTurn({ system: system(state, catalog), messages, tools: TOOLS });
    const content = msg.content || [];
    const uses = content.filter((b) => b.type === 'tool_use');
    reply = content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!uses.length || msg.stop_reason !== 'tool_use') break;
    messages.push({ role: 'assistant', content });
    const results = [];
    for (const u of uses) results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(await runTool(u.name, u.input, state, catalog, ctx, text)) });
    messages.push({ role: 'user', content: results });
  }
  if (ctx.placed) return ctx.placed.reply; // the confirmation text is the code's, never the model's
  const extra = [state.customer.phone, state.order && state.order.number];
  if (!reply || verifyReply(reply, state, catalog, extra).length) {
    ctx.discarded = !!reply;
    return state.awaiting && ASK[state.awaiting] ? cartText(state, catalog) + '\n' + ASK[state.awaiting]
      : (state.awaiting === 'confirm' ? confirmText(state, catalog) : cartText(state, catalog) + '\n¿Algo más?');
  }
  if (ctx.shown && !reply.includes('Total')) reply = ctx.shown + (reply ? '\n' + reply : '');
  return reply;
}

/**
 * One turn. ctx.placeOrder(state) -> {reply, whatsapp_status, ...} is supplied by the
 * route and is the only door that writes an order.
 */
async function turn(state, text, catalog, ctx) {
  ctx = ctx || {};
  const clean = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 600);
  let reply, composed_by = 'heuristic';
  if (llm.enabled()) {
    const snap = JSON.parse(JSON.stringify(state));
    try { reply = await modelTurn(state, clean, catalog, ctx); composed_by = ctx.discarded ? 'model-discarded' : 'model'; }
    catch (e) {
      ctx.model_error = String((e && e.message) || e).slice(0, 160);
      if (ctx.placed) reply = ctx.placed.reply; // the order exists; never undo it
      else { Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, snap); }
    }
  }
  if (reply == null) reply = await heuristicTurn(state, clean, catalog, ctx);
  state.history.push({ role: 'user', text: clean }, { role: 'assistant', text: reply });
  state.history = state.history.slice(-16);
  return { reply, composed_by, is_simulated: composed_by === 'heuristic', model_error: ctx.model_error || null };
}

function orderText(order, items, customer) {
  const ls = items.map((l) => `${l.qty} x ${l.name}${l.note ? ' (' + l.note + ')' : ''}: ${fmt(l.line_cents)}`).join('\n');
  const entrega = customer.mode === 'delivery' ? `Delivery a: ${customer.address}` : 'Retiro en el local';
  return `${BRAND.name} — Pedido ${order.number}\nCliente: ${customer.name} (${customer.phone})\n${ls}\nTotal: ${fmt(order.total_cents)}\n${entrega}\nGracias por tu pedido. #ElVerdaderoSaborDeLaCiudad`;
}

module.exports = { turn, heuristicTurn, newState, lines, total, fmt, addLine, removeLine, canPlace, summaryHash, verifyReply, orderText, cartText, missing, TOOLS, _system: system };
