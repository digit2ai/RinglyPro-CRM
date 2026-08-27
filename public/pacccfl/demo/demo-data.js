/* ============================================================================
   PACC-CFL live app simulator — sample dataset.

   EVERY PERSON, COMPANY, PROJECT AND MESSAGE IN THIS FILE IS INVENTED.
   The simulator is a public marketing demo, so it must never carry a real
   member's name, email or company: that would attach fabricated sectors,
   trust scores and deal history to an identifiable person. The names below are
   generated from name pools and collide with nobody's record in the live
   chamber. The app chrome is labelled DEMO / sample data for the same reason.

   Members are built from a seeded PRNG so the directory, the counts and the
   match results are identical on every load — a demo that reshuffles itself
   mid-presentation is worse than no demo.
   ========================================================================== */
(function () {
  'use strict';

  // ── deterministic PRNG (mulberry32) ───────────────────────────────────
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var SECTORS = [
    { id: 'tecnologia',   en: 'Technology',            es: 'Tecnología',            tl: 'Teknolohiya' },
    { id: 'salud',        en: 'Healthcare',            es: 'Salud',                 tl: 'Kalusugan' },
    { id: 'servicios',    en: 'Professional Services', es: 'Servicios Profesionales', tl: 'Serbisyong Propesyonal' },
    { id: 'construccion', en: 'Construction',          es: 'Construcción',          tl: 'Konstruksiyon' },
    { id: 'finanzas',     en: 'Finance',               es: 'Finanzas',              tl: 'Pananalapi' },
    { id: 'alimentos',    en: 'Food & Beverage',       es: 'Alimentos y Bebidas',   tl: 'Pagkain at Inumin' },
    { id: 'hoteleria',    en: 'Hospitality & Tourism', es: 'Hotelería y Turismo',   tl: 'Hotel at Turismo' },
    { id: 'marketing',    en: 'Digital Marketing',     es: 'Marketing Digital',     tl: 'Digital na Marketing' },
    { id: 'manufactura',  en: 'Manufacturing',         es: 'Manufactura',           tl: 'Pagmamanupaktura' },
    { id: 'educacion',    en: 'Education',             es: 'Educación',             tl: 'Edukasyon' },
    { id: 'inmobiliaria', en: 'Real Estate',           es: 'Inmobiliaria',          tl: 'Real Estate' },
    { id: 'belleza',      en: 'Beauty & Wellness',     es: 'Belleza y Bienestar',   tl: 'Ganda at Kalusugan' },
    { id: 'logistica',    en: 'Logistics',             es: 'Logística',             tl: 'Lohistika' },
    { id: 'legal',        en: 'Legal',                 es: 'Legal',                 tl: 'Legal' },
    { id: 'seguros',      en: 'Insurance',             es: 'Seguros',               tl: 'Seguro' }
  ];

  var REGIONS = [
    { id: 'orlando', en: 'Orlando Metro',            es: 'Área de Orlando',        tl: 'Orlando Metro',            n: 412 },
    { id: 'tampa',   en: 'Tampa Bay Area',           es: 'Área de Tampa Bay',      tl: 'Tampa Bay Area',           n: 268 },
    { id: 'south',   en: 'South Florida',            es: 'Sur de la Florida',      tl: 'Timog Florida',            n: 231 },
    { id: 'north',   en: 'North / Central FL',       es: 'Norte / Centro de FL',   tl: 'Hilaga / Gitnang FL',      n: 186 },
    { id: 'intl',    en: 'International / Philippines', es: 'Internacional / Filipinas', tl: 'Internasyonal / Pilipinas', n: 150 }
  ];

  var TIERS = [
    { id: 'founding',  en: 'Founding',   es: 'Fundador',    tl: 'Tagapagtatag', n: 42 },
    { id: 'corporate', en: 'Corporate',  es: 'Corporativo', tl: 'Korporatibo',  n: 168 },
    { id: 'individual',en: 'Individual', es: 'Individual',  tl: 'Indibidwal',   n: 921 },
    { id: 'student',   en: 'Student',    es: 'Estudiante',  tl: 'Estudyante',   n: 116 }
  ];

  var GIVEN = ['Marisol','Rodel','Katrina','Emil','Divina','Arnel','Joselyn','Bernardo','Charmaine','Teodoro',
    'Liezl','Ferdinand','Roselle','Efren','Marivic','Gerardo','Analyn','Lorenzo','Cherrie','Wilfredo',
    'Jocelyn','Ramil','Editha','Danilo','Maricel','Aurelio','Lorna','Nestor','Rowena','Alfonso',
    'Grace','Ignacio','Melinda','Rogelio','Cristina','Bayani','Jasmin','Elpidio','Corazon','Aristotle',
    'Precious','Domingo','Angelica','Ruperto','Sheryl','Anselmo','Rachelle','Gaudencio','Aileen','Jomar',
    'Beverly','Percival','Michelle','Isagani','Dolores','Reynaldo','Kristine','Amado','Yolanda','Nicanor',
    'Trisha','Onofre','Lilibeth','Salvador','Josefina','Rodrigo','Camille','Herminio','Vilma','Apolinario'];

  var SURNAME = ['Bacani','Cabrera','Dimalanta','Elizalde','Fajardo','Gatchalian','Hufana','Ilagan','Jamora','Kalaw',
    'Lacsamana','Macaraeg','Nepomuceno','Obispo','Panganiban','Quiambao','Ramoso','Sarmiento','Tolentino','Ubaldo',
    'Valenzuela','Wenceslao','Yabut','Zaballero','Almonte','Bumanglag','Catibayan','Dagdagan','Escalona','Fontanilla',
    'Guevarra','Hernandez','Imperial','Juanico','Katigbak','Lumbao','Maglaya','Nazareno','Ordonez','Pelaez',
    'Quintos','Rivera','Sotelo','Tabuena','Umali','Vergara','Wagas','Yandoc','Zulueta','Arceo',
    'Bandoy','Cuenca','Dizon','Estrella','Ferrer','Gonzaga','Hilario','Isidro','Jimenez','Kabigting'];

  var CO_A = ['Sampaguita','Luzon','Bayanihan','Mabuhay','Pearl','Kalayaan','Tanglaw','Sinag','Adarna','Banyan',
    'Narra','Maharlika','Liwanag','Katipunan','Anahaw','Dalisay','Sulu','Panay','Bicol','Ilaya'];
  var CO_B = ['Group','Partners','Solutions','Holdings','Services','Ventures','Labs','Collective','Works','Associates',
    'Systems','Advisors','Logistics','Studio','Clinic','Builders','Capital','Foods','Realty','Care'];

  var SUBS = {
    tecnologia: ['Cloud Migration','AI Platforms','Cybersecurity','Data Engineering','Mobile Apps','ERP Integration'],
    salud: ['Home Health','Nurse Staffing','Medical Billing','Dental Practice','Physical Therapy','Telehealth'],
    servicios: ['Bookkeeping','HR Consulting','Immigration Paralegal','Translation','Notary','Grant Writing'],
    construccion: ['General Contracting','Roofing','Electrical','HVAC','Interior Build-out','Concrete'],
    finanzas: ['Tax Preparation','SBA Lending','Wealth Planning','Payroll','Audit','Remittances'],
    alimentos: ['Catering','Filipino Bakery','Food Truck','Commissary','Import & Distribution','Restaurant'],
    hoteleria: ['Boutique Hotel','Travel Agency','Event Venue','Tour Operator','Vacation Rentals','Hotel Supply'],
    marketing: ['Paid Social','SEO','Brand Design','Video Production','Community Management','Email Automation'],
    manufactura: ['Metal Fabrication','Packaging','Textiles','Electronics Assembly','Plastics','Print Production'],
    educacion: ['NCLEX Review','ESL Programs','K-12 Tutoring','Trade Certification','Corporate Training','Test Prep'],
    inmobiliaria: ['Residential Sales','Commercial Leasing','Property Management','Title Services','Appraisal','Investment'],
    belleza: ['Med Spa','Salon','Skincare Line','Wellness Coaching','Massage Therapy','Barbershop'],
    logistica: ['Last Mile','Freight Brokerage','Warehousing','Balikbayan Shipping','Customs Brokerage','Cold Chain'],
    legal: ['Immigration Law','Business Formation','Estate Planning','Employment Law','Contracts','Family Law'],
    seguros: ['Life Insurance','Commercial P&C','Health Plans','Bonds','Auto','Workers Comp']
  };

  // ── Build the roster ──────────────────────────────────────────────────
  function buildMembers() {
    var r = rng(20260827);
    var out = [];
    // Region + tier buckets, drawn down so the totals match the dashboard exactly.
    var regionPool = [], tierPool = [];
    REGIONS.forEach(function (g) { for (var i = 0; i < g.n; i++) regionPool.push(g.id); });
    TIERS.forEach(function (t) { for (var i = 0; i < t.n; i++) tierPool.push(t.id); });
    // Deterministic shuffle so tiers and regions are not blocked together.
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    shuffle(regionPool); shuffle(tierPool);

    var total = regionPool.length;
    for (var i = 0; i < total; i++) {
      var first = GIVEN[Math.floor(r() * GIVEN.length)];
      var last = SURNAME[Math.floor(r() * SURNAME.length)];
      var sec = SECTORS[Math.floor(r() * SECTORS.length)];
      var subs = SUBS[sec.id];
      var tier = tierPool[i];
      var hasCo = tier !== 'student' && r() > 0.18;
      out.push({
        id: 30000 + i,
        name: first + ' ' + last,
        email: (first + '.' + last).toLowerCase().replace(/[^a-z.]/g, '') + '@' + (hasCo ? 'sample-co.test' : 'sample-member.test'),
        company: hasCo ? (CO_A[Math.floor(r() * CO_A.length)] + ' ' + CO_B[Math.floor(r() * CO_B.length)]) : '',
        sector: sec.id,
        sub: subs[Math.floor(r() * subs.length)],
        region: regionPool[i],
        tier: tier,
        years: tier === 'student' ? 1 + Math.floor(r() * 3) : 2 + Math.floor(r() * 29),
        trust: 58 + Math.floor(r() * 41),
        country: regionPool[i] === 'intl' ? 'Philippines' : 'United States'
      });
    }
    return out;
  }

  var MEMBERS = buildMembers();

  // ── Fixed narrative content ───────────────────────────────────────────
  var PROJECTS = [
    { id: 'p1', irs: 88, role: 'member', status: 'executing', owner: 'Marisol Gatchalian', sector: 'inmobiliaria', viab: 79, team: 9, budget: '$240K',
      en: 'HomeBridge PACC: Bilingual Real Estate Referral Platform for Filipino-American Homebuyers',
      es: 'HomeBridge PACC: plataforma bilingüe de referidos inmobiliarios para compradores filipino-americanos',
      tl: 'HomeBridge PACC: Bilingguwal na Referral Platform sa Real Estate para sa mga Filipino-American na Mamimili ng Bahay' },
    { id: 'p2', irs: 84, role: 'member', status: 'executing', owner: 'Emil Sarmiento', sector: 'salud', viab: 70, team: 12, budget: '$410K',
      en: 'CarePath PACC: Bilingual Healthcare Navigation for Filipino-American Communities',
      es: 'CarePath PACC: navegación sanitaria bilingüe para comunidades filipino-americanas',
      tl: 'CarePath PACC: Bilingguwal na Healthcare Navigation para sa mga Komunidad na Filipino-American' },
    { id: 'p3', irs: 81, role: 'proposer', status: 'executing', owner: 'Katrina Tolentino', sector: 'salud', viab: 74, team: 15, budget: '$620K',
      en: 'NurseBridge PACC: Philippine-US Nursing Workforce Pipeline',
      es: 'NurseBridge PACC: canal de enfermería entre Filipinas y Estados Unidos',
      tl: 'NurseBridge PACC: Pipeline ng Manggagawang Nars mula Pilipinas patungong US' },
    { id: 'p4', irs: 76, role: 'proposer', status: 'recruiting', owner: 'Rodel Panganiban', sector: 'tecnologia', viab: 68, team: 6, budget: '$180K',
      en: 'Kalinga Data Trust — Shared Analytics for Chamber Members',
      es: 'Kalinga Data Trust — analítica compartida para los miembros de la cámara',
      tl: 'Kalinga Data Trust — Ibinahaging Analytics para sa mga Miyembro ng Kamara' },
    { id: 'p5', irs: 72, role: 'member', status: 'recruiting', owner: 'Divina Macaraeg', sector: 'logistica', viab: 66, team: 7, budget: '$150K',
      en: 'Balikbayan Freight Consolidation Hub — Orlando to Manila',
      es: 'Centro de consolidación de carga Balikbayan — Orlando a Manila',
      tl: 'Balikbayan Freight Consolidation Hub — Orlando patungong Maynila' },
    { id: 'p6', irs: 69, role: 'open', status: 'recruiting', owner: 'Arnel Ilagan', sector: 'alimentos', viab: 63, team: 5, budget: '$95K',
      en: 'Sari-Sari Commissary: Shared Kitchen for Filipino Food Entrepreneurs',
      es: 'Comisariato Sari-Sari: cocina compartida para emprendedores de comida filipina',
      tl: 'Sari-Sari Commissary: Ibinahaging Kusina para sa mga Negosyanteng Pagkaing Pilipino' },
    { id: 'p7', irs: 91, role: 'open', status: 'executing', owner: 'Bernardo Quiambao', sector: 'educacion', viab: 83, team: 11, budget: '$300K',
      en: 'NCLEX Bridge Academy — Central Florida Cohort Program',
      es: 'NCLEX Bridge Academy — programa de cohortes en la Florida Central',
      tl: 'NCLEX Bridge Academy — Programang Cohort sa Central Florida' },
    { id: 'p8', irs: 64, role: 'open', status: 'closed', owner: 'Charmaine Hufana', sector: 'construccion', viab: 61, team: 8, budget: '$520K',
      en: 'Bayanihan Build: Affordable Housing Pilot, Osceola County',
      es: 'Bayanihan Build: piloto de vivienda asequible, condado de Osceola',
      tl: 'Bayanihan Build: Pilot ng Abot-kayang Pabahay, Osceola County' }
  ];

  var RFQS = [
    { id: 'r1', by: 'Sampaguita Foods', sector: 'alimentos', budget: '$40K - $60K', bids: 7, days: 6,
      en: 'Cold-chain distribution for a Filipino frozen-goods line across Central Florida',
      es: 'Distribución en cadena de frío para una línea de congelados filipinos en la Florida Central',
      tl: 'Cold-chain na distribusyon para sa linya ng frozen na produktong Pilipino sa Central Florida' },
    { id: 'r2', by: 'Narra Care Clinic', sector: 'salud', budget: '$25K - $35K', bids: 11, days: 3,
      en: 'Bilingual medical billing and insurance credentialing, 3 clinic locations',
      es: 'Facturación médica bilingüe y credencialización de seguros, 3 clínicas',
      tl: 'Bilingguwal na medical billing at insurance credentialing, 3 lokasyon ng klinika' },
    { id: 'r3', by: 'Maharlika Realty', sector: 'marketing', budget: '$12K - $18K', bids: 9, days: 9,
      en: 'Paid social campaign targeting first-time Filipino-American homebuyers',
      es: 'Campaña de pauta social para compradores de vivienda filipino-americanos primerizos',
      tl: 'Bayad na social campaign para sa mga first-time na Filipino-American na mamimili ng bahay' },
    { id: 'r4', by: 'Tanglaw Systems', sector: 'tecnologia', budget: '$70K - $110K', bids: 5, days: 12,
      en: 'ERP integration and data migration for a 40-branch remittance network',
      es: 'Integración ERP y migración de datos para una red de remesas de 40 sucursales',
      tl: 'ERP integration at data migration para sa 40-branch na remittance network' }
  ];

  var COMPANIES = [
    { name: 'Sampaguita Foods LLC', sector: 'alimentos', region: 'orlando', staff: 34, verified: true },
    { name: 'Tanglaw Systems Inc', sector: 'tecnologia', region: 'tampa', staff: 88, verified: true },
    { name: 'Narra Care Clinic', sector: 'salud', region: 'orlando', staff: 26, verified: true },
    { name: 'Maharlika Realty Group', sector: 'inmobiliaria', region: 'south', staff: 19, verified: true },
    { name: 'Bayanihan Builders Co', sector: 'construccion', region: 'north', staff: 51, verified: false },
    { name: 'Kalayaan Logistics', sector: 'logistica', region: 'intl', staff: 120, verified: true }
  ];

  var CONVOS = [
    { who: 'Marisol Gatchalian', co: 'Maharlika Realty Group', when: '10:24', group: false, unread: 2,
      en: 'The referral agreement is ready — can your team review the Orlando territory clause?',
      es: 'El acuerdo de referidos está listo: ¿puede tu equipo revisar la cláusula del territorio de Orlando?',
      tl: 'Handa na ang referral agreement — masusuri ba ng team mo ang clause sa teritoryo ng Orlando?' },
    { who: 'NurseBridge Core Team', co: '9 members', when: 'Yesterday', group: true, unread: 5,
      en: 'Cohort 3 credentialing is cleared. We need two more clinical preceptors in Tampa.',
      es: 'La credencialización de la cohorte 3 está aprobada. Faltan dos preceptores clínicos en Tampa.',
      tl: 'Aprubado na ang credentialing ng Cohort 3. Kailangan pa ng dalawang clinical preceptor sa Tampa.' },
    { who: 'Emil Sarmiento', co: 'Narra Care Clinic', when: 'Mon', group: false, unread: 0,
      en: 'Sending our RFQ for bilingual billing today. Your Gini-corrected shortlist was spot on.',
      es: 'Hoy enviamos nuestra RFQ de facturación bilingüe. Tu lista corta con corrección Gini fue exacta.',
      tl: 'Ipapadala namin ngayon ang RFQ para sa bilingguwal na billing. Tama ang shortlist mo na may Gini correction.' },
    { who: 'Chamber Announcements', co: '1,247 members', when: 'Mar 12', group: true, unread: 0,
      en: '30th Anniversary Business Summit — registration opens Friday for founding members.',
      es: 'Cumbre Empresarial del 30 Aniversario: la inscripción abre el viernes para miembros fundadores.',
      tl: 'Ika-30 Anibersaryo Business Summit — bukas ang rehistro sa Biyernes para sa founding members.' }
  ];

  var INVITES = [
    { proj: 'p1', by: 'Marisol Gatchalian', score: 80, state: 'accepted',
      roleEn: 'CEO / Co-Founder (Platform & Strategy)', roleEs: 'CEO / Cofundador (Plataforma y Estrategia)', roleTl: 'CEO / Co-Founder (Plataporma at Estratehiya)' },
    { proj: 'p3', by: 'Katrina Tolentino', score: 74, state: 'pending',
      roleEn: 'Clinical Partnerships Lead', roleEs: 'Líder de Alianzas Clínicas', roleTl: 'Lead sa Clinical Partnerships' },
    { proj: 'p7', by: 'Bernardo Quiambao', score: 68, state: 'pending',
      roleEn: 'Curriculum Director (NCLEX)', roleEs: 'Director de Currículo (NCLEX)', roleTl: 'Direktor ng Kurikulum (NCLEX)' }
  ];

  var SAVED = [
    { matches: 14, last: '5/18/2026',
      en: 'Licensed nurse staffing partners in Tampa or Orlando that can sponsor visas and handle credentialing',
      es: 'Socios de dotación de enfermería con licencia en Tampa u Orlando que puedan patrocinar visas y gestionar credenciales',
      tl: 'Mga partner sa nurse staffing sa Tampa o Orlando na kayang mag-sponsor ng visa at mag-asikaso ng credentialing' },
    { matches: 9, last: '5/11/2026',
      en: 'Cold-chain logistics for imported Filipino frozen goods, Central Florida',
      es: 'Logística de cadena de frío para congelados filipinos importados, Florida Central',
      tl: 'Cold-chain logistics para sa inaangkat na frozen na produktong Pilipino, Central Florida' },
    { matches: 21, last: '4/29/2026',
      en: 'Commercial general contractors with hospitality build-out experience',
      es: 'Contratistas generales comerciales con experiencia en obra de hotelería',
      tl: 'Commercial general contractors na may karanasan sa hospitality build-out' }
  ];

  window.PACC_DEMO = {
    SECTORS: SECTORS, REGIONS: REGIONS, TIERS: TIERS, MEMBERS: MEMBERS,
    PROJECTS: PROJECTS, RFQS: RFQS, COMPANIES: COMPANIES, CONVOS: CONVOS,
    INVITES: INVITES, SAVED: SAVED,
    STATS: {
      members: MEMBERS.length,
      projects: 38,
      rfqs: 26,
      hci: 78.4,
      deals: 214,
      transacted: '$12.4M',
      matches: 3908
    }
  };
})();
