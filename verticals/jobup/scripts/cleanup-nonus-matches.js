'use strict';
/* One-time cleanup: remove Hunter job matches that are NOT US-based, or whose
 * posting has no openable URL, from EVERY profile. Manual/inbound entries
 * (job_id NULL — the subscriber's own) are never touched. */
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const geo = require('../src/services/geo');

const DRY = process.env.APPLY !== '1';
const POLICY = { allowed_countries: ['US'], us_only: true, allowed_states: [] };
const validUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim());

const s = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false,
});

(async () => {
  // Every hunter/found match + its pool job (left join so orphans surface too).
  const rows = await s.query(
    `SELECT m.id, m.tenant_id, m.score, j.location, j.url
       FROM ju_job_matches m LEFT JOIN ju_jobs j ON j.id = m.job_id
      WHERE (m.source = 'hunter' OR m.source IS NULL) AND m.job_id IS NOT NULL`,
    { type: QueryTypes.SELECT });

  const del = { nonus: [], nourl: [], orphan: [] };
  for (const r of rows) {
    if (r.location == null && r.url == null) { del.orphan.push(r.id); continue; } // job gone
    if (!validUrl(r.url)) { del.nourl.push(r.id); continue; }
    const v = geo.evaluate(r.location || '', POLICY);
    if (v.verdict === geo.VERDICT.BLOCK) del.nonus.push(r.id);
  }
  const ids = [...del.nonus, ...del.nourl, ...del.orphan];
  const affected = await s.query(
    `SELECT count(DISTINCT tenant_id)::int n FROM ju_job_matches WHERE id IN (:ids)`,
    { replacements: { ids: ids.length ? ids : [-1] }, type: QueryTypes.SELECT });

  console.log('hunter matches scanned:', rows.length);
  console.log('  non-US            :', del.nonus.length);
  console.log('  no openable URL   :', del.nourl.length);
  console.log('  orphan (job gone) :', del.orphan.length);
  console.log('  TOTAL to remove   :', ids.length, 'across', affected[0].n, 'profiles');

  if (DRY) { console.log('\nDRY RUN — set APPLY=1 to delete. Nothing changed.'); process.exit(0); }
  if (ids.length) {
    // Delete in chunks to keep the statement small.
    let removed = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const r = await s.query(`DELETE FROM ju_job_matches WHERE id IN (:ids)`,
        { replacements: { ids: chunk }, type: QueryTypes.DELETE });
      removed += chunk.length;
    }
    console.log('\nDELETED', removed, 'matches.');
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
