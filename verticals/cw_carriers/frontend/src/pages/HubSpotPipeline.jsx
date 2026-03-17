import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';

const DEFAULT_STAGES = [
  { id: 'appointmentscheduled', label: 'Appointment Scheduled', color: '#94a3b8' },
  { id: 'qualifiedtobuy', label: 'Qualified to Buy', color: '#60a5fa' },
  { id: 'presentationscheduled', label: 'Presentation Scheduled', color: '#a78bfa' },
  { id: 'decisionmakerboughtin', label: 'Decision Maker Bought-In', color: '#fbbf24' },
  { id: 'contractsent', label: 'Contract Sent', color: '#fb923c' },
  { id: 'closedwon', label: 'Closed Won', color: '#4ade80' },
  { id: 'closedlost', label: 'Closed Lost', color: '#f87171' },
];

export default function HubSpotPipeline() {
  const [deals, setDeals] = useState([]);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [forecast, setForecast] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDeal, setEditDeal] = useState(null);
  const dragRef = useRef(null);

  const loadData = async () => {
    try {
      // Load pipelines for stage labels
      const pipeRes = await api.get('/pipeline/pipelines');
      if (pipeRes.data.success && pipeRes.data.pipelines?.length > 0) {
        const p = pipeRes.data.pipelines[0];
        if (p.stages?.results?.length > 0) {
          const colors = ['#94a3b8', '#60a5fa', '#a78bfa', '#fbbf24', '#fb923c', '#4ade80', '#f87171'];
          setStages(p.stages.results.map((s, i) => ({
            id: s.id,
            label: s.label,
            color: colors[i % colors.length]
          })));
        }
      }
    } catch (e) { /* use defaults */ }

    try {
      const dealsRes = await api.get('/pipeline/deals');
      if (dealsRes.data.success) {
        setDeals(dealsRes.data.deals || []);
        setForecast(dealsRes.data.forecast || {});
      }
    } catch (e) { console.error('Pipeline load error:', e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleDragStart = (dealId) => { dragRef.current = dealId; };

  const handleDrop = async (stageId) => {
    if (!dragRef.current) return;
    const dealId = dragRef.current;
    dragRef.current = null;

    // Optimistic update
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: stageId } : d));

    try {
      await api.put(`/pipeline/deals/${dealId}/stage`, { stage: stageId });
    } catch (err) {
      loadData(); // Revert on error
    }
  };

  const openAddDeal = () => { setEditDeal(null); setShowModal(true); };
  const openEditDeal = (deal) => { setEditDeal(deal); setShowModal(true); };

  const saveDeal = async (formData) => {
    try {
      if (editDeal) {
        await api.put(`/pipeline/deals/${editDeal.id}`, formData);
      } else {
        await api.post('/pipeline/deals', formData);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      alert('Error saving deal: ' + (err.response?.data?.error || err.message));
    }
  };

  const deleteDeal = async (dealId) => {
    if (!window.confirm('Delete this deal from HubSpot?')) return;
    try {
      await api.delete(`/pipeline/deals/${dealId}`);
      loadData();
    } catch (err) {
      alert('Error deleting deal');
    }
  };

  if (loading) return <div style={s.loading}>Loading HubSpot Pipeline...</div>;

  return (
    <div>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>HUBSPOT PIPELINE</h2>
          <p style={s.subtitle}>Drag & drop deals between stages — synced live with HubSpot</p>
        </div>
        <button onClick={openAddDeal} style={s.addBtn}>+ New Deal</button>
      </div>

      {/* Summary Bar */}
      <div style={s.summaryRow}>
        <div style={s.summaryCard}>
          <div style={s.summaryValue}>{forecast.total_deals || 0}</div>
          <div style={s.summaryLabel}>Total Deals</div>
        </div>
        <div style={s.summaryCard}>
          <div style={{ ...s.summaryValue, color: '#ff7a59' }}>${Number(forecast.total_pipeline || 0).toLocaleString()}</div>
          <div style={s.summaryLabel}>Pipeline</div>
        </div>
        <div style={s.summaryCard}>
          <div style={{ ...s.summaryValue, color: '#C8962A' }}>${Number(forecast.weighted_forecast || 0).toLocaleString()}</div>
          <div style={s.summaryLabel}>Forecast</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryValue}>{forecast.open_count || 0}</div>
          <div style={s.summaryLabel}>Open</div>
        </div>
        <div style={s.summaryCard}>
          <div style={{ ...s.summaryValue, color: '#238636' }}>{forecast.won_count || 0}</div>
          <div style={s.summaryLabel}>Won</div>
        </div>
      </div>

      {/* Kanban Board */}
      <div style={s.pipeline}>
        {stages.map(stage => {
          const stageDeals = deals.filter(d => d.stage === stage.id);
          const stageTotal = stageDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
          return (
            <div key={stage.id} style={s.stageCol}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = '#1A4FA811'; }}
              onDragLeave={e => { e.currentTarget.style.background = ''; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.background = ''; handleDrop(stage.id); }}>
              <div style={s.stageHeader}>
                <div>
                  <div style={{ ...s.stageName, color: stage.color }}>{stage.label}</div>
                  <div style={s.stageAmount}>${stageTotal.toLocaleString()}</div>
                </div>
                <span style={s.stageBadge}>{stageDeals.length}</span>
              </div>
              <div style={s.stageBody}>
                {stageDeals.length === 0 ? (
                  <div style={s.emptyStage}>No deals</div>
                ) : stageDeals.map(deal => (
                  <div key={deal.id} style={s.dealCard} draggable
                    onDragStart={() => handleDragStart(deal.id)}
                    onClick={() => openEditDeal(deal)}>
                    <div style={s.dealTitle}>{deal.title}</div>
                    <div style={s.dealMeta}>
                      <span style={s.dealAmount}>${Number(deal.amount || 0).toLocaleString()}</span>
                      <span style={s.dealSource}>{deal.source === 'hubspot' ? 'HS' : 'CW'}</span>
                    </div>
                    {deal.closedate && (
                      <div style={s.dealClose}>Close: {new Date(deal.closedate).toLocaleDateString()}</div>
                    )}
                    <button onClick={e => { e.stopPropagation(); deleteDeal(deal.id); }} style={s.deleteBtn}>×</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <DealModal
          deal={editDeal}
          stages={stages}
          onSave={saveDeal}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function DealModal({ deal, stages, onSave, onClose }) {
  const [form, setForm] = useState({
    dealname: deal?.title || '',
    amount: deal?.amount || 0,
    dealstage: deal?.stage || stages[0]?.id || 'appointmentscheduled',
    pipeline: 'default',
    closedate: deal?.closedate?.split('T')[0] || '',
    description: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <h3 style={s.modalTitle}>{deal ? 'Edit Deal' : 'New Deal'}</h3>
        <form onSubmit={handleSubmit}>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Deal Name</label>
            <input value={form.dealname} onChange={e => setForm({ ...form, dealname: e.target.value })}
              required placeholder="e.g., PepsiCo Q2 Shipment" style={s.formInput} />
          </div>
          <div style={s.formRow}>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Amount ($)</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                min="0" step="0.01" style={s.formInput} />
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Stage</label>
              <select value={form.dealstage} onChange={e => setForm({ ...form, dealstage: e.target.value })} style={s.formInput}>
                {stages.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
              </select>
            </div>
          </div>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Expected Close Date</label>
            <input type="date" value={form.closedate} onChange={e => setForm({ ...form, closedate: e.target.value })} style={s.formInput} />
          </div>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows="2" placeholder="Optional notes..." style={{ ...s.formInput, resize: 'vertical' }} />
          </div>
          <div style={s.formActions}>
            <button type="submit" style={s.saveBtn}>Save Deal</button>
            <button type="button" onClick={onClose} style={s.cancelBtn}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const s = {
  loading: { padding: 40, textAlign: 'center', color: '#8B949E', fontSize: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 28, color: '#C8962A', margin: 0 },
  subtitle: { color: '#8B949E', fontSize: 14, marginTop: 2 },
  addBtn: { padding: '10px 20px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  summaryRow: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  summaryCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 8, padding: '12px 16px', textAlign: 'center', flex: '1 1 100px' },
  summaryValue: { fontSize: 20, fontWeight: 700, color: '#E6EDF3' },
  summaryLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', marginTop: 2 },
  pipeline: { display: 'flex', gap: 10, overflowX: 'auto', minHeight: 'calc(100vh - 280px)', alignItems: 'flex-start', paddingBottom: 20 },
  stageCol: { minWidth: 200, maxWidth: 240, flex: '1 0 200px', background: '#161B22', border: '1px solid #21262D', borderRadius: 10, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 280px)', transition: 'background 0.2s' },
  stageHeader: { padding: '10px 14px', borderBottom: '1px solid #21262D', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
  stageName: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  stageAmount: { fontSize: 11, color: '#484F58', marginTop: 2 },
  stageBadge: { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#1A4FA822', color: '#1A4FA8' },
  stageBody: { padding: 8, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 },
  emptyStage: { padding: 20, textAlign: 'center', color: '#484F58', fontSize: 12 },
  dealCard: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 8, padding: 12, cursor: 'grab', transition: 'all 0.2s', position: 'relative' },
  dealTitle: { fontSize: 13, fontWeight: 600, color: '#E6EDF3', marginBottom: 6, paddingRight: 20 },
  dealMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  dealAmount: { fontSize: 14, fontWeight: 700, color: '#4ade80' },
  dealSource: { fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#ff7a5922', color: '#ff7a59', fontWeight: 600 },
  dealClose: { fontSize: 10, color: '#484F58', marginTop: 4 },
  deleteBtn: { position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', color: '#484F58', fontSize: 16, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontFamily: 'inherit' },
  // Modal
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, maxWidth: 480, width: '100%', padding: 24, maxHeight: '90vh', overflow: 'auto' },
  modalTitle: { fontSize: 20, color: '#C8962A', marginBottom: 16, margin: 0 },
  formGroup: { marginBottom: 14 },
  formLabel: { display: 'block', fontSize: 11, color: '#8B949E', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  formInput: { width: '100%', padding: '10px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, color: '#E6EDF3', fontSize: 14, fontFamily: 'inherit', outline: 'none' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  formActions: { display: 'flex', gap: 8, marginTop: 16 },
  saveBtn: { flex: 1, padding: '10px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn: { flex: 1, padding: '10px 16px', background: '#21262D', color: '#8B949E', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
};
