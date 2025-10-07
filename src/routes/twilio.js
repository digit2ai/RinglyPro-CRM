// Twilio Webhook Routes
const express = require('express');
const router = express.Router();
const CreditSystem = require('../services/creditSystem');

const creditSystem = new CreditSystem();

// POST /webhook/twilio/voice - Handle call completion
router.post('/voice', async (req, res) => {
    try {
        const {
            CallSid,
            CallDuration,
            To,
            From,
            CallStatus
        } = req.body;

        console.log(`📞 Voice webhook: ${CallStatus} - CallSid: ${CallSid}, Duration: ${CallDuration}s, To: ${To}`);

        if (CallStatus === 'completed' && CallDuration) {
            // Find client by RinglyPro phone number (To field)
            const { Client } = require('../models');
            const client = await Client.findOne({
                where: { ringlypro_number: To }
            });

            if (!client) {
                console.warn(`⚠️ No client found for number ${To}`);
                res.type('text/xml');
                res.send('<Response></Response>');
                return;
            }

            const clientId = client.id;
            const durationSeconds = parseInt(CallDuration);

            // Track usage in credit system
            await creditSystem.trackUsage(clientId, {
                callSid: CallSid,
                durationSeconds: durationSeconds,
                usageType: 'voice_call'
            });

            console.log(`✅ Tracked call ${CallSid}: ${durationSeconds} seconds for client ${clientId} (${client.business_name})`);
        }

        // Return TwiML response
        res.type('text/xml');
        res.send('<Response></Response>');

    } catch (error) {
        console.error('❌ Twilio voice webhook error:', error);
        res.type('text/xml');
        res.send('<Response></Response>');
    }
});

// POST /webhook/twilio/sms - Handle SMS usage
router.post('/sms', async (req, res) => {
    try {
        const { 
            MessageSid,
            SmsStatus,
            To,
            From 
        } = req.body;
        
        if (SmsStatus === 'delivered' || SmsStatus === 'sent') {
            // For MVP: Use client ID 1, later lookup by phone number
            const clientId = 1;
            
            // Track SMS usage (each SMS costs $0.05 after free tier)
            await creditSystem.trackUsage(clientId, {
                messageSid: MessageSid,
                durationSeconds: 0, // SMS doesn't use duration
                usageType: 'sms'
            });
            
            console.log(`Tracked SMS ${MessageSid} for client ${clientId}`);
        }
        
        // Return TwiML response
        res.type('text/xml');
        res.send('<Response></Response>');
        
    } catch (error) {
        console.error('Twilio SMS webhook error:', error);
        res.type('text/xml');
        res.send('<Response></Response>');
    }
});

module.exports = router;