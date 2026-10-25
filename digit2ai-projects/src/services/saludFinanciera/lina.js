'use strict';
/**
 * Lina · asesora financiera personal.
 *
 * 1) nlu.interpret() reads what the owner said (intent + date/month/amount).
 * 2) A recognised intent is answered DETERMINISTICALLY from engine/finanzas
 *    figures — exact, instant, no model. Labelled composed_by:'lina'.
 * 3) Anything the reader does not recognise goes to the model (when a key is
 *    configured) with the same read-only tools; a model reply carrying a number
 *    that no tool produced is discarded.
 *
 * Lina never writes. A change ("agrega este gasto", "ya pagué la corte",
 * "borra el gasto de 45") becomes a PENDING proposal; the route executes it
 * only when the owner answers "sí" (or taps Sí), then Lina explains how the
 * projection moved, from a before/after recalculation.
 */
const engine = require('./engine');
const fin = require('./finanzas');
const nlu = require('./nlu');
const kb = require('./conocimiento');
const { toCents, fmt } = require('./money');

const fl = (iso) => engine.fechaLarga(iso);
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const CAT = fin.CAT;
const OBL = ['corte', 'pago_lina', 'hija'];
// The owner may have no colchón (0): then the floor is simply not going negative.
const bajoDe = (c) => (c > 0 ? `por debajo de tu colchón de ${fmt(c)}` : 'en negativo');
const arribaDe = (c) => (c > 0 ? `arriba de tu colchón de ${fmt(c)}` : 'arriba de cero');

function makeTools(rows, opts) {
  const today = opts.today;
  const cur = engine.analyze(rows, opts);
  const mapRow = (s) => ({ id: s.row.id, fecha: s.row.fecha, concepto: s.row.concepto, tipo: s.row.tipo, categoria: s.row.categoria,
    origen: s.row.origen, estado: s.row.estado, monto: fmt(s.amount), saldo: fmt(s.saldo) });
  const money = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' && /saldo|monto|total|ingresos|egresos|minimo|libre|colchon|margen|presupuesto/.test(k) && Number.isInteger(v)) ? fmt(v) : v));
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
    saldo_en_fecha({ fecha } = {}) { return engine.isISO(fecha) ? money(fin.saldoEnFecha(cur, fecha)) : { error: 'fecha AAAA-MM-DD requerida' }; },
    explicar_saldo({ fecha } = {}) { return money(fin.explicarSaldo(cur, engine.isISO(fecha) ? fecha : today)); },
    resumen_mes({ mes } = {}) { return /^\d{4}-\d{2}$/.test(mes || '') ? money(fin.resumenMes(cur, mes)) : { error: 'mes AAAA-MM requerido' }; },
    como_se_calcula() { return fin.comoSeCalcula(cur); },
    buscar_conocimiento({ pregunta } = {}) { const h = kb.buscar(nlu.words(nlu.norm(pregunta))); return h ? { pregunta: h.entrada.p, respuesta: kb.responder(h.entrada, cur, fin) } : { encontrado: false, temas: kb.QA.map(q => q.p) }; },
    plan_para_mantener({ hasta } = {}) { return money(fin.planMantener(cur, engine.isISO(hasta) ? hasta : null)); },
    simular({ movimientos = [] } = {}) {
      const r = engine.simulate(rows, movimientos, opts);
      const p = (a) => ({ score: a.score, color: a.color, saldo_hoy: fmt(a.saldo_hoy), saldo_min: fmt(a.saldo_min), fecha_min: a.fecha_min, saldo_final: fmt(a.saldo_final), dias_negativos: a.dias_negativos.map(d => ({ fecha: d.fecha, saldo: fmt(d.saldo) })) });
      return { antes: p(r.antes), despues: p(r.despues), guardado: false };
    },
    agregar_movimiento({ fecha, concepto, tipo, monto, categoria } = {}) {
      const cents = toCents(monto);
      if (!engine.isISO(fecha || today) || cents == null || cents <= 0) return { error: 'Datos incompletos para registrar el movimiento.' };
      const t = tipo === 'ingreso' ? 'ingreso' : 'egreso';
      const datos = { fecha: fecha || today, concepto: String(concepto || (t === 'ingreso' ? 'Ingreso' : 'Gasto')).slice(0, 200), tipo: t,
        monto: (cents / 100).toFixed(2), categoria: engine.CATEGORIAS.includes(categoria) ? categoria : (t === 'ingreso' ? 'ingreso_extra' : 'gasto_personal') };
      return { propuesta: { accion: 'agregar_movimiento', datos }, guardado: false, requiere_confirmacion: true };
    },
    marcar_cumplido({ id, monto_real } = {}) {
      const r = rows.find(x => String(x.id) === String(id));
      if (!r || r.origen !== 'plan') return { error: 'No encontré ese movimiento del plan.' };
      const cents = monto_real == null || monto_real === '' ? null : toCents(monto_real);
      if (monto_real != null && monto_real !== '' && (cents == null || cents < 0)) return { error: 'Monto real inválido.' };
      return { propuesta: { accion: 'marcar_cumplido', id: r.id, datos: { estado: 'cumplido', monto_real: cents == null ? null : (cents / 100).toFixed(2) }, concepto: r.concepto, fecha: r.fecha }, guardado: false, requiere_confirmacion: true };
    }
  };
  return { tools, cur };
}

