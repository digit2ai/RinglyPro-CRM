#!/usr/bin/env node
/* ============================================================================
   Genera public/hispanotec_digital/index.html — UN SOLO ARCHIVO.

   El simulador va INCRUSTADO, no enlazado ni capturado: durante la charla se
   hace clic en la aplicación real. Una captura se proyecta borrosa, no
   reacomoda y envejece el día que cambia el producto; un iframe exige red en
   la sala. Por eso demo.css, demo-data.js y demo.js se inyectan tal cual desde
   public/hispanotec/demo/, con el logo convertido a data URI para que el
   archivo no dependa de nada externo.

   El deck se REGENERA, no se edita a mano: las partes viven en
   scripts/hispanotec-digital-deck/ y esto solo las cose.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PARTS = path.join(__dirname, 'hispanotec-digital-deck');
// Servido en /hispanotec_digital por express.static, que redirige la ruta sin
// barra final a la que la lleva.
const OUT = path.join(ROOT, 'public/hispanotec_digital/index.html');
const DEMO = path.join(ROOT, 'public/hispanotec/demo');

function read(p) { return fs.readFileSync(p, 'utf8'); }

// El logo, en línea. Es el único recurso que las páginas piden fuera de sí mismas.
const svg = read(path.join(ROOT, 'public/hispatec/logo-hispanotec.svg')).replace(/\n/g, ' ').trim();
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

// El simulador. La única modificación es su constante LOGO: dentro del deck no
// existe /hispatec/, así que apuntar allí dejaría la aplicación sin marca.
const simCss = read(path.join(DEMO, 'demo.css'));
const simData = read(path.join(DEMO, 'demo-data.js'));
let simJs = read(path.join(DEMO, 'demo.js'));

const LOGO_LINE = "var LOGO = '/hispatec/logo-hispanotec.svg';";
if (simJs.indexOf(LOGO_LINE) === -1) {
  throw new Error('demo.js ya no declara LOGO como se esperaba; revisa el simulador antes de generar');
}
simJs = simJs.replace(LOGO_LINE, "var LOGO = '" + LOGO + "';");

// Las partes, en orden.
const html = ['part1.html', 'part2.html', 'part3.html', 'part4.html', 'part5.html']
  .map(f => read(path.join(PARTS, f)))
  .join('')
  .split('__LOGO_URI__').join(LOGO)
  .replace('__SIM_CSS__', () => simCss)
  .replace('__SIM_DATA__', () => simData)
  .replace('__SIM_JS__', () => simJs);

['__LOGO_URI__', '__SIM_CSS__', '__SIM_DATA__', '__SIM_JS__'].forEach(tok => {
  if (html.indexOf(tok) !== -1) throw new Error('quedó sin sustituir: ' + tok);
});
if (/src\s*=\s*["']https?:|<link[^>]+href\s*=\s*["']https?:|<script[^>]+src=/.test(html)) {
  throw new Error('el deck pide un recurso externo; tiene que abrir sin conexión');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('escrito ' + OUT + ' — ' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB, 0 recursos externos');
