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

module.exports = router;
