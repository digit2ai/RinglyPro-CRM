import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const STAGES = [
  { key: 'contract_received', label: 'Contract Received', icon: '1' },
  { key: 'rate_analysis', label: 'Rate Analysis', icon: '2' },
  { key: 'carrier_match', label: 'Carrier Match', icon: '3' },
  { key: 'load_match', label: 'Load Match', icon: '4' },
  { key: 'carrier_outreach', label: 'Carrier Outreach', icon: '5' },
  { key: 'rate_confirmation', label: 'Rate Confirmation', icon: '6' },
  { key: 'transit_tracking', label: 'Transit Tracking', icon: '7' },
  { key: 'delivery_billing', label: 'Delivery & Billing', icon: '8' },
];

const STATUS_COLORS = {
  running: '#0EA5E9', paused: '#F59E0B', completed: '#238636', failed: '#EF4444', cancelled: '#6B7280'
};

export default function Autopilot() {
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState({});
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active'); // active | history
  const [selectedRun, setSelectedRun] = useState(null);
  const [stageDetail, setStageDetail] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [startLoadId, setStartLoadId] = useState('');
  const [startMode, setStartMode] = useState('autopilot');
  const [openLoads, setOpenLoads] = useState([]);
  const [events, setEvents] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [runsRes, statsRes, configRes] = await Promise.all([
        api.get('/pipeline-auto/runs?limit=100').catch(() => ({ data: { data: [] } })),
        api.get('/pipeline-auto/stats').catch(() => ({ data: { data: {} } })),
        api.get('/pipeline-auto/config').catch(() => ({ data: { data: null } })),
      ]);
      setRuns(runsRes.data.data || []);
      setStats(statsRes.data.data || {});
      setConfig(configRes.data.data || null);
      setLoading(false);
    } catch { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 8000); return () => clearInterval(iv); }, [fetchData]);

  const activeRuns = runs.filter(r => ['running', 'paused', 'failed'].includes(r.status));
  const historyRuns = runs.filter(r => ['completed', 'cancelled'].includes(r.status));

  async function handleAction(runId, action, body) {
    try {
      if (action === 'start') {
        await api.post('/pipeline-auto/runs', body);
      } else {
        await api.put(`/pipeline-auto/runs/${runId}/${action}`, body || {});
      }
      fetchData();
    } catch (e) { console.error(e); }
  }

  async function handleStartPipeline() {
    await handleAction(null, 'start', { load_id: startLoadId ? parseInt(startLoadId) : null, mode: startMode });
    setShowStart(false);
    setStartLoadId('');
  }

  async function handleConfigSave(newConfig) {
    try {
      await api.put('/pipeline-auto/config', newConfig);
      fetchData();
      setShowConfig(false);
    } catch (e) { console.error(e); }
  }

  async function loadEvents(runId) {
    try {
      const res = await api.get(`/pipeline-auto/runs/${runId}/events`);
      setEvents(res.data.data || []);
    } catch { setEvents([]); }
  }

  async function fetchOpenLoads() {
    try {
      const res = await api.get('/loads?status=open&limit=20');
      setOpenLoads(res.data.data || []);
    } catch { setOpenLoads([]); }
  }

  function getStageStatus(run, stageKey) {
    const stageIdx = STAGES.findIndex(s => s.key === stageKey);
    const currentIdx = STAGES.findIndex(s => s.key === run.current_stage);
    const tsField = `ts_${stageKey}`;
    const resultField = `result_${stageKey}`;

    if (run.status === 'completed' && run[tsField]) return 'completed';
    if (run.status === 'cancelled') {
      return run[tsField] ? 'completed' : 'cancelled';
    }
    if (stageKey === run.current_stage) {
      if (run.status === 'paused') return 'paused';
      if (run.status === 'failed') return 'failed';
      if (run[tsField]) return 'completed';
      return 'active';
    }
    if (run[tsField]) return 'completed';
    if (stageIdx < currentIdx) return 'completed';
    return 'pending';
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8B949E' }}>Loading Autopilot...</div>;

  return (
    <div>
      <h2 style={s.title}>AUTOPILOT MODE</h2>
      <p style={s.subtitle}>Automated Broker Workflow Engine -- 8-Stage Pipeline Orchestration</p>

      {/* Stats Bar */}
      <div style={s.statsGrid}>
        {[
          { label: 'Active Pipelines', value: stats.active || 0, color: '#0EA5E9' },
          { label: 'Paused', value: stats.paused || 0, color: '#F59E0B' },
          { label: 'Completed Today', value: stats.completed_today || 0, color: '#238636' },
          { label: 'Success Rate', value: `${stats.success_rate || 0}%`, color: stats.success_rate >= 70 ? '#238636' : '#F59E0B' },
          { label: 'Avg Time', value: stats.avg_completion_seconds ? `${Math.round(stats.avg_completion_seconds / 60)}m` : '--', color: '#8B949E' },
          { label: 'Total Runs', value: stats.total_runs || 0, color: '#8957E5' },
        ].map(c => (
          <div key={c.label} style={s.statCard}>
            <div style={{ ...s.statValue, color: c.color }}>{c.value}</div>
            <div style={s.statLabel}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={s.controls}>
        <div style={s.controlLeft}>
          <button onClick={() => { fetchOpenLoads(); setShowStart(true); }} style={s.btnPrimary}>+ Start Pipeline</button>
          <button onClick={() => setShowConfig(true)} style={s.btnOutline}>Configure Rules</button>
        </div>
        <div style={s.tabs}>
          <button onClick={() => setTab('active')} style={tab === 'active' ? s.tabActive : s.tabBtn}>Active ({activeRuns.length})</button>
          <button onClick={() => setTab('history')} style={tab === 'history' ? s.tabActive : s.tabBtn}>History ({historyRuns.length})</button>
        </div>
      </div>

      {/* Active Runs */}
      {tab === 'active' && (
        <div style={s.runsList}>
          {activeRuns.length === 0 && <div style={s.emptyState}>No active pipelines. Start one to begin automated brokering.</div>}
          {activeRuns.map(run => (
            <RunCard key={run.id} run={run} onAction={handleAction} onStageClick={(stage) => {
              const resultField = `result_${stage}`;
              setStageDetail({ stage, data: run[resultField], run });
            }} onEvents={() => { loadEvents(run.id); setSelectedRun(run); }} />
          ))}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div style={s.runsList}>
          {historyRuns.length === 0 && <div style={s.emptyState}>No completed or cancelled runs yet.</div>}
          {historyRuns.map(run => (
            <RunCard key={run.id} run={run} onAction={handleAction} onStageClick={(stage) => {
              const resultField = `result_${stage}`;
              setStageDetail({ stage, data: run[resultField], run });
            }} onEvents={() => { loadEvents(run.id); setSelectedRun(run); }} />
          ))}
        </div>
      )}

      {/* Stage Detail Modal */}
      {stageDetail && (
        <Modal onClose={() => setStageDetail(null)} title={`Stage: ${stageDetail.stage.replace(/_/g, ' ').toUpperCase()}`}>
          <pre style={s.jsonPre}>{JSON.stringify(stageDetail.data || {}, null, 2)}</pre>
        </Modal>
      )}

      {/* Events Modal */}
      {selectedRun && (
        <Modal onClose={() => { setSelectedRun(null); setEvents([]); }} title={`Events: Run #${selectedRun.id}`}>
          {events.length === 0 && <div style={s.emptyState}>No events recorded.</div>}
          {events.map((ev, i) => (
            <div key={i} style={s.eventRow}>
              <span style={{ ...s.eventType, color: ev.event_type === 'stage_completed' ? '#238636' : ev.event_type === 'paused' ? '#F59E0B' : ev.event_type === 'stage_failed' ? '#EF4444' : '#8B949E' }}>
                {ev.event_type}
              </span>
              <span style={s.eventStage}>{ev.stage || '--'}</span>
              <span style={s.eventTime}>{new Date(ev.created_at).toLocaleString()}</span>
              <span style={s.eventBy}>{ev.triggered_by}</span>
            </div>
          ))}
        </Modal>
      )}

      {/* Config Modal */}
      {showConfig && config && (
        <ConfigModal config={config} onClose={() => setShowConfig(false)} onSave={handleConfigSave} />
      )}

      {/* Start Pipeline Modal */}
      {showStart && (
        <Modal onClose={() => setShowStart(false)} title="Start New Pipeline">
          <div style={s.formGroup}>
            <label style={s.formLabel}>Load ID</label>
            <select value={startLoadId} onChange={e => setStartLoadId(e.target.value)} style={s.formInput}>
              <option value="">-- Select load or leave empty --</option>
              {openLoads.map(l => (
                <option key={l.id} value={l.id}>{l.load_ref || `#${l.id}`} - {l.origin} to {l.destination}</option>
              ))}
            </select>
            <input type="number" placeholder="Or enter Load ID manually" value={startLoadId} onChange={e => setStartLoadId(e.target.value)} style={{ ...s.formInput, marginTop: 8 }} />
          </div>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Mode</label>
            <select value={startMode} onChange={e => setStartMode(e.target.value)} style={s.formInput}>
              <option value="autopilot">Autopilot</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <button onClick={handleStartPipeline} style={s.btnPrimary}>Launch Pipeline</button>
        </Modal>
      )}
    </div>
  );
}

// ── Run Card Component ──────────────────────────────────────────

function RunCard({ run, onAction, onStageClick, onEvents }) {
  return (
    <div style={s.runCard}>
      <div style={s.runHeader}>
        <div style={s.runInfo}>
          <span style={s.runId}>Run #{run.id}</span>
          <span style={{ ...s.statusBadge, background: STATUS_COLORS[run.status] + '22', color: STATUS_COLORS[run.status] }}>{run.status.toUpperCase()}</span>
          <span style={{ ...s.modeBadge, background: run.mode === 'autopilot' ? '#0EA5E922' : '#8957E522', color: run.mode === 'autopilot' ? '#0EA5E9' : '#8957E5' }}>{run.mode}</span>
        </div>
        <div style={s.runMeta}>
          {run.load_ref && <span style={s.metaItem}>{run.load_ref}</span>}
          <span style={s.metaItem}>{new Date(run.started_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Stepper */}
      <div style={s.stepper}>
        {STAGES.map((stage, idx) => {
          const status = getStageStatus(run, stage.key);
          const stageColor = status === 'completed' ? '#238636' : status === 'active' ? '#0EA5E9' : status === 'paused' ? '#F59E0B' : status === 'failed' ? '#EF4444' : '#30363D';
          const tsField = `ts_${stage.key}`;
          const hasData = run[`result_${stage.key}`] && Object.keys(run[`result_${stage.key}`]).length > 0;

          return (
            <div key={stage.key} style={s.stepRow} onClick={() => hasData && onStageClick(stage.key)}>
              <div style={s.stepLeft}>
                <div style={{ ...s.stepDot, background: stageColor, ...(status === 'active' ? { boxShadow: `0 0 8px ${stageColor}`, animation: 'pulse 2s infinite' } : {}), ...(status === 'pending' ? { border: '2px dashed #30363D', background: 'transparent' } : {}) }}>
                  {status === 'completed' && <span style={{ fontSize: 10, color: '#fff' }}>OK</span>}
                  {status === 'active' && <span style={{ fontSize: 8, color: '#fff' }}>...</span>}
                  {status === 'paused' && <span style={{ fontSize: 9, color: '#000' }}>||</span>}
                  {status === 'failed' && <span style={{ fontSize: 10, color: '#fff' }}>!</span>}
                </div>
                {idx < STAGES.length - 1 && <div style={{ ...s.stepLine, background: status === 'completed' ? '#238636' : '#21262D' }} />}
              </div>
              <div style={s.stepContent}>
                <div style={s.stepLabel}>
                  <span style={{ color: stageColor, fontWeight: 600 }}>{stage.label}</span>
                  {run[tsField] && <span style={s.stepTime}>{new Date(run[tsField]).toLocaleTimeString()}</span>}
                </div>
                {status === 'paused' && run.pause_reason && (
                  <div style={s.pauseReason}>{run.pause_reason}</div>
                )}
                {hasData && (
                  <div style={s.stepSummary}>
                    <StageResultSummary stageKey={stage.key} data={run[`result_${stage.key}`]} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={s.runActions}>
        {run.status === 'running' && <button onClick={() => onAction(run.id, 'pause')} style={s.btnSmall}>Pause</button>}
        {run.status === 'paused' && <button onClick={() => onAction(run.id, 'resume')} style={{ ...s.btnSmall, background: '#238636' }}>Resume</button>}
        {run.status === 'failed' && <button onClick={() => onAction(run.id, 'advance')} style={{ ...s.btnSmall, background: '#F59E0B' }}>Retry</button>}
        {run.mode === 'manual' && run.status === 'running' && <button onClick={() => onAction(run.id, 'advance')} style={{ ...s.btnSmall, background: '#0EA5E9' }}>Advance</button>}
        <button onClick={() => onAction(run.id, 'mode', { mode: run.mode === 'autopilot' ? 'manual' : 'autopilot' })} style={s.btnSmallOutline}>
          Switch to {run.mode === 'autopilot' ? 'Manual' : 'Autopilot'}
        </button>
        <button onClick={onEvents} style={s.btnSmallOutline}>Events</button>
        {['running', 'paused'].includes(run.status) && (
          <button onClick={() => onAction(run.id, 'cancel')} style={{ ...s.btnSmallOutline, borderColor: '#EF4444', color: '#EF4444' }}>Cancel</button>
        )}
      </div>
    </div>
  );
}

function getStageStatus(run, stageKey) {
  const stageIdx = STAGES.findIndex(s => s.key === stageKey);
  const currentIdx = STAGES.findIndex(s => s.key === run.current_stage);
  const tsField = `ts_${stageKey}`;

  if (run.status === 'completed' && run[tsField]) return 'completed';
  if (run.status === 'cancelled') return run[tsField] ? 'completed' : 'cancelled';
  if (stageKey === run.current_stage) {
    if (run.status === 'paused') return 'paused';
    if (run.status === 'failed') return 'failed';
    if (run[tsField]) return 'completed';
    return 'active';
  }
  if (run[tsField]) return 'completed';
  if (stageIdx < currentIdx) return 'completed';
  return 'pending';
}

// ── Stage Result Summary ────────────────────────────────────────

function StageResultSummary({ stageKey, data }) {
  if (!data || Object.keys(data).length === 0) return null;
  const summaryStyle = { fontSize: 11, color: '#8B949E', marginTop: 2 };

  switch (stageKey) {
    case 'contract_received':
      return <div style={summaryStyle}>{data.origin} to {data.destination} | {data.equipment || 'dry_van'}</div>;
    case 'rate_analysis':
      return <div style={summaryStyle}>
        {data.recommendation ? `Buy: $${data.recommendation.suggested_buy_rate} | Sell: $${data.recommendation.suggested_sell_rate} | ${data.confidence} confidence` : data.pricing_method}
      </div>;
    case 'carrier_match':
      return <div style={summaryStyle}>{data.qualifying_carriers || 0} carriers qualified | {data.total_evaluated || 0} evaluated</div>;
    case 'load_match':
      return <div style={summaryStyle}>{data.total_pairs_found || 0} pairs found | {data.auto_accepted || 0} auto-accepted</div>;
    case 'carrier_outreach':
      return <div style={summaryStyle}>{data.carriers_contacted || 0} carriers contacted via {data.outreach_method || 'email'}</div>;
    case 'rate_confirmation':
      return <div style={summaryStyle}>{data.rate_con_number} | Margin: {data.margin_pct}%</div>;
    case 'transit_tracking':
      return <div style={summaryStyle}>Check calls every {data.check_call_interval_hours}hrs | {data.scheduled_calls?.length || 0} scheduled</div>;
    case 'delivery_billing':
      return <div style={summaryStyle}>P&L: ${data.final_pnl?.gross_profit} ({data.final_pnl?.margin_pct}% margin)</div>;
    default:
      return null;
  }
}

// ── Config Modal ────────────────────────────────────────────────

function ConfigModal({ config, onClose, onSave }) {
  const rules = typeof config.stage_rules === 'string' ? JSON.parse(config.stage_rules) : (config.stage_rules || {});
  const [formRules, setFormRules] = useState(rules);
  const [minMargin, setMinMargin] = useState(config.min_margin_pct || 10);
  const [targetMargin, setTargetMargin] = useState(config.target_margin_pct || 15);
  const [maxBook, setMaxBook] = useState(config.max_auto_book_amount || 25000);
  const [enabled, setEnabled] = useState(config.enabled !== false);

  function toggleStageAuto(stageKey) {
    setFormRules(prev => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], auto_advance: !(prev[stageKey]?.auto_advance) }
    }));
  }

  function updateStageRule(stageKey, field, value) {
    setFormRules(prev => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], [field]: value }
    }));
  }

  return (
    <Modal onClose={onClose} title="Autopilot Configuration" wide>
      <div style={s.configGrid}>
        <div style={s.configSection}>
          <h4 style={s.configSectionTitle}>Global Settings</h4>
          <label style={s.configRow}>
            <span>Autopilot Enabled</span>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          </label>
          <label style={s.configRow}>
            <span>Min Margin %</span>
            <input type="number" value={minMargin} onChange={e => setMinMargin(parseFloat(e.target.value))} style={s.configInput} />
          </label>
          <label style={s.configRow}>
            <span>Target Margin %</span>
            <input type="number" value={targetMargin} onChange={e => setTargetMargin(parseFloat(e.target.value))} style={s.configInput} />
          </label>
          <label style={s.configRow}>
            <span>Max Auto-Book ($)</span>
            <input type="number" value={maxBook} onChange={e => setMaxBook(parseFloat(e.target.value))} style={s.configInput} />
          </label>
        </div>

        <div style={s.configSection}>
          <h4 style={s.configSectionTitle}>Stage Rules</h4>
          {STAGES.map(stage => {
            const sr = formRules[stage.key] || {};
            return (
              <div key={stage.key} style={s.stageRuleRow}>
                <label style={s.configRow}>
                  <span style={{ fontWeight: 600 }}>{stage.label}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    <input type="checkbox" checked={sr.auto_advance !== false} onChange={() => toggleStageAuto(stage.key)} /> Auto
                  </label>
                </label>
                {stage.key === 'rate_analysis' && (
                  <>
                    <label style={s.configSubRow}>
                      <span>Pause if above market %</span>
                      <input type="number" value={sr.pause_if_above_market_pct || 20} onChange={e => updateStageRule(stage.key, 'pause_if_above_market_pct', parseInt(e.target.value))} style={s.configInputSm} />
                    </label>
                    <label style={s.configSubRow}>
                      <span>Pause if no history</span>
                      <input type="checkbox" checked={sr.pause_if_no_history !== false} onChange={e => updateStageRule(stage.key, 'pause_if_no_history', e.target.checked)} />
                    </label>
                  </>
                )}
                {stage.key === 'carrier_match' && (
                  <>
                    <label style={s.configSubRow}>
                      <span>Min carrier score</span>
                      <input type="number" value={sr.min_carrier_score || 40} onChange={e => updateStageRule(stage.key, 'min_carrier_score', parseInt(e.target.value))} style={s.configInputSm} />
                    </label>
                    <label style={s.configSubRow}>
                      <span>Min carriers above threshold</span>
                      <input type="number" value={sr.min_carriers_above_threshold || 3} onChange={e => updateStageRule(stage.key, 'min_carriers_above_threshold', parseInt(e.target.value))} style={s.configInputSm} />
                    </label>
                  </>
                )}
                {stage.key === 'carrier_outreach' && (
                  <>
                    <label style={s.configSubRow}>
                      <span>Use Rachel Voice</span>
                      <input type="checkbox" checked={sr.use_rachel_voice || false} onChange={e => updateStageRule(stage.key, 'use_rachel_voice', e.target.checked)} />
                    </label>
                    <label style={s.configSubRow}>
                      <span>Max outreach attempts</span>
                      <input type="number" value={sr.max_outreach_attempts || 5} onChange={e => updateStageRule(stage.key, 'max_outreach_attempts', parseInt(e.target.value))} style={s.configInputSm} />
                    </label>
                  </>
                )}
                {stage.key === 'rate_confirmation' && (
                  <label style={s.configSubRow}>
                    <span>Pause if margin below %</span>
                    <input type="number" value={sr.pause_if_margin_below_pct || 10} onChange={e => updateStageRule(stage.key, 'pause_if_margin_below_pct', parseInt(e.target.value))} style={s.configInputSm} />
                  </label>
                )}
                {stage.key === 'transit_tracking' && (
                  <label style={s.configSubRow}>
                    <span>Check call interval (hrs)</span>
                    <input type="number" value={sr.check_call_interval_hours || 4} onChange={e => updateStageRule(stage.key, 'check_call_interval_hours', parseInt(e.target.value))} style={s.configInputSm} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button onClick={() => onSave({ enabled, min_margin_pct: minMargin, target_margin_pct: targetMargin, max_auto_book_amount: maxBook, stage_rules: formRules })} style={s.btnPrimary}>Save Configuration</button>
      </div>
    </Modal>
  );
}

// ── Generic Modal ───────────────────────────────────────────────

function Modal({ children, onClose, title, wide }) {
  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={{ ...s.modalContent, ...(wide ? { maxWidth: 720 } : {}) }} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>{title}</h3>
          <button onClick={onClose} style={s.modalClose}>&times;</button>
        </div>
        <div style={s.modalBody}>{children}</div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const s = {
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#E6EDF3', letterSpacing: 2, margin: 0 },
  subtitle: { color: '#8B949E', fontSize: 13, margin: '4px 0 20px', letterSpacing: 0.5 },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 },
  statCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 8, padding: '16px 12px', textAlign: 'center' },
  statValue: { fontSize: 24, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 },
  statLabel: { fontSize: 10, color: '#8B949E', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },

  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  controlLeft: { display: 'flex', gap: 8 },
  tabs: { display: 'flex', gap: 0 },
  tabBtn: { padding: '8px 16px', background: 'transparent', border: '1px solid #30363D', color: '#8B949E', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
  tabActive: { padding: '8px 16px', background: '#0EA5E922', border: '1px solid #0EA5E9', color: '#0EA5E9', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' },

  btnPrimary: { padding: '10px 20px', background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' },
  btnOutline: { padding: '10px 20px', background: 'transparent', color: '#8B949E', border: '1px solid #30363D', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  btnSmall: { padding: '5px 12px', background: '#238636', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' },
  btnSmallOutline: { padding: '5px 12px', background: 'transparent', color: '#8B949E', border: '1px solid #30363D', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' },

  runsList: { display: 'flex', flexDirection: 'column', gap: 16 },
  emptyState: { padding: 40, textAlign: 'center', color: '#484F58', fontSize: 14 },

  runCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 20 },
  runHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  runInfo: { display: 'flex', alignItems: 'center', gap: 8 },
  runId: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#E6EDF3', letterSpacing: 1 },
  statusBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  modeBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: 0.5 },
  runMeta: { display: 'flex', gap: 12 },
  metaItem: { fontSize: 11, color: '#8B949E' },

  stepper: { paddingLeft: 4 },
  stepRow: { display: 'flex', gap: 12, cursor: 'pointer', minHeight: 44 },
  stepLeft: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 },
  stepDot: { width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepLine: { width: 2, flex: 1, minHeight: 16 },
  stepContent: { flex: 1, paddingBottom: 8 },
  stepLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  stepTime: { fontSize: 10, color: '#484F58' },
  pauseReason: { fontSize: 11, color: '#F59E0B', background: '#F59E0B11', padding: '4px 8px', borderRadius: 4, marginTop: 4, maxWidth: 400 },
  stepSummary: { marginTop: 2 },

  runActions: { display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', borderTop: '1px solid #21262D', paddingTop: 12 },

  // Modal
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalContent: { background: '#161B22', border: '1px solid #30363D', borderRadius: 12, maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #21262D' },
  modalTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#E6EDF3', letterSpacing: 1, margin: 0 },
  modalClose: { background: 'none', border: 'none', color: '#8B949E', fontSize: 24, cursor: 'pointer' },
  modalBody: { padding: 20, overflowY: 'auto', flex: 1 },

  jsonPre: { background: '#0D1117', padding: 16, borderRadius: 6, fontSize: 11, color: '#79C0FF', overflow: 'auto', maxHeight: 400, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },

  eventRow: { display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #21262D', fontSize: 12, alignItems: 'center' },
  eventType: { fontWeight: 600, minWidth: 110, fontSize: 11 },
  eventStage: { color: '#8B949E', minWidth: 100 },
  eventTime: { color: '#484F58', fontSize: 10, minWidth: 130 },
  eventBy: { color: '#484F58', fontSize: 10 },

  formGroup: { marginBottom: 16 },
  formLabel: { display: 'block', fontSize: 12, color: '#8B949E', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  formInput: { width: '100%', padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, fontFamily: 'inherit' },

  // Config modal
  configGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  configSection: {},
  configSectionTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#0EA5E9', letterSpacing: 1, marginBottom: 12, margin: '0 0 12px' },
  configRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12, color: '#E6EDF3' },
  configSubRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 4px 12px', fontSize: 11, color: '#8B949E' },
  configInput: { width: 80, padding: '4px 8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 4, color: '#E6EDF3', fontSize: 12, textAlign: 'right', fontFamily: 'inherit' },
  configInputSm: { width: 60, padding: '3px 6px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 4, color: '#E6EDF3', fontSize: 11, textAlign: 'right', fontFamily: 'inherit' },
  stageRuleRow: { borderBottom: '1px solid #21262D', paddingBottom: 8, marginBottom: 8 },
};
