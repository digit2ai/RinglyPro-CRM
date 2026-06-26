'use strict';

// =============================================================
// architectPipeline — Push #1 orchestrator
//
// Fires after Stripe activates a contract (workflow_phase moves
// to 'build_authorized'). Pulls full project context, generates
// a Master Architect Prompt, then hands off to a human-driven
// build step. Push #2 will replace the manual handoff with an
// autonomous Claude Agent SDK loop; everything around it (gates,
// SIT, UAT email, magic-link feedback, Stripe cancel) is built
// here and stays unchanged.
//
// State machine:
//   build_authorized
//     -> (sensitive_data ? awaiting_human_greenlight : queued)
//   awaiting_human_greenlight  -- Manuel flips human_greenlight=true
//     -> queued
//   queued -> manual_build  -- email Manuel + slash-command instructions
//   manual_build -- Manuel finishes coding + clicks "Build Complete"
//     -> sit_running
//   sit_running -- orchestrator health-checks production_url
//     -> uat_ready (pass)   OR   manual_build (fail, email Manuel)
//   uat_ready -- stakeholders test via production_url + magic link
//     -> uat_revision (comment posted)   OR   shipped (Approve clicked)
//   uat_revision -> manual_build (Manuel re-builds per feedback)
//   build_stuck -- terminal in Push #1; only relevant for Push #2
// =============================================================

const { Project, sequelize } = require('../models');
const architectEmail = require('./architectEmail');
const { logActivity } = require('./activityService');

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');

// -------------------------------------------------------------
// Public API
// -------------------------------------------------------------

// Called from the Stripe webhook activation hook (services/stripeContract.js)
// right after subscription_active_at is set. Idempotent — re-running on the
// same project is a no-op once it has moved past build_authorized.
async function start(project) {
  if (!project) return;
  // Reload to make sure we have the latest workflow_phase
  await project.reload();
  if (project.workflow_phase !== 'build_authorized') {
    console.log(`[architectPipeline] skip start: project ${project.id} phase=${project.workflow_phase}`);
    return;
  }

  // Sensitive-data gate — block auto-pipeline until Manuel flips human_greenlight
  if (project.sensitive_data && !project.human_greenlight) {
    project.workflow_phase = 'awaiting_human_greenlight';
    project.build_status = 'awaiting_human_greenlight';
    await project.save();
    await architectEmail.sendSensitiveDataReviewRequest(project).catch(e =>
      console.error('[architectPipeline] sensitive-data review email failed:', e.message)
    );
    await logActivity(null, 'awaiting_human_greenlight', 'project', project.id, project.name);
    return;
  }

  await runPipeline(project);
}

// Called from the admin endpoint POST /api/v1/projects/:id/human-greenlight
// after Manuel reviews a sensitive-data project and approves the build.
async function humanGreenlight(project, approverEmail) {
  if (!project) throw new Error('project required');
  if (project.workflow_phase !== 'awaiting_human_greenlight') {
    throw new Error(`project ${project.id} not in awaiting_human_greenlight (current: ${project.workflow_phase})`);
  }
  project.human_greenlight = true;
  await project.save();
  await logActivity(approverEmail, 'human_greenlight_granted', 'project', project.id, project.name);
  // Fast-forward: pretend we just arrived from build_authorized
  project.workflow_phase = 'build_authorized';
  await project.save();
  await runPipeline(project);
}

// Called from the admin endpoint POST /api/v1/projects/:id/build-complete
// after Manuel finishes the manual build (Push #1) or after the autonomous
// agent reports completion (Push #2).
async function onBuildComplete(project, options = {}) {
  if (!project) throw new Error('project required');
  if (!['manual_build', 'uat_revision'].includes(project.workflow_phase)) {
    throw new Error(`project ${project.id} not in a buildable phase (current: ${project.workflow_phase})`);
  }
  project.workflow_phase = 'sit_running';
  project.build_status = 'sit_running';
  project.build_completed_at = new Date();
  if (options.sit_report_md) project.sit_report_md = options.sit_report_md;
  await project.save();

  const sit = await runSit(project).catch(e => ({ pass: false, error: e.message, summary: 'SIT runner crashed: ' + e.message }));

  if (!sit.pass) {
    project.workflow_phase = 'manual_build';
    project.build_status = 'sit_failed';
    project.sit_report_md = (project.sit_report_md || '') +
      `\n\n## SIT failure (${new Date().toISOString()})\n\n${sit.summary || ''}`;
    await project.save();
    await architectEmail.sendSitFailure(project, sit).catch(e =>
      console.error('[architectPipeline] SIT failure email failed:', e.message)
    );
    await logActivity(null, 'sit_failed', 'project', project.id, project.name);
    return { ok: false, sit };
  }

  // SIT passed → email stakeholders, move to uat_ready
  project.workflow_phase = 'uat_ready';
  project.build_status = 'uat_ready';
  if (sit.report_md) {
    project.sit_report_md = (project.sit_report_md || '') + `\n\n## SIT pass (${new Date().toISOString()})\n\n${sit.report_md}`;
  }
  await project.save();
  await architectEmail.sendUatHandoff(project, sit).catch(e =>
    console.error('[architectPipeline] UAT email failed:', e.message)
  );
  await logActivity(null, 'uat_ready', 'project', project.id, project.name);
  return { ok: true, sit };
}

