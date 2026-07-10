import { useState } from 'react'

interface EmailCaptureProps {
  onSubmit: (email: string) => void
}

export function EmailCapture({ onSubmit }: EmailCaptureProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  function validate(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate(email)) {
      setError('Ingresa un correo válido')
      return
    }
    setError('')
    onSubmit(email.trim().toLowerCase())
  }

  return (
    <div className="planea-onboarding-widget">
      <div className="onb-form-card">
        <div className="onb-step active">
          <div className="text-base 2xl:text-lg font-semibold text-gray-400 mb-2">✉️ Antes de empezar</div>
          <h3 className="text-2xl font-bold text-gray-900 leading-snug mb-2">Descubre tu Puntaje</h3>
          <p className="text-base 2xl:text-lg text-gray-500">
            Diagnóstico inmediato. Sin pagos. Pilares evaluados con la metodología CFP Board.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="tucorreo@ejemplo.com"
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-(--primary-300) placeholder-gray-400"
              />
              {error && (
                <p className="mt-2 text-sm text-red-500">{error}</p>
              )}
            </div>

            <div className="onb-step-nav onb-solo">
              <button
                type="submit"
                className="onb-btn-next"
                disabled={email.trim() === ''}
              >
                Continuar
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={17} height={17}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
