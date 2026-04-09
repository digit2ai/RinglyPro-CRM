/**
 * HISPATEC Mathematical Models
 * ============================
 * Pure-JS implementations of matching, trust propagation, network valuation,
 * Monte Carlo simulation, resource allocation, and composite index scoring
 * for the HISPATEC Hispanic professional network platform.
 *
 * No external dependencies -- all math is self-contained.
 */

'use strict';

// ---------------------------------------------------------------------------
// 1. GINI COEFFICIENT
// ---------------------------------------------------------------------------

/**
 * Compute the Gini coefficient for a set of non-negative values.
 * G = sum_i sum_j |x_i - x_j| / (2 * n^2 * mean)
 * Returns 0 for perfect equality, approaches 1 for maximum inequality.
 *
 * @param {number[]} values - Array of non-negative numbers (e.g. opportunity counts per region).
 * @returns {number} Gini coefficient in [0, 1]. Returns 0 for empty / zero-sum arrays.
 */
function calcGini(values) {
  if (!values || values.length === 0) return 0;

  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;

  const mean = sum / n;
  let diffSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      diffSum += Math.abs(values[i] - values[j]);
    }
  }

  return diffSum / (2 * n * n * mean);
}

/**
 * Compute a fairness correction factor for a specific region.
 * FC = 1 + alpha * ((meanOpp - regionOpp) / meanOpp)
 *
 * Regions below the mean get FC > 1 (boosted), above get FC < 1 (dampened).
 * Alpha controls the strength of the correction (typically 0.1 - 0.5).
 *
 * @param {number} regionOpp  - Opportunity count (or density) for this region.
 * @param {number} meanOpp    - Mean opportunity across all regions.
 * @param {number} alpha      - Correction strength, e.g. 0.3.
 * @returns {number} Correction factor (clamped to [0.5, 2.0] for safety).
 */
function calcGiniCorrection(regionOpp, meanOpp, alpha) {
  if (!meanOpp || meanOpp === 0) return 1;
  const raw = 1 + alpha * ((meanOpp - regionOpp) / meanOpp);
  return Math.max(0.5, Math.min(2.0, raw));
}

// ---------------------------------------------------------------------------
// 2. COSINE SIMILARITY & PROFILE MATCHING
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two numeric vectors.
 * sim(A,B) = dot(A,B) / (||A|| * ||B||)
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Similarity in [0, 1] (negative components are allowed but
 *                   typical profile vectors are non-negative so result is 0-1).
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

// Dimension weights for profile vectors -- order matters.
const PROFILE_WEIGHTS = {
  sector: 0.25,
  sub_specialty: 0.15,
  region: 0.10,
  country: 0.05,
  experience: 0.10,
  languages: 0.05,
  membership: 0.05,
  availability: 0.10,
  trust: 0.15,
};

// Mappings for categorical dimensions (extend as the platform grows).
const SECTOR_MAP = {
  technology: 0, finance: 1, healthcare: 2, education: 3, manufacturing: 4,
  construction: 5, agriculture: 6, logistics: 7, energy: 8, retail: 9,
  legal: 10, consulting: 11, media: 12, government: 13, nonprofit: 14,
};

const MEMBERSHIP_MAP = {
  free: 0.2,
  basic: 0.4,
  professional: 0.6,
  premium: 0.8,
  enterprise: 1.0,
};

/**
 * Build a weighted numeric profile vector from a member object.
 *
 * Each dimension is normalised to [0,1] then multiplied by its weight so that
 * cosine similarity directly reflects the weighted importance of each feature.
 *
 * @param {object} member
 * @param {string}   member.sector          - e.g. "technology"
 * @param {string}   member.sub_specialty   - free text; hashed to 0-1
 * @param {number}   member.region_id       - integer region identifier
 * @param {string}   member.country         - ISO-2 country code
 * @param {number}   member.years_experience
 * @param {string[]} member.languages       - e.g. ["es","en","pt"]
 * @param {string}   member.membership_type - key in MEMBERSHIP_MAP
 * @param {number}   [member.availability]  - 0-1, default 1
 * @param {number}   member.trust_score     - 0-1
 * @returns {number[]} Weighted profile vector of length 9.
 */
