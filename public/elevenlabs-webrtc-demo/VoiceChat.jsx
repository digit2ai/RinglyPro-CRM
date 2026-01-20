/**
 * VoiceChat React Component
 *
 * A complete React component for voice conversations with ElevenLabs AI agents.
 * Uses the ElevenLabsWebRTCClient class for WebRTC connection management.
 *
 * Features:
 * - Start/Stop conversation buttons
 * - Microphone permission handling
 * - Connection state display
 * - Live transcript rendering
 * - Audio level visualization
 * - Error handling
 *
 * Usage with React:
 * =================
 * import VoiceChat from './VoiceChat';
 *
 * function App() {
 *   return (
 *     <VoiceChat
 *       agentId="your-elevenlabs-agent-id"
 *       tokenEndpoint="/api/elevenlabs-webrtc/token"
 *       dynamicVariables={{ customer_name: 'John' }}
 *     />
 *   );
 * }
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// Status display configuration
const STATUS_CONFIG = {
  disconnected: {
    label: 'Ready',
    color: '#6b7280', // gray
    bgColor: '#f3f4f6'
  },
  connecting: {
    label: 'Connecting...',
    color: '#f59e0b', // amber
    bgColor: '#fef3c7'
  },
  connected: {
    label: 'Connected',
    color: '#10b981', // green
    bgColor: '#d1fae5'
  },
  error: {
    label: 'Error',
    color: '#ef4444', // red
    bgColor: '#fee2e2'
  }
};

/**
 * VoiceChat Component
 *
 * @param {Object} props
 * @param {string} props.agentId - ElevenLabs agent ID (required)
 * @param {string} props.tokenEndpoint - Backend endpoint for token generation
 * @param {Object} props.dynamicVariables - Variables to pass to the agent
 * @param {string} props.title - Title to display above the chat
 * @param {string} props.subtitle - Subtitle/description
 */
