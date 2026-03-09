import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Billing() {
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showAutoGen, setShowAutoGen] = useState(false);
  const [autoGenLoadId, setAutoGenLoadId] = useState('');
  const [form, setForm] = useState({ load_id: '', invoice_type: 'shipper', amount: '', due_date: '', notes: '' });
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    setLoading(true);
    const params = {};
    if (typeFilter) params.type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    Promise.all([
      api.get('/billing', { params }).then(r => setInvoices(r.data.data || [])),
      api.get('/billing/summary').then(r => setSummary(r.data.data))
    ]).then(() => setLoading(false)).catch(() => setLoading(false));
  };

  useEffect(fetchData, [typeFilter, statusFilter]);

  const createInvoice = async (e) => {
    e.preventDefault();
    try {
      await api.post('/billing', {
        ...form,
        load_id: parseInt(form.load_id),
        amount: parseFloat(form.amount)
      });
      setShowCreate(false);
      setForm({ load_id: '', invoice_type: 'shipper', amount: '', due_date: '', notes: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error creating invoice');
    }
  };

  const autoGenerate = async () => {
    if (!autoGenLoadId) return;
    try {
      const res = await api.post(`/billing/auto-generate/${autoGenLoadId}`);
      setShowAutoGen(false);
      setAutoGenLoadId('');
      alert(`Generated ${res.data.data?.length || 0} invoices`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error auto-generating');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/billing/${id}/status`, { status });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error updating status');
    }
  };

  const statusColors = { draft: '#484F58', sent: '#1A4FA8', paid: '#238636', overdue: '#F85149', void: '#21262D' };

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>BILLING & INVOICING</h2>
        <div style={s.headerActions}>
          <button onClick={() => setShowAutoGen(true)} style={s.autoBtn}>Auto-Generate</button>
          <button onClick={() => setShowCreate(true)} style={s.createBtn}>+ New Invoice</button>
        </div>
      </div>

      {summary && (
        <div style={s.summaryGrid}>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Accounts Receivable (AR)</div>
            <div style={s.summaryRow}>
              <div><span style={s.summaryNum}>${summary.ar_total ? parseFloat(summary.ar_total).toLocaleString() : '0'}</span><span style={s.summaryHint}> total</span></div>
              <div><span style={{ ...s.summaryNum, color: '#238636' }}>${summary.ar_paid ? parseFloat(summary.ar_paid).toLocaleString() : '0'}</span><span style={s.summaryHint}> paid</span></div>
              <div><span style={{ ...s.summaryNum, color: '#C8962A' }}>${summary.ar_outstanding ? parseFloat(summary.ar_outstanding).toLocaleString() : '0'}</span><span style={s.summaryHint}> outstanding</span></div>
            </div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Accounts Payable (AP)</div>
            <div style={s.summaryRow}>
              <div><span style={s.summaryNum}>${summary.ap_total ? parseFloat(summary.ap_total).toLocaleString() : '0'}</span><span style={s.summaryHint}> total</span></div>
              <div><span style={{ ...s.summaryNum, color: '#238636' }}>${summary.ap_paid ? parseFloat(summary.ap_paid).toLocaleString() : '0'}</span><span style={s.summaryHint}> paid</span></div>
              <div><span style={{ ...s.summaryNum, color: '#C8962A' }}>${summary.ap_outstanding ? parseFloat(summary.ap_outstanding).toLocaleString() : '0'}</span><span style={s.summaryHint}> outstanding</span></div>
            </div>
          </div>
          <div style={{ ...s.summaryCard, borderColor: '#238636' }}>
            <div style={s.summaryLabel}>Gross Profit</div>
            <div style={{ ...s.summaryNum, fontSize: 28, color: '#238636' }}>
              ${summary.gross_profit ? parseFloat(summary.gross_profit).toLocaleString() : '0'}
            </div>
          </div>
        </div>
      )}

      <div style={s.filters}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={s.select}>
          <option value="">All Types</option>
          <option value="shipper">Shipper (AR)</option>
          <option value="carrier">Carrier (AP)</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.select}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalContent}>
            <h3 style={s.modalTitle}>CREATE INVOICE</h3>
            <form onSubmit={createInvoice} style={s.form}>
              <input placeholder="Load ID" type="number" value={form.load_id} onChange={e => setForm({ ...form, load_id: e.target.value })} style={s.input} required />
              <select value={form.invoice_type} onChange={e => setForm({ ...form, invoice_type: e.target.value })} style={s.select}>
                <option value="shipper">Shipper Invoice (AR)</option>
                <option value="carrier">Carrier Payment (AP)</option>
              </select>
              <input placeholder="Amount ($)" type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={s.input} required />
              <input placeholder="Due Date" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} style={s.input} />
              <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...s.input, minHeight: 60 }} />
              <div style={s.row}>
                <button type="submit" style={s.createBtn}>Create Invoice</button>
                <button type="button" onClick={() => setShowCreate(false)} style={s.cancelBtn}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAutoGen && (
        <div style={s.modal}>
          <div style={s.modalContent}>
            <h3 style={s.modalTitle}>AUTO-GENERATE INVOICES</h3>
            <p style={s.hint}>Enter a delivered load ID to auto-generate both shipper invoice (AR) and carrier payment (AP).</p>
            <div style={s.form}>
              <input placeholder="Load ID" type="number" value={autoGenLoadId} onChange={e => setAutoGenLoadId(e.target.value)} style={s.input} />
              <div style={s.row}>
                <button onClick={autoGenerate} style={s.createBtn}>Generate</button>
                <button onClick={() => { setShowAutoGen(false); setAutoGenLoadId(''); }} style={s.cancelBtn}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Invoice #</th>
              <th style={s.th}>Load</th>
              <th style={s.th}>Type</th>
              <th style={s.th}>Amount</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Due Date</th>
              <th style={s.th}>Created</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={s.empty}>Loading...</td></tr> :
             invoices.length === 0 ? <tr><td colSpan={8} style={s.empty}>No invoices found</td></tr> :
             invoices.map(inv => (
              <tr key={inv.id}>
                <td style={s.td}>{inv.invoice_number || `INV-${inv.id}`}</td>
                <td style={s.td}>#{inv.load_id}</td>
                <td style={s.td}>
                  <span style={{ ...s.typeBadge, background: inv.invoice_type === 'shipper' ? '#1A4FA822' : '#C8962A22', color: inv.invoice_type === 'shipper' ? '#1A4FA8' : '#C8962A' }}>
                    {inv.invoice_type === 'shipper' ? 'AR' : 'AP'}
                  </span>
                </td>
                <td style={s.td}>${parseFloat(inv.amount).toLocaleString()}</td>
                <td style={s.td}><span style={{ ...s.badge, background: statusColors[inv.status] || '#21262D' }}>{inv.status}</span></td>
                <td style={s.td}>{inv.due_date || '—'}</td>
                <td style={s.td}>{new Date(inv.created_at).toLocaleDateString()}</td>
                <td style={s.td}>
                  <div style={s.actions}>
                    {inv.status === 'draft' && <button onClick={() => updateStatus(inv.id, 'sent')} style={s.actionBtn}>Send</button>}
                    {(inv.status === 'sent' || inv.status === 'overdue') && <button onClick={() => updateStatus(inv.id, 'paid')} style={{ ...s.actionBtn, borderColor: '#238636' }}>Mark Paid</button>}
                    {inv.status === 'draft' && <button onClick={() => updateStatus(inv.id, 'void')} style={{ ...s.actionBtn, borderColor: '#F85149' }}>Void</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  headerActions: { display: 'flex', gap: 8 },
  title: { fontSize: 28, color: '#C8962A' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 },
  summaryCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 16 },
  summaryLabel: { fontSize: 12, color: '#8B949E', textTransform: 'uppercase', marginBottom: 8 },
  summaryRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  summaryNum: { fontSize: 18, fontWeight: 700, color: '#E6EDF3' },
  summaryHint: { fontSize: 11, color: '#484F58' },
  filters: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  select: { padding: '8px 12px', background: '#161B22', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  input: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, width: '100%' },
  createBtn: { padding: '8px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  autoBtn: { padding: '8px 16px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '8px 16px', background: '#21262D', color: '#8B949E', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  hint: { fontSize: 13, color: '#8B949E', marginBottom: 12 },
  tableWrap: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, overflow: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', background: '#0D1117' },
  td: { padding: '10px 12px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#fff', textTransform: 'uppercase' },
  typeBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' },
  empty: { padding: 40, textAlign: 'center', color: '#484F58' },
  actions: { display: 'flex', gap: 4 },
  actionBtn: { background: 'none', border: '1px solid #30363D', borderRadius: 4, cursor: 'pointer', padding: '4px 8px', fontSize: 11, color: '#E6EDF3' },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalContent: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 28, width: 480, maxWidth: '92vw' },
  modalTitle: { fontSize: 20, color: '#C8962A', marginBottom: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' }
};