function buildProfileVector(member) {
  if (!member) return new Array(9).fill(0);

  // Sector: one-hot-ish normalised position
  const sectorVal = SECTOR_MAP.hasOwnProperty(member.sector)
    ? (SECTOR_MAP[member.sector] + 1) / (Object.keys(SECTOR_MAP).length)
    : 0.5;

  // Sub-specialty: simple string hash mapped to 0-1
  const subVal = member.sub_specialty ? simpleHash01(member.sub_specialty) : 0.5;

  // Region: normalise region_id assuming IDs in 1-100 range
  const regionVal = member.region_id ? Math.min(member.region_id / 100, 1) : 0.5;

  // Country: hash to 0-1
  const countryVal = member.country ? simpleHash01(member.country) : 0.5;

  // Experience: cap at 30 years
  const expVal = member.years_experience
    ? Math.min(member.years_experience / 30, 1)
    : 0;

  // Languages: more = higher, cap at 5
  const langVal = Array.isArray(member.languages)
    ? Math.min(member.languages.length / 5, 1)
    : 0;

  // Membership tier
  const memVal = MEMBERSHIP_MAP[member.membership_type] || 0.2;

  // Availability (0-1)
  const availVal = member.availability != null ? member.availability : 1;

  // Trust score (0-1)
  const trustVal = member.trust_score || 0;

  const raw = [sectorVal, subVal, regionVal, countryVal, expVal, langVal, memVal, availVal, trustVal];
  const weightArr = Object.values(PROFILE_WEIGHTS);

  return raw.map((v, i) => v * weightArr[i]);
}

/**
 * Match a query vector against a list of candidates, applying optional Gini
 * fairness corrections per region.
 *
 * @param {number[]} queryVector - Weighted profile vector (from buildProfileVector).
 * @param {object[]} candidates  - Each must have {member_id, vector, trust_score, region}.
 * @param {Object<string,number>} [giniCorrections] - Region -> correction factor map.
 * @returns {{member_id:number, score:number, trust:number, region:string}[]}
 *          Sorted descending by score.
 */
