'use strict';

/**
 * CaseGuard — seeded knowledge base.
 *
 * Two bodies of reference material loaded into cg_policies at seed time:
 *   1. FOI_POLICIES  - Florida Orthopaedic Institute's OWN published, patient-facing
 *                      policies & procedures, verified against floridaortho.com via a
 *                      25-claim, 3-vote adversarial deep-research pass (July 2026).
 *                      These are the "as published" baseline the case is measured against.
 *   2. REGULATORY    - The external authorities and standards to research/escalate to
 *                      (FL Statutes, FAC, AHCA, FL DOH, Boards, CMS, Joint Commission,
 *                      ACR, AAOS) with the specific angle relevant to this matter.
 *
 * Everything here is sourced. Nothing is invented. Where a specific citation/number
 * still needs to be pulled from the authority, `verified:false` + a research pointer
 * is used rather than a fabricated statute number.
 */

// ── (a) FOI published patient-facing policies (verified primary source) ──────────
const FOI_POLICIES = [
  {
    authority: 'FOI', category: 'org_policy', verified: true,
    title: 'Orthopedic Urgent Care — distinct walk-in service line (6 locations)',
    citation: 'floridaortho.com/specialties/orthopaedic-urgent-care/',
    source_url: 'https://www.floridaortho.com/specialties/orthopaedic-urgent-care/',
    body: 'FOI operates a distinct "Orthopedic Urgent Care" service line with six named walk-in locations: Brandon (560 S Lakewood Dr Ste 101, Brandon FL 33511, (813) 657-0507); Clearwater (3131 N McMullen Booth Rd, (727) 473-4717); Gainesville (7540 W University Ave, (352) 776-0400); North Tampa/Temple Terrace (5901 E Fowler Ave Ste 100, Temple Terrace FL 33617, (813) 903-6999); South Tampa/Dale Mabry (909 N Dale Mabry Hwy, Tampa FL 33609, (813) 287-9372); St. Petersburg (10051 5th St N, St Petersburg FL 33702, (727) 527-5272). Most locations open Mon-Thu 8a-8p, Fri 8a-4p, Sat 8a-3p; St. Petersburg Mon-Fri 8a-12p & 1p-4p, Sat 8a-3p.',
    relevance: 'Establishes that the same organization runs the urgent care and the specialist clinics under one roof — the basis for the "why substantially different care within the same organization" question.'
  },
  {
    authority: 'FOI', category: 'org_policy', verified: true,
    title: 'Conditions treated at Urgent Care vs. directed to the ER',
    citation: 'floridaortho.com/specialties/orthopaedic-urgent-care/ (ER-vs-urgent-care comparison)',
    source_url: 'https://www.floridaortho.com/specialties/orthopaedic-urgent-care/',
    body: 'Treated on-site: sprains, strains, fractures; sports & work-related injuries; shoulder/knee/ankle/wrist pain; back & neck injuries; swollen or painful joints; suspected broken bones. Directed to the ER: severe bleeding, chest pain, difficulty breathing, major burns, deformity after injury, compound/open fracture, head injury/loss of consciousness, whiplash.',
    relevance: 'Severe wrist pain / swollen or painful joints is squarely within FOI Urgent Care\'s own published scope — supports the concern that the urgent-care workup (no labs, no MRI, no brace, no meaningful pain management) fell short of what the specialist then ordered.'
  },
  {
    authority: 'FOI', category: 'org_policy', verified: true,
    title: 'Walk-in policy — no appointment necessary; same-day specialist',
    citation: 'floridaortho.com/appointments/ + location pages',
    source_url: 'https://www.floridaortho.com/appointments/',
    body: '"No appointment necessary" — walk in during urgent-care hours or schedule online. Same-day access to an orthopedic specialist. HMO patients need prior authorization / PCP referral first (FOI is credentialed as a specialist group, not a general urgent care); advises contacting the PCP ~3 days ahead.',
    relevance: 'Access/authorization baseline; relevant if any access or authorization friction is part of the timeline.'
  },
  {
    authority: 'FOI', category: 'org_policy', verified: true,
    title: 'Registration / intake procedure',
    citation: 'floridaortho.com/patients-visitors/your-visit/',
    source_url: 'https://www.floridaortho.com/patients-visitors/your-visit/',
    body: 'Bring: insurance card, photo ID, current medications list, any MRI/CT report with film/CD, and X-rays of the injury. At check-in FOI copies insurance card + ID, verifies database info, provides forms to complete/sign, and collects the copayment. (This is FOI\'s general Plan-Your-Visit page, not an urgent-care-specific walk-in page.)',
    relevance: 'Documents the standard intake FOI itself publishes; a baseline to compare against what actually happened at each encounter.'
  },
  {
    authority: 'FOI', category: 'org_policy', verified: true,
    title: 'Telemedicine / telehealth policy',
    citation: 'floridaortho.com/services/telehealth-page/',
    source_url: 'https://www.floridaortho.com/services/telehealth-page/',
    body: 'Schedule by calling (813) 978-9797 and requesting a telemedicine visit; the team assesses eligibility before scheduling. Used for consultation, diagnostic-test review, and post-procedure follow-up. "A patient would be required to come into the office should they need a physical exam or further diagnostic testing."',
    relevance: 'Relevant to whether remote follow-up / triage was offered when the patient\'s condition deteriorated.'
  },
  {
    authority: 'FOI', category: 'org_policy', verified: true,
    title: 'Cancellation / no-show fee schedule (effective June 1, 2024)',
    citation: 'floridaortho.com/appointments/',
    source_url: 'https://www.floridaortho.com/appointments/',
    body: 'No-show/late-cancel fees: $25 office/therapy; $100 diagnostics (MRI, CT, EMG, MRA); $200 in-office procedures; $200 surgery. Billed to the patient (not insurance), due at the next office visit. 24-hour cancellation notice required (72 hours for surgery).',
    relevance: 'Documents that FOI enforces a formal patient-obligations policy; useful context on the asymmetry of patient vs. provider obligations.'
  },
  {
    authority: 'FOI', category: 'org_policy', verified: true,
    title: 'Billing & insurance; Financial Counselor contact',
    citation: 'floridaortho.com/patients-visitors/billing-insurance/',
    source_url: 'https://www.floridaortho.com/patients-visitors/billing-insurance/',
    body: 'FOI "participates with most major carriers"; patients must verify participation. Office visits need authorization 3-5 days prior; MRI/CT/EMG need insurer authorization. Financial Counselor: (813) 978-9700 ext. 6052. Patient portal powered by athenahealth.',
    relevance: 'Billing/authorization baseline and a live contact channel.'
  },
  {
    authority: 'FOI', category: 'contact', verified: true,
    title: 'FOI main contact points',
    citation: 'floridaortho.com',
    source_url: 'https://www.floridaortho.com/',
    body: 'General/office line (813) 978-9700; Telemedicine scheduling (813) 978-9797; Financial Counselor (813) 978-9700 ext. 6052; patient portal via athenahealth. Corporate/executive and Corporate Compliance contacts are NOT published on the patient site and must be requested directly.',
    relevance: 'Starting contact set for internal escalation to FOI Executive Leadership and Corporate Compliance.'
  },
  {
    authority: 'FOI', category: 'org_policy', verified: false,
    title: 'GAP — no published protocol for patient deterioration during/after imaging',
    citation: 'Not found on floridaortho.com (targeted search, July 2026)',
    source_url: 'https://www.floridaortho.com/specialties/orthopaedic-urgent-care/',
    body: 'A targeted deep-research pass found NO public FOI policy covering: (1) what happens when a patient\'s condition deteriorates during or after a diagnostic imaging study; (2) whether imaging centers stock/administer rescue medication or have a provider available to evaluate an acutely worsening patient; (3) urgent-care-specific workers\' comp / auto-injury (PIP) intake; (4) minors/pediatric consent; (5) infection-control protocols; (6) the referral/follow-up pathway from urgent care into the specialist clinics. No internal operational/clinical policy-and-procedure manuals are publicly available.',
    relevance: 'Directly on point for the imaging-center incident (pain to 10/10, told no medication available, NP later confirmed the imaging center stocks no medications). The ABSENCE of a published deterioration/rescue policy is itself a finding to raise with FOI Compliance, AHCA, and the ACR.'
  }
];

