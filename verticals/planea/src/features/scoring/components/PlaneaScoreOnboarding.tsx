import { useState, useEffect } from 'react'
import { SparklesIcon } from '@heroicons/react/24/solid'
import './PlaneaScoreOnboarding.css'
import type { Answers, ScoreResult } from './PlaneaScoreOnboarding.types'
import { useScoreOnboarding } from '../hooks/useScoreOnboarding'
import {
  CALC_LABELS,
  isFormComplete, getResumeStep, computeScore,
  RING_R, RING_C,
} from '../api/scoreOnboarding.calculations'
import { loadScoreProgress, saveScoreProgress } from '../api/scoreOnboarding.service'
import { useAuth } from '../../auth/hooks/AuthProvider'
import { useScoreStore } from '../stores/scoreStore'

// ── ICONS ────────────────────────────────────────────────────────────────────

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={17} height={17}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={15} height={15}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

// ── SUB-COMPONENTS ───────────────────────────────────────────────────────────

interface OptionBtnProps {
  step: number
  val: string
  selected: boolean
  emoji?: string
  label: string
  onSelect: (step: number, val: string) => void
}

function OptionBtn({ step, val, selected, emoji, label, onSelect }: OptionBtnProps) {
  return (
    <button
      className={`onb-option-btn${selected ? ' selected' : ''}`}
      onClick={() => onSelect(step, val)}
    >
      <div className="onb-opt-check" />
      {emoji !== undefined && <span className="onb-opt-emoji">{emoji}</span>}
      <span className="onb-opt-label">{label}</span>
    </button>
  )
}

interface BinaryBtnProps {
  step: number
  val: 'yes' | 'no'
  icon: string
  label: string
  selected: string | undefined
  onSelect: (step: number, val: string) => void
}

function BinaryBtn({ step, val, icon, label, selected, onSelect }: BinaryBtnProps) {
  const selClass = selected === 'yes' && val === 'yes'
    ? ' sel-yes'
    : selected === 'no' && val === 'no'
      ? ' sel-no'
      : ''
  return (
    <button
      className={`onb-binary-btn${selClass}`}
      onClick={() => onSelect(step, val)}
    >
      <span className="onb-binary-icon">{icon}</span>
      {label}
    </button>
  )
}

interface MayaMomentProps {
  visible: boolean
  message: string
}

function MayaMoment({ visible, message }: MayaMomentProps) {
  return (
    <div className={`onb-maya-moment${visible ? ' show' : ''}`}>
      <div className="onb-maya-avatar">🦜</div>
      <p className="onb-maya-text">{message}</p>
    </div>
  )
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────

interface KeyOptionBtnProps {
  keyName: string
  val: string
  selected: boolean
  emoji?: string
  label: string
  onSelect: (key: string, val: string) => void
}

function KeyOptionBtn({ keyName, val, selected, emoji, label, onSelect }: KeyOptionBtnProps) {
  return (
    <button
      className={`onb-option-btn${selected ? ' selected' : ''}`}
      onClick={() => onSelect(keyName, val)}
    >
      <div className="onb-opt-check" />
      {emoji !== undefined && <span className="onb-opt-emoji">{emoji}</span>}
      <span className="onb-opt-label">{label}</span>
    </button>
  )
}

interface ExactInputProps {
  step: number
  exactKey: string
  rangeVal: string | undefined
  exactVal: string | undefined
  placeholder: string
  onSelectRange: (step: number, val: string) => void
  onExact: (key: string, val: string) => void
}

function ExactInput({ step, exactKey, rangeVal, exactVal, placeholder, onSelectRange, onExact }: ExactInputProps) {
  const isActive = rangeVal === 'X'

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    onExact(exactKey, raw)
  }

  function formatDisplay(raw: string | undefined): string {
    if (!raw) return ''
    return parseInt(raw, 10).toLocaleString('es-CO')
  }

  return (
    <div className="mt-2">
      <button
        className={`onb-option-btn${isActive ? ' selected' : ''}`}
        onClick={() => onSelectRange(step, 'X')}
      >
        <div className="onb-opt-check" />
        <span className="onb-opt-emoji">✏️</span>
        <span className="onb-opt-label">Monto exacto</span>
      </button>
      {isActive && (
        <div className="relative mt-2">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold select-none">$</span>
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            inputMode="numeric"
            value={formatDisplay(exactVal)}
            onChange={handleChange}
            placeholder={placeholder}
            className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-(--primary-300) placeholder-gray-400"
          />
        </div>
      )}
    </div>
  )
}

type FormProps = {
  initialStep: number
  initialAnswers: Answers
  onSave: (answers: Answers, score: number | null) => void
  onScoreComplete?: (result: ScoreResult, answers: Answers) => void
  onStepChange?: () => void
}

