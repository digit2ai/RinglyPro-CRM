import type { Answers } from '../components/PlaneaScoreOnboarding.types'

export interface PillarDetailRow {
  label: string
  value: string
}

const INC_LABELS: Record<string, string> = {
  A: 'Menos de $1.500.000', B: '$1.500.000 – $3.000.000',
  C: '$3.000.000 – $5.000.000', D: '$5.000.000 – $8.000.000', E: 'Más de $8.000.000',
}
const EXP_LABELS: Record<string, string> = {
  A: 'Menos de $1.500.000', B: '$1.500.000 – $2.500.000',
  C: '$2.500.000 – $4.000.000', D: '$4.000.000 – $6.500.000', E: 'Más de $6.500.000',
}
const DBT_LABELS: Record<string, string> = {
  A: 'Menos de $300.000', B: '$300.000 – $700.000',
  C: '$700.000 – $1.500.000', D: '$1.500.000 – $3.000.000', E: 'Más de $3.000.000',
}
const COV_LABELS: Record<string, string> = {
  A: 'Menos de 1 mes', B: '1 – 3 meses', C: '3 – 6 meses', D: '6 meses – 1 año', E: 'Más de 1 año',
}
const STB_LABELS: Record<string, string> = {
  A: 'Ingreso fijo', B: 'Variable moderado', C: 'Variable alto',
}
const DEP_LABELS: Record<string, string> = {
  A: 'Nadie depende de mí', B: '1 o 2 personas', C: '3 o más personas',
}
const RATE_LABELS: Record<string, string> = {
  unknown: 'No sé', lt10: 'Menos del 10% EA', '10to20': '10% – 20% EA', gt20: 'Más del 20% EA',
}

const INC_MID: Record<string, number> = { A: 1_200_000, B: 2_250_000, C: 4_000_000, D: 6_500_000, E: 9_000_000 }
const EXP_MID: Record<string, number> = { A: 1_200_000, B: 2_000_000, C: 3_250_000, D: 5_250_000, E: 8_000_000 }
const DBT_MID: Record<string, number> = { A: 200_000, B: 500_000, C: 1_100_000, D: 2_250_000, E: 4_000_000 }

function formatCOP(val: string | undefined): string {
  if (!val) return '—'
  const n = parseInt(val, 10)
  if (isNaN(n)) return '—'
  return `$${n.toLocaleString('es-CO')}`
}

function getAmount(rangeKey: string | undefined, exactKey: string | undefined, midMap: Record<string, number>): number | null {
  if (rangeKey === 'X' && exactKey) return parseInt(exactKey, 10) || null
  return rangeKey ? (midMap[rangeKey] ?? null) : null
}

function getAmountLabel(rangeKey: string | undefined, exactKey: string | undefined, labelMap: Record<string, string>): string {
  if (rangeKey === 'X') return formatCOP(exactKey)
  return rangeKey ? (labelMap[rangeKey] ?? '—') : '—'
}

export function getPillarDetails(idx: number, answers: Answers): PillarDetailRow[] {
  switch (idx) {
    case 0: {
      const rows: PillarDetailRow[] = [
        { label: '¿Tienes ahorros?', value: answers.P6 === 'yes' ? 'Sí' : answers.P6 === 'no' ? 'No' : '—' },
      ]
      if (answers.P6 === 'yes') {
        rows.push({ label: 'Tiempo de cobertura', value: COV_LABELS[answers.P7 ?? ''] ?? '—' })
      }
      return rows
    }
    case 1: {
      const inc = getAmount(answers.P2, answers.P2_exact, INC_MID)
      const exp = getAmount(answers.P3, answers.P3_exact, EXP_MID)
      const ratio = inc !== null && exp !== null ? `${(exp / inc * 100).toFixed(0)}%` : '—'
      return [
        { label: 'Ingresos mensuales', value: getAmountLabel(answers.P2, answers.P2_exact, INC_LABELS) },
        { label: 'Gastos mensuales', value: getAmountLabel(answers.P3, answers.P3_exact, EXP_LABELS) },
        { label: 'Ratio gasto / ingreso', value: ratio },
      ]
    }
    case 2: {
      const rows: PillarDetailRow[] = [
        { label: '¿Tienes deudas?', value: answers.P4 === 'yes' ? 'Sí' : answers.P4 === 'no' ? 'No' : '—' },
      ]
      if (answers.P4 === 'yes') {
        const dbt = getAmount(answers.P5, answers.P5_exact, DBT_MID)
        const inc = getAmount(answers.P2, answers.P2_exact, INC_MID)
        const ratio = dbt !== null && inc !== null ? `${(dbt / inc * 100).toFixed(0)}%` : '—'
        rows.push(
          { label: 'Cuota mensual de deudas', value: getAmountLabel(answers.P5, answers.P5_exact, DBT_LABELS) },
          { label: 'Tasa de interés', value: RATE_LABELS[answers.P5_rate ?? ''] ?? '—' },
          { label: 'Ratio deuda / ingreso', value: ratio },
        )
      }
      return rows
    }
    case 3: {
      return [
        { label: 'Tipo de ingreso', value: STB_LABELS[answers.P8 ?? ''] ?? '—' },
        { label: 'Personas a cargo', value: DEP_LABELS[answers.P9 ?? ''] ?? '—' },
      ]
    }
    default:
      return []
  }
}
