import { create } from 'zustand'
import type { Answers, ScoreResult } from '../components/PlaneaScoreOnboarding.types'

interface ScoreStore {
  scoreResult: ScoreResult | null
  scoreAnswers: Answers | null
  setScore: (result: ScoreResult, answers: Answers) => void
  clearScore: () => void
}

export const useScoreStore = create<ScoreStore>(set => ({
  scoreResult: null,
  scoreAnswers: null,
  setScore: (result, answers) => set({ scoreResult: result, scoreAnswers: answers }),
  clearScore: () => set({ scoreResult: null, scoreAnswers: null }),
}))