// ---------------------------------------------------------------- finding rows
function findPlanRow(n, cat, ent, today) {
  let c = n.filter(r => r.origen === 'plan' && r.categoria === cat && r.estado !== 'cumplido');
  if (ent.mes || ent.fecha) {
    const ym = ent.mes || ent.fecha.slice(0, 7);
    const mesName = engine.MESES[Number(ym.slice(5, 7)) - 1];
    const byName = c.filter(r => nlu.norm(r.concepto).includes(mesName));
    c = byName.length ? byName : c.filter(r => r.fecha.slice(0, 7) === ym);
  } else {
    // nearest one that is due (past pending first, then the next one)
    c = c.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const past = c.filter(r => r.fecha <= today);
    if (past.length) return past[past.length - 1];
  }
  return c.sort((a, b) => (a.fecha < b.fecha ? -1 : 1))[0] || null;
}
function findRows(n, ent, today, { soloReales = false } = {}) {
  const t = ent.texto;
  return n.filter(r => {
    if (soloReales && r.origen !== 'real') return false;
    if (ent.monto && r.cents !== ent.monto && r.realCents !== ent.monto) return false;
    if (ent.fecha && !ent.hoy && r.fecha !== ent.fecha) return false;
    if (ent.hoy && r.fecha !== today) return false;
    if (ent.obligacion && r.categoria !== ent.obligacion) return false;
    const w = nlu.norm(r.concepto).split(/\s+/).filter(x => x.length > 3);
    if (!ent.monto && !ent.obligacion && w.length && !w.some(x => t.includes(x))) return false;
    return true;
  });
}

// ---------------------------------------------------------------- answers
function textoZona(cur) {
  const z = cur.zona;
  if (!z) return `Tu punto más bajo es el ${fl(cur.fecha_min)}, con ${fmt(cur.saldo_min)}.`;
  const r = z.desde === z.hasta ? `el ${fl(z.desde)}` : `del ${fl(z.desde)} al ${fl(z.hasta)}`;
  return z.bajo_colchon
    ? `Ten cuidado ${r}: en esas fechas tu saldo queda ${bajoDe(cur.colchon_meta)} y llega a ${fmt(cur.saldo_min)} el ${fl(cur.fecha_min)}. Entre esas fechas no conviene gastar nada fuera de lo planeado.`
    : `Tu punto más bajo es ${fmt(cur.saldo_min)} ${r}, y sigue ${arribaDe(cur.colchon_meta)}. No hay fechas de riesgo, solo cuida tu presupuesto semanal.`;
}

function textoSaldoFecha(cur, fecha) {
  const s = fin.saldoEnFecha(cur, fecha);
  if (fecha < cur.today) return `Al cierre del ${fl(fecha)} tenías ${fmt(s.saldo)}.`;
  const partes = [];
  const quien = fecha === cur.today ? 'Hoy tienes' : `El ${fl(fecha)} vas a tener`;
  partes.push(`${quien} ${fmt(s.saldo)}${s.saldo !== s.saldo_plan ? ` (el plan original decía ${fmt(s.saldo_plan)}; la diferencia son tus movimientos reales)` : ', tal como dice tu plan'}.`);
  if (s.movimientos_del_dia.length) partes.push(`Ese día: ${s.movimientos_del_dia.map(m => `${m.tipo === 'ingreso' ? 'entra' : 'sale'} ${m.concepto} ${fmt(m.monto)}`).join(', ')}.`);
  if (s.fuera_de_plan) partes.push(`Tu plan solo llega hasta el ${fl(s.ultimo_dato)}; después no hay movimientos cargados. Usa "Extender plan" para proyectar más lejos.`);
  else if (s.fecha_minimo_despues !== fecha) {
    partes.push(s.libre > 0
      ? `Pero no es todo disponible: de ahí en adelante tu punto más bajo es ${fmt(s.minimo_despues)} el ${fl(s.fecha_minimo_despues)}. Lo que de verdad puedes gastar ${s.colchon > 0 ? `sin bajar de tu colchón de ${fmt(s.colchon)}` : 'sin quedar en negativo'} son ${fmt(s.libre)}.`
      : `Pero no es dinero libre: de ahí en adelante bajas a ${fmt(s.minimo_despues)} el ${fl(s.fecha_minimo_despues)}, ${bajoDe(s.colchon)}. Cualquier gasto extra antes de esa fecha te deja más corto.`);
  }
  return partes.join(' ');
}

function textoResumenMes(cur, ym) {
  const r = fin.resumenMes(cur, ym);
  const nombre = engine.MESES[Number(ym.slice(5, 7)) - 1];
  if (r.fuera_de_plan) return `Tu plan llega hasta el ${fl(r.ultimo_dato)}; ${nombre} todavía no tiene movimientos. Usa "Extender plan" y te digo cómo queda.`;
  const grandes = r.grandes.slice(0, 5).map(g => `${g.concepto} ${g.tipo === 'ingreso' ? '+' : '-'}${fmt(g.monto)} el ${Number(g.fecha.slice(8))}`).join(', ');
  return `En ${nombre} empiezas con ${fmt(r.saldo_inicio)}, entran ${fmt(r.ingresos)} y salen ${fmt(r.egresos)}, así que cierras el mes con ${fmt(r.saldo_fin)}. ` +
    `El día más apretado es el ${fl(r.fecha_minimo)}, con ${fmt(r.minimo)}${r.minimo < Math.max(cur.colchon_meta, 0) || r.minimo < 0 ? `, ${bajoDe(cur.colchon_meta)}` : ''}. ` +
    (grandes ? `Lo principal del mes: ${grandes}.` : '');
}

