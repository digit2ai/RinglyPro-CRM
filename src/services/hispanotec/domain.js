'use strict';

// =============================================================
// Motor de Directorio Inteligente HISPANOTEC — vocabulario y reglas.
//
// ESTAS REGLAS VIVEN EN CODIGO, NO EN EL PROMPT.
//
// La especificacion funcional (HISP-101..112) esta escrita casi entera en
// negativo: lo que el sistema NUNCA debe hacer. Un modelo al que se le pide
// "no presentes un proxy como presupuesto confirmado" lo cumple casi siempre,
// y "casi siempre" en materia de mecenazgo y RGPD no vale. Por eso el
// vocabulario es cerrado, las mezclas prohibidas son imposibles de construir
// y las decisiones automaticas no existen: solo propuestas.
//
// INSTANCIA cv-105 UNICAMENTE (Acuerdo Marco HISPANOTEC-DIGIT2AI, 9/6/2026).
// =============================================================

/** La instancia — una sola. No hay lista configurable: el Acuerdo es con HISPANOTEC. */
const INSTANCIA = 'cv-105';

// HISP-103 — valores CERRADOS, no editables por texto libre.
const TIPOLOGIAS = ['Fundador', 'Honorifico', 'Numerario', 'Protector', 'Patrono', 'Prospecto'];
const NATURALEZAS = ['persona_fisica', 'empresa', 'institucion', 'fundacion'];
const ESTADOS_FICHA = ['pendiente_validacion', 'validada'];
const ESTADOS_INTERACCION = ['contactado', 'en_negociacion', 'formalizado', 'descartado', 'en_pausa'];
const ORIGENES = ['manual', 'csv', 'fuente_publica', 'ia'];

// Quien NO es asociado es Prospecto, y un Prospecto no figura como socio en
// ningun informe. Esa segunda mitad es la que se olvida, asi que se codifica.
const TIPOLOGIAS_SOCIO = ['Fundador', 'Honorifico', 'Numerario', 'Protector', 'Patrono'];
function esSocioFormal(tipologia) { return TIPOLOGIAS_SOCIO.includes(String(tipologia || '')); }

// HISP-109 — tres niveles minimos de acceso.
const ROLES = ['consulta_basica', 'gestion', 'administracion'];
const RANGO_ROL = { consulta_basica: 1, gestion: 2, administracion: 3 };

/**
 * El rol del sistema se deriva de access_level del miembro. Ante ausencia o
 * valor desconocido se opera en el nivel MAS RESTRICTIVO — nunca se asume
 * gestion porque el usuario "parezca" administrador.
 */
function rolDeMiembro(member) {
  const lvl = String((member && member.access_level) || '').toLowerCase();
  if (lvl === 'superadmin' || lvl === 'admin_global') return 'administracion';
  if (lvl === 'admin_regional') return 'gestion';
  return 'consulta_basica';
}
function rolPermite(rol, minimo) {
  return (RANGO_ROL[rol] || 0) >= (RANGO_ROL[minimo] || 99);
}

// HISP-104/105 — campos sensibles. Presupuestos de fundaciones y contacto
// directo exigen rol 'gestion' como minimo, y su consulta queda auditada.
const CAMPOS_SENSIBLES = ['email', 'telefono', 'presupuesto_eur', 'proxy_valor'];

/**
 * Proyeccion por rol. Un campo que el rol no cubre se ELIMINA del objeto, no
 * se enmascara con asteriscos: una mascara sigue confirmando que el dato
 * existe y con que longitud, y eso ya es informacion.
 */
function proyectarPorRol(ficha, rol) {
  const out = { ...ficha };
  if (!rolPermite(rol, 'gestion')) {
    for (const c of CAMPOS_SENSIBLES) delete out[c];
    delete out.presupuesto;      // el bloque compuesto de fundaciones
    out._restringido = 'Los presupuestos y los datos de contacto directo requieren rol de gestion.';
  }
  return out;
}

