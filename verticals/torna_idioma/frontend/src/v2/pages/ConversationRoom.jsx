import React, { useEffect, useRef, useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';
import CognateHighlight from '../components/CognateHighlight';

/**
 * Voice conversation room — full-duplex talk to Profesora Isabel.
 *
 * Flow:
 *   1. Request mic permission
 *   2. POST /conversation/start -> get session_id
 *   3. Click "Hold to Speak" -> MediaRecorder captures webm/opus
 *   4. Release -> POST /conversation/exchange (multipart audio)
 *   5. Backend returns {user.transcript, isabel.text, isabel.audio_base64}
 *   6. Play Isabel's audio, append both transcripts to timeline
 *   7. Repeat
 *
 * Route: /Torna_Idioma/learn/voice
 */
export default function ConversationRoom() {
  const authed = isAuthenticated();
  const [sessionId, setSessionId] = useState(null);
  const [turns, setTurns] = useState([]); // {role, text, audio_url?}
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState(null);
  const [micPermission, setMicPermission] = useState(null); // null | 'granted' | 'denied'
  const [error, setError] = useState(null);
  const [lastLatency, setLastLatency] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioElRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!authed) return;
    v2Api.get('/conversation/status').then(setStatus).catch(() => {});
  }, [authed]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, processing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      streamRef.current = stream;
      setMicPermission('granted');
      setError(null);
      return stream;
    } catch (e) {
      setMicPermission('denied');
      setError('Microphone access denied. Please allow mic access and reload.');
      return null;
    }
  };

  const startSession = async () => {
    try {
      setError(null);
      if (!streamRef.current) {
        const stream = await requestMic();
        if (!stream) return;
      }
      const r = await v2Api.post('/conversation/start', {});
      setSessionId(r.session_id);
      setTurns([]);
    } catch (e) {
      setError(e.message);
    }
  };

  const startRecording = async () => {
    if (!sessionId) {
      await startSession();
    }
    if (!streamRef.current) {
      const stream = await requestMic();
      if (!stream) return;
    }
    if (processing) return;

    try {
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 1000) {
          setError('Recording too short — please hold the button longer');
          return;
        }
        await sendExchange(blob, mimeType);
      };

      recorder.start();
      setRecording(true);
      setError(null);
    } catch (e) {
      setError('Recording failed: ' + e.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const sendExchange = async (blob, mimeType) => {
    setProcessing(true);
    try {
      const form = new FormData();
      form.append('audio', blob, `speech.${mimeType.includes('webm') ? 'webm' : 'm4a'}`);
      form.append('session_id', sessionId);

      // Use raw fetch because v2Api helper is JSON-only
      const token = sessionStorage.getItem('ti_token');
      const res = await fetch('/Torna_Idioma/api/v2/conversation/exchange', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Append user turn
      setTurns((t) => [...t, { role: 'user', text: data.user.transcript }]);

      // Append Isabel turn (with audio)
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          text: data.isabel.text,
          audio_base64: data.isabel.audio_base64,
          mime: data.isabel.mime,
          model: data.isabel.model
        }
      ]);

      setLastLatency(data.total_latency_ms);

      // Auto-play Isabel's audio
      if (data.isabel.audio_base64 && audioElRef.current) {
        const audioSrc = `data:${data.isabel.mime};base64,${data.isabel.audio_base64}`;
        audioElRef.current.src = audioSrc;
        audioElRef.current.play().catch((e) => console.warn('autoplay blocked:', e));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  const replayTurn = (audio_base64, mime) => {
    if (!audio_base64 || !audioElRef.current) return;
    audioElRef.current.src = `data:${mime};base64,${audio_base64}`;
    audioElRef.current.play();
  };

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.gate}>
          <h1 style={styles.title}>Voice Conversation</h1>
          <p style={styles.subtitle}>Login to practice speaking Spanish with Profesora Isabel.</p>
          <a href="/Torna_Idioma/login" style={styles.btn}>Login</a>
        </div>
      </div>
    );
  }

  const stt = status?.stt_ready;
  const tts = status?.tts_ready;
  const ready = stt && tts;

  return (
    <div style={styles.container}>
      <div style={styles.room}>
        <div style={styles.header}>
          <div style={styles.avatar}>
            <span style={styles.avatarText}>PI</span>
            <span
              style={{
                ...styles.statusDot,
                background: ready ? '#10b981' : stt || tts ? '#f59e0b' : '#ef4444'
              }}
            />
          </div>
          <div style={styles.headerText}>
            <div style={styles.headerName}>Profesora Isabel — Voice Room</div>
            <div style={styles.headerStatus}>
              {ready
                ? 'Ready to speak Spanish with you'
                : stt || tts
                ? 'Partially configured'
                : 'Voice service offline'}
              {lastLatency && ` · Last: ${(lastLatency / 1000).toFixed(1)}s`}
            </div>
          </div>
        </div>

        {!ready && (
          <div style={styles.warning}>
            <strong>Voice service not fully configured.</strong>{' '}
            {!stt && 'Whisper STT missing. '}
            {!tts && 'ElevenLabs TTS missing. '}
            Contact your admin to set TI_V2_OPENAI_KEY and ELEVENLABS_API_KEY.
          </div>
        )}

        <div ref={scrollRef} style={styles.transcript}>
          {turns.length === 0 && (
            <div style={styles.welcome}>
              <div style={styles.welcomeAvatar}>PI</div>
              <h2 style={styles.welcomeTitle}>¡Hablemos en español!</h2>
              <p style={styles.welcomeText}>
                Hold the button below and speak Spanish to Profesora Isabel.<br />
                Your voice → Whisper transcription → Isabel's response → ElevenLabs voice playback.
              </p>
              <p style={styles.welcomeHint}>
                Try saying: <em>"Hola Profesora, ¿cómo estás?"</em>
              </p>
            </div>
          )}

          {turns.map((t, i) => (
            <div
              key={i}
              style={{
                ...styles.turn,
                ...(t.role === 'user' ? styles.turnUser : styles.turnIsabel)
              }}
            >
              <div style={styles.turnLabel}>
                {t.role === 'user' ? 'You said' : 'Profesora Isabel'}
                {t.role === 'assistant' && t.audio_base64 && (
                  <button
                    onClick={() => replayTurn(t.audio_base64, t.mime)}
                    style={styles.replayBtn}
                    title="Replay"
                  >
                    ▶
                  </button>
                )}
              </div>
              <div style={styles.turnText}>
                {t.role === 'assistant' ? <CognateHighlight text={t.text} inline /> : t.text}
              </div>
            </div>
          ))}

          {processing && (
            <div style={{ ...styles.turn, ...styles.turnIsabel }}>
              <div style={styles.turnLabel}>Profesora Isabel</div>
              <div style={styles.turnText}>
                <span style={styles.thinking}>
                  Transcribing
                  <span style={styles.dots}>
                    <span style={styles.dot}>.</span>
                    <span style={{ ...styles.dot, animationDelay: '0.2s' }}>.</span>
                    <span style={{ ...styles.dot, animationDelay: '0.4s' }}>.</span>
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.controls}>
          {!sessionId && ready && (
            <button onClick={startSession} style={styles.startBtn}>
              Start Voice Session
            </button>
          )}

          {sessionId && ready && (
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={(e) => {
                e.preventDefault();
                startRecording();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopRecording();
              }}
              disabled={processing}
              style={{
                ...styles.micBtn,
                ...(recording ? styles.micBtnActive : {}),
                ...(processing ? styles.micBtnDisabled : {})
              }}
            >
              {processing ? 'Processing...' : recording ? 'Release to Send' : 'Hold to Speak'}
            </button>
          )}
        </div>

        <audio ref={audioElRef} style={{ display: 'none' }} />

        <div style={styles.footer}>
          Step 7 of 12 · Real-Time Voice ·{' '}
          <a href="/Torna_Idioma/learn/isabel" style={styles.link}>Text chat</a>
          {' · '}
          <a href="/Torna_Idioma/learn" style={styles.link}>← Home</a>
        </div>
      </div>
    </div>
  );
}

