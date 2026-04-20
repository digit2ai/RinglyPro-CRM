/**
 * Chamber Template - Mathematical Models
 * =======================================
 * Reusable math engine for any chamber instance.
 * Gini, cosine matching, TrustRank, Monte Carlo, network value, composite index.
 * No external dependencies.
 */
'use strict';

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

function calcGiniCorrection(regionOpp, meanOpp, alpha) {
  if (!meanOpp || meanOpp === 0) return 1;
  const raw = 1 + alpha * ((meanOpp - regionOpp) / meanOpp);
  return Math.max(0.5, Math.min(2.0, raw));
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

function buildProfileVector(member, config) {
  if (!member) return new Array(9).fill(0);
  const sectors = config && config.sectors ? config.sectors : [];
  const membershipScores = config && config.membership_scores ? config.membership_scores : {};

  const sectorIdx = sectors.indexOf((member.sector || '').toLowerCase());
  const sectorVal = sectorIdx >= 0 ? (sectorIdx + 1) / sectors.length : 0.5;
  const subVal = member.sub_specialty ? simpleHash01(member.sub_specialty) : 0.5;
  const regionVal = member.region_id ? Math.min(member.region_id / 100, 1) : 0.5;
  const countryVal = member.country ? simpleHash01(member.country) : 0.5;
  const expVal = member.years_experience ? Math.min(member.years_experience / 30, 1) : 0;
  const langVal = Array.isArray(member.languages) ? Math.min(member.languages.length / 5, 1) : 0;
  const memVal = membershipScores[member.membership_type] || 0.4;
  const availVal = member.availability != null ? member.availability : 1;
  const trustVal = member.trust_score || 0;

  const weights = [0.25, 0.15, 0.10, 0.05, 0.10, 0.05, 0.05, 0.10, 0.15];
  const raw = [sectorVal, subVal, regionVal, countryVal, expVal, langVal, memVal, availVal, trustVal];
  return raw.map((v, i) => v * weights[i]);
}

function matchMembers(queryVector, candidates, giniCorrections) {
  if (!candidates || candidates.length === 0) return [];
  const corrections = giniCorrections || {};
  const scored = candidates.map(c => {
    const rawSim = cosineSimilarity(queryVector, c.vector);
    const regionFactor = corrections[c.region] || 1;
    return {
      member_id: c.member_id,
      score: Math.min(rawSim * regionFactor, 1),
      trust: c.trust_score || 0,
      region: c.region
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function calcTrustBase(member) {
  if (!member) return 0;
  const V = member.verification || 0;
  const R = member.avg_references || 0;
  const P = member.project_success || 0;
  const A = Math.min((member.tenure_years || 0) / 5, 1);
  const M = member.membership_level || 0;
  return 0.30 * V + 0.25 * R + 0.20 * P + 0.15 * A + 0.10 * M;
}

function runTrustRank(members, references, damping, maxIter) {
  if (!members || members.length === 0) return {};
  const d = damping != null ? damping : 0.85;
  const iterations = maxIter || 50;
  const EPSILON = 1e-6;
  const trust = {};
  const ids = [];
  for (const m of members) { trust[m.member_id] = calcTrustBase(m); ids.push(m.member_id); }
  const inbound = {};
  const outWeight = {};
  for (const id of ids) { inbound[id] = []; outWeight[id] = 0; }
  for (const ref of (references || [])) {
    if (inbound[ref.to_id] && outWeight.hasOwnProperty(ref.from_id)) {
      const w = ref.weight || 1;
      inbound[ref.to_id].push({ from: ref.from_id, weight: w });
      outWeight[ref.from_id] += w;
    }
  }
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
    for (const id of ids) trust[id] = newTrust[id];
    if (maxDelta < EPSILON) break;
  }
  const maxVal = Math.max(...Object.values(trust), 1);
  for (const id of ids) trust[id] = trust[id] / maxVal;
  return trust;
}

function calcNetworkValue(members, connections, k) {
  const scale = k || 1;
  if (!members || members.length < 2) return 0;
  const trustMap = {};
  for (const m of members) trustMap[m.member_id] = m.trust_score || 0;
  const connMap = {};
  for (const c of (connections || [])) {
    const key = c.from_id < c.to_id ? `${c.from_id}_${c.to_id}` : `${c.to_id}_${c.from_id}`;
    connMap[key] = (connMap[key] || 0) + (c.strength || 1);
  }
  let value = 0;
  const ids = members.map(m => m.member_id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = ids[i] < ids[j] ? `${ids[i]}_${ids[j]}` : `${ids[j]}_${ids[i]}`;
      const cij = connMap[key] || 0;
      if (cij > 0) value += (trustMap[ids[i]] || 0) * (trustMap[ids[j]] || 0) * cij;
    }
  }
  return scale * value;
}

function calcNetworkValueSimple(activeCount, avgTrust, k) {
  return (k || 1) * (activeCount || 0) * (activeCount || 0) * (avgTrust || 0);
}

function triangularRandom(min, est, max) {
  if (min >= max) return est;
  if (est < min) est = min;
  if (est > max) est = max;
  const u = Math.random();
  const fc = (est - min) / (max - min);
  if (u < fc) return min + Math.sqrt(u * (max - min) * (est - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - est));
}

function monteCarloProject(params, iterations) {
  const n = iterations || 10000;
  const { budget_min, budget_est, budget_max, budget_available, timeline_min, timeline_est, timeline_max, deadline_months, team_score, alignment_score } = params;
  const costSamples = [];
  const timeSamples = [];
  let costHits = 0, timeHits = 0;
  for (let i = 0; i < n; i++) {
    const c = triangularRandom(budget_min, budget_est, budget_max);
    const t = triangularRandom(timeline_min, timeline_est, timeline_max);
    costSamples.push(c); timeSamples.push(t);
    if (c <= budget_available) costHits++;
    if (t <= deadline_months) timeHits++;
  }
  const costProb = costHits / n;
  const timeProb = timeHits / n;
  costSamples.sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.max(0, Math.ceil(p * arr.length) - 1)];
  const percentiles = { p10: pct(costSamples, 0.10), p25: pct(costSamples, 0.25), p50: pct(costSamples, 0.50), p75: pct(costSamples, 0.75), p90: pct(costSamples, 0.90), p95: pct(costSamples, 0.95) };
  const viabilityScore = 0.30 * costProb + 0.25 * timeProb + 0.25 * (team_score || 0) + 0.20 * (alignment_score || 0);
  let semaphore;
  if (viabilityScore >= 0.70) semaphore = 'GREEN';
  else if (viabilityScore >= 0.45) semaphore = 'YELLOW';
  else semaphore = 'RED';
  return { costProb, timeProb, percentiles, viabilityScore, semaphore };
}

function optimizeTeamAssignment(candidates, roles, budget) {
  if (!candidates || !roles || candidates.length === 0 || roles.length === 0) return [];
  const tuples = [];
  for (const c of candidates) {
    for (const r of roles) {
      const roleScore = (c.scores_by_role && c.scores_by_role[r.name]) || 0;
      tuples.push({ member_id: c.member_id, role: r.name, cost: c.cost || 0, region: c.region, value: 0.70 * roleScore + 0.30 * (c.trust_score || 0) });
    }
  }
  tuples.sort((a, b) => b.value - a.value);
  const assigned = new Set();
  const roleFilled = {};
  const roleRequired = {};
  for (const r of roles) { roleFilled[r.name] = 0; roleRequired[r.name] = r.required_count || 1; }
  let spent = 0;
  const team = [];
  for (const t of tuples) {
    if (assigned.has(t.member_id)) continue;
    if (roleFilled[t.role] >= roleRequired[t.role]) continue;
    if (spent + t.cost > budget) continue;
    team.push({ member_id: t.member_id, role: t.role, score: t.value });
    assigned.add(t.member_id); roleFilled[t.role]++; spent += t.cost;
  }
  return team;
}

function calcHCI(params) {
  const { gini, avgTrust, networkValue, networkValueMax, projectSuccess, projectTotal, activeMembers, totalMembers } = params || {};
  const equity = 1 - (gini || 0);
  const trust = avgTrust || 0;
  const network = networkValueMax ? (networkValue || 0) / networkValueMax : 0;
  const projects = projectTotal ? (projectSuccess || 0) / projectTotal : 0;
  const activation = totalMembers ? (activeMembers || 0) / totalMembers : 0;
  return Math.max(0, Math.min(1, 0.20 * equity + 0.20 * trust + 0.20 * network + 0.25 * projects + 0.15 * activation));
}

function simpleHash01(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  return (hash % 10000) / 10000;
}

module.exports = {
  calcGini, calcGiniCorrection, cosineSimilarity, buildProfileVector, matchMembers,
  calcTrustBase, runTrustRank, calcNetworkValue, calcNetworkValueSimple,
  triangularRandom, monteCarloProject, optimizeTeamAssignment, calcHCI
};