// Stakeholders posting comments via the magic link after uat_ready
// counts as "I need changes" — re-open the build for Manuel.
async function onUatFeedback(project, comment) {
  if (!project) return;
  if (project.workflow_phase !== 'uat_ready' && project.workflow_phase !== 'uat_revision') return;
  project.workflow_phase = 'uat_revision';
  project.build_status = 'uat_revision';
  await project.save();
  await architectEmail.sendUatRevisionRequest(project, comment).catch(e =>
    console.error('[architectPipeline] uat-revision email failed:', e.message)
  );
  await logActivity(comment && comment.commenter_email, 'uat_revision_requested', 'project', project.id, project.name);
}

// Stakeholder clicked Approve on the magic-link UAT page.
async function onUatApproval(project, approverEmail) {
  if (!project) return;
  if (!['uat_ready', 'uat_revision'].includes(project.workflow_phase)) {
    throw new Error(`project ${project.id} not awaiting UAT (current: ${project.workflow_phase})`);
  }
  project.workflow_phase = 'shipped';
  project.build_status = 'shipped';
  project.uat_approved_at = new Date();
  project.uat_approved_by = approverEmail || null;
  await project.save();
  await architectEmail.sendShippedConfirmation(project).catch(e =>
    console.error('[architectPipeline] shipped email failed:', e.message)
  );
  await logActivity(approverEmail, 'uat_approved_shipped', 'project', project.id, project.name);
}

// Stripe-cancel helper. Used by Push #2 (autonomous loop) when stuck;
// exposed in Push #1 so Manuel can trigger it from a dashboard button.
async function cancelStripeSubscription(project, reason) {
  if (!project) throw new Error('project required');
  const { ProjectContract } = require('../models');
  const contract = await ProjectContract.findOne({
    where: { project_id: project.id, workspace_id: 1 },
    order: [['created_at', 'DESC']]
  });
  if (!contract || !contract.stripe_subscription_id) {
    return { canceled: false, reason: 'no_active_subscription' };
  }
  let stripe;
  try { stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null; }
  catch (_) { stripe = null; }
  if (!stripe) return { canceled: false, reason: 'stripe_not_configured' };

  try {
    await stripe.subscriptions.cancel(contract.stripe_subscription_id);
    contract.status = 'canceled';
    await contract.save();
    project.build_status = 'build_stuck';
    project.workflow_phase = 'build_stuck';
    await project.save();
    await logActivity(null, 'subscription_canceled', 'contract', contract.id, reason || 'unspecified');
    return { canceled: true, subscription_id: contract.stripe_subscription_id };
  } catch (e) {
    return { canceled: false, reason: 'stripe_error', error: e.message };
  }
}

// -------------------------------------------------------------
// Internals
// -------------------------------------------------------------

async function runPipeline(project) {
  project.build_started_at = project.build_started_at || new Date();
  project.workflow_phase = 'queued';
  project.build_status = 'queued';
  await project.save();

  // 1. Ensure a unique short_name and the production URL
  if (!project.short_name) {
    project.short_name = await generateUniqueShortName(project);
  }
  project.production_url = `${PUBLIC_BASE}/${project.short_name}`;
  await project.save();

  // 2. Gather context + render the raw template, then pass it through the
  // Senior Prompt Engineer synthesizer (Claude) for a tight, focused brief.
  // Falls back to the raw template when ANTHROPIC_API_KEY is unset.
  const context = await gatherContext(project);
  const rawPrompt = renderArchitectPrompt(project, context);
  let finalPrompt = rawPrompt;
  try {
    const synth = require('./architectPromptSynth');
    const synthesized = await synth.synthesizePrompt(rawPrompt, {
      id: project.id,
      short_name: project.short_name,
      name: project.name
    });
    if (synthesized && synthesized.length > 200) {
      finalPrompt = synthesized;
    } else {
      console.log('[architectPipeline] synthesizer returned empty/short; falling back to raw template.');
    }
  } catch (synthErr) {
    console.error('[architectPipeline] synth error (using raw template):', synthErr.message);
  }
  project.architect_prompt = finalPrompt;
  await project.save();

  // 3. Push #1: hand off to Manuel by email (Push #2 will swap this for the agent loop)
  project.workflow_phase = 'manual_build';
  project.build_status = 'manual_build';
  await project.save();
  await architectEmail.sendManualBuildHandoff(project, prompt).catch(e =>
    console.error('[architectPipeline] handoff email failed:', e.message)
  );
  await logActivity(null, 'build_handoff_sent', 'project', project.id, project.name);
}