// Cause, not inventory: 2 to 4 short sentences.
function textoExplicarSaldo(cur, fecha) {
  const p = fin.porQueSaldo(cur, fecha);
  const lista = (xs) => xs.length === 1 ? xs[0] : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
  const item = (x) => x.grupo ? `${x.nombre} (${fmt(x.monto)} en ${x.n} pagos)` : `${x.nombre} (${fmt(x.monto)}, ${fl(x.fecha)})`;
  const cuando = fecha === cur.today ? 'Hoy' : `El ${fl(fecha)}`;
  const out = [];

  if (!p.desde_hoy) {
    // today or a past date: what moved that day
    const ing = p.del_dia.filter(m => m.tipo === 'ingreso'), egr = p.del_dia.filter(m => m.tipo === 'egreso');
    const sIng = ing.reduce((x, m) => x + m.monto, 0), sEgr = egr.reduce((x, m) => x + m.monto, 0);
    let t = `${cuando} tienes ${fmt(p.saldo)} porque `;
    if (!p.del_dia.length) t += `no hubo movimientos y vienes con ese saldo.`;
    else {
      const partes = [];
      if (p.antes_del_dia) partes.push(`venías con ${fmt(p.antes_del_dia)}`);
      if (sIng) partes.push(`entran ${fmt(sIng)} (${lista(ing.slice(0, 4).map(m => m.concepto))})`);
      if (sEgr) partes.push(`salen ${fmt(sEgr)}`); else partes.push('todavía no sale nada');
      t += lista(partes) + '.';
    }
    out.push(t);
    const prox = cur.steps.find(s => s.row.fecha > fecha && s.row.tipo === 'egreso' && s.amount >= 100000);
    if (prox) out.push(`Ojo: el ${fl(prox.row.fecha)} sale ${prox.row.concepto} (${fmt(prox.amount)}) y bajas a ${fmt(prox.saldo)}.`);
    return out.join(' ');
  }

  // a future date: the day's trigger, then the cause over the stretch
  const salidasDia = p.del_dia.filter(m => m.tipo === 'egreso');
  if (p.saldo < 0 && p.antes_del_dia >= 0 && salidasDia.length) {
    const entrDia = p.del_dia.filter(m => m.tipo === 'ingreso');
    out.push(`${cuando} quedas en ${fmt(p.saldo)} porque ese día pagas ${lista(salidasDia.map(m => `${m.concepto} (${fmt(m.monto)})`))}${entrDia.length ? ` y solo entran ${lista(entrDia.map(m => `${m.concepto} (${fmt(m.monto)})`))}` : ''}, y llegabas con ${fmt(p.antes_del_dia)}: te faltan ${fmt(-p.saldo)}.`);
  } else {
    out.push(`${cuando} ${p.saldo < 0 ? 'quedas en' : 'tienes'} ${fmt(p.saldo)}.`);
  }
  out.push(p.sale > p.entra
    ? `La causa: de hoy al ${fl(fecha)} salen ${fmt(p.sale)} y entran ${fmt(p.entra)}, ${fmt(p.sale - p.entra)} más de lo que entra, y eso se come lo que tienes hoy (${fmt(p.saldo_inicio)}). Lo que más pesa es ${lista(p.pesan.slice(0, 2).map(item))}.`
    : `De hoy al ${fl(fecha)} entran ${fmt(p.entra)} y salen ${fmt(p.sale)}, así que sumas ${fmt(p.entra - p.sale)} a lo que tienes hoy (${fmt(p.saldo_inicio)}).`);
  if (p.falta_para_cero) out.push(`Para no quedar en negativo necesitas liberar ${fmt(p.falta_para_cero)} antes de esa fecha${p.colchon > 0 ? `; para mantener tu colchón de ${fmt(p.colchon)}, ${fmt(p.falta_para_colchon)}` : ''}.`);
  else if (p.colchon > 0 && p.falta_para_colchon) out.push(`Estás ${fmt(p.falta_para_colchon)} por debajo de tu colchón de ${fmt(p.colchon)} ese día.`);
  return out.join(' ');
}

function textoCalculo(cur, foco) {
  const c = fin.comoSeCalcula(cur);
  let s = 'La proyección se arma así: ' + c.reglas.join(' ');
  if (foco && foco > cur.today) {
    const steps = cur.steps.filter(x => x.row.fecha > cur.today && x.row.fecha <= foco && x.amount > 0);
    const ing = steps.filter(x => x.row.tipo === 'ingreso').reduce((a, x) => a + x.amount, 0);
    const egr = steps.filter(x => x.row.tipo === 'egreso').reduce((a, x) => a + x.amount, 0);
    const fin2 = fin.saldoEnFecha(cur, foco).saldo;
    s += ` Para el ${fl(foco)}: partes de hoy con ${fmt(cur.saldo_hoy)}, entran ${fmt(ing)}, salen ${fmt(egr)} y llegas a ${fmt(fin2)}.`;
  }
  return s + ' ' + c.salud;
}

function textoMantener(cur, rows, opts, foco) {
  const p = fin.planMantener(cur, foco && foco > cur.today ? foco : null);
  const partes = [];
  partes.push(p.margen >= 0
    ? `Para mantener la proyección tienes un margen de ${fmt(p.margen)} ${cur.colchon_meta > 0 ? 'sobre tu colchón' : 'antes de quedar en negativo'} hasta el ${fl(p.fecha_min)}, que es tu punto más bajo (${fmt(p.saldo_min)}).`
    : `Hoy la proyección ya está ${fmt(-p.margen)} ${cur.colchon_meta > 0 ? 'por debajo de tu colchón' : 'en negativo'} en su punto más bajo (${fmt(p.saldo_min)} el ${fl(p.fecha_min)}), así que no hay margen para gastos extra.`);
  if (p.ingresos_que_deben_llegar.length) partes.push(`Tienen que llegar: ${p.ingresos_que_deben_llegar.slice(0, 5).map(i => `${i.concepto} ${fmt(i.monto)} el ${fl(i.fecha)}`).join(', ')}.`);
  partes.push(`Y necesitas quedarte en ${fmt(p.presupuesto)} por semana${p.semanas_de_presupuesto ? ` durante ${plural(p.semanas_de_presupuesto, 'semana', 'semanas')}` : ''}.`);
  const recs = recomendaciones(rows, opts, cur);
  if (recs.length && cur.saldo_min < cur.colchon_meta) partes.push('Para mejorarla: ' + recs[0].texto);
  return partes.join(' ');
}

