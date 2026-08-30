/* ─────────────────────────────────────────────────────────────────────────
   Build the simulator's fixtures BY DRIVING THE REAL API.

   The simulator runs the product's own renderer (public/dashboard-ui.js). For
   that to mean anything, the data it renders has to be shaped exactly like the
   API's, and the scores in it have to come from the matching engine — a demo
   quoting invented numbers is the failure this vertical exists to prevent.

   So nothing here is transcribed. This script boots the router, signs up three
   sample accounts, posts sample positions, and then GETs every endpoint the
   renderer calls, writing the responses out verbatim. If a response shape ever
   changes, re-running this picks it up; hand-written fixtures would not.

   Everything it creates is deleted afterwards, including on failure. The
   sample people and hospitals are named "Sample …" for the same reason the
   seed script does it: so a fixture can never be quoted back as a real client.

     node verticals/jobmd/scripts/build-simulator-fixtures.js

   Writes: verticals/jobmd/public/simulator-fixtures.js
   ───────────────────────────────────────────────────────────────────────── */
require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'simulator-fixtures.js');
const STAMP = 'sim_' + Date.now();

// The sample cast. Fictional on purpose, and labelled.
const DOCTOR = {
  name: 'Dr Elena Marsh', email: STAMP + '.marsh@example.org',
  password: 'SimulatorFixture!7', role: 'physician'
};
const HOSPITAL = {
  name: 'Sample Regional Medical Center', email: STAMP + '.regional@example.org',
  password: 'SimulatorFixture!7', role: 'hospital',
  org_name: 'Sample Regional Medical Center', org_type: 'hospital', city: 'Tampa', state: 'FL'
};
const RECRUITER = {
  name: 'Dan Whitfield', email: STAMP + '.recruiter@example.org',
  password: 'SimulatorFixture!7', role: 'recruiter'
};

// Her Talent Intelligence Record. Every value here is one a real physician
// would type; the SCORES that come out of it are the engine's.
const PROFILE = {
  specialty: 'Robotic Surgery', subspecialty: 'Minimally invasive general surgery',
  board_certified: true, years_experience: 11,
  procedure_expertise: ['robotic cholecystectomy', 'robotic hernia repair', 'robotic colectomy'],
  robotic_platforms: ['da Vinci Xi'], robotic_years: 6, robotic_cases_annual: 240,
  robotics_program_leadership: true,
  licenses: ['FL', 'GA'], geographic_preferences: ['FL'], relocation_willing: false,
  // Inside the AMN band for general surgery (low $245K / avg $419K / high
  // $517K). An earlier $600,000 sat above every corrected posting and the
  // engine — correctly — marked her top match down for it.
  compensation_expectation: 470000, employment_preference: 'employed',
  call_tolerance: 'light', available_from: '2026-10-01', publications: 4,
  fellowship: 'Minimally Invasive Surgery, Sample University', residency: 'General Surgery, Sample University'
};

// NO POSITIONS ARE CREATED HERE. The seed (scripts/seed.js) already carries
// twelve across five sample organisations, with a deliberate spread of
// specialties, states and call schedules. An earlier version posted its own
// four on top of those and the demo showed TWO "Robotic General Surgeon" cards
// at the same hospital at different salaries — visible only in the render.
//
// Instead the sample hospital account is attached to the seeded organisation,
// which is also more honest about what a hospital sees: its own postings.
const HOSPITAL_ORG = 'Sample Regional Medical Center';