function matchMembers(queryVector, candidates, giniCorrections) {
  if (!candidates || candidates.length === 0) return [];

  const corrections = giniCorrections || {};

  const scored = candidates.map((c) => {
    const rawSim = cosineSimilarity(queryVector, c.vector);
    const regionFactor = corrections[c.region] || 1;
    const score = rawSim * regionFactor;

    return {
      member_id: c.member_id,
      score: Math.min(score, 1),
      trust: c.trust_score || 0,
      region: c.region,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ---------------------------------------------------------------------------
// 3. TRUST RANK (PageRank-style)
// ---------------------------------------------------------------------------

/**
 * Calculate the base trust score for a single member from static attributes.
 *
 * T_base = 0.30*V + 0.25*R + 0.20*P + 0.15*A + 0.10*M
 *
 * @param {object} member
 * @param {number} member.verification    - 0 or 1 (identity verified)
 * @param {number} member.avg_references  - average reference score 0-1
 * @param {number} member.project_success - project success rate 0-1
 * @param {number} member.tenure_years    - years on platform
 * @param {number} member.membership_level - normalised 0-1 (e.g. free=0.2 ... enterprise=1)
 * @returns {number} Trust base score in [0, 1].
 */
function calcTrustBase(member) {
  if (!member) return 0;

  const V = member.verification || 0;
  const R = member.avg_references || 0;
  const P = member.project_success || 0;
  const A = Math.min((member.tenure_years || 0) / 5, 1);
  const M = member.membership_level || 0;

  return 0.30 * V + 0.25 * R + 0.20 * P + 0.15 * A + 0.10 * M;
}

/**
 * Run iterative TrustRank propagation (PageRank variant) over the member graph.
 *
 * T_i^(t+1) = (1 - d) + d * sum_j( T_j^(t) * w_ji / L_j )
 *
 * Where:
 *  - d is the damping factor (typically 0.85)
 *  - w_ji is the weight of the reference from j to i (0-1)
 *  - L_j is the out-degree (total weight) of node j
 *
 * @param {object[]} members     - [{member_id, ...fields for calcTrustBase}]
 * @param {object[]} references  - [{from_id, to_id, weight}]  weight in (0,1]
 * @param {number}   [damping=0.85]
 * @param {number}   [maxIter=50]
 * @returns {Object<number,number>} Map of member_id -> converged trust score.
 */
function runTrustRank(members, references, damping, maxIter) {
  if (!members || members.length === 0) return {};

  const d = damping != null ? damping : 0.85;
  const iterations = maxIter || 50;
  const EPSILON = 1e-6;

  // Initialise trust from base scores
  const trust = {};
  const ids = [];
  for (const m of members) {
    trust[m.member_id] = calcTrustBase(m);
    ids.push(m.member_id);
  }

  // Build adjacency: inbound[to] = [{from, weight}], outWeight[from] = total weight
  const inbound = {};
  const outWeight = {};
  for (const id of ids) {
    inbound[id] = [];
    outWeight[id] = 0;
  }

  for (const ref of (references || [])) {
    if (inbound[ref.to_id] && outWeight.hasOwnProperty(ref.from_id)) {
      const w = ref.weight || 1;
      inbound[ref.to_id].push({ from: ref.from_id, weight: w });
      outWeight[ref.from_id] += w;
    }
  }

  // Iterate
  for (let iter = 0; iter < iterations; iter++) {
    const newTrust = {};
    let maxDelta = 0;

    for (const id of ids) {
      let sum = 0;
      for (const edge of inbound[id]) {
        const Lj = outWeight[edge.from] || 1;
        sum += (trust[edge.from] * edge.weight) / Lj;
      }
      newTrust[id] = (1 - d) + d * sum;
      maxDelta = Math.max(maxDelta, Math.abs(newTrust[id] - trust[id]));
    }

    for (const id of ids) {
      trust[id] = newTrust[id];
    }

    if (maxDelta < EPSILON) break;
  }

  // Normalise to [0,1] by dividing by the max value
  const maxVal = Math.max(...Object.values(trust), 1);
  for (const id of ids) {
    trust[id] = trust[id] / maxVal;
  }

  return trust;
}

// ---------------------------------------------------------------------------
// 4. NETWORK VALUE (Adapted Metcalfe's Law)
// ---------------------------------------------------------------------------

/**
 * Full pairwise network value using trust-weighted connections.
 *
 * V = k * sum_i sum_{j>i} (T_i * T_j * C_ij)
 *
 * @param {object[]} members       - [{member_id, trust_score}]
 * @param {object[]} connections   - [{from_id, to_id, strength}] strength in (0,1]
 * @param {number}   [k=1]        - Scaling constant (monetary or abstract).
 * @returns {number} Network value.
 */
function calcNetworkValue(members, connections, k) {
  const scale = k || 1;
  if (!members || members.length < 2) return 0;

  // Build trust lookup
  const trustMap = {};
  for (const m of members) {
    trustMap[m.member_id] = m.trust_score || 0;
  }

  // Build connection strength lookup (undirected -- use sorted key)
  const connMap = {};
  for (const c of (connections || [])) {
    const key = c.from_id < c.to_id
      ? `${c.from_id}_${c.to_id}`
      : `${c.to_id}_${c.from_id}`;
    connMap[key] = (connMap[key] || 0) + (c.strength || 1);
  }

  let value = 0;
  const ids = members.map(m => m.member_id);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = ids[i] < ids[j]
        ? `${ids[i]}_${ids[j]}`
        : `${ids[j]}_${ids[i]}`;
      const cij = connMap[key] || 0;
      if (cij > 0) {
        value += (trustMap[ids[i]] || 0) * (trustMap[ids[j]] || 0) * cij;
      }
    }
  }

  return scale * value;
}

/**
 * Simplified network value estimate (no pairwise enumeration).
 * V = k * n^2 * avgTrust
 *
 * @param {number} activeCount - Number of active members.
 * @param {number} avgTrust    - Average trust score across active members (0-1).
 * @param {number} [k=1]      - Scaling constant.
 * @returns {number}
 */
function calcNetworkValueSimple(activeCount, avgTrust, k) {
  const scale = k || 1;
  const n = activeCount || 0;
  return scale * n * n * (avgTrust || 0);
}

// ---------------------------------------------------------------------------
// 5. MONTE CARLO SIMULATION
// ---------------------------------------------------------------------------

/**
 * Draw a single sample from a triangular distribution.
 *
 * The triangular distribution has PDF peaking at `est` (the mode), bounded
 * by [min, max].
 *
 * Uses inverse CDF method:
 *   F(x) = (x - min)^2 / ((max - min)(est - min))          for x in [min, est]
 *   F(x) = 1 - (max - x)^2 / ((max - min)(max - est))      for x in [est, max]
 *
 * @param {number} min - Optimistic estimate.
 * @param {number} est - Most-likely estimate (mode).
 * @param {number} max - Pessimistic estimate.
 * @returns {number} Random sample.
 */
function triangularRandom(min, est, max) {
  if (min >= max) return est;
  if (est < min) est = min;
  if (est > max) est = max;

  const u = Math.random();
  const fc = (est - min) / (max - min);

  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (est - min));
  } else {
    return max - Math.sqrt((1 - u) * (max - min) * (max - est));
  }
}

