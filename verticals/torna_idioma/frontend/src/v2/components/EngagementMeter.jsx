import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';

/**
 * EngagementMeter — live 0-100 bar that polls /behavior/engagement-score.
 *
 * Props:
 *   pollIntervalMs — default 20000
 *   lookbackMinutes — default 15
 *   compact — if true, renders as a thin bar only
 */
export default function EngagementMeter({ pollIntervalMs = 20000, lookbackMinutes = 15, compact = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    v2Api.get(`/behavior/engagement-score?lookback_minutes=${lookbackMinutes}`)
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, pollIntervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollIntervalMs, lookbackMinutes]);

  const score = data?.score ?? 0;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label = score >= 70 ? 'Engaged' : score >= 40 ? 'Steady' : 'Low';

  if (compact) {
    return (
      <div style={styles.compactWrap}>
        <div style={styles.compactBar}>
          <div style={{ ...styles.compactFill, width: `${score}%`, background: color }} />
        </div>
        <span style={{ ...styles.compactLabel, color }}>{score}</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>ENGAGEMENT</span>
        <span style={{ ...styles.value, color }}>{score}</span>
      </div>
      <div style={styles.bar}>
        <div style={{ ...styles.fill, width: `${score}%`, background: color }} />
      </div>
      <div style={styles.footer}>
        <span style={{ color }}>{label}</span>
        {data?.samples > 0 && <span style={styles.samples}>· {data.samples} samples</span>}
      </div>
      {data?.components && (
        <div style={styles.components}>
          {Object.entries(data.components).map(([k, v]) => {
            if (v == null) return null;
            return (
              <div key={k} style={styles.component}>
                <span style={styles.compKey}>{k}</span>
                <span style={styles.compVal}>{v}</span>
              </div>
            );
          })}
        </div>
      )}
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles = {
  container: {
    background: 'rgba(15, 26, 46, 0.5)',
    border: '1px solid rgba(201, 168, 76, 0.15)',
    borderRadius: 12,
    padding: 14
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8
  },
  label: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 2 },
  value: { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 900, lineHeight: 1 },
  bar: {
    height: 8,
    background: 'rgba(15, 26, 46, 0.7)',
    borderRadius: 4,
    overflow: 'hidden'
  },
  fill: { height: '100%', transition: 'width 0.6s ease, background 0.6s ease' },
  footer: { display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, fontWeight: 600 },
  samples: { color: '#64748b' },
  components: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px solid rgba(201, 168, 76, 0.1)'
  },
  component: { display: 'flex', justifyContent: 'space-between', fontSize: 9 },
  compKey: { color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  compVal: { color: '#e2e8f0', fontWeight: 700 },
  error: { fontSize: 9, color: '#ef4444', marginTop: 4 },

  compactWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  compactBar: {
    flex: 1,
    height: 6,
    background: 'rgba(15, 26, 46, 0.7)',
    borderRadius: 3,
    overflow: 'hidden'
  },
  compactFill: { height: '100%', transition: 'width 0.6s ease, background 0.6s ease' },
  compactLabel: { fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 900, minWidth: 24, textAlign: 'right' }
};
