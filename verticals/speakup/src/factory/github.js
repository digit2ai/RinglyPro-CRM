'use strict';

/**
 * SpeakUp AI Factory — GitHub REST client (server-side only).
 *
 * The token (SPEAKUP_GITHUB_TOKEN) never reaches the browser and is never logged.
 * Least privilege, fine-grained PAT on the one repository:
 *   Actions: read & write   (dispatch the factory workflow, read + cancel runs)
 *   Pull requests: read & write (open the review PR, read merge state)
 *   Contents: read          (compare commits)  — write ONLY if you want "merge from the phone"
 *   Metadata: read
 *
 * The workflow run itself pushes with its own short-lived GITHUB_TOKEN, and only
 * to refs/heads/speakup/job-<id>.
 */

const API = process.env.SPEAKUP_GITHUB_API || 'https://api.github.com';
let fetchImpl = (...a) => fetch(...a);

function token() { return process.env.SPEAKUP_GITHUB_TOKEN || null; }
function configured() { return !!token(); }

class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, path, body) {
  if (!configured()) throw new GitHubError(0, 'SPEAKUP_GITHUB_TOKEN is not set');
  const res = await fetchImpl(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SpeakUp-AI-Factory',
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
  const [owner, name] = String(repo || '').split('/');
  if (!owner || !name) throw new GitHubError(0, 'invalid repo ' + repo);
  return { owner: encodeURIComponent(owner), name: encodeURIComponent(name) };
}

async function dispatchWorkflow(repo, workflowFile, ref, inputs) {
  const { owner, name } = split(repo);
  await request('POST', `/repos/${owner}/${name}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`, { ref, inputs });
  return true;
}

// Runs are titled "SpeakUp job <id>" by the workflow's run-name.
async function findRun(repo, workflowFile, jobId) {
  const { owner, name } = split(repo);
  const data = await request('GET', `/repos/${owner}/${name}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?event=workflow_dispatch&per_page=50`);
  const title = 'SpeakUp job ' + jobId;
  return (data.workflow_runs || []).find(r => r.display_title === title || r.name === title) || null;
}

async function cancelRun(repo, runId) {
  const { owner, name } = split(repo);
  await request('POST', `/repos/${owner}/${name}/actions/runs/${encodeURIComponent(runId)}/cancel`);
  return true;
}

async function findOpenPR(repo, branch) {
  const { owner } = split(repo);
  const { name } = split(repo);
  const data = await request('GET', `/repos/${owner}/${name}/pulls?state=all&head=${owner}:${encodeURIComponent(branch)}&per_page=5`);
  return (data || [])[0] || null;
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

// status: identical | ahead | behind | diverged, of `head` relative to `base`.
async function compare(repo, base, head) {
  const { owner, name } = split(repo);
  const data = await request('GET', `/repos/${owner}/${name}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  return data.status;
}

function __setFetch(f) { fetchImpl = f; }

module.exports = { configured, GitHubError, dispatchWorkflow, findRun, cancelRun, findOpenPR, createPR, getPR, mergePR, compare, __setFetch };
