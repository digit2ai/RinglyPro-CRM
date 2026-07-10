import { useState, useRef } from 'react'
import { flushSync } from 'react-dom'
import { PlaneaScoreOnboarding } from './PlaneaScoreOnboarding'
import { EmailCapture } from './EmailCapture'
import { ScoreResults } from './ScoreResults'
import { useScoreStore } from '../stores/scoreStore'
import { useOnboardingUserDataStore } from '../stores/onboardingUserDataStore'
import { useAuth } from '../../auth/hooks/AuthProvider'
import type { Answers, ScoreResult } from './PlaneaScoreOnboarding.types'

type Step = 'score' | 'email' | 'results'

export function ScoreSection() {
  const [step, setStep]       = useState<Step>('score')
  const [forceNew, setForceNew] = useState(false)
  const [appLoading, setAppLoading] = useState(true)
  const sectionRef      = useRef<HTMLElement>(null)
  const clearScore      = useScoreStore(state => state.clearScore)
  const setEmail        = useOnboardingUserDataStore(state => state.setEmail)
  const clearUser       = useOnboardingUserDataStore(state => state.clearUser)
  const { user, loading: authLoading } = useAuth()

  function scrollToTop() {
    const el = sectionRef.current
    if (el === null) return
    const scrollContainer = el.closest('main') ?? el.parentElement
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function transition(update: () => void) {
    if ('startViewTransition' in document) {
      const t = document.startViewTransition(() => {
        requestAnimationFrame(() => { flushSync(update) })
      })
      t.ready.catch(() => {})
      t.finished.then(() => requestAnimationFrame(() => scrollToTop())).catch(() => {})
    } else {
      update()
      requestAnimationFrame(() => scrollToTop())
    }
  }

  function handleLoadingChange(loading: boolean) {
    if (!loading) setAppLoading(false)
  }

  function handleScoreComplete(_result: ScoreResult, _answers: Answers) {
    if (user !== null) {
      transition(() => setStep('results'))
    } else {
      transition(() => setStep('email'))
    }
  }

  function handleEmailSubmit(email: string) {
    setEmail(email)
    transition(() => setStep('results'))
  }

  function handleRetake() {
    clearScore()
    clearUser()
    setForceNew(true)
    transition(() => setStep('score'))
  }

  return (
    <section ref={sectionRef} className="relative pt-8 pb-24 2xl:pt-10 2xl:pb-32 px-6 2xl:px-14 bg-(--primary-300)">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-20">
          <h2 className="text-4xl 2xl:text-7xl font-bold leading-[1.1] text-white tracking-tight">
            Puntaje Planea
          </h2>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col 2xl:flex-row gap-8 2xl:gap-10 items-stretch">
          {/* Form (left on desktop, first on mobile) */}
          <div className="2xl:w-1/2 order-1 flex flex-col">
            <div style={{ viewTransitionName: 'score-step-form' }}>
              {appLoading && (
                <ScoreResults onRetake={handleRetake} />
              )}
              {step === 'score' && (
                <div style={appLoading ? { display: 'none' } : undefined}>
                  <PlaneaScoreOnboarding forceNew={forceNew} onScoreComplete={handleScoreComplete} onStepChange={scrollToTop} onLoadingChange={handleLoadingChange} />
                </div>
              )}
              {!appLoading && step === 'email' && (
                <EmailCapture onSubmit={handleEmailSubmit} />
              )}
              {!appLoading && step === 'results' && (
                <ScoreResults onRetake={handleRetake} />
              )}
            </div>
          </div>

          {/* Pillars + Ranges (right on desktop, second on mobile) */}
          <div className="2xl:w-1/2 order-2">
            <div className="space-y-6 max-w-155 mx-auto 2xl:max-w-none">
              {/* Los 4 pilares */}
              <div
                className="rounded-2xl p-6 border border-white/10"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)'
                }}
              >
                <h4 className="text-2xl font-bold text-white/90 uppercase tracking-wide mb-4">
                  Los 4 pilares
                </h4>
                <div className="space-y-3">
                  {[
                    {
                      emoji: '🛡️',
                      label: 'Fondo de emergencia',
                      desc: '¿Cuántos meses sobrevives sin ingresos?',
                      pct: '35%'
                    },
                    {
                      emoji: '💸',
                      label: 'Flujo de caja',
                      desc: '¿Te queda dinero al final del mes?',
                      pct: '25%'
                    },
                    {
                      emoji: '💳',
                      label: 'Salud de deuda',
                      desc: '¿Cuánto de tus ingresos se va en cuotas?',
                      pct: '25%'
                    },
                    {
                      emoji: '⚖️',
                      label: 'Estabilidad',
                      desc: 'Ingreso fijo o variable. Personas a cargo.',
                      pct: '15%'
                    }
                  ].map(({ emoji, label, desc, pct }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-base 2xl:text-lg">{emoji}</span>
                      <div className="flex-1">
                        <div className="text-base 2xl:text-lg font-bold text-white">
                          {label}
                        </div>
                        <div className="text-base 2xl:text-lg text-white/50">
                          {desc}
                        </div>
                      </div>
                      <span className="text-base 2xl:text-lg font-bold text-white">
                        {pct}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Los 5 rangos */}
              <div
                className="rounded-2xl p-6 border border-white/10"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)'
                }}
              >
                <h4 className="text-2xl font-bold text-white/90 uppercase tracking-wide mb-4">
                  Los 5 rangos del puntaje
                </h4>
                <div className="space-y-3">
                  {[
                    { color: '#c0392b', label: '0-30 · Punto de partida' },
                    { color: '#b8860b', label: '31-50 · Construyendo' },
                    { color: '#46516E', label: '51-70 · En camino' },
                    { color: '#5e9520', label: '71-85 · Sólido' },
                    { color: '#4B7F52', label: '86-100 · Planeado' }
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div
                        className="w-10 h-2 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <div className="flex-1">
                        <div className="text-base 2xl:text-lg font-bold text-white">
                          {label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

