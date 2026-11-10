'use strict';
/**
 * Saca el texto del PDF del CFDI en un PROCESO aparte, no en el del CRM. pdf-parse 1.1.1 trae
 * pdf.js 1.10.100, dentro del rango de CVE-2024-4367 (ejecución de código vía FontMatrix y el
 * compilador PostScript, que usan eval/new Function). Por eso se lanza con
 * --disallow-code-generation-from-strings (eval y new Function fallan, pdf.js usa su camino sin
 * eval), con el entorno VACÍO (ninguna llave ni DATABASE_URL que robar), 256 MB y 10 s.
 */
process.once('message', (m) => {
  try {
    require('pdf-parse/lib/pdf-parse.js')(Buffer.from(m.buf, 'base64'), { max: 40 })
      .then((d) => process.send({ text: String(d.text || '').slice(0, 2e6) }, () => process.exit(0)))
      .catch(() => process.send({ error: 'pdf_ilegible' }, () => process.exit(0)));
  } catch (_) { process.send({ error: 'pdf_ilegible' }, () => process.exit(0)); }
});
