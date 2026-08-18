/* =============================================================
   THE WHOLE PRODUCT IN SPANISH, NOT JUST THE FRONT DOOR.

   The landing page translates itself by data-i18n keys, because it is authored
   HTML we control line by line. Everything BEHIND it — the account form, the
   welcome page and the dashboard — is translated by EXACT MATCH on the rendered
   text, and the difference is deliberate.

   The dashboard builds nearly every string inside JS template concatenation, so
   those strings do not exist until a fetch resolves. There is no element to tag
   at author time. Matching the rendered text instead means:

     * a string NOT in this dictionary stays in English — visible, obviously
       untranslated, and never blank. A missing key cannot produce an empty
       label, which is the failure mode that makes a half-finished translation
       worse than none.
     * re-running after a render is cheap and idempotent: a string already in
       Spanish is not a key here, so a second pass is a no-op rather than a
       double translation.

   WHAT IS NOT TRANSLATED, ON PURPOSE: the subscriber's own data. Job titles,
   employers, résumé bullets, skills and locations are theirs and are shown
   verbatim in both languages — the same rule the tailoring engine follows.
   Only product chrome is in here.
   ============================================================= */
(function (w) {
  'use strict';

  var ES = {
    // ---------- subscription plans (landing pricing) --------------------
    'The growth surface, not a trial': 'La superficie de crecimiento, no una prueba',
    'Public CV site at YourName.jobup.dev': 'Sitio de CV público en TuNombre.jobup.dev',
    'Role pages and Getting-Found SEO': 'Páginas de rol y SEO para ser encontrado',
    '5 job matches a week': '5 coincidencias de empleo por semana',
    'Eva career chat, read-only': 'Eva, chat de carrera, solo lectura',
    'Start free': 'Empieza gratis',
    'For someone actively looking': 'Para quien busca activamente',
    'Everything in Free': 'Todo lo de Free',
    'Unlimited matches': 'Coincidencias ilimitadas',
    '40 scorings a day': '40 evaluaciones al día',
    '10 tailored resumes a month': '10 currículos adaptados al mes',
    'Outreach drafts and pipeline': 'Borradores de contacto y pipeline',
    'Get Search': 'Elegir Search',
    'For senior roles and urgent searches': 'Para roles senior y búsquedas urgentes',
    'Everything in Search': 'Todo lo de Search',
    'Unlimited tailoring': 'Adaptación ilimitada',
    'Priority scoring': 'Evaluación prioritaria',
    'Interview prep per posting': 'Preparación de entrevista por vacante',
    'One human resume review a month': 'Una revisión humana de currículo al mes',
    'Get Landed': 'Elegir Landed',
    '/ month': '/ mes',
    'Free forever. Upgrade, downgrade or pause anytime — your CV site stays live. JobUp never applies on your behalf; you review and submit every application yourself.': 'Gratis para siempre. Mejora, baja o pausa cuando quieras: tu sitio de CV sigue activo. JobUp nunca postula por ti; tú revisas y envías cada postulación.',
    // ---------- shared chrome -------------------------------------------
    'Password': 'Contraseña',
    'Confirm password': 'Confirmar contraseña',
    'At least 12 characters.': 'Al menos 12 caracteres.',
    'Email': 'Correo',
    'Email address': 'Correo electrónico',
    'Phone number': 'Teléfono',
    'Sign in': 'Iniciar sesión',
    'Sign out': 'Cerrar sesión',
    'Forgot your password?': '¿Olvidaste tu contraseña?',
    'Send a reset link': 'Enviar enlace de restablecimiento',
    'Use the email and password you set after activating.':
      'Usa el correo y la contraseña que definiste al activar tu cuenta.',
    'Open': 'Abrir',
    'Add': 'Añadir',
    'Install': 'Instalar',
    'Not now': 'Ahora no',
    'Personalize': 'Personalizar',
    'Archive': 'Archivar',
    'Location': 'Ubicación',
    'State': 'Estado',
    'Skills': 'Aptitudes',
    'Education': 'Formación',
    'Industries': 'Sectores',
    'No preference': 'Sin preferencia',
    'done': 'hecho',
    'deleted': 'eliminado',
    'no photo': 'sin foto',
    'Searching': 'Buscando',
    'United States': 'Estados Unidos',
    'Add JobUp to your home screen': 'Añade JobUp a tu pantalla de inicio',
    'Opens like an app, and keeps you signed in.':
      'Se abre como una aplicación y mantiene tu sesión iniciada.',

    // ---------- build.html (the account form) ---------------------------
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
    'Full time': 'Jornada completa',
    'Part time': 'Media jornada',
    'Contract': 'Por contrato',
    'Internship': 'Prácticas',
    'Temporary': 'Temporal',
    'Remote': 'Remoto',
    'Hybrid': 'Híbrido',
    'On site': 'Presencial',

    // ---------- welcome.html --------------------------------------------
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

    // ---------- dashboard: tabs and chrome ------------------------------
    'Analytics': 'Analítica',
    'Job Matches': 'Ofertas',
    'Matches': 'Ofertas',
    'Opportunities': 'Oportunidades',
    'Pipeline': 'Proceso',
    'Getting job matches': 'Conseguir ofertas',
    'Getting found': 'Que te encuentren',
    'My CV': 'Mi CV',
    'Settings': 'Ajustes',
    'Account': 'Cuenta',
    'View public CV': 'Ver mi CV público',

    // ---------- dashboard: the standing explainer ------------------------
    'What JobUp does, and what it never does':
      'Qué hace JobUp, y qué nunca hace',
    'Your AI career agent (honest by design):': 'Tu agente de carrera con IA (honesto por diseño):',
    'scans real, live openings every day and scores each one against your profile, with the reasoning and the gaps.':
      'revisa vacantes reales cada día y puntúa cada una contra tu perfil, con el razonamiento y lo que te falta.',
    'it finds the work —': 'encuentra el trabajo:',
    'From there you take over:': 'A partir de ahí, tú decides:',
    'you decide what is worth pursuing, you apply, and you track it in':
      'tú eliges qué vale la pena, tú postulas y lo sigues en',
    '. Nothing is ever sent on your behalf. Recruiters — and their AIs — reach you through your public link, and every message lands in':
      '. Nunca se envía nada en tu nombre. Los reclutadores, y sus IA, te encuentran por tu enlace público, y cada mensaje llega a',
    'where you can': 'donde puedes',
    'in one click and send it yourself.': 'en un clic y enviarlo tú mismo.',
    'Draft reply': 'Redactar respuesta',

    // ---------- dashboard: analytics ------------------------------------
    'Your agents': 'Tus agentes',
    'Run them now. They find and check — they never act for you.':
      'Ejecútalos ahora. Buscan y comprueban; nunca actúan por ti.',
    'Search for jobs now': 'Buscar ofertas ahora',
    'Check my presence': 'Revisar mi presencia',
    'Views (all time)': 'Visitas (histórico)',
    'Where visitors come from': 'De dónde vienen las visitas',
    'Most-read pages': 'Páginas más leídas',
    'What AI crawlers read': 'Qué leen los rastreadores de IA',
    'Recruiting tools increasingly read resume.json, llms.txt and your agent card rather than the page.':
      'Las herramientas de reclutamiento leen cada vez más resume.json, llms.txt y tu tarjeta de agente en lugar de la página.',
    'Counts real requests.': 'Cuenta solicitudes reales.',

    // ---------- dashboard: matches --------------------------------------
    'Open posting': 'Ver la oferta',
    'Tailor my resume to this Job Posting': 'Adaptar mi currículum a esta oferta',
    'heuristic score': 'puntuación heurística',
    'Track in pipeline': 'Seguir en el proceso',
    'Email it to me': 'Enviármelo por correo',

    // ---------- dashboard: pipeline -------------------------------------
    'Add a role you are tracking': 'Añadir un puesto que estés siguiendo',
    'For interviews nobody’s agent found.': 'Para entrevistas que ningún agente encontró.',
    '— every move after that is yours.': '— cada movimiento a partir de ahí es tuyo.',
    'new': 'nuevo', 'saved': 'guardado', 'applied': 'postulado',
    'screening': 'preselección', 'interviewing': 'entrevistas',
    'offer': 'oferta', 'closed': 'cerrado',
    'Applied': 'Postulado',

    // ---------- dashboard: getting job matches --------------------------
    'Work through this page and your matches get sharper. Nothing here is a preference we might apply later — every field below is the live record the hunt runs against, so what you change now changes what arrives tomorrow.':
      'Trabaja esta página y tus ofertas mejoran. Nada de esto es una preferencia que quizá apliquemos luego: cada campo de abajo es el registro real con el que se ejecuta la búsqueda, así que lo que cambies ahora cambia lo que llega mañana.',
    'In order below:': 'En orden, más abajo:',
    'which states · the job titles you want · industries · employers to chase · words that must appear · words that rule a posting out · employers to never show you.':
      'qué estados · los puestos que te interesan · sectores · empresas que quieres · palabras que deben aparecer · palabras que descartan una oferta · empresas que no quieres ver nunca.',
    'roles. The companion to this page is': 'Esta página se complementa con',
    '— this one decides which jobs reach you, that one decides whether recruiters reach you.':
      '— esta decide qué ofertas te llegan, esa decide si los reclutadores llegan a ti.',
    'Which state': 'Qué estado',
    'Set from your résumé. Change it if you would work somewhere else, or choose the whole country — which is the right answer for anyone willing to move.':
      'Tomado de tu currículum. Cámbialo si trabajarías en otro sitio, o elige todo el país, que es la respuesta correcta para quien esté dispuesto a mudarse.',
    'Whole country — every state': 'Todo el país — todos los estados',
    'Remote roles are never filtered out by this.':
      'Los puestos remotos nunca se filtran por esto.',
    'A posting that says "Remote — US" can be taken from any state, so it reaches you whatever you pick. A US posting that does not say where is flagged for you to judge, not dropped.':
      'Una oferta que dice “Remote — US” se puede tomar desde cualquier estado, así que te llega elijas lo que elijas. Una oferta de EE. UU. que no dice dónde se marca para que la juzgues tú, no se descarta.',
    'Save state': 'Guardar estado',
    'Roles you are targeting': 'Puestos a los que apuntas',
    'The exact title strings a sourcer searches. A title match counts double in the pre-filter, and each one becomes an indexable page on your site.':
      'Las frases exactas que busca un reclutador. Una coincidencia de puesto cuenta doble en el prefiltro, y cada una se convierte en una página indexable de tu sitio.',
    'Add role': 'Añadir puesto',
    'Add title': 'Añadir puesto',
    'Extra terms your agent counts when ranking. “fintech”, “healthcare”, “logistics” — whatever your world is called.':
      'Términos adicionales que tu agente cuenta al clasificar. “fintech”, “salud”, “logística”: como se llame tu mundo.',
    'Add industry': 'Añadir sector',
    'Companies you want': 'Empresas que quieres',
    'Named employers are weighted heavily — a match at one of these outranks a generic one.':
      'Las empresas que nombres pesan mucho: una coincidencia en una de estas supera a una genérica.',
    'Add company': 'Añadir empresa',
    'Words a job must contain': 'Palabras que la oferta debe contener',
    'A requirement, not a preference — every term must appear or the job is skipped.':
      'Un requisito, no una preferencia: cada término debe aparecer o la oferta se descarta.',
    'Require word': 'Exigir palabra',
    'Words that rule a job out': 'Palabras que descartan una oferta',
    'Checked before anything is scored, so these cost you nothing. “unpaid”, “internship”, “clearance”.':
      'Se comprueban antes de puntuar nada, así que no te cuestan nada. “no remunerado”, “prácticas”, “clearance”.',
    'Exclude word': 'Excluir palabra',
    'Exclude': 'Excluir',
    'Employers to never contact': 'Empresas que nunca hay que contactar',
    'Absolute. Checked at match time, at alert time and at draft time.':
      'Absoluto. Se comprueba al emparejar, al avisar y al redactar.',
    'None excluded.': 'Ninguna excluida.',
    'Seniority nudge': 'Orientación de nivel',
    'Minimum score to file': 'Puntuación mínima para archivar',
    'Jobs scored per day': 'Ofertas puntuadas por día',
    'Seniority is a nudge, not a filter — titles word it too many ways to exclude on. Below the minimum score a job is still scored but not filed, and the run says how many were held back.':
      'El nivel orienta, no filtra: los títulos lo expresan de demasiadas formas como para excluir por ahí. Por debajo de la puntuación mínima la oferta se puntúa igual pero no se archiva, y la ejecución dice cuántas se retuvieron.',
    'Save preferences': 'Guardar preferencias',
    'Remote preference': 'Preferencia de modalidad',
    'Where you want to work': 'Dónde quieres trabajar',
    'Remote only — hide everything else': 'Solo remoto: ocultar todo lo demás',
    'Prefer hybrid or remote': 'Preferir híbrido o remoto',
    'Prefer on-site': 'Preferir presencial',
    'Only "Remote only" hides jobs. The others rank your preference higher and still show the rest.': 'Solo "Solo remoto" oculta ofertas. Las demás opciones priorizan tu preferencia y aun así muestran el resto.',
    'How you want to work': 'Cómo quieres trabajar',
    'Remote only': 'Solo remoto',
    'Hybrid or remote': 'Híbrido o remoto',
    'On-site': 'Presencial',

    // ---------- dashboard: getting found --------------------------------
    'Signing up gave you a working, discoverable profile. This page is where you make it better. Every field below is the real one, not a copy of it — change something here and your site changes.':
      'Al registrarte obtuviste un perfil funcional y localizable. Esta página es donde lo mejoras. Cada campo de abajo es el real, no una copia: cambia algo aquí y cambia tu sitio.',
    'Already done for you:': 'Ya hecho por ti:',
    'your job titles were read off your résumé and each one has its own page; jobup.dev is verified with Google and its sitemap — which lists your site — has been submitted. Search engines can reach you. The four steps below are what make them, and the recruiters using them, actually find you.':
      'tus puestos se leyeron de tu currículum y cada uno tiene su propia página; jobup.dev está verificado con Google y su mapa del sitio, que incluye tu página, ya fue enviado. Los buscadores pueden llegar a ti. Los cuatro pasos de abajo son los que hacen que ellos, y los reclutadores que los usan, realmente te encuentren.',
    '1. Check the job titles you are targeting': '1. Revisa los puestos a los que apuntas',
    'These were taken from your résumé word for word, and each one already has its own page on your site carrying that exact phrase — which is what a search matches against.':
      'Se tomaron de tu currículum palabra por palabra, y cada uno ya tiene su propia página en tu sitio con esa frase exacta, que es contra lo que compara una búsqueda.',
    'Taken verbatim means some are worth removing.':
      'Tomados literalmente significa que algunos conviene borrarlos.',
    'A title only earns its page if a recruiter would type it:':
      'Un puesto solo merece su página si un reclutador lo escribiría:',
    'would,': 'sí,',
    'would not. Delete the ones nobody searches for and add the ones you actually want next — three to six is the sweet spot, and this remains the single biggest thing you can do.':
      'no. Borra los que nadie busca y añade los que de verdad quieres a continuación: entre tres y seis es lo ideal, y sigue siendo lo más importante que puedes hacer.',
    'These are the same targets on': 'Son los mismos objetivos de',
    '. Adding one here adds it there.': '. Si añades uno aquí, se añade allí.',
    'Your pages:': 'Tus páginas:',
    '2. Put your address in these five places': '2. Pon tu dirección en estos cinco sitios',
    'Every one is somewhere a recruiter already looks, and every one is a link — which is what gives a search engine a reason to visit the pages you just made. Copy it once, then tick each place as you go.':
      'Cada uno es un sitio donde los reclutadores ya miran, y cada uno es un enlace, que es lo que le da a un buscador una razón para visitar las páginas que acabas de crear. Copia la dirección una vez y ve marcando cada sitio.',
    'Copy my address': 'Copiar mi dirección',
    'These are prerequisites, not guarantees.': 'Son requisitos previos, no garantías.',
    'LinkedIn profile': 'Perfil de LinkedIn',
    'Paste it into the Website field on your profile. — The spine every sourcing tool merges against. Recruiters start here, and so do the aggregators that go beyond it.':
      'Pégala en el campo Sitio web de tu perfil. — La columna vertebral con la que se cruza toda herramienta de búsqueda. Los reclutadores empiezan aquí, y los agregadores también.',
    'Indeed, Dice or your job board': 'Indeed, Dice u otro portal de empleo',
    'Put it in the personal website field of your profile. — This one counts twice: recruiters pay to search these resume databases directly, AND the AI sourcing tools pull from them.':
      'Ponla en el campo de sitio web personal de tu perfil. — Este cuenta doble: los reclutadores pagan por buscar en estas bases de hojas de vida, y además las herramientas de búsqueda con IA se nutren de ellas.',
    'GitHub or portfolio bio': 'Bio de GitHub o portafolio',
    'Add it to your bio or README. — SeekOut and hireEZ crawl GitHub explicitly, so a link here is a direct route into the tools enterprise recruiters use when LinkedIn is not enough.':
      'Añádela a tu bio o README. — SeekOut y hireEZ rastrean GitHub de forma explícita, así que un enlace aquí es una vía directa a las herramientas que usan los reclutadores cuando LinkedIn no basta.',
    'Email signature': 'Firma de correo',
    'Add it under your name, on every message you send. — Every email becomes an invitation to look you up properly.':
      'Añádela bajo tu nombre, en cada mensaje que envíes. — Cada correo se convierte en una invitación a conocerte mejor.',
    'Your QR code, printed': 'Tu código QR, impreso',
    'On a card, a CV footer, or a conference badge. — The only one that works on paper, where a URL cannot be clicked.':
      'En una tarjeta, el pie de tu CV o una credencial. — El único que funciona en papel, donde una URL no se puede pulsar.',
    '3. List yourself in the JobUp directory': '3. Aparece en el directorio de JobUp',
    'One switch. It publishes your name, your headline and the titles from step one to':
      'Un solo interruptor. Publica tu nombre, tu titular y los puestos del paso uno en',
    '— never your email, phone or location. It is also the only thing that puts your address in the sitemap search engines read, so while it is off there is no route to your site from anywhere on jobup.dev. A link from your own LinkedIn still counts for more, because it is independent of us — but this one costs a single click.':
      '— nunca tu correo, teléfono ni ubicación. Además es lo único que pone tu dirección en el mapa del sitio que leen los buscadores, así que mientras esté desactivado no hay ninguna ruta hacia tu sitio desde jobup.dev. Un enlace desde tu propio LinkedIn sigue valiendo más, porque es independiente de nosotros, pero este cuesta un solo clic.',
    'List me in the public directory': 'Incluirme en el directorio público',
    'Off unless you turn it on. Reversible at any time.':
      'Desactivado salvo que lo actives. Reversible en cualquier momento.',
    '4. Say where else you already exist': '4. Di en qué otros sitios ya existes',
    'Paste the addresses of your other public profiles — LinkedIn, GitHub, Google Scholar, ORCID, a personal site, a company team page. Anything public that is you.':
      'Pega las direcciones de tus otros perfiles públicos: LinkedIn, GitHub, Google Scholar, ORCID, un sitio personal, la página de equipo de una empresa. Cualquier cosa pública que seas tú.',
    'This is the one thing on your page that the AI sourcing tools can actually use.':
      'Esto es lo único de tu página que las herramientas de búsqueda con IA pueden usar de verdad.',
    'SeekOut, hireEZ and Pin take no submissions and have no way to be pushed to':
      'SeekOut, hireEZ y Pin no aceptan envíos y no hay forma de mandarles nada',
    '— they crawl sources they already trust and then merge what they find into one record per person. Without a stated link, your page is a stranger they cannot attach to anyone, so it enriches nothing. With one, it becomes another page about somebody they already have.':
      '— rastrean fuentes en las que ya confían y luego fusionan lo que encuentran en un único registro por persona. Sin un enlace declarado, tu página es una desconocida que no pueden asociar a nadie, así que no enriquece nada. Con uno, se convierte en otra página sobre alguien que ya tienen.',
    'Published as': 'Se publica como',
    'in your page\'s structured data and in your résumé feed. Only addresses you paste here — nothing is looked up or guessed on your behalf.':
      'en los datos estructurados de tu página y en tu feed de currículum. Solo las direcciones que pegues aquí: no se busca ni se adivina nada por ti.',
    'How recruiters actually search': 'Cómo buscan realmente los reclutadores',
    'Worth knowing, because it is why the five places are ordered the way they are. Enterprise recruiters do not rely on one tool.':
      'Vale la pena saberlo, porque explica el orden de los cinco sitios. Los reclutadores de empresa no dependen de una sola herramienta.',
    'Their own database first': 'Primero su propia base de datos',
    '— everyone who has already applied to them.': '— todos los que ya les han postulado.',
    'LinkedIn Recruiter': 'LinkedIn Recruiter',
    '— still the main one, which is why it is step one.':
      '— sigue siendo la principal, y por eso es el paso uno.',
    'Paid resume databases': 'Bases de hojas de vida de pago',
    '— Indeed, Dice, Monster. They buy search access, so a profile there is searchable whether or not anyone finds your site.':
      '— Indeed, Dice, Monster. Compran acceso de búsqueda, así que un perfil ahí es localizable encuentre alguien tu sitio o no.',
    'AI sourcing tools': 'Herramientas de búsqueda con IA',
    '— SeekOut, hireEZ, Pin. These exist because LinkedIn alone stopped winning competitive searches. They crawl the open web and merge what they find: hireEZ pulls from more than forty sources, SeekOut from hundreds of millions of public profiles including GitHub and published work.':
      '— SeekOut, hireEZ, Pin. Existen porque LinkedIn por sí solo dejó de ganar las búsquedas competitivas. Rastrean la web abierta y fusionan lo que encuentran: hireEZ se nutre de más de cuarenta fuentes, SeekOut de cientos de millones de perfiles públicos, incluidos GitHub y publicaciones.',
    'This is the category your page can enter.': 'Esta es la categoría en la que puede entrar tu página.',
    'Plain Google searches': 'Búsquedas normales en Google',
    '— sourcers still run these by hand every day.':
      '— los reclutadores siguen haciéndolas a mano todos los días.',
    'The catch is simple: those tools cannot merge a page they have never crawled. They reach you through the links above, not by finding your address on their own.':
      'El truco es simple: esas herramientas no pueden fusionar una página que nunca han rastreado. Llegan a ti por los enlaces de arriba, no encontrando tu dirección por su cuenta.',
    'The two routes that work today': 'Las dos vías que funcionan hoy',
    'Of everything above, exactly two can bring a recruiter to you right now. Both are already built; both are waiting on you.':
      'De todo lo anterior, exactamente dos pueden traerte un reclutador ahora mismo. Las dos ya están construidas; las dos te están esperando a ti.',
    '1. Through a profile you already have.': '1. A través de un perfil que ya tienes.',
    'A sourcing tool that already holds your GitHub or LinkedIn follows the address you put there, reads your page, and the':
      'Una herramienta que ya tiene tu GitHub o tu LinkedIn sigue la dirección que pusiste ahí, lee tu página, y el',
    'from step 4 tells it this is the same person — so your titles, skills and availability get merged into the record recruiters search. You never appear as a JobUp entry; you appear as yourself, better described.':
      'del paso 4 le dice que eres la misma persona, así que tus puestos, aptitudes y disponibilidad se fusionan en el registro que consultan los reclutadores. Nunca apareces como una entrada de JobUp: apareces como tú, mejor descrito.',
    'Needs steps 2 and 4.': 'Requiere los pasos 2 y 4.',
    '2. Through a plain search.': '2. A través de una búsqueda normal.',
    'Your role pages carry the exact phrases a sourcer types. jobup.dev is verified and its sitemap submitted, so this route is open — but only for titles you actually target.':
      'Tus páginas de puesto llevan las frases exactas que escribe un reclutador. jobup.dev está verificado y su mapa del sitio enviado, así que esta vía está abierta, pero solo para los puestos a los que realmente apuntas.',
    'Needs step 1.': 'Requiere el paso 1.',
    'There is deliberately no third route where we submit you somewhere. SeekOut, hireEZ and Pin take no submissions and publish no API to push to — recruiters pay them precisely because their index holds people who never signed up. Anyone claiming to list you inside them is selling something that does not exist.':
      'Deliberadamente no hay una tercera vía en la que te inscribamos en algún sitio. SeekOut, hireEZ y Pin no aceptan envíos ni publican una API a la que mandar nada: los reclutadores les pagan precisamente porque su índice contiene a gente que nunca se registró. Quien diga que puede incluirte ahí está vendiendo algo que no existe.',
    'What this does not do': 'Lo que esto no hace',
    'JobUp does not post your profile to LinkedIn, Indeed or any job board — those are closed platforms and only you can create a profile there, which is exactly why step two matters. None of this guarantees a recruiter will search for you; it makes being found possible. A new address with few links typically takes two to eight weeks to appear in search results at all.':
      'JobUp no publica tu perfil en LinkedIn, Indeed ni en ningún portal de empleo: son plataformas cerradas y solo tú puedes crear un perfil ahí, que es exactamente por lo que importa el paso dos. Nada de esto garantiza que un reclutador te busque; hace posible que te encuentren. Una dirección nueva con pocos enlaces suele tardar entre dos y ocho semanas en aparecer siquiera en los resultados.',
    'The reliable path is still you using the link — in applications, in messages, in your signature. Search and AI discovery are the upside on top of that, not a replacement for it.':
      'La vía fiable sigue siendo que tú uses el enlace: en postulaciones, en mensajes, en tu firma. La búsqueda y el descubrimiento por IA son el extra encima de eso, no un sustituto.',

    'You have used today’s manual search.': 'Ya usaste la búsqueda manual de hoy.',
    'It resets at — and your agent still runs on its own every morning.':
      'Se reinicia a las — y tu agente sigue ejecutándose solo cada mañana.',
    'When a recruiter — or their AI — contacts you through your public link or agent endpoint, it lands here. You draft a reply in one click and send it yourself.':
      'Cuando un reclutador, o su IA, te contacta por tu enlace público o tu punto de agente, llega aquí. Redactas la respuesta en un clic y la envías tú.',
    'None set — nothing is required.': 'Ninguna definida: no se exige nada.',
    'not assigned yet': 'aún sin asignar',
    'None yet. Your page currently claims no connection to any profile a sourcing tool already holds.':
      'Ninguno todavía. Tu página no declara ninguna conexión con un perfil que una herramienta de búsqueda ya tenga.',

    // ---------- dashboard: my CV ----------------------------------------
    'Everything on this page is your data, not code.':
      'Todo en esta página son tus datos, no código.',
    'It is what your public page, your resume.json and your agent card show, and what your agent scores jobs against. Nothing here is generated — if you leave a field empty it stays empty.':
      'Es lo que muestran tu página pública, tu resume.json y tu tarjeta de agente, y con lo que tu agente puntúa las ofertas. Aquí no se genera nada: si dejas un campo vacío, se queda vacío.',
    'Email and phone are': 'El correo y el teléfono son',
    '— they are stored here but only published if you switch them on under What is public, below.':
      '— se guardan aquí pero solo se publican si los activas en Qué es público, más abajo.',
    'The introduction at the top of your page.': 'La introducción al principio de tu página.',
    'One per line. These are what the matcher scores against.':
      'Una por línea. Es contra esto que puntúa el comparador.',
    'Remove this role': 'Quitar este puesto',
    'On my public CV': 'En mi CV público',
    'Show this role': 'Mostrar este puesto',
    'Hide this role': 'Ocultar este puesto',
    'Hidden roles come off your public page, your resume.json, your JSON-LD, your agent card and any résumé PDF you send. They are still counted when your agent scores jobs — that is private, and dropping them there would quietly make your matches worse.':
      'Los puestos ocultos desaparecen de tu página pública, tu resume.json, tu JSON-LD, tu tarjeta de agente y de cualquier PDF de currículum que envíes. Siguen contando cuando tu agente puntúa ofertas: eso es privado, y quitarlos ahí empeoraría tus coincidencias sin que te enteres.',

    'Your resume': 'Tu currículum',
    'Everything on your page and every job score is read from this. Upload a new one whenever your career moves — PDF, DOCX, TXT, MD or RTF.':
      'Todo lo que hay en tu página y cada puntuación de oferta se lee de aquí. Sube uno nuevo cuando tu carrera avance: PDF, DOCX, TXT, MD o RTF.',
    'Upload a new resume': 'Subir un currículum nuevo',
    'Re-read the one on file': 'Volver a leer el que está guardado',
    'This looks thin. If your resume has more in it than the numbers above, re-read it — the text is already on file.':
      'Esto parece escaso. Si tu currículum tiene más de lo que indican los números de arriba, vuelve a leerlo: el texto ya está guardado.',
    'Professional summary': 'Resumen profesional',
    'Employment history': 'Experiencia laboral',
    'What is public on your site': 'Qué es público en tu sitio',
    'from your page, your resume.json, your agent card and your llms.txt — not hidden.':
      'de tu página, tu resume.json, tu tarjeta de agente y tu llms.txt: no solo ocultos.',
    'Anything off here is': 'Lo que esté desactivado aquí se',
    'Compensation expectations': 'Expectativas salariales',
    'Quoted exactly as you wrote it, or omitted.': 'Se cita exactamente como lo escribiste, o se omite.',

    // ---------- dashboard: settings / account ---------------------------
    'Approval': 'Aprobación',
    'Review every message before it sends': 'Revisar cada mensaje antes de enviarlo',
    'Always on. This cannot be turned off.': 'Siempre activo. No se puede desactivar.',
    'Quotas': 'Cupos',
    'Save settings': 'Guardar ajustes',
    'Your profile photo': 'Tu foto de perfil',
    'Shown on your public page. Without one we use your initials.':
      'Se muestra en tu página pública. Sin ella usamos tus iniciales.',
    'Add a photo': 'Añadir una foto',
    'This is what recruiters type and what AI agents fetch.':
      'Esto es lo que escriben los reclutadores y lo que consultan los agentes de IA.',
    'Your data': 'Tus datos',
    'Everything JobUp holds about you, in one file. Yours, any time, including after you cancel.':
      'Todo lo que JobUp guarda sobre ti, en un solo archivo. Tuyo, cuando quieras, incluso después de cancelar.',
    'Download my data': 'Descargar mis datos',
    'Subscription': 'Suscripción',
    'Status:': 'Estado:',
    'If you do not renew, your site goes down and your address is released. Your export stays available.':
      'Si no renuevas, tu sitio deja de estar en línea y se libera tu dirección. Tu exportación sigue disponible.',
    'Delete my account': 'Eliminar mi cuenta',
    'Removes everything, including the resume text we extracted. This cannot be undone.':
      'Elimina todo, incluido el texto del currículum que extrajimos. Esto no se puede deshacer.',
    'Delete permanently': 'Eliminar definitivamente',
    'JobUp never applies on your behalf. You review and submit every application yourself.':
      'JobUp nunca postula por ti. Tú revisas y envías cada postulación.',
    'Off by default.': 'Desactivado por defecto.',
    'Strong (80+)': 'Fuerte (80+)',

    // ---------- the help agent -------------------------------------------
    'Chat with Eva': 'Habla con Eva',
    'Eva reads your account, so the answer is about you.':
      'Eva lee tu cuenta, así que la respuesta es sobre ti.',
    'Eva explains and points you at the right screen. She never changes a setting and never sends anything.':
      'Eva explica y te lleva a la pantalla correcta. Nunca cambia un ajuste ni envía nada.',
    'Send': 'Enviar',

    // ---------- placeholders --------------------------------------------
    '@ph:How can I increase my visibility?': '¿Cómo aumento mi visibilidad?',
    '@ph:Project Manager, Operations Lead, Business Analyst':
      'Jefe de Proyecto, Responsable de Operaciones, Analista de Negocio',
    '@ph:Tampa, Miami, Remote US': 'Tampa, Miami, remoto en EE. UU.',
    '@ph:Logistics, Healthcare, Fintech': 'Logística, Salud, Fintech',
    '@ph:Publix, Raymond James, Citi': 'Publix, Raymond James, Citi',
    '@ph:commission only, door to door, unpaid': 'solo comisión, puerta a puerta, no remunerado',
    '@ph:US citizen — no sponsorship required': 'Ciudadano estadounidense — no requiero patrocinio',
    '@ph:$95,000 base': '$95,000 base',
    '@ph:Immediately': 'De inmediato',
    '@ph:Two weeks': 'Dos semanas',
    '@ph:Role title': 'Puesto',
    '@ph:Company': 'Empresa',
    '@ph:Company name': 'Nombre de la empresa',
    '@ph:e.g. Sales Executive': 'p. ej. Ejecutivo de Ventas',
    '@ph:e.g. Financial Analyst': 'p. ej. Analista Financiero',
    '@ph:e.g. SQL': 'p. ej. SQL',
    '@ph:e.g. Stripe': 'p. ej. Stripe',
    '@ph:e.g. fintech': 'p. ej. fintech',
    '@ph:e.g. unpaid': 'p. ej. no remunerado',
    '@ph:senior, lead, director': 'senior, líder, director',
    '@ph:https://www.linkedin.com/in/yourname': 'https://www.linkedin.com/in/tunombre',

    // ---------- US states that differ in Spanish -------------------------
    'New York': 'Nueva York',
    'New Mexico': 'Nuevo México',
    'New Hampshire': 'Nuevo Hampshire',
    'New Jersey': 'Nueva Jersey',
    'North Carolina': 'Carolina del Norte',
    'South Carolina': 'Carolina del Sur',
    'North Dakota': 'Dakota del Norte',
    'South Dakota': 'Dakota del Sur',
    'West Virginia': 'Virginia Occidental',
    'District of Columbia': 'Distrito de Columbia',
    'Pennsylvania': 'Pensilvania',
    'Hawaii': 'Hawái',
    'Louisiana': 'Luisiana',
  };

  /**
   * Strings that carry a VALUE cannot be exact-matched, because the value
   * changes. These rewrite the chrome around it and leave the number alone.
   * Applied only after an exact lookup misses.
   */
  var RULES = [
    [/^(\d+) roles? tracked\. Your agent only ever adds to$/,
      function (m) { return m[1] + ' puesto' + (m[1] === '1' ? '' : 's') + ' en seguimiento. Tu agente solo añade a'; }],
    [/^Profile views \((\d+)d\)$/, function (m) { return 'Visitas al perfil (' + m[1] + ' d)'; }],
    [/^Unique visitors \((\d+)d\)$/, function (m) { return 'Visitantes únicos (' + m[1] + ' d)'; }],
    [/^AI agent reads \((\d+)d\)$/, function (m) { return 'Lecturas de agentes IA (' + m[1] + ' d)'; }],
    [/^Views per day \((\d+)d\)$/, function (m) { return 'Visitas por día (' + m[1] + ' d)'; }],
    [/^Step (\d+) of (\d+) complete/, function (m) { return 'Paso ' + m[1] + ' de ' + m[2] + ' completado'; }],
    [/^(\d+) of (\d+)$/, function (m) { return m[1] + ' de ' + m[2]; }],
    [/^· (\d+)% keywords$/, function (m) { return '· ' + m[1] + '% de palabras clave'; }],
    [/^Compensation as stated by the posting: (.+)$/,
      function (m) { return 'Salario según indica la oferta: ' + m[1]; }],
    [/^missing: (.+)$/, function (m) { return 'falta: ' + m[1]; }],
    [/^Resume tailoring: (\d+) per month · Jobs scored: (\d+) per day$/,
      function (m) { return 'Adaptaciones de currículum: ' + m[1] + ' al mes · Ofertas puntuadas: ' + m[2] + ' al día'; }],
    [/^On file: (.+?) · (\d+) roles · (\d+) skills · (\d+) education$/,
      function (m) { return 'Guardado: ' + m[1] + ' · ' + m[2] + ' puestos · ' + m[3] + ' aptitudes · ' + m[4] + ' formación'; }],
    [/^JPEG, PNG or WebP, up to (\d+) MB\. A square photo looks best\.$/,
      function (m) { return 'JPEG, PNG o WebP, hasta ' + m[1] + ' MB. Una foto cuadrada queda mejor.'; }],
    [/^Your manual search is available today \((.+?)\)\. It has its own allowance — the daily run never uses it up\.$/,
      function (m) { return 'Tu búsqueda manual está disponible hoy (' + m[1] + '). Tiene su propio cupo: la ejecución diaria nunca lo consume.'; }],
    [/^Your manual search is not available until tomorrow\.?$/,
      function () { return 'Tu búsqueda manual no está disponible hasta mañana.'; }],
    // Pipeline column headings: "new (12)".
    [/^(new|saved|applied|screening|interviewing|offer|closed) \((\d+)\)$/, function (m) {
      var S = { new: 'nuevo', saved: 'guardado', applied: 'postulado', screening: 'preselección',
                interviewing: 'entrevistas', offer: 'oferta', closed: 'cerrado' };
      return S[m[1]] + ' (' + m[2] + ')';
    }],
  ];

  var applied = false;

  function translate(key) {
    if (ES[key] !== undefined) return ES[key];
    for (var i = 0; i < RULES.length; i++) {
      var m = key.match(RULES[i][0]);
      if (m) return RULES[i][1](m);
    }
    return null;
  }

  function swapText(node) {
    var raw = node.nodeValue;
    var key = raw.replace(/\s+/g, ' ').trim();
    if (!key) return;
    var v = translate(key);
    if (v === null) return;
    // Keep the surrounding whitespace so inline layout does not collapse.
    node.nodeValue = (raw.match(/^\s*/) || [''])[0] + v + (raw.match(/\s*$/) || [''])[0];
  }

  function walk(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var c = el.childNodes[i];
      if (c.nodeType === 3) swapText(c);
      else if (c.nodeType === 1 && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE') walk(c);
    }
  }

  function apply(lang, root) {
    if (lang !== 'es') return false;
    var el = root || document.body;
    walk(el);
    var ph = el.querySelectorAll ? el.querySelectorAll('[placeholder]') : [];
    for (var i = 0; i < ph.length; i++) {
      var v = translate('@ph:' + ph[i].getAttribute('placeholder'));
      if (v !== null) ph[i].setAttribute('placeholder', v);
    }
    document.documentElement.setAttribute('lang', 'es');
    applied = true;
    return true;
  }

  /** The URL wins, then what the landing page (or the dashboard) remembered. */
  function detect() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'es' || q === 'en') return q;
    try { return localStorage.getItem('jobup_lang') || 'en'; } catch (e) { return 'en'; }
  }

  function remember(l) { try { localStorage.setItem('jobup_lang', l === 'es' ? 'es' : 'en'); } catch (e) {} }

  w.JobUpI18n = {
    apply: apply,
    detect: detect,
    remember: remember,
    translate: translate,
    dict: ES,
    rules: RULES,
    isApplied: function () { return applied; },
    /** Re-run over freshly rendered markup. Idempotent by construction. */
    refresh: function (root) { if (applied) apply('es', root); },
  };
}(window));
