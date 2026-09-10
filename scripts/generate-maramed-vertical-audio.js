#!/usr/bin/env node
/**
 * Narración corta (voz Dalia) del corte vertical para WhatsApp.
 * Lee el guion del propio public/maramed-vertical.html — el subtítulo en
 * pantalla y lo que se escucha tienen que ser la misma frase.
 * Uso: node scripts/generate-maramed-vertical-audio.js [--force]
 */
require('dotenv').config();
const fs = require('fs'), path = require('path');
const edgeTts = require('../src/services/edge-tts');

const VOICE = process.env.NARRATION_VOICE_ES || 'es-MX-DaliaNeural';
// Un punto más rápida que el mazo largo: en un video de compartir, el ritmo importa.
const RATE = process.env.NARRATION_RATE_VERTICAL || '+2%';
const FORCE = process.argv.includes('--force');
const DECK = path.join(__dirname, '..', 'public', 'maramed-vertical.html');
const OUT = path.join(__dirname, '..', 'public', 'maramed-audio-vertical');

(async () => {
  const html = fs.readFileSync(DECK, 'utf8');
  const V = JSON.parse(html.match(/var VNARR = (\{[\s\S]*?\n\});/)[1]);
  const scenes = [...html.matchAll(/class="scene" data-n="(v\d+)"/g)].map(m => m[1]);
  const missing = scenes.filter(k => !V[k]);
  if (missing.length) throw new Error('escenas sin voz: ' + missing.join(', '));

  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\nMaraMed vertical · ${VOICE} (${RATE}) · Edge neural, sin API key\n`);
  let total = 0;
  for (let i = 0; i < scenes.length; i++) {
    const k = scenes[i], file = path.join(OUT, `${k}.mp3`);
    if (fs.existsSync(file) && !FORCE) { console.log(`[${i + 1}/${scenes.length}] SALTA ${k}`); total += fs.statSync(file).size; continue; }
    const buf = await edgeTts.synthesizeLong(V[k], { voice: VOICE, rate: RATE, lang: 'es-MX' });
    if (!buf || buf.length < 1024) throw new Error(`${k}: respuesta vacía`);
    fs.writeFileSync(file, buf); total += buf.length;
    console.log(`[${i + 1}/${scenes.length}] OK ${k}.mp3  ${(buf.length / 1024).toFixed(1)} KB`);
    if (i < scenes.length - 1) await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`\n${scenes.length} pistas · ${(total / 1024).toFixed(0)} KB\n`);
})();
