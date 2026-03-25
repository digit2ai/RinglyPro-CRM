import React, { useState, useEffect } from 'react';
import api from '../services/api';

const PERIODS = [
  { id: 'mtd', label: 'MTD' },
  { id: 'qtd', label: 'QTD' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All Time' },
];

const SAVINGS_TABS = ['cost', 'time', 'revenue'];

function Sparkline({ data, width = 120, height = 32, color = '#0EA5E9' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const fillPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polygon points={fillPoints} fill={`${color}15`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={parseFloat(points.split(' ').pop().split(',')[0])} cy={parseFloat(points.split(' ').pop().split(',')[1])} r="2.5" fill={color} />
    </svg>
  );
}

function ProjectionChart({ actual, projections, totals }) {
  if (!actual || !projections) return null;
  const allMonths = [...actual, ...projections.optimistic];
  const allValues = [
    ...actual.map(m => m.value),
    ...projections.conservative.map(m => m.value),
    ...projections.baseline.map(m => m.value),
    ...projections.optimistic.map(m => m.value),
  ];
  const maxVal = Math.max(...allValues, 1);
  const W = 800, H = 280, PL = 60, PR = 20, PT = 20, PB = 60;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const totalPoints = allMonths.length;

  const toX = (i) => PL + (i / (totalPoints - 1)) * chartW;
  const toY = (v) => PT + chartH - (v / maxVal) * chartH;

  const makePath = (points) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.idx)},${toY(p.value)}`).join(' ');
  const makeArea = (points) => {
    if (points.length < 2) return '';
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.idx)},${toY(p.value)}`).join(' ');
    return `${line} L${toX(points[points.length - 1].idx)},${toY(0)} L${toX(points[0].idx)},${toY(0)} Z`;
  };

  const actualPts = actual.map((m, i) => ({ idx: i, value: m.value }));
  const baseOffset = actual.length;
  const consPts = [actualPts[actualPts.length - 1], ...projections.conservative.map((m, i) => ({ idx: baseOffset + i, value: m.value }))];
  const basePts = [actualPts[actualPts.length - 1], ...projections.baseline.map((m, i) => ({ idx: baseOffset + i, value: m.value }))];
  const optPts = [actualPts[actualPts.length - 1], ...projections.optimistic.map((m, i) => ({ idx: baseOffset + i, value: m.value }))];

  // Band between conservative and optimistic
  const bandPath = (() => {
    const top = optPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.idx)},${toY(p.value)}`).join(' ');
    const bottom = [...consPts].reverse().map((p, i) => `${i === 0 ? 'L' : 'L'}${toX(p.idx)},${toY(p.value)}`).join(' ');
    return `${top} ${bottom} Z`;
  })();

  // Y-axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => Math.round(maxVal * pct));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {yTicks.map(tick => (
          <g key={tick}>
            <line x1={PL} y1={toY(tick)} x2={W - PR} y2={toY(tick)} stroke="#21262D" strokeWidth="1" />
            <text x={PL - 8} y={toY(tick) + 4} fill="#484F58" fontSize="10" textAnchor="end">${(tick / 1000).toFixed(0)}k</text>
          </g>
        ))}
        {/* Divider line at projection start */}
        <line x1={toX(actual.length - 1)} y1={PT} x2={toX(actual.length - 1)} y2={H - PB} stroke="#30363D" strokeWidth="1" strokeDasharray="4,4" />
        <text x={toX(actual.length - 1)} y={PT - 6} fill="#484F58" fontSize="9" textAnchor="middle">NOW</text>
        {/* Confidence band */}
        <path d={bandPath} fill="#0EA5E908" />
        {/* Conservative line */}
        <path d={makePath(consPts)} fill="none" stroke="#484F58" strokeWidth="1.5" strokeDasharray="4,3" />
        {/* Baseline line */}
        <path d={makePath(basePts)} fill="none" stroke="#0EA5E9" strokeWidth="2" />
        {/* Optimistic line */}
        <path d={makePath(optPts)} fill="none" stroke="#238636" strokeWidth="1.5" strokeDasharray="4,3" />
        {/* Actual line */}
        <path d={makePath(actualPts)} fill="none" stroke="#C8962A" strokeWidth="2.5" />
        <path d={makeArea(actualPts)} fill="#C8962A10" />
        {/* Actual dots */}
        {actualPts.map((p, i) => (
          <circle key={i} cx={toX(p.idx)} cy={toY(p.value)} r="3" fill="#C8962A" />
        ))}
        {/* End labels */}
        <text x={W - PR + 4} y={toY(optPts[optPts.length - 1]?.value || 0) + 3} fill="#238636" fontSize="10" fontWeight="600">${((totals?.optimistic || 0) / 1000).toFixed(0)}k</text>
        <text x={W - PR + 4} y={toY(basePts[basePts.length - 1]?.value || 0) + 3} fill="#0EA5E9" fontSize="10" fontWeight="600">${((totals?.baseline || 0) / 1000).toFixed(0)}k</text>
        <text x={W - PR + 4} y={toY(consPts[consPts.length - 1]?.value || 0) + 3} fill="#484F58" fontSize="10">${((totals?.conservative || 0) / 1000).toFixed(0)}k</text>
        {/* X-axis labels */}
        {allMonths.map((m, i) => (
          i % 2 === 0 && <text key={i} x={toX(i)} y={H - PB + 16} fill="#484F58" fontSize="9" textAnchor="middle">{m.month}</text>
        ))}
      </svg>
      <div style={cs.legend}>
        <span style={cs.legendItem}><span style={{ ...cs.legendDot, background: '#C8962A' }} /> Actual</span>
        <span style={cs.legendItem}><span style={{ ...cs.legendDot, background: '#0EA5E9' }} /> Baseline</span>
        <span style={cs.legendItem}><span style={{ ...cs.legendDot, background: '#238636' }} /> Optimistic</span>
        <span style={cs.legendItem}><span style={{ ...cs.legendDot, background: '#484F58' }} /> Conservative</span>
      </div>
    </div>
  );
}

export default function ROIAnalytics() {
  const [period, setPeriod] = useState('all');
  const [summary, setSummary] = useState(null);
  const [savings, setSavings] = useState(null);
  const [process, setProcess] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingsTab, setSavingsTab] = useState('cost');

  const loadData = async (p) => {
    setLoading(true);
    try {
      const [sumRes, savRes, procRes, predRes] = await Promise.all([
        api.get(`/roi/summary?period=${p}`).catch(() => ({ data: { data: null } })),
        api.get(`/roi/savings?period=${p}`).catch(() => ({ data: { data: null } })),
        api.get(`/roi/process?period=${p}`).catch(() => ({ data: { data: null } })),
        api.get(`/roi/predictions?period=${p}`).catch(() => ({ data: { data: null } })),
      ]);
      setSummary(sumRes.data.data);
      setSavings(savRes.data.data);
      setProcess(procRes.data.data);
      setPredictions(predRes.data.data);
    } catch (err) { console.error('ROI load error:', err); }
    setLoading(false);
  };

  useEffect(() => { loadData(period); }, [period]);

  if (loading) return <div style={s.loading}>Loading ROI Analytics...</div>;

  return (
    <div>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <h2 style={s.title}>ROI & PREDICTIVE ANALYTICS</h2>
          <p style={s.subtitle}>Real-time platform value — cost savings, process improvements & projections</p>
        </div>
        <div style={s.periodTabs}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              style={{ ...s.periodTab, ...(period === p.id ? s.periodTabActive : {}) }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* ── ZONE 1: Impact Hero ── */}
      {summary && (
        <>
          <div style={s.heroGrid}>
            <HeroCard label="Total ROI" value={`$${summary.total_roi.toLocaleString()}`} trend={summary.qoq_change_pct} color="#C8962A" />
            <HeroCard label="Cost Saved" value={`$${summary.cost_saved.toLocaleString()}`} sub="operational savings" color="#238636" />
            <HeroCard label="Time Saved" value={`${summary.time_saved_hours.toLocaleString()} hrs`} sub="staff hours recovered" color="#0EA5E9" />
            <HeroCard label="Margin Lift" value={`+${summary.margin_lift_pct}%`} sub={`13.7% → ${(13.7 + summary.margin_lift_pct).toFixed(1)}% after treatment`} color="#a78bfa" />
          </div>
          <div style={s.metaRow}>
            <MetaBadge label="ROI Multiple" value={`${summary.roi_multiple}x`} color="#C8962A" />
            <MetaBadge label="Payback" value={`${summary.payback_days} days`} color="#238636" />
            <MetaBadge label="Since" value={new Date(summary.platform_start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} color="#0EA5E9" />
          </div>
        </>
      )}

      {/* ── ZONE 2: Savings Breakdown ── */}
      {savings && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h3 style={s.sectionTitle}>SAVINGS BREAKDOWN</h3>
            <div style={s.tabGroup}>
              {SAVINGS_TABS.map(t => (
                <button key={t} onClick={() => setSavingsTab(t)}
                  style={{ ...s.tabBtn, ...(savingsTab === t ? s.tabBtnActive : {}) }}>
                  {t === 'cost' ? 'Cost Savings' : t === 'time' ? 'Time Saved' : 'Revenue Impact'}
                </button>
              ))}
            </div>
          </div>
          <div style={s.totalBar}>
            <span style={s.totalLabel}>Total {savingsTab === 'cost' ? 'Cost Saved' : savingsTab === 'time' ? 'Time Saved' : 'Revenue Impact'}:</span>
            <span style={s.totalValue}>
              {savingsTab === 'cost' && `$${savings.totals.cost.toLocaleString()}`}
              {savingsTab === 'time' && `${savings.totals.time.toLocaleString()} hours`}
              {savingsTab === 'revenue' && `$${savings.totals.revenue.toLocaleString()}`}
            </span>
          </div>
          <div style={s.savingsCards}>
            {savings.categories.map(cat => {
              const val = savingsTab === 'cost' ? cat.cost_saved : savingsTab === 'time' ? cat.time_saved_hours : cat.revenue_impact;
              const maxVal = savingsTab === 'cost' ? savings.totals.cost : savingsTab === 'time' ? savings.totals.time : savings.totals.revenue;
              const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              const displayVal = savingsTab === 'time' ? `${val} hrs` : `$${val.toLocaleString()}`;
              return (
                <div key={cat.id} style={s.savingsRow}>
                  <div style={s.savingsInfo}>
                    <div style={s.savingsLabel}>{cat.label}</div>
                    <div style={s.savingsDesc}>{cat.description}</div>
                  </div>
                  <div style={s.savingsBarWrap}>
                    <div style={s.savingsBarTrack}>
                      <div style={{ ...s.savingsBarFill, width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <div style={s.savingsAmount}>{displayVal}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ZONE 3: Process Improvements ── */}
      {process && (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>PROCESS IMPROVEMENTS</h3>
          <p style={{ color: '#8B949E', fontSize: 13, marginBottom: 16 }}>Before/after comparison — industry baseline vs current AI-powered performance</p>
          <div style={s.processGrid}>
            {process.metrics.map(m => (
              <div key={m.id} style={s.processCard}>
                <div style={s.processLabel}>{m.label}</div>
                <div style={s.beforeAfter}>
                  <div style={s.beforeCol}>
                    <div style={s.baLabel}>Before</div>
                    <div style={s.baValue}>{m.before}{m.before_unit}</div>
                  </div>
                  <div style={s.arrow}>{m.direction === 'down' ? '\u2193' : '\u2191'}</div>
                  <div style={s.afterCol}>
                    <div style={s.baLabel}>Now</div>
                    <div style={{ ...s.baValue, color: m.improvement_pct > 0 ? '#238636' : '#F85149' }}>{m.current}{m.current_unit}</div>
                  </div>
                </div>
                <div style={{
                  ...s.improvBadge,
                  background: m.improvement_pct > 0 ? '#23863622' : '#F8514922',
                  color: m.improvement_pct > 0 ? '#238636' : '#F85149',
                }}>
                  {m.direction === 'down' ? '\u25BC' : '\u25B2'} {Math.abs(m.improvement_pct)}% improvement
                </div>
                <div style={s.sparklineWrap}>
                  <Sparkline data={m.sparkline} color={m.improvement_pct > 0 ? '#238636' : '#F85149'} width={140} height={28} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ZONE 4: Predictive Analytics ── */}
      {predictions && (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>PREDICTIVE ANALYTICS</h3>
          <p style={{ color: '#8B949E', fontSize: 13, marginBottom: 16 }}>12-month savings projection based on current trajectory and adoption rates</p>

          <div style={s.projectionCard}>
            <div style={s.projectionHeader}>
              <span style={s.projectionLabel}>PROJECTED SAVINGS (Next 12 Months)</span>
              <div style={s.projectionTotals}>
                <span style={{ color: '#484F58', fontSize: 12 }}>Conservative: <strong>${(predictions.totals.conservative / 1000).toFixed(0)}k</strong></span>
                <span style={{ color: '#0EA5E9', fontSize: 12 }}>Baseline: <strong>${(predictions.totals.baseline / 1000).toFixed(0)}k</strong></span>
                <span style={{ color: '#238636', fontSize: 12 }}>Optimistic: <strong>${(predictions.totals.optimistic / 1000).toFixed(0)}k</strong></span>
              </div>
            </div>
            <ProjectionChart actual={predictions.actual} projections={predictions.projections} totals={predictions.totals} />
          </div>

          {/* Adoption rates */}
          {predictions.adoption && (
            <div style={s.adoptionRow}>
              <AdoptionGauge label="Rate Intelligence Adoption" value={predictions.adoption.rate_intelligence} />
              <AdoptionGauge label="Carrier Matching Adoption" value={predictions.adoption.carrier_matching} />
            </div>
          )}

          {/* AI Insights */}
          {predictions.insights && predictions.insights.length > 0 && (
            <div style={s.insightsSection}>
              <div style={s.insightsHeader}>
                <span style={s.insightsIcon}>&#9889;</span>
                <span style={s.insightsTitle}>AI-Powered Insights</span>
              </div>
              {predictions.insights.map((insight, i) => (
                <div key={i} style={s.insightCard}>
                  <div style={s.insightTop}>
                    <span style={{
                      ...s.insightType,
                      background: insight.type === 'opportunity' ? '#C8962A22' : insight.type === 'efficiency' ? '#0EA5E922' : insight.type === 'growth' ? '#23863622' : insight.type === 'savings' ? '#a78bfa22' : '#1A4FA822',
                      color: insight.type === 'opportunity' ? '#C8962A' : insight.type === 'efficiency' ? '#0EA5E9' : insight.type === 'growth' ? '#238636' : insight.type === 'savings' ? '#a78bfa' : '#1A4FA8',
                    }}>{insight.type.toUpperCase()}</span>
                    <span style={s.insightImpact}>{insight.impact}</span>
                  </div>
                  <div style={s.insightTitle2}>{insight.title}</div>
                  <div style={s.insightText}>{insight.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeroCard({ label, value, trend, sub, color }) {
  return (
    <div style={s.heroCard}>
      <div style={s.heroLabel}>{label}</div>
      <div style={{ ...s.heroValue, color }}>{value}</div>
      {trend !== undefined && (
        <div style={{ ...s.heroTrend, color: trend >= 0 ? '#238636' : '#F85149' }}>
          {trend >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(trend)}% QoQ
        </div>
      )}
      {sub && <div style={s.heroSub}>{sub}</div>}
    </div>
  );
}

function MetaBadge({ label, value, color }) {
  return (
    <div style={s.metaBadge}>
      <span style={s.metaLabel}>{label}</span>
      <span style={{ ...s.metaValue, color }}>{value}</span>
    </div>
  );
}

function AdoptionGauge({ label, value }) {
  const clamp = Math.min(100, Math.max(0, value));
  const color = clamp >= 70 ? '#238636' : clamp >= 40 ? '#C8962A' : '#F85149';
  return (
    <div style={s.adoptionCard}>
      <div style={s.adoptionLabel}>{label}</div>
      <div style={s.adoptionBarTrack}>
        <div style={{ ...s.adoptionBarFill, width: `${clamp}%`, background: color }} />
      </div>
      <div style={{ ...s.adoptionValue, color }}>{clamp}%</div>
    </div>
  );
}

const cs = {
  legend: { display: 'flex', gap: 16, justifyContent: 'center', padding: '12px 0 0', flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8B949E' },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
};

const s = {
  loading: { padding: 60, textAlign: 'center', color: '#8B949E', fontSize: 16 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 28, color: '#C8962A', margin: 0 },
  subtitle: { color: '#8B949E', fontSize: 14, marginTop: 2 },
  periodTabs: { display: 'flex', gap: 6 },
  periodTab: { padding: '7px 16px', background: '#161B22', border: '1px solid #21262D', borderRadius: 8, color: '#8B949E', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  periodTabActive: { background: '#0EA5E922', borderColor: '#0EA5E9', color: '#0EA5E9' },
  // Hero
  heroGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 },
  heroCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: '20px 16px', textAlign: 'center' },
  heroLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 600 },
  heroValue: { fontSize: 32, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, lineHeight: 1 },
  heroTrend: { fontSize: 12, fontWeight: 600, marginTop: 6 },
  heroSub: { fontSize: 11, color: '#484F58', marginTop: 4 },
  metaRow: { display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' },
  metaBadge: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: '#161B22', border: '1px solid #21262D', borderRadius: 20 },
  metaLabel: { fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  metaValue: { fontSize: 14, fontWeight: 700 },
  // Sections
  section: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24, marginBottom: 20 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', margin: 0 },
  tabGroup: { display: 'flex', gap: 6 },
  tabBtn: { padding: '5px 14px', background: 'none', border: '1px solid #30363D', borderRadius: 20, color: '#8B949E', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tabBtnActive: { background: '#0EA5E922', borderColor: '#0EA5E9', color: '#0EA5E9' },
  totalBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#0D1117', borderRadius: 8, marginBottom: 16 },
  totalLabel: { fontSize: 12, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  totalValue: { fontSize: 20, fontWeight: 700, color: '#E6EDF3', fontFamily: "'Bebas Neue',sans-serif" },
  // Savings
  savingsCards: { display: 'flex', flexDirection: 'column', gap: 10 },
  savingsRow: { display: 'flex', gap: 16, alignItems: 'center', padding: '12px 14px', background: '#0D1117', borderRadius: 8, flexWrap: 'wrap' },
  savingsInfo: { flex: '1 1 240px', minWidth: 200 },
  savingsLabel: { fontSize: 14, fontWeight: 600, color: '#E6EDF3', marginBottom: 2 },
  savingsDesc: { fontSize: 11, color: '#8B949E', lineHeight: 1.4 },
  savingsBarWrap: { flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 12 },
  savingsBarTrack: { flex: 1, height: 8, background: '#21262D', borderRadius: 4, overflow: 'hidden' },
  savingsBarFill: { height: '100%', background: 'linear-gradient(90deg, #0EA5E9, #238636)', borderRadius: 4, transition: 'width 0.8s ease' },
  savingsAmount: { fontSize: 14, fontWeight: 700, color: '#E6EDF3', minWidth: 80, textAlign: 'right', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 0.5 },
  // Process
  processGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  processCard: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 10, padding: 16, textAlign: 'center' },
  processLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 12 },
  beforeAfter: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 },
  beforeCol: { textAlign: 'center' },
  afterCol: { textAlign: 'center' },
  baLabel: { fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  baValue: { fontSize: 22, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", color: '#8B949E' },
  arrow: { fontSize: 18, color: '#30363D', fontWeight: 700 },
  improvBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, marginBottom: 8 },
  sparklineWrap: { display: 'flex', justifyContent: 'center', marginTop: 4 },
  // Predictions
  projectionCard: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 10, padding: 20, marginBottom: 16 },
  projectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  projectionLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 },
  projectionTotals: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  adoptionRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 },
  adoptionCard: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 10, padding: 16 },
  adoptionLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 10 },
  adoptionBarTrack: { height: 8, background: '#21262D', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  adoptionBarFill: { height: '100%', borderRadius: 4, transition: 'width 0.8s ease' },
  adoptionValue: { fontSize: 24, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", textAlign: 'center' },
  // Insights
  insightsSection: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 10, padding: 20 },
  insightsHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  insightsIcon: { fontSize: 18 },
  insightsTitle: { fontSize: 14, fontWeight: 700, color: '#E6EDF3' },
  insightCard: { padding: '14px 16px', background: '#161B22', border: '1px solid #21262D', borderRadius: 8, marginBottom: 10 },
  insightTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  insightType: { padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 },
  insightImpact: { fontSize: 13, fontWeight: 700, color: '#238636' },
  insightTitle2: { fontSize: 14, fontWeight: 600, color: '#E6EDF3', marginBottom: 4 },
  insightText: { fontSize: 13, color: '#8B949E', lineHeight: 1.5 },
};
