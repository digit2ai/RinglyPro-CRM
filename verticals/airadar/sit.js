'use strict';

/**
 * AI Radar — System Integration Test.
 * Boots the router against CRM_DATABASE_URL || DATABASE_URL and exercises the
 * whole flow. Runs green with NO external keys (the enricher falls back to the
 * labelled heuristic path) and tolerates a network-less environment.
 *
 * NEVER TOUCHES A REAL ACCOUNT. The dev database IS production here, and this
 * suite rotates capture tokens and deletes rows — doing that to the owner's row
 * would silently break the iOS shortcut they built against the old token. So it
 * provisions its own throwaway user, works only inside that tenant, and removes
 * the account and everything in it at the end. Do not point it at a real login.
 *
 * Run from the repo root:  node verticals/airadar/sit.js
 * Exit 0 = all green.
 */

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User, Item, Enrichment } = require('./src/models');

const app = express();
app.use('/airadar', require('./src/index'));

const SIT_EMAIL = 'sit-airadar@digit2ai.test';
const SIT_PW = 'sit-airadar-' + process.pid;

const server = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/airadar';
  const j = (r) => r.json();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? (pass++, console.log('PASS ' + m)) : (fail++, console.log('FAIL ' + m)); };
  const made = [];   // ids created, reported at the end as a cleanup cross-check
  let sitUser = null;

  try {
    await wait(3000); // let sync start

    // ── health ──────────────────────────────────────────────────────────
    const h = await fetch(base + '/health').then(j);
    ok(h.status === 'healthy', `health (db=${h.db}, enrich=${h.enrich_model})`);

    // ── auth gate ───────────────────────────────────────────────────────
    ok((await fetch(base + '/api/v1/items')).status === 401, 'unauthenticated items blocked (401)');
    const redir = await fetch(base + '/share?url=https://example.com', { redirect: 'manual' });
    ok(redir.status === 302 && /\/airadar\/login\?next=/.test(redir.headers.get('location') || ''),
      'share target redirects to login with next=');

    // ── provision the throwaway account (tables may still be syncing) ───
    const hash = await bcrypt.hash(SIT_PW, 8);
    for (let i = 0; i < 25 && !sitUser; i++) {
      try {
        sitUser = await User.findOne({ where: { email: SIT_EMAIL } });
        if (sitUser) { sitUser.password_hash = hash; await sitUser.save(); }
        else {
          sitUser = await User.create({
            email: SIT_EMAIL, name: 'AI Radar SIT', role: 'member', lang: 'en',
            password_hash: hash, capture_token: crypto.randomBytes(24).toString('hex')
          });
        }
        if (!sitUser.tenant_id) { sitUser.tenant_id = sitUser.id; await sitUser.save(); }
      } catch (e) { await wait(1200); }
    }
    ok(!!sitUser, 'throwaway SIT account provisioned (no real account is touched)');

    const lr = await fetch(base + '/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SIT_EMAIL, password: SIT_PW })
    });
    const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
    ok(lr.ok && cookie.includes('airadar_token'), 'login sets cookie');
    const H = { 'Content-Type': 'application/json', Cookie: cookie };

    ok((await fetch(base + '/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SIT_EMAIL, password: 'wrong-' + Date.now() })
    })).status === 401, 'bad password rejected (401)');

    const me = await fetch(base + '/api/v1/auth/me', { headers: H }).then(j);
    ok(me.user && me.user.capture_token && me.user.capture_token.length >= 40, 'capture token issued');
    const KEY = me.user.capture_token;

    // ── share target: saves instantly, no form ──────────────────────────
    const sh = await fetch(base + '/share?url=https%3A%2F%2Fexample.com%2Fsit-share&text=hello', { headers: { Cookie: cookie }, redirect: 'manual' });
    const shLoc = sh.headers.get('location') || '';
    const shId = Number((shLoc.match(/saved=(\d+)/) || [])[1]);
    ok(sh.status === 302 && shId > 0, 'share target saves immediately and redirects with saved=<id>');
    if (shId) {
      made.push(shId);
      const shItem = await fetch(base + '/api/v1/items/' + shId, { headers: H }).then(j);
      ok(shItem.item.source_url === 'https://example.com/sit-share', 'shared link is in the bucket');
      ok(shItem.item.enrich_status === 'pending' || shItem.item.enrich_status === 'done' || shItem.item.enrich_status === 'failed',
        'shared item is labelled in the background (enrich_status set)');
    } else { fail += 2; }

    // A share with no link at all is the only case that opens the add sheet.
    const shT = await fetch(base + '/share?text=just+some+words', { headers: { Cookie: cookie }, redirect: 'manual' });
    ok(shT.status === 302 && (shT.headers.get('location') || '').includes('share=1'),
      'a text-only share opens the add sheet instead of saving a blank row');

    // ── create by hand ──────────────────────────────────────────────────
    const c1 = await fetch(base + '/api/v1/items', { method: 'POST', headers: H, body: JSON.stringify({
      company_name: 'SIT Vision Labs',
      company_url: 'https://sit-vision.example',
      description: 'Real-time video relighting for phone footage.',
      source_url: 'https://www.instagram.com/reel/SIT123/',
      category: 'video', tags: 'video, relighting, realtime', notes: 'Seen on a reel', rating: 4
    }) }).then(j);
    ok(c1.success && c1.item.id, 'create item by hand');
    made.push(c1.item.id);
    const id1 = c1.item.id;
    ok(c1.item.source_platform === 'instagram', 'platform auto-detected from the link');
    ok(Array.isArray(c1.item.tags) && c1.item.tags.length === 3, 'tags parsed from a comma string');
    ok(c1.item.needs_review === false, 'item with a company is not flagged for review');
    ok(c1.item.status === 'inbox', 'defaults to the inbox');

    // ── a link with no company is honestly flagged ──────────────────────
    const c2 = await fetch(base + '/api/v1/items', { method: 'POST', headers: H, body: JSON.stringify({
      source_url: 'https://www.tiktok.com/@someone/video/SIT456'
    }) }).then(j);
    ok(c2.item.needs_review === true, 'item with no company flagged needs_review');
    ok(c2.item.source_platform === 'tiktok', 'tiktok detected');
    made.push(c2.item.id);

    ok((await fetch(base + '/api/v1/items', { method: 'POST', headers: H, body: JSON.stringify({}) })).status === 400,
      'create with neither link nor company rejected (400)');

    // ── enrichment (no key = labelled heuristic; network may be absent) ──
    const en = await fetch(base + '/api/v1/enrich', { method: 'POST', headers: H,
      body: JSON.stringify({ url: 'https://www.instagram.com/reel/SIT999/', text: 'Check out https://acme-ai.example — instant AI voice agents' }) }).then(j);
    ok(en.success && en.draft, 'enrich returns a draft');
    ok(en.draft.company_url === '' || !/instagram\.com/.test(en.draft.company_url),
      'enrich never proposes the social host as the company site');
    ok(typeof en.draft.is_simulated === 'boolean' && typeof en.draft.needs_review === 'boolean',
      'draft carries honesty flags (is_simulated / needs_review)');
    ok(en.draft.model === 'heuristic-fallback' ? en.draft.is_simulated === true : true,
      'keyless draft is labelled simulated');
    ok(en.draft.source_platform === 'instagram', 'draft detects the platform');

    ok((await fetch(base + '/api/v1/enrich', { method: 'POST', headers: H, body: JSON.stringify({}) })).status === 400,
      'enrich with no input rejected (400)');

    // Second hop: a walled post whose caption carries the advertiser's own link
    // must read THAT site, while the reel stays the source.
    ok(en.draft.page_meta.second_hop === null || en.draft.page_meta.second_hop === 'https://acme-ai.example',
      'second hop only ever reads a candidate site from the caption');
    ok(en.draft.source_url === 'https://www.instagram.com/reel/SIT999/' && en.draft.source_platform === 'instagram',
      'second hop keeps the original post as the source (provenance intact)');

    // private-network links are refused rather than fetched
    const priv = await fetch(base + '/api/v1/enrich', { method: 'POST', headers: H,
      body: JSON.stringify({ url: 'http://192.168.1.1/admin' }) }).then(j);
    ok(priv.draft.needs_review === true && priv.draft.company_name === '', 'private-network link is not fetched');

    // ── list / search / filter ──────────────────────────────────────────
    const all = await fetch(base + '/api/v1/items', { headers: H }).then(j);
    ok(all.items.some(i => i.id === id1), 'list returns the new item');
    ok((await fetch(base + '/api/v1/items?q=relighting', { headers: H }).then(j)).items.some(i => i.id === id1), 'search by description');
    ok((await fetch(base + '/api/v1/items?q=SIT Vision', { headers: H }).then(j)).items.some(i => i.id === id1), 'search by company name');
    ok((await fetch(base + '/api/v1/items?category=video', { headers: H }).then(j)).items.every(i => i.category === 'video'), 'filter by category');
    ok((await fetch(base + '/api/v1/items?platform=tiktok', { headers: H }).then(j)).items.every(i => i.source_platform === 'tiktok'), 'filter by platform');
    ok((await fetch(base + '/api/v1/items?needs_review=1', { headers: H }).then(j)).items.every(i => i.needs_review === true), 'filter by needs_review');
    ok((await fetch(base + '/api/v1/items?tag=relighting', { headers: H }).then(j)).items.some(i => i.id === id1), 'filter by tag');
    ok(!(await fetch(base + '/api/v1/items?q=zzz-no-such-thing-zzz', { headers: H }).then(j)).items.length, 'search miss returns nothing');

    // ── stats ───────────────────────────────────────────────────────────
    const st = await fetch(base + '/api/v1/items/stats', { headers: H }).then(j);
    ok(st.total >= 2 && st.inbox >= 2 && Array.isArray(st.by_category), 'stats counts + breakdowns');

    // ── update ──────────────────────────────────────────────────────────
    const up = await fetch(base + '/api/v1/items/' + c2.item.id, { method: 'PATCH', headers: H,
      body: JSON.stringify({ company_name: 'Typed By Hand', status: 'saved', rating: 5 }) }).then(j);
    ok(up.item.company_name === 'Typed By Hand' && up.item.status === 'saved', 'update writes the fields');
    ok(up.item.needs_review === false && up.item.enriched_by === 'manual' && up.item.is_simulated === false,
      'a hand-typed company clears the review flag and the simulated label');
    ok((await fetch(base + '/api/v1/items?status=saved', { headers: H }).then(j)).items.every(i => i.status === 'saved'), 'filter by status');

    // ── re-enrich an existing item, apply into empty fields only ────────
    const re = await fetch(base + '/api/v1/items/' + id1 + '/enrich', { method: 'POST', headers: H,
      body: JSON.stringify({ apply: '1' }) }).then(j);
    ok(re.success && re.draft, 're-enrich returns a draft');
    ok(re.item.company_name === 'SIT Vision Labs' && re.item.description === 'Real-time video relighting for phone footage.',
      're-enrich never overwrites what the owner typed');
    const det = await fetch(base + '/api/v1/items/' + id1, { headers: H }).then(j);
    ok(det.enrichments.length >= 1, 'enrichment audit trail stored');

    // ── capture endpoint (the iOS Shortcut path) ────────────────────────
    ok((await fetch(base + '/api/v1/capture?key=nope', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://x.com/a/status/1' }) })).status === 401, 'capture rejects a bad key (401)');
    ok((await fetch(base + '/api/v1/capture?key=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) })).status === 400, 'capture with no link rejected (400)');

    const t0 = Date.now();
    const cap = await fetch(base + '/api/v1/capture?key=' + KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://x.com/someone/status/SIT777', text: 'new AI agent thing' })
    }).then(j);
    const capMs = Date.now() - t0;
    ok(cap.success && cap.item_id, 'capture saves without a session cookie');
    ok(cap.open === '/airadar/?item=' + cap.item_id, 'capture returns the deep link back into the app');
    // The whole point: the Shortcut must not wait on a page fetch or a model.
    ok(capMs < 2500, `capture answers immediately (${capMs}ms, no fetch or model in the request)`);
    made.push(cap.item_id);
    const capItem = await fetch(base + '/api/v1/items/' + cap.item_id, { headers: H }).then(j);
    ok(capItem.item.source_platform === 'x' && capItem.item.shared_text === 'new AI agent thing', 'captured item keeps the shared caption');

    // Background labelling settles on its own.
    let settled = null;
    for (let i = 0; i < 25; i++) {
      const s = await fetch(base + '/api/v1/items/' + cap.item_id, { headers: H }).then(j);
      if (s.item.enrich_status !== 'pending') { settled = s.item; break; }
      await wait(700);
    }
    ok(settled && (settled.enrich_status === 'done' || settled.enrich_status === 'failed'),
      'background labelling finishes on its own (enrich_status leaves pending)');

    const capGet = await fetch(base + '/api/v1/capture?key=' + KEY + '&url=https%3A%2F%2Fyoutu.be%2FSIT888').then(j);
    ok(capGet.success && capGet.item_id, 'GET capture works (share targets that cannot POST)');
    made.push(capGet.item_id);

    // ── /s — the one-action Shortcut link (raw, unencoded shared URL) ───
    const rawLink = 'https://www.instagram.com/reel/SITRAW/?igsh=abc&utm_source=ig';
    const sRes = await fetch(base + '/s?k=' + KEY + '&u=' + rawLink);
    const sHtml = await sRes.text();
    ok(sRes.ok && /Saved/.test(sHtml), '/s saves and returns the tiny confirmation page');
    const sList = await fetch(base + '/api/v1/items?q=SITRAW', { headers: H }).then(j);
    ok(sList.items.length === 1 && sList.items[0].source_url === rawLink,
      '/s keeps an unencoded link intact, query string and all');
    if (sList.items[0]) made.push(sList.items[0].id);

    // Percent-encoded links must survive too (some share sheets encode).
    const encLink = 'https://www.tiktok.com/@a/video/SITENC?x=1';
    await fetch(base + '/s?k=' + KEY + '&u=' + encodeURIComponent(encLink));
    const sList2 = await fetch(base + '/api/v1/items?q=SITENC', { headers: H }).then(j);
    ok(sList2.items.length === 1 && sList2.items[0].source_url === encLink, '/s decodes an encoded link');
    if (sList2.items[0]) made.push(sList2.items[0].id);

    ok((await fetch(base + '/s?k=badbadbadbadbadbadbad&u=https://x.com/a')).status === 401, '/s rejects a bad key (401)');
    ok((await fetch(base + '/s?k=' + KEY + '&u=notalink')).status === 400, '/s rejects a non-link (400)');
    ok((await fetch(base + '/s?k=' + KEY)).status === 400, '/s with no link (400)');

    // ── token rotation invalidates the old key ──────────────────────────
    const rot = await fetch(base + '/api/v1/auth/rotate-capture-token', { method: 'POST', headers: H }).then(j);
    ok(rot.capture_token && rot.capture_token !== KEY, 'capture token rotates');
    ok((await fetch(base + '/api/v1/capture?key=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://x.com/a/status/2' }) })).status === 401, 'the old key stops working after rotation');

    // ── export ──────────────────────────────────────────────────────────
    const csv = await fetch(base + '/api/v1/items/export?format=csv', { headers: H });
    const csvText = await csv.text();
    ok(csv.ok && /company_name,company_url,description/.test(csvText) && csvText.includes('SIT Vision Labs'), 'export csv');
    const md = await (await fetch(base + '/api/v1/items/export?format=md', { headers: H })).text();
    ok(md.includes('# AI Radar') && md.includes('SIT Vision Labs'), 'export md');
    const jx = await fetch(base + '/api/v1/items/export?format=json', { headers: H }).then(j);
    ok(jx.count >= 2 && Array.isArray(jx.items), 'export json');

    // ── tenant isolation ────────────────────────────────────────────────
    ok((await fetch(base + '/api/v1/items/99999999', { headers: H })).status === 404, 'unknown id 404 (tenant scoped)');
    ok((await fetch(base + '/api/v1/items/99999999', { method: 'PATCH', headers: H, body: JSON.stringify({ notes: 'x' }) })).status === 404,
      'cannot patch an item outside the tenant');
    ok((await fetch(base + '/api/v1/items/99999999', { method: 'DELETE', headers: H })).status === 404,
      'cannot delete an item outside the tenant');

    // ── delete ──────────────────────────────────────────────────────────
    ok((await fetch(base + '/api/v1/items/' + id1, { method: 'DELETE', headers: H }).then(j)).success, 'delete');
    ok((await fetch(base + '/api/v1/items/' + id1, { headers: H })).status === 404, 'deleted item is gone (404)');
  } catch (e) {
    console.log('ERROR', e.message);
    fail++;
  }

  // Remove the throwaway tenant entirely — rows first, then the account.
  try {
    if (sitUser) {
      const tid = sitUser.tenant_id || sitUser.id;
      const gone = await Item.destroy({ where: { tenant_id: tid } });
      await Enrichment.destroy({ where: { tenant_id: tid } });
      await User.destroy({ where: { id: sitUser.id } });
      console.log(`cleanup: removed the SIT tenant (${gone} items deleted, ${made.length} created during the run, account deleted)`);
    }
  } catch (e) { console.log('cleanup warning:', e.message); }

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  server.close();
  process.exit(fail ? 1 : 0);
});
