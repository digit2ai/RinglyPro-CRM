// =====================================================
// forwardToIntake(): land the transcript in the Digit2AI Project Request Inbox
//
// Default path (no external webhook configured): POST to the local Projects
// intake endpoint (/projects/api/v1/intake/public/request) which creates the
// d2_projects row that shows up in the dashboard "Project Request Inbox" and
// auto-runs the Inbox Triage Agent. Returns 'forwarded' on success.
//
// Override path: if DIGIT2AI_INTAKE_URL + DIGIT2AI_INTAKE_TOKEN are set, POST the
// raw transcript to that external webhook instead.
//
// PII discipline: never log the transcript body or submitter email. Log only
// { intake_id, tenant_id, lang, forward_status, transcript_len, project_id? }.
// =====================================================

function logSafe(obj) {
  console.error(JSON.stringify(Object.assign({ svc: 'voice-to-intake', event: 'forward' }, obj)));
}

function baseUrl() {
  return process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com';
}

// Build a short, human-readable project title from the transcript.
function deriveTitle(transcript, lang) {
  const clean = String(transcript || '').replace(/\s+/g, ' ').trim();
  const prefix = lang === 'es' ? 'Solicitud por voz' : 'Voice Intake';
  if (!clean) return prefix;
  const snippet = clean.length > 70 ? clean.slice(0, 67).trim() + '…' : clean;
  return `${prefix} — ${snippet}`;
}

// intake: the persisted row. submitter: { full_name, email } from the JWT.
// Returns 'forwarded' | 'failed'. Never throws.
async function forwardToIntake(intake, submitter) {
  const transcript_len = intake && intake.transcript ? String(intake.transcript).length : 0;
  const logBase = {
    intake_id: intake && intake.id,
    tenant_id: intake && intake.tenant_id,
    lang: intake && intake.lang,
    transcript_len
  };

  // Reserved test-tenant range (SIT / health-poller) — never create real inbox
  // rows for these. Keeps automated tests from spamming the Project Request Inbox.
  const TEST_TENANT_MIN = 990000;
  if (intake && intake.tenant_id >= TEST_TENANT_MIN) {
    logSafe(Object.assign({ forward_status: 'mocked', target: 'test-skip' }, logBase));
    return 'mocked';
  }

  const extUrl = process.env.DIGIT2AI_INTAKE_URL;
  const extToken = process.env.DIGIT2AI_INTAKE_TOKEN;

  try {
    if (extUrl && extToken) {
      // External webhook override.
      const resp = await fetch(extUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + extToken },
        body: JSON.stringify({
          transcript: intake.transcript,
          lang: intake.lang,
          submitter_id: intake.submitter_id,
          tenant_id: intake.tenant_id,
          triage_bypass: intake.triage_bypass !== false,
          created_at: intake.created_at,
          source: 'voice-to-intake-transcript-direct-pipeli'
        })
      });
      const status = resp.ok ? 'forwarded' : 'failed';
      logSafe(Object.assign({ forward_status: status, target: 'external', http: resp.status }, logBase));
      return status;
    }

    // Default: create a real Project Request Inbox row.
    const sub = submitter || {};
    const email = sub.email || `tenant-${intake.tenant_id}@voice-intake.digit2ai.local`;
    const fullName = sub.full_name || `Voice Intake (tenant ${intake.tenant_id})`;
    const payload = {
      full_name: fullName,
      email,
      company_name: sub.company_name || fullName,
      project_title: deriveTitle(intake.transcript, intake.lang),
      problem: intake.transcript,
      project_description: intake.transcript,
      ai_category: ['Voice agent (inbound / outbound)'],
      timeline: '',
      heard_from: 'Voice-to-Intake app',
      country: sub.country || null
    };
    const resp = await fetch(baseUrl() + '/projects/api/v1/intake/public/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let projectId = null;
    try { const j = await resp.json(); projectId = j && j.project_id; } catch (e) {}
    const status = resp.ok ? 'forwarded' : 'failed';
    logSafe(Object.assign({ forward_status: status, target: 'inbox', http: resp.status, project_id: projectId }, logBase));
    return status;
  } catch (err) {
    logSafe(Object.assign({ forward_status: 'failed', error: err.message }, logBase));
    return 'failed';
  }
}

module.exports = { forwardToIntake };
