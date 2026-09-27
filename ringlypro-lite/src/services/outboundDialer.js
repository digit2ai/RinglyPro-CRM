/**
 * THE DIALER — what makes "Activate" mean anything.
 *
 * Before this, `POST /lists/:id/activate` wrote `status = 'active'` and
 * NOTHING read that column. The only way to place an outbound call was the
 * per-contact "Call now" button. A tenant could upload 139 contacts, press
 * Activate, and sit waiting for calls that were never going to happen — the
 * worst kind of missing feature, because the UI said it had started.
 *
 * WHAT IT DOES NOT DO, DELIBERATELY:
 *  - It does not re-check anything `mayDial` already checks. Every gate lives
 *    there and is applied per contact at dial time, so a suppression added a
 *    minute ago, a country removed from the allow-list, or the clock passing
 *    21:00 in the called party's zone all take effect on the next contact —
 *    not the next run. A second copy of those rules here is how two paths
 *    drift and one of them starts calling people at 7am.
 *  - It does not retry a failed contact. An attempt is recorded, the status
 *    moves off 'pending', and a human decides. Automatic retries against a
 *    list of strangers is how a bug becomes harassment.
 *  - It invents no call id and no outcome. `dial()` records the enrollment;
 *    what happened on the call arrives later from HighLevel's own log.
 */
const { sequelize, Tenant } = require('../models');
const ob = require('./outbound');
const accounts = require('./ghlAccounts');

let timer = null;
const stats = { runs: 0, dialled: 0, skipped: 0, failed: 0, last_at: null, last_error: null };

function perTick() {
  // Deliberately small. This paces a campaign across the day rather than
  // dumping a list into HighLevel in one burst, which is both a quota problem
  // and the shape of a call pattern that gets a number flagged.
  return Math.max(1, parseInt(process.env.LITE_OUTBOUND_PER_TICK || '5', 10) || 5);
}

/** Tenants that can actually dial: switched on, workflow set, list active. */
async function dialableTenants() {
  const [rows] = await sequelize.query(
    `SELECT DISTINCT t.id
       FROM lite_tenants t
       JOIN lite_outbound_lists l ON l.tenant_id = t.id AND l.status = 'active'
      WHERE t.outbound_enabled = TRUE
        AND t.outbound_workflow_id IS NOT NULL
      ORDER BY t.id`
  );
  return (rows || []).map((r) => r.id);
}

/**
 * One pass for one tenant. Returns a result PER CONTACT, including the ones
 * it refused and why — a silent skip is how a tenant concludes the product is
 * broken when it is in fact obeying the calling-hours rule.
 */
async function runTenant(tenantId, { at = new Date(), limit = perTick() } = {}) {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) return { tenant: tenantId, error: 'no_such_tenant', results: [] };

  const [rows] = await sequelize.query(
    `SELECT c.* FROM lite_outbound_contacts c
       JOIN lite_outbound_lists l ON l.id = c.list_id AND l.status = 'active'
      WHERE c.tenant_id = :t AND c.status = 'pending'
      ORDER BY c.id
      LIMIT :n`,
    { replacements: { t: tenantId, n: Math.max(1, limit) } }
  );
  if (!rows || !rows.length) return { tenant: tenantId, results: [] };

  // One credential lookup for the whole pass, not one per contact.
  let creds = null;
  try { creds = await accounts.credsFor(tenant); } catch (_) { creds = null; }

  const results = [];
  for (const c of rows) {
    let r;
    try {
      r = await ob.dial(tenant, c, { at, creds });
    } catch (e) {
      r = { ok: false, reason: 'dial_threw', detail: String(e.message || e).slice(0, 200) };
    }
    if (r.ok) { stats.dialled++; results.push({ id: c.id, dialled: true }); continue; }

    // A refusal that will still be true next tick must not be retried for
    // ever: mark it so the pass moves on. A refusal that is about the CLOCK
    // is left pending on purpose — it becomes dialable later today.
    // TRANSIENT = "this will not still be true later". Running out of credit
    // and not being activated are BOTH temporary: the client tops up, or the
    // owner finishes the setup. Marking those contacts `skipped` destroyed the
    // rest of the list permanently — the dialer only ever selects `pending`
    // and nothing requeues — so a client topped up and their campaign was
    // silently dead, with the tab reporting 0 waiting as if it had finished.
    const transient = ['outside calling hours', 'daily_cap_reached', 'timezone_unreadable',
      'insufficient_credit', 'outbound_not_activated']
      .some((k) => String(r.reason || '').includes(k));
    if (!transient) {
      await sequelize.query(
        `UPDATE lite_outbound_contacts
            SET status = 'skipped', last_outcome = :o, last_attempt_at = NOW()
          WHERE id = :id AND tenant_id = :t`,
        { replacements: { id: c.id, t: tenantId, o: String(r.reason || 'refused').slice(0, 40) } }
      );
      stats.failed++;
    } else {
      stats.skipped++;
    }
    results.push({ id: c.id, dialled: false, reason: r.reason, transient });

    // A whole-tenant stop, so one exhausted cap or a closed window does not
    // burn the rest of the pass refusing every remaining contact in turn.
    if (['daily_cap_reached', 'outside calling hours', 'insufficient_credit',
      'outbound_not_activated'].some((k) => String(r.reason || '').includes(k))) break;
  }
  return { tenant: tenantId, results };
}

