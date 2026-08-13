'use strict';

/**
 * Seed: the owner account, the first profile, its saved searches, and the
 * verified skill store.
 *
 * On the verified seed: these terms come from the owner's OWN résumé, not from
 * a job posting. That is data entry from a document the owner wrote, with
 * source:'resume' recorded on every row — it is not the vocabulary -> verified
 * promotion that skills.js forbids, which is specifically about language
 * harvested from postings. Everything seeded here is reviewable and revocable
 * on the Skills screen.
 */

const bcrypt = require('bcryptjs');
const { User, Profile, Query, Skill } = require('../models');
const skills = require('./skills');

const OWNER_EMAIL = (process.env.CITIJOBS_OWNER_EMAIL || 'mstagg@digit2ai.com').toLowerCase();
const OWNER_PASSWORD = process.env.CITIJOBS_PASSWORD
  || process.env.SPEAKUP_TEAM_PASSWORD
  || process.env.LAWNCOPILOT_MSTAGG_PASSWORD
  || 'Palindrome@7';

// ── Manuel's base résumé, structured ─────────────────────────────────────────
// Tailoring SELECTS from these bullets and may never author a new one, so this
// object is the outer boundary of everything the app can ever print.
const MANUEL_RESUME = {
  headline: 'Senior Data & Analytics Lead · Data Transformation Program Delivery · Banking Risk, Compliance & Data Governance',
  contact: [
    'Wesley Chapel, Florida (Tampa Bay)',
    '(656) 600-1400',
    'manuelstagg@gmail.com',
    'manuelstagg.com'
  ],
  summary: 'Senior data and program delivery leader with 24+ years inside global banking at Citigroup, operating at the intersection of analytics, enterprise data governance, and large-scale transformation delivery. Led multi-workstream programs end to end — strategic analysis, data modeling, requirements traceability, execution, and regulator-facing close-out — across Business, Function and Technology units in NAM and EMEA. Deep hands-on record tuning statistical detection models and rule sets across six financial-crime analytics platforms against transaction volumes exceeding $1T, and delivering the enterprise architecture, taxonomy, lineage and metadata capabilities that underpinned Citi Consent Order remediation. Equally comfortable at the strategy table with senior stakeholders and in the granular detail of a data model. Fully bilingual English/Spanish.',
  competencies: [
    { label: 'Program Delivery at Scale', text: 'End-to-end ownership of complex, multi-workstream programs; scope, timeline and delivery-approach negotiation with senior stakeholders; SDLC / MSF / Agile-SCRUM; Jama, Requirements Traceability Matrix (RTM), Confluence; structured risk, issue and dependency management; change management and lessons-learned feedback loops.' },
    { label: 'Data Science & Advanced Analytics', text: 'Statistical model tuning and risk modeling on high-volume banking data; detection-logic redesign; rule-set and threshold calibration; alert-population analysis and false-positive reduction; segmentation; scoring models; data mining and BI; SQL and data warehousing; ML-assisted screening (Silent Eight).' },
    { label: 'Data Governance, Lineage & Metadata', text: 'Citi Enterprise Architecture Methodology (CEAM); conceptual and target-state process models; application mapping and periodic attestation; consistent enterprise taxonomies; Citi Process Management (CPM), DataVerse, MetaVerse, Operating Fact Manager (OFM); data quality and audit-grade documentation.' },
    { label: 'Banking Platforms & Data Flow', text: 'OFSAA (Oracle Financial Services Analytics), Oracle Mantas, Actimize, FircoSoft Continuity, Appian OnDemand Party Screening, Silent Eight; core KYC/AML, sanctions screening, transaction monitoring and case-management data flows across complex financial systems.' },
    { label: 'Regulatory Context', text: 'OCC, OFAC (SDN), UK HMT, United Nations Security Council, FinCEN; regulatory reporting and examination readiness; SAR and complex investigations; controls and audit.' },
    { label: 'Stakeholder Communication', text: 'Translating complex analytical findings into clear executive narratives; bridging business leadership and technology teams; bilingual EN/ES delivery across geographies.' }
  ],
  roles: [
    {
      id: 'cti',
      title: 'Citigroup — SME, Data Services / Citi Technology Infrastructure (CTI)',
      meta: 'Enterprise Architecture (CEAM) · Citi Consent Order Program',
      bullets: [
        { id: 'cti-1', text: 'Led delivery of enterprise data-governance capabilities across multiple technical teams, building new and incremental capabilities and integrations into the services and business processes of the Citi Enterprise Architecture Methodology (CEAM).' },
        { id: 'cti-2', text: 'Supported Citi Consent Order remediation by delivering CEAM capabilities that provided consistent enterprise taxonomies aligned to conceptual and target-state business process models — directly addressing regulator-identified data and governance gaps.' },
        { id: 'cti-3', text: 'Designed and delivered the attestation and application-mapping tooling for conceptual and target-state process models, plus change-management capabilities that keep CEAM artifacts accurate and complete across every managed segment, geography and product.' },
        { id: 'cti-4', text: 'Advanced the enterprise data and metadata stack — Citi Process Management (CPM), DataVerse, MetaVerse and Operating Fact Manager (OFM) — improving lineage, ownership and traceability of data assets used for regulatory and management reporting.' },
        { id: 'cti-5', text: 'Optimized analytics and screening platforms — OFSAA, Oracle Mantas and Actimize transaction screening — through rule-set tuning and configuration analysis against production alert populations.' },
        { id: 'cti-6', text: 'Calibrated OFAC (SDN) rule sets for North America and EMEA under United Nations Security Council requirements, sustaining compliance with OCC, OFAC, UK HMT, UN and FinCEN obligations.' },
        { id: 'cti-7', text: 'Ran delivery against SDLC, MSF and Agile/SCRUM, using Jama for requirements management, Confluence for program documentation, and a Requirements Traceability Matrix (RTM) to keep scope, build and evidence provably aligned end to end.' }
      ]
    },
    {
      id: 'fcrm',
      title: 'Citigroup / SolomonEdwards (Silicon Valley Bank engagement) — SME, Financial Crimes Risk Management (FCRM)',
      meta: 'Fraud, Sanctions, KYC and AML analytics platforms',
      bullets: [
        { id: 'fcrm-1', text: 'Individual-contributor SME across the Financial Crimes disciplines — Fraud, Sanctions, KYC and AML — partnering with each team to build new and incremental capabilities and integrate them into FCRM systems and business processes.' },
        { id: 'fcrm-2', text: 'Tuned and optimized six FCRM analytics platforms over three years — OFSAA, FircoSoft Continuity, Appian OnDemand Party Screening, Silent Eight machine learning, Oracle Mantas and Actimize transaction screening — refining rule sets, thresholds and match logic against live alert populations.' },
        { id: 'fcrm-3', text: 'Analyzed high-volume transaction and party data to redesign detection logic and enrich it with better reference data, materially reducing investigative noise and alert cycle time without weakening detection coverage.' },
        { id: 'fcrm-4', text: 'Owned multiple project implementations concurrently, providing traceability and tracking for innovative software and data-warehousing solutions across a varied book of work and several stakeholder groups.' },
        { id: 'fcrm-5', text: 'Calibrated OFAC (SDN) rule sets for North America and EMEA sanctions rule sets under United Nations Security Council regulatory requirements.' },
        { id: 'fcrm-6', text: 'Ensured the bank met legal and regulatory obligations — OCC, OFAC, UK HMT, UN and FinCEN — and remained appropriately protected against financial crime affecting the institution or its clients.' },
        { id: 'fcrm-7', text: 'Delivered aligned to the Modern Solutions Framework (MSF) and Agile/SCRUM principles, applying advanced program-management technique across cross-functional teams.' }
      ]
    },
    {
      id: 'citi-prog',
      title: 'Citigroup — Banking, Compliance, Risk & Enterprise Technology (progressive roles)',
      meta: 'Tier-1 institutional scale · Global programs',
      bullets: [
        { id: 'prog-1', text: 'Led global KYC/AML programs — customer due diligence, enhanced due diligence and periodic review — across institutional client portfolios.' },
        { id: 'prog-2', text: 'Directed sanctions and OFAC screening operations, transaction monitoring, alert adjudication, SAR filing and complex financial-crime investigations at Tier-1 scale, covering monitored and filtered transactional flows exceeding $1T.' },
        { id: 'prog-3', text: 'Owned regulatory reporting and examination readiness, translating FinCEN, OFAC and global regulator obligations into operating controls and measurable process outcomes.' },
        { id: 'prog-4', text: 'Drove technology integration across compliance and risk platforms — screening engines, case management, monitoring systems and data pipelines — as the single point of contact between business owners and engineering.' },
        { id: 'prog-5', text: 'Strengthened the control environment through risk modeling, quality assurance, model tuning and audit-grade documentation.' },
        { id: 'prog-6', text: 'Led and built cross-disciplinary teams spanning compliance, risk, operations and technology in a highly regulated, high-impact environment.' }
      ]
    },
    {
      id: 'independent',
      title: 'Independent AI Solutions Architecture — Self-Directed Practice (outside Citi)',
      meta: 'Applied data engineering and AI systems',
      note: 'Stated plainly for accuracy: this is self-taught, hands-on work built and deployed on my own initiative and my own infrastructure. It was NOT performed at, for, or on behalf of Citigroup, and no Citi data, systems or environments were involved.',
      bullets: [
        { id: 'ind-1', text: 'Architected and deployed 20+ production systems across banking, freight, healthcare, retail, education and B2B network verticals — owning requirements, data model, backend, front end, SIT/UAT and continuous deployment.' },
        { id: 'ind-2', text: 'Built multi-tenant analytics and reasoning platforms on Node.js and PostgreSQL with strict per-client data isolation, cost ceilings, model routing and observability — the same control-environment discipline learned in banking, applied to modern data systems.' },
        { id: 'ind-3', text: 'Designed multi-agent orchestration over the open Model Context Protocol (MCP), connecting live operational systems (CRM, telephony, finance, inventory, compliance) so that analysis, human approval workflow and full auditability sit in one traceable path.' },
        { id: 'ind-4', text: 'Kept current, hands-on fluency in SQL and PostgreSQL data modeling, JSONB/GIN indexing, migrations, REST/API integration, statistical scoring models, Monte Carlo simulation and evaluation design — directly transferable to modern data-transformation delivery.' }
      ]
    }
  ],
  skills: [
    { label: 'Data & Analytics', text: 'Statistical model tuning · Risk and scoring models · Rule-set / threshold calibration · Alert-population analysis · Monte Carlo simulation · Data mining · BI · Data warehousing · Data quality' },
    { label: 'Platforms', text: 'OFSAA · Oracle Mantas · Actimize · FircoSoft Continuity · Appian OnDemand Party Screening · Silent Eight (ML) · Splunk' },
    { label: 'Data & Databases', text: 'SQL · PostgreSQL · Microsoft SQL Server · MySQL · Microsoft Access · Sequelize ORM · Multi-tenant schema design · Migrations · JSONB / GIN indexing' },
    { label: 'Governance & Architecture', text: 'CEAM · CPM · DataVerse · MetaVerse · Operating Fact Manager (OFM) · Data lineage · Metadata management · Taxonomy design · Consent Order remediation' },
    { label: 'Delivery', text: 'SDLC · MSF · Agile / SCRUM · Jama · Requirements Traceability Matrix (RTM) · Confluence · Jira · SharePoint workflows · Change management · CI/CD' },
    { label: 'Engineering', text: 'Python · JavaScript (ES6+) · Node.js / Express · React · REST API design · Bash · Git/GitHub · AWS · Webhooks / n8n' },
    { label: 'Languages', text: 'English and Spanish — fully bilingual, written and spoken' }
  ],
  education: [
    '[Degree, Major] — [Institution], [City, State] — [Year]',
    '[Certifications — CAMS, PMP, Scrum, cloud or data credentials — or delete this line]'
  ]
};

