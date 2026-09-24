'use strict';

/**
 * RinglyPro Supply — SIT. `node verticals/supply/sit.js`
 *
 * Zero external keys: ANTHROPIC_API_KEY is removed (rules path under test),
 * the dialer loop is off, and a FAKE CommunicationProvider stands in for
 * GoHighLevel (the real GoHighLevelProvider is exercised separately against a
 * fake HTTP transport). Uses the database in .env with throwaway tenants named
 * "SIT Supply ..." and deletes every row it made.
 *
 * Runs the 18-step acceptance scenario from the build brief, then attacks the
 * invariants: tenant isolation, DNC, idempotency, first-touch attribution,
 * no unverified price claim, approval gates, provider failure handling.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
delete process.env.ANTHROPIC_API_KEY;
process.env.SUPPLY_DIALER = 'off';
process.env.SUPPLY_MODEL = 'off';

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

let pass = 0; let fail = 0; const failures = [];
function ok(cond, name, extra) { if (cond) { pass++; } else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  FAIL', name, extra || ''); } }
const section = (s) => console.log('\n== ' + s);

const db = require('./src/db');
const comms = require('./src/communications');
const { CommunicationProvider, NotConnectedProvider } = require('./src/communications/CommunicationProvider');
const ghl = require('./src/communications/GoHighLevelProvider');

// ── Fake provider ──
class FakeProvider extends CommunicationProvider {
  constructor() { super(); this.name = 'fake'; this.contacts = new Map(); this.fields = new Map(); this.enrolled = []; this.logs = []; this.opps = []; this.failNext = null; this.seq = 0; }
  capabilities() { return { outbound_ai_call: 'fake' }; }
  async health() { return { ok: true, detail: 'fake' }; }
  async upsertContact(t, c) { if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } const key = t.id + ':' + c.phone_e164; if (!this.contacts.has(key)) this.contacts.set(key, 'fc_' + (++this.seq)); return { externalId: this.contacts.get(key) }; }
  async setContactContext(t, id, f) { this.fields.set(id, Object.assign({}, this.fields.get(id), f)); return { ok: true }; }
  async startOutboundCall(t, { externalContactId, campaign }) { if (!campaign.agent.ghl_workflow_id) throw Object.assign(new Error('no wf'), { code: 'NO_WORKFLOW' }); this.enrolled.push({ tenant: t.id, contact: externalContactId, wf: campaign.agent.ghl_workflow_id }); return { accepted: true, mode: 'fake', providerRef: null }; }
  async listCallLogs(t, { contactId } = {}) { return contactId ? this.logs.filter((l) => l.externalContactId === contactId) : this.logs.slice(); }
  async upsertOpportunity(t, o) { this.opps.push(o); return { externalId: o.externalId || 'opp_' + this.opps.length }; }
  parseWebhook(b) { return ghl.parseGhlWebhook(b); }
}
const fake = new FakeProvider();
comms._inject(() => fake);

const created = { tenants: [], users: [] };
let server; let base;

async function req(jar, method, url, body, extraHeaders = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json', 'X-Supply': '1' }, extraHeaders);
  if (jar && jar.cookie) headers.Cookie = jar.cookie;
  const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : (Buffer.isBuffer(body) || body instanceof FormData ? body : JSON.stringify(body)), redirect: 'manual' });
  const sc = r.headers.get('set-cookie');
  if (jar && sc) jar.cookie = sc.split(';')[0];
  let data = null; const txt = await r.text(); try { data = JSON.parse(txt); } catch (e) { data = txt; }
  return { status: r.status, data };
}

async function cleanup() {
  const ids = created.tenants;
  if (!ids.length) return;
  const tables = ['sup_audit', 'sup_webhook_events', 'sup_commissions', 'sup_sales', 'sup_transfers', 'sup_buyers', 'sup_calls', 'sup_campaign_targets', 'sup_campaigns',
    'sup_suppression', 'sup_contractors', 'sup_competitor_prices', 'sup_competitors', 'sup_product_relevance', 'sup_products', 'sup_categories', 'sup_sales_reps', 'sup_integration_health', 'sup_users'];
  for (const t of tables) await db.run(`DELETE FROM ${t} WHERE tenant_id IN (:ids)`, { ids });
  await db.run('DELETE FROM sup_tenants WHERE id IN (:ids)', { ids });
}

(async () => {
  await db.ensureSchema();
  const app = express();
  app.use('/supply', require('./src/index'));
  server = http.createServer(app).listen(0);
  base = 'http://127.0.0.1:' + server.address().port + '/supply';
  const stamp = Date.now();
  const A = {}; const B = {}; const REP = {};
  try {
    // ───────────────────────── static greps ─────────────────────────
    section('Source invariants');
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const src = walk(path.join(__dirname, 'src')).filter((f) => f.endsWith('.js'));
    const read = (f) => fs.readFileSync(f, 'utf8');
    ok(!src.some((f) => /require\(['"]twilio['"]\)|twilio\.com/i.test(read(f))), 'no Twilio dependency anywhere in the vertical');
    ok(src.filter((f) => /leadconnectorhq/.test(read(f))).every((f) => f.endsWith('GoHighLevelProvider.js')), 'GHL API host appears only in GoHighLevelProvider.js');
    ok(src.filter((f) => /@anthropic-ai\/sdk/.test(read(f))).map((f) => path.basename(f)).join() === 'llm.js', 'llm.js is the only file that reaches a model');
    const ALLOW = new Set(['tenants.js', 'webhooks.js']);
    const unscoped = src.filter((f) => f.includes(path.sep + 'services' + path.sep) && !ALLOW.has(path.basename(f)) && /\bdb\.(q|one|run)\(/.test(read(f)));
    ok(unscoped.length === 0, 'business services never use the unscoped db helpers', unscoped.map((f) => path.basename(f)).join());
    ok(/tenantByToken[\s\S]*db\.one/.test(read(path.join(__dirname, 'src/services/webhooks.js'))) && (read(path.join(__dirname, 'src/services/webhooks.js')).match(/\bdb\.one\(/g) || []).length === 1, 'webhooks.js uses an unscoped query only to resolve the tenant from its token');

    section('Tenant guard in the data layer');
    let threw = null; try { await db.tq(1, 'SELECT * FROM sup_products'); } catch (e) { threw = e.code; }
    ok(threw === 'TENANT_PREDICATE', 'a query without tenant_id = :tenant throws');
    threw = null; try { await db.tq(0, 'SELECT * FROM sup_products WHERE tenant_id = :tenant'); } catch (e) { threw = e.code; }
    ok(threw === 'TENANT_SCOPE', 'a missing tenant id throws');
    threw = null; try { await db.trun(1, 'INSERT INTO sup_audit (tenant_id, action) VALUES (5, \'x\')'); } catch (e) { threw = e.code; }
    ok(threw === 'TENANT_PREDICATE', 'an insert that hardcodes another tenant id throws');

    // ───────────────────────── signup two tenants ─────────────────────────
    section('Signup + tenant isolation');
    A.jar = {}; B.jar = {};
    let r = await req(A.jar, 'POST', '/api/v1/auth/signup', { company: 'SIT Supply ABC Hardware ' + stamp, email: `sit-sup-a-${stamp}@example.com`, password: 'sit-password-A-1', name: 'Alice Owner' });
    ok(r.status === 200 && r.data.tenant, 'tenant A signs up', JSON.stringify(r.data));
    A.tenant = r.data.tenant; created.tenants.push(A.tenant.id);
    r = await req(B.jar, 'POST', '/api/v1/auth/signup', { company: 'SIT Supply XYZ Building ' + stamp, email: `sit-sup-b-${stamp}@example.com`, password: 'sit-password-B-1', name: 'Bob Owner' });
    B.tenant = r.data.tenant; created.tenants.push(B.tenant.id);
    ok(A.tenant.id !== B.tenant.id, 'two separate tenants');
    ok(A.tenant.status === 'trial' && !('ghl_secret_enc' in A.tenant), 'new tenant is a trial and never returns the encrypted token');
    r = await req(A.jar, 'POST', '/api/v1/auth/signup', { company: 'x', email: 'y@example.com', password: 'Palindrome@7' });
    ok(r.status === 400, 'published password refused');
    r = await req({}, 'POST', '/api/v1/products', { name: 'x' });
    ok(r.status === 401, 'no session = 401', r.status + ' ' + JSON.stringify(r.data));
    r = await req(A.jar, 'POST', '/api/v1/products', { name: 'x' }, { 'X-Supply': '' });
    ok(r.status === 403, 'mutation without the X-Supply header refused');
    // Calling hours wide open for the test
    r = await req(A.jar, 'PATCH', '/api/v1/tenant/settings', { calling_days: [0, 1, 2, 3, 4, 5, 6], calling_start: '00:00', calling_end: '23:59' });
    ok(r.status === 200, 'tenant settings saved');
    r = await req(A.jar, 'GET', '/api/v1/categories');
    ok(Array.isArray(r.data) && r.data.length === 14, '14 default contractor categories seeded', String(r.data.length));
    A.cats = Object.fromEntries(r.data.map((c) => [c.name, c.id]));

    // Sales rep Samuel (configurable, not hardcoded)
    r = await req(A.jar, 'POST', '/api/v1/reps', { name: 'Samuel', phone: '813-555-0100', commission_pct: 5, is_default: true });
    ok(r.status === 200 && r.data.phone === '+18135550100', 'rep Samuel configured with E.164 phone');
    REP.samuel = r.data;

    // ───────────────────────── STEP 1 product ─────────────────────────
    section('Acceptance 1: product exists');
    r = await req(A.jar, 'POST', '/api/v1/products', { sku: 'LV-100', name: 'Luxury Vinyl Flooring', category: 'Flooring', material: 'vinyl', brand: 'Coastline', model: 'CL-LVP-7', unit: 'sq ft',
      quantity_available: 20000, cost: 1.2, selling_price: 1.89, minimum_price: 1.6, description: 'Waterproof luxury vinyl plank (LVP), 7 in wide, click lock' });
    ok(r.status === 200 && r.data.sku === 'LV-100', 'LV-100 created', JSON.stringify(r.data));
    A.lv = r.data;
    r = await req(A.jar, 'POST', '/api/v1/products', { sku: 'LV-100', name: 'dup' });
    ok(r.status === 409, 'duplicate SKU refused');
    r = await req(A.jar, 'POST', '/api/v1/products', { name: 'Bad', selling_price: 2, minimum_price: 3 });
    ok(r.status === 400, 'minimum price above selling price refused');
    // CSV import via the real parser
    const XLSX = require('xlsx');
    const csv = 'Item #,Product Name,Department,Price,Qty,UOM,Wear Layer\nDT-200,Primed Door Trim Casing,Millwork,0.89,4000,lf,\nLV-100,Luxury Vinyl Flooring,Flooring,1.89,20000,sq ft,20 mil\n,No Name Row,,,,,\n';
    const rows = XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(csv), { type: 'buffer' }).Sheets.Sheet1, { defval: '', raw: false });
    const catalog = require('./src/services/catalog');
    const rep = await catalog.importRows(A.tenant.id, rows, null);
    ok(rep.created === 2 && rep.updated === 1 && rep.failed === 0, 'CSV import: 2 created (incl. a name-only row), LV-100 updated by SKU', JSON.stringify(rep));
    ok(rep.unmapped_columns.includes('Wear Layer'), 'unknown column reported and kept as an attribute');
    const lvAfter = await catalog.get(A.tenant.id, A.lv.id);
    ok(lvAfter.attributes['Wear Layer'] === '20 mil', 'extra spec stored in attributes');
    const fd = new FormData(); fd.append('file', new Blob([Buffer.from('SKU,Name,Price\nX-1,Test Upload Item,5\n')]), 'p.csv');
    const up = await fetch(base + '/api/v1/products/import', { method: 'POST', headers: { 'X-Supply': '1', Cookie: A.jar.cookie }, body: fd });
    const upj = await up.json();
    ok(up.status === 200 && upj.created === 1, 'multipart CSV upload endpoint imports', JSON.stringify(upj));

    // ───────────────────────── STEP 2 intelligence ─────────────────────────
    section('Acceptance 2: product intelligence');
    r = await req(A.jar, 'POST', `/api/v1/products/${A.lv.id}/analyze`);
    const rel = Object.fromEntries(r.data.map((x) => [x.category, x.relevance_score]));
    ok(rel['Flooring Contractors'] >= 85, 'flooring contractors rank high', String(rel['Flooring Contractors']));
    ok(rel['Remodeling Companies'] >= 70 && rel['General Contractors'] >= 50, 'remodelers and general contractors relevant', JSON.stringify(rel));
    ok(rel['Plumbers'] < 20 && rel['Roofers'] < 20, 'plumbers and roofers not relevant', `${rel.Plumbers}/${rel.Roofers}`);
    ok(rel['Flooring Contractors'] > rel['General Contractors'], 'specialist outranks generalist');
    ok(r.data.every((x) => x.source === 'rules' && x.reasoning_summary), 'every score labelled rules and explained');
    r = await req(A.jar, 'PUT', `/api/v1/products/${A.lv.id}/relevance`, { category_id: A.cats['Interior Designers'], score: 40, reason: 'Designers spec it for clients' });
    await req(A.jar, 'POST', `/api/v1/products/${A.lv.id}/analyze`);
    r = await req(A.jar, 'GET', `/api/v1/products/${A.lv.id}`);
    const des = r.data.relevance.find((x) => x.category === 'Interior Designers');
    ok(des.relevance_score === 40 && des.source === 'manual', 'a manual score survives re-analysis');

    // ───────────────────────── STEP 3 competitive pricing ─────────────────────────
    section('Acceptance 3: competitive pricing (verified only)');
    const today = new Date().toISOString().slice(0, 10);
    r = await req(A.jar, 'POST', '/api/v1/prices', { product_id: A.lv.id, competitor: 'Home Depot', competitor_product: 'Coastline Luxury Vinyl Plank', competitor_brand: 'Coastline', competitor_model: 'CL-LVP-7',
      competitor_price: 2.69, competitor_unit: 'sq ft', date_checked: today, competitor_url: 'https://www.homedepot.com/p/example' });
    ok(r.status === 200 && Number(r.data.match_confidence) >= 0.95 && r.data.verified === true, 'same brand+model = verified', JSON.stringify(r.data && r.data.match_basis));
    ok(Math.abs(Number(r.data.savings_percentage) - 29.74) < 0.1, 'savings computed from our price (29.7%)', String(r.data.savings_percentage));
    r = await req(A.jar, 'POST', '/api/v1/prices', { product_id: A.lv.id, competitor: "Lowe's", competitor_product: 'Vinyl plank flooring', competitor_price: 2.99, competitor_unit: 'sq ft', date_checked: today });
    ok(r.data.verified === false && Number(r.data.match_confidence) <= 0.5, 'name-only similarity is NOT verified', String(r.data.match_confidence));
    r = await req(A.jar, 'POST', '/api/v1/prices', { product_id: A.lv.id, competitor: 'Local Hardware Stores', competitor_product: 'Coastline LVP', competitor_brand: 'Coastline', competitor_model: 'CL-LVP-7', competitor_price: 59, competitor_unit: 'carton', date_checked: today });
    ok(Number(r.data.match_confidence) <= 0.3, 'unit mismatch caps confidence at 0.30');
    r = await req(A.jar, 'POST', '/api/v1/prices', { product_id: A.lv.id, competitor: 'Home Depot', competitor_product: 'x', competitor_price: 3, date_checked: '2099-01-01' });
    ok(r.status === 400, 'a future check date is refused');
    const offers = require('./src/services/offers');
    const tA = await require('./src/services/tenants').get(A.tenant.id);
    const doorOffer = await offers.build(tA, { productIds: [(await catalog.list(A.tenant.id, { q: 'DT-200' }))[0].id] });
    ok(!doorOffer.has_verified_comparison && !/home depot|lowe|below|cheaper/i.test(doorOffer.talking_points.join(' ') + doorOffer.value_proposition), 'no verified price = no comparison in the offer');
    ok(offers.guard('We are 30% cheaper', 'price 1.89', false) === false && offers.guard('Only $1.89 per sq ft', 'price 1.89', false) === true, 'number/claim guard on model rewrites');

    // ───────────────────────── contractors ─────────────────────────
    section('Contractors, dedupe, DNC');
    r = await req(A.jar, 'POST', '/api/v1/contractors', { company_name: 'ABC Flooring LLC', contact_name: 'Jose Martinez', phone: '(813) 555-0123', category_id: A.cats['Flooring Contractors'], city: 'Tampa', state: 'fl', zip: '33602', consent_status: 'business_published' });
    ok(r.status === 200 && r.data.phone_e164 === '+18135550123' && r.data.state === 'FL', 'contractor created, phone normalized');
    A.abc = r.data;
    r = await req(A.jar, 'POST', '/api/v1/contractors', { company_name: 'abc flooring', phone: '8135550123' });
    ok(r.status === 409 && r.data.duplicate_id === A.abc.id, 'duplicate phone refused with the existing id');
    r = await req(A.jar, 'POST', '/api/v1/contractors', { company_name: 'ABC Flooring', city: 'Tampa', zip: '33602' });
    ok(r.status === 409, 'duplicate company in same ZIP refused');
    r = await req(A.jar, 'POST', '/api/v1/contractors', { company_name: 'Bay Remodel Co', contact_name: 'Ann', phone: '813-555-0124', category_id: A.cats['Remodeling Companies'], state: 'FL' });
    A.bay = r.data;
    r = await req(A.jar, 'POST', '/api/v1/contractors', { company_name: 'No Call Floors', phone: '813-555-0125', category_id: A.cats['Flooring Contractors'], state: 'FL' });
    A.dnc = r.data;
    r = await req(A.jar, 'POST', '/api/v1/suppression', { phone: '813-555-0125', reason: 'do_not_call' });
    ok(r.status === 200, 'number added to Do Not Call');
    r = await req(A.jar, 'POST', '/api/v1/contractors', { company_name: 'Pipe Pros Plumbing', phone: '813-555-0126', category_id: A.cats['Plumbers'], state: 'FL' });
    A.plumb = r.data;
    r = await req(A.jar, 'POST', '/api/v1/contractors', { company_name: 'Texas Floors', phone: '512-555-0127', category_id: A.cats['Flooring Contractors'], state: 'TX' });
    A.tx = r.data;
    const cimp = await require('./src/services/contractors').importRows(A.tenant.id, [{ Company: 'ABC Flooring LLC', Phone: '813.555.0123', Email: 'jose@abcflooring.example' }, { Company: 'Fresh Tile', Phone: 'garbage' }], null);
    ok(cimp.merged === 1 && cimp.failed === 1, 'import merges a duplicate into the existing row and reports a bad phone', JSON.stringify(cimp));

    // Tenant B cannot see or touch A
    section('Cross-tenant attacks');
    r = await req(B.jar, 'GET', `/api/v1/products/${A.lv.id}`);
    ok(r.status === 404, 'B cannot read A product by id');
    r = await req(B.jar, 'PATCH', `/api/v1/contractors/${A.abc.id}`, { notes: 'hijack' });
    ok(r.status === 404, 'B cannot edit A contractor');
    r = await req(B.jar, 'GET', '/api/v1/contractors');
    ok(Array.isArray(r.data) && r.data.length === 0, 'B contractor list is empty');
    r = await req(B.jar, 'POST', '/api/v1/campaigns', { campaign_name: 'steal', product_ids: [A.lv.id] });
    ok(r.status === 400, 'B cannot build a campaign on A product ids');
    r = await req(B.jar, 'GET', '/api/v1/prices', undefined, { 'X-Supply-Tenant': String(A.tenant.id) });
    ok(Array.isArray(r.data) && r.data.length === 0, 'X-Supply-Tenant header ignored for non-super-admins');
    r = await req(B.jar, 'GET', '/api/v1/platform/overview');
    ok(r.status === 404, 'platform overview hidden from tenant users');
    r = await req(B.jar, 'PATCH', '/api/v1/ghl', { source: 'crm_client', crm_client_id: 15 });
    ok(r.status === 403, 'a tenant cannot attach itself to a CRM client GHL connection');

    // Rep role
    r = await req(A.jar, 'POST', '/api/v1/tenant/users', { email: `sit-sup-rep-${stamp}@example.com`, password: 'sit-rep-pass-1', name: 'Rita Rep', role: 'rep' });
    ok(r.status === 200, 'owner adds a rep user');
    const REPJAR = {}; await req(REPJAR, 'POST', '/api/v1/auth/login', { email: `sit-sup-rep-${stamp}@example.com`, password: 'sit-rep-pass-1' });

    // ───────────────────────── STEP 4 generator ─────────────────────────
    section('Acceptance 4-5: AI campaign generator + approval');
    r = await req(A.jar, 'POST', '/api/v1/campaigns/generate', {});
    ok(r.status === 200 && r.data.proposals.length >= 1, 'generator proposes a campaign', JSON.stringify(r.data).slice(0, 300));
    const prop = r.data.proposals.find((p) => p.campaign.product_ids.includes(A.lv.id));
    ok(!!prop, 'LV-100 is proposed (verified saving + stock)');
    A.camp = prop.campaign;
    ok(A.camp.status === 'draft' && A.camp.generated_by === 'rules', 'proposal is a draft labelled rules');
    ok(/29|30%|Verified/.test(A.camp.rationale), 'rationale cites the verified advantage', A.camp.rationale);
    ok(A.camp.offer.has_verified_comparison && A.camp.talking_points.some((t) => /about 30% below the Home Depot price of \$2\.69/.test(t)), 'talking point quotes the verified comparison', A.camp.talking_points.join(' | '));
    ok(A.camp.sales_rep_id === REP.samuel.id, 'default rep (Samuel) assigned from configuration');
    r = await req(A.jar, 'GET', `/api/v1/campaigns/${A.camp.id}/preview`);
    const inc = r.data.contractors.filter((c) => c.included).map((c) => c.contractor_id);
    ok(inc.includes(A.abc.id), 'ABC Flooring included (Acceptance 6)');
    ok(!inc.includes(A.plumb.id), 'plumber excluded by relevance threshold');
    ok(!inc.includes(A.dnc.id) && r.data.contractors.find((c) => c.contractor_id === A.dnc.id).reason.match(/do not contact|suppression/), 'DNC contractor excluded with the reason');
    // Approval gates
    r = await req(A.jar, 'POST', `/api/v1/campaigns/${A.camp.id}/status`, { to: 'active' });
    ok(r.status === 409, 'cannot jump from draft to active');
    r = await req(REPJAR, 'POST', `/api/v1/campaigns/${A.camp.id}/status`, { to: 'pending_approval' });
    ok(r.status === 403, 'a rep cannot move campaigns');
    await req(A.jar, 'POST', `/api/v1/campaigns/${A.camp.id}/status`, { to: 'pending_approval' });
    r = await req(A.jar, 'POST', `/api/v1/campaigns/${A.camp.id}/status`, { to: 'approved' });
    ok(r.status === 200 && r.data.campaign.approved_at, 'owner approves');
    r = await req(A.jar, 'POST', `/api/v1/campaigns/${A.camp.id}/status`, { to: 'active' });
    ok(r.status === 409 && /workflow/.test(r.data.error), 'activation refused without a GHL outbound workflow id');
    r = await req(A.jar, 'PATCH', `/api/v1/campaigns/${A.camp.id}`, { ghl_workflow_id: 'wf_outbound_1', minimum_match_score: 70 });
    ok(r.data.status === 'draft' && !r.data.approved_at, 'a material edit after approval returns the campaign to draft');
    await req(A.jar, 'POST', `/api/v1/campaigns/${A.camp.id}/status`, { to: 'pending_approval' });
    await req(A.jar, 'POST', `/api/v1/campaigns/${A.camp.id}/status`, { to: 'approved' });
    r = await req(A.jar, 'POST', `/api/v1/campaigns/${A.camp.id}/status`, { to: 'active' });
    ok(r.status === 200 && r.data.audience.queued >= 2, 'activated; audience built', JSON.stringify(r.data.audience));
    ok(typeof r.data.audience.outside_geography === 'number', 'audience summary reports geography exclusions');
    const targets = await db.tq(A.tenant.id, 'SELECT * FROM sup_campaign_targets WHERE tenant_id = :tenant AND campaign_id = :c', { c: A.camp.id });
    ok(!targets.some((t) => t.contractor_id === A.dnc.id && t.status === 'queued'), 'DNC contractor never queued');

    // ───────────────────────── STEP 7 outbound ─────────────────────────
    section('Acceptance 7: outbound call through the provider');
    // Opt-out AFTER queueing is still caught at dial time
    await req(A.jar, 'POST', '/api/v1/suppression', { phone: A.tx.phone_e164, reason: 'opt_out' });
    r = await req(A.jar, 'POST', '/api/v1/dialer/run');
    ok(r.status === 200 && r.data.tick.dispatched >= 2, 'dialer dispatched calls', JSON.stringify(r.data.tick));
    const abcExt = fake.contacts.get(A.tenant.id + ':' + A.abc.phone_e164);
    ok(!!abcExt && fake.enrolled.some((e) => e.contact === abcExt && e.wf === 'wf_outbound_1'), 'ABC Flooring enrolled in the outbound workflow');
    ok(!fake.enrolled.some((e) => e.contact === fake.contacts.get(A.tenant.id + ':' + A.tx.phone_e164)), 'opted-out contractor not dialed');
    const offerField = fake.fields.get(abcExt).rps_offer;
    ok(/\$1\.89 per sq ft/.test(offerField) && /20,000 sq ft/.test(offerField), 'offer on the contact carries price and stock', offerField.slice(0, 200));
    ok(/recorded/.test(offerField) && /Samuel/.test(offerField), 'recording disclosure and transfer rep included');
    const disp = await db.tone(A.tenant.id, `SELECT * FROM sup_calls WHERE tenant_id = :tenant AND contractor_id = :c AND direction = 'outbound'`, { c: A.abc.id });
    ok(disp && disp.status === 'dispatched' && disp.provider_call_id === null, 'dispatched call has NO invented provider id');
    ok(disp.context_package && disp.context_package.products[0].verified_comparison, 'context package includes the verified comparison');
    r = await req(A.jar, 'POST', '/api/v1/dialer/run');
    ok(r.data.tick.dispatched === 0, 'second pass does not re-dial the same contractors');

    // ───────────────────────── STEP 8-9 interest -> buyer ─────────────────────────
    section('Acceptance 8-9: interest creates a Potential Buyer');
    r = await req(A.jar, 'GET', '/api/v1/tenant');
    A.hook = '/webhooks/ghl/' + r.data.tenant.webhook_token;
    const endPayload = { event: 'call.completed', call_id: 'ghl_call_1', contact_id: abcExt, direction: 'outbound', summary: 'Jose is interested in the vinyl flooring and asked for contractor pricing.', duration: 142,
      extractedData: { rps_outcome: 'needs_pricing', rps_interest: 'high', rps_product: 'Luxury Vinyl', rps_quantity: '2,000 sq ft', rps_timeframe: 'next month', rps_price_discussed: '$1.89/sq ft' } };
    r = await req(null, 'POST', A.hook, endPayload, { 'X-Supply': '' });
    ok(r.status === 200 && r.data.events[0].result && r.data.events[0].result.outcome === 'needs_pricing', 'call.completed webhook processed', JSON.stringify(r.data));
    const buyerId = r.data.events[0].result.buyer_id;
    ok(!!buyerId, 'Potential Buyer created');
    const buyer = await db.tone(A.tenant.id, 'SELECT * FROM sup_buyers WHERE tenant_id = :tenant AND id = :id', { id: buyerId });
    ok(buyer.campaign_id === A.camp.id && buyer.original_call_id === disp.id, 'buyer attributed to campaign + original outbound call');
    ok(buyer.product_id === A.lv.id && buyer.quantity === '2,000 sq ft' && buyer.buying_timeframe === 'next month', 'product interest, quantity and timeframe captured');
    ok(buyer.assigned_rep_id === REP.samuel.id, 'sales assignment = Samuel');
    ok(/Home Depot/.test(buyer.competitive_context || ''), 'competitive context recorded from the verified comparison');
    const abcNow = await db.tone(A.tenant.id, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND id = :id', { id: A.abc.id });
    ok(abcNow.stage === 'pricing_requested' && abcNow.interest_level === 'high', 'pipeline moved to pricing_requested');
    // Idempotency
    r = await req(null, 'POST', A.hook, endPayload, { 'X-Supply': '' });
    ok(r.data.events[0].duplicate === true, 'same webhook twice = duplicate, not reprocessed');
    const nCalls = await db.tone(A.tenant.id, `SELECT count(*)::int n FROM sup_calls WHERE tenant_id = :tenant AND contractor_id = :c`, { c: A.abc.id });
    ok(nCalls.n === 1, 'still exactly one call row');
    r = await req(null, 'POST', '/webhooks/ghl/' + 'x'.repeat(48), endPayload, { 'X-Supply': '' });
    ok(r.status === 404, 'unknown webhook token = 404');
    r = await req(null, 'POST', A.hook, Object.assign({}, endPayload, { call_id: 'ghl_call_x', locationId: 'someone-else' }), { 'X-Supply': '' });
    ok(r.status === 200, 'tenant with no location mapped accepts (location check applies once mapped)');

    // Bay Remodel: webhook signal only -> pulled from call logs; not interested
    const bayExt = fake.contacts.get(A.tenant.id + ':' + A.bay.phone_e164);
    fake.logs.push({ providerCallId: 'ghl_call_2', externalContactId: bayExt, summary: 'Not interested right now, they have a supplier.', extracted: {}, actions: [], durationSec: 40 });
    r = await req(null, 'POST', A.hook, { event: 'voice ai call ended', contact_id: bayExt }, { 'X-Supply': '' });
    ok(r.data.events[0].result && r.data.events[0].result.outcome === 'not_interested' && !r.data.events[0].result.buyer_id, 'signal-only webhook pulls the call log; no buyer for no interest');

    // ───────────────────────── STEP 10-13 callback ─────────────────────────
    section('Acceptance 10-13: callback recognition + customer memory');
    const ctxField = fake.fields.get(abcExt).rps_context;
    ok(/Jose Martinez from ABC Flooring LLC/.test(ctxField) && /contractor pricing/.test(ctxField) && /Samuel/.test(ctxField), 'context already on the contact before any callback', ctxField);
    ok(ctxField.length <= 1500, 'context is concise');
    r = await req(null, 'POST', A.hook, { event: 'inbound call', phone: '+1 (813) 555-0123' }, { 'X-Supply': '' });
    ok(r.data.events[0].result.recognized === true && /Luxury Vinyl Flooring/.test(r.data.events[0].result.context), 'inbound caller matched by phone and context returned', JSON.stringify(r.data.events[0].result));
    r = await req(null, 'GET', A.hook + '/context?phone=8135550123');
    ok(r.data.recognized && r.data.assigned_rep === 'Samuel', 'context lookup endpoint for the voice agent');
    r = await req(null, 'GET', A.hook + '/context?phone=8135559999');
    ok(r.data.recognized === false, 'unknown caller treated as new');

    // ───────────────────────── STEP 14-15 transfer ─────────────────────────
    section('Acceptance 14-15: transfer to sales');
    r = await req(null, 'POST', A.hook, { event: 'call.completed', call_id: 'ghl_call_3', contact_id: abcExt, direction: 'inbound', summary: 'Jose called back about the flooring pricing and asked to speak with Samuel.',
      executedCallActions: [{ actionType: 'CALL_TRANSFER', executedAt: new Date().toISOString() }], extractedData: { rps_product: 'Luxury Vinyl Flooring' } }, { 'X-Supply': '' });
    const res3 = r.data.events[0].result;
    ok(res3.outcome === 'transferred', 'transfer action in the call log = transferred', JSON.stringify(res3));
    const inbound = await db.tone(A.tenant.id, `SELECT * FROM sup_calls WHERE tenant_id = :tenant AND provider_call_id = 'ghl_call_3'`);
    ok(inbound.direction === 'inbound' && inbound.campaign_id === A.camp.id, 'inbound callback kept in the campaign story');
    const tr = await db.tone(A.tenant.id, 'SELECT * FROM sup_transfers WHERE tenant_id = :tenant AND call_id = :k', { k: inbound.id });
    ok(tr && tr.sales_rep_id === REP.samuel.id && tr.campaign_id === A.camp.id && tr.product_id === A.lv.id, 'transfer recorded to Samuel with campaign + product');
    const buyer2 = await db.tone(A.tenant.id, 'SELECT * FROM sup_buyers WHERE tenant_id = :tenant AND id = :id', { id: buyerId });
    ok(buyer2.id === buyerId && buyer2.original_call_id === disp.id && buyer2.campaign_id === A.camp.id, 'callback UPDATED the same buyer; first-touch attribution unchanged');
    const nb = await db.tone(A.tenant.id, `SELECT count(*)::int n FROM sup_buyers WHERE tenant_id = :tenant AND contractor_id = :c`, { c: A.abc.id });
    ok(nb.n === 1, 'no duplicate buyer');

    // ───────────────────────── STEP 16-18 sale ─────────────────────────
    section('Acceptance 16-18: sale, attribution, commission');
    r = await req(REPJAR, 'POST', '/api/v1/sales', { buyer_id: buyerId, sale_amount: '3,780.00' });
    ok(r.status === 200, 'rep records the sale', JSON.stringify(r.data));
    const at = r.data.attribution;
    ok(at.campaign_id === A.camp.id && at.original_call_id === disp.id && at.contractor_id === A.abc.id && at.product_id === A.lv.id && at.sales_rep === 'Samuel', 'sale attributed: tenant/product/campaign/original call/contractor/rep');
    ok(Number(at.commission_percentage) === 5 && Number(at.commission_amount) === 189, 'commission 5% of $3,780 = $189.00', `${at.commission_percentage} ${at.commission_amount}`);
    r = await req(REPJAR, 'POST', `/api/v1/commissions/${at.commission_id}/status`, { status: 'paid' });
    ok(r.status === 403, 'a rep cannot mark commissions');
    r = await req(A.jar, 'POST', `/api/v1/commissions/${at.commission_id}/status`, { status: 'paid' });
    ok(r.status === 409, 'pending cannot jump to paid');
    r = await req(A.jar, 'POST', `/api/v1/commissions/${at.commission_id}/status`, { status: 'approved' });
    ok(r.status === 200, 'owner approves the commission');
    r = await req(A.jar, 'PATCH', `/api/v1/buyers/${buyerId}`, { campaign_id: 999, original_call_id: 999, next_action: 'Deliver' });
    const b3 = await db.tone(A.tenant.id, 'SELECT * FROM sup_buyers WHERE tenant_id = :tenant AND id = :id', { id: buyerId });
    ok(b3.campaign_id === A.camp.id && b3.original_call_id === disp.id, 'attribution fields cannot be edited');
    r = await req(A.jar, 'GET', '/api/v1/dashboard');
    ok(r.data.kpis.sales === 1 && r.data.kpis.revenue === 3780 && r.data.kpis.transfers === 1 && r.data.kpis.callbacks === 1, 'dashboard counts real rows', JSON.stringify(r.data.kpis));
    r = await req(A.jar, 'GET', '/api/v1/reports/campaigns');
    const cr = r.data.find((x) => x.id === A.camp.id);
    ok(cr && cr.revenue === 3780 && cr.commissions === 189, 'campaign report closes the loop');
    r = await req(B.jar, 'GET', '/api/v1/dashboard');
    ok(r.data.kpis.sales === 0 && r.data.kpis.revenue === 0, 'tenant B dashboard shows none of A');

    // Opt-out said on a call
    section('Opt-out on a call, pipeline guards');
    fake.logs.push({ providerCallId: 'ghl_call_4', externalContactId: bayExt, summary: 'Please remove my number and do not call again.', extracted: {}, actions: [] });
    const r4 = await req(null, 'POST', A.hook, { event: 'call.completed', contact_id: bayExt, call_id: 'ghl_call_4' }, { 'X-Supply': '' });
    const sup = await db.tone(A.tenant.id, 'SELECT * FROM sup_suppression WHERE tenant_id = :tenant AND phone_e164 = :p', { p: A.bay.phone_e164 });
    ok(sup && sup.reason === 'opt_out', 'spoken opt-out lands on the suppression list', JSON.stringify(r4.data) + ' ' + JSON.stringify(sup));
    const abcFinal = await db.tone(A.tenant.id, 'SELECT stage FROM sup_contractors WHERE tenant_id = :tenant AND id = :id', { id: A.abc.id });
    ok(abcFinal.stage === 'won', 'sale moved the contractor to won');
    fake.logs.push({ providerCallId: 'ghl_call_5', externalContactId: abcExt, summary: 'No answer.', extracted: { rps_outcome: 'no_answer' }, actions: [] });
    await req(null, 'POST', A.hook, { event: 'call.completed', contact_id: abcExt, call_id: 'ghl_call_5' }, { 'X-Supply': '' });
    const abcFinal2 = await db.tone(A.tenant.id, 'SELECT stage FROM sup_contractors WHERE tenant_id = :tenant AND id = :id', { id: A.abc.id });
    ok(abcFinal2.stage === 'won', 'a later no-answer never demotes a won contractor');
    const callsBefore = (await db.tone(A.tenant.id, 'SELECT count(*)::int n FROM sup_calls WHERE tenant_id = :tenant')).n;
    fake.logs.push({ providerCallId: 'trial_1', externalContactId: abcExt, summary: 'Interested', extracted: {}, actions: [], trial: true });
    await req(null, 'POST', A.hook, { event: 'call.completed', call_id: 'trial_1', contact_id: abcExt }, { 'X-Supply': '' });
    ok((await db.tone(A.tenant.id, 'SELECT count(*)::int n FROM sup_calls WHERE tenant_id = :tenant')).n === callsBefore, 'a trial call from the GHL agent editor is ignored');

    // ───────────────────────── provider layer ─────────────────────────
    section('Provider abstraction + failure handling');
    const nc = new NotConnectedProvider();
    let e1 = null; try { await nc.startOutboundCall(); } catch (e) { e1 = e.code; }
    ok(e1 === 'NOT_CONNECTED', 'not-connected provider refuses instead of pretending');
    comms._inject(null);
    const realForB = await comms.providerFor(await require('./src/services/tenants').get(B.tenant.id));
    ok(realForB.name === 'not_connected', 'a tenant with no GHL connection gets the not-connected provider');
    comms._inject(() => fake);
    const seen = [];
    ghl._setTransport(async (o) => {
      seen.push(o.method + ' ' + o.url.replace(/^https:\/\/[^/]+/, '') + ' v' + o.headers.Version);
      if (o.url.includes('/workflow/wf_flaky') && seen.filter((s) => s.includes('wf_flaky')).length < 2) return { status: 502, data: { message: 'bad gateway' } };
      if (o.url.includes('/workflow/wf_denied')) return { status: 403, data: { message: 'forbidden' } };
      if (o.url.includes('/contacts/upsert')) return { status: 200, data: { contact: { id: 'ghl_c_9' } } };
      if (o.url.includes('/voice-ai/dashboard/call-logs')) return { status: 200, data: { callLogs: [{ id: 'L1', contactId: 'ghl_c_9', summary: 's', extractedData: { rps_outcome: 'interested' }, executedCallActions: [], duration: 12.4 }] } };
      return { status: 200, data: {} };
    });
    let healthEvents = 0;
    const gp = new ghl.GoHighLevelProvider({ token: 't', locationId: 'loc1' }, () => { healthEvents++; });
    const up2 = await gp.upsertContact({ id: 1 }, { phone_e164: '+18135550123', contact_name: 'Jose Martinez', company_name: 'ABC' });
    ok(up2.externalId === 'ghl_c_9' && seen[0] === 'POST /contacts/upsert v2021-07-28', 'GHL upsert uses the documented endpoint + version');
    const st = await gp.startOutboundCall({}, { externalContactId: 'ghl_c_9', campaign: { agent: { ghl_workflow_id: 'wf_flaky' } } });
    ok(st.accepted && st.providerRef === null && seen.filter((s) => s.includes('wf_flaky')).length === 2, 'a 502 is retried once and then succeeds; no call id invented');
    let denied = null; try { await gp.startOutboundCall({}, { externalContactId: 'ghl_c_9', campaign: { agent: { ghl_workflow_id: 'wf_denied' } } }); } catch (e) { denied = e.status; }
    ok(denied === 403 && seen.filter((s) => s.includes('wf_denied')).length === 1, 'a 403 is not retried');
    const logs = await gp.listCallLogs({}, { contactId: 'ghl_c_9' });
    ok(logs[0].providerCallId === 'L1' && logs[0].durationSec === 12 && seen.some((s) => s.includes('/voice-ai/dashboard/call-logs') && s.endsWith('vv3')), 'call logs read with Version v3 and normalized');
    let nw = null; try { await gp.startOutboundCall({}, { externalContactId: 'x', campaign: { agent: {} } }); } catch (e) { nw = e.code; }
    ok(nw === 'NO_WORKFLOW', 'no workflow id = refused before any HTTP call');
    ok(healthEvents > 0, 'provider reports health on every call');
    ghl._setTransport(null);

    // ───────────────────────── auto-setup ─────────────────────────
    section('Set up automatically (fake GoHighLevel)');
    const calls2 = []; let agentSeq = 0;
    ghl._setTransport(async (o) => {
      const path = o.url.replace(/^https:\/\/[^/]+/, '');
      calls2.push({ m: o.method, path, v: o.headers.Version, body: o.data });
      if (o.method === 'GET' && /^\/locations\/loc9$/.test(path)) return { status: 200, data: { location: { name: 'AI Engineering Solutions' } } };
      if (o.method === 'GET' && /customFields/.test(path)) return { status: 200, data: { customFields: [] } };
      if (o.method === 'POST' && /customFields/.test(path)) return { status: 201, data: { customField: { id: 'cf_' + o.data.name.length, fieldKey: 'contact.' + o.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') } } };
      if (/phone-system\/numbers/.test(path)) return { status: 200, data: { status: 'success', data: { numbers: [{ phoneNumber: '+18132124888', friendlyName: 'RinglyPro' }] } } };
      if (o.method === 'GET' && path === '/voice-ai/agents') return { status: 200, data: { agents: [] } };
      if (o.method === 'POST' && path === '/voice-ai/agents') return { status: 201, data: { id: 'ag_' + (++agentSeq) } };
      if (o.method === 'PATCH' && /^\/voice-ai\/agents\//.test(path)) return { status: 200, data: {} };
      if (o.method === 'POST' && path === '/voice-ai/actions') return { status: 201, data: { id: 'act_' + calls2.length } };
      if (/^\/workflows\//.test(path)) return { status: 200, data: { workflows: [{ id: 'wf_other', name: 'Birthday SMS', status: 'published' }, { id: 'wf_snap', name: 'Supply Outbound Call', status: 'published' }] } };
      return { status: 404, data: { message: 'unexpected ' + o.method + ' ' + path } };
    });
    const setup = require('./src/services/ghlSetup');
    const tA2 = await require('./src/services/tenants').get(A.tenant.id);
    const gp2 = new ghl.GoHighLevelProvider({ token: 't', locationId: 'loc9' });
    const run1 = await setup.run(tA2, gp2, { answerInbound: false });
    const stepOf = (k) => (run1.steps.find((x) => x.key === k) || {}).status;
    ok(run1.ok && stepOf('outbound_agent') === 'ok' && stepOf('inbound_agent') === 'ok' && stepOf('workflow') === 'ok' && stepOf('transfer') === 'ok', 'auto-setup completes every step', JSON.stringify(run1.steps));
    const createdAgents = calls2.filter((c) => c.m === 'POST' && c.path === '/voice-ai/agents');
    ok(createdAgents.length === 2 && createdAgents.every((c) => c.v === 'v3'), 'two Voice AI agents created with Version v3');
    ok(createdAgents.every((c) => c.body.agentPrompt.includes('{{contact.ringlypro_supply_context}}') && c.body.agentPrompt.includes('{{contact.ringlypro_supply_offer}}')), 'agent prompts carry the exact merge tags GHL generated');
    ok(createdAgents.every((c) => !('inboundNumber' in c.body)), 'the phone number is NOT taken over unless asked');
    const acts = calls2.filter((c) => c.path === '/voice-ai/actions');
    ok(acts.length === 2 && acts.every((a) => a.body.actionType === 'CALL_TRANSFER' && a.body.actionParameters.transferToValue === '+18135550100'), 'transfer-to-Samuel action on both agents');
    const tA3 = await require('./src/services/tenants').get(A.tenant.id);
    ok(tA3.ghl.default_workflow_id === 'wf_snap' && tA3.ghl.outbound_agent_id === 'ag_1' && tA3.ghl.phone_number === '+18132124888', 'workflow found by name; ids saved on the tenant');
    calls2.length = 0;
    const run2 = await setup.run(tA3, gp2, { answerInbound: true });
    ok(!calls2.some((c) => c.m === 'POST' && (c.path === '/voice-ai/agents' || c.path === '/voice-ai/actions')), 'second run updates in place: no duplicate agents or actions');
    const patchIn = calls2.find((c) => c.m === 'PATCH' && c.path === '/voice-ai/agents/ag_2');
    ok(patchIn && patchIn.body.inboundNumber === '+18132124888' && run2.steps.find((x) => x.key === 'inbound_number').status === 'ok', 'ticking "answer inbound" assigns the number to the inbound agent');
    ghl._setTransport(async (o) => (/\/locations\/loc9$/.test(o.url) ? { status: 200, data: { location: { name: 'x' } } } : { status: 401, data: { message: 'The token is not authorized for this scope.' } }));
    const run3 = await setup.run(tA3, new ghl.GoHighLevelProvider({ token: 't', locationId: 'loc9' }), {});
    ok(!run3.ok && run3.steps.filter((x) => x.status === 'failed').every((x) => /token is missing/.test(x.detail)), 'missing scopes are named in plain words, per step');
    ghl._setTransport(null);
    r = await req(B.jar, 'POST', '/api/v1/ghl/auto-setup', {});
    ok(r.status === 409, 'auto-setup refuses a tenant with no GoHighLevel connection');

    section('Transcript reading + callbacks without webhooks');
    const llm = require('./src/llm');
    llm._inject({ messages: { create: async () => ({ content: [{ type: 'text', text: JSON.stringify({ rps_outcome: 'needs_inventory_information', rps_interest: 'medium', rps_product: 'Door Trim', rps_quantity: '400 lf', rps_timeframe: 'this week', rps_price_discussed: '', rps_wants_transfer: 'no', rps_notes: '' }) }] }) } });
    fake.logs.push({ providerCallId: 'poll_in_1', externalContactId: abcExt, summary: 'Called back asking about trim stock.', transcript: 'Caller: do you have primed casing in stock, about 400 feet this week?', extracted: {}, actions: [] });
    const rc = await require('./src/services/dialer').reconcile(await require('./src/services/tenants').get(A.tenant.id), fake);
    const polled = await db.tone(A.tenant.id, `SELECT * FROM sup_calls WHERE tenant_id = :tenant AND provider_call_id = 'poll_in_1'`);
    ok(polled && polled.direction === 'inbound' && rc.ingested >= 1, 'an inbound call is picked up from the call logs with no webhook');
    ok(polled.outcome === 'needs_inventory_information' && polled.outcome_source === 'model' && polled.extracted.rps_quantity === '400 lf', 'outcome and details read from the transcript by the model');
    llm._inject({ messages: { create: async () => ({ content: [{ type: 'text', text: '{"rps_outcome":"closed_the_deal","rps_notes":"x"}' }] }) } });
    fake.logs.push({ providerCallId: 'poll_in_2', externalContactId: abcExt, summary: 'Not interested right now.', transcript: 'Caller: not interested', extracted: {}, actions: [] });
    await require('./src/services/dialer').reconcile(await require('./src/services/tenants').get(A.tenant.id), fake);
    const polled2 = await db.tone(A.tenant.id, `SELECT * FROM sup_calls WHERE tenant_id = :tenant AND provider_call_id = 'poll_in_2'`);
    ok(polled2 && polled2.outcome === 'not_interested' && polled2.outcome_source === 'rules', 'a model outcome outside the fixed list is discarded; rules decide');
    llm._inject(null);
    const nPoll = (await db.tone(A.tenant.id, `SELECT count(*)::int n FROM sup_calls WHERE tenant_id = :tenant AND provider_call_id LIKE 'poll_in_%'`)).n;
    await require('./src/services/dialer').reconcile(await require('./src/services/tenants').get(A.tenant.id), fake);
    ok((await db.tone(A.tenant.id, `SELECT count(*)::int n FROM sup_calls WHERE tenant_id = :tenant AND provider_call_id LIKE 'poll_in_%'`)).n === nPoll, 're-reading the call logs stores nothing twice');

    // Dispatch failure requeues
    fake.failNext = Object.assign(new Error('GoHighLevel unreachable: timeout'), { code: 'GHL_NETWORK' });
    r = await req(A.jar, 'POST', '/api/v1/contractors', { company_name: 'Late Floors', phone: '813-555-0130', category_id: A.cats['Flooring Contractors'], state: 'FL' });
    const late = r.data;
    await db.trun(A.tenant.id, `INSERT INTO sup_campaign_targets (tenant_id, campaign_id, contractor_id, score, status) VALUES (:tenant, :c, :k, 95, 'queued')`, { c: A.camp.id, k: late.id });
    r = await req(A.jar, 'POST', '/api/v1/dialer/run');
    const lateT = await db.tone(A.tenant.id, 'SELECT * FROM sup_campaign_targets WHERE tenant_id = :tenant AND contractor_id = :k', { k: late.id });
    ok(r.data.tick.failed === 1 && lateT.status === 'queued' && /last attempt failed/.test(lateT.skip_reason), 'provider outage: call marked failed, contractor requeued with the reason');
    const lateCall = await db.tone(A.tenant.id, `SELECT status FROM sup_calls WHERE tenant_id = :tenant AND contractor_id = :k`, { k: late.id });
    ok(lateCall.status === 'failed', 'failed dispatch recorded, not hidden');

    // Webhook processing failure is stored and retried
    const calls = require('./src/services/calls');
    const orig = calls.ingestCall;
    calls.ingestCall = async () => { throw new Error('db blip'); };
    r = await req(null, 'POST', A.hook, { event: 'call.completed', call_id: 'ghl_call_retry', contact_id: abcExt, summary: 'Interested in more flooring' }, { 'X-Supply': '' });
    ok(r.data.events[0].status === 'failed', 'processing error stored as failed');
    calls.ingestCall = orig;
    const wh = require('./src/services/webhooks');
    const rt = await wh.retryFailed(await require('./src/services/tenants').get(A.tenant.id), fake);
    ok(rt.recovered >= 1, 'retry sweep recovers the failed event', JSON.stringify(rt));

    // Onboarding derived from data
    r = await req(A.jar, 'GET', '/api/v1/onboarding');
    const step = (k) => r.data.steps.find((s) => s.key === k).done;
    ok(step('catalog') && step('reps') && step('campaign') && step('test_outbound') && step('test_inbound') && !step('ghl'), 'onboarding derived from real rows and real calls');
    r = await req(A.jar, 'POST', '/api/v1/tenant/activate');
    ok(r.status === 409 && r.data.missing.includes('Connect GoHighLevel'), 'tenant cannot activate itself with GHL unconnected');

    // Health
    r = await req(null, 'GET', '/health');
    ok(r.status === 200 && r.data.ok && /no Twilio/.test(r.data.communications), 'health endpoint');
  } catch (e) {
    ok(false, 'unexpected exception', e.stack);
  } finally {
    await cleanup().catch((e) => console.error('cleanup failed', e.message));
    server.close();
    console.log(`\nRinglyPro Supply SIT: ${pass}/${pass + fail} passed`);
    if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); }
    console.log('Model path: NOT covered (ANTHROPIC_API_KEY removed; rules path under test). Real GoHighLevel: NOT covered (fake transport).');
    await db.sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
