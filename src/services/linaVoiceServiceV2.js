// services/linaVoiceServiceV2.js - Spanish Voice Service V2 (rebuilt from scratch based on Rachel)
// This is a clean rewrite mirroring the English Rachel service exactly

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class LinaVoiceServiceV2 {
    constructor(webhookBaseUrl, elevenlabsApiKey) {
        this.webhookBaseUrl = webhookBaseUrl;
        this.elevenlabsApiKey = elevenlabsApiKey;

        // Lina's voice - using ElevenLabs "Bella" which sounds good in Spanish
        this.linaVoiceId = "EXAVITQu4vr4xnSDxMaL";

        // Audio directory
        this.audioDir = '/tmp';
    }

    /**
     * Escape XML special characters
     */
    escapeXml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
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
     * Build context query params for Twilio callbacks
     * Returns raw URL params (use buildContextParamsXml for TwiML attributes)
     */
    buildContextParams(clientId, businessName, userId = '') {
        return `client_id=${clientId}&business_name=${encodeURIComponent(businessName || 'nuestra empresa')}&user_id=${userId || ''}`;
    }

    /**
     * Build XML-safe context query params for TwiML attributes
     * CRITICAL: & must be escaped as &amp; in XML attributes
     */
    buildContextParamsXml(clientId, businessName, userId = '') {
        const params = this.buildContextParams(clientId, businessName, userId);
        return params.replace(/&/g, '&amp;');
    }

    /**
     * Generate audio using ElevenLabs Spanish voice
     * Returns null on failure (caller should use Polly fallback)
     */
    async generateLinaAudio(text) {
        if (!this.elevenlabsApiKey) {
            console.warn("ElevenLabs API key not configured");
            return null;
        }

        try {
            const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.linaVoiceId}`;
            const speechText = text.replace(/\n/g, " ").trim().replace(/\$/g, " dolares");

            const response = await axios.post(url, {
                text: speechText,
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            }, {
                headers: {
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": this.elevenlabsApiKey
                },
                timeout: 12000,
                responseType: 'arraybuffer'
            });

            if (response.status === 200) {
                const filename = `lina_${uuidv4()}.mp3`;
                const filepath = path.join(this.audioDir, filename);
                await fs.writeFile(filepath, response.data);
                const audioUrl = `${this.webhookBaseUrl}/audio/${filename}`;
                console.log(`Lina audio generated: ${filename}`);
                return audioUrl;
            }
            return null;
        } catch (error) {
            console.error(`ElevenLabs error: ${error.message}`);
            return null;
        }
    }

    /**
     * Create Spanish greeting TwiML
     */
    async createGreeting(clientId, businessName, userId) {
        const contextParams = this.buildContextParamsXml(clientId, businessName, userId);
        const timeGreeting = this.getTimeGreeting();
        const escapedBusiness = this.escapeXml(businessName || 'nuestra empresa');

        const greetingText = `${timeGreeting}, gracias por llamar a ${escapedBusiness}. Mi nombre es Lina, su asistente virtual. Puedo ayudarle a agendar una cita, o si prefiere, puede dejarme un mensaje. ¿En qué puedo ayudarle hoy?`;

        // Try premium voice, fall back to Polly
        const audioUrl = await this.generateLinaAudio(greetingText);

        if (audioUrl) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="8" speechTimeout="3" action="/voice/lina-v2/process-speech?${contextParams}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina-v2/greeting?${contextParams}</Redirect>
</Response>`;
        }

        // Polly fallback
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="8" speechTimeout="3" action="/voice/lina-v2/process-speech?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${greetingText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina-v2/greeting?${contextParams}</Redirect>
</Response>`;
    }

    /**
     * Process speech and determine intent
     */
    async processSpeech(speechResult, clientId, businessName, userId) {
        const speech = (speechResult || '').toLowerCase().trim();
        // Note: contextParams not used directly in this method, but kept for logging
        console.log(`Lina speech: "${speech}"`);

        // Booking keywords
        if (this.hasKeywords(speech, ['cita', 'reservar', 'agendar', 'programar', 'turno', 'hora', 'appointment'])) {
            return this.askForName(clientId, businessName, userId);
        }

        // Voicemail keywords
        if (this.hasKeywords(speech, ['mensaje', 'dejar', 'grabar', 'buzon', 'recado', 'voicemail'])) {
            return this.startVoicemail(clientId, businessName, userId);
        }

        // Pricing keywords
        if (this.hasKeywords(speech, ['precio', 'costo', 'cuanto', 'tarifa', 'price'])) {
            return this.handlePricing(clientId, businessName, userId);
        }

        // Unknown - ask again
        return this.handleUnknown(clientId, businessName, userId);
    }

    hasKeywords(speech, keywords) {
        return keywords.some(k => speech.includes(k));
    }

    /**
     * Ask for customer name
     */
    async askForName(clientId, businessName, userId) {
        const contextParams = this.buildContextParamsXml(clientId, businessName, userId);
        const escapedBusiness = this.escapeXml(businessName || 'nuestra empresa');

        const text = `¡Excelente! Con mucho gusto le ayudaré a agendar una cita con ${escapedBusiness}. ¿Puede decirme su nombre por favor?`;

        const audioUrl = await this.generateLinaAudio(text);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${text}</Say>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="3" action="/voice/lina-v2/collect-name?${contextParams}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina-v2/greeting?${contextParams}</Redirect>
</Response>`;
    }

    /**
     * Ask for phone number after collected name
     */
    async askForPhone(name, clientId, businessName, userId) {
        const contextParams = this.buildContextParamsXml(clientId, businessName, userId);
        const escapedName = this.escapeXml(name);

        // Include name in context for next step (already XML-escaped via contextParams)
        const contextWithName = `${contextParams}&amp;prospect_name=${encodeURIComponent(name)}`;

        const text = `Gracias ${escapedName}. Ahora, ¿puede decirme su número de teléfono de 10 dígitos, o marcarlo usando el teclado?`;

        const audioUrl = await this.generateLinaAudio(text);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${text}</Say>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="12" speechTimeout="5" numDigits="10" action="/voice/lina-v2/collect-phone?${contextWithName}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta.</Say>
    <Redirect>/voice/lina-v2/collect-name?${contextParams}</Redirect>
</Response>`;
    }

    /**
     * Ask for date/time after collecting phone
     */
    async askForDateTime(name, phone, clientId, businessName, userId) {
        const contextParams = this.buildContextParamsXml(clientId, businessName, userId);
        const escapedName = this.escapeXml(name);

        // Include name and phone in context for next step (use &amp; for XML)
        const contextWithData = `${contextParams}&amp;prospect_name=${encodeURIComponent(name)}&amp;prospect_phone=${encodeURIComponent(phone)}`;

        const text = `Perfecto ${escapedName}. Ahora dígame qué día y hora prefiere para su cita. Por ejemplo, puede decir mañana a las 10 de la mañana, o el viernes a las 2 de la tarde.`;

        const audioUrl = await this.generateLinaAudio(text);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${text}</Say>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="5" action="/voice/lina-v2/collect-datetime?${contextWithData}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta.</Say>
    <Redirect>/voice/lina-v2/collect-phone?${contextParams}&amp;prospect_name=${encodeURIComponent(name)}</Redirect>
</Response>`;
    }

    /**
     * Confirm booking details before finalizing
     */
    async confirmBooking(name, phone, datetime, clientId, businessName, userId) {
        const contextParams = this.buildContextParamsXml(clientId, businessName, userId);
        const escapedName = this.escapeXml(name);
        const escapedDateTime = this.escapeXml(datetime);

        // Include all data in context for booking (use &amp; for XML)
        const contextWithAll = `${contextParams}&amp;prospect_name=${encodeURIComponent(name)}&amp;prospect_phone=${encodeURIComponent(phone)}&amp;datetime=${encodeURIComponent(datetime)}`;

        const text = `Perfecto ${escapedName}. Déjeme confirmar: usted desea una cita para ${escapedDateTime}. Por favor espere un momento mientras verifico la disponibilidad.`;

        const audioUrl = await this.generateLinaAudio(text);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${text}</Say>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    ${playOrSay}
    <Redirect>/voice/lina-v2/book-appointment?${contextWithAll}</Redirect>
</Response>`;
    }

    /**
     * Start voicemail recording
     */
    async startVoicemail(clientId, businessName, userId) {
        const contextParams = this.buildContextParamsXml(clientId, businessName, userId);
        const escapedBusiness = this.escapeXml(businessName || 'nuestra empresa');

        const text = `Por supuesto, con mucho gusto tomaré su mensaje para ${escapedBusiness}. Después del tono, por favor comparta su mensaje. Puede hablar hasta por 3 minutos. Cuando termine, presione la tecla numeral o cuelgue.`;

        const audioUrl = await this.generateLinaAudio(text);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${text}</Say>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    ${playOrSay}
    <Record maxLength="180" timeout="5" transcribe="false" action="/voice/lina-v2/voicemail-complete?${contextParams}" method="POST" playBeep="true" finishOnKey="#*"/>
</Response>`;
    }

    /**
     * Handle pricing inquiry
     */
    async handlePricing(clientId, businessName, userId) {
        const contextParams = this.buildContextParamsXml(clientId, businessName, userId);
        const escapedBusiness = this.escapeXml(businessName || 'nuestra empresa');

        const text = `Gracias por su interés en los servicios de ${escapedBusiness}. Con gusto le conectaré con alguien que puede hablar sobre precios y opciones. ¿Desea que le agende una consulta, o prefiere dejar un mensaje?`;

        const audioUrl = await this.generateLinaAudio(text);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${text}</Say>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="3" action="/voice/lina-v2/process-speech?${contextParams}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta.</Say>
    <Redirect>/voice/lina-v2/greeting?${contextParams}</Redirect>
</Response>`;
    }

    /**
     * Handle unknown/unclear requests
     */
    async handleUnknown(clientId, businessName, userId) {
        const contextParams = this.buildContextParamsXml(clientId, businessName, userId);

        const text = `Lo siento, no entendí bien. Puedo ayudarle a agendar una cita o tomar un mensaje. ¿Qué le gustaría hacer?`;

        const audioUrl = await this.generateLinaAudio(text);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${text}</Say>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="3" action="/voice/lina-v2/process-speech?${contextParams}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Gracias por llamar.</Say>
    <Hangup/>
</Response>`;
    }

    /**
     * Create error response
     */
    createErrorResponse(message) {
        const escapedMessage = this.escapeXml(message);
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">${escapedMessage}</Say>
    <Hangup/>
</Response>`;
    }

    /**
     * Create session expired response
     */
    createSessionExpiredResponse() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">La sesión ha expirado. Por favor, llame de nuevo.</Say>
    <Hangup/>
</Response>`;
    }
}

module.exports = LinaVoiceServiceV2;
