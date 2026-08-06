#!/usr/bin/env node
'use strict';

/**
 * Fill the shared job pool.
 *
 *   node verticals/jobup/scripts/seed-employers.js --probe        (report only)
 *   node verticals/jobup/scripts/seed-employers.js --seed         (probe + register)
 *   node verticals/jobup/scripts/seed-employers.js --refresh      (pull postings)
 *   node verticals/jobup/scripts/seed-employers.js --seed --refresh
 *
 * THE QUARANTINE IS THE POINT. Guessing a board token from a company name lands
 * on abandoned trial accounts squatting real names — accenture.recruitee.com and
 * ey.recruitee.com serve Amsterdam demo posts titled "Senior Marketer (Sample)".
 * So a token here is only marked `live` when the probe returns postings that
 * actually look like that company's own hiring. Anything else is registered
 * `unverified`, contributes NOTHING to the pool, and waits for a human to
 * confirm it via PATCH /employers/:id/verify.
 *
 * The list below is hand-checked, not generated. Adding to it is a deliberate
 * act, and every entry states which ATS actually serves that career site.
 */

require('dotenv').config();
const path = require('path');
const { init, models } = require(path.join(__dirname, '..', 'src', 'models'));
const employers = require(path.join(__dirname, '..', 'src', 'services', 'employers'));

// Hand-checked public boards. `ats` is the system actually serving the career
// site; `token` is the identifier that site's own JSON endpoint uses.
const REGISTRY = [
  // ---- Greenhouse ----
  { name: 'Stripe',            ats: 'greenhouse', token: 'stripe' },
  { name: 'Databricks',        ats: 'greenhouse', token: 'databricks' },
  { name: 'Robinhood',         ats: 'greenhouse', token: 'robinhood' },
  { name: 'Coinbase',          ats: 'greenhouse', token: 'coinbase' },
  { name: 'Airbnb',            ats: 'greenhouse', token: 'airbnb' },
  { name: 'Dropbox',           ats: 'greenhouse', token: 'dropbox' },
  { name: 'Reddit',            ats: 'greenhouse', token: 'reddit' },
  { name: 'Instacart',         ats: 'greenhouse', token: 'instacart' },
  { name: 'Affirm',            ats: 'greenhouse', token: 'affirm' },
  { name: 'Brex',              ats: 'greenhouse', token: 'brex' },
  { name: 'Gusto',             ats: 'greenhouse', token: 'gusto' },
  { name: 'Samsara',           ats: 'greenhouse', token: 'samsara' },
  { name: 'Wealthsimple',      ats: 'greenhouse', token: 'wealthsimple' },
  { name: 'Grammarly',         ats: 'greenhouse', token: 'grammarly' },
  { name: 'Discord',           ats: 'greenhouse', token: 'discord' },

  // ---- Lever ----
  { name: 'Netflix',           ats: 'lever',      token: 'netflix' },
  { name: 'Plaid',             ats: 'lever',      token: 'plaid' },
  { name: 'Ramp',              ats: 'lever',      token: 'ramp' },
  { name: 'Attentive',         ats: 'lever',      token: 'attentive' },
  { name: 'Verkada',           ats: 'lever',      token: 'verkada' },

  // ---- Ashby ----
  { name: 'Linear',            ats: 'ashby',      token: 'Linear' },
  { name: 'Vanta',             ats: 'ashby',      token: 'Vanta' },
  { name: 'Deel',              ats: 'ashby',      token: 'Deel' },
  { name: 'Ramp (Ashby)',      ats: 'ashby',      token: 'ramp' },
  { name: 'Clerk',             ats: 'ashby',      token: 'clerk' },

  // ---- SmartRecruiters ----
  { name: 'Visa',              ats: 'smartrecruiters', token: 'Visa' },
  { name: 'Bosch',             ats: 'smartrecruiters', token: 'BoschGroup' },
  { name: 'Publicis Groupe',   ats: 'smartrecruiters', token: 'PublicisGroupe' },
  { name: 'McDonalds',         ats: 'smartrecruiters', token: 'McDonalds' },

  // ---- Workable ----
  { name: 'Kaizen Gaming',     ats: 'workable',   token: 'kaizengaming' },

  // ---- Workday (paginated; large tenants are capped and it says so) ----
  { name: 'Citigroup',         ats: 'workday',
    token: 'citi.wd5.myworkdayjobs.com|citi|2' },
];

const argv = process.argv.slice(2);
const want = (f) => argv.includes(f);

/**
 * Does this look like the named company's own board, or a squatted demo?
 * Conservative on purpose: unsure means unverified, which contributes nothing.
 */
function looksLegitimate(name, res) {
  if (!res.ok) return false;
  const titles = res.sample_titles || [];
  if (!titles.length) return false;
  if (res.total < 3) return false;              // a real board has more than a couple
  if (titles.some((t) => /\b(sample|demo|test|dummy|example)\b/i.test(String(t)))) return false;
  return true;
}