function main() {
  const app = express();
  const jobmd = require('../src/index');
  const created = { accounts: [], orgs: [], positions: [] };

  return jobmd.init().then(function () {
    app.use('/jobmd', jobmd);
    const server = http.createServer(app);
    return new Promise(function (r) { server.listen(0, function () { r(server); }); });
  }).then(function (server) {
    const port = server.address().port;
    const jar = {};

    function req(who, method, p, body) {
      return new Promise(function (resolve, reject) {
        const data = body ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (jar[who]) headers.Cookie = jar[who];
        if (data) headers['Content-Length'] = Buffer.byteLength(data);
        const r = http.request({ host: '127.0.0.1', port, method,
          path: '/jobmd/api/v1' + p, headers }, function (res) {
          let b = ''; res.on('data', function (c) { b += c; });
          res.on('end', function () {
            const sc = res.headers['set-cookie'];
            if (sc) jar[who] = sc.map(function (c) { return c.split(';')[0]; }).join('; ');
            let j = null; try { j = JSON.parse(b); } catch (e) { /* non-JSON */ }
            if (res.statusCode >= 400) {
              return reject(new Error(method + ' ' + p + ' -> ' + res.statusCode + ' ' +
                ((j && j.error) || b.slice(0, 160))));
            }
            resolve(j);
          });
        });
        r.on('error', reject); if (data) r.write(data); r.end();
      });
    }

    const F = {};
    let posIds = [], topMatchId = null, pipelineId = null, seededOrgId = null;

    return Promise.resolve()
      // ── the three accounts ────────────────────────────────────────────
      .then(function () { return req('doc', 'POST', '/auth/signup', DOCTOR); })
      .then(function (r) { created.accounts.push(r.account.id); })
      .then(function () { return req('hosp', 'POST', '/auth/signup', HOSPITAL); })
      .then(function (r) {
        created.accounts.push(r.account.id);
        // Signing up as a hospital creates an organisation. We immediately
        // reattach the account to the SEEDED one, so that fresh org is an
        // orphan and has to be swept — an earlier run left one behind.
        created.orgs.push(r.account.org_id);
      })
      .then(function () { return req('rec', 'POST', '/auth/signup', RECRUITER); })
      .then(function (r) { created.accounts.push(r.account.id); })

      // ── she fills her record ──────────────────────────────────────────
      .then(function () { return req('doc', 'PUT', '/profile', PROFILE); })

      // ── the hospital takes over the seeded organisation ──────────────
      .then(function () {
        const M = require('../src/models');
        return M.Organization.findOne({ where: { name: HOSPITAL_ORG } }).then(function (org) {
          if (!org) throw new Error('seed missing: run scripts/seed.js first');
          seededOrgId = org.id; seededOrgIdRef.v = org.id;
          return M.Account.update({ org_id: org.id }, { where: { email: HOSPITAL.email } });
        }).then(function () {
          return M.Position.findAll({ where: { org_id: seededOrgId }, attributes: ['id'] });
        }).then(function (rows) { posIds = rows.map(function (r) { return r.id; }); });
      })

      // ── PHYSICIAN dashboard ───────────────────────────────────────────
      .then(function () { return req('doc', 'GET', '/me'); })
      .then(function (r) { F['physician:/me'] = r; })
      .then(function () { return req('doc', 'GET', '/reference'); })
      .then(function (r) { F['physician:/reference'] = r; F['hospital:/reference'] = r;
                           F['recruiter:/reference'] = r; })
      .then(function () { return req('doc', 'GET', '/profile'); })
      .then(function (r) { F['physician:/profile'] = r; })
      .then(function () { return req('doc', 'GET', '/matches'); })
      .then(function (r) {
        F['physician:/matches'] = r;
        if (r.items && r.items.length) topMatchId = r.items[0].position.id;
      })
      // she says she is interested in the best one
      .then(function () { return req('doc', 'POST', '/apply', { position_id: topMatchId }); })
      .then(function () { return req('doc', 'GET', '/matches'); })
      .then(function (r) { F['physician:/matches:applied'] = r; })

      // ── HOSPITAL dashboard ────────────────────────────────────────────
      .then(function () { return req('hosp', 'GET', '/me'); })
      .then(function (r) { F['hospital:/me'] = r; })
      .then(function () { return req('hosp', 'GET', '/positions'); })
      .then(function (r) { F['hospital:/positions'] = r; })
      .then(function () { return req('hosp', 'GET', '/pipeline'); })
      .then(function (r) { F['hospital:/pipeline'] = r;
        if (r.items && r.items.length) pipelineId = r.items[0].id; })
      .then(function () {
        return posIds.reduce(function (chain, id) {
          return chain.then(function () {
            return req('hosp', 'GET', '/positions/' + id + '/candidates')
              .then(function (r) { F['hospital:/positions/' + id + '/candidates'] = r; });
          });
        }, Promise.resolve());
      })

      // ── RECRUITER dashboard ───────────────────────────────────────────
      .then(function () { return req('rec', 'GET', '/me'); })
      .then(function (r) { F['recruiter:/me'] = r; })
      .then(function () { return req('rec', 'GET', '/organizations'); })
      .then(function (r) { F['recruiter:/organizations'] = r; })
      .then(function () { return req('rec', 'GET', '/pipeline'); })
      .then(function (r) { F['recruiter:/pipeline'] = r; })
      .then(function () { return req('rec', 'GET', '/positions'); })
      .then(function (r) { F['recruiter:/positions'] = r; })
      .then(function () {
        return posIds.reduce(function (chain, id) {
          return chain.then(function () {
            return req('rec', 'GET', '/positions/' + id + '/candidates')
              .then(function (r) { F['recruiter:/positions/' + id + '/candidates'] = r; });
          });
        }, Promise.resolve());
      })
      // The Copilot, including a query with a term it must report as ignored.
      .then(function () {
        const qs = ['robotic surgeons in Florida on da Vinci',
                    'urologists in the southeast',
                    'board certified surgeons with 10 years experience'];
        return qs.reduce(function (chain, q) {
          return chain.then(function () {
            return req('rec', 'POST', '/search', { q: q })
              .then(function (r) { F['recruiter:POST:/search:' + q] = r; });
          });
        }, Promise.resolve());
      })
      // The agents. Drafts only — nothing here sends anything.
      .then(function () {
        if (!pipelineId) return null;
        return req('rec', 'POST', '/agents/outreach/' + pipelineId)
          .then(function (r) { F['recruiter:POST:/agents/outreach/' + pipelineId] = r; });
      })
      .then(function () {
        if (!pipelineId) return null;
        return req('rec', 'POST', '/agents/schedule/' + pipelineId)
          .then(function (r) { F['recruiter:POST:/agents/schedule/' + pipelineId] = r; });
      })
      .then(function () { return req('rec', 'GET', '/agents/followup'); })
      .then(function (r) { F['recruiter:/agents/followup'] = r; })
      .then(function () { return req('rec', 'GET', '/agents/actions'); })
      .then(function (r) { F['recruiter:/agents/actions'] = r; })

      .then(function () {
        write(F, { posIds: posIds, pipelineId: pipelineId, topMatchId: topMatchId });
        return cleanup(created, posIds).then(function () { server.close(); });
      })
      .catch(function (e) {
        console.error('FAILED:', e.message);
        return cleanup(created, posIds).then(function () {
          server.close(); process.exitCode = 1;
        });
      });
  });
}

