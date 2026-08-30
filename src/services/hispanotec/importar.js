'use strict';

// =============================================================
// HISP-101 — ingesta masiva (CSV / Excel).
//
// EL ANALISIS Y LA ESCRITURA SON DOS PASOS SEPARADOS, A PROPOSITO.
// El criterio de aceptacion pide senalar los errores "fila a fila ANTES de
// confirmar la carga". Una importacion que escribe mientras valida deja el
// directorio a medias cuando la fila 300 falla, y a nadie le consta que paso.
// analizar() no toca la base; aplicar() solo escribe lo que analizar() aprobo.
//
// DUPLICADOS: se DETECTAN Y SE REPORTAN, no se fusionan. Fusionar dos fichas
// por su cuenta es decidir que son la misma entidad, y esa es una decision
// humana. Se detectan por nombre + pais + email/dominio, dentro del propio
// fichero y contra lo ya cargado.
// =============================================================

const dom = require('./domain');

// Cabeceras que aceptamos, en las formas en que la gente las escribe de verdad.
const COLUMNAS = {
  nombre:       ['nombre', 'razon social', 'razón social', 'entidad', 'name', 'denominacion', 'denominación'],
  naturaleza:   ['naturaleza', 'tipo', 'tipo de entidad', 'type'],
  tipologia:    ['tipologia', 'tipología', 'categoria', 'categoría'],
  pais:         ['pais', 'país', 'country'],
  especialidad: ['especialidad', 'speciality', 'specialty', 'area', 'área'],
  experiencia:  ['experiencia', 'anios', 'años', 'experience'],
  localizacion: ['localizacion', 'localización', 'ciudad', 'ubicacion', 'ubicación', 'city'],
  email:        ['email', 'correo', 'e-mail', 'correo electronico', 'correo electrónico'],
  telefono:     ['telefono', 'teléfono', 'phone', 'movil', 'móvil'],
  web:          ['web', 'website', 'sitio web', 'url'],
  sector:       ['sector', 'industria', 'industry'],
  tamano:       ['tamano', 'tamaño', 'size', 'empleados'],
  notas:        ['notas', 'observaciones', 'comentarios', 'notes'],
};

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Empareja las cabeceras del fichero con nuestros campos. */
function mapearCabeceras(cabeceras) {
  const mapa = {};
  const noReconocidas = [];
  (cabeceras || []).forEach((h, i) => {
    const n = norm(h);
    const campo = Object.keys(COLUMNAS).find((k) => COLUMNAS[k].includes(n));
    if (campo) mapa[campo] = i;
    else if (n) noReconocidas.push(h);
  });
  return { mapa, noReconocidas };
}

// Delegada a domain.js: era la segunda definicion de la misma clave, y las dos
// no coincidian.
const claveDedupe = dom.claveDedupe;

/** Lee CSV o XLSX y devuelve filas crudas + cabeceras. */
function leer(buffer, nombreFichero) {
  const ext = String(nombreFichero || '').toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: '' });
    if (!filas.length) return { cabeceras: [], filas: [] };
    return { cabeceras: filas[0].map(String), filas: filas.slice(1) };
  }
  const { parse } = require('csv-parse/sync');
  const filas = parse(buffer.toString('utf8'), {
    skip_empty_lines: true, relax_column_count: true, bom: true, trim: true,
  });
  if (!filas.length) return { cabeceras: [], filas: [] };
  return { cabeceras: filas[0].map(String), filas: filas.slice(1) };
}

/**
 * Analiza el fichero sin escribir nada.
 * `existentes` = [{ dedupe_key, nombre }] ya en el directorio.
 */
