const axios = require('axios');
const FormData = require('form-data');

class STTService {
  constructor(provider = 'openai') {
    this.provider = provider;
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async transcribe(audioData, options = {}) {
    try {
      const formData = new FormData();
      formData.append('file', audioData, {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      });
      formData.append('model', 'whisper-1');

      if (options.language) {
        formData.append('language', options.language.split('-')[0]);
      }

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...formData.getHeaders()
          }
        }
      );

      return {
        text: response.data.text,
        confidence: 1.0,
        language: options.language || 'en-US',
        provider: 'openai'
      };
    } catch (error) {
      console.error('OpenAI STT Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = STTService;
