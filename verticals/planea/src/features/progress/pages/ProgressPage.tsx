import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '@heroicons/react/24/solid'
import { useScoreStore } from '../../scoring/stores/scoreStore'
import { getScoreLabel, computeScore } from '../../scoring/api/scoreOnboarding.calculations'
import { loadLatestScoreEntry } from '../../scoring/api/scoreOnboarding.service'
import { getPillarDetails } from '../../scoring/api/pillarDetails'
import { useAuth } from '../../auth/hooks/AuthProvider'
import { loadWeeklyScoreHistory } from '../api/scoreHistory.service'
import { loadLongTermGoals } from '../api/longTermGoals.service'
import type { ScoreWeekBucket } from '../api/scoreHistory.service'
import type { LongTermGoal } from '../api/longTermGoals.types'
import { WeeklyScoreChart } from '../components/WeeklyScoreChart'
import { LongTermGoals } from '../components/LongTermGoals'
import { PillarDetailModal } from '../../../shared/components/PillarDetailModal'

const PILLAR_DEFS = [
  { icon: '🛡️', label: 'Fondo emergencia' },
  { icon: '💸', label: 'Flujo de caja' },
  { icon: '💳', label: 'Salud de deuda' },
  { icon: '⚖️', label: 'Estabilidad' },
]

