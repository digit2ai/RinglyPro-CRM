/* ============================================================================
   PACC-CFL — "The Ecosystem, Explained": a narrated walkthrough.

   Sixteen steps. Ava (English), Paloma (Spanish) or Blessica (Tagalog) narrates
   each one while the LIVE simulator from /pacccfl/demo/ is driven into the exact
   state being described — so the audience watches the real software move rather
   than a slideshow of pictures.

   Narration is synthesized at runtime by the repo's zero-key Edge TTS
   (/api/tts/edge, disk-cached server side), prefetched a slide ahead so the
   voice never stalls mid-presentation. No audio files live in the repo.
   ========================================================================== */
(function () {
  'use strict';

  var VOICE = { en: 'ava', es: 'es-US-PalomaNeural', tl: 'fil-PH-BlessicaNeural' };
  var VOICE_NAME = { en: 'Ava', es: 'Paloma', tl: 'Blessica' };
  var TTS_URL = '/api/tts/edge';

  // ── the walkthrough ────────────────────────────────────────────────────
  var SLIDES = [
    { kind: 'intro',
      t: { en: 'Business, not just networking',
           es: 'Negocios, no solo networking',
           tl: 'Negosyo, hindi lang networking' },
      s: { en: 'The digital ecosystem of the Philippine American Chamber of Commerce of Central Florida.',
           es: 'El ecosistema digital de la Cámara de Comercio Filipino Americana de la Florida Central.',
           tl: 'Ang digital na ekosistema ng Philippine American Chamber of Commerce of Central Florida.' },
      n: { en: 'Welcome. Over the next few minutes I will walk you through the PACC-CFL digital ecosystem, one screen at a time. This is not a slideshow of pictures. It is the working member app, running on sample data, and by the end you will know exactly what your membership gives you.',
           es: 'Bienvenido. En los próximos minutos te guiaré por el ecosistema digital de PACC-CFL, pantalla por pantalla. Esto no es una presentación de imágenes: es la app real del miembro, funcionando con datos de muestra. Al final sabrás exactamente qué te da tu membresía.',
           tl: 'Maligayang pagdating. Sa susunod na ilang minuto, gagabayan kita sa digital na ekosistema ng PACC-CFL, isang screen sa bawat pagkakataon. Hindi ito slideshow ng mga larawan. Ito ang gumaganang app ng miyembro na tumatakbo sa sample na datos, at sa huli ay malalaman mo kung ano ang ibinibigay ng iyong membership.' } },

    { kind: 'login',
      t: { en: 'One account, every device',
           es: 'Una cuenta, todos los dispositivos',
           tl: 'Isang account, lahat ng device' },
      s: { en: 'Members sign in from the chamber landing page. No app store, nothing to install.',
           es: 'Los miembros inician sesión desde la página de la cámara. Sin tienda de apps, nada que instalar.',
           tl: 'Nag-sign in ang mga miyembro mula sa landing page ng kamara. Walang app store, walang i-install.' },
      n: { en: 'It starts here. Every member signs in from the chamber page, on a phone or a laptop, with nothing to download. Your account is always on. And the whole platform speaks English, Spanish and Tagalog, so nobody in this community is reading a second language to do business.',
           es: 'Comienza aquí. Cada miembro inicia sesión desde la página de la cámara, en el teléfono o en la computadora, sin descargar nada. Tu cuenta siempre está activa. Y toda la plataforma habla inglés, español y tagalo, para que nadie en esta comunidad tenga que leer en un segundo idioma para hacer negocios.',
           tl: 'Dito ito nagsisimula. Nag-sign in ang bawat miyembro mula sa pahina ng kamara, sa telepono o laptop, na walang kailangang i-download. Palaging bukas ang iyong account. At nagsasalita ang buong plataporma ng Ingles, Espanyol at Tagalog, kaya walang sinuman sa komunidad na ito ang kailangang magbasa sa pangalawang wika para makipagnegosyo.' } },

    { kind: 'app', st: { screen: 'dashboard' },
      t: { en: 'The dashboard', es: 'El panel de control', tl: 'Ang dashboard' },
      s: { en: 'The health of the whole network, in real time.',
           es: 'La salud de toda la red, en tiempo real.',
           tl: 'Ang kalusugan ng buong network, sa real time.' },
      n: { en: 'This is the first thing a member sees. One thousand two hundred forty seven active members. Thirty eight live projects. Twenty six open requests for quotation. Two hundred fourteen deals closed in the last twelve months, worth twelve point four million dollars. And the H C I score: the one number that tells the board whether members are actually trading with each other, not just how many people signed up.',
           es: 'Esto es lo primero que ve un miembro. Mil doscientos cuarenta y siete miembros activos. Treinta y ocho proyectos en marcha. Veintiséis solicitudes de cotización abiertas. Doscientos catorce negocios cerrados en los últimos doce meses, por doce coma cuatro millones de dólares. Y el índice H C I: la cifra que le dice a la junta si los miembros realmente están comerciando entre sí, no solo cuántos se inscribieron.',
           tl: 'Ito ang unang nakikita ng isang miyembro. Isang libo dalawang daan apatnapu’t pitong aktibong miyembro. Tatlumpu’t walong proyektong buhay. Dalawampu’t anim na bukas na request for quotation. Dalawang daan labing-apat na saradong deal sa nakaraang labindalawang buwan, na nagkakahalaga ng labindalawang punto apat na milyong dolyar. At ang H C I score: ang numerong nagsasabi sa lupon kung talagang nagkakalakalan ang mga miyembro, hindi lang kung ilan ang sumali.' } },

    { kind: 'app', st: { screen: 'inbox' },
      t: { en: 'Inbox', es: 'Mensajes', tl: 'Inbox' },
      s: { en: 'Member to member, inside the chamber.',
           es: 'De miembro a miembro, dentro de la cámara.',
           tl: 'Miyembro sa miyembro, sa loob ng kamara.' },
      n: { en: 'Conversations live inside the chamber, not scattered across personal phones. Direct messages, group threads for a project team, and chamber-wide announcements. Everyone you are talking to has a verified identity, which is exactly what a text message from a stranger does not give you.',
           es: 'Las conversaciones viven dentro de la cámara, no dispersas en teléfonos personales. Mensajes directos, hilos grupales para un equipo de proyecto y anuncios para toda la cámara. Todos con quienes hablas tienen identidad verificada, que es justo lo que un mensaje de un desconocido no te da.',
           tl: 'Nasa loob ng kamara ang mga usapan, hindi nakakalat sa personal na telepono. Direktang mensahe, group thread para sa koponan ng proyekto, at anunsiyo para sa buong kamara. Beripikado ang pagkakakilanlan ng bawat kausap mo, na siyang hindi ibinibigay ng mensahe mula sa isang estranghero.' } },

    { kind: 'app', st: { screen: 'profile' },
      t: { en: 'Your profile is the engine',
           es: 'Tu perfil es el motor',
           tl: 'Ang profile mo ang makina' },
      s: { en: 'Sector, sub-specialty and region drive every match you receive.',
           es: 'Sector, subespecialidad y región impulsan cada coincidencia que recibes.',
           tl: 'Ang sektor, sub-espesyalidad at rehiyon ang nagtutulak ng bawat tugmang natatanggap mo.' },
      n: { en: 'Everything downstream depends on this screen. Your sector and sub-specialty decide who the AI matches you with. Your region enables the geographic filters. And notice the trust score: ninety four out of a hundred. That is computed from your verified registration, the projects you have completed and endorsements from other members. You cannot type it in yourself.',
           es: 'Todo lo que sigue depende de esta pantalla. Tu sector y subespecialidad deciden con quién te empareja la inteligencia artificial. Tu región habilita los filtros geográficos. Y fíjate en el índice de confianza: noventa y cuatro sobre cien. Se calcula a partir de tu registro verificado, los proyectos que has completado y los respaldos de otros miembros. No puedes escribirlo tú mismo.',
           tl: 'Lahat ng susunod ay nakasalalay sa screen na ito. Ang sektor at sub-espesyalidad mo ang nagpapasya kung sino ang itutugma sa iyo ng artificial intelligence. Ang rehiyon mo ang nagbubukas ng heograpikong filter. At pansinin ang trust score: siyamnapu’t apat sa isang daan. Kinompute iyan mula sa beripikadong rehistro mo, sa mga proyektong natapos mo at sa endorsement ng ibang miyembro. Hindi mo iyan matitipa nang basta-basta.' } },

    { kind: 'app', st: { screen: 'directory', dirSector: '', dirQ: '' },
      t: { en: 'The directory', es: 'El directorio', tl: 'Ang direktoryo' },
      s: { en: '1,247 verified members, filterable by sector and region.',
           es: '1.247 miembros verificados, filtrables por sector y región.',
           tl: '1,247 beripikadong miyembro, masasala ayon sa sektor at rehiyon.' },
      n: { en: 'Here is the whole membership. Not a printed roster that is out of date the day it ships — a living directory you filter by sector and region, and message anyone directly. No introductions to arrange, no gatekeeper. Filter to healthcare and twelve hundred names become ninety eight relevant ones in a single click.',
           es: 'Aquí está toda la membresía. No un directorio impreso que queda desactualizado el día que se entrega, sino un directorio vivo que filtras por sector y región, y donde escribes a cualquiera directamente. Sin presentaciones que gestionar, sin intermediarios. Filtra por salud y mil doscientos nombres se convierten en noventa y ocho relevantes con un solo clic.',
           tl: 'Narito ang buong membership. Hindi isang nakalimbag na listahang luma na sa mismong araw na inilabas — isang buhay na direktoryo na sinasala mo ayon sa sektor at rehiyon, at diretsong makakapagmensahe kaninuman. Walang aayusing introduksiyon, walang tagabantay. Salain ayon sa kalusugan at ang isang libo dalawang daang pangalan ay magiging siyamnapu’t walong may kaugnayan sa isang click.' } },

    { kind: 'app', match: 0,
      t: { en: 'AI Matching', es: 'Matching con IA', tl: 'AI Matching' },
      s: { en: 'Describe a need in plain language. The engine ranks the network.',
           es: 'Describe una necesidad en lenguaje natural. El motor ordena la red.',
           tl: 'Ilarawan ang pangangailangan sa payak na wika. Nirarangko ng makina ang network.' },
      n: { en: 'This is the heart of it. You describe what you need the way you would say it out loud, and the engine scores every profile in the network for affinity, weights it by trust, and hands you a ranked shortlist in seconds. But look at the last two results, marked equity slot. A Gini correction deliberately reserves places for qualified members who have had fewer introductions, so opportunity does not pool around the same well-connected names year after year. Fairness is built into the math, not promised in a speech.',
           es: 'Este es el corazón del sistema. Describes lo que necesitas como lo dirías en voz alta, y el motor evalúa cada perfil de la red por afinidad, lo pondera por confianza y te entrega una lista corta ordenada en segundos. Pero mira los dos últimos resultados, marcados como cupo de equidad. Una corrección Gini reserva deliberadamente lugares para miembros calificados que han recibido menos presentaciones, para que la oportunidad no se concentre en los mismos nombres bien conectados año tras año. La equidad está en las matemáticas, no prometida en un discurso.',
           tl: 'Ito ang puso ng sistema. Inilalarawan mo ang kailangan mo tulad ng sasabihin mo nang malakas, at sinusuri ng makina ang bawat profile sa network ayon sa affinity, tinitimbang ito ayon sa tiwala, at binibigyan ka ng nirangkong shortlist sa ilang segundo. Ngunit tingnan ang huling dalawang resulta, may markang equity slot. Sinadyang maglaan ang Gini correction ng puwesto para sa mga kwalipikadong miyembrong mas kaunti ang nakuhang introduksiyon, para hindi maipon ang oportunidad sa parehong mga pangalan taon-taon. Nasa matematika ang pagkakapantay-pantay, hindi ipinangako sa talumpati.' } },

    { kind: 'app', st: { screen: 'searches' },
      t: { en: 'Saved searches', es: 'Búsquedas guardadas', tl: 'Mga naka-save na paghahanap' },
      s: { en: 'The network keeps working after you close the tab.',
           es: 'La red sigue trabajando después de cerrar la pestaña.',
           tl: 'Patuloy ang network kahit isara mo na ang tab.' },
      n: { en: 'Save any search and it keeps running. As new members join, new candidates appear against searches you set up weeks ago. That matters, because the partner you need in March may not have joined the chamber until June.',
           es: 'Guarda cualquier búsqueda y sigue funcionando. A medida que se suman nuevos miembros, aparecen nuevos candidatos para búsquedas que creaste hace semanas. Eso importa, porque el socio que necesitas en marzo quizá no se une a la cámara hasta junio.',
           tl: 'I-save ang anumang paghahanap at patuloy itong tatakbo. Habang sumasali ang bagong miyembro, lumilitaw ang bagong kandidato para sa paghahanap na ginawa mo ilang linggo na ang nakalipas. Mahalaga iyon, dahil ang partner na kailangan mo sa Marso ay maaaring sumali lang sa kamara sa Hunyo.' } },

    { kind: 'app', st: { screen: 'projects', projTab: 'all' },
      t: { en: 'Projects', es: 'Proyectos', tl: 'Mga Proyekto' },
      s: { en: 'Validated before funded — IRS score and Monte Carlo viability.',
           es: 'Validado antes de financiado: puntaje IRS y viabilidad Monte Carlo.',
           tl: 'Napatunayan bago pinondohan — IRS score at Monte Carlo viability.' },
      n: { en: 'This is where a connection turns into a business. A member proposes a project, the platform assembles a team by role, and before a single dollar moves it runs a Monte Carlo simulation ten thousand times to estimate viability. Every project carries an Investment Readiness Score that folds team completeness, budget realism and that viability figure into one number. Nothing here gets funded on a promise and a handshake.',
           es: 'Aquí una conexión se convierte en un negocio. Un miembro propone un proyecto, la plataforma arma un equipo por roles y, antes de mover un solo dólar, ejecuta una simulación Monte Carlo diez mil veces para estimar la viabilidad. Cada proyecto lleva un Puntaje de Preparación para Inversión que combina la integridad del equipo, el realismo del presupuesto y esa viabilidad en una sola cifra. Aquí nada se financia con una promesa y un apretón de manos.',
           tl: 'Dito nagiging negosyo ang isang koneksiyon. Nagmumungkahi ang isang miyembro ng proyekto, binubuo ng plataporma ang koponan ayon sa tungkulin, at bago gumalaw ang kahit isang dolyar, nagpapatakbo ito ng Monte Carlo simulation ng sampung libong beses para tantiyahin ang viability. May Investment Readiness Score ang bawat proyekto na pinagsasama ang kabuuan ng koponan, realismo ng badyet at ang viability sa isang numero. Walang pinopondohan dito dahil lang sa pangako at pakikipagkamay.' } },

    { kind: 'app', st: { screen: 'invites' },
      t: { en: 'Invitations', es: 'Invitaciones', tl: 'Mga Imbitasyon' },
      s: { en: 'Named roles, with a match score attached.',
           es: 'Roles definidos, con un puntaje de afinidad.',
           tl: 'Mga tiyak na tungkulin, may kalakip na match score.' },
      n: { en: 'When a project needs you, the invitation names the actual role and shows why you were picked — an eighty percent match on this one. You accept or decline in a click. Compare that to being added to a group chat and asked to figure out what you are supposed to do.',
           es: 'Cuando un proyecto te necesita, la invitación nombra el rol concreto y muestra por qué te eligieron: en este caso, una afinidad del ochenta por ciento. Aceptas o rechazas con un clic. Compáralo con que te agreguen a un chat grupal y tengas que adivinar qué se espera de ti.',
           tl: 'Kapag kailangan ka ng isang proyekto, pinapangalanan ng imbitasyon ang aktuwal na tungkulin at ipinapakita kung bakit ka napili — walumpung porsiyentong tugma dito. Tanggapin o tanggihan mo sa isang click. Ihambing iyan sa basta idinagdag ka sa group chat at pinag-isipan mo kung ano ang dapat mong gawin.' } },

    { kind: 'app', st: { screen: 'exchange', xchTab: 'rfqs' },
      t: { en: 'The Exchange', es: 'El Intercambio', tl: 'Ang Palitan' },
      s: { en: 'Requests for quotation, between verified members only.',
           es: 'Solicitudes de cotización, solo entre miembros verificados.',
           tl: 'Mga request for quotation, sa pagitan lang ng beripikadong miyembro.' },
      n: { en: 'The Exchange is the chamber’s own marketplace. Post a request for quotation to the whole network, or bid on someone else’s. Cold chain distribution, bilingual medical billing, an E R P migration for a forty branch remittance network — real work, with a budget and a closing date, circulating among members whose identity has already been checked.',
           es: 'El Intercambio es el mercado propio de la cámara. Publica una solicitud de cotización a toda la red, o presenta una oferta a la de otro. Distribución en cadena de frío, facturación médica bilingüe, una migración E R P para una red de remesas de cuarenta sucursales: trabajo real, con presupuesto y fecha de cierre, circulando entre miembros cuya identidad ya fue verificada.',
           tl: 'Ang Palitan ang sariling pamilihan ng kamara. Mag-post ng request for quotation sa buong network, o mag-alok sa iba. Cold-chain na distribusyon, bilingguwal na medical billing, isang E R P migration para sa apatnapung-branch na remittance network — tunay na trabaho, may badyet at petsa ng pagsasara, umiikot sa mga miyembrong naberipika na ang pagkakakilanlan.' } },

    { kind: 'app', st: { screen: 'payments' },
      t: { en: 'Payments', es: 'Pagos', tl: 'Mga Bayad' },
      s: { en: 'Dues, escrow and invoices — card details never touch our servers.',
           es: 'Cuotas, fideicomiso y facturas: los datos de tarjeta nunca tocan nuestros servidores.',
           tl: 'Dues, escrow at invoice — hindi dumadaan ang detalye ng card sa aming server.' },
      n: { en: 'Membership dues, project escrow and chamber invoices sit in one place, with a full payment history. Card details never touch our servers — Stripe holds them. The chamber sees that you paid; it never sees your card.',
           es: 'Las cuotas de membresía, el fideicomiso de proyectos y las facturas están en un solo lugar, con el historial completo de pagos. Los datos de tarjeta nunca tocan nuestros servidores: los guarda Stripe. La cámara ve que pagaste; nunca ve tu tarjeta.',
           tl: 'Nasa isang lugar ang membership dues, project escrow at mga invoice ng kamara, may buong kasaysayan ng bayad. Hindi kailanman dumadaan ang detalye ng card sa aming server — nasa Stripe iyon. Nakikita ng kamara na nagbayad ka; hindi nito nakikita ang card mo.' } },

    { kind: 'app', st: { screen: 'guide', guide: 3 },
      t: { en: 'The member guide', es: 'La guía del miembro', tl: 'Ang gabay ng miyembro' },
      s: { en: 'Eleven sections, so nobody is left guessing.',
           es: 'Once secciones, para que nadie tenga que adivinar.',
           tl: 'Labing-isang bahagi, para walang mahulaan.' },
      n: { en: 'A platform nobody understands is a platform nobody uses. The member guide explains every module and how to get value from it on day one — including the mathematics behind the matching, in plain language. It is built into the app, not emailed as a PDF that gets lost.',
           es: 'Una plataforma que nadie entiende es una plataforma que nadie usa. La guía del miembro explica cada módulo y cómo sacarle valor desde el primer día, incluida la matemática detrás del matching, en lenguaje sencillo. Está dentro de la app, no enviada como un PDF que se pierde.',
           tl: 'Ang plataporma na walang nakakaintindi ay plataporma na walang gumagamit. Ipinapaliwanag ng gabay ng miyembro ang bawat module at kung paano makakuha ng halaga mula rito sa unang araw — kasama ang matematika sa likod ng matching, sa payak na wika. Nasa loob ito ng app, hindi ipinadalang PDF na nawawala.' } },

    { kind: 'app', st: { screen: 'jobup' },
      t: { en: 'JobUp — your global profile',
           es: 'JobUp — tu perfil global',
           tl: 'JobUp — ang iyong global na profile' },
      s: { en: 'The chamber opens a door beyond the chamber.',
           es: 'La cámara abre una puerta más allá de la cámara.',
           tl: 'Nagbubukas ang kamara ng pinto na higit pa sa kamara.' },
      n: { en: 'Membership reaches past the chamber itself. JobUp turns your résumé into a living professional profile: real openings scored against what you have actually done, a public C V site that recruiters and their AI can read, and outreach drafted for you to approve before anything is sent. For a community where careers and businesses grow together, that is the same network doing double duty.',
           es: 'La membresía llega más allá de la propia cámara. JobUp convierte tu currículum en un perfil profesional vivo: vacantes reales evaluadas contra lo que realmente has hecho, un sitio de C V público que los reclutadores y su inteligencia artificial pueden leer, y mensajes redactados para que los apruebes antes de enviar nada. Para una comunidad donde las carreras y los negocios crecen juntos, es la misma red haciendo doble trabajo.',
           tl: 'Umaabot ang membership nang higit pa sa kamara mismo. Ginagawa ng JobUp na buhay na propesyonal na profile ang iyong résumé: tunay na bakanteng sinusukat laban sa aktuwal mong nagawa, isang pampublikong C V site na kayang basahin ng recruiter at ng AI nila, at outreach na idinrapt para aprubahan mo bago may maipadala. Para sa komunidad kung saan sabay lumalago ang karera at negosyo, iisang network iyan na doble ang trabaho.' } },

    { kind: 'app', st: { screen: 'admin', admTab: 'members' },
      t: { en: 'Governance you can audit',
           es: 'Gobernanza auditable',
           tl: 'Pamamahalang masusuri' },
      s: { en: 'Members, board seats and regional delegations — on the record.',
           es: 'Miembros, junta directiva y delegaciones regionales: registrados.',
           tl: 'Mga miyembro, puwesto sa lupon at delegasyong panrehiyon — nakatala.' },
      n: { en: 'And behind it, administration. Member management, board seats, regional delegations and chamber settings. Governance changes are logged and visible, so leadership is something the membership can inspect rather than something it hears about at the annual meeting.',
           es: 'Y detrás, la administración. Gestión de miembros, puestos de la junta, delegaciones regionales y ajustes de la cámara. Los cambios de gobernanza quedan registrados y visibles, para que el liderazgo sea algo que la membresía pueda inspeccionar y no algo de lo que se entera en la asamblea anual.',
           tl: 'At sa likod nito, ang administrasyon. Pamamahala ng miyembro, puwesto sa lupon, delegasyong panrehiyon at mga setting ng kamara. Naitatala at nakikita ang mga pagbabago sa pamamahala, kaya ang pamumuno ay bagay na kayang suriin ng membership, hindi bagay na nababalitaan lang nila sa taunang pulong.' } },

    { kind: 'outro',
      t: { en: 'Enter the ecosystem', es: 'Entra al ecosistema', tl: 'Pumasok sa ekosistema' },
      s: { en: 'Create your verified profile and make your first match in under five minutes.',
           es: 'Crea tu perfil verificado y haz tu primer match en menos de cinco minutos.',
           tl: 'Gumawa ng beripikadong profile at gawin ang unang tugma sa wala pang limang minuto.' },
      n: { en: 'That is the ecosystem: a verified directory, an AI that matches with fairness built in, projects validated before they are funded, a marketplace of real work, and governance you can audit. Join the network, create your verified profile, and make your first business match in under five minutes. PACC-CFL is waiting for you on CamaraVirtual.',
           es: 'Ese es el ecosistema: un directorio verificado, una inteligencia artificial que empareja con equidad incorporada, proyectos validados antes de financiarse, un mercado de trabajo real y una gobernanza auditable. Súmate a la red, crea tu perfil verificado y haz tu primer match de negocio en menos de cinco minutos. PACC-CFL te espera en CamaraVirtual.',
           tl: 'Iyan ang ekosistema: isang beripikadong direktoryo, isang AI na tumutugma nang may nakapaloob na pagkakapantay-pantay, mga proyektong napatunayan bago pinondohan, isang pamilihan ng tunay na trabaho, at pamamahalang masusuri. Sumali sa network, gumawa ng iyong beripikadong profile, at gawin ang iyong unang business match sa wala pang limang minuto. Naghihintay ang PACC-CFL sa CamaraVirtual.' } }
  ];

  // ── i18n for the deck chrome ───────────────────────────────────────────
  var UI = {
    step:   { en: 'Step {n} of {t}', es: 'Paso {n} de {t}', tl: 'Hakbang {n} ng {t}' },
    pause:  { en: 'Pause', es: 'Pausar', tl: 'I-pause' },
    play:   { en: 'Play', es: 'Reproducir', tl: 'I-play' },
    ready:  { en: 'ready', es: 'listo', tl: 'handa' },
    load:   { en: 'loading', es: 'cargando', tl: 'naglo-load' },
    off:    { en: 'text only', es: 'solo texto', tl: 'teksto lang' },
    done:   { en: 'Walkthrough finished.', es: 'Recorrido finalizado.', tl: 'Tapos na ang paglalakad.' }
  };

  var LANGS = ['en', 'es', 'tl'];
  var lang = 'en';
  var idx = 0, playing = false, muted = false, started = false;
  var audio = new Audio();
  audio.preload = 'auto';
  var cache = {};      // lang|idx -> objectURL
  var token = 0;       // guards against a stale fetch landing after a slide change
  var mutedTimer = null;

  var $ = function (id) { return document.getElementById(id); };
  function t(k, vars) {
    var s = UI[k][lang] || UI[k].en;
    if (vars) Object.keys(vars).forEach(function (v) { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  }
  function txt(o) { return o[lang] || o.en; }

  // ── narration ──────────────────────────────────────────────────────────
  function ttsUrl(i, l) {
    var key = l + '|' + i;
    if (cache[key]) return Promise.resolve(cache[key]);
    return fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: SLIDES[i].n[l] || SLIDES[i].n.en, voice: VOICE[l] })
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

  // ── slide rendering ────────────────────────────────────────────────────
  function panelHTML(kind) {
    if (kind === 'login') {
      return '<div class="panel"><div class="login-card">' +
        '<img src="/pacccfl/pacc-ai-neural-badge.png" alt="">' +
        '<h3>PACC-CFL</h3>' +
        '<div class="sub">' + ({ en: 'Sign in to your member panel', es: 'Inicia sesión en tu panel de miembro', tl: 'Mag-sign in sa iyong member panel' })[lang] + '</div>' +
        '<label>Email</label><div class="fake-in">you@email.com</div>' +
        '<label>' + ({ en: 'Password', es: 'Contraseña', tl: 'Password' })[lang] + '</label><div class="fake-in">••••••••</div>' +
        '<div class="signin">' + ({ en: 'Sign In', es: 'Entrar', tl: 'Mag-sign In' })[lang] + '</div>' +
        '</div></div>';
    }
    var s = SLIDES[idx];
    return '<div class="panel">' +
      '<img class="badge" src="/pacccfl/pacc-ai-neural-badge.png" alt="">' +
      '<h2>' + txt(s.t) + '</h2><p>' + txt(s.n) + '</p>' +
      (kind === 'outro'
        ? '<div class="cta">' +
          '<a class="btn-gold" href="https://www.camaravirtual.app/cv-2" target="_blank" rel="noopener">' +
          ({ en: 'Join PACC-CFL', es: 'Únete a PACC-CFL', tl: 'Sumali sa PACC-CFL' })[lang] + '</a>' +
          '<a class="btn-ghost" href="/pacccfl/#demo">' +
          ({ en: 'Try the demo yourself', es: 'Prueba la demo tú mismo', tl: 'Subukan mo ang demo' })[lang] + '</a></div>'
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
      if (typeof s.match === 'number' && window.PACCDemo) window.PACCDemo.runMatch(s.match);
      else if (window.PACCDemo) window.PACCDemo.set(Object.assign({ clearMatch: true }, s.st || {}));
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
        // No audio: hold each slide proportional to how much there is to read.
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
      if (playing) audio.play().catch(function () { /* autoplay blocked; user can press play */ });
    }).catch(function () {
      if (my !== token) return;
      // The voice service is unreachable — the walkthrough still runs, silently.
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

  // ── language ───────────────────────────────────────────────────────────
  window.setLang = function (l) {
    if (LANGS.indexOf(l) === -1) l = 'en';
    lang = l;
    document.documentElement.lang = l;
    Array.prototype.forEach.call(document.querySelectorAll('.lang-opt'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === l ? 'true' : 'false');
    });
    document.querySelectorAll('[data-en]').forEach(function (el) {
      var v = el.getAttribute('data-' + l) || el.getAttribute('data-en');
      if (v !== null) el.innerHTML = v;
    });
    $('play').textContent = playing ? t('pause') : t('play');
    if (window.PACCDemo) window.PACCDemo.relang();
    try { localStorage.setItem('pacccfl_lang', l); } catch (e) {}
    if (started) { paintSlide(); speak(); }
  };

  // ── boot ───────────────────────────────────────────────────────────────
  function boot() {
    // dots
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
      go(0);
      if (!muted) prefetch(1);
    }
    $('start').addEventListener('click', function () { begin(false); });
    $('startMuted').addEventListener('click', function () { begin(true); });

    // initial language: ?lang= > last choice > browser
    var qs = new URLSearchParams(location.search);
    var want = (qs.get('lang') || '').toLowerCase();
    if (LANGS.indexOf(want) === -1) { try { want = localStorage.getItem('pacccfl_lang') || ''; } catch (e) { want = ''; } }
    if (LANGS.indexOf(want) === -1) want = (navigator.language || 'en').slice(0, 2).toLowerCase();
    if (want === 'fil') want = 'tl';
    setLang(LANGS.indexOf(want) === -1 ? 'en' : want);

    paintSlide();
    voiceState('ready');
    // Deep link straight to a step: /pacccfl/ecosystem/?step=7
    var st = parseInt(qs.get('step'), 10);
    if (st >= 1 && st <= SLIDES.length) { idx = st - 1; paintSlide(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.PACCDeck = { slides: SLIDES.length, go: go, at: function () { return idx; }, table: SLIDES };
})();
