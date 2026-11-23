'use strict';
/**
 * "Subir archivos": la persona suelta todos sus archivos juntos (reportes de SICAR en PDF o Excel,
 * estados de cuenta en Excel/CSV, listas de cuentas por cobrar o por pagar) y cada uno se reconoce
 * solo. PURO: sin base de datos ni red (index.js lee los archivos y aplica).
 *
 * Cómo se decide qué es cada archivo:
 *   1. Si sicar.js reconoce el reporte por su título o columnas, es SICAR (lo más confiable).
 *   2. Si tiene Fecha + Concepto + Cargo/Abono (o Monto) y no tiene columna de cliente ni
 *      proveedor, es un estado de cuenta. La cuenta se elige por los últimos 4 dígitos o por el
 *      banco que aparecen en el nombre del archivo o en su encabezado.
 *   3. Si tiene Cliente o Proveedor + Total/Saldo, es una lista de cuentas por cobrar o por pagar.
 * Lo que no queda claro (dos cuentas posibles, "Nombre" sin decir si es cliente o proveedor)
 * NUNCA se adivina: vuelve como "revisar" con la mejor opción preseleccionada. Un estado de cuenta
 * cargado en la cuenta equivocada movería el efectivo que la empresa ve en su tablero.
 */

const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const fold = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Busca el renglón de encabezados (entre los primeros 30) que tenga las columnas requeridas. */
function encabezados(rows, campos, requeridos) {
  for (let i = 0; i < Math.min((rows || []).length, 30); i++) {
    const head = (rows[i] || []).map(norm), map = {};
    for (const [k, re] of Object.entries(campos)) { const j = head.findIndex((h) => h && re.test(h)); if (j >= 0 && !Object.values(map).includes(j)) map[k] = j; }
    if (requeridos.every((grupo) => grupo.some((k) => map[k] != null))) return { fila: i, map, head };
  }
  return null;
}

const BANCO_CAMPOS = {
  fecha: /^fecha|^fechaoper|^dia$/, concepto: /concepto|descripcion|detalle|movimiento/, referencia: /referencia|^ref|folio|autorizacion/,
  cargo: /cargo|retiro|debito|salida/, abono: /abono|deposito|credito|entrada/, monto: /^monto|^importe/, saldo: /^saldo/,
  contraparte: /^contraparte|^beneficiario|^ordenante/
};
const BANCO_REQ = [['fecha'], ['concepto'], ['cargo', 'abono', 'monto']];
const DOC_CAMPOS = (key) => ({
  parte: key === 'cxc' ? /^cliente|nombre|razonsocial/ : /^proveedor|nombre|razonsocial/,
  folio: /folio|factura|documento|^doc|remision|^num/, fecha: /^fecha(?!.*venc)|^emision|^fechadoc/, vencimiento: /venc/,
  dias: /^dias|credito|plazo/, total: /^total|^importe|^monto/, saldo: /^saldo|pendiente|porpagar|porcobrar|adeudo/
});
const DOC_REQ = [['parte'], ['total', 'saldo']];

const NOMBRE = {
  cxc: /\b(por cobrar|cxc|cobranza|cartera|clientes?|deudores)\b/,
  cxp: /\b(por pagar|cxp|proveedores?|acreedores)\b/,
  banco: /\b(estado de cuenta|edo cta|edocta|banco|movimientos|bbva|bancomer|banorte|hsbc|santander|scotiabank|banamex|citibanamex|banregio|inbursa|azteca|bajio|afirme|mifel)\b/
};

/** Texto del encabezado del archivo (primeros renglones), para buscar la cuenta o el banco. */
function textoInicio(rows, n) { return (rows || []).slice(0, n || 15).map((r) => (r || []).join(' ')).join(' | '); }

/**
 * ¿A qué cuenta va este estado de cuenta? Por los últimos 4 dígitos (que no sean parte de una fecha
 * ni de otro número más largo que no termine ahí) y, si no, por el nombre del banco.
 * Devuelve { cuenta_id, seguro, por_que, candidatas }.
 */
function elegirCuenta(nombreArchivo, rows, cuentas) {
  const activas = (cuentas || []).filter((c) => c.active !== false);
  const texto = String(nombreArchivo || '') + ' | ' + textoInicio(rows, 15);
  const porDigitos = activas.filter((c) => c.terminacion && /^\d{4}$/.test(c.terminacion) &&
    new RegExp('(^|[^\\d/\\-.])\\d*' + c.terminacion + '(?![\\d/\\-.]\\d)').test(texto.replace(/[*xX•·]+/g, ' ')));
  if (porDigitos.length === 1) return { cuenta_id: porDigitos[0].id, seguro: true, por_que: `termina en ${porDigitos[0].terminacion}`, candidatas: porDigitos.map((c) => c.id) };
  const f = fold(texto);
  const porBanco = (porDigitos.length ? porDigitos : activas).filter((c) => c.banco && fold(c.banco).length >= 3 && new RegExp('\\b' + fold(c.banco).replace(/[^a-z0-9 ]/g, '') + '\\b').test(f));
  if (porBanco.length === 1) return { cuenta_id: porBanco[0].id, seguro: true, por_que: `dice ${porBanco[0].banco}`, candidatas: porBanco.map((c) => c.id) };
  if (!porDigitos.length && !porBanco.length && activas.length === 1) return { cuenta_id: activas[0].id, seguro: true, por_que: 'es la única cuenta', candidatas: [activas[0].id] };
  const cand = porDigitos.length ? porDigitos : porBanco.length ? porBanco : activas;
  return { cuenta_id: cand.length ? cand[0].id : null, seguro: false, por_que: null, candidatas: cand.map((c) => c.id) };
}

