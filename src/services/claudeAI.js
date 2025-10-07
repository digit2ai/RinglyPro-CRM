// services/claudeAI.js - Claude AI Service for voicemail summarization
const axios = require('axios');

class ClaudeAIService {
    constructor() {
        this.apiKey = process.env.ANTHROPIC_API_KEY;
        this.apiUrl = 'https://api.anthropic.com/v1/messages';
        this.model = 'claude-3-5-sonnet-20241022'; // Latest model
    }

    /**
     * Summarize a voicemail transcription
     * @param {string} transcription - The voicemail transcription text
     * @param {string} callerPhone - Caller's phone number
     * @param {string} language - Language code ('en' or 'es')
     * @returns {Promise<string>} - Summarized message
     */
    async summarizeVoicemail(transcription, callerPhone, language = 'en') {
        if (!this.apiKey) {
            console.warn('⚠️ ANTHROPIC_API_KEY not configured - returning raw transcription');
            return language === 'es'
                ? `Mensaje de voz de ${callerPhone}: ${transcription}`
                : `Voicemail from ${callerPhone}: ${transcription}`;
        }

        try {
            const prompt = language === 'es'
                ? this.getSpanishSummarizationPrompt(transcription, callerPhone)
                : this.getEnglishSummarizationPrompt(transcription, callerPhone);

            const response = await axios.post(
                this.apiUrl,
                {
                    model: this.model,
                    max_tokens: 300,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                },
                {
                    headers: {
                        'x-api-key': this.apiKey,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.content && response.data.content[0]) {
                const summary = response.data.content[0].text.trim();
                console.log(`✅ Claude AI summarized voicemail (${language}): ${summary.substring(0, 100)}...`);
                return summary;
            }

            throw new Error('Invalid response from Claude API');

        } catch (error) {
            console.error('❌ Error calling Claude API:', error.message);

            // Fallback to basic summary
            return language === 'es'
                ? `Mensaje de voz de ${callerPhone}: ${transcription}`
                : `Voicemail from ${callerPhone}: ${transcription}`;
        }
    }

    /**
     * Get English summarization prompt
     * @param {string} transcription - The voicemail transcription
     * @param {string} callerPhone - Caller's phone number
     * @returns {string} - Prompt for Claude
     */
    getEnglishSummarizationPrompt(transcription, callerPhone) {
        return `You are helping summarize a voicemail message for a CRM system.

Voicemail from: ${callerPhone}
Transcription: "${transcription}"

Please provide a clear, concise summary (2-3 sentences max) that captures:
1. Who called (use the phone number)
2. The main purpose/request
3. Any action items or callbacks needed

Format: "Voicemail from ${callerPhone}: [your summary here]"

Keep it professional and actionable for the business owner.`;
    }

    /**
     * Get Spanish summarization prompt
     * @param {string} transcription - The voicemail transcription
     * @param {string} callerPhone - Caller's phone number
     * @returns {string} - Prompt for Claude
     */
    getSpanishSummarizationPrompt(transcription, callerPhone) {
        return `Estás ayudando a resumir un mensaje de voz para un sistema CRM.

Mensaje de voz de: ${callerPhone}
Transcripción: "${transcription}"

Por favor proporciona un resumen claro y conciso (máximo 2-3 oraciones) que capture:
1. Quién llamó (usa el número de teléfono)
2. El propósito/solicitud principal
3. Cualquier acción necesaria o llamada de regreso

Formato: "Mensaje de voz de ${callerPhone}: [tu resumen aquí]"

Mantenlo profesional y accionable para el dueño del negocio.`;
    }
}

module.exports = ClaudeAIService;
