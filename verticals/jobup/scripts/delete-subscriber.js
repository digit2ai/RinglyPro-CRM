#!/usr/bin/env node
'use strict';

/**
 * Delete a JobUp subscriber and EVERYTHING attached to them, so the funnel can
 * be walked again from scratch with the same email or web address.
 *
 * This is a hard delete on purpose — it is the reset button for testing, and a
 * half-deleted account (address still reserved, profile still present) is what
 * makes the second run fail confusingly.
 *
 *   node verticals/jobup/scripts/delete-subscriber.js --list
 *   node verticals/jobup/scripts/delete-subscriber.js <email|id>          (dry run)
 *   node verticals/jobup/scripts/delete-subscriber.js <email|id> --yes    (delete)
 *
 * Without --yes it prints what WOULD be deleted and changes nothing.
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const TENANT_TABLES = [
  'profiles', 'settings', 'job_matches', 'tailored_resumes', 'applications',
  'opportunities', 'outreach', 'sites', 'agent_runs', 'invoices',
  'notification_prefs', 'audit_log', 'page_views',
];

const seq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

(async () => {
  const args = process.argv.slice(2);
  const confirm = args.includes('--yes');
  const target = args.find((a) => !a.startsWith('--'));

  if (args.includes('--list') || !target) {
    const [rows] = await seq.query(
      'SELECT id, email, name, address, status, activation, created_at FROM ju_subscribers ORDER BY id');
    if (!rows.length) {
      console.log('No subscribers.');
    } else {
      console.log('\nid  status    activation  address                        email');
      for (const r of rows) {
        console.log(`${String(r.id).padEnd(3)} ${String(r.status).padEnd(9)} ` +
          `${String(r.activation || 'paid').padEnd(11)} ${String(r.address || '-').padEnd(30)} ${r.email}`);
      }
    }
    if (!target) console.log('\nUsage: delete-subscriber.js <email|id> [--yes]');
    process.exit(0);
  }

  const isId = /^\d+$/.test(target);
  const [subs] = await seq.query(
    `SELECT * FROM ju_subscribers WHERE ${isId ? 'id = :t' : 'LOWER(email) = LOWER(:t)'}`,
    { replacements: { t: isId ? parseInt(target, 10) : target } });

  if (!subs.length) { console.log(`No subscriber matching "${target}".`); process.exit(1); }
  if (subs.length > 1) { console.log(`Ambiguous: ${subs.length} matches. Use the id.`); process.exit(1); }

  const sub = subs[0];
  console.log(`\nSubscriber ${sub.id}  ${sub.email}`);
  console.log(`  name     ${sub.name || '-'}`);
  console.log(`  address  ${sub.address || '-'}`);
  console.log(`  status   ${sub.status} (${sub.activation || 'paid'})`);

  let total = 0;
  const counts = [];
  for (const t of TENANT_TABLES) {
    try {
      const [[c]] = await seq.query(`SELECT COUNT(*)::int AS n FROM ju_${t} WHERE tenant_id = :id`,
        { replacements: { id: sub.id } });
      if (c.n) { counts.push(`  ${t.padEnd(20)} ${c.n}`); total += c.n; }
    } catch (e) { /* table may not exist yet */ }
  }
  let teaserCount = 0;
  try {
    const [[te]] = await seq.query(
      'SELECT COUNT(*)::int AS n FROM ju_teasers WHERE LOWER(email) = LOWER(:e)',
      { replacements: { e: sub.email } });
    teaserCount = te.n;
  } catch (e) { /* table may not exist */ }

  console.log(`\nAttached rows (${total}):`);
  console.log(counts.length ? counts.join('\n') : '  none');
  console.log(`  teasers (by email)   ${teaserCount}`);

  if (!confirm) {
    console.log('\nDRY RUN - nothing deleted. Re-run with --yes to delete.');
    process.exit(0);
  }

  const tx = await seq.transaction();
  try {
    for (const t of TENANT_TABLES) {
      try {
        await seq.query(`DELETE FROM ju_${t} WHERE tenant_id = :id`,
          { replacements: { id: sub.id }, transaction: tx });
      } catch (e) { /* table may not exist */ }
    }
    await seq.query('DELETE FROM ju_teasers WHERE LOWER(email) = LOWER(:e)',
      { replacements: { e: sub.email }, transaction: tx });
    await seq.query('DELETE FROM ju_subscribers WHERE id = :id',
      { replacements: { id: sub.id }, transaction: tx });
    await tx.commit();
    console.log(`\nDeleted subscriber ${sub.id} (${sub.email}), ${total} attached rows and ${teaserCount} teaser(s).`);
    console.log(`The address ${sub.address || '(none reserved)'} is free again.`);
  } catch (e) {
    await tx.rollback();
    console.error('\nRolled back - nothing was deleted:', e.message);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
