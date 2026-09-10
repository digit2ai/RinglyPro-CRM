#!/usr/bin/env node
/**
 * Genera los MP3 de narración (voz Dalia) de public/maramed-presentacion.html.
 *
 * EL TEXTO SE LEE DE LA PROPIA PRESENTACIÓN, NO SE COPIA AQUÍ. El objeto NARR
 * del HTML es a la vez el subtítulo en pantalla y el guion hablado; tenerlo dos
 * veces garantiza que un día digan cosas distintas — que es exactamente el
 * defecto que un espectador nota y nadie más.
 *
 * Motor: Edge TTS neuronal del repo (sin API key, cero dólares por llamada).
 *
 * Uso:  node scripts/generate-maramed-audio.js [--force]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const edgeTts = require('../src/services/edge-tts');

// Dalia = es-MX-DaliaNeural, la voz de marca de Digit2AI.
const VOICE = process.env.NARRATION_VOICE_ES || 'es-MX-DaliaNeural';
// Algo más lenta que el habla natural: es material clínico y con siglas.
const RATE = process.env.NARRATION_RATE_ES || '-4%';
const FORCE = process.argv.includes('--force');

const DECK = path.join(__dirname, '..', 'public', 'maramed-presentacion.html');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'maramed-audio');

function readNarrations() {
  const html = fs.readFileSync(DECK, 'utf8');
  const m = html.match(/var NARR = (\{[\s\S]*?\n  \});/);
  if (!m) throw new Error('No se encontró el objeto NARR en ' + DECK);
  const narr = JSON.parse(m[1]);

  // El mazo y el audio deben cubrir exactamente las mismas diapositivas: una
  // pista de más es un archivo huérfano, una de menos es una lámina muda.
  const slides = [...html.matchAll(/class="slide[^"]*" data-n="(s\d+)"/g)].map(x => x[1]);
  const missing = slides.filter(s => !narr[s]);
  const orphan = Object.keys(narr).filter(k => !slides.includes(k));
  if (missing.length) throw new Error('Diapositivas sin narración: ' + missing.join(', '));
  if (orphan.length) throw new Error('Narración sin diapositiva: ' + orphan.join(', '));

  return slides.map(key => ({ key, text: narr[key] }));
}

async function generate({ key, text }, n, total) {
  const file = path.join(OUTPUT_DIR, `${key}.mp3`);
  if (fs.existsSync(file) && !FORCE) {
    console.log(`[${String(n).padStart(2, '0')}/${total}] SALTA ${key}.mp3 (ya existe, use --force)`);
    return fs.statSync(file).size;
  }
  const buffer = await edgeTts.synthesizeLong(text, { voice: VOICE, rate: RATE, lang: 'es-MX' });
  if (!buffer || buffer.length < 1024) throw new Error('respuesta vacía del motor');
  fs.writeFileSync(file, buffer);
  console.log(`[${String(n).padStart(2, '0')}/${total}] OK    ${key}.mp3  ${(buffer.length / 1024).toFixed(1)} KB  ·  ${text.length} caracteres`);
  return buffer.length;
}

async function main() {
  const items = readNarrations();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\nMaraMed — narración en español, voz Dalia`);
  console.log(`Voz:    ${VOICE}  (${RATE})  ·  Edge neural, sin API key`);
  console.log(`Fuente: ${DECK}`);
  console.log(`Salida: ${OUTPUT_DIR}\n`);

  let total = 0, failed = [];
  for (let i = 0; i < items.length; i++) {
    try {
      total += await generate(items[i], i + 1, items.length);
      if (i < items.length - 1) await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      failed.push(items[i].key);
      console.error(`[${String(i + 1).padStart(2, '0')}/${items.length}] FALLÓ ${items[i].key}: ${err.message}`);
    }
  }

  console.log(`\n${items.length - failed.length}/${items.length} pistas · ${(total / 1024 / 1024).toFixed(2)} MB`);
  if (failed.length) {
    console.error(`FALTAN: ${failed.join(', ')} — esas láminas quedan mudas.\n`);
    process.exit(1);
  }
  console.log('Listo.\n');
}

main();
