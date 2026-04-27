#!/usr/bin/env node
/**
 * Seed CamaraVirtual.app (slug: hispamind) with realistic test data
 * - Creates hispamind_* tables cloning schema from pacccfl_*
 * - Inserts ~25 members from Spanish-speaking chambers + Digit2AI
 * - Inserts ~20 companies, ~10 projects (P2B), ~12 RFQs (B2B)
 */
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const bcrypt = require('bcrypt');

const seq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const TABLES = [
  'members', 'regions', 'companies', 'projects', 'project_members',
  'rfqs', 'rfq_responses', 'opportunities', 'matches',
  'transactions', 'trust_scores', 'trust_references',
  'network_metrics', 'events'
];

async function ensureTables() {
  console.log('\n[1/5] Ensuring hispamind_* tables exist...');
  for (const t of TABLES) {
    const dest = `hispamind_${t}`;
    const src = `pacccfl_${t}`;
    const [exists] = await seq.query(
      `SELECT 1 FROM pg_tables WHERE tablename = :t LIMIT 1`,
      { replacements: { t: dest }, type: QueryTypes.SELECT }
    );
    if (exists) {
      console.log(`  - ${dest} (already exists)`);
      continue;
    }
    // CREATE TABLE LIKE preserves columns + types; INCLUDING DEFAULTS preserves SERIAL
    await seq.query(`CREATE TABLE ${dest} (LIKE ${src} INCLUDING ALL)`);
    console.log(`  + ${dest} (created from ${src})`);
  }
}

async function clearExisting() {
  console.log('\n[2/5] Clearing existing seed data (preserves table structure)...');
  // Order matters: child -> parent
  for (const t of [
    'rfq_responses', 'rfqs', 'project_members', 'projects', 'opportunities',
    'matches', 'transactions', 'trust_references', 'trust_scores',
    'network_metrics', 'events', 'companies', 'members', 'regions'
  ]) {
    await seq.query(`TRUNCATE TABLE hispamind_${t} RESTART IDENTITY CASCADE`);
  }
  console.log('  Done.');
}

async function seedRegions() {
  console.log('\n[3/5] Seeding regions...');
  const regions = [
    { id: 1, name: 'Mexico y Centroamerica' },
    { id: 2, name: 'Sudamerica - Region Andina' },
    { id: 3, name: 'Sudamerica - Cono Sur' },
    { id: 4, name: 'Caribe Hispano' },
    { id: 5, name: 'Espana y Europa' },
    { id: 6, name: 'Estados Unidos (Hispanos)' }
  ];
  for (const r of regions) {
    await seq.query(
      `INSERT INTO hispamind_regions (id, name, opportunity_count, created_at) VALUES (:id, :name, 0, NOW())`,
      { replacements: r }
    );
  }
  console.log(`  + ${regions.length} regions`);
}

