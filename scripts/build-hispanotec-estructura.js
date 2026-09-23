#!/usr/bin/env node
/* ============================================================================
   Genera public/hispanotec_digital/estructura/index.html — UN SOLO ARCHIVO.

   VA EN CARPETA, NO COMO estructura.html. express.static solo sirve la ruta
   exacta: /hispanotec_digital/estructura sin extensión caía en el catch-all de
   la API y devolvía {"success":false,"error":"Endpoint not found"}. Con
   index.html dentro de su carpeta, la ruta limpia redirige sola a la barra
   final y funciona, que es la dirección que se reparte.

   El logo se incrusta como data URI: el diagrama tiene que abrir sin conexión
   y sin depender de /hispatec/.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PARTS = path.join(__dirname, 'hispanotec-estructura');
const OUT = path.join(ROOT, 'public/hispanotec_digital/estructura/index.html');

const svg = fs.readFileSync(path.join(ROOT, 'public/hispatec/logo-hispanotec.svg'), 'utf8')
  .replace(/\n/g, ' ').trim();
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const html = ['head.html', 'body.html']
  .map(f => fs.readFileSync(path.join(PARTS, f), 'utf8'))
  .join('')
  .split('__LOGO__').join(LOGO);

if (html.indexOf('__LOGO__') !== -1) throw new Error('quedó el marcador del logo sin sustituir');
if (/src\s*=\s*["']https?:|<link[^>]+href\s*=\s*["']https?:|<script[^>]+src=/.test(html)) {
  throw new Error('el diagrama pide un recurso externo; tiene que abrir sin conexión');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('escrito ' + OUT + ' — ' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
