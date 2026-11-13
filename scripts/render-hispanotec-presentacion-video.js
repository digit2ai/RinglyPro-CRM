#!/usr/bin/env node
/*
 * Renders the PHONE version of /hispanotec_presentacion as a vertical MP4 small
 * enough for WhatsApp: 720x1280, Dalia's narration, captions burned in.
 *
 * It reuses what the web deck already has, so the two cannot drift:
 *   - the vertical slides  public/hispanotec_presentacion/vertical/vNN.jpg
 *   - the narration        NARR in public/hispanotec_presentacion/index.html
 *   - the voice            POST /api/tts/edge (voice "dalia"), same as the page
 *
 * Kept light on purpose: a tall slide is shown as still "pages" with hard cuts,
 * never a continuous scroll (a moving picture costs bits on every frame), and
 * the frame sequence is built by hand from cumulative time so the picture can
 * never drift from the voice. Encoded by quality (CRF), not by bitrate.
 *
 * Usage: node scripts/render-hispanotec-presentacion-video.js [--out=<file.mp4>] [--crf=30] [--mb=15.5]
 * Needs ffmpeg at build time only.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', 'public', 'hispanotec_presentacion');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const OUT = arg('out', path.join(os.homedir(), 'Desktop', 'HISPANOTEC_presentacion_movil.mp4'));
let CRF = +arg('crf', 30);
const MAX_MB = +arg('mb', 15.5);
const TTS = arg('tts', 'https://aiagent.ringlypro.com/api/tts/edge');
// --slides=11-16 renders a part. WhatsApp re-encodes every video it sends to fit its own
// size cap and silently TRIMS what does not fit (measured 2026-11-12: a 14:44 file was cut
// at about 8:40), so the deck ships as parts of about five minutes each.
const RANGE = (arg('slides', '') || '').split('-').map(Number);
const FW = 720, FH = 1280, CAP_H = 230, IMG_H = FH - CAP_H, FPS = 5, TAIL = 0.45, OVERLAP = 90;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NARR = Function('return ' + html.match(/var NARR = (\[[\s\S]*?\n\]);/)[1])();
// Spoken-only spelling (same as the page): the voice read 'Hispanotec Digital' as English.
const say = t => t.replace(/Hispanotec Digital/gi, 'Hispanotec dijital');
const sentences = t => (t.match(/[^.!?¿¡]*[¿¡]?[^.!?]*[.!?]+|\S[^.!?]*$/g) || [t]).map(s => s.trim()).filter(Boolean);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wrap(text, max) {
  const words = text.split(/\s+/), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines;
}
// The caption shrinks until it fits: a cut-off sentence is the text a silent viewer misses.
function captionSvg(text) {
  for (let fs_ = 30; fs_ >= 20; fs_ -= 2) {
    const lines = wrap(text, Math.floor(660 / (fs_ * 0.52)));
    const lh = fs_ * 1.28;
    if (lines.length * lh <= CAP_H - 36) {
      const y0 = (CAP_H - lines.length * lh) / 2 + fs_ * 0.95;
      const t = lines.map((l, i) => `<text x="${FW / 2}" y="${(y0 + i * lh).toFixed(1)}" text-anchor="middle">${esc(l)}</text>`).join('');
      return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${CAP_H}"><rect width="100%" height="100%" fill="#070d1f"/><rect width="100%" height="3" fill="#d4af5f"/><g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${fs_}" font-weight="500" fill="#ffffff">${t}</g></svg>`);
    }
  }
  throw new Error('caption does not fit: ' + text.slice(0, 60));
}

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hpvid-'));
  const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'vertical', 'layout.json'), 'utf8'));
  const stills = []; // {file, dur}
  const audios = [];
  let total = 0;
  // --guion=<json> renders a shortened cut: [{slide, text}], each on its own vertical slide.
  const GUION = arg('guion', '');
  let items;
  if (GUION) items = JSON.parse(fs.readFileSync(GUION, 'utf8')).items.map(x => ({ i: x.slide - 1, text: x.text }));
  else {
    const first = RANGE[0] ? RANGE[0] - 1 : 0, last = RANGE[1] ? RANGE[1] - 1 : NARR.length - 1;
    items = []; for (let i = first; i <= last; i++) items.push({ i, text: NARR[i] });
  }
  for (const item of items) {
    const i = item.i, TEXT = item.text;
    const n = String(i + 1).padStart(2, '0');
    // 1. voice
    const mp3 = path.join(work, 'a' + n + '.mp3');
    const r = await fetch(TTS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: say(TEXT), voice: 'dalia' }) });
    if (!r.ok) throw new Error('tts ' + r.status + ' on slide ' + n);
    fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
    const voiceDur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString().trim();
    const dur = voiceDur + TAIL;
    audios.push({ mp3, dur });
    // 2. pages of the vertical slide
    const bg = (layout[i + 1] && layout[i + 1].bg) || '#070d1f';
    const slide = await sharp(path.join(ROOT, 'vertical', 'v' + n + '.jpg')).resize(FW).toBuffer({ resolveWithObject: true });
    const H = slide.info.height, tops = [];
    if (H <= IMG_H) tops.push(null);
    else { for (let t = 0; t < H - IMG_H; t += IMG_H - OVERLAP) tops.push(t); tops.push(H - IMG_H); }
    const pages = [];
    for (let k = 0; k < tops.length; k++) {
      const t = tops[k];
      const img = t === null
        ? await sharp({ create: { width: FW, height: IMG_H, channels: 3, background: bg } }).composite([{ input: slide.data, top: Math.round((IMG_H - H) / 2), left: 0 }]).png().toBuffer()
        : await sharp(slide.data).extract({ left: 0, top: t, width: FW, height: IMG_H }).png().toBuffer();
      pages.push(img);
    }
    // page k is on screen for a share of the slide proportional to the new picture it brings
    const steps = tops.map((t, k) => t === null ? 1 : (k === 0 ? IMG_H : tops[k] - tops[k - 1]));
    const sumSteps = steps.reduce((a, b) => a + b, 0);
    const pageCuts = [0]; let acc = 0;
    for (let k = 0; k < steps.length; k++) { acc += steps[k] / sumSteps * voiceDur; pageCuts.push(acc); }
    pageCuts[pageCuts.length - 1] = dur;
    // sentence cuts, proportional to characters
    const sents = sentences(TEXT); const chars = sents.reduce((a, s) => a + s.length, 0);
    const sentCuts = [0]; acc = 0;
    for (const s of sents) { acc += s.length / chars * voiceDur; sentCuts.push(acc); }
    sentCuts[sentCuts.length - 1] = dur;
    const cuts = [...new Set([...pageCuts, ...sentCuts].map(x => +x.toFixed(3)))].sort((a, b) => a - b);
    const caps = sents.map(captionSvg);
    for (let c = 0; c < cuts.length - 1; c++) {
      const mid = (cuts[c] + cuts[c + 1]) / 2;
      const p = Math.max(0, pageCuts.findIndex((x, k) => mid >= x && mid < pageCuts[k + 1]));
      const s = Math.max(0, sentCuts.findIndex((x, k) => mid >= x && mid < sentCuts[k + 1]));
      const file = path.join(work, `f${n}_${String(c).padStart(3, '0')}.png`);
      await sharp({ create: { width: FW, height: FH, channels: 3, background: '#070d1f' } })
        .composite([{ input: pages[p], top: 0, left: 0 }, { input: caps[s], top: IMG_H, left: 0 }]).png().toFile(file);
      stills.push({ file, start: total + cuts[c], end: total + cuts[c + 1] });
    }
    total += dur;
    process.stdout.write('slide ' + n + ' ' + dur.toFixed(1) + 's, ' + pages.length + ' page(s)\n');
  }
  // 3. frame sequence from cumulative time (no drift)
  const seq = path.join(work, 'seq'); fs.mkdirSync(seq);
  let frame = 0;
  for (const st of stills) {
    const endFrame = Math.round(st.end * FPS);
    for (; frame < endFrame; frame++) fs.symlinkSync(st.file, path.join(seq, 'x' + String(frame).padStart(6, '0') + '.png'));
  }
  // 4. one audio track
  const list = path.join(work, 'alist.txt');
  const padded = [];
  for (const a of audios) {
    const w = a.mp3.replace('.mp3', '.wav');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', a.mp3, '-af', `apad=whole_dur=${a.dur.toFixed(3)}`, '-ar', '24000', '-ac', '1', w]);
    padded.push("file '" + w + "'");
  }
  fs.writeFileSync(list, padded.join('\n'));
  const wav = path.join(work, 'voice.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', wav]);
  // 5. encode by quality; step CRF up only if the file would not fit WhatsApp
  for (;;) {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(seq, 'x%06d.png'), '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', String(CRF), '-pix_fmt', 'yuv420p',
      '-x264-params', 'keyint=600:scenecut=40', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-ar', '24000', '-movflags', '+faststart', '-shortest', OUT]);
    const mb = fs.statSync(OUT).size / 1048576;
    const vdur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT]).toString().trim();
    console.log(`crf ${CRF}: ${mb.toFixed(2)} MB, ${Math.floor(vdur / 60)}:${String(Math.round(vdur % 60)).padStart(2, '0')} (voice ${total.toFixed(1)}s)`);
    if (Math.abs(vdur - total) > 1) throw new Error('video and voice differ by ' + (vdur - total).toFixed(2) + 's');
    if (mb <= MAX_MB) break;
    if (CRF >= 40) throw new Error('cannot fit under ' + MAX_MB + ' MB');
    CRF += 2;
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log('OK ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
