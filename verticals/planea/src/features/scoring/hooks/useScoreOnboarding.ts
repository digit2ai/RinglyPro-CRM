import { useState, useRef, useEffect } from 'react'
import type { Answers, Screen, ScoreResult } from '../components/PlaneaScoreOnboarding.types'
import { computeScore, RING_C, CALC_LABELS } from '../api/scoreOnboarding.calculations'
import { useScoreStore } from '../stores/scoreStore'

export interface ScoreOnboardingState {
  answers: Answers
  currentStep: number
  screen: Screen
  transDir: 'fwd' | 'back'
  exitingStep: number | null
  mayaVisible: Record<number, boolean>
  mayaMsgs: Record<number, string>
  calcItems: boolean[]
  result: ScoreResult | null
  displayScore: number
  ringOffset: number
  pillarShown: boolean[]
  pillarWidths: number[]
}

export interface ScoreOnboardingHandlers {
  handleOption: (step: number, val: string) => void
  handleBinary: (step: number, val: string) => void
  handleExtra: (key: string, val: string) => void
  goNext: (from: number) => void
  goBack: (from: number) => void
  stepCls: (step: number) => string
  startCalc: () => void
  retake: () => void
}

export function useScoreOnboarding(
  initialStep = 1,
  initialAnswers: Answers = {},
  onSave?: (answers: Answers, score: number | null) => void,
  onScoreComplete?: (result: ScoreResult, answers: Answers) => void,
  onStepChange?: () => void,
): ScoreOnboardingState & ScoreOnboardingHandlers {
  const [answers,      setAnswers]      = useState<Answers>(initialAnswers)
  const [currentStep,  setCurrentStep]  = useState(initialStep)
  const [skipDebt,     setSkipDebt]     = useState(initialAnswers.P4 === 'no')
  const [skipSavings,  setSkipSavings]  = useState(initialAnswers.P6 === 'no')
  const [screen,       setScreen]       = useState<Screen>('form')
  const [transDir,     setTransDir]     = useState<'fwd' | 'back'>('fwd')
  const [isTransiting, setIsTransiting] = useState(false)
  const [exitingStep,  setExitingStep]  = useState<number | null>(null)
  const [mayaVisible,  setMayaVisible]  = useState<Record<number, boolean>>({})
  const [mayaMsgs,     setMayaMsgs]     = useState<Record<number, string>>({})
  const [calcItems,    setCalcItems]    = useState([false, false, false, false, false])
  const [result,       setResult]       = useState<ScoreResult | null>(null)
  const [displayScore, setDisplayScore] = useState(0)
  const [ringOffset,   setRingOffset]   = useState(RING_C)
  const [pillarShown,  setPillarShown]  = useState([false, false, false, false])
  const [pillarWidths, setPillarWidths] = useState([0, 0, 0, 0])

  const skipDebtRef    = useRef(skipDebt)
  const skipSavingsRef = useRef(skipSavings)
  const setScore = useScoreStore(state => state.setScore)

  useEffect(() => { skipDebtRef.current    = skipDebt    }, [skipDebt])
  useEffect(() => { skipSavingsRef.current = skipSavings }, [skipSavings])

  function getSeq(): number[] {
    const s = [1, 2, 3, 4]
    if (skipDebtRef.current === false) {
      s.push(5)
      s.push(55)
    }
    s.push(6)
    if (skipSavingsRef.current === false) s.push(7)
    s.push(8, 9)
    return s
  }

  function handleOption(step: number, val: string) {
    setAnswers(prev => ({ ...prev, [`P${step}`]: val }))
    if (step === 7 && (val === 'D' || val === 'E')) {
      setMayaMsgs(prev    => ({ ...prev, 7: 'Eso te pone en el top 7% de Colombia. Serio. 🔥' }))
      setMayaVisible(prev => ({ ...prev, 7: true }))
    }
  }

  function handleExtra(key: string, val: string) {
    setAnswers(prev => ({ ...prev, [key]: val }))
  }

  function handleBinary(step: number, val: string) {
    setAnswers(prev => ({ ...prev, [`P${step}`]: val }))
    if (step === 4) {
      setSkipDebt(val === 'no')
      skipDebtRef.current = val === 'no'
      const msg = val === 'no'
        ? 'Sin deudas. Eso ya te pone por delante de la mayoría. Sigamos 💪'
        : 'Tranquilo, eso tiene solución. Vamos a entender bien la situación. 💪'
      setMayaMsgs(prev    => ({ ...prev, 4: msg }))
      setMayaVisible(prev => ({ ...prev, 4: true }))
    }
    if (step === 6) {
      setSkipSavings(val === 'no')
      skipSavingsRef.current = val === 'no'
      const msg = val === 'no'
        ? 'Tranquilo, para eso estamos aquí. Vamos a cambiar eso juntos. 🙌'
        : 'Perfecto. Vamos a ver qué tan sólido está ese colchón. 💰'
      setMayaMsgs(prev    => ({ ...prev, 6: msg }))
      setMayaVisible(prev => ({ ...prev, 6: true }))
    }
  }

  function goNext(from: number) {
    if (isTransiting) return
    const seq = getSeq()
    const i   = seq.indexOf(from)
    if (i < 0 || i === seq.length - 1) return
    onSave?.(answers, null)
    setIsTransiting(true)
    setExitingStep(from)
    setTransDir('fwd')
    setTimeout(() => {
      setExitingStep(null)
      setCurrentStep(seq[i + 1])
      setIsTransiting(false)
      requestAnimationFrame(() => onStepChange?.())
    }, 240)
  }

  function goBack(from: number) {
    if (isTransiting) return
    const seq = getSeq()
    const i   = seq.indexOf(from)
    if (i <= 0) return
    setMayaVisible(prev => ({ ...prev, [from]: false }))
    setIsTransiting(true)
    setExitingStep(from)
    setTransDir('back')
    setTimeout(() => {
      setExitingStep(null)
      setCurrentStep(seq[i - 1])
      setIsTransiting(false)
      requestAnimationFrame(() => onStepChange?.())
    }, 240)
  }

  function stepCls(step: number): string {
    if (exitingStep === step) return 'onb-step exit-fwd'
    if (currentStep === step && screen === 'form') return `onb-step active${transDir === 'back' ? ' back' : ''}`
    return 'onb-step'
  }

  function startCalc() {
    const currentAnswers = answers
    const res = computeScore(currentAnswers)
    setCalcItems([false, false, false, false, false])
    setScreen('calculating')

    CALC_LABELS.forEach((_, i) => {
      setTimeout(() => {
        setCalcItems(prev => { const n = [...prev]; n[i] = true; return n })
      }, 450 + i * 520)
    })

    setTimeout(() => {
      setResult(res)
      setScore(res, currentAnswers)
      setScreen('results')
      onSave?.(currentAnswers, res.score)
      onScoreComplete?.(res, currentAnswers)

      const offset = RING_C - (res.score / 100) * RING_C
      setTimeout(() => setRingOffset(offset), 120)

      const dur = 1400
      const t0  = performance.now()
      const tick = (now: number) => {
        const p = Math.min((now - t0) / dur, 1)
        const e = 1 - Math.pow(1 - p, 3)
        setDisplayScore(Math.round(res.score * e))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)

      const scores = [res.p1, res.p2, res.p3, res.p4]
      setTimeout(() => {
        [0, 1, 2, 3].forEach(idx => {
          setTimeout(() => {
            setPillarShown(prev => { const n = [...prev]; n[idx] = true; return n })
            setTimeout(() => {
              setPillarWidths(prev => { const n = [...prev]; n[idx] = scores[idx]; return n })
            }, 60)
          }, idx * 160)
        })
      }, 700)
    }, 3400)
  }

  function retake() {
    setAnswers(initialAnswers)
    setSkipDebt(initialAnswers.P4 === 'no')
    setSkipSavings(initialAnswers.P6 === 'no')
    skipDebtRef.current    = initialAnswers.P4 === 'no'
    skipSavingsRef.current = initialAnswers.P6 === 'no'
    setMayaVisible({})
    setMayaMsgs({})
    setScreen('form')
    setCurrentStep(initialStep)
    setTransDir('back')
    setDisplayScore(0)
    setRingOffset(RING_C)
    setPillarShown([false, false, false, false])
    setPillarWidths([0, 0, 0, 0])
    setCalcItems([false, false, false, false, false])
    setResult(null)
  }

  return {
    answers,
    currentStep,
    screen,
    transDir,
    exitingStep,
    mayaVisible,
    mayaMsgs,
    calcItems,
    result,
    displayScore,
    ringOffset,
    pillarShown,
    pillarWidths,
    handleOption,
    handleBinary,
    handleExtra,
    goNext,
    goBack,
    stepCls,
    startCalc,
    retake,
  }
}
