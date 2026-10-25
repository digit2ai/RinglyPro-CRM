'use strict';
/**
 * Lina · asesora financiera personal.
 *
 * Lina never computes a figure. Every number she says comes from a tool, and
 * every tool is the same engine the REST endpoints use (engine.js). Two paths:
 *
 *  - heuristic (always available, no key): a fixed intent reader that calls the
 *    tools and answers from templates. Labelled composed_by:'heuristic'.
 *  - model (ANTHROPIC_API_KEY + registry key 'salud_financiera'): a tool-use
 *    loop. Its reply is CHECKED: any number that did not come from a tool
 *    result or from the question discards the reply for the heuristic one.
 *
 * Writes are never performed here. agregar_movimiento and marcar_cumplido only
 * return a PROPOSAL; the dashboard asks "¿Registro…?" and the owner's tap calls
 * the normal POST/PATCH endpoint, which validates again.
 */
const engine = require('./engine');
const { toCents, fmt } = require('./money');

const PRIORIDADES = 'Prioridades fijas: 1) nunca quedar en negativo, 2) cubrir corte, pago Lina y casa de mi hija, 3) mantener el colchón de $1,000, 4) respetar los $100 semanales, 5) invertir solo lo que sobra.';

function strip(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿¡?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function fl(iso) { return engine.fechaLarga(iso); }

// ---------------------------------------------------------------- tools
function makeTools(rows, opts) {
  const today = opts.today;
  const analyze = (rs) => engine.analyze(rs || rows, opts);
  const cur = analyze();
  const mapRow = (s) => ({ id: s.row.id, fecha: s.row.fecha, concepto: s.row.concepto, tipo: s.row.tipo, categoria: s.row.categoria,
    origen: s.row.origen, estado: s.row.estado, monto: fmt(s.amount), saldo: fmt(s.saldo) });

  const tools = {
    obtener_salud() { return engine.publicSummary(cur); },
    obtener_movimientos({ desde, hasta, categoria } = {}) {
      return cur.steps.filter(s => (!desde || s.row.fecha >= desde) && (!hasta || s.row.fecha <= hasta) && (!categoria || s.row.categoria === categoria)).map(mapRow).slice(0, 80);
    },
    proximos_pagos({ dias = 30 } = {}) {
      const hasta = engine.addDays(today, Math.max(1, Math.min(365, Number(dias) || 30)));
      return cur.steps.filter(s => s.row.tipo === 'egreso' && s.row.fecha >= today && s.row.fecha <= hasta && !(s.row.origen === 'plan' && s.row.estado === 'cumplido') && s.amount > 0)
        .map(s => ({ ...mapRow(s), cubierto: s.saldo >= 0 }));
    },
    gasto_semana() { return engine.publicSummary(cur).semana; },
    simular({ movimientos = [] } = {}) {
      const r = engine.simulate(rows, movimientos, opts);
      const p = (a) => ({ score: a.score, color: a.color, saldo_hoy: fmt(a.saldo_hoy), saldo_min: fmt(a.saldo_min), fecha_min: a.fecha_min, saldo_final: fmt(a.saldo_final), dias_negativos: a.dias_negativos.map(d => ({ fecha: d.fecha, saldo: fmt(d.saldo) })) });
      return { antes: p(r.antes), despues: p(r.despues), guardado: false };
    },
    agregar_movimiento({ fecha, concepto, tipo, monto, categoria } = {}) {
      const cents = toCents(monto);
      if (!engine.isISO(fecha || today) || cents == null || cents <= 0) return { error: 'Datos incompletos para registrar el movimiento.' };
      const datos = { fecha: fecha || today, concepto: String(concepto || (tipo === 'ingreso' ? 'Ingreso' : 'Gasto')).slice(0, 200), tipo: tipo === 'ingreso' ? 'ingreso' : 'egreso',
        monto: (cents / 100).toFixed(2), categoria: engine.CATEGORIAS.includes(categoria) ? categoria : (tipo === 'ingreso' ? 'ingreso_extra' : 'gasto_personal') };
      return { propuesta: { accion: 'agregar_movimiento', datos }, guardado: false, requiere_confirmacion: true };
    },
    marcar_cumplido({ id, monto_real } = {}) {
      const r = rows.find(x => String(x.id) === String(id));
      if (!r || r.origen !== 'plan') return { error: 'No encontré ese movimiento del plan.' };
      const cents = monto_real == null || monto_real === '' ? null : toCents(monto_real);
      if (monto_real != null && monto_real !== '' && (cents == null || cents < 0)) return { error: 'Monto real inválido.' };
      return { propuesta: { accion: 'marcar_cumplido', id: r.id, datos: { estado: 'cumplido', monto_real: cents == null ? null : (cents / 100).toFixed(2) }, concepto: r.concepto, fecha: r.fecha },
        guardado: false, requiere_confirmacion: true };
    }
  };
  return { tools, cur, analyze };
}

// ---------------------------------------------------------------- parsing
const WD = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
function parseFecha(t, today) {
  if (/\bpasado manana\b/.test(t)) return engine.addDays(today, 2);
  if (/\bmanana\b/.test(t)) return engine.addDays(today, 1);
  if (/\bayer\b/.test(t)) return engine.addDays(today, -1);
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(t); if (iso && engine.isISO(iso[1])) return iso[1];
  const dm = new RegExp(`\\b(\\d{1,2}) de (${engine.MESES.join('|')})(?: de (\\d{4}))?`).exec(t);
  if (dm) {
    const m = engine.MESES.indexOf(dm[2]) + 1; let y = dm[3] ? Number(dm[3]) : Number(today.slice(0, 4));
    let f = `${y}-${String(m).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`;
    if (!dm[3] && f < today) f = `${y + 1}-${f.slice(5)}`;
    if (engine.isISO(f)) return f;
  }
  const wd = new RegExp(`\\b(?:el|este|proximo) (${Object.keys(WD).join('|')})\\b`).exec(t);
  if (wd) { let d = today; while (engine.dow(d) !== WD[wd[1]]) d = engine.addDays(d, 1); return d; }
  return today;
}
function parseMonto(raw) {
  const s = String(raw || '');
  const withSign = /\$\s?(\d[\d.,]*)/.exec(s);
  const withWord = /(\d[\d.,]*)\s*(?:dolares|dólares|usd|pesos|bucks)/i.exec(s);
  let m = withSign ? withSign[1] : withWord ? withWord[1] : null;
  if (!m) {
    // first number that is not a day of a month ("15 de noviembre") and not a year
    const re = /(\d[\d.,]*)(?!\s*de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))/gi;
    let x; while ((x = re.exec(s))) { if (!/^\d{4}$/.test(x[1]) || Number(x[1]) < 1900) { m = x[1]; break; } }
  }
  if (!m) return null;
  m = m.replace(/[.,]$/, '');
  const c = toCents(m);
  return c != null && c > 0 ? c : null;
}
function mesEn(t) { const m = new RegExp(`\\b(${engine.MESES.join('|')})\\b`).exec(t); return m ? m[1] : null; }
function obligacionEn(t) {
  if (/\bcorte\b/.test(t)) return 'corte';
  if (/\b(hija|casa de mi hija)\b/.test(t)) return 'hija';
  if (/\b(pago lina|pago de lina|lo de lina|a lina|de lina|lina)\b/.test(t)) return 'pago_lina';
  if (/\binversion\b/.test(t)) return 'inversion';
  if (/\b(salario|sueldo|quincena)\b/.test(t)) return 'salario';
  return null;
}
function findPlanRow(rows, cat, mes, today, { pendiente = true } = {}) {
  let cands = rows.filter(r => r.origen === 'plan' && r.categoria === cat && (!pendiente || r.estado !== 'cumplido'));
  if (mes) {
    const byConcept = cands.filter(r => strip(r.concepto).includes(mes));
    cands = byConcept.length ? byConcept : cands.filter(r => engine.MESES[Number(r.fecha.slice(5, 7)) - 1] === mes);
  }
  cands.sort((a, b) => Math.abs(Date.parse(a.fecha) - Date.parse(today)) - Math.abs(Date.parse(b.fecha) - Date.parse(today)));
  if (!mes) { const fut = cands.filter(r => r.fecha >= engine.addDays(today, -31)).sort((a, b) => a.fecha < b.fecha ? -1 : 1); if (fut.length) return fut[0]; }
  return cands[0] || null;
}

