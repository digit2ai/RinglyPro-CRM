'use strict';
/**
 * Spanish financial NLU for Lina. Deterministic: reads intent and entities
 * (dates, months, amounts in digits or words, type, category, which payment)
 * from what the owner says or types. It extracts; it never computes money.
 */
const engine = require('./engine');
const { toCents } = require('./money');

const MESES = engine.MESES;
const MES_RE = MESES.join('|');

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡?!;:"“”«»]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Same text without punctuation, for keyword matching.
function words(t) { return t.replace(/[.,]+(?!\d)/g, ' ').replace(/\s+/g, ' ').trim(); }

// ---------------------------------------------------------------- numbers in words
const UNITS = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, quinientos: 500, quinientas: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
const NUMWORD = new RegExp(`\\b(?:(?:${Object.keys(UNITS).join('|')}|mil|y)\\s?)+`, 'g');

function wordsToNumbers(t) {
  return t.replace(NUMWORD, (run) => {
    const toks = run.trim().split(/\s+/).filter(w => w !== 'y');
    if (!toks.length) return run;
    // a lone "un/una/uno" is an article, not an amount ("un gasto")
    if (toks.length === 1 && ['un', 'una', 'uno'].includes(toks[0])) return run;
    if (toks.every(w => w === 'y')) return run;
    let total = 0, cur = 0;
    for (const w of toks) {
      if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; }
      else if (UNITS[w] != null) cur += UNITS[w];
      else return run;
    }
    return ' ' + String(total + cur) + ' ';
  }).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- amounts
function parseMonto(textNorm) {
  const t = wordsToNumbers(textNorm).replace(/(\d)\s*k\b/g, '$1000');
  const withSign = /\$\s?(\d[\d.,]*)/.exec(t);
  const withWord = /(\d[\d.,]*)\s*(?:dolares|usd|pesos|bucks|dls)\b/.exec(t);
  let m = withSign ? withSign[1] : withWord ? withWord[1] : null;
  if (!m) {
    const re = /(\d[\d.,]*)/g; let x;
    while ((x = re.exec(t))) {
      const after = t.slice(x.index + x[1].length, x.index + x[1].length + 30);
      const before = t.slice(Math.max(0, x.index - 12), x.index);
      if (new RegExp(`^\\s*(de\\s+)?(${MES_RE})`).test(after)) continue;          // "15 de noviembre"
      if (new RegExp(`(${MES_RE})\\s*$`).test(before)) continue;                   // "diciembre 15"
      if (/^\s*(dias?|semanas?|meses?|%|por ciento|puntos?)/.test(after)) continue; // "en 10 dias"
      if (/^\/\d/.test(after) || /\d\/$/.test(before)) continue;                     // 1/12
      if (/^\d{4}$/.test(x[1]) && Number(x[1]) >= 2020 && Number(x[1]) <= 2100) continue; // a year
      if (/\b(el|dia)\s*$/.test(before) && Number(x[1]) <= 31 && !/^\s*(dolares|\$)/.test(after)) continue; // "el 6"
      m = x[1]; break;
    }
  }
  if (!m) return null;
  m = m.replace(/[.,]$/, '');
  const c = toCents(m);
  return c != null && c > 0 ? c : null;
}