// Delete everything this script created, so a fixture build never leaves rows
// behind in the tenant the real app serves.
// Delete everything this script created, so a fixture build never leaves rows
// behind in the tenant the real app serves. Keyed off the PHYSICIAN as well as
// the positions: her matches and pipeline rows point at the SEEDED positions
// too, and an earlier version that only swept by position_id left those behind.
const seededOrgIdRef = { v: null };

function cleanup(created, posIds) {
  const M = require('../src/models');
  const { Op } = require('sequelize');
  const ids = created.accounts;
  if (!ids.length) return Promise.resolve();
  let docIds = [], orgIds = [], pipeIds = [];
  return M.Physician.findAll({ where: { account_id: ids }, attributes: ['id'] })
    .then(function (rows) { docIds = rows.map(function (r) { return r.id; }); })
    .then(function () { return M.Account.findAll({ where: { id: ids }, attributes: ['org_id'] }); })
    .then(function (rows) { orgIds = rows.map(function (r) { return r.org_id; }).filter(Boolean); })
    .then(function () {
      const w = [];
      if (docIds.length) w.push({ physician_id: docIds });
      if (posIds.length) w.push({ position_id: posIds });
      if (!w.length) return [];
      return M.Pipeline.findAll({ where: { [Op.or]: w }, attributes: ['id'] });
    })
    .then(function (rows) { pipeIds = rows.map(function (r) { return r.id; }); })
    .then(function () { return pipeIds.length ? M.AgentAction.destroy({ where: { pipeline_id: pipeIds } }) : null; })
    .then(function () { return pipeIds.length ? M.PipelineEvent.destroy({ where: { pipeline_id: pipeIds } }) : null; })
    .then(function () { return pipeIds.length ? M.Pipeline.destroy({ where: { id: pipeIds } }) : null; })
    .then(function () {
      const w = [];
      if (docIds.length) w.push({ physician_id: docIds });
      if (posIds.length) w.push({ position_id: posIds });
      return w.length ? M.Match.destroy({ where: { [Op.or]: w } }) : null;
    })
    .then(function () { return docIds.length ? M.Physician.destroy({ where: { id: docIds } }) : null; })
    .then(function () { return M.Account.destroy({ where: { id: ids } }); })
    // ONLY the organisation signup created, never the seeded one the account was
    // reattached to — deleting that would take the twelve seeded positions too.
    .then(function () {
      const own = (created.orgs || []).filter(function (id) { return id && id !== seededOrgIdRef.v; });
      return own.length ? M.Organization.destroy({ where: { id: own } }) : null;
    })

    // Prove it, rather than assuming it: a fixture build that silently leaves
    // rows in the live tenant is how the last one leaked a "SIT Physician" into
    // a customer-facing demo.
    .then(function () {
      return Promise.all([
        M.Account.count({ where: { id: ids } }),
        docIds.length ? M.Match.count({ where: { physician_id: docIds } }) : 0,
        0
      ]);
    })
    .then(function (n) {
      if (n[0] || n[1] || n[2]) {
        console.error('CLEANUP INCOMPLETE - accounts:' + n[0] + ' matches:' + n[1] + ' positions:' + n[2]);
        process.exitCode = 1;
      } else {
        console.log('cleaned up ' + ids.length + ' sample accounts and everything they generated; ' +
                    'the seeded organisations and positions are untouched');
      }
    })
    .catch(function (e) { console.error('cleanup warning:', e.message); process.exitCode = 1; });
}