// Every option re-runs the engine on a modified copy, so each carries its real effect.
function recomendaciones(rows, opts, cur) {
  const out = [];
  const today = opts.today;
  const n = rows.map(engine.norm);
  const withChange = (fn) => engine.analyze(rows.map(r => fn({ ...r })), opts);
  if (cur.saldo_min < cur.colchon_meta) {
    const inv = n.find(r => r.categoria === 'inversion' && r.tipo === 'egreso' && r.fecha >= today && !(r.origen === 'plan' && r.estado === 'cumplido'));
    if (inv) {
      const reduce = Math.min(inv.cents, Math.ceil((cur.colchon_meta - cur.saldo_min) / 100) * 100);
      if (reduce > 0) {
        const a = withChange(r => (String(r.id) === String(inv.id) ? { ...r, cents: inv.cents - reduce, monto: ((inv.cents - reduce) / 100).toFixed(2) } : r));
        out.push({ texto: `Reduce la inversión del ${fl(inv.fecha)} en ${fmt(reduce)} (de ${fmt(inv.cents)} a ${fmt(inv.cents - reduce)}). Tu punto más bajo pasaría de ${fmt(cur.saldo_min)} a ${fmt(a.saldo_min)} y tu salud de ${cur.score}% a ${a.score}%.`, efecto: { saldo_min: fmt(a.saldo_min), score: a.score } });
      }
    }
    const nextSalary = n.filter(r => r.categoria === 'salario' && r.fecha > cur.fecha_min).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))[0];
    const disc = n.filter(r => r.tipo === 'egreso' && r.origen === 'real' && ['otro', 'gasto_personal'].includes(r.categoria) && r.fecha > today && r.fecha <= cur.fecha_min).sort((a, b) => b.cents - a.cents)[0];
    if (disc && nextSalary) {
      const a = withChange(r => (String(r.id) === String(disc.id) ? { ...r, fecha: nextSalary.fecha } : r));
      out.push({ texto: `Mueve "${disc.concepto}" (${fmt(disc.cents)}) del ${fl(disc.fecha)} al ${fl(nextSalary.fecha)}, después del salario. Tu punto más bajo quedaría en ${fmt(a.saldo_min)}.`, efecto: { saldo_min: fmt(a.saldo_min), score: a.score } });
    }
    out.push({ texto: `La semana del ${fl(engine.weekStart(cur.fecha_min))} al ${fl(engine.weekEnd(cur.fecha_min))} es la más justa: tu saldo baja a ${fmt(cur.saldo_min)}. Cada dólar extra esa semana lo baja igual; quédate dentro de los ${fmt(cur.presupuesto_semanal)}.`, efecto: { saldo_min: fmt(cur.saldo_min) } });
  }
  if (cur.semana.gastado > cur.presupuesto_semanal) out.unshift({ texto: `Esta semana llevas ${fmt(cur.semana.gastado)} de ${fmt(cur.presupuesto_semanal)}: te pasaste ${fmt(cur.semana.gastado - cur.presupuesto_semanal)}. No gastes más hasta el ${fl(cur.semana.hasta)}.`, efecto: {} });
  if (!out.length) out.push({ texto: `Vas según el plan. Mantén los ${fmt(cur.presupuesto_semanal)} semanales; terminarías con ${fmt(cur.saldo_final)}.`, efecto: { saldo_final: fmt(cur.saldo_final) } });
  return out.slice(0, 3);
}

function preguntaPropuesta(p, today) {
  const d = p.datos || {};
  if (p.accion === 'agregar_movimiento') {
    return `¿Registro ${d.tipo === 'ingreso' ? 'un ingreso' : 'un egreso'} de ${fmt(toCents(d.monto))} ${d.fecha === today ? 'hoy' : 'el ' + fl(d.fecha)} como ${CAT[d.categoria]}${d.concepto && !/^(Gasto|Ingreso)$/.test(d.concepto) ? ` ("${d.concepto}")` : ''}? Dime sí o no.`;
  }
  if (p.accion === 'marcar_cumplido') return `¿Marco "${p.concepto}" del ${fl(p.fecha)} como cumplido${d.monto_real ? ` por ${fmt(toCents(d.monto_real))}` : ' por el monto del plan'}? Dime sí o no.`;
  if (p.accion === 'editar') return `¿Cambio "${p.concepto}" del ${fl(p.fecha)} de ${fmt(toCents(p.monto_antes))} a ${fmt(toCents(d.monto))}? Dime sí o no.`;
  if (p.accion === 'borrar') return `¿Borro "${p.concepto}" de ${fmt(toCents(p.monto_antes))} del ${fl(p.fecha)}? Dime sí o no.`;
  return '¿Lo hago? Dime sí o no.';
}

/**
 * Deterministic answer. state = { pendiente, contexto }.
 * Returns { texto, intent, propuesta?, ejecutar?, limpiar_pendiente?, contexto }.
 */
