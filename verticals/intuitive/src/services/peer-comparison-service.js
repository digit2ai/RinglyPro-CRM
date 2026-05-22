'use strict';

/**
 * Peer Comparison Service (Deck 3 Slide 19 — MUSC pattern)
 *
 * For a given hospital project, identifies 2-3 peer academic/community medical
 * centers and computes their historical bed-day savings + dollar impact from
 * robotic surgery adoption. Drives the "Here's what MUSC did, you're positioned
 * to do the same" slide in the executive brief.
 *
 * Data sources: IntuitiveHospital + IntuitiveHospitalDrgVolume already ingested
 * from CMS public datasets. Bed-day cost is state-local (kff.org-backed table).
 */

// State-local bed-day cost (Kaiser Family Foundation non-profit hospital averages, 2023)
// Source: kff.org/state-indicator/expenses-per-inpatient-day
const BED_DAY_COST_BY_STATE = {
  AL: 2050, AK: 3315, AZ: 2715, AR: 1985, CA: 4180, CO: 3140, CT: 3320,
  DE: 2740, FL: 1850, GA: 2310, HI: 2270, ID: 2480, IL: 2790, IN: 2305,
  IA: 1955, KS: 2240, KY: 2095, LA: 2095, ME: 2670, MD: 2730, MA: 3590,
  MI: 2440, MN: 2495, MS: 1735, MO: 2280, MT: 2245, NE: 2280, NV: 2660,
  NH: 3120, NJ: 3225, NM: 2845, NY: 2885, NC: 2380, ND: 2150, OH: 2410,
  OK: 2100, OR: 3960, PA: 2480, RI: 2740, SC: 2429, SD: 2090, TN: 2235,
  TX: 2625, UT: 3080, VT: 2380, VA: 2425, WA: 3845, WV: 2160, WI: 2515,
  WY: 2640, DC: 4750,
};

const NATIONAL_BED_DAY_COST = 2607;

// LOS reduction per case when converting open → robotic, by procedure family
// Sourced from CMS Medicare Inpatient hospital reports + published meta-analyses
const LOS_DELTA_OPEN_TO_ROBOTIC = {
  prostatectomy: 2.6,
  cystectomy: 3.8,
  nephrectomy_partial: 2.4,
  nephrectomy_radical: 2.1,
  hysterectomy_benign: 1.4,
  hysterectomy_malignant: 1.9,
  myomectomy: 1.5,
  colectomy: 4.7,
  rectal_resection: 5.2,
  cholecystectomy: 1.8,
  hernia_ventral: 4.3,
  hernia_inguinal: 1.6,
  hernia_umbilical: 2.0,
  bariatric: 1.1,
  pancreatic: 3.8,
  lobectomy: 4.5,
  thymectomy: 4.0,
  esophagectomy: 5.8,
  default: 2.5,
};

function bedDayCost(state) {
  if (!state) return NATIONAL_BED_DAY_COST;
  const s = String(state).toUpperCase().trim();
  return BED_DAY_COST_BY_STATE[s] || NATIONAL_BED_DAY_COST;
}

function losDelta(procedure) {
  if (!procedure) return LOS_DELTA_OPEN_TO_ROBOTIC.default;
  const k = String(procedure).toLowerCase().replace(/[^a-z0-9]/g, '_');
  for (const key of Object.keys(LOS_DELTA_OPEN_TO_ROBOTIC)) {
    if (k.includes(key)) return LOS_DELTA_OPEN_TO_ROBOTIC[key];
  }
  return LOS_DELTA_OPEN_TO_ROBOTIC.default;
}

/**
 * Find 2-3 peer hospitals in the same region/bed-size tier as the target.
 * Returns peer records with computed bed-day savings track record.
 */
async function findPeerHospitals(targetHospital, models, options = {}) {
  if (!targetHospital) return [];
  const { IntuitiveHospital, IntuitiveHospitalDrgVolume } = models;
  if (!IntuitiveHospital) return [];

  const targetBeds = parseInt(targetHospital.bed_count || targetHospital.beds || 0);
  const targetState = String(targetHospital.state || '').toUpperCase();
  const targetType = String(targetHospital.hospital_type || targetHospital.hospital_ownership || '').toLowerCase();
  const isAcademic = /academic|teaching|university/.test(targetType) ||
                     /university|medical center/i.test(targetHospital.hospital_name || '');

  // Bed-size tier: ±30% of target beds, fallback 200-600 range
  const minBeds = targetBeds > 0 ? Math.floor(targetBeds * 0.7) : 200;
  const maxBeds = targetBeds > 0 ? Math.ceil(targetBeds * 1.3) : 600;

  const where = {
    beds: { [models.Sequelize.Op.between]: [minBeds, maxBeds] },
  };

  // Try same region first (US Census regions, simplified to nearby states)
  const REGION = {
    Northeast: ['CT','ME','MA','NH','NJ','NY','PA','RI','VT'],
    Midwest: ['IL','IN','IA','KS','MI','MN','MO','NE','ND','OH','SD','WI'],
    South: ['AL','AR','DE','FL','GA','KY','LA','MD','MS','NC','OK','SC','TN','TX','VA','WV','DC'],
    West: ['AK','AZ','CA','CO','HI','ID','MT','NV','NM','OR','UT','WA','WY'],
  };
  let regionStates = null;
  for (const [, sts] of Object.entries(REGION)) {
    if (sts.includes(targetState)) { regionStates = sts; break; }
  }
  if (regionStates) {
    where.state = { [models.Sequelize.Op.in]: regionStates };
  }

  // Exclude target itself
  if (targetHospital.ccn || targetHospital.cms_facility_id) {
    where.ccn = { [models.Sequelize.Op.ne]: targetHospital.ccn || targetHospital.cms_facility_id };
  }

  let candidates = [];
  try {
    candidates = await IntuitiveHospital.findAll({
      where,
      limit: 30,
      order: [['beds', 'DESC']],
    });
  } catch (e) {
    console.error('peer-comparison: search error:', e.message);
    return [];
  }

  // Prefer academic peers when target is academic
  if (isAcademic) {
    candidates.sort((a, b) => {
      const aAcad = /university|medical center|teaching/i.test(a.hospital_name || '') ? 1 : 0;
      const bAcad = /university|medical center|teaching/i.test(b.hospital_name || '') ? 1 : 0;
      return bAcad - aAcad;
    });
  }

  // Pick top 3 distinct peers
  const peers = candidates.slice(0, 3);

  // For each peer, compute historical bed-day savings if DRG volume data exists
  const enriched = [];
  for (const peer of peers) {
    let savings = await computePeerSavings(peer, models);
    enriched.push({
      hospital_name: peer.hospital_name,
      state: peer.state,
      beds: peer.beds,
      ccn: peer.ccn,
      hospital_type: peer.hospital_type || peer.hospital_ownership,
      bed_day_cost_used: bedDayCost(peer.state),
      ...savings,
    });
  }

  return enriched;
}

