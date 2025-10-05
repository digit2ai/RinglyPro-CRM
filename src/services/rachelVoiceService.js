// services/rachelVoiceService.js
const twilio = require('twilio');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const ClientIdentificationService = require('./clientIdentificationService');

class MultiTenantRachelService {
    constructor(databaseUrl, webhookBaseUrl, elevenlabsApiKey) {
        this.databaseUrl = databaseUrl;
        this.webhookBaseUrl = webhookBaseUrl;
        this.elevenlabsApiKey = elevenlabsApiKey;
        this.clientService = new ClientIdentificationService(databaseUrl);
        
        // Rachel's voice configuration
        this.rachelVoiceId = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs Rachel voice ID
        
        // Ensure audio directory exists
        this.audioDir = '/tmp';
    }

    /**
     * Handle incoming call with client identification
     * @param {Object} requestBody - Twilio webhook request body
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handleIncomingCall(requestBody, session) {
        const toNumber = requestBody.To || '';
        const fromNumber = requestBody.From || '';
        const callSid = requestBody.CallSid || '';
        
        console.log(`📞 Incoming call: ${fromNumber} → ${toNumber} (SID: ${callSid})`);
        
        // Identify the client by the called number (To)
        const clientInfo = await this.clientService.identifyClientByNumber(toNumber);
        
        if (!clientInfo) {
            console.error(`❌ No client found for number ${toNumber}`);
            return this.createErrorResponse("I'm sorry, there seems to be a configuration issue. Please call back later.");
        }
        
        // Check if Rachel is enabled for this client
        if (!clientInfo.rachel_enabled) {
            console.log(`📵 Rachel disabled for ${clientInfo.business_name}`);
            return this.createForwardResponse(clientInfo);
        }
        
        // Store client info in session for use in subsequent requests
        session.client_id = clientInfo.client_id;
        session.business_name = clientInfo.business_name;
        session.booking_url = clientInfo.booking_url;
        session.call_sid = callSid;
        session.caller_number = fromNumber;
        
        // Log call start
        await this.clientService.logCallStart(clientInfo.client_id, fromNumber, callSid);

        // Create bilingual language selection menu
        return await this.createLanguageSelectionMenu(clientInfo);
    }

    /**
     * Create initial bilingual language selection menu
     * @param {Object} clientInfo - Client information object
     * @returns {string} TwiML response
     */
    async createLanguageSelectionMenu(clientInfo) {
        const twiml = new twilio.twiml.VoiceResponse();

        // Bilingual greeting: English first, then Spanish
        const bilingualGreeting = `Hello and welcome to ${clientInfo.business_name}. For English, press 1. Para español, presione dos.`;

        // Create gather for language selection (DTMF keypad input)
        const gather = twiml.gather({
            input: 'dtmf',
            numDigits: 1,
            timeout: 10,
            action: '/voice/rachel/select-language',
            method: 'POST'
        });

        // Try to use Rachel's voice for bilingual greeting
        const audioUrl = await this.generateRachelAudio(bilingualGreeting);

        if (audioUrl) {
            gather.play(audioUrl);
            console.log(`✅ Using Rachel's voice for bilingual greeting - ${clientInfo.business_name}`);
        } else {
            gather.say(bilingualGreeting, { voice: 'Polly.Joanna', language: 'en-US' });
            console.warn(`⚠️ Fallback voice for bilingual greeting - ${clientInfo.business_name}`);
        }

        // If no input, default to English
        twiml.redirect('/voice/rachel/incoming?lang=en');

        return twiml.toString();
    }