function heuristic(pregunta, rows, opts, state = {}) {
  const today = opts.today;
  const { tools, cur } = makeTools(rows, opts);
  const n = rows.map(engine.norm);
  const ctx = { ...(state.contexto || {}) };
  const ent = nlu.interpret(pregunta, today);
  const alerta = cur.dias_negativos.length ? `Atención: tu saldo queda en negativo el ${fl(cur.dias_negativos[0].fecha)} (${fmt(cur.dias_negativos[0].saldo)}). ` : '';
  const foco = ent.fecha || (ent.mes ? null : ctx.fecha) || null;
  const out = (texto, extra = {}) => {
    if (ent.fecha) { ctx.fecha = ent.fecha; delete ctx.mes; }
    if (ent.mes) { ctx.mes = ent.mes; delete ctx.fecha; }
    return { texto, intent: ent.intent, contexto: ctx, ...extra };
  };
  const pend = state.pendiente;

  // --- conversation about a pending change
  if (pend) {
    if (ent.intent === 'confirmar') {
      if (pend.falta) return out(pend.falta === 'monto' ? '¿De cuánto es? Dime el monto.' : '¿Me confirmas los datos?');
      const p = JSON.parse(JSON.stringify(pend));
      if (ent.categoria && p.accion === 'agregar_movimiento') p.datos.categoria = ent.categoria;
      return out('', { ejecutar: p });
    }
    if (ent.intent === 'cancelar') return out('Listo, no registré nada.', { limpiar_pendiente: true });
    if (pend.falta === 'monto' && ent.monto && ['monto_suelto', 'desconocido', 'agregar', 'saldo_fecha'].includes(ent.intent)) {
      const p = { ...pend, datos: { ...pend.datos, monto: (ent.monto / 100).toFixed(2) } }; delete p.falta;
      if (ent.fecha) p.datos.fecha = ent.fecha;
      if (/^(Gasto|Ingreso)$/.test(p.datos.concepto || '')) p.datos.concepto = nlu.concepto(pregunta, ent.texto, pend.datos.tipo);
      p.datos.categoria = pend.datos.tipo === 'ingreso' ? pend.datos.categoria : nlu.categoria(ent.texto + ' ' + nlu.norm(pend.datos.concepto), 'egreso', ent.monto);
      return out(preguntaPropuesta(p, today), { propuesta: p });
    }
  }

  // Lina's memory (50 Q&A). Writes, simulations and date questions always win;
  // general intents yield to a strong match; unknown questions use any match.
  const HARD = ['agregar', 'cumplido', 'editar', 'borrar', 'confirmar', 'cancelar', 'simular', 'alcanza', 'resumen_mes', 'saldo_fecha', 'semana', 'mes_gastado', 'proximos', 'monto_suelto', 'explicar_calculo'];
  const hard = HARD.includes(ent.intent) && !(ent.intent === 'simular' && !ent.monto) && !(ent.intent === 'alcanza' && !ent.obligacion) && !(ent.intent === 'saldo_fecha' && ent.solo_fecha);
  const hit = hard ? null : kb.buscar(ent.texto);
  if (hit && (['desconocido', 'aclarar', 'saludo', 'gracias'].includes(ent.intent) || hit.puntaje >= 3)) {
    return out(kb.responder(hit.entrada, cur, fin), { intent: 'conocimiento', conocimiento: hit.entrada.id });
  }

  switch (ent.intent) {
    case 'saludo': return out(`Hola. ${alerta}Tu salud está en ${cur.score}% (${cur.color}) y hoy tienes ${fmt(cur.saldo_hoy)}. Pregúntame lo que quieras de tu dinero, o dime un gasto o un ingreso y lo registro.`);
    case 'gracias': return out('Con gusto. Aquí estoy cuando quieras revisar tus números.');
    case 'confirmar': return out('No tengo ningún cambio pendiente. Dime qué quieres registrar, por ejemplo "agrega un gasto de 45 en comida".');
    case 'cancelar': return out('Está bien. ¿Qué más quieres revisar?');

    case 'simular': {
      if (!ent.monto) return out('¿De cuánto sería? Dime el monto y lo simulo sin guardar nada.');
      const fecha = ent.fecha || today;
      const ingreso = ent.tipo === 'ingreso';
      const r = tools.simular({ movimientos: [{ fecha, monto: (ent.monto / 100).toFixed(2), tipo: ingreso ? 'ingreso' : 'egreso', concepto: 'Simulación', categoria: 'otro' }] });
      const d = r.despues;
      const t = d.dias_negativos.length
        ? `Con ese ${ingreso ? 'ingreso' : 'gasto'} de ${fmt(ent.monto)} el ${fl(fecha)}, tu saldo quedaría negativo: el ${fl(d.dias_negativos[0].fecha)} bajaría a ${d.dias_negativos[0].saldo}. Tu salud caería a ${d.score}% (${d.color}). No te lo recomiendo; no guardé nada.`
        : `Con ese ${ingreso ? 'ingreso' : 'gasto'} de ${fmt(ent.monto)} el ${fl(fecha)}, tu punto más bajo quedaría en ${d.saldo_min} el ${fl(d.fecha_min)} y tu salud en ${d.score}% (${d.color}), antes ${r.antes.score}%. Es solo una simulación; no guardé nada.`;
      return out(t, { simulacion: r });
    }

    case 'agregar': {
      const datos = { fecha: ent.fecha && !ent.mes ? ent.fecha : today, concepto: ent.concepto, tipo: ent.tipo, categoria: ent.categoria };
      if (!ent.monto) return out(`¿De cuánto es ${ent.tipo === 'ingreso' ? 'el ingreso' : 'el gasto'}?`, { propuesta: { accion: 'agregar_movimiento', datos, falta: 'monto' } });
      const r = tools.agregar_movimiento({ ...datos, monto: (ent.monto / 100).toFixed(2) });
      if (r.error) return out(r.error);
      return out(preguntaPropuesta(r.propuesta, today), { propuesta: r.propuesta });
    }

    case 'cumplido': {
      const row = findPlanRow(n, ent.obligacion, ent, today);
      if (!row) return out(`No encontré un pago pendiente de ${CAT[ent.obligacion] || ent.obligacion}${ent.mes ? ' en ' + engine.MESES[Number(ent.mes.slice(5, 7)) - 1] : ''} en tu plan.`);
      const r = tools.marcar_cumplido({ id: row.id, monto_real: ent.monto ? (ent.monto / 100).toFixed(2) : null });
      return out(preguntaPropuesta(r.propuesta, today), { propuesta: r.propuesta });
    }

    case 'editar': {
      const target = { ...ent, monto: null };
      let cands = ent.obligacion ? [findPlanRow(n, ent.obligacion, ent, today)].filter(Boolean) : findRows(n, target, today);
      if (!cands.length) return out('No encontré cuál movimiento quieres cambiar. Dime el concepto y la fecha, por ejemplo "cambia el pago Lina de diciembre a 1,400".');
      if (cands.length > 1) return out(`Encontré ${cands.length} movimientos: ${cands.slice(0, 4).map(r => `${r.concepto} del ${fl(r.fecha)}`).join(', ')}. ¿Cuál cambio?`);
      const r = cands[0];
      const p = { accion: 'editar', id: r.id, concepto: r.concepto, fecha: r.fecha, monto_antes: (r.cents / 100).toFixed(2), datos: { monto: (ent.monto / 100).toFixed(2) } };
      return out(preguntaPropuesta(p, today), { propuesta: p });
    }

    case 'borrar': {
      const cands = findRows(n, ent, today, { soloReales: true });
      if (!cands.length) return out('No encontré ese movimiento entre los que registraste. Los del plan no se borran: dime "ya pagué..." o "cambia ... a ..." para ajustarlos.');
      if (cands.length > 1) return out(`Encontré ${cands.length}: ${cands.slice(0, 4).map(r => `${r.concepto} ${fmt(r.cents)} del ${fl(r.fecha)}`).join(', ')}. ¿Cuál borro?`);
      const r = cands[0];
      const p = { accion: 'borrar', id: r.id, concepto: r.concepto, fecha: r.fecha, monto_antes: (r.cents / 100).toFixed(2), datos: {} };
      return out(preguntaPropuesta(p, today), { propuesta: p });
    }

    case 'alcanza': {
      if (!ent.obligacion) break;
      const row = findPlanRow(n, ent.obligacion, ent, today);
      if (!row) return out('No encontré ese pago pendiente en tu plan.');
      const step = cur.steps.find(s => String(s.row.id) === String(row.id));
      return out(step.saldo >= 0
        ? `Sí. ${row.concepto} de ${fmt(step.amount)} el ${fl(row.fecha)} está cubierto: después de pagarlo te quedan ${fmt(step.saldo)}.`
        : `No. ${row.concepto} de ${fmt(step.amount)} el ${fl(row.fecha)} te dejaría en ${fmt(step.saldo)}. Hay que liberar dinero antes de esa fecha.`);
    }

    case 'explicar_calculo': return out(textoCalculo(cur, foco));
    case 'explicar_saldo': {
      const f = ent.fecha && !ent.hoy ? ent.fecha : (ent.hoy ? today : (foco || today));
      const pre = cur.dias_negativos.length && cur.dias_negativos[0].fecha !== f ? alerta : '';
      return out(pre + textoExplicarSaldo(cur, f));
    }
    case 'mantener': return out(alerta + textoMantener(cur, rows, opts, foco));
    case 'saldo_fecha': return out(alerta + textoSaldoFecha(cur, ent.fecha || today));
    case 'resumen_mes': return out(alerta + textoResumenMes(cur, ent.mes));
    case 'punto_bajo': case 'cuidado': return out(alerta + textoZona(cur));
    case 'semana': {
      const s = cur.semana;
      return out(`Esta semana (del ${fl(s.desde)} al ${fl(s.hasta)}) tienes ${fmt(s.disponible)} para gastos personales${s.acumulado_previo > 0 ? `: ${fmt(s.presupuesto)} de la semana más ${fmt(s.acumulado_previo)} que no gastaste antes` : ''}. Llevas ${fmt(s.gastado)}, así que ${s.restante >= 0 ? `te quedan ${fmt(s.restante)}` : `te pasaste ${fmt(-s.restante)}`}. Lo que no gastes se acumula para la próxima semana.`);
    }
    case 'mes_gastado': {
      const ym = ent.mes || today.slice(0, 7); let total = 0, k = 0;
      for (const s of cur.steps) if (s.row.tipo === 'egreso' && s.row.fecha.slice(0, 7) === ym && s.row.fecha <= today && (s.row.origen === 'real' || s.row.estado === 'cumplido')) { total += s.amount; k++; }
      return out(`Este mes llevas ${fmt(total)} en egresos registrados (${plural(k, 'movimiento real o pago marcado como cumplido', 'movimientos reales o pagos marcados como cumplidos')}).`);
    }
    case 'proximos': {
      const p = tools.proximos_pagos({ dias: 30 }).filter(x => ['corte', 'pago_lina', 'hija', 'inversion'].includes(x.categoria) || toCents(x.monto) >= 100000).slice(0, 4);
      if (!p.length) return out('No tienes pagos grandes en los próximos 30 días.');
      return out(`${alerta}En los próximos 30 días: ` + p.map(x => `${x.concepto} ${x.monto} el ${fl(x.fecha)} (${x.cubierto ? 'cubierto' : 'no cubierto'})`).join('; ') + '.');
    }
    case 'recomendar': {
      const recs = recomendaciones(rows, opts, cur);
      return out(`${alerta}Tu salud está en ${cur.score}% (${cur.color}). ` + recs.map((r, i) => `${i + 1}) ${r.texto}`).join(' '), { recomendaciones: recs });
    }
    case 'estado': {
      const punto = (cur.saldo_min < cur.colchon_meta || cur.saldo_min < 0)
        ? `Tu punto más bajo es el ${fl(cur.fecha_min)}, con ${fmt(cur.saldo_min)}, ${bajoDe(cur.colchon_meta)}.`
        : `Tu punto más bajo es ${fmt(cur.saldo_min)} el ${fl(cur.fecha_min)}.`;
      return out(`${alerta}${cur.frase}: tu salud financiera está en ${cur.score}%, en ${cur.color}. Hoy tienes ${fmt(cur.saldo_hoy)}. ${punto}`);
    }
    case 'aclarar': return out('¿Me hablas a mí o te refieres al pago Lina de $1,500? Dime cuál y te ayudo.');
    default: break;
  }
  return out('', { desconocido: true });
}

