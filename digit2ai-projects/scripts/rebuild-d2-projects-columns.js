#!/usr/bin/env node
'use strict';

// =============================================================================
// Rebuild d2_projects to reclaim its Postgres column slots.
//
// WHY
// A table can hold at most 1600 columns (MaxHeapAttributeNumber). DROP COLUMN
// does NOT free the slot: Postgres only flips pg_attribute.attisdropped, because
// on-disk rows are laid out by that numbering. So the ceiling counts every column
// the table has EVER had.
//
// d2_projects sits at 1600/1600 — 85 live, ~1515 dropped, burned by an old
// sequelize.sync({ alter: true }) that dropped and re-added columns on every boot.
// The code is alter:false today, so nothing new is being burned, but ALTER TABLE
// d2_projects ADD COLUMN now fails unconditionally and will keep failing.
//
// VACUUM FULL / CLUSTER / REINDEX do NOT help — they rewrite the data but keep the
// same relation, so the same pg_attribute rows survive. Fresh attnums only come
// from a brand-new relation. Hence: build a new table, copy the rows, swap names,
// reattach everything that pointed at the old one.
//
// SAFETY
//  - A full copy is written to d2_projects_bak_<YYYYMMDD> BEFORE anything changes,
//    outside the transaction. That is the undo.
//  - The swap runs in ONE transaction behind an ACCESS EXCLUSIVE lock. It either
//    lands completely or rolls back to exactly the current state.
//  - Verifies row count and a content checksum before and after, and refuses to
//    commit if they disagree.
//  - ~119 rows / 3.5 MB, so the lock is held for milliseconds. No downtime window
//    is needed, though running it at a quiet moment costs nothing.
//
// USAGE
//   node digit2ai-projects/scripts/rebuild-d2-projects-columns.js --dry-run
//   node digit2ai-projects/scripts/rebuild-d2-projects-columns.js --go
//
// Reads CRM_DATABASE_URL || DATABASE_URL from .env at the repo root.
// =============================================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Sequelize } = require('sequelize');

const GO = process.argv.includes('--go');
const TABLE = 'd2_projects';
const BACKUP = 'd2_projects_bak_' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('No CRM_DATABASE_URL / DATABASE_URL in the environment.'); process.exit(1); }

const seq = new Sequelize(url, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});
const q = async (sql, t) => { const [r] = await seq.query(sql, t ? { transaction: t } : undefined); return r; };
const one = async (sql, t) => (await q(sql, t))[0];

