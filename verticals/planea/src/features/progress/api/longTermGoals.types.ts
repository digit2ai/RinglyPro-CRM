export type LongTermGoalType = 'trip' | 'house' | 'car' | 'education' | 'other'

export interface LongTermGoal {
  id: number
  person_id: number
  name: string
  type: LongTermGoalType
  target_amount: number
  current_savings: number
  monthly_saving: number
  created_at: string
}

export interface LongTermGoalFormData {
  name: string
  type: LongTermGoalType
  target_amount: number
  current_savings: number
  monthly_saving: number
}
