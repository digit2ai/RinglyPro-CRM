/* ============================================================================
   Hispanotec — "El Ecosistema, explicado": un recorrido narrado.

   Dieciséis pasos. Elvira (español) o Ava (inglés) narra cada uno mientras el
   simulador VIVO de /hispanotec/demo/ se coloca exactamente en el estado que
   se está describiendo, de modo que el público ve moverse el software real en
   vez de una sucesión de imágenes.

   La narración se sintetiza en tiempo de ejecución con el TTS sin llave del
   repositorio (/api/tts/edge, cacheado en disco del lado del servidor) y se
   precarga una diapositiva por delante para que la voz nunca se corte a mitad
   de la presentación. No hay archivos de audio en el repositorio.

   Los números se escriben con palabras en el guion hablado: Edge lee "1.042"
   y "9,8 M €" mal, y esto es texto que se le lee en voz alta a un empresario.
   ========================================================================== */
(function () {
  'use strict';

  var VOICE = { es: 'elvira', en: 'ava' };
  var VOICE_NAME = { es: 'Elvira', en: 'Ava' };
  var TTS_URL = '/api/tts/edge';

  // ── el recorrido ───────────────────────────────────────────────────────
  var SLIDES = [
    { kind: 'intro',
      t: { es: 'De la agenda de contactos al negocio cerrado',
           en: 'From a contact list to a closed deal' },
      s: { es: 'El ecosistema digital de Hispanotec sobre CamaraVirtual.',
           en: 'The Hispanotec digital ecosystem, running on CamaraVirtual.' },
      n: { es: 'Bienvenido. En los próximos minutos te guiaré por el ecosistema digital de Hispanotec, pantalla por pantalla. Esto no es una presentación de imágenes: es la app real del miembro, funcionando con datos de muestra. Al final sabrás exactamente qué te da tu membresía, y por qué una cámara digital no es un directorio bonito sino una máquina de generar negocio entre España, América Latina y el mercado hispano de Estados Unidos.',
           en: 'Welcome. Over the next few minutes I will walk you through the Hispanotec digital ecosystem, one screen at a time. This is not a slideshow of pictures. It is the working member app, running on sample data, and by the end you will know exactly what your membership gives you — and why a digital chamber is not a pretty directory but a machine for generating business across Spain, Latin America and the Hispanic United States.' } },

    { kind: 'login',
      t: { es: 'Una cuenta, todos los dispositivos',
           en: 'One account, every device' },
      s: { es: 'El miembro entra desde la página de la cámara. Sin tienda de apps, nada que instalar.',
           en: 'Members sign in from the chamber page. No app store, nothing to install.' },
      n: { es: 'Empieza aquí. Cada miembro inicia sesión desde la página de la cámara, en el móvil o en el ordenador, sin descargar nada. Tu cuenta está siempre activa. Y toda la plataforma habla español e inglés, para que nadie tenga que hacer negocios leyendo en un segundo idioma.',
           en: 'It starts here. Every member signs in from the chamber page, on a phone or a laptop, with nothing to download. Your account is always on. And the whole platform speaks Spanish and English, so nobody has to do business reading in a second language.' } },

    { kind: 'app', st: { screen: 'dashboard' },
      t: { es: 'El panel', en: 'The dashboard' },
      s: { es: 'La salud de toda la red, en tiempo real.',
           en: 'The health of the whole network, in real time.' },
      n: { es: 'Esto es lo primero que ve un miembro. Mil cuarenta y dos miembros activos. Treinta y un proyectos en marcha. Veintidós solicitudes de cotización abiertas. Ciento sesenta y ocho negocios cerrados en los últimos doce meses, por nueve coma ocho millones de euros. Y el índice H C I: la cifra que le dice a la junta si los miembros realmente están comerciando entre sí, no solo cuántos se inscribieron. Abajo, la red repartida por España, México, la región andina, el Cono Sur, el Caribe y el mercado hispano de Estados Unidos.',
           en: 'This is the first thing a member sees. One thousand and forty two active members. Thirty one live projects. Twenty two open requests for quotation. One hundred and sixty eight deals closed in the last twelve months, worth nine point eight million euros. And the H C I score: the one number that tells the board whether members are actually trading with each other, not just how many people signed up. Below it, the network spread across Spain, Mexico, the Andean region, the Southern Cone, the Caribbean and the Hispanic United States.' } },

    { kind: 'app', st: { screen: 'inbox' },
      t: { es: 'Mensajes', en: 'Inbox' },
      s: { es: 'De miembro a miembro, dentro de la cámara.',
           en: 'Member to member, inside the chamber.' },
      n: { es: 'Las conversaciones viven dentro de la cámara, no dispersas en teléfonos personales ni en grupos de mensajería. Mensajes directos, hilos de grupo para un equipo de proyecto y anuncios para toda la cámara. Todos con quienes hablas tienen una identidad verificada, que es justo lo que un mensaje de un desconocido no te da.',
           en: 'Conversations live inside the chamber, not scattered across personal phones and messaging groups. Direct messages, group threads for a project team, and chamber-wide announcements. Everyone you are talking to has a verified identity, which is exactly what a message from a stranger does not give you.' } },

    { kind: 'app', st: { screen: 'profile' },
      t: { es: 'Tu perfil es el motor', en: 'Your profile is the engine' },
      s: { es: 'Sector, subespecialidad y región impulsan cada coincidencia que recibes.',
           en: 'Sector, sub-specialty and region drive every match you receive.' },
      n: { es: 'Todo lo que sigue depende de esta pantalla. Tu sector y tu subespecialidad deciden con quién te empareja la inteligencia artificial. Tu país y tu región habilitan los filtros geográficos, que en una cámara transatlántica no son un detalle. Y fíjate en el índice de confianza: noventa y cuatro sobre cien. Se calcula a partir de tu registro mercantil verificado, los proyectos que has completado y los respaldos de otros miembros. No puedes escribirlo tú mismo.',
           en: 'Everything downstream depends on this screen. Your sector and sub-specialty decide who the AI matches you with. Your country and region enable the geographic filters, which in a transatlantic chamber are not a detail. And notice the trust score: ninety four out of a hundred. It is computed from your verified company registration, the projects you have completed and endorsements from other members. You cannot type it in yourself.' } },

    { kind: 'app', st: { screen: 'directory', dirSector: '', dirQ: '' },
      t: { es: 'El directorio', en: 'The directory' },
      s: { es: 'Mil cuarenta y dos miembros verificados, filtrables por sector y región.',
           en: '1,042 verified members, filterable by sector and region.' },
      n: { es: 'Aquí está toda la membresía. No un listado impreso que queda desactualizado el día que se entrega, sino un directorio vivo que filtras por sector y por región, y donde escribes a cualquiera directamente. Sin presentaciones que gestionar, sin intermediarios. Filtra por comercio exterior y mil nombres se convierten en la lista corta que de verdad te interesa, en un solo clic.',
           en: 'Here is the whole membership. Not a printed roster that is out of date the day it ships — a living directory you filter by sector and region, and message anyone directly. No introductions to arrange, no gatekeeper. Filter to foreign trade and a thousand names become the shortlist you actually care about, in a single click.' } },

    { kind: 'app', match: 0,
      t: { es: 'Matching con IA', en: 'AI Matching' },
      s: { es: 'Describe una necesidad en lenguaje natural. El motor ordena la red.',
           en: 'Describe a need in plain language. The engine ranks the network.' },
      n: { es: 'Este es el corazón del sistema. Describes lo que necesitas como lo dirías en voz alta, y el motor evalúa cada perfil de la red por afinidad, lo pondera por confianza y te entrega una lista corta ordenada en segundos. Pero mira los dos últimos resultados, marcados como cupo de equidad. Una corrección Gini reserva deliberadamente lugares para miembros calificados que han recibido menos presentaciones, para que la oportunidad no se concentre en los mismos nombres bien conectados año tras año. La equidad está escrita en las matemáticas, no prometida en un discurso.',
           en: 'This is the heart of it. You describe what you need the way you would say it out loud, and the engine scores every profile in the network for affinity, weights it by trust, and hands you a ranked shortlist in seconds. But look at the last two results, marked equity slot. A Gini correction deliberately reserves places for qualified members who have had fewer introductions, so opportunity does not pool around the same well-connected names year after year. Fairness is written into the maths, not promised in a speech.' } },

    { kind: 'app', st: { screen: 'searches' },
      t: { es: 'Búsquedas guardadas', en: 'Saved searches' },
      s: { es: 'La red sigue trabajando después de cerrar la pestaña.',
           en: 'The network keeps working after you close the tab.' },
      n: { es: 'Guarda cualquier búsqueda y sigue ejecutándose. A medida que se suman nuevos miembros, aparecen nuevos candidatos para búsquedas que creaste hace semanas. Eso importa, porque el socio que necesitas en marzo puede no haber entrado en la cámara hasta junio.',
           en: 'Save any search and it keeps running. As new members join, new candidates appear against searches you set up weeks ago. That matters, because the partner you need in March may not have joined the chamber until June.' } },

    { kind: 'app', st: { screen: 'projects', projTab: 'all' },
      t: { es: 'Proyectos', en: 'Projects' },
      s: { es: 'Validado antes de financiado: puntaje IRS y viabilidad Monte Carlo.',
           en: 'Validated before funded — IRS score and Monte Carlo viability.' },
      n: { es: 'Aquí una conexión se convierte en un negocio. Un miembro propone un proyecto, la plataforma arma el equipo por roles y, antes de mover un solo euro, ejecuta una simulación Monte Carlo diez mil veces para estimar la viabilidad. Cada proyecto lleva un Puntaje de Preparación para Inversión que combina la integridad del equipo, el realismo del presupuesto y esa viabilidad en una sola cifra. Aquí nada se financia con una promesa y un apretón de manos.',
           en: 'This is where a connection turns into a business. A member proposes a project, the platform assembles a team by role, and before a single euro moves it runs a Monte Carlo simulation ten thousand times to estimate viability. Every project carries an Investment Readiness Score that folds team completeness, budget realism and that viability figure into one number. Nothing here gets funded on a promise and a handshake.' } },

    { kind: 'app', st: { screen: 'invites' },
      t: { es: 'Invitaciones', en: 'Invitations' },
      s: { es: 'Roles definidos, con un puntaje de afinidad.',
           en: 'Named roles, with a match score attached.' },
      n: { es: 'Cuando un proyecto te necesita, la invitación nombra el rol concreto y muestra por qué te eligieron: en este caso, una afinidad del ochenta y dos por ciento. Aceptas o rechazas con un clic. Compáralo con que te añadan a un grupo de mensajería y tengas que adivinar qué se espera de ti.',
           en: 'When a project needs you, the invitation names the actual role and shows why you were picked — an eighty two percent match on this one. You accept or decline in a click. Compare that to being added to a group chat and asked to figure out what you are supposed to do.' } },

    { kind: 'app', st: { screen: 'exchange', xchTab: 'rfqs' },
      t: { es: 'El Intercambio', en: 'The Exchange' },
      s: { es: 'Solicitudes de cotización, solo entre miembros verificados.',
           en: 'Requests for quotation, between verified members only.' },
      n: { es: 'El Intercambio es el mercado interno de la cámara. Publicas una solicitud de cotización y la ve toda la red; o presentas una oferta a la de otro. Cadena de frío para exportar fruta de hueso a Alemania. Integración de un sistema de gestión para cuarenta sucursales en México. Contratos internacionales para entrar en Colombia. Ofertas reales, plazos reales, y del otro lado siempre una empresa cuya identidad ha sido verificada.',
           en: 'The Exchange is the chamber’s internal market. You post a request for quotation and the whole network sees it, or you bid on somebody else’s. Cold chain to export stone fruit to Germany. An ERP integration for forty branches in Mexico. International contracts for entering Colombia. Real bids, real deadlines, and on the other side always a company whose identity has been verified.' } },

    { kind: 'app', st: { screen: 'payments' },
      t: { es: 'Pagos', en: 'Payments' },
      s: { es: 'Cuotas, fideicomiso de proyectos y facturas en un solo lugar.',
           en: 'Dues, project escrow and invoices in one place.' },
      n: { es: 'Las cuotas de membresía, el fideicomiso de los proyectos y las facturas de la cámara viven en un solo lugar, con su historial descargable. Los datos de la tarjeta nunca tocan nuestros servidores: los guarda Stripe. Nosotros conservamos el identificador, la marca y los cuatro últimos dígitos, y nada más.',
           en: 'Membership dues, project escrow and chamber invoices live in one place, with a downloadable history. Card details never touch our servers — Stripe holds them. We keep the identifier, the brand and the last four digits, and nothing else.' } },

    { kind: 'app', st: { screen: 'motor', motorTab: 'dir' },
      t: { es: 'El Motor de Directorio Inteligente', en: 'The Smart Directory Engine' },
      s: { es: 'El módulo propio de Hispanotec. Montado para cv-105 y para nadie más.',
           en: 'Hispanotec’s own module. Mounted for cv-105 and for nobody else.' },
      n: { es: 'Y llegamos a lo que no tiene ninguna otra cámara de la plataforma: el Motor de Directorio Inteligente, la capa que Hispanotec encargó para sí misma. Fíjate primero en la columna de tipología. Fundador, Honorífico, Numerario, Protector, Patrono, Prospecto: es un vocabulario cerrado, no un campo de texto libre. Y quien todavía no es asociado es Prospecto, que nunca figura como socio formal en ningún informe. Toda ficha creada o enriquecida por inteligencia artificial nace pendiente de validación, en amarillo, hasta que una persona la valida. El módulo entero está cerrado a quien no sea administrador, y está cerrado en el servidor, no ocultando el enlace del menú: un enlace escondido es una cortesía, y detrás de esto hay datos personales de terceros.',
           en: 'And now we reach the thing no other chamber on the platform has: the Smart Directory Engine, the layer Hispanotec commissioned for itself. Look first at the typology column. Founding, Honorary, Numerary, Protector, Patron, Prospect — a closed vocabulary, not a free-text field. And anyone who is not yet a member is a Prospect, who never appears as a formal member in any report. Every record created or enriched by artificial intelligence is born pending validation, in amber, until a person validates it. The whole module is closed to anyone who is not an administrator, and it is closed on the server rather than by hiding the menu link: a hidden link is a courtesy, and behind this one there is third-party personal data.' } },

    { kind: 'app', st: { screen: 'motor', motorTab: 'fun' },
      t: { es: 'Fundaciones y mecenazgo', en: 'Foundations and patronage' },
      s: { es: 'Presupuesto verificado y estimación proxy nunca comparten columna.',
           en: 'A verified budget and a proxy estimate never share a column.' },
      n: { es: 'Aquí está la regla más estricta de todo el sistema. Una fundación puede llevar un presupuesto verificado, siempre con su fuente y su ejercicio, o una estimación calculada por un indicador indirecto. Nunca las dos, y jamás ordenadas en la misma columna: ponerlas juntas sugiere que son comparables, y no lo son. Por eso van en grupos separados, con el aviso arriba, y la palabra estimación viaja pegada a la cifra en vez de esconderse en una nota al pie. Mira la Fundación Hispalis: su presupuesto es real, pero el ejercicio es de dos mil veintitrés, así que el sistema lo marca para revisión en lugar de servirlo como si fuera de hoy. Y de la Fundación Cierzo simplemente no consta presupuesto. No consta es una respuesta correcta, y siempre preferible a una cifra inventada que parece razonable y sobrevive a la revisión.',
           en: 'Here is the strictest rule in the whole system. A foundation carries either a verified budget, always with its source and its financial year, or an estimate computed from an indirect indicator. Never both, and never ranked in the same column: putting them together implies they are comparable, and they are not. So they sit in separate groups, with the warning above them, and the word estimate travels stuck to the figure instead of hiding in a footnote. Look at Fundación Hispalis: its budget is real, but the financial year is twenty twenty three, so the system flags it for review rather than serving it as if it were current. And for Fundación Cierzo there is simply no budget on file. Not on file is a correct answer, and always better than an invented figure that looks reasonable and survives review.' } },

    { kind: 'app', st: { screen: 'motor', motorTab: 'mat' },
      t: { es: 'Matching por proyecto', en: 'Matching by project' },
      s: { es: 'Cada candidato viaja con los motivos por los que entró.',
           en: 'Every candidate travels with the reasons it got in.' },
      n: { es: 'Describes el proyecto con sus etiquetas temáticas y el motor propone candidatos. El puntaje es aritmética, no un modelo: temática cuarenta puntos, naturaleza quince, localización quince, tipología quince y capacidad quince. Eso importa porque un coordinador tiene que defender una lista corta delante de la Junta, y un número que cambia entre ejecuciones no se puede defender. Y debajo de cada candidato están los motivos por los que entró, uno a uno, porque para descartar a alguien con criterio hay que ver primero por qué estaba dentro. Fíjate en la etiqueta de nivel de contacto: el Nivel uno, que son las fundaciones, los patronos y los mecenas de alto valor, está excluido por diseño de cualquier envío automatizado. Ese contacto lo inicia siempre una persona, y no hay parámetro ni instrucción que lo habilite. La lista es propositiva: devolver candidatos no contacta a nadie.',
           en: 'You describe the project with its thematic tags and the engine proposes candidates. The score is arithmetic, not a model: theme forty points, nature fifteen, location fifteen, typology fifteen and capacity fifteen. That matters because a coordinator has to defend a shortlist in front of the Board, and a number that changes between runs cannot be defended. And under each candidate are the reasons it got in, one by one, because to rule someone out on the merits you first have to see why they were in. Notice the contact-level tag: Level one — foundations, patrons and major donors — is excluded by design from any automated send. That contact is always opened by a person, and there is no setting or instruction that enables it. The list is a proposal: returning candidates contacts nobody.' } },

    { kind: 'app', st: { screen: 'motor', motorTab: 'imp' },
      t: { es: 'Importar sin romper nada', en: 'Importing without breaking anything' },
      s: { es: 'Se analiza entero antes de escribir una sola fila.',
           en: 'The whole file is analysed before a single row is written.' },
      n: { es: 'Cargar una lista de una jornada o de un registro público es donde un directorio se rompe. Aquí el análisis y la escritura son dos pasos separados a propósito. El fichero se lee entero, se señalan los errores fila a fila —falta el nombre en la catorce, una naturaleza que no está en el vocabulario cerrado en la cuarenta y siete— y no se escribe nada hasta que lo confirmas. Una importación que escribe mientras valida deja el directorio a medias cuando falla la fila trescientos, y a nadie le consta qué pasó. Los duplicados se detectan y se reportan, pero no se fusionan: fusionar dos fichas es decidir que son la misma entidad, y esa decisión es humana. Y elegir fuente pública como origen activa la base legal y la notificación del artículo catorce del reglamento de protección de datos en cada ficha que se cree.',
           en: 'Loading a list from an event or a public register is where a directory breaks. Here, analysis and writing are two separate steps on purpose. The file is read whole, the errors are flagged row by row — a missing name on row fourteen, a nature that is not in the closed vocabulary on row forty seven — and nothing is written until you confirm. An import that writes while it validates leaves the directory half done when row three hundred fails, and nobody has a record of what happened. Duplicates are detected and reported, but never merged: merging two records is deciding they are the same entity, and that decision is human. And choosing public source as the origin activates the legal basis and the article fourteen data-protection notice on every record it creates.' } },

    { kind: 'app', st: { screen: 'motor', motorTab: 'ia' },
      t: { es: 'La IA propone; la persona decide', en: 'The AI proposes; the person decides' },
      s: { es: 'Campo a campo, cada uno con su fuente. Sin fuente, no hay propuesta.',
           en: 'Field by field, each with its source. No source, no proposal.' },
      n: { es: 'Y el asistente. Arriba responde sobre el directorio, y fíjate en cómo contesta: separa lo verificado de lo estimado, dice que de la Fundación Cierzo no le consta el presupuesto en vez de estimarlo, avisa de que las tres son Nivel uno y termina recordando que es una propuesta. Se declara sistema de inteligencia artificial siempre que se le pregunte, y eso no lo puede desactivar ninguna instrucción. Abajo está el enriquecimiento de una ficha. La inteligencia artificial propone campo a campo, cada valor con la fuente de la que sale, y tú aceptas o rechazas uno por uno: no existe el botón de aceptar todo, porque aceptar diez campos de golpe es no revisar ninguno. Mira las dos últimas filas. El tamaño se queda vacío porque no hay fuente, y el presupuesto no lo propone nunca: esa cifra exige fuente y ejercicio y la gobierna otro módulo. Rellenar por verosimilitud es exactamente lo único que este sistema no puede hacer.',
           en: 'And the assistant. At the top it answers questions about the directory — and look at how it answers: it separates the verified from the estimated, it says there is no budget on file for Fundación Cierzo instead of estimating one, it warns that all three are Level one, and it closes by reminding you this is a proposal. It declares itself an artificial-intelligence system whenever asked, and no instruction can switch that off. Below is the enrichment of one record. The AI proposes field by field, each value with the source it came from, and you accept or reject them one at a time: there is no accept-all button, because accepting ten fields at once is reviewing none of them. Look at the last two rows. Size is left empty because there is no source, and the budget is never proposed at all: that figure requires a source and a financial year, and another module governs it. Filling in by plausibility is precisely the one thing this system cannot do.' } },
    { kind: 'app', st: { screen: 'guide', guide: 3 },
      t: { es: 'La guía del miembro', en: 'The member guide' },
      s: { es: 'Cada módulo explicado dentro de la propia app.',
           en: 'Every module explained inside the app itself.' },
      n: { es: 'Nadie debería necesitar una formación para usar su propia cámara. La guía del miembro vive dentro de la app y explica cada módulo: qué hace, por qué existe y cómo sacarle valor desde el primer día. Este capítulo es el del matching: similitud coseno para la afinidad, TrustRank para la fiabilidad y corrección Gini para la equidad. Está escrito para un empresario, no para un ingeniero.',
           en: 'Nobody should need training to use their own chamber. The member guide lives inside the app and explains every module: what it does, why it exists and how to get value from it on day one. This chapter is the matching one: cosine similarity for affinity, TrustRank for reliability, and a Gini correction for equity. It is written for a business owner, not for an engineer.' } },

    { kind: 'app', st: { screen: 'jobup' },
      t: { es: 'Más allá de la cámara', en: 'Beyond the chamber' },
      s: { es: 'El perfil profesional del miembro, conectado con JobUp.',
           en: 'The member’s professional profile, connected to JobUp.' },
      n: { es: 'La cámara no termina en la cámara. El perfil de un miembro se conecta con JobUp, donde su currículum se convierte en un perfil vivo: vacantes reales evaluadas contra lo que de verdad ha hecho, un sitio de currículum público que los reclutadores y sus sistemas de inteligencia artificial pueden leer, y mensajes de contacto redactados para que él los apruebe. Nada se envía sin que una persona lo revise.',
           en: 'The chamber does not end at the chamber. A member’s profile connects to JobUp, where their CV becomes a living profile: real openings scored against what they have actually done, a public CV site recruiters and their AI can read, and outreach drafted for them to approve. Nothing is sent without a person reviewing it.' } },

    { kind: 'app', st: { screen: 'admin', admTab: 'members' },
      t: { es: 'La cámara, gobernada', en: 'The chamber, governed' },
      s: { es: 'Gestión de miembros, junta directiva y delegaciones regionales.',
           en: 'Member management, board and regional delegations.' },
      n: { es: 'Y esto es lo que ve la junta. Gestión de miembros con búsqueda y exportación, los puestos de la junta directiva, las delegaciones regionales y los ajustes de la cámara. Los cambios de gobernanza quedan registrados y son visibles para cada miembro: una cámara que pide confianza a sus socios tiene que ser la primera en ser auditable.',
           en: 'And this is what the board sees. Member management with search and export, the board seats, the regional delegations and the chamber settings. Governance changes are logged and visible to every member: a chamber that asks its members for trust has to be the first thing that is auditable.' } },

    { kind: 'outro',
      t: { es: 'Eso es el ecosistema', en: 'That is the ecosystem' },
      s: { es: 'Catorce módulos, un solo inicio de sesión, dos idiomas.',
           en: 'Fourteen modules, one sign-in, two languages.' },
      n: { es: 'Eso es Hispanotec: catorce módulos, un solo inicio de sesión y dos idiomas. Un directorio vivo, un motor de emparejamiento con equidad incorporada, proyectos validados antes de financiarse, un mercado interno de cotizaciones, el Motor de Directorio Inteligente con sus reglas escritas en el código y no en un prompt, y una junta que puede demostrar lo que hace. Todo lo que has visto está funcionando hoy. Lo único que le falta es tu empresa dentro.',
           en: 'That is Hispanotec: fourteen modules, one sign-in and two languages. A living directory, a matching engine with equity built in, projects validated before they are funded, an internal quotation market, the Smart Directory Engine with its rules written into the code rather than into a prompt, and a board that can show its work. Everything you have seen is running today. The only thing missing from it is your company.' } }
  ];

  // ── i18n del marco del recorrido ───────────────────────────────────────
  var UI = {
    step:   { es: 'Paso {n} de {t}', en: 'Step {n} of {t}' },
    pause:  { es: 'Pausar', en: 'Pause' },
    play:   { es: 'Reproducir', en: 'Play' },
    ready:  { es: 'listo', en: 'ready' },
    load:   { es: 'cargando', en: 'loading' },
    off:    { es: 'solo texto', en: 'text only' },
    done:   { es: 'Recorrido finalizado.', en: 'Walkthrough finished.' }
  };

  var LANGS = ['es', 'en'];
  var lang = 'es';
  var idx = 0, playing = false, muted = false, started = false;
  var audio = new Audio();
  audio.preload = 'auto';
  var cache = {};      // lang|idx -> objectURL
  var token = 0;       // evita que una petición vieja aterrice tras cambiar de paso
  var mutedTimer = null;

  var $ = function (id) { return document.getElementById(id); };
  function t(k, vars) {
    var s = UI[k][lang] || UI[k].es;
    if (vars) Object.keys(vars).forEach(function (v) { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  }
  function txt(o) { return o[lang] || o.es; }

  // ── narración ──────────────────────────────────────────────────────────
  function ttsUrl(i, l) {
    var key = l + '|' + i;
    if (cache[key]) return Promise.resolve(cache[key]);
    return fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: SLIDES[i].n[l] || SLIDES[i].n.es, voice: VOICE[l] })
    }).then(function (r) {
      if (!r.ok) throw new Error('tts ' + r.status);
      return r.blob();
    }).then(function (b) {
      var u = URL.createObjectURL(b);
      cache[key] = u;
      return u;
    });
  }
  function prefetch(i) {
    if (i >= 0 && i < SLIDES.length) ttsUrl(i, lang).catch(function () {});
  }
  function voiceState(s) {
    var el = $('voiceInd');
    el.className = 'voice-ind' + (s === 'load' ? ' buffering' : s === 'off' ? ' off' : '');
    $('voiceTxt').textContent = muted
      ? t('off')
      : VOICE_NAME[lang] + ' · ' + (s === 'load' ? t('load') : t('ready'));
  }

  // ── pintado de la diapositiva ──────────────────────────────────────────
  var LOGO = '/hispatec/logo-hispanotec.svg';
  function panelHTML(kind) {
    if (kind === 'login') {
      return '<div class="panel"><div class="login-card">' +
        '<img src="' + LOGO + '" alt="">' +
        '<h3>Hispanotec</h3>' +
        '<div class="sub">' + ({ es: 'Entra en tu panel de miembro', en: 'Sign in to your member panel' })[lang] + '</div>' +
        '<label>' + ({ es: 'Correo', en: 'Email' })[lang] + '</label><div class="fake-in">tu@correo.com</div>' +
        '<label>' + ({ es: 'Contraseña', en: 'Password' })[lang] + '</label><div class="fake-in">••••••••</div>' +
        '<div class="signin">' + ({ es: 'Entrar', en: 'Sign In' })[lang] + '</div>' +
        '</div></div>';
    }
    var s = SLIDES[idx];
    return '<div class="panel">' +
      '<img class="badge" src="' + LOGO + '" alt="">' +
      '<h2>' + txt(s.t) + '</h2><p>' + txt(s.n) + '</p>' +
      (kind === 'outro'
        ? '<div class="cta">' +
          '<a class="btn-gold" href="https://www.camaravirtual.app/cv-105" target="_blank" rel="noopener">' +
          ({ es: 'Únete a Hispanotec', en: 'Join Hispanotec' })[lang] + '</a>' +
          '<a class="btn-ghost" href="?step=1">' +
          ({ es: 'Ver el recorrido otra vez', en: 'Watch the walkthrough again' })[lang] + '</a></div>'
        : '') +
      '</div>';
  }

  function paintSlide() {
    var s = SLIDES[idx];
    $('stepPill').textContent = t('step', { n: idx + 1, t: SLIDES.length });
    $('slideTitle').textContent = txt(s.t);
    $('slideSub').textContent = txt(s.s);
    $('narr').textContent = txt(s.n);
    $('count').textContent = (idx + 1) + ' / ' + SLIDES.length;
    $('prev').disabled = idx === 0;
    $('next').disabled = idx === SLIDES.length - 1;
    Array.prototype.forEach.call(document.querySelectorAll('#dots button'), function (b, i) {
      b.className = i === idx ? 'on' : '';
    });

    var chrome = $('chrome'), slot = $('panelSlot');
    if (s.kind === 'app') {
      chrome.style.display = '';
      slot.innerHTML = '';
      if (typeof s.match === 'number' && window.HispaDemo) window.HispaDemo.runMatch(s.match);
      else if (window.HispaDemo) window.HispaDemo.set(Object.assign({ clearMatch: true }, s.st || {}));
    } else {
      chrome.style.display = 'none';
      slot.innerHTML = panelHTML(s.kind);
    }
  }

  function speak() {
    clearTimeout(mutedTimer);
    audio.pause();
    $('prog').style.width = '0%';
    if (muted) {
      voiceState('off');
      if (playing) {
        // Sin audio: cada paso dura en proporción a lo que hay que leer.
        var ms = Math.max(6000, txt(SLIDES[idx].n).length * 55);
        var t0 = Date.now();
        (function tick() {
          var p = Math.min(1, (Date.now() - t0) / ms);
          $('prog').style.width = (p * 100) + '%';
          if (p < 1) mutedTimer = setTimeout(tick, 120);
          else advance();
        })();
      }
      return;
    }
    var my = ++token;
    voiceState('load');
    ttsUrl(idx, lang).then(function (u) {
      if (my !== token) return;
      audio.src = u;
      voiceState('ready');
      prefetch(idx + 1);
      if (playing) audio.play().catch(function () { /* reproducción bloqueada; el usuario puede pulsar play */ });
    }).catch(function () {
      if (my !== token) return;
      // El servicio de voz no responde — el recorrido sigue, en silencio.
      muted = true;
      voiceState('off');
      speak();
    });
  }

  function go(i) {
    if (i < 0 || i >= SLIDES.length) return;
    var stage = $('stage');
    stage.classList.add('swapping');
    setTimeout(function () { stage.classList.remove('swapping'); }, 280);
    idx = i;
    paintSlide();
    speak();
  }
  function advance() { if (idx < SLIDES.length - 1) go(idx + 1); else stop(); }
  function stop() {
    playing = false;
    audio.pause();
    clearTimeout(mutedTimer);
    $('play').textContent = t('play');
    $('narr').textContent = txt(SLIDES[idx].n) + '  — ' + t('done');
  }

  // ── idioma ─────────────────────────────────────────────────────────────
  window.setLang = function (l) {
    if (LANGS.indexOf(l) === -1) l = 'es';
    lang = l;
    document.documentElement.lang = l;
    Array.prototype.forEach.call(document.querySelectorAll('.lang-opt'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === l ? 'true' : 'false');
    });
    document.querySelectorAll('[data-es]').forEach(function (el) {
      var v = el.getAttribute('data-' + l) || el.getAttribute('data-es');
      if (v !== null) el.innerHTML = v;
    });
    $('play').textContent = playing ? t('pause') : t('play');
    if (window.HispaDemo) window.HispaDemo.relang();
    try { localStorage.setItem('hispanotec_lang', l); } catch (e) {}
    if (started) { paintSlide(); speak(); }
  };

  // ── arranque ───────────────────────────────────────────────────────────
  function boot() {
    $('dots').innerHTML = SLIDES.map(function (s, i) {
      return '<button type="button" data-i="' + i + '" aria-label="' + (i + 1) + '"></button>';
    }).join('');
    $('dots').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (b) { playing = true; $('play').textContent = t('pause'); go(+b.getAttribute('data-i')); }
    });

    $('prev').addEventListener('click', function () { go(idx - 1); });
    $('next').addEventListener('click', function () { go(idx + 1); });
    $('replay').addEventListener('click', function () { playing = true; $('play').textContent = t('pause'); speak(); if (!muted) audio.play().catch(function () {}); });
    $('play').addEventListener('click', function () {
      playing = !playing;
      $('play').textContent = playing ? t('pause') : t('play');
      if (!playing) { audio.pause(); clearTimeout(mutedTimer); }
      else if (muted) speak();
      else audio.play().catch(function () {});
    });
    audio.addEventListener('ended', function () { if (playing) advance(); });
    audio.addEventListener('timeupdate', function () {
      if (audio.duration) $('prog').style.width = ((audio.currentTime / audio.duration) * 100).toFixed(1) + '%';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === ' ') { e.preventDefault(); $('play').click(); }
    });

    function begin(silent) {
      muted = !!silent;
      started = true;
      playing = true;
      $('cover').classList.add('hide');
      $('play').textContent = t('pause');
      go(idx);
      if (!muted) prefetch(idx + 1);
    }
    $('start').addEventListener('click', function () { begin(false); });
    $('startMuted').addEventListener('click', function () { begin(true); });

    // Idioma inicial: ?lang= > última elección > español. NO se lee el idioma
    // del navegador: Hispanotec está registrada en España con primary_language
    // 'es', y un portátil en inglés que abre el recorrido de la propia cámara
    // debe empezar en español. El selector EN sigue a un clic de distancia.
    var qs = new URLSearchParams(location.search);
    var want = (qs.get('lang') || '').toLowerCase();
    if (LANGS.indexOf(want) === -1) { try { want = localStorage.getItem('hispanotec_lang') || ''; } catch (e) { want = ''; } }
    setLang(LANGS.indexOf(want) === -1 ? 'es' : want);

    // Enlace directo a un paso: /hispanotec/ecosystem/?step=7
    var st = parseInt(qs.get('step'), 10);
    if (st >= 1 && st <= SLIDES.length) idx = st - 1;

    paintSlide();
    voiceState('ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.HispaDeck = { slides: SLIDES.length, go: go, at: function () { return idx; }, table: SLIDES };
})();