function flatten(rj) {
  return [
    rj.headline, rj.summary,
    ...(rj.competencies || []).map((c) => `${c.label}: ${c.text}`),
    ...(rj.roles || []).flatMap((r) => [r.title, r.meta, r.note, ...(r.bullets || []).map((b) => b.text)]),
    ...(rj.skills || []).map((s) => `${s.label}: ${s.text}`)
  ].filter(Boolean).join('\n');
}

// Saved searches. Many targeted queries, deduped by req id — never one
// firehose, because Workday caps a search's reported total at 2000.
// Citi's Workday caps a search total at 2000, so its set is deliberately many
// narrow queries. JPMorgan's Oracle feed reports the true count and can be
// paged, so its set is fewer, broader queries — same coverage, fewer requests.
const SEED_QUERIES = [
  { employer: 'citi', label: 'Data transformation', search_text: 'data transformation', weight: 3 },
  { employer: 'citi', label: 'Data governance', search_text: 'data governance', weight: 3 },
  { employer: 'citi', label: 'Data analytics lead', search_text: 'data analytics lead', weight: 3 },
  { employer: 'citi', label: 'Program delivery', search_text: 'program delivery', weight: 2 },
  { employer: 'citi', label: 'Data lineage / metadata', search_text: 'data lineage metadata', weight: 2 },
  { employer: 'citi', label: 'AML / sanctions analytics', search_text: 'sanctions screening analytics', weight: 2 },
  { employer: 'citi', label: 'Enterprise architecture', search_text: 'enterprise architecture', weight: 1.5 },
  { employer: 'citi', label: 'Tampa', search_text: 'Tampa data', weight: 1.5 },

  { employer: 'jpmorgan', label: 'JPMC data governance', search_text: 'data governance', weight: 3 },
  { employer: 'jpmorgan', label: 'JPMC data transformation', search_text: 'data transformation', weight: 3 },
  { employer: 'jpmorgan', label: 'JPMC program delivery', search_text: 'program delivery', weight: 2 },
  { employer: 'jpmorgan', label: 'JPMC data lineage', search_text: 'data lineage', weight: 2 },
  { employer: 'jpmorgan', label: 'JPMC sanctions / AML', search_text: 'sanctions compliance', weight: 2 }
];