async function seedMembers() {
  console.log('\n[4/5] Seeding members + companies...');
  const pwd = await bcrypt.hash('CamaraVirtual2026!', 10);

  // 30 diverse members from real Spanish-speaking chambers
  const members = [
    // === Founders / strategic ===
    { email: 'mstagg@digit2ai.com', first: 'Manuel', last: 'Stagg', country: 'USA', region: 6, sector: 'tecnologia', spec: 'AI Platforms', exp: 18, langs: ['es','en'], company: 'Digit2AI', tier: 'fundador', phone: '+1-813-555-0101', linkedin: 'https://linkedin.com/in/manuelstagg', web: 'https://digit2ai.com', bio: 'CEO de Digit2AI -- plataforma de inteligencia artificial neural para camaras de comercio, salud, logistica y voz a escala enterprise. Sede en Tampa, Florida.', role: 'superadmin', access: 'superadmin', trust: 0.98, verified: true },
    { email: 'mariaclara@visionarium.app', first: 'Maria Clara', last: 'Garcia', country: 'USA', region: 6, sector: 'educacion', spec: 'Youth Leadership', exp: 32, langs: ['es','en'], company: 'Visionarium Foundation', tier: 'fundador', phone: '+1-305-555-0102', linkedin: 'https://linkedin.com/in/mariaclaragarcia', web: 'https://visionarium.app', bio: 'Fundadora de Visionarium en 2015. Mas de 30 anos transformando jovenes latinoamericanos en lideres globales mediante mentoria bilingue.', role: 'presidente', access: 'admin_global', trust: 0.95, verified: true },
    { email: 'numeriano@pacccfl.org', first: 'Numeriano', last: 'Bouffard', country: 'USA', region: 6, sector: 'bienes_raices', spec: 'Chamber Governance', exp: 35, langs: ['es','en','fil'], company: 'PACC-CFL Foundation', tier: 'fundador', phone: '+1-407-555-0103', linkedin: 'https://linkedin.com/in/numerianobouffard', web: 'https://pacccfl.org', bio: 'Fundador PACC-CFL (1996). Presidente de la Fundacion FPACC. Tres decadas conectando emprendedores filipino-americanos.', role: 'presidente', access: 'admin_global', trust: 0.94, verified: true },

    // === MEXICO ===
    { email: 'cgarcia@cce.org.mx', first: 'Carlos', last: 'Garcia Lopez', country: 'Mexico', region: 1, sector: 'manufactura', spec: 'Industrial Manufacturing', exp: 24, langs: ['es','en'], company: 'CCE - Consejo Coordinador Empresarial', tier: 'corporativo', phone: '+52-55-5510-2200', web: 'https://cce.org.mx', bio: 'Director de Comercio Internacional, CCE Mexico. Especialista en TLC y exportaciones manufactureras.', role: 'vicepresidente', access: 'admin_regional', trust: 0.88 },
    { email: 'rmendoza@concamin.mx', first: 'Roberto', last: 'Mendoza', country: 'Mexico', region: 1, sector: 'manufactura', spec: 'Heavy Industry', exp: 28, langs: ['es','en'], company: 'CONCAMIN', tier: 'corporativo', phone: '+52-55-5140-7800', web: 'https://concamin.org.mx', bio: 'Confederacion de Camaras Industriales de Mexico. Experto en cadenas de suministro mexicanas.', role: 'vocal', access: 'member', trust: 0.85 },
    { email: 'asuarez@cemex.com', first: 'Ana', last: 'Suarez', country: 'Mexico', region: 1, sector: 'construccion', spec: 'Cement & Building Materials', exp: 22, langs: ['es','en'], company: 'CEMEX', tier: 'corporativo', phone: '+52-81-8888-8888', web: 'https://cemex.com', bio: 'VP Latin America Operations, CEMEX. Lider en sustentabilidad y construccion verde.', trust: 0.91, verified: true },
    { email: 'jramirez@bimbo.com', first: 'Javier', last: 'Ramirez', country: 'Mexico', region: 1, sector: 'alimentos_bebidas', spec: 'Food Distribution', exp: 19, langs: ['es','en','pt'], company: 'Grupo Bimbo', tier: 'corporativo', phone: '+52-55-5268-6600', web: 'https://grupobimbo.com', bio: 'Director de Expansion Global, Grupo Bimbo. Cadena de distribucion en 33 paises.', trust: 0.89 },

    // === COSTA RICA / GUATEMALA ===
    { email: 'lvargas@camaracr.org', first: 'Lucia', last: 'Vargas', country: 'Costa Rica', region: 1, sector: 'hoteleria_turismo', spec: 'Eco-Tourism', exp: 16, langs: ['es','en'], company: 'Camara de Comercio de Costa Rica', tier: 'empresarial', phone: '+506-2253-0126', web: 'https://camara-comercio.com', bio: 'Presidenta Comite de Turismo Sostenible. Especialista en eco-turismo centroamericano.', role: 'presidente', access: 'admin_regional', trust: 0.83 },
    { email: 'mlopez@camaragt.org', first: 'Miguel', last: 'Lopez Portillo', country: 'Guatemala', region: 1, sector: 'agricultura', spec: 'Coffee Export', exp: 21, langs: ['es','en'], company: 'Camara de Comercio Guatemala', tier: 'empresarial', phone: '+502-2417-2700', bio: 'Director Camara Guatemalteca. Exportacion de cafe especialidad y productos agricolas.', trust: 0.86 },

    // === COLOMBIA ===
    { email: 'srodriguez@ccb.org.co', first: 'Sofia', last: 'Rodriguez', country: 'Colombia', region: 2, sector: 'finanzas', spec: 'Microfinance', exp: 17, langs: ['es','en'], company: 'Camara de Comercio de Bogota', tier: 'corporativo', phone: '+57-1-3830330', web: 'https://ccb.org.co', bio: 'Directora de Innovacion Financiera, CCB. Microfinanzas y inclusion financiera digital.', role: 'presidente', access: 'admin_regional', trust: 0.92, verified: true },
    { email: 'chernandez@bancolombia.com', first: 'Camilo', last: 'Hernandez', country: 'Colombia', region: 2, sector: 'finanzas', spec: 'Investment Banking', exp: 20, langs: ['es','en','fr'], company: 'Bancolombia', tier: 'corporativo', phone: '+57-1-3431111', web: 'https://bancolombia.com', bio: 'VP Banca de Inversion, Bancolombia. Project Finance LATAM.', trust: 0.90 },
    { email: 'ptorres@avianca.com', first: 'Patricia', last: 'Torres', country: 'Colombia', region: 2, sector: 'logistica', spec: 'Air Cargo', exp: 23, langs: ['es','en'], company: 'Avianca Cargo', tier: 'corporativo', phone: '+57-1-5879090', web: 'https://aviancacargo.com', bio: 'Directora Comercial, Avianca Cargo. Logistica aerea pan-americana.', trust: 0.87 },

    // === PERU ===
    { email: 'aalvarez@camaralima.org.pe', first: 'Alejandro', last: 'Alvarez', country: 'Peru', region: 2, sector: 'mineria', spec: 'Sustainable Mining', exp: 26, langs: ['es','en'], company: 'Camara de Comercio de Lima', tier: 'corporativo', phone: '+51-1-2191500', web: 'https://camaralima.org.pe', bio: 'Presidente Comite Mineria Sustentable, CCL Peru.', role: 'vicepresidente', access: 'admin_regional', trust: 0.89 },
    { email: 'lcastro@cocacola.com.pe', first: 'Lorena', last: 'Castro', country: 'Peru', region: 2, sector: 'alimentos_bebidas', spec: 'Beverage Distribution', exp: 14, langs: ['es','en'], company: 'Coca-Cola Peru', tier: 'empresarial', phone: '+51-1-6118000', bio: 'Gerente Comercial Andina. Cadena de distribucion bebidas Peru-Bolivia-Ecuador.', trust: 0.81 },

    // === ECUADOR ===
    { email: 'fmoreno@ccq.com.ec', first: 'Felipe', last: 'Moreno', country: 'Ecuador', region: 2, sector: 'comercio_exterior', spec: 'Export Compliance', exp: 18, langs: ['es','en'], company: 'Camara de Comercio Quito', tier: 'empresarial', phone: '+593-2-2952556', web: 'https://ccq.ec', bio: 'Director Comercio Exterior, CCQ Ecuador. Especialista en cumplimiento aduanero.', trust: 0.84 },

    // === ARGENTINA ===
    { email: 'gfernandez@cac.com.ar', first: 'Gabriela', last: 'Fernandez', country: 'Argentina', region: 3, sector: 'tecnologia', spec: 'SaaS Export', exp: 15, langs: ['es','en','it'], company: 'Camara Argentina de Comercio', tier: 'corporativo', phone: '+54-11-5300-9000', web: 'https://cac.com.ar', bio: 'Presidenta Comite Tecnologia, CAC. Tech startups argentinas y export de software.', role: 'presidente', access: 'admin_regional', trust: 0.93, verified: true },
    { email: 'dmartinez@mercadolibre.com', first: 'Diego', last: 'Martinez', country: 'Argentina', region: 3, sector: 'tecnologia', spec: 'E-Commerce Platforms', exp: 13, langs: ['es','en','pt'], company: 'Mercado Libre', tier: 'corporativo', phone: '+54-11-4640-8000', web: 'https://mercadolibre.com', bio: 'Director Marketplace LATAM, Mercado Libre. Pagos y logistica e-commerce.', trust: 0.88 },
    { email: 'vgomez@ypf.com.ar', first: 'Valeria', last: 'Gomez', country: 'Argentina', region: 3, sector: 'energia', spec: 'Oil & Gas', exp: 22, langs: ['es','en'], company: 'YPF', tier: 'corporativo', phone: '+54-11-5441-2000', web: 'https://ypf.com', bio: 'Gerente Comercio Internacional, YPF. Energia y combustibles Cono Sur.', trust: 0.86 },

    // === CHILE ===
    { email: 'rmunoz@cnc.cl', first: 'Ricardo', last: 'Munoz', country: 'Chile', region: 3, sector: 'mineria', spec: 'Copper Trade', exp: 25, langs: ['es','en'], company: 'Camara Nacional de Comercio Chile', tier: 'corporativo', phone: '+56-2-2365-4000', web: 'https://cnc.cl', bio: 'Director CNC Chile. Comercio mineria y exportaciones cobre.', trust: 0.87 },
    { email: 'cnavarro@falabella.com', first: 'Catalina', last: 'Navarro', country: 'Chile', region: 3, sector: 'retail', spec: 'Omnichannel Retail', exp: 17, langs: ['es','en'], company: 'Falabella', tier: 'corporativo', phone: '+56-2-2380-2000', web: 'https://falabella.com', bio: 'VP Retail Digital, Falabella. Operaciones en 6 paises LATAM.', trust: 0.85 },

    // === URUGUAY ===
    { email: 'nperez@cncs.com.uy', first: 'Nicolas', last: 'Perez', country: 'Uruguay', region: 3, sector: 'logistica', spec: 'Free Trade Zones', exp: 19, langs: ['es','en','pt'], company: 'Camara Nacional de Comercio Uruguay', tier: 'empresarial', phone: '+598-2916-1277', bio: 'Director CNCS Uruguay. Especialista en zonas francas y logistica regional.', trust: 0.82 },

    // === CARIBE: REPUBLICA DOMINICANA / PUERTO RICO / CUBA ===
    { email: 'jduran@camaradr.org', first: 'Juana', last: 'Duran', country: 'Republica Dominicana', region: 4, sector: 'hoteleria_turismo', spec: 'Caribbean Hospitality', exp: 20, langs: ['es','en','fr'], company: 'Camara de Comercio Santo Domingo', tier: 'empresarial', phone: '+1-809-682-2688', bio: 'Presidenta Comite Turismo, CCS Republica Dominicana.', role: 'vocal', access: 'admin_regional', trust: 0.83 },
    { email: 'eortiz@camarapr.org', first: 'Eduardo', last: 'Ortiz', country: 'Puerto Rico', region: 4, sector: 'salud', spec: 'Pharma Manufacturing', exp: 24, langs: ['es','en'], company: 'Camara de Comercio Puerto Rico', tier: 'corporativo', phone: '+1-787-721-6060', web: 'https://camarapr.org', bio: 'Director Comite Farmaceutico, Camara PR. Manufactura farmaceutica para EE.UU.', trust: 0.88 },

    // === ESPANA ===
    { email: 'ialonso@camaramadrid.es', first: 'Isabel', last: 'Alonso', country: 'Espana', region: 5, sector: 'servicios_profesionales', spec: 'EU Trade Compliance', exp: 21, langs: ['es','en','fr','de'], company: 'Camara Oficial de Comercio Madrid', tier: 'corporativo', phone: '+34-915-383-500', web: 'https://camaramadrid.es', bio: 'Directora de Internacionalizacion, Camara Madrid. Bridge LATAM-UE.', role: 'presidente', access: 'admin_regional', trust: 0.95, verified: true },
    { email: 'jmarti@cambrabcn.cat', first: 'Jordi', last: 'Marti', country: 'Espana', region: 5, sector: 'tecnologia', spec: 'Smart Cities', exp: 18, langs: ['es','en','ca'], company: 'Cambra de Comerc de Barcelona', tier: 'corporativo', phone: '+34-934-169-300', web: 'https://cambrabcn.org', bio: 'Director Innovacion, Cambra Barcelona. Smart cities y deep tech.', trust: 0.89 },
    { email: 'mdiaz@telefonica.com', first: 'Marta', last: 'Diaz', country: 'Espana', region: 5, sector: 'tecnologia', spec: 'Telecom Infrastructure', exp: 23, langs: ['es','en','pt'], company: 'Telefonica', tier: 'corporativo', phone: '+34-914-823-211', web: 'https://telefonica.com', bio: 'VP Hispam Telecomunicaciones. Infraestructura digital LATAM-Espana.', trust: 0.91 },
    { email: 'asanchez@bbva.com', first: 'Andres', last: 'Sanchez', country: 'Espana', region: 5, sector: 'finanzas', spec: 'Compliance & AML', exp: 27, langs: ['es','en'], company: 'BBVA', tier: 'corporativo', phone: '+34-913-748-000', web: 'https://bbva.com', bio: 'Director Global Compliance, BBVA. Sanctions screening y AML cross-border.', trust: 0.94, verified: true },

    // === USA HISPANO additional ===
    { email: 'rgomez@ushcc.com', first: 'Rafael', last: 'Gomez', country: 'USA', region: 6, sector: 'consultoria', spec: 'Hispanic Business Development', exp: 19, langs: ['es','en'], company: 'US Hispanic Chamber of Commerce', tier: 'corporativo', phone: '+1-202-842-1212', web: 'https://ushcc.com', bio: 'Director Programs, USHCC. Programas para pymes hispanas en EE.UU.', trust: 0.87 },
    { email: 'tcortez@cybertelink.com', first: 'Tania', last: 'Cortez', country: 'USA', region: 6, sector: 'ciberseguridad', spec: 'Financial Sector Security', exp: 14, langs: ['es','en'], company: 'CyberTelink', tier: 'empresarial', phone: '+1-786-555-0199', bio: 'CEO CyberTelink, Miami. Ciberseguridad para fintechs hispanohablantes.', trust: 0.84 }
  ];

  for (const m of members) {
    await seq.query(
      `INSERT INTO hispamind_members (
        email, password_hash, first_name, last_name, country, region_id, sector,
        sub_specialty, years_experience, languages, company_name, membership_type,
        bio, phone, linkedin_url, website_url, governance_role, access_level,
        trust_score, verified, verification_level, status, created_at, updated_at
      ) VALUES (
        :email, :pwd, :first, :last, :country, :region, :sector,
        :spec, :exp, ARRAY[:langs]::text[], :company, :tier,
        :bio, :phone, :linkedin, :web, :role, :access,
        :trust, :verified, 'verified', 'active', NOW(), NOW()
      )`,
      { replacements: {
        email: m.email, pwd, first: m.first, last: m.last, country: m.country,
        region: m.region, sector: m.sector, spec: m.spec, exp: m.exp,
        langs: m.langs, company: m.company, tier: m.tier, bio: m.bio,
        phone: m.phone || null, linkedin: m.linkedin || null, web: m.web || null,
        role: m.role || 'miembro', access: m.access || 'member',
        trust: m.trust || 0.7, verified: m.verified !== false
      }}
    );
  }
  console.log(`  + ${members.length} members`);

  // Companies (one per major member, plus extras)
  const companies = [
    { name: 'Digit2AI LLC', desc: 'Plataforma de inteligencia artificial neural multi-tenant: voz, CRM, salud, logistica, analitica industrial.', sector: 'tecnologia', caps: ['AI Platforms','Voice AI','MCP Orchestration','Sanctions Screening AI'], certs: ['SOC2 Type II','ISO 27001'], countries: ['USA','Mexico','Argentina','Colombia','Espana'], emp: 45, rev: '$1M-$5M', web: 'https://digit2ai.com', owner: 1, verified: true },
    { name: 'Visionarium Foundation', desc: 'Incubadora de Liderazgo y Creatividad para jovenes latinoamericanos. Sede Miami con expansion global.', sector: 'educacion', caps: ['Youth Leadership','Bilingual Mentorship','Fellowship Programs'], certs: ['501(c)(3)'], countries: ['USA','Mexico','Colombia','Argentina'], emp: 12, rev: '$500K-$1M', web: 'https://visionarium.app', owner: 2, verified: true },
    { name: 'PACC-CFL Foundation', desc: 'Camara filipino-americana de comercio Florida Central. 28+ anos conectando emprendedores.', sector: 'servicios_profesionales', caps: ['Chamber Governance','Trade Missions','Networking Events'], certs: ['501(c)(6)'], countries: ['USA','Filipinas'], emp: 8, rev: '$100K-$500K', web: 'https://pacccfl.org', owner: 3, verified: true },
    { name: 'CEMEX', desc: 'Compania global de materiales para la industria de la construccion con presencia en mas de 50 paises.', sector: 'construccion', caps: ['Cement','Aggregates','Ready-Mix Concrete','Sustainable Building'], certs: ['ISO 14001','LEED'], countries: ['Mexico','USA','Espana','Colombia','Reino Unido'], emp: 41000, rev: '$10B+', web: 'https://cemex.com', owner: 6, verified: true },
    { name: 'Grupo Bimbo', desc: 'Empresa de panificacion mas grande del mundo. Mas de 100 marcas en 33 paises.', sector: 'alimentos_bebidas', caps: ['Bakery Manufacturing','Distribution','Cold Chain'], certs: ['HACCP','BRC'], countries: ['Mexico','USA','Argentina','Brasil','Espana'], emp: 138000, rev: '$10B+', web: 'https://grupobimbo.com', owner: 7, verified: true },
    { name: 'Bancolombia', desc: 'Banco lider de Colombia. Banca de inversion, comercial y digital.', sector: 'finanzas', caps: ['Investment Banking','Project Finance','Digital Banking'], certs: ['Basel III','ISO 27001'], countries: ['Colombia','Panama','El Salvador','Guatemala'], emp: 31000, rev: '$5B-$10B', web: 'https://bancolombia.com', owner: 11 },
    { name: 'Avianca Cargo', desc: 'Aerolinea de carga lider en Latinoamerica. Red de 100+ destinos.', sector: 'logistica', caps: ['Air Freight','Cold Chain','Pharma Logistics','Customs Clearance'], certs: ['IATA CEIV Pharma','GDP'], countries: ['Colombia','USA','Mexico','Brasil','Espana'], emp: 15000, rev: '$1B-$5B', web: 'https://aviancacargo.com', owner: 12 },
    { name: 'Mercado Libre', desc: 'Marketplace e-commerce mas grande de Latinoamerica. Pagos, envios y publicidad.', sector: 'tecnologia', caps: ['E-Commerce','Digital Payments','Logistics Network','Advertising'], certs: ['PCI DSS'], countries: ['Argentina','Brasil','Mexico','Colombia','Chile'], emp: 58000, rev: '$10B+', web: 'https://mercadolibre.com', owner: 17 },
    { name: 'YPF', desc: 'Energetica integrada argentina. Exploracion, refino y comercializacion.', sector: 'energia', caps: ['Oil & Gas Exploration','Refining','Lubricants'], certs: ['ISO 14001','ISO 45001'], countries: ['Argentina','Chile','Brasil'], emp: 22000, rev: '$10B+', web: 'https://ypf.com', owner: 18 },
    { name: 'Falabella', desc: 'Retailer omnicanal lider del Cono Sur. Tiendas departamentales, banca y mejoramiento del hogar.', sector: 'retail', caps: ['Omnichannel Retail','Consumer Finance','Home Improvement'], certs: ['B Corp'], countries: ['Chile','Peru','Colombia','Argentina','Brasil'], emp: 88000, rev: '$10B+', web: 'https://falabella.com', owner: 20 },
    { name: 'Telefonica', desc: 'Operadora global de telecomunicaciones. Servicios moviles, fijos, banda ancha y digitales.', sector: 'tecnologia', caps: ['Mobile Networks','Fiber Internet','IoT','Cloud Services'], certs: ['ISO 27001','TL 9000'], countries: ['Espana','Brasil','Mexico','Argentina','Colombia','Peru','Chile'], emp: 102000, rev: '$10B+', web: 'https://telefonica.com', owner: 26 },
    { name: 'BBVA', desc: 'Grupo financiero global con liderazgo en Espana y Mexico. Banca digital de vanguardia.', sector: 'finanzas', caps: ['Retail Banking','Investment Banking','AML Compliance','Open Banking'], certs: ['Basel III','SWIFT GPI'], countries: ['Espana','Mexico','Argentina','Colombia','Peru','Turquia'], emp: 121000, rev: '$10B+', web: 'https://bbva.com', owner: 27, verified: true },
    { name: 'CyberTelink', desc: 'Cybersecurity boutique enfocada en fintechs hispanohablantes y banca digital.', sector: 'ciberseguridad', caps: ['SOC Operations','Penetration Testing','Compliance Audits','Incident Response'], certs: ['CISSP team','ISO 27001'], countries: ['USA','Mexico','Colombia'], emp: 22, rev: '$1M-$5M', owner: 30 },
    { name: 'Cambra Barcelona Tech', desc: 'Brazo tecnologico de la Camara de Barcelona. Smart cities y deep tech.', sector: 'tecnologia', caps: ['Smart City Solutions','IoT Platforms','Public Sector Tech'], countries: ['Espana'], emp: 35, rev: '$1M-$5M', web: 'https://cambrabcn.org', owner: 25 },
    { name: 'Coca-Cola Peru', desc: 'Embotelladora y distribuidora de bebidas Coca-Cola en Peru y region andina.', sector: 'alimentos_bebidas', caps: ['Beverage Manufacturing','Cold Chain Distribution','Vending Networks'], certs: ['FSSC 22000'], countries: ['Peru','Bolivia'], emp: 4500, rev: '$500M-$1B', owner: 14 },
    { name: 'Lima Coffee Cooperative', desc: 'Cooperativa de exportadores de cafe especialidad de la sierra peruana.', sector: 'agricultura', caps: ['Specialty Coffee Export','Fair Trade Certification','Direct Trade Logistics'], certs: ['Fair Trade USA','Rainforest Alliance'], countries: ['Peru','USA','Espana','Alemania'], emp: 180, rev: '$5M-$10M', owner: 13 },
    { name: 'Andina Mining Solutions', desc: 'Tecnologia de mineria sustentable. Servicios para empresas de cobre y oro andinas.', sector: 'mineria', caps: ['Sustainable Mining Tech','Water Recycling','ESG Reporting'], certs: ['ISO 14001','ICMM'], countries: ['Peru','Chile','Colombia'], emp: 240, rev: '$10M-$50M', owner: 13 },
    { name: 'Caribbean Hospitality Group', desc: 'Operador hotelero con propiedades en Republica Dominicana, Puerto Rico y Cuba.', sector: 'hoteleria_turismo', caps: ['Resort Operations','Eco-Tourism','MICE Events'], certs: ['Travelife Gold'], countries: ['Republica Dominicana','Puerto Rico','Cuba','Mexico'], emp: 6800, rev: '$500M-$1B', owner: 23 },
    { name: 'PR Pharma Manufacturing', desc: 'Manufactura farmaceutica en zona libre de Puerto Rico para mercado USA.', sector: 'salud', caps: ['Sterile Manufacturing','FDA Compliance','Cold Storage'], certs: ['FDA cGMP','ISO 13485'], countries: ['Puerto Rico','USA'], emp: 1200, rev: '$100M-$500M', owner: 24 },
    { name: 'Madrid Trade Bridge Consulting', desc: 'Consultoria de internacionalizacion entre LATAM y Union Europea.', sector: 'servicios_profesionales', caps: ['EU Trade Compliance','Customs','Tariff Advisory','Regulatory Affairs'], certs: ['AEO Operator'], countries: ['Espana','Mexico','Colombia','Argentina'], emp: 28, rev: '$1M-$5M', owner: 24 }
  ];

  for (const c of companies) {
    await seq.query(
      `INSERT INTO hispamind_companies (
        name, description, sector, capabilities, certifications, countries_served,
        employee_count, annual_revenue_range, website, owner_member_id, verified,
        created_at, updated_at
      ) VALUES (
        :name, :desc, :sector, ARRAY[:caps]::text[], ARRAY[:certs]::text[],
        ARRAY[:countries]::text[], :emp, :rev, :web, :owner, :verified, NOW(), NOW()
      )`,
      { replacements: {
        name: c.name, desc: c.desc, sector: c.sector, caps: c.caps,
        certs: c.certs || [], countries: c.countries, emp: c.emp || 0,
        rev: c.rev, web: c.web || null, owner: c.owner, verified: c.verified || false
      }}
    );
  }
  console.log(`  + ${companies.length} companies`);
}