export function ProgressPage() {
  const { scoreResult, scoreAnswers, setScore } = useScoreStore()
  const { user } = useAuth()
  const [scoreHistory, setScoreHistory] = useState<ScoreWeekBucket[]>([])
  const [longTermGoals, setLongTermGoals] = useState<LongTermGoal[]>([])
  const [activePillar, setActivePillar] = useState<number | null>(null)

  const hasScore = scoreResult !== null
  const pillarScores = hasScore ? [scoreResult.p1, scoreResult.p2, scoreResult.p3, scoreResult.p4] : [0, 0, 0, 0]
  const minPillarIdx = hasScore ? pillarScores.indexOf(Math.min(...pillarScores)) : -1
  const scoreLabel = hasScore ? getScoreLabel(scoreResult.score) : null

  const ringCircumference = 263.9
  const ringOffset = hasScore
    ? ringCircumference - (scoreResult.score / 100) * ringCircumference
    : ringCircumference

  useEffect(() => {
    if (scoreResult !== null || user === null) return
    loadLatestScoreEntry(user.id).then(entry => {
      if (entry === null || entry.score === null) return
      const answers = Array.isArray(entry.answers)
        ? entry.answers.reduce<Record<string, string>>((acc, v, i) => { acc[`P${i + 1}`] = v; return acc }, {})
        : entry.answers
      if (answers === null || answers === undefined) return
      const result = entry.pillars !== undefined
        ? { score: entry.score, p1: entry.pillars.emergency_fund, p2: entry.pillars.cash_flow, p3: entry.pillars.debt_health, p4: entry.pillars.stability }
        : computeScore(answers)
      setScore(result, answers)
    })
  }, [user, scoreResult, setScore])

  useEffect(() => {
    if (user === null) return
    loadWeeklyScoreHistory(user.id).then(history => setScoreHistory(history))
    loadLongTermGoals(user.id).then(goals => setLongTermGoals(goals))
  }, [user?.id])

  return (
    <div className="relative flex h-full flex-col bg-(--off-white)">

      {/* ══ PILLAR DETAIL MODAL ══ */}
      {activePillar !== null && hasScore && scoreAnswers !== null && (
        <PillarDetailModal
          icon={PILLAR_DEFS[activePillar].icon}
          label={PILLAR_DEFS[activePillar].label}
          score={pillarScores[activePillar]}
          isWeakest={activePillar === minPillarIdx}
          barColor={activePillar === minPillarIdx ? '#b91c1c' : '#C9A84C'}
          details={getPillarDetails(activePillar, scoreAnswers)}
          onClose={() => setActivePillar(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto">

        {/* ══ SCORE + PILLARS ══ */}
        <div className="bg-(--primary-300) px-5 pb-3.5 pt-4 2xl:px-10 2xl:py-8">
          <div className="mx-auto 2xl:max-w-6xl">
          <div className="mb-3">
            <span className="font-mono text-sm 2xl:text-base font-semibold uppercase tracking-[0.15em] text-[#B7E4C7]">
              Tu puntaje Planea
            </span>
          </div>

          <div className="flex items-stretch gap-3 2xl:gap-8">
            <div className="flex w-36 shrink-0 flex-col items-center justify-center gap-2 2xl:w-56">
              <div className="relative h-32 w-32 2xl:h-48 2xl:w-48">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke={hasScore ? '#C9A84C' : 'rgba(255,255,255,0.15)'}
                    strokeWidth="8"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {hasScore ? (
                    <span className="text-[44px] font-extrabold leading-none tracking-[-0.03em] text-white 2xl:text-[64px]">
                      {scoreResult.score}
                    </span>
                  ) : (
                    <span className="text-[32px] font-extrabold leading-none tracking-[-0.03em] text-white/20 2xl:text-[48px]">—</span>
                  )}
                </div>
              </div>
              {hasScore && scoreLabel !== null ? (
                <div
                  className="inline-block rounded-full px-3 py-0.5 text-sm 2xl:text-base font-bold"
                  style={{ background: scoreLabel.color, color: 'white' }}
                >
                  {scoreLabel.name}
                </div>
              ) : (
                <div className="inline-block rounded-full bg-white/10 px-3 py-0.5 text-sm 2xl:text-base font-bold text-white/25">
                  Sin puntaje
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              {PILLAR_DEFS.map((p, i) => {
                const canOpen = hasScore && scoreAnswers !== null
                return (
                  <button
                    key={i}
                    className="rounded-[10px] bg-white/[0.07] p-[7px_9px] text-left w-full disabled:cursor-default"
                    onClick={() => canOpen && setActivePillar(i)}
                    disabled={!canOpen}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs 2xl:text-sm font-medium text-white/55">{p.icon} {p.label}</span>
                      <div className="flex items-center gap-1">
                        <span className={clsx('font-mono text-xs 2xl:text-sm font-bold', hasScore ? 'text-white' : 'text-white/20')}>
                          {hasScore ? pillarScores[i] : '—'}
                        </span>
                        {canOpen && <ChevronRightIcon className="w-3 h-3 text-white/30 shrink-0" />}
                      </div>
                    </div>
                    <div className="h-0.75 overflow-hidden rounded-full bg-white/10">
                      {hasScore && (
                        <div
                          className={clsx('h-full rounded-full', i === minPillarIdx ? 'bg-red-700' : 'bg-[#C9A84C]')}
                          style={{ width: `${pillarScores[i]}%`, transition: 'width 0.8s ease' }}
                        />
                      )}
                    </div>
                    {hasScore && i === minPillarIdx && (
                      <div className="mt-1 text-center text-[10px] font-semibold text-red-700">
                        Tu mayor oportunidad
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {!hasScore && (
            <Link
              to="/score"
              className="mt-3.5 flex w-full items-center justify-center rounded-xl bg-[#C9A84C] py-2.5 text-sm 2xl:text-base font-bold text-(--primary-300)"
            >
              Descubre tu puntaje Planea
            </Link>
          )}
          </div>
        </div>

        {/* ══ CHART + GOALS: GRID 2xl ══ */}
        <div className="2xl:mx-auto 2xl:max-w-6xl 2xl:grid 2xl:grid-cols-2 2xl:items-stretch 2xl:gap-6 2xl:px-8 2xl:py-8">

        {/* ══ EVOLUCIÓN SEMANAL ══ */}
        <div className="border-b border-(--gray-100) bg-(--off-white) p-4 2xl:rounded-2xl 2xl:border-none 2xl:bg-white 2xl:p-6 2xl:shadow-sm 2xl:flex 2xl:flex-col">
          <div className="mb-3 font-mono text-sm 2xl:text-base font-bold uppercase tracking-[0.12em] text-(--gray-300)">
            Evolución mensual del puntaje
          </div>
          <WeeklyScoreChart data={scoreHistory} />
        </div>

        {/* ══ METAS DE LARGO PLAZO ══ */}
        <div className="border-b border-(--gray-100) bg-(--off-white) p-4 2xl:rounded-2xl 2xl:border-none 2xl:bg-white 2xl:p-6 2xl:shadow-sm 2xl:flex 2xl:flex-col">
          <div className="mb-3 font-mono text-sm 2xl:text-base font-bold uppercase tracking-[0.12em] text-(--gray-300)">
            Metas de largo plazo
          </div>
          {user !== null && (
            <LongTermGoals
              goals={longTermGoals}
              userId={user.id}
              onGoalsChange={setLongTermGoals}
            />
          )}
        </div>

        </div>{/* end 2xl grid */}

        <div className="h-4 2xl:hidden" />
      </div>
    </div>
  )
}
