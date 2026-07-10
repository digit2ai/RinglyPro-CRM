import { useEffect, useState } from 'react'
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface Props {
  message: string
  description?: string
  onDismiss: () => void
  duration?: number
}

export function Toast({ message, description, onDismiss, duration = 5000 }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const enterFrame = requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, duration)

    return () => {
      cancelAnimationFrame(enterFrame)
      clearTimeout(timer)
    }
  }, [duration, onDismiss])

  return (
    <div
      className={[
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-lg ring-1 ring-black/5 transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      ].join(' ')}
    >
      <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-green-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-(--dark)">{message}</p>
        {description !== undefined && (
          <p className="mt-0.5 text-sm text-(--gray-400)">{description}</p>
        )}
      </div>
      <button
        onClick={() => {
          setVisible(false)
          setTimeout(onDismiss, 300)
        }}
        aria-label="Cerrar"
        className="-mr-1 mt-0.5 rounded-md p-0.5 text-(--gray-300) transition-colors hover:text-(--gray-500)"
      >
        <XMarkIcon className="size-4" />
      </button>
    </div>
  )
}
