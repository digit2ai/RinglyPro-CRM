import React, { useState, useEffect } from 'react';
import { getLang } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'Job Board', sub: 'Spanish-speaking BPO positions in Makati City and Metro Manila.', all: 'All Levels', apply: 'Apply Now', applied: 'Applied', applying: 'Applying...', slots: 'slots', level: 'Spanish Level', salary: 'Salary', company: 'Company', location: 'Location', noJobs: 'No open positions right now. Check back soon!', filterLevel: 'Spanish Level', myApps: 'My Applications', noApps: 'You haven\'t applied to any positions yet.', status: 'Status', appliedOn: 'Applied', submitted: 'Submitted', reviewing: 'Reviewing', interview: 'Interview', offered: 'Offered', rejected: 'Declined', coverNote: 'Cover note (optional)', send: 'Submit Application', cancel: 'Cancel' },
  es: { title: 'Bolsa de Trabajo', sub: 'Posiciones BPO hispanohablantes en Makati City y Metro Manila.', all: 'Todos los Niveles', apply: 'Aplicar', applied: 'Aplicado', applying: 'Aplicando...', slots: 'vacantes', level: 'Nivel de Español', salary: 'Salario', company: 'Empresa', location: 'Ubicación', noJobs: 'No hay posiciones abiertas. ¡Vuelve pronto!', filterLevel: 'Nivel de Español', myApps: 'Mis Solicitudes', noApps: 'Aún no has aplicado a ninguna posición.', status: 'Estado', appliedOn: 'Aplicado', submitted: 'Enviado', reviewing: 'En Revisión', interview: 'Entrevista', offered: 'Ofrecido', rejected: 'Rechazado', coverNote: 'Nota de presentación (opcional)', send: 'Enviar Solicitud', cancel: 'Cancelar' },
  fil: { title: 'Job Board', sub: 'Mga posisyon sa BPO na may Espanyol sa Makati City at Metro Manila.', all: 'Lahat ng Antas', apply: 'Mag-apply', applied: 'Nag-apply na', applying: 'Nag-a-apply...', slots: 'bakante', level: 'Antas ng Espanyol', salary: 'Sahod', company: 'Kumpanya', location: 'Lokasyon', noJobs: 'Walang bukas na posisyon ngayon. Bumalik muli!', filterLevel: 'Antas ng Espanyol', myApps: 'Mga Aplikasyon Ko', noApps: 'Hindi ka pa nag-apply sa anumang posisyon.', status: 'Katayuan', appliedOn: 'Nag-apply', submitted: 'Naisumite', reviewing: 'Sinusuri', interview: 'Interbyu', offered: 'Inaalok', rejected: 'Tinanggihan', coverNote: 'Cover note (opsyonal)', send: 'Isumite ang Aplikasyon', cancel: 'Kanselahin' },
};

const levelColors = { A1: '#6B6B6B', A2: '#10B981', B1: '#C9A84C', B2: '#8B6914', C1: '#C41E3A', C2: '#7B1FA2' };
const statusColors = { submitted: '#C9A84C', reviewing: '#2A3F6A', interview: '#10B981', offered: '#10B981', rejected: '#C41E3A' };