    /**
     * Create personalized greeting based on client information
     * @param {Object} clientInfo - Client information object
     * @returns {string} TwiML response
     */
    async createPersonalizedGreeting(clientInfo) {
        const twiml = new twilio.twiml.VoiceResponse();

        // Generate personalized greeting text
        const greetingText = this.clientService.getClientGreetingText(clientInfo);

        // Create speech gathering with personalized greeting
        const gather = twiml.gather({
            input: 'speech',
            timeout: 5,
            action: '/voice/rachel/process-speech',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'en-US'
        });

        // Try to use Rachel's premium voice
        const audioUrl = await this.generateRachelAudio(greetingText);

        if (audioUrl) {
            gather.play(audioUrl);
            console.log(`✅ Using Rachel's premium voice for ${clientInfo.business_name}`);
        } else {
            gather.say(greetingText, { voice: 'Polly.Joanna', language: 'en-US' });
            console.warn(`⚠️ Fallback voice for ${clientInfo.business_name}`);
        }

        twiml.redirect('/voice/rachel/webhook');

        return twiml.toString();
    }

    /**
     * Create response that forwards call when Rachel is disabled
     * @param {Object} clientInfo - Client information object
     * @returns {string} TwiML response
     */
    createForwardResponse(clientInfo) {
        const twiml = new twilio.twiml.VoiceResponse();
        
        // Play a brief message then forward
        const forwardText = `Please hold while I connect you to ${clientInfo.business_name}.`;
        twiml.say(forwardText, { voice: 'Polly.Joanna' });
        
        // In a real implementation, you would dial the client's actual phone number
        // For now, we'll just end the call with a message
        twiml.say("I'm sorry, call forwarding is not configured yet. Please try again later.");
        twiml.hangup();
        
        console.log(`📞 Call forwarded (simulated) for ${clientInfo.business_name}`);
        return twiml.toString();
    }

    /**
     * Create error response for unidentified calls
     * @param {string} errorMessage - Error message to play
     * @returns {string} TwiML response
     */
    createErrorResponse(errorMessage) {
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say(errorMessage, { voice: 'Polly.Joanna' });
        twiml.hangup();
        return twiml.toString();
    }

    /**
     * Process speech input with client context
     * @param {Object} requestBody - Twilio webhook request body
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async processSpeechInput(requestBody, session) {
        const speechResult = (requestBody.SpeechResult || '').toLowerCase().trim();
        const clientId = session.client_id;
        const businessName = session.business_name || 'this business';
        
        console.log(`🎤 Speech from client ${clientId}: '${speechResult}'`);
        
        if (!clientId) {
            console.error("❌ No client context in session");
            return this.createErrorResponse("Session expired. Please call back.");
        }
        
        // Process speech based on intent
        if (this.containsKeywords(speechResult, ['book', 'appointment', 'schedule', 'demo'])) {
            return await this.handleBookingRequest(speechResult, session);
        } else if (this.containsKeywords(speechResult, ['price', 'pricing', 'cost', 'how much'])) {
            return await this.handlePricingRequest(session);
        } else if (this.containsKeywords(speechResult, ['support', 'help', 'speak with', 'talk to'])) {
            return await this.handleSupportRequest(session);
        } else {
            return await this.handleUnknownRequest(speechResult, session);
        }
    }

    /**
     * Check if speech contains any of the specified keywords
     * @param {string} speech - Speech text to check
     * @param {Array} keywords - Keywords to look for
     * @returns {boolean} True if any keyword is found
     */
    containsKeywords(speech, keywords) {
        return keywords.some(keyword => speech.includes(keyword));
    }

