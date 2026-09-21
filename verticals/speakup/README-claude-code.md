# Claude Code — the third tab on autodev.digit2ai.com

Pick a repository, describe a build, and Claude Code executes it end to end:
clone -> branch -> code -> test -> commit -> push -> pull request -> (merge -> Render deploy),
streaming every step into the page as it happens.

Live at `/speakup/claude-code` (so `autodev.digit2ai.com/speakup/claude-code`), beside
**Reuniones** and **Fábrica**. Operator only — the same allow-list the AI Factory uses.

## What it is made of

| Piece | File |
|---|---|
| The runner (the whole pipeline) | `src/claudecode/runner.js` |
| Run store + live event bus | `src/claudecode/store.js` |
| GitHub client + the owner allow-list | `src/claudecode/github.js` |
| Secret redaction | `src/claudecode/redact.js` |
| HTTP surface | `src/routes/claude-code.js` |
| Pages | `public/claude-code.html`, `public/claude-code-run.html`, `public/claude-code.js`, `public/claude-code.css` |
| Schema | `migrations/20260920_claude_code.sql` (`cc_runs`, `cc_run_events`, `cc_repos`) |
| SIT | `sit-claude-code.js` -> **265/265**, zero keys, no database |

## The engine

`@anthropic-ai/claude-agent-sdk` `query()`, never the Messages API. The work is a tool loop
over a filesystem, and the SDK already owns the loop, the tools, the session (so a failing
test is handed back with `resume`) and the cost accounting.

It is loaded with **dynamic `import()`**, not `require()`: the package is ESM, and
`require()` of ESM only works from Node 22.12 onward while this repository pins nothing
above Node 16. The import is lazy, so the vertical boots and the SIT runs with the package
absent, and an absent package is reported as itself.

The package declares a peer on `@anthropic-ai/sdk >= 0.93` while this repository pins
`^0.67` for roughly forty call sites. That peer is **declarative only** — `sdk.mjs` is fully
bundled and imports nothing from it at runtime, verified by loading it with no peers
installed at all. The exemption is a scoped `overrides` entry in `package.json`, not a
repo-wide `legacy-peer-deps`: a future dependency with a *real* peer requirement must still
fail at install time rather than silently at runtime.

## What a cloned repository may and may not do

**It may instruct. It may not execute.** `settingSources: ['project']` loads the repository's own
`CLAUDE.md` and skills — that is the feature. But the same source includes
`.claude/settings.json`, which can declare `hooks`, and `.mcp.json`; either would run a shell
command on this production server before the first model turn, and anyone with push access to
any repository the allow-list permits could plant one. `disarmWorkspace()` deletes both from the
workspace after the clone and before the agent starts. `CLAUDE.md`, the skills and the code are
untouched.

**The agent never sees this server's environment.** The SDK inherits `process.env` when `env` is
omitted and REPLACES it when supplied, so it is supplied: `PATH`, a per-run private `HOME`,
`LANG`, `TERM`, `CI`, and `ANTHROPIC_API_KEY` — nothing else. Without it, one `bash -c 'env'`
would hand a repository `DATABASE_URL`, `GITHUB_TOKEN`, `JWT_SECRET` and the rest, and a `curl`
carrying them never passes through redaction, which only guards what is *stored*. The
repository's own `npm test` runs under the same allow-list.

**The push credential does not live in the clone.** `git clone` writes the tokenised URL into
`.git/config`, where one `cat` would read it, so the remote is rewritten to a plain URL
immediately after the clone; the push supplies the credential explicitly.

**Nothing credential-shaped is committed.** The staged diff is scanned before every commit and
the run refuses rather than pushing to a public branch. `.env`, `.git/` and key files are never
committed whatever the diff says.

## The rules it keeps

- **The money is copied, never computed.** `cost_usd`, `tokens_in`, `tokens_out` and `turns`
  come from the SDK's own `result` message. A run that never reaches one stores `null` — an
  honest "not measured", not a plausible number.
- **A test pass is measured or it is not claimed.** The repository's own `npm test` runs when
  `package.json` declares one; otherwise the run says nothing was measured. It never invents
  a command.