// -------------------------------------------------------------
// Context gathering
// -------------------------------------------------------------
async function gatherContext(project) {
  const {
    ProjectQuestion, QuestionResponse, ProjectMilestone,
    MeetingMinutes, ProjectContract
  } = require('../models');

  const questions = await ProjectQuestion.findAll({
    where: { project_id: project.id },
    include: [{ model: QuestionResponse, as: 'responses', attributes: ['responder_name', 'responder_email', 'response_text', 'created_at'] }],
    order: [['position', 'ASC']]
  }).catch(() => []);

  const milestones = await ProjectMilestone.findAll({
    where: { project_id: project.id },
    order: [['due_date', 'ASC']]
  }).catch(() => []);

  let meetings = [];
  try {
    if (MeetingMinutes) {
      meetings = await MeetingMinutes.findAll({
        where: { project_id: project.id },
        order: [['meeting_date', 'ASC']]
      });
    }
  } catch (_) {}

  const contract = await ProjectContract.findOne({
    where: { project_id: project.id, workspace_id: 1 },
    order: [['created_at', 'DESC']]
  }).catch(() => null);

  return { questions, milestones, meetings, contract };
}

// -------------------------------------------------------------
// Master Architect Prompt rendering
// -------------------------------------------------------------
function renderArchitectPrompt(project, ctx) {
  const fmt = n => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const plan = project.business_plan_json || {};
  const stakeholders = Array.isArray(project.team_members)
    ? project.team_members.map(m => m && m.email).filter(Boolean)
    : [];

  const qa = (ctx.questions || []).map(q => {
    const responses = (q.responses || []).map(r => `   - ${r.responder_name || r.responder_email || 'anon'}: ${r.response_text}`).join('\n');
    return `**Q: ${q.question_text}**\n${responses || '   _(no response)_'}`;
  }).join('\n\n');

  const milestones = (ctx.milestones || []).map(m =>
    `- [${m.status || 'pending'}] ${m.title}${m.due_date ? ' (due ' + m.due_date + ')' : ''}`
  ).join('\n');

  const meetings = (ctx.meetings || []).map(m =>
    `### ${m.meeting_date || ''} — ${m.subject || ''}\n${m.ai_summary || m.notes || ''}\n`
  ).join('\n');

  const planSection = (key, title) => {
    const v = plan[key];
    if (!v) return '';
    return `### ${title}\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\`\n`;
  };

  return [
    `# Master Architect Prompt — ${project.name}`,
    ``,
    `## Project metadata`,
    `- **Project ID:** ${project.id}`,
    `- **Short name (URL slug):** \`${project.short_name}\``,
    `- **Production URL target:** ${PUBLIC_BASE}/${project.short_name}`,
    `- **Workspace path target:** \`client-builds/${project.short_name}/\` (inside the RinglyPro-CRM repo). The main \`src/app.js\` auto-mounts every \`client-builds/*/index.js\` at \`/${project.short_name}\` on boot.`,
    `- **Country:** ${project.country || '(unspecified)'}`,
    `- **Category:** ${project.category || '(unspecified)'}`,
    `- **Sensitive data:** ${project.sensitive_data ? 'YES — handle PII/PHI/regulated data carefully' : 'no'}`,
    ``,
    `## Engagement targets`,
    `- **Delivery window:** ${project.target_delivery_weeks ? project.target_delivery_weeks + ' weeks' : '(not set)'}`,
    `- **Total price:** ${project.target_total_usd ? fmt(project.target_total_usd) : '(not set)'}`,
    ctx.contract
      ? `- **Contract:** deposit ${fmt(ctx.contract.deposit_amount_usd)} (${ctx.contract.deposit_percent}%) + monthly ${fmt(ctx.contract.monthly_amount_usd)} × 12`
      : `- **Contract:** (none)`,
    ``,
    `## Stakeholders (CC on UAT)`,
    stakeholders.length ? stakeholders.map(e => `- ${e}`).join('\n') : '- (none beyond submitter)',
    `- **Submitter:** ${project.submitter_name || ''} <${project.submitter_email || ''}>`,
    ``,
    `## Original problem statement`,
    project.description || '(none)',
    ``,
    `## Intake Q&A`,
    qa || '_(no intake answers)_',
    ``,
    `## Business requirements (captured at kickoff)`,
    project.business_requirements || '_(none captured yet)_',
    ``,
    `## AI-generated milestones`,
    milestones || '_(no milestones)_',
    ``,
    `## Meeting minutes & action items`,
    meetings || '_(no meetings yet)_',
    ``,
    `## Business plan (AI-generated)`,
    plan.executive_summary
      ? `### Executive summary\n${plan.executive_summary}\n`
      : '_(no business plan)_',
    planSection('problem_market', 'Problem & market'),
    planSection('solution', 'Solution'),
    planSection('go_to_market', 'Go-to-market'),
    planSection('revenue_model', 'Revenue model'),
    planSection('team_roles_required', 'Team roles'),
    planSection('budget_breakdown', 'Budget'),
    planSection('timeline_milestones', 'Timeline'),
    planSection('risks', 'Risks'),
    planSection('success_kpis', 'Success KPIs'),
    ``,
    `## Build instructions for the Architect`,
    ``,
    `Build the system specified above per the RinglyPro architect standards:`,
    ``,
    `1. Create directory \`client-builds/${project.short_name}/\` with subdirs as needed (\`routes/\`, \`models/\`, \`migrations/\`, \`public/\`).`,
    `2. Implement an Express sub-app exported from \`client-builds/${project.short_name}/index.js\`. The main \`src/app.js\` already auto-mounts every \`client-builds/*/index.js\` at \`/<short_name>\` on boot — no edit to the main app required.`,
    `3. The sub-app MUST expose a \`GET /health\` endpoint that returns 200 + a small JSON payload. The orchestrator hits \`${PUBLIC_BASE}/${project.short_name}/health\` to verify the build.`,
    `4. Use Sequelize against the existing Postgres (\`process.env.DATABASE_URL\`). Every table prefix: \`${String(project.short_name || project.code || ('project_' + project.id)).replace(/-/g, '_')}_*\`. Every table includes \`tenant_id INTEGER NOT NULL\`.`,
    `5. Match the existing dashboard styling pattern from \`digit2ai-projects/dashboard/\` (dark theme, monospace where appropriate).`,
    `6. Multi-language ready (EN/ES) when the project's country/audience suggests Spanish.`,
    `7. Write a SIT harness at \`client-builds/${project.short_name}/sit.js\` that exits 0 on success, non-zero with a markdown summary on failure. Cover at minimum: health endpoint, primary CRUD, auth, any third-party integration mock.`,
    `8. Commit & push to \`main\` (Render auto-deploys in ~90s).`,
    `9. When done, hit POST \`/projects/api/v1/projects/${project.id}/build-complete\` (admin auth) — the orchestrator runs SIT and emails stakeholders.`,
    ``,
    `## Success criteria`,
    `- \`curl ${PUBLIC_BASE}/${project.short_name}/health\` returns 200 with a healthy payload`,
    `- \`projects/${project.short_name}/sit.js\` exits 0`,
    `- Build did not break any existing \`/projects/*\` health endpoint`,
    ``,
    `_End of Master Architect Prompt._`
  ].join('\n');
}

