export interface WeekEntry {
  weekStart: string // 'YYYY-MM-DD'
  weekEnd: string   // 'YYYY-MM-DD'
  done: boolean
}

export interface ProgressData {
  weeklyProgress: WeekEntry[]
  weekLimit: number
}