// ---------------------------------------------------------------- dates
const WD = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
function ymd(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function monthOf(name, today, explicitYear) {
  const m = MESES.indexOf(name) + 1; let y = explicitYear || Number(today.slice(0, 4));
  if (!explicitYear && ymd(y, m, 1) < today.slice(0, 7) + '-01') y += 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Returns { fecha?, mes?, implicita? } — fecha is a day, mes a whole month (YYYY-MM). */
function parseFecha(textNorm, today) {
  const t = wordsToNumbers(textNorm).replace(/\bprimero\b|\b1ro\b|\b1o\b/g, '1');
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(t); if (iso && engine.isISO(iso[1])) return { fecha: iso[1] };
  if (/\bpasado manana\b/.test(t)) return { fecha: engine.addDays(today, 2) };
  if (/\bmanana\b/.test(t)) return { fecha: engine.addDays(today, 1) };
  if (/\bayer\b/.test(t)) return { fecha: engine.addDays(today, -1) };
  if (/\bhoy\b|\bahorita\b|\bahora\b/.test(t) && !/\b(de|en) (\w+ )?(${MES_RE})\b/.test(t)) return { fecha: today, hoy: true };
  let m;
  if ((m = new RegExp(`\\b(\\d{1,2}) de (${MES_RE})(?: (?:de|del) (\\d{4}))?`).exec(t)) || (m = new RegExp(`\\b(${MES_RE}) (\\d{1,2})\\b(?! de)`).exec(t))) {
    let d, mesName, y;
    if (/^\d/.test(m[1])) { d = Number(m[1]); mesName = m[2]; y = m[3] ? Number(m[3]) : null; } else { mesName = m[1]; d = Number(m[2]); }
    const ym = monthOf(mesName, today, y);
    const f = `${ym}-${String(d).padStart(2, '0')}`;
    if (engine.isISO(f)) return { fecha: f };
  }
  if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
    const d = Number(m[1]), mo = Number(m[2]); let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(today.slice(0, 4));
    let f = ymd(y, mo, d); if (!m[3] && f < today) f = ymd(y + 1, mo, d);
    if (engine.isISO(f)) return { fecha: f };
  }
  if ((m = new RegExp(`\\b(fin|final|finales|cierre) de (${MES_RE})\\b`).exec(t))) { const ym = monthOf(m[2], today); const [y, mo] = ym.split('-').map(Number); return { fecha: engine.lastDayOfMonth(y, mo) }; }
  if ((m = new RegExp(`\\b(principio|principios|inicio|comienzo) de (${MES_RE})\\b`).exec(t))) return { fecha: monthOf(m[2], today) + '-01' };
  if ((m = new RegExp(`\\bmediados de (${MES_RE})\\b`).exec(t))) return { fecha: monthOf(m[1], today) + '-15' };
  if (/\b(fin|final|cierre) de ano\b|\bfin de año\b/.test(t)) return { fecha: today.slice(0, 4) + '-12-31' };
  if (/\b(fin|final|cierre) de (este )?mes\b/.test(t)) { const [y, mo] = today.split('-').map(Number); return { fecha: engine.lastDayOfMonth(y, mo) }; }
  if (/\b(fin|final) de la semana\b|\bel viernes de esta semana\b/.test(t)) return { fecha: engine.weekEnd(today) };
  if (/\b(la )?(proxima|siguiente) semana\b/.test(t)) return { fecha: engine.addDays(engine.weekEnd(today), 7) };
  if ((m = /\b(?:en|dentro de) (\d{1,3}) (dias?|semanas?|meses?)\b/.test(t) && /\b(?:en|dentro de) (\d{1,3}) (dias?|semanas?|meses?)\b/.exec(t))) {
    const n = Number(m[1]);
    if (m[2].startsWith('dia')) return { fecha: engine.addDays(today, n) };
    if (m[2].startsWith('semana')) return { fecha: engine.addDays(today, 7 * n) };
    const [y, mo, d] = today.split('-').map(Number); const dt = new Date(Date.UTC(y, mo - 1 + n, d)); return { fecha: dt.toISOString().slice(0, 10) };
  }
  if ((m = new RegExp(`\\b(?:el|este|proximo|el proximo) (${Object.keys(WD).join('|')})\\b`).exec(t))) {
    let d = engine.addDays(today, /proximo/.test(m[0]) ? 1 : 0); while (engine.dow(d) !== WD[m[1]]) d = engine.addDays(d, 1); return { fecha: d };
  }
  if ((m = new RegExp(`\\b(${MES_RE})\\b(?: (?:de|del) (\\d{4}))?`).exec(t))) return { mes: monthOf(m[1], today, m[2] ? Number(m[2]) : null) };
  if (/\b(este mes|el mes)\b/.test(t)) return { mes: today.slice(0, 7) };
  if (/\b(el|del) mes (que viene|proximo|siguiente)\b|\bproximo mes\b/.test(t)) { const [y, mo] = today.split('-').map(Number); return { mes: new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7) }; }
  return {};
}

