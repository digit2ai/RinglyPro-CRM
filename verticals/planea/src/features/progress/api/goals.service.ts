import { supabase } from '../../../configurations/supabase'
import type { ScoreResult, ScoreEntry, Answers } from '../../scoring/components/PlaneaScoreOnboarding.types'
import { getRecommendation } from '../../scoring/api/scoreOnboarding.calculations'
import type { UserGoal, GoalMilestone, GoalPillar, GoalProgress, GoalStatus, GoalDisplayState } from './goals.types'

// ── Internal helpers ─────────────────────────────────────────────────────────

async function loadCurrentGoal(userId: string): Promise<UserGoal | null> {
  const { data, error } = await supabase
    .from('persons')
    .select('progress_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null || data === null) return null

  const pd = data.progress_data as Partial<UserGoal> | null
  // Guard against old shape or empty object
  if (pd === null || pd.pillar === undefined || !Array.isArray(pd.milestones)) return null

  return pd as UserGoal
}

async function saveCurrentGoal(userId: string, goal: UserGoal): Promise<void> {
  await supabase
    .from('persons')
    .update({ progress_data: goal })
    .eq('user_id', userId)
}

async function recordGoalHistory(userId: string, goal: UserGoal): Promise<void> {
  const { data } = await supabase
    .from('persons')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (data?.id == null) return

  await supabase.from('persons_goals_history').insert({
    person_id: data.id as number,
    recorded_at: new Date().toISOString(),
    goal_data: goal,
  })
}

const PILLAR_TARGETS: Record<GoalPillar, number> = {
  emergency_fund: 85,
  cash_flow: 75,
  debt_health: 85,
  stability: 75,
}

export function getPillarScore(scoreResult: ScoreResult, pillar: GoalPillar): number {
  if (pillar === 'emergency_fund') return scoreResult.p1
  if (pillar === 'cash_flow') return scoreResult.p2
  if (pillar === 'debt_health') return scoreResult.p3
  return scoreResult.p4
}

function getWeakestPillar(scoreResult: ScoreResult): GoalPillar {
  const pillars: [GoalPillar, number][] = [
    ['emergency_fund', scoreResult.p1],
    ['cash_flow', scoreResult.p2],
    ['debt_health', scoreResult.p3],
    ['stability', scoreResult.p4],
  ]
  return pillars.reduce((min, curr) => (curr[1] < min[1] ? curr : min))[0]
}

function computeHito4Points(pillar: GoalPillar, currentValue: number): number {
  const natural = PILLAR_TARGETS[pillar]
  if (currentValue < natural) return natural
  return Math.min(100, Math.round(currentValue + 10))
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function lastDayOfCurrentMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
}

function firstDayOfNextMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

// ── Derived status ───────────────────────────────────────────────────────────

function deriveGoalStatus(goal: UserGoal): GoalStatus {
  if (goal.completed_at !== null) return 'completada'
  const today = toDateStr(new Date())
  if (today > goal.milestones[3].end_date) return 'expirada'
  return 'active'
}

// ── Public API ───────────────────────────────────────────────────────────────

export function computeGoalProgress(goal: UserGoal, currentPillarValue: number): GoalProgress {
  const range = goal.milestones[3].points - goal.initial_value
  const raw = range <= 0 ? 100 : ((currentPillarValue - goal.initial_value) / range) * 100
  return {
    pct: Math.max(0, Math.min(100, Math.round(raw))),
    hito1Done: true,
    hito2Done: currentPillarValue >= goal.milestones[1].points,
    hito3Done: currentPillarValue >= goal.milestones[2].points,
    hito4Done: currentPillarValue >= goal.milestones[3].points,
  }
}

export async function loadGoalDisplayState(userId: string): Promise<GoalDisplayState> {
  const goal = await loadCurrentGoal(userId)
  if (goal === null) return { activeGoal: null, justCompleted: null }

  const status = deriveGoalStatus(goal)

  if (status === 'active') {
    return { activeGoal: goal, justCompleted: null }
  }

  if (status === 'completada' && goal.completed_at !== null) {
    const celebrationEnd = new Date(new Date(goal.completed_at).getTime() + 24 * 60 * 60 * 1000)
    if (new Date() < celebrationEnd) {
      return { activeGoal: null, justCompleted: goal }
    }
  }

  return { activeGoal: null, justCompleted: null }
}

async function createNewGoal(userId: string, scoreResult: ScoreResult, answers: Answers): Promise<void> {
  const pillar = getWeakestPillar(scoreResult)
  const currentValue = getPillarScore(scoreResult, pillar)
  const hito4 = computeHito4Points(pillar, currentValue)
  const gap = hito4 - currentValue
  const now = new Date()
  const recommendation = getRecommendation(answers)

  const milestones: GoalMilestone[] = [
    {
      index: 1,
      points: currentValue,
      start_date: toDateStr(now),
      end_date: toDateStr(addDays(now, 7)),
      completed: false,
      completed_at: null,
    },
    {
      index: 2,
      points: Math.round(currentValue + gap / 3),
      start_date: toDateStr(addDays(now, 1)),
      end_date: toDateStr(addDays(now, 8)),
      completed: false,
      completed_at: null,
    },
    {
      index: 3,
      points: Math.round(currentValue + (2 * gap) / 3),
      start_date: toDateStr(addDays(now, 9)),
      end_date: toDateStr(addDays(now, 15)),
      completed: false,
      completed_at: null,
    },
    {
      index: 4,
      points: hito4,
      start_date: toDateStr(addDays(now, 16)),
      end_date: toDateStr(lastDayOfCurrentMonth(now)),
      completed: false,
      completed_at: null,
    },
  ]

  const goal: UserGoal = {
    pillar,
    initial_value: currentValue,
    goal_text: recommendation.goalText,
    created_at: now.toISOString(),
    completed_at: null,
    next_goal_at: firstDayOfNextMonth(now).toISOString(),
    milestones,
  }

  await saveCurrentGoal(userId, goal)
}

async function applyGoalScoreToDb(userId: string, pillar: GoalPillar, newPillarValue: number): Promise<ScoreResult | null> {
  const { data, error } = await supabase
    .from('persons')
    .select('id, score_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null || data === null) return null

  const entry = data.score_data as ScoreEntry | null
  if (entry === null || entry.pillars === undefined) return null

  const pillars = { ...entry.pillars, [pillar]: newPillarValue }
  const score = Math.round(
    pillars.emergency_fund * 0.35 + pillars.cash_flow * 0.25 + pillars.debt_health * 0.25 + pillars.stability * 0.15,
  )
  const updatedScoreData = { ...entry, score, pillars }

  await supabase
    .from('persons')
    .update({ score_data: updatedScoreData })
    .eq('user_id', userId)

  await supabase
    .from('persons_score_history')
    .insert({
      person_id: data.id as number,
      scored_at: new Date().toISOString(),
      score_data: updatedScoreData,
    })

  return { score, p1: pillars.emergency_fund, p2: pillars.cash_flow, p3: pillars.debt_health, p4: pillars.stability }
}

export async function markMilestoneComplete(
  userId: string,
  milestoneIndex: number,
): Promise<{ goal: UserGoal | null; updatedScore: ScoreResult | null }> {
  const goal = await loadCurrentGoal(userId)
  if (goal === null) return { goal: null, updatedScore: null }

  const now = new Date()
  const updatedMilestones = goal.milestones.map((m, i) =>
    i === milestoneIndex ? { ...m, completed: true, completed_at: now.toISOString() } : m,
  )

  const allCompleted = updatedMilestones.every(m => m.completed)
  const updatedGoal: UserGoal = {
    ...goal,
    next_goal_at: goal.next_goal_at ?? firstDayOfNextMonth(new Date(goal.created_at)).toISOString(),
    milestones: updatedMilestones,
    completed_at: allCompleted ? now.toISOString() : goal.completed_at,
  }

  await saveCurrentGoal(userId, updatedGoal)

  let updatedScore: ScoreResult | null = null
  if (allCompleted) {
    await recordGoalHistory(userId, updatedGoal)
    updatedScore = await applyGoalScoreToDb(userId, goal.pillar, updatedGoal.milestones[3].points)
  }

  return { goal: updatedGoal, updatedScore }
}

export async function syncGoalState(
  userId: string,
  scoreResult: ScoreResult,
  answers: Answers,
): Promise<void> {
  const existing = await loadCurrentGoal(userId)

  // No goal yet — create one
  if (existing === null) {
    await createNewGoal(userId, scoreResult, answers)
    return
  }

  const status = deriveGoalStatus(existing)

  if (status === 'active') {
    const currentValue = getPillarScore(scoreResult, existing.pillar)

    // Pillar reached hito 4 — complete the goal
    if (currentValue >= existing.milestones[3].points) {
      const completedAt = new Date()
      const completed: UserGoal = {
        ...existing,
        completed_at: completedAt.toISOString(),
        milestones: existing.milestones.map(m => ({
          ...m,
          completed: currentValue >= m.points,
          completed_at: currentValue >= m.points ? completedAt.toISOString() : m.completed_at,
        })),
      }
      await Promise.all([
        saveCurrentGoal(userId, completed),
        recordGoalHistory(userId, completed),
      ])
      return
    }

    return // Still active, nothing to do
  }

  // Completed goal — hold during 24h celebration window, then start new goal
  if (status === 'completada') {
    if (existing.completed_at !== null) {
      const celebrationEnd = new Date(new Date(existing.completed_at).getTime() + 24 * 60 * 60 * 1000)
      if (new Date() < celebrationEnd) return
    }
  }

  // status === 'expirada' OR completed goal past 24h window
  if (status === 'expirada') {
    await recordGoalHistory(userId, existing)
  }

  await createNewGoal(userId, scoreResult, answers)
}
