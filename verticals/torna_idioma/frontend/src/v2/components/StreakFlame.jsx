import React from 'react';

/**
 * StreakFlame — visual streak counter with pulse animation when active.
 *
 * Props:
 *   current — current streak (int)
 *   longest — longest streak ever (int)
 *   active  — true if last_activity was today or yesterday
 */
export default function StreakFlame({ current = 0, longest = 0, active = false }) {
  return (
    <div style={styles.container}>
      <div style={{ ...styles.flame, ...(active && current > 0 ? styles.flameActive : {}) }}>
        <span style={styles.days}>{current}</span>
        <span style={styles.unit}>day{current !== 1 ? 's' : ''}</span>
      </div>
      <div style={styles.label}>Current Streak</div>
      {longest > current && (
        <div style={styles.longest}>Longest: {longest}</div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  flame: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'rgba(196, 30, 58, 0.1)',
    border: '2px solid rgba(196, 30, 58, 0.3)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s'
  },
  flameActive: {
    background: 'rgba(245, 158, 11, 0.15)',
    border: '2px solid rgba(245, 158, 11, 0.5)',
    boxShadow: '0 0 24px rgba(245, 158, 11, 0.3)'
  },
  days: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    fontWeight: 900,
    color: '#fcd34d',
    lineHeight: 1
  },
  unit: { fontSize: 9, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: '#C9A84C',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 4
  },
  longest: { fontSize: 10, color: '#64748b' }
};
