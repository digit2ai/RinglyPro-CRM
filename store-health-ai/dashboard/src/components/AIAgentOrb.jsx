import React from 'react';

/**
 * AI Agent Orb Component
 * Animated pulsing orb similar to ElevenLabs that links to the AI agent
 */
export function AIAgentOrb({ agentUrl }) {
  const handleClick = () => {
    window.open(agentUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      className="group relative flex items-center gap-3 px-4 py-2 rounded-full bg-gray-900 hover:bg-gray-800 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl"
      title="Talk to AI Agent"
    >
      {/* Animated Orb Container */}
      <div className="relative w-10 h-10">
        {/* Outer glow ring */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-red-500 opacity-60 blur-md animate-pulse" />

        {/* Middle rotating gradient */}
        <div
          className="absolute inset-0.5 rounded-full opacity-80"
          style={{
            background: 'conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #f97316, #ef4444)',
            animation: 'spin 3s linear infinite',
          }}
        />

        {/* Inner orb with gradient */}
        <div
          className="absolute inset-1 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #ff6b6b, #ee5a24, #c0392b)',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3), 0 0 15px rgba(239,68,68,0.5)',
          }}
        />

        {/* Highlight/reflection */}
        <div
          className="absolute top-1.5 left-2 w-3 h-2 rounded-full bg-white opacity-40 blur-[1px]"
        />

        {/* Animated pulse rings */}
        <div className="absolute inset-0 rounded-full border-2 border-red-400 opacity-0 animate-ping" />
        <div
          className="absolute inset-0 rounded-full border border-orange-400 opacity-0"
          style={{ animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.5s' }}
        />
      </div>

      {/* Text Label */}
      <span className="text-white font-medium text-sm group-hover:text-red-300 transition-colors">
        Call AI Agent
      </span>

      {/* Microphone icon */}
      <svg
        className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>

      {/* Custom keyframes via style tag */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </button>
  );
}
