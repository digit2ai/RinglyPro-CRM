'use strict';

// =============================================================
// HISP-106 — recomendacion y matching por proyecto.
//
// EL SCORE ES ARITMETICA, NO UN MODELO.
//
// Un coordinador tiene que defender una lista corta delante de la Junta, y un
// numero que cambia entre ejecuciones no se puede defender. Cada punto sale de
// una regla escrita aqui, y cada candidato viaja con los motivos por los que
// entro — el criterio de aceptacion pide poder descartar con criterio, y para
// eso hay que ver por que estaba dentro.
//
// LA LISTA ES PROPOSITIVA. Nada se activa: devolver candidatos no contacta a
// nadie. La activacion exige una accion explicita de una persona autorizada, y
// para Nivel 1 ademas es siempre contacto humano.
// =============================================================

const dom = require('./domain');

// Pesos. Suman 100 sobre el maximo teorico.
const PESOS = {
  tematica:    40,   // coincidencia de etiquetas con lineas de actuacion / sector / especialidad
  naturaleza:  15,   // el proyecto busca fundacion, empresa, profesional...
  localizacion:15,   // mismo pais o localizacion citada
  tipologia:   15,   // un socio de la casa pesa mas que un prospecto frio
  capacidad:   15,   // solo fundaciones: su puesto en el ranking de presupuesto/proxy
};

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}
function tokens(s) {
  return norm(s).split(/[^a-z0-9ñ]+/).filter((t) => t.length > 3);
}

// Un socio ya vinculado a HISPANOTEC no es lo mismo que un contacto frio.
const PESO_TIPOLOGIA = {
  Patrono: 1.0, Protector: 1.0, Fundador: 0.9, Numerario: 0.8, Honorifico: 0.7, Prospecto: 0.3,
};

/**
 * Puntua una ficha contra un proyecto.
 * proyecto = { etiquetas:[], naturaleza_buscada, pais, localizacion }
 */
function puntuar(ficha, proyecto, ctx) {
  const motivos = [];
  let score = 0;

  // --- tematica ---
  const etiquetas = (proyecto.etiquetas || []).map(norm).filter(Boolean);
  const heno = tokens([ficha.especialidad, ficha.sector,
    Array.isArray(ficha.lineas_actuacion) ? ficha.lineas_actuacion.join(' ') : ficha.lineas_actuacion,
    ficha.notas].filter(Boolean).join(' '));
  const hit = etiquetas.filter((e) => {
    const et = tokens(e);
    return et.length ? et.some((t) => heno.includes(t)) : heno.includes(e);
  });
  if (etiquetas.length) {
    const frac = hit.length / etiquetas.length;
    score += PESOS.tematica * frac;
    if (hit.length) motivos.push(`Coincide en ${hit.length} de ${etiquetas.length} etiquetas tematicas: ${hit.join(', ')}`);
    else motivos.push('Sin coincidencia tematica explicita');
  }

  // --- naturaleza ---
  if (proyecto.naturaleza_buscada) {
    if (ficha.naturaleza === proyecto.naturaleza_buscada) {
      score += PESOS.naturaleza;
      motivos.push(`Es ${String(ficha.naturaleza).replace(/_/g, ' ')}, que es lo que pide el proyecto`);
    }
  } else {
    score += PESOS.naturaleza * 0.5;   // el proyecto no discrimina
  }

  // --- localizacion ---
  const paisP = norm(proyecto.pais), paisF = norm(ficha.pais);
  if (paisP && paisF && paisP === paisF) {
    score += PESOS.localizacion;
    motivos.push(`Mismo pais que el proyecto (${ficha.pais})`);
  } else if (proyecto.localizacion && norm(ficha.localizacion).includes(norm(proyecto.localizacion))) {
    score += PESOS.localizacion * 0.7;
    motivos.push(`Localizacion coincidente (${ficha.localizacion})`);
  }

  // --- tipologia ---
  const pt = PESO_TIPOLOGIA[ficha.tipologia] != null ? PESO_TIPOLOGIA[ficha.tipologia] : 0.3;
  score += PESOS.tipologia * pt;
  motivos.push(ficha.tipologia === 'Prospecto'
    ? 'Prospecto: aun no es asociado de HISPANOTEC'
    : `Tipologia ${ficha.tipologia}`);

  // --- capacidad (solo fundaciones) ---
  if (ficha.naturaleza === 'fundacion') {
    const cifra = dom.cifraFundacion(ficha);
    if (cifra.valor != null && ctx && ctx.maxCifra) {
      const frac = Math.min(cifra.valor / ctx.maxCifra, 1);
      score += PESOS.capacidad * frac;
      // La etiqueta viaja con el motivo. Un proxy nunca se presenta como
      // presupuesto confirmado, tampoco dentro de una explicacion de score.
      motivos.push(cifra.es_estimacion
        ? `Capacidad segun ESTIMACION (proxy: ${cifra.proxy_tipo || 'sin especificar'}`
          + `${cifra.ejercicio ? ', ejercicio ' + cifra.ejercicio : ''}) — no es un presupuesto confirmado`
        : `Capacidad segun presupuesto verificado${cifra.ejercicio ? ' (ejercicio ' + cifra.ejercicio + ')' : ''}`);
      if (cifra.caducado) motivos.push('La cifra supera la antiguedad maxima: revisar antes de usarla');
    } else {
      motivos.push('No consta presupuesto ni proxy: no puntua por capacidad');
    }
  }

  return { score: Math.round(Math.min(score, 100) * 10) / 10, motivos };
}