const AYUDA = 'Puedo decirte cuánto vas a tener en una fecha o en un mes, explicarte de dónde sale tu saldo y cómo se calcula la proyección, qué hacer para mantenerla, y registrar gastos o ingresos ("agrega un gasto de 45 en comida"). ¿Qué quieres saber?';

/** Plain-language effect of an executed change. */
function explicarCambio(p, antes, despues, foco) {
  const d = p.datos || {};
  let s;
  if (p.accion === 'agregar_movimiento') s = `Listo, registré ${d.tipo === 'ingreso' ? 'un ingreso' : 'un egreso'} de ${fmt(toCents(d.monto))} ${d.fecha === antes.today ? 'hoy' : 'el ' + fl(d.fecha)} como ${CAT[d.categoria]}.`;
  else if (p.accion === 'marcar_cumplido') s = `Listo, marqué "${p.concepto}" como cumplido${d.monto_real ? ` por ${fmt(toCents(d.monto_real))}` : ''}.`;
  else if (p.accion === 'editar') s = `Listo, cambié "${p.concepto}" a ${fmt(toCents(d.monto))}.`;
  else s = `Listo, borré "${p.concepto}".`;
  const parts = [s];
  if (antes.saldo_hoy !== despues.saldo_hoy) parts.push(`Hoy tu saldo pasa de ${fmt(antes.saldo_hoy)} a ${fmt(despues.saldo_hoy)}.`);
  if (foco && foco > antes.today) {
    const a = fin.saldoEnFecha(antes, foco).saldo, b = fin.saldoEnFecha(despues, foco).saldo;
    parts.push(a !== b ? `El ${fl(foco)} tendrás ${fmt(b)} (antes ${fmt(a)}).` : `El ${fl(foco)} sigues con ${fmt(b)}.`);
  }
  if (antes.saldo_min !== despues.saldo_min || antes.fecha_min !== despues.fecha_min) {
    parts.push(`Tu punto más bajo pasa de ${fmt(antes.saldo_min)} (${fl(antes.fecha_min)}) a ${fmt(despues.saldo_min)} (${fl(despues.fecha_min)}).`);
  } else if (d.categoria === 'gasto_personal' && p.accion === 'agregar_movimiento' && despues.semana.gastado <= despues.presupuesto_semanal) {
    parts.push(`Tu punto más bajo no cambia (${fmt(despues.saldo_min)} el ${fl(despues.fecha_min)}) porque ese gasto entra en tu presupuesto semanal: llevas ${fmt(despues.semana.gastado)} de ${fmt(despues.presupuesto_semanal)}.`);
  } else parts.push(`Tu punto más bajo sigue en ${fmt(despues.saldo_min)} el ${fl(despues.fecha_min)}.`);
  if (antes.saldo_final !== despues.saldo_final) parts.push(`Terminas el plan con ${fmt(despues.saldo_final)} (antes ${fmt(antes.saldo_final)}).`);
  parts.push(antes.score !== despues.score ? `Tu salud pasa de ${antes.score}% a ${despues.score}% (${despues.color}).` : `Tu salud sigue en ${despues.score}% (${despues.color}).`);
  if (despues.dias_negativos.length) parts.unshift(`Atención: con este cambio tu saldo queda en negativo el ${fl(despues.dias_negativos[0].fecha)} (${fmt(despues.dias_negativos[0].saldo)}).`);
  return parts.join(' ');
}