    /**
     * Handle appointment booking request
     * @param {string} speechResult - Original speech input
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handleBookingRequest(speechResult, session) {
        const twiml = new twilio.twiml.VoiceResponse();
        const businessName = session.business_name || 'this business';
        
        const bookingText = `
            Great! I'd be happy to help you book an appointment with ${businessName}. 
            Let me gather some information from you. 
            Can you please tell me your full name?
        `;
        
        const gather = twiml.gather({
            input: 'speech',
            timeout: 10,
            action: '/voice/rachel/collect-name',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'en-US'
        });
        
        const audioUrl = await this.generateRachelAudio(bookingText);
        if (audioUrl) {
            gather.play(audioUrl);
        } else {
            gather.say(bookingText, { voice: 'Polly.Joanna' });
        }
        
        return twiml.toString();
    }

    /**
     * Handle pricing inquiry
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handlePricingRequest(session) {
        const twiml = new twilio.twiml.VoiceResponse();
        const businessName = session.business_name || 'this business';
        
        const pricingText = `
            Thank you for your interest in ${businessName}'s services. 
            I'd be happy to connect you with someone who can discuss pricing and options with you. 
            Would you like me to schedule a consultation call, or would you prefer to speak with someone right now?
        `;
        
        const gather = twiml.gather({
            input: 'speech',
            timeout: 10,
            action: '/voice/rachel/handle-pricing-response',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'en-US'
        });
        
        const audioUrl = await this.generateRachelAudio(pricingText);
        if (audioUrl) {
            gather.play(audioUrl);
        } else {
            gather.say(pricingText, { voice: 'Polly.Joanna' });
        }
        
        return twiml.toString();
    }

    /**
     * Handle support request
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handleSupportRequest(session) {
        const twiml = new twilio.twiml.VoiceResponse();
        const businessName = session.business_name || 'this business';
        
        const supportText = `
            I'll be happy to help connect you with ${businessName}'s support team. 
            Please hold while I transfer your call.
        `;
        
        // Play message then simulate transfer
        const audioUrl = await this.generateRachelAudio(supportText);
        if (audioUrl) {
            twiml.play(audioUrl);
        } else {
            twiml.say(supportText, { voice: 'Polly.Joanna' });
        }
        
        // In real implementation, would transfer to client's support number
        twiml.say("Support transfer is not configured yet. Please call back later or visit the website.");
        twiml.hangup();
        
        return twiml.toString();
    }

    /**
     * Handle unknown/unclear requests
     * @param {string} speechResult - Original speech input
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handleUnknownRequest(speechResult, session) {
        const twiml = new twilio.twiml.VoiceResponse();
        const businessName = session.business_name || 'this business';
        
        const clarificationText = `
            I'm sorry, I didn't quite understand that. 
            I can help you with booking an appointment, getting pricing information, or connecting you with ${businessName}'s team. 
            What would you like to do?
        `;
        
        const gather = twiml.gather({
            input: 'speech',
            timeout: 10,
            action: '/voice/rachel/process-speech',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'en-US'
        });
        
        const audioUrl = await this.generateRachelAudio(clarificationText);
        if (audioUrl) {
            gather.play(audioUrl);
        } else {
            gather.say(clarificationText, { voice: 'Polly.Joanna' });
        }
        
        return twiml.toString();
    }

    /**
     * Generate audio using ElevenLabs Rachel voice
     * @param {string} text - Text to convert to speech
     * @returns {string|null} URL to generated audio file or null if failed
     */
    async generateRachelAudio(text) {
        if (!this.elevenlabsApiKey) {
            console.warn("ElevenLabs API key not configured");
            return null;
        }
        
        try {
            const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.rachelVoiceId}`;
            const headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": this.elevenlabsApiKey
            };
            
            // Clean text for speech synthesis
            const speechText = text.replace(/\n/g, " ").trim().replace(/\$/g, " dollars");
            
            const ttsData = {
                text: speechText,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            };
            
            const response = await axios.post(url, ttsData, { 
                headers, 
                timeout: 10000,
                responseType: 'arraybuffer'
            });
            
            if (response.status === 200) {
                // Save audio temporarily
                const audioFilename = `rachel_${uuidv4()}.mp3`;
                const audioPath = path.join(this.audioDir, audioFilename);
                
                await fs.writeFile(audioPath, response.data);
                
                // Return URL that Twilio can access
                const audioUrl = `${this.webhookBaseUrl}/audio/${audioFilename}`;
                console.log(`✅ Rachel audio generated successfully`);
                return audioUrl;
            } else {
                console.warn(`ElevenLabs TTS failed: ${response.status}`);
                return null;
            }
            
        } catch (error) {
            console.error("Error generating Rachel audio:", error.message);
            return null;
        }
    }
}

module.exports = MultiTenantRachelService;