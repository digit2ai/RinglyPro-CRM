'use strict';
/**
 * Lee un reporte PDF de SICAR en un PROCESO aparte, no en el del CRM (mismo blindaje que NeoHaul:
 * pdf-parse 1.1.1 trae pdf.js 1.10.100, dentro del rango de CVE-2024-4367; se lanza con
 * --disallow-code-generation-from-strings, entorno VACÍO, 256 MB y tiempo límite).
 *
 * SICAR imprime cada celda como un texto aparte. El texto plano las pega sin separador
 * ("50514GRUPO MECASA PLUSCOM"), así que aquí se devuelve cada renglón como una lista de
 * celdas con su posición horizontal x. sicar.js asigna cada celda a su columna por posición.
 */
const MAX_PAGES = 120;
process.once('message', (m) => {
  const pages = [];
  const render = (pd) => pd.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: true }).then((tc) => {
    const rows = new Map();
    for (const it of tc.items) {
      const s = String(it.str || '');
      if (!s.trim()) continue;
      // Celdas a 2 puntos de altura de distancia son el mismo renglón.
      const y = Math.round(it.transform[5] / 2) * 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: Math.round(it.transform[4]), t: s.trim() });
    }
    pages.push([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, cells]) => cells.sort((a, b) => a.x - b.x)));
    return '';
  });
  try {
    require('pdf-parse/lib/pdf-parse.js')(Buffer.from(m.buf, 'base64'), { max: MAX_PAGES, pagerender: render })
      .then(() => process.send({ pages }, () => process.exit(0)))
      .catch(() => process.send({ error: 'pdf_ilegible' }, () => process.exit(0)));
  } catch (_) { process.send({ error: 'pdf_ilegible' }, () => process.exit(0)); }
});
