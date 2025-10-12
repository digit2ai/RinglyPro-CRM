const axios = require('axios');

class TTSService {
  constructor(provider = 'elevenlabs') {
    this.provider = provider;
    this.apiKey = process.env.ELEVENLABS_API_KEY || process.env.OPENAI_API_KEY;
  }

  async synthesize(text, options = {}) {
    if (this.provider === 'elevenlabs') {
      return await this.synthesizeElevenLabs(text, options);
    }
    throw new Error(`Unsupported TTS provider: ${this.provider}`);
  }

  async synthesizeElevenLabs(text, options) {
    const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      return {
        audio: Buffer.from(response.data),
        format: 'mp3',
        provider: 'elevenlabs'
      };
    } catch (error) {
      console.error('ElevenLabs TTS Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = TTSService;
