const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ElevenLabsService {
    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        this.baseUrl = 'https://api.elevenlabs.io/v1';
        this.defaultVoiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel's correct voice ID
        this.audioDir = path.join(process.cwd(), 'public', 'audio');

        // Ensure public and audio directories exist
        const publicDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        if (!fs.existsSync(this.audioDir)) {
            fs.mkdirSync(this.audioDir, { recursive: true });
        }
    }

    /**
     * Generate speech using ElevenLabs API with Rachel's voice
     * @param {string} text - Text to convert to speech
     * @param {string} voiceId - ElevenLabs voice ID (optional)
     * @returns {Promise<string>} URL to generated audio file
     */
    async generateSpeech(text, voiceId = null) {
        try {
            const voice = voiceId || this.defaultVoiceId;
            const filename = `rachel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
            const filepath = path.join(this.audioDir, filename);
            const publicUrl = `/audio/${filename}`;

            // Prepare text for speech (same as Python version)
            const speechText = text
                .replace(/RinglyPro/g, 'Ringly Pro')
                .replace(/AI/g, 'A.I.')
                .replace(/\$/g, ' dollars');

            console.log(`🎤 Generating Rachel's voice: "${speechText.substring(0, 50)}..."`);

            const response = await axios({
                method: 'POST',
                url: `${this.baseUrl}/text-to-speech/${voice}`,
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': this.apiKey
                },
                data: {
                    text: speechText,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                },
                responseType: 'stream'
            });

            // Save audio file
            const writer = fs.createWriteStream(filepath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`✅ Rachel's voice audio generated: ${filename}`);
                    resolve(publicUrl);
                });
                writer.on('error', reject);
            });

        } catch (error) {
            console.error('❌ ElevenLabs Rachel voice error:', error.response?.data || error.message);
            
            // Fallback to null (will use Twilio TTS)
            return null;
        }
    }

    /**
     * Generate speech with fallback to Twilio TTS
     * @param {object} twiml - Twilio TwiML object
     * @param {string} text - Text to speak
     * @param {object} options - Voice options
     */
    async addSpeech(twiml, text, options = {}) {
        try {
            const audioUrl = await this.generateSpeech(text);
            
            if (audioUrl) {
                // Use Rachel's premium voice
                const baseUrl = process.env.BASE_URL || 'https://ringlypro-crm.onrender.com';
                twiml.play(`${baseUrl}${audioUrl}`);
                console.log(`🎙️ Using Rachel's premium voice: ${baseUrl}${audioUrl}`);
            } else {
                // Fallback to Twilio TTS
                console.log('⚠️ Falling back to Twilio TTS');
                twiml.say({
                    voice: options.voice || 'alice',
                    rate: options.rate || 'medium'
                }, text);
            }
        } catch (error) {
            console.error('❌ Error in addSpeech:', error);
            
            // Fallback to Twilio TTS
            twiml.say({
                voice: options.voice || 'Alice',
                rate: options.rate || 'medium'
            }, text);
        }
    }
}

module.exports = new ElevenLabsService();