'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, authorize, sequelize, logAudit } = require('../middleware/auth');

/**
 * POST /api/v1/copilot/generate-report
 * AI Diagnostic Copilot — generates a draft report from all case data
 * Radiologist/admin only
 */
router.post('/generate-report', authenticate, authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const { caseId } = req.body;
    if (!caseId) return res.status(400).json({ error: 'caseId required' });

    // Gather ALL case data
    const [cases] = await sequelize.query(`
      SELECT c.*, p.sport, p.team, p.position, p.date_of_birth, p.gender, p.height_cm, p.weight_kg,
        pu.first_name AS patient_first, pu.last_name AS patient_last, pu.email AS patient_email,
        ru.first_name AS rad_first, ru.last_name AS rad_last, ru.credentials AS rad_credentials
      FROM msk_cases c
      LEFT JOIN msk_patients p ON c.patient_id = p.id
      LEFT JOIN msk_users pu ON p.user_id = pu.id
      LEFT JOIN msk_users ru ON c.assigned_radiologist_id = ru.id
      WHERE c.id = $1
    `, { bind: [caseId] });

    if (cases.length === 0) return res.status(404).json({ error: 'Case not found' });
    const caseData = cases[0];

    // Triage
    const [triage] = await sequelize.query(
      `SELECT * FROM msk_triage_decisions WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
      { bind: [caseId] }
    );

    // ROM measurements
    const [rom] = await sequelize.query(
      `SELECT * FROM msk_rom_measurements WHERE case_id = $1 ORDER BY measured_at DESC`,
      { bind: [caseId] }
    );

    // PROMs
    const [proms] = await sequelize.query(
      `SELECT * FROM msk_prom_submissions WHERE case_id = $1 ORDER BY submitted_at DESC`,
      { bind: [caseId] }
    );

    // Messages (clinical context from conversation)
    const [messages] = await sequelize.query(
      `SELECT m.content, m.created_at, u.first_name, u.role
       FROM msk_messages m JOIN msk_users u ON m.sender_id = u.id
       WHERE m.case_id = $1 ORDER BY m.created_at ASC`,
      { bind: [caseId] }
    );

    // Imaging orders
    const [imaging] = await sequelize.query(
      `SELECT * FROM msk_imaging_orders WHERE case_id = $1`,
      { bind: [caseId] }
    );

    // AI Image analyses (Claude Vision results from uploaded images)
    let imageAnalyses = [];
    try {
      const [analyses] = await sequelize.query(
        `SELECT file_name, file_type, ai_analysis, ai_analyzed_at FROM msk_imaging_files WHERE case_id = $1 AND ai_analysis IS NOT NULL ORDER BY created_at`,
        { bind: [caseId] }
      );
      imageAnalyses = analyses;
    } catch(e) {}

    // Timeline
    const [timeline] = await sequelize.query(
      `SELECT event_type, event_title, event_description, created_at FROM msk_case_timeline WHERE case_id = $1 ORDER BY created_at`,
      { bind: [caseId] }
    );

    // Build comprehensive clinical context
    const context = buildClinicalContext(caseData, triage[0], rom, proms, messages, imaging, timeline, imageAnalyses);

    // Try AI generation, fall back to rule-based
    let report;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.MSK_ANTHROPIC_KEY;

    if (ANTHROPIC_KEY) {
      report = await generateWithAI(context, ANTHROPIC_KEY);
    } else {
      report = generateRuleBased(context, caseData, triage[0], rom, proms);
    }

    // Save as draft report
    const [existing] = await sequelize.query(
      `SELECT id FROM msk_reports WHERE case_id = $1 AND status = 'draft' LIMIT 1`,
      { bind: [caseId] }
    );

    let reportId;
    if (existing.length > 0) {
      // Update existing draft
      reportId = existing[0].id;
      await sequelize.query(`
        UPDATE msk_reports SET summary = $1, detailed_findings = $2, impression = $3,
          severity_grade = $4, recovery_timeline_weeks = $5, recovery_description = $6,
          performance_impact = $7, return_to_play_recommendation = $8,
          sport_specific_notes = $9, updated_at = NOW()
        WHERE id = $10
      `, { bind: [
        report.summary, report.detailedFindings, report.impression,
        report.severityGrade, report.recoveryWeeks, report.recoveryDescription,
        report.performanceImpact, report.returnToPlay,
        report.sportSpecificNotes, reportId
      ] });
    } else {
      // Create new draft
      const [r] = await sequelize.query(`
        INSERT INTO msk_reports (case_id, radiologist_id, report_type, status, summary, detailed_findings, impression,
          severity_grade, recovery_timeline_weeks, recovery_description, performance_impact,
          return_to_play_recommendation, sport_specific_notes)
        VALUES ($1, $2, 'diagnostic', 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, { bind: [
        caseId, req.user.userId,
        report.summary, report.detailedFindings, report.impression,
        report.severityGrade, report.recoveryWeeks, report.recoveryDescription,
        report.performanceImpact, report.returnToPlay, report.sportSpecificNotes
      ] });
      reportId = r[0].id;
    }

    // Timeline entry
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, performed_by)
      VALUES ($1, 'ai_report_generated', 'AI Copilot Report Generated', 'Draft diagnostic report created by AI copilot for radiologist review', $2)
    `, { bind: [caseId, req.user.userId] });

    logAudit(req.user.userId, 'ai_report_generate', 'report', reportId, req);

    res.json({
      success: true,
      reportId,
      report,
      aiGenerated: !!ANTHROPIC_KEY,
      message: ANTHROPIC_KEY
        ? 'AI-generated draft report ready for review'
        : 'Rule-based draft report ready for review (add ANTHROPIC_API_KEY for AI generation)'
    });
  } catch (err) {
    console.error('[MSK Copilot] generate-report error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/v1/copilot/finalize-report/:reportId
 * Radiologist approves/edits and finalizes the AI draft
 */
router.put('/finalize-report/:reportId', authenticate, authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { summary, detailedFindings, impression, severityGrade, recoveryWeeks, recoveryDescription, returnToPlay } = req.body;

    const [result] = await sequelize.query(`
      UPDATE msk_reports SET
        summary = COALESCE($1, summary),
        detailed_findings = COALESCE($2, detailed_findings),
        impression = COALESCE($3, impression),
        severity_grade = COALESCE($4, severity_grade),
        recovery_timeline_weeks = COALESCE($5, recovery_timeline_weeks),
        recovery_description = COALESCE($6, recovery_description),
        return_to_play_recommendation = COALESCE($7, return_to_play_recommendation),
        status = 'finalized',
        finalized_at = NOW(),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, { bind: [summary, detailedFindings, impression, severityGrade, recoveryWeeks, recoveryDescription, returnToPlay, reportId] });

    if (result.length === 0) return res.status(404).json({ error: 'Report not found' });

    // Update case status
    await sequelize.query(`UPDATE msk_cases SET status = 'report_ready', updated_at = NOW() WHERE id = $1`, { bind: [result[0].case_id] });

    // Timeline
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, performed_by)
      VALUES ($1, 'report_finalized', 'Diagnostic Report Finalized', $2)
    `, { bind: [result[0].case_id, req.user.userId] });

    res.json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[MSK Copilot] finalize error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────

function buildClinicalContext(c, triage, rom, proms, messages, imaging, timeline, imageAnalyses) {
  let ctx = `PATIENT: ${c.patient_first || ''} ${c.patient_last || ''}, ${c.gender || 'unknown'}, DOB: ${c.date_of_birth || 'unknown'}`;
  ctx += `\nSport: ${c.sport || 'N/A'}, Team: ${c.team || 'N/A'}, Position: ${c.position || 'N/A'}`;
  ctx += `\nHeight: ${c.height_cm || '?'}cm, Weight: ${c.weight_kg || '?'}kg`;
  ctx += `\n\nCHIEF COMPLAINT: ${c.chief_complaint}`;
  ctx += `\nPain Location: ${c.pain_location || 'N/A'}`;
  ctx += `\nInjury Mechanism: ${c.injury_mechanism || 'N/A'}`;
  ctx += `\nSeverity: ${c.severity || 'N/A'}/10`;
  ctx += `\nCase Type: ${c.case_type || 'N/A'}`;
  ctx += `\nUrgency: ${c.urgency || 'routine'}`;
  ctx += `\nFunctional Limitations: ${c.functional_limitations || 'N/A'}`;
  ctx += `\nSport Context: ${c.sport_context || 'N/A'}`;
  ctx += `\nOnset: ${c.onset_date || 'N/A'}, Duration: ${c.duration_description || 'N/A'}`;
  ctx += `\nPrior Imaging: ${c.prior_imaging_history || 'None reported'}`;

  if (triage) {
    ctx += `\n\nAI TRIAGE: Decision: ${triage.decision_type}, Protocol: ${triage.imaging_protocol || 'N/A'}`;
    ctx += `\nReasoning: ${triage.reasoning || 'N/A'}, Confidence: ${triage.confidence_score || 'N/A'}`;
  }

  if (rom.length > 0) {
    ctx += `\n\nROM MEASUREMENTS:`;
    rom.forEach(r => {
      ctx += `\n  ${r.assessment_type} (${r.body_side}): ${r.angle_degrees}° [normal: ${r.normal_range_min}°-${r.normal_range_max}°] — ${r.collection_point}, ${new Date(r.measured_at).toLocaleDateString()}`;
    });
  }

  if (proms.length > 0) {
    ctx += `\n\nPROMs:`;
    proms.forEach(p => {
      ctx += `\n  ${p.instrument_code}: Score ${p.score} — ${p.collection_point}, ${new Date(p.submitted_at).toLocaleDateString()}`;
    });
  }

  if (messages.length > 0) {
    ctx += `\n\nPATIENT-PROVIDER COMMUNICATION:`;
    messages.forEach(m => {
      ctx += `\n  [${m.role}] ${m.first_name}: ${m.content}`;
    });
  }

  if (imaging.length > 0) {
    ctx += `\n\nIMAGING ORDERS:`;
    imaging.forEach(i => {
      ctx += `\n  ${i.modality} — ${i.body_region}, Status: ${i.status}, Protocol: ${i.protocol || 'standard'}`;
    });
  }

  // AI Image Analysis results from Claude Vision
  if (imageAnalyses && imageAnalyses.length > 0) {
    ctx += `\n\nAI IMAGE ANALYSIS (Claude Vision):`;
    imageAnalyses.forEach(ia => {
      const a = typeof ia.ai_analysis === 'string' ? JSON.parse(ia.ai_analysis) : ia.ai_analysis;
      ctx += `\n  File: ${ia.file_name} (${ia.file_type})`;
      ctx += `\n  Modality Detected: ${a.modality || 'Unknown'}`;
      ctx += `\n  Body Region: ${a.bodyRegion || 'Unknown'}`;
      ctx += `\n  Findings: ${a.findings || 'N/A'}`;
      ctx += `\n  Impression: ${a.impression || 'N/A'}`;
      if (a.abnormalitiesDetected && a.abnormalitiesDetected.length > 0) {
        ctx += `\n  Abnormalities: ${a.abnormalitiesDetected.join(', ')}`;
      }
      if (a.icd10Suggestions && a.icd10Suggestions.length > 0) {
        ctx += `\n  Suggested ICD-10: ${a.icd10Suggestions.map(c => `${c.code} (${c.description})`).join(', ')}`;
      }
      ctx += `\n  Confidence: ${a.confidenceLevel || 'N/A'}`;
      ctx += `\n  Limitations: ${a.limitations || 'None noted'}`;
    });
  }

  return ctx;
}

async function generateWithAI(context, apiKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are a board-certified musculoskeletal radiologist generating a diagnostic report draft.
Output ONLY valid JSON with these exact fields:
{
  "summary": "2-3 sentence clinical summary",
  "detailedFindings": "Detailed clinical findings paragraph",
  "impression": "Diagnostic impression and differential",
  "severityGrade": "Mild|Moderate|Severe",
  "recoveryWeeks": number,
  "recoveryDescription": "Recovery plan description",
  "performanceImpact": "Impact on athletic/daily performance",
  "returnToPlay": "Return to activity recommendation",
  "sportSpecificNotes": "Sport-specific considerations",
  "icd10Codes": [{"code":"M25.561","description":"Pain in right knee"}],
  "recommendedFollowUp": "Follow-up recommendation"
}
Be specific, clinical, and evidence-based. Use the ROM and PROM data to support findings.`,
    messages: [{ role: 'user', content: `Generate a diagnostic report from this clinical data:\n\n${context}` }]
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (e) {
    return { summary: response.content[0].text, detailedFindings: '', impression: '', severityGrade: 'Moderate', recoveryWeeks: 6, recoveryDescription: '', performanceImpact: '', returnToPlay: '', sportSpecificNotes: '' };
  }
}

