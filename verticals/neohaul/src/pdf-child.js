'use strict';
/**
 * Saca el texto del PDF del CFDI en un PROCESO aparte, no en el del CRM. pdf-parse 1.1.1 trae
 * pdf.js 1.10.100, dentro del rango de CVE-2024-4367 (ejecución de código vía FontMatrix y el
 * compilador PostScript, que usan eval/new Function). Por eso se lanza con
 * --disallow-code-generation-from-strings (eval y new Function fallan, pdf.js usa su camino sin
 * eval), con el entorno VACÍO (ninguna llave ni DATABASE_URL que robar), 256 MB y 10 s.
 *
 * Si la versión por defecto de pdf.js no puede (en el servidor respondió "bad XRef entry" con PDFs que
 * en otra máquina sí leía), se reintenta con la otra versión que trae pdf-parse (v2.0.550), en el mismo
 * proceso aislado. El error dice qué versiones probó y con qué Node, para poder diagnosticarlo.
 */
const parse = require('pdf-parse/lib/pdf-parse.js');
process.once('message', async (m) => {
  const buf = Buffer.from(m.buf, 'base64');
  const errores = [];
  for (const version of ['v1.10.100', 'v2.0.550']) {
    try {
      const d = await parse(buf, { max: 40, version });
      return process.send({ text: String(d.text || '').slice(0, 2e6), version }, () => process.exit(0));
    } catch (e) { errores.push(version + ': ' + String((e && e.message) || e).slice(0, 80)); }
  }
  process.send({ error: 'pdf_ilegible', detalle: `node ${process.version} · ${errores.join(' | ')}` }, () => process.exit(0));
});