- **The owner allow-list is enforced on the server**, at the clone, the pull request and the
  merge — not only when the page offers a repository. `GITHUB_ORG` names who may be touched;
  unset, it falls back to the owner of `SPEAKUP_FACTORY_REPO`, never to anyone.
- **Write access is checked BEFORE a run starts.** Read access carries a run all the way through
  the clone, the agent and the commit, and only fails at the push — after the money is spent.
  That is exactly how the first live run ended: twenty turns and $0.23, then
  `Permission to digit2ai/CRM-Co-Pilot.git denied`, because the fallback credential is the
  Factory's fine-grained PAT and it is scoped to one repository. One API call at creation now
  refuses immediately and names the fix, and the repository picker badges it.
- **Auto-merge fails shut.** Off unless `CC_AUTO_MERGE=true`, and then it needs a green
  *measured* suite AND a CI verdict of `success` or a documented `none`. An unreachable GitHub
  reads as `error`, never as permission — that distinction is the whole point, because the
  earlier version merged on the value its own API error returned. A run transferred from a
  meeting is never merged automatically at all, and neither is one the agent reported an error on.
- **The server has to be configured before it will run anything.** While
  `SPEAKUP_TEAM_PASSWORD` is the value this public repository publishes, or
  `SPEAKUP_JWT_SECRET` is unset, the run/intake/merge routes answer **423** and name the fix.
  Reading past runs still works. A surface that executes code must not be looser than the AI
  Factory, which only opens a pull request.
- **The role and the email are re-read from the database on every request**, never trusted from
  a 30-day token: an account demoted today loses this surface today.
- **A cancel is final and it reaches the children.** `setStatus` is a compare-and-swap that
  refuses to leave a terminal status, so a cancel landing mid-pipeline cannot be overwritten
  back into `running` — or, during the push window, walked into `pr_open` and merged. The
  cancel also kills the live `git`/`npm` process group instead of leaving it to its own timeout.
- **Nothing is left running by a restart.** A boot sweep fails every non-terminal run with
  "interrupted by a server restart" and removes its workspace: a run cannot outlive the process
  that was running it.
- **Secrets never reach an event.** `redact.js` scrubs by value (the tokens this process
  holds, including the one inside the clone URL) and by shape (Anthropic, GitHub, AWS and
  Stripe credential prefixes), on the way into the database and the SSE stream.
- **The workspace is disposable**, which is what licenses `bypassPermissions`: a fresh
  shallow clone under `CC_WORKSPACE_ROOT`, removed on every terminal status including a crash.
- **Three concurrent runs per tenant**, claimed synchronously before the first `await` so a
  burst cannot walk past the ceiling; a $10 ceiling per run, 200 turns, three test-fix cycles.
  Whichever trips first stops the run and says which — the cap reports itself as the cap, not
  as an anonymous abort.
- **A fresh clone installs before it tests.** `npm ci --ignore-scripts` (install scripts are
  arbitrary code from the cloned repository). An install that cannot succeed reports the suite
  as **not measured**, never as red — reporting red would feed "the tests failed, fix it" to the
  agent three times over a missing `node_modules` it cannot fix.
- **A measured zero is not an absence.** `cost_usd: 0` from a subscription-billed run stores
  zero; only `null` means nothing was measured.
- `tenant_id` comes from the verified session and is never read from a body. Cross-tenant
  reads are a 404.

## Repositories without the house skill

A repository that does not carry `.claude/skills/ringlypro-architect/SKILL.md` gets this
server's copy written into the workspace, so the run follows the same conventions as
everything else here. It is added to `.git/info/exclude`, so it never appears in the pull
request — `.gitignore` here does not cover `.claude/` and the commit is `git add -A`, so
without that every PR against a skill-less repository carried a 98 KB file nobody asked for.
The source on this server is the `/ringlypro-architect` command file, whose frontmatter has no
`name:`; one is added, because a SKILL.md needs it. The page badges which case a repository is
in.

## SpeakUp transfer

"Transfer to Factory" in a meeting now opens a Claude Code run (`source='speakup'`,
`source_ref='meeting:<id>'`) and the chat shows the run link. Everything that guarded the old
path still runs first: the operator check, the rate limit, the duplicate guard, the
model-required conversion and `meetingLeaks()` — a prompt repeating eight words in a row from
the transcript or naming a participant is refused, because the repository is public.

