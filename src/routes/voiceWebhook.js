const express = require('express');
const router = express.Router();
const { VoiceResponse } = require('twilio').twiml;
const path = require('path');
const fs = require('fs');

// Import Rachel voice service and database helpers
const { 
    rachelVoice, 
    logCallForRachel, 
    findOrCreateContactForRachel,
    createAppointmentForRachel,
    getAvailableSlots 
} = require('../models');

// Store call session data temporarily (in production, use Redis or database)
const callSessions = new Map();

// Main incoming call handler
router.post('/incoming', async (req, res) => {
    try {
        console.log('📞 Incoming call received');
        console.log('Call details:', {
            CallSid: req.body.CallSid,
            From: req.body.From,
            To: req.body.To,
            CallStatus: req.body.CallStatus
        });
        
        const callSid = req.body.CallSid;
        const fromNumber = req.body.From;
        const toNumber = req.body.To;
        
        // Log call to database
        await logCallForRachel({
            callSid,
            fromNumber,
            toNumber,
            callStatus: req.body.CallStatus,
            direction: 'inbound',
            source: 'rachel_voice'
        });

        // Initialize call session
        callSessions.set(callSid, {
            fromNumber,
            startTime: new Date(),
            step: 'greeting'
        });

        // Generate greeting with Rachel's voice
        if (!rachelVoice) {
            throw new Error('Rachel Voice Service not available');
        }

        const response = await rachelVoice.createGreetingResponse();
        
        res.type('text/xml');
        res.send(response.toString());
        
    } catch (error) {
        console.error('Voice webhook error:', error);
        
        const response = new VoiceResponse();
        response.say("Sorry, there was a technical issue. Please call back in a moment.", { voice: 'Polly.Joanna' });
        
        res.type('text/xml');
        res.send(response.toString());
    }
});

// Process speech input
router.post('/process-speech', async (req, res) => {
    try {
        const speechResult = req.body.SpeechResult?.trim() || '';
        const callSid = req.body.CallSid;
        const callerPhone = req.body.From;
        
        console.log(`🎤 Speech processed: "${speechResult}" from ${callerPhone}`);
        
        if (!speechResult || speechResult.length < 2) {
            const response = new VoiceResponse();
            const gather = response.gather({
                input: 'speech',
                timeout: 5,
                action: '/voice/rachel/process-speech',
                method: 'POST',
                speechTimeout: 'auto'
            });
            
            gather.say("I didn't catch that. Please speak clearly and tell me how I can help you.", { voice: 'Polly.Joanna' });
            
            res.type('text/xml');
            res.send(response.toString());
            return;
        }

        // Get or create business context for this caller
        const businessContext = await getBusinessContextForCaller(callerPhone);
        
        // Update call session
        if (callSessions.has(callSid)) {
            const session = callSessions.get(callSid);
            session.lastSpeech = speechResult;
            session.step = 'processing';
        }
        
        // Log speech to database
        await logCallForRachel({
            callSid,
            fromNumber: callerPhone,
            speechResult,
            callStatus: 'in-progress'
        });
        
        // Process with Rachel's AI
        if (!rachelVoice) {
            throw new Error('Rachel Voice Service not available');
        }

        const response = await rachelVoice.processSpeechInput(speechResult, businessContext);
        
        res.type('text/xml');
        res.send(response.toString());
        
    } catch (error) {
        console.error('Speech processing error:', error);
        
        const response = new VoiceResponse();
        response.say("I'm sorry, I had trouble processing that. Let me transfer you to our team.", { voice: 'Polly.Joanna' });
        
        const dial = response.dial({ timeout: 30 });
        dial.number('+16566001400');
        
        res.type('text/xml');
        res.send(response.toString());
    }
});

