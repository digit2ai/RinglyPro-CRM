/**
 * ElevenLabs WebRTC Client
 *
 * A standalone JavaScript class for establishing WebRTC voice connections
 * to ElevenLabs Conversational AI agents WITHOUT using the embed widget.
 *
 * Architecture Overview:
 * =====================
 *
 * 1. TOKEN FLOW:
 *    Browser -> Your Backend -> ElevenLabs API -> Signed WebSocket URL
 *    (API key never exposed to browser)
 *
 * 2. WEBRTC SETUP:
 *    - Create RTCPeerConnection
 *    - Get user microphone via getUserMedia
 *    - Add audio track to peer connection
 *    - Connect to ElevenLabs via WebSocket for signaling
 *    - Exchange SDP offer/answer
 *    - ICE candidates are exchanged automatically
 *
 * 3. AUDIO HANDLING:
 *    - User's mic audio -> WebRTC -> ElevenLabs
 *    - Agent's voice -> WebRTC -> Browser audio element
 *
 * 4. TRANSCRIPT:
 *    - ElevenLabs sends transcript updates via WebSocket data channel
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
    this.peerConnection = null;
    this.websocket = null;
    this.localStream = null;
    this.remoteAudio = null;
    this.audioContext = null;
    this.analyser = null;
    this.transcript = [];
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
        // Dynamic variables are now sent via WebSocket after connection
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
   * Set up WebRTC peer connection
   * @private
   */
  _setupPeerConnection() {
    // Create peer connection with STUN servers for NAT traversal
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Handle incoming audio track (agent's voice)
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);

      if (event.track.kind === 'audio') {
        // Create audio element to play agent's voice
        this.remoteAudio = new Audio();
        this.remoteAudio.srcObject = event.streams[0];
        this.remoteAudio.autoplay = true;

        // Set up audio analysis for agent's voice level
        this._setupAudioAnalysis(event.streams[0]);
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', this.peerConnection.iceConnectionState);

      switch (this.peerConnection.iceConnectionState) {
        case 'connected':
        case 'completed':
          this._setStatus('connected');
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          this._setStatus('disconnected');
          break;
      }
    };

    // Handle ICE candidates - send to ElevenLabs via WebSocket
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate
        }));
      }
    };
  }

  /**
   * Set up audio analysis for volume levels
   * @private
   */
  _setupAudioAnalysis(stream) {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      // Start monitoring audio levels
      this._monitorAudioLevel();
    } catch (error) {
      console.warn('[WebRTC] Could not set up audio analysis:', error);
    }
  }

  /**
   * Monitor audio levels and call callback
   * @private
   */
  _monitorAudioLevel() {
    if (!this.analyser || this.status === 'disconnected') return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate average volume (0-1)
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedLevel = average / 255;

    this.onAudioLevel(normalizedLevel);

    // Continue monitoring
    if (this.status === 'connected') {
      requestAnimationFrame(() => this._monitorAudioLevel());
    }
  }

  /**
   * Connect to ElevenLabs WebSocket and establish WebRTC connection
   * @private
   */
  async _connectWebSocket(signedUrl) {
    return new Promise((resolve, reject) => {
      this.websocket = new WebSocket(signedUrl);

      this.websocket.onopen = () => {
        console.log('[WebRTC] WebSocket connected');

        // Send conversation initiation data with dynamic variables
        if (Object.keys(this.dynamicVariables).length > 0) {
          console.log('[WebRTC] Sending conversation initiation data:', this.dynamicVariables);
          this.websocket.send(JSON.stringify({
            type: 'conversation_initiation_client_data',
            dynamic_variables: this.dynamicVariables
          }));
        }
      };

      this.websocket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          await this._handleWebSocketMessage(message, resolve);
        } catch (error) {
          console.error('[WebRTC] Error handling message:', error);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('[WebRTC] WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.websocket.onclose = (event) => {
        console.log('[WebRTC] WebSocket closed:', event.code, event.reason);
        this._setStatus('disconnected');
      };
    });
  }

  /**
   * Handle incoming WebSocket messages from ElevenLabs
   * @private
   */
  async _handleWebSocketMessage(message, onConnected) {
    console.log('[WebRTC] Received message type:', message.type);

    switch (message.type) {
      case 'conversation_initiation_metadata':
        // Initial metadata about the conversation
        console.log('[WebRTC] Conversation initiated:', message.conversation_id);
        break;

      case 'audio_output_format':
        // Audio format information
        console.log('[WebRTC] Audio format:', message.sample_rate, 'Hz');
        break;

      case 'pong':
        // Keepalive response
        break;

      case 'sdp':
      case 'offer':
        // SDP offer from ElevenLabs - create answer
        if (message.sdp || message.offer) {
          const sdp = message.sdp || message.offer;
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: sdp })
          );

          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);

          this.websocket.send(JSON.stringify({
            type: 'sdp',
            sdp: answer.sdp
          }));

          console.log('[WebRTC] SDP answer sent');
          onConnected?.();
        }
        break;

      case 'ice-candidate':
        // ICE candidate from ElevenLabs
        if (message.candidate) {
          await this.peerConnection.addIceCandidate(
            new RTCIceCandidate(message.candidate)
          );
        }
        break;

      case 'user_transcript':
        // User's speech transcribed
        this._addTranscript('user', message.user_transcript, message.is_final);
        break;

      case 'agent_response':
      case 'audio':
        // Agent's response text
        if (message.text || message.agent_response) {
          this._addTranscript('agent', message.text || message.agent_response, true);
        }
        break;

      case 'interruption':
        // User interrupted the agent
        console.log('[WebRTC] User interrupted');
        break;

      case 'error':
        // Error from ElevenLabs
        console.error('[WebRTC] Server error:', message.error);
        this.onError(new Error(message.error || 'Server error'));
        break;

      case 'conversation_ended':
        // Conversation ended by agent or timeout
        console.log('[WebRTC] Conversation ended');
        this.disconnect();
        break;

      default:
        console.log('[WebRTC] Unhandled message type:', message.type, message);
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
      console.warn('[WebRTC] Already connected or connecting');
      return;
    }

    if (dynamicVars) {
      this.dynamicVariables = { ...this.dynamicVariables, ...dynamicVars };
    }

    this._setStatus('connecting');
    this.transcript = [];

    try {
      // Step 1: Get microphone permission
      console.log('[WebRTC] Getting microphone access...');
      this.localStream = await this._getMicrophoneStream();

      // Step 2: Get signed URL from backend
      console.log('[WebRTC] Getting signed URL...');
      const signedUrl = await this._getSignedUrl();

      // Step 3: Set up WebRTC peer connection
      console.log('[WebRTC] Setting up peer connection...');
      this._setupPeerConnection();

      // Step 4: Add local audio track to peer connection
      this.localStream.getAudioTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Step 5: Connect WebSocket and complete WebRTC handshake
      console.log('[WebRTC] Connecting to ElevenLabs...');
      await this._connectWebSocket(signedUrl);

      console.log('[WebRTC] Connection established!');

    } catch (error) {
      console.error('[WebRTC] Connection failed:', error);
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
    console.log('[WebRTC] Disconnecting...');

    // Close WebSocket
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Stop local audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Clean up remote audio
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }

    // Clean up audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

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
      console.warn('[WebRTC] Cannot send text - not connected');
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
