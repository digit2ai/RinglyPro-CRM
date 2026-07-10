export type Answers = Record<string, string>

export type Screen = 'form' | 'calculating' | 'results'

export interface ScoreResult {
  score: number
  p1: number
  p2: number
  p3: number
  p4: number
}

export interface ScoreLabel {
  name: string
  color: string
  desc: string
}

export interface PillarConfig {
  icon: string
  name: string
  weight: string
  bg: string
  color: string
  delay: string
}

export type ScenarioKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'

export interface ScoreEntry {
  timestamp: string
  company: string | null
  score: number | null
  scenario?: ScenarioKey | null
  source: 'survey' | 'checkin'
  pillars?: {
    emergency_fund: number
    cash_flow: number
    debt_health: number
    stability: number
  }
  answers: Answers | string[]
}

export interface Recommendation {
  scenario: ScenarioKey
  goalText: string
  mayaMessage: string
  timeline: string
}
