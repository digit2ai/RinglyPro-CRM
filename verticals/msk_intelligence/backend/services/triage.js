'use strict';

/**
 * AI Triage Decision Engine
 * Analyzes case intake data and determines the appropriate next step
 */

const IMAGING_PROTOCOLS = {
  joint: {
    knee: 'MRI knee without contrast — sagittal PD fat-sat, coronal T1, axial PD',
    shoulder: 'MRI shoulder without contrast — coronal oblique T2 fat-sat, sagittal oblique T1, axial T2',
    hip: 'MRI hip without contrast — coronal T1, coronal STIR, axial T2 fat-sat',
    ankle: 'MRI ankle without contrast — sagittal T1, sagittal STIR, axial T2 fat-sat, coronal T1',
    elbow: 'MRI elbow without contrast — coronal T1, coronal T2 fat-sat, sagittal T1, axial T2',
    wrist: 'MRI wrist without contrast — coronal T1, coronal T2 fat-sat, axial T2',
    default: 'MRI joint without contrast — standard protocol'
  },
  spine: {
    cervical: 'MRI cervical spine without contrast — sagittal T1, sagittal T2, axial T2 at symptomatic levels',
    thoracic: 'MRI thoracic spine without contrast — sagittal T1, sagittal T2, axial T2',
    lumbar: 'MRI lumbar spine without contrast — sagittal T1, sagittal T2, axial T2 L3-S1',
    default: 'MRI spine without contrast — sagittal T1, sagittal T2, axial T2'
  },
  soft_tissue: {
    default: 'MRI affected area without contrast — T1, T2 fat-sat, STIR sequences'
  },
  fracture: {
    default: 'X-Ray primary assessment + CT if complex fracture suspected'
  },
  post_surgical: {
    default: 'MRI with and without contrast — evaluate post-operative changes, fluid collections, hardware position'
  },
  general: {
    default: 'Ultrasound initial assessment or MRI without contrast based on clinical suspicion'
  }
};

/**
 * Determine imaging protocol based on case type and pain location
 */
function getImagingProtocol(caseType, painLocation) {
  const protocols = IMAGING_PROTOCOLS[caseType] || IMAGING_PROTOCOLS.general;

  if (painLocation) {
    const lower = painLocation.toLowerCase();
    for (const [region, protocol] of Object.entries(protocols)) {
      if (region !== 'default' && lower.includes(region)) {
        return protocol;
      }
    }
  }

  return protocols.default || IMAGING_PROTOCOLS.general.default;
}

/**
 * Calculate triage urgency score
 */
function calculateUrgencyScore(caseData) {
  let score = 0;

  // Severity weighting (1-10)
  if (caseData.severity) {
    score += caseData.severity * 5; // 5-50 points
  }

  // Urgency classification
  const urgencyWeights = { emergency: 100, urgent: 60, priority: 30, routine: 10 };
  score += urgencyWeights[caseData.urgency] || 10;

  // Injury mechanism
  if (caseData.injury_mechanism === 'trauma') score += 20;
  if (caseData.injury_mechanism === 'acute') score += 15;

  // Case type
  if (caseData.case_type === 'fracture') score += 30;
  if (caseData.case_type === 'post_surgical') score += 15;

  // Functional limitations
  if (caseData.functional_limitations && caseData.functional_limitations.length > 50) {
    score += 10;
  }

  return Math.min(score, 200); // Cap at 200
}

/**
 * Main triage function
 */
async function triageCase(caseData) {
  const urgencyScore = calculateUrgencyScore(caseData);

  // Emergency escalation
  if (caseData.urgency === 'emergency' || urgencyScore >= 150) {
    return {
      decisionType: 'emergency_escalation',
      urgencyScore,
      reasoning: `Emergency escalation triggered. Urgency score: ${urgencyScore}/200. ` +
        `Patient reports ${caseData.urgency} urgency with severity ${caseData.severity || 'N/A'}/10. ` +
        `Mechanism: ${caseData.injury_mechanism || 'unknown'}. ` +
        `Recommend immediate specialist attention and local ER evaluation if acute trauma.`,
      confidenceScore: 0.95,
      recommendedActions: [
        'Notify on-call radiologist immediately',
        'Advise patient to seek local emergency care if acute',
        'Priority queue for imaging review'
      ]
    };
  }

  // Direct consult (low severity, chronic, or follow-up)
  if (
    (caseData.severity && caseData.severity <= 3 && caseData.injury_mechanism === 'chronic') ||
    caseData.case_type === 'post_surgical'
  ) {
    return {
      decisionType: 'direct_consult',
      urgencyScore,
      reasoning: `Direct consultation recommended. Urgency score: ${urgencyScore}/200. ` +
        `${caseData.case_type === 'post_surgical' ? 'Post-surgical evaluation — imaging review may be needed after consultation.' : 'Low severity chronic presentation — specialist consultation to determine imaging necessity.'}`,
      confidenceScore: 0.85,
      recommendedActions: [
        'Schedule video consultation with specialist',
        'Gather prior medical records if available',
        caseData.case_type === 'post_surgical' ? 'Request recent post-op imaging if available' : 'Consider imaging after consultation'
      ]
    };
  }

  // Default: Imaging required
  const protocol = getImagingProtocol(caseData.case_type, caseData.pain_location);

  return {
    decisionType: 'imaging_required',
    urgencyScore,
    imagingProtocol: protocol,
    reasoning: `Imaging recommended based on clinical presentation. Urgency score: ${urgencyScore}/200. ` +
      `${caseData.case_type || 'General'} complaint at ${caseData.pain_location || 'unspecified location'}. ` +
      `Mechanism: ${caseData.injury_mechanism || 'unknown'}. Severity: ${caseData.severity || 'N/A'}/10. ` +
      `Recommended protocol: ${protocol}`,
    confidenceScore: 0.90,
    recommendedActions: [
      'Order imaging per recommended protocol',
      'Locate nearest imaging center for patient',
      'Schedule follow-up consultation after imaging results'
    ]
  };
}

module.exports = { triageCase, getImagingProtocol, calculateUrgencyScore };
