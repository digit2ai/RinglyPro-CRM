import type { Answers, ScoreResult, ScoreLabel, PillarConfig, Recommendation, ScenarioKey } from '../components/PlaneaScoreOnboarding.types'

const INC_MAP: Record<string, number> = { A: 1_200_000, B: 2_250_000, C: 4_000_000, D: 6_500_000, E: 9_000_000 }
const EXP_MAP: Record<string, number> = { A: 1_200_000, B: 2_000_000, C: 3_250_000, D: 5_250_000, E: 8_000_000 }
const DBT_MAP: Record<string, number> = { A: 200_000, B: 500_000, C: 1_100_000, D: 2_250_000, E: 4_000_000 }
const COV_MAP: Record<string, number> = { A: 20, B: 50, C: 85, D: 92, E: 100 }
const STB_MAP: Record<string, number> = { A: 100, B: 65, C: 25 }
const DEP_MAP: Record<string, number> = { A: 100, B: 65, C: 30 }

function exactOr(exactKey: string, fallbackMap: Record<string, number>, rangeVal: string | undefined, answers: Answers, defaultVal: number): number {
  if (rangeVal === 'X') return Math.max(0, parseInt(answers[exactKey] ?? '0', 10) || defaultVal)
  return fallbackMap[rangeVal ?? ''] ?? defaultVal
}

export function computeScore(answers: Answers): ScoreResult {
  const inc = exactOr('P2_exact', INC_MAP, answers.P2, answers, 4000000)
  const exp = exactOr('P3_exact', EXP_MAP, answers.P3, answers, 3200000)

  // Pilar 1 — Fondo de Emergencia (35%)
  const p1 = answers.P6 === 'no' ? 0 : (COV_MAP[answers.P7] ?? 50)

  // Pilar 2 — Flujo de Caja (25%)
  const rf = exp / inc
  const p2 = rf < 0.50 ? 100 : rf < 0.70 ? 85 : rf < 0.85 ? 65 : rf <= 1.0 ? 35 : 10

  // Pilar 3 — Salud de Deudas (25%)
  let p3: number
  if (answers.P4 === 'no') {
    p3 = 100
  } else {
    const dp = exactOr('P5_exact', DBT_MAP, answers.P5, answers, 500000)
    const rd = dp / inc
    p3 = rd < 0.15 ? 85 : rd < 0.30 ? 65 : rd < 0.40 ? 35 : 10
  }

  // Pilar 4 — Estabilidad (15%)
  const stab = STB_MAP[answers.P8] ?? 65
  const dep  = DEP_MAP[answers.P9] ?? 65
  const p4   = Math.round(stab * 0.60 + dep * 0.40)

  const score = Math.round(p1 * 0.35 + p2 * 0.25 + p3 * 0.25 + p4 * 0.15)
  return { score, p1, p2, p3, p4 }
}

export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 86) return { name: 'Planeado',        color: '#4B7F52', desc: 'El nivel más alto. Mantenerlo es el reto.' }
  if (score >= 71) return { name: 'Sólido',          color: '#5e9520', desc: 'Estás donde el 20% de colombianos quisiera estar.' }
  if (score >= 51) return { name: 'En camino',       color: '#46516E', desc: 'Tienes bases sólidas. Ahora es acelerar.' }
  if (score >= 31) return { name: 'Construyendo',    color: '#b8860b', desc: 'Estás en movimiento. Eso ya es más que la mayoría.' }
  return              { name: 'Punto de partida', color: '#c0392b', desc: 'El primer paso es saber dónde estás. Ya lo diste.' }
}

