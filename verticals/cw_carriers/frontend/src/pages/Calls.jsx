import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Calls() {
  const [calls, setCalls] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState({ direction: '', call_type: '', outcome: '' });
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = {};
    if (filter.direction) params.direction = filter.direction;
    if (filter.call_type) params.call_type = filter.call_type;
    if (filter.outcome) params.outcome = filter.outcome;
    Promise.all([
      api.get('/calls', { params }).catch(() => ({ data: { data: [] } })),
      api.get('/calls/stats').catch(() => ({ data: { data: {} } }))
    ]).then(([callsRes, statsRes]) => {
      setCalls(callsRes.data.data || []);
      setStats(statsRes.data.data || {});
      setLoading(false);
    });
  }, [filter]);

  const outcomeColors = { qualified: '#238636', booked: '#1A4FA8', declined: '#6E7681', escalated: '#C8962A', voicemail: '#484F58', completed: '#39D353', pending: '#8957E5' };

  return (
    <div>
      <h2 style={s.title}>CALL LOG</h2>

      <div style={s.statsRow}>
        <div style={s.stat}><div style={s.statVal}>{stats.total || 0}</div><div style={s.statLabel}>Total Calls</div></div>
        <div style={s.stat}><div style={s.statVal}>{stats.today || 0}</div><div style={s.statLabel}>Today</div></div>
        {(stats.outcomes || []).map(o => (
          <div key={o.outcome} style={s.stat}>
            <div style={{ ...s.statVal, color: outcomeColors[o.outcome] || '#E6EDF3' }}>{o.count}</div>
            <div style={s.statLabel}>{o.outcome || 'unknown'}</div>
          </div>
        ))}
      </div>

      <div style={s.filters}>
        <select value={filter.direction} onChange={e => setFilter({ ...filter, direction: e.target.value })} style={s.select}>
          <option value="">All Directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select value={filter.call_type} onChange={e => setFilter({ ...filter, call_type: e.target.value })} style={s.select}>
          <option value="">All Types</option>
          <option value="carrier_coverage">Carrier Coverage</option>
          <option value="status_update">Status Update</option>
          <option value="lead_qualification">Lead Qualification</option>
          <option value="inbound_shipper">Inbound Shipper</option>
        </select>
        <select value={filter.outcome} onChange={e => setFilter({ ...filter, outcome: e.target.value })} style={s.select}>
          <option value="">All Outcomes</option>
          <option value="qualified">Qualified</option>
          <option value="booked">Booked</option>
          <option value="declined">Declined</option>
          <option value="escalated">Escalated</option>
          <option value="voicemail">Voicemail</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Contact</th>
              <th style={s.th}>Dir</th>
              <th style={s.th}>Type</th>
              <th style={s.th}>Load</th>
              <th style={s.th}>Duration</th>
              <th style={s.th}>Outcome</th>
              <th style={s.th}>Date</th>
              <th style={s.th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={s.empty}>Loading...</td></tr> :
             calls.length === 0 ? <tr><td colSpan={8} style={s.empty}>No calls found</td></tr> :
             calls.map(c => (
              <React.Fragment key={c.id}>
                <tr>
                  <td style={s.td}>{c.company_name || c.contact_name || c.from_number || '—'}</td>
                  <td style={s.td}><span style={{ ...s.dirBadge, background: c.direction === 'inbound' ? '#238636' : '#1A4FA8' }}>{c.direction === 'inbound' ? 'IN' : 'OUT'}</span></td>
                  <td style={s.td}>{c.call_type || '—'}</td>
                  <td style={s.td}>{c.load_ref || '—'}</td>
                  <td style={s.td}>{c.duration_sec ? `${c.duration_sec}s` : '—'}</td>
                  <td style={s.td}><span style={{ ...s.badge, background: outcomeColors[c.outcome] || '#21262D', color: '#fff' }}>{c.outcome || '—'}</span></td>
                  <td style={s.td}>{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
                  <td style={s.td}><button onClick={() => setExpanded(expanded === c.id ? null : c.id)} style={s.expandBtn}>{expanded === c.id ? '▼' : '▶'}</button></td>
                </tr>
                {expanded === c.id && (
                  <tr>
                    <td colSpan={8} style={s.expandedTd}>
                      <div style={s.expandedContent}>
                        {c.ai_summary && <div><strong>AI Summary:</strong> {c.ai_summary}</div>}
                        {c.transcript && <div style={s.transcript}><strong>Transcript:</strong><br/>{c.transcript}</div>}
                        <div style={s.meta}>
                          <span>From: {c.from_number}</span> | <span>To: {c.to_number}</span>
                          {c.hubspot_logged && <span> | HubSpot: Logged</span>}
                          {c.escalated_to && <span> | Escalated: {c.escalated_to}</span>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  title: { fontSize: 28, color: '#C8962A', marginBottom: 16 },
  statsRow: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' },
  stat: { background: '#161B22', border: '1px solid #21262D', borderRadius: 8, padding: '12px 16px', textAlign: 'center', minWidth: 80 },
  statVal: { fontSize: 24, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif" },
  statLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', marginTop: 2 },
  filters: { display: 'flex', gap: 12, marginBottom: 16 },
  select: { padding: '8px 12px', background: '#161B22', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  tableWrap: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', background: '#0D1117' },
  td: { padding: '10px 12px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  dirBadge: { display: 'inline-block', padding: '2px 6px', borderRadius: 3, fontSize: 10, color: '#fff', fontWeight: 600 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, textTransform: 'uppercase' },
  empty: { padding: 40, textAlign: 'center', color: '#484F58' },
  expandBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#8B949E', fontSize: 12 },
  expandedTd: { padding: 0, background: '#0D1117' },
  expandedContent: { padding: '12px 16px', fontSize: 13, color: '#8B949E', display: 'flex', flexDirection: 'column', gap: 8 },
  transcript: { background: '#161B22', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' },
  meta: { fontSize: 11, color: '#484F58' }
};
