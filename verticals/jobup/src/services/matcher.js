'use strict';

// =============================================================
// Match scoring (donor cv-engine match logic, spec section 10).
//
// INVARIANTS:
//   * COMPENSATION IS SHOWN ONLY WHEN THE POSTING STATES IT. Never estimated,
//     never inferred, never interpolated from a range elsewhere.
//   * Blocked employers are filtered BEFORE scoring — no spend on a job the
//     subscriber has said never to show them.
//   * With no API key the score is heuristic and marked is_simulated.
// =============================================================

const brain = require('./brain');
const settingsSvc = require('./settings');
const geo = require('./geo');

const SYSTEM = `You score how well a candidate fits a job posting.
Return ONLY JSON: {"score": 0-100, "explanation": "one sentence", "missing": ["qualification", ...]}
Rules:
- Score on demonstrable fit: title, seniority, skills, domain, location.
- "missing" lists requirements the posting states that the resume does not evidence. Be specific.
- Never invent experience the resume does not contain.
- One sentence for explanation. No preamble.`;

function heuristicScore(job, profile) {
  const skills = (profile.skills || []).map((s) =>
    String(typeof s === 'string' ? s : s.name || '').toLowerCase()).filter(Boolean);
  const hay = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  const hits = skills.filter((s) => s.length > 2 && hay.includes(s));
  const titleWords = String(profile.headline || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const titleHits = titleWords.filter((w) => String(job.title || '').toLowerCase().includes(w));

  const raw = hits.length * 6 + titleHits.length * 12;
  const score = Math.max(5, Math.min(92, raw));
  return {
    score,
    explanation: hits.length
      ? `Heuristic match on ${hits.slice(0, 4).join(', ')}${titleHits.length ? ' and title overlap' : ''}.`
      : 'Heuristic match: limited overlap detected without a language model.',
    missing: [],
    is_simulated: true,
  };
}

// Build the stable prefix once per subscriber per batch — this is what gets cached.
function cachedPrefix(profile, settings) {
  return [
    'CANDIDATE PROFILE (stable across this batch):',
    JSON.stringify({
      headline: profile.headline || null,
      summary: profile.summary || null,
      skills: profile.skills || [],
      experience: (profile.experience || []).map((e) => ({
        title: e.title, company: e.company, start: e.start, end: e.end,
        highlights: (e.highlights || []).slice(0, 4),
      })),
      education: profile.education || [],
      certifications: profile.certifications || [],
    }, null, 1),
    '',
    'TARGETING:',
    JSON.stringify((settings || {}).targeting || {}, null, 1),
  ].join('\n');
}

async function scoreOne(job, profile, settings, prefix) {
  if (!brain.enabled()) return { ...heuristicScore(job, profile), cost_usd: 0 };

  const prompt = [
    'JOB POSTING:',
    `Title: ${job.title || ''}`,
    `Employer: ${job.employer || ''}`,
    `Location: ${job.location || ''}`,
    job.compensation ? `Compensation (as stated by the posting): ${job.compensation}` : '',
    '',
    (job.description || '').slice(0, 6000),
  ].filter(Boolean).join('\n');

  const res = await brain.json({
    system: SYSTEM,
    cachedPrefix: prefix || cachedPrefix(profile, settings),
    prompt,
    maxTokens: 400,
  });

  if (!res.ok || !res.data) {
    return { ...heuristicScore(job, profile), cost_usd: res.cost_usd || 0 };
  }
  return {
    score: Math.max(0, Math.min(100, parseInt(res.data.score, 10) || 0)),
    explanation: String(res.data.explanation || '').slice(0, 400),
    missing: Array.isArray(res.data.missing) ? res.data.missing.slice(0, 8) : [],
    is_simulated: false,
    cost_usd: res.cost_usd || 0,
  };
}

// Score a batch inside a hard cost ceiling (spec section 8.3, mechanic #5).
async function scoreBatch(jobs, profile, settings, { capUsd = 0.25, limit = 15 } = {}) {
  const prefix = cachedPrefix(profile, settings);
  const out = [];
  let spent = 0;
  let stoppedForCap = false;

  for (const job of (jobs || []).slice(0, limit)) {
    // Blocked employers never reach the model.
    if (settingsSvc.employerBlocked(settings, job.employer)) continue;

    // Country policy is deterministic and free — apply before spending.
    const g = geo.evaluate(job.location, (settings || {}).geo || {});
    if (g.verdict === geo.VERDICT.BLOCK) continue;

    if (spent >= capUsd) { stoppedForCap = true; break; }

    const r = await scoreOne(job, profile, settings, prefix);
    spent += r.cost_usd || 0;
    out.push({
      job_id: job.id, job, score: r.score, explanation: r.explanation,
      missing: r.missing, is_simulated: r.is_simulated,
      // Compensation passes through ONLY as the posting stated it.
      compensation: job.compensation || null,
      location_verdict: g.verdict, location_reason: g.reason,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return { matches: out, cost_usd: spent, stopped_for_cap: stoppedForCap, capUsd };
}

module.exports = { scoreOne, scoreBatch, heuristicScore, cachedPrefix };