/**
 * Run a Monte Carlo simulation to estimate project viability.
 *
 * Simulates `iterations` scenarios using triangular distributions for cost and
 * timeline, then computes probability of meeting budget and deadline, key
 * percentiles, and an overall viability score with a traffic-light semaphore.
 *
 * @param {object} params
 * @param {number} params.budget_min       - Optimistic cost.
 * @param {number} params.budget_est       - Most-likely cost.
 * @param {number} params.budget_max       - Pessimistic cost.
 * @param {number} params.budget_available - Available budget ceiling.
 * @param {number} params.timeline_min     - Optimistic months.
 * @param {number} params.timeline_est     - Most-likely months.
 * @param {number} params.timeline_max     - Pessimistic months.
 * @param {number} params.deadline_months  - Hard deadline in months.
 * @param {number} params.team_score       - Team quality score 0-1.
 * @param {number} params.alignment_score  - Strategic alignment 0-1.
 * @returns {object} { costProb, timeProb, percentiles, viabilityScore, semaphore }
 */
function monteCarloProject(params, iterations) {
  const n = iterations || 10000;
  const {
    budget_min, budget_est, budget_max, budget_available,
    timeline_min, timeline_est, timeline_max, deadline_months,
    team_score, alignment_score,
  } = params;

  const costSamples = [];
  const timeSamples = [];
  let costHits = 0;
  let timeHits = 0;

  for (let i = 0; i < n; i++) {
    const c = triangularRandom(budget_min, budget_est, budget_max);
    const t = triangularRandom(timeline_min, timeline_est, timeline_max);
    costSamples.push(c);
    timeSamples.push(t);
    if (c <= budget_available) costHits++;
    if (t <= deadline_months) timeHits++;
  }

  const costProb = costHits / n;
  const timeProb = timeHits / n;

  // Sort cost samples for percentile extraction
  costSamples.sort((a, b) => a - b);

  const pct = (arr, p) => {
    const idx = Math.max(0, Math.ceil(p * arr.length) - 1);
    return arr[idx];
  };

  const percentiles = {
    p10: pct(costSamples, 0.10),
    p25: pct(costSamples, 0.25),
    p50: pct(costSamples, 0.50),
    p75: pct(costSamples, 0.75),
    p90: pct(costSamples, 0.90),
    p95: pct(costSamples, 0.95),
  };

  // Viability score: weighted combination of probabilities and qualitative scores
  // Weights: costProb 0.30, timeProb 0.25, team 0.25, alignment 0.20
  const viabilityScore =
    0.30 * costProb +
    0.25 * timeProb +
    0.25 * (team_score || 0) +
    0.20 * (alignment_score || 0);

  let semaphore;
  if (viabilityScore >= 0.70) {
    semaphore = 'VERDE';
  } else if (viabilityScore >= 0.45) {
    semaphore = 'AMARILLO';
  } else {
    semaphore = 'ROJO';
  }

  return { costProb, timeProb, percentiles, viabilityScore, semaphore };
}

