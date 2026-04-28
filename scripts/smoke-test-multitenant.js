#!/usr/bin/env node
/**
 * PR-8 Smoke Test -- Multi-tenant SaaS end-to-end validation
 *
 * Runs against the production deployment (or override BASE_URL).
 * Validates schema, data migration, routing, signup, and tenant isolation.
 * Drops legacy prefix tables only if all 30+ checks pass.
 */
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE_URL = process.env.SMOKE_BASE_URL || 'https://www.camaravirtual.app';
const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

let passed = 0, failed = 0;
const failures = [];

function ok(label, actual, expected) {
  const match = (expected === undefined) ? !!actual : (actual === expected);
  if (match) {
    passed++;
    console.log(`  [PASS] ${label}` + (expected !== undefined ? ` = ${actual}` : ''));
  } else {
    failed++;
    const msg = `  [FAIL] ${label} -- got ${JSON.stringify(actual)}` + (expected !== undefined ? `, expected ${JSON.stringify(expected)}` : '');
    console.log(msg);
    failures.push(msg);
  }
}

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

async function main() {
  console.log('==========================================================');
  console.log('  Multi-Tenant SaaS Smoke Test');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log('==========================================================');

  // -----------------------------
  // 1. SCHEMA
  // -----------------------------
  console.log('\n[1] Schema');
  const schemaTables = await sequelize.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY(ARRAY[
      'chambers','members','projects','companies','rfqs','regions',
      'project_members','project_invitations','project_meetings','project_milestones',
      'project_tasks','project_messages','project_documents','project_signoffs','project_plan_versions',
      'rfq_responses','opportunities','transactions','trust_references','trust_scores',
      'matches','events','network_metrics'
    ])`,
    { type: QueryTypes.SELECT }
  );
  ok('chambers + 22 unified tables exist', schemaTables.length, 23);

  const seqExists = await sequelize.query(
    `SELECT 1 FROM pg_class WHERE relname = 'chamber_slug_seq' AND relkind = 'S'`,
    { type: QueryTypes.SELECT }
  );
  ok('chamber_slug_seq exists', seqExists.length, 1);

  // chamber_id NOT NULL on all 22 tenant tables
  const tenantTablesMissingChamber = await sequelize.query(
    `SELECT t.tablename FROM pg_tables t
     WHERE t.schemaname='public' AND t.tablename != 'chambers'
     AND t.tablename = ANY(ARRAY['members','projects','companies','rfqs','regions','project_members','project_invitations','project_meetings','project_milestones','project_tasks','project_messages','project_documents','project_signoffs','project_plan_versions','rfq_responses','opportunities','transactions','trust_references','trust_scores','matches','events','network_metrics'])
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name=t.tablename AND c.column_name='chamber_id' AND c.is_nullable='NO')`,
    { type: QueryTypes.SELECT }
  );
  ok('every tenant table has chamber_id NOT NULL', tenantTablesMissingChamber.length, 0);

  // -----------------------------
  // 2. DATA MIGRATION
  // -----------------------------
  console.log('\n[2] Data Migration');
  const chambers = await sequelize.query(
    `SELECT id, slug, name, primary_language, status FROM chambers WHERE id IN (1,2,3) ORDER BY id`,
    { type: QueryTypes.SELECT }
  );
  ok('cv-1 chamber row exists', chambers.find(c => c.slug === 'cv-1')?.id, 1);
  ok('cv-2 chamber row exists', chambers.find(c => c.slug === 'cv-2')?.id, 2);
  ok('cv-3 chamber row exists', chambers.find(c => c.slug === 'cv-3')?.id, 3);
  ok('cv-1 status is active', chambers.find(c => c.slug === 'cv-1')?.status, 'active');

  const cv1Members = await sequelize.query(
    `SELECT COUNT(*) AS c FROM members WHERE chamber_id = 1`,
    { type: QueryTypes.SELECT }
  );
  ok('cv-1 has 29 members migrated', parseInt(cv1Members[0].c), 29);

  const cv1Projects = await sequelize.query(
    `SELECT COUNT(*) AS c FROM projects WHERE chamber_id = 1`,
    { type: QueryTypes.SELECT }
  );
  ok('cv-1 has 11 projects migrated', parseInt(cv1Projects[0].c), 11);

  const cv1Companies = await sequelize.query(
    `SELECT COUNT(*) AS c FROM companies WHERE chamber_id = 1`,
    { type: QueryTypes.SELECT }
  );
  ok('cv-1 has 20 companies migrated', parseInt(cv1Companies[0].c), 20);

  // Tenant isolation -- cv-2 should NOT see cv-1 members
  const crossTenant = await sequelize.query(
    `SELECT COUNT(*) AS c FROM members WHERE chamber_id = 2 AND email IN (SELECT email FROM members WHERE chamber_id = 1)`,
    { type: QueryTypes.SELECT }
  );
  ok('cv-2 has no overlap with cv-1 members', parseInt(crossTenant[0].c), 0);

  // -----------------------------
  // 3. SLUG SEQUENCE
  // -----------------------------
  console.log('\n[3] Slug sequence');
  const seqState = await sequelize.query(
    `SELECT last_value, is_called FROM chamber_slug_seq`,
    { type: QueryTypes.SELECT }
  );
  ok('next signup slug suffix >= 101', parseInt(seqState[0].last_value), 100);

  // -----------------------------
  // 4. ROUTING (live HTTP)
  // -----------------------------
  console.log('\n[4] Routing (live HTTP)');
  const r1 = await fetchUrl(`${BASE_URL}/cv-1/api/public/info`);
  ok('GET /cv-1/api/public/info returns 200', r1.status, 200);
  let info1 = null;
  try { info1 = JSON.parse(r1.body); } catch (e) {}
  ok('cv-1 info has name = HispaMind / CamaraVirtual', info1?.data?.name, 'HispaMind / CamaraVirtual');
  ok('cv-1 info has member_count = 29', info1?.data?.member_count, 29);
  ok('cv-1 info has primary_language = es', info1?.data?.primary_language, 'es');

  const r2 = await fetchUrl(`${BASE_URL}/cv-999/api/public/info`);
  ok('GET /cv-999/* returns 404 (slug not found)', r2.status, 404);

  // Per-chamber landing returns HTML
  const rL = await fetchUrl(`${BASE_URL}/cv-1/`);
  ok('GET /cv-1/ returns 200 HTML', rL.status, 200);
  ok('cv-1 landing contains Spanish brand text', rL.body.includes('Iniciar Sesion') || rL.body.includes('CamaraVirtual'), true);

  // Legacy redirect /chamber/hispamind/ → /cv-1/
  const rR = await fetchUrl(`${BASE_URL}/chamber/hispamind/`);
  ok('legacy /chamber/hispamind/ returns 301 redirect', rR.status === 301 || rR.status === 302, true);
  ok('redirect target is /cv-1/', (rR.headers.location || '').endsWith('/cv-1/'), true);

  // -----------------------------
  // 5. SIGNUP HEALTH
  // -----------------------------
  console.log('\n[5] Stripe signup health');
  const rH = await fetchUrl(`${BASE_URL}/api/chambers/signup/health`);
  ok('signup health endpoint reachable', rH.status, 200);
  let sh = null;
  try { sh = JSON.parse(rH.body); } catch (e) {}
  ok('pricing.setup_fee_cents = 15000', sh?.pricing?.setup_fee_cents, 15000);
  ok('pricing.monthly_amount_cents = 9900', sh?.pricing?.monthly_amount_cents, 9900);

  // -----------------------------
  // 6. SUMMARY
  // -----------------------------
  console.log('\n==========================================================');
  console.log(`  RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================================');
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(f));
    console.log('\nLegacy prefix tables NOT dropped. Fix failures and re-run.');
    await sequelize.close();
    process.exit(1);
  }

  // -----------------------------
  // 7. DROP LEGACY TABLES (only if all passed)
  // -----------------------------
  if (process.env.DROP_LEGACY === 'true') {
    console.log('\n[7] Dropping legacy prefix tables (DROP_LEGACY=true)...');
    const legacyTables = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public'
       AND (tablename LIKE 'hispamind\\_%' OR tablename LIKE 'pacccfl\\_%' OR tablename LIKE 'pcci\\_%')`,
      { type: QueryTypes.SELECT }
    );
    for (const { tablename } of legacyTables) {
      await sequelize.query(`DROP TABLE IF EXISTS ${tablename} CASCADE`);
      console.log(`  Dropped ${tablename}`);
    }
    console.log(`  Total dropped: ${legacyTables.length}`);
  } else {
    console.log('\n[7] Skipping legacy table drop (set DROP_LEGACY=true to actually drop).');
  }

  await sequelize.close();
  process.exit(0);
}

main().catch(e => {
  console.error('[smoke] FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
