#!/usr/bin/env node
/**
 * Convierte public/dona-elena/index.html en un MP4 con la voz de Mara.
 *
 * Uso:  node scripts/render-dona-elena-video.js [--crf=14] [--mb=15] [--out=...]
 * ffmpeg/ffprobe y puppeteer son dependencias de construcción, no del servidor.
 *
 * Mismas reglas que render-maramed-video.js, por las mismas razones:
 *  - El reloj es la voz: cada lámina dura lo que dura su pista (más una cola de
 *    medio segundo para que el corte no caiga encima de la última sílaba). La
 *    secuencia de fotogramas se arma a mano, nunca con el demuxer `concat`.
 *  - Se codifica por calidad (CRF), sin -maxrate/-bufsize, con fotogramas clave
 *    sólo donde cambia la imagen.
 *  - El subtítulo va quemado y se achica hasta que la frase entra: en video no
 *    hay barra de desplazamiento y mucha gente lo ve sin sonido.
 *
 * Lo propio de este mazo: la lámina del simulador SE MUEVE. Se graba en tiempo
 * real con su marca de tiempo, y la demostración arranca en el momento en que
 * Mara empieza a describirla ("El cliente busca harina"), no al entrar a la
 * lámina, para que lo que se ve y lo que se oye coincidan.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const puppeteer = require('puppeteer');
const { synthesize } = require('../src/services/edge-tts');

const ROOT = path.join(__dirname, '..');
const DECK = path.join(ROOT, 'public', 'dona-elena', 'index.html');
const W = 1920, H = 1080, FPS = 12, TAIL = 0.5;
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `=${d}`).split('=').pop();
let CRF = parseInt(arg('crf', 14), 10);
const CAP_MB = parseFloat(arg('mb', 15));
const OUT = arg('out', path.join(os.homedir(), 'Desktop', 'Dona-Elena-presentacion.mp4'));

const ff = (b, a) => execFileSync(b, a, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dur = f => parseFloat(ff('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
const pad = (n, w = 5) => String(n).padStart(w, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Igual que capAt() en la página: la frase activa se reparte por caracteres.
function sentences(t) { return t.match(/[^.?!]+[.?!]+(\s|$)/g) || [t]; }
function captionAt(text, frac) {
  const s = sentences(text); let acc = 0, k = 0;
  for (; k < s.length - 1; k++) { acc += s[k].length; if (acc / text.length > frac) break; }
  return s[Math.min(k, s.length - 1)].trim();
}

(async () => {
  const html = fs.readFileSync(DECK, 'utf8');
  const NARR = eval('[' + html.match(/var NARR = \[([\s\S]*?)\n  \];/)[1] + ']');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dona-elena-'));
  console.log(`trabajo en ${work}`);

  // --- 1. voz: una pista por lámina, con cola ---------------------------------
  const durs = [];
  for (let i = 0; i < NARR.length; i++) {
    let buf = null;
    for (let t = 1; t <= 3 && !buf; t++) {
      try { buf = await synthesize(NARR[i], { voice: 'es-MX-DaliaNeural', rate: '-3%' }); }
      catch (e) { console.warn(`  voz ${i + 1}, intento ${t}: ${e.message}`); await sleep(1500 * t); }
    }
    if (!buf || buf.length < 1000) throw new Error(`Mara no devolvió audio para la lámina ${i + 1}`);
    const mp3 = path.join(work, `v${pad(i + 1, 2)}.mp3`), wav = path.join(work, `v${pad(i + 1, 2)}.wav`);
    fs.writeFileSync(mp3, buf);
    ff('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-af', `apad=pad_dur=${TAIL}`, '-ac', '1', '-ar', '44100', wav]);
    durs.push(dur(wav));
    console.log(`  voz ${i + 1}: ${durs[i].toFixed(1)} s`);
  }
  const alist = path.join(work, 'a.txt');
  fs.writeFileSync(alist, durs.map((_, i) => `file '${path.join(work, `v${pad(i + 1, 2)}.wav`)}'`).join('\n') + '\n');
  const voz = path.join(work, 'voz.wav');
  ff('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', alist, '-c', 'copy', voz]);

  // --- 2. servidor local (las fuentes de Google cargan por http, no por file://)
  const app = express(); app.use(express.static(path.join(ROOT, 'public')));
  const server = http.createServer(app).listen(0);
  const URL = `http://127.0.0.1:${server.address().port}/dona-elena/`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.click('#silent');
  await page.evaluate(async () => { await document.fonts.ready; });
  // Modo video: sin botones, subtítulo de varias líneas, escenario re-escalado.
  await page.addStyleTag({ content: `
    #prev,#play,#next,#cnt{display:none!important}
    .vp{inset:28px 0 118px 0!important}
    .dock{height:118px!important;padding:0 40px!important;gap:20px!important}
    .orb{width:52px!important;height:52px!important;flex-basis:52px!important}
    #prog{bottom:118px!important}
    #capT{font-size:14px!important}
    #capX{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;line-height:1.3!important;max-height:84px}
    .orb.sp{animation:pul 1.2s ease-in-out infinite}` });
  await page.evaluate(() => {
    const s = Math.min(1920 / 1280, (1080 - 28 - 118 - 14) / 720);
    const st = document.getElementById('stage');
    st.style.transform = 'scale(' + s + ')';
    window.addEventListener('resize', () => { st.style.transform = 'scale(' + s + ')'; }, true);
    document.getElementById('orb').classList.add('sp');
  });
  const setCap = (text, title, progress) => page.evaluate((t, ti, p) => {
    const c = document.getElementById('capX');
    document.getElementById('capT').textContent = 'Mara · ' + ti;
    c.textContent = t;
    for (let s = 24; s >= 15; s -= 0.5) { c.style.fontSize = s + 'px'; if (c.scrollHeight <= 84) break; }
    document.getElementById('prog').style.width = p + '%';
    document.getElementById('orb').classList.add('sp');
  }, text, title, progress);
  const goTo = async (n) => {
    await page.evaluate(n => {
      for (let j = 0; j < 12; j++) document.getElementById('prev').click();
      for (let j = 0; j < n; j++) document.getElementById('next').click();
    }, n);
    await page.evaluate(() => window.SIM && window.SIM.stop());
  };

  // --- 3. fotogramas: eventos (inicio, imagen) por lámina ----------------------
  const titles = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(s => s.dataset.t));
  const simIdx = await page.evaluate(() => [...document.querySelectorAll('.slide')].findIndex(s => s.id === 'simSlide'));
  const events = [];   // { slide, t, img }
  let shot = 0;
  const snap = async () => { const f = path.join(work, `s${pad(++shot)}.png`); await page.screenshot({ path: f }); return f; };

  for (let i = 0; i < NARR.length; i++) {
    const D = durs[i], text = NARR[i], ss = sentences(text);
    const base = durs.slice(0, i).reduce((a, b) => a + b, 0), total = durs.reduce((a, b) => a + b, 0);
    await goTo(i); await sleep(650);

    if (i !== simIdx) {
      // una imagen por frase: el subtítulo cambia donde cambia la frase
      let acc = 0;
      for (let k = 0; k < ss.length; k++) {
        const t = (acc / text.length) * (D - TAIL);
        await setCap(ss[k].trim(), titles[i], (base + t) / total * 100);
        events.push({ slide: i, t, img: await snap() });
        acc += ss[k].length;
      }
      continue;
    }

    // lámina del simulador: se graba en tiempo real
    await page.evaluate(() => window.SIM.reset());
    const startAt = Math.max(0, (text.indexOf('El cliente busca') / text.length) * (D - TAIL) - 0.8);
    const t0 = Date.now(); let started = false;
    while ((Date.now() - t0) / 1000 < D) {
      const t = (Date.now() - t0) / 1000;
      if (!started && t >= startAt) { await page.evaluate(() => window.SIM.auto()); started = true; }
      await setCap(captionAt(text, Math.min(t / (D - TAIL), 0.999)), titles[i], (base + t) / total * 100);
      events.push({ slide: i, t, img: await snap() });
    }
    console.log(`  simulador: ${events.filter(e => e.slide === i).length} capturas en ${D.toFixed(1)} s`);
  }
  await browser.close(); server.close();

  // --- 4. secuencia exacta a FPS fijos ----------------------------------------
  const seq = path.join(work, 'seq'); fs.mkdirSync(seq);
  let idx = 0;
  for (let i = 0; i < NARR.length; i++) {
    const ev = events.filter(e => e.slide === i);
    const n = Math.round(durs[i] * FPS);
    for (let f = 0; f < n; f++) {
      const t = f / FPS; let cur = ev[0];
      for (const e of ev) { if (e.t <= t) cur = e; else break; }
      fs.symlinkSync(cur.img, path.join(seq, `${pad(++idx)}.png`));
    }
  }
  const total = dur(voz);
  console.log(`${NARR.length} láminas · ${total.toFixed(1)} s · ${idx} fotogramas`);

  // --- 5. codificación por calidad ---------------------------------------------
  let mb = 0;
  for (let intento = 1; intento <= 5; intento++) {
    ff('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(seq, '%05d.png'), '-i', voz,
      '-vf', `scale=${W}:${H}:flags=lanczos`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-pix_fmt', 'yuv420p',
      '-x264-params', 'keyint=240:min-keyint=12:scenecut=40',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-ar', '44100', '-shortest',
      '-movflags', '+faststart', OUT]);
    mb = fs.statSync(OUT).size / 1048576;
    console.log(`  CRF ${CRF} -> ${mb.toFixed(2)} MB`);
    if (mb <= CAP_MB) break;
    CRF += 2;
  }
  const vd = dur(OUT);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`${OUT}\n${mb.toFixed(2)} MB · ${Math.floor(vd / 60)}:${String(Math.round(vd % 60)).padStart(2, '0')} · ${W}x${H} · ${FPS} fps`);
  if (Math.abs(vd - total) > 1) { console.error(`DESFASE: video ${vd.toFixed(2)} s vs voz ${total.toFixed(2)} s`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
