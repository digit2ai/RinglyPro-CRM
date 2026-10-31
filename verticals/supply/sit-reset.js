'use strict';
// Forgot-password SIT: fake mailer, throwaway user, cleans up. Zero external keys.
//   node verticals/supply/sit-reset.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
process.env.SUPPLY_DIALER = 'off';
delete process.env.SENDGRID_API_KEY;
const fs = require('fs');
const db = require('./src/db');
const auth = require('./src/auth');
const mail = require('./src/mail');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const rejects = async (p, m, re) => { try { await p; ok(false, m); } catch (e) { ok(!re || re.test(e.message), m + ' (' + e.message + ')'); } };
const sent = [];
const EMAIL = 'sit-reset-' + Date.now() + '@example.com';
const TENANT = 990031;

(async () => {
  // The keyless path must refuse, not pretend.
  mail.setTransport(null);
  const u = await auth.createUser({ tenantId: TENANT, email: EMAIL, password: 'old-password-123', name: 'Sit', role: 'owner' });
  await rejects(auth.requestReset(EMAIL, mail), 'no SendGrid key = 503, never a fake send', /could not be sent/);
  const row0 = await db.one('SELECT reset_code_hash, reset_sent_at FROM sup_users WHERE id = :id', { id: u.id });
  ok(!row0.reset_code_hash && !row0.reset_sent_at, 'failed send leaves no code and no resend lock');

  mail.setTransport(async (m) => { sent.push(m); return { sent: true }; });
  const unknown = await auth.requestReset('nobody-' + Date.now() + '@example.com', mail);
  ok(unknown.ok && sent.length === 0, 'unknown email answers ok and sends nothing');

  const oldToken = auth.sign(await db.one('SELECT * FROM sup_users WHERE id = :id', { id: u.id }));
  await auth.requestReset(EMAIL.toUpperCase(), mail);
  ok(sent.length === 1 && sent[0].to === EMAIL, 'code emailed to the account address');
  const code = (sent[0].text.match(/\b(\d{6})\b/) || [])[1];
  ok(!!code, 'email carries a 6-digit code');
  const row = await db.one('SELECT reset_code_hash FROM sup_users WHERE id = :id', { id: u.id });
  ok(row.reset_code_hash && !row.reset_code_hash.includes(code), 'only a hash of the code is stored');

  await auth.requestReset(EMAIL, mail);
  ok(sent.length === 1, 'second request within 60 s sends nothing');

  const wrong = code === '000000' ? '111111' : '000000';
  await rejects(auth.resetPassword({ email: EMAIL, code, password: 'Palindrome@7' }), 'published password refused', /published/);
  await rejects(auth.resetPassword({ email: EMAIL, code: wrong, password: 'new-password-456' }), 'wrong code refused', /wrong or has expired/);
  const done = await auth.resetPassword({ email: EMAIL, code, password: 'new-password-456' });
  ok(done && done.id === u.id, 'right code sets the new password');
  await rejects(auth.login({ email: EMAIL, password: 'old-password-123' }), 'old password no longer works', /Wrong/);
  ok((await auth.login({ email: EMAIL, password: 'new-password-456' })).id === u.id, 'new password signs in');
  await rejects(auth.resetPassword({ email: EMAIL, code, password: 'another-pass-789' }), 'code works only once', /wrong or has expired/);

  const req = (t) => ({ headers: { cookie: 'sup_token=' + t } });
  ok((await auth.userFromRequest(req(oldToken))) === null, 'session from before the reset is ended');
  ok(!!(await auth.userFromRequest(req(auth.sign(done)))), 'session issued after the reset works');

  // Lockout after 5 wrong codes, even if the 6th is right.
  await db.run('UPDATE sup_users SET reset_sent_at = NULL WHERE id = :id', { id: u.id });
  await auth.requestReset(EMAIL, mail);
  const code2 = sent[sent.length - 1].text.match(/\b(\d{6})\b/)[1];
  const bad2 = code2 === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await auth.resetPassword({ email: EMAIL, code: bad2, password: 'whatever-pass-1' }).catch(() => {});
  await rejects(auth.resetPassword({ email: EMAIL, code: code2, password: 'whatever-pass-1' }), '5 wrong tries lock the code', /wrong or has expired/);

  // Expired code.
  await db.run('UPDATE sup_users SET reset_sent_at = NULL WHERE id = :id', { id: u.id });
  await auth.requestReset(EMAIL, mail);
  const code3 = sent[sent.length - 1].text.match(/\b(\d{6})\b/)[1];
  await db.run("UPDATE sup_users SET reset_expires = now() - interval '1 minute' WHERE id = :id", { id: u.id });
  await rejects(auth.resetPassword({ email: EMAIL, code: code3, password: 'whatever-pass-2' }), 'expired code refused', /wrong or has expired/);

  // Structural: mail.js is the only file that sends email.
  const files = require('child_process').execSync('grep -rl "@sendgrid/mail" src || true', { cwd: __dirname }).toString().trim().split('\n').filter(Boolean);
  ok(files.length === 1 && files[0] === 'src/mail.js', 'only src/mail.js reaches SendGrid');
  const page = fs.readFileSync(__dirname + '/public/login.html', 'utf8');
  ok(/auth\/'\+p/.test(page) && /post\('forgot'/.test(page) && /post\('reset'/.test(page), 'login page calls forgot and reset');

  await db.run('DELETE FROM sup_users WHERE id = :id', { id: u.id });
  console.log(`\n${pass}/${pass + fail} passed`);
  await db.sequelize.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); try { await db.run('DELETE FROM sup_users WHERE lower(email) = :e', { e: EMAIL }); await db.sequelize.close(); } catch (x) {} process.exit(1); });
