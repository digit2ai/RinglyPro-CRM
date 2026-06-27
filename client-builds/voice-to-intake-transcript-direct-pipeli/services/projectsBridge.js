// =====================================================
// projectsBridge — reuse the digit2ai-projects app (same Node process) to:
//   1) auto-generate the PoC Voice Teaser magic link for a project request
//   2) list a champion's requests + their teaser links (tenant/email-scoped)
//   3) mark a teaser as "shared" (clears the Inbox badge)
//
// All access goes through the projects app's OWN Sequelize so we hit the exact
// DB that stores d2_projects + d2_project_teasers (PROJECTS_DATABASE_URL ||
// CRM_DATABASE_URL || DATABASE_URL), avoiding the dual-DB trap. Every require is
// guarded so a load failure degrades gracefully instead of breaking the app.
// =====================================================

const crypto = require('crypto');

let projectsSequelize = null;
let generator = null;
let Project = null;
let Company = null;
let loadErr = null;

try {
  projectsSequelize = require('../../../digit2ai-projects/src/config/database');
  generator = require('../../../digit2ai-projects/src/services/voiceTeaserGenerator');
  const models = require('../../../digit2ai-projects/src/models');
  Project = models.Project;
  Company = models.Company;
} catch (e) {
  loadErr = e;
  console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'projects_bridge_load_failed', error: e.message }));
}

function available() { return !!(projectsSequelize && generator && Project); }

function publicBase() {
  return (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
}
function teaserUrl(token) { return `${publicBase()}/projects/teaser/${token}`; }

// One-time: add the column we use to track champion shares. Idempotent.
let columnReady = false;
async function ensureSchema() {
  if (!available() || columnReady) return;
  try {
    await projectsSequelize.query(
      'ALTER TABLE d2_project_teasers ADD COLUMN IF NOT EXISTS champion_shared_at TIMESTAMP'
    );
    columnReady = true;
  } catch (e) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'ensure_teaser_column_failed', error: e.message }));
  }
}

// Generate (and persist) the PoC teaser for a project. Reuses an existing
// 'ready' teaser if one is already present. Returns { token, url } or null.
async function generateTeaserForProject(projectId, langOverride) {
  if (!available()) return null;
  await ensureSchema();
  try {
    const [existing] = await projectsSequelize.query(
      "SELECT token FROM d2_project_teasers WHERE project_id = :pid AND status = 'ready' ORDER BY id DESC LIMIT 1",
      { replacements: { pid: projectId } }
    );
    if (existing.length) return { token: existing[0].token, url: teaserUrl(existing[0].token), reused: true };

    const project = await Project.findByPk(projectId);
    if (!project) return null;
    let company_name = '';
    if (project.company_id && Company) {
      const c = await Company.findByPk(project.company_id).catch(() => null);
      company_name = c ? c.name : '';
    }
    const projObj = Object.assign({}, project.toJSON(), { company_name });
    const teaser = await generator.generate(projObj, { lang: langOverride });
    const token = crypto.randomUUID();
    await projectsSequelize.query(
      `INSERT INTO d2_project_teasers (workspace_id, project_id, token, title, lang, voice, content_json, status, model, created_at, updated_at)
       VALUES (:workspace_id, :project_id, :token, :title, :lang, :voice, CAST(:content AS JSONB), 'ready', :model, NOW(), NOW())`,
      { replacements: {
        workspace_id: project.workspace_id || 1,
        project_id: projectId,
        token,
        title: teaser.title,
        lang: teaser.lang,
        voice: teaser.voice,
        content: JSON.stringify(teaser),
        model: teaser.model
      } }
    );
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'teaser_generated', project_id: projectId, model: teaser.model }));
    return { token, url: teaserUrl(token), reused: false };
  } catch (e) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'teaser_generate_failed', project_id: projectId, error: e.message }));
    return null;
  }
}

// Fire-and-forget wrapper used by the request path so we never block the 201.
function generateTeaserAsync(projectId, langOverride) {
  if (!projectId) return;
  Promise.resolve().then(() => generateTeaserForProject(projectId, langOverride)).catch(() => {});
}

// List a champion's intake requests + their latest teaser, scoped by the
// submitter email from the verified JWT.
async function listChampionInbox(email) {
  if (!available() || !email) return [];
  await ensureSchema();
  try {
    const [rows] = await projectsSequelize.query(
      `SELECT p.id AS project_id,
              p.name AS title,
              p.created_at,
              p.triage_structured->>'fit_score' AS fit_score,
              p.triage_structured->>'go_no_go_recommendation' AS recommendation,
              t.token AS teaser_token,
              t.status AS teaser_status,
              t.champion_shared_at
       FROM d2_projects p
       LEFT JOIN LATERAL (
         SELECT token, status, champion_shared_at
         FROM d2_project_teasers
         WHERE project_id = p.id
         ORDER BY id DESC LIMIT 1
       ) t ON TRUE
       WHERE lower(p.submitter_email) = lower(:email)
         AND 'neural-ai-intake' = ANY(p.tags)
       ORDER BY p.id DESC
       LIMIT 50`,
      { replacements: { email } }
    );
    return rows.map((r) => ({
      project_id: r.project_id,
      title: r.title,
      created_at: r.created_at,
      fit_score: r.fit_score != null ? Number(r.fit_score) : null,
      recommendation: r.recommendation || null,
      teaser_ready: r.teaser_status === 'ready' && !!r.teaser_token,
      teaser_url: r.teaser_token ? teaserUrl(r.teaser_token) : null,
      shared: !!r.champion_shared_at
    }));
  } catch (e) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'inbox_list_failed', error: e.message }));
    return [];
  }
}

// Mark the project's teaser as shared by the champion (only if it's theirs).
async function markTeaserShared(projectId, email) {
  if (!available() || !email || !projectId) return false;
  await ensureSchema();
  try {
    const [, meta] = await projectsSequelize.query(
      `UPDATE d2_project_teasers t SET champion_shared_at = NOW()
       FROM d2_projects p
       WHERE t.project_id = p.id
         AND t.project_id = :pid
         AND lower(p.submitter_email) = lower(:email)`,
      { replacements: { pid: projectId, email } }
    );
    return true;
  } catch (e) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'mark_shared_failed', error: e.message }));
    return false;
  }
}

module.exports = {
  available,
  generateTeaserForProject,
  generateTeaserAsync,
  listChampionInbox,
  markTeaserShared,
  loadError: () => (loadErr ? loadErr.message : null)
};
