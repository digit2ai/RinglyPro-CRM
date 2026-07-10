import type { Answers } from '../../scoring/components/PlaneaScoreOnboarding.types'
import type { GoalPillar } from './goals.types'

const INC_MAP: Record<string, number> = { A: 1_200_000, B: 2_250_000, C: 4_000_000, D: 6_500_000, E: 9_000_000 }
const EXP_MAP: Record<string, number> = { A: 1_200_000, B: 2_000_000, C: 3_250_000, D: 5_250_000, E: 8_000_000 }
const DBT_MAP: Record<string, number> = { A: 200_000, B: 500_000, C: 1_100_000, D: 2_250_000, E: 4_000_000 }
const COV_MONTHS: Record<string, number> = { A: 0.5, B: 1.5, C: 3, D: 6, E: 12 }

function formatCOP(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-CO')
}

function roundTo(amount: number, multiple: number): number {
  return Math.max(multiple, Math.ceil(amount / multiple) * multiple)
}

function getExpenses(answers: Answers): number {
  if (answers.P3 === 'X') return Math.max(0, parseInt(answers.P3_exact ?? '0', 10)) || 3_200_000
  return EXP_MAP[answers.P3 ?? ''] ?? 3_200_000
}

function getIncome(answers: Answers): number {
  if (answers.P2 === 'X') return Math.max(0, parseInt(answers.P2_exact ?? '0', 10)) || 4_000_000
  return INC_MAP[answers.P2 ?? ''] ?? 4_000_000
}

function getDebtPayment(answers: Answers): number {
  if (answers.P5 === 'X') return Math.max(0, parseInt(answers.P5_exact ?? '0', 10)) || 500_000
  return DBT_MAP[answers.P5 ?? ''] ?? 500_000
}

// Returns the weekly savings amount that, paid 4 times, reaches the emergency fund goal.
// Mirrors the scenario logic in scoreOnboarding.calculations.ts so the step text matches goalText.
function getEmergencyFundWeeklyMonto(answers: Answers): number {
  const inc = getIncome(answers)
  const exp = getExpenses(answers)
  const margen = (inc - exp) / inc

  let target: number
  if (margen <= 0.10) {
    // Scenario B: hardcoded $500k minimum liquidity buffer
    target = 500_000
  } else if (answers.P6 !== 'yes') {
    // Scenario E: save 1 full month of expenses
    target = exp
  } else {
    const mesesCobertura = COV_MONTHS[answers.P7 ?? ''] ?? 0
    if (mesesCobertura < 1) {
      // Scenario F: fill up to 1 month
      target = exp - Math.round(exp * mesesCobertura)
    } else {
      // Scenario G: fill up to 3 months
      target = 3 * exp - Math.round(exp * mesesCobertura)
    }
  }

  return Math.round(target / 4 / 1_000) * 1_000
}

// milestoneIndex: 1 = hito 1→2, 2 = hito 2→3, 3 = hito 3→4
const STEP_TEXTS: Record<GoalPillar, Record<number, (answers: Answers) => string>> = {
  emergency_fund: {
    1: (ans) => {
      const monto = getEmergencyFundWeeklyMonto(ans)
      return `Esta semana separa ${formatCOP(monto)} antes de gastar cualquier otra cosa. Pónlo en una cuenta diferente a la que usas a diario.`
    },
    2: (ans) => {
      const monto = getEmergencyFundWeeklyMonto(ans)
      const acumulado = monto
      return `Llevas ${formatCOP(acumulado)} ahorrados. Esta semana separa otros ${formatCOP(monto)} — ya tienes casi medio mes de respaldo.`
    },
    3: (ans) => {
      const monto = getEmergencyFundWeeklyMonto(ans)
      return `Casi llegas. Esta semana haz el último aporte de ${formatCOP(monto)} para completar tu fondo de emergencia.`
    },
  },
  cash_flow: {
    1: () =>
      `Esta semana anota en qué se fueron tus gastos variables. Solo observar — no tienes que cambiar nada todavía.`,
    2: (ans) => {
      const monto = roundTo(getExpenses(ans) * 0.06, 50_000)
      return `Ya identificaste dónde se va la plata. Esta semana elige UN gasto variable que puedas reducir en ${formatCOP(monto)}.`
    },
    3: () =>
      `Ya llevas varias semanas con mejor control. Esta semana confirma que te quedó algo al final — si es así tu flujo de caja mejoró.`,
  },
  debt_health: {
    1: (ans) => {
      const pago_extra = roundTo(getDebtPayment(ans) * 0.12, 50_000)
      return `Esta semana paga ${formatCOP(pago_extra)} adicionales a tu deuda más cara — encima de tu cuota normal.`
    },
    2: (ans) => {
      const pago_extra = roundTo(getDebtPayment(ans) * 0.12, 50_000)
      return `Vas bien. Esta semana repite el pago extra de ${formatCOP(pago_extra)} a la misma deuda. La constancia es lo que baja el saldo.`
    },
    3: (ans) => {
      const pago_extra = roundTo(getDebtPayment(ans) * 0.12, 50_000)
      return `Último tramo. Un pago extra más de ${formatCOP(pago_extra)} y tu carga de deuda baja al siguiente nivel.`
    },
  },
  stability: {
    1: () =>
      `Esta semana registra cuánto recibiste de ingresos. Solo el dato — en 4 semanas Maya calcula tu promedio real.`,
    2: () =>
      `Ya tienes dos semanas de datos. Sigue registrando — el patrón empieza a verse con claridad.`,
    3: () =>
      `Con tus datos de este mes Maya puede darte un diagnóstico mucho más preciso. Registra el ingreso de esta semana.`,
  },
}

export function getWeeklyStepText(
  pillar: GoalPillar,
  milestoneIndex: number,
  answers: Answers,
): string | null {
  if (milestoneIndex < 1 || milestoneIndex > 3) return null
  return STEP_TEXTS[pillar]?.[milestoneIndex]?.(answers) ?? null
}