function write(F, meta) {
  const keys = Object.keys(F);
  const banner =
'/* ─────────────────────────────────────────────────────────────────────────\n' +
'   GENERATED — do not edit by hand.\n' +
'     node verticals/jobmd/scripts/build-simulator-fixtures.js\n' +
'\n' +
'   These are REAL API RESPONSES, captured by driving the real endpoints. The\n' +
'   match scores, the reasons and the gaps in here came out of the matching\n' +
'   engine, and the agent drafts came out of the agents. Nothing is typed.\n' +
'\n' +
'   The people and hospitals are fictional and named "Sample" so a fixture can\n' +
'   never be mistaken for a client. The rows they were captured from were\n' +
'   deleted immediately afterwards.\n' +
'   ───────────────────────────────────────────────────────────────────────── */\n';
  const body = 'var FIXTURES = ' + JSON.stringify(F, null, 1) + ';\n' +
               'var FIXTURE_META = ' + JSON.stringify(meta) + ';\n';
  fs.writeFileSync(OUT, banner + body);
  const top = (F['physician:/matches'] || {}).items || [];
  console.log('wrote ' + path.relative(process.cwd(), OUT));
  console.log('  ' + keys.length + ' captured responses, ' +
              Math.round(fs.statSync(OUT).size / 1024) + 'KB');
  console.log('  engine scores: ' + top.map(function (m) { return m.score; }).join(', '));
}

main().then(function () { process.exit(process.exitCode || 0); })
      .catch(function (e) { console.error(e); process.exit(1); });