/** Every eligible tenant. One tenant's outage never starves the others. */
async function runAll({ at = new Date(), limit } = {}) {
  const ids = await dialableTenants();
  const out = [];
  for (const id of ids) {
    try { out.push(await runTenant(id, { at, limit })); }
    catch (e) { out.push({ tenant: id, error: String(e.message || e).slice(0, 200), results: [] }); }
  }
  return { tenants: ids.length, results: out };
}

function start() {
  const flag = String(process.env.LITE_OUTBOUND_DIALER || '').toLowerCase();
  if (flag === 'off') { console.log('[lite:dialer] off by env'); return null; }
  if (flag !== 'on' && process.env.NODE_ENV !== 'production') return null;
  const everySec = Math.max(60, parseInt(process.env.LITE_OUTBOUND_TICK_SEC || '120', 10) || 120);

  const tick = async () => {
    // ONE INSTANCE DIALS. Render runs more than one, and two passes reading
    // the same 'pending' rows would enroll the same person twice — two calls,
    // one after the other, from the same business.
    let held = false;
    try {
      const [lk] = await sequelize.query(
        'SELECT pg_try_advisory_lock(:id) AS ok', { replacements: { id: 918273645 } });
      held = !!(lk && lk[0] && (lk[0].ok === true || lk[0].ok === 't'));
      if (!held) return;
      stats.runs++; stats.last_at = new Date().toISOString();
      // THE SWEEP RUNS HERE BECAUSE IT WAS WRITTEN AND NEVER CALLED. Every
      // call whose log never arrives holds 130c of the client's balance for
      // ever, shows as in-progress in their report, and eats the funds they
      // paid for. The dialer already holds the advisory lock, so this runs
      // once across instances.
      try {
        const sw = await require('./outboundBilling').sweepStaleReserves({});
        if (sw.swept) console.log(`[lite:dialer] released ${sw.swept} stale reserve(s)`);
      } catch (e) { console.warn('[lite:dialer] reserve sweep failed:', e.message); }
      const r = await runAll({});
      const n = r.results.reduce((a, x) => a + (x.results || []).filter((y) => y.dialled).length, 0);
      if (n) console.log(`[lite:dialer] enrolled ${n} call(s)`);
    } catch (e) {
      stats.last_error = String(e.message || e).slice(0, 200);
      console.warn('[lite:dialer] tick failed:', e.message);
    } finally {
      if (held) {
        await sequelize.query('SELECT pg_advisory_unlock(:id)', { replacements: { id: 918273645 } })
          .catch(() => {});
      }
    }
  };

  timer = setInterval(tick, everySec * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 30000).unref?.();
  console.log(`[lite:dialer] on, every ${everySec}s, up to ${perTick()} per tenant per tick`);
  return timer;
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { dialableTenants, runTenant, runAll, start, stop, stats, perTick };
