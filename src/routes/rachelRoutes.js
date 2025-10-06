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

        // Save session before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Escape XML special characters to prevent parse errors
        const escapedName = name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="5" action="/voice/rachel/collect-phone" method="POST" language="en-US">
        <Say voice="Polly.Joanna">Thank you ${escapedName}. Now please tell me your phone number</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-name</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
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
        console.log(`📝 Prospect name from session: ${prospectName}`);

        // Store phone in session
        req.session.prospect_phone = phone;

        // Save session before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Escape XML special characters to prevent parse errors
        const escapedName = (prospectName || 'there')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedPhone = phone
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedBusiness = (businessName || 'this business')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="5" action="/voice/rachel/collect-datetime" method="POST" language="en-US">
        <Say voice="Polly.Joanna">Perfect ${escapedName}. Now tell me what date and time you prefer for your appointment. For example you can say tomorrow at 10 AM or Friday at 2 PM</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-phone</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-phone (English):', twiml.substring(0, 200));
        res.set('Content-Type', 'text/xml; charset=utf-8');
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
 * Collect date/time for appointment booking (English)
 */
router.post('/voice/rachel/collect-datetime', async (req, res) => {
    try {
        const datetime = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const businessName = req.session.business_name || 'this business';

        console.log(`📅 DateTime collected for client ${clientId}: ${datetime}`);
        console.log(`📝 Prospect info: ${prospectName} (${prospectPhone})`);

        // Store datetime in session
        req.session.appointment_datetime = datetime;

        // Save session before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Session save error in collect-datetime:', err);
                    reject(err);
                } else {
                    console.log('✅ Session saved with datetime');
                    resolve();
                }
            });
        });

        // Escape XML special characters
        const escapedName = (prospectName || 'there')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedDateTime = datetime
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Perfect ${escapedName}. Let me confirm your appointment for ${escapedDateTime}. Please hold while I check availability.</Say>
    <Redirect>/voice/rachel/book-appointment</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-datetime (English)');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting datetime:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, there was an error. Please try again.</Say>
    <Redirect>/voice/rachel/collect-phone</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);
    }
});

/**
 * Book appointment endpoint - would integrate with appointment booking system
 * Handle both GET (from redirects) and POST
 */
const handleBookAppointment = async (req, res) => {
    try {
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const appointmentDateTime = req.session.appointment_datetime || 'the requested time';
        const businessName = req.session.business_name || 'this business';

        console.log(`📅 Booking appointment for client ${clientId}: ${prospectName} (${prospectPhone}) at ${appointmentDateTime}`);

        // Escape XML special characters
        const escapedName = (prospectName || 'there')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedBusiness = (businessName || 'this business')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedDateTime = appointmentDateTime
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        // TODO: Integrate with actual appointment booking system
        // For now, just confirm the booking

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Great news ${escapedName}. I've successfully booked your appointment with ${escapedBusiness} for ${escapedDateTime}. You'll receive a text message confirmation shortly with all the details. Thank you for calling and we look forward to seeing you.</Say>
    <Hangup/>
</Response>`;

        console.log('📤 Sending TwiML from book-appointment (English)');
        res.set('Content-Type', 'text/xml; charset=utf-8');
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
};

// Register both GET and POST routes
router.post('/voice/rachel/book-appointment', handleBookAppointment);
router.get('/voice/rachel/book-appointment', handleBookAppointment);

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
 * Language selection handler
 */
router.post('/voice/rachel/select-language', async (req, res) => {
    try {
        const digits = req.body.Digits || '';
        console.log(`🌍 Language selected: ${digits === '1' ? 'English' : digits === '2' ? 'Spanish' : 'Unknown'}`);

        // Store language preference in session
        req.session.language = digits === '1' ? 'en' : digits === '2' ? 'es' : 'en';

        // Save session before redirecting to ensure persistence across language switch
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Error saving session before language redirect:', err);
                    reject(err);
                } else {
                    console.log('✅ Session saved before language redirect');
                    resolve();
                }
            });
        });

        if (digits === '1') {
            // English - Continue with Rachel
            res.redirect(307, '/voice/rachel/incoming?lang=en');
        } else if (digits === '2') {
            // Spanish - Route to Lina
            res.redirect(307, '/voice/lina/incoming?lang=es');
        } else {
            // Invalid input - default to English
            console.warn(`⚠️ Invalid language selection: ${digits}, defaulting to English`);
            res.redirect(307, '/voice/rachel/incoming?lang=en');
        }

    } catch (error) {
        console.error('Error handling language selection:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Continuing in English.</Say>
                <Redirect>/voice/rachel/incoming?lang=en</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * English greeting endpoint (called after language selection)
 * Handle both GET (from redirects) and POST (from direct calls)
 */
const handleEnglishIncoming = async (req, res) => {
    try {
        console.log('📞 English language selected - Rachel continuing');

        // Get client info from session
        const clientId = req.session.client_id;
        const businessName = req.session.business_name;

        if (!clientId) {
            console.error("❌ No client context in session");
            const twiml = `
                <?xml version="1.0" encoding="UTF-8"?>
                <Response>
                    <Say voice="Polly.Joanna">Session expired. Please call back.</Say>
                    <Hangup/>
                </Response>
            `;
            res.type('text/xml');
            return res.send(twiml);
        }

        // Reconstruct client info from session
        const clientInfo = {
            client_id: clientId,
            business_name: businessName,
            rachel_enabled: true
        };

        const twimlResponse = await rachelService.createPersonalizedGreeting(clientInfo);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error in Rachel incoming:', error);

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
};

// Register both GET and POST routes
router.post('/voice/rachel/incoming', handleEnglishIncoming);
router.get('/voice/rachel/incoming', handleEnglishIncoming);

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