// ---------------------------------------------------------------- model path (open questions only)
const S = (props, req) => ({ type: 'object', properties: props, ...(req ? { required: req } : {}) });
const TOOL_DEFS = [
  { name: 'obtener_salud', description: 'Salud financiera actual: score, color, A, B, C, D, saldo de hoy, saldo mínimo y su fecha, saldo final.', input_schema: S({}) },
  { name: 'saldo_en_fecha', description: 'Saldo proyectado al cierre de una fecha (AAAA-MM-DD), lo que entra y sale ese día, y cuánto queda libre sobre el colchón de ahí en adelante.', input_schema: S({ fecha: { type: 'string' } }, ['fecha']) },
  { name: 'resumen_mes', description: 'Un mes (AAAA-MM): saldo al empezar, ingresos, egresos, saldo al cerrar y día más bajo.', input_schema: S({ mes: { type: 'string' } }, ['mes']) },
  { name: 'explicar_saldo', description: 'De qué ingresos y egresos se compone el saldo a una fecha.', input_schema: S({ fecha: { type: 'string' } }) },
  { name: 'como_se_calcula', description: 'Reglas de la proyección y de la salud.', input_schema: S({}) },
  { name: 'plan_para_mantener', description: 'Qué tiene que pasar para mantener la proyección: margen, ingresos que deben llegar, pagos y presupuesto semanal.', input_schema: S({ hasta: { type: 'string' } }) },
  { name: 'buscar_conocimiento', description: 'Memoria de Lina: 50 preguntas y respuestas sobre salud financiera (colchón, presupuesto, deudas, ahorro, hábitos), personalizadas con los datos del usuario.', input_schema: S({ pregunta: { type: 'string' } }, ['pregunta']) },
  { name: 'obtener_movimientos', description: 'Movimientos con su saldo acumulado proyectado.', input_schema: S({ desde: { type: 'string' }, hasta: { type: 'string' }, categoria: { type: 'string', enum: engine.CATEGORIAS } }) },
  { name: 'proximos_pagos', description: 'Pagos pendientes en los próximos N días y si quedan cubiertos.', input_schema: S({ dias: { type: 'integer' } }) },
  { name: 'gasto_semana', description: 'Gastado esta semana (sábado a viernes) contra el presupuesto.', input_schema: S({}) },
  { name: 'simular', description: 'Calcula salud y saldos con movimientos hipotéticos SIN guardar nada.', input_schema: S({ movimientos: { type: 'array', items: S({ fecha: { type: 'string' }, concepto: { type: 'string' }, tipo: { type: 'string', enum: ['ingreso', 'egreso'] }, monto: { type: 'string' }, categoria: { type: 'string', enum: engine.CATEGORIAS } }, ['tipo', 'monto']) } }, ['movimientos']) },
  { name: 'agregar_movimiento', description: 'Prepara el registro de un movimiento real. NO guarda: el usuario confirma diciendo sí.', input_schema: S({ fecha: { type: 'string' }, concepto: { type: 'string' }, tipo: { type: 'string', enum: ['ingreso', 'egreso'] }, monto: { type: 'string' }, categoria: { type: 'string', enum: engine.CATEGORIAS } }, ['tipo', 'monto', 'concepto']) },
  { name: 'marcar_cumplido', description: 'Prepara marcar un movimiento del plan como cumplido con su monto real. NO guarda: el usuario confirma.', input_schema: S({ id: { type: 'integer' }, monto_real: { type: 'string' } }, ['id']) }
];

