const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { Client } = require('../models');

// POST /webhook/conditional-forward
router.post('/conditional-forward', async (req, res) => {
    try {
        const { From, To, CallSid } = req.body;
        
        console.log(`Conditional Forward: Call from ${From} to ${To}`);
        
        // Find client by business phone number
        const client = await Client.findOne({
            where: { business_phone: To }
        });

        if (!client) {
            console.log(`No client found for business number: ${To}`);
            return res.status(404).send('Client not found');
        }

        const twiml = new twilio.twiml.VoiceResponse();

        // Check if Rachel is enabled for this client
        if (client.rachel_enabled) {
            console.log(`Rachel enabled for ${client.business_name}, forwarding to Rachel...`);
            
            // Forward to Rachel's number after specified ring count
            twiml.dial({
                callerId: From,
                timeout: 30
            }, client.ringlypro_number); // This forwards to Rachel's AI number
            
        } else {
            console.log(`Rachel disabled for ${client.business_name}, ringing business phone...`);
            
            // Ring the business phone directly (no Rachel)
            twiml.dial({
                callerId: From,
                timeout: 30
            }, client.business_phone);
        }

        // Add fallback if no answer
        twiml.say({
            voice: 'Polly.Joanna'
        }, 'Sorry, no one is available to take your call. Please try again later or leave a message.');

        res.type('text/xml');
        res.send(twiml.toString());

    } catch (error) {
        console.error('Conditional forward error:', error);
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('We are experiencing technical difficulties. Please try again later.');
        
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

module.exports = router;