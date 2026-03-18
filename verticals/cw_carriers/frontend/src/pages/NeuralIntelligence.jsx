import React, { useState, useEffect } from 'react';
import api from '../services/api';

const SEVERITY_COLORS = { CRITICAL: '#F85149', WARNING: '#C8962A', OPPORTUNITY: '#238636' };

export default function NeuralIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedTreatment, setExpandedTreatment] = useState(null);
  const [activatedTreatments, setActivatedTreatments] = useState({});
  const [activating, setActivating] = useState(null);

  // Load active treatments on mount
  useEffect(() => {
    api.get('/neural/treatments').then(r => {
      const map = {};
      (r.data.treatments || []).forEach(t => { map[t.treatment_type] = t.is_active; });
      setActivatedTreatments(map);
    }).catch(() => {});
  }, []);

  const activateTreatment = async (treatmentType) => {
    const isCurrentlyActive = activatedTreatments[treatmentType];
    setActivating(treatmentType);
    try {
      await api.post('/neural/treatments/activate', {
        treatment_type: treatmentType,
        is_active: !isCurrentlyActive
      });
      setActivatedTreatments(prev => ({ ...prev, [treatmentType]: !isCurrentlyActive }));
    } catch (err) {
      console.error('Treatment activation error:', err);
    }
    setActivating(null);
  };

  useEffect(() => {
    api.get('/neural/dashboard')
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={s.loading}>Loading Neural Intelligence...</div>;
  if (!data || !data.success) return <div style={s.loading}>Unable to load Neural data. Ensure HubSpot is connected.</div>;

  const filteredFindings = data.findings.filter(f => {
    if (filter === 'all') return true;
    if (filter === 'critical') return f.severity === 'CRITICAL';
    if (filter === 'warning') return f.severity === 'WARNING';
    if (filter === 'opportunity') return f.severity === 'OPPORTUNITY';
    return true;
  });

  const scoreColor = data.healthScore >= 80 ? '#238636' : data.healthScore >= 65 ? '#06b6d4' : data.healthScore >= 45 ? '#C8962A' : '#F85149';

  return (
    <div>
      <h2 style={s.title}>NEURAL INTELLIGENCE</h2>
      <p style={s.subtitle}>AI-powered business health monitoring — powered by HubSpot</p>

      {/* Hero: Health Score + Revenue */}
      <div style={s.heroRow}>
        <div style={s.scoreCard}>
          <div style={s.scoreRing}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="60" fill="none" stroke="#21262D" strokeWidth="10" />
              <circle cx="70" cy="70" r="60" fill="none" stroke={scoreColor} strokeWidth="10"
                strokeDasharray={`${(data.healthScore / 100) * 377} 377`}
                strokeLinecap="round" transform="rotate(-90 70 70)" style={{ transition: 'stroke-dasharray 1s ease' }} />
            </svg>
            <div style={s.scoreValue}>{data.healthScore}</div>
          </div>
          <div style={s.scoreLabel}>{data.scoreLabel}</div>
          <div style={s.scoreTrend}>
            {data.trend.direction === 'up' ? '↑' : '↓'} {data.trend.points} pts vs last {data.trend.period}
          </div>
        </div>
        <div style={s.revenueCards}>
          <div style={s.revCard}>
            <div style={s.revLabel}>Revenue at Risk</div>
            <div style={{ ...s.revValue, color: '#F85149' }}>${data.revenueAtRisk.toLocaleString()}</div>
          </div>
          <div style={s.revCard}>
            <div style={s.revLabel}>Recovery Potential</div>
            <div style={{ ...s.revValue, color: '#238636' }}>${data.recoveryPotential.toLocaleString()}</div>
          </div>
          {data.hubspot && (
            <>
              <div style={s.revCard}>
                <div style={s.revLabel}>HubSpot Pipeline</div>
                <div style={{ ...s.revValue, color: '#ff7a59' }}>${Number(data.hubspot.pipeline_value).toLocaleString()}</div>
              </div>
              <div style={s.revCard}>
                <div style={s.revLabel}>Won Revenue</div>
                <div style={{ ...s.revValue, color: '#238636' }}>${Number(data.hubspot.won_revenue).toLocaleString()}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Connections */}
      <div style={s.connectionsRow}>
        {data.connections.map((c, i) => (
          <div key={i} style={{ ...s.connBadge, borderColor: c.status === 'connected' ? '#238636' : '#484F58' }}>
            <span style={{ ...s.connDot, background: c.status === 'connected' ? '#238636' : '#484F58' }} />
            {c.name}
          </div>
        ))}
      </div>

      {/* Panels */}
      <div style={s.panelGrid}>
        {data.panels.map((panel, i) => (
          <div key={i} style={s.panelCard}>
            <div style={s.panelHeader}>
              <span style={s.panelName}>{panel.name}</span>
              <span style={{ ...s.panelScore, color: panel.score >= 70 ? '#238636' : panel.score >= 45 ? '#C8962A' : '#F85149' }}>{panel.score}</span>
            </div>
            <div style={s.panelBar}>
              <div style={{ ...s.panelBarFill, width: `${panel.score}%`, background: panel.score >= 70 ? '#238636' : panel.score >= 45 ? '#C8962A' : '#F85149' }} />
            </div>
            <div style={s.panelFinding}>{panel.topFinding}</div>
            <div style={s.panelSource}>{panel.source}</div>
          </div>
        ))}
      </div>

      {/* Findings */}
      <div style={s.findingsSection}>
        <div style={s.findingsHeader}>
          <h3 style={s.findingsTitle}>Findings & Recommendations</h3>
          <div style={s.filterTabs}>
            {['all', 'critical', 'warning', 'opportunity'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ ...s.filterTab, ...(filter === f ? s.filterTabActive : {}) }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredFindings.map((finding, i) => (
          <div key={i} style={s.findingCard}>
            <div style={s.findingTop}>
              <span style={{ ...s.severityBadge, background: `${SEVERITY_COLORS[finding.severity]}22`, color: SEVERITY_COLORS[finding.severity], borderColor: `${SEVERITY_COLORS[finding.severity]}44` }}>
                {finding.severity}
              </span>
              <span style={s.findingSource}>{finding.source}</span>
            </div>
            <div style={s.findingTitle}>{finding.title}</div>
            <div style={s.findingExpl}>{finding.explanation}</div>
            {finding.dollarImpact && <div style={s.findingImpact}>{finding.dollarImpact}</div>}
            {finding.treatment && (
              <div style={s.treatmentArea}>
                <button onClick={() => setExpandedTreatment(expandedTreatment === finding.id ? null : finding.id)}
                  style={s.treatmentBtn}>
                  {expandedTreatment === finding.id ? 'Hide Workflow' : 'Show Fix Workflow'}
                </button>
                {expandedTreatment === finding.id && (
                  <div style={s.treatmentWorkflow}>
                    {finding.treatment.workflow.map((step, si) => (
                      <div key={si} style={s.workflowStep}>
                        <span style={{ ...s.stepBadge,
                          background: step.type === 'trigger' ? '#1A4FA822' : step.type === 'condition' ? '#C8962A22' : '#23863622',
                          color: step.type === 'trigger' ? '#1A4FA8' : step.type === 'condition' ? '#C8962A' : '#238636'
                        }}>{step.type.toUpperCase()}</span>
                        <span style={s.stepText}>{step.text}</span>
                      </div>
                    ))}
                    {finding.treatment.projection && (
                      <div style={s.projection}>Expected: {finding.treatment.projection}</div>
                    )}
                    {finding.treatment.treatment_type && (
                      <button
                        onClick={() => activateTreatment(finding.treatment.treatment_type)}
                        disabled={activating === finding.treatment.treatment_type}
                        style={{
                          ...s.activateBtn,
                          ...(activatedTreatments[finding.treatment.treatment_type] ? s.activeBtnActive : {})
                        }}>
                        {activating === finding.treatment.treatment_type ? 'Processing...'
                          : activatedTreatments[finding.treatment.treatment_type] ? '\u2713 Workflow Active — Click to Deactivate'
                          : '\u26A1 Activate Workflow'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  loading: { padding: 40, textAlign: 'center', color: '#8B949E', fontSize: 16 },
  title: { fontSize: 28, color: '#C8962A' },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 20 },
  heroRow: { display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' },
  scoreCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24, textAlign: 'center', minWidth: 180 },
  scoreRing: { position: 'relative', width: 140, height: 140, margin: '0 auto 12px' },
  scoreValue: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 36, fontWeight: 800, color: '#E6EDF3' },
  scoreLabel: { fontSize: 16, fontWeight: 700, color: '#E6EDF3', marginBottom: 4 },
  scoreTrend: { fontSize: 12, color: '#8B949E' },
  revenueCards: { flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  revCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: '14px 16px' },
  revLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', marginBottom: 4 },
  revValue: { fontSize: 22, fontWeight: 700 },
  connectionsRow: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  connBadge: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid', borderRadius: 20, fontSize: 12, color: '#8B949E' },
  connDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  panelGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 },
  panelCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 16 },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  panelName: { fontSize: 12, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' },
  panelScore: { fontSize: 20, fontWeight: 800 },
  panelBar: { height: 4, background: '#21262D', borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
  panelBarFill: { height: '100%', borderRadius: 2, transition: 'width 1s ease' },
  panelFinding: { fontSize: 12, color: '#E6EDF3', lineHeight: 1.4, marginBottom: 4 },
  panelSource: { fontSize: 10, color: '#484F58' },
  findingsSection: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 20 },
  findingsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  findingsTitle: { fontSize: 18, color: '#E6EDF3', margin: 0 },
  filterTabs: { display: 'flex', gap: 6 },
  filterTab: { padding: '5px 12px', border: '1px solid #30363D', borderRadius: 20, fontSize: 11, color: '#8B949E', background: 'none', cursor: 'pointer' },
  filterTabActive: { background: '#1A4FA822', color: '#1A4FA8', borderColor: '#1A4FA844' },
  findingCard: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 10, padding: 16, marginBottom: 12 },
  findingTop: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  severityBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: '1px solid', textTransform: 'uppercase' },
  findingSource: { fontSize: 10, color: '#484F58' },
  findingTitle: { fontSize: 15, fontWeight: 600, color: '#E6EDF3', marginBottom: 6 },
  findingExpl: { fontSize: 13, color: '#8B949E', lineHeight: 1.5, marginBottom: 6 },
  findingImpact: { fontSize: 13, fontWeight: 600, color: '#C8962A', marginBottom: 8 },
  treatmentArea: { marginTop: 8 },
  treatmentBtn: { padding: '6px 14px', background: '#1A4FA822', border: '1px solid #1A4FA844', borderRadius: 6, color: '#1A4FA8', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  treatmentWorkflow: { marginTop: 12, padding: 12, background: '#161B2288', borderRadius: 8 },
  workflowStep: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  stepBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 2 },
  stepText: { fontSize: 13, color: '#E6EDF3', lineHeight: 1.4 },
  projection: { fontSize: 12, color: '#238636', fontWeight: 600, marginTop: 8, padding: '6px 10px', background: '#23863622', borderRadius: 6 },
  activateBtn: { marginTop: 12, width: '100%', padding: '10px 16px', background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.3, transition: 'all 0.2s' },
  activeBtnActive: { background: '#238636', color: '#fff' },
};
