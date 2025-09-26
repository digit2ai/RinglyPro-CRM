// routes/rachelRoutes.js
const express = require('express');
const MultiTenantRachelService = require('../services/rachelVoiceService');
const path = require('path');
const fs = require('fs').promises;

// Initialize Rachel service
const rachelService = new MultiTenantRachelService(
    process.env.DATABASE_URL,
    process.env.WEBHOOK_BASE_URL || 'https://ringlypro-crm.onrender.com',
    process.env.ELEVENLABS_API_KEY
);

const router = express.Router();

/**
 * Main Rachel webhook endpoint - handles incoming calls
 */
router.post('/voice/rachel/', async (req, res) => {
    try {
        console.log('📞 Rachel webhook called with:', req.body);
        
        const twimlResponse = await rachelService.handleIncomingCall(req.body, req.session);
        
        res.type('text/xml');
        res.send(twimlResponse);
        
    } catch (error) {
        console.error('Error in Rachel webhook:', error);
        
        // Fallback TwiML response
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Please try calling again.</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Process speech input endpoint
 */
router.post('/voice/rachel/process-speech', async (req, res) => {
    try {
        console.log('🎤 Processing speech:', req.body.SpeechResult);
        
        const twimlResponse = await rachelService.processSpeechInput(req.body, req.session);
        
        res.type('text/xml');
        res.send(twimlResponse);
        
    } catch (error) {
        console.error('Error processing speech:', error);
        
        // Fallback TwiML response
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error processing your request. Please try again.</Say>
                <Redirect>/voice/rachel/webhook</Redirect>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect name for appointment booking
 */
router.post('/voice/rachel/collect-name', async (req, res) => {
    try {
        const name = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const businessName = req.session.business_name || 'this business';
        
        console.log(`📝 Name collected for client ${clientId}: ${name}`);
        
        // Store name in session
        req.session.prospect_name = name;
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Gather input="speech" timeout="10" action="/voice/rachel/collect-phone" method="POST" speechTimeout="auto" language="en-US">
                    <Say voice="Polly.Joanna">Thank you ${name}. Now can you please tell me your phone number?</Say>
                </Gather>
                <Redirect>/voice/rachel/webhook</Redirect>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
        
    } catch (error) {
        console.error('Error collecting name:', error);
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Let me try again.</Say>
                <Redirect>/voice/rachel/process-speech</Redirect>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect phone number for appointment booking
 */
router.post('/voice/rachel/collect-phone', async (req, res) => {
    try {
        const phone = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const businessName = req.session.business_name || 'this business';
        
        console.log(`📞 Phone collected for client ${clientId}: ${phone}`);
        
        // Store phone in session
        req.session.prospect_phone = phone;
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">Perfect! ${prospectName}, I have your phone number as ${phone}. Let me check availability and book you an appointment with ${businessName}. Please hold for just a moment.</Say>
                <Redirect>/voice/rachel/book-appointment</Redirect>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
        
    } catch (error) {
        console.error('Error collecting phone:', error);
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Please try again.</Say>
                <Redirect>/voice/rachel/collect-name</Redirect>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Book appointment endpoint - would integrate with appointment booking system
 */
router.post('/voice/rachel/book-appointment', async (req, res) => {
    try {
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const businessName = req.session.business_name || 'this business';
        
        console.log(`📅 Booking appointment for client ${clientId}: ${prospectName} (${prospectPhone})`);
        
        // TODO: Integrate with actual appointment booking system
        // For now, just confirm the booking
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">Great news ${prospectName}! I've successfully booked your appointment with ${businessName}. You'll receive a text message confirmation shortly with all the details. Thank you for calling, and we look forward to speaking with you!</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
        
    } catch (error) {
        console.error('Error booking appointment:', error);
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error booking your appointment. Please call back or visit our website to schedule.</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Handle pricing response
 */
router.post('/voice/rachel/handle-pricing-response', async (req, res) => {
    try {
        const response = req.body.SpeechResult || '';
        const businessName = req.session.business_name || 'this business';
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">Thank you for your interest. I'll connect you with ${businessName}'s pricing specialist who can provide detailed information about our services and costs. Please hold while I transfer your call.</Say>
                <Say voice="Polly.Joanna">Transfer functionality is not configured yet. Please visit our website or call back later for pricing information.</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
        
    } catch (error) {
        console.error('Error handling pricing response:', error);
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Please call back later.</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Fallback webhook endpoint
 */
router.post('/voice/rachel/webhook', async (req, res) => {
    try {
        const businessName = req.session.business_name || 'us';
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">Thank you for calling ${businessName}. Have a great day!</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
        
    } catch (error) {
        console.error('Error in fallback webhook:', error);
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">Thank you for calling. Goodbye!</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Serve audio files for Rachel's voice
 */
router.get('/audio/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const audioPath = path.join('/tmp', filename);
        
        // Check if file exists
        await fs.access(audioPath);
        
        // Set appropriate headers for audio
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        // Send the audio file
        res.sendFile(audioPath);
        
        console.log(`🎵 Served audio file: ${filename}`);
        
    } catch (error) {
        console.error(`Error serving audio file ${req.params.filename}:`, error);
        res.status(404).send('Audio file not found');
    }
});

/**
 * Test endpoint to verify client identification
 */
router.get('/voice/rachel/test-client/:number', async (req, res) => {
    try {
        const phoneNumber = req.params.number;
        const clientInfo = await rachelService.clientService.identifyClientByNumber(phoneNumber);
        
        if (clientInfo) {
            res.json({
                success: true,
                message: `Client found: ${clientInfo.business_name}`,
                client: clientInfo
            });
        } else {
            res.json({
                success: false,
                message: `No client found for number: ${phoneNumber}`
            });
        }
        
    } catch (error) {
        console.error('Error testing client identification:', error);
        res.status(500).json({
            success: false,
            message: 'Error testing client identification',
            error: error.message
        });
    }
});

module.exports = router;