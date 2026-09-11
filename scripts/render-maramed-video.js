#!/usr/bin/env node
/**
 * Convierte public/maramed-presentacion.html en un MP4 (<10 MB) para enviar.
 *
 * Uso:  node scripts/render-maramed-video.js [--mb=9.5] [--crf=12] [--out=...]
 * ffmpeg/ffprobe son dependencia de construcción, no del servidor.
 *
 * CUATRO DECISIONES QUE NO CONVIENE DESHACER:
 *
 * 1. SE CODIFICA POR CALIDAD (CRF), NO POR BITRATE.  Un mazo son doce imágenes
 *    fijas; entre lámina y lámina el video no cambia y esos cuadros no cuestan
 *    casi nada. Pedir "ciento veinte kilobits por segundo" reparte el
 *    presupuesto por igual a lo largo del tiempo y deja a los doce cuadros que
 *    importan con unas decenas de kilobytes cada uno: texto borroso. Con CRF la
 *    calidad es la constante y el tamaño sale solo — a 1920x1080 y CRF 12 el
 *    video ocupa 3,7 MB, contra los 7 MB que ocupaba el 720p borroso.
 *
 * 2. FOTOGRAMAS CLAVE SÓLO DONDE CAMBIA LA LÁMINA.  Con el `-g` por defecto
 *    había 53 fotogramas clave para 12 imágenes distintas: cuarenta y un
 *    cuadros caros que no aportaban nada y le robaban bits a los otros.
 *
 * 3. NADA DE -maxrate / -bufsize.  Es un techo por cuadro: con bufsize del
 *    doble del bitrate, cada fotograma clave quedaba limitado a ~30 KB, cuando
 *    una lámina llena de texto necesita entre 200 y 400 KB para verse limpia.
 *    Esa fue la causa directa del borrón.
 *
 * 4. 1920x1080, CAPTURADO A 3840x2160.  El mazo se ve en un monitor grande: a
 *    1280x720 el reproductor lo amplía más de dos veces y se ve suave por mucho
 *    bitrate que se le eche. Se captura al doble y se reduce con lanczos, que
 *    es lo que deja limpio el texto pequeño de los teléfonos.
 *
 * El reloj sigue atado a la voz: la secuencia de fotogramas se arma a mano
 * (round(duración × FPS)) porque el demuxer `concat` deriva su propio tiempo.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const DECK = path.join(ROOT, 'public', 'maramed-presentacion.html');
const AUDIO = path.join(ROOT, 'public', 'maramed-audio');
const FPS = 12;                 // el mazo no se mueve: 12 basta y sobra
const AUDIO_KBPS = 64;          // voz holgada; el ahorro del video lo permite
const W = 1920, H = 1080;

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `=${d}`).split('=').pop();
const CAP_MB = parseFloat(arg('mb', 9.5));
let CRF = parseInt(arg('crf', 12), 10);
const OUT = arg('out', path.join(os.homedir(), 'Desktop', 'MaraMed-presentacion-ES.mp4'));

const ff = (b, a) => execFileSync(b, a, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dur = f => parseFloat(ff('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'maramed-'));
  const html = fs.readFileSync(DECK, 'utf8');
  const NARR = JSON.parse(html.match(/var NARR = (\{[\s\S]*?\n  \});/)[1]);

  // --- 1. una imagen por lámina, capturada al doble ---------------------------
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  await page.goto('file://' + DECK, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => {
    document.getElementById('bar').style.display = 'none';     // los controles no van al video
    const st = document.getElementById('stage');
    st.style.transform = 'scale(1.5)';                         // el escenario es 1280x720 fijo
    st.style.transformOrigin = 'top left';
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
      // en video no hay barra de desplazamiento: se achica hasta que la frase entra
      for (let s = 13.5; s >= 9.5; s -= 0.25) { c.style.fontSize = s + 'px'; if (c.scrollHeight <= c.clientHeight) break; }
    }, i, NARR[keys[i]]);
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(work, `f${String(i + 1).padStart(2, '0')}.png`), clip: { x: 0, y: 0, width: W, height: H } });
  }
  await browser.close();

  // --- 2. voz continua --------------------------------------------------------
  const alist = path.join(work, 'a.txt');
  fs.writeFileSync(alist, keys.map((_, i) => `file '${path.join(AUDIO, `s${i + 1}.mp3`)}'`).join('\n') + '\n');
  const voz = path.join(work, 'voz.mp3');
  ff('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', alist, '-c:a', 'libmp3lame', '-b:a', '128k', voz]);
  const total = dur(voz);

  // --- 3. secuencia exacta: cada lámina dura lo que dura su pista --------------
  const seq = path.join(work, 'seq'); fs.mkdirSync(seq);
  let idx = 0;
  keys.forEach((_, i) => {
    const n = Math.round(dur(path.join(AUDIO, `s${i + 1}.mp3`)) * FPS);
    const src = path.join(work, `f${String(i + 1).padStart(2, '0')}.png`);
    for (let f = 0; f < n; f++) fs.symlinkSync(src, path.join(seq, `${String(++idx).padStart(5, '0')}.png`));
  });

  // --- 4. calidad primero; el tamaño se comprueba -----------------------------
  console.log(`${keys.length} láminas · ${total.toFixed(1)} s · ${W}x${H} · objetivo CRF ${CRF}, techo ${CAP_MB} MB`);
  const target = CAP_MB * 1024 * 1024;
  let mb = 0;
  for (let intento = 1; intento <= 6; intento++) {
    ff('ffmpeg', ['-v', 'error', '-y',
      '-framerate', String(FPS), '-i', path.join(seq, '%05d.png'), '-i', voz,
      '-vf', `scale=${W}:${H}:flags=lanczos`,
      '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(CRF), '-pix_fmt', 'yuv420p',
      // fotogramas clave sólo en los cambios de lámina
      '-x264-params', 'keyint=99999:min-keyint=25:scenecut=40',
      '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-ac', '1', '-ar', '44100',
      '-movflags', '+faststart', OUT]);
    mb = fs.statSync(OUT).size / 1024 / 1024;
    console.log(`  CRF ${CRF} -> ${mb.toFixed(2)} MB`);
    if (fs.statSync(OUT).size <= target) break;
    CRF += 2;                     // si no entra, se baja calidad de a poco
  }

  const vd = dur(OUT);
  const kf = ff('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=key_frame', '-of', 'csv=p=0', OUT])
    .split('\n').filter(l => l.trim() === '1').length;
  console.log(`${OUT}\n${mb.toFixed(2)} MB · ${Math.floor(vd / 60)}:${String(Math.round(vd % 60)).padStart(2, '0')} · ${W}x${H} · ${FPS} fps · ${kf} fotogramas clave`);
  fs.rmSync(work, { recursive: true, force: true });

  if (mb > CAP_MB) { console.error(`EXCEDE ${CAP_MB} MB.`); process.exit(1); }
  if (Math.abs(vd - total) > 1) { console.error(`DESFASE: video ${vd.toFixed(2)}s vs voz ${total.toFixed(2)}s.`); process.exit(1); }
})();
