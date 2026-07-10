import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { SparklesIcon } from '@heroicons/react/24/solid'
import { useScoreStore } from '../stores/scoreStore'
import { getScoreLabel, PILLARS, RING_R, RING_C } from '../api/scoreOnboarding.calculations'
import { useAuth } from '../../auth/hooks/AuthProvider'

interface ScoreResultsProps {
  onRetake: () => void
}

export function ScoreResults({ onRetake }: ScoreResultsProps) {
  const { scoreResult } = useScoreStore()
  const { user } = useAuth()
  const recomendacionesHref = user !== null ? '/home#maya' : '/register'
  const [displayScore, setDisplayScore] = useState(0)
  const [ringOffset,   setRingOffset]   = useState(RING_C)
  const [pillarShown,  setPillarShown]  = useState([false, false, false, false])
  const [pillarWidths, setPillarWidths] = useState([0, 0, 0, 0])

  useEffect(() => {
    if (scoreResult === null) return

    const offset = RING_C - (scoreResult.score / 100) * RING_C
    setTimeout(() => setRingOffset(offset), 120)

    const dur = 1400
    const t0  = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setDisplayScore(Math.round(scoreResult.score * e))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    const scores = [scoreResult.p1, scoreResult.p2, scoreResult.p3, scoreResult.p4]
    setTimeout(() => {
      ;[0, 1, 2, 3].forEach(idx => {
        setTimeout(() => {
          setPillarShown(prev => { const n = [...prev]; n[idx] = true; return n })
          setTimeout(() => {
            setPillarWidths(prev => { const n = [...prev]; n[idx] = scores[idx]; return n })
          }, 60)
        }, idx * 160)
      })
    }, 300)
  }, [scoreResult])

  if (scoreResult === null) {
    const dashLen = RING_C * 0.22
    const gap     = RING_C - dashLen
    return (
      <div className="planea-onboarding-widget">
        <div className="onb-form-card">
          <div className="onb-results-screen show">

            <div className="onb-results-header">
              <div className="onb-results-tag"><SparklesIcon width={13} height={13} /> Tu puntaje Planea</div>
              <div className="onb-skel onb-skel-title" />
            </div>

            <div className="onb-score-display">
              <div className="onb-score-ring-wrap">
                <svg className="onb-loading-ring" viewBox="0 0 156 156">
                  <circle className="onb-ring-bg" cx="78" cy="78" r={RING_R} />
                  <circle
                    className="onb-ring-fill onb-ring-spin"
                    cx="78" cy="78" r={RING_R}
                    style={{
                      strokeDasharray: `${dashLen} ${gap}`,
                      stroke: 'var(--gray-200, #d0d0d0)',
                    }}
                  />
                </svg>
                <div className="onb-score-val">
                  <div className="onb-skel onb-skel-num" />
                  <div className="onb-score-lbl">PUNTAJE</div>
                </div>
              </div>
              <div className="onb-skel onb-skel-badge" />
            </div>

            <div className="onb-pillars-sec">
              <div className="onb-pillars-lbl">Desglose por pilares</div>
              {PILLARS.map((p, i) => (
                <div key={i} className="onb-pillar-row reveal">
                  <div className="onb-pillar-icon" style={{ background: p.bg }}>{p.icon}</div>
                  <div className="onb-pillar-info">
                    <div className="onb-pillar-name">
                      {p.name} <span style={{ fontSize: '.74rem', opacity: 0.6 }}>· {p.weight}</span>
                    </div>
                    <div className="onb-pillar-track">
                      <div className="onb-skel" style={{ height: '100%', borderRadius: 5, width: '100%', animationDelay: `${i * 0.12}s` }} />
                    </div>
                  </div>
                  <div className="onb-skel onb-skel-pillar-pts" />
                </div>
              ))}
            </div>

            <div className="onb-retake-row">
              <div className="onb-skel onb-skel-btn" />
            </div>

          </div>
        </div>
      </div>
    )
  }

  const scoreLabel   = getScoreLabel(scoreResult.score)

  return (
    <div className="planea-onboarding-widget">
      <div className="onb-form-card">
        <div className="onb-results-screen show">

          <div className="onb-results-header">
            <div className="onb-results-tag"><SparklesIcon width={13} height={13} /> Tu puntaje Planea</div>
            <h3 className="onb-results-title">{scoreLabel.desc}</h3>
          </div>

          <div className="onb-score-display">
            <div className="onb-score-ring-wrap">
              <svg className="onb-score-ring-svg" viewBox="0 0 156 156">
                <circle className="onb-ring-bg" cx="78" cy="78" r={RING_R} />
                <circle
                  className="onb-ring-fill"
                  cx="78" cy="78" r={RING_R}
                  style={{
                    strokeDasharray: String(RING_C),
                    strokeDashoffset: String(ringOffset),
                    stroke: scoreLabel.color,
                  }}
                />
              </svg>
              <div className="onb-score-val">
                <div className="onb-score-num">{displayScore}</div>
                <div className="onb-score-lbl">PUNTAJE</div>
              </div>
            </div>
            <div
              className="onb-score-badge"
              style={{
                background: scoreLabel.color + '1a',
                color: scoreLabel.color,
                border: `1px solid ${scoreLabel.color}40`,
              }}
            >
              {scoreLabel.name}
            </div>
          </div>

          <div className="onb-pillars-sec">
            <div className="onb-pillars-lbl">Desglose por pilares</div>
            {PILLARS.map((p, i) => {
              const scores = [scoreResult.p1, scoreResult.p2, scoreResult.p3, scoreResult.p4]
              return (
                <div key={i} className={`onb-pillar-row${pillarShown[i] ? ' reveal' : ''}`}>
                  <div className="onb-pillar-icon" style={{ background: p.bg }}>{p.icon}</div>
                  <div className="onb-pillar-info">
                    <div className="onb-pillar-name">
                      {p.name} <span style={{ fontSize: '.74rem', opacity: 0.6 }}>· {p.weight}</span>
                    </div>
                    <div className="onb-pillar-track">
                      <div
                        className="onb-pillar-fill"
                        style={{
                          background: p.color,
                          width: `${pillarWidths[i]}%`,
                          ['--d' as string]: p.delay,
                        } as React.CSSProperties}
                      />
                    </div>
                  </div>
                  <div className="onb-pillar-pts" style={{ color: p.color }}>{scores[i]}</div>
                </div>
              )
            })}
          </div>

          <div className="onb-retake-row">
            <div className="onb-retake-actions">
              <Link to={recomendacionesHref} className="onb-btn-primary-home">Ver recomendaciones</Link>
              <button className="onb-btn-ghost-dark" onClick={onRetake}>Volver a empezar</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
