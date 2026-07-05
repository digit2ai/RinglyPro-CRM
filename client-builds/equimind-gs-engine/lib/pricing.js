// =====================================================
// GS pricing config — credit cost per processing minute + per GB stored, plus a
// premium gate for Course Walk sharing. Overridable via env. 1 credit = $1
// (consistent with the EquiMind credit system). Also computes unit economics.
// =====================================================
'use strict';

const CFG = {
  // Credits charged per MINUTE of source video processed (capture -> splat).
  credits_per_processing_min: numEnv('GS_CREDITS_PER_MIN', 3),
  // Credits per GB-month of stored scene assets (metered on archive/report).
  credits_per_gb_month: numEnv('GS_CREDITS_PER_GB_MONTH', 1),
  // Minimum charge per job (covers fixed provider overhead).
  min_credits_per_job: numEnv('GS_MIN_CREDITS', 2),
  // Premium tier gate: sharing a Course Walk link requires premium (or per-share credits).
  share_requires_premium: process.env.GS_SHARE_REQUIRES_PREMIUM === '1',
  // Quota guards.
  max_concurrent_jobs_per_tenant: numEnv('GS_MAX_CONCURRENT', 2),
  max_source_seconds: numEnv('GS_MAX_SOURCE_SEC', 180),
  max_source_bytes: numEnv('GS_MAX_SOURCE_BYTES', 500 * 1024 * 1024),
  min_frames: numEnv('GS_MIN_FRAMES', 20),
  // Assumed provider COST (USD) per processing minute — for unit economics only.
  provider_usd_per_min: numEnv('GS_PROVIDER_USD_PER_MIN', 0.60),
  usd_per_credit: numEnv('GS_USD_PER_CREDIT', 1.0)
};

function numEnv(k, d) { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; }

// Credits to charge for a job given source seconds + stored bytes.
function jobCredits({ source_seconds = 0, storage_bytes = 0 }) {
  const mins = Math.max(0, source_seconds) / 60;
  const gb = Math.max(0, storage_bytes) / (1024 * 1024 * 1024);
  const proc = mins * CFG.credits_per_processing_min;
  const store = gb * CFG.credits_per_gb_month;
  return Math.max(CFG.min_credits_per_job, Math.ceil(proc + store));
}

// Unit economics for a scene: credits charged vs assumed provider cost -> margin.
function unitEconomics({ source_seconds = 0 }) {
  const mins = Math.max(0, source_seconds) / 60;
  const credits = jobCredits({ source_seconds });
  const revenue_usd = credits * CFG.usd_per_credit;
  const cost_usd = mins * CFG.provider_usd_per_min;
  const margin_usd = revenue_usd - cost_usd;
  return {
    source_minutes: Number(mins.toFixed(2)), credits_charged: credits,
    revenue_usd: Number(revenue_usd.toFixed(2)), provider_cost_usd: Number(cost_usd.toFixed(2)),
    margin_usd: Number(margin_usd.toFixed(2)), margin_pct: revenue_usd > 0 ? Number(((margin_usd / revenue_usd) * 100).toFixed(1)) : null
  };
}

module.exports = { CFG, jobCredits, unitEconomics };
