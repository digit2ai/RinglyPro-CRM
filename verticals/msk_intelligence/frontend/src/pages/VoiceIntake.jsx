import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Conversation } from '@11labs/client';
const mskLogo = 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69d97bc215a505b6793950c0.png';

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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [caseResult, setCaseResult] = useState(null);
  const conversationRef = useRef(null);

  const cleanup = useCallback(async () => {
    if (conversationRef.current) {
      try { await conversationRef.current.endSession(); } catch (e) {}
      conversationRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const startConversation = async () => {
    setStatus(STATUS.CONNECTING);
    setError(null);
    setTranscript([]);
    setCaseResult(null);

    try {
      // Get signed URL from our backend
      const tokenRes = await fetch('/msk/api/v1/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dynamicVariables: { platform: 'ImagingMind Web' } })
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'Failed to get voice token');
      }

      const { signed_url } = await tokenRes.json();

      // Start conversation using official ElevenLabs SDK
      const conversation = await Conversation.startSession({
        signedUrl: signed_url,
        onConnect: () => {
          console.log('[MSK Voice] Connected');
          setStatus(STATUS.CONNECTED);
        },
        onDisconnect: () => {
          console.log('[MSK Voice] Disconnected');
          setStatus(STATUS.ENDED);
          conversationRef.current = null;
        },
        onError: (err) => {
          console.error('[MSK Voice] Error:', err);
          setError(typeof err === 'string' ? err : err.message || 'Voice connection error');
          setStatus(STATUS.ERROR);
        },
        onModeChange: (mode) => {
          // mode.mode is 'speaking' or 'listening'
          setIsSpeaking(mode.mode === 'speaking');
        },
        onMessage: (msg) => {
          // Handle transcript messages
          if (msg.source === 'ai') {
            setTranscript(prev => [...prev, { role: 'agent', text: msg.message }]);
          } else if (msg.source === 'user') {
            setTranscript(prev => [...prev, { role: 'user', text: msg.message }]);
          }
        }
      });

      conversationRef.current = conversation;
    } catch (err) {
      console.error('[MSK Voice] Start error:', err);
      setError(err.message);
      setStatus(STATUS.ERROR);
    }
  };

  const endConversation = async () => {
    setStatus(STATUS.ENDED);
    await cleanup();
  };

  const statusConfig = {
    [STATUS.IDLE]: { color: 'bg-dark-600', text: 'Ready to start', pulse: false },
    [STATUS.CONNECTING]: { color: 'bg-yellow-500', text: 'Connecting...', pulse: true },
    [STATUS.CONNECTED]: { color: 'bg-green-500', text: isSpeaking ? 'Dr. ImagingMind is speaking...' : 'Listening...', pulse: true },
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
            <img src={mskLogo} alt="Digit2AI" className="h-20 w-auto object-contain" />
            <div className="ml-1">
              <h1 className="text-lg font-bold text-white">ImagingMind</h1>
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
                {/* Pulse rings when agent is speaking */}
                <div
                  className="absolute inset-0 rounded-full bg-msk-500/20 transition-transform duration-300"
                  style={{
                    transform: `scale(${isSpeaking ? 1.4 : 1})`,
                    opacity: status === STATUS.CONNECTED ? 0.5 : 0
                  }}
                />
                <div
                  className="absolute inset-0 rounded-full bg-msk-500/10 transition-transform duration-500"
                  style={{
                    transform: `scale(${isSpeaking ? 1.8 : 1})`,
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
                    <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : status === STATUS.CONNECTING ? (
                    <svg className="w-12 h-12 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
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
                          {entry.role === 'user' ? 'You' : 'Dr. ImagingMind'}
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
