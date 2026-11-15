'use strict';
/**
 * Lee el Excel/CSV subido en un hilo aparte. xlsx@0.18.5 tiene CVE-2023-30533 (contaminación de
 * prototipo al leer un archivo armado) y CVE-2024-22363 (ReDoS): en un Worker la contaminación queda
 * en otro aislado de V8 y el bloqueo se corta por tiempo, así que no alcanzan al proceso del CRM.
 *
 * workerData.todas: lee TODAS las hojas en orden (SICAR exporta un reporte largo con una hoja
 * por página). workerData.max: tope de renglones (2,000 por omisión; los reportes de SICAR de un
 * año de compras pasan de mil).
 */
const { parentPort, workerData } = require('worker_threads');
try {
  const XLSX = require('xlsx');
  const max = Math.min(Number(workerData.max) || 2000, 50000);
  // raw:true: en un CSV la fecha 05/11/2026 se queda como texto y se lee día/mes.
  const wb = XLSX.read(Buffer.from(workerData.buf), { type: 'buffer', cellDates: false, sheetRows: max + 1, raw: true });
  const hojas = workerData.todas ? wb.SheetNames.slice(0, 200) : wb.SheetNames.slice(0, 1);
  let rows = [];
  for (const n of hojas) {
    rows = rows.concat(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
    if (rows.length > max) { parentPort.postMessage({ error: 'demasiados_renglones' }); return; }
  }
  parentPort.postMessage({ rows: JSON.parse(JSON.stringify(rows.map((r) => r.map((c) => (typeof c === 'number' ? c : String(c)))))) });
} catch (e) { parentPort.postMessage({ error: 'archivo_ilegible' }); }