function ScoreOnboardingForm({ initialStep, initialAnswers, onSave, onScoreComplete, onStepChange }: FormProps) {
  const {
    answers,
    screen,
    mayaVisible,
    mayaMsgs,
    calcItems,
    handleOption,
    handleBinary,
    handleExtra,
    goNext,
    goBack,
    stepCls,
    startCalc,
  } = useScoreOnboarding(initialStep, initialAnswers, onSave, onScoreComplete, onStepChange)

  const ans = answers

  return (
    <div className="planea-onboarding-widget">
      <div className="onb-form-card">

        {/* ── P1 — OBJETIVO FINANCIERO ────────────── */}
        <div className={stepCls(1)}>
          <div className="onb-q-tag">🎯 Para empezar</div>
          <h3 className="onb-q-text">¿Cuál es tu mayor objetivo financiero ahora mismo?</h3>
          <p className="onb-q-hint">Tu respuesta nos ayuda a orientarte mejor después del diagnóstico.</p>
          <div className="onb-options-list">
            {[
              { val: 'A', emoji: '🎯', label: 'Salir de deudas y respirar tranquilo' },
              { val: 'B', emoji: '🛡️', label: 'Tener un colchón para cualquier imprevisto' },
              { val: 'C', emoji: '🏠', label: 'Ahorrar para algo grande (casa, carro, viaje)' },
              { val: 'D', emoji: '💼', label: 'Tener más libertad, depender menos de un sueldo' },
              { val: 'E', emoji: '📈', label: 'Hacer crecer mi plata, que trabaje por mí' },
            ].map(o => (
              <OptionBtn key={o.val} step={1} val={o.val} emoji={o.emoji} label={o.label}
                selected={ans.P1 === o.val} onSelect={handleOption} />
            ))}
          </div>
          <div className="onb-step-nav onb-solo">
            <button className="onb-btn-next" disabled={ans.P1 === undefined} onClick={() => goNext(1)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P2 — INGRESOS ───────────────────────── */}
        <div className={stepCls(2)}>
          <div className="onb-q-tag">💰 Ingresos</div>
          <h3 className="onb-q-text">¿Cuánto son tus ingresos al mes?</h3>
          <p className="onb-q-hint">Suma todo: sueldo, freelance, rentas, lo que sea.</p>
          <div className="onb-options-list">
            {[
              { val: 'A', label: 'Menos de $1.500.000' },
              { val: 'B', label: 'Entre $1.500.000 y $3.000.000' },
              { val: 'C', label: 'Entre $3.000.000 y $5.000.000' },
              { val: 'D', label: 'Entre $5.000.000 y $8.000.000' },
              { val: 'E', label: 'Más de $8.000.000' },
            ].map(o => (
              <OptionBtn key={o.val} step={2} val={o.val} label={o.label}
                selected={ans.P2 === o.val} onSelect={handleOption} />
            ))}
            <ExactInput
              step={2} exactKey="P2_exact"
              rangeVal={ans.P2} exactVal={ans.P2_exact}
              placeholder="3.500.000"
              onSelectRange={handleOption} onExact={handleExtra}
            />
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(2)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-next" disabled={!ans.P2 || (ans.P2 === 'X' && !ans.P2_exact)} onClick={() => goNext(2)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P3 — GASTOS ─────────────────────────── */}
        <div className={stepCls(3)}>
          <div className="onb-q-tag">🧾 Gastos</div>
          <h3 className="onb-q-text">¿Cuánto gastas al mes en total?</h3>
          <p className="onb-q-hint">Arriendo, comida, transporte, entretenimiento, todo.</p>
          <div className="onb-options-list">
            {[
              { val: 'A', label: 'Menos de $1.500.000' },
              { val: 'B', label: 'Entre $1.500.000 y $2.500.000' },
              { val: 'C', label: 'Entre $2.500.000 y $4.000.000' },
              { val: 'D', label: 'Entre $4.000.000 y $6.500.000' },
              { val: 'E', label: 'Más de $6.500.000' },
            ].map(o => (
              <OptionBtn key={o.val} step={3} val={o.val} label={o.label}
                selected={ans.P3 === o.val} onSelect={handleOption} />
            ))}
            <ExactInput
              step={3} exactKey="P3_exact"
              rangeVal={ans.P3} exactVal={ans.P3_exact}
              placeholder="2.800.000"
              onSelectRange={handleOption} onExact={handleExtra}
            />
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(3)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-next" disabled={!ans.P3 || (ans.P3 === 'X' && !ans.P3_exact)} onClick={() => goNext(3)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P4 — DEUDAS (binaria) ───────────────── */}
        <div className={stepCls(4)}>
          <div className="onb-q-tag">⚡ Deudas</div>
          <h3 className="onb-q-text">¿Tienes deudas activas en este momento?</h3>
          <p className="onb-q-hint">Tarjeta, crédito, cuotas, lo que sea.</p>
          <MayaMoment visible={mayaVisible[4] === true} message={mayaMsgs[4] ?? ''} />
          <div className="onb-binary-options">
            <BinaryBtn step={4} val="yes" icon="✅" label="Sí, tengo deudas" selected={ans.P4} onSelect={handleBinary} />
            <BinaryBtn step={4} val="no"  icon="❌" label="No tengo deudas"  selected={ans.P4} onSelect={handleBinary} />
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(4)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-next" disabled={ans.P4 === undefined} onClick={() => goNext(4)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P5 — CUOTAS (condicional) ───────────── */}
        <div className={stepCls(5)}>
          <div className="onb-q-tag">📆 Cuotas</div>
          <h3 className="onb-q-text">¿Cuánto pagas al mes en cuotas sumando todas tus deudas?</h3>
          <p className="onb-q-hint">Todos los pagos fijos de deuda juntos.</p>
          <div className="onb-options-list">
            {[
              { val: 'A', label: 'Menos de $300.000' },
              { val: 'B', label: 'Entre $300.000 y $700.000' },
              { val: 'C', label: 'Entre $700.000 y $1.500.000' },
              { val: 'D', label: 'Entre $1.500.000 y $3.000.000' },
              { val: 'E', label: 'Más de $3.000.000' },
            ].map(o => (
              <OptionBtn key={o.val} step={5} val={o.val} label={o.label}
                selected={ans.P5 === o.val} onSelect={handleOption} />
            ))}
            <ExactInput
              step={5} exactKey="P5_exact"
              rangeVal={ans.P5} exactVal={ans.P5_exact}
              placeholder="800.000"
              onSelectRange={handleOption} onExact={handleExtra}
            />
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(5)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-next" disabled={!ans.P5 || (ans.P5 === 'X' && !ans.P5_exact)} onClick={() => goNext(5)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P5B — TASA DE DEUDA (condicional) ──── */}
        <div className={stepCls(55)}>
          <div className="onb-q-tag">📈 Tasa de deuda</div>
          <h3 className="onb-q-text">¿Sabes cuál es la tasa más alta de tus deudas?</h3>
          <p className="onb-q-hint">Si no sabes, asumiremos que es alta para protegerte.</p>
          <div className="onb-options-list">
            {[
              { val: 'unknown', label: 'No sé' },
              { val: 'lt10',    label: 'Menos del 10% EA' },
              { val: '10to20',  label: 'Entre 10% y 20% EA' },
              { val: 'gt20',    label: 'Más del 20% EA' },
            ].map(o => (
              <OptionBtn
                key={o.val}
                step={55}
                val={o.val}
                label={o.label}
                selected={ans.P5_rate === o.val}
                onSelect={(_, val) => handleExtra('P5_rate', val)}
              />
            ))}
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(55)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-next" disabled={ans.P5_rate === undefined} onClick={() => goNext(55)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P6 — AHORROS (binaria) ──────────────── */}
        <div className={stepCls(6)}>
          <div className="onb-q-tag">🏦 Ahorros</div>
          <h3 className="onb-q-text">¿Tienes plata guardada hoy que puedas usar si la necesitas?</h3>
          <p className="onb-q-hint">No importa cuánto, lo que sea que tengas guardado.</p>
          <MayaMoment visible={mayaVisible[6] === true} message={mayaMsgs[6] ?? ''} />
          <div className="onb-binary-options">
            <BinaryBtn step={6} val="yes" icon="✅" label="Sí, tengo algo guardado" selected={ans.P6} onSelect={handleBinary} />
            <BinaryBtn step={6} val="no"  icon="❌" label="No tengo nada guardado"  selected={ans.P6} onSelect={handleBinary} />
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(6)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-next" disabled={ans.P6 === undefined} onClick={() => goNext(6)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P7 — COBERTURA (condicional) ────────── */}
        <div className={stepCls(7)}>
          <div className="onb-q-tag">⏳ Fondo de emergencia</div>
          <h3 className="onb-q-text">Si mañana dejaras de recibir ingresos, ¿cuánto tiempo aguantas con lo que tienes guardado?</h3>
          <p className="onb-q-hint">Con lo que tienes guardado hoy.</p>
          <MayaMoment visible={mayaVisible[7] === true} message={mayaMsgs[7] ?? ''} />
          <div className="onb-options-list">
            {[
              { val: 'A', label: 'Menos de 1 mes' },
              { val: 'B', label: 'Entre 1 y 3 meses' },
              { val: 'C', label: 'Entre 3 y 6 meses' },
              { val: 'D', label: 'Entre 6 meses y 1 año' },
              { val: 'E', label: 'Más de 1 año' },
            ].map(o => (
              <OptionBtn key={o.val} step={7} val={o.val} label={o.label}
                selected={ans.P7 === o.val} onSelect={handleOption} />
            ))}
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(7)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-next" disabled={ans.P7 === undefined} onClick={() => goNext(7)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P8 — ESTABILIDAD ────────────────────── */}
        <div className={stepCls(8)}>
          <div className="onb-q-tag">📊 Estabilidad</div>
          <h3 className="onb-q-text">¿Tu ingreso es más o menos el mismo cada mes o cambia?</h3>
          <p className="onb-q-hint">Piensa en los últimos 6 meses.</p>
          <div className="onb-options-list">
            {[
              { val: 'A', emoji: '🟢', label: 'Siempre me cae lo mismo, es fijo' },
              { val: 'B', emoji: '🟡', label: 'Varía un poco pero más o menos sé cuánto es' },
              { val: 'C', emoji: '🔴', label: 'Cambia bastante, nunca sé exactamente cuánto va a ser' },
            ].map(o => (
              <OptionBtn key={o.val} step={8} val={o.val} emoji={o.emoji} label={o.label}
                selected={ans.P8 === o.val} onSelect={handleOption} />
            ))}
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(8)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-next" disabled={ans.P8 === undefined} onClick={() => goNext(8)}>
              Continuar <ChevronRight />
            </button>
          </div>
        </div>

        {/* ── P9 — DEPENDIENTES ───────────────────── */}
        <div className={stepCls(9)}>
          <div className="onb-q-tag">👨‍👩‍👧 Dependientes</div>
          <h3 className="onb-q-text">¿Cuántas personas dependen económicamente de ti?</h3>
          <p className="onb-q-hint">Hijos, papás, pareja sin ingreso, lo que sea.</p>
          <div className="onb-options-list">
            {[
              { val: 'A', label: 'Nadie depende de mí' },
              { val: 'B', label: '1 o 2 personas' },
              { val: 'C', label: '3 o más personas' },
            ].map(o => (
              <OptionBtn key={o.val} step={9} val={o.val} label={o.label}
                selected={ans.P9 === o.val} onSelect={handleOption} />
            ))}
          </div>
          <div className="onb-step-nav">
            <button className="onb-btn-back" onClick={() => goBack(9)}><ChevronLeft /> Volver</button>
            <button className="onb-btn-calculate" disabled={ans.P9 === undefined} onClick={startCalc}>
              <SparklesIcon width={16} height={16} />
              Calcular puntaje
            </button>
          </div>
        </div>

        {/* ── CALCULATING SCREEN ──────────────────── */}
        <div className={`onb-calculating-screen${screen === 'calculating' ? ' show' : ''}`}>
          <div className="onb-calc-spinner" />
          <div className="onb-calc-title">Calculando tu puntaje Planea</div>
          <div className="onb-calc-sub">Analizando tus 4 pilares financieros…</div>
          <div className="onb-calc-steps">
            {CALC_LABELS.map((label, i) => (
              <div key={i} className={`onb-calc-item${calcItems[i] ? ' done' : ''}`}>
                <div className="onb-cdot" />
                {label}
              </div>
            ))}
          </div>
        </div>


      </div>
    </div>
  )
}

