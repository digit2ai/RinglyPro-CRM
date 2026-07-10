export type GoalPillar = 'emergency_fund' | 'cash_flow' | 'debt_health' | 'stability'

export type GoalStatus = 'active' | 'completada' | 'expirada'

export interface GoalMilestone {
  index: number
  points: number
  start_date: string
  end_date: string
  completed: boolean
  completed_at: string | null
}

// Stored as JSON in persons.progress_data
export interface UserGoal {
  pillar: GoalPillar
  initial_value: number
  goal_text: string
  created_at: string
  completed_at: string | null
  next_goal_at: string | null
  milestones: GoalMilestone[]
}

export interface GoalProgress {
  pct: number
  hito1Done: boolean
  hito2Done: boolean
  hito3Done: boolean
  hito4Done: boolean
}

export interface GoalDisplayState {
  activeGoal: UserGoal | null
  justCompleted: UserGoal | null
}