function generateRuleBased(context, c, triage, rom, proms) {
  const location = c.pain_location || 'the affected area';
  const mechanism = c.injury_mechanism || 'unknown mechanism';
  const severity = parseInt(c.severity) || 5;
  const severityGrade = severity >= 7 ? 'Severe' : severity >= 4 ? 'Moderate' : 'Mild';

  // ROM analysis
  let romAnalysis = '';
  let romDeficit = false;
  if (rom.length > 0) {
    const latest = rom[0];
    const pct = latest.normal_range_max > 0 ? Math.round((latest.angle_degrees / latest.normal_range_max) * 100) : 100;
    romDeficit = pct < 75;
    romAnalysis = `Range of motion assessment shows ${latest.assessment_type.replace(/_/g, ' ')} of ${latest.angle_degrees}° (${pct}% of normal ${latest.normal_range_max}°). `;
    if (rom.length >= 2) {
      const first = rom[rom.length - 1];
      const improvement = latest.angle_degrees - first.angle_degrees;
      romAnalysis += improvement > 0
        ? `Improvement of ${improvement.toFixed(1)}° since initial assessment. `
        : `No significant improvement since initial assessment. `;
    }
  }

  // Pain analysis
  let painAnalysis = '';
  if (proms.length > 0) {
    const vasScores = proms.filter(p => p.instrument_code === 'VAS').sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
    if (vasScores.length >= 2) {
      const first = parseFloat(vasScores[0].score);
      const latest = parseFloat(vasScores[vasScores.length - 1].score);
      painAnalysis = `Pain assessment: VAS score ${latest}/10 (initial: ${first}/10). ${latest < first ? 'Pain has improved' : 'Pain persists'} since intake. `;
    } else if (vasScores.length === 1) {
      painAnalysis = `Pain assessment: VAS score ${vasScores[0].score}/10 at ${vasScores[0].collection_point}. `;
    }
  }

  const triageInfo = triage
    ? `AI triage determined ${triage.decision_type.replace(/_/g, ' ')} with ${Math.round((triage.confidence_score || 0.85) * 100)}% confidence. ${triage.imaging_protocol ? 'Recommended protocol: ' + triage.imaging_protocol + '.' : ''}`
    : '';

  const recoveryWeeks = severity >= 7 ? 8 + Math.floor(Math.random() * 4) : severity >= 4 ? 4 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 3);

  return {
    summary: `Patient presents with ${c.chief_complaint || 'musculoskeletal complaint'} at ${location}. Mechanism: ${mechanism}. Pain severity rated ${severity}/10. ${triageInfo}`,

    detailedFindings: `Clinical evaluation of the ${location} region reveals ${severityGrade.toLowerCase()} pathology consistent with ${mechanism} mechanism of injury. ${romAnalysis}${painAnalysis}The patient reports ${c.functional_limitations || 'functional limitations affecting daily activities'}. ${c.sport_context ? 'Athletic context: ' + c.sport_context + '.' : ''} ${c.prior_imaging_history ? 'Prior imaging history: ' + c.prior_imaging_history + '.' : 'No prior imaging reported.'}`,

    impression: `${severityGrade} ${c.case_type || 'musculoskeletal'} pathology of the ${location}. ${romDeficit ? 'Significant ROM deficit noted requiring focused rehabilitation.' : 'ROM within acceptable range for current stage.'} ${severity >= 7 ? 'High severity presentation — close follow-up recommended.' : 'Conservative management appropriate.'}`,

    severityGrade,
    recoveryWeeks,

    recoveryDescription: `Structured rehabilitation program over ${recoveryWeeks} weeks. Phase 1 (weeks 1-2): Pain management, gentle ROM exercises. Phase 2 (weeks 3-${Math.floor(recoveryWeeks/2)}): Progressive strengthening, functional exercises. Phase 3 (weeks ${Math.floor(recoveryWeeks/2)+1}-${recoveryWeeks}): Sport-specific training, return to activity protocol. Follow-up ROM assessment at week 6.`,

    performanceImpact: `Current estimated performance reduction: ${severity >= 7 ? '60-80%' : severity >= 4 ? '30-50%' : '10-20%'}. ${c.sport_context ? 'Impact on ' + c.sport_context + ': Modified participation recommended during recovery phase.' : ''}`,

    returnToPlay: severity >= 7
      ? `Full return to activity estimated at ${recoveryWeeks} weeks with successful rehabilitation. No high-impact activities until ROM reaches 90% of normal and pain < 3/10.`
      : `Graduated return to activity within ${recoveryWeeks} weeks. Low-impact activities may resume immediately with pain monitoring. Full activity when ROM normalizes and pain-free.`,

    sportSpecificNotes: c.sport_context
      ? `${c.sport_context}: Focus on sport-specific movement patterns during Phase 3. ${c.case_type === 'joint' ? 'Joint stability and proprioception training essential before return.' : 'Core stabilization and body mechanics correction recommended.'}`
      : 'No sport-specific considerations noted.',

    icd10Codes: [{
      code: location.includes('Knee') ? 'M25.561' : location.includes('Shoulder') ? 'M75.111' : location.includes('Spine') || location.includes('Lumbar') ? 'M54.5' : location.includes('Hip') ? 'M25.551' : 'M79.3',
      description: `Pain in ${location.toLowerCase()}`
    }],

    recommendedFollowUp: `Follow-up assessment in ${Math.ceil(recoveryWeeks / 2)} weeks. Repeat ROM measurement and VAS pain score. ${romDeficit ? 'Consider imaging if ROM does not improve by 20% at follow-up.' : 'Imaging on clinical indication only.'}`
  };
}

module.exports = router;