// ---------------------------------------------------------------- recommendations
// Every option is computed by re-running the engine on a modified copy of the
// rows, so each one carries its real effect in numbers.
function recomendaciones(rows, opts, cur) {
  const out = [];
  const today = opts.today;
  const colchon = cur.colchon_meta;
  const withChange = (fn) => engine.analyze(rows.map(r => fn({ ...r })), opts);

  if (cur.saldo_min < colchon) {
    // 1) Reduce or postpone the investment (never an obligation).
    const inv = rows.map(engine.norm).find(r => r.categoria === 'inversion' && r.tipo === 'egreso' && r.fecha >= today && !(r.origen === 'plan' && r.estado === 'cumplido'));
    if (inv) {
      const falta = colchon - cur.saldo_min;
      const reduce = Math.min(inv.cents, Math.ceil(falta / 100) * 100);
      if (reduce > 0) {
        const a = withChange(r => (String(r.id) === String(inv.id) ? { ...r, monto: ((inv.cents - reduce) / 100).toFixed(2), cents: inv.cents - reduce } : r));
        out.push({ texto: `Reduce la inversión del ${fl(inv.fecha)} en ${fmt(reduce)} (de ${fmt(inv.cents)} a ${fmt(inv.cents - reduce)}). Tu punto más bajo pasaría de ${fmt(cur.saldo_min)} a ${fmt(a.saldo_min)} y tu salud de ${cur.score}% a ${a.score}%.`,
          efecto: { saldo_min: fmt(a.saldo_min), score: a.score } });
      }
    }
    // 2) Move a future discretionary expense to after the next salary following the low point.
    const nextSalary = rows.map(engine.norm).filter(r => r.categoria === 'salario' && r.fecha > cur.fecha_min).sort((a, b) => a.fecha < b.fecha ? -1 : 1)[0];
    const disc = rows.map(engine.norm).filter(r => r.tipo === 'egreso' && r.origen === 'real' && ['otro', 'gasto_personal'].includes(r.categoria) && r.fecha > today && r.fecha <= cur.fecha_min)
      .sort((a, b) => b.cents - a.cents)[0];
    if (disc && nextSalary) {
      const a = withChange(r => (String(r.id) === String(disc.id) ? { ...r, fecha: nextSalary.fecha } : r));
      out.push({ texto: `Mueve "${disc.concepto}" (${fmt(disc.cents)}) del ${fl(disc.fecha)} al ${fl(nextSalary.fecha)}, después del salario. Tu punto más bajo quedaría en ${fmt(a.saldo_min)}.`,
        efecto: { saldo_min: fmt(a.saldo_min), score: a.score } });
    }
    // 3) Spend less in the low week.
    out.push({ texto: `La semana del ${fl(engine.weekStart(cur.fecha_min))} al ${fl(engine.weekEnd(cur.fecha_min))} es la más justa: tu saldo baja a ${fmt(cur.saldo_min)}. Cada dólar que gastes de más esa semana lo baja igual; quédate dentro de los ${fmt(cur.presupuesto_semanal)}.`,
      efecto: { saldo_min: fmt(cur.saldo_min) } });
  }
  if (cur.semana.gastado > cur.presupuesto_semanal) {
    out.unshift({ texto: `Esta semana llevas ${fmt(cur.semana.gastado)} de ${fmt(cur.presupuesto_semanal)}: te pasaste ${fmt(cur.semana.gastado - cur.presupuesto_semanal)}. No gastes más hasta el ${fl(cur.semana.hasta)}.`, efecto: {} });
  }
  if (!out.length) {
    out.push({ texto: `Vas según el plan. Mantén los ${fmt(cur.presupuesto_semanal)} semanales; terminarías con ${fmt(cur.saldo_final)}.`, efecto: { saldo_final: fmt(cur.saldo_final) } });
  }
  return out.slice(0, 3);
}

