import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// Print report in a new window with clean formatting
function printReport() {
  const el = document.getElementById('pipeline-report');
  if (!el) return;
  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) return;
  // Clone content and strip buttons
  const clone = el.cloneNode(true);
  clone.querySelectorAll('button').forEach(b => b.remove());
  // Replace iframes with styled route cards for print (iframes don't render in PDF)
  clone.querySelectorAll('iframe').forEach(iframe => {
    const src = iframe.getAttribute('src') || '';
    const originMatch = src.match(/origin=([^&]+)/);
    const destMatch = src.match(/destination=([^&]+)/);
    const waypointsMatch = src.match(/waypoints=([^&]+)/);
    if (originMatch && destMatch) {
      const origin = decodeURIComponent(originMatch[1]);
      const dest = decodeURIComponent(destMatch[1]);
      const waypoints = waypointsMatch ? decodeURIComponent(waypointsMatch[1]).split('|').filter(Boolean) : [];
      const allStops = [origin, ...waypoints.filter(w => w !== origin && w !== dest), dest];
      const routeCard = document.createElement('div');
      routeCard.style.cssText = 'background:#161B22;border:1px solid #30363D;border-radius:8px;padding:20px 24px;display:flex;align-items:center;gap:0;min-height:80px;';
      routeCard.innerHTML = allStops.map((stop, i) => {
        const isFirst = i === 0;
        const isLast = i === allStops.length - 1;
        const dotColor = isFirst ? '#0EA5E9' : isLast ? '#238636' : '#F59E0B';
        const label = isFirst ? 'A' : isLast ? String.fromCharCode(65 + i) : String.fromCharCode(65 + i);
        return (i > 0 ? '<div style="flex:1;height:3px;background:linear-gradient(90deg,#0EA5E9,#238636);margin:0 -4px;"></div>' : '') +
          '<div style="text-align:center;flex-shrink:0;">' +
          '<div style="width:28px;height:28px;border-radius:50%;background:' + dotColor + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin:0 auto 4px;">' + label + '</div>' +
          '<div style="font-size:11px;color:#E6EDF3;font-weight:600;white-space:nowrap;">' + stop + '</div>' +
          '</div>';
      }).join('');
      iframe.replaceWith(routeCard);
    }
  });
  // Write clean print page
  win.document.write(`<!DOCTYPE html><html><head><title>Pipeline Report</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0D1117; color: #E6EDF3; padding: 0; }
  @media print {
    body { background: #fff !important; }
    #pipeline-report, #pipeline-report * { color-adjust: exact !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style></head><body>${clone.outerHTML}</body></html>`);
  win.document.close();
  // Wait for fonts to load then print
  setTimeout(() => { win.focus(); win.print(); }, 600);
}

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
  const [startError, setStartError] = useState('');
  const [startSuccess, setStartSuccess] = useState(null);
  const [reportRun, setReportRun] = useState(null);

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
    setStartError('');
    setStartSuccess(null);
    const val = startLoadId ? startLoadId.toString().trim() : null;
    if (!val) { setStartError('Enter a Load ID or Load Reference'); return; }
    const isNumeric = /^\d+$/.test(val);
    const body = { mode: startMode };
    if (isNumeric) body.load_id = parseInt(val);
    else body.load_ref = val;
    try {
      const res = await api.post('/pipeline-auto/runs', body);
      const run = res.data.data;
      setStartSuccess(run);
      fetchData();
      // Auto-switch to history tab if completed instantly
      if (run && run.status === 'completed') setTab('history');
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Failed to start pipeline';
      setStartError(msg);
    }
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
            }} onEvents={() => { loadEvents(run.id); setSelectedRun(run); }} onReport={() => setReportRun(run)} />
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
            }} onEvents={() => { loadEvents(run.id); setSelectedRun(run); }} onReport={() => setReportRun(run)} />
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

      {/* Full Report Modal */}
      {reportRun && <PipelineReport run={reportRun} onClose={() => setReportRun(null)} />}

      {/* Start Pipeline Modal */}
      {showStart && (
        <Modal onClose={() => { setShowStart(false); setStartError(''); setStartSuccess(null); }} title="Start New Pipeline">
          {startSuccess ? (
            <div>
              <div style={{ background: '#238636', color: '#fff', padding: '12px 16px', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
                Pipeline Run #{startSuccess.id} launched successfully
              </div>
              <div style={{ background: '#161B22', border: '1px solid #21262D', borderRadius: 8, padding: 16, fontSize: 12, color: '#E6EDF3' }}>
                <div style={{ marginBottom: 8 }}><strong>Load:</strong> {startSuccess.load_ref || `#${startSuccess.load_id}`}</div>
                <div style={{ marginBottom: 8 }}><strong>Status:</strong> <span style={{ color: STATUS_COLORS[startSuccess.status] }}>{startSuccess.status.toUpperCase()}</span></div>
                <div style={{ marginBottom: 8 }}><strong>Stage:</strong> {startSuccess.current_stage?.replace(/_/g, ' ')}</div>
                {startSuccess.status === 'completed' && startSuccess.result_rate_confirmation && (
                  <div style={{ marginBottom: 8 }}><strong>Margin:</strong> {startSuccess.result_rate_confirmation.margin_pct}% (${startSuccess.result_rate_confirmation.margin?.toLocaleString()})</div>
                )}
                {startSuccess.result_carrier_match?.qualifying_carriers && (
                  <div style={{ marginBottom: 8 }}><strong>Carriers Matched:</strong> {startSuccess.result_carrier_match.qualifying_carriers} qualified</div>
                )}
                {startSuccess.result_carrier_match?.top_matches?.[0] && (
                  <div><strong>Top Carrier:</strong> {startSuccess.result_carrier_match.top_matches[0].carrier_name} (score: {startSuccess.result_carrier_match.top_matches[0].match_score})</div>
                )}
              </div>
              <button onClick={() => { setShowStart(false); setStartSuccess(null); setStartLoadId(''); }} style={{ ...s.btnPrimary, marginTop: 12 }}>Close</button>
            </div>
          ) : (
            <>
              {startError && <div style={{ background: '#EF444422', border: '1px solid #EF4444', color: '#EF4444', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>{startError}</div>}
              <div style={s.formGroup}>
                <label style={s.formLabel}>Load ID or Reference</label>
                <select value={startLoadId} onChange={e => { setStartLoadId(e.target.value); setStartError(''); }} style={s.formInput}>
                  <option value="">-- Select from open loads --</option>
                  {openLoads.map(l => (
                    <option key={l.id} value={l.load_ref || l.id}>{l.load_ref || `#${l.id}`} - {l.origin} to {l.destination}</option>
                  ))}
                </select>
                <input type="text" placeholder="Or type Load Ref (e.g. CW-71158) or numeric ID" value={startLoadId} onChange={e => { setStartLoadId(e.target.value); setStartError(''); }} style={{ ...s.formInput, marginTop: 8 }} />
              </div>
              <div style={s.formGroup}>
                <label style={s.formLabel}>Mode</label>
                <select value={startMode} onChange={e => setStartMode(e.target.value)} style={s.formInput}>
                  <option value="autopilot">Autopilot</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <button onClick={handleStartPipeline} style={s.btnPrimary}>Launch Pipeline</button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Run Card Component ──────────────────────────────────────────

function RunCard({ run, onAction, onStageClick, onEvents, onReport }) {
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
        <button onClick={onReport} style={{ ...s.btnSmall, background: '#8957E5' }}>View Report</button>
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

// ── Pipeline Report ─────────────────────────────────────────────

function PipelineReport({ run, onClose }) {
  const contract = run.result_contract_received || {};
  const rate = run.result_rate_analysis || {};
  const carrier = run.result_carrier_match || {};
  const loadMatch = run.result_load_match || {};
  const outreach = run.result_carrier_outreach || {};
  const confirmation = run.result_rate_confirmation || {};
  const tracking = run.result_transit_tracking || {};
  const billing = run.result_delivery_billing || {};
  const pnl = billing.final_pnl || {};
  const rec = rate.recommendation || {};
  const top5 = (carrier.top_matches || []).slice(0, 5);
  const pairs = loadMatch.pairs || [];

  const shipperRate = parseFloat(contract.shipper_rate) || rec.suggested_sell_rate || confirmation.sell_rate || 0;
  const buyRate = rec.suggested_buy_rate || confirmation.buy_rate || 0;
  const margin = confirmation.margin || (shipperRate - buyRate);
  const marginPct = confirmation.margin_pct || (shipperRate > 0 ? ((margin / shipperRate) * 100).toFixed(2) : 0);
  const miles = parseFloat(contract.miles) || 0;
  const rpm = miles > 0 ? (shipperRate / miles).toFixed(2) : '--';
  const rpmBuy = miles > 0 ? (buyRate / miles).toFixed(2) : '--';

  const elapsed = run.completed_at && run.started_at
    ? ((new Date(run.completed_at) - new Date(run.started_at)) / 1000).toFixed(1)
    : '--';

  const r = {
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', overflowY: 'auto' },
    page: { background: '#0D1117', border: '1px solid #30363D', borderRadius: 12, width: '100%', maxWidth: 960, margin: '20px auto', padding: 0 },
    header: { background: 'linear-gradient(135deg, #161B22 0%, #1a2332 100%)', borderBottom: '2px solid #0EA5E9', padding: '28px 32px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerLeft: {},
    reportTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#E6EDF3', letterSpacing: 2, margin: 0 },
    reportSub: { fontSize: 12, color: '#8B949E', marginTop: 4 },
    loadBadge: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#0EA5E9', letterSpacing: 2 },
    statusLine: { fontSize: 11, color: '#8B949E', marginTop: 4 },
    closeBtn: { background: 'none', border: '1px solid #30363D', color: '#8B949E', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
    body: { padding: '24px 32px 32px' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 },
    section: { marginBottom: 24 },
    sectionTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#0EA5E9', letterSpacing: 1.5, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #21262D' },
    card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 8, padding: 16 },
    cardAccent: { background: '#161B22', border: '1px solid #238636', borderRadius: 8, padding: 16 },
    kpiRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #21262D' },
    kpiLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 0.5 },
    kpiValue: { fontSize: 14, color: '#E6EDF3', fontWeight: 600 },
    kpiValueLg: { fontSize: 22, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 },
    kpiValueGreen: { fontSize: 22, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, color: '#238636' },
    kpiValueBlue: { fontSize: 22, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, color: '#0EA5E9' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
    th: { textAlign: 'left', padding: '6px 8px', color: '#8B949E', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #30363D' },
    td: { padding: '8px 8px', color: '#E6EDF3', borderBottom: '1px solid #21262D' },
    tdMuted: { padding: '8px 8px', color: '#8B949E', borderBottom: '1px solid #21262D', fontSize: 10 },
    badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 },
    routeBar: { display: 'flex', alignItems: 'center', gap: 0, margin: '16px 0' },
    routeNode: { background: '#0EA5E9', color: '#fff', padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
    routeLine: { flex: 1, height: 2, background: 'linear-gradient(90deg, #0EA5E9, #238636)', position: 'relative' },
    routeNodeEnd: { background: '#238636', color: '#fff', padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
    routeInfo: { textAlign: 'center', marginTop: 8, fontSize: 11, color: '#8B949E' },
    timelineRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11 },
    tlDot: { width: 8, height: 8, borderRadius: '50%', background: '#238636', flexShrink: 0 },
    tlLabel: { color: '#E6EDF3', flex: 1 },
    tlTime: { color: '#484F58', fontSize: 10 },
    printBtn: { background: '#0EA5E9', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: 'inherit', marginRight: 8 },
    watermark: { textAlign: 'center', color: '#30363D', fontSize: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid #21262D' },
  };

  function fmt(n) { return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n || '--'; }

  return (
    <div style={r.overlay} onClick={onClose} id="pipeline-report-overlay">
      <div style={r.page} onClick={e => e.stopPropagation()} id="pipeline-report">
        {/* ── HEADER ── */}
        <div style={r.header}>
          <div style={r.headerLeft}>
            <div style={r.reportTitle}>AUTOPILOT PIPELINE REPORT</div>
            <div style={r.reportSub}>End-to-End Brokerage Execution Summary</div>
            <div style={r.statusLine}>
              Run #{run.id} | {run.mode.toUpperCase()} | {new Date(run.started_at).toLocaleString()} | Pipeline: {elapsed}s
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={r.loadBadge}>{run.load_ref || `LOAD #${run.load_id}`}</div>
            <div style={{ ...r.badge, background: STATUS_COLORS[run.status] + '22', color: STATUS_COLORS[run.status], marginTop: 4 }}>{run.status.toUpperCase()}</div>
          </div>
        </div>

        <div style={r.body}>
          {/* ── ROUTE ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>ROUTE & SHIPMENT</div>
            <div style={r.routeBar}>
              <div style={r.routeNode}>{contract.origin || 'Origin'}</div>
              <div style={r.routeLine}>
                <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: '#8B949E', whiteSpace: 'nowrap' }}>
                  {miles > 0 ? `${miles.toLocaleString()} mi` : ''}
                </div>
              </div>
              <div style={r.routeNodeEnd}>{contract.destination || 'Destination'}</div>
            </div>

            {/* Google Maps -- Primary Route */}
            {contract.origin && contract.destination && (
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #21262D', marginBottom: 16 }}>
                <iframe
                  title="Route Map"
                  width="100%"
                  height="300"
                  frameBorder="0"
                  style={{ border: 0, display: 'block' }}
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps/embed/v1/directions?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&origin=${encodeURIComponent(contract.origin)}&destination=${encodeURIComponent(contract.destination)}&mode=driving`}
                  loading="lazy"
                />
              </div>
            )}

            {/* Google Maps -- Backhaul / Multi-stop Route */}
            {pairs.length > 0 && pairs[0].load_b_lane && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Combined Route with {pairs[0].pair_type?.toUpperCase()} Pair
                </div>
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #238636' }}>
                  {(() => {
                    const pairLane = pairs[0].load_b_lane || '';
                    const pairParts = pairLane.split('\u2192').map(s => s.trim());
                    const waypoint = pairParts[0] || contract.destination;
                    const finalDest = pairParts[1] || '';
                    return (
                      <iframe
                        title="Combined Route Map"
                        width="100%"
                        height="300"
                        frameBorder="0"
                        style={{ border: 0, display: 'block' }}
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.google.com/maps/embed/v1/directions?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&origin=${encodeURIComponent(contract.origin)}&destination=${encodeURIComponent(finalDest)}&waypoints=${encodeURIComponent(contract.destination)}${waypoint !== contract.destination ? '|' + encodeURIComponent(waypoint) : ''}&mode=driving`}
                        loading="lazy"
                      />
                    );
                  })()}
                </div>
                <div style={{ fontSize: 10, color: '#8B949E', marginTop: 4, textAlign: 'center' }}>
                  {contract.origin} {'->'} {contract.destination} {'->'} {pairs[0].load_b_lane?.split('\u2192')[1]?.trim() || '?'} | {pairs[0].pair_type?.toUpperCase()} | {pairs[0].deadhead_miles || 0}mi deadhead
                </div>
              </div>
            )}

            <div style={r.grid3}>
              <div style={r.card}>
                <div style={r.kpiLabel}>Equipment</div>
                <div style={r.kpiValue}>{(contract.equipment || 'N/A').replace(/_/g, ' ').toUpperCase()}</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Weight</div>
                <div style={r.kpiValue}>{contract.weight ? parseFloat(contract.weight).toLocaleString() + ' lbs' : 'N/A'}</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Distance</div>
                <div style={r.kpiValue}>{miles > 0 ? miles.toLocaleString() + ' mi' : 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* ── RATE INTELLIGENCE ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>RATE INTELLIGENCE</div>
            <div style={r.grid2}>
              <div style={r.card}>
                <div style={r.kpiLabel}>Shipper Rate (Sell)</div>
                <div style={r.kpiValueBlue}>{fmt(shipperRate)}</div>
                <div style={{ fontSize: 10, color: '#484F58', marginTop: 2 }}>{rpm}/mi</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Carrier Rate (Buy)</div>
                <div style={r.kpiValueLg}>{fmt(buyRate)}</div>
                <div style={{ fontSize: 10, color: '#484F58', marginTop: 2 }}>{rpmBuy}/mi</div>
              </div>
            </div>
            <div style={r.card}>
              <div style={r.kpiRow}>
                <span style={r.kpiLabel}>Pricing Method</span>
                <span style={r.kpiValue}>{rate.pricing_method || 'N/A'}</span>
              </div>
              <div style={r.kpiRow}>
                <span style={r.kpiLabel}>Confidence</span>
                <span style={{ ...r.kpiValue, color: rate.confidence === 'high' ? '#238636' : rate.confidence === 'medium' ? '#F59E0B' : '#EF4444' }}>{(rate.confidence || 'N/A').toUpperCase()}</span>
              </div>
              <div style={r.kpiRow}>
                <span style={r.kpiLabel}>DAT Market Rate</span>
                <span style={r.kpiValue}>{rate.dat ? fmt(rate.dat) : 'Not Available'}</span>
              </div>
              <div style={r.kpiRow}>
                <span style={r.kpiLabel}>Rate Per Mile</span>
                <span style={r.kpiValue}>{rec.rate_per_mile ? `$${rec.rate_per_mile}` : rpm}</span>
              </div>
              {rate.rationale && rate.rationale.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#8B949E' }}>
                  {rate.rationale.map((r, i) => <div key={i}>-- {r}</div>)}
                </div>
              )}
            </div>
          </div>

          {/* ── P&L / MARGIN ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>PROFIT & LOSS</div>
            <div style={r.grid3}>
              <div style={r.cardAccent}>
                <div style={r.kpiLabel}>Gross Profit</div>
                <div style={r.kpiValueGreen}>{fmt(margin)}</div>
              </div>
              <div style={r.cardAccent}>
                <div style={r.kpiLabel}>Margin %</div>
                <div style={r.kpiValueGreen}>{marginPct}%</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Rate Confirmation</div>
                <div style={r.kpiValue}>{confirmation.rate_con_number || 'N/A'}</div>
              </div>
            </div>
            <div style={r.card}>
              <div style={r.kpiRow}>
                <span style={r.kpiLabel}>Revenue (Shipper Pays)</span>
                <span style={{ ...r.kpiValue, color: '#0EA5E9' }}>{fmt(shipperRate)}</span>
              </div>
              <div style={r.kpiRow}>
                <span style={r.kpiLabel}>Cost (Carrier Paid)</span>
                <span style={r.kpiValue}>{fmt(buyRate)}</span>
              </div>
              <div style={{ ...r.kpiRow, borderBottom: 'none' }}>
                <span style={{ ...r.kpiLabel, fontWeight: 700, color: '#238636' }}>NET MARGIN</span>
                <span style={{ ...r.kpiValue, color: '#238636', fontSize: 16 }}>{fmt(margin)} ({marginPct}%)</span>
              </div>
            </div>
          </div>

          {/* ── CARRIER MATCHING ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>CARRIER MATCHING</div>
            <div style={r.grid3}>
              <div style={r.card}>
                <div style={r.kpiLabel}>Carriers Evaluated</div>
                <div style={r.kpiValueLg}>{carrier.total_evaluated || 0}</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Qualified</div>
                <div style={r.kpiValueLg}>{carrier.qualifying_carriers || 0}</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Min Score Threshold</div>
                <div style={r.kpiValueLg}>{carrier.min_score_threshold || 40}</div>
              </div>
            </div>
            {top5.length > 0 && (
              <table style={r.table}>
                <thead>
                  <tr>
                    <th style={r.th}>Rank</th>
                    <th style={r.th}>Carrier</th>
                    <th style={r.th}>MC #</th>
                    <th style={r.th}>Score</th>
                    <th style={r.th}>Reliability</th>
                    <th style={r.th}>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((c, i) => (
                    <tr key={i}>
                      <td style={r.td}><span style={{ ...r.badge, background: i === 0 ? '#238636' : '#21262D', color: i === 0 ? '#fff' : '#8B949E' }}>#{i + 1}</span></td>
                      <td style={{ ...r.td, fontWeight: i === 0 ? 700 : 400 }}>{c.carrier_name}</td>
                      <td style={r.tdMuted}>{c.mc_number}</td>
                      <td style={r.td}><span style={{ color: c.match_score >= 80 ? '#238636' : c.match_score >= 60 ? '#F59E0B' : '#EF4444', fontWeight: 700 }}>{c.match_score}</span></td>
                      <td style={r.td}>{c.reliability}%</td>
                      <td style={r.tdMuted}>{c.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── LOAD-TO-LOAD MATCHING ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>LOAD-TO-LOAD OPTIMIZATION</div>
            <div style={r.grid2}>
              <div style={r.card}>
                <div style={r.kpiLabel}>Pairs Found</div>
                <div style={r.kpiValueLg}>{loadMatch.total_pairs_found || 0}</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Auto-Accepted</div>
                <div style={r.kpiValueLg}>{loadMatch.auto_accepted || 0}</div>
              </div>
            </div>
            {pairs.length > 0 ? (
              <table style={r.table}>
                <thead><tr><th style={r.th}>Pair Load</th><th style={r.th}>Lane</th><th style={r.th}>Type</th><th style={r.th}>Score</th><th style={r.th}>Deadhead</th><th style={r.th}>Combined RPM</th></tr></thead>
                <tbody>
                  {pairs.map((p, i) => (
                    <tr key={i}>
                      <td style={{ ...r.td, fontWeight: 600 }}>{p.load_b_ref || p.load_ref || `#${p.load_b_id}`}</td>
                      <td style={r.tdMuted}>{p.load_b_lane || '--'}</td>
                      <td style={r.td}>
                        <span style={{ ...r.badge, background: p.pair_type === 'backhaul' ? '#23863622' : p.pair_type === 'round_trip' ? '#0EA5E922' : '#F59E0B22', color: p.pair_type === 'backhaul' ? '#238636' : p.pair_type === 'round_trip' ? '#0EA5E9' : '#F59E0B' }}>
                          {(p.pair_type || 'unknown').toUpperCase()}
                        </span>
                      </td>
                      <td style={r.td}>{p.match_score || p.score || '--'}</td>
                      <td style={r.td}>{p.deadhead_miles != null ? `${p.deadhead_miles} mi` : '--'}</td>
                      <td style={r.td}>{p.combined_rpm ? `$${p.combined_rpm}/mi` : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ ...r.card, color: '#484F58', fontSize: 12, textAlign: 'center' }}>No compatible load pairs found for this lane. Deadhead optimization not applicable.</div>
            )}
          </div>

          {/* ── CARRIER OUTREACH ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>CARRIER OUTREACH & BOOKING</div>
            <div style={r.grid3}>
              <div style={r.card}>
                <div style={r.kpiLabel}>Carriers Contacted</div>
                <div style={r.kpiValueLg}>{outreach.carriers_contacted || 0}</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Method</div>
                <div style={r.kpiValue}>{(outreach.outreach_method || 'N/A').replace(/_/g, ' ').toUpperCase()}</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Load Status</div>
                <div style={{ ...r.kpiValue, color: '#238636' }}>{(confirmation.load_status_updated || 'N/A').toUpperCase()}</div>
              </div>
            </div>
            {(outreach.carriers || []).length > 0 && (
              <table style={r.table}>
                <thead><tr><th style={r.th}>Carrier</th><th style={r.th}>Score</th><th style={r.th}>Phone</th><th style={r.th}>Status</th></tr></thead>
                <tbody>
                  {(outreach.carriers || []).map((c, i) => (
                    <tr key={i}>
                      <td style={r.td}>{c.carrier_name}</td>
                      <td style={r.td}>{c.match_score}</td>
                      <td style={r.tdMuted}>{c.phone}</td>
                      <td style={r.td}>
                        <span style={{ ...r.badge, background: c.outreach_status === 'accepted' ? '#23863622' : c.outreach_status === 'pending' ? '#F59E0B22' : '#21262D', color: c.outreach_status === 'accepted' ? '#238636' : c.outreach_status === 'pending' ? '#F59E0B' : '#8B949E' }}>
                          {(c.outreach_status || 'pending').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── TRANSIT TRACKING ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>TRANSIT & CHECK CALLS</div>
            <div style={r.grid2}>
              <div style={r.card}>
                <div style={r.kpiLabel}>Check Call Interval</div>
                <div style={r.kpiValue}>Every {tracking.check_call_interval_hours || 4} hours</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Scheduled Calls</div>
                <div style={r.kpiValueLg}>{(tracking.scheduled_calls || []).length}</div>
              </div>
            </div>
            {(tracking.scheduled_calls || []).length > 0 && (
              <div style={r.card}>
                {(tracking.scheduled_calls || []).map((call, i) => (
                  <div key={i} style={r.timelineRow}>
                    <div style={{ ...r.tlDot, background: call.status === 'completed' ? '#238636' : call.status === 'pending' ? '#0EA5E9' : '#484F58' }} />
                    <span style={r.tlLabel}>Check Call #{call.call_number}</span>
                    <span style={{ ...r.badge, background: call.status === 'completed' ? '#23863622' : call.status === 'pending' ? '#0EA5E922' : '#21262D', color: call.status === 'completed' ? '#238636' : call.status === 'pending' ? '#0EA5E9' : '#8B949E' }}>{call.status.toUpperCase()}</span>
                    <span style={r.tlTime}>{new Date(call.scheduled_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── BILLING ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>BILLING & INVOICING</div>
            <div style={r.grid2}>
              <div style={r.card}>
                <div style={r.kpiLabel}>Shipper Invoice</div>
                <div style={r.kpiValue}>{billing.shipper_invoice || 'Auto-generated'}</div>
                <div style={{ fontSize: 11, color: '#0EA5E9', marginTop: 4 }}>{fmt(pnl.revenue || shipperRate)}</div>
              </div>
              <div style={r.card}>
                <div style={r.kpiLabel}>Carrier Payment</div>
                <div style={r.kpiValue}>{billing.carrier_payment || 'Auto-generated'}</div>
                <div style={{ fontSize: 11, color: '#E6EDF3', marginTop: 4 }}>{fmt(pnl.cost || buyRate)}</div>
              </div>
            </div>
          </div>

          {/* ── EXECUTION TIMELINE ── */}
          <div style={r.section}>
            <div style={r.sectionTitle}>PIPELINE EXECUTION TIMELINE</div>
            <div style={r.card}>
              {STAGES.map((stage, i) => {
                const ts = run[`ts_${stage.key}`];
                const stStatus = getStageStatus(run, stage.key);
                return (
                  <div key={stage.key} style={{ ...r.timelineRow, opacity: ts ? 1 : 0.4 }}>
                    <div style={{ ...r.tlDot, background: stStatus === 'completed' ? '#238636' : stStatus === 'paused' ? '#F59E0B' : stStatus === 'failed' ? '#EF4444' : '#30363D' }} />
                    <span style={{ ...r.tlLabel, fontWeight: 600 }}>{stage.label}</span>
                    <span style={{ ...r.badge, background: stStatus === 'completed' ? '#23863622' : '#21262D', color: stStatus === 'completed' ? '#238636' : '#484F58' }}>
                      {stStatus.toUpperCase()}
                    </span>
                    <span style={r.tlTime}>{ts ? new Date(ts).toLocaleTimeString() : '--'}</span>
                  </div>
                );
              })}
              <div style={{ borderTop: '1px solid #21262D', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#8B949E' }}>Total Pipeline Time</span>
                <span style={{ color: '#E6EDF3', fontWeight: 700 }}>{elapsed}s</span>
              </div>
            </div>
          </div>

          {/* ── ACTIONS ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <button onClick={printReport} style={r.printBtn}>Print / Export PDF</button>
              <button onClick={onClose} style={r.closeBtn}>Close Report</button>
            </div>
            <div style={r.watermark}>RinglyPro FreightMind Autopilot -- Powered by Digit2AI</div>
          </div>
        </div>
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
