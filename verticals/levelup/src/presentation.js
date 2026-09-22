'use strict';

/**
 * The narrated walkthrough's slides are BUILT FROM `public/deck.html`, the same
 * partial the landing page shows. One source for every screen mock-up: a deck
 * that quietly disagrees with the product it is selling is worse than no deck,
 * and a second copy of ten screens would drift the first time one changes.
 *
 * What lives HERE is only what the page cannot hold: the narration Andrea
 * reads, in English and Spanish, one line per slide.
 *
 * NOTHING IS INVENTED IN THE NARRATION. Every figure on a mock-up is sample
 * data and the slide says so; no view count, revenue or result is claimed.
 */

const fs = require('fs');
const path = require('path');

// Narration per dashboard screen, in the order deck.html lists them.
const SCREEN_NARRATION = [
  { en: 'This is the dashboard. It counts what is really in your account: posts, what is waiting for your approval, and what is queued for editing. The sample screen shows a few numbers. Where a figure needs a platform connection, like views, it says Not connected, because we never show a number we cannot measure.',
    es: 'Este es el panel. Cuenta lo que de verdad hay en tu cuenta: publicaciones, lo que espera tu aprobación y lo que está en cola de edición. La pantalla de ejemplo muestra algunos números. Donde una cifra necesita conexión con una red, como las vistas, dice No conectado, porque nunca mostramos un número que no podemos medir.' },
  { en: 'The content calendar is where your month lives. Each post carries its pillar, its purpose, the format, the effort and what you need in order to film it. Put it on a day, and it appears in Today when that day arrives.',
    es: 'El calendario es donde vive tu mes. Cada publicación lleva su pilar, su propósito, el formato, el esfuerzo y lo que necesitas para grabarla. Ponla en un día y aparecerá en Hoy cuando llegue.' },
  { en: 'The pipeline shows where every video is: planned, filmed, in editing, or ready to post. One look and nothing gets forgotten halfway.',
    es: 'El flujo muestra dónde está cada video: planeado, grabado, en edición o listo para publicar. De una mirada, nada se queda a medias.' },
  { en: 'The creative strategist asks you seven questions in your own words, and gives you back a niche, three to five content pillars, your offer and a realistic plan. Change an answer and it rebuilds, so it is your strategy, not a template.',
    es: 'La estratega creativa te hace siete preguntas con tus propias palabras y te devuelve un nicho, de tres a cinco pilares, tu oferta y un plan realista. Cambias una respuesta y se rehace, así que es tu estrategia y no una plantilla.' },
  { en: 'Ideas and scripts give you a full script: the hook, your story, the proof, the objection and the call to action. If you paste a video that worked, only its structure is reused, never its words. And any number you did not give is flagged for you to confirm before you film.',
    es: 'Ideas y guiones te dan un guion completo: el gancho, tu historia, la prueba, la objeción y el llamado a la acción. Si pegas un video que funcionó, solo se reutiliza su estructura, nunca sus palabras. Y cualquier número que tú no diste queda marcado para que lo confirmes antes de grabar.' },
  { en: 'Editing is where your week comes back. You send the footage, and nine rules run on every video: start on the hook, keep the best take, take the fillers out, never cut a word in half. Add your own rules any time. If the same problem happens three times, LevelUp offers to turn it into a rule, so you correct it once instead of on every video.',
    es: 'La edición es donde recuperas tu semana. Mandas el material y nueve reglas corren en cada video: empezar en el gancho, dejar la mejor toma, quitar las muletillas y nunca cortar una palabra por la mitad. Agrega tus propias reglas cuando quieras. Si el mismo problema pasa tres veces, LevelUp te propone convertirlo en regla, para corregirlo una vez y no en cada video.' },
  { en: 'The business assistant reads a brand email you paste. It flags the warning signs, works out which of your accounts the offer is for, takes the price from your own rate card, and drafts the reply. You approve it, you send it from your own email, and then you mark it sent. LevelUp never sends mail for you.',
    es: 'La asistente de negocios lee el correo de marca que pegas. Marca las señales de alerta, deduce para cuál de tus cuentas es la oferta, toma el precio de tu propia tabla de tarifas y redacta la respuesta. Tú la apruebas, la envías desde tu correo y luego la marcas como enviada. LevelUp nunca envía correos por ti.' },
  { en: 'Top Picks turns the products you actually use into a clean page for your link in bio, and counts the clicks on each one. Orders and earnings appear only when an affiliate program is connected.',
    es: 'Top Picks convierte los productos que de verdad usas en una página limpia para tu enlace en la biografía y cuenta los clics de cada uno. Los pedidos y las ganancias aparecen solo cuando se conecta un programa de afiliados.' },
  { en: 'This is the part that makes the team yours. You teach it: a rule like never use the word hack, or a document like your brand story. You choose whether the whole team learns it or just one agent, and you can test the same question with and without your training, side by side. This is context the agents read, not model retraining, and nothing you write is ever deleted.',
    es: 'Esta es la parte que hace tuyo al equipo. Tú le enseñas: una regla, como nunca uses la palabra truco, o un documento, como la historia de tu marca. Eliges si lo aprende todo el equipo o un solo agente, y puedes probar la misma pregunta con y sin tu entrenamiento, lado a lado. Esto es contexto que los agentes leen, no reentrenamiento del modelo, y nada de lo que escribes se borra.' },
  { en: 'And if you would rather not look for a button, just write to Andrea. Tell her to add three ideas about budgeting and schedule the first for Friday, and she does it and reports back. Ask her to approve a brand reply, and she hands you a button instead, because approving, sending and publishing are always your own tap.',
    es: 'Y si prefieres no buscar un botón, escríbele a Andrea. Dile que agregue tres ideas sobre presupuesto y programe la primera para el viernes, y lo hace y te reporta. Pídele que apruebe una respuesta a una marca y te entrega un botón, porque aprobar, enviar y publicar siempre los haces tú.' }
];

