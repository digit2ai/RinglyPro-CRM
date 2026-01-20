/**
 * ElevenLabs WebSocket Voice Client
 *
 * A standalone JavaScript class for establishing WebSocket voice connections
 * to ElevenLabs Conversational AI agents.
 *
 * Architecture Overview:
 * =====================
 *
 * 1. TOKEN FLOW:
 *    Browser -> Your Backend -> ElevenLabs API -> Signed WebSocket URL
 *    (API key never exposed to browser)
 *
 * 2. AUDIO FLOW (WebSocket-based, NOT WebRTC):
 *    - User's mic audio -> MediaRecorder -> base64 -> WebSocket -> ElevenLabs
 *    - ElevenLabs -> WebSocket -> base64 audio chunks -> Web Audio API -> Speaker
 *
 * 3. TRANSCRIPT:
 *    - ElevenLabs sends transcript updates via WebSocket messages
 *    - Messages include role (user/agent) and text
 *
 * Usage:
 * ======
 * const client = new ElevenLabsWebRTCClient({
 *   tokenEndpoint: '/api/elevenlabs-webrtc/token',
 *   agentId: 'your-agent-id',
 *   onTranscript: (role, text, isFinal) => { ... },
 *   onStatusChange: (status) => { ... },
 *   onError: (error) => { ... }
 * });
 *
 * await client.connect();
 * // ... user talks to agent ...
 * client.disconnect();
 */

class ElevenLabsWebRTCClient {
  /**
   * @param {Object} options Configuration options
   * @param {string} options.tokenEndpoint - Backend endpoint to get signed URL
   * @param {string} options.agentId - ElevenLabs agent ID
   * @param {Object} options.dynamicVariables - Variables to pass to the agent
   * @param {Function} options.onTranscript - Callback for transcript updates
   * @param {Function} options.onStatusChange - Callback for status changes
   * @param {Function} options.onError - Callback for errors
   * @param {Function} options.onAudioLevel - Callback for audio level (0-1)
   */
  constructor(options = {}) {
    this.tokenEndpoint = options.tokenEndpoint || '/api/elevenlabs-webrtc/token';
    this.agentId = options.agentId;
    this.dynamicVariables = options.dynamicVariables || {};

    // Callbacks
    this.onTranscript = options.onTranscript || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onError = options.onError || console.error;
    this.onAudioLevel = options.onAudioLevel || (() => {});

    // Internal state
    this.status = 'disconnected';
    this.websocket = null;
    this.localStream = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.transcript = [];
    this.conversationId = null;

    // Audio processing
    this.inputAnalyser = null;
    this.scriptProcessor = null;
  }

  /**
   * Get current connection status
   * Possible values: 'disconnected', 'connecting', 'connected', 'error'
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get full transcript history
   * @returns {Array} Array of {role, text, timestamp}
   */
  getTranscript() {
    return [...this.transcript];
  }

  /**
   * Update status and notify listener
   * @private
   */
  _setStatus(status) {
    this.status = status;
    this.onStatusChange(status);
  }