export default function VoiceChat({
  agentId,
  tokenEndpoint = '/api/elevenlabs-webrtc/token',
  dynamicVariables = {},
  title = 'Voice Assistant',
  subtitle = 'Click Start to begin your conversation'
}) {
  // State
  const [status, setStatus] = useState('disconnected');
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

  // Refs
  const clientRef = useRef(null);
  const transcriptEndRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Initialize client on mount
  useEffect(() => {
    // Dynamically import the client class
    // In a real app, this would be a proper import
    if (typeof window !== 'undefined' && window.ElevenLabsWebRTCClient) {
      clientRef.current = new window.ElevenLabsWebRTCClient({
        tokenEndpoint,
        agentId,
        dynamicVariables,
        onStatusChange: (newStatus) => {
          setStatus(newStatus);
          if (newStatus === 'disconnected') {
            setIsAgentSpeaking(false);
          }
        },
        onTranscript: (role, text, isFinal) => {
          setTranscript(prev => {
            // Update or add transcript entry
            const newEntry = { role, text, isFinal, id: Date.now() };

            if (!isFinal) {
              // Find and update interim entry
              const lastIndex = prev.findLastIndex(t => t.role === role && !t.isFinal);
              if (lastIndex >= 0) {
                const updated = [...prev];
                updated[lastIndex] = newEntry;
                return updated;
              }
            } else {
              // Remove interim and add final
              const filtered = prev.filter(t => !(t.role === role && !t.isFinal));
              return [...filtered, newEntry];
            }
            return [...prev, newEntry];
          });

          // Track if agent is speaking
          if (role === 'agent') {
            setIsAgentSpeaking(true);
            // Clear speaking state after a delay
            setTimeout(() => setIsAgentSpeaking(false), 500);
          }
        },
        onError: (err) => {
          console.error('Voice chat error:', err);
          setError(err.message);
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
        }
      });
    }

    return () => {
      clientRef.current?.disconnect();
    };
  }, [agentId, tokenEndpoint]);

  // Start conversation
  const handleStart = useCallback(async () => {
    setError(null);
    setTranscript([]);

    try {
      await clientRef.current?.connect(dynamicVariables);
    } catch (err) {
      setError(err.message);
    }
  }, [dynamicVariables]);

  // Stop conversation
  const handleStop = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.subtitle}>{subtitle}</p>
      </div>

      {/* Status indicator */}
      <div
        style={{
          ...styles.statusBadge,
          backgroundColor: statusConfig.bgColor,
          color: statusConfig.color
        }}
      >
        <span
          style={{
            ...styles.statusDot,
            backgroundColor: statusConfig.color,
            animation: status === 'connecting' ? 'pulse 1.5s infinite' : 'none'
          }}
        />
        {statusConfig.label}
      </div>

      {/* Audio level indicator (when connected) */}
      {status === 'connected' && (
        <div style={styles.audioLevelContainer}>
          <div style={styles.audioLevelLabel}>
            {isAgentSpeaking ? 'Agent Speaking' : 'Listening...'}
          </div>
          <div style={styles.audioLevelBar}>
            <div
              style={{
                ...styles.audioLevelFill,
                width: `${Math.min(audioLevel * 100, 100)}%`,
                backgroundColor: isAgentSpeaking ? '#10b981' : '#3b82f6'
              }}
            />
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Transcript */}
      <div style={styles.transcript}>
        {transcript.length === 0 ? (
          <div style={styles.emptyTranscript}>
            Transcript will appear here when you start talking...
          </div>
        ) : (
          transcript.map((entry, index) => (
            <div
              key={entry.id || index}
              style={{
                ...styles.transcriptEntry,
                ...(entry.role === 'user' ? styles.userEntry : styles.agentEntry),
                opacity: entry.isFinal ? 1 : 0.7
              }}
            >
              <div style={styles.transcriptRole}>
                {entry.role === 'user' ? 'You' : 'Agent'}
              </div>
              <div style={styles.transcriptText}>{entry.text}</div>
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        {status === 'disconnected' || status === 'error' ? (
          <button
            onClick={handleStart}
            style={styles.startButton}
            disabled={!agentId}
          >
            <MicIcon />
            Start Talking
          </button>
        ) : status === 'connecting' ? (
          <button style={styles.connectingButton} disabled>
            <LoadingIcon />
            Connecting...
          </button>
        ) : (
          <button onClick={handleStop} style={styles.stopButton}>
            <StopIcon />
            End Call
          </button>
        )}
      </div>

      {/* Info footer */}
      <div style={styles.footer}>
        <p style={styles.footerText}>
          Powered by ElevenLabs Conversational AI
        </p>
      </div>

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// Simple SVG icons
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
  </svg>
);

const StopIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
);

const LoadingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8, animation: 'spin 1s linear infinite' }}>
    <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/>
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </svg>
);

// Inline styles (for standalone use without CSS framework)
const styles = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '480px',
    margin: '0 auto',
    padding: '24px',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    margin: 0,
    fontSize: '14px',
    color: '#6b7280',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '16px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  audioLevelContainer: {
    marginBottom: '16px',
  },
  audioLevelLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  audioLevelBar: {
    height: '4px',
    backgroundColor: '#e5e7eb',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  audioLevelFill: {
    height: '100%',
    transition: 'width 0.1s ease-out',
    borderRadius: '2px',
  },
  errorBox: {
    padding: '12px 16px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  transcript: {
    height: '300px',
    overflowY: 'auto',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  emptyTranscript: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#9ca3af',
    fontSize: '14px',
    textAlign: 'center',
  },
  transcriptEntry: {
    marginBottom: '12px',
    padding: '12px',
    borderRadius: '8px',
  },
  userEntry: {
    backgroundColor: '#dbeafe',
    marginLeft: '32px',
  },
  agentEntry: {
    backgroundColor: '#ffffff',
    marginRight: '32px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  },
  transcriptRole: {
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  transcriptText: {
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#111827',
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
  },
  startButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 28px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
  },
  stopButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 28px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)',
  },
  connectingButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 28px',
    backgroundColor: '#f59e0b',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'not-allowed',
    opacity: 0.8,
  },
  footer: {
    marginTop: '20px',
    textAlign: 'center',
  },
  footerText: {
    margin: 0,
    fontSize: '12px',
    color: '#9ca3af',
  },
};
