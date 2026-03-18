import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  ENDED: 'ended'
};

export default function VoiceIntake() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [caseResult, setCaseResult] = useState(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const navigate = useNavigate();

  const cleanup = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setAudioLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startConversation = async () => {
    setStatus(STATUS.CONNECTING);
    setError(null);
    setTranscript([]);
    setCaseResult(null);

    try {
      // Get signed URL from backend
      const tokenRes = await fetch('/msk/api/v1/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dynamicVariables: { platform: 'MSK Intelligence Web' }
        })
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'Failed to get voice token');
      }

      const { signed_url } = await tokenRes.json();

      // Set up WebSocket to ElevenLabs
      const ws = new WebSocket(signed_url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[MSK Voice] WebSocket connected');
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'conversation_initiation_metadata':
            // Connection established, set up WebRTC
            await setupWebRTC(ws, msg);
            setStatus(STATUS.CONNECTED);
            break;

          case 'audio':
            // Play agent audio via WebRTC data channel (handled by peer connection)
            break;

          case 'agent_response':
            if (msg.agent_response_event === 'agent_response') {
              setTranscript(prev => [...prev, { role: 'agent', text: msg.agent_response }]);
            }
            break;

          case 'user_transcript':
            if (msg.user_transcription_event === 'user_transcript') {
              setTranscript(prev => [...prev, { role: 'user', text: msg.user_transcript }]);
            }
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }));
            break;

          case 'conversation_ended':
            setStatus(STATUS.ENDED);
            cleanup();
            break;

          default:
            break;
        }
      };

      ws.onerror = (e) => {
        console.error('[MSK Voice] WebSocket error:', e);
        setError('Connection error. Please try again.');
        setStatus(STATUS.ERROR);
        cleanup();
      };

      ws.onclose = () => {
        if (status !== STATUS.ENDED && status !== STATUS.ERROR) {
          setStatus(STATUS.ENDED);
        }
      };

    } catch (err) {
      console.error('[MSK Voice] Start error:', err);
      setError(err.message);
      setStatus(STATUS.ERROR);
      cleanup();
    }
  };

  const setupWebRTC = async (ws, initMsg) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Audio level visualization
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 255);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Add mic track
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote audio (agent voice)
      pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play().catch(() => {});
      };

      // Send ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'ice_candidate',
            candidate: event.candidate
          }));
        }
      };

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      ws.send(JSON.stringify({
        type: 'session_description',
        sdp: offer.sdp
      }));

      // Listen for answer
      const origOnMessage = ws.onmessage;
      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'session_description' && msg.sdp) {
          await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        } else if (msg.type === 'ice_candidate' && msg.candidate) {
          await pc.addIceCandidate(msg.candidate);
        }
        // Forward to original handler
        origOnMessage(event);
      };
    } catch (err) {
      console.error('[MSK Voice] WebRTC setup error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access and try again.');
      } else {
        setError('Failed to set up audio: ' + err.message);
      }
      setStatus(STATUS.ERROR);
    }
  };

  const endConversation = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_conversation' }));
    }
    setStatus(STATUS.ENDED);
    cleanup();
  };

  const statusConfig = {
    [STATUS.IDLE]: { color: 'bg-dark-600', text: 'Ready to start', pulse: false },
    [STATUS.CONNECTING]: { color: 'bg-yellow-500', text: 'Connecting...', pulse: true },
    [STATUS.CONNECTED]: { color: 'bg-green-500', text: 'Speaking with Dr. MSK', pulse: true },
    [STATUS.ERROR]: { color: 'bg-red-500', text: 'Error', pulse: false },
    [STATUS.ENDED]: { color: 'bg-msk-500', text: 'Conversation ended', pulse: false }
  };

  const currentStatus = statusConfig[status];

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-dark-800 bg-dark-900/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-5">
            <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="MSK Intelligence" className="w-16 h-16 rounded-lg object-contain" />
            <div className="ml-1">
              <h1 className="text-lg font-bold text-white">MSK Intelligence</h1>
              <p className="text-xs text-msk-400">AI Voice Intake</p>
            </div>
          </Link>
          <Link to="/login" className="text-dark-300 hover:text-white text-sm font-medium">
            Sign In
          </Link>
        </div>
      </nav>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Title */}
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3">AI Voice Intake</h2>
            <p className="text-dark-400 max-w-lg mx-auto">
              Speak with our AI intake specialist to describe your symptoms.
              Your case will be created and routed to a specialist automatically.
            </p>
          </div>

          {/* Voice Widget */}
          <div className="card bg-dark-900 border-dark-700 p-8">
            {/* Status Indicator */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className={`w-3 h-3 rounded-full ${currentStatus.color} ${currentStatus.pulse ? 'animate-pulse' : ''}`} />
              <span className="text-dark-300 text-sm font-medium">{currentStatus.text}</span>
            </div>

            {/* Microphone Visualization */}
            <div className="flex items-center justify-center mb-8">
              <div className="relative">
                {/* Outer ring - audio level */}
                <div
                  className="absolute inset-0 rounded-full bg-msk-500/20 transition-transform duration-100"
                  style={{
                    transform: `scale(${1 + audioLevel * 0.6})`,
                    opacity: status === STATUS.CONNECTED ? 0.5 : 0
                  }}
                />
                <div
                  className="absolute inset-0 rounded-full bg-msk-500/10 transition-transform duration-150"
                  style={{
                    transform: `scale(${1 + audioLevel * 1.2})`,
                    opacity: status === STATUS.CONNECTED ? 0.3 : 0
                  }}
                />

                {/* Main button */}
                <button
                  onClick={status === STATUS.IDLE || status === STATUS.ERROR || status === STATUS.ENDED
                    ? startConversation
                    : status === STATUS.CONNECTED ? endConversation : undefined}
                  disabled={status === STATUS.CONNECTING}
                  className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl
                    ${status === STATUS.CONNECTED
                      ? 'bg-gradient-to-br from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 cursor-pointer'
                      : status === STATUS.CONNECTING
                        ? 'bg-gradient-to-br from-yellow-500 to-yellow-700 cursor-wait'
                        : 'bg-gradient-to-br from-msk-500 to-msk-700 hover:from-msk-400 hover:to-msk-600 cursor-pointer'
                    }`}
                >
                  {status === STATUS.CONNECTED ? (
                    // Stop icon
                    <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : status === STATUS.CONNECTING ? (
                    // Loading spinner
                    <svg className="w-12 h-12 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    // Mic icon
                    <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Action text */}
            <p className="text-center text-dark-400 text-sm mb-6">
              {status === STATUS.IDLE && 'Tap the microphone to begin your intake'}
              {status === STATUS.CONNECTING && 'Setting up secure audio connection...'}
              {status === STATUS.CONNECTED && 'Tap to end the conversation'}
              {status === STATUS.ENDED && 'Conversation complete. Tap to start a new one.'}
              {status === STATUS.ERROR && 'Something went wrong. Tap to try again.'}
            </p>

            {/* Error message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Transcript */}
            {transcript.length > 0 && (
              <div className="border-t border-dark-700 pt-6">
                <h3 className="text-sm font-bold text-dark-300 uppercase tracking-wider mb-4">Live Transcript</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {transcript.map((entry, i) => (
                    <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                        entry.role === 'user'
                          ? 'bg-msk-600/20 text-msk-200 rounded-br-sm'
                          : 'bg-dark-800 text-dark-200 rounded-bl-sm'
                      }`}>
                        <p className="text-[10px] uppercase tracking-wider opacity-50 mb-1">
                          {entry.role === 'user' ? 'You' : 'Dr. MSK'}
                        </p>
                        {entry.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Case created */}
            {caseResult && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mt-6">
                <p className="text-green-400 font-medium">Case {caseResult.caseNumber} created!</p>
                <p className="text-dark-300 text-sm mt-1">{caseResult.message}</p>
                <Link to="/login" className="text-msk-400 text-sm hover:text-msk-300 mt-2 inline-block">
                  Sign in to view your case →
                </Link>
              </div>
            )}
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-3 gap-4 mt-8">
            {[
              { icon: '🔒', title: 'HIPAA Secure', desc: 'Encrypted end-to-end' },
              { icon: '🤖', title: 'AI-Powered', desc: 'Smart triage routing' },
              { icon: '⚡', title: 'Fast Track', desc: '24h specialist review' }
            ].map((card, i) => (
              <div key={i} className="card text-center py-4">
                <span className="text-2xl">{card.icon}</span>
                <p className="text-white text-sm font-medium mt-2">{card.title}</p>
                <p className="text-dark-400 text-xs">{card.desc}</p>
              </div>
            ))}
          </div>

          {/* Fallback CTA */}
          <div className="text-center mt-8">
            <p className="text-dark-400 text-sm">
              Prefer to type?{' '}
              <Link to="/register" className="text-msk-400 hover:text-msk-300">
                Register and create a case online →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