  /**
   * Request microphone permission and get audio stream
   * @private
   */
  async _getMicrophoneStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        },
        video: false
      });
      return stream;
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied. Please allow microphone access.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone.');
      }
      throw error;
    }
  }

  /**
   * Get signed WebSocket URL from backend
   * @private
   */
  async _getSignedUrl() {
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: this.agentId,
        dynamicVariables: this.dynamicVariables
      })
    });

    if (!response.ok) {
      let errorMsg = 'Failed to get conversation token';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {
        // Response wasn't JSON
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    if (!data.success || !data.signed_url) {
      throw new Error('Invalid token response from server');
    }

    return data.signed_url;
  }

  /**
   * Set up audio recording and streaming
   * @private
   */
  _setupAudioCapture() {
    // Create audio context for processing
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000
    });

    // Create source from microphone stream
    const source = this.audioContext.createMediaStreamSource(this.localStream);

    // Create analyser for input level monitoring
    this.inputAnalyser = this.audioContext.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    source.connect(this.inputAnalyser);

    // Create script processor for capturing raw PCM data
    // Note: ScriptProcessorNode is deprecated but AudioWorklet requires more setup
    const bufferSize = 4096;
    this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (this.websocket?.readyState !== WebSocket.OPEN) return;

      const inputData = event.inputBuffer.getChannelData(0);

      // Convert float32 to int16 PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Convert to base64
      const base64Audio = this._arrayBufferToBase64(pcmData.buffer);

      // Send audio chunk to ElevenLabs
      this.websocket.send(JSON.stringify({
        user_audio_chunk: base64Audio
      }));

      // Update input level
      this._updateInputLevel();
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  /**
   * Convert ArrayBuffer to base64 string
   * @private
   */
  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   * @private
   */
  _base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Update input level meter
   * @private
   */
  _updateInputLevel() {
    if (!this.inputAnalyser) return;

    const dataArray = new Uint8Array(this.inputAnalyser.frequencyBinCount);
    this.inputAnalyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedLevel = average / 255;

    this.onAudioLevel(normalizedLevel);
  }

  /**
   * Play received audio chunk
   * @private
   */
  async _playAudioChunk(base64Audio) {
    try {
      // Decode base64 to ArrayBuffer
      const audioData = this._base64ToArrayBuffer(base64Audio);

      // ElevenLabs sends MP3 chunks, need to decode them
      const audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0));

      // Queue the audio
      this.audioQueue.push(audioBuffer);

      // Start playing if not already
      if (!this.isPlaying) {
        this._playNextInQueue();
      }
    } catch (error) {
      console.warn('[Audio] Error decoding audio chunk:', error);
    }
  }

  /**
   * Play next audio buffer in queue
   * @private
   */
  _playNextInQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift();

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    source.onended = () => {
      this._playNextInQueue();
    };

    source.start(0);
  }

  /**
   * Connect to ElevenLabs WebSocket
   * @private
   */
  async _connectWebSocket(signedUrl) {
    return new Promise((resolve, reject) => {
      this.websocket = new WebSocket(signedUrl);

      this.websocket.onopen = () => {
        console.log('[WebSocket] Connected');

        // Send conversation initiation data with dynamic variables
        if (Object.keys(this.dynamicVariables).length > 0) {
          console.log('[WebSocket] Sending conversation initiation data');
          this.websocket.send(JSON.stringify({
            type: 'conversation_initiation_client_data',
            conversation_initiation_client_data: {
              dynamic_variables: this.dynamicVariables
            }
          }));
        }

        // Mark as connected and resolve
        this._setStatus('connected');
        resolve();
      };

      this.websocket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          await this._handleWebSocketMessage(message);
        } catch (error) {
          console.error('[WebSocket] Error handling message:', error);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.websocket.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        this._setStatus('disconnected');
      };
    });
  }

  /**
   * Handle incoming WebSocket messages from ElevenLabs
   * @private
   */
  async _handleWebSocketMessage(message) {
    // console.log('[WebSocket] Message:', message.type || Object.keys(message)[0]);

    // Handle different message types
    if (message.type === 'conversation_initiation_metadata') {
      this.conversationId = message.conversation_id;
      console.log('[WebSocket] Conversation started:', this.conversationId);
    }
    else if (message.type === 'audio' || message.audio) {
      // Agent audio response
      const audioBase64 = message.audio?.chunk || message.audio_event?.audio_base_64 || message.audio;
      if (audioBase64 && typeof audioBase64 === 'string') {
        await this._playAudioChunk(audioBase64);
      }
    }
    else if (message.type === 'agent_response') {
      // Agent text response
      const text = message.agent_response_event?.agent_response || message.agent_response || message.text;
      if (text) {
        this._addTranscript('agent', text, true);
      }
    }
    else if (message.type === 'user_transcript') {
      // User speech transcribed
      const text = message.user_transcription_event?.user_transcript || message.user_transcript;
      const isFinal = message.user_transcription_event?.is_final !== false;
      if (text) {
        this._addTranscript('user', text, isFinal);
      }
    }
    else if (message.type === 'ping') {
      // Respond to ping with pong
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({ type: 'pong' }));
      }
    }
    else if (message.type === 'interruption') {
      // User interrupted the agent - clear audio queue
      console.log('[WebSocket] Interruption - clearing audio queue');
      this.audioQueue = [];
    }
    else if (message.type === 'error') {
      console.error('[WebSocket] Server error:', message.error || message.message);
      this.onError(new Error(message.error || message.message || 'Server error'));
    }
    else if (message.type === 'conversation_ended' || message.type === 'session_end') {
      console.log('[WebSocket] Conversation ended');
      this.disconnect();
    }
  }

  /**
   * Add transcript entry and notify listener
   * @private
   */
  _addTranscript(role, text, isFinal = false) {
    if (!text) return;

    const entry = {
      role,
      text,
      isFinal,
      timestamp: new Date().toISOString()
    };

    // If not final, update the last entry for this role
    if (!isFinal) {
      const lastIndex = this.transcript.findLastIndex(t => t.role === role && !t.isFinal);
      if (lastIndex >= 0) {
        this.transcript[lastIndex] = entry;
      } else {
        this.transcript.push(entry);
      }
    } else {
      // Remove any non-final entries for this role and add final
      this.transcript = this.transcript.filter(t => !(t.role === role && !t.isFinal));
      this.transcript.push(entry);
    }

    this.onTranscript(role, text, isFinal);
  }

  /**
   * Start the voice conversation
   * Call this when user clicks "Start Talking"
   *
   * @param {Object} dynamicVars - Optional dynamic variables to pass
   * @returns {Promise<void>}
   */
  async connect(dynamicVars = null) {
    if (this.status === 'connected' || this.status === 'connecting') {
      console.warn('[Client] Already connected or connecting');
      return;
    }

    if (dynamicVars) {
      this.dynamicVariables = { ...this.dynamicVariables, ...dynamicVars };
    }

    this._setStatus('connecting');
    this.transcript = [];

    try {
      // Step 1: Get microphone permission
      console.log('[Client] Getting microphone access...');
      this.localStream = await this._getMicrophoneStream();

      // Step 2: Get signed URL from backend
      console.log('[Client] Getting signed URL...');
      const signedUrl = await this._getSignedUrl();

      // Step 3: Connect WebSocket
      console.log('[Client] Connecting to ElevenLabs...');
      await this._connectWebSocket(signedUrl);

      // Step 4: Set up audio capture and streaming
      console.log('[Client] Setting up audio capture...');
      this._setupAudioCapture();

      console.log('[Client] Connection established!');

    } catch (error) {
      console.error('[Client] Connection failed:', error);
      this._setStatus('error');
      this.onError(error);
      this.disconnect();
      throw error;
    }
  }

  /**
   * End the voice conversation
   * Call this when user clicks "Stop" or wants to end the call
   */
  disconnect() {
    console.log('[Client] Disconnecting...');

    // Close WebSocket
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    // Stop script processor
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    // Stop local audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.inputAnalyser = null;
    }

    // Clear audio queue
    this.audioQueue = [];
    this.isPlaying = false;

    this._setStatus('disconnected');
  }

  /**
   * Send a text message to the agent (optional feature)
   * Useful for testing or accessibility
   *
   * @param {string} text - Text to send
   */
  sendText(text) {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'user_input',
        text: text
      }));
      this._addTranscript('user', text, true);
    } else {
      console.warn('[Client] Cannot send text - not connected');
    }
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ElevenLabsWebRTCClient;
}

// Also attach to window for script tag usage
if (typeof window !== 'undefined') {
  window.ElevenLabsWebRTCClient = ElevenLabsWebRTCClient;
}
