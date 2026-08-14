/* =============================================================
   ONBOARDING IN THE LANGUAGE THE VISITOR CHOSE.

   The landing page is translated by data-i18n keys, because it is authored
   HTML we control line by line. The two onboarding shells are translated a
   different way — by EXACT TEXT MATCH on the rendered text nodes — and the
   difference is deliberate.

   These pages are dense forms whose copy explains a rule ("a résumé naming two
   states is not a preference"), and tagging sixty such strings by hand is how
   one of them silently loses its key on the next edit. Matching the rendered
   text instead means a string that is NOT in the dictionary simply stays in
   English: visible, obviously untranslated, and never blank. A missing key can
   never produce an empty label.

   The language is not chosen here. It comes from the teaser row the visitor
   created on the landing page, so somebody who switched to ES and uploaded a
   résumé is carried through the whole funnel without being asked twice.
   ============================================================= */
(function (w) {
  'use strict';

  var ES = {
    // --- shared chrome
    'Password': 'Contraseña',
    'Confirm password': 'Confirmar contraseña',
    'At least 12 characters.': 'Al menos 12 caracteres.',

    // --- build.html
    'Build my account': 'Crear mi cuenta',
    'Two things: how you sign in, and what your agents should hunt for.':
      'Dos cosas: cómo inicias sesión y qué deben buscar tus agentes.',
    'Step 1 of 2': 'Paso 1 de 2',
    'Step 2 of 2': 'Paso 2 de 2',
    'How you sign in': 'Cómo inicias sesión',
    'Your email is already on file. Choose a password.':
      'Ya tenemos tu correo. Elige una contraseña.',
    'What your agents should look for': 'Qué deben buscar tus agentes',
    'This is what the Hunter searches on and what the Scorer ranks against. You can change all of it later.':
      'Esto es lo que busca el Cazador y con lo que puntúa el Evaluador. Puedes cambiarlo todo más adelante.',
    'Employment type': 'Tipo de contrato',
    'Where you would work': 'Dónde trabajarías',
    'Job titles you want': 'Puestos que te interesan',
    'Filled in from your résumé. Change or add any, separated by commas — or leave it and refine later in your dashboard. Each title becomes its own page carrying that exact phrase, which is what a recruiter’s search matches.':
      'Tomados de tu currículum. Cambia o añade los que quieras, separados por comas, o déjalo así y ajústalo luego en tu panel. Cada puesto se convierte en su propia página con esa frase exacta, que es justo lo que busca un reclutador.',
    'Cities or regions': 'Ciudades o regiones',
    'I would relocate for the right role': 'Me mudaría por el puesto adecuado',
    'Seniority': 'Nivel',
    'No preference': 'Sin preferencia',
    'Intern': 'Practicante',
    'Junior': 'Junior',
    'Mid-level': 'Nivel medio',
    'Senior': 'Senior',
    'Lead': 'Líder de equipo',
    'Principal': 'Principal',
    'Director': 'Director',
    'VP or above': 'VP o superior',
    'Only show me matches above': 'Muéstrame solo coincidencias por encima de',
    'Everything the agents find': 'Todo lo que encuentren los agentes',
    '50 — a loose fit': '50 — encaje amplio',
    '65 — a solid fit': '65 — encaje sólido',
    '80 — a strong fit only': '80 — solo encaje fuerte',
    'Industries': 'Sectores',
    'Employers you would love to work for': 'Empresas donde te encantaría trabajar',
    'Named employers are weighted heavily in ranking.':
      'Las empresas que nombres pesan mucho en la clasificación.',
    'Never show me': 'No me muestres nunca',
    'Any posting containing one of these is dropped before it is ever scored.':
      'Cualquier oferta que contenga una de estas se descarta antes de puntuarla.',
    'That is both required steps': 'Con eso están los dos pasos obligatorios',
    'The card below is optional — you can add it now or from your dashboard later.':
      'La sección de abajo es opcional: puedes completarla ahora o desde tu panel más tarde.',
    'Facts about you': 'Datos sobre ti',
    'Optional. Used word for word in outreach, or left out entirely.':
      'Opcional. Se citan palabra por palabra en los mensajes, o se omiten por completo.',
    'Work authorization': 'Permiso de trabajo',
    'Lowest compensation you would consider': 'Salario mínimo que considerarías',
    'Availability': 'Disponibilidad',
    'Notice period': 'Preaviso',
    'These four are': 'Estos cuatro son',
    'private by default': 'privados por defecto',
    '. Nothing here appears on your public page or in a message unless you switch it on in your dashboard, and JobUp never rewords them — they are quoted exactly as you typed them or omitted.':
      '. Nada de esto aparece en tu página pública ni en un mensaje a menos que lo actives en tu panel, y JobUp nunca los reescribe: se citan exactamente como los escribiste, o se omiten.',
    'Should recruiters be able to find you?': '¿Quieres que los reclutadores puedan encontrarte?',
    'Your site works either way. This decides whether anything links to it.':
      'Tu sitio funciona igual en ambos casos. Esto decide si algo enlaza hacia él.',
    'List me in the public JobUp directory': 'Incluirme en el directorio público de JobUp',
    'Listing you adds your page to the directory and to the sitemap search engines read, which is how a page gets crawled at all. It publishes three things:':
      'Incluirte añade tu página al directorio y al mapa del sitio que leen los buscadores, que es la única forma de que rastreen una página. Publica tres cosas:',
    'your name, the headline you wrote, and the role titles you want':
      'tu nombre, el titular que escribiste y los puestos que te interesan',
    '. Never your email, phone, location, compensation or work authorization — those stay private under the same switches as everything else. You can turn this off at any time in your dashboard.':
      '. Nunca tu correo, teléfono, ubicación, salario ni permiso de trabajo: eso sigue privado con los mismos controles que todo lo demás. Puedes desactivarlo cuando quieras desde tu panel.',
    'You review and submit every application yourself. JobUp never applies on your behalf.':
      'Tú revisas y envías cada postulación. JobUp nunca postula por ti.',
    'Choose a password to finish': 'Elige una contraseña para terminar',
    'Ready to build': 'Listo para crear',
    'Choose a password of at least 12 characters': 'Elige una contraseña de al menos 12 caracteres',
    'Confirm your password to finish': 'Confirma tu contraseña para terminar',
    'Building your account...': 'Creando tu cuenta...',
    'Passwords match.': 'Las contraseñas coinciden.',
    'The two passwords do not match yet.': 'Las contraseñas aún no coinciden.',
    'From your résumé:': 'De tu currículum:',
    // Chip labels, rendered by script AFTER the first pass — refresh() catches
    // them, which is the reason that function exists.
    'Full time': 'Jornada completa',
    'Part time': 'Media jornada',
    'Contract': 'Por contrato',
    'Internship': 'Prácticas',
    'Temporary': 'Temporal',
    'Remote': 'Remoto',
    'Hybrid': 'Híbrido',
    'On site': 'Presencial',

    // --- welcome.html
    'Building your account': 'Creando tu cuenta',
    'One moment.': 'Un momento.',
    'Your web address': 'Tu dirección web',
    'Bookmark this. It is your public profile, and it is how recruiters find you.':
      'Guárdala. Es tu perfil público y es así como te encuentran los reclutadores.',
    'Copy link': 'Copiar enlace',
    'Share': 'Compartir',
    'Open it': 'Abrirla',
    'What we set up': 'Lo que dejamos listo',
    'Your agents start hunting as soon as this finishes.':
      'Tus agentes empiezan a buscar en cuanto esto termine.',
    'building your page': 'construyendo tu página',
    'Starting…': 'Empezando…',
    'Checking your account...': 'Comprobando tu cuenta...',
    'Manage my account': 'Gestionar mi cuenta',
    'Sign in any time to see your matches, opportunities and your whole profile.':
      'Inicia sesión cuando quieras para ver tus coincidencias, oportunidades y tu perfil completo.',
    'Choose a password': 'Elige una contraseña',
    'This account does not have one yet. This is how you sign in.':
      'Esta cuenta aún no tiene una. Así es como inicias sesión.',
    'Save and open my dashboard': 'Guardar y abrir mi panel',

    // --- placeholders
    '@ph:Project Manager, Operations Lead, Business Analyst':
      'Jefe de Proyecto, Responsable de Operaciones, Analista de Negocio',
    '@ph:Tampa, Miami, Remote US': 'Tampa, Miami, remoto en EE. UU.',
    '@ph:Logistics, Healthcare, Fintech': 'Logística, Salud, Fintech',
    '@ph:Publix, Raymond James, Citi': 'Publix, Raymond James, Citi',
    '@ph:commission only, door to door, unpaid': 'solo comisión, puerta a puerta, no remunerado',
    '@ph:US citizen — no sponsorship required':
      'Ciudadano estadounidense — no requiero patrocinio',
    '@ph:$95,000 base': '$95,000 base',
    '@ph:Immediately': 'De inmediato',
    '@ph:Two weeks': 'Dos semanas',
  };

  var applied = false;

  /** Swap one text node if the dictionary has an exact entry for it. */
  function swapText(node, dict) {
    var raw = node.nodeValue;
    var key = raw.replace(/\s+/g, ' ').trim();
    if (!key || !dict[key]) return;
    // Preserve the surrounding whitespace so inline layout does not collapse.
    var lead = (raw.match(/^\s*/) || [''])[0];
    var tail = (raw.match(/\s*$/) || [''])[0];
    node.nodeValue = lead + dict[key] + tail;
  }

  function walk(el, dict) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var c = el.childNodes[i];
      if (c.nodeType === 3) swapText(c, dict);
      else if (c.nodeType === 1 && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE') walk(c, dict);
    }
  }

  /**
   * Translate the page. Safe to call more than once: a string already in
   * Spanish is not a key in the dictionary, so a second pass is a no-op rather
   * than a double translation.
   */
  function apply(lang, root) {
    if (lang !== 'es') return false;
    var dict = ES;
    var el = root || document.body;
    walk(el, dict);
    var ph = el.querySelectorAll('[placeholder]');
    for (var i = 0; i < ph.length; i++) {
      var v = dict['@ph:' + ph[i].getAttribute('placeholder')];
      if (v) ph[i].setAttribute('placeholder', v);
    }
    document.documentElement.setAttribute('lang', 'es');
    applied = true;
    return true;
  }

  /** The language for this page: the URL wins, then what the landing remembered. */
  function detect() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'es' || q === 'en') return q;
    try { return localStorage.getItem('jobup_lang') || 'en'; } catch (e) { return 'en'; }
  }

  w.JobUpI18n = {
    apply: apply,
    detect: detect,
    dict: ES,
    isApplied: function () { return applied; },
    // Re-run over freshly injected markup (chips, error text, progress lines).
    refresh: function (root) { if (applied) apply('es', root); },
  };
}(window));
