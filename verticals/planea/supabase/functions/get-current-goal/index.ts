import { createClient } from 'npm:@supabase/supabase-js@2'

// ── Types ─────────────────────────────────────────────────────────────────────

type GoalPillar = 'emergency_fund' | 'cash_flow' | 'debt_health' | 'stability'
type DebtClass  = 'none' | 'good' | 'moderate' | 'expensive'
type Answers    = Record<string, string>

interface GoalMilestone {
  index:        number
  points:       number
  start_date:   string
  end_date:     string
  completed:    boolean
  completed_at: string | null
}

interface UserGoal {
  pillar:        GoalPillar
  initial_value: number
  goal_text:     string
  created_at:    string
  completed_at:  string | null
  next_goal_at:  string | null
  milestones:    GoalMilestone[]
}

interface ScoreData {
  score:    number | null
  scenario: string | null
  pillars?: {
    emergency_fund: number
    cash_flow:      number
    debt_health:    number
    stability:      number
  }
  answers: Answers | string[]
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function getSupabaseKey(envName: string, keyName = 'default'): string {
  const raw  = getRequiredEnv(envName)
  const keys = JSON.parse(raw) as Record<string, string>
  const key  = keys[keyName]
  if (!key) throw new Error(`Missing key "${keyName}" in ${envName}`)
  return key
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization')
  const match      = authHeader?.match(/^Bearer\s+(.+)$/i)
  const token      = match?.[1]
  if (!token) return null
  if (token.startsWith('sb_publishable_') || token.startsWith('sb_secret_')) return null
  return token
}

// ── Supabase clients ──────────────────────────────────────────────────────────

const supabaseUrl          = getRequiredEnv('SUPABASE_URL')
const supabasePublishableKey = getSupabaseKey('SUPABASE_PUBLISHABLE_KEYS')
const supabaseSecretKey    = getSupabaseKey('SUPABASE_SECRET_KEYS')

const authClient = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

// ── Score / goal-text helpers (mirrors scoreOnboarding.calculations.ts) ───────

const INC_MAP:    Record<string, number> = { A: 1_200_000, B: 2_250_000, C: 4_000_000, D: 6_500_000, E: 9_000_000 }
const EXP_MAP:    Record<string, number> = { A: 1_200_000, B: 2_000_000, C: 3_250_000, D: 5_250_000, E: 8_000_000 }
const DBT_MAP:    Record<string, number> = { A: 200_000,   B: 500_000,   C: 1_100_000, D: 2_250_000, E: 4_000_000 }
const COV_MONTHS: Record<string, number> = { A: 0.5, B: 1.5, C: 3, D: 6, E: 12 }

function exactOr(
  exactKey: string,
  fallbackMap: Record<string, number>,
  rangeVal: string | undefined,
  answers: Answers,
  defaultVal: number,
): number {
  if (rangeVal === 'X') return Math.max(0, parseInt(answers[exactKey] ?? '0', 10) || defaultVal)
  return fallbackMap[rangeVal ?? ''] ?? defaultVal
}

function formatCOP(n: number): string {
  const rounded = Math.round(n / 1000) * 1000
  if (rounded >= 1_000_000) {
    const m = rounded / 1_000_000
    return `$${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  return `$${rounded.toLocaleString('es-CO')}`
}

function getDebtRateFromAnswers(answers: Answers): number | null {
  if (answers.P5_rate === 'lt10')    return 9
  if (answers.P5_rate === '10to20')  return 15
  if (answers.P5_rate === 'gt20')    return 30
  if (answers.P5_rate === 'unknown') return null
  if (answers.P5_rate === 'lt20')    return 15
  if (answers.P5_rate === '20to40')  return 30
  if (answers.P5_rate === 'gt40')    return 41
  if (answers.P12_rate === '2')      return 15
  if (answers.P12_rate === '3')      return 30
  if (answers.P12_rate === '4')      return 41
  return null
}

function classifyDebt(answers: Answers): DebtClass {
  if (answers.P4 !== 'yes') return 'none'
  const rate = getDebtRateFromAnswers(answers)
  if (rate === null) return 'expensive'
  if (rate > 20)     return 'expensive'
  if (rate >= 10)    return 'moderate'
  return 'good'
}

function normalizeAnswers(raw: Answers | string[]): Answers {
  return Array.isArray(raw)
    ? raw.reduce<Answers>((acc, v, i) => { acc[`P${i + 1}`] = v; return acc }, {})
    : raw
}

function computeGoalText(scenario: string, rawAnswers: Answers | string[]): string {
  const ans          = normalizeAnswers(rawAnswers)
  const inc          = exactOr('P2_exact', INC_MAP, ans.P2, ans, 4_000_000)
  const exp          = exactOr('P3_exact', EXP_MAP, ans.P3, ans, 3_200_000)
  const cuotas       = ans.P4 === 'yes' ? exactOr('P5_exact', DBT_MAP, ans.P5, ans, 500_000) : 0
  const margenLibre  = inc - exp - cuotas
  const mesesCobertura = ans.P6 === 'no' ? 0 : (COV_MONTHS[ans.P7 ?? ''] ?? 0)
  const debtClass    = classifyDebt(ans)

  switch (scenario) {
    case 'A': {
      const diferencia = Math.abs(inc - exp)
      return `Reducir gastos en ${formatCOP(diferencia)} para no seguir endeudándote cada mes.`
    }
    case 'B':
      return 'Ahorra $500.000 como colchón mínimo de emergencia antes de atacar cualquier otra cosa.'
    case 'C': {
      const pagoExtra = Math.round(cuotas * 0.10)
      return `Paga ${formatCOP(pagoExtra)} adicionales al mes a tu deuda más cara.`
    }
    case 'D': {
      const pagoExtraDeuda = Math.max(0, Math.round(margenLibre * 0.50))
      const aporteFondo    = Math.max(0, Math.round(margenLibre * 0.50))
      return `Divide tu margen disponible: ${formatCOP(pagoExtraDeuda)} para deuda cara y ${formatCOP(aporteFondo)} para fondo de emergencia.`
    }
    case 'E': {
      const aportesSemanal = Math.round(exp / 4)
      return `Ahorra ${formatCOP(aportesSemanal)} esta semana — en 4 semanas tienes tu primer mes de respaldo.`
    }
    case 'F': {
      const faltante = exp - Math.round(exp * mesesCobertura)
      return `Llegar a 1 mes de fondo de emergencia — te faltan ${formatCOP(faltante)}.`
    }
    case 'G': {
      const faltante = 3 * exp - Math.round(exp * mesesCobertura)
      if (debtClass === 'moderate') {
        const aporteFondoG    = Math.round(margenLibre * 0.60)
        const pagoExtraDeudaG = Math.round(margenLibre * 0.40)
        return `Completar 3 meses de fondo — te faltan ${formatCOP(faltante)}. Divide tu margen: ${formatCOP(aporteFondoG)} al fondo y ${formatCOP(pagoExtraDeudaG)} a tu deuda moderada.`
      }
      return `Completar 3 meses de fondo de emergencia — te faltan ${formatCOP(faltante)}.`
    }
    case 'H': {
      const montoInversion   = Math.max(0, Math.round(margenLibre * 0.70))
      const pagoExtraCredito = Math.max(0, Math.round(margenLibre * 0.30))
      return `Invierte ${formatCOP(montoInversion)} cada mes y usa ${formatCOP(pagoExtraCredito)} para acelerar tu crédito.`
    }
    case 'I': {
      const metaInversion = Math.round(inc * 0.20)
      return `Invierte al menos el 20% de tus ingresos — ${formatCOP(metaInversion)} cada mes.`
    }
    default:
      return 'Mejora tu puntaje financiero este mes.'
  }
}

// ── Goal-build helpers ─────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function lastDayOfCurrentMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
}

function firstDayOfNextMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
}

const PILLAR_TARGETS: Record<GoalPillar, number> = {
  emergency_fund: 85,
  cash_flow:      75,
  debt_health:    85,
  stability:      75,
}

function computeHito4Points(pillar: GoalPillar, currentValue: number): number {
  const natural = PILLAR_TARGETS[pillar]
  if (currentValue < natural) return natural
  return Math.min(100, Math.round(currentValue + 10))
}

function getWeakestPillar(pillars: NonNullable<ScoreData['pillars']>): GoalPillar {
  const entries: [GoalPillar, number][] = [
    ['emergency_fund', pillars.emergency_fund],
    ['cash_flow',      pillars.cash_flow],
    ['debt_health',    pillars.debt_health],
    ['stability',      pillars.stability],
  ]
  return entries.reduce((min, curr) => (curr[1] < min[1] ? curr : min))[0]
}

function buildNewGoal(scoreData: ScoreData, now: Date): UserGoal | null {
  if (scoreData.pillars === undefined || scoreData.scenario === null) return null

  const pillar       = getWeakestPillar(scoreData.pillars)
  const currentValue = scoreData.pillars[pillar]
  const hito4        = computeHito4Points(pillar, currentValue)
  const gap          = hito4 - currentValue
  const goal_text    = computeGoalText(scoreData.scenario, scoreData.answers)

  const milestones: GoalMilestone[] = [
    {
      index:        1,
      points:       currentValue,
      start_date:   toDateStr(now),
      end_date:     toDateStr(addDays(now, 7)),
      completed:    false,
      completed_at: null,
    },
    {
      index:        2,
      points:       Math.round(currentValue + gap / 3),
      start_date:   toDateStr(addDays(now, 1)),
      end_date:     toDateStr(addDays(now, 8)),
      completed:    false,
      completed_at: null,
    },
    {
      index:        3,
      points:       Math.round(currentValue + (2 * gap) / 3),
      start_date:   toDateStr(addDays(now, 9)),
      end_date:     toDateStr(addDays(now, 15)),
      completed:    false,
      completed_at: null,
    },
    {
      index:        4,
      points:       hito4,
      start_date:   toDateStr(addDays(now, 16)),
      end_date:     toDateStr(lastDayOfCurrentMonth(now)),
      completed:    false,
      completed_at: null,
    },
  ]

  return {
    pillar,
    initial_value: currentValue,
    goal_text,
    created_at:    now.toISOString(),
    completed_at:  null,
    next_goal_at:  firstDayOfNextMonth(now).toISOString(),
    milestones,
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const jwt = getBearerToken(req)
  if (jwt === null) return jsonResponse({ error: 'Unauthorized' }, 401)

  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(jwt)
  if (claimsError !== null || typeof claimsData?.claims?.sub !== 'string') {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const userId = claimsData.claims.sub

  const { data: person, error: personError } = await adminClient
    .from('persons')
    .select('id, progress_data, score_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (personError !== null || person === null) {
    return jsonResponse({ error: 'Person not found' }, 404)
  }

  const rawGoal    = person.progress_data as Partial<UserGoal> | null
  const currentGoal: UserGoal | null =
    rawGoal !== null &&
    rawGoal.pillar !== undefined &&
    Array.isArray(rawGoal.milestones)
      ? rawGoal as UserGoal
      : null

  if (currentGoal === null) {
    return jsonResponse({ goal: null })
  }

  const now = new Date()

  // next_goal_at: use stored value or compute as first day of next month after creation
  const nextGoalAt =
    currentGoal.next_goal_at
    ?? firstDayOfNextMonth(new Date(currentGoal.created_at)).toISOString()

  if (toDateStr(now) >= nextGoalAt.slice(0, 10)) {
    const scoreData = person.score_data as ScoreData | null

    if (
      scoreData !== null &&
      scoreData.pillars !== undefined &&
      scoreData.scenario !== null
    ) {
      const newGoal = buildNewGoal(scoreData, now)

      if (newGoal !== null) {
        await adminClient
          .from('persons_goals_history')
          .insert({
            person_id:   person.id as number,
            recorded_at: now.toISOString(),
            goal_data:   currentGoal,
          })

        await adminClient
          .from('persons')
          .update({ progress_data: newGoal })
          .eq('user_id', userId)

        return jsonResponse({ goal: newGoal })
      }
    }
  }

  return jsonResponse({ goal: currentGoal })
})
