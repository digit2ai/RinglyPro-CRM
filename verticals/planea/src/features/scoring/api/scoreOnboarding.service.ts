import { supabase } from '../../../configurations/supabase'
import type { Answers, ScoreEntry } from '../components/PlaneaScoreOnboarding.types'
import { answersToArray, arrayToAnswers, isFormComplete, computeScore, getRecommendation } from './scoreOnboarding.calculations'
import { initProgressDataIfNeeded } from '../../progress/api/progress.service'
import { syncGoalState } from '../../progress/api/goals.service'

export async function loadScoreProgress(userId: string): Promise<Answers | null> {
  const { data, error } = await supabase
    .from('persons')
    .select('score_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null || data === null) return null

  const entry = data.score_data as ScoreEntry | null
  if (entry === null) return null

  if (!entry.answers) return null
  return Array.isArray(entry.answers)
    ? arrayToAnswers(entry.answers)
    : entry.answers
}

export async function loadLatestScoreEntry(userId: string): Promise<ScoreEntry | null> {
  const { data, error } = await supabase
    .from('persons')
    .select('score_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null || data === null) return null

  return (data.score_data as ScoreEntry | null) ?? null
}

export async function saveScoreProgress(
  userId: string,
  answers: Answers,
  score: number | null = null,
): Promise<void> {
  const { data, error } = await supabase
    .from('persons')
    .select('id, score_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null) return

  const currentEntry = (data?.score_data ?? null) as ScoreEntry | null

  const currentAnswers = currentEntry !== null
    ? (Array.isArray(currentEntry.answers) ? arrayToAnswers(currentEntry.answers) : currentEntry.answers)
    : undefined

  const isCurrentIncomplete =
    currentEntry !== null && !isFormComplete(currentAnswers ?? {})

  const recommendation = isFormComplete(answers) ? getRecommendation(answers) : null
  const scoreResult = score !== null ? computeScore(answers) : null

  const entry: ScoreEntry = {
    timestamp: isCurrentIncomplete ? (currentEntry!.timestamp ?? new Date().toISOString()) : new Date().toISOString(),
    company: currentEntry?.company ?? null,
    score,
    scenario: recommendation?.scenario ?? null,
    source: 'survey',
    pillars: scoreResult !== null ? {
      emergency_fund: scoreResult.p1,
      cash_flow: scoreResult.p2,
      debt_health: scoreResult.p3,
      stability: scoreResult.p4,
    } : undefined,
    answers,
  }

  await supabase
    .from('persons')
    .update({ score_data: entry })
    .eq('user_id', userId)

  if (score !== null && isFormComplete(answers) && data?.id != null) {
    const { count } = await supabase
      .from('persons_score_history')
      .select('id', { count: 'exact', head: true })
      .eq('person_id', data.id)
      .eq('scored_at', entry.timestamp)

    if ((count ?? 0) === 0) {
      const { error: historyError } = await supabase
        .from('persons_score_history')
        .insert({
          person_id: data.id,
          scored_at: entry.timestamp,
          score_data: entry,
        })

      if (historyError !== null) {
        console.error('persons_score_history insert failed:', historyError)
      }
    }

    await initProgressDataIfNeeded(userId, new Date())

    if (scoreResult !== null) {
      await syncGoalState(userId, scoreResult, answers)
    }
  }
}

export async function saveScoreCheckin(
  userId: string,
  answers: Answers,
): Promise<void> {
  const scoreResult = computeScore(answers)
  const recommendation = getRecommendation(answers)

  const entry: ScoreEntry = {
    timestamp: new Date().toISOString(),
    company: null,
    score: scoreResult.score,
    scenario: recommendation.scenario,
    source: 'checkin',
    pillars: {
      emergency_fund: scoreResult.p1,
      cash_flow: scoreResult.p2,
      debt_health: scoreResult.p3,
      stability: scoreResult.p4,
    },
    answers,
  }

  await supabase
    .from('persons')
    .update({ score_data: entry })
    .eq('user_id', userId)

  const { data: personRow } = await supabase
    .from('persons')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (personRow?.id != null) {
    await supabase
      .from('persons_score_history')
      .insert({
        person_id: personRow.id,
        scored_at: entry.timestamp,
        score_data: entry,
      })
    await syncGoalState(userId, scoreResult, answers)
  }
}