function analizar(buffer, nombreFichero, existentes, opciones) {
  const opt = opciones || {};
  const { cabeceras, filas } = leer(buffer, nombreFichero);
  if (!cabeceras.length) {
    return { ok: false, error: 'El fichero esta vacio o no se pudo leer.' };
  }
  const { mapa, noReconocidas } = mapearCabeceras(cabeceras);
  if (mapa.nombre === undefined) {
    return { ok: false,
      error: 'No se encontro una columna de nombre o razon social. '
           + 'Cabeceras leidas: ' + cabeceras.join(', '),
      cabeceras_reconocidas: Object.keys(mapa) };
  }

  const yaEnDirectorio = new Set((existentes || []).map((e) => e.dedupe_key));
  const vistasEnFichero = new Map();
  const validas = [], errores = [], duplicados = [];

  filas.forEach((f, i) => {
    const numero = i + 2;   // +1 por indice, +1 por la cabecera: el nº que ve el usuario
    const val = (campo) => (mapa[campo] === undefined ? '' : String(f[mapa[campo]] == null ? '' : f[mapa[campo]]).trim());

    const fila = {
      nombre: val('nombre'), naturaleza: norm(val('naturaleza')), tipologia: val('tipologia'),
      pais: val('pais'), especialidad: val('especialidad'), experiencia: val('experiencia'),
      localizacion: val('localizacion'), email: val('email'), telefono: val('telefono'),
      web: val('web'), sector: val('sector'), tamano: val('tamano'), notas: val('notas'),
    };

    const fallos = [];
    if (!fila.nombre) fallos.push('falta el nombre o razon social');

    // Vocabulario CERRADO. Un valor fuera de lista no se "aproxima": se rechaza
    // la fila y se dice cual era, porque adivinar la tipologia de un contacto
    // es exactamente lo que HISP-103 prohibe.
    if (fila.naturaleza) {
      const equivalencias = { 'persona': 'persona_fisica', 'persona fisica': 'persona_fisica',
        'profesional': 'persona_fisica', 'empresa': 'empresa', 'institucion': 'institucion',
        'fundacion': 'fundacion' };
      fila.naturaleza = equivalencias[fila.naturaleza] || fila.naturaleza.replace(/\s+/g, '_');
      if (!dom.NATURALEZAS.includes(fila.naturaleza)) {
        fallos.push(`naturaleza "${val('naturaleza')}" no es valida (${dom.NATURALEZAS.join(', ')})`);
      }
    } else {
      fila.naturaleza = 'persona_fisica';
    }

    if (fila.tipologia) {
      const t = dom.TIPOLOGIAS.find((x) => norm(x) === norm(fila.tipologia));
      if (!t) fallos.push(`tipologia "${fila.tipologia}" no es valida (${dom.TIPOLOGIAS.join(', ')})`);
      else fila.tipologia = t;
    } else {
      // Quien no es asociado es Prospecto. Nunca se asume socio.
      fila.tipologia = 'Prospecto';
    }

    if (fila.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fila.email)) {
      fallos.push(`email "${fila.email}" no tiene forma de direccion valida`);
    }

    if (fallos.length) { errores.push({ fila: numero, nombre: fila.nombre || '(sin nombre)', fallos }); return; }

    const clave = claveDedupe(fila);
    if (yaEnDirectorio.has(clave)) {
      duplicados.push({ fila: numero, nombre: fila.nombre, motivo: 'ya existe en el directorio', clave });
      return;
    }
    if (vistasEnFichero.has(clave)) {
      duplicados.push({ fila: numero, nombre: fila.nombre,
        motivo: 'repetida dentro del mismo fichero (fila ' + vistasEnFichero.get(clave) + ')', clave });
      return;
    }
    vistasEnFichero.set(clave, numero);
    validas.push({ fila: numero, datos: fila, dedupe_key: clave });
  });

  // Origen: una fuente publica obliga a base legal y a la notificacion del
  // art. 14 RGPD. Una lista que el propio interesado facilito, no.
  const origen = opt.origen === 'fuente_publica' ? 'fuente_publica' : 'csv';

  return {
    ok: true,
    fichero: nombreFichero,
    origen,
    total_filas: filas.length,
    validas: validas.length,
    con_error: errores.length,
    duplicadas: duplicados.length,
    cabeceras_reconocidas: Object.keys(mapa),
    cabeceras_ignoradas: noReconocidas,
    errores: errores.slice(0, 200),
    duplicados: duplicados.slice(0, 200),
    muestra: validas.slice(0, 10).map((v) => v.datos),
    _validas: validas,
    aviso_art14: origen === 'fuente_publica'
      ? 'Estas fichas proceden de una fuente publica. Cada una registrara su base legal y '
      + 'quedara con la notificacion de transparencia del art. 14 RGPD pendiente, con plazo '
      + 'maximo de un mes desde la incorporacion.'
      : null,
    nota: 'Nada se ha escrito todavia. Revisa los errores y los duplicados antes de confirmar.',
  };
}

module.exports = { analizar, leer, mapearCabeceras, claveDedupe, COLUMNAS, norm };