// ── (b) External regulatory authorities & standards to research/escalate ─────────
const REGULATORY = [
  {
    authority: 'FL Statutes', category: 'statute', verified: false,
    title: 'Florida Patient\'s Bill of Rights and Responsibilities',
    citation: 'Fla. Stat. ch. 381.026 (verify current text)',
    source_url: 'http://www.leg.state.fl.us/statutes/',
    body: 'Florida\'s statutory Patient\'s Bill of Rights (access to care, treatment, information, and a mechanism for grievances). Pull the current text and the specific subsections on the right to appropriate treatment and to have grievances addressed.',
    relevance: 'Frames a patient-rights basis for the complaint about inadequate treatment and lack of a deterioration response.'
  },
  {
    authority: 'FL Statutes', category: 'statute', verified: false,
    title: 'Grounds for discipline — medical practice',
    citation: 'Fla. Stat. ch. 456.072 & ch. 458 (verify)',
    source_url: 'http://www.leg.state.fl.us/statutes/',
    body: 'General disciplinary grounds applicable across health professions (456.072) and the Medical Practice Act (458). Includes failure to meet the applicable standard of care. Identify the exact subsection covering standard-of-care failures and inadequate records.',
    relevance: 'Statutory hook for a Board of Medicine complaint re: the disparate/inadequate urgent-care evaluation.'
  },
  {
    authority: 'FL Admin Code', category: 'rule', verified: false,
    title: 'AHCA facility licensure & standards (FAC 59A)',
    citation: 'Fla. Admin. Code ch. 59A (verify applicable part)',
    source_url: 'https://www.flrules.org/',
    body: 'Agency for Health Care Administration rules governing licensed health care facilities and clinics. Determine which 59A part covers the specific FOI facility types (physician group / clinic / imaging) and any patient-safety / emergency-response requirements.',
    relevance: 'Regulatory standard against which FOI\'s imaging-center emergency-response gap can be tested.'
  },
  {
    authority: 'AHCA', category: 'contact', verified: true,
    title: 'AHCA — file a health care facility complaint',
    citation: 'Agency for Health Care Administration',
    source_url: 'https://ahca.myflorida.com/health-care-policy-and-oversight/bureau-of-field-operations/file-a-complaint',
    body: 'AHCA licenses and investigates health care facilities in Florida. Complaints can be filed online, by phone (Complaint Hotline 1-888-419-3456), or by mail. AHCA investigates facility-level failures (as opposed to individual licensure, which is DOH/boards).',
    relevance: 'Primary external escalation channel for a facility-level failure (imaging center had no medication and no immediately available provider for a deteriorating patient).'
  },
  {
    authority: 'FL DOH', category: 'contact', verified: true,
    title: 'Florida Department of Health — file a complaint against a licensee',
    citation: 'Florida Department of Health, Medical Quality Assurance',
    source_url: 'https://www.flhealthsource.gov/enforcement/',
    body: 'DOH / Medical Quality Assurance handles complaints against individually licensed practitioners (physicians, NPs, PAs). Online complaint portal and downloadable complaint form. DOH refers to the appropriate board (Medicine, Nursing) for investigation.',
    relevance: 'Channel for complaints about the individual urgent-care provider and any NP conduct.'
  },
  {
    authority: 'Board of Medicine', category: 'contact', verified: true,
    title: 'Florida Board of Medicine',
    citation: 'Florida Board of Medicine (under DOH)',
    source_url: 'https://flboardofmedicine.gov/',
    body: 'Licenses and disciplines MDs. Complaints flow through DOH/MQA. Look up each involved physician\'s license, disciplinary history, and profile (via flhealthsource.gov license verification).',
    relevance: 'Verify the urgent-care physician\'s licensure and history; venue for a standard-of-care complaint.'
  },
  {
    authority: 'Board of Nursing', category: 'contact', verified: true,
    title: 'Florida Board of Nursing',
    citation: 'Florida Board of Nursing (under DOH)',
    source_url: 'https://floridasnursing.gov/',
    body: 'Licenses and disciplines RNs/APRNs/NPs. Complaints flow through DOH/MQA. Look up the imaging-center NP\'s license and scope.',
    relevance: 'Relevant to the NP encounter at the imaging center and the medication-availability explanation given.'
  },
  {
    authority: 'CMS', category: 'standard', verified: false,
    title: 'CMS Conditions for Coverage / Conditions of Participation',
    citation: 'CMS CfC/CoP (verify applicability to the facility type)',
    source_url: 'https://www.cms.gov/medicare/health-safety-standards/quality-safety-oversight-guidance-laws-regulations',
    body: 'If any FOI facility bills Medicare, applicable CMS Conditions may impose patient-safety and emergency-preparedness expectations. Determine whether the imaging site is a Medicare-enrolled supplier subject to relevant conditions.',
    relevance: 'Potential federal standard for emergency preparedness at an imaging facility.'
  },
  {
    authority: 'Joint Commission', category: 'accreditation', verified: false,
    title: 'The Joint Commission — accreditation & complaint (Quality Report)',
    citation: 'The Joint Commission Office of Quality and Patient Safety',
    source_url: 'https://www.jointcommission.org/resources/patient-safety-topics/report-a-patient-safety-event/',
    body: 'If FOI (or its imaging arm) is Joint Commission accredited, patient-safety events can be reported to the Office of Quality and Patient Safety. First confirm accreditation status via the TJC Quality Check directory.',
    relevance: 'Accreditation-body escalation channel for patient-safety events; confirm accreditation first.'
  },
  {
    authority: 'ACR', category: 'accreditation', verified: false,
    title: 'American College of Radiology — imaging facility accreditation & standards',
    citation: 'American College of Radiology accreditation program',
    source_url: 'https://www.acraccreditation.org/',
    body: 'ACR accredits imaging facilities and publishes practice parameters, including for MRI safety and patient management. Determine whether the FOI imaging center is ACR-accredited and review the applicable MRI safety / patient-care parameters (e.g., managing patients who become symptomatic during imaging).',
    relevance: 'Directly on point for whether the imaging center met accepted standards for managing a patient whose pain escalated during/after the MRI.'
  },
  {
    authority: 'AAOS', category: 'standard', verified: false,
    title: 'American Academy of Orthopaedic Surgeons — clinical practice guidance',
    citation: 'AAOS clinical practice guidelines & appropriate use criteria',
    source_url: 'https://www.aaos.org/quality/',
    body: 'AAOS publishes clinical practice guidelines and appropriate-use criteria relevant to evaluation and management of acute wrist/joint injuries (imaging indications, when advanced imaging and inflammatory workup are appropriate).',
    relevance: 'Supports the standard-of-care comparison between the urgent-care evaluation and the specialist\'s subsequent workup (labs, MRI, brace, Medrol Dose Pack).'
  }
];

module.exports = { FOI_POLICIES, REGULATORY };