interface PlaneaScoreOnboardingProps {
  forceNew?: boolean
  onScoreComplete?: (result: ScoreResult, answers: Answers) => void
  onStepChange?: () => void
  onLoadingChange?: (loading: boolean) => void
}

export function PlaneaScoreOnboarding({ forceNew = false, onScoreComplete, onStepChange, onLoadingChange }: PlaneaScoreOnboardingProps) {
  const { user, loading: authLoading } = useAuth()
  const setScore = useScoreStore(state => state.setScore)
  const [loading,       setLoading]       = useState(true)
  const [resumeStep,    setResumeStep]    = useState(1)
  const [resumeAnswers, setResumeAnswers] = useState<Answers>({})

  useEffect(() => {
    if (authLoading) return
    if (user === null || forceNew) { setLoading(false); onLoadingChange?.(false); return }
    loadScoreProgress(user.id)
      .then(saved => {
        if (saved !== null && isFormComplete(saved)) {
          const result = computeScore(saved)
          setScore(result, saved)
          if (user !== null) void saveScoreProgress(user.id, saved, result.score)
          onScoreComplete?.(result, saved)
        } else if (saved !== null) {
          setResumeAnswers(saved)
          setResumeStep(getResumeStep(saved))
        }
      })
      .catch(() => {})
      .finally(() => { setLoading(false); onLoadingChange?.(false) })
  }, [user?.id, authLoading])

  if (loading) return null

  function handleSave(answers: Answers, score: number | null) {
    if (user === null) return
    void saveScoreProgress(user.id, answers, score)
  }

  return <ScoreOnboardingForm initialStep={resumeStep} initialAnswers={resumeAnswers} onSave={handleSave} onScoreComplete={onScoreComplete} onStepChange={onStepChange} />
}
