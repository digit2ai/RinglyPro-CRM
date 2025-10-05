// services/linaVoiceService.js - Spanish Voice Service
const twilio = require('twilio');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class LinaSpanishVoiceService {
    constructor(databaseUrl, webhookBaseUrl, elevenlabsApiKey) {
        this.databaseUrl = databaseUrl;
        this.webhookBaseUrl = webhookBaseUrl;
        this.elevenlabsApiKey = elevenlabsApiKey;

        // Lina's voice configuration - Using ElevenLabs "Bella" (good Spanish voice)
        // You can change this to any other ElevenLabs Spanish voice ID
        this.linaVoiceId = "EXAVITQu4vr4xnSDxMaL"; // Bella - Natural Spanish female voice

        // Ensure audio directory exists
        this.audioDir = '/tmp';
    }

    /**
     * Create personalized Spanish greeting
     * @param {Object} clientInfo - Client information object
     * @returns {string} TwiML response
     */
    async createPersonalizedGreeting(clientInfo) {
        const twiml = new twilio.twiml.VoiceResponse();

        // Generate personalized Spanish greeting text
        const greetingText = this.getSpanishGreetingText(clientInfo);

        // Create speech gathering with personalized Spanish greeting
        const gather = twiml.gather({
            input: 'speech',
            timeout: 5,
            action: '/voice/lina/process-speech',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'es-MX' // Mexican Spanish
        });

        // Try to use Lina's premium voice
        const audioUrl = await this.generateLinaAudio(greetingText);

        if (audioUrl) {
            gather.play(audioUrl);
            console.log(`✅ Using Lina's premium voice for ${clientInfo.business_name}`);
        } else {
            gather.say(greetingText, { voice: 'Polly.Lupe', language: 'es-MX' });
            console.warn(`⚠️ Fallback Spanish voice for ${clientInfo.business_name}`);
        }

        twiml.redirect('/voice/lina/webhook');

        return twiml.toString();
    }

    /**
     * Get Spanish greeting text for client
     * @param {Object} clientInfo - Client information object
     * @returns {string} Spanish greeting text
     */
    getSpanishGreetingText(clientInfo) {
        const businessName = clientInfo.business_name || 'nuestra empresa';

        const hour = new Date().getHours();
        let timeGreeting;

        if (hour < 12) {
            timeGreeting = 'Buenos días';
        } else if (hour < 19) {
            timeGreeting = 'Buenas tardes';
        } else {
            timeGreeting = 'Buenas noches';
        }

        return `${timeGreeting}, gracias por llamar a ${businessName}. Mi nombre es Lina, su asistente virtual. ¿En qué puedo ayudarle hoy? Puedo ayudarle a agendar una cita, obtener información sobre precios, o conectarlo con nuestro equipo.`;
    }

    /**
     * Process Spanish speech input
     * @param {Object} requestBody - Twilio webhook request body
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async processSpeechInput(requestBody, session) {
        const speechResult = (requestBody.SpeechResult || '').toLowerCase().trim();
        const clientId = session.client_id;
        const businessName = session.business_name || 'nuestra empresa';

        console.log(`🎤 Spanish speech from client ${clientId}: '${speechResult}'`);

        if (!clientId) {
            console.error("❌ No client context in session");
            return this.createErrorResponse("La sesión ha expirado. Por favor, llame de nuevo.");
        }

        // Process speech based on intent (Spanish keywords)
        if (this.containsKeywords(speechResult, ['cita', 'reservar', 'agendar', 'programar', 'demostración'])) {
            return await this.handleBookingRequest(speechResult, session);
        } else if (this.containsKeywords(speechResult, ['precio', 'costo', 'cuánto cuesta', 'cuanto', 'tarifa'])) {
            return await this.handlePricingRequest(session);
        } else if (this.containsKeywords(speechResult, ['ayuda', 'soporte', 'hablar con', 'persona'])) {
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
     * Handle appointment booking request in Spanish
     * @param {string} speechResult - Original speech input
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handleBookingRequest(speechResult, session) {
        const twiml = new twilio.twiml.VoiceResponse();
        const businessName = session.business_name || 'nuestra empresa';

        const bookingText = `
            ¡Excelente! Con mucho gusto le ayudaré a agendar una cita con ${businessName}.
            Permítame recopilar algunos datos.
            Puede decirme su nombre por favor
        `;

        const gather = twiml.gather({
            input: 'speech',
            timeout: 10,
            action: '/voice/lina/collect-name',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'es-MX'
        });

        const audioUrl = await this.generateLinaAudio(bookingText);
        if (audioUrl) {
            gather.play(audioUrl);
        } else {
            gather.say(bookingText, { voice: 'Polly.Lupe', language: 'es-MX' });
        }

        return twiml.toString();
    }

    /**
     * Handle pricing inquiry in Spanish
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handlePricingRequest(session) {
        const twiml = new twilio.twiml.VoiceResponse();
        const businessName = session.business_name || 'nuestra empresa';

        const pricingText = `
            Gracias por su interés en los servicios de ${businessName}.
            Con gusto le conectaré con alguien que puede hablar sobre precios y opciones.
            ¿Desea que le agende una consulta, o prefiere hablar con alguien en este momento?
        `;

        const gather = twiml.gather({
            input: 'speech',
            timeout: 10,
            action: '/voice/lina/handle-pricing-response',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'es-MX'
        });

        const audioUrl = await this.generateLinaAudio(pricingText);
        if (audioUrl) {
            gather.play(audioUrl);
        } else {
            gather.say(pricingText, { voice: 'Polly.Lupe', language: 'es-MX' });
        }

        return twiml.toString();
    }

    /**
     * Handle support request in Spanish
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handleSupportRequest(session) {
        const twiml = new twilio.twiml.VoiceResponse();
        const businessName = session.business_name || 'nuestra empresa';

        const supportText = `
            Con gusto le ayudaré a conectarse con el equipo de soporte de ${businessName}.
            Por favor, espere mientras transfiero su llamada.
        `;

        const audioUrl = await this.generateLinaAudio(supportText);
        if (audioUrl) {
            twiml.play(audioUrl);
        } else {
            twiml.say(supportText, { voice: 'Polly.Lupe', language: 'es-MX' });
        }

        // In real implementation, would transfer to client's support number
        twiml.say("La transferencia de soporte aún no está configurada. Por favor, vuelva a llamar más tarde o visite el sitio web.", {
            voice: 'Polly.Lupe',
            language: 'es-MX'
        });
        twiml.hangup();

        return twiml.toString();
    }

    /**
     * Handle unknown/unclear requests in Spanish
     * @param {string} speechResult - Original speech input
     * @param {Object} session - Express session object
     * @returns {string} TwiML response
     */
    async handleUnknownRequest(speechResult, session) {
        const twiml = new twilio.twiml.VoiceResponse();
        const businessName = session.business_name || 'nuestra empresa';

        const clarificationText = `
            Lo siento, no entendí bien.
            Puedo ayudarle a agendar una cita, obtener información sobre precios, o conectarlo con el equipo de ${businessName}.
            ¿Qué le gustaría hacer?
        `;

        const gather = twiml.gather({
            input: 'speech',
            timeout: 10,
            action: '/voice/lina/process-speech',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'es-MX'
        });

        const audioUrl = await this.generateLinaAudio(clarificationText);
        if (audioUrl) {
            gather.play(audioUrl);
        } else {
            gather.say(clarificationText, { voice: 'Polly.Lupe', language: 'es-MX' });
        }

        return twiml.toString();
    }

    /**
     * Create error response in Spanish
     * @param {string} errorMessage - Error message to play
     * @returns {string} TwiML response
     */
    createErrorResponse(errorMessage) {
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say(errorMessage, { voice: 'Polly.Lupe', language: 'es-MX' });
        twiml.hangup();
        return twiml.toString();
    }

    /**
     * Generate audio using ElevenLabs Lina/Bella Spanish voice
     * @param {string} text - Text to convert to speech
     * @returns {string|null} URL to generated audio file or null if failed
     */
    async generateLinaAudio(text) {
        if (!this.elevenlabsApiKey) {
            console.warn("ElevenLabs API key not configured");
            return null;
        }

        try {
            const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.linaVoiceId}`;
            const headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": this.elevenlabsApiKey
            };

            // Clean text for speech synthesis
            const speechText = text.replace(/\n/g, " ").trim().replace(/\$/g, " dólares");

            const ttsData = {
                text: speechText,
                model_id: "eleven_multilingual_v2", // Use multilingual model for Spanish
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
                const audioFilename = `lina_${uuidv4()}.mp3`;
                const audioPath = path.join(this.audioDir, audioFilename);

                await fs.writeFile(audioPath, response.data);

                // Return URL that Twilio can access
                const audioUrl = `${this.webhookBaseUrl}/audio/${audioFilename}`;
                console.log(`✅ Lina audio generated successfully`);
                return audioUrl;
            } else {
                console.warn(`ElevenLabs TTS failed: ${response.status}`);
                return null;
            }

        } catch (error) {
            console.error("Error generating Lina audio:", error.message);
            return null;
        }
    }
}

module.exports = LinaSpanishVoiceService;
