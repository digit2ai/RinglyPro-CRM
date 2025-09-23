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
        
        if (CallStatus === 'completed' && CallDuration) {
            // Find client by business phone number
            const durationSeconds = parseInt(CallDuration);
            
            // For MVP: Use client ID 1, later lookup by phone number
            const clientId = 1;
            
            // Track usage in credit system
            await creditSystem.trackUsage(clientId, {
                callSid: CallSid,
                durationSeconds: durationSeconds,
                usageType: 'voice_call'
            });
            
            console.log(`Tracked call ${CallSid}: ${durationSeconds} seconds for client ${clientId}`);
        }
        
        // Return TwiML response
        res.type('text/xml');
        res.send('<Response></Response>');
        
    } catch (error) {
        console.error('Twilio voice webhook error:', error);
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