'use strict';
/**
 * Style Studio SIT. Zero external keys: ANTHROPIC_API_KEY and FASHN_API_KEY are
 * removed before loading, the CRM users lookup is replaced by a fake, and the
 * try-on provider is a fake transport. Runs against the real database under
 * throwaway tenants 990301 / 990303 and deletes everything it made.
 *
 *   node -e "require('dotenv').config();require('./verticals/stylestudio/sit.js')"
 */
require('dotenv').config();
delete process.env.ANTHROPIC_API_KEY;
delete process.env.FASHN_API_KEY;
process.env.STYLE_STUDIO_RUNNER = 'off';
process.env.STYLE_STUDIO_WEATHER = 'off';
process.env.STYLE_STUDIO_OWNER_EMAILS = 'mstagg@digit2ai.com,sit2@example.com';
if (!process.env.JWT_SECRET && !process.env.STYLE_STUDIO_JWT_SECRET) process.env.STYLE_STUDIO_JWT_SECRET = 'sit-secret-0123456789abcdef';

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');

const ROOT = path.join(__dirname);
const router = require('./src/index');
const db = require('./src/db');
const stylist = require('./src/stylist');
const sketch = require('./src/sketch');
const llm = require('./src/llm');
const tryon = require('./src/tryon');
const catalog = require('./src/catalog');

const A = 990301, B = 990303;
let pass = 0, fail = 0; const failures = [];
const ok = (c, name) => { if (c) pass++; else { fail++; failures.push(name); } console.log((c ? '  PASS ' : '  FAIL ') + name); };

async function cleanup() {
  for (const t of ['sty_renders', 'sty_plan', 'sty_wear', 'sty_outfits', 'sty_photos', 'sty_items', 'sty_settings']) {
    await db.exec(`DELETE FROM ${t} WHERE tenant_id IN (:a,:b)`, { a: A, b: B });
  }
}