export const PILLARS: PillarConfig[] = [
  { icon: '🛡️', name: 'Fondo de Emergencia', weight: '35%', bg: 'rgba(27,74,33,.15)',  color: 'var(--secondary2-300)', delay: '0.5s' },
  { icon: '💸', name: 'Flujo de Caja',        weight: '25%', bg: 'rgba(60,96,99,.15)',  color: 'var(--primary-200)',    delay: '0.7s' },
  { icon: '💳', name: 'Salud de Deudas',      weight: '25%', bg: 'rgba(70,81,110,.15)', color: 'var(--secondary1-200)', delay: '0.9s' },
  { icon: '⚖️', name: 'Estabilidad',          weight: '15%', bg: 'rgba(75,127,82,.15)', color: 'var(--secondary2-100)', delay: '1.1s' },
]

export const CALC_LABELS = [
  'Evaluando fondo de emergencia',
  'Midiendo flujo de caja',
  'Analizando salud de deudas',
  'Calculando estabilidad',
  'Construyendo tu perfil financiero',
]

export const RING_R = 63
export const RING_C = 2 * Math.PI * RING_R

// ── ANSWER SERIALIZATION ──────────────────────────────────────────────────────
// answers are stored as a positional flat array following the step sequence:
// [P1, P2, P3, P4, (P5 if debt), P6, (P7 if savings), P8, P9, P10, P11, ...P12_keys]

export function answersToArray(ans: Answers): string[] {
  const arr: string[] = []

  const push = (key: string) => {
    const val = ans[key]
    if (val !== undefined) arr.push(val)
  }

  push('P1')
  push('P2')
  push('P3')
  push('P4')
  if (ans.P4 === 'yes') push('P5')
  push('P6')
  if (ans.P6 === 'yes') push('P7')
  push('P8')
  push('P9')

  return arr
}

export function arrayToAnswers(arr: string[]): Answers {
  let i = 0
  const ans: Answers = {}
  const get = () => arr[i++]

  if (i < arr.length) ans.P1 = get()
  if (i < arr.length) ans.P2 = get()
  if (i < arr.length) ans.P3 = get()
  if (i < arr.length) ans.P4 = get()
  if (ans.P4 === 'yes' && i < arr.length) ans.P5 = get()
  if (i < arr.length) ans.P6 = get()
  if (ans.P6 === 'yes' && i < arr.length) ans.P7 = get()
  if (i < arr.length) ans.P8 = get()
  if (i < arr.length) ans.P9 = get()

  return ans
}

export function isGoalDetailComplete(ans: Answers): boolean {
  const goal = ans.P1
  if (goal === 'A') return ans.P12_count !== undefined && ans.P12_status !== undefined && ans.P12_rate !== undefined
  if (goal === 'B') return ans.P12_coverage !== undefined && ans.P12_storage !== undefined
  if (goal === 'C') return ans.P12_goal_type !== undefined && ans.P12_amount !== undefined && ans.P12_timeframe !== undefined
  if (goal === 'D') return ans.P12_freedom !== undefined
  if (goal === 'E') return ans.P12_risk !== undefined
  return false
}

export function isFormComplete(ans: Answers): boolean {
  if (ans.P1 === undefined || ans.P2 === undefined || ans.P3 === undefined || ans.P4 === undefined) return false
  if (ans.P4 === 'yes' && ans.P5 === undefined) return false
  if (ans.P4 === 'yes' && ans.P5_rate === undefined) return false
  if (ans.P6 === undefined) return false
  if (ans.P6 === 'yes' && ans.P7 === undefined) return false
  if (ans.P8 === undefined || ans.P9 === undefined) return false
  return true
}

// ── DEBT CLASSIFICATION ─────────────────────────────────────────────────────

type DebtClass = 'none' | 'expensive' | 'moderate' | 'good' | 'unknown'