The human gate moves from "type approved before it builds" to "merge the pull request before
it ships", which is where it has to be: a run ends at a branch and a PR, never at `main`.
`SPEAKUP_TRANSFER_ENGINE=factory` restores the old path.

## Environment variables

| Variable | Default | What happens |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | The agent. Unset: a run fails when it reaches the agent, and the page says so before you start one. |
| `GITHUB_TOKEN` | falls back to `CC_GITHUB_TOKEN`, then `SPEAKUP_GITHUB_TOKEN` | Repo scope: list, clone, push, pull request, merge. Unset = cloning is **closed**, not open. |
| `GITHUB_ORG` | owner of `SPEAKUP_FACTORY_REPO` | Comma list of owners a run may touch. A full repo path, a URL or an `@org` are all accepted and reduced to the owner. Anything else is refused with 403, and the refusal names what is allowed. |
| `CC_WORKSPACE_ROOT` | `/tmp/cc-workspaces` | Where clones live. Ephemeral on Render by design — a workspace outlives nothing. |
| `CC_MODEL` | `claude-sonnet-5` | The model the agent runs on. |
| `CC_MAX_TURNS` | `200` | Hard turn ceiling per pass. |
| `CC_AUTO_MERGE` | `false` | `true` merges a green pull request and fires the deploy hook. |
| `RENDER_DEPLOY_HOOK_URL` | — | POSTed after a merge. Unset = the run stops at `merged`. |
| `CC_COST_CAP_USD` | `10` | Per run, across every pass. Tripping it aborts and says so. |
| `CC_MAX_CONCURRENT` | `3` | Runs at once, per tenant. |
| `CC_MAX_FIX_CYCLES` | `3` | Test-fix hand-backs into the same session before the run gives up. |
| `CC_DEFAULT_REPO` | `SPEAKUP_FACTORY_REPO` | The repository a SpeakUp transfer targets. |
| `CC_DEPLOY_URL` | — | Shown as "Open the deploy" after a deploy. |
| `CC_DEPLOY_REPO` | `SPEAKUP_FACTORY_REPO` | The one repository whose merge fires the deploy hook. Merging a PR in any other repository never redeploys this CRM. |
| `CC_EVENTS_PAGE` | `500` | Events returned per read. The page says plainly when a log is longer than one page. |
| `SPEAKUP_TEAM_PASSWORD` | — | Must not be the published default, or the run routes answer 423. |
| `SPEAKUP_JWT_SECRET` | — | Must be set and distinct from `JWT_SECRET`, same reason. |
| `SPEAKUP_TRANSFER_ENGINE` | `claude-code` | `factory` sends a meeting transfer back to the AI Factory. |
| `SPEAKUP_FACTORY_ALLOWED_EMAILS` | `mstagg@digit2ai.com` | Who may run this (must also be role `admin`). |

## Verifying a deploy

1. `GET /speakup/api/v1/claude-code/config` — it reports `github`, `anthropic_key`, `sdk`,
   `allowed_owners`, the model and the caps. Every one of those is a fact, not an assumption.
2. Open the tab, pick a repository, press **Sincronizar** (the architect-skill badge should
   resolve), then run a one-line brief against a test repository.
3. Watch the console fill, then check that the pull request exists and that cost and token
   counts landed on the run.

## Not covered by the SIT

A real Agent SDK run, the real GitHub API, a real clone and push, and the Postgres store.
The suite fakes `query()`, fakes GitHub and holds the three tables in memory, on purpose, so
it is free, offline and runnable in CI. Those four are verifiable only against production.

Two more, stated because they are the ones most worth watching on the first real run:

- **`permissionMode: 'bypassPermissions'` is refused by the Claude CLI when the process runs as
  root.** Render's native runtime is not root, so this should be fine, but it was not confirmed
  against the live instance — if it is wrong, every run fails at the agent step and says so.
- **The `none` CI verdict on a repository with no checks.** The merge path treats it as
  permission when the local suite is green; that combination has not been exercised live.