// HISP-110 / 111 — niveles de automatizacion del contacto.
//
// ANTE DUDA, NIVEL 1. Una fundacion mal clasificada como Nivel 3 recibe un
// correo automatico, y ese es exactamente el dano que la especificacion
// describe como contraproducente incluso si fuera legal.
function nivelDeContacto(entry) {
  const nat = String((entry && entry.naturaleza) || '');
  const tip = String((entry && entry.tipologia) || '');
  if (nat === 'fundacion' || tip === 'Patrono' || tip === 'Protector') return 1;
  if (nat === 'empresa' || nat === 'institucion') return 2;
  if (nat === 'persona_fisica') return 3;
  return 1;   // desconocido => el mas restrictivo
}

/**
 * ¿Puede este contacto entrar en CUALQUIER envio automatizado?
 *
 * Nivel 1 esta excluido por diseño de toda campaña, de la solicitud
 * automatizada de permiso y de cualquier canal de voz con IA. No hay
 * parametro, rol ni instruccion que lo habilite — por eso la funcion no
 * acepta un flag de override.
 */
function admiteAutomatizacion(entry, consent) {
  const nivel = nivelDeContacto(entry);
  if (nivel === 1) {
    return { permitido: false, nivel,
      motivo: 'Nivel 1 (fundaciones, patronos y mecenas de alto valor): contacto '
            + 'siempre iniciado y gestionado por una persona. Excluido por diseño '
            + 'de toda automatizacion.' };
  }
  const estado = String((consent && consent.estado) || 'no_solicitado');
  if (estado === 'opuesto' || estado === 'baja') {
    return { permitido: false, nivel,
      motivo: 'El contacto ejercio oposicion o baja. No vuelve a campañas ni a '
            + 'solicitudes de permiso.' };
  }
  if (estado === 'concedido' || estado === 'sin_oposicion') {
    return { permitido: true, nivel, tipo: 'campaña',
      motivo: 'Permiso previo acreditado (' + estado + ').' };
  }
  // Opt-in real: el primer contacto NUNCA es promocional.
  return { permitido: true, nivel, tipo: 'solicitud_permiso',
    motivo: 'Sin permiso previo: el unico envio admisible es el mensaje individual '
          + 'de solicitud de permiso, no promocional (art. 21 LSSICE como estandar unico).' };
}

// HISP-104 — antiguedad maxima antes de forzar revision.
const ANTIGUEDAD_MAX_MESES = parseInt(process.env.HISPANOTEC_ANTIGUEDAD_MAX_MESES || '18', 10);

/**
 * Un ejercicio se cuenta desde su CIERRE (31 de diciembre de ese año), no
 * desde su inicio. Contandolo desde enero, un ejercicio 2025 consultado en
 * agosto de 2026 salia con veinte meses y se marcaba caducado: practicamente
 * todo el listado aparecia en rojo y el aviso dejaba de significar nada.
 */
function mesesDesdeEjercicio(ejercicio) {
  const anio = parseInt(String(ejercicio || '').slice(0, 4), 10);
  if (!anio) return null;
  const ahora = new Date();
  const cierre = new Date(anio, 11, 31);              // 31-dic del ejercicio
  if (ahora < cierre) return 0;                        // ejercicio aun en curso
  return (ahora.getFullYear() - anio - 1) * 12 + ahora.getMonth() + 1;
}
function presupuestoCaducado(ejercicio) {
  const m = mesesDesdeEjercicio(ejercicio);
  if (m === null) return true;                         // sin ejercicio: revisar
  return m > ANTIGUEDAD_MAX_MESES;
}

/**
 * La cifra de una fundacion, lista para mostrar.
 *
 * Devuelve SIEMPRE la etiqueta pegada al valor. La especificacion es explicita:
 * la palabra "estimado" aparece junto a la cifra, no en una nota al pie — asi
 * que quien renderice esto no puede separarlas sin borrar texto a proposito.
 */
