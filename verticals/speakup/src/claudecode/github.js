'use strict';

/**
 * Claude Code — GitHub REST client (server-side only).
 *
 * Separate from src/factory/github.js on purpose: the Factory talks to ONE repository
 * through a fine-grained PAT scoped to it, while this surface lists repositories and
 * clones any of them, so it reads a different token and enforces a different rule.
 *
 * THE OWNER ALLOW-LIST IS THE GUARDRAIL. `assertAllowed()` refuses a repository whose
 * owner is not one this tenant may touch, and it is called by the clone, the PR and the
 * merge — not only by the create route. A run is a disposable VM with a write token in
 * it; "the UI only offers our repos" is a statement about a page, not about the server.
 *
 * The token never reaches the browser and never enters a run event (see redact.js).
 */

const API = process.env.CC_GITHUB_API || 'https://api.github.com';
let fetchImpl = (...a) => fetch(...a);

// GITHUB_TOKEN is what the brief names; the existing SPEAKUP_GITHUB_TOKEN is accepted so
// the tab works on the day it deploys without a second credential being created first.
function token() {
  return process.env.CC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.SPEAKUP_GITHUB_TOKEN || null;
}
function configured() { return !!token(); }

class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Owners this tenant may run against. Unset GITHUB_ORG falls back to the owner of the
// repository the Factory already works on, so it is never accidentally "anyone".
function allowedOwners() {
  const raw = String(process.env.GITHUB_ORG || process.env.CC_GITHUB_ORG || '').trim();
  const list = raw ? raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
  if (!list.length) {
    const fallback = String(process.env.SPEAKUP_FACTORY_REPO || 'digit2ai/RinglyPro-CRM').split('/')[0];
    if (fallback) list.push(fallback.toLowerCase());
  }
  return list;
}

function ownerAllowed(repoFullName) {
  const owner = String(repoFullName || '').split('/')[0].toLowerCase();
  return !!owner && allowedOwners().includes(owner);
}

function assertAllowed(repoFullName) {
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(String(repoFullName || ''))) {
    throw new GitHubError(400, 'invalid repository name');
  }
  if (!ownerAllowed(repoFullName)) {
    throw new GitHubError(403, 'repository owner is not allowed: ' + String(repoFullName).split('/')[0]);
  }
  return true;
}

async function request(method, path, body) {
  if (!configured()) throw new GitHubError(0, 'GITHUB_TOKEN is not set');
  const res = await fetchImpl(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AutoDev-ClaudeCode',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = (data && data.message) || ('HTTP ' + res.status);
    throw new GitHubError(res.status, 'GitHub ' + method + ' ' + path.split('?')[0] + ' failed: ' + msg);
  }
  return data;
}

function split(repo) {
  assertAllowed(repo);
  const [owner, name] = String(repo).split('/');
  return { owner: encodeURIComponent(owner), name: encodeURIComponent(name) };
}

// Every repository the token can see, filtered to the allowed owners. The filter runs
// here rather than in the page, so a repository outside the org is never even listed.
async function listRepos() {
  const out = [];
  for (let page = 1; page <= 4; page++) {
    const data = await request('GET', `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,organization_member`);
    if (!Array.isArray(data) || !data.length) break;
    for (const r of data) {
      if (!ownerAllowed(r.full_name)) continue;
      out.push({
        repo_full_name: r.full_name,
        default_branch: r.default_branch || 'main',
        private: !!r.private,
        pushed_at: r.pushed_at || null
      });
    }
    if (data.length < 100) break;
  }
  return out;
}

// Present only when the repository actually carries the house skill. A missing file is a
// 404 from GitHub, which is an answer, not an error — the runner copies ours in instead.
async function hasArchitectSkill(repo) {
  const { owner, name } = split(repo);
  for (const p of ['.claude/skills/ringlypro-architect/SKILL.md', '.claude/commands/ringlypro-architect.md']) {
    try {
      await request('GET', `/repos/${owner}/${name}/contents/${p.split('/').map(encodeURIComponent).join('/')}`);
      return true;
    } catch (e) {
      if (!(e instanceof GitHubError) || e.status !== 404) throw e;
    }
  }
  return false;
}

async function getRepo(repo) {
  const { owner, name } = split(repo);
  return request('GET', `/repos/${owner}/${name}`);
}

async function createPR(repo, { title, head, base, body, draft }) {
  const { owner, name } = split(repo);
  return request('POST', `/repos/${owner}/${name}/pulls`, { title, head, base, body, draft: !!draft });
}

async function getPR(repo, number) {
  const { owner, name } = split(repo);
  return request('GET', `/repos/${owner}/${name}/pulls/${encodeURIComponent(number)}`);
}

async function mergePR(repo, number, sha, commitTitle) {
  const { owner, name } = split(repo);
  return request('PUT', `/repos/${owner}/${name}/pulls/${encodeURIComponent(number)}/merge`,
    { sha, merge_method: 'squash', commit_title: commitTitle });
}

/**
 * CI verdict for a commit. Only the caller's merge decision uses it, and it must FAIL SHUT:
 * an earlier version returned 'unknown' both when GitHub reported nothing and when the API call
 * itself failed, and the merge treated 'unknown' as permission — so a transient 502 merged
 * unreviewed output into a public main. The two cases are now different values:
 *
 *   success | pending | failure | error   the verdict, 'error' including an unreachable API
 *   none                                  GitHub answered, and this commit has no CI at all
 *
 * It reads BOTH the legacy commit-statuses endpoint and check-runs, because a repository whose
 * CI is GitHub Actions — this one included — reports nothing through statuses alone, and reading
 * statuses only would have made 'none' the normal answer on exactly the repositories this is for.
 */
async function combinedStatus(repo, ref) {
  const { owner, name } = split(repo);
  let statuses = null, checks = null;
  try {
    statuses = await request('GET', `/repos/${owner}/${name}/commits/${encodeURIComponent(ref)}/status`);
  } catch (e) { return 'error'; }
  try {
    checks = await request('GET', `/repos/${owner}/${name}/commits/${encodeURIComponent(ref)}/check-runs`);
  } catch (e) { return 'error'; }

  const statusCount = Number((statuses && statuses.total_count) || 0);
  const runs = (checks && checks.check_runs) || [];
  if (!statusCount && !runs.length) return 'none';

  if (statusCount && statuses.state && statuses.state !== 'success') return statuses.state;
  if (runs.some(r => r.status !== 'completed')) return 'pending';
  if (runs.some(r => !['success', 'neutral', 'skipped'].includes(r.conclusion))) return 'failure';
  return 'success';
}

// The clone URL carrying the token. NEVER log, store or stream the return value —
// redact.js masks it by shape as a second line of defence.
function cloneUrl(repo) {
  assertAllowed(repo);
  const t = token();
  if (!t) throw new GitHubError(0, 'GITHUB_TOKEN is not set');
  return `https://x-access-token:${t}@github.com/${repo}.git`;
}

function __setFetch(f) { fetchImpl = f; }

module.exports = {
  configured, GitHubError, allowedOwners, ownerAllowed, assertAllowed,
  listRepos, hasArchitectSkill, getRepo, createPR, getPR, mergePR, combinedStatus, cloneUrl, __setFetch
};