// ---------------------------------------------------------------------------
// 6. RESOURCE ALLOCATION (Greedy with diversity constraint)
// ---------------------------------------------------------------------------

/**
 * Greedy team assignment optimiser.
 *
 * Assigns candidates to roles maximising total weighted score while respecting:
 *  - Each candidate is assigned at most once.
 *  - Each role is filled up to its required_count.
 *  - Total cost does not exceed the budget.
 *  - Diversity constraint: final team must span at least 2 distinct regions.
 *
 * Strategy: build a flat list of (candidate, role, value) tuples, sort by
 * value descending, then greedily pick the best feasible assignment.  If the
 * greedy pass produces a single-region team, swap the lowest-scoring member
 * with the best candidate from a different region.
 *
 * @param {object[]} candidates - [{member_id, scores_by_role:{roleName:number}, trust_score, cost, region}]
 * @param {object[]} roles      - [{name, required_count}]
 * @param {number}   budget     - Total budget ceiling.
 * @returns {{member_id:number, role:string, score:number}[]} Assigned team.
 */
function optimizeTeamAssignment(candidates, roles, budget) {
  if (!candidates || !roles || candidates.length === 0 || roles.length === 0) return [];

  // Build all (candidate, role, value) tuples
  const tuples = [];
  for (const c of candidates) {
    for (const r of roles) {
      const roleScore = (c.scores_by_role && c.scores_by_role[r.name]) || 0;
      // Value combines role-fit and trust
      const value = 0.70 * roleScore + 0.30 * (c.trust_score || 0);
      tuples.push({
        member_id: c.member_id,
        role: r.name,
        cost: c.cost || 0,
        region: c.region,
        value,
      });
    }
  }

  // Sort by value descending
  tuples.sort((a, b) => b.value - a.value);

  // Track state
  const assigned = new Set();          // member_ids already used
  const roleFilled = {};               // role -> count assigned
  for (const r of roles) roleFilled[r.name] = 0;
  const roleRequired = {};
  for (const r of roles) roleRequired[r.name] = r.required_count || 1;

  let spent = 0;
  const team = [];

  // Greedy pass
  for (const t of tuples) {
    if (assigned.has(t.member_id)) continue;
    if (roleFilled[t.role] >= roleRequired[t.role]) continue;
    if (spent + t.cost > budget) continue;

    team.push({ member_id: t.member_id, role: t.role, score: t.value });
    assigned.add(t.member_id);
    roleFilled[t.role]++;
    spent += t.cost;
  }

  // Diversity enforcement: ensure 2+ distinct regions
  const teamRegions = () => {
    const regionSet = new Set();
    for (const a of team) {
      const cand = candidates.find(c => c.member_id === a.member_id);
      if (cand) regionSet.add(cand.region);
    }
    return regionSet;
  };

  const regions = teamRegions();
  if (regions.size < 2 && team.length > 0) {
    // Find the dominant region
    const dominantRegion = regions.values().next().value;

    // Find the lowest-scoring team member
    let worstIdx = 0;
    for (let i = 1; i < team.length; i++) {
      if (team[i].score < team[worstIdx].score) worstIdx = i;
    }
    const worstMember = team[worstIdx];
    const worstCand = candidates.find(c => c.member_id === worstMember.member_id);
    const freedBudget = spent - (worstCand ? worstCand.cost : 0);

    // Find the best replacement from a different region for the same role
    let bestReplacement = null;
    let bestVal = -1;
    for (const t of tuples) {
      if (assigned.has(t.member_id) && t.member_id !== worstMember.member_id) continue;
      if (t.role !== worstMember.role) continue;
      const cand = candidates.find(c => c.member_id === t.member_id);
      if (!cand || cand.region === dominantRegion) continue;
      if (freedBudget + cand.cost > budget) continue;  // would exceed budget with rest of team minus worst
      if (t.value > bestVal) {
        bestVal = t.value;
        bestReplacement = t;
      }
    }

    if (bestReplacement) {
      team[worstIdx] = {
        member_id: bestReplacement.member_id,
        role: bestReplacement.role,
        score: bestReplacement.value,
      };
    }
  }

  return team;
}

