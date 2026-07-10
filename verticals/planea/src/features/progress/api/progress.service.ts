import { supabase } from '../../../configurations/supabase'
import type { ProgressData } from './progress.types'

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildProgressData(startDate: Date, weekLimit = 4): ProgressData {
  const weeks = Array.from({ length: weekLimit }, (_, i) => {
    const weekStart = new Date(startDate)
    weekStart.setDate(startDate.getDate() + i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    return { weekStart: formatDate(weekStart), weekEnd: formatDate(weekEnd), done: false }
  })
  return { weeklyProgress: weeks, weekLimit }
}

export async function loadProgressData(userId: string): Promise<ProgressData | null> {
  const { data, error } = await supabase
    .from('persons')
    .select('progress_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null || data === null) return null

  const pd = data.progress_data as Partial<ProgressData> | null
  if (pd === null || !Array.isArray(pd.weeklyProgress) || pd.weeklyProgress.length === 0) return null

  return pd as ProgressData
}

export async function initProgressDataIfNeeded(userId: string, startDate: Date): Promise<void> {
  const existing = await loadProgressData(userId)
  if (existing !== null) return

  const newData = buildProgressData(startDate)
  await supabase
    .from('persons')
    .update({ progress_data: newData })
    .eq('user_id', userId)
}

export async function markWeekDone(userId: string, weekIndex: number): Promise<ProgressData | null> {
  const current = await loadProgressData(userId)
  if (current === null) return null

  const updated: ProgressData = {
    ...current,
    weeklyProgress: current.weeklyProgress.map((w, i) =>
      i === weekIndex ? { ...w, done: true } : w,
    ),
  }

  const { error } = await supabase
    .from('persons')
    .update({ progress_data: updated })
    .eq('user_id', userId)

  if (error !== null) return null
  return updated
}

export function getCurrentWeekIndex(progress: ProgressData): number {
  const today = new Date().toISOString().slice(0, 10)
  return progress.weeklyProgress.findIndex(w => today >= w.weekStart && today <= w.weekEnd)
}

export function daysUntil(dateStr: string): number {
  const end = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000))
}