// Handle name collection for booking
router.post('/collect-name', async (req, res) => {
    try {
        const speechResult = req.body.SpeechResult?.trim() || '';
        const callSid = req.body.CallSid;
        
        console.log(`👤 Name collection: "${speechResult}"`);
        
        if (speechResult && speechResult.length >= 2) {
            // Store name in session
            if (callSessions.has(callSid)) {
                const session = callSessions.get(callSid);
                session.customerName = speechResult;
                session.step = 'collect_phone';
            }
            
            if (!rachelVoice) {
                throw new Error('Rachel Voice Service not available');
            }

            const response = await rachelVoice.collectBookingInfo('name', speechResult, callSid);
            
            res.type('text/xml');
            res.send(response.toString());
        } else {
            // Ask again
            const response = new VoiceResponse();
            const gather = response.gather({
                input: 'speech',
                timeout: 5,
                action: '/voice/rachel/collect-name',
                method: 'POST'
            });
            gather.say("I didn't catch that clearly. Please say your full name.", { voice: 'Polly.Joanna' });
            
            res.type('text/xml');
            res.send(response.toString());
        }
    } catch (error) {
        console.error('Name collection error:', error);
        
        const response = new VoiceResponse();
        response.say("There was an error collecting your information. Let me connect you with our team.", { voice: 'Polly.Joanna' });
        
        const dial = response.dial();
        dial.number('+16566001400');
        
        res.type('text/xml');
        res.send(response.toString());
    }
});

// Handle phone number collection
router.post('/collect-phone', async (req, res) => {
    try {
        const speechResult = req.body.SpeechResult?.trim() || '';
        const digits = req.body.Digits?.trim() || '';
        const callSid = req.body.CallSid;
        
        // Use digits if available, otherwise use speech
        const phoneInput = digits || speechResult;
        console.log(`📱 Phone collection: "${phoneInput}"`);
        
        if (phoneInput) {
            // Clean and validate phone number
            const phoneDigits = phoneInput.replace(/\D/g, '');
            
            if (phoneDigits.length >= 10) {
                const formattedPhone = phoneDigits.length === 11 && phoneDigits[0] === '1' 
                    ? `+${phoneDigits}` 
                    : `+1${phoneDigits.slice(-10)}`;
                
                // Update session
                if (callSessions.has(callSid)) {
                    const session = callSessions.get(callSid);
                    session.customerPhone = formattedPhone;
                    session.step = 'completed';
                }
                
                // Send SMS with booking link
                if (rachelVoice) {
                    await rachelVoice.sendBookingSMS(formattedPhone);
                }
                
                // Create contact if name was collected
                const session = callSessions.get(callSid);
                if (session?.customerName) {
                    await findOrCreateContactForRachel(formattedPhone, {
                        firstName: session.customerName.split(' ')[0],
                        lastName: session.customerName.split(' ').slice(1).join(' ')
                    });
                }
                
                if (!rachelVoice) {
                    throw new Error('Rachel Voice Service not available');
                }

                const response = await rachelVoice.collectBookingInfo('phone', formattedPhone, callSid);
                
                res.type('text/xml');
                res.send(response.toString());
                return;
            }
        }
        
        // If we get here, the phone number wasn't valid
        const response = new VoiceResponse();
        const gather = response.gather({
            input: ['speech', 'dtmf'],
            timeout: 10,
            action: '/voice/rachel/collect-phone',
            method: 'POST',
            numDigits: 10,
            finishOnKey: '#'
        });
        gather.say("I need a valid phone number. Please say it clearly or enter it using the keypad, then press pound.", { voice: 'Polly.Joanna' });
        
        res.type('text/xml');
        res.send(response.toString());
        
    } catch (error) {
        console.error('Phone collection error:', error);
        
        const response = new VoiceResponse();
        response.say("There was an error collecting your phone number. Let me connect you with our team.", { voice: 'Polly.Joanna' });
        
        const dial = response.dial();
        dial.number('+16566001400');
        
        res.type('text/xml');
        res.send(response.toString());
    }
});

