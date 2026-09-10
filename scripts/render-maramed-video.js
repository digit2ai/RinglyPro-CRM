#!/usr/bin/env node
/**
 * Convierte public/maramed-presentacion.html en un MP4 para WhatsApp (<12 MB).
 *
 * Uso:  node scripts/render-maramed-video.js [--mb=11.5] [--out=/ruta/MaraMed.mp4]
 * Requiere ffmpeg/ffprobe en el PATH (build-time; no es dependencia del servidor).
 *
 * TRES DECISIONES QUE NO SON OBVIAS Y QUE NO CONVIENE DESHACER:
 *
 * 1. LA SECUENCIA DE FOTOGRAMAS SE CONSTRUYE A MANO, NO CON EL DEMUXER `concat`.
 *    Con `concat` + directivas `duration`, ffmpeg deriva su propio reloj: el
 *    video salía 717 s contra 676 s de voz, de modo que cada lámina se iba
 *    separando de lo que Dalia estaba diciendo. Aquí cada lámina ocupa
 *    round(duración_mp3 * FPS) fotogramas exactos y el desfase total queda en
 *    decenas de milisegundos.
 *
 * 2. EL BITRATE SE CALCULA DEL TECHO, NO SE ELIGE.  El límite de WhatsApp es de
 *    tamaño, no de calidad: se reparte el presupuesto entre audio y video y se
 *    codifica en dos pasadas para acertarle. Subir la resolución con el mismo
 *    presupuesto empeora la imagen — a 92 kbps, 720p se ve mejor que 1440p.
 *
 * 3. EL SUBTÍTULO SE ACHICA HASTA QUE ENTRA.  En video no hay barra de
 *    desplazamiento: un subtítulo cortado pierde la última frase sin avisar, y
 *    mucha gente ve WhatsApp en silencio. Se prueba de 13,5 px hacia abajo.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const DECK = path.join(ROOT, 'public', 'maramed-presentacion.html');
const AUDIO = path.join(ROOT, 'public', 'maramed-audio');
const FPS = 12;
const AUDIO_KBPS = 40;

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `=${d}`).split('=').pop();
const CAP_MB = parseFloat(arg('mb', 11.5));
const OUT = arg('out', path.join(os.homedir(), 'Desktop', 'MaraMed-presentacion-ES.mp4'));

const ff = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dur = f => parseFloat(ff('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'maramed-'));
  const html = fs.readFileSync(DECK, 'utf8');
  const NARR = JSON.parse(html.match(/var NARR = (\{[\s\S]*?\n  \});/)[1]);

  // --- 1. una imagen por lámina, a 2x para que sobreviva la recompresión ------
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.goto('file://' + DECK, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => {
    document.getElementById('bar').style.display = 'none';       // los controles no van al video
    document.getElementById('stage').style.transform = 'none';
    document.getElementById('viewport').style.placeItems = 'start';
    const c = document.getElementById('cap');
    c.style.bottom = '14px'; c.style.height = '132px'; c.style.lineHeight = '1.45'; c.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  });
  const keys = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(s => s.getAttribute('data-n')));
  for (let i = 0; i < keys.length; i++) {
    await page.evaluate((j, txt) => {
      const ss = document.querySelectorAll('.slide');
      ss.forEach(s => s.classList.remove('on'));
      void ss[j].offsetWidth;
      ss[j].classList.add('on');
      const c = document.getElementById('cap');
      c.textContent = txt;
      for (let s = 13.5; s >= 9.5; s -= 0.25) { c.style.fontSize = s + 'px'; if (c.scrollHeight <= c.clientHeight) break; }
    }, i, NARR[keys[i]]);
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(work, `f${String(i + 1).padStart(2, '0')}.png`), clip: { x: 0, y: 0, width: 1280, height: 720 } });
  }
  await browser.close();

  // --- 2. voz continua ------------------------------------------------------
  const alist = path.join(work, 'alist.txt');
  fs.writeFileSync(alist, keys.map((_, i) => `file '${path.join(AUDIO, `s${i + 1}.mp3`)}'`).join('\n') + '\n');
  const voz = path.join(work, 'voz.mp3');
  ff('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', alist, '-c', 'copy', voz]);
  const total = dur(voz);

  // --- 3. secuencia exacta: cada lámina dura lo que dura su pista ------------
  const seq = path.join(work, 'seq');
  fs.mkdirSync(seq);
  let idx = 0;
  keys.forEach((_, i) => {
    const frames = Math.round(dur(path.join(AUDIO, `s${i + 1}.mp3`)) * FPS);
    const src = path.join(work, `f${String(i + 1).padStart(2, '0')}.png`);
    for (let k = 0; k < frames; k++) fs.symlinkSync(src, path.join(seq, `${String(++idx).padStart(5, '0')}.png`));
  });

  // --- 4. presupuesto de bits, luego dos pasadas -----------------------------
  const totalKbps = (CAP_MB * 1024 * 1024 * 8) / total / 1000;
  const videoKbps = Math.floor((totalKbps - AUDIO_KBPS) * 0.94);   // margen para el contenedor
  console.log(`${keys.length} láminas · ${total.toFixed(1)} s · techo ${CAP_MB} MB -> video ${videoKbps}k + audio ${AUDIO_KBPS}k`);

  // Un techo de tamaño no se pide, se comprueba: con pocas imágenes distintas el
  // control de tasa de x264 tiene muy poco que repartir y se pasa. Se codifica,
  // se mide y se corrige hasta que entra.
  const vin = ['-framerate', String(FPS), '-i', path.join(seq, '%05d.png'), '-vf', 'scale=1280:720:flags=lanczos'];
  const cwd = process.cwd();
  process.chdir(work);   // los ficheros de estadísticas de las dos pasadas caen aquí
  const target = CAP_MB * 1024 * 1024;
  let kb = videoKbps, mb = 0;
  for (let intento = 1; intento <= 4; intento++) {
    const venc = ['-c:v', 'libx264', '-preset', 'veryslow', '-b:v', `${kb}k`,
                  '-maxrate', `${Math.round(kb * 1.4)}k`, '-bufsize', `${Math.round(kb * 2)}k`,
                  '-g', '120', '-pix_fmt', 'yuv420p'];
    ff('ffmpeg', ['-v', 'error', '-y', ...vin, ...venc, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
    ff('ffmpeg', ['-v', 'error', '-y', ...vin.slice(0, 4), '-i', voz, ...vin.slice(4), ...venc, '-pass', '2',
                  '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-ac', '1', '-ar', '32000', '-movflags', '+faststart', OUT]);
    const bytes = fs.statSync(OUT).size;
    mb = bytes / 1024 / 1024;
    console.log(`  intento ${intento}: ${kb}k -> ${mb.toFixed(2)} MB`);
    // Quedarse muy por debajo del techo es calidad regalada, y la calidad es lo
    // que sobrevive a la recompresión de WhatsApp: se apunta a la banda alta.
    if (bytes <= target && bytes >= target * 0.88) break;
    const next = Math.floor(kb * (target * 0.95 / bytes));
    if (next === kb) break;
    kb = next;
  }
  process.chdir(cwd);

  const vd = dur(OUT);
  console.log(`${OUT}\n${mb.toFixed(2)} MB · ${Math.floor(vd / 60)}:${String(Math.round(vd % 60)).padStart(2, '0')} · 1280x720 · ${FPS} fps`);
  fs.rmSync(work, { recursive: true, force: true });

  // Un archivo por encima del techo no sirve de nada: es mejor fallar aquí.
  if (mb > CAP_MB + 0.5) { console.error(`EXCEDE el techo de ${CAP_MB} MB.`); process.exit(1); }
  if (Math.abs(vd - total) > 1) { console.error(`DESFASE: video ${vd.toFixed(2)}s vs voz ${total.toFixed(2)}s.`); process.exit(1); }
})();
