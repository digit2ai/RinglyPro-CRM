const EventEmitter = require('events');

class VoiceHandler extends EventEmitter {
  constructor(ttsService, sttService) {
    super();
    this.ttsService = ttsService;
    this.sttService = sttService;
    this.isListening = false;
    this.currentSession = null;
  }

  async startSession(sessionId, config = {}) {
    this.currentSession = {
      id: sessionId,
      startTime: new Date(),
      transcript: [],
      config: {
        language: config.language || 'en-US',
        voiceId: config.voiceId || 'default',
        ...config
      }
    };

    this.isListening = true;
    this.emit('session-started', this.currentSession);
    return this.currentSession;
  }

  async processAudio(audioData) {
    if (!this.isListening) throw new Error('No active voice session');

    const transcription = await this.sttService.transcribe(audioData, {
      language: this.currentSession.config.language
    });

    this.currentSession.transcript.push({
      timestamp: new Date(),
      text: transcription.text,
      confidence: transcription.confidence
    });

    this.emit('transcription', transcription);
    return transcription;
  }

  async speak(text, options = {}) {
    if (!this.currentSession) throw new Error('No active voice session');

    const audioData = await this.ttsService.synthesize(text, {
      voiceId: options.voiceId || this.currentSession.config.voiceId,
      language: this.currentSession.config.language,
      ...options
    });

    this.emit('speech-synthesized', { text, audioData });
    return audioData;
  }

  endSession() {
    if (this.currentSession) {
      this.currentSession.endTime = new Date();
      this.emit('session-ended', this.currentSession);

      const summary = {
        ...this.currentSession,
        duration: this.currentSession.endTime - this.currentSession.startTime
      };

      this.currentSession = null;
      this.isListening = false;
      return summary;
    }
  }

  getStatus() {
    return {
      isListening: this.isListening,
      currentSession: this.currentSession
    };
  }
}

module.exports = VoiceHandler;
