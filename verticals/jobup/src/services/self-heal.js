'use strict';

// =============================================================
// SELF-HEALING: repair what an outage froze into a profile.
//
// WHY THIS EXISTS. The Anthropic balance hit zero. Every preview built during
// that window fell to the heuristic path — a name, a guessed headline, and no
// experience, no skills, no education. One of those previews belonged to
// somebody who then PAID, and provisioning copied it into her live account.
// Her public page and her machine-readable identity were empty for a day, and
// the only reason it was ever found is that the owner happened to look.
//
// The degradation itself is correct behaviour: a labelled thin result beats an
// invented one. What was wrong is that it was PERMANENT. The source text was
// on file the whole time; only the structuring had failed, and nothing ever
// went back to try again.
//
// So: while the model is reachable, sweep for profiles that were structured
// without it and re-structure them from the text already stored. No upload, no
// human, no support ticket. A paying subscriber should not have to notice.
//
// THE RULES THIS SWEEP OBEYS:
//   - It NEVER touches a profile that was structured with the model. A human
//     edit and a good parse are both `is_simulated:false` and neither is ours
//     to overwrite.
//   - It requires the source text. With nothing to re-read there is nothing to
//     do, and inventing the difference is the one unacceptable outcome.
//   - It is capped per sweep. An outage that ends at 3am must not become a
//     thousand model calls in one tick.
//   - Paying accounts go first. They are the ones the damage costs.
// =============================================================

const { models, scoped } = require('../models');
const brain = require('./brain');

const MAX_PER_SWEEP = parseInt(process.env.JOBUP_SELFHEAL_MAX || '10', 10);
const MIN_SOURCE_CHARS = 60;

/** Was this structured without the model, and is there text to re-read? */
function needsHealing(row) {
  const j = (row && row.resume_json) || {};
  if (!j.is_simulated) return false;                       // good parse, or a human's own edit
  return String(row.source_text || '').length >= MIN_SOURCE_CHARS;
}

/**
 * One pass. Returns what it did rather than logging into the void, so the
 * scheduler's status and the owner console can both show it.
 */
async function sweep({ max = MAX_PER_SWEEP } = {}) {
  if (!brain.enabled()) {
    return { ran: false, reason: 'no model configured — re-reading would produce the same thin result' };
  }
  // Do not start a sweep into a model that is currently failing: it would burn
  // the cap turning every row into another identical heuristic result.
  const probe = await brain.probe();
  if (!probe.ok) {
    return { ran: false, reason: 'the model is unreachable right now', detail: probe.reason || null };
  }

  const rows = await models.profiles.findAll({});
  const subs = await models.subscribers.findAll({});
  const paying = new Set(subs
    .filter((s) => !require('./billing').isNonRevenue(s.activation))
    .map((s) => s.id));

  const candidates = rows.filter(needsHealing)
    // Paying accounts first — the damage costs them most.
    .sort((a, b) => (paying.has(b.tenant_id) ? 1 : 0) - (paying.has(a.tenant_id) ? 1 : 0));

  const out = { ran: true, found: candidates.length, healed: [], failed: [], cost_usd: 0 };
  if (!candidates.length) return out;

  const resumeSvc = require('./resume');
  for (const row of candidates.slice(0, max)) {
    try {
      const again = await resumeSvc.structure(row.source_text);
      if (!again || !again.profile || again.profile.is_simulated) {
        out.failed.push({ tenant_id: row.tenant_id, reason: 'still could not reach the model' });
        continue;
      }
      out.cost_usd += again.cost_usd || 0;
      await scoped('profiles', row.tenant_id).update(
        { resume_json: again.profile }, { id: row.id });

      // A profile nobody can see is only half repaired: the public page,
      // resume.json, the JSON-LD and the agent card all render FROM it.
      let republished = false;
      try {
        const r = await require('./provisioning').publishSite(row.tenant_id);
        republished = Boolean(r && r.ok !== false);
      } catch (e) { /* the profile is fixed either way */ }

      await models.audit_log.create({
        tenant_id: row.tenant_id, actor: 'system', action: 'profile_self_healed',
        reason: 'Structured without a model during an outage; re-read from the stored resume text.',
      }).catch(() => {});

      out.healed.push({
        tenant_id: row.tenant_id,
        paying: paying.has(row.tenant_id),
        experience: (again.profile.experience || []).length,
        skills: (again.profile.skills || []).length,
        republished,
      });
    } catch (e) {
      out.failed.push({ tenant_id: row.tenant_id, reason: e.message });
    }
  }
  out.cost_usd = Number(out.cost_usd.toFixed(5));
  if (out.healed.length) {
    console.log('[jobup self-heal]', JSON.stringify({ healed: out.healed, cost: out.cost_usd }));
  }
  return out;
}

/** How many live profiles are currently degraded. Cheap; no model call. */
async function pending() {
  const rows = await models.profiles.findAll({});
  const bad = rows.filter(needsHealing);
  const subs = await models.subscribers.findAll({});
  const billing = require('./billing');
  const paying = new Set(subs.filter((s) => !billing.isNonRevenue(s.activation)).map((s) => s.id));
  return {
    degraded: bad.length,
    degraded_paying: bad.filter((r) => paying.has(r.tenant_id)).length,
    tenant_ids: bad.map((r) => r.tenant_id),
  };
}

module.exports = { sweep, pending, needsHealing, MAX_PER_SWEEP };