async function seedProjectsAndRFQs() {
  console.log('\n[5/5] Seeding projects (P2B) and RFQs (B2B)...');

  // 10 P2B projects
  const projects = [
    { title: 'Sanctions Screening Neural Intelligence AI -- LATAM Compliance Platform', desc: 'Aplicar Inteligencia Neural AI de Digit2AI a Anti-Money Laundering, Sanctions Screening contra OFAC/UE/ONU/PEP. Matching difuso multilingue para nombres en espanol. Plataforma SaaS dirigida a bancos, fintechs y exportadores hispanos. Integracion con BBVA y Bancolombia como pilotos.', sector: 'tecnologia', countries: ['USA','Espana','Mexico','Colombia'], pilot: 'P2B', bmin: 250000, bmax: 800000, best: 480000, tmin: 4, tmax: 12, test: 8, status: 'active', proposer: 1 },
    { title: 'Smart Logistics & Last-Mile Optimization LATAM', desc: 'Plataforma Neural AI para ruteo, freight matching y tracking multimodal. Conectar carriers, brokers y shippers en una red. ETA prediction en tiempo real, capacidad matching y documentacion aduanera. Pilotos con Avianca Cargo y CEMEX.', sector: 'logistica', countries: ['Colombia','Mexico','Argentina','Espana'], pilot: 'P2B', bmin: 180000, bmax: 650000, best: 350000, tmin: 6, tmax: 14, test: 10, status: 'active', proposer: 12 },
    { title: 'Cross-Border Trade & Tariff Intelligence Platform', desc: 'Neural Intelligence AI para clasificacion HS, calculo de aranceles, optimizacion de tratados comerciales y documentacion import/export. Letters of Credit, certificados de origen y filings aduaneros automatizados. Marketplace de exportadores verificados.', sector: 'comercio_exterior', countries: ['Espana','Mexico','Colombia','Argentina','Chile'], pilot: 'P2B', bmin: 200000, bmax: 700000, best: 420000, tmin: 5, tmax: 13, test: 9, status: 'planning', proposer: 24 },
    { title: 'AgriTech Cooperative Andean -- Coffee, Cacao & Quinoa Direct Trade', desc: 'Plataforma de comercio directo entre cooperativas andinas y compradores premium de USA y Europa. Trazabilidad blockchain, certificacion Fair Trade y logistica integrada.', sector: 'agricultura', countries: ['Peru','Colombia','Ecuador','USA','Espana'], pilot: 'P2B', bmin: 120000, bmax: 380000, best: 220000, tmin: 6, tmax: 12, test: 9, status: 'active', proposer: 13 },
    { title: 'Hispanic Healthcare Network -- Bilingual Telemedicine for USA Hispanic Market', desc: 'Red de telemedicina bilingue para hispanos en EE.UU. con doctores en Mexico, Colombia, Argentina y Espana. Integracion con farmacias y aseguradoras.', sector: 'salud', countries: ['USA','Mexico','Colombia','Espana'], pilot: 'P2B', bmin: 300000, bmax: 950000, best: 580000, tmin: 8, tmax: 18, test: 12, status: 'planning', proposer: 24 },
    { title: 'Renewable Energy Marketplace LATAM (Solar, Wind, Green Hydrogen)', desc: 'Marketplace para proyectos de energia renovable LATAM. Conecta desarrolladores con financiadores y compradores corporativos PPA.', sector: 'energia', countries: ['Argentina','Chile','Colombia','Mexico','Espana'], pilot: 'P2B', bmin: 400000, bmax: 1200000, best: 720000, tmin: 10, tmax: 24, test: 16, status: 'planning', proposer: 18 },
    { title: 'FinTech Inclusion Caribbean -- Microcredit & Mobile Money Network', desc: 'Red de microcredito y mobile money para Republica Dominicana, Puerto Rico y Cuba. Integracion regulatoria caribena.', sector: 'finanzas', countries: ['Republica Dominicana','Puerto Rico','Cuba'], pilot: 'P2B', bmin: 150000, bmax: 480000, best: 290000, tmin: 6, tmax: 14, test: 10, status: 'active', proposer: 23 },
    { title: 'Talent Marketplace Hispano -- Nearshore Tech for USA Companies', desc: 'Marketplace de talento tech hispanohablante (Argentina, Mexico, Colombia, Espana) para empresas estadounidenses. Verificacion, payroll multi-pais y compliance.', sector: 'tecnologia', countries: ['USA','Argentina','Mexico','Colombia','Espana'], pilot: 'P2B', bmin: 180000, bmax: 540000, best: 320000, tmin: 5, tmax: 12, test: 8, status: 'active', proposer: 17 },
    { title: 'EdTech University Bridge -- USA-LATAM Higher Education Pathways', desc: 'Plataforma para que estudiantes latinoamericanos accedan a programas universitarios bilingues en USA. Mentoria con Visionarium, financiamiento y visa.', sector: 'educacion', countries: ['USA','Mexico','Colombia','Argentina'], pilot: 'P2B', bmin: 200000, bmax: 600000, best: 360000, tmin: 6, tmax: 14, test: 10, status: 'active', proposer: 2 },
    { title: 'Cybersecurity Mesh for Hispanic Fintechs', desc: 'Servicio gestionado de ciberseguridad para fintechs hispanohablantes. SOC 24/7, threat intel y compliance multi-pais (Mexico SAT, Colombia SFC, Espana CNMV).', sector: 'ciberseguridad', countries: ['USA','Mexico','Colombia','Espana'], pilot: 'P2B', bmin: 220000, bmax: 720000, best: 410000, tmin: 6, tmax: 13, test: 9, status: 'planning', proposer: 30 }
  ];

  for (const p of projects) {
    await seq.query(
      `INSERT INTO hispamind_projects (
        title, description, sector, countries, pilot_type,
        budget_min, budget_est, budget_max,
        timeline_min_months, timeline_est_months, timeline_max_months,
        status, proposer_member_id, created_at, updated_at
      ) VALUES (
        :title, :desc, :sector, ARRAY[:countries]::text[], :pilot,
        :bmin, :best, :bmax, :tmin, :test, :tmax,
        :status, :proposer, NOW(), NOW()
      )`,
      { replacements: {
        title: p.title, desc: p.desc, sector: p.sector, countries: p.countries,
        pilot: p.pilot, bmin: p.bmin, best: p.best, bmax: p.bmax,
        tmin: p.tmin, test: p.test, tmax: p.tmax, status: p.status, proposer: p.proposer
      }}
    );
  }
  console.log(`  + ${projects.length} P2B projects`);

  // 12 B2B RFQs
  const today = new Date();
  const future = (days) => new Date(today.getTime() + days * 86400000).toISOString().split('T')[0];

  const rfqs = [
    { title: 'Spanish-speaking AML Compliance Consultant -- 6 month engagement', desc: 'BBVA Mexico requires bilingual AML/sanctions screening expert for cross-border remittance flows. Must have OFAC + EU sanctions experience.', sector: 'finanzas', budget: '$50K-$150K', deadline: future(45), countries: ['Mexico','Espana','USA'], requester: 27, company: 12 },
    { title: 'Cold-Chain Logistics Partner Mexico-USA Pharma Shipments', desc: 'Necesitamos socio logistico certificado IATA CEIV Pharma para envios refrigerados de Mexico a USA. Volumen mensual 200 toneladas.', sector: 'logistica', budget: '$100K-$500K', deadline: future(30), countries: ['Mexico','USA'], requester: 24, company: 19 },
    { title: 'Spanish Healthcare Translation Services -- Bulk Contract', desc: 'Hospital network in USA needs certified Spanish medical translation: clinical trials, patient materials, regulatory docs. ~500K words/year.', sector: 'salud', budget: '$50K-$200K', deadline: future(60), countries: ['USA','Mexico','Colombia'], requester: 24, company: 19 },
    { title: 'LATAM-friendly Payment Processor Integration', desc: 'Mercado Libre seeking alternative payment processor with PIX, OXXO, Boleto and PSE integration. Must support multi-currency settlements.', sector: 'finanzas', budget: '$80K-$250K', deadline: future(40), countries: ['Argentina','Brasil','Mexico','Colombia'], requester: 17, company: 8 },
    { title: 'Digital Marketing Agency for Mexico-Spain Export Campaign', desc: 'Grupo Bimbo launching premium product line in Spain. Need bilingual digital agency with EU GDPR compliance and Iberian market expertise.', sector: 'marketing_digital', budget: '$30K-$120K', deadline: future(35), countries: ['Mexico','Espana'], requester: 7, company: 5 },
    { title: 'Cybersecurity Audit + Penetration Testing for FinTech', desc: 'Bancolombia digital banking platform requires comprehensive pen test and SOC2 readiness audit. CISSP-led team required.', sector: 'ciberseguridad', budget: '$60K-$180K', deadline: future(25), countries: ['Colombia','USA'], requester: 11, company: 6 },
    { title: 'Construction Equipment Rental -- Bogota Metro Project', desc: 'CEMEX Colombia subcontractor on Bogota Metro Line 2. Need crane and concrete pump rental for 18 months.', sector: 'construccion', budget: '$300K-$800K', deadline: future(20), countries: ['Colombia'], requester: 6, company: 4 },
    { title: 'Trademark & IP Legal Counsel Across LATAM (8 jurisdictions)', desc: 'Visionarium expanding brand. Need IP firm with offices in Mexico, Colombia, Argentina, Chile, Peru, Espana, Brasil, Costa Rica.', sector: 'legal', budget: '$40K-$140K', deadline: future(50), countries: ['Mexico','Colombia','Argentina','Chile','Peru','Espana'], requester: 2, company: 2 },
    { title: 'Cloud Migration Consulting -- Legacy SAP to AWS', desc: 'Falabella migrating retail ERP from on-prem SAP to AWS. Need certified consulting partner with retail SAP S/4HANA experience.', sector: 'tecnologia', budget: '$200K-$600K', deadline: future(30), countries: ['Chile','USA'], requester: 20, company: 10 },
    { title: 'Trade Show Booth Design -- Madrid FITUR 2026', desc: 'Caribbean Hospitality Group needs full-service booth design and operation for FITUR Madrid (largest tourism trade show in Spanish-speaking world).', sector: 'hoteleria_turismo', budget: '$40K-$120K', deadline: future(15), countries: ['Espana','Republica Dominicana'], requester: 23, company: 18 },
    { title: 'AI Voice Assistant for Customer Service -- Bilingual ES/EN', desc: 'Telefonica seeking AI voice agent vendor for Mexican customer service ops. Must integrate with Genesys Cloud, support code-switching.', sector: 'tecnologia', budget: '$150K-$450K', deadline: future(45), countries: ['Mexico','Espana','USA'], requester: 26, company: 11 },
    { title: 'Sustainable Mining ESG Reporting Software', desc: 'Andina Mining Solutions seeking ESG/GRI reporting platform tailored to Latin American mining regulations (ICMM, Peru DGAAM, Chile SMA).', sector: 'mineria', budget: '$70K-$220K', deadline: future(40), countries: ['Peru','Chile','Colombia'], requester: 13, company: 17 }
  ];

  for (const r of rfqs) {
    await seq.query(
      `INSERT INTO hispamind_rfqs (
        title, description, sector, budget_range, deadline, countries_target,
        company_id, requester_member_id, status, created_at, updated_at
      ) VALUES (
        :title, :desc, :sector, :budget, :deadline, ARRAY[:countries]::text[],
        :company, :requester, 'open', NOW(), NOW()
      )`,
      { replacements: {
        title: r.title, desc: r.desc, sector: r.sector, budget: r.budget,
        deadline: r.deadline, countries: r.countries, company: r.company,
        requester: r.requester
      }}
    );
  }
  console.log(`  + ${rfqs.length} B2B RFQs`);
}

async function summary() {
  console.log('\n=== SEED SUMMARY ===');
  for (const t of ['regions','members','companies','projects','rfqs']) {
    const [r] = await seq.query(`SELECT COUNT(*) AS n FROM hispamind_${t}`, { type: QueryTypes.SELECT });
    console.log(`  hispamind_${t}: ${r.n} rows`);
  }
}

(async () => {
  try {
    await ensureTables();
    await clearExisting();
    await seedRegions();
    await seedMembers();
    await seedProjectsAndRFQs();
    await summary();
    console.log('\nAll seeds inserted. Default password for all members: CamaraVirtual2026!');
    await seq.close();
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exit(1);
  }
})();