// Verified skills lifted from the owner's own résumé (source:'resume').
const SEED_VERIFIED = [
  ['data governance', 'CEAM data-governance capability delivery at Citi Technology Infrastructure.'],
  ['data lineage', 'Advanced CPM, DataVerse, MetaVerse and OFM to improve lineage and traceability of data assets.'],
  ['metadata management', 'Owned metadata stack work across CPM/DataVerse/MetaVerse/Operating Fact Manager.'],
  ['data quality', 'Data quality and audit-grade documentation across CEAM artifacts.'],
  ['data warehousing', 'Traceability and tracking for software and data-warehousing solutions at FCRM.'],
  ['enterprise architecture', 'Citi Enterprise Architecture Methodology (CEAM) delivery and attestation tooling.'],
  ['taxonomy', 'Consistent enterprise taxonomies aligned to conceptual and target-state process models.'],
  ['consent order', 'Delivered CEAM capabilities supporting Citi Consent Order remediation.'],
  ['statistical modeling', 'Statistical model tuning and risk modeling on high-volume banking data.'],
  ['risk management', 'Risk modeling, quality assurance and control-environment strengthening at Tier-1 scale.'],
  ['segmentation', 'Rule-set, threshold and match-logic calibration against live alert populations.'],
  ['data mining', 'Data mining and BI across compliance and risk data.'],
  ['transaction monitoring', 'Directed transaction monitoring and alert adjudication at Tier-1 scale.'],
  ['sanctions screening', 'Ran sanctions/OFAC screening operations; calibrated SDN rule sets for NAM and EMEA.'],
  ['ofac', 'Calibrated OFAC (SDN) rule sets for North America and EMEA.'],
  ['aml', 'Led global KYC/AML programs across institutional client portfolios.'],
  ['kyc', 'Customer due diligence, enhanced due diligence and periodic review programs.'],
  ['financial crime', 'SME across Fraud, Sanctions, KYC and AML at Citigroup and SolomonEdwards.'],
  ['regulatory reporting', 'Owned regulatory reporting and examination readiness (FinCEN, OFAC, OCC).'],
  ['fincen', 'Translated FinCEN obligations into operating controls.'],
  ['program management', 'Multiple concurrent implementations across several stakeholder groups.'],
  ['program delivery', 'End-to-end delivery of multi-workstream programs through to regulator-facing close-out.'],
  ['stakeholder management', 'Negotiated scope, timeline and delivery approach with senior stakeholders.'],
  ['change management', 'CEAM change-management capabilities keeping artifacts accurate across segments.'],
  ['requirements traceability', 'Jama plus a Requirements Traceability Matrix (RTM) across the delivery lifecycle.'],
  ['sdlc', 'Delivered against SDLC, MSF and Agile/SCRUM.'],
  ['agile', 'Agile/SCRUM delivery across cross-functional teams.'],
  ['scrum', 'Agile/SCRUM principles and practices on FCRM and CTI programs.'],
  ['sql', 'SQL and data modeling across PostgreSQL, SQL Server and MySQL.'],
  ['python', 'Python in the independent engineering practice.'],
  ['ofsaa', 'Tuned and optimized OFSAA (Oracle Financial Services Analytics).'],
  ['actimize', 'Optimized Actimize transaction screening rule sets.'],
  ['mantas', 'Optimized Oracle Mantas transaction screening.'],
  ['jama', 'Jama for requirements management on CTI programs.'],
  ['confluence', 'Confluence for program documentation.'],
  ['controls', 'Controls and audit; audit-grade documentation.'],
  ['audit', 'Audit-grade documentation and control-environment assurance.'],
  ['business intelligence', 'BI and data mining across compliance and risk platforms.'],
  ['machine learning', 'Tuned Silent Eight machine-learning screening as a platform SME.'],
  ['data modeling', 'Data modeling across program delivery and the independent practice.']
];

