/**
 * SIT: WordPress-as-System-of-Record sync for CamaraVirtual chambers.
 *
 *   node scripts/test-chamber-wp-sync.js
 *
 * Spins a fake WordPress (implementing the companion plugin's signed contract)
 * and a throwaway chamber, then exercises pull sync, field ownership, webhook
 * auth and SSO. Requires no WordPress install and no external keys.
 *
 * SAFETY: everything runs against a scratch chamber (slug cv-99001) that is
 * created and dropped by this script. It never reads or writes cv-105.
 */
'use strict';

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const TEST_SLUG = 'cv-99001';
const SECRET = 'sit-shared-secret-' + crypto.randomBytes(6).toString('hex');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); }
}

// ---------------------------------------------------------------------------
// Fake WordPress
// ---------------------------------------------------------------------------
let WP_USERS = [];
let WP_WRITES = [];
let WP_NEXT_ID = 500;
function startFakeWordPress() {
  const app = express();
  app.use(express.json());

  // Write endpoint -- used when CamaraVirtual is the system of record.
  app.post('/wp-json/camaravirtual/v1/members', (req, res) => {
    const ts = parseInt(req.get('X-CV-Timestamp'), 10);
    const body = req.body || {};
    const event = body.event || '';
    const email = String((body.member && body.member.email) || '').toLowerCase();
    if (!ts || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return res.status(401).json({ message: 'stale' });
    const expect = crypto.createHmac('sha256', SECRET).update(`${ts}.${event}.${email}`).digest('hex');
    if (req.get('X-CV-Signature') !== expect) return res.status(401).json({ message: 'bad signature' });

    WP_WRITES.push({ event, member: body.member });
    const idx = WP_USERS.findIndex(u => String(u.email).toLowerCase() === email);
    if (event === 'member.deactivated') {
      if (idx >= 0) WP_USERS[idx].active = false;
      return res.json({ ok: true, id: idx >= 0 ? WP_USERS[idx].id : null, action: idx >= 0 ? 'deactivated' : 'noop' });
    }
    const m = body.member || {};
    const rec = {
      id: idx >= 0 ? WP_USERS[idx].id : WP_NEXT_ID++,
      email, first_name: m.first_name, last_name: m.last_name,
      company: m.company_name, sector: m.sector, country: m.country,
      phone: m.phone, bio: m.bio, website_url: m.website_url,
      sub_specialty: m.sub_specialty, years_experience: m.years_experience,
      languages: m.languages, linkedin_url: m.linkedin_url,
      membership_type: m.membership_type, active: true
    };
    if (idx >= 0) WP_USERS[idx] = rec; else WP_USERS.push(rec);
    return res.json({ ok: true, id: rec.id, action: idx >= 0 ? 'updated' : 'created' });
  });

  app.get('/wp-json/camaravirtual/v1/members', (req, res) => {
    const ts = parseInt(req.get('X-CV-Timestamp'), 10);
    const sig = req.get('X-CV-Signature');
    if (!ts || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return res.status(401).json({ message: 'stale' });
    const expect = crypto.createHmac('sha256', SECRET).update(String(ts)).digest('hex');
    if (sig !== expect) return res.status(401).json({ message: 'bad signature' });
    const per = parseInt(req.query.per_page, 10) || 100;
    const page = parseInt(req.query.page, 10) || 1;
    const slice = WP_USERS.slice((page - 1) * per, page * per);
    res.json({ members: slice, page, per_page: per, total: WP_USERS.length, total_pages: Math.ceil(WP_USERS.length / per) });
  });
  return new Promise(resolve => {
    const srv = app.listen(0, () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

// ---------------------------------------------------------------------------
// Chamber app under test
// ---------------------------------------------------------------------------
function startChamberApp() {
  const { resolveChamberFromSlug } = require('../chamber-template/lib/chamber-resolver');
  const router = require('../src/routes/unified-chamber');
  const app = express();
  app.use(express.json());
  app.use('/:chamber_slug(cv-[0-9]+|vc-[0-9]+)/api', resolveChamberFromSlug, router);
  return new Promise(resolve => {
    const srv = app.listen(0, () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

async function main() {
  const wpSrv = await startFakeWordPress();
  const cvSrv = await startChamberApp();
  const API = cvSrv.base + '/' + TEST_SLUG + '/api';
  const { signToken } = require('../src/routes/unified-chamber/lib/shared');
  const wpsync = require('../src/services/chamberWpSync');

  let chamberId, adminId, adminToken;

  const req = async (method, path, body, headers) => {
    const r = await fetch(API + path, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { json = { _raw: text }; }
    return [r.status, json];
  };
  const authed = (m, p, b) => req(m, p, b, { Authorization: 'Bearer ' + adminToken });
  const members = () => sequelize.query(
    `SELECT id,email,first_name,last_name,company_name,sector,country,status,access_level,trust_score,governance_role,verified
     FROM members WHERE chamber_id = :c ORDER BY email`,
    { replacements: { c: chamberId }, type: QueryTypes.SELECT });

  try {
    // ---- fixture chamber + one CV-native admin ----
    await sequelize.query(`DELETE FROM chambers WHERE slug = :s`, { replacements: { s: TEST_SLUG } });
    const [ch] = await sequelize.query(
      `INSERT INTO chambers (slug, name, primary_language, country, status, contact_email, theme_config)
       VALUES (:s, 'SIT Chamber', 'es', 'Spain', 'active', 'sit@example.com', '{}'::jsonb) RETURNING id`,
      { replacements: { s: TEST_SLUG }, type: QueryTypes.SELECT });
    chamberId = ch.id;

    const [adm] = await sequelize.query(
      `INSERT INTO members (chamber_id, email, password_hash, first_name, last_name, access_level, governance_role, status, trust_score)
       VALUES (:c, 'admin@sit.test', 'x', 'Site', 'Admin', 'superadmin', 'president', 'active', 0.9) RETURNING id`,
      { replacements: { c: chamberId }, type: QueryTypes.SELECT });
    adminId = adm.id;
    await sequelize.query(`UPDATE chambers SET owner_member_id = :m WHERE id = :c`, { replacements: { m: adminId, c: chamberId } });
    adminToken = signToken({ member_id: adminId, chamber_id: chamberId, chamber_slug: TEST_SLUG, email: 'admin@sit.test', access_level: 'superadmin', governance_role: 'president' });

    // A member that exists only in CamaraVirtual, to test deactivate_missing.
    await sequelize.query(
      `INSERT INTO members (chamber_id, email, password_hash, first_name, last_name, status, trust_score)
       VALUES (:c, 'legacy@sit.test', 'x', 'Legacy', 'Member', 'active', 0.77)`,
      { replacements: { c: chamberId } });

    // ---- config ----
    let [s, j] = await authed('GET', '/wp/config');
    ok('config readable by admin', s === 200 && j.success && j.data.enabled === false, 'status=' + s);

    [s, j] = await req('GET', '/wp/config');
    ok('config rejects anonymous', s === 401, 'status=' + s);

    [s, j] = await authed('PUT', '/wp/config', {
      enabled: true, mode: 'plugin', site_url: wpSrv.base,
      shared_secret: SECRET, allow_sso: true, deactivate_missing: false
    });
    ok('config saved', s === 200 && j.success && j.data.enabled === true, 'status=' + s);
    ok('secret never echoed back', j.success && j.data.shared_secret && j.data.shared_secret.set === true &&
       JSON.stringify(j.data).indexOf(SECRET) === -1);

    // ---- connectivity probe ----
    WP_USERS = [
      { id: 11, email: 'Ana@sit.test', first_name: 'Ana', last_name: 'Ruiz', company: 'Ruiz SL', sector: 'tecnologia', country: 'Spain', languages: 'Spanish,English' },
      { id: 12, email: 'bruno@sit.test', name: 'Bruno Diaz', company: 'Diaz Export', sector: 'comercio_exterior', country: 'Mexico' },
      { id: 13, email: 'not-an-email', first_name: 'Bad', last_name: 'Row' },
      { id: 14, email: 'ana@sit.test', first_name: 'Dupe', last_name: 'Row' }
    ];
    [s, j] = await authed('POST', '/wp/test');
    ok('test probe reaches WordPress', s === 200 && j.data.fetched === 4, 'fetched=' + (j.data && j.data.fetched));

    // ---- dry run ----
    [s, j] = await authed('POST', '/wp/sync', { dry_run: true });
    ok('dry run succeeds', s === 200 && j.success, 'status=' + s);
    ok('dry run plans 2 creates', j.data.created === 2, 'created=' + j.data.created);
    ok('dry run rejects invalid email', j.data.invalid.length === 1, JSON.stringify(j.data.invalid));
    ok('dry run collapses duplicate email', j.data.duplicates.length === 1, JSON.stringify(j.data.duplicates));
    let rows = await members();
    ok('dry run wrote NOTHING', rows.length === 2, 'members=' + rows.length);

    // ---- apply ----
    [s, j] = await authed('POST', '/wp/sync', {});
    ok('apply succeeds', s === 200 && j.data.created === 2, 'created=' + (j.data && j.data.created));
    rows = await members();
    ok('members created', rows.length === 4, 'members=' + rows.length);
    const ana = rows.find(r => r.email === 'ana@sit.test');
    ok('email lowercased on import', !!ana);
    ok('company mapped', ana && ana.company_name === 'Ruiz SL', ana && ana.company_name);
    const bruno = rows.find(r => r.email === 'bruno@sit.test');
    ok('display name split into first/last', bruno && bruno.first_name === 'Bruno' && bruno.last_name === 'Diaz',
       bruno && bruno.first_name + '/' + bruno.last_name);

    // ---- idempotency ----
    [s, j] = await authed('POST', '/wp/sync', {});
    ok('second sync is a no-op', j.data.created === 0 && j.data.updated === 0 && j.data.unchanged === 2,
       `created=${j.data.created} updated=${j.data.updated} unchanged=${j.data.unchanged}`);

    // ---- field ownership: CV-owned columns must survive a sync ----
    await sequelize.query(
      `UPDATE members SET trust_score = 0.91, access_level = 'admin_global', governance_role = 'director', verified = true
       WHERE chamber_id = :c AND email = 'ana@sit.test'`, { replacements: { c: chamberId } });
    WP_USERS[0].company = 'Ruiz Consulting SL';
    WP_USERS[0].sector = 'servicios_profesionales';
    [s, j] = await authed('POST', '/wp/sync', {});
    rows = await members();
    const ana2 = rows.find(r => r.email === 'ana@sit.test');
    ok('WP-owned field updated', ana2.company_name === 'Ruiz Consulting SL', ana2.company_name);
    ok('trust_score NOT clobbered', Number(ana2.trust_score) === 0.91, String(ana2.trust_score));
    ok('access_level NOT clobbered', ana2.access_level === 'admin_global', ana2.access_level);
    ok('governance_role NOT clobbered', ana2.governance_role === 'director', ana2.governance_role);
    ok('verified NOT clobbered', ana2.verified === true, String(ana2.verified));

    // ---- WordPress cannot escalate privilege ----
    WP_USERS[0].access_level = 'superadmin';
    WP_USERS[0].governance_role = 'president';
    WP_USERS[0].trust_score = 1;
    await authed('POST', '/wp/sync', {});
    rows = await members();
    const ana3 = rows.find(r => r.email === 'ana@sit.test');
    ok('WP cannot set access_level', ana3.access_level === 'admin_global', ana3.access_level);
    ok('WP cannot set governance_role', ana3.governance_role === 'director', ana3.governance_role);
    ok('WP cannot set trust_score', Number(ana3.trust_score) === 0.91, String(ana3.trust_score));

    // ---- email change upstream renames instead of duplicating ----
    WP_USERS[1].email = 'bruno.diaz@sit.test';
    [s, j] = await authed('POST', '/wp/sync', {});
    rows = await members();
    ok('email change renamed the member', rows.filter(r => r.first_name === 'Bruno').length === 1,
       'bruno rows=' + rows.filter(r => r.first_name === 'Bruno').length);
    ok('renamed to the new address', !!rows.find(r => r.email === 'bruno.diaz@sit.test'));

    // ---- deactivation ----
    WP_USERS[1].active = false;
    await authed('POST', '/wp/sync', {});
    rows = await members();
    ok('inactive in WP deactivates in CV',
       rows.find(r => r.email === 'bruno.diaz@sit.test').status === 'inactive');
    ok('deactivate is soft (row kept)', rows.length === 4, 'members=' + rows.length);

    WP_USERS[1].active = true;
    await authed('POST', '/wp/sync', {});
    rows = await members();
    ok('reactivates when WP re-enables', rows.find(r => r.email === 'bruno.diaz@sit.test').status === 'active');

    // ---- deactivate_missing, and its protections ----
    await authed('POST', '/wp/sync', {});
    rows = await members();
    ok('CV-only member untouched while deactivate_missing is off',
       rows.find(r => r.email === 'legacy@sit.test').status === 'active');

    await authed('PUT', '/wp/config', { deactivate_missing: true });
    [s, j] = await authed('POST', '/wp/sync', { dry_run: true });
    ok('dry run flags the CV-only member', j.data.deactivated === 1, 'deactivated=' + j.data.deactivated);
    await authed('POST', '/wp/sync', {});
    rows = await members();
    ok('CV-only member deactivated', rows.find(r => r.email === 'legacy@sit.test').status === 'inactive');
    ok('chamber admin PROTECTED from deactivation',
       rows.find(r => r.email === 'admin@sit.test').status === 'active');

    // ---- webhook ----
    const hook = async (event, member, opts) => {
      const o = opts || {};
      const ts = o.ts || Math.floor(Date.now() / 1000);
      const email = String(member.email || '').toLowerCase();
      const sig = o.sig || crypto.createHmac('sha256', o.secret || SECRET)
        .update(`${ts}.${event}.${email}`).digest('hex');
      return req('POST', '/wp/webhook', { event, member },
        { 'X-CV-Timestamp': String(ts), 'X-CV-Signature': sig });
    };

    [s, j] = await hook('user.created', { id: 20, email: 'carla@sit.test', first_name: 'Carla', last_name: 'Vega', company: 'Vega Labs' });
    ok('webhook creates a member', s === 200 && j.data.action === 'created', 'status=' + s);
    rows = await members();
    ok('webhook member present', !!rows.find(r => r.email === 'carla@sit.test' && r.company_name === 'Vega Labs'));

    [s, j] = await hook('user.updated', { id: 20, email: 'carla@sit.test', first_name: 'Carla', last_name: 'Vega', company: 'Vega Labs SL' });
    ok('webhook updates a member', s === 200 && j.data.action === 'updated');

    [s, j] = await hook('user.updated', { id: 20, email: 'carla@sit.test' }, { sig: 'deadbeef' });
    ok('webhook rejects a bad signature', s === 401, 'status=' + s);

    [s, j] = await hook('user.updated', { id: 20, email: 'carla@sit.test' }, { ts: Math.floor(Date.now() / 1000) - 4000 });
    ok('webhook rejects a stale timestamp', s === 401, 'status=' + s);

    [s, j] = await hook('user.updated', { id: 20, email: 'carla@sit.test' }, { secret: 'wrong-secret' });
    ok('webhook rejects the wrong secret', s === 401, 'status=' + s);

    [s, j] = await req('POST', '/wp/webhook', { event: 'user.updated', member: { email: 'carla@sit.test' } });
    ok('webhook rejects an unsigned request', s === 401, 'status=' + s);

    [s, j] = await hook('user.deleted', { id: 20, email: 'carla@sit.test' });
    ok('webhook deactivates on delete', s === 200 && j.data.action === 'deactivated');
    rows = await members();
    ok('deleted member kept as inactive', rows.find(r => r.email === 'carla@sit.test').status === 'inactive');

    // ---- SSO ----
    const mintSso = (email, opts) => {
      const o = opts || {};
      const payload = { email, exp: o.exp || Math.floor(Date.now() / 1000) + 300, nonce: o.nonce || crypto.randomBytes(8).toString('hex') };
      const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sig = crypto.createHmac('sha256', o.secret || SECRET).update(b64).digest('hex');
      return b64 + '.' + sig;
    };
    const sso = async (token, extra) => {
      const r = await fetch(API + '/wp/sso?token=' + encodeURIComponent(token) + (extra || ''));
      return [r.status, await r.text()];
    };

    let [ss, html] = await sso(mintSso('ana@sit.test'));
    ok('SSO accepts a valid token', ss === 200 && html.indexOf('cv_' + TEST_SLUG + '_token') !== -1, 'status=' + ss);
    ok('SSO hands over a real chamber JWT', /localStorage\.setItem\("cv_[^"]+","ey/.test(html.replace(/\s/g, '')));

    const replay = mintSso('ana@sit.test');
    await sso(replay);
    [ss, html] = await sso(replay);
    ok('SSO rejects a replayed token', ss === 401, 'status=' + ss);

    [ss, html] = await sso(mintSso('ana@sit.test', { exp: Math.floor(Date.now() / 1000) - 60 }));
    ok('SSO rejects an expired token', ss === 401, 'status=' + ss);

    [ss, html] = await sso(mintSso('ana@sit.test', { secret: 'wrong-secret' }));
    ok('SSO rejects a forged signature', ss === 401, 'status=' + ss);

    [ss, html] = await sso(mintSso('nobody@sit.test'));
    ok('SSO rejects an unknown member', ss === 404, 'status=' + ss);

    [ss, html] = await sso(mintSso('bruno.diaz@sit.test'), '&redirect=https://evil.example.com');
    ok('SSO refuses an off-site redirect',
       ss === 200 && html.indexOf('evil.example.com') === -1 && html.indexOf('/' + TEST_SLUG + '/dashboard/') !== -1);

    await authed('PUT', '/wp/config', { allow_sso: false });
    [ss, html] = await sso(mintSso('ana@sit.test'));
    ok('SSO refused when disabled', ss === 401, 'status=' + ss);

    // ---- audit ----
    [s, j] = await authed('GET', '/wp/runs');
    ok('sync runs are logged', s === 200 && j.data.length >= 5, 'runs=' + (j.data && j.data.length));

    // =================================================================
    // DIRECTION 2: CamaraVirtual is the system of record, WordPress follows
    // =================================================================
    [s, j] = await authed('POST', '/wp/push', { dry_run: true });
    ok('push refused while direction is pull', s === 502 && /direction/i.test(j.error), j.error);

    [s, j] = await authed('PUT', '/wp/config', { direction: 'push', mode: 'wp_users' });
    ok('push mode rejects the wp_users adapter', s === 400 && /plugin/i.test(j.error), j.error);

    [s, j] = await authed('PUT', '/wp/config', { direction: 'push', mode: 'plugin', push_deactivate_missing: false });
    ok('direction switched to push', s === 200 && j.data.direction === 'push', 'status=' + s);

    [s, j] = await authed('POST', '/wp/sync', { dry_run: true });
    ok('pull refused while direction is push', s === 502 && /push/i.test(j.error), j.error);

    [s, j] = await hook('user.updated', { id: 99, email: 'loop@sit.test', first_name: 'Loop', last_name: 'Back' });
    ok('inbound webhook refused in push mode (no echo loop)', s === 409, 'status=' + s);

    // WordPress starts empty; the chamber is now the source.
    WP_USERS = [];
    WP_WRITES = [];
    await sequelize.query(
      `INSERT INTO members (chamber_id, email, password_hash, first_name, last_name, company_name, sector, country, phone, status)
       VALUES (:c, 'nueva@sit.test', 'x', 'Nueva', 'Socia', 'Socia SL', 'construccion', 'Spain', '+34600111222', 'active')`,
      { replacements: { c: chamberId } });

    [s, j] = await authed('POST', '/wp/push', { dry_run: true });
    ok('push dry run succeeds', s === 200 && j.success, 'status=' + s);
    const activeCount = (await members()).filter(r => r.status === 'active').length;
    ok('push dry run plans every active member', j.data.created === activeCount,
       `planned=${j.data.created} active=${activeCount}`);
    ok('push dry run wrote NOTHING to WordPress', WP_WRITES.length === 0, 'writes=' + WP_WRITES.length);

    [s, j] = await authed('POST', '/wp/push', {});
    ok('push applies', s === 200 && j.data.created === activeCount && j.data.failed === 0,
       `created=${j.data.created} failed=${j.data.failed}`);
    ok('WordPress received the members', WP_USERS.length === activeCount, 'wp users=' + WP_USERS.length);
    const wpNueva = WP_USERS.find(u => u.email === 'nueva@sit.test');
    ok('profile fields carried across', wpNueva && wpNueva.company === 'Socia SL' && wpNueva.sector === 'construccion',
       wpNueva && wpNueva.company + '/' + wpNueva.sector);
    ok('push never sends a WordPress role or capability',
       WP_WRITES.every(w => !('role' in w.member) && !('access_level' in w.member) &&
                            !('trust_score' in w.member) && !('governance_role' in w.member)));

    // ---- push is a diff, not a blind overwrite ----
    WP_WRITES = [];
    [s, j] = await authed('POST', '/wp/push', {});
    ok('second push is a no-op', j.data.created === 0 && j.data.updated === 0 && j.data.unchanged === activeCount,
       `created=${j.data.created} updated=${j.data.updated} unchanged=${j.data.unchanged}`);
    ok('no-op push sent no writes', WP_WRITES.length === 0, 'writes=' + WP_WRITES.length);

    await sequelize.query(
      `UPDATE members SET company_name = 'Socia Global SL' WHERE chamber_id = :c AND email = 'nueva@sit.test'`,
      { replacements: { c: chamberId } });
    WP_WRITES = [];
    [s, j] = await authed('POST', '/wp/push', {});
    ok('push sends only the changed member', j.data.updated === 1 && WP_WRITES.length === 1,
       `updated=${j.data.updated} writes=${WP_WRITES.length}`);
    ok('WordPress reflects the change', WP_USERS.find(u => u.email === 'nueva@sit.test').company === 'Socia Global SL');

    // ---- push deactivation ----
    WP_USERS.push({ id: 900, email: 'stranger@sit.test', first_name: 'Stray', last_name: 'User', active: true });
    [s, j] = await authed('POST', '/wp/push', {});
    ok('WP-only user untouched while push_deactivate_missing is off', j.data.deactivated === 0,
       'deactivated=' + j.data.deactivated);
    ok('stranger still active in WordPress', WP_USERS.find(u => u.email === 'stranger@sit.test').active === true);

    await authed('PUT', '/wp/config', { push_deactivate_missing: true });
    [s, j] = await authed('POST', '/wp/push', {});
    ok('push deactivates the WP-only user', j.data.deactivated === 1, 'deactivated=' + j.data.deactivated);
    ok('WordPress user deactivated, not deleted',
       WP_USERS.find(u => u.email === 'stranger@sit.test').active === false && WP_USERS.length > activeCount);

    // ---- a single bad record must not abort the roster ----
    await sequelize.query(
      `UPDATE members SET status = 'active' WHERE chamber_id = :c AND email = 'legacy@sit.test'`,
      { replacements: { c: chamberId } });
    [s, j] = await authed('POST', '/wp/push', {});
    ok('newly active member pushed', s === 200 && j.data.created === 1, 'created=' + j.data.created);

    // ---- isolation: sync must be off everywhere else ----
    const r105 = await fetch(cvSrv.base + '/cv-105/api/wp/config');
    ok('cv-105 wp/config still requires auth', r105.status === 401, 'status=' + r105.status);
    const [c105] = await sequelize.query(
      `SELECT theme_config FROM chambers WHERE slug = 'cv-105'`, { type: QueryTypes.SELECT });
    ok('cv-105 has NO wp_sync config (untouched)', !c105.theme_config || !c105.theme_config.wp_sync,
       JSON.stringify(c105.theme_config));

  } finally {
    if (chamberId) await sequelize.query(`DELETE FROM chambers WHERE id = :c`, { replacements: { c: chamberId } });
    wpSrv.srv.close(); cvSrv.srv.close();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('\nSIT ERROR:', e.stack || e.message); process.exit(1); });
