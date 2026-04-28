#!/usr/bin/env node
/**
 * PR-2: Migrate hispamind/pacccfl/pcci data into unified tables.
 *
 * Strategy:
 *   - chambers row #1: cv-1 = hispamind   (offset 10000)
 *   - chambers row #2: cv-2 = pacccfl     (offset 20000)
 *   - chambers row #3: cv-3 = pcci        (offset 30000)
 *
 * Every old id in source becomes (chamber_offset + old_id) in unified.
 * FKs auto-resolve because both parent and child use the same offset
 * within their chamber.
 */
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

// Order matters for FK constraint deferral; we'll disable FKs during migration via
// session_replication_role anyway, but follow logical order for sanity.
const TABLE_ORDER = [
  'regions',
  'members',
  'companies',
  'projects',
  'project_members',
  'project_invitations',
  'project_milestones',
  'project_tasks',
  'project_messages',
  'project_documents',
  'project_meetings',
  'project_signoffs',
  'project_plan_versions',
  'rfqs',
  'rfq_responses',
  'opportunities',
  'transactions',
  'trust_references',
  'trust_scores',
  'matches',
  'events',
  'network_metrics'
];

// Columns that are FK ids referencing rows in source-prefix tables.
// During migration we ADD the chamber_offset to these so the FK resolves
// to the new unified row.
const FK_COLUMNS = {
  members: ['region_id'],
  companies: ['owner_member_id'],
  projects: ['proposer_member_id'],
  project_members: ['project_id', 'member_id', 'invitation_id'],
  project_invitations: ['project_id', 'member_id', 'invited_by_member_id'],
  project_milestones: ['project_id', 'created_by_member_id'],
  project_tasks: ['project_id', 'milestone_id', 'assignee_member_id', 'created_by_member_id'],
  project_messages: ['project_id', 'member_id'],
  project_documents: ['project_id', 'uploaded_by_member_id'],
  project_meetings: ['project_id'],  // attendees is array, handled separately
  project_signoffs: ['project_id', 'member_id'],
  project_plan_versions: ['project_id', 'created_by_member_id'],
  rfqs: ['requester_member_id', 'company_id', 'awarded_response_id'],
  rfq_responses: ['rfq_id', 'responder_member_id', 'company_id'],
  opportunities: ['posted_by_member_id'],
  transactions: ['member_id', 'project_id'],
  trust_references: ['from_member_id', 'to_member_id'],
  trust_scores: ['member_id'],
  matches: ['member_id', 'matched_member_id'],
  events: [],
  network_metrics: []
};

// Array columns of member_ids -- need element-wise offset
const FK_ARRAY_COLUMNS = {
  project_meetings: ['attendees'],
  project_milestones: ['lead_member_ids']
};

async function getCols(sequelize, table) {
  const cols = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name = :t
     ORDER BY ordinal_position`,
    { replacements: { t: table }, type: QueryTypes.SELECT }
  );
  return cols.map(c => c.column_name);
}

async function migrateChamber({ chamber_id, source_prefix, offset }) {
  console.log(`\n[PR-2] === Migrating ${source_prefix} → chamber_id=${chamber_id} (offset=${offset}) ===`);
  for (const table of TABLE_ORDER) {
    const sourceTable = `${source_prefix}_${table}`;
    // Skip tables that don't exist in source
    const [exists] = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = :t`,
      { replacements: { t: sourceTable }, type: QueryTypes.SELECT }
    );
    if (!exists) {
      console.log(`  [SKIP] ${sourceTable} -- source missing`);
      continue;
    }

    // Skip if already migrated for this chamber (idempotent)
    const [{ count: existing }] = await sequelize.query(
      `SELECT COUNT(*) as count FROM ${table} WHERE chamber_id = :c`,
      { replacements: { c: chamber_id }, type: QueryTypes.SELECT }
    );
    if (parseInt(existing) > 0) {
      console.log(`  [SKIP] ${table} -- already has ${existing} rows for chamber_id=${chamber_id}`);
      continue;
    }

    const sourceCols = await getCols(sequelize, sourceTable);
    const targetCols = await getCols(sequelize, table);

    // Common columns (intersection, excluding chamber_id which we add)
    const commonCols = sourceCols.filter(c => targetCols.includes(c));

    // Build SELECT expression -- offset id and FK columns
    const fkCols = FK_COLUMNS[table] || [];
    const fkArrayCols = FK_ARRAY_COLUMNS[table] || [];
    const selectParts = commonCols.map(col => {
      if (col === 'id') return `(id + ${offset}) AS id`;
      if (fkCols.includes(col)) return `CASE WHEN ${col} IS NOT NULL THEN ${col} + ${offset} ELSE NULL END AS ${col}`;
      if (fkArrayCols.includes(col)) {
        // Apply offset to each element of the array
        return `CASE WHEN ${col} IS NOT NULL THEN ARRAY(SELECT x + ${offset} FROM unnest(${col}) AS x) ELSE NULL END AS ${col}`;
      }
      return col;
    });

    const insertCols = ['chamber_id', ...commonCols].join(', ');
    const sql = `INSERT INTO ${table} (${insertCols})
                 SELECT ${chamber_id} AS chamber_id, ${selectParts.join(', ')}
                 FROM ${sourceTable}`;

    try {
      const [, meta] = await sequelize.query(sql);
      const rowCount = (await sequelize.query(`SELECT COUNT(*) as c FROM ${table} WHERE chamber_id = :ch`, { replacements: { ch: chamber_id }, type: QueryTypes.SELECT }))[0].c;
      console.log(`  [OK] ${table}: ${rowCount} rows migrated`);
    } catch (e) {
      console.error(`  [FAIL] ${table}: ${e.message}`);
      console.error('    SQL:', sql.substring(0, 300));
      // Continue with other tables; report at end
    }
  }
}

