'use strict';

/**
 * HOW MANY NUMBERS ARE LEFT FOR THE NEXT SIGNUP.
 *
 * This exists because of a workaround, and it should be read as one. While
 * HighLevel refuses the API purchase (403 on an entitlement, while the same
 * buy succeeds in their UI), provisioning ADOPTS an already-bought number that
 * no tenant has claimed — so the owner stocks a few by hand and each signup
 * takes one. The moment the token carries phone-system write, the pool stops
 * mattering and this becomes a formality.
 *
 * WHAT IT REFUSES TO DO IS THE POINT. Running out is SILENT: the next signup
 * hits the 403, stops at the number step, and nothing says the shelf was
 * empty. A human watching a count is a second workaround on top of the first,
 * so the system watches it and tells the founder through the notification
 * centre they already carry — before the shelf is bare, not after a signup
 * broke.
 *
 * AND AN UNREADABLE SUB-ACCOUNT IS NOT AN EMPTY ONE. If the token cannot list
 * numbers — the same missing scope that is the likeliest cause of the 403 —
 * that is reported as itself. Reporting "0 spare" there would send the owner
 * shopping for numbers to fix a permissions problem.
 */
const { Number: NumberModel } = require('../models');

function minSpare() {
  const v = parseInt(process.env.LITE_NUMBER_POOL_MIN || '2', 10);
  return Number.isInteger(v) && v >= 0 ? v : 2;
}

/**
 * @returns {{ok:boolean, spare?:number, owned?:number, claimed?:number,
 *            low?:boolean, reason?:string}}
 */
async function status() {
  let owned = null;
  try {
    const GhlProvider = require('../telephony/ghlProvider');   // default export, not named
    const accounts = require('./ghlAccounts');
    let creds = null;
    try { creds = await accounts.credsFor(null); } catch (_) { creds = null; }
    owned = await new GhlProvider(creds ? { creds } : {}).ownedNumbers();
  } catch (e) {
    // Named, never counted as zero.
    return { ok: false, reason: 'cannot_read_sub_account',
      detail: String(e.message || e).slice(0, 160) };
  }
  if (!Array.isArray(owned)) {
    return { ok: false, reason: 'cannot_read_sub_account' };
  }

  const rows = await NumberModel.findAll({ attributes: ['did'] });
  const taken = new Set(rows.map((r) => r.did));
  const spare = owned.filter((d) => !taken.has(d)).length;
  return { ok: true, owned: owned.length, claimed: taken.size, spare,
    min: minSpare(), low: spare <= minSpare() };
}

/**
 * Tell the founder once per crossing. `lite_notifications` is the channel they
 * already have a badge for, and the dedupe is the same shape the fraud watch
 * uses: a redeploy or a tick must not re-notify a shelf that is still low.
 */
let lastTold = null;          // the spare count we last warned about

async function check() {
  const st = await status();
  const notify = require('./notify');

  if (!st.ok) {
    if (lastTold !== 'unreadable') {
      lastTold = 'unreadable';
      await notify.notifyOwner('number_pool_unreadable',
        'Cannot read the phone numbers in the sub-account',
        'Signup adopts an already-bought number, and that list cannot be read right now, '
        + 'so the next signup may fail with nothing to take. This is most likely the same '
        + 'missing phone-system scope behind the 403 on buying. It is NOT the same as having '
        + 'no numbers left.').catch(() => {});
    }
    return st;
  }

  if (st.low) {
    if (lastTold !== st.spare) {
      lastTold = st.spare;
      await notify.notifyOwner('number_pool_low',
        st.spare === 0 ? 'No phone numbers left for the next signup'
          : `Only ${st.spare} phone number${st.spare === 1 ? '' : 's'} left for new signups`,
        `${st.spare} unclaimed of ${st.owned} in the sub-account. Buy a few in the HighLevel UI `
        + 'and the next signups will adopt them. This goes away once the integration token '
        + 'carries phone-system write and the system can buy its own.').catch(() => {});
    }
  } else {
    lastTold = null;          // restocked: the next dip warns again
  }
  return st;
}

let timer = null;

function start() {
  const flag = String(process.env.LITE_NUMBER_POOL_WATCH || '').toLowerCase();
  if (flag === 'off') { console.log('[lite:numberpool] off by env'); return null; }
  const everyMin = Math.max(5, parseInt(process.env.LITE_NUMBER_POOL_MIN_SEC || '30', 10) || 30);
  const tick = async () => {
    try {
      const st = await check();
      if (st.ok && st.low) console.warn(`[lite:numberpool] ${st.spare} spare number(s) left`);
    } catch (e) { console.warn('[lite:numberpool] check failed:', e.message); }
  };
  timer = setInterval(tick, everyMin * 60 * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 45000).unref?.();
  console.log(`[lite:numberpool] watching, every ${everyMin}m, warn at <= ${minSpare()}`);
  return timer;
}

module.exports = { status, check, start, minSpare };