// ---------------------------------------------------------------- heuristic
function heuristic(pregunta, rows, opts) {
  const today = opts.today;
  const t = strip(pregunta);
  const { tools, cur } = makeTools(rows, opts);
  const n = rows.map(engine.norm);
  const alerta = cur.dias_negativos.length
    ? `Atención: tu saldo queda en negativo el ${fl(cur.dias_negativos[0].fecha)} (${fmt(cur.dias_negativos[0].saldo)}). `
    : '';
  const say = (texto, extra = {}) => ({ texto, intent: extra.intent || 'otro', ...extra });

  // 1) hypothetical — never saves
  if (/\bsi (compro|gasto|me gasto|pago|invierto|hago un gasto|recibo|me pagan|me llega|me entran?)\b/.test(t)) {
    const monto = parseMonto(pregunta);
    if (!monto) return say('¿De cuánto sería? Dime el monto y lo simulo sin guardar nada.', { intent: 'simular' });
    const ingreso = /\bsi (recibo|me pagan|me llega|me entran?)\b/.test(t);
    const fecha = parseFecha(t, today);
    const r = tools.simular({ movimientos: [{ fecha, monto: (monto / 100).toFixed(2), tipo: ingreso ? 'ingreso' : 'egreso', concepto: 'Simulación', categoria: 'otro' }] });
    const d = r.despues;
    let txt;
    if (d.dias_negativos.length) txt = `Con ese ${ingreso ? 'ingreso' : 'gasto'} de ${fmt(monto)} el ${fl(fecha)}, tu saldo quedaría negativo: el ${fl(d.dias_negativos[0].fecha)} bajaría a ${d.dias_negativos[0].saldo}. Tu salud caería a ${d.score}% (${d.color}). No te lo recomiendo; no guardé nada.`;
    else txt = `Con ese ${ingreso ? 'ingreso' : 'gasto'} de ${fmt(monto)} el ${fl(fecha)}, tu punto más bajo quedaría en ${d.saldo_min} el ${fl(d.fecha_min)} y tu salud en ${d.score}% (${d.color}), antes ${r.antes.score}%. Es solo una simulación; no guardé nada.`;
    return say(txt, { intent: 'simular', simulacion: r });
  }

  // 2) "ya pagué la corte de noviembre" -> mark the plan row as done (proposal)
  if (/\b(ya pague|pague|ya hice el pago|ya cubri|ya deposite|ya me pagaron|me pagaron el)\b/.test(t) && obligacionEn(t)) {
    const cat = obligacionEn(t); const mes = mesEn(t);
    const row = findPlanRow(n, cat, mes, today);
    if (!row) return say(`No encontré un pago pendiente de ${cat === 'pago_lina' ? 'pago Lina' : cat}${mes ? ' de ' + mes : ''} en tu plan.`, { intent: 'marcar_cumplido' });
    const monto = parseMonto(pregunta);
    const r = tools.marcar_cumplido({ id: row.id, monto_real: monto ? (monto / 100).toFixed(2) : null });
    const real = monto != null ? fmt(monto) : fmt(row.cents);
    return say(`¿Marco "${row.concepto}" del ${fl(row.fecha)} como cumplido por ${real}?`, { intent: 'marcar_cumplido', propuesta: r.propuesta });
  }

  // 3) "hoy gasté $45 en comida" -> new real movement (proposal)
  const esGasto = /\b(gaste|me gaste|compre|pague|gasto de|hice un gasto)\b/.test(t);
  const esIngreso = /\b(recibi|me pagaron|me depositaron|me entro|me entraron|gane|cobre)\b/.test(t);
  if (esGasto || esIngreso) {
    const monto = parseMonto(pregunta);
    if (!monto) return say('¿De cuánto fue? Dime el monto para registrarlo.', { intent: 'agregar_movimiento' });
    const fecha = parseFecha(t, today);
    const en = /\ben ([a-z ]{2,40})$/.exec(t);
    const concepto = en ? en[1].trim().replace(/^\w/, c => c.toUpperCase()) : (esIngreso ? 'Ingreso' : 'Gasto personal');
    const r = tools.agregar_movimiento({ fecha, concepto, tipo: esIngreso ? 'ingreso' : 'egreso', monto: (monto / 100).toFixed(2), categoria: esIngreso ? 'ingreso_extra' : 'gasto_personal' });
    const etiqueta = esIngreso ? 'un ingreso' : 'un egreso';
    const cat = esIngreso ? 'ingreso extra' : 'gasto personal';
    return say(`¿Registro ${etiqueta} de ${fmt(monto)} ${fecha === today ? 'hoy' : 'el ' + fl(fecha)} como ${cat}?`, { intent: 'agregar_movimiento', propuesta: r.propuesta });
  }

  // 4) "¿me alcanza para la corte de diciembre?"
  if (/\b(alcanza|cubierto|cubierta|me da para|puedo pagar|llego a)\b/.test(t)) {
    const cat = obligacionEn(t);
    if (cat) {
      const row = findPlanRow(n, cat, mesEn(t), today);
      if (!row) return say('No encontré ese pago pendiente en tu plan.', { intent: 'alcanza' });
      const step = cur.steps.find(s => String(s.row.id) === String(row.id));
      const ok = step.saldo >= 0;
      return say(ok
        ? `Sí. ${row.concepto} de ${fmt(step.amount)} el ${fl(row.fecha)} está cubierto: después de pagarlo te quedan ${fmt(step.saldo)}.`
        : `No. ${row.concepto} de ${fmt(step.amount)} el ${fl(row.fecha)} te dejaría en ${fmt(step.saldo)}. Hay que liberar dinero antes de esa fecha.`, { intent: 'alcanza' });
    }
  }

  // 5) low point
  if (/\b(punto mas bajo|saldo minimo|mas bajo|minimo)\b/.test(t)) {
    return say(`${alerta}Tu punto más bajo es el ${fl(cur.fecha_min)}, con ${fmt(cur.saldo_min)}. Tu meta de colchón es ${fmt(cur.colchon_meta)}.`, { intent: 'punto_bajo' });
  }

  // 6) this week
  if (/\bsemana\b/.test(t) && /\b(queda|gastar|llevo|presupuesto|gastado|gaste|disponible)\b/.test(t)) {
    const s = cur.semana;
    const resto = s.restante >= 0 ? `te quedan ${fmt(s.restante)}` : `te pasaste ${fmt(-s.restante)}`;
    return say(`Esta semana (del ${fl(s.desde)} al ${fl(s.hasta)}) llevas ${fmt(s.gastado)} de ${fmt(cur.presupuesto_semanal)}: ${resto}.`, { intent: 'semana' });
  }

  // 7) this month
  if (/\bmes\b/.test(t) && /\b(gastado|gaste|llevo|gastos)\b/.test(t)) {
    const ym = today.slice(0, 7);
    let total = 0, nn = 0;
    for (const s of cur.steps) {
      if (s.row.tipo !== 'egreso' || s.row.fecha.slice(0, 7) !== ym || s.row.fecha > today) continue;
      if (s.row.origen === 'real' || s.row.estado === 'cumplido') { total += s.amount; nn++; }
    }
    return say(`Este mes llevas ${fmt(total)} en egresos registrados (${nn} ${nn === 1 ? 'movimiento' : 'movimientos'} reales o pagos marcados como cumplidos).`, { intent: 'mes' });
  }

  // 8) next payments
  if (/\b(proximos? pagos?|que tengo que pagar|que pagos|que viene)\b/.test(t)) {
    const p = tools.proximos_pagos({ dias: 30 }).filter(x => ['corte', 'pago_lina', 'hija', 'inversion'].includes(x.categoria) || toCents(x.monto) >= 100000).slice(0, 4);
    if (!p.length) return say('No tienes pagos grandes en los próximos 30 días.', { intent: 'proximos_pagos' });
    return say(`${alerta}En los próximos 30 días: ` + p.map(x => `${x.concepto} ${x.monto} el ${fl(x.fecha)} (${x.cubierto ? 'cubierto' : 'no cubierto'})`).join('; ') + '.', { intent: 'proximos_pagos' });
  }

  // 9) what should I do
  if (/\b(que debo hacer|que hago|recomienda|recomendacion|consejo|aconseja|como mejoro|que me sugieres)\b/.test(t)) {
    const recs = recomendaciones(rows, opts, cur);
    return say(`${alerta}Tu salud está en ${cur.score}% (${cur.color}). ` + recs.map((r, i) => `${i + 1}) ${r.texto}`).join(' '), { intent: 'recomendaciones', recomendaciones: recs });
  }

  // 10) how am I
  if (/\b(como estoy|como voy|como van|como estan|mis finanzas|mi salud|resumen|como ando)\b/.test(t)) {
    const punto = cur.saldo_min < cur.colchon_meta
      ? `Tu punto más bajo es el ${fl(cur.fecha_min)}, con ${fmt(cur.saldo_min)}, por debajo de tu colchón de ${fmt(cur.colchon_meta)}.`
      : `Tu punto más bajo es ${fmt(cur.saldo_min)} el ${fl(cur.fecha_min)}.`;
    return say(`${alerta}${cur.frase}: tu salud financiera está en ${cur.score}%, en ${cur.color}. Hoy tienes ${fmt(cur.saldo_hoy)}. ${punto}`, { intent: 'estado' });
  }

  // 11) "Lina" with nothing else: the voice or the payment?
  if (/\blina\b/.test(t) && !/^(hola|buenos|buenas|oye)?\s*lina\s*$/.test(t)) {
    return say('¿Me hablas a mí o te refieres al pago Lina de $1,500? Dime cuál y te ayudo.', { intent: 'aclarar' });
  }

  return say('Puedo decirte cómo estás hoy, tu punto más bajo, cuánto te queda esta semana, si te alcanza para un pago, simular un gasto o registrar uno. ¿Qué quieres saber?', { intent: 'ayuda' });
}

