'use strict';
/**
 * Catalogue for the cv-105 (Hispanotec) demo seed.
 *
 * EVERYTHING HERE IS FICTIONAL. No real person, company or brand. It exists
 * so the matchmaking demo has a directory worth searching.
 *
 * The one rule that makes the demo work: a project role's `required_skills`
 * are drawn from the SAME per-sector `skills` pool the member bios are built
 * from. lib/scoring.js matches a skill by the first 8 characters of it
 * appearing in bio + sub_specialty + company_name, so a skill that no bio
 * ever contains can never match anyone.
 */

const COUNTRIES = [
  { name: 'Spain', weight: 30, suffixes: ['S.L.', 'S.A.'], cities: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Málaga', 'Bilbao', 'Zaragoza', 'Murcia', 'Almería', 'Córdoba'] },
  { name: 'Colombia', weight: 25, suffixes: ['S.A.S.'], cities: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Manizales', 'Villavicencio'] },
  { name: 'Mexico', weight: 25, suffixes: ['S.A. de C.V.', 'S. de R.L. de C.V.'], cities: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Querétaro', 'Puebla', 'Mérida', 'León', 'Culiacán', 'Veracruz'] },
  { name: 'United States', weight: 20, suffixes: ['LLC', 'Inc.'], cities: ['Miami', 'Orlando', 'Tampa', 'Houston', 'San Antonio', 'Dallas', 'Los Ángeles', 'Nueva York'] },
];

const FIRST_M = ['Alejandro', 'Andrés', 'Antonio', 'Carlos', 'Daniel', 'David', 'Diego', 'Eduardo', 'Emilio', 'Enrique', 'Esteban', 'Felipe', 'Fernando', 'Francisco', 'Gabriel', 'Gonzalo', 'Guillermo', 'Hernán', 'Ignacio', 'Javier', 'Jorge', 'José', 'Juan', 'Julián', 'Luis', 'Manuel', 'Marcos', 'Mario', 'Martín', 'Mateo', 'Miguel', 'Nicolás', 'Óscar', 'Pablo', 'Pedro', 'Rafael', 'Ramón', 'Ricardo', 'Roberto', 'Rodrigo', 'Santiago', 'Sergio', 'Tomás', 'Víctor'];
const FIRST_F = ['Adriana', 'Alejandra', 'Ana', 'Andrea', 'Beatriz', 'Camila', 'Carmen', 'Carolina', 'Catalina', 'Claudia', 'Cristina', 'Daniela', 'Diana', 'Elena', 'Fernanda', 'Gabriela', 'Isabel', 'Juliana', 'Laura', 'Lucía', 'Luisa', 'Marcela', 'María', 'Mariana', 'Marta', 'Mónica', 'Natalia', 'Paola', 'Patricia', 'Paula', 'Pilar', 'Raquel', 'Rocío', 'Sandra', 'Sara', 'Silvia', 'Sofía', 'Teresa', 'Valentina', 'Verónica', 'Ximena'];
const LAST = ['Acosta', 'Aguilar', 'Álvarez', 'Arango', 'Bermúdez', 'Blanco', 'Cabrera', 'Calderón', 'Campos', 'Cardona', 'Castaño', 'Castillo', 'Cortés', 'Delgado', 'Domínguez', 'Duarte', 'Escobar', 'Espinosa', 'Estrada', 'Fernández', 'Figueroa', 'Fuentes', 'Galindo', 'García', 'Garrido', 'Gil', 'Giraldo', 'Gómez', 'González', 'Guerrero', 'Gutiérrez', 'Herrera', 'Ibáñez', 'Iglesias', 'Jiménez', 'Lara', 'León', 'Londoño', 'López', 'Lozano', 'Marín', 'Márquez', 'Martínez', 'Medina', 'Mejía', 'Mendoza', 'Molina', 'Montoya', 'Morales', 'Moreno', 'Muñoz', 'Navarro', 'Núñez', 'Ochoa', 'Ortega', 'Ortiz', 'Osorio', 'Pardo', 'Paredes', 'Peña', 'Pérez', 'Quintero', 'Ramírez', 'Ramos', 'Restrepo', 'Ríos', 'Rivera', 'Rojas', 'Romero', 'Rubio', 'Ruiz', 'Salazar', 'Sánchez', 'Santos', 'Serrano', 'Soto', 'Suárez', 'Torres', 'Valencia', 'Vargas', 'Vega', 'Velásquez', 'Vidal', 'Zapata'];

// weight = how many of the 500 members belong to the sector.
const SECTORS = [
  {
    slug: 'agricultura', label: 'Agricultura', weight: 70,
    roots: ['Agro', 'Campo', 'Tierra', 'Cosecha', 'Verde', 'Semilla', 'Finca', 'Valle'],
    skills: ['riego tecnificado', 'agricultura de precisión', 'cultivo de aguacate Hass', 'café especial', 'certificación GlobalG.A.P.', 'manejo poscosecha', 'agricultura orgánica', 'fertilización y nutrición de suelos', 'invernaderos', 'olivar y viñedo', 'cooperativas agrícolas', 'drones agrícolas'],
    kinds: [
      { type: 'productora y exportadora de aguacate Hass', products: ['aguacate Hass calibre exportación', 'aguacate orgánico', 'pulpa de aguacate congelada'], services: ['manejo poscosecha', 'empaque certificado GlobalG.A.P.'], certs: ['GlobalG.A.P.', 'Rainforest Alliance'] },
      { type: 'finca de café especial', products: ['café especial de altura', 'café verde lavado', 'microlotes de café honey'], services: ['catación y perfiles de taza', 'trazabilidad de finca'], certs: ['Fair Trade', 'Orgánico USDA'] },
      { type: 'empresa de riego tecnificado', products: ['sistemas de riego por goteo', 'controladores de riego IoT', 'sensores de humedad de suelo'], services: ['diseño de riego tecnificado', 'agricultura de precisión'], certs: ['ISO 9001'] },
      { type: 'productora de olivar y viñedo', products: ['aceite de oliva virgen extra', 'uva de vinificación', 'aceituna de mesa'], services: ['gestión de olivar y viñedo', 'agricultura orgánica'], certs: ['DOP', 'Agricultura Ecológica UE'] },
      { type: 'empresa de insumos agrícolas', products: ['bioestimulantes', 'fertilizantes orgánicos', 'semillas certificadas'], services: ['fertilización y nutrición de suelos', 'asesoría agronómica'], certs: ['ISO 14001'] },
      { type: 'empresa de invernaderos', products: ['tomate de invernadero', 'pimiento', 'berries'], services: ['construcción de invernaderos', 'control climático'], certs: ['GlobalG.A.P.'] },
    ],
    titles: ['Ingeniero agrónomo', 'Consultor en agricultura de precisión', 'Especialista en riego tecnificado', 'Técnico en manejo poscosecha', 'Asesora de certificación GlobalG.A.P.', 'Operador de drones agrícolas', 'Gerente de cooperativa agrícola'],
  },
  {
    slug: 'construccion', label: 'Construcción', weight: 60,
    roots: ['Construye', 'Obra', 'Estructura', 'Cimiento', 'Habitat', 'Edifica', 'Arco', 'Pilar'],
    skills: ['construcción modular', 'vivienda social', 'estructuras de acero', 'concreto prefabricado', 'gestión de obra', 'BIM y modelado 3D', 'certificación LEED', 'naves industriales', 'urbanización e infraestructura', 'licencias y permisos de construcción', 'eficiencia energética en edificios', 'materiales de construcción'],
    kinds: [
      { type: 'constructora de vivienda', products: ['vivienda social llave en mano', 'vivienda modular prefabricada'], services: ['gestión de obra', 'construcción modular'], certs: ['ISO 9001', 'LEED'] },
      { type: 'fabricante de concreto prefabricado', products: ['paneles de concreto prefabricado', 'losas alveolares', 'bloques estructurales'], services: ['cálculo estructural', 'montaje en obra'], certs: ['ISO 9001'] },
      { type: 'empresa de estructuras de acero', products: ['estructuras de acero para naves industriales', 'cubiertas metálicas'], services: ['diseño y montaje de naves industriales'], certs: ['AWS D1.1'] },
      { type: 'distribuidora de materiales de construcción', products: ['cemento', 'acero de refuerzo', 'aislantes térmicos', 'materiales de construcción sostenibles'], services: ['logística a obra', 'crédito comercial'], certs: [] },
      { type: 'estudio de arquitectura e ingeniería', products: ['proyectos ejecutivos', 'modelos BIM'], services: ['BIM y modelado 3D', 'certificación LEED', 'licencias y permisos de construcción'], certs: ['LEED AP'] },
    ],
    titles: ['Arquitecta', 'Ingeniero civil', 'Director de obra', 'Especialista BIM y modelado 3D', 'Consultora en certificación LEED', 'Gestor de licencias y permisos de construcción', 'Ingeniero de estructuras de acero'],
  },
  {
    slug: 'tecnologia', label: 'Tecnología', weight: 60,
    roots: ['Data', 'Nube', 'Código', 'Nexo', 'Byte', 'Pixel', 'Lógica', 'Sinapsis'],
    skills: ['desarrollo de software a medida', 'inteligencia artificial', 'aplicaciones móviles', 'plataformas SaaS', 'IoT y sensores', 'blockchain y trazabilidad', 'análisis de datos', 'integración de APIs', 'computación en la nube', 'ERP y CRM', 'visión por computador', 'desarrollo web'],
    kinds: [
      { type: 'software house', products: ['plataformas SaaS', 'aplicaciones móviles', 'portales web'], services: ['desarrollo de software a medida', 'integración de APIs'], certs: ['ISO 27001'] },
      { type: 'consultora de inteligencia artificial', products: ['modelos de inteligencia artificial', 'chatbots y agentes de voz'], services: ['análisis de datos', 'visión por computador'], certs: [] },
      { type: 'empresa de IoT', products: ['sensores IoT', 'gateways LoRaWAN', 'tableros de monitoreo'], services: ['IoT y sensores para industria y agro'], certs: ['CE', 'FCC'] },
      { type: 'integradora de nube y ERP', products: ['licencias ERP y CRM', 'migración a la nube'], services: ['computación en la nube', 'ERP y CRM'], certs: ['AWS Partner', 'Microsoft Partner'] },
      { type: 'startup de blockchain', products: ['plataforma de blockchain y trazabilidad', 'contratos inteligentes'], services: ['blockchain y trazabilidad de cadenas de suministro'], certs: [] },
    ],
    titles: ['Desarrollador full stack', 'Científica de datos', 'Ingeniero de inteligencia artificial', 'Arquitecta de computación en la nube', 'Desarrollador de aplicaciones móviles', 'Especialista en IoT y sensores', 'Consultor de ERP y CRM', 'Product manager de plataformas SaaS'],
  },
  {
    slug: 'logistica', label: 'Logística y transporte marítimo', weight: 55,
    roots: ['Trans', 'Carga', 'Puerto', 'Ruta', 'Flete', 'Mar', 'Ancla', 'Conecta'],
    skills: ['transporte marítimo', 'agenciamiento de carga', 'cadena de frío', 'logística refrigerada', 'contenedores reefer', 'agente de aduanas', 'almacenamiento y distribución', 'última milla', 'operación portuaria', 'transporte terrestre de carga', 'optimización de rutas', 'carga aérea'],
    kinds: [
      { type: 'naviera y agente de carga', products: ['fletes marítimos FCL y LCL', 'contenedores reefer'], services: ['transporte marítimo', 'agenciamiento de carga'], certs: ['OEA', 'BASC'] },
      { type: 'operador de cadena de frío', products: ['almacenes refrigerados', 'transporte refrigerado'], services: ['cadena de frío', 'logística refrigerada'], certs: ['HACCP', 'BRCGS Storage'] },
      { type: 'agencia de aduanas', products: ['despacho aduanero'], services: ['agente de aduanas', 'clasificación arancelaria'], certs: ['OEA', 'C-TPAT'] },
      { type: 'operador logístico 3PL', products: ['centros de distribución', 'fulfillment e-commerce'], services: ['almacenamiento y distribución', 'última milla'], certs: ['ISO 9001'] },
      { type: 'empresa de transporte terrestre', products: ['flota de tractocamiones', 'transporte de carga consolidada'], services: ['transporte terrestre de carga', 'optimización de rutas'], certs: ['ISO 39001'] },
      { type: 'operador portuario', products: ['terminal de contenedores', 'patios de contenedores'], services: ['operación portuaria', 'estiba y desestiba'], certs: ['PBIP'] },
    ],
    titles: ['Coordinador de transporte marítimo', 'Especialista en cadena de frío', 'Agente de aduanas', 'Gerente de almacenamiento y distribución', 'Analista de optimización de rutas', 'Jefa de operación portuaria', 'Coordinadora de carga aérea'],
  },
  {
    slug: 'comercio_exterior', label: 'Comercio exterior', weight: 35,
    roots: ['Global', 'Inter', 'Puente', 'Exporta', 'Mundo', 'Atlántico'],
    skills: ['exportación a Estados Unidos', 'exportación a la Unión Europea', 'certificación FDA', 'normativa aduanera', 'inteligencia de mercados', 'misiones comerciales', 'incoterms', 'tratados de libre comercio', 'importación y distribución', 'registro sanitario'],
    kinds: [
      { type: 'trading de exportación', products: ['exportación de alimentos', 'importación y distribución'], services: ['exportación a Estados Unidos', 'exportación a la Unión Europea'], certs: ['OEA'] },
      { type: 'consultora de comercio exterior', products: ['estudios de inteligencia de mercados'], services: ['certificación FDA', 'registro sanitario', 'tratados de libre comercio'], certs: [] },
      { type: 'broker de importación', products: ['distribución mayorista'], services: ['importación y distribución', 'incoterms y contratos internacionales'], certs: ['C-TPAT'] },
    ],
    titles: ['Consultora de comercio exterior', 'Especialista en certificación FDA', 'Analista de inteligencia de mercados', 'Gerente de exportación a la Unión Europea', 'Asesor en tratados de libre comercio'],
  },
  {
    slug: 'alimentos_bebidas', label: 'Alimentos y bebidas', weight: 35,
    roots: ['Sabor', 'Nutri', 'Delicias', 'Cocina', 'Fresco', 'Raíces'],
    skills: ['procesamiento de alimentos', 'inocuidad alimentaria HACCP', 'alimentos congelados', 'empaque y etiquetado', 'productos hispanos para retail', 'bebidas y jugos', 'alimentos listos para consumir', 'desarrollo de nuevos productos', 'certificación BRCGS', 'maquila de alimentos'],
    kinds: [
      { type: 'procesadora de alimentos', products: ['alimentos congelados', 'salsas y aderezos', 'alimentos listos para consumir'], services: ['maquila de alimentos', 'desarrollo de nuevos productos'], certs: ['HACCP', 'BRCGS', 'FDA'] },
      { type: 'fabricante de bebidas', products: ['jugos naturales', 'bebidas de café', 'agua de coco'], services: ['bebidas y jugos a marca propia'], certs: ['FSSC 22000'] },
      { type: 'distribuidora de productos hispanos', products: ['productos hispanos para retail', 'arepas', 'tortillas'], services: ['distribución a supermercados'], certs: ['FDA'] },
      { type: 'empresa de empaque alimentario', products: ['empaque y etiquetado', 'envases compostables'], services: ['diseño de empaque'], certs: ['ISO 22000'] },
    ],
    titles: ['Ingeniera de alimentos', 'Especialista en inocuidad alimentaria HACCP', 'Jefe de desarrollo de nuevos productos', 'Gerente comercial de productos hispanos para retail', 'Auditora de certificación BRCGS'],
  },
  {
    slug: 'manufactura', label: 'Manufactura', weight: 30,
    roots: ['Indus', 'Metal', 'Forja', 'Precisión', 'Taller', 'Mecano'],
    skills: ['manufactura esbelta', 'metalmecánica', 'inyección de plásticos', 'automatización industrial', 'nearshoring', 'control de calidad ISO 9001', 'maquinado CNC', 'ensamble electrónico', 'mantenimiento industrial', 'paneles solares y estructuras'],
    kinds: [
      { type: 'taller metalmecánico', products: ['piezas de maquinado CNC', 'estructuras metálicas'], services: ['metalmecánica', 'mantenimiento industrial'], certs: ['ISO 9001'] },
      { type: 'fabricante de plásticos', products: ['piezas por inyección de plásticos', 'envases industriales'], services: ['diseño de moldes'], certs: ['ISO 9001', 'IATF 16949'] },
      { type: 'integrador de automatización', products: ['tableros de control', 'celdas robotizadas'], services: ['automatización industrial', 'manufactura esbelta'], certs: ['ISO 9001'] },
      { type: 'planta de nearshoring', products: ['ensamble electrónico', 'componentes automotrices'], services: ['nearshoring y maquila'], certs: ['IATF 16949', 'IMMEX'] },
    ],
    titles: ['Ingeniero de manufactura esbelta', 'Especialista en automatización industrial', 'Gerente de calidad ISO 9001', 'Consultor de nearshoring', 'Jefa de mantenimiento industrial'],
  },
  {
    slug: 'energia', label: 'Energía', weight: 30,
    roots: ['Sol', 'Voltio', 'Energía', 'Watt', 'Luz', 'Viento'],
    skills: ['energía solar fotovoltaica', 'bombeo solar para riego', 'almacenamiento en baterías', 'eficiencia energética', 'energía eólica', 'microrredes', 'autoconsumo industrial', 'hidrógeno verde', 'certificados de energía renovable', 'instalación solar'],
    kinds: [
      { type: 'instaladora solar', products: ['sistemas de energía solar fotovoltaica', 'bombeo solar para riego'], services: ['instalación solar', 'autoconsumo industrial'], certs: ['NABCEP', 'RETIE'] },
      { type: 'desarrolladora de proyectos renovables', products: ['parques solares', 'energía eólica'], services: ['desarrollo y financiación de proyectos renovables'], certs: ['ISO 50001'] },
      { type: 'empresa de almacenamiento energético', products: ['almacenamiento en baterías', 'microrredes'], services: ['diseño de microrredes'], certs: ['UL 9540'] },
      { type: 'consultora de eficiencia energética', products: ['auditorías energéticas'], services: ['eficiencia energética', 'certificados de energía renovable'], certs: ['ISO 50001'] },
    ],
    titles: ['Ingeniero de energía solar fotovoltaica', 'Especialista en almacenamiento en baterías', 'Auditora de eficiencia energética', 'Instalador solar certificado', 'Consultor en hidrógeno verde'],
  },
  {
    slug: 'finanzas', label: 'Finanzas', weight: 25,
    roots: ['Capital', 'Inversión', 'Fondo', 'Crédito', 'Activa', 'Patrimonio'],
    skills: ['financiación de proyectos', 'capital de riesgo', 'crédito agrícola', 'factoring y financiación de exportaciones', 'fondos de infraestructura', 'bonos verdes', 'microfinanzas', 'modelado financiero', 'banca de desarrollo', 'seguros agrícolas'],
    kinds: [
      { type: 'fondo de inversión', products: ['capital de riesgo', 'fondos de infraestructura'], services: ['financiación de proyectos', 'modelado financiero'], certs: [] },
      { type: 'entidad de crédito', products: ['crédito agrícola', 'microfinanzas'], services: ['factoring y financiación de exportaciones'], certs: [] },
      { type: 'asesoría financiera', products: ['estructuración de bonos verdes'], services: ['banca de desarrollo', 'modelado financiero'], certs: ['CFA'] },
    ],
    titles: ['Analista de financiación de proyectos', 'Gestora de capital de riesgo', 'Especialista en crédito agrícola', 'Asesor en bonos verdes', 'Modeladora financiera'],
  },
  {
    slug: 'consultoria', label: 'Consultoría', weight: 20,
    roots: ['Estrategia', 'Visión', 'Impulso', 'Método', 'Norte'],
    skills: ['gestión de proyectos PMP', 'estrategia empresarial', 'transformación digital', 'formulación de proyectos', 'fondos europeos', 'gestión del cambio', 'planes de negocio', 'sostenibilidad ESG'],
    kinds: [
      { type: 'consultora estratégica', products: ['planes de negocio', 'estudios de viabilidad'], services: ['estrategia empresarial', 'transformación digital'], certs: ['PMP'] },
      { type: 'consultora de fondos y subvenciones', products: ['formulación de proyectos'], services: ['fondos europeos', 'sostenibilidad ESG'], certs: [] },
    ],
    titles: ['Gerente de proyectos PMP', 'Consultora en transformación digital', 'Especialista en fondos europeos', 'Consultor en sostenibilidad ESG'],
  },
  {
    slug: 'marketing_digital', label: 'Marketing digital', weight: 20,
    roots: ['Marca', 'Viral', 'Impacto', 'Clic', 'Eco', 'Voz'],
    skills: ['marketing digital', 'marketing para mercado hispano', 'branding y diseño', 'e-commerce', 'redes sociales', 'SEO y SEM', 'producción audiovisual', 'marketing de exportación'],
    kinds: [
      { type: 'agencia de marketing digital', products: ['campañas en redes sociales', 'tiendas e-commerce'], services: ['marketing digital', 'SEO y SEM'], certs: ['Google Partner'] },
      { type: 'estudio de branding', products: ['identidad de marca', 'empaque'], services: ['branding y diseño', 'marketing para mercado hispano'], certs: [] },
    ],
    titles: ['Especialista en marketing digital', 'Directora de branding y diseño', 'Estratega de marketing para mercado hispano', 'Productor audiovisual'],
  },
  {
    slug: 'legal', label: 'Legal', weight: 15,
    roots: ['Lex', 'Jurídica', 'Iuris', 'Themis'],
    skills: ['derecho mercantil', 'derecho inmobiliario y urbanístico', 'propiedad intelectual', 'contratos internacionales', 'derecho migratorio', 'regulación sanitaria', 'protección de datos'],
    kinds: [
      { type: 'despacho de abogados', products: ['asesoría legal corporativa'], services: ['derecho mercantil', 'contratos internacionales'], certs: [] },
      { type: 'firma legal inmobiliaria', products: ['due diligence inmobiliaria'], services: ['derecho inmobiliario y urbanístico', 'licencias'], certs: [] },
    ],
    titles: ['Abogada de derecho mercantil', 'Abogado de contratos internacionales', 'Especialista en regulación sanitaria', 'Abogada de protección de datos'],
  },
  {
    slug: 'salud', label: 'Salud', weight: 15,
    roots: ['Salud', 'Vital', 'Clínica', 'Medi'],
    skills: ['telemedicina', 'salud rural', 'dispositivos médicos', 'historia clínica electrónica', 'atención primaria', 'salud digital'],
    kinds: [
      { type: 'red de clínicas', products: ['atención primaria', 'telemedicina'], services: ['salud rural'], certs: ['Acreditación sanitaria'] },
      { type: 'distribuidora de dispositivos médicos', products: ['dispositivos médicos', 'equipos de diagnóstico'], services: ['mantenimiento biomédico'], certs: ['ISO 13485'] },
    ],
    titles: ['Médica de familia y telemedicina', 'Especialista en salud digital', 'Enfermero de salud rural', 'Ingeniera biomédica'],
  },
  {
    slug: 'educacion', label: 'Educación', weight: 10,
    roots: ['Aprende', 'Saber', 'Academia', 'Mentor'],
    skills: ['formación técnica', 'e-learning', 'formación en energías renovables', 'capacitación empresarial', 'diseño instruccional'],
    kinds: [
      { type: 'centro de formación técnica', products: ['cursos de formación técnica', 'formación en energías renovables'], services: ['capacitación empresarial'], certs: [] },
      { type: 'plataforma de e-learning', products: ['cursos e-learning'], services: ['diseño instruccional'], certs: [] },
    ],
    titles: ['Diseñadora instruccional', 'Formador en energías renovables', 'Coordinadora de e-learning'],
  },
  {
    slug: 'hoteleria_turismo', label: 'Hotelería y turismo', weight: 10,
    roots: ['Viaje', 'Destino', 'Hospeda', 'Ruta'],
    skills: ['turismo rural', 'agroturismo', 'hotelería', 'turismo de negocios', 'gestión de eventos'],
    kinds: [
      { type: 'operador turístico', products: ['paquetes de agroturismo', 'turismo rural'], services: ['turismo de negocios', 'gestión de eventos'], certs: [] },
      { type: 'grupo hotelero', products: ['hotelería boutique'], services: ['gestión de eventos corporativos'], certs: [] },
    ],
    titles: ['Gerente de hotelería', 'Especialista en agroturismo', 'Organizadora de gestión de eventos'],
  },
  {
    slug: 'bienes_raices', label: 'Bienes raíces', weight: 5,
    roots: ['Inmo', 'Predio', 'Solar'],
    skills: ['desarrollo inmobiliario', 'parques industriales', 'gestión de suelo', 'arrendamiento industrial'],
    kinds: [
      { type: 'desarrolladora inmobiliaria', products: ['parques industriales', 'naves en arrendamiento industrial'], services: ['desarrollo inmobiliario', 'gestión de suelo'], certs: [] },
    ],
    titles: ['Desarrollador inmobiliario', 'Especialista en parques industriales'],
  },
  {
    slug: 'ciberseguridad', label: 'Ciberseguridad', weight: 5,
    roots: ['Escudo', 'Cifra', 'Guardián'],
    skills: ['ciberseguridad', 'pruebas de penetración', 'cumplimiento ISO 27001', 'seguridad en la nube'],
    kinds: [
      { type: 'empresa de ciberseguridad', products: ['centro de operaciones de seguridad', 'pruebas de penetración'], services: ['ciberseguridad', 'cumplimiento ISO 27001'], certs: ['ISO 27001'] },
    ],
    titles: ['Analista de ciberseguridad', 'Especialista en seguridad en la nube'],
  },
];

// ---------------------------------------------------------------------------
// The 10 proposed projects. `proposer` names the sector + country the
// proposing company owner is drawn from. Every required skill below appears
// verbatim in the matching sector's `skills` pool above.
// ---------------------------------------------------------------------------
const PROJECTS = [
  {
    title: 'Cadena de frío para exportar aguacate Hass de Colombia a España y EE. UU.',
    sector: 'agricultura', countries: ['Colombia', 'Spain', 'United States'], proposer: ['agricultura', 'Colombia'],
    budget: [350000, 480000, 650000], months: [8, 12, 16],
    summary: 'Red de centros de acopio con manejo poscosecha y cadena de frío continua que conecta a productores de aguacate Hass del Eje Cafetero con importadores en Valencia y Miami, con trazabilidad por lote y cumplimiento FDA y GlobalG.A.P.',
    problem: 'Los pequeños productores pierden entre el 20 y el 30 % de la fruta por falta de frío y de empaque certificado, y venden a intermediarios sin acceso directo al comprador final.',
    roles: [
      ['Líder agronómico y de certificación', 'agricultura', ['Colombia'], ['cultivo de aguacate Hass', 'certificación GlobalG.A.P.', 'manejo poscosecha']],
      ['Operador de cadena de frío', 'logistica', ['Colombia', 'Spain'], ['cadena de frío', 'contenedores reefer', 'logística refrigerada']],
      ['Agente naviero y de aduanas', 'logistica', ['Spain', 'United States'], ['transporte marítimo', 'agente de aduanas', 'agenciamiento de carga']],
      ['Especialista en exportación y FDA', 'comercio_exterior', ['United States', 'Colombia'], ['certificación FDA', 'exportación a Estados Unidos', 'exportación a la Unión Europea']],
      ['Plataforma de trazabilidad', 'tecnologia', ['Colombia', 'Mexico'], ['blockchain y trazabilidad', 'IoT y sensores', 'plataformas SaaS']],
    ],
  },
  {
    title: 'Vivienda social modular y solar en Jalisco',
    sector: 'construccion', countries: ['Mexico'], proposer: ['construccion', 'Mexico'],
    budget: [900000, 1200000, 1600000], months: [10, 14, 20],
    summary: 'Primer conjunto de 120 viviendas sociales de construcción modular con concreto prefabricado y energía solar en techo, financiado con crédito hipotecario social y bonos verdes.',
    problem: 'La construcción tradicional de vivienda social tarda más de 18 meses y deja a las familias con facturas eléctricas altas.',
    roles: [
      ['Constructora de vivienda modular', 'construccion', ['Mexico'], ['construcción modular', 'vivienda social', 'gestión de obra']],
      ['Proveedor de concreto prefabricado', 'construccion', ['Mexico', 'Spain'], ['concreto prefabricado', 'materiales de construcción', 'BIM y modelado 3D']],
      ['Integrador solar', 'energia', ['Mexico', 'United States'], ['energía solar fotovoltaica', 'instalación solar', 'almacenamiento en baterías']],
      ['Estructurador financiero', 'finanzas', ['Mexico', 'Spain'], ['financiación de proyectos', 'bonos verdes', 'banca de desarrollo']],
      ['Asesoría legal urbanística', 'legal', ['Mexico'], ['derecho inmobiliario y urbanístico', 'derecho mercantil']],
    ],
  },
  {
    title: 'Plataforma digital de logística portuaria Cartagena – Valencia – Miami',
    sector: 'logistica', countries: ['Colombia', 'Spain', 'United States'], proposer: ['logistica', 'Spain'],
    budget: [280000, 380000, 520000], months: [6, 9, 12],
    summary: 'Torre de control digital que une navieras, agentes de aduanas y transportistas terrestres en tres puertos, con reserva de contenedores, seguimiento en tiempo real y documentos aduaneros compartidos.',
    problem: 'Una carga entre estos puertos pasa por más de ocho actores que se coordinan por correo y WhatsApp; los retrasos y sobrecostos por demoras son la norma.',
    roles: [
      ['Arquitecto de plataforma', 'tecnologia', ['Spain', 'Colombia'], ['plataformas SaaS', 'integración de APIs', 'computación en la nube']],
      ['Socio naviero', 'logistica', ['Spain', 'Colombia'], ['transporte marítimo', 'operación portuaria', 'agenciamiento de carga']],
      ['Agencia de aduanas', 'logistica', ['United States', 'Colombia'], ['agente de aduanas', 'transporte terrestre de carga']],
      ['Consultor de comercio exterior', 'comercio_exterior', ['Spain', 'United States'], ['normativa aduanera', 'incoterms', 'tratados de libre comercio']],
      ['Seguridad de la plataforma', 'ciberseguridad', ['Spain', 'United States'], ['ciberseguridad', 'seguridad en la nube', 'cumplimiento ISO 27001']],
    ],
  },
  {
    title: 'Riego solar inteligente para olivar y viñedo en Andalucía',
    sector: 'energia', countries: ['Spain'], proposer: ['energia', 'Spain'],
    budget: [220000, 300000, 420000], months: [5, 8, 11],
    summary: 'Bombeo solar para riego con sensores de humedad y control remoto en 1.500 hectáreas de olivar y viñedo, reduciendo el consumo de agua y el gasto eléctrico de las cooperativas.',
    problem: 'El coste eléctrico del riego se ha duplicado y la sequía obliga a regar con precisión que las cooperativas no pueden medir hoy.',
    roles: [
      ['Instalador de bombeo solar', 'energia', ['Spain'], ['bombeo solar para riego', 'energía solar fotovoltaica', 'almacenamiento en baterías']],
      ['Ingeniero de riego tecnificado', 'agricultura', ['Spain', 'Mexico'], ['riego tecnificado', 'olivar y viñedo', 'agricultura de precisión']],
      ['Sensores y telemetría', 'tecnologia', ['Spain', 'Colombia'], ['IoT y sensores', 'análisis de datos']],
      ['Financiación agraria', 'finanzas', ['Spain'], ['crédito agrícola', 'financiación de proyectos']],
      ['Formulación de fondos europeos', 'consultoria', ['Spain'], ['fondos europeos', 'formulación de proyectos']],
    ],
  },
  {
    title: 'Trazabilidad blockchain para café especial colombiano',
    sector: 'tecnologia', countries: ['Colombia', 'United States', 'Spain'], proposer: ['tecnologia', 'Colombia'],
    budget: [150000, 210000, 290000], months: [4, 6, 9],
    summary: 'Cada saco de café especial lleva un código que muestra al tostador y al consumidor la finca, la altura, el perfil de taza y el precio pagado al productor.',
    problem: 'Los tostadores de especialidad en EE. UU. y Europa pagan más por café verificable, pero hoy la trazabilidad es un papel que nadie puede comprobar.',
    roles: [
      ['Desarrollador blockchain', 'tecnologia', ['Colombia', 'Mexico'], ['blockchain y trazabilidad', 'aplicaciones móviles', 'desarrollo web']],
      ['Red de fincas cafeteras', 'agricultura', ['Colombia'], ['café especial', 'cooperativas agrícolas', 'agricultura orgánica']],
      ['Exportador de café', 'comercio_exterior', ['Colombia', 'United States'], ['exportación a Estados Unidos', 'exportación a la Unión Europea', 'certificación FDA']],
      ['Marca y marketing', 'marketing_digital', ['United States', 'Spain'], ['marketing de exportación', 'branding y diseño', 'e-commerce']],
      ['Tostadora y empaque', 'alimentos_bebidas', ['United States', 'Spain'], ['empaque y etiquetado', 'bebidas y jugos']],
    ],
  },
  {
    title: 'Parque industrial de nearshoring en Monterrey',
    sector: 'manufactura', countries: ['Mexico', 'United States'], proposer: ['bienes_raices', 'Mexico'],
    budget: [2500000, 3400000, 4500000], months: [14, 20, 28],
    summary: 'Parque de 12 naves industriales con estructura de acero, energía solar y servicios logísticos compartidos para fabricantes que trasladan producción de Asia a México.',
    problem: 'La demanda de naves industriales en el norte de México supera la oferta y los fabricantes esperan más de un año por espacio.',
    roles: [
      ['Desarrollador inmobiliario industrial', 'bienes_raices', ['Mexico'], ['parques industriales', 'desarrollo inmobiliario', 'arrendamiento industrial']],
      ['Constructora de naves', 'construccion', ['Mexico', 'United States'], ['naves industriales', 'estructuras de acero', 'urbanización e infraestructura']],
      ['Consultor de nearshoring', 'manufactura', ['Mexico', 'United States'], ['nearshoring', 'automatización industrial', 'manufactura esbelta']],
      ['Operador logístico', 'logistica', ['Mexico', 'United States'], ['transporte terrestre de carga', 'almacenamiento y distribución', 'agente de aduanas']],
      ['Fondo de infraestructura', 'finanzas', ['United States', 'Mexico'], ['fondos de infraestructura', 'financiación de proyectos', 'capital de riesgo']],
    ],
  },
  {
    title: 'Marketplace B2B de materiales de construcción para contratistas hispanos en Florida y Texas',
    sector: 'construccion', countries: ['United States', 'Mexico', 'Spain'], proposer: ['construccion', 'United States'],
    budget: [180000, 260000, 350000], months: [5, 7, 10],
    summary: 'Tienda B2B en español donde contratistas hispanos comparan precios de materiales de construcción de distribuidores en EE. UU. y fabricantes en México y España, con crédito y entrega a obra.',
    problem: 'Más del 30 % de los contratistas en Florida y Texas son hispanos, pero compran por teléfono y sin comparar precios ni plazos.',
    roles: [
      ['Desarrollo del marketplace', 'tecnologia', ['United States', 'Mexico'], ['desarrollo web', 'plataformas SaaS', 'ERP y CRM']],
      ['Distribuidor de materiales', 'construccion', ['United States', 'Mexico'], ['materiales de construcción', 'concreto prefabricado']],
      ['Importación y aduanas', 'comercio_exterior', ['United States', 'Spain'], ['importación y distribución', 'normativa aduanera']],
      ['Marketing al contratista hispano', 'marketing_digital', ['United States'], ['marketing para mercado hispano', 'redes sociales', 'SEO y SEM']],
      ['Entrega a obra', 'logistica', ['United States'], ['última milla', 'optimización de rutas']],
    ],
  },
  {
    title: 'Telemedicina rural bilingüe para Colombia y México',
    sector: 'salud', countries: ['Colombia', 'Mexico'], proposer: ['salud', 'Colombia'],
    budget: [200000, 270000, 380000], months: [6, 9, 12],
    summary: 'Puntos de atención con telemedicina y dispositivos médicos conectados en veredas y municipios rurales, con médicos de familia en línea y historia clínica electrónica.',
    problem: 'Las zonas rurales tienen menos de un médico por cada mil habitantes y el paciente viaja horas para una consulta de atención primaria.',
    roles: [
      ['Dirección médica', 'salud', ['Colombia', 'Mexico'], ['telemedicina', 'atención primaria', 'salud rural']],
      ['Plataforma de salud digital', 'tecnologia', ['Colombia', 'Mexico'], ['aplicaciones móviles', 'computación en la nube', 'inteligencia artificial']],
      ['Proveedor de dispositivos médicos', 'salud', ['Mexico', 'United States'], ['dispositivos médicos', 'salud digital']],
      ['Cumplimiento y datos', 'legal', ['Colombia', 'Mexico'], ['regulación sanitaria', 'protección de datos']],
      ['Formación de promotores', 'educacion', ['Colombia'], ['formación técnica', 'e-learning']],
    ],
  },
  {
    title: 'Planta de alimentos hispanos listos para consumir en Texas',
    sector: 'alimentos_bebidas', countries: ['United States', 'Mexico', 'Colombia'], proposer: ['alimentos_bebidas', 'United States'],
    budget: [1100000, 1500000, 2000000], months: [10, 14, 18],
    summary: 'Planta en San Antonio que produce arepas, tamales y salsas congeladas para supermercados de EE. UU., con materia prima de productores de México y Colombia.',
    problem: 'Las cadenas de supermercados piden productos hispanos auténticos a escala, con certificación FDA y BRCGS, y pocos fabricantes cumplen.',
    roles: [
      ['Jefatura de planta', 'alimentos_bebidas', ['United States', 'Mexico'], ['procesamiento de alimentos', 'alimentos congelados', 'inocuidad alimentaria HACCP']],
      ['Línea automatizada', 'manufactura', ['Mexico', 'United States'], ['automatización industrial', 'mantenimiento industrial']],
      ['Cadena de frío y distribución', 'logistica', ['United States'], ['cadena de frío', 'almacenamiento y distribución']],
      ['Marca y retail', 'marketing_digital', ['United States'], ['marketing para mercado hispano', 'branding y diseño']],
      ['Financiación de la planta', 'finanzas', ['United States'], ['financiación de proyectos', 'capital de riesgo']],
    ],
  },
  {
    title: 'Academia digital de oficios verdes: instaladores solares y eficiencia energética',
    sector: 'educacion', countries: ['Spain', 'Mexico', 'Colombia', 'United States'], proposer: ['educacion', 'Spain'],
    budget: [120000, 170000, 240000], months: [4, 6, 9],
    summary: 'Programa semipresencial en español que forma y certifica instaladores solares y técnicos de eficiencia energética, con prácticas en obras reales de empresas de la cámara.',
    problem: 'Las instaladoras solares no encuentran técnicos formados y rechazan proyectos por falta de personal.',
    roles: [
      ['Diseño instruccional', 'educacion', ['Spain', 'Mexico'], ['diseño instruccional', 'e-learning', 'formación en energías renovables']],
      ['Instructores solares', 'energia', ['Spain', 'Mexico', 'Colombia'], ['instalación solar', 'energía solar fotovoltaica', 'eficiencia energética']],
      ['Obras de práctica', 'construccion', ['Spain', 'Mexico'], ['eficiencia energética en edificios', 'gestión de obra']],
      ['Plataforma de aprendizaje', 'tecnologia', ['Spain', 'Colombia'], ['desarrollo web', 'plataformas SaaS']],
    ],
  },
];

const RFQS = [
  ['Contenedores reefer para 40 envíos de aguacate a Valencia', 'logistica', 'USD 120.000 – 160.000', ['Colombia', 'Spain']],
  ['Sistema de riego por goteo para 300 hectáreas de olivar', 'agricultura', 'EUR 180.000 – 240.000', ['Spain']],
  ['Paneles de concreto prefabricado para 120 viviendas', 'construccion', 'USD 400.000 – 550.000', ['Mexico']],
  ['Desarrollo de app móvil de trazabilidad para café', 'tecnologia', 'USD 40.000 – 60.000', ['Colombia']],
  ['Agente de aduanas para importación de alimentos en Miami', 'logistica', 'USD 2.000 al mes', ['United States']],
  ['Instalación solar de 500 kW en nave industrial', 'energia', 'USD 380.000 – 450.000', ['Mexico', 'United States']],
  ['Empaque compostable para línea de arepas congeladas', 'alimentos_bebidas', 'USD 25.000 – 35.000', ['United States']],
  ['Estructuras de acero para dos naves de 5.000 m²', 'construccion', 'USD 900.000 – 1.200.000', ['Mexico']],
  ['Certificación FDA y registro de etiquetas para salsas', 'comercio_exterior', 'USD 8.000 – 12.000', ['United States', 'Colombia']],
  ['Campaña digital en español para contratistas en Texas', 'marketing_digital', 'USD 15.000 – 20.000', ['United States']],
  ['Sensores IoT de humedad de suelo (200 unidades)', 'tecnologia', 'EUR 30.000 – 45.000', ['Spain']],
  ['Almacén refrigerado en Cartagena, 800 posiciones de pallet', 'logistica', 'USD 6.500 al mes', ['Colombia']],
  ['Semillas certificadas y bioestimulantes para invernadero', 'agricultura', 'USD 50.000 – 70.000', ['Mexico']],
  ['Auditoría de ciberseguridad ISO 27001 para plataforma logística', 'ciberseguridad', 'EUR 20.000 – 28.000', ['Spain']],
  ['Crédito puente para exportación de café especial', 'finanzas', 'USD 250.000', ['Colombia', 'United States']],
];

module.exports = { COUNTRIES, FIRST_M, FIRST_F, LAST, SECTORS, PROJECTS, RFQS };
