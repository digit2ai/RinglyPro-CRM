import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { tr, uiLang } from '../i18n';

// Heritage theme tokens
const GOLD = '#C9A84C';
const GOLD_DARK = '#8B6914';
const NAVY_DARK = '#0F1A2E';
const NAVY = '#1B2A4A';
const CREAM = '#FFF8E7';
const CREAM_LIGHT = '#FFFDF5';
const BORDER = '#F5E6C8';
const RED = '#C41E3A';

// Resolve a badge's label for the active interface language.
function badgeLabel(badge) {
  if (!badge) return '';
  return uiLang() === 'fil' ? (badge.label_fil || badge.label_en || '') : (badge.label_en || badge.label_fil || '');
}

export default function Emperador() {
  const [me, setMe] = useState(null);
  const [scope, setScope] = useState('tenant');
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState(false);

  // Settings form state
  const [anonymous, setAnonymous] = useState(false);
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchBoard = useCallback(async (sc) => {
    setBoardLoading(true);
    try {
      const r = await api.get(`/emperador/leaderboard?scope=${encodeURIComponent(sc)}`);
      setBoard(Array.isArray(r.data?.leaderboard) ? r.data.leaderboard : []);
    } catch (e) {
      setBoard([]);
    } finally {
      setBoardLoading(false);
    }
  }, []);

  const fetchMe = useCallback(async () => {
    const r = await api.get('/emperador/me');
    setMe(r.data || null);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        await Promise.all([fetchMe(), fetchBoard('tenant')]);
      } catch (e) {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchMe, fetchBoard]);

  const changeScope = (sc) => {
    if (sc === scope) return;
    setScope(sc);
    fetchBoard(sc);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.post('/emperador/settings', { anonymous, display_handle: handle });
      await Promise.all([fetchMe(), fetchBoard(scope)]);
    } catch (e) {
      // soft-fail; settings keep their local values
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={s.page}>
        <Header />
        <div style={s.stateBox}>{tr('common.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.page}>
        <Header />
        <div style={{ ...s.stateBox, color: RED }}>{tr('common.error')}</div>
      </div>
    );
  }

  const points = Number(me?.points ?? 0);
  const rank = me?.rank ?? '—';
  const badge = me?.badge || null;
  const nextBadge = me?.next_badge || null;
  const toNext = Number(me?.points_to_next ?? 0);
  const components = me?.components && typeof me.components === 'object' ? me.components : {};

  // Progress: how far between current badge floor and next badge floor.
  let progressPct = 0;
  if (nextBadge && typeof nextBadge.min === 'number') {
    const floor = (badge && typeof badge.min === 'number') ? badge.min : 0;
    const span = nextBadge.min - floor;
    progressPct = span > 0 ? Math.max(0, Math.min(100, ((points - floor) / span) * 100)) : 0;
  }

  return (
    <div style={s.page} className="emp-page">
      <style>{RESPONSIVE_CSS}</style>
      <Header />

      <div style={s.body} className="emp-body">
        {/* My standing card */}
        <div style={s.card}>
          <div style={s.myGrid} className="emp-mygrid">
            <div style={s.statBlock}>
              <div style={s.statLabel}>{tr('emp.rank')}</div>
              <div style={s.statValue}>#{rank}</div>
            </div>
            <div style={s.statBlock}>
              <div style={s.statLabel}>{tr('emp.points')}</div>
              <div style={s.statValue}>{points.toLocaleString()}</div>
            </div>
            <div style={s.statBlock}>
              <div style={s.statLabel}>{tr('emp.badge')}</div>
              <div style={s.badgePill}>{badge ? badgeLabel(badge) : '—'}</div>
            </div>
          </div>

          {nextBadge && (
            <div style={s.nextWrap}>
              <div style={s.nextRow}>
                <span style={s.nextLabel}>{tr('emp.nextBadge')}</span>
                <span style={s.nextBadgeName}>{badgeLabel(nextBadge)}</span>
              </div>
              <div style={s.progressTrack}>
                <div style={{ ...s.progressFill, width: `${progressPct}%` }} />
              </div>
              <div style={s.toNext}>{`${toNext.toLocaleString()} ${tr('emp.toNext')}`}</div>
            </div>
          )}
        </div>

        {/* Leaderboard card */}
        <div style={s.card}>
          <div style={s.cardHeadRow}>
            <h2 style={s.cardTitle}>{tr('emp.leaderboard')}</h2>
            <div style={s.scopeToggle}>
              <button
                onClick={() => changeScope('tenant')}
                style={{ ...s.scopeBtn, ...(scope === 'tenant' ? s.scopeBtnActive : {}) }}
              >
                {tr('emp.scopeTenant')}
              </button>
              <button
                onClick={() => changeScope('school')}
                style={{ ...s.scopeBtn, ...(scope === 'school' ? s.scopeBtnActive : {}) }}
              >
                {tr('emp.scopeSchool')}
              </button>
            </div>
          </div>

          {boardLoading ? (
            <div style={s.stateBoxInner}>{tr('common.loading')}</div>
          ) : board.length === 0 ? (
            <div style={s.stateBoxInner}>—</div>
          ) : (
            <div style={s.list}>
              {board.map((row, i) => {
                const isEmp = !!row.is_emperador || row.rank === 1;
                const isMe = !!row.is_me;
                const rowStyle = {
                  ...s.row,
                  ...(isEmp ? s.rowEmperador : {}),
                  ...(isMe && !isEmp ? s.rowMe : {}),
                };
                return (
                  <div key={`${row.rank}-${i}`} style={rowStyle}>
                    <div style={{ ...s.rowRank, ...(isEmp ? s.rowRankEmp : {}) }}>{row.rank}</div>
                    <div style={s.rowMain}>
                      <div style={s.rowNameWrap}>
                        <span style={{ ...s.rowName, ...(isEmp ? s.rowNameEmp : {}) }}>
                          {row.name}
                        </span>
                        {isMe && <span style={s.mePill}>{tr('emp.you')}</span>}
                      </div>
                      {isEmp && <div style={s.crownPill}>{tr('emp.emperador')}</div>}
                      {!isEmp && row.badge && (
                        <div style={s.rowBadge}>{badgeLabel(row.badge)}</div>
                      )}
                    </div>
                    <div style={{ ...s.rowPoints, ...(isEmp ? s.rowPointsEmp : {}) }}>
                      {Number(row.points ?? 0).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Components breakdown card */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>{tr('emp.components')}</h2>
          {Object.keys(components).length === 0 ? (
            <div style={s.stateBoxInner}>—</div>
          ) : (
            <div style={s.compGrid}>
              {Object.entries(components).map(([key, val]) => (
                <div key={key} style={s.compItem}>
                  <span style={s.compLabel}>{tr('emp.c.' + key)}</span>
                  <span style={s.compValue}>{Number(val ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <p style={s.honorNote}>{tr('emp.honorNote')}</p>
        </div>

        {/* Settings card */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>{tr('emp.title')}</h2>
          <label style={s.checkRow}>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={e => setAnonymous(e.target.checked)}
              style={s.checkbox}
            />
            <span style={s.checkLabel}>{tr('emp.anonToggle')}</span>
          </label>

          <div style={s.field}>
            <label style={s.fieldLabel}>{tr('emp.handle')}</label>
            <input
              type="text"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder={tr('emp.handlePlaceholder')}
              style={s.textInput}
            />
          </div>

          <button
            onClick={saveSettings}
            disabled={saving}
            style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? tr('common.loading') : tr('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={s.header} className="emp-header">
      <div style={s.headerLeft}>
        <div style={s.crest}>E</div>
        <div>
          <h1 style={s.headerTitle}>{tr('emp.title')}</h1>
          <p style={s.headerSub}>{tr('emp.subtitle')}</p>
        </div>
      </div>
    </div>
  );
}

// Mobile/tablet responsiveness: shrink padding, stack the 3 standing stats to a
// single column on phones, no horizontal scroll. Visual-only.
const RESPONSIVE_CSS = `
@media (max-width: 768px) {
  .emp-page { overflow-x: hidden; }
  .emp-header { padding: 16px 16px !important; }
  .emp-body { padding: 18px 16px !important; }
}
@media (max-width: 480px) {
  .emp-mygrid { grid-template-columns: 1fr !important; }
}
`;

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: CREAM, minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { background: `linear-gradient(135deg, ${NAVY_DARK}, ${NAVY}, #2A3F6A)`, padding: '24px 32px', borderBottom: `3px solid ${GOLD}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  crest: { width: 52, height: 52, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: `2px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 800, color: GOLD },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: '#E8D48B', fontStyle: 'italic', maxWidth: 620 },

  body: { flex: 1, padding: '24px 32px', maxWidth: 880, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, boxSizing: 'border-box' },

  stateBox: { padding: '48px 32px', textAlign: 'center', fontSize: 15, color: GOLD_DARK, fontStyle: 'italic' },
  stateBoxInner: { padding: '20px 0', textAlign: 'center', fontSize: 14, color: GOLD_DARK, fontStyle: 'italic' },

  card: { background: CREAM_LIGHT, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '22px 24px', boxShadow: '0 2px 10px rgba(15,26,46,0.05)' },
  cardHeadRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  cardTitle: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 16 },

  // My standing
  myGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  statBlock: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 14px', textAlign: 'center' },
  statLabel: { fontSize: 11, fontWeight: 700, color: GOLD_DARK, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  statValue: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: NAVY },
  badgePill: { display: 'inline-block', padding: '6px 14px', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})`, color: '#fff', borderRadius: 20, fontSize: 13, fontWeight: 700, marginTop: 4 },

  nextWrap: { marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BORDER}` },
  nextRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  nextLabel: { fontSize: 11, fontWeight: 700, color: GOLD_DARK, letterSpacing: 1, textTransform: 'uppercase' },
  nextBadgeName: { fontSize: 13, fontWeight: 700, color: NAVY },
  progressTrack: { height: 10, background: BORDER, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DARK})`, borderRadius: 6, transition: 'width 0.4s ease' },
  toNext: { marginTop: 6, fontSize: 12, color: GOLD_DARK, fontStyle: 'italic', textAlign: 'right' },

  // Scope toggle
  scopeToggle: { display: 'flex', gap: 6, marginBottom: 16 },
  scopeBtn: { padding: '8px 14px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: NAVY, cursor: 'pointer' },
  scopeBtnActive: { background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DARK})`, color: '#fff', borderColor: NAVY },

  // Leaderboard
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10 },
  rowEmperador: { background: 'linear-gradient(135deg, rgba(201,168,76,0.16), rgba(139,105,20,0.10))', border: `2px solid ${GOLD}`, boxShadow: '0 2px 12px rgba(201,168,76,0.30)' },
  rowMe: { borderColor: NAVY, boxShadow: '0 0 0 1px rgba(27,42,74,0.25)' },
  rowRank: { width: 34, height: 34, flexShrink: 0, borderRadius: '50%', background: BORDER, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 },
  rowRankEmp: { background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})`, color: '#fff' },
  rowMain: { flex: 1, minWidth: 0 },
  rowNameWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 14, fontWeight: 600, color: '#2C2C2C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowNameEmp: { fontFamily: "'Playfair Display',serif", fontWeight: 800, color: NAVY },
  mePill: { fontSize: 10, fontWeight: 700, color: '#fff', background: NAVY, padding: '2px 8px', borderRadius: 10, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 },
  crownPill: { display: 'inline-block', marginTop: 4, padding: '2px 10px', background: 'transparent', border: `1px solid ${GOLD}`, color: GOLD_DARK, borderRadius: 12, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 },
  rowBadge: { marginTop: 3, fontSize: 11, color: GOLD_DARK, fontStyle: 'italic' },
  rowPoints: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 800, color: NAVY, flexShrink: 0 },
  rowPointsEmp: { color: GOLD_DARK },

  // Components
  compGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 },
  compItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10 },
  compLabel: { fontSize: 13, color: '#4A4A4A' },
  compValue: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 800, color: NAVY },
  honorNote: { marginTop: 16, fontSize: 12, color: GOLD_DARK, fontStyle: 'italic', lineHeight: 1.6 },

  // Settings
  checkRow: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 18 },
  checkbox: { width: 18, height: 18, accentColor: GOLD_DARK, cursor: 'pointer' },
  checkLabel: { fontSize: 14, color: '#2C2C2C' },
  field: { marginBottom: 18 },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 700, color: GOLD_DARK, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  textInput: { width: '100%', padding: '12px 14px', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 15, fontFamily: "'Inter',sans-serif", outline: 'none', boxSizing: 'border-box', background: '#fff' },
  saveBtn: { padding: '12px 28px', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})`, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1 },
};