// ---------------------------------------------------------------------------
// 7. HISPATEC COMPOSITE INDEX (HCI)
// ---------------------------------------------------------------------------

/**
 * Compute the HISPATEC Composite Index -- a single 0-1 score summarising
 * ecosystem health across five pillars.
 *
 * Pillars and weights:
 *   Equity       0.20  -- (1 - Gini), rewarding equality
 *   Trust        0.20  -- average trust score
 *   Network      0.20  -- networkValue / networkValueMax
 *   Projects     0.25  -- projectSuccess / projectTotal (success rate)
 *   Activation   0.15  -- activeMembers / totalMembers
 *
 * @param {object} params
 * @param {number} params.gini            - Gini coefficient (0-1).
 * @param {number} params.avgTrust        - Average trust score (0-1).
 * @param {number} params.networkValue    - Current network value.
 * @param {number} params.networkValueMax - Maximum (or theoretical) network value.
 * @param {number} params.projectSuccess  - Count of successful projects.
 * @param {number} params.projectTotal    - Total projects attempted.
 * @param {number} params.activeMembers   - Currently active member count.
 * @param {number} params.totalMembers    - Total registered members.
 * @returns {number} HCI in [0, 1].
 */
function calcHCI(params) {
  const {
    gini, avgTrust, networkValue, networkValueMax,
    projectSuccess, projectTotal, activeMembers, totalMembers,
  } = params || {};

  const equity = 1 - (gini || 0);
  const trust = avgTrust || 0;
  const network = networkValueMax ? (networkValue || 0) / networkValueMax : 0;
  const projects = projectTotal ? (projectSuccess || 0) / projectTotal : 0;
  const activation = totalMembers ? (activeMembers || 0) / totalMembers : 0;

  const hci =
    0.20 * equity +
    0.20 * trust +
    0.20 * network +
    0.25 * projects +
    0.15 * activation;

  return Math.max(0, Math.min(1, hci));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic hash of a string mapped to [0, 1].
 * Uses a simple DJB2-style hash.
 *
 * @param {string} str
 * @returns {number} Value in [0, 1).
 */
function simpleHash01(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return (hash % 10000) / 10000;
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  // Gini
  calcGini,
  calcGiniCorrection,
  // Cosine similarity & matching
  cosineSimilarity,
  buildProfileVector,
  matchMembers,
  // TrustRank
  calcTrustBase,
  runTrustRank,
  // Network value
  calcNetworkValue,
  calcNetworkValueSimple,
  // Monte Carlo
  triangularRandom,
  monteCarloProject,
  // Resource allocation
  optimizeTeamAssignment,
  // Composite index
  calcHCI,
};
