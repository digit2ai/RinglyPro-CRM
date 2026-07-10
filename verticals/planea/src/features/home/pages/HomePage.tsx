import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRightIcon } from '@heroicons/react/24/solid'
import { useScoreStore } from '../../scoring/stores/scoreStore'
import { getScoreLabel, computeScore, getRecommendation } from '../../scoring/api/scoreOnboarding.calculations'
import { loadLatestScoreEntry } from '../../scoring/api/scoreOnboarding.service'
import { getPillarDetails } from '../../scoring/api/pillarDetails'
import { useAuth } from '../../auth/hooks/AuthProvider'
import { daysUntil } from '../../progress/api/progress.service'
import { syncGoalState, markMilestoneComplete, loadGoalDisplayState } from '../../progress/api/goals.service'
import { getWeeklyStepText } from '../../progress/api/weeklyStep'
import { supabase } from '../../../configurations/supabase'
import { PillarDetailModal } from '../../../shared/components/PillarDetailModal'
import type { UserGoal, GoalDisplayState, GoalPillar } from '../../progress/api/goals.types'

const PILLAR_DEFS = [
  { icon: '🛡️', label: 'Fondo emergencia' },
  { icon: '💸', label: 'Flujo de caja' },
  { icon: '💳', label: 'Salud de deuda' },
  { icon: '⚖️', label: 'Estabilidad' },
]

const PILLAR_LABELS: Record<GoalPillar, string> = {
  emergency_fund: 'Fondo de Emergencia',
  cash_flow: 'Flujo de Caja',
  debt_health: 'Salud de Deuda',
  stability: 'Estabilidad',
}

const MILESTONE_LABELS = ['Inicio', 'Sem 2', 'Sem 3', 'Meta']

function getLastTuesdayAt7PM(): Date {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  let daysBack = (day - 2 + 7) % 7
  if (daysBack === 0 && now.getHours() < 19) daysBack = 7
  const result = new Date(now)
  result.setDate(now.getDate() - daysBack)
  result.setHours(19, 0, 0, 0)
  return result
}

const MAYA_TIMESTAMP = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short', day: 'numeric', month: 'short',
}).format(getLastTuesdayAt7PM())

