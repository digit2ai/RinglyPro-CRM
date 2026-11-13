#!/usr/bin/env node
/*
 * HISPANOTEC WhatsApp video, designed natively for a vertical phone screen.
 * Slides: public/hispanotec_presentacion/video/deck.html (17 slides drawn for 720x1050,
 * elements appear sentence by sentence via data-s). Script: scripts/hispanotec-video-corto.json
 * (same order, one item per slide). Voice: Dalia via /api/tts/edge. Captions burned in.
 *
 * Usage: node scripts/render-hispanotec-video-pro.js [--out=<file.mp4>] [--crf=28]
 * Needs puppeteer + ffmpeg at build time only.
 */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { execFileSync } = require('child_process');
const sharp = require('sharp'), puppeteer = require('puppeteer');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const PUB = path.join(__dirname, '..', 'public');
const OUT = arg('out', path.join(os.homedir(), 'Desktop', 'Hispanotec', 'HISPANOTEC_video_WhatsApp.mp4'));
let CRF = +arg('crf', 28);
const MAX_MB = 12, TTS = 'https://aiagent.ringlypro.com/api/tts/edge';
const FW = 720, FH = 1280, CAP_H = 230, IMG_H = FH - CAP_H, FPS = 5, TAIL = 0.5;
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'hispanotec-video-corto.json'), 'utf8')).items;
// Spoken-only spelling: the voice reads 'Hispanotec Digital' as English otherwise.
const say = t => t.replace(/Hispanotec Digital/gi, 'Hispanotec dijital');
const sentences = t => (t.match(/[^.!?¿¡]*[¿¡]?[^.!?]*[.!?]+|\S[^.!?]*$/g) || [t]).map(s => s.trim()).filter(Boolean);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wrap(text, max) { const w = text.split(/\s+/), l = []; let c = ''; for (const x of w) { if ((c + ' ' + x).trim().length > max) { l.push(c); c = x; } else c = (c + ' ' + x).trim(); } if (c) l.push(c); return l; }
function captionSvg(text) {
  for (let f = 30; f >= 20; f -= 2) {
    const lines = wrap(text, Math.floor(640 / (f * 0.52))), lh = f * 1.3;
    if (lines.length * lh <= CAP_H - 40) {
      const y0 = (CAP_H - lines.length * lh) / 2 + f * 0.95;
      const t = lines.map((l, i) => `<text x="${FW / 2}" y="${(y0 + i * lh).toFixed(1)}" text-anchor="middle">${esc(l)}</text>`).join('');
      return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${CAP_H}"><rect width="100%" height="100%" fill="#070d1f"/><rect x="56" width="${FW - 112}" height="2" fill="#d4af5f" opacity=".6"/><g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${f}" font-weight="500" fill="#ffffff">${t}</g></svg>`);
    }
  }
  throw new Error('caption does not fit: ' + text.slice(0, 60));
}
(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hpro-'));
  const srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(PUB) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream'); fs.createReadStream(f).pipe(r); }).listen(0);
  const port = srv.address().port;
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: FW, height: IMG_H, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${port}/hispanotec_presentacion/video/deck.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.fitted === true);
  const n = await page.evaluate(() => window.count);
  if (n !== items.length) throw new Error(`deck has ${n} slides, script has ${items.length}`);
  const stills = [], audios = []; let total = 0;
  for (let k = 0; k < items.length; k++) {
    const text = items[k].text, sents = sentences(text);
    const mp3 = path.join(work, `a${k}.mp3`);
    const r = await fetch(TTS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: say(text), voice: 'dalia' }) });
    if (!r.ok) throw new Error('tts ' + r.status);
    fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
    const voice = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString();
    const dur = voice + TAIL; audios.push({ mp3, dur });
    const chars = sents.reduce((a, s) => a + s.length, 0); let acc = 0;
    for (let s = 0; s < sents.length; s++) {
      const start = acc; acc += sents[s].length / chars * voice; const end = s === sents.length - 1 ? dur : acc;
      await page.evaluate((a, b) => window.show(a, b), k, s);
      const shot = await page.screenshot({ type: 'png' });
      const slide = await sharp(shot).resize(FW, IMG_H).png().toBuffer();
      const file = path.join(work, `f${k}_${s}.png`);
      await sharp({ create: { width: FW, height: FH, channels: 3, background: '#070d1f' } }).composite([{ input: slide, top: 0, left: 0 }, { input: captionSvg(sents[s]), top: IMG_H, left: 0 }]).png().toFile(file);
      stills.push({ file, end: total + end });
    }
    total += dur;
    console.log(`slide ${k + 1}: ${dur.toFixed(1)}s, ${sents.length} steps`);
  }
  await browser.close(); srv.close();
  const seq = path.join(work, 'seq'); fs.mkdirSync(seq); let fr = 0;
  for (const st of stills) for (const e = Math.round(st.end * FPS); fr < e; fr++) fs.symlinkSync(st.file, path.join(seq, 'x' + String(fr).padStart(6, '0') + '.png'));
  const list = [];
  for (const a of audios) { const w = a.mp3.replace('.mp3', '.wav'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', a.mp3, '-af', `apad=whole_dur=${a.dur.toFixed(3)}`, '-ar', '24000', '-ac', '1', w]); list.push(`file '${w}'`); }
  fs.writeFileSync(path.join(work, 'l.txt'), list.join('\n'));
  const wav = path.join(work, 'v.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'l.txt'), '-c', 'copy', wav]);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  for (;;) {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(seq, 'x%06d.png'), '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-x264-params', 'keyint=600:scenecut=40', '-r', String(FPS), '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-ar', '24000', '-movflags', '+faststart', '-shortest', OUT]);
    const mb = fs.statSync(OUT).size / 1048576, vd = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT]).toString();
    console.log(`crf ${CRF}: ${mb.toFixed(2)} MB, ${Math.floor(vd / 60)}:${String(Math.round(vd % 60)).padStart(2, '0')}`);
    if (Math.abs(vd - total) > 1) throw new Error('video and voice differ');
    if (mb <= MAX_MB) break; CRF += 2;
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log('OK ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
