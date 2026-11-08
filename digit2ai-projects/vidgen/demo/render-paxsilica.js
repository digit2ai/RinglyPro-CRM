'use strict';
/**
 * Pax Silica — mensaje a la familia. 9:16, español, ~1:48.
 *
 * LA FOTO NO HABLA, Y ESO SE DICE DE FRENTE. Sincronizar los labios de una
 * foto necesita una herramienta de avatar (HeyGen, D-ID) o el modelo act_two
 * de Runway, que exige grabar antes al propio orador interpretando el guion
 * completo — y si ya existe esa grabación, se usa esa. Aquí la foto se mueve
 * con cámara lenta y la voz narra encima. Nunca se presenta como si él
 * estuviera hablando a cámara.
 *
 * EL TEXTO ES SUYO, CASI LITERAL. No se inventa una cifra, una fecha ni un
 * nombre. "aproximadamente cuatro mil hectáreas" conserva el aproximadamente,
 * y el objetivo de convertir la zona en un centro de IA se enuncia como
 * objetivo, no como hecho consumado.
 *
 * Las cifras se escriben en letras para la locución ("doce y trece",
 * "cuatro mil") porque Edge lee mal "12" y "4,000", y esto se escucha.
 *
 * $0 — sin llamadas a ningún modelo. Voz: Edge TTS del repo. Música: el
 * generador determinista propio, en bucle: su progresión dura 30 s y
 * score(110) devuelve 80 s de silencio al final.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');
const { score } = require('./score');

const W = 1080, H = 1920, FPS = 30;
const A = '/tmp/pax';
const WORK = '/tmp/pax/work';
const OUT_DIR = path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');
const BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const REG = '/System/Library/Fonts/Supplemental/Arial.ttf';
const BG = '0x07080e';
const GOLD = '0xd9a441';      // del color de su corbata; la paleta sale de la foto
const DIM = '0x9aa1b4';

const esc = (s) => String(s).replace(/[\\:']/g, (c) => '\\' + c);
const ramp = (at, d = 0.5) => `min(1\\,max(0\\,(t-${at})/${d}))`;
const T = (txt, o) => `drawtext=fontfile=${o.font || BOLD}:text='${esc(txt)}':`
  + `x=${o.x !== undefined ? o.x : '(w-text_w)/2'}:y=${o.y}:fontsize=${o.size}:`
  + `fontcolor=${o.color || 'white'}:expansion=none`
  + (o.enable ? `:enable='${o.enable}'` : '') + (o.alpha ? `:alpha='${o.alpha}'` : '');

/**
 * Subtítulos. Se reparten en trozos de pocas palabras a lo largo del segmento,
 * en proporción a su longitud, porque una frase entera de quince palabras no
 * cabe legible en un teléfono.
 */
function subtitles(text, seconds) {
  // Se parte por ANCHO, no por número de palabras. Siete palabras en español
  // ("Estimada familia. Quería compartir con ustedes una") miden más de 1080px
  // a 44 y se salían por los dos lados. El español es de palabra larga: contar
  // caracteres es lo único que predice si una línea cabe.
  const MAXCH = 30, SIZE = 42;
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= MAXCH) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  // dos líneas por rótulo
  const cues = [];
  for (let i = 0; i < lines.length; i += 2) cues.push(lines.slice(i, i + 2));
  const totalCh = text.length;
  let at = 0.15;
  const out = [];
  cues.forEach((pair) => {
    const share = (pair.join(' ').length / totalCh) * (seconds - 0.3);
    const from = at.toFixed(2), to = (at + share).toFixed(2);
    const win = `between(t,${from},${to})`;
    pair.forEach((ln, k) => out.push(T(ln, { y: 1636 + k * 62, size: SIZE, enable: win })));
    at += share;
  });
  return out.join(',');
}

/** Retrato a sangre con empuje lento de cámara. */
function portrait(seconds, extra) {
  const z = 1.06;
  return {
    inputs: [`${A}/photo.png`],
    graph: [
      `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${seconds}[bg]`,
      // el empuje escala por fotograma; scale sí reevalúa con eval=frame
      `[0:v]scale=w='${W}*(1+${(z - 1).toFixed(3)}*(t/${seconds.toFixed(2)}))':h=-1:eval=frame[ph]`,
      `[bg][ph]overlay=x='(W-w)/2':y='-(h-1500)/2'[a]`,
      // el pie se funde a negro para que el rótulo se apoye en algo sólido
      `[a]drawbox=x=0:y=1420:w=${W}:h=40:color=0x07080e50:t=fill,`
        + `drawbox=x=0:y=1460:w=${W}:h=60:color=0x07080ea0:t=fill,`
        + `drawbox=x=0:y=1520:w=${W}:h=400:color=${BG}:t=fill[b]`,
      `[b]${extra}[v]`,
    ].join(';'),
  };
}

