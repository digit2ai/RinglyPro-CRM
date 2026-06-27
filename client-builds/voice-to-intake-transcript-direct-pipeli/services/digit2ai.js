// =====================================================
// forwardToIntake(): real POST or mock when env unset
//
// Forwards a persisted intake row to the Digit2AI intake webhook. When
// DIGIT2AI_INTAKE_URL / DIGIT2AI_INTAKE_TOKEN are unset (the default at
// kickoff — the real endpoint is unconfirmed) the forward is mocked and
// logged, and the caller still saves the row with forward_status='mocked'.
//
// PII discipline: never log the transcript body or submitter email. Log only
// { intake_id, tenant_id, lang, forward_status, transcript_len }.
//
// TODO: wire real Digit2AI intake URL + token
// =====================================================

function logSafe(obj) {
  // stderr — Render captures. Length-only, no transcript text.
  console.error(JSON.stringify(Object.assign({ svc: 'voice-to-intake', event: 'forward' }, obj)));
}

// Returns 'forwarded' | 'mocked' | 'failed'. Never throws.
async function forwardToIntake(intake) {
  const url = process.env.DIGIT2AI_INTAKE_URL;
  const token = process.env.DIGIT2AI_INTAKE_TOKEN;
  const transcript_len = intake && intake.transcript ? String(intake.transcript).length : 0;
  const base = {
    intake_id: intake && intake.id,
    tenant_id: intake && intake.tenant_id,
    lang: intake && intake.lang,
    transcript_len
  };

  if (!url || !token) {
    logSafe(Object.assign({ forward_status: 'mocked' }, base));
    return 'mocked';
  }

  try {
    const payload = {
      transcript: intake.transcript,
      lang: intake.lang,
      submitter_id: intake.submitter_id,
      tenant_id: intake.tenant_id,
      triage_bypass: intake.triage_bypass === true || intake.triage_bypass === undefined,
      created_at: intake.created_at,
      source: 'voice-to-intake-transcript-direct-pipeli'
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      logSafe(Object.assign({ forward_status: 'failed', http: resp.status }, base));
      return 'failed';
    }
    logSafe(Object.assign({ forward_status: 'forwarded', http: resp.status }, base));
    return 'forwarded';
  } catch (err) {
    logSafe(Object.assign({ forward_status: 'failed', error: err.message }, base));
    return 'failed';
  }
}

module.exports = { forwardToIntake };
