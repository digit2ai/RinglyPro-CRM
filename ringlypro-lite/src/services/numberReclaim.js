'use strict';

/**
 * Number reclaim — releases Twilio DIDs from non-converting tenants so we stop
 * paying for dead numbers. Releases when the subscription is canceled, OR the
 * trial expired with no card on file past a grace window. Mirrors Twilio's own
 * unused-number sweep. Called by the daily in-app scheduler and the admin route.
 */
// alias LiteNumber — importing as `Number` shadows the global Number constructor.
const { Tenant, Number: LiteNumber } = require('../models');
const { getProvider } = require('../telephony');

function graceDays() {
  const v = parseInt(process.env.LITE_RELEASE_GRACE_DAYS, 10);
  return Number.isFinite(v) ? v : 3;
}

async function releaseUnconverted() {
  const cutoff = new Date(Date.now() - graceDays() * 86400000);
  const active = await LiteNumber.findAll({ where: { status: 'active' } });
  const released = [];
  for (const num of active) {
    const tenant = await Tenant.findByPk(num.tenant_id);
    if (!tenant) continue;
    const canceled = tenant.subscription_status === 'canceled';
    const trialLapsed = !tenant.stripe_subscription_id
      && tenant.subscription_status !== 'active'
      && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < cutoff;
    if (!canceled && !trialLapsed) continue;
    try {
      if (num.provider_sid) await getProvider().releaseNumber({ providerSid: num.provider_sid });
      num.status = 'released';
      await num.save();
      released.push({ tenant_id: tenant.id, did: num.did, reason: canceled ? 'canceled' : 'trial_lapsed' });
    } catch (e) {
      console.error('[lite:reclaim] release error for', num.did, e.message);
    }
  }
  return released;
}

// Daily in-app scheduler (no external Render cron needed). First sweep ~1h after
// boot (past deploy churn), then every 24h.
function startScheduler() {
  const run = () => releaseUnconverted()
    .then(r => { if (r.length) console.log(`[lite:reclaim] auto-released ${r.length} number(s):`, r.map(x => x.did).join(', ')); })
    .catch(e => console.error('[lite:reclaim] sweep error:', e.message));
  setTimeout(run, 60 * 60 * 1000);            // first run 1h after boot
  setInterval(run, 24 * 60 * 60 * 1000);      // then daily
  console.log('[lite:reclaim] daily number-reclaim scheduler started (grace', graceDays(), 'days)');
}

module.exports = { releaseUnconverted, startScheduler, graceDays };