// ---------------------------------------------------------------- categories / payments
function obligacion(t) {
  if (/\bcorte\b/.test(t)) return 'corte';
  if (/\b(casa de mi hija|mi hija|hija)\b/.test(t)) return 'hija';
  if (/\b(pago lina|pago de lina|lo de lina|a lina|de lina|pagar lina)\b/.test(t)) return 'pago_lina';
  if (/\binversion\b|\binvertir\b/.test(t)) return 'inversion';
  if (/\b(salario|sueldo|quincena|nomina)\b/.test(t)) return 'salario';
  if (/\bahorro\b/.test(t)) return 'ahorro';
  return null;
}
const PERSONAL = /\b(comida|almuerzo|cena|desayuno|cafe|super|supermercado|mercado|restaurante|gasolina|uber|taxi|ropa|farmacia|cine|bar|snack|antojo|regalo|personal|compras?)\b/;
function categoria(t, tipo, montoCents) {
  const ob = obligacion(t);
  if (tipo === 'ingreso') {
    if (ob === 'salario') return 'salario';
    if (ob === 'ahorro') return 'ahorro';
    return 'ingreso_extra';
  }
  if (ob && ob !== 'salario' && ob !== 'ahorro') return ob;
  if (PERSONAL.test(t)) return 'gasto_personal';
  if (/\bgasto personal\b/.test(t)) return 'gasto_personal';
  if (/\b(otro|imprevisto|reparacion|medico|doctor|carro|auto|seguro|renta|servicio|factura|luz|agua|internet|telefono)\b/.test(t)) return 'otro';
  return montoCents != null && montoCents <= 10000 ? 'gasto_personal' : 'otro';
}
function concepto(original, t, tipo) {
  const DATE_TAIL = new RegExp('\\s*\\b(hoy|ayer|manana|pasado manana|(el|este|proximo) (lunes|martes|miercoles|jueves|viernes|sabado|domingo)|(el )?\\d{1,2} de (' + MES_RE + ').*)$');
  const m = /\b(?:en|de|para|por) (?:el |la |los |las |un |una |mi |mis )?([a-z ]{3,40})$/.exec(words(t).replace(DATE_TAIL, '').trim());
  if (m && !/^\d/.test(m[1]) && !/\b(gasto|ingreso|egreso|dolares|pesos)\b/.test(m[1])) return m[1].trim().replace(/^\w/, c => c.toUpperCase());
  const ob = obligacion(t);
  if (ob === 'salario') return 'Salario';
  if (ob === 'ahorro') return 'Ahorro';
  return tipo === 'ingreso' ? 'Ingreso' : 'Gasto';
}

