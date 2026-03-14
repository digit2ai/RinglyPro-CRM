import React, { useState } from 'react';
import { getLang } from '../services/auth';

const T = {
  en: {
    title: 'International Collaboration',
    sub: 'Building bridges between Colombia, the Philippines, and the Hispanic world through education.',
    proposalTitle: 'Academic Collaboration Proposal',
    proposalTo: 'Universidad de Medellín',
    proposalDate: 'March 13, 2026',
    proposalFrom: 'Numeriano V. Bouffard, Founder & Principal Promoter – Programa Torna Idioma',
    proposalFromOrg: 'Chairman – Filipino-American Chamber of Commerce of Central Florida',
    trilateralTitle: 'Trilateral Partnership Model',
    trilateralSub: 'A historic alliance between Colombia and the Philippines for Spanish language education.',
    institutionalTitle: 'Institutional Presentation',
    institutionalText: 'The Torna Idioma Program is an international initiative dedicated to revitalizing Spanish in the Philippines as cultural heritage, historical identity, and economic advantage for Filipino youth. Its mission is to empower students, professionals, and communities through linguistic competencies that open global opportunities in education, employment, and innovation.',
    objectiveTitle: 'General Objective',
    objectiveText: 'Establish an academic collaboration between Universidad de Medellín and the Torna Idioma Program to design, implement, and evaluate a Spanish as a second language program for Filipino students, using a hybrid, scalable, and sustainable model.',
    specificTitle: 'Specific Objectives',
    specific1: 'Develop a Spanish training program aligned with international standards (CEFR).',
    specific2: 'Implement an initial pilot in the Philippines with a cohort of 20–30 students.',
    specific3: 'Create a replicable academic model for future cohorts and countries.',
    specific4: 'Strengthen cultural and educational cooperation between Colombia and the Philippines.',
    specific5: 'Establish governance, evaluation, and continuous improvement mechanisms.',
    specific6: 'Prepare the foundations for academic exchanges and teacher mobility.',
    contextTitle: 'Context & Justification',
    contextText: 'The Philippines and Colombia share a common history as overseas provinces under the Spanish Crown. Today, the Philippines seeks to reconnect with its Hispanic legacy and leverage Spanish as a tool for global competitiveness.',
    opportunityTitle: 'Strategic Opportunity',
    opp1: 'Growing demand for Spanish in Asia',
    opp2: 'Favorable ecosystem for virtual and hybrid programs',
    opp3: 'Institutional interest in alliances with Latin American universities',
    opp4: 'Need for certified Spanish-speaking teachers',
    phase1Title: 'Phase 1: Diagnosis & Academic Design',
    targetTitle: 'Target Audience',
    target1: 'Filipino youth and adults (16+)',
    target2: 'Students, professionals, and community members',
    target3: 'Initial levels: A0–A1',
    target4: 'No prior Spanish requirement',
    cohortTitle: 'Initial Cohort',
    cohort1: 'Age: 18–45 years',
    cohort2: 'Education: secondary, technical, or university',
    cohort3: 'Current level: absolute beginner or basic',
    cohort4: 'Size: 20–30 students',
    routeTitle: 'Training Route',
    route1: '40-hour modules',
    route2: 'Communicative and cultural approach',
    route3: 'Entry levels: A0 and A1 (CEFR)',
    evalTitle: 'Evaluation System',
    eval1: 'Initial diagnostic',
    eval2: 'Modular assessments (formative and summative)',
    eval3: 'Final level test',
    eval4: 'Individual progress report',
    teacherTitle: 'Teacher Profile',
    teacher1: 'Native Spanish or C2 level',
    teacher2: 'Minimum B2 English (key for the Philippines)',
    teacher3: 'Training in languages, education, or related fields',
    teacher4: 'Minimum 2 years experience in ELE',
    teacher5: 'Desirable certifications: ELE, language didactics',
    operationalTitle: 'Operational Model',
    op1: 'Hybrid: synchronous virtual sessions, asynchronous activities, and self-study materials',
    op2: '4–6 hours per week',
    op3: 'Groups of 15–20 students per teacher',
    op4: 'Zoom or Microsoft Teams for live sessions',
    op5: 'Moodle or Google Classroom for content and tracking',
    governanceTitle: 'Academic Governance',
    governanceText: 'Creation of a Joint Governance Committee, composed of representatives from Instituto de Ciencias Básicas – UdeM, the Torna Idioma Program, and an academic advisor linked to the Filipino community.',
    financialTitle: 'Financial Model',
    cost1: 'Teaching fees',
    cost2: 'Technology platform',
    cost3: 'Educational materials',
    cost4: 'Academic and administrative coordination',
    funding1: 'Student tuition',
    funding2: 'Scholarships and sponsorships',
    funding3: 'Alliances with Filipino organizations and the Filipino-American Chamber of Commerce of Central Florida',
    metricsTitle: 'Success Metrics (first 6 months)',
    met1: 'Retention ≥ 85%',
    met2: 'Level advancement ≥ 70%',
    met3: 'Attendance ≥ 80%',
    met4: 'Satisfaction ≥ 4.5/5',
    letranTitle: 'Colegio de San Juan de Letrán',
    letranText: 'Founded in 1620, Colegio de San Juan de Letrán (now a University) is one of the oldest and most prestigious educational institutions in the Philippines. Its Hispanic legacy, commitment to academic excellence, and openness to international cooperation make it an ideal partner for the Torna Idioma Program.',
    pupTitle: 'Polytechnic University of the Philippines (PUP)',
    pupText: 'With over 100,000 students, PUP is one of the largest and most representative public institutions in the country. Its focus on accessible education, innovation, and international projection positions it as a key strategic partner for expanding the Torna Idioma Program.',
    continentalTitle: 'Continental Hispanic Projection',
    continentalText1: 'The Filipino model emerging from the collaboration between a private university (Colegio de San Juan de Letrán) and a public university (PUP) constitutes a historic precedent that can transform the country\'s educational and cultural landscape.',
    continentalText2: 'This dual model — private and public — not only enables the creation of Spanish-English bilingual universities but also establishes the foundation for a national movement that could be adopted by the Philippine Government as part of the return of Spanish as a cultural language.',
    bilingualCity: 'Bilingual City Initiative',
    bilingualText: 'The program projects the identification of a municipality or city to become the first Bilingual City of the Philippines. Cities like Makati, Zamboanga, or Cavite, with deep Hispanic roots, represent natural candidates.',
    chabacanoBadge: 'Zamboanga & Cavite speak Chabacano — a creole with 60%+ Spanish vocabulary — offering an exceptional linguistic advantage for faster bilingual transition.',
    visionTitle: 'Continental Vision',
    visionText: 'Torna Idioma plans to present this initiative to universities in countries that profoundly influenced Filipino cultural formation: Mexico, Spain, Peru, and Ecuador. These nations shared centuries of history, faith, commerce, institutions, and language with the Philippines.',
    visionClosing: 'Torna Idioma aspires to restore Spanish to its historic place in Filipino identity and project the Philippines as the first Spanish-speaking nation in Asia in the 21st century.',
    growthTitle: 'Growth Model',
    phase1: 'Phase 1: Virtual',
    phase2: 'Phase 2: Hybrid',
    phase3: 'Phase 3: Teacher Mobility Colombia–Philippines',
    missionTitle: 'Mission',
    missionText: 'Empower Filipino youth through Spanish, restoring dignity, pride, and legacy — Vida, Cultura, Legado — and opening global opportunities in the digital era.',
    visionLabelTitle: 'Vision',
    visionLabelText: 'Transform the Philippines into the first Spanish-speaking nation in Asia.',
    downloadProposal: 'Full Proposal Document',
  },
  es: {
    title: 'Colaboración Internacional',
    sub: 'Construyendo puentes entre Colombia, Filipinas y el mundo hispánico a través de la educación.',
    proposalTitle: 'Propuesta de Colaboración Académica',
    proposalTo: 'Universidad de Medellín',
    proposalDate: '13 de marzo de 2026',
    proposalFrom: 'Numeriano V. Bouffard, Fundador y Promotor Principal – Programa Torna Idioma',
    proposalFromOrg: 'Chairman – Cámara de Comercio Filipino-Americana de Florida Central',
    trilateralTitle: 'Modelo de Alianza Trilateral',
    trilateralSub: 'Una alianza histórica entre Colombia y Filipinas para la educación en español.',
    institutionalTitle: 'Presentación Institucional',
    institutionalText: 'El Programa Torna Idioma es una iniciativa internacional dedicada a revitalizar el español en Filipinas como patrimonio cultural, identidad histórica y ventaja económica para la juventud filipina. Su misión es empoderar a estudiantes, profesionales y comunidades mediante la adquisición de competencias lingüísticas que abran oportunidades globales en educación, empleo e innovación.',
    objectiveTitle: 'Objetivo General',
    objectiveText: 'Establecer una colaboración académica entre la Universidad de Medellín y el Programa Torna Idioma para diseñar, implementar y evaluar un programa de enseñanza de español como segunda lengua dirigido a estudiantes filipinos, utilizando un modelo híbrido, escalable y sostenible.',
    specificTitle: 'Objetivos Específicos',
    specific1: 'Desarrollar un programa de formación en español alineado con estándares internacionales (MCER).',
    specific2: 'Implementar un piloto inicial en Filipinas con una cohorte de 20–30 estudiantes.',
    specific3: 'Crear un modelo académico replicable para futuras cohortes y países.',
    specific4: 'Fortalecer la cooperación cultural y educativa entre Colombia y Filipinas.',
    specific5: 'Establecer mecanismos de gobernanza, evaluación y mejora continua.',
    specific6: 'Preparar las bases para intercambios académicos y movilidad docente.',
    contextTitle: 'Contexto y Justificación',
    contextText: 'Filipinas y Colombia comparten una historia común como provincias de ultramar bajo la Corona Española. Hoy, Filipinas busca reconectar con su legado hispánico y aprovechar el español como herramienta de competitividad global.',
    opportunityTitle: 'Oportunidad Estratégica',
    opp1: 'Creciente demanda de español en Asia',
    opp2: 'Ecosistema favorable para programas virtuales e híbridos',
    opp3: 'Interés institucional en alianzas con universidades latinoamericanas',
    opp4: 'Necesidad de docentes hispanohablantes certificados',
    phase1Title: 'Fase 1: Diagnóstico y Diseño Académico',
    targetTitle: 'Público Objetivo',
    target1: 'Jóvenes y adultos filipinos (16+)',
    target2: 'Estudiantes, profesionales y miembros de comunidades',
    target3: 'Niveles iniciales: A0–A1',
    target4: 'Sin requisito previo de español',
    cohortTitle: 'Cohorte Inicial',
    cohort1: 'Edad: 18–45 años',
    cohort2: 'Formación: secundaria, técnica o universitaria',
    cohort3: 'Nivel actual: principiante absoluto o básico',
    cohort4: 'Tamaño: 20–30 estudiantes',
    routeTitle: 'Ruta Formativa',
    route1: 'Módulos de 40 horas',
    route2: 'Enfoque comunicativo y cultural',
    route3: 'Niveles de ingreso: A0 y A1 (MCER)',
    evalTitle: 'Sistema de Evaluación',
    eval1: 'Diagnóstico inicial',
    eval2: 'Evaluaciones modulares (formativas y sumativas)',
    eval3: 'Prueba final de nivel',
    eval4: 'Informe individual de progreso',
    teacherTitle: 'Perfil Docente',
    teacher1: 'Español nativo o nivel C2',
    teacher2: 'Inglés mínimo B2 (clave para Filipinas)',
    teacher3: 'Formación en lenguas, educación o áreas afines',
    teacher4: 'Experiencia mínima de 2 años en ELE',
    teacher5: 'Certificaciones deseables: ELE, didáctica de idiomas',
    operationalTitle: 'Modelo Operativo',
    op1: 'Híbrida: sesiones virtuales sincrónicas, actividades asincrónicas y materiales autodidactas',
    op2: '4–6 horas semanales',
    op3: 'Grupos de 15–20 estudiantes por docente',
    op4: 'Zoom o Microsoft Teams para sesiones en vivo',
    op5: 'Moodle o Google Classroom para contenidos y seguimiento',
    governanceTitle: 'Gobernanza Académica',
    governanceText: 'Creación de un Comité Mixto de Gobernanza, integrado por representantes del Instituto de Ciencias Básicas – UdeM, del Programa Torna Idioma y un asesor académico vinculado a la comunidad filipina.',
    financialTitle: 'Modelo Financiero',
    cost1: 'Honorarios docentes',
    cost2: 'Plataforma tecnológica',
    cost3: 'Materiales educativos',
    cost4: 'Coordinación académica y administrativa',
    funding1: 'Matrícula de estudiantes',
    funding2: 'Becas y patrocinios',
    funding3: 'Alianzas con organizaciones filipinas y la Cámara de Comercio Filipino-Americana de Florida Central',
    metricsTitle: 'Métricas de Éxito (primeros 6 meses)',
    met1: 'Retención ≥ 85%',
    met2: 'Avance de nivel ≥ 70%',
    met3: 'Asistencia ≥ 80%',
    met4: 'Satisfacción ≥ 4.5/5',
    letranTitle: 'Colegio de San Juan de Letrán',
    letranText: 'Fundado en 1620, el Colegio de San Juan de Letrán (ahora Universidad) es una de las instituciones educativas más antiguas y prestigiosas de Filipinas. Su legado hispánico, su compromiso con la excelencia académica y su apertura a la cooperación internacional lo convierten en un socio ideal para el Programa Torna Idioma.',
    pupTitle: 'Universidad Politécnica de Filipinas (PUP)',
    pupText: 'Con más de 100,000 estudiantes, la PUP es una de las instituciones públicas más grandes y representativas del país. Su enfoque en la educación accesible, la innovación y la proyección internacional la posiciona como un socio estratégico clave para la expansión del Programa Torna Idioma.',
    continentalTitle: 'Proyección Continental Hispánica',
    continentalText1: 'El modelo filipino que surge de la colaboración entre una universidad privada (Colegio de San Juan de Letrán) y una universidad pública (PUP) constituye un precedente histórico que puede transformar el panorama educativo y cultural del país.',
    continentalText2: 'Este modelo dual — privado y público — no solo permite la creación de universidades bilingües español–inglés, sino que también establece las bases para un movimiento nacional que podría ser adoptado por el Gobierno de Filipinas como parte del retorno del español como lengua cultural.',
    bilingualCity: 'Iniciativa Ciudad Bilingüe',
    bilingualText: 'El programa proyecta la identificación de un municipio o ciudad para convertirse en la primera Ciudad Bilingüe de Filipinas. Ciudades como Makati, Zamboanga o Cavite, con profundas raíces hispánicas, representan candidatos naturales.',
    chabacanoBadge: 'Zamboanga y Cavite hablan Chabacano — un criollo con más del 60% de vocabulario español — ofreciendo una ventaja lingüística excepcional para una transición bilingüe más rápida.',
    visionTitle: 'Visión Continental',
    visionText: 'Torna Idioma prevé presentar esta iniciativa a universidades de países que influyeron profundamente en la formación cultural filipina: México, España, Perú y Ecuador. Estas naciones compartieron siglos de historia, fe, comercio, instituciones y lengua con Filipinas.',
    visionClosing: 'Torna Idioma aspira a que este esfuerzo conjunto devuelva al español su lugar histórico en la identidad filipina y proyecte a Filipinas como la primera nación hispanohablante de Asia en el siglo XXI.',
    growthTitle: 'Modelo de Crecimiento',
    phase1: 'Fase 1: Virtual',
    phase2: 'Fase 2: Híbrido',
    phase3: 'Fase 3: Movilidad docente Colombia–Filipinas',
    missionTitle: 'Misión',
    missionText: 'Empoderar a la juventud filipina a través del español, restaurando dignidad, orgullo y legado — Vida, Cultura, Legado — y abriendo oportunidades globales en la era digital.',
    visionLabelTitle: 'Visión',
    visionLabelText: 'Convertir a Filipinas en la primera nación hispanohablante de Asia.',
    downloadProposal: 'Documento Completo de la Propuesta',
  },
  fil: {
    title: 'International Collaboration',
    sub: 'Nagtatayo ng tulay sa pagitan ng Colombia, Pilipinas, at ng mundong Hispaniko sa pamamagitan ng edukasyon.',
    proposalTitle: 'Propuesta ng Academic Collaboration',
    proposalTo: 'Universidad de Medellín',
    proposalDate: 'Marso 13, 2026',
    proposalFrom: 'Numeriano V. Bouffard, Tagapagtatag at Pangunahing Promotor – Programa Torna Idioma',
    proposalFromOrg: 'Chairman – Cámara de Comercio Filipino-Americana de Florida Central',
    trilateralTitle: 'Modelo ng Trilateral Partnership',
    trilateralSub: 'Isang makasaysayang alyansa sa pagitan ng Colombia at Pilipinas para sa edukasyon sa Espanyol.',
    institutionalTitle: 'Institutional Presentation',
    institutionalText: 'Ang Programa Torna Idioma ay isang internasyonal na inisyatiba na nakatuon sa muling pagpapalakas ng Espanyol sa Pilipinas bilang kultural na pamana, makasaysayang pagkakakilanlan, at ekonomikong kalamangan para sa kabataang Pilipino.',
    objectiveTitle: 'Pangkalahatang Layunin',
    objectiveText: 'Magtatag ng academic collaboration sa pagitan ng Universidad de Medellín at ng Programa Torna Idioma upang magdisenyo, mag-implement, at mag-evaluate ng programa ng pagtuturo ng Espanyol bilang pangalawang wika para sa mga estudyanteng Pilipino.',
    specificTitle: 'Mga Tiyak na Layunin',
    specific1: 'Bumuo ng programa sa Espanyol na naayon sa international standards (CEFR).',
    specific2: 'Mag-implement ng pilot sa Pilipinas na may 20-30 estudyante.',
    specific3: 'Lumikha ng replicable na academic model para sa mga susunod na cohort.',
    specific4: 'Palakasin ang kultural at edukasyonal na kooperasyon sa pagitan ng Colombia at Pilipinas.',
    specific5: 'Magtatag ng governance, evaluation, at continuous improvement mechanisms.',
    specific6: 'Ihanda ang pundasyon para sa academic exchanges at teacher mobility.',
    contextTitle: 'Konteksto at Katwiran',
    contextText: 'Ang Pilipinas at Colombia ay may magkaparehong kasaysayan bilang mga probinsya sa ilalim ng Koronang Espanyol. Ngayon, hinahangad ng Pilipinas na muling kumonekta sa kanyang Hispanikong pamana.',
    opportunityTitle: 'Strategic Opportunity',
    opp1: 'Lumalaking demand para sa Espanyol sa Asia',
    opp2: 'Paborableng ecosystem para sa virtual at hybrid programs',
    opp3: 'Institutional interest sa alliances sa Latin American universities',
    opp4: 'Pangangailangan ng certified na Spanish-speaking teachers',
    phase1Title: 'Phase 1: Diagnosis at Academic Design',
    targetTitle: 'Target Audience',
    target1: 'Mga kabataang Pilipino at adulto (16+)',
    target2: 'Mga estudyante, propesyonal, at miyembro ng komunidad',
    target3: 'Panimulang antas: A0-A1',
    target4: 'Walang kinakailangang naunang Espanyol',
    cohortTitle: 'Panimulang Cohort',
    cohort1: 'Edad: 18-45 taon',
    cohort2: 'Edukasyon: sekundarya, teknikal, o unibersidad',
    cohort3: 'Kasalukuyang antas: ganap na baguhan o basic',
    cohort4: 'Laki: 20-30 estudyante',
    routeTitle: 'Training Route',
    route1: '40-oras na modules',
    route2: 'Communicative at cultural approach',
    route3: 'Entry levels: A0 at A1 (CEFR)',
    evalTitle: 'Evaluation System',
    eval1: 'Initial diagnostic',
    eval2: 'Modular assessments',
    eval3: 'Final level test',
    eval4: 'Individual progress report',
    teacherTitle: 'Teacher Profile',
    teacher1: 'Native Spanish o C2 level',
    teacher2: 'Minimum B2 English',
    teacher3: 'Training sa languages o education',
    teacher4: 'Minimum 2 taon na karanasan sa ELE',
    teacher5: 'ELE certifications',
    operationalTitle: 'Operational Model',
    op1: 'Hybrid: virtual sessions, asynchronous activities, at self-study materials',
    op2: '4-6 oras bawat linggo',
    op3: 'Groups na 15-20 estudyante bawat guro',
    op4: 'Zoom o Microsoft Teams',
    op5: 'Moodle o Google Classroom',
    governanceTitle: 'Academic Governance',
    governanceText: 'Paglikha ng Joint Governance Committee na binubuo ng mga kinatawan mula sa UdeM, Torna Idioma Program, at isang academic advisor.',
    financialTitle: 'Financial Model',
    cost1: 'Teaching fees',
    cost2: 'Technology platform',
    cost3: 'Educational materials',
    cost4: 'Academic at administrative coordination',
    funding1: 'Student tuition',
    funding2: 'Scholarships at sponsorships',
    funding3: 'Alliances sa Filipino organizations',
    metricsTitle: 'Success Metrics (unang 6 na buwan)',
    met1: 'Retention ≥ 85%',
    met2: 'Level advancement ≥ 70%',
    met3: 'Attendance ≥ 80%',
    met4: 'Satisfaction ≥ 4.5/5',
    letranTitle: 'Colegio de San Juan de Letrán',
    letranText: 'Itinatag noong 1620, ang Colegio de San Juan de Letrán ay isa sa mga pinakamatanda at pinakaprestigiyosong institusyong pang-edukasyon sa Pilipinas.',
    pupTitle: 'Polytechnic University of the Philippines (PUP)',
    pupText: 'Na may higit sa 100,000 estudyante, ang PUP ay isa sa pinakamalaki at pinakarepresentatibong pampublikong institusyon sa bansa.',
    continentalTitle: 'Continental Hispanic Projection',
    continentalText1: 'Ang Filipino model na nagmumula sa collaboration sa pagitan ng isang private university at isang public university ay isang makasaysayang precedent.',
    continentalText2: 'Ang dual model na ito ay nagtatag ng pundasyon para sa isang national movement para sa pagbabalik ng Espanyol bilang cultural language.',
    bilingualCity: 'Bilingual City Initiative',
    bilingualText: 'Pinaplanong tukuyin ang isang munisipalidad o lungsod upang maging unang Bilingual City ng Pilipinas. Ang Makati, Zamboanga, o Cavite ay natural na mga kandidato.',
    chabacanoBadge: 'Ang Zamboanga at Cavite ay nagsasalita ng Chabacano — isang creole na may 60%+ na bokabularyo ng Espanyol.',
    visionTitle: 'Continental Vision',
    visionText: 'Plano ng Torna Idioma na ipresenta ang inisyatibang ito sa mga unibersidad sa Mexico, Spain, Peru, at Ecuador.',
    visionClosing: 'Hangad ng Torna Idioma na ibalik ang Espanyol sa makasaysayang lugar nito sa pagkakakilanlan ng Pilipino.',
    growthTitle: 'Growth Model',
    phase1: 'Phase 1: Virtual',
    phase2: 'Phase 2: Hybrid',
    phase3: 'Phase 3: Teacher Mobility Colombia-Pilipinas',
    missionTitle: 'Misyon',
    missionText: 'Bigyang-lakas ang kabataang Pilipino sa pamamagitan ng Espanyol — Vida, Cultura, Legado.',
    visionLabelTitle: 'Pangitain',
    visionLabelText: 'Gawing unang Spanish-speaking nation sa Asia ang Pilipinas.',
    downloadProposal: 'Buong Dokumento ng Propuesta',
  },
};

