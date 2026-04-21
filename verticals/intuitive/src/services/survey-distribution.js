'use strict';

/**
 * Survey Distribution Service - SurgicalMind AI
 *
 * Sends surgeon survey invitations via three channels:
 *   1. Email  (SendGrid)
 *   2. SMS    (Twilio)
 *   3. Voice  (ElevenLabs Conversational AI via Twilio)
 *
 * Copyright 2026 Digit2AI / RinglyPro CRM
 */

const SURGICALMIND_BASE =
  process.env.SURGICALMIND_BASE_URL || 'https://aiagent.ringlypro.com/intuitive';

// ---------------------------------------------------------------------------
// Email via SendGrid
// ---------------------------------------------------------------------------

async function sendSurveyByEmail(survey, recipient, surveyLink) {
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'no-reply@ringlypro.com';
    const surgeonName = recipient.surgeon_name || 'Colleague';
    const hospitalName = survey.hospital_name || 'your hospital';
    const systemType = survey.system_type || 'da Vinci';

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#1a1a2e;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#16213e;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 40px 16px;text-align:center;">
          <h1 style="margin:0;font-size:28px;color:#e94560;letter-spacing:1px;">SurgicalMind AI</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#8899aa;letter-spacing:2px;text-transform:uppercase;">Surgical Volume Assessment</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px 40px;">
          <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px;">
            Dear Dr. ${surgeonName},
          </p>
          <p style="color:#c0c0c0;font-size:15px;line-height:1.7;margin:0 0 16px;">
            <strong style="color:#e0e0e0;">${hospitalName}</strong> is evaluating a
            <strong style="color:#e94560;">${systemType}</strong> robotic surgery program.
            As a key surgeon in this market, your input is critical to building an
            accurate business case.
          </p>
          <p style="color:#c0c0c0;font-size:15px;line-height:1.7;margin:0 0 28px;">
            Please take <strong style="color:#e0e0e0;">3 minutes</strong> to share your
            projected case volumes and procedural preferences.
          </p>
          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 28px;">
              <a href="${surveyLink}" target="_blank"
                 style="display:inline-block;padding:16px 48px;background:#e94560;color:#ffffff;
                        font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;
                        letter-spacing:0.5px;">
                Complete Survey
              </a>
            </td></tr>
          </table>
          <p style="color:#889;font-size:13px;line-height:1.6;margin:0 0 8px;border-top:1px solid #2a3a5e;padding-top:20px;">
            Your responses are confidential and will be used for business planning
            purposes only. No individual responses will be shared with hospital
            administration without your explicit consent.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px 28px;text-align:center;border-top:1px solid #2a3a5e;">
          <p style="margin:0;font-size:12px;color:#667;">
            Powered by <strong style="color:#8899aa;">SurgicalMind AI</strong> |
            <strong style="color:#8899aa;">Digit2AI</strong>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const msg = {
      to: recipient.surgeon_email,
      from: { email: fromEmail, name: 'SurgicalMind AI' },
      subject: `SurgicalMind AI - Surgical Volume Assessment for ${hospitalName}`,
      html: htmlBody,
      text: [
        `Dear Dr. ${surgeonName},`,
        '',
        `${hospitalName} is evaluating a ${systemType} robotic surgery program.`,
        'Please take 3 minutes to share your projected case volumes:',
        surveyLink,
        '',
        'Your responses are confidential and will be used for business planning purposes only.',
        '',
        'Powered by SurgicalMind AI | Digit2AI'
      ].join('\n')
    };

    const [response] = await sgMail.send(msg);
    const messageId = response && response.headers && response.headers['x-message-id']
      ? response.headers['x-message-id']
      : (response && response.statusCode ? `sg-${Date.now()}` : null);

    return { success: true, messageId, statusCode: response && response.statusCode };
  } catch (err) {
    console.error('[SurveyDistribution] Email error:', err.message || err);
    return { success: false, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// SMS via Twilio
// ---------------------------------------------------------------------------

async function sendSurveyBySMS(survey, recipient, surveyLink) {
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    if (!fromNumber) {
      return { success: false, error: 'TWILIO_FROM_NUMBER not configured' };
    }

    const toNumber = recipient.surgeon_phone;
    if (!toNumber) {
      return { success: false, error: 'Recipient has no phone number' };
    }

    const surgeonName = recipient.surgeon_name || 'Doctor';
    const hospitalName = survey.hospital_name || 'your hospital';

    const body = `Dr. ${surgeonName}, ${hospitalName} is evaluating a da Vinci robotic surgery program. Please share your projected volumes: ${surveyLink} - SurgicalMind AI`;

    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: toNumber
    });

    return { success: true, messageSid: message.sid };
  } catch (err) {
    console.error('[SurveyDistribution] SMS error:', err.message || err);
    return { success: false, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Voice call via ElevenLabs Conversational AI + Twilio
// ---------------------------------------------------------------------------

async function initiateVoiceCallSurvey(survey, recipient, surveyLink) {
  try {
    const agentId = process.env.ELEVENLABS_AGENT_ID || 'agent_5001kn4s9jsqernanpgc4ejh1a0e';

    if (!process.env.ELEVENLABS_AGENT_ID && !process.env.ELEVENLABS_API_KEY) {
      return { success: false, error: 'Voice survey agent not configured' };
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    if (!fromNumber) {
      return { success: false, error: 'TWILIO_FROM_NUMBER not configured' };
    }

    const toNumber = recipient.surgeon_phone;
    if (!toNumber) {
      return { success: false, error: 'Recipient has no phone number' };
    }

    const surgeonName = recipient.surgeon_name || 'Doctor';
    const hospitalName = survey.hospital_name || 'the hospital';
    const systemType = survey.system_type || 'da Vinci';

    // Build the questions summary for the agent's context
    const questionSummary = (survey.questions || [])
      .filter(q => q.required)
      .map(q => q.text.replace('{system_type}', systemType).replace('{hospital_name}', hospitalName))
      .join(' | ');

    // TwiML that connects the answered call to ElevenLabs ConvAI via WebSocket
    const webhookBase = process.env.SURGICALMIND_BASE_URL || 'https://aiagent.ringlypro.com/intuitive';
    const voiceWebhookUrl = `${webhookBase}/api/v1/surveys/voice-webhook`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}">
      <Parameter name="surgeon_name" value="${surgeonName}" />
      <Parameter name="hospital_name" value="${hospitalName}" />
      <Parameter name="system_type" value="${systemType}" />
      <Parameter name="survey_id" value="${survey.id}" />
      <Parameter name="recipient_id" value="${recipient.id}" />
      <Parameter name="survey_link" value="${surveyLink}" />
      <Parameter name="questions" value="${encodeURIComponent(questionSummary)}" />
    </Stream>
  </Connect>
</Response>`;

    const call = await client.calls.create({
      twiml,
      to: toNumber,
      from: fromNumber,
      statusCallback: voiceWebhookUrl,
      statusCallbackEvent: ['completed', 'failed', 'no-answer', 'busy'],
      statusCallbackMethod: 'POST',
      machineDetection: 'Enable'
    });

    return { success: true, callSid: call.sid };
  } catch (err) {
    console.error('[SurveyDistribution] Voice call error:', err.message || err);
    return { success: false, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Master distribution function
// ---------------------------------------------------------------------------

async function distributeToRecipient(survey, recipient, channel) {
  try {
    const surveyLink = `${SURGICALMIND_BASE}/survey/${recipient.personal_token}`;

    let result;
    switch (channel) {
      case 'email':
        result = await sendSurveyByEmail(survey, recipient, surveyLink);
        break;
      case 'sms':
        result = await sendSurveyBySMS(survey, recipient, surveyLink);
        break;
      case 'voice':
        result = await initiateVoiceCallSurvey(survey, recipient, surveyLink);
        break;
      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }

    // Update recipient status if send succeeded
    if (result.success && recipient.update) {
      try {
        await recipient.update({ status: 'sent', sent_at: new Date() });
      } catch (updateErr) {
        console.error('[SurveyDistribution] Failed to update recipient status:', updateErr.message);
      }
    }

    return result;
  } catch (err) {
    console.error('[SurveyDistribution] distributeToRecipient error:', err.message || err);
    return { success: false, error: err.message || String(err) };
  }
}

module.exports = {
  sendSurveyByEmail,
  sendSurveyBySMS,
  initiateVoiceCallSurvey,
  distributeToRecipient
};
