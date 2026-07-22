'use strict';

/**
 * CaseGuard — seed the Florida Orthopaedic Institute (FOI) administrative-review case
 * for the owner's tenant. Idempotent: only creates the case + its knowledge base and
 * starter records once (keyed on a stable case title). Never duplicates on restart.
 *
 * Seeds:
 *  - the case container (title, subject org, objective)
 *  - the knowledge base (FOI published policies + regulatory authorities) into cg_policies
 *  - the two care encounters + imaging incident as timeline events
 *  - the central contradiction (disparate care within one organization)
 *  - the policy-comparison rows (urgent care vs specialist; imaging deterioration gap)
 *  - the outstanding questions
 *  - the planned escalation targets
 */

const {
  User, Case, Policy, TimelineEvent, Contradiction, Comparison, Question, Escalation
} = require('../models');
const { FOI_POLICIES, REGULATORY } = require('./knowledge');

const CASE_TITLE = 'Florida Orthopaedic Institute — Administrative Review';

async function seedCase() {
  const owner = await User.findOne({ where: { email: 'mstagg@digit2ai.com' } });
  if (!owner) return { seeded: false, reason: 'owner not found' };
  const tenant_id = owner.tenant_id || owner.id;

  const existing = await Case.findOne({ where: { tenant_id, title: CASE_TITLE } });
  if (existing) {
    const pol = await Policy.count({ where: { tenant_id, case_id: existing.id } });
    return { seeded: false, case_id: existing.id, policies: pol };
  }

  const kase = await Case.create({
    tenant_id, user_id: owner.id, title: CASE_TITLE,
    subject_org: 'Florida Orthopaedic Institute (FOI)',
    summary:
      'Administrative review of care received at Florida Orthopaedic Institute for severe wrist pain. ' +
      'The Orthopedic Urgent Care evaluation (no labs, no inflammatory workup, no MRI, no brace, steroid ' +
      'discussed but apparently not transmitted, no meaningful pain management) differed substantially from ' +
      'the subsequent Hand Specialist evaluation within the same organization (CBC + inflammatory labs, MRI ' +
      'ordered, wrist brace, Medrol Dose Pack, emergency precautions). Separately, during/after an MRI at an ' +
      'FOI imaging center the patient\'s pain escalated to 10/10; was initially told medication was ' +
      'unavailable and provider evaluation unavailable; could not safely leave the parking lot; returned and ' +
      'was evaluated by an NP who explained the imaging center stocks no medications.',
    objective:
      'Accountability, patient safety, and preventing similar experiences for future patients: (1) understand ' +
      'why substantially different care was provided within the same organization, and (2) determine whether ' +
      'FOI has adequate policies for patients whose condition deteriorates during or after diagnostic imaging.',
    status: 'open', priority: 'high'
  });
  const cid = kase.id;

  // Knowledge base
  const policies = [...FOI_POLICIES, ...REGULATORY].map(p => ({ ...p, tenant_id, case_id: cid }));
  await Policy.bulkCreate(policies);

  // Timeline (dates left null — the owner fills exact dates; order preserved by category/detail)
  await TimelineEvent.bulkCreate([
    { tenant_id, case_id: cid, category: 'clinical', location: 'FOI Orthopedic Urgent Care',
      title: 'Orthopedic Urgent Care visit — severe wrist pain',
      detail: 'Severe wrist pain. No labs. No inflammatory workup. No MRI ordered. No brace. Steroid discussed but apparently not transmitted. No meaningful pain management.' },
    { tenant_id, case_id: cid, category: 'clinical', location: 'FOI Hand Specialist',
      title: 'Hand Specialist visit — full workup',
      detail: 'CBC and inflammatory labs ordered. MRI ordered. Wrist brace provided. Medrol Dose Pack prescribed. Emergency precautions given.' },
    { tenant_id, case_id: cid, category: 'imaging', location: 'FOI Imaging Center',
      title: 'MRI — pain escalated to 10/10, no rescue medication available',
      detail: 'MRI significantly increased pain (reached 10/10). Requested medication; initially informed medication unavailable and provider evaluation unavailable. Could not safely leave the parking lot due to pain. Returned and was evaluated by an NP, who explained the imaging center stocks no medications.' }
  ]);

  // Central contradiction
  await Contradiction.bulkCreate([
    { tenant_id, case_id: cid, severity: 'high', detected_by: 'user',
      title: 'Disparate care for the same complaint within one organization',
      description: 'The same organization (FOI) provided substantially different diagnostic workup and treatment for the same wrist complaint: minimal at Urgent Care vs. comprehensive at the Hand Specialist.',
      statement_a: 'Urgent Care: no labs, no inflammatory workup, no MRI, no brace, steroid not transmitted, no meaningful pain management.',
      statement_b: 'Hand Specialist: CBC + inflammatory labs, MRI ordered, wrist brace, Medrol Dose Pack, emergency precautions.' },
    { tenant_id, case_id: cid, severity: 'high', detected_by: 'user',
      title: 'Imaging center had no rescue medication or immediate provider for a deteriorating patient',
      description: 'Patient\'s pain escalated to 10/10 during/after MRI; initially told medication and provider evaluation were unavailable; the imaging center stocks no medications.',
      statement_a: 'Patient was initially told medication was unavailable and provider evaluation unavailable; could not safely leave the parking lot.',
      statement_b: 'NP later confirmed the imaging center stocks no medications.' }
  ]);

  // Policy comparisons
  await Comparison.bulkCreate([
    { tenant_id, case_id: cid, severity: 'high', topic: 'Diagnostic workup for severe wrist pain',
      care_received: 'Urgent Care: no labs, no inflammatory workup, no MRI, no brace, no meaningful pain management.',
      expected_standard: 'Same-organization Hand Specialist ordered CBC + inflammatory labs, MRI, brace, Medrol Dose Pack, and emergency precautions for the same complaint. FOI Urgent Care\'s own published scope includes swollen/painful joints and suspected fractures.',
      gap: 'Substantial gap between the urgent-care evaluation and the specialist\'s workup within the same organization for the same presenting complaint.' },
    { tenant_id, case_id: cid, severity: 'critical', topic: 'Patient deterioration during/after imaging',
      care_received: 'Pain to 10/10; initially told no medication and no provider available; imaging center stocks no medications.',
      expected_standard: 'An accredited imaging facility is generally expected to have a means to evaluate and stabilize a patient who becomes acutely symptomatic during/after a study (ACR practice parameters; facility patient-safety expectations).',
      gap: 'No published FOI policy for managing a patient whose condition deteriorates during/after imaging; no rescue medication and no immediately available provider on site.' }
  ]);

  // Outstanding questions
  await Question.bulkCreate([
    { tenant_id, case_id: cid, priority: 'high', directed_to: 'FOI',
      text: 'Why was substantially different diagnostic workup and treatment provided within the same organization for the same wrist complaint?' },
    { tenant_id, case_id: cid, priority: 'high', directed_to: 'FOI',
      text: 'Does FOI have a written policy for patients whose condition deteriorates during or after diagnostic imaging, and if so, what is it?' },
    { tenant_id, case_id: cid, priority: 'high', directed_to: 'FOI Imaging',
      text: 'Do FOI imaging centers stock any rescue medication, and is a provider available on site to evaluate an acutely worsening patient?' },
    { tenant_id, case_id: cid, priority: 'medium', directed_to: 'FOI',
      text: 'Was the steroid discussed at Urgent Care ever transmitted/prescribed, and if not, why?' },
    { tenant_id, case_id: cid, priority: 'medium', directed_to: 'self',
      text: 'Which FOI facilities involved are AHCA-licensed, Medicare-enrolled, Joint Commission accredited, and/or ACR-accredited?' }
  ]);

  // Planned escalation targets
  await Escalation.bulkCreate([
    { tenant_id, case_id: cid, status: 'planned', method: 'letter', target: 'FOI Executive Leadership',
      next_action: 'Draft and send an internal complaint requesting a written explanation and the applicable policies.' },
    { tenant_id, case_id: cid, status: 'planned', method: 'letter', target: 'FOI Corporate Compliance',
      next_action: 'Request the policy governing patient deterioration during/after imaging and rescue-medication availability.' },
    { tenant_id, case_id: cid, status: 'planned', method: 'online_complaint', target: 'AHCA', target_contact: 'Complaint Hotline 1-888-419-3456',
      next_action: 'File a facility-level complaint about the imaging-center deterioration/rescue gap.' },
    { tenant_id, case_id: cid, status: 'planned', method: 'online_complaint', target: 'Florida Department of Health', target_contact: 'flhealthsource.gov/enforcement',
      next_action: 'File complaints against the involved individual licensees (urgent-care physician; imaging-center NP).' },
    { tenant_id, case_id: cid, status: 'planned', method: 'portal', target: 'ACR', target_contact: 'acraccreditation.org',
      next_action: 'Confirm ACR accreditation of the imaging center and review MRI patient-management parameters.' }
  ]);

  return { seeded: true, case_id: cid, policies: policies.length };
}

module.exports = { seedCase, CASE_TITLE };
