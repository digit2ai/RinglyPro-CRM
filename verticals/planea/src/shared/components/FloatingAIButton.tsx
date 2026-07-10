import './FloatingAIButton.css'

interface FloatingAIButtonProps {
  onClick: () => void
  label?: string
}

export function FloatingAIButton({ onClick, label = 'Abrir IA' }: FloatingAIButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed right-5 bottom-20 z-50 size-14 rounded-full shadow-lg transition-[filter] hover:brightness-110 active:brightness-90"
    >
      <svg
        viewBox="0 0 56 56"
        fill="none"
        aria-hidden="true"
        className="absolute inset-0 animate-[fab-dash_10s_linear_infinite]"
      >
        <defs>
          <linearGradient id="fab-grad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--secondary2-100)" />
            <stop offset="100%" stopColor="var(--secondary2-400)" />
          </linearGradient>
        </defs>
        <circle
          cx="28"
          cy="28"
          r="26"
          stroke="url(#fab-grad)"
          strokeWidth="2.5"
          strokeDasharray="8 8"
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-1 overflow-hidden rounded-full">
        <img src="/images/guacamayo.png" alt="" aria-hidden="true" className="size-full object-cover" />
      </span>
    </button>
  )
}