// ---------------------------------------------------------------- intents
const R = {
  confirmar: /^(si|sip|si claro|claro|dale|ok|okay|va|sale|confirmo|confirmado|confirma|hazlo|registralo|agregalo|anotalo|guardalo|adelante|de acuerdo|correcto|esta bien|perfecto|exacto|eso|asi es)\b/,
  cancelar: /^(no|nop|cancela|cancelalo|olvidalo|mejor no|dejalo|no gracias|no lo registres)\b/,
  simular: /\b(si (compro|gasto|me gasto|pago|invierto|hago un gasto|recibo|me pagan|me llega|me entran?|agrego|meto|saco)|que pasa(ria)? si|y si|simula|supongamos|en caso de que)\b/,
  borrar: /\b(borra|borrar|elimina|eliminar|quita|quitar|saca|anula)\b.*\b(gasto|ingreso|egreso|movimiento|registro|ese|eso|el de|la de)\b/,
  editar: /\b(cambia|cambiar|modifica|modificar|ajusta|ajustar|actualiza|actualizar|corrige|corregir)\b/,
  cumplido: /\b(ya pague|ya hice el pago|ya cubri|ya deposite|ya me pagaron|ya cobre|ya recibi|ya llego|ya entro|ya salio|pague|me pagaron el|recibi el|cobre el)\b/,
  agregar: /\b(agrega|agregar|agregame|anota|anotar|apunta|registra|registrar|anade|anadir|suma|sumale|sumar|ponle|pon|mete|meter|carga|incluye|incluir|resta|restale|descuenta|descontar|gaste|me gaste|compre|pague|recibi|me pagaron|me depositaron|me entro|me entraron|me llego|gane|cobre|nuevo gasto|nuevo ingreso|tengo un gasto|tuve un gasto)\b/,
  alcanza: /\b(alcanza|alcanzara|cubierto|cubierta|me da para|puedo pagar|llego a pagar|tengo para)\b/,
  explicarCalculo: /\b(como (se )?calcul\w*|como sacas|como funciona la proyeccion|de donde sale la proyeccion|explica\w* la proyeccion|que es la proyeccion|como proyectas|como se proyecta|explica\w* (el|la) (calculo|salud|puntaje))\b/,
  explicarSaldo: /\b(por ?que\b(?! no\b)|de donde (sale|salen|viene|vienen)|explica\w*|desglos\w*|que (incluye|compone|forma)|como llego a|como es que tengo|a que se debe|que hay en|que suma)\b/,
  mantener: /\b(mantener\w*|sostener\w*|cumplir (con )?el plan|no salirme|no bajar|para que se cumpla|para llegar|seguir (asi|el plan)|que tengo que hacer para|que necesito para|que debo cuidar|como lo logro|como mantengo)\b/,
  saldoFecha: /\b(cuanto|que saldo|cual (es|sera) (mi|el) saldo|como (voy a estar|estare|cierro|cerrare|termino|me va|quedo)|saldo|disponible|tendre|voy a tener|tengo|habra|me queda|quedara|llego con|cierro)\b/,
  puntoBajo: /\b(punto mas bajo|saldo minimo|mas bajo|minimo|peor momento|mas apretado|mas justo)\b/,
  semana: /\bsemana\b/,
  mesGastado: /\b(llevo gastado|he gastado|gaste este mes|gastado este mes|cuanto llevo|mis gastos del mes|gastos de este mes)\b/,
  proximos: /\b(proximos? pagos?|que tengo que pagar|que pagos (vienen|tengo)|que viene|que sigue|que me toca pagar)\b/,
  recomendar: /\b(que debo hacer|que hago|recomienda\w*|recomendacion\w*|consejo\w*|aconseja\w*|como mejoro|que me sugieres|sugerencia\w*|como subo|como aumento)\b/,
  estado: /\b(como estoy|como voy|como van|como estan|mis finanzas|mi salud|resumen|como ando|como esta mi dinero|situacion)\b/,
  saludo: /^(hola|buenos dias|buenas tardes|buenas noches|buenas|hey|oye)( lina)?$/,
  gracias: /^(gracias|muchas gracias|perfecto gracias|ok gracias|listo gracias)/
};