const partners = [
  { name: 'Universidad de Medellín', country: 'Colombia', flag: '🇨🇴', type: 'Lead Academic Partner', role: 'Academic design, teacher training, curriculum development, technology infrastructure', year: 'Est. 1950' },
  { name: 'Colegio de San Juan de Letrán', country: 'Philippines', flag: '🇵🇭', type: 'Private University Partner', role: 'Pilot implementation, student recruitment (private sector), historical Hispanic legacy', year: 'Est. 1620' },
  { name: 'Polytechnic University of the Philippines (PUP)', country: 'Philippines', flag: '🇵🇭', type: 'Public University Partner', role: 'Scale & accessibility, diverse student body (100,000+), public sector reach', year: 'Est. 1904' },
];

const bilingualCities = [
  { name: 'Makati City', region: 'Metro Manila', pop: '582,000+', desc: 'Financial capital, BPO hub, colonial-era heritage' },
  { name: 'Zamboanga City', region: 'Mindanao', pop: '977,000+', desc: 'Chabacano-speaking, 60%+ Spanish vocabulary, Asia\'s Latin City' },
  { name: 'Cavite', region: 'CALABARZON', pop: '4.3M+', desc: 'Chabacano Caviteño, revolutionary history, Spanish-era forts' },
];

export default function InternationalCollaboration() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const [section, setSection] = useState('proposal');

  const tabs = [
    { id: 'proposal', label: lang === 'es' ? 'Propuesta' : lang === 'fil' ? 'Propuesta' : 'Proposal' },
    { id: 'partners', label: lang === 'es' ? 'Socios' : lang === 'fil' ? 'Partners' : 'Partners' },
    { id: 'phase1', label: 'Phase 1' },
    { id: 'vision', label: lang === 'es' ? 'Visión' : lang === 'fil' ? 'Pangitain' : 'Vision' },
  ];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerBadge}>INTERNATIONAL ACADEMIC COLLABORATION</div>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>

      {/* Tabs */}
      <div style={s.tabRow}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSection(t.id)} style={{ ...s.tab, ...(section === t.id ? s.tabActive : {}) }}>{t.label}</button>
        ))}
      </div>

      <div style={s.body}>
        {/* PROPOSAL TAB */}
        {section === 'proposal' && (
          <>
            {/* Letter header */}
            <div style={s.letterCard}>
              <div style={s.letterHeader}>
                <div style={s.letterDate}>{L.proposalDate}</div>
                <div style={s.letterTo}>Dr. Federico Restrepo Posada, Rector</div>
                <div style={s.letterToOrg}>{L.proposalTo} — Medellín, Colombia</div>
              </div>
              <div style={s.letterBody}>
                <p style={s.letterText}>{L.institutionalText}</p>
              </div>
              <div style={s.letterSignature}>
                <div style={s.sigName}>{L.proposalFrom}</div>
                <div style={s.sigOrg}>{L.proposalFromOrg}</div>
              </div>
            </div>

            {/* Objective */}
            <div style={s.section}>
              <h2 style={s.sectionTitle}>{L.objectiveTitle}</h2>
              <p style={s.sectionText}>{L.objectiveText}</p>
            </div>

            {/* Specific Objectives */}
            <div style={s.section}>
              <h2 style={s.sectionTitle}>{L.specificTitle}</h2>
              <div style={s.objectiveGrid}>
                {[L.specific1, L.specific2, L.specific3, L.specific4, L.specific5, L.specific6].map((obj, i) => (
                  <div key={i} style={s.objectiveCard}>
                    <div style={s.objNum}>{i + 1}</div>
                    <p style={s.objText}>{obj}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Context */}
            <div style={s.section}>
              <h2 style={s.sectionTitle}>{L.contextTitle}</h2>
              <p style={s.sectionText}>{L.contextText}</p>
              <h3 style={s.subTitle}>{L.opportunityTitle}</h3>
              <div style={s.pillRow}>
                {[L.opp1, L.opp2, L.opp3, L.opp4].map((o, i) => (
                  <span key={i} style={s.pill}>{o}</span>
                ))}
              </div>
            </div>

            {/* Mission & Vision */}
            <div style={s.mvRow}>
              <div style={s.mvCard}>
                <div style={s.mvLabel}>{L.missionTitle}</div>
                <p style={s.mvText}>{L.missionText}</p>
              </div>
              <div style={{ ...s.mvCard, borderColor: '#C9A84C' }}>
                <div style={{ ...s.mvLabel, color: '#C9A84C' }}>{L.visionLabelTitle}</div>
                <p style={s.mvText}>{L.visionLabelText}</p>
              </div>
            </div>
          </>
        )}

        {/* PARTNERS TAB */}
        {section === 'partners' && (
          <>
            <h2 style={s.sectionTitle}>{L.trilateralTitle}</h2>
            <p style={s.sectionText}>{L.trilateralSub}</p>

            {/* Trilateral diagram */}
            <div style={s.trilateralGrid}>
              {partners.map((p, i) => (
                <div key={i} style={s.partnerCard}>
                  <div style={s.partnerFlag}>{p.flag}</div>
                  <h3 style={s.partnerName}>{p.name}</h3>
                  <div style={s.partnerType}>{p.type}</div>
                  <div style={s.partnerCountry}>{p.country} · {p.year}</div>
                  <p style={s.partnerRole}>{p.role}</p>
                </div>
              ))}
            </div>

            {/* Letrán */}
            <div style={s.institutionSection}>
              <h2 style={s.sectionTitle}>{L.letranTitle}</h2>
              <div style={s.institutionCard}>
                <div style={s.instYear}>1620</div>
                <p style={s.instText}>{L.letranText}</p>
              </div>
            </div>

            {/* PUP */}
            <div style={s.institutionSection}>
              <h2 style={s.sectionTitle}>{L.pupTitle}</h2>
              <div style={s.institutionCard}>
                <div style={{ ...s.instYear, background: '#10B981' }}>100K+</div>
                <p style={s.instText}>{L.pupText}</p>
              </div>
            </div>

            {/* Governance */}
            <div style={s.section}>
              <h2 style={s.sectionTitle}>{L.governanceTitle}</h2>
              <p style={s.sectionText}>{L.governanceText}</p>
            </div>
          </>
        )}

        {/* PHASE 1 TAB */}
        {section === 'phase1' && (
          <>
            <h2 style={s.sectionTitle}>{L.phase1Title}</h2>

            <div style={s.phaseGrid}>
              {/* Target */}
              <div style={s.phaseCard}>
                <h3 style={s.phaseCardTitle}>{L.targetTitle}</h3>
                {[L.target1, L.target2, L.target3, L.target4].map((t, i) => <div key={i} style={s.phaseItem}>{t}</div>)}
              </div>
              {/* Cohort */}
              <div style={s.phaseCard}>
                <h3 style={s.phaseCardTitle}>{L.cohortTitle}</h3>
                {[L.cohort1, L.cohort2, L.cohort3, L.cohort4].map((t, i) => <div key={i} style={s.phaseItem}>{t}</div>)}
              </div>
              {/* Route */}
              <div style={s.phaseCard}>
                <h3 style={s.phaseCardTitle}>{L.routeTitle}</h3>
                {[L.route1, L.route2, L.route3].map((t, i) => <div key={i} style={s.phaseItem}>{t}</div>)}
              </div>
              {/* Evaluation */}
              <div style={s.phaseCard}>
                <h3 style={s.phaseCardTitle}>{L.evalTitle}</h3>
                {[L.eval1, L.eval2, L.eval3, L.eval4].map((t, i) => <div key={i} style={s.phaseItem}>{t}</div>)}
              </div>
              {/* Teacher Profile */}
              <div style={s.phaseCard}>
                <h3 style={s.phaseCardTitle}>{L.teacherTitle}</h3>
                {[L.teacher1, L.teacher2, L.teacher3, L.teacher4, L.teacher5].map((t, i) => <div key={i} style={s.phaseItem}>{t}</div>)}
              </div>
              {/* Operational */}
              <div style={s.phaseCard}>
                <h3 style={s.phaseCardTitle}>{L.operationalTitle}</h3>
                {[L.op1, L.op2, L.op3, L.op4, L.op5].map((t, i) => <div key={i} style={s.phaseItem}>{t}</div>)}
              </div>
            </div>

            {/* Financial */}
            <div style={s.section}>
              <h2 style={s.sectionTitle}>{L.financialTitle}</h2>
              <div style={s.finRow}>
                <div style={s.finCard}>
                  <div style={s.finLabel}>{lang === 'es' ? 'COSTOS' : 'COSTS'}</div>
                  {[L.cost1, L.cost2, L.cost3, L.cost4].map((c, i) => <div key={i} style={s.finItem}>{c}</div>)}
                </div>
                <div style={s.finCard}>
                  <div style={{ ...s.finLabel, color: '#10B981' }}>{lang === 'es' ? 'FUENTES' : 'FUNDING'}</div>
                  {[L.funding1, L.funding2, L.funding3].map((f, i) => <div key={i} style={s.finItem}>{f}</div>)}
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div style={s.metricsRow}>
              <div style={s.metricsBanner}>{L.metricsTitle}</div>
              <div style={s.metricsGrid}>
                {[L.met1, L.met2, L.met3, L.met4].map((m, i) => (
                  <div key={i} style={s.metricCard}>
                    <div style={s.metricVal}>{m.split(' ')[1]}</div>
                    <div style={s.metricLabel}>{m.split(' ')[0]}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* VISION TAB */}
        {section === 'vision' && (
          <>
            <h2 style={s.sectionTitle}>{L.continentalTitle}</h2>
            <p style={s.sectionText}>{L.continentalText1}</p>
            <p style={s.sectionText}>{L.continentalText2}</p>

            {/* Bilingual Cities */}
            <div style={s.section}>
              <h2 style={s.sectionTitle}>{L.bilingualCity}</h2>
              <p style={s.sectionText}>{L.bilingualText}</p>
              <div style={s.cityGrid}>
                {bilingualCities.map((c, i) => (
                  <div key={i} style={s.cityCard}>
                    <h3 style={s.cityName}>{c.name}</h3>
                    <div style={s.cityRegion}>{c.region} · Pop. {c.pop}</div>
                    <p style={s.cityDesc}>{c.desc}</p>
                  </div>
                ))}
              </div>
              <div style={s.chabacano}>{L.chabacanoBadge}</div>
            </div>

            {/* Growth Model */}
            <div style={s.growthSection}>
              <h2 style={{ ...s.sectionTitle, color: '#fff', borderColor: '#C9A84C' }}>{L.growthTitle}</h2>
              <div style={s.growthSteps}>
                {[L.phase1, L.phase2, L.phase3].map((p, i) => (
                  <div key={i} style={s.growthStep}>
                    <div style={s.growthNum}>{i + 1}</div>
                    <span style={s.growthText}>{p}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Continental Vision */}
            <div style={s.section}>
              <h2 style={s.sectionTitle}>{L.visionTitle}</h2>
              <p style={s.sectionText}>{L.visionText}</p>
              <div style={s.flagRow}>
                {['🇲🇽 Mexico', '🇪🇸 Spain', '🇵🇪 Peru', '🇪🇨 Ecuador', '🇨🇴 Colombia', '🇦🇷 Argentina', '🇨🇱 Chile'].map((f, i) => (
                  <span key={i} style={s.flagBadge}>{f}</span>
                ))}
              </div>
              <div style={s.closingCard}>
                <p style={s.closingText}>{L.visionClosing}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 40%, #2A3F6A 100%)', padding: '40px 32px 32px', borderBottom: '3px solid #C9A84C', textAlign: 'center' },
  headerBadge: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 3, marginBottom: 12 },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 },
  headerSub: { fontSize: 14, color: '#E8D48B', fontStyle: 'italic', maxWidth: 600, margin: '0 auto' },
  tabRow: { display: 'flex', gap: 0, borderBottom: '2px solid #F5E6C8', background: '#fff' },
  tab: { flex: 1, padding: '14px 16px', border: 'none', background: '#fff', fontSize: 13, fontWeight: 600, color: '#6B6B6B', cursor: 'pointer', borderBottom: '3px solid transparent', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: 1 },
  tabActive: { color: '#1B2A4A', borderBottomColor: '#C9A84C', background: '#FFF8E7' },
  body: { padding: '28px 32px 48px', maxWidth: 960, margin: '0 auto' },
  section: { marginBottom: 32 },
  sectionTitle: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: '#1B2A4A', marginBottom: 16, borderBottom: '2px solid #C9A84C', paddingBottom: 8, display: 'inline-block' },
  subTitle: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 600, color: '#1B2A4A', marginTop: 16, marginBottom: 10 },
  sectionText: { fontSize: 14, color: '#4A4A4A', lineHeight: 1.8, marginBottom: 12 },
  letterCard: { background: '#fff', padding: 32, borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 32, borderLeft: '4px solid #C9A84C' },
  letterHeader: { marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #F5E6C8' },
  letterDate: { fontSize: 13, color: '#8B6914', marginBottom: 8, fontWeight: 500 },
  letterTo: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#1B2A4A' },
  letterToOrg: { fontSize: 14, color: '#6B6B6B' },
  letterBody: { marginBottom: 20 },
  letterText: { fontSize: 14, color: '#4A4A4A', lineHeight: 1.8 },
  letterSignature: { borderTop: '1px solid #F5E6C8', paddingTop: 16 },
  sigName: { fontFamily: "'Playfair Display',serif", fontSize: 14, fontWeight: 700, color: '#1B2A4A' },
  sigOrg: { fontSize: 12, color: '#8B6914', fontStyle: 'italic' },
  objectiveGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 },
  objectiveCard: { display: 'flex', gap: 12, padding: 16, background: '#fff', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', alignItems: 'flex-start' },
  objNum: { width: 28, height: 28, borderRadius: '50%', background: '#1B2A4A', color: '#C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display',serif", fontSize: 14, fontWeight: 800, flexShrink: 0 },
  objText: { fontSize: 13, color: '#4A4A4A', lineHeight: 1.6, margin: 0 },
  pillRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pill: { fontSize: 12, padding: '6px 14px', background: '#fff', border: '1px solid #F5E6C8', borderRadius: 20, color: '#1B2A4A', fontWeight: 500 },
  mvRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 },
  mvCard: { padding: 24, background: '#0F1A2E', borderRadius: 8, borderLeft: '4px solid #10B981' },
  mvLabel: { fontSize: 10, fontWeight: 700, color: '#10B981', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  mvText: { fontSize: 14, color: '#E8D48B', lineHeight: 1.7, margin: 0, fontStyle: 'italic' },
  trilateralGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 32 },
  partnerCard: { background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '4px solid #C9A84C', textAlign: 'center' },
  partnerFlag: { fontSize: 40, marginBottom: 8 },
  partnerName: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#1B2A4A', marginBottom: 4 },
  partnerType: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  partnerCountry: { fontSize: 12, color: '#8B6914', marginBottom: 10 },
  partnerRole: { fontSize: 12, color: '#6B6B6B', lineHeight: 1.6 },
  institutionSection: { marginBottom: 28 },
  institutionCard: { display: 'flex', gap: 20, padding: 24, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', alignItems: 'center' },
  instYear: { width: 64, height: 64, borderRadius: '50%', background: '#1B2A4A', color: '#C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 800, flexShrink: 0 },
  instText: { fontSize: 13, color: '#4A4A4A', lineHeight: 1.7, margin: 0 },
  phaseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 32 },
  phaseCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '3px solid #2A3F6A' },
  phaseCardTitle: { fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: '#1B2A4A', marginBottom: 12 },
  phaseItem: { fontSize: 13, color: '#4A4A4A', padding: '4px 0', borderBottom: '1px solid #F5E6C8', lineHeight: 1.5 },
  finRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  finCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  finLabel: { fontSize: 10, fontWeight: 700, color: '#C41E3A', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },
  finItem: { fontSize: 13, color: '#4A4A4A', padding: '6px 0', borderBottom: '1px solid #F5E6C8' },
  metricsRow: { background: '#0F1A2E', borderRadius: 12, padding: 28, marginTop: 24 },
  metricsBanner: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#C9A84C', marginBottom: 16, textAlign: 'center' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  metricCard: { textAlign: 'center', padding: 16, background: 'rgba(201,168,76,0.08)', borderRadius: 8 },
  metricVal: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#C9A84C' },
  metricLabel: { fontSize: 11, color: '#E8D48B', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  cityGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 },
  cityCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: '3px solid #2A3F6A' },
  cityName: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#1B2A4A', marginBottom: 4 },
  cityRegion: { fontSize: 11, color: '#8B6914', marginBottom: 8, fontWeight: 500 },
  cityDesc: { fontSize: 12, color: '#6B6B6B', lineHeight: 1.5, margin: 0 },
  chabacano: { background: '#C9A84C', color: '#0F1A2E', padding: '12px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, lineHeight: 1.5, marginBottom: 28 },
  growthSection: { background: '#0F1A2E', padding: 32, borderRadius: 12, marginBottom: 28 },
  growthSteps: { display: 'flex', gap: 20 },
  growthStep: { flex: 1, display: 'flex', alignItems: 'center', gap: 12 },
  growthNum: { width: 40, height: 40, borderRadius: '50%', background: '#C9A84C', color: '#0F1A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 800, flexShrink: 0 },
  growthText: { fontSize: 14, color: '#E8D48B', fontWeight: 500 },
  flagRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, marginTop: 12 },
  flagBadge: { fontSize: 13, padding: '6px 14px', background: '#fff', border: '1px solid #F5E6C8', borderRadius: 20, fontWeight: 500, color: '#1B2A4A' },
  closingCard: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A)', padding: 28, borderRadius: 8, marginTop: 8 },
  closingText: { fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#E8D48B', lineHeight: 1.7, fontStyle: 'italic', textAlign: 'center', margin: 0 },
};
