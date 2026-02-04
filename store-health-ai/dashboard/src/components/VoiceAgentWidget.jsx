import React, { useState, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { cn } from '@/lib/utils';

/**
 * Custom Voice Agent Widget
 * Uses ElevenLabs React SDK - No branding
 * Positioned inline in header
 */
export function VoiceAgentWidget({ agentId }) {
  const [isConnecting, setIsConnecting] = useState(false);

  const conversation = useConversation({
    onConnect: () => {
      setIsConnecting(false);
    },
    onDisconnect: () => {
      setIsConnecting(false);
    },
    onError: (error) => {
      console.error('Conversation error:', error);
      setIsConnecting(false);
    },
  });

  const { status, isSpeaking } = conversation;

  const handleStartConversation = useCallback(async () => {
    try {
      setIsConnecting(true);
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({
        agentId: agentId,
      });
    } catch (error) {
      console.error('Failed to start conversation:', error);
      setIsConnecting(false);
    }
  }, [conversation, agentId]);

  const handleEndConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const handleToggle = useCallback(() => {
    if (status === 'connected') {
      handleEndConversation();
    } else {
      handleStartConversation();
    }
  }, [status, handleStartConversation, handleEndConversation]);

  const isActive = status === 'connected';

  return (
    <div className="relative flex items-center gap-2">
      {/* Status text when active */}
      {isActive && (
        <span className="text-xs font-medium text-red-500 animate-pulse">
          {isSpeaking ? 'Speaking...' : 'Listening...'}
        </span>
      )}

      {/* Main orb button */}
      <button
        onClick={handleToggle}
        disabled={isConnecting}
        className={cn(
          'relative w-10 h-10 rounded-full shadow-lg transition-all duration-300',
          'flex items-center justify-center',
          'hover:scale-110 active:scale-95',
          isActive ? 'bg-red-500' : 'bg-gray-900 hover:bg-gray-800',
          isConnecting && 'opacity-70 cursor-wait'
        )}
        title={isActive ? 'End call' : 'Talk to AI Agent'}
      >
        {/* Animated rings when active */}
        {isActive && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-75" />
          </>
        )}

        {/* Outer glow */}
        <div
          className={cn(
            'absolute inset-0 rounded-full blur-sm transition-all duration-300',
            isActive
              ? 'bg-red-500 opacity-50'
              : 'bg-gradient-to-r from-red-500 via-orange-500 to-red-500 opacity-30'
          )}
        />

        {/* Inner orb */}
        <div
          className={cn(
            'relative w-8 h-8 rounded-full transition-all duration-300',
            isActive
              ? 'bg-gradient-to-br from-red-400 to-red-600'
              : 'bg-gradient-to-br from-gray-700 to-gray-900'
          )}
          style={{
            boxShadow: isActive
              ? 'inset 0 0 10px rgba(0,0,0,0.3), 0 0 10px rgba(239,68,68,0.5)'
              : 'inset 0 0 8px rgba(0,0,0,0.4), 0 0 5px rgba(0,0,0,0.2)',
          }}
        >
          {/* Rotating gradient for active state */}
          {isActive && (
            <div
              className="absolute inset-0.5 rounded-full opacity-40"
              style={{
                background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.3), transparent)',
                animation: 'spin 2s linear infinite',
              }}
            />
          )}

          {/* Icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            {isConnecting ? (
              <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : isActive ? (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </div>

          {/* Highlight */}
          <div className="absolute top-1 left-1.5 w-2 h-1.5 rounded-full bg-white opacity-30 blur-[1px]" />
        </div>
      </button>

      {/* Animation keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
