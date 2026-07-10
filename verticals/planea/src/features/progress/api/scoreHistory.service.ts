import { supabase } from '../../../configurations/supabase'

export interface ScoreWeekBucket {
  label: string   // 'MMM YY'
  score: number
  date: string    // ISO
}

export async function loadWeeklyScoreHistory(userId: string): Promise<ScoreWeekBucket[]> {
  const { data: personData } = await supabase
    .from('persons')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (personData === null) return []

  const { data, error } = await supabase
    .from('persons_score_history')
    .select('scored_at, score_data')
    .eq('person_id', Number(personData.id))
    .order('scored_at', { ascending: true })

  if (error !== null || data === null) return []

  // Keep only the last entry per calendar month, then take the last 12 months
  const byMonth = new Map<string, { scored_at: string; score_data: unknown }>()
  for (const row of data) {
    const monthKey = (row.scored_at as string).slice(0, 7) // 'YYYY-MM'
    byMonth.set(monthKey, row)
  }

  const months = [...byMonth.values()].slice(-12)

  return months.map(row => {
    const sd = row.score_data as { score?: number }
    const d = new Date(row.scored_at as string)
    const label = new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit' }).format(d)
    return {
      label,
      score: sd.score ?? 0,
      date: row.scored_at as string,
    }
  })
}
