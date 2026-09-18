#!/usr/bin/env node
/*
 * Development wall time + commit count for a part of the repo, measured from git.
 *
 *   node scripts/wall-time.js [paths...] [--since=YYYY-MM-DD] [--until=YYYY-MM-DD]
 *                             [--gap=90] [--lead=30] [--json]
 *
 * Default path: verticals/planea.
 *
 * THE RULE: commits touching the paths are grouped into work sessions; a gap of
 * --gap minutes or more (default 90) between two commits starts a new session.
 * Each session counts from its first to its last commit, plus --lead minutes
 * (default 30) for the work done before the first commit landed.
 *
 * WHY THESE DEFAULTS: they reproduce the hours already billed to Planea. Up to
 * 19-Aug-2026 this rule gives 128 commits / 49.6 h against the invoiced
 * 125 commits / 49 h (planea-saas-invoice.html). Changing them changes every
 * historic figure, so a before/after comparison must use the same values.
 *
 * It measures time when commits were being made. Work that never produced a
 * commit (meetings, reading, a session that shipped nothing) is not counted.
 */
'use strict';
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : def;
};
const paths = args.filter((a) => !a.startsWith('--'));
if (!paths.length) paths.push('verticals/planea');
const gapMin = Number(opt('gap', 90));
const leadMin = Number(opt('lead', 30));
const since = opt('since', null);
const until = opt('until', null);
const asJson = args.includes('--json');

const gitArgs = ['log', '--format=%H%x09%at%x09%s'];
if (since) gitArgs.push('--since=' + since);
if (until) gitArgs.push('--until=' + until);
gitArgs.push('--', ...paths);

const out = execFileSync('git', gitArgs, { encoding: 'utf8', maxBuffer: 1e8 }).trim();
const commits = out
  ? out.split('\n').map((l) => {
      const [hash, t, ...s] = l.split('\t');
      return { hash, t: Number(t), subject: s.join('\t') };
    }).sort((a, b) => a.t - b.t)
  : [];

const sessions = [];
let cur = null;
for (const c of commits) {
  if (!cur || c.t - cur.end > gapMin * 60) {
    cur = { start: c.t, end: c.t, commits: 0 };
    sessions.push(cur);
  }
  cur.end = c.t;
  cur.commits++;
}
const seconds = sessions.reduce((s, x) => s + (x.end - x.start) + leadMin * 60, 0);
const hours = Math.round((seconds / 3600) * 10) / 10;

const result = {
  paths,
  rule: { gap_minutes: gapMin, lead_minutes: leadMin },
  since, until,
  commits: commits.length,
  sessions: sessions.length,
  hours,
  first_commit: commits.length ? { hash: commits[0].hash.slice(0, 8), at: new Date(commits[0].t * 1000).toISOString() } : null,
  last_commit: commits.length ? { hash: commits[commits.length - 1].hash.slice(0, 8), at: new Date(commits[commits.length - 1].t * 1000).toISOString() } : null,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Paths: ${paths.join(', ')}${since ? `  since ${since}` : ''}${until ? `  until ${until}` : ''}`);
  console.log(`Commits: ${result.commits}  Sessions: ${result.sessions}  Wall time: ${hours} h  (gap ${gapMin} min, lead ${leadMin} min)`);
  if (result.first_commit) console.log(`First: ${result.first_commit.hash} ${result.first_commit.at}   Last: ${result.last_commit.hash} ${result.last_commit.at}`);
}