// -------------------------------------------------------------
// SIT runner (Push #1 = light health check; Push #2 will run sit.js)
// -------------------------------------------------------------
async function runSit(project) {
  if (!project.production_url) {
    return { pass: false, summary: 'No production_url set on project — cannot SIT.' };
  }
  const url = `${project.production_url}/health`;
  let status = 0;
  let body = '';
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow' });
    status = r.status;
    body = (await r.text()).slice(0, 400);
  } catch (e) {
    return { pass: false, summary: `Could not reach ${url}: ${e.message}` };
  }
  const pass = status >= 200 && status < 400;
  const report_md = [
    `**SIT target:** ${url}`,
    `**HTTP status:** ${status}`,
    `**Response (first 400 chars):**`,
    '```',
    body,
    '```'
  ].join('\n');
  return { pass, summary: `${pass ? 'PASS' : 'FAIL'} ${status} on ${url}`, report_md };
}

// -------------------------------------------------------------
// short_name auto-slug with uniqueness
// -------------------------------------------------------------
function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function generateUniqueShortName(project) {
  const base = slugify(project.name) || `proj-${project.id}`;
  let candidate = base;
  let suffix = 1;
  while (true) {
    const clash = await Project.findOne({
      where: { workspace_id: project.workspace_id || 1, short_name: candidate },
      attributes: ['id']
    });
    if (!clash || clash.id === project.id) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`.slice(0, 60);
  }
}

// =============================================================
// Auto-poller — closes the loop after /ringlypro-architect pushes
//
// Every 60s, scan for projects in manual_build whose build_started_at
// is within the last 30 minutes. For each, fetch <production_url>/health.
// On 200: fire onBuildComplete (which runs SIT, sends the UAT email,
// flips phase to uat_ready). On 30-min timeout with no 200: email Manuel
// "deploy timeout" and flip to build_stuck.
//
// This is what eliminates the "click Build Complete" step. Once the
// architect commits + pushes, the orchestrator picks it up on the next
// poll tick (within ~60s of Render finishing the deploy).
// =============================================================
const POLL_INTERVAL_MS = 60 * 1000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
let pollerHandle = null;
const pollAttempts = new Map(); // project_id -> attempt count (for backoff visibility)

async function tickPoller() {
  let candidates = [];
  try {
    candidates = await Project.findAll({
      where: { workflow_phase: 'manual_build' },
      attributes: ['id', 'name', 'production_url', 'short_name', 'build_started_at', 'build_iterations']
    });
  } catch (e) {
    console.error('[architectPipeline.poller] findAll failed:', e.message);
    return;
  }
  if (!candidates.length) { pollAttempts.clear(); return; }

  for (const p of candidates) {
    if (!p.production_url) continue;
    const startedAt = p.build_started_at ? new Date(p.build_started_at).getTime() : Date.now();
    const elapsed = Date.now() - startedAt;

    // Deploy timeout — flip to build_stuck + email Manuel
    if (elapsed > BUILD_TIMEOUT_MS) {
      try {
        const fresh = await Project.findByPk(p.id);
        if (fresh && fresh.workflow_phase === 'manual_build') {
          fresh.workflow_phase = 'build_stuck';
          fresh.build_status = 'deploy_timeout';
          await fresh.save();
          await architectEmail.sendSitFailure(fresh, {
            pass: false,
            summary: `Deploy timeout after ${Math.round(elapsed / 60000)} min — ${fresh.production_url}/health never returned 200.`,
            report_md: `**Poll attempts:** ${pollAttempts.get(p.id) || 0}\n**Last started:** ${fresh.build_started_at}\n**Production URL:** ${fresh.production_url}\n\nThe orchestrator stopped polling. Fix the build or push again — clicking Build Complete manually will retry SIT.`
          }).catch(() => {});
          pollAttempts.delete(p.id);
          await logActivity(null, 'deploy_timeout', 'project', fresh.id, fresh.name);
        }
      } catch (e) {
        console.error('[architectPipeline.poller] timeout handler failed:', e.message);
      }
      continue;
    }

    // Health check
    const url = `${p.production_url}/health`;
    let healthy = false;
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      healthy = res.status >= 200 && res.status < 400;
    } catch (_) {
      healthy = false;
    }

    const prev = pollAttempts.get(p.id) || 0;
    pollAttempts.set(p.id, prev + 1);

    if (!healthy) continue;

    // First 2xx — auto-fire the build-complete handler.
    try {
      const fresh = await Project.findByPk(p.id);
      if (fresh && fresh.workflow_phase === 'manual_build') {
        pollAttempts.delete(p.id);
        await onBuildComplete(fresh, {
          sit_report_md: `Auto-detected deploy via health poller after ${prev + 1} attempts (${Math.round(elapsed / 1000)}s since build_started_at).`
        });
        console.log(`[architectPipeline.poller] auto-completed build for project ${p.id}`);
      }
    } catch (e) {
      console.error('[architectPipeline.poller] auto-complete failed:', e.message);
    }
  }
}

function startBuildPoller() {
  if (pollerHandle) return; // idempotent
  // Stagger the first tick a few seconds so we don't fight boot I/O
  setTimeout(() => { tickPoller().catch(() => {}); }, 8000);
  pollerHandle = setInterval(() => { tickPoller().catch(() => {}); }, POLL_INTERVAL_MS);
  console.log('[architectPipeline] build poller started (tick every', POLL_INTERVAL_MS / 1000, 's)');
}

module.exports = {
  start,
  humanGreenlight,
  onBuildComplete,
  onUatFeedback,
  onUatApproval,
  cancelStripeSubscription,
  generateUniqueShortName,
  renderArchitectPrompt,
  gatherContext,
  runSit,
  startBuildPoller,
  tickPoller
};