/** Tarjeta de dato, con su retrato en pequeño para que siga siendo él quien cuenta. */
function card(seconds, extra) {
  return {
    inputs: [`${A}/badge.png`],
    graph: [
      `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${seconds}[bg]`,
      `[0:v]format=rgba[bd]`,
      `[bg][bd]overlay=x=76:y=120[a]`,
      `[a]${T('MANUEL STAGG', { x: 356, y: 178, size: 34, color: GOLD })},`
        + `${T('Pax Silica', { x: 356, y: 226, size: 32, color: DIM, font: REG })}[b]`,
      `[b]${extra}[v]`,
    ].join(';'),
  };
}

// texto hablado = texto subtitulado, para que nunca se separen
const SEG = [
  { d: 7.2, vo: 'p1.mp3',
    sub: 'Estimada familia. Quería compartir con ustedes una noticia muy importante.',
    build: (s, sub) => portrait(s, sub) },

  { d: 6.8, vo: 'p2.mp3',
    sub: 'He sido invitado a participar en un summit en Filipinas, los días 12 y 13 de noviembre.',
    build: (s, sub) => card(s,
      `${T('12 — 13', { y: 620, size: 168, color: GOLD, alpha: ramp(0.15) })},`
      + `${T('DE NOVIEMBRE', { y: 820, size: 62, alpha: ramp(0.45) })},`
      + `${T('FILIPINAS', { y: 960, size: 48, color: DIM, font: REG, alpha: ramp(0.8) })},${sub}`) },

  { d: 8.0, vo: 'p3.mp3',
    sub: 'La invitación viene a través de Nina Manjo, quien tiene conexiones de muy alto nivel con el gobierno de Filipinas.',
    build: (s, sub) => portrait(s, sub) },

  { d: 15.8, vo: 'p4.mp3',
    sub: 'A esta reunión vamos a asistir Ting, Tess y yo. La idea es que Nina nos ayude a establecer contacto con altos funcionarios y personas clave del país, para buscar nuestra entrada y participación en el proyecto Pax Silica.',
    build: (s, sub) => card(s,
      `${T('LA DELEGACIÓN', { y: 520, size: 44, color: GOLD, alpha: ramp(0.2) })},`
      + `${T('Ting', { y: 640, size: 84, alpha: ramp(0.6) })},`
      + `${T('Tess', { y: 770, size: 84, alpha: ramp(1.1) })},`
      + `${T('Manuel', { y: 900, size: 84, alpha: ramp(1.6) })},`
      + `${T('PROYECTO PAX SILICA', { y: 1080, size: 46, color: DIM, font: REG, alpha: ramp(2.4) })},${sub}`) },

  { d: 14.2, vo: 'p5.mp3',
    sub: 'Estos dos días pueden ser muy importantes, porque alrededor de esas fechas se estarán llevando a cabo reuniones de alto nivel relacionadas con una iniciativa de inversión tecnológica de enorme magnitud para Filipinas.',
    build: (s, sub) => card(s,
      `${T('REUNIONES DE', { y: 600, size: 76, alpha: ramp(0.2) })},`
      + `${T('ALTO NIVEL', { y: 700, size: 76, color: GOLD, alpha: ramp(0.5) })},`
      + `${T('Iniciativa de inversión tecnológica', { y: 880, size: 44, color: DIM, font: REG, alpha: ramp(1.2) })},`
      + `${T('de enorme magnitud para Filipinas', { y: 940, size: 44, color: DIM, font: REG, alpha: ramp(1.5) })},${sub}`) },

  { d: 16.6, vo: 'p6.mp3',
    sub: 'Estamos hablando del desarrollo de aproximadamente 4.000 hectáreas destinadas a infraestructura tecnológica y de inteligencia artificial, con el objetivo de convertir la zona en uno de los centros de IA y data centers más importantes del mundo.',
    build: (s, sub) => card(s,
      `${T('APROXIMADAMENTE', { y: 480, size: 40, color: DIM, font: REG, alpha: ramp(0.2) })},`
      // el contador necesita expansion=normal; el resto usa none para que un %
      // literal nunca se interprete
      + `drawtext=fontfile=${BOLD}:text='%{eif\\:min(4000\\,floor((t-0.4)*2600))\\:d}':`
      + `x=(w-text_w)/2:y=560:fontsize=180:fontcolor=${GOLD}:enable='gte(t,0.4)',`
      + `${T('HECTÁREAS', { y: 790, size: 66, alpha: ramp(2.2) })},`
      + `${T('Infraestructura tecnológica', { y: 950, size: 44, color: DIM, font: REG, alpha: ramp(3.0) })},`
      + `${T('e inteligencia artificial', { y: 1010, size: 44, color: DIM, font: REG, alpha: ramp(3.3) })},${sub}`) },

  { d: 13.9, vo: 'p7.mp3',
    sub: 'La oportunidad para nosotros es buscar la manera de participar en este ecosistema, ya sea como proveedores, socios tecnológicos o colaboradores en algunas de las diferentes iniciativas que se van a desarrollar.',
    build: (s, sub) => card(s,
      `${T('CÓMO PODEMOS PARTICIPAR', { y: 520, size: 44, color: GOLD, alpha: ramp(0.2) })},`
      + `${T('Proveedores', { y: 660, size: 72, alpha: ramp(0.7) })},`
      + `${T('Socios tecnológicos', { y: 790, size: 72, alpha: ramp(1.4) })},`
      + `${T('Colaboradores', { y: 920, size: 72, alpha: ramp(2.1) })},${sub}`) },

  { d: 12.9, vo: 'p8.mp3',
    sub: 'Por eso me han invitado a viajar a Filipinas: para estar presente, hacer las conexiones correctas, entender dónde podemos aportar valor y, a partir de allí, desarrollar un plan de acción.',
    build: (s, sub) => portrait(s, sub) },

  { d: 12.1, vo: 'p9.mp3',
    sub: 'Es una oportunidad enorme, y quería compartirla con ustedes porque, si logramos abrir esa puerta, puede convertirse en algo verdaderamente importante.',
    build: (s, sub) => portrait(s, sub) },
];