function systemPrompt(today) {
  return `Eres Lina, la asesora financiera personal del usuario en el módulo Salud Financiera. Hablas español, de tú, cercana, directa y respetuosa.
Hoy es ${today} (America/New_York).
- Nunca calculas de memoria ni sumas tú: todo número que digas debe venir tal cual de una herramienta. Si no tienes el dato, dilo.
- Primero el dato, después la recomendación. 2 a 4 frases.
- Prioridades: 1) nunca quedar en negativo, 2) cubrir corte, pago Lina y casa de su hija, 3) mantener el colchón, 4) respetar el presupuesto semanal, 5) invertir solo lo que sobra.
- Nunca sugieras dejar de pagar la corte, el pago Lina ni lo de la hija. No das consejos de inversión específicos.
- Para registrar algo usa agregar_movimiento o marcar_cumplido y termina con "¿Lo registro?": no se guarda hasta que diga sí.
- "Lina" eres tú; "pago Lina" es el pago mensual de $1,500. Si es ambiguo, pregunta.
- Solo hablas de sus finanzas personales. Sin emojis ni markdown.`;
}

function numbersIn(s) {
  return (String(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/,/g, '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
}
function verify(texto, allowed) {
  if (!texto) return { ok: false, motivo: 'respuesta vacía' };
  const extra = numbersIn(texto).filter(x => !allowed.has(x) && !/^[1-5]$/.test(x));
  return extra.length ? { ok: false, motivo: 'cifras sin fuente: ' + extra.slice(0, 5).join(', ') } : { ok: true };
}

async function withModel(pregunta, historial, rows, opts, client, model) {
  const { tools } = makeTools(rows, opts);
  const allowed = new Set(numbersIn(pregunta));
  let propuesta = null;
  const messages = [];
  for (const h of (historial || []).slice(-6)) { if (h && h.texto) messages.push({ role: h.rol === 'lina' ? 'assistant' : 'user', content: String(h.texto).slice(0, 2000) }); numbersIn((h && h.texto) || '').forEach(x => allowed.add(x)); }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const merged = [];
  for (const m of messages) { if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += '\n' + m.content; else merged.push({ ...m }); }
  if (merged.length && merged[merged.length - 1].role === 'user') merged[merged.length - 1].content += '\n' + pregunta; else merged.push({ role: 'user', content: String(pregunta).slice(0, 2000) });
  for (let turn = 0; turn < 6; turn++) {
    const resp = await client.messages.create({ model, max_tokens: 700, system: systemPrompt(opts.today), tools: TOOL_DEFS, messages: merged });
    const uses = resp.content.filter(b => b.type === 'tool_use');
    if (!uses.length) return { texto: resp.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim(), propuesta, allowed };
    merged.push({ role: 'assistant', content: resp.content });
    const results = [];
    for (const u of uses) {
      let o; try { o = tools[u.name] ? tools[u.name](u.input || {}) : { error: 'herramienta desconocida' }; } catch (e) { o = { error: e.message }; }
      if (o && o.propuesta) propuesta = o.propuesta;
      const json = JSON.stringify(o); numbersIn(json).forEach(x => allowed.add(x));
      results.push({ type: 'tool_result', tool_use_id: u.id, content: json.slice(0, 12000) });
    }
    merged.push({ role: 'user', content: results });
  }
  return { texto: '', propuesta, allowed };
}

async function answer(pregunta, rows, opts, { historial = [], client = null, model = null, state = {} } = {}) {
  const h = heuristic(pregunta, rows, opts, state);
  if (!h.desconocido) return { ...h, composed_by: 'lina', is_simulated: false };
  if (client) {
    try {
      const m = await withModel(pregunta, historial, rows, opts, client, model);
      const v = verify(m.texto, m.allowed);
      if (v.ok) return { texto: m.texto, intent: 'modelo', propuesta: m.propuesta || null, contexto: h.contexto, composed_by: 'model', is_simulated: false };
      return { ...h, texto: AYUDA, composed_by: 'lina', motivo_respaldo: v.motivo };
    } catch (e) {
      return { ...h, texto: AYUDA, composed_by: 'lina', motivo_respaldo: 'modelo no disponible: ' + String(e.message).slice(0, 120) };
    }
  }
  return { ...h, texto: AYUDA, composed_by: 'lina' };
}

module.exports = { answer, heuristic, makeTools, recomendaciones, explicarCambio, preguntaPropuesta, verify, numbersIn, TOOL_DEFS };