function cifraFundacion(f) {
  if (!f) return { tipo: 'desconocido', etiqueta: 'Sin dato', valor: null, es_estimacion: false };
  if (f.presupuesto_eur != null) {
    return {
      tipo: 'real',
      valor: Number(f.presupuesto_eur),
      es_estimacion: false,
      etiqueta: 'Presupuesto verificado',
      fuente: f.presupuesto_fuente || null,
      ejercicio: f.presupuesto_ejercicio || null,
      caducado: presupuestoCaducado(f.presupuesto_ejercicio),
    };
  }
  if (f.proxy_valor != null) {
    return {
      tipo: 'proxy',
      valor: Number(f.proxy_valor),
      es_estimacion: true,
      etiqueta: 'ESTIMACION (proxy: ' + (f.proxy_tipo || 'sin especificar') + ')',
      proxy_tipo: f.proxy_tipo || null,
      fuente: f.proxy_fuente || null,
      ejercicio: f.proxy_ejercicio || null,
      caducado: presupuestoCaducado(f.proxy_ejercicio),
    };
  }
  // "No consta" es una respuesta correcta y preferible a una inferencia.
  return { tipo: 'desconocido', etiqueta: 'No consta presupuesto ni proxy',
           valor: null, es_estimacion: false };
}

/**
 * Ordena fundaciones SIN mezclar criterios en silencio.
 *
 * Ordenar reales y proxies en una sola columna sugiere que son comparables, y
 * no lo son. Se ordena dentro de cada grupo y se devuelve el aviso que la
 * interfaz esta obligada a mostrar cuando aparecen los dos.
 */
function ordenarFundaciones(filas) {
  const con = (filas || []).map((f) => ({ ...f, cifra: cifraFundacion(f) }));
  const reales = con.filter((x) => x.cifra.tipo === 'real').sort((a, b) => b.cifra.valor - a.cifra.valor);
  const proxies = con.filter((x) => x.cifra.tipo === 'proxy').sort((a, b) => b.cifra.valor - a.cifra.valor);
  const sinDato = con.filter((x) => x.cifra.tipo === 'desconocido');
  const mezcla = reales.length > 0 && proxies.length > 0;
  return {
    grupos: [
      { criterio: 'presupuesto_verificado', filas: reales },
      { criterio: 'proxy_estimado', filas: proxies },
      { criterio: 'sin_dato', filas: sinDato },
    ],
    orden: [...reales, ...proxies, ...sinDato],
    mezcla_criterios: mezcla,
    aviso: mezcla
      ? 'Este listado combina presupuestos verificados y estimaciones proxy. No son '
      + 'cifras comparables entre si: los proxies aparecen agrupados aparte y '
      + 'etiquetados como estimacion.'
      : null,
    caducados: con.filter((x) => x.cifra.caducado && x.cifra.valor != null).length,
    antiguedad_max_meses: ANTIGUEDAD_MAX_MESES,
  };
}

/**
 * LA CLAVE DE DUPLICADOS, EN UN SOLO SITIO.
 *
 * Existia dos veces con formatos distintos: el sembrador la construia con tres
 * partes y el importador con cuatro. Las claves no coincidian, asi que la
 * importacion creo un segundo "Fundacion Telefonica" sin detectar nada — el
 * duplicado exacto que HISP-101 manda evitar. Toda escritura pasa por aqui.
 *
 * nombre + pais + dominio de email, mas la naturaleza: dos entidades del mismo
 * nombre en el mismo pais pueden ser una fundacion y su empresa matriz.
 */
function claveDedupe(f) {
  const n = (v) => String(v == null ? '' : v).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const dominio = String((f && f.email) || '').split('@')[1] || '';
  return [n(f && f.naturaleza) || 'persona_fisica', n(f && f.nombre), n(f && f.pais), n(dominio)].join('|');
}

module.exports = {
  claveDedupe,
  INSTANCIA,
  TIPOLOGIAS, NATURALEZAS, ESTADOS_FICHA, ESTADOS_INTERACCION, ORIGENES,
  TIPOLOGIAS_SOCIO, esSocioFormal,
  ROLES, RANGO_ROL, rolDeMiembro, rolPermite, CAMPOS_SENSIBLES, proyectarPorRol,
  nivelDeContacto, admiteAutomatizacion,
  ANTIGUEDAD_MAX_MESES, mesesDesdeEjercicio, presupuestoCaducado, cifraFundacion, ordenarFundaciones,
};