// Handle pricing follow-up
router.post('/pricing-followup', async (req, res) => {
    try {
        const speechResult = req.body.SpeechResult?.trim().toLowerCase() || '';
        
        console.log(`💰 Pricing followup: "${speechResult}"`);
        
        if (!rachelVoice) {
            throw new Error('Rachel Voice Service not available');
        }

        let response;
        
        if (speechResult.includes('yes') || speechResult.includes('book') || speechResult.includes('demo') || speechResult.includes('consultation')) {
            response = await rachelVoice.handleDemoBooking();
        } else if (speechResult.includes('repeat') || speechResult.includes('again') || speechResult.includes('pricing')) {
            response = await rachelVoice.handlePricingInquiry();
        } else {
            // Default to connecting with team
            response = new VoiceResponse();
            response.say("Thank you for your interest in RinglyPro. Let me connect you with our team for more information.", { voice: 'Polly.Joanna' });
            
            const dial = response.dial();
            dial.number('+16566001400');
        }
        
        res.type('text/xml');
        res.send(response.toString());
        
    } catch (error) {
        console.error('Pricing followup error:', error);
        
        const response = new VoiceResponse();
        response.say("Let me connect you with our team.", { voice: 'Polly.Joanna' });
        
        const dial = response.dial();
        dial.number('+16566001400');
        
        res.type('text/xml');
        res.send(response.toString());
    }
});

// Handle call completion
router.post('/call-complete', async (req, res) => {
    try {
        const callSid = req.body.CallSid;
        const callDuration = req.body.CallDuration || '0';
        const callStatus = req.body.CallStatus || 'completed';
        
        console.log(`📞 Call completed: ${callSid} (${callDuration}s)`);
        
        // Log final call data
        await logCallForRachel({
            callSid,
            callStatus,
            duration: parseInt(callDuration),
            finalStatus: 'completed'
        });
        
        // Clean up call session
        if (callSessions.has(callSid)) {
            callSessions.delete(callSid);
        }
        
        const response = new VoiceResponse();
        response.say("Thank you for calling RinglyPro. Have a great day!", { voice: 'Polly.Joanna' });
        
        res.type('text/xml');
        res.send(response.toString());
        
    } catch (error) {
        console.error('Call completion error:', error);
        
        const response = new VoiceResponse();
        response.say("Thank you for calling.", { voice: 'Polly.Joanna' });
        
        res.type('text/xml');
        res.send(response.toString());
    }
});

// Audio serving endpoint (for Rachel's voice files)
router.get('/audio/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const audioPath = path.join('/tmp', filename);
        
        console.log(`🎵 Serving audio: ${filename}`);
        
        if (fs.existsSync(audioPath)) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-cache');
            
            const stream = fs.createReadStream(audioPath);
            stream.pipe(res);
            
            // Clean up file after serving
            stream.on('end', () => {
                try {
                    fs.unlinkSync(audioPath);
                    console.log(`🗑️ Cleaned up audio file: ${filename}`);
                } catch (err) {
                    console.log(`Could not clean up ${filename}:`, err.message);
                }
            });
        } else {
            console.log(`❌ Audio file not found: ${filename}`);
            res.status(404).send('Audio file not found');
        }
    } catch (error) {
        console.error(`Error serving audio ${req.params.filename}:`, error);
        res.status(500).send('Error serving audio');
    }
});

// Test endpoint for Rachel voice system
router.get('/test-rachel', async (req, res) => {
    try {
        const testResult = {
            timestamp: new Date().toISOString(),
            rachelVoiceService: !!rachelVoice,
            elevenlabsConfigured: !!process.env.ELEVENLABS_API_KEY,
            twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
            webhookUrl: process.env.WEBHOOK_BASE_URL + '/voice/rachel/incoming'
        };
        
        if (rachelVoice) {
            // Test Rachel's audio generation
            const testAudio = await rachelVoice.generateRachelAudio("This is a test of Rachel's voice system.");
            testResult.audioGeneration = !!testAudio;
            testResult.audioUrl = testAudio;
        }
        
        res.json(testResult);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Helper function to get business context for caller
async function getBusinessContextForCaller(phoneNumber) {
    try {
        // Try to find existing contact or user by phone number
        const { Contact, User } = require('../models');
        
        if (Contact) {
            const contact = await Contact.findOne({
                where: { phone: phoneNumber }
            });
            
            if (contact) {
                return {
                    hasHistory: true,
                    contactName: `${contact.firstName} ${contact.lastName}`.trim(),
                    lastContacted: contact.lastContactedAt
                };
            }
        }
        
        // Could also check User table if they have business context
        return {
            hasHistory: false,
            isNewCaller: true
        };
        
    } catch (error) {
        console.log('Error getting business context:', error.message);
        return { hasHistory: false, isNewCaller: true };
    }
}

module.exports = router;