async function main() {
  await sequelize.authenticate();
  console.log('[PR-2] Connected. (No FK between unified tenant tables yet, only chamber_id FKs to chambers)');

  // 1. Insert the 3 chamber rows (idempotent via slug uniqueness)
  const chamberData = [
    { id: 1, slug: 'cv-1', name: 'HispaMind / CamaraVirtual', source: 'hispamind', email: 'mstagg@digit2ai.com' },
    { id: 2, slug: 'cv-2', name: 'PACC-CFL', source: 'pacccfl', email: 'admin@pacccfl.org' },
    { id: 3, slug: 'cv-3', name: 'Philippine Chamber of Commerce International', source: 'pcci', email: 'admin@pcci.org' }
  ];
  for (const ch of chamberData) {
    await sequelize.query(`
      INSERT INTO chambers (id, slug, name, brand_domain, primary_language, contact_email, status, setup_fee_paid_at, subscription_status, created_at, updated_at)
      VALUES (:id, :slug, :name, 'camaravirtual.app', 'es', :email, 'active', NOW(), 'active', NOW(), NOW())
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
    `, { replacements: ch });
    console.log(`[PR-2] chambers row: ${ch.slug} (id=${ch.id})`);
  }
  // Bump the chambers id sequence past the manually-inserted IDs
  await sequelize.query(`SELECT setval(pg_get_serial_sequence('chambers', 'id'), 100, true)`);
  // Reset slug sequence to start at 101 (in case it was advanced)
  await sequelize.query(`SELECT setval('chamber_slug_seq', 100, true)`);

  // 2. Migrate data per chamber
  await migrateChamber({ chamber_id: 1, source_prefix: 'hispamind', offset: 10000 });
  await migrateChamber({ chamber_id: 2, source_prefix: 'pacccfl', offset: 20000 });
  await migrateChamber({ chamber_id: 3, source_prefix: 'pcci', offset: 30000 });

  // 3. Reset each unified table's sequence to MAX(id)+1
  console.log('\n[PR-2] Resetting sequences...');
  for (const table of TABLE_ORDER) {
    try {
      const [r] = await sequelize.query(`SELECT MAX(id) as max FROM ${table}`, { type: QueryTypes.SELECT });
      const max = parseInt(r.max) || 0;
      if (max > 0) {
        await sequelize.query(`SELECT setval(pg_get_serial_sequence(:t, 'id'), :v, true)`, { replacements: { t: table, v: max } });
        console.log(`  [SEQ] ${table}: setval(${max})`);
      }
    } catch (e) {
      console.warn(`  [SEQ] ${table}: ${e.message}`);
    }
  }

  // 4. Set chambers.owner_member_id to the superadmin in each chamber
  console.log('\n[PR-2] Linking chamber owners...');
  for (const ch of chamberData) {
    const [owner] = await sequelize.query(`
      SELECT id FROM members WHERE chamber_id = :c AND access_level = 'superadmin' ORDER BY id LIMIT 1
    `, { replacements: { c: ch.id }, type: QueryTypes.SELECT });
    if (owner) {
      await sequelize.query(`UPDATE chambers SET owner_member_id = :m WHERE id = :c`, { replacements: { m: owner.id, c: ch.id } });
      console.log(`  [OWNER] chamber ${ch.slug} → member ${owner.id}`);
    } else {
      console.warn(`  [OWNER] chamber ${ch.slug} → no superadmin found`);
    }
  }

  // 5. Verify counts
  console.log('\n[PR-2] === VERIFICATION ===');
  for (const ch of chamberData) {
    const tablesToVerify = ['members', 'projects', 'companies', 'rfqs', 'project_members', 'project_invitations'];
    const counts = [];
    for (const t of tablesToVerify) {
      try {
        const [src] = await sequelize.query(`SELECT COUNT(*) as c FROM ${ch.source}_${t}`, { type: QueryTypes.SELECT });
        const [dst] = await sequelize.query(`SELECT COUNT(*) as c FROM ${t} WHERE chamber_id = :c`, { replacements: { c: ch.id }, type: QueryTypes.SELECT });
        const status = src.c === dst.c ? 'OK' : 'MISMATCH';
        counts.push(`${t}: ${src.c}→${dst.c} [${status}]`);
      } catch (e) {
        counts.push(`${t}: ERR ${e.message}`);
      }
    }
    console.log(`  ${ch.slug}: ${counts.join(' | ')}`);
  }

  console.log('\n[PR-2] DONE.');
  await sequelize.close();
}

main().catch(e => {
  console.error('[PR-2] FATAL:', e.message);
  process.exit(1);
});