const esc = (s) => String(s).replace(/"/g, '&quot;');

/** Take exactly one <div> element, tags balanced — a regex cannot see nesting. */
function balanced(html, start) {
  if (start < 0) return '';
  const re = /<\/?div\b/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div' ? -1 : 1;
    if (depth === 0) return html.slice(start, html.indexOf('>', m.index) + 1);
  }
  return html.slice(start);
}

/** Pull the ten screen mock-ups out of deck.html, in order. */
function screens() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'deck.html'), 'utf8');
  const out = [];
  const re = /<div class="step">\s*<div class="step-txt">\s*<h3 data-en="([^"]*)" data-es="([^"]*)">[^<]*<\/h3>\s*<p class="tiny" data-en="([^"]*)" data-es="([^"]*)">/g;
  let m;
  const starts = [];
  while ((m = re.exec(html))) starts.push({ i: m.index, en: m[1], es: m[2], tinyEn: m[3], tinyEs: m[4] });
  starts.forEach((s, k) => {
    const chunk = html.slice(s.i, k + 1 < starts.length ? starts[k + 1].i : html.length);
    out.push({ title_en: s.en, title_es: s.es, tiny_en: s.tinyEn, tiny_es: s.tinyEs, scr: balanced(chunk, chunk.indexOf('<div class="scr">')) });
  });
  return out;
}

/** The slide markup for the ten dashboard screens, narration attached. */
function screenSlides() {
  return screens().map((s, i) => {
    const n = SCREEN_NARRATION[i] || { en: s.tiny_en, es: s.tiny_es };
    return `<section class="slide screen" data-n="${esc(n.en)}" data-n-es="${esc(n.es)}">
  <p class="eyebrow"><span data-en="The dashboard" data-es="El panel">The dashboard</span> · ${i + 1} / ${SCREEN_NARRATION.length}</p>
  <h2 data-en="${esc(s.title_en)}" data-es="${esc(s.title_es)}">${s.title_en}</h2>
  <p class="lede" data-en="${esc(s.tiny_en)}" data-es="${esc(s.tiny_es)}">${s.tiny_en}</p>
  <div class="shot">${s.scr}</div>
  <p class="sample" data-en="Sample data, so you can see the shape of the screen." data-es="Datos de ejemplo, para que veas la forma de la pantalla.">Sample data, so you can see the shape of the screen.</p>
</section>`;
  }).join('\n');
}

module.exports = { screenSlides, screens, SCREEN_NARRATION };
