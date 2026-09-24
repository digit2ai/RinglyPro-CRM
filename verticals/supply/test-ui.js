'use strict';

/**
 * RinglyPro Supply — browser smoke test. `node verticals/supply/test-ui.js`
 * Signs up a throwaway company, seeds a product/contractor/campaign through the
 * API, then opens every screen at 1280 and 390 wide and fails on a page error,
 * a "Could not load" card, or horizontal overflow on the phone. Skips LOUDLY
 * without puppeteer. Deletes its tenant afterwards.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
delete process.env.ANTHROPIC_API_KEY;
process.env.SUPPLY_DIALER = 'off';
const http = require('http');
const express = require('express');
let puppeteer; try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIPPED: puppeteer not installed'); process.exit(0); }
const db = require('./src/db');

let pass = 0; let fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  FAIL', n, x || ''); } };

(async () => {
  await db.ensureSchema();
  const app = express(); app.use('/supply', require('./src/index'));
  const server = http.createServer(app).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port + '/supply';
  const stamp = Date.now(); let tenantId = null;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/', { waitUntil: 'networkidle0' });
    ok(await page.$eval('h1', (h) => h.textContent.includes('contractors')), 'landing renders');
    await page.goto(base + '/login?mode=signup', { waitUntil: 'networkidle0' });
    await page.type('#company', 'SIT Supply UI ' + stamp); await page.type('#name', 'UI Owner');
    await page.type('#email', `sit-sup-ui-${stamp}@example.com`); await page.type('#password', 'ui-password-123');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#go')]);
    ok(page.url().endsWith('/supply/app'), 'signup lands in the app', page.url());
    const me = await page.evaluate(async (b) => (await fetch(b + '/api/v1/auth/me')).json(), base);
    tenantId = me.tenant.id;
    const call = (m, p, body) => page.evaluate(async (b, m2, p2, bd) => { const r = await fetch(b + '/api/v1' + p2, { method: m2, headers: { 'Content-Type': 'application/json', 'X-Supply': '1' }, body: bd ? JSON.stringify(bd) : undefined }); return r.json(); }, base, m, p, body);
    const prod = await call('POST', '/products', { sku: 'LV-100', name: 'Luxury Vinyl Flooring', category: 'Flooring', unit: 'sq ft', quantity_available: 20000, selling_price: 1.89 });
    await call('POST', `/products/${prod.id}/analyze`);
    const cats = await call('GET', '/categories');
    const ctr = await call('POST', '/contractors', { company_name: 'ABC Flooring LLC', phone: '813-555-0199', category_id: cats.find((c) => c.name === 'Flooring Contractors').id, state: 'FL' });
    const camp = await call('POST', '/campaigns', { campaign_name: 'LVP push', product_ids: [prod.id] });
    const screens = ['dashboard', 'products', 'product/' + prod.id, 'pricing', 'contractors', 'contractor/' + ctr.id, 'buyers', 'campaigns', 'campaign/' + camp.id, 'calls', 'conversations', 'pipeline', 'commissions', 'agents', 'ghl', 'reports', 'settings'];
    for (const width of [1280, 390]) {
      await page.setViewport({ width, height: 850 });
      for (const s of screens) {
        await page.goto(base + '/app#' + s, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => { const v = document.querySelector('#view'); return v && !/Loading…/.test(v.textContent); }, { timeout: 15000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 200));
        const txt = await page.$eval('#view', (v) => v.textContent);
        ok(!/Could not load|Loading…/.test(txt), `${s} @${width} loads`, txt.slice(0, 160));
        if (width === 390) ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${s} @390 has no horizontal page scroll`);
      }
    }
    await page.setViewport({ width: 1280, height: 850 });
    await page.goto(base + '/app#campaign/' + camp.id, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-to]', { timeout: 15000 }).catch(() => {});
    ok(await page.$('[data-to="pending_approval"]') !== null, 'campaign screen offers Submit for approval');
    ok(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { ok(false, 'exception', e.stack); } finally {
    await browser.close();
    if (tenantId) {
      for (const t of ['sup_audit', 'sup_campaign_targets', 'sup_campaigns', 'sup_contractors', 'sup_product_relevance', 'sup_products', 'sup_categories', 'sup_competitors', 'sup_sales_reps', 'sup_users', 'sup_integration_health']) await db.run(`DELETE FROM ${t} WHERE tenant_id = :t`, { t: tenantId });
      await db.run('DELETE FROM sup_tenants WHERE id = :t', { t: tenantId });
    }
    server.close(); await db.sequelize.close();
    console.log(`RinglyPro Supply UI: ${pass}/${pass + fail} passed`);
    process.exit(fail ? 1 : 0);
  }
})();