(async () => {
  const hash = await bcrypt.hash('sit-correct-horse', 10);
  const users = { [A]: { id: A, email: 'mstagg@digit2ai.com', password_hash: hash }, [B]: { id: B, email: 'sit2@example.com', password_hash: hash }, 990304: { id: 990304, email: 'stranger@example.com', password_hash: hash } };
  router._internal.setUserLookup(async (w) => w.email ? Object.values(users).find((u) => u.email === w.email) || null : users[w.id] || null);
  await router._internal.ready();
  await cleanup();

  const app = express(); app.set('trust proxy', true); app.use('/style-studio', router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/style-studio';
  const jar = {};
  async function req(who, method, p, body, extra = {}) {
    const h = { ...(extra.headers || {}) };
    if (who && jar[who]) h.Cookie = jar[who];
    if (method !== 'GET' && !extra.noHeader) h['X-Studio'] = '1';
    let b = body;
    if (body && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const r = await fetch(base + p, { method, headers: h, body: b, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (who && sc && /sty_token=/.test(sc)) jar[who] = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { s: r.status, d: data, h: r.headers, sc };
  }

  try {
    console.log('Auth');
    ok((await req(null, 'GET', '/health')).d.database === true, 'health reports the database');
    ok((await req(null, 'GET', '/api/v1/outfits')).s === 401, 'API without a session is 401');
    ok((await req('a', 'POST', '/api/v1/auth/login', { email: 'mstagg@digit2ai.com', password: 'wrong' })).s === 401, 'wrong password refused');
    ok((await req('x', 'POST', '/api/v1/auth/login', { email: 'stranger@example.com', password: 'sit-correct-horse' })).s === 401, 'a CRM user who is not the owner is refused');
    const lg = await req('a', 'POST', '/api/v1/auth/login', { email: 'mstagg@digit2ai.com', password: 'sit-correct-horse' });
    ok(lg.s === 200 && /Path=\/style-studio/.test(lg.sc) && /HttpOnly/.test(lg.sc) && /SameSite=Lax/.test(lg.sc), 'owner signs in; cookie scoped, HttpOnly, Lax');
    await req('b', 'POST', '/api/v1/auth/login', { email: 'sit2@example.com', password: 'sit-correct-horse' });
    const payload = JSON.parse(Buffer.from(jar.a.split('=')[1].split('.')[1], 'base64url').toString());
    ok(payload.fp && !hash.includes(payload.fp) && payload.fp !== hash.slice(-12), 'session token carries no piece of the password hash');
    ok((await req('a', 'POST', '/api/v1/items', { category: 'shirt', name: 'x' }, { noHeader: true })).s === 403, 'mutation without the X-Studio header is 403');

    console.log('Inventory and the 100-outfit matrix');
    const items = (await req('a', 'GET', '/api/v1/items')).d.items;
    ok(items.filter((i) => i.category === 'shirt').length === 20, '20 shirts (12 named + 8 slots)');
    ok(items.filter((i) => i.category === 'shirt' && i.is_slot).length === 8, '8 customisable shirt slots');
    ok(items.filter((i) => i.category === 'pants').length === 5 && items.filter((i) => i.category === 'shoes').length === 1, '5 trousers, 1 pair of shoes');
    let outs = (await req('a', 'GET', '/api/v1/outfits')).d;
    ok(outs.total === 100, '20 x 5 x 1 = 100 outfits (got ' + outs.total + ')');
    ok(outs.outfits.every((o) => o.shoe.name === 'White Veja sneakers'), 'every outfit wears the white Vejas');
    const shirt1 = items.find((i) => i.name === 'Light blue Oxford');
    await req('a', 'PATCH', '/api/v1/items/' + shirt1.id, { name: 'Sky blue Oxford (edited)', tenant_id: B });
    await catalog.seed(db, A);
    const after = (await req('a', 'GET', '/api/v1/items')).d.items.find((i) => i.id === shirt1.id);
    ok(after && after.name === 'Sky blue Oxford (edited)', 're-seeding never overwrites an edit');
    ok((await db.one('SELECT tenant_id FROM sty_items WHERE id=:id', { id: shirt1.id })).tenant_id === A, 'a tenant_id in the body is ignored');
    const newShirt = await req('a', 'POST', '/api/v1/items', { category: 'shirt', name: 'SIT navy Oxford', color_hex: '#1d2a4a', pattern: 'oxford' });
    ok(newShirt.s === 201 && (await req('a', 'GET', '/api/v1/outfits')).d.total === 105, 'adding a shirt adds 5 outfits');
    await req('a', 'DELETE', '/api/v1/items/' + newShirt.d.id);
    ok((await req('a', 'GET', '/api/v1/outfits')).d.total === 100, 'archiving it hides its outfits');

    console.log('Tenancy');
    const bOuts = (await req('b', 'GET', '/api/v1/outfits')).d;
    ok(bOuts.total === 100 && !bOuts.outfits.some((o) => outs.outfits.some((x) => x.id === o.id)), 'tenant B gets its own 100, none of A');
    const aOut = outs.outfits[0];
    ok((await req('b', 'GET', '/api/v1/outfits/' + aOut.id)).s === 404, "B cannot read A's outfit");
    ok((await req('b', 'PATCH', '/api/v1/items/' + shirt1.id, { name: 'hijack' })).s === 404, "B cannot edit A's item");
    ok((await req('b', 'PATCH', '/api/v1/outfits/' + aOut.id, { favorite: true })).s === 404, "B cannot favourite A's outfit");
    ok((await req('b', 'PUT', '/api/v1/plan/2030-01-01', { outfit_id: aOut.id })).s === 404, "B cannot plan A's outfit");
    ok((await req('b', 'GET', '/api/v1/outfits/' + aOut.id + '/sketch.svg')).s === 404, "B cannot render A's illustration");

    console.log('Photos');
    const exifJpeg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#c8313a' } }).withMetadata({ exif: { IFD0: { Artist: 'SIT secret' } } }).jpeg().toBuffer();
    const fd = new FormData(); fd.append('photos', new Blob([exifJpeg], { type: 'image/jpeg' }), 'shirt.jpg');
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(20)]);
    fd.append('photos', new Blob([heic]), 'photo.heic');
    fd.append('photos', new Blob([Buffer.from('not an image at all, just text')]), 'evil.jpg');
    const up = await req('a', 'POST', '/api/v1/items/' + shirt1.id + '/photos', fd);
    ok(up.s === 201 && up.d.results[0].ok, 'a JPEG uploads');
    ok(up.d.results[1].ok === false && /heic/.test(up.d.results[1].error), 'HEIC is refused with the fix');
    ok(up.d.results[2].ok === false && /not_an_image/.test(up.d.results[2].error), 'a non-image named .jpg is refused by its bytes');
    const photoId = up.d.results[0].id;
    const ph = await req('a', 'GET', '/api/v1/photos/' + photoId);
    const meta = await sharp(ph.d).metadata();
    ok(ph.s === 200 && !meta.exif, 'stored photo has its metadata stripped');
    ok(/private/.test(ph.h.get('cache-control')), 'photos are served private');
    ok((await req('b', 'GET', '/api/v1/photos/' + photoId)).s === 404, "B cannot fetch A's photo");
    ok((await req(null, 'GET', '/api/v1/photos/' + photoId)).s === 401, 'a photo without a session is 401');
    ok(fs.readdirSync(path.join(ROOT, 'public')).every((f) => !/\.(jpe?g|png|webp)$/i.test(f)), 'no photo lives in the public folder');
    const mf = new FormData(); mf.append('photo', new Blob([exifJpeg], { type: 'image/jpeg' }), 'me.jpg');
    ok((await req('a', 'POST', '/api/v1/model-photo', mf)).s === 400, 'reference photo needs the full-body confirmation');

    console.log('Illustration framing');
    outs = (await req('a', 'GET', '/api/v1/outfits')).d;
    const lb = outs.outfits.find((o) => o.shirt.id === shirt1.id);
    const svg = await req('a', 'GET', '/api/v1/outfits/' + lb.id + '/sketch.svg');
    const txt = svg.d.toString();
    ok(svg.s === 200 && /image\/svg\+xml/.test(svg.h.get('content-type')), 'illustration served as SVG');
    ok(/data:image\/jpeg;base64/.test(txt), 'an uploaded photo fills the shirt fabric');
    ok(!/<script/i.test(txt) && /default-src 'none'/.test(svg.h.get('content-security-policy')), 'SVG carries no script and a locked CSP');
    const B_ = sketch.BOUNDS, F = sketch.FRAME;
    ok(B_.headTop > 0 && B_.shoeBottom < F.h && B_.shoeLeft > 0 && B_.shoeRight < F.w, 'head and both shoes inside the 600x1200 frame');
    const allSvg = sketch.render({ shirt: { color_hex: '#ffffff', pattern: 'plaid', color2_hex: '#000000' }, pants: { color_hex: '#000000' }, shoe: {} });
    const ys = [...allSvg.matchAll(/[ML]\s*\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    ok(ys.length > 20 && Math.max(...ys) < F.h - 60 && Math.min(...ys) >= 0, 'every drawn point sits inside the frame with margin');
    ok((allSvg.match(/stroke-linecap="round" stroke-linejoin="round"/g) || []).length === 2, 'both sneakers carry the V');
    const png = await req('a', 'GET', '/api/v1/outfits/' + lb.id + '/download.png');
    const pm = await sharp(png.d).metadata();
    ok(png.s === 200 && pm.format === 'png' && pm.height === 2400 && png.h.get('x-image-kind') === 'sketch', 'high-resolution PNG (2400px), labelled as illustration');

    console.log('Stylist');
    const e1 = stylist.evaluate(lb.shirt, lb.pants), e2 = stylist.evaluate(lb.shirt, lb.pants);
    ok(JSON.stringify(e1) === JSON.stringify(e2), 'scores are deterministic');
    ok(outs.outfits.every((o) => o.eval.overall >= 1 && o.eval.overall <= 10 && o.eval.color >= 1 && o.eval.color <= 10 && o.eval.recommended.length >= 1), 'every outfit scored 1-10 with at least one occasion');
    const spread = new Set(outs.outfits.map((o) => o.eval.overall));
    ok(spread.size >= 4, 'scores actually discriminate (' + [...spread].sort().join(',') + ')');
    const weak = stylist.evaluate({ name: 'P', color_hex: '#e9dfcf', color2_hex: '#3d6fa8', pattern: 'plaid' }, { name: 'LD', garment_type: 'denim', color_name: 'Light blue denim', color_hex: '#8eaacb' });
    ok(!/works because/.test(weak.explanation) && /weaker/.test(weak.explanation), 'a weak pairing is never described as working');
    const corp = stylist.evaluate({ name: 'W', color_hex: '#f7f6f2', pattern: 'oxford' }, { name: 'LD', garment_type: 'denim', color_name: 'Light blue denim', color_hex: '#8eaacb' });
    ok(corp.occasions.find((o) => o.key === 'corporate').fit <= 5, 'light denim is never rated for corporate meetings');
    ok(stylist.OCC_KEYS.length === 8, 'all eight occasions supported');
    const adv = await req('a', 'POST', '/api/v1/outfits/' + lb.id + '/advice');
    ok(adv.d.composed_by === 'rules' && adv.d.is_simulated === true, 'no model = labelled rules text');
    ok(!llm.acceptRewrite('This scores a 9 out of 10.', 'x') && !llm.acceptRewrite('A guarantee you will look great.', 'x') && llm.acceptRewrite('A crisp, easy pairing for the office.', 'x'), 'a model rewrite with a number or a promise is discarded');

    console.log('Favourites, today, planner, history');
    ok((await req('a', 'GET', '/api/v1/export/catalog.pdf?scope=favorites')).s === 404, 'favourites PDF with no favourites is 404');
    await req('a', 'PATCH', '/api/v1/outfits/' + lb.id, { favorite: true, rating: 5 });
    ok((await req('a', 'PATCH', '/api/v1/outfits/' + lb.id, { rating: 9 })).s === 400, 'a rating outside 1-5 is refused');
    const favs = (await req('a', 'GET', '/api/v1/outfits?favorite=1')).d;
    ok(favs.total === 1 && favs.outfits[0].rating === 5, 'favourite and rating saved');
    const pdf = await req('a', 'GET', '/api/v1/export/catalog.pdf?scope=favorites');
    ok(pdf.s === 200 && pdf.d.slice(0, 4).toString() === '%PDF', 'favourites PDF catalog is a PDF');
    const t1 = (await req('a', 'GET', '/api/v1/today?occasion=corporate')).d;
    ok(t1.picks.length === 3 && t1.picks.every((p) => !p.shirt.is_slot), 'today gives 3 picks, never an empty slot');
    ok(t1.weather_used === false && /Weather was not used/.test(t1.basis), 'weather off is stated, not implied');
    await req('a', 'POST', '/api/v1/outfits/' + t1.picks[0].id + '/worn', {});
    const t2 = (await req('a', 'GET', '/api/v1/today?occasion=corporate')).d;
    ok(t2.picks[0].id !== t1.picks[0].id, 'what was worn this week drops out of the top pick');
    ok((await req('a', 'PUT', '/api/v1/plan/2030-01-06', { outfit_id: lb.id, occasion: 'dinner' })).s === 200, 'plan a day');
    ok((await req('a', 'PUT', '/api/v1/plan/2026-02-31', { outfit_id: lb.id })).s === 400, 'an impossible date is refused, not a 500');
    ok((await req('a', 'GET', '/api/v1/plan?from=2030-01-01')).d.plan.some((p) => p.date === '2030-01-06' && p.outfit_id === lb.id), 'planned day reads back');
    ok((await req('a', 'GET', '/api/v1/history')).d.history.length === 1, 'history shows the worn outfit');
    const cmp = (await req('a', 'GET', '/api/v1/compare/' + shirt1.id)).d;
    ok(cmp.outfits.length === 5, 'compare one shirt against all five trousers');
    const cpng = await req('a', 'GET', '/api/v1/compare/' + shirt1.id + '/download.png');
    ok(cpng.s === 200 && (await sharp(cpng.d).metadata()).format === 'png', 'comparison PNG exports');

    console.log('Try-on: provider, consent, cache');
    ok((await req('a', 'POST', '/api/v1/renders', { outfit_ids: [lb.id] })).d.error === 'no_provider', 'no provider key = refused, illustration stays');
    process.env.FASHN_API_KEY = 'sit-fake';
    let calls = 0; const sent = [];
    tryon._setTransport(async (url, o) => {
      calls++; if (o && o.body) sent.push(o.body);
      const json = (j) => ({ ok: true, status: 200, json: async () => j, arrayBuffer: async () => new ArrayBuffer(0) });
      if (/\/run$/.test(url)) return json({ id: 'pred_' + calls, error: null });
      if (/\/status\//.test(url)) return json({ id: 'x', status: 'completed', output: ['data:image/jpeg;base64,' + exifJpeg.toString('base64')], error: null });
      return json({});
    });
    ok((await req('a', 'POST', '/api/v1/renders', { outfit_ids: [lb.id] })).d.error === 'consent_required', 'nothing is sent without consent');
    await req('a', 'PUT', '/api/v1/settings', { consent: true });
    ok((await req('a', 'POST', '/api/v1/renders', { outfit_ids: [lb.id] })).d.error === 'no_model_photo', 'nothing is sent without a reference photo');
    const mf2 = new FormData(); mf2.append('photo', new Blob([exifJpeg], { type: 'image/jpeg' }), 'me.jpg'); mf2.append('full_body', 'true');
    ok((await req('a', 'POST', '/api/v1/model-photo', mf2)).s === 201, 'reference photo saved with confirmation');
    const r1 = (await req('a', 'POST', '/api/v1/renders', { outfit_ids: [lb.id] })).d;
    ok(r1.ok && r1.results[0].status === 'needs_photo' && r1.results[0].missing.some((m) => /denim|khaki|grey|Levi/i.test(m)), 'a garment with no photo is named, not guessed');
    const fd2 = new FormData(); fd2.append('photos', new Blob([exifJpeg], { type: 'image/jpeg' }), 'pants.jpg');
    await req('a', 'POST', '/api/v1/items/' + lb.pants.id + '/photos', fd2);
    const r2 = (await req('a', 'POST', '/api/v1/renders', { outfit_ids: [lb.id] })).d;
    ok(r2.results[0].status === 'queued', 'render queued');
    // Queueing kicks the background runner; wait for the job to finish.
    for (let i = 0; i < 100; i++) {
      const st = await db.one('SELECT status FROM sty_renders WHERE id=:id', { id: r2.results[0].render_id });
      if (st && (st.status === 'done' || st.status === 'failed')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    ok(calls === 4 && sent.length === 2 && sent.every((b) => /"model_name":"tryon-v1.6"/.test(b)), 'two provider runs (shirt, then trousers) + two status polls');
    ok(/"category":"tops"/.test(sent[0]) && /"category":"bottoms"/.test(sent[1]), 'shirt sent as tops, trousers as bottoms');
    const rend = (await req('a', 'GET', '/api/v1/outfits/' + lb.id)).d.outfit;
    ok(rend.render_status === 'done' && rend.render_id, 'render stored');
    ok((await req('a', 'GET', '/api/v1/outfits/' + lb.id + '/render')).s === 200, 'owner can view the render');
    ok((await req('b', 'GET', '/api/v1/outfits/' + lb.id + '/render')).s === 404, "B cannot view A's render");
    const before = calls;
    const r3 = (await req('a', 'POST', '/api/v1/renders', { outfit_ids: [lb.id] })).d;
    ok(r3.results[0].status === 'cached' && calls === before, 'same photos = cached, no second paid call');
    const png2 = await req('a', 'GET', '/api/v1/outfits/' + lb.id + '/download.png');
    ok(png2.h.get('x-image-kind') === 'render', 'download uses the render once it exists');
    await req('a', 'PUT', '/api/v1/settings', { consent: false });
    ok((await req('a', 'POST', '/api/v1/renders', { outfit_ids: [lb.id] })).d.error === 'consent_required', 'withdrawing consent stops new renders');

    console.log('Privacy');
    ok((await req('a', 'POST', '/api/v1/privacy/delete', { what: ['renders'] })).s === 400, 'delete needs an explicit confirm');
    const del = (await req('a', 'POST', '/api/v1/privacy/delete', { confirm: 'delete', what: ['renders', 'model', 'garments'] })).d;
    ok(del.deleted.renders >= 1 && del.deleted.model_photos >= 1 && del.deleted.garment_photos >= 2, 'renders, reference and garment photos deleted');
    ok((await req('a', 'GET', '/api/v1/items')).d.items.length === 26, 'deleting photos never deletes a garment');

    console.log('Structure');
    const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const files = fs.readdirSync(path.join(ROOT, 'src'));
    ok(files.filter((f) => /@anthropic-ai\/sdk/.test(src(f))).join() === 'llm.js', 'llm.js is the only file that reaches a model');
    ok(files.filter((f) => /fashn/i.test(src(f))).join() === 'tryon.js', 'tryon.js is the only file that reaches the try-on provider');
    ok(!files.some((f) => /sendgrid|nodemailer|twilio/i.test(src(f))), 'no message transport anywhere');
    ok(!/req\.body\.tenant|body\.tenant_id/.test(src('index.js')), 'tenant never read from a request body');
  } catch (e) {
    fail++; failures.push('crashed: ' + e.message); console.error(e);
  } finally {
    await cleanup().catch(() => {});
    srv.close();
    console.log(`\nStyle Studio SIT: ${pass}/${pass + fail}` + (fail ? '  FAILED: ' + failures.join(' | ') : ''));
    console.log('NOT covered: a real FASHN call, a real Anthropic call, real weather, the CRM users table, a browser.');
    await db.sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