async function seedAll() {
  // Owner
  let user = await User.findOne({ where: { email: OWNER_EMAIL } });
  const hash = await bcrypt.hash(OWNER_PASSWORD, 10);
  if (!user) {
    user = await User.create({ email: OWNER_EMAIL, name: 'Manuel Stagg', password_hash: hash, role: 'owner' });
    user.tenant_id = user.id;
    await user.save();
  } else {
    // Password is force-synced from env so the owner is never locked out of
    // their own tracker; there is no self-signup to recover through.
    user.password_hash = hash;
    if (!user.tenant_id) user.tenant_id = user.id;
    await user.save();
  }
  const tenant_id = user.tenant_id;

  // Profile
  let profile = await Profile.findOne({ where: { tenant_id, slug: 'manuel-stagg' } });
  if (!profile) {
    profile = await Profile.create({
      tenant_id,
      slug: 'manuel-stagg',
      display_name: 'Manuel Stagg',
      headline: MANUEL_RESUME.headline,
      resume_json: MANUEL_RESUME,
      resume_text: flatten(MANUEL_RESUME),
      target_titles: [
        'Data Analytics Lead', 'Senior Data & Analytics Lead', 'Data Transformation',
        'Data Governance Lead', 'Program Delivery', 'Program Manager', 'Data Science Senior Lead',
        'Enterprise Architecture', 'Financial Crimes', 'Sanctions', 'AML'
      ],
      target_locations: ['Tampa', 'Florida', 'Jacksonville', 'Remote'],
      countries: ['United States'],
      internal: false,
      score_threshold: 70
    });
  } else if (!profile.resume_json || !profile.resume_json.roles) {
    profile.resume_json = MANUEL_RESUME;
    profile.resume_text = flatten(MANUEL_RESUME);
    await profile.save();
  }

  // Saved searches (idempotent by search_text)
  for (const q of SEED_QUERIES) {
    const employer = q.employer || 'citi';
    const exists = await Query.findOne({ where: { tenant_id, employer, search_text: q.search_text } });
    if (!exists) {
      await Query.create({ tenant_id, profile_id: null, employer, label: q.label,
        search_text: q.search_text, weight: q.weight, max_pages: employer === 'citi' ? 3 : 4, source: 'seed' });
    }
  }

  // Verified skills from the owner's own résumé
  let added = 0;
  for (const [term, evidence] of SEED_VERIFIED) {
    const norm = skills.normalize(term);
    const exists = await Skill.findOne({ where: { profile_id: profile.id, norm } });
    if (exists) continue;
    await Skill.create({
      tenant_id, profile_id: profile.id, term, norm,
      kind: skills.KIND.VERIFIED, evidence, confirmed_at: new Date(),
      source: 'resume', weight: 2.0
    });
    added++;
  }

  return { user, profile, verified_added: added };
}

module.exports = { seedAll, MANUEL_RESUME, SEED_QUERIES, SEED_VERIFIED, flatten, OWNER_EMAIL };
