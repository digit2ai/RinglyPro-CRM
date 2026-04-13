'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../middleware/auth');

/**
 * POST /api/v1/voice/intake
 * RinglyPro voice integration callback
 * Receives structured intake data from AI voice receptionist
 */
router.post('/intake', async (req, res) => {
  try {
    const {
      callerPhone, callerName, painLocation, injuryMechanism,
      duration, severity, sportContext, priorImaging,
      urgencyClassification, caseType, rawTranscript, additionalNotes
    } = req.body;

    // Generate case number
    const caseNumber = `MSK-V${Date.now().toString(36).toUpperCase()}`;

    // Try to match existing patient by phone
    let patientId = null;
    if (callerPhone) {
      const [existingPatients] = await sequelize.query(`
        SELECT p.id FROM msk_patients p
        JOIN msk_users u ON p.user_id = u.id
        WHERE u.phone = $1
      `, { bind: [callerPhone] });
      patientId = existingPatients[0]?.id || null;
    }

    // Create the case
    const [cases] = await sequelize.query(`
      INSERT INTO msk_cases (
        case_number, patient_id, status, urgency, case_type,
        chief_complaint, pain_location, injury_mechanism,
        duration_description, severity, sport_context,
        prior_imaging_history, source,
        intake_data
      ) VALUES ($1,$2,'intake',$3,$4,$5,$6,$7,$8,$9,$10,$11,'voice',$12)
      RETURNING *
    `, {
      bind: [
        caseNumber, patientId,
        urgencyClassification || 'routine',
        caseType || 'general',
        additionalNotes || `Voice intake from ${callerName || callerPhone || 'unknown caller'}`,
        painLocation || null,
        injuryMechanism || 'unknown',
        duration || null,
        severity || null,
        sportContext || null,
        priorImaging || null,
        JSON.stringify({
          callerPhone, callerName, rawTranscript,
          receivedAt: new Date().toISOString()
        })
      ]
    });

    const newCase = cases[0];

    // Timeline entry
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description)
      VALUES ($1, 'voice_intake', 'Voice Intake Received', $2)
    `, { bind: [newCase.id, `Call from ${callerName || callerPhone || 'unknown'}`] });

    // Auto-triage if urgency is emergency
    if (urgencyClassification === 'emergency') {
      await sequelize.query(`
        INSERT INTO msk_triage_decisions (case_id, decision_type, reasoning, confidence_score)
        VALUES ($1, 'emergency_escalation', 'Emergency flagged during voice intake', 0.95)
      `, { bind: [newCase.id] });

      await sequelize.query(`UPDATE msk_cases SET status = 'emergency', updated_at = NOW() WHERE id = $1`, { bind: [newCase.id] });

      await sequelize.query(`
        INSERT INTO msk_case_timeline (case_id, event_type, event_title) VALUES ($1, 'emergency_escalation', 'Emergency Auto-Escalation Triggered')
      `, { bind: [newCase.id] });
    }

    res.status(201).json({
      success: true,
      data: {
        caseId: newCase.id,
        caseNumber: newCase.case_number,
        status: newCase.status,
        urgency: newCase.urgency,
        message: urgencyClassification === 'emergency'
          ? 'Emergency case created and escalated. On-call team notified.'
          : 'Case created successfully. Will be triaged shortly.'
      }
    });
  } catch (err) {
    console.error('[MSK] Voice intake error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Voice agent system prompt for RinglyPro integration
 */
router.get('/agent-prompt', (req, res) => {
  res.json({
    agentName: 'Dr. MSK',
    language: 'en',
    systemPrompt: `You are Dr. MSK, the AI intake specialist for MSK Intelligence — a premium musculoskeletal diagnostics platform.

Your role is to conduct a structured medical intake for patients calling about musculoskeletal complaints (bone, joint, muscle, tendon, ligament injuries).

## Personality
- Professional, calm, empathetic
- Speak like a sports medicine intake coordinator
- Be efficient but thorough
- Use medical terminology when helpful, but explain in plain language

## Intake Flow

1. GREETING: "Thank you for calling MSK Intelligence, the remote musculoskeletal diagnostics platform. I'm here to help you get started with a specialist evaluation. May I have your name?"

2. PAIN LOCATION: "Can you describe where you're experiencing pain or discomfort? Be as specific as possible — for example, 'right knee, inner side' or 'lower back, left side.'"

3. INJURY MECHANISM: "How did this start? Was it from a specific incident or trauma, or did it develop gradually over time?"
   - Classify as: trauma, overuse, acute, chronic

4. DURATION: "When did you first notice this? Has it been getting better, worse, or staying the same?"

5. SEVERITY: "On a scale of 1 to 10, with 10 being the worst pain you've experienced, how would you rate your current pain?"

6. FUNCTIONAL IMPACT: "Is this affecting your ability to perform daily activities or participate in sports/exercise?"

7. SPORT CONTEXT: "Are you an athlete or involved in any sports? If so, which sport and position?"

8. PRIOR IMAGING: "Have you had any imaging done for this issue before — X-rays, MRI, or ultrasound?"

9. URGENCY ASSESSMENT:
   - EMERGENCY: Suspected fracture, unable to bear weight, severe swelling, numbness/tingling, loss of function
   - URGENT: Significant pain limiting activity, recent acute injury
   - PRIORITY: Moderate symptoms, needs attention within days
   - ROUTINE: Chronic symptoms, seeking evaluation

10. CLOSING: "Thank you for providing that information. I've created your case file. A musculoskeletal specialist will review your intake and determine the best next step — whether that's ordering imaging, scheduling a video consultation, or both. You'll receive an update within [timeframe based on urgency]. Is there anything else you'd like to add?"

## Data to Capture (POST to /msk/api/v1/voice/intake)
- callerPhone
- callerName
- painLocation
- injuryMechanism (trauma|overuse|acute|chronic)
- duration
- severity (1-10)
- sportContext
- priorImaging
- urgencyClassification (routine|priority|urgent|emergency)
- caseType (joint|spine|soft_tissue|fracture|post_surgical|general)
- rawTranscript
- additionalNotes

## Constraints
- Never diagnose — only collect intake information
- Never recommend specific treatments
- Always emphasize that a specialist will review
- If patient describes emergency symptoms, classify as emergency and advise seeking immediate local care while the case is processed`
  });
});

/**
 * POST /api/v1/voice/token
 * Generate ElevenLabs WebRTC signed URL for the MSK voice agent
 * Uses the main app's ELEVENLABS_API_KEY
 */
router.post('/token', async (req, res) => {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const MSK_AGENT_ID = process.env.MSK_ELEVENLABS_AGENT_ID || 'agent_6601kmtefen9etcam6t3rmrhtxkg';

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
    }

    const { dynamicVariables } = req.body;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(MSK_AGENT_ID)}`,
      { method: 'GET', headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[MSK Voice] ElevenLabs token error:', response.status, errText);
      return res.status(response.status).json({ success: false, error: 'Failed to get voice token' });
    }

    const data = await response.json();
    res.json({ success: true, signed_url: data.signed_url, agent_id: MSK_AGENT_ID });
  } catch (err) {
    console.error('[MSK Voice] Token error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/voice/rachel-token
 * Generate ElevenLabs WebRTC signed URL for Rachel — the AI presenter agent
 */
router.post('/rachel-token', async (req, res) => {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const RACHEL_AGENT_ID = process.env.MSK_RACHEL_AGENT_ID || 'agent_2901kn7xaah7e0aazmggm9a4dvpk';

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(RACHEL_AGENT_ID)}`,
      { method: 'GET', headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[MSK Voice] Rachel token error:', response.status, errText);
      return res.status(response.status).json({ success: false, error: 'Failed to get Rachel token' });
    }

    const data = await response.json();
    res.json({ success: true, signed_url: data.signed_url, agent_id: RACHEL_AGENT_ID });
  } catch (err) {
    console.error('[MSK Voice] Rachel token error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/voice/case-assistant-token
 * Generate ElevenLabs signed URL for Rachel Case Assistant
 * Injects full case data as dynamic variables so Rachel can discuss the case
 */
router.post('/case-assistant-token', async (req, res) => {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const CASE_AGENT_ID = process.env.MSK_CASE_AGENT_ID || 'agent_3301kp3d5mvqendvgjes64rk8qqw';

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
    }

    const { caseId } = req.body;
    if (!caseId) return res.status(400).json({ error: 'caseId required' });

    // Gather ALL case data
    const [cases] = await sequelize.query(`
      SELECT c.*, p.sport, p.team, p.position,
        pu.first_name AS patient_first, pu.last_name AS patient_last,
        ru.first_name AS rad_first, ru.last_name AS rad_last, ru.credentials
      FROM msk_cases c
      LEFT JOIN msk_patients p ON c.patient_id = p.id
      LEFT JOIN msk_users pu ON p.user_id = pu.id
      LEFT JOIN msk_users ru ON c.assigned_radiologist_id = ru.id
      WHERE c.id = $1
    `, { bind: [caseId] });

    if (cases.length === 0) return res.status(404).json({ error: 'Case not found' });
    const c = cases[0];

    // Triage
    const [triage] = await sequelize.query(
      `SELECT * FROM msk_triage_decisions WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
      { bind: [caseId] }
    );

    // Reports
    const [reports] = await sequelize.query(
      `SELECT * FROM msk_reports WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
      { bind: [caseId] }
    );

    // ROM
    const [rom] = await sequelize.query(
      `SELECT * FROM msk_rom_measurements WHERE case_id = $1 ORDER BY measured_at DESC LIMIT 10`,
      { bind: [caseId] }
    );

    // PROMs
    const [proms] = await sequelize.query(
      `SELECT * FROM msk_prom_submissions WHERE case_id = $1 ORDER BY submitted_at DESC LIMIT 10`,
      { bind: [caseId] }
    );

    // Imaging AI analyses
    let imagingAnalysis = 'No imaging uploaded yet.';
    try {
      const [imgs] = await sequelize.query(
        `SELECT file_name, ai_analysis FROM msk_imaging_files WHERE case_id = $1 AND ai_analysis IS NOT NULL`,
        { bind: [caseId] }
      );
      if (imgs.length > 0) {
        imagingAnalysis = imgs.map(img => {
          const a = typeof img.ai_analysis === 'string' ? JSON.parse(img.ai_analysis) : img.ai_analysis;
          return `File: ${img.file_name} | Modality: ${a.modality} | Region: ${a.bodyRegion} | Findings: ${a.findings} | Impression: ${a.impression} | Abnormalities: ${(a.abnormalitiesDetected || []).join(', ') || 'None'} | ICD-10: ${(a.icd10Suggestions || []).map(x => x.code + ' ' + x.description).join(', ') || 'N/A'}`;
        }).join('\n');
      }
    } catch(e) {}

    // Exercise programs
    let exerciseProgram = 'No exercise program assigned.';
    try {
      const [programs] = await sequelize.query(
        `SELECT hp.*, array_agg(e.name) AS exercise_names
         FROM msk_hep_programs hp
         LEFT JOIN msk_hep_program_exercises hpe ON hpe.program_id = hp.id
         LEFT JOIN msk_exercises e ON e.id = hpe.exercise_id
         WHERE hp.patient_id = (SELECT patient_id FROM msk_cases WHERE id = $1) AND hp.status = 'active'
         GROUP BY hp.id LIMIT 1`,
        { bind: [caseId] }
      );
      if (programs.length > 0) {
        const p = programs[0];
        exerciseProgram = `Program: ${p.name || 'Home Exercise Program'} | Exercises: ${(p.exercise_names || []).filter(Boolean).join(', ')} | Frequency: ${p.frequency || 'daily'} | Duration: ${p.duration_weeks || '?'} weeks`;
      }
    } catch(e) {}

    // Build dynamic variables for the agent prompt
    const triageSummary = triage[0]
      ? `Decision: ${triage[0].decision_type}. Protocol: ${triage[0].imaging_protocol || 'N/A'}. Reasoning: ${triage[0].reasoning || 'N/A'}. Confidence: ${Math.round((triage[0].confidence_score || 0) * 100)}%.`
      : 'No triage performed yet.';

    const report = reports[0];
    const reportSummary = report
      ? `Summary: ${report.summary || 'N/A'}. Impression: ${report.impression || 'N/A'}. Severity: ${report.severity_grade || 'N/A'}. Recovery: ${report.recovery_timeline_weeks || '?'} weeks. Return to activity: ${report.return_to_play_recommendation || 'N/A'}. Sport notes: ${report.sport_specific_notes || 'N/A'}.`
      : 'No diagnostic report generated yet.';

    const romData = rom.length > 0
      ? rom.map(r => `${r.assessment_type} (${r.body_side}): ${r.angle_degrees} degrees (normal: ${r.normal_range_min}-${r.normal_range_max})`).join('. ')
      : 'No ROM measurements taken yet.';

    const promsData = proms.length > 0
      ? proms.map(p => `${p.instrument_code}: score ${p.score} at ${p.collection_point}`).join('. ')
      : 'No outcome assessments completed yet.';

    const recoveryPlan = report
      ? `${report.recovery_description || 'No recovery plan documented.'}`
      : 'No recovery plan yet - pending diagnostic report.';

    const dynamicVars = {
      case_number: c.case_number || 'Unknown',
      patient_name: `${c.patient_first || ''} ${c.patient_last || ''}`.trim() || 'Unknown patient',
      case_status: (c.status || '').replace(/_/g, ' '),
      chief_complaint: c.chief_complaint || 'Not documented',
      pain_location: c.pain_location || 'Not specified',
      injury_mechanism: c.injury_mechanism || 'Not specified',
      severity: String(c.severity || 'N/A'),
      case_type: (c.case_type || '').replace(/_/g, ' ') || 'Not classified',
      sport_context: c.sport_context || 'None',
      functional_limitations: c.functional_limitations || 'Not documented',
      triage_summary: triageSummary,
      imaging_analysis: imagingAnalysis,
      report_summary: reportSummary,
      rom_data: romData,
      proms_data: promsData,
      recovery_plan: recoveryPlan,
      exercise_program: exerciseProgram
    };

    // Get signed URL from ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(CASE_AGENT_ID)}`,
      { method: 'GET', headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[MSK Voice] Case assistant token error:', response.status, errText);
      return res.status(response.status).json({ success: false, error: 'Failed to get voice token' });
    }

    const data = await response.json();
    res.json({
      success: true,
      signed_url: data.signed_url,
      agent_id: CASE_AGENT_ID,
      dynamic_variables: dynamicVars
    });
  } catch (err) {
    console.error('[MSK Voice] Case assistant token error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