function getDebtRateFromAnswers(answers: Answers): number | null {
  // P5_rate — current 4-tier options
  if (answers.P5_rate === 'lt10')   return 9
  if (answers.P5_rate === '10to20') return 15
  if (answers.P5_rate === 'gt20')   return 30
  if (answers.P5_rate === 'unknown') return null
  // P5_rate — legacy 3-tier options (backward compat for existing stored answers)
  if (answers.P5_rate === 'lt20')   return 15
  if (answers.P5_rate === '20to40') return 30
  if (answers.P5_rate === 'gt40')   return 41
  // P12_rate (legacy path: only filled when objective was 'A')
  if (answers.P12_rate === '2') return 15
  if (answers.P12_rate === '3') return 30
  if (answers.P12_rate === '4') return 41
  return null
}

function classifyDebt(answers: Answers): DebtClass {
  if (answers.P4 !== 'yes') return 'none'
  const rate = getDebtRateFromAnswers(answers)
  if (rate === null) return 'expensive' // conservative: unknown rate treated as expensive
  if (rate > 20) return 'expensive'
  if (rate >= 10) return 'moderate'
  return 'good'
}

// ── RECOMMENDATION LOGIC ─────────────────────────────────────────────────────
// Implements the Planea financial priority pyramid decision tree.
// Scenario keys map directly to the 9 scenarios in Planea_Logica_Recomendaciones.md.

const OBJETIVO_LABELS: Record<string, string> = {
  A: 'pagar tus deudas',
  B: 'construir tu fondo de emergencia',
  C: 'alcanzar tu meta',
  D: 'conseguir libertad financiera',
  E: 'empezar a invertir',
}

// Approximate months of emergency-fund coverage that each P7 option represents
const COV_MONTHS: Record<string, number> = {
  A: 0.5,
  B: 1.5,
  C: 3,
  D: 6,
  E: 12,
}