/**
 * Clasifica un archivo que no es reporte de SICAR (renglones de su primera hoja).
 *   { tipo: 'banco', estado: 'auto'|'revisar', cuenta_id, por_que, motivo }
 *   { tipo: 'cxc'|'cxp', estado: 'auto'|'revisar', por_que, motivo }
 *   { tipo: null, estado: 'rechazado', motivo }
 */
function clasificarTabla(rows, nombreArchivo, cuentas) {
  const label = fold(String(nombreArchivo || '').replace(/\.[a-z0-9]+$/i, ''));
  const banco = encabezados(rows, BANCO_CAMPOS, BANCO_REQ);
  const docC = encabezados(rows, DOC_CAMPOS('cxc'), DOC_REQ), docP = encabezados(rows, DOC_CAMPOS('cxp'), DOC_REQ);
  const doc = docC || docP;
  const headDoc = doc ? doc.head : [];
  const dice = (re) => headDoc.some((h) => re.test(h));
  const esCliente = dice(/^cliente|^deudor/), esProveedor = dice(/^proveedor|^acreedor/);
  if (banco && !esCliente && !esProveedor) {
    const c = elegirCuenta(nombreArchivo, rows, cuentas);
    const por_que = ['tiene Fecha, Concepto y ' + (banco.map.cargo != null || banco.map.abono != null ? 'Cargo/Abono' : 'Monto')];
    if (c.por_que) por_que.push('la cuenta ' + c.por_que);
    if (!c.cuenta_id) return { tipo: 'banco', estado: 'revisar', cuenta_id: null, candidatas: [], por_que, motivo: 'Es un estado de cuenta, pero no hay ninguna cuenta de banco dada de alta. Agrega la cuenta en Bancos.' };
    return { tipo: 'banco', estado: c.seguro ? 'auto' : 'revisar', cuenta_id: c.cuenta_id, candidatas: c.candidatas, por_que,
      motivo: c.seguro ? null : 'Es un estado de cuenta: confirma a qué cuenta pertenece (no se adivina).' };
  }
  if (doc) {
    let tipo = esCliente && !esProveedor ? 'cxc' : esProveedor && !esCliente ? 'cxp' : null;
    const por_que = [];
    if (tipo) por_que.push(tipo === 'cxc' ? 'la columna dice cliente' : 'la columna dice proveedor');
    const nC = NOMBRE.cxc.test(label), nP = NOMBRE.cxp.test(label);
    if (!tipo && nC !== nP) { tipo = nC ? 'cxc' : 'cxp'; por_que.push('el nombre del archivo lo dice'); return { tipo, estado: 'revisar', por_que, motivo: 'La columna dice "Nombre": confirma si son clientes o proveedores.' }; }
    if (!tipo) return { tipo: 'cxc', estado: 'revisar', por_que, motivo: 'No dice si son clientes o proveedores: elige.' };
    const choca = (tipo === 'cxc' && nP && !nC) || (tipo === 'cxp' && nC && !nP);
    if (choca) return { tipo, estado: 'revisar', por_que, motivo: 'El nombre del archivo dice lo contrario de las columnas: confirma.' };
    por_que.push('tiene ' + (doc.map.saldo != null ? 'Saldo' : 'Total'));
    return { tipo, estado: 'auto', por_que, motivo: null };
  }
  return { tipo: null, estado: 'rechazado', motivo: 'No reconocí el archivo. Sube un reporte de SICAR tal como lo guarda SICAR, un estado de cuenta (Fecha, Concepto, Cargo/Abono) o una lista de clientes/proveedores con Total.' };
}

/** Orden de carga: primero los saldos de SICAR, luego su historial, luego listas, al final bancos. */
const ORDEN = { creditos_clientes: 1, creditos_proveedores: 1, periodo_clientes: 2, periodo_proveedores: 2, compras_general: 3, ventas_general: 3, abonos_clientes: 4, abonos_proveedores: 4, cxc: 5, cxp: 5, banco: 6 };
const orden = (it) => ORDEN[it.sicar_tipo || it.tipo] || 9;

module.exports = { clasificarTabla, elegirCuenta, encabezados, norm, fold, BANCO_CAMPOS, BANCO_REQ, DOC_CAMPOS, DOC_REQ, ORDEN, orden };
