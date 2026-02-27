/**
 * Web Call Center - Embeddable Voice Widget
 * Self-contained widget that connects to ElevenLabs Conversational AI via WebSocket.
 * No Twilio required - browser-to-ElevenLabs direct connection.
 *
 * Adapted from ElevenLabsWebRTCClient (public/elevenlabs-webrtc-demo)
 */
(function() {
  'use strict';

  // SVG Icons
  var ICONS = {
    phone: '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    x: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    phoneOff: '<svg viewBox="0 0 24 24"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
  };

  // Widget states
  var STATE = {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    SPEAKING: 'speaking',
    LISTENING: 'listening',
    ERROR: 'error'
  };

  /**
   * Main Widget Class
   */
  function WCCWidgetInstance(config) {
    this.widgetId = config.widgetId;
    this.apiBase = config.apiBase;
    this.state = STATE.IDLE;
    this.websocket = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.stream = null;
    this.transcript = [];
    this.widgetConfig = null;
    this.panelOpen = false;

    this._init();
  }

  WCCWidgetInstance.prototype._init = function() {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'wcc-widget';
    document.body.appendChild(this.container);

    // Fetch widget config, then render
    this._fetchConfig();
  };

  WCCWidgetInstance.prototype._fetchConfig = function() {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', this.apiBase + '/api/v1/token', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            self.widgetConfig = data;
            self._render();
          } catch (e) {
            console.error('[WCC Widget] Failed to parse config:', e);
          }
        } else {
          console.error('[WCC Widget] Failed to fetch config:', xhr.status);
        }
      }
    };
    xhr.send(JSON.stringify({ widget_id: this.widgetId }));
  };

  WCCWidgetInstance.prototype._render = function() {
    var cfg = this.widgetConfig;
    var color = (cfg && cfg.primary_color) || '#4F46E5';
    var position = (cfg && cfg.position) || 'bottom-right';
    var agentName = (cfg && cfg.agent_name) || 'AI Assistant';
    var greeting = (cfg && cfg.greeting) || 'Hi! How can I help you today?';

    // Trigger button
    this.trigger = document.createElement('button');
    this.trigger.className = 'wcc-trigger ' + position;
    this.trigger.style.backgroundColor = color;
    this.trigger.innerHTML = ICONS.phone;
    this.trigger.onclick = this._togglePanel.bind(this);

    // Panel
    this.panel = document.createElement('div');
    this.panel.className = 'wcc-panel ' + position;
    this.panel.innerHTML =
      '<div class="wcc-header" style="background:' + color + '">' +
        '<div>' +
          '<div class="wcc-header-title">' + this._esc(agentName) + '</div>' +
          '<div class="wcc-header-status" id="wcc-status">Ready</div>' +
        '</div>' +
        '<button class="wcc-close" id="wcc-close">' + ICONS.x + '</button>' +
      '</div>' +
      '<div class="wcc-transcript" id="wcc-transcript"></div>' +
      '<div class="wcc-greeting" id="wcc-greeting">' +
        '<p>' + this._esc(greeting) + '</p>' +
        '<button class="wcc-start-btn" id="wcc-start" style="background:' + color + '">Start Conversation</button>' +
      '</div>' +
      '<div class="wcc-controls" id="wcc-controls" style="display:none">' +
        '<span class="wcc-status-text" id="wcc-status-text">Listening...</span>' +
        '<button class="wcc-mic-btn wcc-end" id="wcc-end">' + ICONS.phoneOff + '</button>' +
      '</div>';

    this.container.appendChild(this.panel);
    this.container.appendChild(this.trigger);

    // Store references
    this.statusEl = this.panel.querySelector('#wcc-status');
    this.transcriptEl = this.panel.querySelector('#wcc-transcript');
    this.greetingEl = this.panel.querySelector('#wcc-greeting');
    this.controlsEl = this.panel.querySelector('#wcc-controls');
    this.statusTextEl = this.panel.querySelector('#wcc-status-text');
    this.primaryColor = color;

    // Event listeners
    var self = this;
    this.panel.querySelector('#wcc-close').onclick = function() { self._togglePanel(); };
    this.panel.querySelector('#wcc-start').onclick = function() { self._startConversation(); };
    this.panel.querySelector('#wcc-end').onclick = function() { self._endConversation(); };
  };

  WCCWidgetInstance.prototype._esc = function(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  WCCWidgetInstance.prototype._togglePanel = function() {
    this.panelOpen = !this.panelOpen;
    if (this.panelOpen) {
      this.panel.classList.add('wcc-open');
    } else {
      this.panel.classList.remove('wcc-open');
    }
  };

  WCCWidgetInstance.prototype._setStatus = function(text) {
    if (this.statusEl) this.statusEl.textContent = text;
    if (this.statusTextEl) this.statusTextEl.textContent = text;
  };

  WCCWidgetInstance.prototype._addMessage = function(role, text) {
    this.transcript.push({ role: role, text: text });
    var msg = document.createElement('div');
    msg.className = 'wcc-message ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'wcc-bubble';
    if (role === 'user') {
      bubble.style.backgroundColor = this.primaryColor;
    }
    bubble.textContent = text;
    msg.appendChild(bubble);
    this.transcriptEl.appendChild(msg);
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  };

  WCCWidgetInstance.prototype._startConversation = async function() {
    var self = this;
    this.state = STATE.CONNECTING;
    this._setStatus('Connecting...');
    this.greetingEl.style.display = 'none';
    this.controlsEl.style.display = 'flex';
    this.trigger.classList.add('wcc-active');

    try {
      // Request microphone
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get fresh signed URL
      var response = await fetch(this.apiBase + '/api/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widget_id: this.widgetId })
      });

      if (!response.ok) throw new Error('Failed to get token');
      var data = await response.json();
      if (!data.signed_url) throw new Error('No signed URL received');

      // Connect WebSocket
      this.websocket = new WebSocket(data.signed_url);

      this.websocket.onopen = function() {
        self.state = STATE.CONNECTED;
        self._setStatus('Connected');

        // Send conversation initiation data with knowledge base
        if (data.knowledge_base) {
          self.websocket.send(JSON.stringify({
            type: 'conversation_initiation_client_data',
            conversation_initiation_client_data: {
              dynamic_variables: {
                knowledge_base: data.knowledge_base
              }
            }
          }));
        }

        // Start recording audio
        self._startRecording();
      };

      this.websocket.onmessage = function(event) {
        self._handleMessage(event);
      };

      this.websocket.onclose = function() {
        self._endConversation();
      };

      this.websocket.onerror = function(err) {
        console.error('[WCC Widget] WebSocket error:', err);
        self.state = STATE.ERROR;
        self._setStatus('Connection error');
        self._endConversation();
      };

    } catch (err) {
      console.error('[WCC Widget] Failed to start:', err);
      this.state = STATE.ERROR;
      this._setStatus('Error: ' + err.message);
      this._resetUI();
    }
  };

  WCCWidgetInstance.prototype._startRecording = function() {
    var self = this;
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = function(event) {
        if (event.data.size > 0 && self.websocket && self.websocket.readyState === WebSocket.OPEN) {
          var reader = new FileReader();
          reader.onloadend = function() {
            var base64 = reader.result.split(',')[1];
            if (base64) {
              self.websocket.send(JSON.stringify({
                user_audio_chunk: base64
              }));
            }
          };
          reader.readAsDataURL(event.data);
        }
      };

      this.mediaRecorder.start(250); // 250ms chunks
      this.state = STATE.LISTENING;
      this._setStatus('Listening...');
    } catch (err) {
      console.error('[WCC Widget] Recording error:', err);
    }
  };

  WCCWidgetInstance.prototype._handleMessage = function(event) {
    try {
      var msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'conversation_initiation_metadata':
          this.conversationId = msg.conversation_id;
          break;

        case 'audio':
          this.state = STATE.SPEAKING;
          this._setStatus('Speaking...');
          this._playAudio(msg.audio?.chunk || msg.audio_event?.audio_base_64);
          break;

        case 'agent_response':
          if (msg.agent_response?.trim()) {
            this._addMessage('agent', msg.agent_response);
          }
          break;

        case 'user_transcript':
          if (msg.user_transcription?.trim()) {
            this._addMessage('user', msg.user_transcription);
          }
          break;

        case 'interruption':
          this.state = STATE.LISTENING;
          this._setStatus('Listening...');
          break;

        case 'ping':
          if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ type: 'pong' }));
          }
          break;

        case 'conversation_ended':
          this._endConversation();
          break;
      }
    } catch (e) {
      // Binary audio data, ignore parse errors
    }
  };

  WCCWidgetInstance.prototype._playAudio = function(base64Audio) {
    if (!base64Audio || !this.audioContext) return;
    var self = this;

    try {
      var binaryString = atob(base64Audio);
      var bytes = new Uint8Array(binaryString.length);
      for (var i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      this.audioContext.decodeAudioData(bytes.buffer, function(audioBuffer) {
        var source = self.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(self.audioContext.destination);
        source.onended = function() {
          if (self.state === STATE.SPEAKING) {
            self.state = STATE.LISTENING;
            self._setStatus('Listening...');
          }
        };
        source.start(0);
      }).catch(function() {
        // Audio decode failed - common with streaming chunks, ignore
      });
    } catch (e) {
      // Ignore audio playback errors
    }
  };

  WCCWidgetInstance.prototype._endConversation = function() {
    // Stop recording
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Stop microphone
    if (this.stream) {
      this.stream.getTracks().forEach(function(track) { track.stop(); });
      this.stream = null;
    }

    // Close WebSocket
    if (this.websocket) {
      if (this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.close();
      }
      this.websocket = null;
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(function() {});
      this.audioContext = null;
    }

    this.state = STATE.IDLE;
    this.trigger.classList.remove('wcc-active');
    this._setStatus('Call ended');

    // Reset UI after a moment
    var self = this;
    setTimeout(function() {
      self._resetUI();
    }, 2000);
  };

  WCCWidgetInstance.prototype._resetUI = function() {
    this.greetingEl.style.display = 'block';
    this.controlsEl.style.display = 'none';
    this._setStatus('Ready');
    this.trigger.classList.remove('wcc-active');
  };

  // Global init
  window.WCCWidget = {
    init: function(config) {
      return new WCCWidgetInstance(config);
    }
  };
})();