function formatCOP(n: number): string {
  const rounded = Math.round(n / 1000) * 1000
  if (rounded >= 1_000_000) {
    const m = rounded / 1_000_000
    return `$${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  return `$${rounded.toLocaleString('es-CO')}`
}

// ── HONESTY RULE ─────────────────────────────────────────────────────────────
// When the recommended scenario doesn't align with the user's declared objective,
// Maya acknowledges the goal first and explains why we need to tackle this step before.

const SCENARIO_IMMEDIATE_GOAL: Record<ScenarioKey, string> = {
  A: 'cerrar el hueco entre tus ingresos y gastos',
  B: 'construir un colchón mínimo de liquidez',
  C: 'eliminar tu deuda cara',
  D: 'atacar la deuda cara mientras construyes tu fondo',
  E: 'crear tu primer ahorro de emergencia',
  F: 'completar tu primer mes de fondo de emergencia',
  G: 'completar 3 meses de fondo de emergencia',
  H: 'manejar tu deuda moderada e invertir al mismo tiempo',
  I: 'invertir de forma sostenida',
}

function objectiveMatchesScenario(p1: string, scenario: ScenarioKey): boolean {
  if (p1 === 'A' && (scenario === 'C' || scenario === 'D')) return true
  if (p1 === 'B' && ['B', 'E', 'F', 'G'].includes(scenario)) return true
  if (p1 === 'C' && (scenario === 'H' || scenario === 'I')) return true
  if ((p1 === 'D' || p1 === 'E') && (scenario === 'H' || scenario === 'I')) return true
  return false
}

function applyHonestyRule(baseMessage: string, objetivo: string, scenario: ScenarioKey, p1: string): string {
  if (objectiveMatchesScenario(p1, scenario)) return baseMessage
  const immediateGoal = SCENARIO_IMMEDIATE_GOAL[scenario]
  return `Sé que quieres ${objetivo}. Vamos a llegar ahí. Pero primero necesitamos ${immediateGoal}. Cuando lo resolvamos, podremos avanzar hacia ${objetivo} con una base más estable. ${baseMessage}`
}

function getDebtRateLabelForMessage(answers: Answers): string {
  if (
    answers.P5_rate === 'gt20'   ||
    answers.P5_rate === '20to40' ||
    answers.P5_rate === 'gt40'
  ) return 'más del 20% EA'
  return 'una tasa alta'
}

export function getRecommendation(answers: Answers, name = '', scoreOverride?: ScoreResult): Recommendation {
  const inc      = exactOr('P2_exact', INC_MAP, answers.P2, answers, 4_000_000)
  const exp      = exactOr('P3_exact', EXP_MAP, answers.P3, answers, 3_200_000)
  const objetivo = OBJETIVO_LABELS[answers.P1 ?? ''] ?? 'mejorar tus finanzas'
  const nombre   = name || 'amigo/a'

  // ── Paso 1: Flujo de Caja ────────────────────────────────────────────────
  const margen = (inc - exp) / inc
  // When scoreOverride is provided, derive scenario gates from pillar scores so the
  // recommendation updates as the score improves (e.g. after completing a goal).
  const effectiveMargen = scoreOverride != null
    ? (scoreOverride.p2 <= 10 ? -0.10 : scoreOverride.p2 <= 35 ? 0.05 : 0.30)
    : margen

  if (effectiveMargen < 0) {
    const diferencia = Math.abs(inc - exp)
    const base = `${nombre}, antes de hablar de deudas o ahorros necesito decirte algo importante: cada mes estás gastando más de lo que ganas. Eso significa que tu deuda crece sola aunque no uses las tarjetas. Lo primero que vamos a hacer juntos es cerrar ese hueco. Esta semana revisemos en qué se va la plata.`
    return {
      scenario: 'A',
      goalText: `Reducir gastos en ${formatCOP(diferencia)} para no seguir endeudándote cada mes.`,
      mayaMessage: applyHonestyRule(base, objetivo, 'A', answers.P1 ?? ''),
      timeline: '30 días para identificar y reducir gastos variables.',
    }
  }

  if (effectiveMargen <= 0.10) {
    const meses = Math.ceil(500_000 / (inc - exp))
    const base = `Tu flujo de caja está muy ajustado. Tienes poco margen para maniobrar y eso es riesgoso — cualquier imprevisto puede desbalancear todo. Primero construyamos un colchón mínimo de $500.000. Con eso tienes un amortiguador. ¿Cuánto puedes separar esta quincena?`
    return {
      scenario: 'B',
      goalText: 'Ahorra $500.000 como colchón mínimo de emergencia antes de atacar cualquier otra cosa.',
      mayaMessage: applyHonestyRule(base, objetivo, 'B', answers.P1 ?? ''),
      timeline: `${meses} ${meses === 1 ? 'mes' : 'meses'} para lograrlo.`,
    }
  }

  // ── Paso 2: Deuda ────────────────────────────────────────────────────────
  const debtClass              = classifyDebt(answers)
  const tieneDeudaCara         = debtClass === 'expensive'
  const tieneDeudaModeradaOBuena = debtClass === 'moderate' || debtClass === 'good'
  const cuotas     = answers.P4 === 'yes'
    ? exactOr('P5_exact', DBT_MAP, answers.P5, answers, 500_000)
    : 0
  const dti        = cuotas / inc
  const effectiveDti = scoreOverride != null
    ? (scoreOverride.p3 >= 100 ? 0 : scoreOverride.p3 >= 85 ? 0.10 : scoreOverride.p3 >= 65 ? 0.22 : scoreOverride.p3 >= 35 ? 0.35 : 0.45)
    : dti
  const margenLibre = inc - exp - cuotas

  if (tieneDeudaCara && effectiveDti > 0.20) {
    const pagoExtra = Math.round(cuotas * 0.10)
    const tasaLabel = getDebtRateLabelForMessage(answers)
    return {
      scenario: 'C',
      goalText: `Paga ${formatCOP(pagoExtra)} adicionales al mes a tu deuda más cara.`,
      mayaMessage: `${nombre}, sé que tu objetivo es ${objetivo}. Y vamos a llegar ahí. Pero primero necesito ser honesta contigo: tienes deuda a ${tasaLabel}. Eso significa que cada mes esa deuda te cobra más de lo que cualquier inversión te podría dar. Lo más inteligente ahora mismo es eliminar esa deuda — cuando lo hagas, toda esa plata que ibas pagando en cuotas queda libre para ${objetivo}. ¿Arrancamos?`,
      timeline: 'Calculado según tu saldo y pago adicional.',
    }
  }

  if (tieneDeudaCara && effectiveDti <= 0.20) {
    const pagoExtraDeuda = Math.max(0, Math.round(margenLibre * 0.50))
    const aporteFondo    = Math.max(0, Math.round(margenLibre * 0.50))
    const base = `Tienes deuda cara pero está bajo control. Mi recomendación: divide tu margen en dos — la mitad para pagar más de la cuota de tu deuda cara, la otra mitad para empezar tu fondo de emergencia. Así avanzas en los dos frentes al mismo tiempo.`
    return {
      scenario: 'D',
      goalText: `Divide tu margen disponible: ${formatCOP(pagoExtraDeuda)} para deuda cara y ${formatCOP(aporteFondo)} para fondo de emergencia.`,
      mayaMessage: applyHonestyRule(base, objetivo, 'D', answers.P1 ?? ''),
      timeline: 'Calculado según tu margen disponible.',
    }
  }

  // ── Paso 3: Fondo de Emergencia ──────────────────────────────────────────
  const mesesCobertura = answers.P6 === 'no' ? 0 : (COV_MONTHS[answers.P7 ?? ''] ?? 0)
  const effectiveMeses = scoreOverride != null
    ? (scoreOverride.p1 === 0 ? 0 : scoreOverride.p1 <= 35 ? 0.5 : scoreOverride.p1 <= 65 ? 1.5 : scoreOverride.p1 <= 88 ? 3 : scoreOverride.p1 <= 96 ? 6 : 12)
    : mesesCobertura

  if (effectiveMeses === 0) {
    const aportesSemanal = Math.round(exp / 4)
    const base = `No tienes ningún ahorro guardado. Eso significa que cualquier imprevisto — una enfermedad, una reparación, perder el trabajo — puede llevarte a endeudarte. Lo primero es cambiar eso. Esta semana separa ${formatCOP(aportesSemanal)} antes de gastar. No es para invertir ni para pagar deuda — es tu escudo.`
    return {
      scenario: 'E',
      goalText: `Ahorra ${formatCOP(aportesSemanal)} esta semana — en 4 semanas tienes tu primer mes de respaldo.`,
      mayaMessage: applyHonestyRule(base, objetivo, 'E', answers.P1 ?? ''),
      timeline: '4 semanas para tu primer mes de fondo.',
    }
  }

  if (effectiveMeses < 1) {
    const ahorrosActuales = Math.round(exp * effectiveMeses)
    const faltante        = exp - ahorrosActuales
    const meses           = Math.ceil(faltante / Math.max(1, margenLibre))
    const base = `Tienes algo guardado pero no es suficiente para protegerte de un imprevisto real. Con menos de 1 mes de cobertura, cualquier gasto inesperado te puede obligar a endeudarte. Necesitas al menos 1 mes de gastos antes de pensar en otra cosa. Estás a ${formatCOP(faltante)} de lograrlo — ¿vamos?`
    return {
      scenario: 'F',
      goalText: `Llegar a 1 mes de fondo de emergencia — te faltan ${formatCOP(faltante)}.`,
      mayaMessage: applyHonestyRule(base, objetivo, 'F', answers.P1 ?? ''),
      timeline: `${meses} ${meses === 1 ? 'mes' : 'meses'} para lograrlo.`,
    }
  }

  if (effectiveMeses < 3) {
    const ahorrosActuales = Math.round(exp * effectiveMeses)
    const faltante        = 3 * exp - ahorrosActuales
    const meses           = Math.ceil(faltante / Math.max(1, margenLibre))
    const baseMayaMsg = `Ya tienes ${mesesCobertura} mes(es) de fondo de emergencia — eso es un gran avance. El estándar que recomienda el CFP Board para alguien en tu situación es llegar a 3 meses. Te faltan ${formatCOP(faltante)} para lograrlo. Con lo que tienes disponible cada mes puedes llegar en ${meses} ${meses === 1 ? 'mes' : 'meses'}.`
    if (debtClass === 'moderate') {
      const aporteFondoG    = Math.round(margenLibre * 0.60)
      const pagoExtraDeudaG = Math.round(margenLibre * 0.40)
      return {
        scenario: 'G',
        goalText: `Completar 3 meses de fondo — te faltan ${formatCOP(faltante)}. Divide tu margen: ${formatCOP(aporteFondoG)} al fondo y ${formatCOP(pagoExtraDeudaG)} a tu deuda moderada.`,
        mayaMessage: applyHonestyRule(baseMayaMsg, objetivo, 'G', answers.P1 ?? ''),
        timeline: `${meses} ${meses === 1 ? 'mes' : 'meses'} para completar el fondo.`,
      }
    }
    return {
      scenario: 'G',
      goalText: `Completar 3 meses de fondo de emergencia — te faltan ${formatCOP(faltante)}.`,
      mayaMessage: applyHonestyRule(baseMayaMsg, objetivo, 'G', answers.P1 ?? ''),
      timeline: `${meses} ${meses === 1 ? 'mes' : 'meses'} para completar el fondo.`,
    }
  }

  // ── Paso 4: Usuario Sólido ───────────────────────────────────────────────
  // Reached only with: margen > 10%, no expensive debt, >= 3 months emergency fund.
  if (tieneDeudaModeradaOBuena) {
    const montoInversion    = Math.max(0, Math.round(margenLibre * 0.70))
    const pagoExtraCredito  = Math.max(0, Math.round(margenLibre * 0.30))
    const base = `Estás en muy buena posición. Tu deuda actual tiene una tasa razonable y tu fondo de emergencia está sólido. Ahora es momento de hacer que tu plata trabaje para ti. Con tu margen disponible puedes estar invirtiendo ${formatCOP(montoInversion)} cada mes. Te muestro opciones que se ajustan a tu perfil — sin comisiones escondidas.`
    return {
      scenario: 'H',
      goalText: `Invierte ${formatCOP(montoInversion)} cada mes y usa ${formatCOP(pagoExtraCredito)} para acelerar tu crédito.`,
      mayaMessage: applyHonestyRule(base, objetivo, 'H', answers.P1 ?? ''),
      timeline: 'Mensual.',
    }
  }

  const metaInversion = Math.round(inc * 0.20)
  return {
    scenario: 'I',
    goalText: `Invierte al menos el 20% de tus ingresos — ${formatCOP(metaInversion)} cada mes.`,
    mayaMessage: `${nombre}, estás en el top 5% de colombianos financieramente. Sin deuda y con fondo de emergencia completo, cada peso que ganas puede trabajar para ti. Voy a mostrarte opciones de inversión que se ajustan exactamente a tu perfil — sin agenda oculta, sin productos que no te convengan.`,
    timeline: 'Mensual.',
  }
}

export function getResumeStep(ans: Answers): number {
  if (ans.P1 === undefined) return 1
  if (ans.P2 === undefined) return 2
  if (ans.P3 === undefined) return 3
  if (ans.P4 === undefined) return 4
  if (ans.P4 === 'yes' && ans.P5 === undefined) return 5
  if (ans.P4 === 'yes' && ans.P5_rate === undefined) return 55
  if (ans.P6 === undefined) return 6
  if (ans.P6 === 'yes' && ans.P7 === undefined) return 7
  if (ans.P8 === undefined) return 8
  if (ans.P9 === undefined) return 9
  if (ans.P10 === undefined) return 10
  if (ans.P11 === undefined) return 11
  return 12
}
