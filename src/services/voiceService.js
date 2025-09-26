const twilio = require('twilio');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { VoiceResponse } = twilio.twiml;

class RachelVoiceService {
    constructor() {
        this.elevenlabs_api_key = process.env.ELEVENLABS_API_KEY;
        this.rachel_voice_id = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice from your Python system
        this.twilio_phone = process.env.TWILIO_PHONE_NUMBER || "+8886103810";
        this.webhook_base_url = process.env.WEBHOOK_BASE_URL || "https://ringlypro-crm.onrender.com";
        this.client_name = process.env.CLIENT_NAME || 'RinglyPro';
        this.anthropic_api_key = process.env.ANTHROPIC_API_KEY;
        
        // Ensure temp directory exists
        this.tempDir = '/tmp';
        if (!fs.existsSync(this.tempDir)) {
            try {
                fs.mkdirSync(this.tempDir, { recursive: true });
            } catch (err) {
                console.log('Could not create temp directory, using current directory');
                this.tempDir = '.';
            }
        }
        
        console.log('Rachel Voice Service initialized');
        console.log(`- Client: ${this.client_name}`);
        console.log(`- Phone: ${this.twilio_phone}`);
        console.log(`- Webhook URL: ${this.webhook_base_url}`);
        console.log(`- ElevenLabs: ${this.elevenlabs_api_key ? 'Configured' : 'Missing'}`);
    }

