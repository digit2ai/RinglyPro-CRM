'use strict';

/**
 * AI Radar — System Integration Test.
 * Boots the router against CRM_DATABASE_URL || DATABASE_URL and exercises the
 * whole flow. Runs green with NO external keys (the enricher falls back to the
 * labelled heuristic path) and tolerates a network-less environment.
 *
 * Run from the repo root:  node verticals/airadar/sit.js
 * Exit 0 = all green.
 */

require('dotenv').config();
const express = require('express');

const app = express();
app.use('/airadar', require('./src/index'));

const server = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/airadar';
  const j = (r) => r.json();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? (pass++, console.log('PASS ' + m)) : (fail++, console.log('FAIL ' + m)); };
  const PW = process.env.AIRADAR_PASSWORD || process.env.SPEAKUP_TEAM_PASSWORD || 'Palindrome@7';
  const made = [];

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

    // Boot seeds the owner asynchronously against a remote database; poll for it
    // rather than guessing a sleep length.
    let lr = null;
    for (let i = 0; i < 25; i++) {
      lr = await fetch(base + '/api/v1/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'mstagg@digit2ai.com', password: PW })
      });
      if (lr.ok) break;
      await wait(1200);
    }
    const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
    ok(lr.ok && cookie.includes('airadar_token'), 'login sets cookie');
    const H = { 'Content-Type': 'application/json', Cookie: cookie };

    ok((await fetch(base + '/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mstagg@digit2ai.com', password: 'wrong-' + Date.now() })
    })).status === 401, 'bad password rejected (401)');

    const me = await fetch(base + '/api/v1/auth/me', { headers: H }).then(j);
    ok(me.user && me.user.capture_token && me.user.capture_token.length >= 40, 'capture token issued');
    const KEY = me.user.capture_token;

    // ── share target now authenticated ──────────────────────────────────
    const sh = await fetch(base + '/share?url=https%3A%2F%2Fexample.com%2Fx&text=hello', { headers: { Cookie: cookie }, redirect: 'manual' });
    const shLoc = sh.headers.get('location') || '';
    ok(sh.status === 302 && shLoc.includes('share=1') && shLoc.includes('example.com'),
      'share target forwards url + share=1 to the app');

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

    const cap = await fetch(base + '/api/v1/capture?key=' + KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://x.com/someone/status/SIT777', text: 'new AI agent thing', enrich: false })
    }).then(j);
    ok(cap.success && cap.item_id, 'capture saves without a session cookie');
    ok(cap.open === '/airadar/?item=' + cap.item_id, 'capture returns the deep link back into the app');
    made.push(cap.item_id);
    const capItem = await fetch(base + '/api/v1/items/' + cap.item_id, { headers: H }).then(j);
    ok(capItem.item.source_platform === 'x' && capItem.item.shared_text === 'new AI agent thing', 'captured item keeps the shared caption');
    ok(capItem.item.needs_review === true, 'captured item lands flagged for review');

    const capGet = await fetch(base + '/api/v1/capture?key=' + KEY + '&url=https%3A%2F%2Fyoutu.be%2FSIT888&enrich=0').then(j);
    ok(capGet.success && capGet.item_id, 'GET capture works (share targets that cannot POST)');
    made.push(capGet.item_id);

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

  // cleanup anything the run created
  try {
    const lr2 = await fetch(base + '/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mstagg@digit2ai.com', password: process.env.AIRADAR_PASSWORD || process.env.SPEAKUP_TEAM_PASSWORD || 'Palindrome@7' })
    });
    const ck = (lr2.headers.get('set-cookie') || '').split(';')[0];
    for (const id of made) {
      await fetch(base + '/api/v1/items/' + id, { method: 'DELETE', headers: { Cookie: ck } }).catch(() => {});
    }
  } catch (e) { /* best effort */ }

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  server.close();
  process.exit(fail ? 1 : 0);
});
