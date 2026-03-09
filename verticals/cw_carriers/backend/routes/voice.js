const express = require('express');
const router = express.Router();
const rachel = require('../services/rachel.cw');
const sequelize = require('../services/db.cw');

// POST /inbound - Twilio webhook handler for inbound calls (no auth - Twilio calls this)
router.post('/inbound', async (req, res) => {
  try {
    const { CallSid, From, To, SpeechResult, Digits } = req.body;

    if (SpeechResult) {
      // Caller said something — log and respond
      await rachel.logCall({
        call_sid: CallSid,
        direction: 'inbound',
        call_type: 'inbound_shipper',
        from_number: From,
        to_number: To,
        transcript: SpeechResult,
        outcome: 'completed'
      });

      // Provide a response
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="Polly.Joanna">Thank you for that information. Let me check on that for you. One of our logistics specialists will follow up with you shortly.</Say>
          <Say voice="Polly.Joanna">Is there anything else I can help you with?</Say>
          <Gather input="speech" timeout="5" action="/cw_carriers/api/voice/inbound">
            <Say voice="Polly.Joanna">Please go ahead.</Say>
          </Gather>
          <Say voice="Polly.Joanna">Thank you for calling CW Carriers. Have a great day!</Say>
        </Response>`);
    } else {
      // Initial greeting
      await rachel.logCall({
        call_sid: CallSid,
        direction: 'inbound',
        call_type: 'inbound_shipper',
        from_number: From,
        to_number: To,
        outcome: 'pending'
      });

      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Gather input="speech" timeout="5" action="/cw_carriers/api/voice/inbound">
            <Say voice="Polly.Joanna">${rachel.SCRIPTS.inbound_greeting}</Say>
          </Gather>
          <Say voice="Polly.Joanna">I didn't catch that. Let me connect you with a specialist.</Say>
          <Dial>${process.env.CW_MAIN_NUMBER || process.env.TWILIO_PHONE_NUMBER}</Dial>
        </Response>`);
    }
  } catch (err) {
    console.error('CW inbound voice error:', err.message);
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="Polly.Joanna">I'm sorry, we're experiencing technical difficulties. Please call back shortly.</Say>
      </Response>`);
  }
});

// POST /outbound/status - Twilio status callback
router.post('/outbound/status', async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;

    if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'no-answer') {
      await sequelize.query(
        `UPDATE cw_call_logs SET duration_sec = $1, outcome = $2 WHERE call_sid = $3`,
        { bind: [parseInt(CallDuration || 0), CallStatus === 'completed' ? 'completed' : CallStatus, CallSid] }
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('CW outbound status error:', err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
