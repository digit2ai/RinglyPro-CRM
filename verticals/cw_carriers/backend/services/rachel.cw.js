const twilio = require('twilio');
const axios = require('axios');
const sequelize = require('./db.cw');
const hubspot = require('./hubspot.cw');

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

const SCRIPTS = {
  inbound_greeting: "Thank you for calling CW Carriers. I'm Rachel, your AI logistics assistant. How can I help you today?",
  carrier_coverage: "Hi, this is Rachel calling from CW Carriers. We have a load available that matches your lane — {origin} to {destination}, {freight_type}, picking up {pickup_date}. Are you available and interested in hearing the rate?",
  status_update: "Hi, this is Rachel with CW Carriers calling with an update on your shipment. Your load {load_ref} is currently {status} and on track for delivery by {delivery_date}. Is there anything you need from us?",
  lead_qualification: "Hi, this is Rachel from CW Carriers. I'm reaching out because we specialize in freight logistics and wanted to see if we could help with your transportation needs. Do you have a few minutes?",
  escalation_handoff: "I'm going to connect you with one of our specialists right away. Please hold for just a moment."
};

function interpolateScript(template, data) {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || 'N/A');
  }
  return result;
}

async function generateTTS(text) {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer'
      }
    );
    return { success: true, audio: response.data };
  } catch (err) {
    console.error('CW TTS error:', err.message);
    return { success: false, error: err.message };
  }
}

async function makeOutboundCall(toNumber, callType, scriptData = {}) {
  const scriptTemplate = SCRIPTS[callType] || SCRIPTS.lead_qualification;
  const spokenText = interpolateScript(scriptTemplate, scriptData);

  try {
    const call = await twilioClient.calls.create({
      to: toNumber,
      from: TWILIO_NUMBER,
      twiml: `<Response><Say voice="Polly.Joanna">${spokenText}</Say><Gather input="speech" timeout="5" action="/cw_carriers/api/voice/inbound"><Say voice="Polly.Joanna">Please let me know how you'd like to proceed.</Say></Gather></Response>`,
      statusCallback: '/cw_carriers/api/voice/outbound/status',
      statusCallbackEvent: ['completed', 'failed', 'no-answer'],
      machineDetection: 'DetectMessageEnd'
    });

    return { success: true, callSid: call.sid, spokenText };
  } catch (err) {
    console.error('CW outbound call error:', err.message);
    return { success: false, error: err.message };
  }
}

async function logCall(callData) {
  try {
    await sequelize.query(
      `INSERT INTO cw_call_logs (call_sid, direction, call_type, contact_id, load_id, from_number, to_number, duration_sec, transcript, ai_summary, outcome, hubspot_logged, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      {
        bind: [
          callData.call_sid, callData.direction, callData.call_type,
          callData.contact_id || null, callData.load_id || null,
          callData.from_number, callData.to_number,
          callData.duration_sec || 0, callData.transcript || '',
          callData.ai_summary || '', callData.outcome || 'completed',
          false
        ]
      }
    );

    // Async sync to HubSpot
    if (callData.hubspot_contact_id) {
      hubspot.logCallActivity({
        title: `CW ${callData.call_type} call`,
        summary: callData.ai_summary || callData.transcript || '',
        direction: callData.direction,
        duration_sec: callData.duration_sec,
        hubspot_contact_id: callData.hubspot_contact_id
      }).catch(e => console.error('CW HubSpot call log error:', e.message));
    }

    return { success: true };
  } catch (err) {
    console.error('CW call log error:', err.message);
    return { success: false, error: err.message };
  }
}

async function runCarrierCoverage(loadId, carrierIds) {
  // Fetch load details
  const [[load]] = await sequelize.query(
    `SELECT * FROM cw_loads WHERE id = $1`, { bind: [loadId] }
  );
  if (!load) return { success: false, error: 'Load not found' };
  if (load.status !== 'open') return { success: false, error: 'Load is not open' };

  const results = [];
  for (const carrierId of carrierIds) {
    const [[carrier]] = await sequelize.query(
      `SELECT * FROM cw_contacts WHERE id = $1 AND contact_type = 'carrier'`,
      { bind: [carrierId] }
    );
    if (!carrier || !carrier.phone) {
      results.push({ carrierId, status: 'skipped', reason: 'No phone' });
      continue;
    }

    const callResult = await makeOutboundCall(carrier.phone, 'carrier_coverage', {
      origin: load.origin,
      destination: load.destination,
      freight_type: load.freight_type,
      pickup_date: load.pickup_date
    });

    results.push({
      carrierId,
      carrierName: carrier.full_name || carrier.company_name,
      status: callResult.success ? 'called' : 'failed',
      callSid: callResult.callSid,
      error: callResult.error
    });

    if (callResult.success) {
      await logCall({
        call_sid: callResult.callSid,
        direction: 'outbound',
        call_type: 'carrier_coverage',
        contact_id: carrierId,
        load_id: loadId,
        from_number: TWILIO_NUMBER,
        to_number: carrier.phone,
        outcome: 'pending',
        hubspot_contact_id: carrier.hubspot_id
      });
    }

    // Small delay between calls
    await new Promise(r => setTimeout(r, 2000));

    // Check if load was covered
    const [[updated]] = await sequelize.query(
      `SELECT status FROM cw_loads WHERE id = $1`, { bind: [loadId] }
    );
    if (updated && updated.status !== 'open') break;
  }

  return { success: true, loadId, results };
}

module.exports = {
  SCRIPTS,
  interpolateScript,
  generateTTS,
  makeOutboundCall,
  logCall,
  runCarrierCoverage
};
