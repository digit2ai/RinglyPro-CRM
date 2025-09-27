const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ElevenLabsService {
    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        this.baseUrl = 'https://api.elevenlabs.io/v1';
        this.defaultVoiceId = 'pNInz6obpgDQGcFmaJgB'; // Rachel voice
        this.audioDir = path.join(__dirname, '../public/audio');
        
        // Ensure audio directory exists
        if (!fs.existsSync(this.audioDir)) {
            fs.mkdirSync(this.audioDir, { recursive: true });
        }
    }

    /**
     * Generate speech using ElevenLabs API
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

            console.log(`🎤 Generating ElevenLabs speech: "${text.substring(0, 50)}..."`);

            const response = await axios({
                method: 'POST',
                url: `${this.baseUrl}/text-to-speech/${voice}`,
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': this.apiKey
                },
                data: {
                    text: text,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.8,
                        style: 0.2,
                        use_speaker_boost: true
                    }
                },
                responseType: 'stream'
            });

            // Save audio file
            const writer = fs.createWriteStream(filepath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`✅ ElevenLabs audio generated: ${filename}`);
                    resolve(publicUrl);
                });
                writer.on('error', reject);
            });

        } catch (error) {
            console.error('❌ ElevenLabs API error:', error.response?.data || error.message);
            
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
                // Use ElevenLabs premium voice
                const baseUrl = process.env.BASE_URL || 'https://your-domain.com';
                twiml.play(`${baseUrl}${audioUrl}`);
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
                voice: options.voice || 'alice',
                rate: options.rate || 'medium'
            }, text);
        }
    }
}

module.exports = new ElevenLabsService();