if (typeof document !== 'undefined' && !document.getElementById('ti-v2-voice-anim')) {
  const s = document.createElement('style');
  s.id = 'ti-v2-voice-anim';
  s.textContent = `
    @keyframes ti-v2-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(196, 30, 58, 0.7); }
      50% { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(196, 30, 58, 0); }
    }
    @keyframes ti-v2-dot-fade {
      0%, 60%, 100% { opacity: 0.3; }
      30% { opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 50%, #0F1A2E 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '24px 16px 16px',
    display: 'flex',
    justifyContent: 'center'
  },
  room: {
    maxWidth: 720,
    width: '100%',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 48px)',
    overflow: 'hidden',
    backdropFilter: 'blur(12px)'
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid rgba(201, 168, 76, 0.2)',
    display: 'flex',
    alignItems: 'center',
    gap: 14
  },
  avatar: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid rgba(232, 212, 139, 0.5)'
  },
  avatarText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 900,
    color: '#0F1A2E'
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: '2px solid #1B2A4A'
  },
  headerText: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: 700, color: '#fff' },
  headerStatus: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  warning: {
    margin: '16px 24px 0',
    padding: 12,
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: 8,
    fontSize: 12,
    color: '#fcd34d',
    lineHeight: 1.6
  },

  transcript: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    minHeight: 280
  },
  welcome: { textAlign: 'center', padding: '32px 16px' },
  welcomeAvatar: {
    width: 80,
    height: 80,
    margin: '0 auto 16px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    fontWeight: 900,
    color: '#0F1A2E',
    border: '3px solid rgba(232, 212, 139, 0.5)'
  },
  welcomeTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 22,
    fontWeight: 800,
    color: '#C9A84C',
    marginBottom: 8
  },
  welcomeText: { fontSize: 13, color: '#94a3b8', lineHeight: 1.7, marginBottom: 12 },
  welcomeHint: { fontSize: 12, color: '#E8D48B', fontStyle: 'italic' },

  turn: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '88%' },
  turnUser: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  turnIsabel: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  turnLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#C9A84C',
    letterSpacing: 1,
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  turnText: {
    padding: '12px 16px',
    background: 'rgba(15, 26, 46, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.15)',
    borderRadius: 14,
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  replayBtn: {
    background: 'rgba(201, 168, 76, 0.15)',
    border: '1px solid rgba(201, 168, 76, 0.3)',
    color: '#C9A84C',
    width: 22,
    height: 22,
    borderRadius: '50%',
    fontSize: 10,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  thinking: { color: '#94a3b8', fontStyle: 'italic' },
  dots: { display: 'inline-block', marginLeft: 2 },
  dot: { display: 'inline-block', animation: 'ti-v2-dot-fade 1.2s infinite' },

  errorBox: {
    margin: '0 24px 12px',
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    fontSize: 12
  },

  controls: {
    padding: '20px 24px',
    borderTop: '1px solid rgba(201, 168, 76, 0.2)',
    display: 'flex',
    justifyContent: 'center'
  },
  startBtn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '14px 36px',
    borderRadius: 12,
    fontWeight: 800,
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 1
  },
  micBtn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '18px 48px',
    borderRadius: 48,
    fontWeight: 800,
    fontSize: 15,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 1,
    transition: 'all 0.2s',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'manipulation'
  },
  micBtnActive: {
    background: 'linear-gradient(135deg, #C41E3A, #8B1428)',
    color: '#fff',
    animation: 'ti-v2-pulse 1.5s infinite'
  },
  micBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },

  gate: {
    maxWidth: 480,
    margin: '60px auto',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center'
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 28,
    fontWeight: 900,
    color: '#fff',
    marginBottom: 12
  },
  subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 24 },
  btn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    padding: '12px 28px',
    borderRadius: 8,
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-block'
  },

  footer: {
    textAlign: 'center',
    fontSize: 10,
    color: '#64748b',
    padding: '10px 16px 14px',
    letterSpacing: 0.5
  },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