export default function JobBoard() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const [jobs, setJobs] = useState([]);
  const [apps, setApps] = useState([]);
  const [levelFilter, setLevelFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [showApply, setShowApply] = useState(null);
  const [coverNote, setCoverNote] = useState('');
  const [tab, setTab] = useState('jobs');

  useEffect(() => {
    Promise.all([
      api.get('/bpo/jobs').then(r => setJobs(r.data.jobs || [])),
      api.get('/bpo/my/applications').then(r => setApps(r.data.applications || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const appliedJobIds = new Set(apps.map(a => a.job_id));

  const handleApply = async (jobId) => {
    setApplying(jobId);
    try {
      await api.post(`/bpo/jobs/${jobId}/apply`, { cover_note: coverNote || null });
      setApps(prev => [...prev, { job_id: jobId, status: 'submitted', applied_at: new Date().toISOString() }]);
      setShowApply(null);
      setCoverNote('');
    } catch (err) {
      if (err.response?.status === 409) setApps(prev => [...prev, { job_id: jobId }]);
    } finally { setApplying(null); }
  };

  const t = (obj, field) => obj?.[`${field}_${lang}`] || obj?.[`${field}_en`] || obj?.[field] || '';
  const filtered = jobs.filter(j => levelFilter === 'all' || j.spanish_level_required === levelFilter);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* Tabs */}
        <div style={s.tabs}>
          <button onClick={() => setTab('jobs')} style={{ ...s.tab, ...(tab === 'jobs' ? s.tabActive : {}) }}>{L.title} ({jobs.length})</button>
          <button onClick={() => setTab('apps')} style={{ ...s.tab, ...(tab === 'apps' ? s.tabActive : {}) }}>{L.myApps} ({apps.length})</button>
        </div>

        {tab === 'jobs' ? (
          <>
            {/* Level filter */}
            <div style={s.filterRow}>
              <span style={s.filterLabel}>{L.filterLevel}</span>
              {['all','A1','A2','B1','B2','C1','C2'].map(l => (
                <button key={l} onClick={() => setLevelFilter(l)} style={{ ...s.filterBtn, ...(levelFilter === l ? s.filterActive : {}) }}>{l === 'all' ? L.all : l}</button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={s.empty}>{L.noJobs}</div>
            ) : (
              <div style={s.jobList}>
                {filtered.map(j => {
                  const isApplied = appliedJobIds.has(j.id);
                  return (
                    <div key={j.id} style={s.jobCard}>
                      <div style={s.jobTop}>
                        <div>
                          <h3 style={s.jobTitle}>{j.title}</h3>
                          <div style={s.jobMeta}>
                            <span style={s.companyTag}>{j.company_name}</span>
                            <span>{j.location}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ ...s.levelBadge, background: levelColors[j.spanish_level_required] || '#C9A84C' }}>{j.spanish_level_required}</span>
                          <div style={s.salaryText}>{j.salary_range}</div>
                        </div>
                      </div>
                      <p style={s.jobDesc}>{t(j, 'description')}</p>
                      <div style={s.jobBottom}>
                        <span style={s.slotsText}>{j.slots} {L.slots}</span>
                        {isApplied ? (
                          <span style={s.appliedBadge}>{L.applied} ✓</span>
                        ) : showApply === j.id ? (
                          <div style={s.applyForm}>
                            <textarea style={s.coverInput} value={coverNote} onChange={e => setCoverNote(e.target.value)} placeholder={L.coverNote} rows={3} />
                            <div style={s.applyActions}>
                              <button onClick={() => { setShowApply(null); setCoverNote(''); }} style={s.cancelBtn}>{L.cancel}</button>
                              <button onClick={() => handleApply(j.id)} disabled={applying === j.id} style={s.submitApplyBtn}>{applying === j.id ? L.applying : L.send}</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setShowApply(j.id)} style={s.applyBtn}>{L.apply}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* My Applications */
          apps.length === 0 ? (
            <div style={s.empty}>{L.noApps}</div>
          ) : (
            <div style={s.jobList}>
              {apps.map((a, i) => (
                <div key={i} style={s.appCard}>
                  <div style={s.jobTop}>
                    <div>
                      <h3 style={s.jobTitle}>{a.title || 'Position'}</h3>
                      <div style={s.jobMeta}>
                        <span style={s.companyTag}>{a.company_name || ''}</span>
                        {a.location && <span>{a.location}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ ...s.appStatus, color: statusColors[a.status] || '#6B6B6B' }}>{L[a.status] || a.status}</span>
                      {a.applied_at && <div style={s.appDate}>{L.appliedOn}: {new Date(a.applied_at).toLocaleDateString()}</div>}
                    </div>
                  </div>
                  {a.salary_range && <div style={s.salaryText}>{a.salary_range}</div>}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '40px 32px 32px', borderBottom: '3px solid #C9A84C' },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 },
  headerSub: { fontSize: 14, color: '#E8D48B', fontStyle: 'italic', maxWidth: 600 },
  body: { padding: '24px 32px 48px', maxWidth: 900 },
  tabs: { display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #F5E6C8', paddingBottom: 0 },
  tab: { padding: '10px 24px', background: 'none', border: 'none', borderBottom: '3px solid transparent', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#6B6B6B', marginBottom: -2 },
  tabActive: { color: '#1B2A4A', borderBottomColor: '#C9A84C' },
  filterRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  filterLabel: { fontSize: 12, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase', marginRight: 8 },
  filterBtn: { padding: '5px 14px', border: '1px solid #ddd', background: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#6B6B6B', transition: 'all 0.2s' },
  filterActive: { background: '#1B2A4A', color: '#C9A84C', borderColor: '#1B2A4A' },
  jobList: { display: 'flex', flexDirection: 'column', gap: 16 },
  jobCard: { background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderLeft: '4px solid #C9A84C' },
  appCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '4px solid #2A3F6A' },
  jobTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12, flexWrap: 'wrap' },
  jobTitle: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#1B2A4A', marginBottom: 6 },
  jobMeta: { display: 'flex', gap: 12, fontSize: 12, color: '#6B6B6B', alignItems: 'center' },
  companyTag: { fontWeight: 600, color: '#8B6914' },
  levelBadge: { fontSize: 11, fontWeight: 700, color: '#fff', padding: '3px 10px', borderRadius: 12, letterSpacing: 0.5, display: 'inline-block', marginBottom: 4 },
  salaryText: { fontSize: 13, fontWeight: 700, color: '#10B981', marginTop: 4 },
  jobDesc: { fontSize: 14, color: '#6B6B6B', lineHeight: 1.6, marginBottom: 16 },
  jobBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  slotsText: { fontSize: 12, color: '#8B6914', fontWeight: 500 },
  applyBtn: { padding: '8px 24px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 },
  appliedBadge: { fontSize: 13, fontWeight: 700, color: '#10B981' },
  applyForm: { flex: 1, maxWidth: 400 },
  coverInput: { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, fontFamily: "'Inter',sans-serif", resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 },
  applyActions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  cancelBtn: { padding: '6px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: '#6B6B6B' },
  submitApplyBtn: { padding: '6px 16px', background: '#1B2A4A', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#C9A84C' },
  appStatus: { fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' },
  appDate: { fontSize: 11, color: '#6B6B6B', marginTop: 4 },
  empty: { textAlign: 'center', padding: 48, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: '#6B6B6B', fontSize: 15 },
};
