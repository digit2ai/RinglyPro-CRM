/**
 * Surgeon-commitment per-procedure math — single source of truth.
 *
 * Each procedure row carries TWO independent components that are SUMMED:
 *   CONVERTED   = OPEN cases/mo × 12 × (% of OPEN)   — existing volume switched to
 *                 robotic. Laparoscopic is NEVER counted. Drives cost avoidance.
 *   NET-NEW     = incremental_cases_annual (manual)  — surgeon-committed cases brought
 *                 from another hospital. Drives incremental revenue.
 *
 * Backward compatibility (production data cannot be migrated from local):
 *   Legacy rows stored the per-source total back into `incremental_cases_annual`
 *   (so an 'existing' row's incremental_cases_annual is a stale duplicate of its
 *   converted total). To avoid double-counting, NET-NEW is only read from
 *   incremental_cases_annual when the row is flagged `net_new_clean` (saved by the
 *   current editor) OR when patient_source === 'incremental' (legacy net-new rows).
 */

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// CONVERTED component (cases/yr) — existing OPEN volume × %, default 15% of OPEN.
function procConv(p) {
  const monthly = num(p.incremental_cases_monthly);
  const pct = (p.pct_converted_from_open != null ? num(p.pct_converted_from_open) : 15) / 100;
  return Math.round(monthly * 12 * pct);
}

// NET-NEW component (cases/yr) — surgeon-committed incremental volume, manual entry.
function procNetNew(p) {
  const v = Math.round(num(p.incremental_cases_annual));
  if (p.net_new_clean) return v;                       // current editor: genuine net-new
  return p.patient_source === 'incremental' ? v : 0;   // legacy: only 'incremental' rows
}

// Total annual cases for a procedure = converted + net-new.
function procAnnual(p) {
  return procConv(p) + procNetNew(p);
}

module.exports = { num, procConv, procNetNew, procAnnual };