/**
 * Compute the bed-day savings track record for a peer hospital from CMS DRG volume.
 * Returns: { robotic_procedures_estimated, bed_days_saved_estimated, dollar_savings_estimated, top_procedures }
 */
async function computePeerSavings(peer, models) {
  const { IntuitiveHospitalDrgVolume } = models;
  if (!IntuitiveHospitalDrgVolume || !peer.ccn) {
    return {
      robotic_procedures_estimated: 0,
      bed_days_saved_estimated: 0,
      dollar_savings_estimated: 0,
      top_procedures: [],
      note: 'Insufficient CMS DRG volume data',
    };
  }

  let drgRows = [];
  try {
    drgRows = await IntuitiveHospitalDrgVolume.findAll({
      where: { ccn: peer.ccn },
      limit: 50,
      order: [['discharges', 'DESC']],
    });
  } catch (e) {
    // Schema may not have ccn field — try fallback
    try {
      drgRows = await IntuitiveHospitalDrgVolume.findAll({
        where: { provider_id: peer.ccn },
        limit: 50,
        order: [['discharges', 'DESC']],
      });
    } catch (e2) { /* no data */ }
  }

  if (!drgRows.length) {
    return {
      robotic_procedures_estimated: 0,
      bed_days_saved_estimated: 0,
      dollar_savings_estimated: 0,
      top_procedures: [],
      note: 'No DRG volume data',
    };
  }

  // Heuristic: assume robotic-suitable procedures saw 30% conversion to robotic
  // historical over the dataset window. Apply LOS delta per family.
  const ROBOTIC_SUITABLE_DRGS = {
    '707': 'prostatectomy', '708': 'prostatectomy',
    '653': 'nephrectomy_partial', '654': 'nephrectomy_radical',
    '743': 'hysterectomy_benign', '744': 'hysterectomy_malignant',
    '329': 'colectomy', '330': 'colectomy', '331': 'rectal_resection',
    '418': 'cholecystectomy', '352': 'hernia_inguinal',
    '350': 'hernia_ventral', '353': 'hernia_umbilical',
    '163': 'lobectomy', '164': 'lobectomy',
    '326': 'esophagectomy', '328': 'pancreatic', '405': 'pancreatic',
    '619': 'bariatric',
  };
  const HISTORICAL_CONVERSION_RATE = 0.30;

  const costPerDay = bedDayCost(peer.state);
  let bedDaysSaved = 0;
  let dollarSavings = 0;
  let roboticProcs = 0;
  const topProcs = [];

  for (const row of drgRows) {
    const drg = String(row.drg_code || row.ms_drg || '').padStart(3, '0').slice(-3);
    const family = ROBOTIC_SUITABLE_DRGS[drg];
    if (!family) continue;

    const discharges = parseInt(row.discharges || row.total_discharges || 0);
    if (!discharges) continue;

    const convertedCases = Math.round(discharges * HISTORICAL_CONVERSION_RATE);
    const delta = losDelta(family);
    const days = convertedCases * delta;
    const dollars = days * costPerDay;

    roboticProcs += convertedCases;
    bedDaysSaved += days;
    dollarSavings += dollars;

    topProcs.push({
      drg_code: drg,
      family,
      total_discharges: discharges,
      robotic_estimated: convertedCases,
      los_delta_per_case: delta,
      bed_days_saved: Math.round(days),
      dollar_impact: Math.round(dollars),
    });
  }

  topProcs.sort((a, b) => b.bed_days_saved - a.bed_days_saved);

  return {
    robotic_procedures_estimated: roboticProcs,
    bed_days_saved_estimated: Math.round(bedDaysSaved),
    dollar_savings_estimated: Math.round(dollarSavings),
    bed_day_cost_used: costPerDay,
    top_procedures: topProcs.slice(0, 10),
  };
}

module.exports = {
  findPeerHospitals,
  computePeerSavings,
  bedDayCost,
  losDelta,
  BED_DAY_COST_BY_STATE,
  NATIONAL_BED_DAY_COST,
};
