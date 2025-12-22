// services/anaVoiceService.js - Spanish Voice Service (Ana)
// This is a 1:1 mirror of rachelVoiceService.js but in Spanish
// IMPORTANT: Uses the SAME flow as English: Name -> Phone -> Date -> Offer Slots -> Select Slot -> Book

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class AnaVoiceService {
    constructor(webhookBaseUrl, elevenlabsApiKey) {
        this.webhookBaseUrl = webhookBaseUrl;
        this.elevenlabsApiKey = elevenlabsApiKey;

        // Ana's voice - ElevenLabs "Bella" which sounds excellent in Spanish
        this.anaVoiceId = "EXAVITQu4vr4xnSDxMaL";

        // Audio directory for generated files
        this.audioDir = '/tmp';
    }

    /**
     * Escape XML special characters for TwiML
     * CRITICAL: Prevents parse errors from special characters in user input
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
     * Build context params for Twilio callbacks (raw URL format)
     * Twilio doesn't preserve sessions between webhooks, so we pass context via URL params
     */
    buildContextParams(clientId, businessName, userId = '') {
        return `client_id=${clientId}&business_name=${encodeURIComponent(businessName || 'nuestra empresa')}&user_id=${userId || ''}`;
    }

    /**
     * Build XML-safe context params for TwiML attributes
     * CRITICAL: & must be escaped as &amp; in XML attributes
     */
    buildContextParamsXml(clientId, businessName, userId = '') {
        const params = this.buildContextParams(clientId, businessName, userId);
        return params.replace(/&/g, '&amp;');
    }

    /**
     * Generate audio using ElevenLabs Spanish voice (Ana/Bella)
     * Returns null on failure (caller should use Polly fallback)
     */
    async generateAnaAudio(text) {
        if (!this.elevenlabsApiKey) {
            console.warn("⚠️ ElevenLabs API key not configured - cannot use Ana premium voice");
            return null;
        }

        try {
            const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.anaVoiceId}`;

            // Clean text for speech synthesis
            const speechText = text
                .replace(/\n/g, " ")
                .trim()
                .replace(/\$/g, " dólares");

            const response = await axios.post(url, {
                text: speechText,
                model_id: "eleven_multilingual_v2",  // Multilingual model for Spanish
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            }, {
                headers: {
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": this.elevenlabsApiKey
                },
                timeout: 15000,
                responseType: 'arraybuffer'
            });

            if (response.status === 200) {
                const filename = `ana_${uuidv4()}.mp3`;
                const filepath = path.join(this.audioDir, filename);
                await fs.writeFile(filepath, response.data);
                const audioUrl = `${this.webhookBaseUrl}/audio/${filename}`;
                console.log(`✅ Ana audio generated: ${filename} (${response.data.byteLength} bytes)`);
                return audioUrl;
            }
            return null;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error(`❌ ElevenLabs TTS timeout after 15s`);
            } else if (error.response) {
                console.error(`❌ ElevenLabs TTS error: ${error.response.status}`);
            } else {
                console.error(`❌ Error generating Ana audio: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Format time for Spanish speech
     * Examples: 14:00 -> "2 de la tarde", 10:30 -> "10 y media de la mañana"
     */
    formatTimeForSpanishSpeech(timeStr) {
        const [hours, minutes] = timeStr.split(':');
        let hour = parseInt(hours);
        const mins = parseInt(minutes);

        // Determine period
        let period;
        if (hour < 12) {
            period = 'de la mañana';
        } else if (hour < 19) {
            period = 'de la tarde';
        } else {
            period = 'de la noche';
        }

        // Convert to 12-hour format
        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;

        // Format minutes
        if (mins === 0) {
            return `${hour} ${period}`;
        } else if (mins === 30) {
            return `${hour} y media ${period}`;
        } else if (mins === 15) {
            return `${hour} y cuarto ${period}`;
        } else {
            return `${hour} y ${mins} ${period}`;
        }
    }

    /**
     * Format date for Spanish speech
     * Examples: 2024-12-25 -> "miércoles, 25 de diciembre"
     */
    formatDateForSpanishSpeech(dateStr) {
        const moment = require('moment-timezone');
        moment.locale('es');

        const date = moment(dateStr);
        const dayOfWeek = date.format('dddd');  // lunes, martes, etc.
        const dayNum = date.format('D');        // 1, 2, 3...
        const month = date.format('MMMM');      // enero, febrero, etc.

        return `${dayOfWeek}, ${dayNum} de ${month}`;
    }

    /**
     * Parse Spanish date speech into YYYY-MM-DD format
     * Handles: mañana, hoy, lunes, martes, 20 de diciembre, etc.
     */
    parseSpanishDate(speechInput) {
        const moment = require('moment-timezone');
        moment.locale('es');

        const now = moment().tz('America/New_York');
        const lowerInput = speechInput.toLowerCase().trim();

        // Today/Tomorrow
        if (lowerInput.includes('mañana')) {
            return now.clone().add(1, 'day').format('YYYY-MM-DD');
        }
        if (lowerInput.includes('hoy')) {
            return now.format('YYYY-MM-DD');
        }
        if (lowerInput.includes('pasado mañana')) {
            return now.clone().add(2, 'days').format('YYYY-MM-DD');
        }

        // Days of week in Spanish
        const daysMap = {
            'lunes': 1,
            'martes': 2,
            'miércoles': 3,
            'miercoles': 3,
            'jueves': 4,
            'viernes': 5,
            'sábado': 6,
            'sabado': 6,
            'domingo': 0
        };

        for (const [dayName, dayNum] of Object.entries(daysMap)) {
            if (lowerInput.includes(dayName)) {
                let targetDate = now.clone().day(dayNum);
                // If the day has passed this week, move to next week
                if (targetDate.isSameOrBefore(now, 'day')) {
                    targetDate.add(7, 'days');
                }
                return targetDate.format('YYYY-MM-DD');
            }
        }

        // Month names in Spanish
        const monthsMap = {
            'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
            'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
            'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
        };

        // Try to parse "20 de diciembre" or "diciembre 20"
        const datePattern = /(\d{1,2})\s*de\s*(\w+)/i;
        const match = lowerInput.match(datePattern);

        if (match) {
            const day = parseInt(match[1]);
            const monthName = match[2].toLowerCase();

            if (monthsMap.hasOwnProperty(monthName)) {
                const month = monthsMap[monthName];
                let year = now.year();

                // If date has passed this year, use next year
                const targetDate = moment({ year, month, day });
                if (targetDate.isBefore(now, 'day')) {
                    year++;
                }

                return moment({ year, month, day }).format('YYYY-MM-DD');
            }
        }

        // Default to tomorrow if we can't parse
        console.log(`⚠️ Could not parse Spanish date "${speechInput}", defaulting to tomorrow`);
        return now.clone().add(1, 'day').format('YYYY-MM-DD');
    }

    /**
     * Parse Spanish phone number from speech
     * Converts spoken Spanish numbers to digits
     */
    parseSpanishPhone(speechInput) {
        let result = speechInput.toLowerCase().trim();

        // Spanish number words to digits
        const numberMap = {
            'cero': '0', 'uno': '1', 'una': '1', 'dos': '2', 'tres': '3',
            'cuatro': '4', 'cinco': '5', 'seis': '6', 'siete': '7',
            'ocho': '8', 'nueve': '9', 'diez': '10'
        };

        // Replace spelled-out numbers
        for (const [word, digit] of Object.entries(numberMap)) {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            result = result.replace(regex, digit);
        }

        // Remove non-digits
        result = result.replace(/\D/g, '');

        // Handle US phone numbers (add 1 prefix if 10 digits)
        if (result.length === 10) {
            result = '1' + result;
        }

        return result;
    }

    /**
     * Convert Spanish speech number selection to digit
     * Used for slot selection via speech
     */
    speechToDigit(speechResult) {
        const speech = (speechResult || '').toLowerCase().trim();

        // Direct number matches
        if (speech.includes('uno') || speech.includes('primera') || speech === '1') return '1';
        if (speech.includes('dos') || speech.includes('segunda') || speech === '2') return '2';
        if (speech.includes('tres') || speech.includes('tercera') || speech === '3') return '3';
        if (speech.includes('cuatro') || speech.includes('más') || speech.includes('otras') || speech === '4') return '4';
        if (speech.includes('cero') || speech.includes('especialista') || speech.includes('alguien') || speech === '0') return '0';
        if (speech.includes('nueve') || speech.includes('mensaje') || speech === '9') return '9';

        return null;
    }

    /**
     * Create error response TwiML
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
     * Create session expired response TwiML
     */
    createSessionExpiredResponse() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">La sesión ha expirado. Por favor, llame de nuevo.</Say>
    <Hangup/>
</Response>`;
    }
}

module.exports = AnaVoiceService;
