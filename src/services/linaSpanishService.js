// services/linaSpanishService.js - Spanish Voice Service (mirrors Rachel English service)
const twilio = require('twilio');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

/**
 * LinaSpanishService - Spanish voice AI service mirroring English Rachel service
 * Uses ElevenLabs premium Spanish voice with Polly.Lupe as fallback
 */
class LinaSpanishService {
    constructor(webhookBaseUrl, elevenlabsApiKey) {
        this.webhookBaseUrl = webhookBaseUrl;
        this.elevenlabsApiKey = elevenlabsApiKey;

        // Ana's voice configuration - ElevenLabs "Bella" (good Spanish voice)
        this.anaVoiceId = "EXAVITQu4vr4xnSDxMaL";

        // Audio directory for generated files
        this.audioDir = '/tmp';
    }

    /**
     * Build context params for Twilio callbacks
     * Critical: Twilio doesn't preserve sessions between webhooks
     */
    buildContextParams(clientId, businessName, userId = '') {
        return `client_id=${clientId}&business_name=${encodeURIComponent(businessName || 'nuestra empresa')}&user_id=${userId || ''}`;
    }

    /**
     * Get time-appropriate Spanish greeting
     */
    getTimeGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'Buenos días';
        if (hour < 19) return 'Buenas tardes';
        return 'Buenas noches';
    }

    /**
     * Escape XML special characters
     */
    escapeXml(text) {
        return (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Create initial Spanish greeting TwiML
     * @param {number} clientId - Client ID
     * @param {string} businessName - Business name
     * @param {string} userId - User ID for token tracking
     * @returns {string} TwiML response
     */
    async createSpanishGreeting(clientId, businessName, userId) {
        const contextParams = this.buildContextParams(clientId, businessName, userId);
        const timeGreeting = this.getTimeGreeting();
        const escapedBusinessName = this.escapeXml(businessName || 'nuestra empresa');

        const greetingText = `${timeGreeting}, gracias por llamar a ${escapedBusinessName}. Mi nombre es Ana, su asistente virtual. Puedo ayudarle a agendar una cita, o si prefiere, puede dejarme un mensaje. ¿En qué puedo ayudarle hoy?`;

        // Try premium ElevenLabs voice
        const audioUrl = await this.generateLinaAudio(greetingText);

        if (audioUrl) {
            console.log(`✅ Using Ana premium voice for ${businessName}`);
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="8" speechTimeout="3" action="/voice/lina-new/process-speech?${contextParams}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina-new/greeting?${contextParams}</Redirect>
</Response>`;
        }

        // Fallback to Polly.Lupe
        console.log(`⚠️ Using Polly.Lupe fallback for ${businessName}`);
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="8" speechTimeout="3" action="/voice/lina-new/process-speech?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${greetingText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina-new/greeting?${contextParams}</Redirect>
</Response>`;
    }

    /**
     * Process Spanish speech input
     * @param {string} speechResult - What the caller said
     * @param {number} clientId - Client ID
     * @param {string} businessName - Business name
     * @param {string} userId - User ID
     * @returns {string} TwiML response
     */
    async processSpeechInput(speechResult, clientId, businessName, userId) {
        const speech = (speechResult || '').toLowerCase().trim();
        const contextParams = this.buildContextParams(clientId, businessName, userId);

        console.log(`🎤 Spanish speech from client ${clientId}: '${speech}'`);

        // Detect intent based on Spanish keywords
        if (this.containsKeywords(speech, ['cita', 'reservar', 'agendar', 'programar', 'turno', 'hora'])) {
            return await this.handleBookingRequest(clientId, businessName, userId);
        } else if (this.containsKeywords(speech, ['mensaje', 'dejar mensaje', 'grabar', 'buzón', 'recado'])) {
            return await this.handleVoicemailRequest(clientId, businessName, userId);
        } else if (this.containsKeywords(speech, ['precio', 'costo', 'cuánto', 'cuanto', 'tarifa'])) {
            return await this.handlePricingRequest(clientId, businessName, userId);
        } else if (this.containsKeywords(speech, ['ayuda', 'soporte', 'hablar con', 'persona', 'humano'])) {
            return await this.handleSupportRequest(clientId, businessName, userId);
        } else {
            return await this.handleUnknownRequest(clientId, businessName, userId);
        }
    }

    /**
     * Check if speech contains any of the specified keywords
     */
    containsKeywords(speech, keywords) {
        return keywords.some(keyword => speech.includes(keyword));
    }

    /**
     * Handle booking request - ask for name
     */
    async handleBookingRequest(clientId, businessName, userId) {
        const contextParams = this.buildContextParams(clientId, businessName, userId);
        const escapedBusiness = this.escapeXml(businessName || 'nuestra empresa');

        const bookingText = `¡Excelente! Con mucho gusto le ayudaré a agendar una cita con ${escapedBusiness}. Permítame recopilar algunos datos. ¿Puede decirme su nombre por favor?`;

        const audioUrl = await this.generateLinaAudio(bookingText);

        if (audioUrl) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="3" action="/voice/lina-new/collect-name?${contextParams}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina-new/greeting?${contextParams}</Redirect>
</Response>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="3" action="/voice/lina-new/collect-name?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${bookingText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina-new/greeting?${contextParams}</Redirect>
</Response>`;
    }

    /**
     * Ask for phone number
     */
    async askForPhone(name, clientId, businessName, userId) {
        const contextParams = this.buildContextParams(clientId, businessName, userId);
        const escapedName = this.escapeXml(name);

        // Store name in context params for next step
        const contextWithName = `${contextParams}&prospect_name=${encodeURIComponent(name)}`;

        const phoneText = `Gracias ${escapedName}. Ahora, ¿puede decirme su número de teléfono de 10 dígitos, o marcarlo usando el teclado?`;

        const audioUrl = await this.generateLinaAudio(phoneText);

        if (audioUrl) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="12" speechTimeout="5" numDigits="10" action="/voice/lina-new/collect-phone?${contextWithName}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intente de nuevo.</Say>
    <Redirect>/voice/lina-new/collect-name?${contextParams}</Redirect>
</Response>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="12" speechTimeout="5" numDigits="10" action="/voice/lina-new/collect-phone?${contextWithName}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${phoneText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intente de nuevo.</Say>
    <Redirect>/voice/lina-new/collect-name?${contextParams}</Redirect>
</Response>`;
    }

    /**
     * Ask for date/time preference
     */
    async askForDateTime(name, phone, clientId, businessName, userId) {
        const contextParams = this.buildContextParams(clientId, businessName, userId);
        const escapedName = this.escapeXml(name);

        // Store name and phone in context params
        const contextWithData = `${contextParams}&prospect_name=${encodeURIComponent(name)}&prospect_phone=${encodeURIComponent(phone)}`;

        const dateTimeText = `Perfecto ${escapedName}. ¿Qué día y a qué hora desea su cita?`;

        const audioUrl = await this.generateLinaAudio(dateTimeText);

        if (audioUrl) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="5" action="/voice/lina-new/collect-datetime?${contextWithData}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intente de nuevo.</Say>
    <Redirect>/voice/lina-new/collect-phone?${contextParams}&amp;prospect_name=${encodeURIComponent(name)}</Redirect>
</Response>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="5" action="/voice/lina-new/collect-datetime?${contextWithData}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${dateTimeText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intente de nuevo.</Say>
    <Redirect>/voice/lina-new/collect-phone?${contextParams}&amp;prospect_name=${encodeURIComponent(name)}</Redirect>
</Response>`;
    }

    /**
     * Confirm appointment booking
     */
    async confirmBooking(name, phone, dateTime, clientId, businessName, userId) {
        const contextParams = this.buildContextParams(clientId, businessName, userId);
        const escapedName = this.escapeXml(name);
        const escapedDateTime = this.escapeXml(dateTime);

        // Store all data in context
        const contextWithAll = `${contextParams}&prospect_name=${encodeURIComponent(name)}&prospect_phone=${encodeURIComponent(phone)}&datetime=${encodeURIComponent(dateTime)}`;

        const confirmText = `Perfecto ${escapedName}. Déjeme confirmar: usted desea una cita para ${escapedDateTime}. Por favor espere un momento mientras verifico la disponibilidad.`;

        const audioUrl = await this.generateLinaAudio(confirmText);

        if (audioUrl) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>${audioUrl}</Play>
    <Redirect>/voice/lina-new/book-appointment?${contextWithAll}</Redirect>
</Response>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">${confirmText}</Say>
    <Redirect>/voice/lina-new/book-appointment?${contextWithAll}</Redirect>
</Response>`;
    }

    /**
     * Handle voicemail request
     */
    async handleVoicemailRequest(clientId, businessName, userId) {
        const contextParams = this.buildContextParams(clientId, businessName, userId);
        const escapedBusiness = this.escapeXml(businessName || 'nuestra empresa');

        const voicemailText = `Por supuesto, con mucho gusto tomaré su mensaje para ${escapedBusiness}. Después del tono, por favor comparta su mensaje. Puede hablar hasta por 3 minutos. Cuando termine, presione la tecla numeral o cuelgue.`;

        const audioUrl = await this.generateLinaAudio(voicemailText);

        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${voicemailText}</Say>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    ${playOrSay}
    <Record maxLength="180" timeout="5" transcribe="false" recordingStatusCallback="/voice/lina-new/voicemail-complete?${contextParams}" recordingStatusCallbackMethod="POST" action="/voice/lina-new/voicemail-complete?${contextParams}" method="POST" playBeep="true" finishOnKey="#*"/>
</Response>`;
    }

    /**
     * Handle pricing inquiry
     */
    async handlePricingRequest(clientId, businessName, userId) {
        const contextParams = this.buildContextParams(clientId, businessName, userId);
        const escapedBusiness = this.escapeXml(businessName || 'nuestra empresa');

        const pricingText = `Gracias por su interés en los servicios de ${escapedBusiness}. Con gusto le conectaré con alguien que puede hablar sobre precios y opciones. ¿Desea que le agende una consulta, o prefiere dejar un mensaje?`;

        const audioUrl = await this.generateLinaAudio(pricingText);

        if (audioUrl) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="3" action="/voice/lina-new/process-speech?${contextParams}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta.</Say>
    <Redirect>/voice/lina-new/greeting?${contextParams}</Redirect>
</Response>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="3" action="/voice/lina-new/process-speech?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${pricingText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta.</Say>
    <Redirect>/voice/lina-new/greeting?${contextParams}</Redirect>
</Response>`;
    }

    /**
     * Handle support request
     */
    async handleSupportRequest(clientId, businessName, userId) {
        const escapedBusiness = this.escapeXml(businessName || 'nuestra empresa');

        const supportText = `Con gusto le ayudaré a conectarse con el equipo de soporte de ${escapedBusiness}. Por favor, deje un mensaje y le devolveremos la llamada lo antes posible.`;

        return await this.handleVoicemailRequest(clientId, businessName, userId);
    }

    /**
     * Handle unknown request - ask for clarification
     */
    async handleUnknownRequest(clientId, businessName, userId) {
        const contextParams = this.buildContextParams(clientId, businessName, userId);

        const clarificationText = `Lo siento, no entendí bien. Puedo ayudarle a agendar una cita o tomar un mensaje. ¿Qué le gustaría hacer?`;

        const audioUrl = await this.generateLinaAudio(clarificationText);

        if (audioUrl) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="3" action="/voice/lina-new/process-speech?${contextParams}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Gracias por llamar.</Say>
    <Hangup/>
</Response>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="3" action="/voice/lina-new/process-speech?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${clarificationText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Gracias por llamar.</Say>
    <Hangup/>
</Response>`;
    }

    /**
     * Create session expired error response
     */
    createSessionExpiredResponse() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">La sesión ha expirado. Por favor, llame de nuevo.</Say>
    <Hangup/>
</Response>`;
    }

    /**
     * Create generic error response
     */
    createErrorResponse(message) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">${this.escapeXml(message)}</Say>
    <Hangup/>
</Response>`;
    }

    /**
     * Generate audio using ElevenLabs Lina/Bella Spanish voice
     * @param {string} text - Text to convert to speech
     * @returns {string|null} URL to generated audio file or null if failed
     */
    async generateLinaAudio(text) {
        if (!this.elevenlabsApiKey) {
            console.warn("⚠️ ElevenLabs API key not configured - using Polly.Lupe fallback");
            return null;
        }

        try {
            const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.anaVoiceId}`;
            const headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": this.elevenlabsApiKey
            };

            // Clean text for speech synthesis
            const speechText = text.replace(/\n/g, " ").trim().replace(/\$/g, " dólares");

            const ttsData = {
                text: speechText,
                model_id: "eleven_multilingual_v2",  // Multilingual model for Spanish
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            };

            console.log(`🎙️ Requesting ElevenLabs Spanish TTS for ${speechText.length} characters...`);
            const response = await axios.post(url, ttsData, {
                headers,
                timeout: 15000,
                responseType: 'arraybuffer'
            });

            if (response.status === 200) {
                const audioFilename = `ana_${uuidv4()}.mp3`;
                const audioPath = path.join(this.audioDir, audioFilename);

                await fs.writeFile(audioPath, response.data);

                const audioUrl = `${this.webhookBaseUrl}/audio/${audioFilename}`;
                console.log(`✅ Ana audio generated: ${audioFilename} (${response.data.byteLength} bytes)`);
                return audioUrl;
            } else {
                console.warn(`⚠️ ElevenLabs TTS failed with status ${response.status}`);
                return null;
            }

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error(`❌ ElevenLabs Spanish TTS timeout after 15s`);
            } else if (error.response) {
                console.error(`❌ ElevenLabs Spanish TTS error: ${error.response.status}`);
            } else {
                console.error(`❌ Error generating Ana audio: ${error.message}`);
            }
            return null;
        }
    }
}

module.exports = LinaSpanishService;
