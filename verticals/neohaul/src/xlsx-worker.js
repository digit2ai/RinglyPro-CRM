'use strict';
/**
 * Lee el Excel/CSV subido en un hilo aparte (el PDF va en pdf-child.js, un proceso aparte). xlsx@0.18.5 tiene CVE-2023-30533
 * (contaminación de prototipo al leer un archivo armado) y CVE-2024-22363 (ReDoS).
 * En un Worker la contaminación queda en otro aislado de V8 y el bloqueo se corta
 * por tiempo, así que ninguno de los dos alcanza al proceso del CRM.
 */
const { parentPort, workerData } = require('worker_threads');
try {
  const XLSX = require('xlsx');
  // raw:true: en un CSV la fecha 05/11/2026 se queda como texto y se lee día/mes.
  const wb = XLSX.read(Buffer.from(workerData.buf), { type: 'buffer', cellDates: false, sheetRows: 2001, raw: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  if (rows.length > 2000) { parentPort.postMessage({ error: 'demasiados_renglones' }); return; }
  parentPort.postMessage({ rows: JSON.parse(JSON.stringify(rows.map((r) => r.map((c) => (typeof c === 'number' ? c : String(c)))))) });
} catch (e) { parentPort.postMessage({ error: 'archivo_ilegible' }); }