    async generateRachelAudio(text) {
        if (!this.elevenlabs_api_key) {
            console.log('ElevenLabs API key not found, using Twilio TTS fallback');
            return null;
        }

        try {
            const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.rachel_voice_id}`;
            
            const headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": this.elevenlabs_api_key
            };

            // Optimize text for speech (from your Python system)
            const speech_text = text
                .replace("RinglyPro", "Ringly Pro")
                .replace("AI", "A.I.")
                .replace("$", " dollars");

            const tts_data = {
                text: speech_text,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            };

            const response = await axios.post(url, tts_data, { 
                headers, 
                timeout: 10000,
                responseType: 'arraybuffer'
            });

            if (response.status === 200 && response.data.byteLength > 1000) {
                // Save audio file temporarily
                const filename = `rachel_${crypto.randomUUID()}.mp3`;
                const audioPath = path.join(this.tempDir, filename);
                
                fs.writeFileSync(audioPath, response.data);
                
                const audio_url = `${this.webhook_base_url}/voice/audio/${filename}`;
                console.log(`Rachel audio generated: ${filename} (${response.data.byteLength} bytes)`);
                return audio_url;
            } else {
                console.log('ElevenLabs returned invalid audio data');
                return null;
            }
        } catch (error) {
            console.error(`ElevenLabs TTS failed: ${error.message}`);
            return null;
        }
    }

    createGreetingResponse() {
        const response = new VoiceResponse();
        
        const greeting_text = `
        Thank you for calling ${this.client_name}, your A.I. powered business assistant. 
        I'm Rachel, your virtual receptionist. 
        To better serve you, please tell me what you'd like to do. 
        Say book a demo to schedule a consultation, 
        pricing to hear about our plans, 
        subscribe to get started with our service, 
        or support for customer service.
        `;

        const gather = response.gather({
            input: 'speech',
            timeout: 5,
            action: '/voice/process-speech',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'en-US'
        });

        // Use Twilio's built-in TTS - Rachel's voice will be added in process-speech
        gather.say(greeting_text, { voice: 'Polly.Joanna', language: 'en-US' });
        
        response.redirect('/voice/incoming');
        return response;
    }

    async processSpeechInput(speechResult, businessContext = null) {
        const response = new VoiceResponse();
        const speech_lower = speechResult.toLowerCase().trim();
        
        console.log(`Phone speech input: ${speechResult}`);

        // Intent detection (from your Python system)
        if (this.detectIntent(speech_lower, ['demo', 'consultation', 'appointment', 'meeting', 'schedule'])) {
            return await this.handleDemoBooking();
        } else if (this.detectIntent(speech_lower, ['price', 'pricing', 'cost', 'plan', 'package'])) {
            return await this.handlePricingInquiry();
        } else if (this.detectIntent(speech_lower, ['subscribe', 'subscription', 'sign up', 'signup', 'get started', 'start service'])) {
            return await this.handleSubscription();
        } else if (this.detectIntent(speech_lower, ['support', 'help', 'customer service', 'agent', 'representative'])) {
            return await this.handleSupportTransfer();
        } else {
            // Use FAQ system or AI response generation
            const aiResponse = await this.generateContextualResponse(speechResult, businessContext);
            
            if (aiResponse && !this.isNoAnswerResponse(aiResponse)) {
                // Try Rachel's voice first
                const audioUrl = await this.generateRachelAudio(aiResponse);
                if (audioUrl) {
                    response.play(audioUrl);
                } else {
                    response.say(aiResponse, { voice: 'Polly.Joanna' });
                }
                
                response.pause({ length: 1 });
                
                const followup = response.gather({
                    input: 'speech',
                    timeout: 5,
                    action: '/voice/process-speech',
                    method: 'POST',
                    speechTimeout: 'auto'
                });
                
                const followupText = "Is there anything else I can help you with today?";
                const followupAudio = await this.generateRachelAudio(followupText);
                
                if (followupAudio) {
                    followup.play(followupAudio);
                } else {
                    followup.say(followupText, { voice: 'Polly.Joanna' });
                }
            } else {
                // Transfer to human
                const transferText = "I'd be happy to help with that. Let me connect you with someone who can provide more specific information.";
                
                const transferAudio = await this.generateRachelAudio(transferText);
                if (transferAudio) {
                    response.play(transferAudio);
                } else {
                    response.say(transferText, { voice: 'Polly.Joanna' });
                }
                
                const dial = response.dial({ action: '/voice/call-complete', timeout: 30 });
                dial.number('+16566001400'); // Your support number
            }
        }
        
        return response;
    }

    detectIntent(speech, keywords) {
        return keywords.some(keyword => speech.includes(keyword));
    }

    async handleDemoBooking() {
        const response = new VoiceResponse();
        
        const booking_text = `
        Excellent! I'd be happy to schedule a free consultation for you. 
        Our team will show you how Ringly Pro can transform your business communications. 
        I'll need to collect a few details. 
        First, please say your full name.
        `;

        const gather = response.gather({
            input: 'speech',
            timeout: 5,
            action: '/voice/collect-name',
            method: 'POST',
            speechTimeout: 'auto'
        });

        // Try Rachel's voice
        const audioUrl = await this.generateRachelAudio(booking_text);
        if (audioUrl) {
            gather.play(audioUrl);
        } else {
            gather.say(booking_text, { voice: 'Polly.Joanna' });
        }
        
        return response;
    }

    async handlePricingInquiry() {
        const response = new VoiceResponse();
        
        const pricing_text = `
        I'd be happy to share our pricing plans with you. 
        
        We offer three tiers:
        
        The Starter Plan at 97 dollars per month includes 1000 minutes, 
        text messaging, and appointment scheduling.
        
        The Pro Plan at 297 dollars per month includes 3000 minutes, 
        C.R.M. integrations, and mobile app access.
        
        The Premium Plan at 497 dollars per month includes 7500 minutes, 
        dedicated account management, and marketing automation.
        
        Would you like to schedule a consultation to discuss which plan is right for you? 
        Say yes to book a demo, or repeat to hear the prices again.
        `;

        const gather = response.gather({
            input: 'speech',
            timeout: 5,
            action: '/voice/pricing-followup',
            method: 'POST',
            speechTimeout: 'auto'
        });

        // Try Rachel's voice
        const audioUrl = await this.generateRachelAudio(pricing_text);
        if (audioUrl) {
            gather.play(audioUrl);
        } else {
            gather.say(pricing_text, { voice: 'Polly.Joanna' });
        }
        
        return response;
    }

    async handleSubscription() {
        const response = new VoiceResponse();
        
        const subscribe_text = `
        Wonderful! I'm excited to help you get started with Ringly Pro. 
        I'm sending you our subscription link via text message right now.
        I'll also connect you with our onboarding specialist 
        who will walk you through the setup process. 
        
        Please hold while I transfer you.
        `;

        // Try Rachel's voice
        const audioUrl = await this.generateRachelAudio(subscribe_text);
        if (audioUrl) {
            response.play(audioUrl);
        } else {
            response.say(subscribe_text, { voice: 'Polly.Joanna' });
        }
        
        response.pause({ length: 1 });
        
        const dial = response.dial({
            action: '/voice/call-complete',
            timeout: 30,
            record: 'record-from-answer-dual'
        });
        dial.number('+16566001400'); // Your sales number
        
        return response;
    }

    async handleSupportTransfer() {
        const response = new VoiceResponse();
        
        const transferText = "I'll connect you with our customer support team right away. Please hold.";
        
        // Try Rachel's voice
        const audioUrl = await this.generateRachelAudio(transferText);
        if (audioUrl) {
            response.play(audioUrl);
        } else {
            response.say(transferText, { voice: 'Polly.Joanna' });
        }
        
        const dial = response.dial({
            action: '/voice/call-complete',
            timeout: 30,
            record: 'record-from-answer-dual'
        });
        dial.number('+16566001400'); // Your support number
        
        return response;
    }

    async generateContextualResponse(userInput, businessContext) {
        try {
            // First try using your existing AI response generator
            const aiResponseGenerator = require('./aiResponseGenerator');
            
            if (aiResponseGenerator) {
                const response = await aiResponseGenerator.generateResponse(userInput, businessContext);
                if (response && response.length > 0) {
                    return response;
                }
            }
        } catch (error) {
            console.log('AI response generator not available:', error.message);
        }

        // Fallback to basic FAQ responses
        return this.getBasicFAQResponse(userInput);
    }

    getBasicFAQResponse(userInput) {
        const input_lower = userInput.toLowerCase();
        
        // Basic FAQ responses matching your Python system
        const faq_responses = {
            'what is ringlypro': "RinglyPro is a 24/7 AI-powered call answering and client booking service designed for small businesses and professionals.",
            'pricing': "We offer three plans: Starter at $97/month, Pro at $297/month, and Premium at $497/month. Each includes different features and minute allowances.",
            'features': "Key features include 24/7 AI call answering, bilingual virtual receptionists, appointment scheduling, CRM integrations, and call recording.",
            'how it works': "RinglyPro uses advanced AI to answer your business calls professionally, take messages, schedule appointments, and route calls according to your needs.",
            'support': "Our support team is available to help you. You can reach us at this number or through our website."
        };

        // Simple keyword matching
        for (const [key, response] of Object.entries(faq_responses)) {
            if (input_lower.includes(key.replace(' ', '')) || key.split(' ').some(word => input_lower.includes(word))) {
                return response;
            }
        }

        return "I'd be happy to help with that. Let me connect you with our team for more specific assistance.";
    }

    isNoAnswerResponse(response) {
        const noAnswerIndicators = [
            "I don't have information",
            "couldn't find a direct answer", 
            "please contact our customer service",
            "I don't have a specific answer",
            "contact our support team",
            "connect you with our team"
        ];
        return noAnswerIndicators.some(indicator => response.toLowerCase().includes(indicator));
    }

    // Utility methods for booking flow
    async collectBookingInfo(step, value = null, callSid = null) {
        const response = new VoiceResponse();
        
        if (step === 'name') {
            const gather = response.gather({
                input: ['speech', 'dtmf'],
                timeout: 10,
                action: '/voice/collect-phone',
                method: 'POST',
                speechTimeout: 'auto',
                numDigits: 10,
                finishOnKey: '#'
            });
            
            const text = `Thank you ${value}. Now, please say or enter your phone number using the keypad.`;
            const audioUrl = await this.generateRachelAudio(text);
            
            if (audioUrl) {
                gather.play(audioUrl);
            } else {
                gather.say(text, { voice: 'Polly.Joanna' });
            }
            
        } else if (step === 'phone') {
            const text = `Perfect! I have your phone number as ${value}. I'll send you a text message with a link to schedule your consultation online at your convenience.`;
            
            const audioUrl = await this.generateRachelAudio(text);
            if (audioUrl) {
                response.play(audioUrl);
            } else {
                response.say(text, { voice: 'Polly.Joanna' });
            }
            
            response.pause({ length: 1 });
            
            const followupText = "Is there anything else I can help you with today?";
            const followupAudio = await this.generateRachelAudio(followupText);
            
            const gather = response.gather({
                input: 'speech',
                timeout: 5,
                action: '/voice/process-speech',
                method: 'POST'
            });
            
            if (followupAudio) {
                gather.play(followupAudio);
            } else {
                gather.say(followupText, { voice: 'Polly.Joanna' });
            }
        }
        
        return response;
    }

    // SMS helper method
    async sendBookingSMS(phoneNumber) {
        try {
            if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
                console.log('Twilio credentials not configured for SMS');
                return false;
            }

            const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            
            const message_body = `
Thank you for calling RinglyPro!

Schedule your FREE consultation:
${this.webhook_base_url}/appointments/book

Or call us back at ${this.twilio_phone}

- The RinglyPro Team
            `.trim();
            
            const message = await client.messages.create({
                body: message_body,
                from: this.twilio_phone,
                to: phoneNumber
            });
            
            console.log(`Booking SMS sent to ${phoneNumber}: ${message.sid}`);
            return true;
            
        } catch (error) {
            console.error('Failed to send booking SMS:', error.message);
            return false;
        }
    }
}

module.exports = RachelVoiceService;