export function HomePage() {
  const { scoreResult, scoreAnswers, setScore } = useScoreStore()
  const { user } = useAuth()
  const [goalState, setGoalState] = useState<GoalDisplayState>({ activeGoal: null, justCompleted: null })
  const [syncing, setSyncing] = useState(false)
  const [marking, setMarking] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [activePillar, setActivePillar] = useState<number | null>(null)

  function isCompletedThisWeek(goal: UserGoal): boolean {
    const now = new Date()
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day))
    monday.setHours(0, 0, 0, 0)
    return goal.milestones.some(m => m.completed_at !== null && new Date(m.completed_at) >= monday)
  }

  async function handleMarkDone() {
    if (user === null || firstIncompleteMilestone === -1 || marking) return
    setMarking(true)
    try {
      const { goal: updated, updatedScore } = await markMilestoneComplete(user.id, firstIncompleteMilestone)
      if (updated !== null) {
        setGoalState({
          activeGoal: updated.completed_at === null ? updated : null,
          justCompleted: updated.completed_at !== null ? updated : null,
        })
      }
      if (updatedScore !== null && scoreAnswers !== null) {
        setScore(updatedScore, scoreAnswers)
      }
    } finally {
      setMarking(false)
    }
  }

  const hasScore = scoreResult !== null
  const userName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? ''
  const recommendation = scoreAnswers !== null ? getRecommendation(scoreAnswers, userName, scoreResult ?? undefined) : null

  // Scroll to hash anchor on mount (e.g. /home#maya)
  const location = useLocation()
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash])

  // Rehydrate score from DB if not in store
  useEffect(() => {
    if (scoreResult !== null || user === null) return

    loadLatestScoreEntry(user.id).then(entry => {
      if (entry === null || entry.score === null) return

      const answers = Array.isArray(entry.answers)
        ? entry.answers.reduce<Record<string, string>>((acc, v, i) => { acc[`P${i + 1}`] = v; return acc }, {})
        : entry.answers

      if (answers === null || answers === undefined) return

      const result = entry.pillars !== undefined
        ? {
            score: entry.score,
            p1: entry.pillars.emergency_fund,
            p2: entry.pillars.cash_flow,
            p3: entry.pillars.debt_health,
            p4: entry.pillars.stability,
          }
        : computeScore(answers)

      setScore(result, answers)
    })
  }, [user, scoreResult, setScore])

  // Load goal state on mount (fire edge function for server-side rollover, load display state from DB)
  useEffect(() => {
    if (user === null) return
    supabase.functions.invoke('get-current-goal', { method: 'GET' }) // trigger server-side rollover
    loadGoalDisplayState(user.id).then(state => setGoalState(state))
  }, [user?.id])

  // Sync goal state whenever score becomes available (handles completions, expirations, new goals)
  useEffect(() => {
    if (user === null || scoreResult === null || scoreAnswers === null || syncing) return
    setSyncing(true)
    syncGoalState(user.id, scoreResult, scoreAnswers)
      .then(() => loadGoalDisplayState(user.id))
      .then(state => setGoalState(state))
      .finally(() => setSyncing(false))
  }, [user?.id, scoreResult, scoreAnswers])

  const pillarScores = hasScore
    ? [scoreResult.p1, scoreResult.p2, scoreResult.p3, scoreResult.p4]
    : [0, 0, 0, 0]
  const minPillarIdx = hasScore ? pillarScores.indexOf(Math.min(...pillarScores)) : -1
  const scoreLabel = hasScore ? getScoreLabel(scoreResult.score) : null

  const ringCircumference = 263.9
  const ringOffset = hasScore
    ? ringCircumference - (scoreResult.score / 100) * ringCircumference
    : ringCircumference

  // ── Goal derivations ─────────────────────────────────────────────────────
  const { activeGoal, justCompleted } = goalState

  const currentGoalForDisplay: UserGoal | null = activeGoal ?? justCompleted

  const goalProgress = activeGoal !== null
    ? {
        hito1Done: activeGoal.milestones[0].completed,
        hito2Done: activeGoal.milestones[1].completed,
        hito3Done: activeGoal.milestones[2].completed,
        hito4Done: activeGoal.milestones[3].completed,
        pct: Math.round(
          Math.max(0, (activeGoal.milestones.filter(m => m.completed).length - 1) / 3) * 100,
        ),
      }
    : null

  const milestoneDone = goalProgress !== null
    ? [goalProgress.hito1Done, goalProgress.hito2Done, goalProgress.hito3Done, goalProgress.hito4Done]
    : [false, false, false, false]

  const firstIncompleteMilestone = milestoneDone.findIndex(done => !done)

  const daysLeft = activeGoal !== null ? daysUntil(activeGoal.milestones[3].end_date) : 0
  const alreadyDoneThisWeek = activeGoal !== null && isCompletedThisWeek(activeGoal)

  const nextGoalLabel = (() => {
    if (justCompleted === null) return null
    const raw = justCompleted.next_goal_at
      ?? new Date(new Date(justCompleted.created_at).getFullYear(), new Date(justCompleted.created_at).getMonth() + 1, 1).toISOString()
    const d = new Date(raw)
    if (isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(d)
  })()

  const weeklyStepText =
    activeGoal !== null && scoreAnswers !== null && firstIncompleteMilestone >= 0
      ? getWeeklyStepText(activeGoal.pillar, firstIncompleteMilestone + 1, scoreAnswers)
      : null

  const goalMonthLabel = currentGoalForDisplay !== null
    ? new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(
        new Date(currentGoalForDisplay.milestones[0].start_date + 'T12:00:00'),
      )
    : 'este mes'

  return (
    <div className="relative flex h-full flex-col bg-(--off-white)">

      {/* ── CONFIRMATION MODAL ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-1.5 text-lg font-bold text-(--dark)">¿Confirmar avance?</h3>
            <p className="mb-4 text-base font-light leading-snug text-(--gray-400)">
              ¿Completaste el hito <span className="font-semibold text-(--dark)">{MILESTONE_LABELS[firstIncompleteMilestone]}</span> esta semana?
              Solo puedes registrar un avance por semana.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-xl border border-(--gray-100) py-2.5 text-sm font-semibold text-(--gray-400)"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowConfirmModal(false); void handleMarkDone() }}
                className="flex-1 rounded-xl bg-(--secondary2-100) py-2.5 text-sm font-bold text-white"
              >
                Sí, confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PILLAR DETAIL MODAL ── */}
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

      {/* ── SCROLL AREA ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ══ BLOQUE 1: SCORE COMPACTO ══ */}
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

        {/* ══ BLOQUE 2 + 3: GRID 2xl ══ */}
        <div className="2xl:mx-auto 2xl:max-w-6xl 2xl:grid 2xl:grid-cols-2 2xl:items-stretch 2xl:gap-6 2xl:px-8 2xl:py-8">

        {/* ══ BLOQUE 2: META ACTIVA ══ */}
        <div className="border-b border-(--gray-100) bg-(--off-white) p-4 2xl:rounded-2xl 2xl:border-none 2xl:bg-white 2xl:p-6 2xl:shadow-sm 2xl:flex 2xl:flex-col">
          <div className="mb-2.5 font-mono text-sm 2xl:text-base font-bold uppercase tracking-[0.12em] text-(--gray-300)">
            Tu meta de {goalMonthLabel}
          </div>

          {/* Celebration (24h window after completing goal) */}
          {justCompleted !== null && activeGoal === null && (
            <div className="rounded-2xl border border-[#B7E4C7] bg-(--gray-50) p-3.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">🎉</span>
                <div className="text-lg font-bold leading-tight text-(--primary-300)">
                  ¡Completaste tu meta!
                </div>
              </div>
              <p className="mb-1.5 text-base 2xl:text-lg font-light leading-[1.4] text-(--gray-400)">
                Tu {PILLAR_LABELS[justCompleted.pillar]} subió de{' '}
                <span className="font-bold text-(--dark)">{justCompleted.initial_value}</span> a{' '}
                <span className="font-bold text-(--secondary2-100)">{justCompleted.milestones[3].points}</span> puntos.
              </p>
              <div className="flex items-center gap-1.5 rounded-xl bg-(--secondary2-100)/10 px-3 py-2">
                <span className="text-sm">⏳</span>
                <span className="text-sm font-medium text-(--secondary2-100)">
                  Tu próxima meta llega el {nextGoalLabel ?? '1 de junio'}
                </span>
              </div>
            </div>
          )}

          {/* Active goal */}
          {activeGoal !== null && goalProgress !== null && (
            <div className="rounded-2xl border border-[#B7E4C7] bg-(--gray-50) p-3.5">
              <div className="mb-2 text-lg font-bold leading-[1.3] text-(--primary-300)">
                {activeGoal.goal_text}
              </div>

              {/* Milestone nodes */}
              <div className="relative mb-1.5 flex items-center">
                {MILESTONE_LABELS.slice(0, -1).map((_, i) => {
                  const n = MILESTONE_LABELS.length
                  const pct = 100 / n
                  const left = (i + 0.5) * pct
                  const right = (n - i - 1.5) * pct
                  const isGreen = milestoneDone[i] && milestoneDone[i + 1]
                  return (
                    <div
                      key={i}
                      className={`absolute top-1.75 h-0.5 ${isGreen ? 'bg-(--secondary2-100)' : 'bg-(--gray-100)'}`}
                      style={{ left: `${left}%`, right: `${right}%` }}
                    />
                  )
                })}

                {MILESTONE_LABELS.map((label, i) => {
                  const isDone = milestoneDone[i]
                  const isCurrent = i === firstIncompleteMilestone
                  return (
                    <div key={i} className="relative z-10 flex flex-1 flex-col items-center">
                      {isDone ? (
                        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-(--secondary2-100) bg-(--secondary2-100) text-[9px] font-bold text-white">
                          ✓
                        </div>
                      ) : isCurrent ? (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-[#C9A84C] bg-white shadow-[0_0_0_3px_rgba(201,168,76,0.2)]" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-(--gray-100) bg-white" />
                      )}
                      <div className={clsx(
                        'mt-0.75 text-center text-sm 2xl:text-base',
                        isDone ? 'font-medium text-(--secondary2-100)'
                          : isCurrent ? 'font-bold text-[#C9A84C]'
                            : 'text-(--gray-300)',
                      )}>
                        {label}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Progress bar */}
              <div className="mt-2 mb-1 h-1.25 overflow-hidden rounded-full bg-(--gray-100)">
                <div
                  className="h-full rounded-full bg-linear-to-r from-(--secondary2-100) to-[#C9A84C]"
                  style={{ width: `${goalProgress.pct}%`, transition: 'width 0.6s ease' }}
                />
              </div>
              <div className="text-center text-base 2xl:text-lg text-(--gray-300)">
                {goalProgress.hito4Done
                  ? '¡Meta alcanzada! 🎉'
                  : `${daysLeft} día${daysLeft !== 1 ? 's' : ''} restantes`}
              </div>

              {firstIncompleteMilestone !== -1 && (
                <button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={marking || alreadyDoneThisWeek}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-(--secondary2-100) py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {marking
                    ? 'Guardando…'
                    : alreadyDoneThisWeek
                      ? `✓ Completado esta semana`
                      : `✓ Realizado`
                  }
                </button>
              )}

              {weeklyStepText !== null && (
                <div className="mt-2.5 flex gap-2 rounded-r-lg border-l-2 border-[#C9A84C] bg-white p-[10px_12px]">
                  <div className="shrink-0 text-[16px]">🎯</div>
                  <div>
                    <div className="mb-0.5 text-base 2xl:text-lg font-bold text-(--dark)">Tu paso esta semana</div>
                    <div className="text-base 2xl:text-lg font-light leading-[1.4] text-(--gray-400)">
                      {weeklyStepText}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No goal yet (score exists but goal not created yet) */}
          {activeGoal === null && justCompleted === null && hasScore && (
            <div className="rounded-2xl border border-(--gray-100) bg-(--gray-50) p-4 text-center text-base text-(--gray-300)">
              Calculando tu meta...
            </div>
          )}

          {/* Placeholder when no score */}
          {!hasScore && (
            <div className="rounded-2xl border border-(--gray-100) bg-(--gray-50) p-3.5">
              <div className="mb-3 h-5 w-4/5 rounded-md bg-(--gray-100)" />

              {/* Milestone nodes */}
              <div className="relative mb-1.5 flex items-center">
                {MILESTONE_LABELS.slice(0, -1).map((_, i) => {
                  const n = MILESTONE_LABELS.length
                  const pct = 100 / n
                  const left = (i + 0.5) * pct
                  const right = (n - i - 1.5) * pct
                  return (
                    <div
                      key={i}
                      className="absolute top-1.75 h-0.5 bg-(--gray-100)"
                      style={{ left: `${left}%`, right: `${right}%` }}
                    />
                  )
                })}
                {MILESTONE_LABELS.map((label, i) => (
                  <div key={i} className="relative z-10 flex flex-1 flex-col items-center">
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-(--gray-200) bg-white" />
                    <div className="mt-0.75 text-center text-sm text-(--gray-200)">{label}</div>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="mt-2 mb-1 h-1.25 overflow-hidden rounded-full bg-(--gray-100)" />
              <div className="mx-auto h-3.5 w-28 rounded-md bg-(--gray-100)" />

              {/* Button */}
              <div className="mt-3 h-10 rounded-xl bg-(--gray-100)" />

              {/* Weekly tip */}
              <div className="mt-2.5 flex gap-2 rounded-r-lg border-l-2 border-(--gray-100) bg-white p-[10px_12px]">
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-(--gray-100)" />
                <div className="flex-1">
                  <div className="mb-1.5 h-3.5 w-32 rounded-md bg-(--gray-100)" />
                  <div className="mb-1 h-3 w-full rounded-md bg-(--gray-100)" />
                  <div className="h-3 w-4/5 rounded-md bg-(--gray-100)" />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ══ BLOQUE 3: MAYA ══ */}
        {(recommendation !== null || !hasScore) && (
          <div id="maya" className="border-b border-(--gray-100) bg-(--off-white) p-4 2xl:rounded-2xl 2xl:border-none 2xl:bg-white 2xl:p-6 2xl:shadow-sm 2xl:flex 2xl:flex-col">
            <div className="mb-2.5 flex items-baseline gap-2">
              <span className="font-mono text-sm 2xl:text-base font-bold uppercase tracking-[0.12em] text-(--gray-300)">
                Martes de Maya · 7PM
              </span>
              <span className="font-mono text-xs 2xl:text-sm font-medium text-(--gray-400) normal-case tracking-normal">
                {MAYA_TIMESTAMP}
              </span>
            </div>

            {recommendation !== null ? (
              <div className="relative overflow-hidden rounded-2xl bg-(--primary-300) p-3.5">
                <div className="pointer-events-none absolute -top-10 -right-7.5 h-30 w-30 rounded-full bg-white/4" />

                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C9A84C] text-[16px]">
                    🦜
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">Maya</div>
                    <div className="text-base 2xl:text-lg text-white/50">Tu asesora financiera</div>
                  </div>
                </div>

                {/* Bubble */}
                <div className="mb-3 rounded-r-lg border-l-2 border-[#C9A84C] bg-white/8 p-[10px_12px] text-base 2xl:text-lg font-light leading-[1.55] text-white/88">
                  "{recommendation.mayaMessage}"
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl bg-(--gray-100) p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-(--gray-200)" />
                  <div>
                    <div className="mb-1.5 h-5 w-14 rounded-md bg-(--gray-200)" />
                    <div className="h-3.5 w-32 rounded-md bg-(--gray-200)" />
                  </div>
                </div>

                {/* Bubble placeholder */}
                <div className="mb-3 rounded-r-lg border-l-2 border-(--gray-200) bg-(--gray-50) p-[10px_12px]">
                  <div className="mb-1.5 h-3 w-full rounded-md bg-(--gray-200)" />
                  <div className="mb-1.5 h-3 w-4/5 rounded-md bg-(--gray-200)" />
                  <div className="h-3 w-3/5 rounded-md bg-(--gray-200)" />
                </div>
              </div>
            )}
          </div>
        )}

        </div>{/* end 2xl grid */}

        <div className="h-4 2xl:hidden" />
      </div>

    </div>
  )
}