// ---------------------------------------------------------------- model path
const TOOL_DEFS = [
  { name: 'obtener_salud', description: 'Salud financiera actual: score, color, A, B, C, D, saldo de hoy, saldo mínimo y su fecha, saldo final.', input_schema: { type: 'object', properties: {} } },
  { name: 'obtener_movimientos', description: 'Movimientos con su saldo acumulado proyectado.', input_schema: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' }, categoria: { type: 'string', enum: engine.CATEGORIAS } } } },
  { name: 'proximos_pagos', description: 'Pagos pendientes en los próximos N días y si quedan cubiertos.', input_schema: { type: 'object', properties: { dias: { type: 'integer' } } } },
  { name: 'gasto_semana', description: 'Gastado esta semana (sábado a viernes) contra el presupuesto.', input_schema: { type: 'object', properties: {} } },
  { name: 'simular', description: 'Calcula salud y saldos con movimientos hipotéticos SIN guardar nada.', input_schema: { type: 'object', properties: { movimientos: { type: 'array', items: { type: 'object', properties: { fecha: { type: 'string' }, concepto: { type: 'string' }, tipo: { type: 'string', enum: ['ingreso', 'egreso'] }, monto: { type: 'string' }, categoria: { type: 'string', enum: engine.CATEGORIAS } }, required: ['tipo', 'monto'] } } }, required: ['movimientos'] } },
  { name: 'agregar_movimiento', description: 'Prepara el registro de un movimiento real. NO guarda: el usuario debe confirmar en pantalla.', input_schema: { type: 'object', properties: { fecha: { type: 'string' }, concepto: { type: 'string' }, tipo: { type: 'string', enum: ['ingreso', 'egreso'] }, monto: { type: 'string' }, categoria: { type: 'string', enum: engine.CATEGORIAS } }, required: ['tipo', 'monto', 'concepto'] } },
  { name: 'marcar_cumplido', description: 'Prepara marcar un movimiento del plan como cumplido con su monto real. NO guarda: el usuario confirma.', input_schema: { type: 'object', properties: { id: { type: 'integer' }, monto_real: { type: 'string' } }, required: ['id'] } }
];

function systemPrompt(today) {
  return `Eres Lina, la asesora financiera personal del usuario dentro del módulo Salud Financiera. Hablas español, de tú, con tono cercano, directo y respetuoso.
Hoy es ${today} (America/New_York).
Reglas:
- Nunca calculas de memoria. Todo número que digas debe venir de una herramienta. Si no tienes el dato, dilo.
- Primero el dato, después la recomendación. Respuestas cortas: 2 a 4 frases.
- ${PRIORIDADES}
- Nunca sugieras dejar de pagar la corte, el pago Lina ni lo de la hija.
- Si la salud está en rojo o algún día queda en negativo, dilo primero y claro.
- Las recomendaciones salen de opciones que puedes calcular con "simular"; cada una muestra su efecto en números.
- Para registrar un gasto o marcar un pago usa agregar_movimiento o marcar_cumplido; NO guardan nada: termina preguntando "¿Lo registro?" para que el usuario confirme en pantalla.
- "Lina" eres tú; "pago Lina" o "lo de Lina" es el pago mensual de $1,500 (categoría pago_lina). Si es ambiguo, pregunta.
- Solo hablas de finanzas personales de este módulo. No das consejos de inversión específicos (acciones, productos); solo flujo de caja y presupuesto.
- No uses emojis ni markdown.`;
}

function numbersIn(s) {
  return (String(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/,/g, '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
}

async function withModel(pregunta, historial, rows, opts, client, model) {
  const { tools } = makeTools(rows, opts);
  const allowed = new Set(numbersIn(pregunta));
  for (const h of historial || []) numbersIn(h.texto || h.content || '').forEach(x => allowed.add(x));
  let propuesta = null;
  const messages = [];
  for (const h of (historial || []).slice(-6)) {
    if (!h || !h.texto) continue;
    messages.push({ role: h.rol === 'lina' ? 'assistant' : 'user', content: String(h.texto).slice(0, 2000) });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  messages.push({ role: 'user', content: String(pregunta).slice(0, 2000) });

  for (let turn = 0; turn < 6; turn++) {
    const resp = await client.messages.create({ model, max_tokens: 600, system: systemPrompt(opts.today), tools: TOOL_DEFS, messages });
    const uses = resp.content.filter(b => b.type === 'tool_use');
    if (!uses.length) {
      const texto = resp.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
      return { texto, propuesta, allowed };
    }
    messages.push({ role: 'assistant', content: resp.content });
    const results = [];
    for (const u of uses) {
      let out;
      try { out = tools[u.name] ? tools[u.name](u.input || {}) : { error: 'herramienta desconocida' }; }
      catch (e) { out = { error: e.message }; }
      if (out && out.propuesta) propuesta = out.propuesta;
      const json = JSON.stringify(out);
      numbersIn(json).forEach(x => allowed.add(x));
      results.push({ type: 'tool_result', tool_use_id: u.id, content: json.slice(0, 12000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { texto: '', propuesta, allowed };
}

// A model reply survives only if every number in it came from a tool or the question.
function verify(texto, allowed) {
  if (!texto) return { ok: false, motivo: 'respuesta vacía' };
  const extra = numbersIn(texto).filter(x => !allowed.has(x) && !/^[1-5]$/.test(x)); // 1)–5) list markers
  if (extra.length) return { ok: false, motivo: 'cifras sin fuente: ' + extra.slice(0, 5).join(', ') };
  return { ok: true };
}

async function answer(pregunta, rows, opts, { historial = [], client = null, model = null } = {}) {
  const base = heuristic(pregunta, rows, opts);
  if (!client) return { ...base, composed_by: 'heuristic', is_simulated: true };
  try {
    const m = await withModel(pregunta, historial, rows, opts, client, model);
    const v = verify(m.texto, m.allowed);
    if (!v.ok) return { ...base, composed_by: 'heuristic', is_simulated: true, motivo_respaldo: v.motivo };
    return { texto: m.texto, intent: 'modelo', propuesta: m.propuesta || null, composed_by: 'model', is_simulated: false };
  } catch (e) {
    return { ...base, composed_by: 'heuristic', is_simulated: true, motivo_respaldo: 'modelo no disponible: ' + e.message.slice(0, 120) };
  }
}

module.exports = { answer, heuristic, makeTools, recomendaciones, verify, numbersIn, parseMonto, parseFecha, TOOL_DEFS };