/**
 * Lista corta para un proyecto: entre 5 y 15 candidatos.
 *
 * Devuelve tambien lo que NO pudo hacer. Una lista de cinco cuando el
 * directorio solo tiene ocho fichas no es un resultado pobre del algoritmo, es
 * un directorio pequeno, y conviene que quien la lea sepa cual de las dos cosas
 * esta viendo.
 */
function candidatos(fichas, proyecto, opciones) {
  const opt = opciones || {};
  const min = opt.min || 5, max = Math.min(opt.max || 15, 15);

  const cifras = (fichas || [])
    .filter((f) => f.naturaleza === 'fundacion')
    .map((f) => dom.cifraFundacion(f).valor)
    .filter((v) => v != null);
  const ctx = { maxCifra: cifras.length ? Math.max.apply(null, cifras) : 0 };

  const puntuadas = (fichas || []).map((f) => {
    const p = puntuar(f, proyecto, ctx);
    return {
      entry_id: f.id, nombre: f.nombre, naturaleza: f.naturaleza, tipologia: f.tipologia,
      pais: f.pais, especialidad: f.especialidad,
      nivel_contacto: dom.nivelDeContacto(f),
      score: p.score, motivos: p.motivos,
    };
  }).sort((a, b) => b.score - a.score);

  const lista = puntuadas.slice(0, max);
  return {
    proyecto,
    candidatos: lista,
    total_directorio: (fichas || []).length,
    nota: lista.length < min
      ? `Solo hay ${lista.length} candidato(s) porque el directorio contiene ${(fichas || []).length} ficha(s). `
      + 'No es que el motor haya descartado al resto: no hay mas a quien puntuar.'
      : null,
    // Recordatorio operativo, no decorativo: la mitad de la lista puede ser
    // Nivel 1, y esos no admiten ningun envio automatizado.
    nivel1: lista.filter((c) => c.nivel_contacto === 1).length,
    aviso_activacion: 'Esta lista es una propuesta. Ninguna activacion se produce sola: '
      + 'requiere la accion explicita de una persona autorizada, y los contactos de Nivel 1 '
      + '(fundaciones, patronos y mecenas) se contactan siempre en persona.',
    pesos: PESOS,
  };
}

module.exports = { candidatos, puntuar, PESOS, PESO_TIPOLOGIA };
