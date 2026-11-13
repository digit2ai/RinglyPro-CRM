// Phase 2 — structured, machine-readable résumés (JSON Resume standard, jsonresume.org)
// for the personal CV domains. One object per slug, authored from each person's real CV.
// Served at /resume.json (host-aware), consumed by the A2A Agent Card + MCP endpoint so a
// recruiter's AI can read and query the candidate. meta.targetRoles/availability/slug drive
// the agent tools. Keep truthful — do not add credentials the person does not hold.

const RESUMES = {
  manuelstagg: {
    basics: {
      name: 'Manuel Stagg',
      label: 'IT Project Technology Lead · IT Project Delivery · Systems Integration · Financial Services Technology',
      email: 'manuelstagg@gmail.com', phone: '+1 813-641-4177',
      url: 'https://manuelstagg.com',
      summary: 'IT Project Technology Lead with 20+ years in Citigroup technology, plus Silicon Valley Bank, delivering enterprise integration, data migration and financial-crime platforms in heavily regulated environments. Develops detailed IT work plans, technical schedules, project estimates, resource plans and status reports, and interfaces with senior management on project status. Leads project governance and systems integration delivery across SDLC, Agile and Waterfall. Sound understanding of risk, compliance and regulatory frameworks (OCC Consent Orders, MRA/MRIA, AML, KYC, Sanctions). Hands-on AI architect who builds multi-agent systems on the Model Context Protocol (MCP). PMP, PSPO, TOGAF. Bilingual English/Spanish.',
      location: { city: 'Wesley Chapel', region: 'FL', postalCode: '33543', countryCode: 'US' },
      profiles: [
        { network: 'LinkedIn', url: 'https://www.linkedin.com/in/manuel-stagg-7a11a9a0' }
      ]
    },
    work: [
      { name: 'Citigroup — Data Governance Integration Platform', position: 'Senior IT Project Manager Lead', startDate: '2023-01', location: 'Tampa, FL',
        summary: "Lead delivery of Citi's Data Governance Integration Platform, a publish/subscribe integration layer replacing point-to-point interfaces under the Consent Order Data Operating Model. Cut the Dataverse SLA breach rate by about 60% (1.82% to 0.72%, Q3 to Q4 2025) across 18,110+ critical data feeds; delivered the LVID to LEID and CSI to DRIFT migrations and a file-to-API HR data migration; maintain IT work plans, schedules, estimates, resource plans, RAID logs and RAG reporting in PTS." },
      { name: 'Hands-On AI Engineering — Continuous Learning & Personal Projects', position: 'Personal projects', startDate: '2024',
        summary: 'Generative AI, multi-agent workflows and the Model Context Protocol (MCP), full delivery lifecycle with Python, Node.js, React, PostgreSQL and AWS. Personal time and own equipment; no Citi data or systems used.' },
      { name: 'Silicon Valley Bank, Financial Crime Risk Management (via Solomon Edwards)', position: 'Senior IT Project Manager Lead (Contract)', startDate: '2021-12', endDate: '2022-12', location: 'Tampa, FL',
        summary: 'Led IT initiatives across FCRM/Compliance value streams (BSA, Sanctions, KYC, AML, OFSAA) and corrective-action plans for OCC Consent Orders, MRAs and MRIAs; Epic delivery forecasts, BRDs and payment-gateway data mapping (SWIFT, Fedwire, ISO 20022, SEPA) for OFSAA 8.0.5 and FircoSoft Continuity.' },
      { name: 'Citigroup — AML Global Data Intelligence', position: 'AML Data Intelligence Business Analyst', startDate: '2012-08', endDate: '2021-12', location: 'Tampa, FL',
        summary: 'Tuned Oracle Mantas with below-the-line / above-the-line testing; built the Data Intelligence Global Tracker (DIGT) in Jira; led integration of the Global Sanctions Name Screening System with Oracle Mantas.' },
      { name: 'Citigroup — Global Sanctions', position: 'Senior Business Systems Analyst', startDate: '2011-07', endDate: '2012-07', location: 'Tampa, FL',
        summary: 'Managed Global Sanctions rule sets in Global Interdict (Citi Screening 2.5) and Actimize, keeping UAT and Production consistent.' }
    ],
    education: [
      { institution: 'Universidad Nacional Experimental Politécnica "Antonio José de Sucre", Maracaibo, Venezuela', area: 'Finance', studyType: 'Bachelor of Arts' }
    ],
    certificates: ['Project Management Professional (PMP)', 'Professional Scrum Product Owner (PSPO)', 'TOGAF Part 1 & 2', 'Data Management Professional', 'Business Intelligence Analyst', 'Business Analysis Modeling', 'SWIFT Message Types', 'ISO 20022 MX Messages'].map((name) => ({ name })),
    skills: [
      { name: 'IT Project Management', keywords: ['Project Governance', 'SDLC', 'Agile/Scrum', 'Waterfall', 'IT Work Plans', 'Technical Schedules', 'Project Estimates', 'Resource Plans', 'Critical Path', 'RAID Logs', 'RAG Reporting', 'RTM', 'Change Management', 'PTS', 'MS Project', 'Jira', 'Confluence', 'ServiceNow'] },
      { name: 'Integration & Architecture', keywords: ['Enterprise Integration Platforms', 'REST/JSON APIs', 'JDBC', 'MQ', 'Publish/Subscribe', 'Apache Kafka', 'Solace', 'Apache Camel', 'Data Migration', 'Enterprise Architecture (CEAM)'] },
      { name: 'Data & Governance', keywords: ['Data Governance', 'Data Lineage', 'Data Quality', 'SLA Monitoring', 'Collibra', 'Ab Initio', 'Solidatus', 'SQL', 'Oracle', 'PostgreSQL'] },
      { name: 'Financial Crime & Payments', keywords: ['OFSAA', 'Oracle Mantas', 'Actimize', 'FircoSoft Continuity', 'Silent Eight', 'SWIFT', 'Fedwire', 'ISO 20022', 'SEPA'] },
      { name: 'Engineering & AI', keywords: ['Python', 'Node.js', 'JavaScript', 'React', 'AWS', 'CI/CD', 'Git', 'Generative AI', 'Multi-Agent Workflows', 'Model Context Protocol (MCP)', 'RPA'] },
      { name: 'Testing', keywords: ['SIT', 'UAT', 'PAT', 'End-to-End and Integration Testing', 'Test Plans and Scripts'] }
    ],
    languages: [
      { language: 'English', fluency: 'Native or bilingual' },
      { language: 'Spanish', fluency: 'Native or bilingual' }
    ],
    meta: { slug: 'manuelstagg', availability: 'open',
      targetRoles: 'IT Project Technology Lead; Senior IT Project Manager; Systems Integration / Data Migration Delivery; Financial Services Technology (AML/KYC/Sanctions) — Tampa, hybrid or remote' }
  },
  anastagg: {
    basics: {
      name: 'Ana I. Stagg',
      label: 'Securities & Derivatives Analyst — Custody Billing & Financial Operations',
      email: 'ana.staggp@gmail.com', phone: '+1 813-438-9000',
      url: 'https://anastagg.com',
      summary: 'Bilingual Securities & Derivatives Analyst at Citi supporting global custody and safekeeping operations for institutional clients — fee calculation, contractual pricing validation, invoice reconciliation, billing quality assurance and compliance. B.S. in Business Administration (HRM) & Psychology. Full professional fluency in English and Spanish.',
      location: { city: 'Tampa', region: 'FL', countryCode: 'US' },
      profiles: [{ network: 'LinkedIn', url: 'https://www.linkedin.com/in/ana-stagg6774' }]
    },
    work: [
      { name: 'Citi', position: 'Securities & Derivatives Analyst', startDate: '2025',
        summary: 'Owns the billing and fee-calculation lifecycle for institutional custody clients: custody/safekeeping fees across equities, fixed income, mutual funds and ETFs; validates against contractual pricing; generates and reconciles invoices; investigates discrepancies; QA and month/quarter-end close.', location: 'Tampa, FL' },
      { name: 'Tranzact Insurance', position: 'Bilingual Licensed Health Insurance Agent', startDate: '2021-04', endDate: '2022-12',
        summary: '5,000+ bilingual calls; ~35 monthly Medicare Advantage enrollments; zero PII violations; CMS-compliant.', location: 'Tampa, FL' },
      { name: 'Luxottica', position: 'Sales Supervisor', startDate: '2019-04', endDate: '2020-06', summary: 'Led a team of 10 across 5+ locations; consistently met a $90K monthly sales target.', location: 'Tampa, FL' },
      { name: 'Epic Systems', position: 'Bilingual Call Center Agent', startDate: '2018-12', endDate: '2019-04', summary: '8,000+ bilingual calls incl. sensitive class-action and identity-theft matters; 100% process quality assurance.', location: 'Tampa, FL' },
      { name: 'Amazon Flex', position: 'Delivery Partner (Independent Contractor)', startDate: '2022-03', endDate: '2025', summary: '9,500+ deliveries with zero concessions or violations.', location: 'Tampa, FL' }
    ],
    education: [
      { institution: 'Keiser University', studyType: 'Bachelor of Science', area: 'Interdisciplinary Studies — Business Administration (HRM) & Psychology' },
      { institution: 'Pasco-Hernando State College', studyType: 'Associate of Arts', area: 'General Studies' }
    ],
    skills: [
      { name: 'Custody Billing & Fee Operations', keywords: ['Custody & safekeeping fees', 'Contractual pricing schedules', 'Invoice generation & validation', 'Billing reconciliation', 'Month/quarter-end close'] },
      { name: 'Controls, Compliance & QA', keywords: ['Quality assurance & controls', 'Regulatory compliance', 'Discrepancy investigation', 'Root-cause resolution', 'PII handling', 'Audit-readiness'] },
      { name: 'Analysis & Reporting', keywords: ['Advanced Microsoft Excel', 'Data analysis & reporting', 'Billing & reconciliation platforms'] }
    ],
    languages: [
      { language: 'English', fluency: 'Native or bilingual' },
      { language: 'Spanish', fluency: 'Native or bilingual' }
    ],
    meta: { slug: 'anastagg', availability: 'open',
      targetRoles: 'Securities & Derivatives / Custody Billing Analyst; Financial Operations & Reconciliation; Billing QA, Controls & Compliance; Bilingual Institutional Client Servicing' }
  },

  andreastagg: {
    basics: {
      name: 'Andrea Stagg',
      label: 'Securities & Derivatives Associate Analyst — JD · International Custody & Compliance',
      email: 'andreastaggp@gmail.com', phone: '+1 813-502-9433',
      url: 'https://andreastagg.com',
      summary: 'Securities & Derivatives Associate Analyst at Citi and Juris Doctor — international securities settlement and global custody (INDEVAL, DTC, EUROCLEAR, CREST, IBERCLEAR), AML/BSA/OFAC compliance and international business law. Roles at Citi and J.P. Morgan. Quadrilingual (English, Spanish, French, Italian).',
      location: { city: 'Tampa', region: 'FL', countryCode: 'US' },
      profiles: [{ network: 'LinkedIn', url: 'https://www.linkedin.com/in/andrea-stagg-1020718b' }]
    },
    work: [
      { name: 'Citi', position: 'Securities & Derivatives Associate Analyst', startDate: '2020-10',
        summary: 'Processing and settlement of securities and derivatives for institutional clients; trade lifecycle events, income and corporate actions, multi-currency cash; exception investigation under compliance controls.', location: 'Tampa, FL' },
      { name: 'J.P. Morgan', position: 'Banking Operations Analyst — CIB', startDate: '2019-09', endDate: '2020-02', summary: 'Supported Corporate & Investment Bank operations from Madrid across international teams.', location: 'Madrid, Spain' },
      { name: 'Citi', position: 'Operations Support Intermediate Analyst — Internal Audit', startDate: '2018-05', endDate: '2019-06', summary: 'Cross-border data-clearance (CBAT); global operations projects; developed procedures/controls and automation.', location: 'Tampa / St. Petersburg, FL' },
      { name: 'Citi', position: 'Associate Securities Processing Analyst — LATAM Account Maintenance', startDate: '2017-02', endDate: '2018-05', summary: 'Account opening/maintenance/closing documentation; LATAM market-requirement and compliance expert; standardized training manuals.', location: 'Tampa / St. Petersburg, FL' },
      { name: 'Citi', position: 'Associate Securities Processing Analyst — Mexico Market', startDate: '2015-06', endDate: '2017-02', summary: 'Securities settlements for International Custody via INDEVAL, DTC, EUROCLEAR, CREST, IBERCLEAR; income/corporate actions; multi-currency cash.', location: 'Tampa / St. Petersburg, FL' },
      { name: 'Citi', position: 'CSS AML Sr. Investigation Personnel', startDate: '2015-03', endDate: '2015-03', summary: 'Trained in BSA, USA PATRIOT Act, OFAC/sanctions and SAR requirements; Citi regulatory reporting systems and data-mining tools.', location: 'Tampa, FL' },
      { name: 'Cauchos la Mundial', position: 'Legal & Commercial Consultant — International Sales', startDate: '2012-03', endDate: '2014-03', summary: 'Legal and commercial advice on international transactions; contract drafting; import/export law; negotiated with distributors in China, Taiwan, the US and Panama.', location: 'Maracaibo, Venezuela' },
      { name: 'URBE & Centro Venezolano Americano del Zulia', position: 'English Teacher', startDate: '2010-02', endDate: '2012-03', summary: 'Taught English grammar and vocabulary; curriculum planning and assessments.', location: 'Maracaibo, Venezuela' }
    ],
    education: [
      { institution: 'Stetson University College of Law', studyType: 'Doctor of Law (JD)', area: 'Law', startDate: '2017', endDate: '2021' },
      { institution: 'INAFE', studyType: 'Associate of Science', area: 'Customs & International Commerce', startDate: '2012', endDate: '2013' },
      { institution: 'Universidad Rafael Belloso Chacín', studyType: 'Law Studies', area: 'Law' }
    ],
    certificates: [{ name: 'An Introduction to American Law', issuer: 'University of Pennsylvania Carey Law School' }],
    skills: [
      { name: 'Securities & Custody Operations', keywords: ['Securities & Derivatives', 'Trade processing & settlement', 'International custody', 'INDEVAL', 'DTC', 'EUROCLEAR', 'CREST', 'IBERCLEAR', 'Income & corporate actions', 'Multi-currency cash'] },
      { name: 'Compliance, AML & Risk', keywords: ['AML investigations', 'BSA', 'USA PATRIOT Act', 'OFAC / sanctions', 'SAR', 'KYC', 'Cross-border data clearance (CBAT)', 'Internal audit'] },
      { name: 'International Business & Law', keywords: ['International business', 'International law', 'Tax law', 'Import/export & customs', 'Contract drafting & negotiation', 'Legal translation'] }
    ],
    languages: [
      { language: 'English', fluency: 'Native or bilingual' },
      { language: 'Spanish', fluency: 'Native or bilingual' },
      { language: 'French', fluency: 'Elementary' },
      { language: 'Italian', fluency: 'Elementary' }
    ],
    meta: { slug: 'andreastagg', availability: 'open',
      targetRoles: 'Securities & Derivatives / Custody Operations Analyst; AML / Sanctions / Compliance Analyst; International Business & Trade / Legal Operations; Bilingual / Quadrilingual Institutional Client Servicing' }
  },

  juliana_gramowski: {
    basics: {
      name: 'Juliana Gramowski',
      label: 'Sales Executive · Business Development · Marketing Strategist',
      email: 'jgramowski7@gmail.com', phone: '+1 813-334-2244',
      url: 'https://julianagramowski.com',
      summary: 'Results-oriented Sales Executive with 10+ years in business development, advertising sales (Out-of-Home) and strategic marketing across the US and Latin America. Clear Channel Outdoor, IndoorMedia, JCDecaux, Televisa. Bilingual EN/ES.',
      location: { city: 'Tampa', region: 'FL', countryCode: 'US' },
      profiles: [{ network: 'LinkedIn', url: 'https://www.linkedin.com/in/juliana-gramowski-6270201a4' }]
    },
    work: [
      { name: 'Clear Channel Outdoor', position: 'Sales Executive', startDate: '2024-01', summary: 'Out-of-Home advertising sales and account growth.', location: 'Tampa, FL' },
      { name: 'IndoorMedia', position: 'Marketing Consultant', startDate: '2020', endDate: '2022', summary: 'Advertising and marketing consulting for local businesses.', location: 'Tampa, FL' },
      { name: 'German School', position: 'Marketing Director', startDate: '2018', endDate: '2019', summary: 'Led marketing strategy and communications.', location: 'Cali, Colombia' },
      { name: 'JCDecaux', position: 'Advertising Sales Representative', startDate: '2017', endDate: '2018', summary: 'Out-of-Home media sales.', location: 'Cali, Colombia' },
      { name: 'Televisa', position: 'Advertising Sales Executive', startDate: '2015', endDate: '2017', summary: 'Media advertising sales and client management.', location: 'Cali, Colombia' }
    ],
    education: [
      { institution: 'Konrad Lorenz University', studyType: "Master's Degree", area: 'Consumer Behavior', location: 'Bogotá, Colombia' },
      { institution: 'Pontificia Universidad Javeriana', studyType: "Bachelor's Degree", area: 'Social Communication', location: 'Bogotá, Colombia' },
      { institution: 'Universidad Pontificia Bolivariana', studyType: 'Certificate', area: 'Digital Marketing', location: 'Bogotá, Colombia' }
    ],
    skills: [
      { name: 'Sales & Business Development', keywords: ['Consultative selling', 'Account management', 'New business development', 'Revenue growth', 'Client relationships'] },
      { name: 'Advertising & Marketing', keywords: ['Out-of-Home (OOH) media', 'Advertising sales', 'Marketing strategy', 'Consumer behavior', 'Digital marketing'] }
    ],
    languages: [
      { language: 'English', fluency: 'Professional / bilingual' },
      { language: 'Spanish', fluency: 'Native or bilingual' }
    ],
    meta: { slug: 'juliana_gramowski', availability: 'open',
      targetRoles: 'Sales Executive / Account Executive; Advertising & Media Sales (OOH, digital); Business Development & Marketing Strategy; Client Relationship & Account Management' }
  }
};

// Stamp the JSON Resume schema marker onto a copy at serve time.
function getResume(slug) {
  const r = RESUMES[slug];
  if (!r) return null;
  return Object.assign({ $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json' }, r);
}
function listSlugs() { return Object.keys(RESUMES); }

module.exports = { RESUMES, getResume, listSlugs };
