#!/usr/bin/env node
'use strict';

/**
 * Create a JobUp account from the backend, with no Stripe involved.
 *
 * Usage:
 *   node verticals/jobup/scripts/create-account.js \
 *     --email=someone@example.com \
 *     --name="Their Name" \
 *     --password='JobUp@7' \
 *     --resume=/path/to/cv.pdf \
 *     --photo=/path/to/portrait.png \
 *     [--lang=en|es] [--address=preferredname] [--dry-run]
 *
 * ACTIVATION IS STAMPED HONESTLY. An account made this way never paid, so it is
 * recorded as `free_test` and NEVER as `paid`. billing.js and the subscribers
 * console both read that stamp; marking it paid would put a subscriber into the
 * revenue figures who was never charged, which is the one thing the money
 * surfaces in this vertical are built not to do.
 *
 * IT REFUSES RATHER THAN INVENTS. No email, no account — the column is unique
 * and NOT NULL, and a placeholder address would collide with a real signup
 * later. A résumé that yields no text is reported, not filled in with
 * plausible-looking history.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const arg = (k, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  if (hit) return hit.slice(k.length + 3);
  return process.argv.includes(`--${k}`) ? true : d;
};

(async () => {
  const email = String(arg('email') || '').trim().toLowerCase();
  const name = String(arg('name') || '').trim();
  const password = String(arg('password') || '');
  const resumePath = arg('resume');
  const photoPath = arg('photo');
  const lang = arg('lang') === 'es' ? 'es' : 'en';
  const dryRun = Boolean(arg('dry-run'));

  const missing = [];
  if (!email) missing.push('--email');
  if (!name) missing.push('--name');
  if (!password) missing.push('--password');
  if (!resumePath) missing.push('--resume (the CV file the matching engine scores against)');
  if (missing.length) {
    console.error('Cannot create an account. Missing:\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  const { init, models, scoped } = require('../src/models');
  const authSvc = require('../src/services/auth');
  const resumeSvc = require('../src/services/resume');
  const photos = require('../src/services/photos');
  const provisioning = require('../src/services/provisioning');

  const problems = authSvc.passwordProblems(password);
  if (problems && problems.length) {
    console.error('Password rejected:\n  ' + problems.join('\n  '));
    process.exit(1);
  }

  await init();

  const existing = await models.subscribers.findOne({ where: { email } });
  if (existing) {
    console.error(`An account already exists for ${email} (#${existing.id}, ${existing.status}).`);
    console.error('Delete it first, or use a different address.');
    process.exit(1);
  }

  // ---- résumé -------------------------------------------------------------
  if (!fs.existsSync(resumePath)) { console.error(`No such résumé file: ${resumePath}`); process.exit(1); }
  const resumeBuf = fs.readFileSync(resumePath);
  const extracted = await resumeSvc.extractText(resumeBuf, path.basename(resumePath));
  const text = (extracted && (extracted.text || extracted)) || '';
  if (!String(text).trim() || String(text).trim().length < 200) {
    console.error(`Extracted only ${String(text).trim().length} characters from ${path.basename(resumePath)}.`);
    console.error('That is not a usable CV. The matcher would score this person against nothing.');
    console.error('Supply the real résumé rather than letting the account go live empty.');
    process.exit(1);
  }
  const structured = await resumeSvc.structure(String(text));

  // ---- photo (optional) ---------------------------------------------------
  let photo = null;
  if (photoPath) {
    if (!fs.existsSync(photoPath)) { console.error(`No such photo: ${photoPath}`); process.exit(1); }
    photo = photos.accept(fs.readFileSync(photoPath));
    if (!photo.ok) { console.error(`Photo rejected: ${photo.reason}`); process.exit(1); }
  }

  if (dryRun) {
    console.log('DRY RUN — nothing was written.');
    console.log('  email    :', email);
    console.log('  name     :', name);
    console.log('  résumé   :', `${String(text).trim().length} chars extracted from ${path.basename(resumePath)}`);
    console.log('  headline :', (structured.profile && structured.profile.headline) || '(none detected)');
    console.log('  photo    :', photo ? `${photo.mime}, ${(photo.bytes / 1024).toFixed(0)} KB` : '(none)');
    process.exit(0);
  }

  // ---- create -------------------------------------------------------------
  const sub = await models.subscribers.create({
    email, name, language: lang,
    password_hash: authSvc.hashPassword(password),
    status: 'active',
    activation: 'free_test',          // never 'paid' — nobody was charged
    activated_at: new Date(),
  });
  const tenantId = sub.id;

  const profile = { ...(structured.profile || {}), name: (structured.profile || {}).name || name };
  const prof = await scoped('profiles', tenantId).create({
    resume_json: profile, source_text: String(text),
  });

  if (photo) {
    const asset = await scoped('assets', tenantId).create({
      kind: 'photo', mime: photo.mime, bytes: photo.bytes, data: photo.base64,
    });
    await scoped('profiles', tenantId).update({ photo_asset_id: asset.id }, { id: prof.id });
  }

  await models.audit_log.create({
    tenant_id: tenantId, actor: 'backend script', action: 'account_built',
    reason: 'Created from the backend with no payment (free_test).',
  });

  // Badge the admin console, same as a real signup would.
  try { require('../src/services/admin-notify').onNewSubscriber(sub); } catch (e) { /* non-fatal */ }

  const prov = await provisioning.run(tenantId, {
    preferredAddress: arg('address') || undefined,
  });

  const fresh = await models.subscribers.findOne({ where: { id: tenantId } });
  console.log('Account created.');
  console.log('  tenant_id :', tenantId);
  console.log('  email     :', fresh.email);
  console.log('  name      :', fresh.name);
  console.log('  activation:', fresh.activation, '(never counted as revenue)');
  console.log('  address   :', fresh.address || '(not provisioned)');
  console.log('  site      :', fresh.address ? `https://${fresh.address}` : '—');
  console.log('  sign in   :', `${process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev'}/app`);
  console.log('  provision :', prov && prov.state ? JSON.stringify(prov.state) : JSON.stringify(prov));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