(async () => {
  await seq.authenticate();

  // ---- what is attached to the table right now -------------------------------
  const inbound = await q(`SELECT conname, conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
                             FROM pg_constraint WHERE contype='f' AND confrelid='${TABLE}'::regclass`);
  const outbound = await q(`SELECT conname, pg_get_constraintdef(oid) AS def
                              FROM pg_constraint WHERE contype='f' AND conrelid='${TABLE}'::regclass`);
  const idx = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='${TABLE}'`);
  const trg = await q(`SELECT tgname FROM pg_trigger WHERE tgrelid='${TABLE}'::regclass AND NOT tgisinternal`);
  const views = await q(`SELECT DISTINCT dv.relname AS view FROM pg_depend d
                           JOIN pg_rewrite r ON r.oid = d.objid
                           JOIN pg_class dv ON dv.oid = r.ev_class
                          WHERE d.refobjid='${TABLE}'::regclass AND dv.relkind='v'`);

  const slots = await one(`SELECT count(*)::int AS slots,
                                  count(*) FILTER (WHERE attisdropped)::int AS dropped,
                                  count(*) FILTER (WHERE NOT attisdropped)::int AS live
                             FROM pg_attribute WHERE attrelid='${TABLE}'::regclass AND attnum > 0`);
  const rows = (await one(`SELECT count(*)::int AS n FROM ${TABLE}`)).n;
  const maxid = (await one(`SELECT COALESCE(max(id),0)::int AS n FROM ${TABLE}`)).n;
  const CKSUM = `SELECT md5(string_agg(id::text || coalesce(name,'') || coalesce(submitter_email,''), '|' ORDER BY id)) AS h FROM `;
  const before = (await one(CKSUM + TABLE)).h;

  console.log('--- current state ---');
  console.log(`slots ${slots.slots}/1600  (live ${slots.live}, dropped ${slots.dropped})  headroom ${1600 - slots.slots}`);
  console.log(`rows ${rows}  max(id) ${maxid}`);
  console.log(`indexes ${idx.length}  inbound FKs ${inbound.length}  outbound FKs ${outbound.length}  triggers ${trg.length}  views ${views.length}`);

  if (trg.length) { console.error('\nRefusing: the table has triggers this script does not recreate:', trg.map(t => t.tgname).join(', ')); process.exit(1); }
  if (views.length) { console.error('\nRefusing: views depend on the table and would be dropped:', views.map(v => v.view).join(', ')); process.exit(1); }

  if (!GO) {
    console.log('\n--- dry run, nothing changed. Re-run with --go to perform the rebuild. ---');
    console.log(`It will: back up to ${BACKUP}, create a fresh relation via LIKE ... INCLUDING ALL,`);
    console.log(`copy ${rows} rows, drop the old table CASCADE, rename, restore the sequence,`);
    console.log(`${idx.length} index names, ${outbound.length} outbound and ${inbound.length} inbound foreign keys.`);
    process.exit(0);
  }

  // ---- the undo, written before anything is touched --------------------------
  await q(`DROP TABLE IF EXISTS ${BACKUP}`);
  await q(`CREATE TABLE ${BACKUP} AS SELECT * FROM ${TABLE}`);
  const bak = (await one(`SELECT count(*)::int AS n FROM ${BACKUP}`)).n;
  if (bak !== rows) { console.error(`Refusing: backup has ${bak} rows, table has ${rows}.`); process.exit(1); }
  console.log(`\nbackup ${BACKUP}: ${bak} rows`);

  const t = await seq.transaction();
  try {
    await q(`LOCK TABLE ${TABLE} IN ACCESS EXCLUSIVE MODE`, t);

    // A brand-new relation is the only way to get fresh attnums. INCLUDING ALL
    // carries columns, defaults, check constraints, indexes, storage and comments
    // across — everything except foreign keys, recreated by hand below.
    await q(`CREATE TABLE ${TABLE}_rebuild (LIKE ${TABLE} INCLUDING ALL)`, t);
    await q(`INSERT INTO ${TABLE}_rebuild SELECT * FROM ${TABLE}`, t);

    const copied = (await one(`SELECT count(*)::int AS n FROM ${TABLE}_rebuild`, t)).n;
    if (copied !== rows) throw new Error(`copied ${copied} rows, expected ${rows}`);

    // Detach the sequence first, or DROP TABLE takes it — and the id default — along.
    await q(`ALTER SEQUENCE ${TABLE}_id_seq OWNED BY NONE`, t);

    // CASCADE removes the inbound FK constraints; they are restored further down.
    await q(`DROP TABLE ${TABLE} CASCADE`, t);
    await q(`ALTER TABLE ${TABLE}_rebuild RENAME TO ${TABLE}`, t);
    await q(`ALTER SEQUENCE ${TABLE}_id_seq OWNED BY ${TABLE}.id`, t);
    await q(`ALTER TABLE ${TABLE} ALTER COLUMN id SET DEFAULT nextval('${TABLE}_id_seq'::regclass)`, t);
    await q(`SELECT setval('${TABLE}_id_seq', GREATEST(${maxid}, 1), true)`, t);

    // LIKE cloned the indexes under generated names; put the real names back.
    let present = await q(`SELECT indexname FROM pg_indexes WHERE tablename='${TABLE}'`, t);
    const spare = present.map(p => p.indexname).filter(n => n.startsWith(`${TABLE}_rebuild_`));
    for (const want of idx) {
      if (present.some(p => p.indexname === want.indexname)) continue;
      const from = spare.shift();
      if (from) await q(`ALTER INDEX "${from}" RENAME TO "${want.indexname}"`, t);
    }
    // Anything the rename pass could not account for is rebuilt from its own DDL.
    present = await q(`SELECT indexname FROM pg_indexes WHERE tablename='${TABLE}'`, t);
    for (const want of idx) {
      if (!present.some(p => p.indexname === want.indexname)) await q(want.indexdef, t);
    }

    for (const f of outbound) await q(`ALTER TABLE ${TABLE} ADD CONSTRAINT "${f.conname}" ${f.def}`, t);
    for (const f of inbound) await q(`ALTER TABLE ${f.tbl} ADD CONSTRAINT "${f.conname}" ${f.def}`, t);

    const after = (await one(CKSUM + TABLE, t)).h;
    if (after !== before) throw new Error('content checksum changed — rolling back');

    await t.commit();
    console.log('swap committed');
  } catch (e) {
    await t.rollback();
    console.error('ROLLED BACK, nothing changed:', e.message);
    process.exit(1);
  }

  // ---- verify ----------------------------------------------------------------
  const now = await one(`SELECT count(*)::int AS slots,
                                count(*) FILTER (WHERE attisdropped)::int AS dropped,
                                count(*) FILTER (WHERE NOT attisdropped)::int AS live
                           FROM pg_attribute WHERE attrelid='${TABLE}'::regclass AND attnum > 0`);
  const finalRows = (await one(`SELECT count(*)::int AS n FROM ${TABLE}`)).n;
  const finalIdx = (await one(`SELECT count(*)::int AS n FROM pg_indexes WHERE tablename='${TABLE}'`)).n;
  const finalIn = (await one(`SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND confrelid='${TABLE}'::regclass`)).n;
  const finalOut = (await one(`SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND conrelid='${TABLE}'::regclass`)).n;
  const finalChk = (await one(`SELECT count(*)::int AS n FROM pg_constraint WHERE contype='c' AND conrelid='${TABLE}'::regclass`)).n;

  console.log('\n--- after ---');
  console.log(`slots ${now.slots}/1600  (live ${now.live}, dropped ${now.dropped})  headroom ${1600 - now.slots}`);
  console.log(`rows ${finalRows}/${rows}   checksum preserved`);
  console.log(`indexes ${finalIdx}/${idx.length}  inbound FKs ${finalIn}/${inbound.length}  outbound FKs ${finalOut}/${outbound.length}  checks ${finalChk}`);

  // The thing that started this: can the table take a column again?
  await q(`ALTER TABLE ${TABLE} ADD COLUMN _slot_probe INTEGER`);
  await q(`ALTER TABLE ${TABLE} DROP COLUMN _slot_probe`);
  console.log('ADD COLUMN works again: yes');

  const ok = finalRows === rows && finalIdx === idx.length && finalIn === inbound.length && finalOut === outbound.length;
  console.log(ok ? `\nPASS. Keep ${BACKUP} for a few days, then: DROP TABLE ${BACKUP};`
                 : `\nCHECK THE COUNTS ABOVE before dropping ${BACKUP}.`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
