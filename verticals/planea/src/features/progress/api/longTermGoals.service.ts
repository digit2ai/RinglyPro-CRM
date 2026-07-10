import { supabase } from '../../../configurations/supabase'
import type { LongTermGoal, LongTermGoalFormData } from './longTermGoals.types'

async function getPersonId(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('persons')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null || data === null) return null
  return data.id as number
}

export async function loadLongTermGoals(userId: string): Promise<LongTermGoal[]> {
  const personId = await getPersonId(userId)
  if (personId === null) return []

  const { data, error } = await supabase
    .from('persons_long_term_goals')
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  if (error !== null || data === null) return []
  return data as LongTermGoal[]
}

export async function addLongTermGoal(userId: string, form: LongTermGoalFormData): Promise<LongTermGoal | null> {
  const personId = await getPersonId(userId)
  if (personId === null) return null

  const { data, error } = await supabase
    .from('persons_long_term_goals')
    .insert({ ...form, person_id: personId })
    .select()
    .maybeSingle()

  if (error !== null || data === null) return null
  return data as LongTermGoal
}

export async function deleteLongTermGoal(goalId: number): Promise<void> {
  await supabase
    .from('persons_long_term_goals')
    .delete()
    .eq('id', goalId)
}

export async function updateLongTermGoal(goalId: number, form: LongTermGoalFormData): Promise<LongTermGoal | null> {
  const { data, error } = await supabase
    .from('persons_long_term_goals')
    .update(form)
    .eq('id', goalId)
    .select()
    .maybeSingle()

  if (error !== null || data === null) return null
  return data as LongTermGoal
}

export function monthsToGoal(goal: LongTermGoal): number | null {
  const remaining = goal.target_amount - goal.current_savings
  if (remaining <= 0) return 0
  if (goal.monthly_saving <= 0) return null
  return Math.ceil(remaining / goal.monthly_saving)
}
