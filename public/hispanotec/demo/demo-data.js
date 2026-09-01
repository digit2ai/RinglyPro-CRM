/* ============================================================================
   Hispanotec — simulador de la app de miembro: conjunto de datos de muestra.

   TODA PERSONA, EMPRESA, PROYECTO Y MENSAJE DE ESTE ARCHIVO ES INVENTADO.
   El simulador es una demostración pública de marketing, así que nunca debe
   llevar el nombre, el correo o la empresa de un miembro real: eso ataría
   sectores, índices de confianza e historial de negocios fabricados a una
   persona identificable. Los nombres de abajo se generan a partir de listas
   y no coinciden con ningún registro de la cámara. La app va rotulada
   DEMO / datos de muestra por la misma razón.

   Los miembros se construyen con un PRNG sembrado, de modo que el directorio,
   los conteos y los resultados de match son idénticos en cada carga: una demo
   que se rebaraja a mitad de una presentación es peor que ninguna demo.
   ========================================================================== */
(function () {
  'use strict';

  // ── PRNG determinista (mulberry32) ────────────────────────────────────
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Taxonomía alineada con la cámara real cv-105: comercio exterior,
  // consultoría, servicios profesionales, construcción y tecnología existen
  // hoy en el directorio; el resto son los sectores hacia los que crece.
  var SECTORS = [
    { id: 'tecnologia',   es: 'Tecnología',              en: 'Technology' },
    { id: 'comercio',     es: 'Comercio Exterior',       en: 'Foreign Trade' },
    { id: 'consultoria',  es: 'Consultoría',             en: 'Consulting' },
    { id: 'servicios',    es: 'Servicios Profesionales', en: 'Professional Services' },
    { id: 'agro',         es: 'Agroindustria',           en: 'Agribusiness' },
    { id: 'construccion', es: 'Construcción',            en: 'Construction' },
    { id: 'finanzas',     es: 'Finanzas',                en: 'Finance' },
    { id: 'energia',      es: 'Energía y Renovables',    en: 'Energy & Renewables' },
    { id: 'logistica',    es: 'Logística',               en: 'Logistics' },
    { id: 'salud',        es: 'Salud',                   en: 'Healthcare' },
    { id: 'educacion',    es: 'Educación',               en: 'Education' },
    { id: 'marketing',    es: 'Marketing Digital',       en: 'Digital Marketing' },
    { id: 'manufactura',  es: 'Manufactura',             en: 'Manufacturing' },
    { id: 'legal',        es: 'Legal',                   en: 'Legal' },
    { id: 'turismo',      es: 'Turismo y Hotelería',     en: 'Tourism & Hospitality' }
  ];

  // Hispanotec es una cámara transatlántica: España, América Latina y el
  // mercado hispano de Estados Unidos.
  var REGIONS = [
    { id: 'espana',   es: 'España',                 en: 'Spain',                  n: 268 },
    { id: 'mexico',   es: 'México',                 en: 'Mexico',                 n: 231 },
    { id: 'andina',   es: 'Región Andina',          en: 'Andean Region',          n: 184 },
    { id: 'usa',      es: 'EE. UU. hispano',        en: 'Hispanic United States', n: 162 },
    { id: 'consur',   es: 'Cono Sur',               en: 'Southern Cone',          n: 105 },
    { id: 'caribe',   es: 'Caribe y Centroamérica', en: 'Caribbean & Central America', n: 92 }
  ];

  var TIERS = [
    { id: 'founding',   es: 'Fundador',    en: 'Founding',   n: 38 },
    { id: 'corporate',  es: 'Corporativo', en: 'Corporate',  n: 214 },
    { id: 'individual', es: 'Individual',  en: 'Individual', n: 693 },
    { id: 'student',    es: 'Estudiante',  en: 'Student',    n: 97 }
  ];

  var GIVEN = ['Alejandra','Íñigo','Camila','Rodrigo','Lucía','Emiliano','Marta','Santiago','Ainhoa','Joaquín',
    'Valeria','Gonzalo','Paula','Mateo','Ximena','Álvaro','Renata','Bruno','Elena','Nicolás',
    'Daniela','Javier','Carolina','Tomás','Inés','Sebastián','Andrea','Manuel','Sofía','Ignacio',
    'Mariana','Pablo','Natalia','Diego','Beatriz','Adrián','Isabela','Fernando','Rocío','Esteban',
    'Clara','Guillermo','Verónica','Leonardo','Amaia','Rubén','Antonia','Óscar','Julieta','Arturo',
    'Cecilia','Rafael','Miren','Cristóbal','Pilar','Enrique','Lorena','Vicente','Gabriela','Aitor',
    'Rosalía','Damián','Noelia','Hernán','Teresa','Salvador','Milagros','Eloy','Sandra','Facundo'];

  var SURNAME = ['Arrieta','Bustamante','Carvajal','Del Olmo','Escalante','Fuentes','Gallardo','Herrán','Idígoras','Jáuregui',
    'Larrañaga','Mendizábal','Nogueira','Oyarzun','Peñalosa','Quiroga','Regalado','Salcedo','Tejedor','Ugarte',
    'Valdivieso','Ybarra','Zubieta','Alcántara','Bengoechea','Cifuentes','Domínguez','Errazuriz','Ferrán','Goicoechea',
    'Huidobro','Iriarte','Jaramillo','Krahe','Leguizamón','Mestre','Navascués','Olivares','Pizarro','Quintanilla',
    'Robledo','Sanchidrián','Trujillo','Urrutia','Vallejo','Wenceslao','Ybarrola','Zaldívar','Aramburu','Berrocal',
    'Cabezas','Duarte','Echevarría','Figueroa','Gorostiza','Hinojosa','Izaguirre','Jimeno','Lasarte','Montalbán'];

  var CO_A = ['Altamar','Bitácora','Cierzo','Duero','Ébano','Ferrol','Guadiana','Hispalis','Íbera','Jábega',
    'Levante','Meseta','Nervión','Ónice','Pampa','Quetzal','Ribera','Sierra','Tajo','Ultramar'];
  var CO_B = ['Group','Partners','Soluciones','Holding','Servicios','Ventures','Labs','Colectivo','Works','Asociados',
    'Systems','Advisors','Logística','Studio','Clínica','Ingeniería','Capital','Agro','Inmobiliaria','Care'];

  var SUBS = {
    tecnologia:   ['Plataformas IA','Ciberseguridad','Ingeniería de Datos','Migración Cloud','Apps Móviles','Integración ERP'],
    comercio:     ['Exportación Retail','Aduanas','Encadenamientos Productivos','Trade Finance','Certificación de Origen','Ferias Internacionales'],
    consultoria:  ['Estrategia','Transformación Digital','Expansión de Mercado','Operaciones','Cumplimiento','Innovación'],
    servicios:    ['Contabilidad','Consultoría RR. HH.','Traducción','Notaría','Propiedad Industrial','Fondos y Subvenciones'],
    agro:         ['Exportación de Fruta','Trazabilidad','Riego de Precisión','Café Especial','Cadena de Frío','Certificación Orgánica'],
    construccion: ['Obra Civil','Rehabilitación','Instalaciones','Climatización','Interiorismo','Prefabricados'],
    finanzas:     ['Fiscalidad Internacional','Capital Riesgo','Remesas','Nómina','Auditoría','Financiación Circulante'],
    energia:      ['Fotovoltaica','Eólica','Eficiencia Energética','Almacenamiento','Hidrógeno Verde','Autoconsumo'],
    logistica:    ['Última Milla','Transitario','Almacenaje','Cadena de Frío','Agente de Aduanas','Multimodal'],
    salud:        ['Telemedicina','Facturación Médica','Dispositivos','Farmacéutica','Fisioterapia','Salud Digital'],
    educacion:    ['Formación Corporativa','Idiomas','Certificación Profesional','EdTech','Posgrado','Bootcamps'],
    marketing:    ['Paid Social','SEO','Diseño de Marca','Producción de Vídeo','Gestión de Comunidad','Automatización'],
    manufactura:  ['Metalmecánica','Envase y Embalaje','Textil','Electrónica','Plásticos','Artes Gráficas'],
    legal:        ['Derecho Mercantil','Extranjería','Contratos Internacionales','Propiedad Intelectual','Laboral','Arbitraje'],
    turismo:      ['Hotel Boutique','Agencia de Viajes','Turismo MICE','Operador Turístico','Alquiler Vacacional','Restauración']
  };

  var COUNTRY_BY_REGION = {
    espana: ['España'],
    mexico: ['México'],
    andina: ['Colombia', 'Perú', 'Ecuador'],
    usa:    ['Estados Unidos'],
    consur: ['Argentina', 'Chile', 'Uruguay'],
    caribe: ['República Dominicana', 'Costa Rica', 'Panamá']
  };

  // ── Construcción del padrón ───────────────────────────────────────────
  function buildMembers() {
    var r = rng(20260901);
    var out = [];
    // Cubos de región y nivel, consumidos hasta el final para que los totales
    // coincidan exactamente con el panel.
    var regionPool = [], tierPool = [];
    REGIONS.forEach(function (g) { for (var i = 0; i < g.n; i++) regionPool.push(g.id); });
    TIERS.forEach(function (t) { for (var i = 0; i < t.n; i++) tierPool.push(t.id); });
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    shuffle(regionPool); shuffle(tierPool);

    var total = regionPool.length;
    for (var i = 0; i < total; i++) {
      var first = GIVEN[Math.floor(r() * GIVEN.length)];
      var last = SURNAME[Math.floor(r() * SURNAME.length)];
      var sec = SECTORS[Math.floor(r() * SECTORS.length)];
      var subs = SUBS[sec.id];
      var tier = tierPool[i];
      var hasCo = tier !== 'student' && r() > 0.16;
      var reg = regionPool[i];
      var countries = COUNTRY_BY_REGION[reg];
      out.push({
        id: 30000 + i,
        name: first + ' ' + last,
        email: (first + '.' + last).toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z.]/g, '') +
          '@' + (hasCo ? 'empresa-muestra.test' : 'miembro-muestra.test'),
        company: hasCo ? (CO_A[Math.floor(r() * CO_A.length)] + ' ' + CO_B[Math.floor(r() * CO_B.length)]) : '',
        sector: sec.id,
        sub: subs[Math.floor(r() * subs.length)],
        region: reg,
        tier: tier,
        years: tier === 'student' ? 1 + Math.floor(r() * 3) : 2 + Math.floor(r() * 29),
        trust: 58 + Math.floor(r() * 41),
        country: countries[Math.floor(r() * countries.length)]
      });
    }
    return out;
  }

  var MEMBERS = buildMembers();

  // ── Contenido narrativo fijo ──────────────────────────────────────────
  var PROJECTS = [
    { id: 'p1', irs: 89, role: 'proposer', status: 'executing', owner: 'Alejandra Quiroga', sector: 'tecnologia', viab: 81, team: 11, budget: '240 000 €',
      es: 'HispanoVerify: motor de deep research y lista blanca de empresas hispanas confiables',
      en: 'HispanoVerify: Deep-Research Engine and Whitelist of Trusted Hispanic Companies' },
    { id: 'p2', irs: 85, role: 'member', status: 'executing', owner: 'Rodrigo Salcedo', sector: 'agro',  viab: 74, team: 14, budget: '410 000 €',
      es: 'AgroLink IA: red de exportación asistida por IA para productores latinoamericanos',
      en: 'AgroLink AI: AI-Assisted Export Network for Latin American Producers' },
    { id: 'p3', irs: 83, role: 'member', status: 'executing', owner: 'Camila Jaramillo', sector: 'comercio', viab: 72, team: 9, budget: '320 000 €',
      es: 'Corredor Ibérico-Andino: encadenamiento productivo para exportar a retail europeo',
      en: 'Iberian-Andean Corridor: Supply Linkages for Exporting into European Retail' },
    { id: 'p4', irs: 78, role: 'proposer', status: 'recruiting', owner: 'Íñigo Mendizábal', sector: 'energia', viab: 69, team: 7, budget: '185 000 €',
      es: 'Autoconsumo Compartido: fotovoltaica para polígonos industriales de pymes hispanas',
      en: 'Shared Self-Consumption: Solar for Industrial Parks of Hispanic SMEs' },
    { id: 'p5', irs: 74, role: 'member', status: 'recruiting', owner: 'Lucía Bustamante', sector: 'logistica', viab: 67, team: 6, budget: '150 000 €',
      es: 'Hub de consolidación de carga Valencia-Veracruz para pymes exportadoras',
      en: 'Valencia-Veracruz Freight Consolidation Hub for Exporting SMEs' },
    { id: 'p6', irs: 71, role: 'open', status: 'recruiting', owner: 'Emiliano Ugarte', sector: 'educacion', viab: 65, team: 5, budget: '95 000 €',
      es: 'Academia Hispanotec: certificación en IA aplicada para equipos de pymes',
      en: 'Hispanotec Academy: Applied-AI Certification for SME Teams' },
    { id: 'p7', irs: 92, role: 'open', status: 'executing', owner: 'Marta Peñalosa', sector: 'finanzas', viab: 84, team: 12, budget: '300 000 €',
      es: 'Pasarela de remesas B2B con liquidación en el día entre España y LatAm',
      en: 'B2B Remittance Rail with Same-Day Settlement between Spain and Latin America' },
    { id: 'p8', irs: 66, role: 'open', status: 'closed', owner: 'Santiago Vallejo', sector: 'construccion', viab: 62, team: 8, budget: '520 000 €',
      es: 'Rehabilitación energética de naves industriales, piloto en Zaragoza',
      en: 'Energy Retrofit of Industrial Warehouses, Zaragoza Pilot' }
  ];

  var RFQS = [
    { id: 'r1', by: 'Ribera Agro', sector: 'agro', budget: '40 000 € - 60 000 €', bids: 8, days: 6,
      es: 'Cadena de frío y trazabilidad para exportar fruta de hueso a Alemania y Países Bajos',
      en: 'Cold chain and traceability to export stone fruit to Germany and the Netherlands' },
    { id: 'r2', by: 'Nervión Systems', sector: 'tecnologia', budget: '70 000 € - 110 000 €', bids: 5, days: 12,
      es: 'Integración ERP y migración de datos para una red de 40 sucursales en México',
      en: 'ERP integration and data migration for a 40-branch network in Mexico' },
    { id: 'r3', by: 'Guadiana Partners', sector: 'legal', budget: '18 000 € - 26 000 €', bids: 11, days: 3,
      es: 'Contratos internacionales y cumplimiento aduanero para entrada en el mercado colombiano',
      en: 'International contracts and customs compliance for entry into the Colombian market' },
    { id: 'r4', by: 'Quetzal Capital', sector: 'marketing', budget: '12 000 € - 18 000 €', bids: 9, days: 9,
      es: 'Campaña de pauta social para captar pymes exportadoras en México y Colombia',
      en: 'Paid social campaign to reach exporting SMEs in Mexico and Colombia' }
  ];

  var COMPANIES = [
    { name: 'Nervión Systems S.L.', sector: 'tecnologia', region: 'espana', staff: 88, verified: true },
    { name: 'Ribera Agro S.A. de C.V.', sector: 'agro', region: 'mexico', staff: 142, verified: true },
    { name: 'Guadiana Partners', sector: 'legal', region: 'espana', staff: 21, verified: true },
    { name: 'Quetzal Capital', sector: 'finanzas', region: 'usa', staff: 34, verified: true },
    { name: 'Ultramar Logística', sector: 'logistica', region: 'andina', staff: 120, verified: false },
    { name: 'Meseta Ingeniería', sector: 'construccion', region: 'consur', staff: 57, verified: true }
  ];

  var CONVOS = [
    { who: 'Alejandra Quiroga', co: 'Nervión Systems', when: '10:24', group: false, unread: 2,
      es: 'El acuerdo de verificación está listo. ¿Puede tu equipo revisar la cláusula de fuentes públicas?',
      en: 'The verification agreement is ready — can your team review the public-sources clause?' },
    { who: 'Equipo AgroLink IA', co: '14 miembros', when: 'Ayer', group: true, unread: 5,
      es: 'La certificación de origen del lote 3 está aprobada. Faltan dos transitarios en Veracruz.',
      en: 'Certificate of origin for batch 3 is cleared. We still need two freight forwarders in Veracruz.' },
    { who: 'Rodrigo Salcedo', co: 'Ribera Agro', when: 'Lun', group: false, unread: 0,
      es: 'Hoy publicamos la RFQ de cadena de frío. Tu lista corta con corrección Gini fue exacta.',
      en: 'We post the cold-chain RFQ today. Your Gini-corrected shortlist was spot on.' },
    { who: 'Anuncios de la Cámara', co: '1.042 miembros', when: '12 ago', group: true, unread: 0,
      es: 'Cumbre Hispanotec Madrid-Ciudad de México: la inscripción abre el viernes para miembros fundadores.',
      en: 'Hispanotec Madrid-Mexico City Summit — registration opens Friday for founding members.' }
  ];

  var INVITES = [
    { proj: 'p1', by: 'Alejandra Quiroga', score: 82, state: 'accepted',
      roleEs: 'CEO / Cofundador (Plataforma y Estrategia)', roleEn: 'CEO / Co-Founder (Platform & Strategy)' },
    { proj: 'p3', by: 'Camila Jaramillo', score: 76, state: 'pending',
      roleEs: 'Líder de Alianzas Comerciales', roleEn: 'Trade Partnerships Lead' },
    { proj: 'p7', by: 'Marta Peñalosa', score: 69, state: 'pending',
      roleEs: 'Director de Cumplimiento (Remesas)', roleEn: 'Compliance Director (Remittances)' }
  ];

  var SAVED = [
    { matches: 16, last: '18/8/2026',
      es: 'Transitarios en España o México que gestionen aduanas y cadena de frío para fruta fresca',
      en: 'Freight forwarders in Spain or Mexico handling customs and cold chain for fresh produce' },
    { matches: 11, last: '11/8/2026',
      es: 'Despachos de derecho mercantil con experiencia en entrada al mercado colombiano',
      en: 'Commercial law firms with experience entering the Colombian market' },
    { matches: 23, last: '29/7/2026',
      es: 'Ingenierías de fotovoltaica con proyectos de autoconsumo en polígonos industriales',
      en: 'Solar engineering firms with self-consumption projects in industrial parks' }
  ];

  window.HISPA_DEMO = {
    SECTORS: SECTORS, REGIONS: REGIONS, TIERS: TIERS, MEMBERS: MEMBERS,
    PROJECTS: PROJECTS, RFQS: RFQS, COMPANIES: COMPANIES, CONVOS: CONVOS,
    INVITES: INVITES, SAVED: SAVED,
    STATS: {
      members: MEMBERS.length,
      projects: 31,
      rfqs: 22,
      hci: 76.2,
      deals: 168,
      transacted: { es: '9,8 M €', en: '€9.8M' },
      matches: 3412
    }
  };
})();
