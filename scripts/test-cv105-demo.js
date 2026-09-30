#!/usr/bin/env node
'use strict';
/**
 * Checks the cv-105 demo seed and the partner search it is shown with.
 * Read-only: touches no row. Run after scripts/seed-cv105-demo.js.
 *   node scripts/test-cv105-demo.js
 */
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const core = require('../src/routes/unified-chamber/core.js');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false,
});
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); };
const one = async (sql, r) => (await sequelize.query(sql, { replacements: r, type: QueryTypes.SELECT }))[0];
const D = '%@demo-hispanotec.test';

const layer = core.stack.find((l) => l.route && l.route.path === '/match');
const handler = layer.route.stack[layer.route.stack.length - 1].handle;

(async () => {
  const { id: c } = await one(`SELECT id FROM chambers WHERE slug = 'cv-105'`);
  const run = (body) => new Promise((r) => handler({ chamber_id: c, member: { id: 0 }, body },
    { status() { return this; }, json: r }));

  const m = await one(`SELECT COUNT(*)::int n, COUNT(DISTINCT sector)::int s, COUNT(DISTINCT country)::int k FROM members WHERE chamber_id=:c AND email LIKE :d`, { c, d: D });
  ok(m.n === 500, '500 demo members', m.n);
  ok(m.s >= 15, 'demo members span 15+ sectors', m.s);
  ok(m.k === 4, 'demo members only in the 4 requested countries', m.k);
  const bad = await one(`SELECT COUNT(*)::int n FROM members WHERE chamber_id=:c AND email LIKE :d AND country NOT IN ('Spain','Colombia','Mexico','United States')`, { c, d: D });
  ok(bad.n === 0, 'no demo member outside Spain / Colombia / Mexico / United States');
  const other = await one(`SELECT COUNT(*)::int n FROM members WHERE chamber_id<>:c AND email LIKE :d`, { c, d: D });
  ok(other.n === 0, 'no demo member in any other chamber');

  const co = await one(`SELECT COUNT(*)::int n, MIN(cardinality(capabilities))::int mincap FROM companies co JOIN members m ON m.id=co.owner_member_id WHERE co.chamber_id=:c AND m.email LIKE :d`, { c, d: D });
  ok(co.n >= 150, '150+ demo company profiles', co.n);
  ok(co.mincap >= 3, 'every demo company lists products and services', 'min ' + co.mincap);

  const pr = await one(`SELECT COUNT(*)::int n FROM projects p JOIN members m ON m.id=p.proposer_member_id WHERE p.chamber_id=:c AND m.email LIKE :d AND p.plan_status='recruiting'`, { c, d: D });
  ok(pr.n === 10, '10 demo projects in recruiting', pr.n);
  const rq = await one(`SELECT COUNT(*)::int n FROM rfqs r JOIN members m ON m.id=r.requester_member_id WHERE r.chamber_id=:c AND m.email LIKE :d AND r.status='open'`, { c, d: D });
  ok(rq.n === 15, '15 open demo RFQs', rq.n);

  const leak = await one(`SELECT COUNT(*)::int n FROM project_invitations i JOIN projects p ON p.id=i.project_id JOIN members pm ON pm.id=p.proposer_member_id
     JOIN members im ON im.id=i.member_id WHERE i.chamber_id=:c AND pm.email LIKE :d AND im.email NOT LIKE :d`, { c, d: D });
  ok(leak.n === 0, 'no real member was invited to a demo project');
  const perProj = await sequelize.query(`SELECT p.id, COUNT(i.id)::int n, COUNT(DISTINCT im.sector)::int s FROM projects p JOIN members pm ON pm.id=p.proposer_member_id
     LEFT JOIN project_invitations i ON i.project_id=p.id LEFT JOIN members im ON im.id=i.member_id
     WHERE p.chamber_id=:c AND pm.email LIKE :d GROUP BY p.id`, { replacements: { c, d: D }, type: QueryTypes.SELECT });
  ok(perProj.every((x) => x.n >= 5 && x.s >= 3), 'every demo project has 5+ matched candidates across 3+ sectors',
    perProj.map((x) => `${x.n}/${x.s}`).join(' '));
  const cyr = await one(`SELECT COUNT(*)::int n FROM projects WHERE chamber_id=:c AND title ~ '[Ѐ-ӿ]'`, { c });
  ok(cyr.n === 0, 'no project title carries Cyrillic letters');
  const pw = await one(`SELECT COUNT(DISTINCT password_hash)::int n, bool_and(password_hash LIKE '$2%') b FROM members WHERE chamber_id=:c AND email LIKE :d`, { c, d: D });
  ok(pw.b === true, 'demo accounts carry a bcrypt hash of an unknown password');

  // partner search
  const a = await run({ query_text: 'socio de logística en México', limit: 10 });
  ok(a.success && a.data.results.length > 0 && a.data.results.every((r) => r.country === 'Mexico'),
    '"logística en México" returns only members based in Mexico');
  const b = await run({ query_text: 'xyzzy quux', limit: 10 });
  ok(b.success && b.data.results.length === 0, 'a term no profile contains returns nothing, not a padded list');
  const s = await run({ query_text: 'instalación solar', sector: 'energia', limit: 50 });
  ok(s.success && s.data.results.every((r) => r.sector === 'energia'), 'the sector filter is a hard filter');
  const q = await run({ query_text: 'aguacate', limit: 3 });
  ok(q.success && q.data.results[0] && q.data.results[0].similarity_score > 0 &&
    q.data.results.every((r) => r.gini_correction === 1), 'similarity is computed, and no Gini correction is claimed');
  ok(!('bio' in (q.data.results[0] || {})), 'search results do not ship the full bio');

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
