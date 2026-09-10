#!/usr/bin/env node
/**
 * Corte VERTICAL de MaraMed para compartir por WhatsApp.
 * node scripts/render-maramed-vertical-video.js [--mb=10] [--out=...]
 *
 * POR QUÉ ES OTRO VIDEO Y NO UN RECORTE DEL MAZO. El mazo horizontal dura once
 * minutos y está pensado para un proyector: en un teléfono en vertical queda
 * una franja con letra ilegible, y nadie reenvía once minutos. Aquí las
 * pantallas del producto —que ya son verticales— ocupan el alto completo, la
 * letra crece unas dos veces y media, y todo cabe en menos de un minuto.
 *
 * Mismas reglas de tiempo que el mazo largo: la secuencia de fotogramas se arma
 * a mano (round(duración × FPS)) porque el demuxer `concat` deriva su propio
 * reloj, y el bitrate se despeja del techo de tamaño. A cada escena se le añade
 * una cola de silencio: sin ella el corte cae encima de la última sílaba.
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const DECK = path.join(ROOT, 'public', 'maramed-vertical.html');
const AUDIO = path.join(ROOT, 'public', 'maramed-audio-vertical');
const FPS = 25;              // vertical de redes: 25 se ve fluido y sigue siendo barato
const AUDIO_KBPS = 64;
const TAIL = 0.45;           // silencio al final de cada escena

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `=${d}`).split('=').pop();
const CAP_MB = parseFloat(arg('mb', 10));
const OUT = arg('out', path.join(os.homedir(), 'Desktop', 'MaraMed-WhatsApp-vertical.mp4'));

const ff = (b, a) => execFileSync(b, a, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dur = f => parseFloat(ff('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mmv-'));
  const html = fs.readFileSync(DECK, 'utf8');
  const V = JSON.parse(html.match(/var VNARR = (\{[\s\S]*?\n\});/)[1]);

  // --- 1. una imagen por escena, a 1080x1920 --------------------------------
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto('file://' + DECK, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => {
    document.getElementById('vstage').style.transform = 'none';
    document.getElementById('vp').style.placeItems = 'start';
  });
  const keys = await page.evaluate(() => [...document.querySelectorAll('.scene')].map(s => s.getAttribute('data-n')));
  for (let i = 0; i < keys.length; i++) {
    await page.evaluate((j, txt) => {
      const ss = document.querySelectorAll('.scene');
      ss.forEach(s => s.classList.remove('on'));
      ss[j].classList.add('on');
      const c = document.getElementById('vcap');
      c.textContent = txt;
      // sin barra de desplazamiento en video: se achica hasta que la frase entra
      for (let f = 44; f >= 28; f--) { c.style.fontSize = f + 'px'; if (c.scrollHeight <= c.clientHeight) break; }
    }, i, V[keys[i]]);
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(work, `${keys[i]}.png`), clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  }
  await browser.close();

  // --- 2. voz con cola de silencio por escena -------------------------------
  const padded = keys.map(k => {
    const o = path.join(work, `${k}-pad.mp3`);
    ff('ffmpeg', ['-v', 'error', '-y', '-i', path.join(AUDIO, `${k}.mp3`),
                  '-af', `apad=pad_dur=${TAIL}`, '-c:a', 'libmp3lame', '-b:a', '96k', o]);
    return o;
  });
  const alist = path.join(work, 'a.txt');
  fs.writeFileSync(alist, padded.map(f => `file '${f}'`).join('\n') + '\n');
  const voz = path.join(work, 'voz.mp3');
  // re-codificar en vez de copiar: unir MP3 con -c copy deja marcas de tiempo
  // que no avanzan y ffmpeg lo avisa en cada corte
  ff('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', alist,
                '-c:a', 'libmp3lame', '-b:a', '96k', voz]);
  const total = dur(voz);

  // --- 3. secuencia exacta --------------------------------------------------
  const seq = path.join(work, 'seq'); fs.mkdirSync(seq);
  let idx = 0;
  keys.forEach((k, i) => {
    const n = Math.round(dur(padded[i]) * FPS);
    for (let f = 0; f < n; f++) fs.symlinkSync(path.join(work, `${k}.png`), path.join(seq, `${String(++idx).padStart(5, '0')}.png`));
  });

  // --- 4. presupuesto y dos pasadas ----------------------------------------
  const totalKbps = (CAP_MB * 1024 * 1024 * 8) / total / 1000;
  const vKbps = Math.floor((totalKbps - AUDIO_KBPS) * 0.94);
  console.log(`${keys.length} escenas · ${total.toFixed(1)} s · techo ${CAP_MB} MB -> video ${vKbps}k + audio ${AUDIO_KBPS}k`);

  // Con sólo nueve imágenes distintas el control de tasa de x264 tiene muy poco
  // que repartir y se pasó un 24% en la primera prueba. Un techo de tamaño no se
  // pide, se comprueba: se codifica, se mide y se corrige hasta que entra.
  const vin = ['-framerate', String(FPS), '-i', path.join(seq, '%05d.png')];
  const cwd = process.cwd(); process.chdir(work);
  const target = CAP_MB * 1024 * 1024;
  let kb = vKbps, mb = 0;
  for (let intento = 1; intento <= 4; intento++) {
    const venc = ['-c:v', 'libx264', '-preset', 'veryslow', '-b:v', `${kb}k`,
                  '-maxrate', `${Math.round(kb * 1.4)}k`, '-bufsize', `${Math.round(kb * 2)}k`,
                  '-g', '50', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0'];
    ff('ffmpeg', ['-v', 'error', '-y', ...vin, ...venc, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
    ff('ffmpeg', ['-v', 'error', '-y', ...vin, '-i', voz, ...venc, '-pass', '2',
                  '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-ac', '1', '-ar', '44100',
                  '-movflags', '+faststart', OUT]);
    const bytes = fs.statSync(OUT).size;
    mb = bytes / 1024 / 1024;
    console.log(`  intento ${intento}: ${kb}k -> ${mb.toFixed(2)} MB`);
    if (bytes <= target) break;
    kb = Math.floor(kb * (target / bytes) * 0.97);
  }
  process.chdir(cwd);

  const vd = dur(OUT);
  console.log(`${OUT}\n${mb.toFixed(2)} MB · ${vd.toFixed(1)} s · 1080x1920 · ${FPS} fps`);
  fs.rmSync(work, { recursive: true, force: true });
  if (mb > CAP_MB + 0.5) { console.error(`EXCEDE ${CAP_MB} MB.`); process.exit(1); }
  if (Math.abs(vd - total) > 0.5) { console.error(`DESFASE: ${vd.toFixed(2)} vs ${total.toFixed(2)}`); process.exit(1); }
})();