function interpret(original, today) {
  const t0 = norm(original);
  const t = words(t0);
  const f = parseFecha(t0, today);
  const monto = parseMonto(t0);
  const e = { texto: t, fecha: f.fecha || null, mes: f.mes || null, hoy: !!f.hoy, monto, obligacion: obligacion(t) };
  const ingresoWords = /\b(ingreso|ingresos|entrada|deposito|bono|recibi|me pagaron|me depositaron|me entro|me entraron|me llego|gane|cobre|sumale|suma|salario|sueldo|ahorro)\b/;
  const egresoWords = /\b(gasto|gastos|egreso|compra|compre|gaste|pague|pago|resta|restale|descuenta|costo|cuesta)\b/;
  const tipo = /\b(ingreso|recibi|me pagaron|me depositaron|me entro|me llego|gane|cobre)\b/.test(t) ? 'ingreso'
    : egresoWords.test(t) ? 'egreso' : ingresoWords.test(t) ? 'ingreso' : null;
  e.tipo = tipo;

  if (R.saludo.test(t)) return { intent: 'saludo', ...e };
  if (R.gracias.test(t)) return { intent: 'gracias', ...e };
  if (R.simular.test(t)) return { intent: 'simular', ...e, tipo: /\b(recibo|me pagan|me llega|me entran?)\b/.test(t) ? 'ingreso' : (tipo || 'egreso') };
  if (R.confirmar.test(t) && t.split(' ').length <= 7) return { intent: 'confirmar', ...e, tipo, categoria: tipo ? categoria(t, tipo, monto) : (/gasto personal/.test(t) ? 'gasto_personal' : /\botro\b/.test(t) ? 'otro' : null) };
  if (R.cancelar.test(t)) return { intent: 'cancelar', ...e };
  if (R.simular.test(t)) return { intent: 'simular', ...e, tipo: /\b(recibo|me pagan|me llega|me entran?)\b/.test(t) ? 'ingreso' : (tipo || 'egreso') };
  if (R.explicarCalculo.test(t)) return { intent: 'explicar_calculo', ...e };
  if (R.borrar.test(t)) return { intent: 'borrar', ...e };
  if (R.cumplido.test(t) && e.obligacion && !/\b(agrega|anota|registra|suma)\b/.test(t)) return { intent: 'cumplido', ...e };
  if (R.editar.test(t) && monto) return { intent: 'editar', ...e };
  if (R.agregar.test(t) && !/^(cuanto|que|como|cual|por ?que|para que|debo|vale|conviene)\b/.test(t)) {
    const tp = tipo || (/\b(resta|restale|descuenta)\b/.test(t) ? 'egreso' : /\b(suma|sumale)\b/.test(t) ? 'ingreso' : 'egreso');
    return { intent: 'agregar', ...e, tipo: tp, categoria: categoria(t, tp, monto), concepto: concepto(original, t, tp) };
  }
  if (R.alcanza.test(t)) return { intent: 'alcanza', ...e };
  if (R.explicarSaldo.test(t)) return { intent: 'explicar_saldo', ...e };
  if (R.mantener.test(t)) return { intent: 'mantener', ...e };
  if (R.puntoBajo.test(t)) return { intent: 'punto_bajo', ...e };
  if (R.semana.test(t) && /\b(queda|gastar|llevo|presupuesto|gastado|gaste|disponible|puedo)\b/.test(t) && !e.fecha) return { intent: 'semana', ...e };
  if (R.mesGastado.test(t)) return { intent: 'mes_gastado', ...e };
  if (R.proximos.test(t)) return { intent: 'proximos', ...e };
  if (R.recomendar.test(t)) return { intent: 'recomendar', ...e };
  if ((e.fecha || e.mes) && R.saldoFecha.test(t)) return { intent: e.mes ? 'resumen_mes' : 'saldo_fecha', ...e };
  if (R.estado.test(t)) return { intent: 'estado', ...e };
  if (R.saldoFecha.test(t) && /\b(hoy|ahora|actual|tengo)\b/.test(t)) return { intent: 'saldo_fecha', ...e, fecha: today, hoy: true };
  if (e.fecha || e.mes) return { intent: e.mes ? 'resumen_mes' : 'saldo_fecha', ...e, solo_fecha: true };
  if (monto && !/\b(cuanto|que|como|cual)\b/.test(t)) return { intent: 'monto_suelto', ...e };
  if (/\blina\b/.test(t)) return { intent: 'aclarar', ...e };
  return { intent: 'desconocido', ...e };
}

module.exports = { norm, words, wordsToNumbers, parseMonto, parseFecha, interpret, categoria, obligacion, concepto };