const DUR = SEG.reduce((n, s) => n + s.d, 0);

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const parts = [];
  for (let i = 0; i < SEG.length; i++) {
    const s = SEG[i];
    process.stdout.write(`  segmento ${i + 1}/${SEG.length} (${s.d}s) ... `);
    const def = s.build(s.d, subtitles(s.sub, s.d));
    const out = path.join(WORK, `s${i}.mp4`);
    const args = ['-y', '-v', 'error'];
    for (const p of def.inputs) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.d), '-i', p);
    args.push('-filter_complex', def.graph, '-map', '[v]', '-t', String(s.d), '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out);
    await run(FFMPEG, args, { maxBuffer: 1 << 27 });
    parts.push(out);
    console.log('ok');
  }

  const list = path.join(WORK, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const silent = path.join(WORK, 'silent.mp4');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent],
    { maxBuffer: 1 << 27 });

  // La progresión del generador dura 30 s; se escribe una vez y se repite.
  const music = path.join(WORK, 'score.wav');
  fs.writeFileSync(music, score(30));

  process.stdout.write('  mezclando ... ');
  const ai = [], af = [];
  let at = 0.3;
  SEG.forEach((s, i) => {
    ai.push('-i', path.join(A, s.vo));
    af.push(`[${i + 1}:a]adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)},volume=1.9[q${i}]`);
    at += s.d;
  });
  af.push(`${SEG.map((_, i) => `[q${i}]`).join('')}amix=inputs=${SEG.length}:duration=longest:dropout_transition=0[voz]`);
  af.push(`[${SEG.length + 1}:a]volume=0.13,afade=t=out:st=${(DUR - 2).toFixed(2)}:d=2[cama]`);
  // amix normalize no existe en compilaciones que declaran la misma versión;
  // los niveles se fijan a mano en vez de confiar en él.
  af.push(`[voz][cama]amix=inputs=2:duration=first:dropout_transition=0,`
    + `loudnorm=I=-15:TP=-1.5:LRA=11,atrim=0:${DUR.toFixed(2)},asetpts=N/SR/TB[a]`);

  const out = path.join(OUT_DIR, `pax-silica-familia-${Date.now()}.mp4`);
  await run(FFMPEG, ['-y', '-v', 'error', '-i', silent, ...ai,
    '-stream_loop', '-1', '-i', music,
    '-filter_complex', af.join(';'), '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(DUR.toFixed(2)),
    '-movflags', '+faststart', out], { maxBuffer: 1 << 27 });
  console.log('ok');
  console.log(`\n${out}`);
  const m = Math.floor(DUR / 60), sec = Math.round(DUR % 60);
  console.log(`  ${W}x${H} · ${m}:${String(sec).padStart(2, '0')} · ${FPS}fps · $0 (sin modelos)`);
})().catch((e) => {
  console.error('FALLÓ:', String(e.stderr || e.message).split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 700));
  process.exit(1);
});