async function probeAll() {
  const out = [];
  for (const e of REGISTRY) {
    process.stdout.write(`  ${e.name.padEnd(22)} ${e.ats.padEnd(16)}`);
    // Probe unverified first — we decide `live` from what actually came back.
    let res;
    try {
      res = await employers.fetchBoard(e.ats, e.token, { verified: false, cap: 200 });
    } catch (err) {
      res = { ok: false, status: 'none', note: err.message, sample_titles: [], total: 0 };
    }
    const legit = looksLegitimate(e.name, res);
    const status = res.status === 'closed' || res.status === 'demo'
      ? res.status
      : (legit ? 'live' : (res.ok ? 'unverified' : 'none'));
    out.push({ ...e, status, total: res.total || 0, note: res.note,
               sample: (res.sample_titles || []).slice(0, 2) });
    console.log(`${String(status).padEnd(11)} ${res.total || 0} postings` +
      (res.note && status !== 'live' ? `  — ${String(res.note).slice(0, 60)}` : ''));
  }
  return out;
}

async function seed(probed) {
  let created = 0; let updated = 0;
  for (const p of probed) {
    const existing = await models.employers.findOne({ where: { ats: p.ats, token: p.token } });
    const row = {
      name: p.name, ats: p.ats, token: p.token, status: p.status,
      note: p.status === 'live'
        ? `Verified by probe: ${p.total} postings.`
        : `${p.note || 'not reachable'}${p.sample.length ? ' Sample: ' + p.sample.join(' | ') : ''}`,
      last_fetched_at: new Date(),
    };
    if (existing) { await models.employers.update(row, { where: { id: existing.id } }); updated++; }
    else { await models.employers.create(row); created++; }
  }
  return { created, updated };
}

/** Pull postings from LIVE employers only into the shared pool. */
async function refresh() {
  const live = (await models.employers.findAll({})).filter((e) => e.status === 'live');
  console.log(`\nRefreshing ${live.length} live employers...`);
  let added = 0; let seen = 0; let skipped = 0;

  for (const e of live) {
    let res;
    try {
      res = await employers.fetchBoard(e.ats, e.token, { verified: true, cap: 200 });
    } catch (err) {
      console.log(`  ${e.name.padEnd(22)} failed: ${err.message}`);
      continue;
    }
    if (!res.ok || !res.postings.length) {
      console.log(`  ${e.name.padEnd(22)} 0 postings${res.note ? ' — ' + res.note : ''}`);
      continue;
    }
    for (const p of res.postings) {
      if (!p.title) { skipped++; continue; }
      const dedupe_key = `${e.ats}:${e.token}:${p.external_id || p.title}`.slice(0, 250);
      const existing = await models.jobs.findOne({ where: { dedupe_key } });
      if (existing) {
        await models.jobs.update({ last_seen_at: new Date() }, { where: { id: existing.id } });
        seen++;
        continue;
      }
      await models.jobs.create({
        source: e.ats,
        external_id: String(p.external_id || ''),
        employer: e.name,
        title: String(p.title).slice(0, 250),
        location: String(p.location || '').slice(0, 250),
        url: p.url || '',
        description: String(p.description || '').slice(0, 20000),
        // Compensation ONLY when the posting states it — never estimated.
        compensation: p.compensation || null,
        posted_at: p.posted_at ? new Date(p.posted_at) : null,
        dedupe_key,
      });
      added++;
    }
    await models.employers.update({ last_fetched_at: new Date() }, { where: { id: e.id } });
    console.log(`  ${e.name.padEnd(22)} ${res.postings.length} postings` +
      (res.capped ? `  (capped — ${res.note})` : ''));
  }
  return { added, seen, skipped };
}

(async () => {
  await init();
  console.log(`Store: ${require(path.join(__dirname, '..', 'src', 'models')).backend()}\n`);

  if (!want('--probe') && !want('--seed') && !want('--refresh')) {
    console.log('Usage: seed-employers.js [--probe] [--seed] [--refresh]');
    process.exit(0);
  }

  let probed = null;
  if (want('--probe') || want('--seed')) {
    console.log('Probing boards (a guessed token contributes nothing until confirmed):\n');
    probed = await probeAll();
    const by = probed.reduce((a, p) => { a[p.status] = (a[p.status] || 0) + 1; return a; }, {});
    console.log(`\n  ${JSON.stringify(by)}`);
  }

  if (want('--seed')) {
    const r = await seed(probed);
    console.log(`\nRegistered: ${r.created} new, ${r.updated} updated.`);
  }

  if (want('--refresh')) {
    const r = await refresh();
    console.log(`\nPool: +${r.added} new postings, ${r.seen} already known, ${r.skipped} skipped.`);
    const total = await models.jobs.count({});
    console.log(`ju_jobs now holds ${total} postings.`);
  }

  process.exit(0);
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
