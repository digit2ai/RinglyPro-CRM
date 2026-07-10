import { XMarkIcon } from '@heroicons/react/24/outline'
import type { PillarDetailRow } from '../../features/scoring/api/pillarDetails'

interface PillarDetailModalProps {
  icon: string
  label: string
  score: number
  isWeakest: boolean
  barColor: string
  details: PillarDetailRow[]
  onClose: () => void
}

export function PillarDetailModal({ icon, label, score, isWeakest, barColor, details, onClose }: PillarDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-0 pb-0 sm:items-center sm:px-4 sm:pb-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-(--primary-300) px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{icon}</span>
            <div>
              <div className="text-base font-bold text-white">{label}</div>
              {isWeakest && (
                <div className="text-xs font-semibold text-red-400">Tu mayor oportunidad</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        {/* Score bar */}
        <div className="bg-(--primary-300) px-5 pb-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-medium text-white/50">puntaje obtenido</span>
            <span className="font-mono text-2xl font-extrabold text-white">{score}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${score}%`, background: barColor }}
            />
          </div>
        </div>

        {/* Detail rows */}
        <div className="divide-y divide-(--gray-100) px-5 py-2">
          <div className="py-2 text-xs font-bold uppercase tracking-widest text-(--gray-300)">
            Datos usados para el cálculo
          </div>
          {details.map(row => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm text-(--gray-400)">{row.label}</span>
              <span className="text-sm font-semibold text-(--dark) text-right">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Bottom safe area */}
        <div className="h-safe-area-inset-bottom" />
      </div>
    </div>
  )
}
