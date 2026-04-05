import React from 'react';

/**
 * XPBar — displays total XP with an animated progress bar to next level.
 * Levels are computed as every 100 XP = 1 level (simple).
 */
export default function XPBar({ totalXp = 0, label = 'Total XP' }) {
  const level = Math.floor(totalXp / 100) + 1;
  const xpInLevel = totalXp % 100;
  const pct = xpInLevel; // 0-100

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        <span style={styles.level}>Level {level}</span>
      </div>
      <div style={styles.bar}>
        <div style={{ ...styles.fill, width: `${pct}%` }} />
      </div>
      <div style={styles.footer}>
        <span style={styles.current}>{totalXp.toLocaleString()} XP</span>
        <span style={styles.next}>{100 - xpInLevel} to next level</span>
      </div>
    </div>
  );
}

const styles = {
  container: { width: '100%' },
  header: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 2, textTransform: 'uppercase' },
  level: { fontSize: 11, fontWeight: 800, color: '#E8D48B' },
  bar: {
    height: 10,
    background: 'rgba(15, 26, 46, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 5,
    overflow: 'hidden'
  },
  fill: {
    height: '100%',
    background: 'linear-gradient(90deg, #C9A84C, #E8D48B)',
    transition: 'width 0.5s ease',
    boxShadow: '0 0 12px rgba(201, 168, 76, 0.4)'
  },
  footer: { display: 'flex', justifyContent: 'space-between', marginTop: 4 },
  current: { fontSize: 10, color: '#94a3b8', fontWeight: 600 },
  next: { fontSize: 10, color: '#64748b' }
};
