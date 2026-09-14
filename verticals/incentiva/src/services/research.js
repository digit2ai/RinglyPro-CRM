'use strict';

/**
 * Builder-promotion research agent (Martha, stage 03).
 *
 * A Sonnet model with Anthropic's server-side web search researches the builders
 * selling in the buyer's area. The run is a background job the page polls
 * (Cloudflare cuts a request at ~100 s; a real crawl takes minutes). One run per
 * area is cached for INCENTIVA_RESEARCH_TTL_HOURS (24) and shared by every buyer
 * searching that area: it is public market information, never buyer data.
 *
 * THE MODEL WRITES THE ROWS; THE CODE DECIDES WHAT A BUYER MAY SEE. After the run:
 *  - "verified" is true ONLY when the row's source_url is a URL the web search
 *    actually returned in this run. A model saying verified:true is not enough.
 *  - a promotion whose expiration date has passed is hidden (kept for the console).
 *  - a row that trips the fair-housing word list is hidden.
 *  - every text field is stripped of URLs, so no link reaches the buyer.
 *  - a top-deal reason is dropped for a plain one if it contains a number the row
 *    does not, or trips the word list ("best deal", "guaranteed").
 * Rows a licensed agent already verified in the registry are added as
 * origin 'agent_verified' and shown first. With no ANTHROPIC_API_KEY, or past the
 * monthly cap, the run is registry-only and says so (source 'registry').
 */

const db = require('../db');
const { token, audit } = require('./util');
const { lexiconFindings } = require('../engines/compliance');
const { scenarios } = require('../engines/payment');

const MODEL = () => process.env.INCENTIVA_RESEARCH_MODEL || 'claude-sonnet-5';
const TTL_HOURS = () => Number(process.env.INCENTIVA_RESEARCH_TTL_HOURS || 24);
const MAX_SEARCHES = () => Number(process.env.INCENTIVA_RESEARCH_MAX_SEARCHES || 25);
const MONTHLY_CAP = () => Number(process.env.INCENTIVA_RESEARCH_MONTHLY_CAP || 150);
const RUN_TIMEOUT_MS = 9 * 60e3;
const STALE_MS = 12 * 60e3;

const KNOWN_BUILDERS = ['Lennar', 'D.R. Horton', 'Pulte Homes', 'M/I Homes', 'Taylor Morrison', 'David Weekley Homes', 'Homes by WestBay',
  'Casa Fresca Homes', 'ICI Homes', 'GL Homes', 'Dream Finders Homes', 'DRB Homes', 'Stanley Martin Homes', 'Centex'];

let runner = null; // SIT injects a fake model runner

/* ---------- small pure helpers (exported for SIT) ---------- */

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function cacheKeyFor(area) {
  if (area.zip) return 'zip:' + area.zip;
  return 'place:' + norm([area.city || area.label || area.input, area.county].filter(Boolean).join(' ')).slice(0, 100);
}
function nyToday() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
}
function stripUrls(s) { return String(s).replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\s{2,}/g, ' ').trim(); }
function text(v, n = 400) {
  if (v === null || v === undefined || v === '' || v === false) return null;
  const s = stripUrls(String(v).replace(/[<>]/g, '')).slice(0, n).trim();
  if (!s || /^(n\/?a|none|null|unknown|not available|-+)$/i.test(s)) return null;
  return s;
}
function parsePrice(v) {
  const s = String(v || '');
  const m = s.match(/\$\s*([\d,]{5,}(?:\.\d+)?)|\b([\d]{3},\d{3}(?:,\d{3})?)\b/);
  const raw = m ? (m[1] || m[2]) : null;
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return isFinite(n) && n >= 50000 && n <= 20000000 ? n : null;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function parseDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (m) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}
function urlKey(u) {
  try { const x = new URL(String(u)); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch (e) { return null; }
}
function httpUrl(u) {
  try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href.slice(0, 1000) : null; } catch (e) { return null; }
}
function numbersIn(s) { return (String(s || '').match(/\d[\d,.]*/g) || []).map((x) => x.replace(/[,.]+$/, '').replace(/,/g, '')); }

/** Pull the JSON object out of the model's final text. */
function extractJson(txt) {
  const s = String(txt || '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

/**
 * The enforcement step. `seenUrls` = URL keys the web search returned this run.
 * Returns { rows, top_deals, inventory } ready to store; hidden rows carry hidden_reason.
 */
function sanitizeResearch(parsed, seenUrls, today = nyToday()) {
  const seen = seenUrls instanceof Set ? seenUrls : new Set(seenUrls || []);
  const rowsIn = Array.isArray(parsed && parsed.rows) ? parsed.rows : [];
  const out = [];
  const dedupe = new Set();
  for (const r of rowsIn.slice(0, 80)) {
    if (!r || typeof r !== 'object') continue;
    const builder = text(r.builder || r.Builder, 160);
    if (!builder) continue;
    const community = text(r.community || r.Community, 200);
    const key = norm(builder) + '|' + norm(community);
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    const row = {
      origin: 'ai_research', builder, community,
      starting_price: text(r.starting_price || r['Starting Price'], 80),
      promotion: text(r.promotion || r.Promotion, 600),
      rate: text(r.interest_rate || r.rate || r['Interest Rate'], 200),
      closing_credit: text(r.closing_cost_credit || r.closing_credit || r['Closing Cost Credit'], 200),
      other_incentives: text(r.other_incentives || r['Other Incentives'], 600),
      expiration: text(r.expiration || r.Expiration, 80),
      restrictions: text(r.restrictions || r.Restrictions, 600),
      hoa: text(r.hoa || r.HOA, 80),
      cdd: text(r.cdd || r.CDD, 80),
      scope: ['zip', 'metro'].includes(r.scope) ? r.scope : null,
      source_url: httpUrl(r.source_url || r['Source URL']),
      date_checked: text(r.date_checked || r['Date Checked'], 40) || today,
      verified: false, verified_basis: null, hidden_reason: null
    };
    row.starting_price_usd = parsePrice(row.starting_price);
    row.expiration_date = parseDate(row.expiration);
    const claimed = r.verified === true || r.Verified === true || r.verified === 'true';
    if (claimed && row.source_url && seen.has(urlKey(row.source_url))) { row.verified = true; row.verified_basis = 'source_seen_in_search'; }
    if (row.expiration_date && row.expiration_date < today) row.hidden_reason = 'expired';
    const blob = [row.builder, row.community, row.promotion, row.rate, row.closing_credit, row.other_incentives, row.restrictions].filter(Boolean).join(' ');
    if (lexiconFindings(blob).some((f) => f.severity === 'block')) row.hidden_reason = 'compliance';
    out.push(row);
  }

  const visibleKey = new Map(out.filter((x) => !x.hidden_reason).map((x) => [norm(x.builder) + '|' + norm(x.community), x]));
  const top = [];
  for (const t of (Array.isArray(parsed && parsed.top_deals) ? parsed.top_deals : (parsed && parsed.top5) || []).slice(0, 10)) {
    if (!t || typeof t !== 'object') continue;
    const row = visibleKey.get(norm(t.builder) + '|' + norm(t.community));
    if (!row || top.some((x) => x.row === row)) continue;
    let reason = text(t.reason, 300);
    const rowNums = new Set(numbersIn([row.starting_price, row.promotion, row.rate, row.closing_credit, row.other_incentives, row.expiration, row.hoa, row.cdd].join(' ')));
    if (reason && (numbersIn(reason).some((n) => !rowNums.has(n)) || lexiconFindings(reason).length)) reason = null;
    top.push({ row, reason });
    if (top.length >= 5) break;
  }

  const inventory = [];
  for (const h of (Array.isArray(parsed && parsed.motivated_inventory) ? parsed.motivated_inventory : []).slice(0, 20)) {
    if (!h || typeof h !== 'object') continue;
    const item = {
      builder: text(h.builder, 160), community: text(h.community, 200), home: text(h.home || h.address || h.plan, 200),
      price: text(h.price, 80), note: text(h.note || h.why, 300), source_url: httpUrl(h.source_url)
    };
    if (!item.builder) continue;
    item.price_usd = parsePrice(item.price);
    if (lexiconFindings([item.home, item.note].join(' ')).some((f) => f.severity === 'block')) continue;
    if (item.note && lexiconFindings(item.note).length) item.note = null;
    inventory.push(item);
  }
  return { rows: out, top_deals: top, inventory };
}

/* ---------- prompt ---------- */

function buildPrompt(area, today) {
  const where = area.zip || area.label || area.input;
  const city = area.city || '';
  const county = area.county ? area.county + ' County' : '';
  const place = [city, county, 'Florida'].filter(Boolean).join(', ');
  return `Research all new-construction home builders currently selling homes in ${where} (${place}).

I want CURRENT buyer promotions and incentives as of ${today}.

Include builders such as:
${KNOWN_BUILDERS.join(', ')}.
Also identify any other active builders in the area that are not on this list.

For EACH builder, research:
1. Communities currently selling in ${where}
2. Current new-home buyer promotions
3. Mortgage interest-rate incentives
4. Temporary or permanent rate buydowns
5. Closing-cost assistance
6. Flex cash / design-center credits
7. Price reductions
8. Quick Move-In / inventory-home discounts
9. Lot-premium discounts
10. Cash-buyer incentives
11. FHA / VA / conventional financing specials
12. Promotion expiration date
13. Requirements, including use of the builder's preferred lender or title company
14. Starting home prices
15. HOA and CDD fees when available

IMPORTANT:
- Search the live web. Do not rely only on historical knowledge.
- Prioritize the builder's official website and official financing company.
- Verify that the promotion is currently valid.
- Distinguish promotions specific to ${where} from general Tampa Bay promotions.
- If a promotion applies only to selected inventory homes, clearly state that.
- If an expiration date has passed, do not present the promotion as current.
- Record the source URL and date checked for every promotion.
- If information cannot be verified, set verified to false rather than guessing. Never invent a price, rate, amount or date: use null.

Return structured JSON only (no prose, no markdown fences), exactly this shape:
{"rows":[{"builder":"","community":"","starting_price":"","promotion":"","interest_rate":"","closing_cost_credit":"","other_incentives":"","expiration":"","restrictions":"","hoa":"","cdd":"","scope":"zip|metro","source_url":"","date_checked":"YYYY-MM-DD","verified":true}],
 "top_deals":[{"builder":"","community":"","reason":""}],
 "motivated_inventory":[{"builder":"","community":"","home":"","price":"","note":"","source_url":""}]}

One row per builder/community. top_deals ranks the TOP 5 best current deals in ${where} based on: lowest effective monthly payment, total builder incentive value, cash required at closing, price of home, HOA + CDD, overall value. Each reason must use only facts present in that row. motivated_inventory lists completed or Quick Move-In inventory homes where the builder may be especially motivated to negotiate.`;
}

/* ---------- model runner (streams progress) ---------- */

async function modelRunner(area, { onProgress, signal }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const today = nyToday();
  const tools = [{
    type: process.env.INCENTIVA_RESEARCH_TOOL || 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES(),
    user_location: { type: 'approximate', city: area.city || 'Tampa', region: 'Florida', country: 'US', timezone: 'America/New_York' }
  }];
  const seen = new Set();
  const builders = new Set();
  let searches = 0;
  const note = (s) => { const n = norm(s); KNOWN_BUILDERS.forEach((b) => { if (n.includes(norm(b))) builders.add(b); }); };
  const messages = [{ role: 'user', content: buildPrompt(area, today) }];
  let finalText = '';
  for (let turn = 0; turn < 6; turn++) {
    const stream = client.messages.stream({ model: MODEL(), max_tokens: 16000, tools, messages }, { signal });
    stream.on('contentBlock', (b) => {
      if (b.type === 'server_tool_use') { searches += 1; note(b.input && b.input.query); onProgress({ searches, builders_checked: builders.size, last_query: text(b.input && b.input.query, 120) }); }
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        b.content.forEach((x) => { if (x && x.url) { const k = urlKey(x.url); if (k) seen.add(k); note(x.title); } });
        onProgress({ searches, builders_checked: builders.size });
      }
      if (b.type === 'text' && Array.isArray(b.citations)) b.citations.forEach((c) => { const k = c && c.url ? urlKey(c.url) : null; if (k) seen.add(k); });
    });
    const msg = await stream.finalMessage();
    finalText += msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (msg.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: msg.content });
  }
  return { parsed: extractJson(finalText), seenUrls: seen, searches, model: MODEL() };
}

/* ---------- registry rows (agent-verified) ---------- */

async function registryRows(tenantId, area) {
  const clauses = [];
  const rep = { t: tenantId };
  if (area.zip) { clauses.push('c.zip = :zip'); rep.zip = area.zip; }
  if (area.county) { clauses.push('LOWER(c.county) = LOWER(:county)'); rep.county = area.county; }
  if (area.city) { clauses.push('LOWER(c.city) = LOWER(:city)'); rep.city = area.city; }
  if (!clauses.length) return [];
  const comms = await db.q(`SELECT c.id, c.name, c.price_from, b.name AS builder FROM nca_communities c
    JOIN nca_builders b ON b.id = c.builder_id AND b.tenant_id = c.tenant_id
    WHERE c.tenant_id = :t AND c.status IN ('selling','coming_soon') AND (${clauses.join(' OR ')}) ORDER BY c.name LIMIT 40`, rep);
  const rows = [];
  for (const c of comms) {
    const inc = await db.q(`SELECT * FROM nca_v_incentives_buyer_safe WHERE tenant_id = :t AND community_id = :c ORDER BY last_verified_at DESC`, { t: tenantId, c: c.id });
    if (!inc.length) continue;
    const fees = await db.q(`SELECT fee_type, amount_usd, period FROM nca_community_fees WHERE tenant_id = :t AND community_id = :c`, { t: tenantId, c: c.id });
    const fee = (types) => { const f = fees.filter((x) => types.includes(x.fee_type) && x.amount_usd != null); return f.length ? f.map((x) => `$${Number(x.amount_usd).toLocaleString('en-US')}/${x.period === 'year' ? 'yr' : x.period === 'one_time' ? 'once' : 'mo'}`).join(' + ') : null; };
    const rateInc = inc.find((v) => v.rate != null || (v.buydown_schedule && v.buydown_schedule.length));
    const cc = inc.find((v) => /closing/.test(v.type));
    const exp = inc.map((v) => v.expires_on).filter(Boolean).sort()[0] || null;
    rows.push({
      origin: 'agent_verified', builder: c.builder, community: c.name,
      starting_price: c.price_from != null ? `From $${Number(c.price_from).toLocaleString('en-US')}` : null,
      starting_price_usd: c.price_from != null ? Number(c.price_from) : null,
      promotion: inc.map((v) => v.headline).join(' · ').slice(0, 600),
      rate: rateInc ? (rateInc.rate != null ? `${Number(rateInc.rate)}%` : `${rateInc.buydown_schedule.join('-')} buydown`) : null,
      closing_credit: cc && (cc.value_usd || cc.value_cap_usd) ? `$${Number(cc.value_cap_usd || cc.value_usd).toLocaleString('en-US')}` : null,
      other_incentives: null,
      expiration: exp ? String(exp).slice(0, 10) : null, expiration_date: exp ? String(exp).slice(0, 10) : null,
      restrictions: inc.some((v) => v.requires_affiliated_lender) ? "Requires the builder's affiliated lender" : null,
      hoa: fee(['hoa']), cdd: fee(['cdd_om', 'cdd_debt']), scope: 'zip',
      source_url: inc[0].source_url || null, date_checked: inc[0].last_verified_at ? new Date(inc[0].last_verified_at).toISOString().slice(0, 10) : null,
      verified: true, verified_basis: 'licensed_agent', hidden_reason: null
    });
  }
  return rows;
}

/* ---------- persistence ---------- */

async function insertRows(tenantId, runId, rows) {
  const ids = [];
  for (const r of rows) {
    const res = await db.exec(`INSERT INTO nca_research_rows (tenant_id, run_id, origin, builder, community, starting_price, starting_price_usd, promotion, rate, closing_credit,
      other_incentives, expiration, expiration_date, restrictions, hoa, cdd, scope, source_url, date_checked, verified, verified_basis, hidden_reason)
      VALUES (:t, :run, :origin, :builder, :community, :sp, :spu, :promo, :rate, :cc, :other, :exp, :expd, :restr, :hoa, :cdd, :scope, :url, :dc, :ver, :vb, :hr) RETURNING id`, {
      t: tenantId, run: runId, origin: r.origin, builder: r.builder, community: r.community, sp: r.starting_price, spu: r.starting_price_usd, promo: r.promotion,
      rate: r.rate, cc: r.closing_credit, other: r.other_incentives, exp: r.expiration, expd: r.expiration_date, restr: r.restrictions, hoa: r.hoa, cdd: r.cdd,
      scope: r.scope, url: r.source_url, dc: r.date_checked, ver: !!r.verified, vb: r.verified_basis, hr: r.hidden_reason
    });
    ids.push(res[0].id);
  }
  return ids;
}

async function claimMonthly(tenantId) {
  const month = new Date().toISOString().slice(0, 7);
  const rows = await db.exec(`INSERT INTO nca_api_usage (tenant_id, provider, month, requests) VALUES (:t, 'research', :m, 1)
    ON CONFLICT (tenant_id, provider, month) DO UPDATE SET requests = nca_api_usage.requests + 1, updated_at = now()
    WHERE nca_api_usage.requests < :cap RETURNING requests`, { t: tenantId, m: month, cap: MONTHLY_CAP() });
  return rows.length > 0;
}

async function finishRegistryOnly(tenantId, runId, area, notice) {
  const rows = await registryRows(tenantId, area);
  await insertRows(tenantId, runId, rows);
  await db.exec(`UPDATE nca_research_runs SET status = 'done', source = 'registry', notice = :n, finished_at = now(),
    expires_at = now() + interval '1 hour', progress = :p WHERE id = :id`, { n: notice, p: JSON.stringify({ searches: 0, builders_checked: 0, rows_found: rows.length }), id: runId });
}

async function execute(tenantId, run, area) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), RUN_TIMEOUT_MS);
  let lastWrite = 0;
  const onProgress = (p) => {
    const now = Date.now();
    if (now - lastWrite < 2500) return;
    lastWrite = now;
    db.exec(`UPDATE nca_research_runs SET progress = :p, searches = :s WHERE id = :id AND status = 'running'`, { p: JSON.stringify(p), s: p.searches || 0, id: run.id }).catch(() => {});
  };
  try {
    const result = await (runner || modelRunner)(area, { onProgress, signal: ctl.signal });
    if (!result || !result.parsed) throw new Error('The research did not return readable results');
    const clean = sanitizeResearch(result.parsed, result.seenUrls);
    const reg = await registryRows(tenantId, area);
    const regKeys = new Set(reg.map((r) => norm(r.builder) + '|' + norm(r.community)));
    const aiRows = clean.rows.filter((r) => !regKeys.has(norm(r.builder) + '|' + norm(r.community)));
    const allRows = reg.concat(aiRows);
    const ids = await insertRows(tenantId, run.id, allRows);
    const idOf = new Map(allRows.map((r, i) => [r, ids[i]]));
    const top = clean.top_deals.map((t) => ({ row_id: idOf.get(t.row), reason: t.reason })).filter((t) => t.row_id);
    const visible = allRows.filter((r) => !r.hidden_reason).length;
    await db.exec(`UPDATE nca_research_runs SET status = 'done', raw_json = :raw, top_deals = :top, inventory = :inv, model = :model, searches = :s,
      progress = :p, finished_at = now(), expires_at = now() + (:ttl || ' hours')::interval WHERE id = :id`, {
      raw: JSON.stringify(result.parsed), top: JSON.stringify(top), inv: JSON.stringify(clean.inventory), model: result.model || null, s: result.searches || 0,
      p: JSON.stringify({ searches: result.searches || 0, builders_checked: new Set(allRows.map((r) => norm(r.builder))).size, rows_found: visible }), ttl: String(TTL_HOURS()), id: run.id
    });
    await audit(tenantId, { type: 'system' }, 'research.done', 'research_run', run.id, { rows: allRows.length, visible, searches: result.searches || 0 });
  } catch (e) {
    console.error('[incentiva] research run', run.id, e.message);
    const reg = await registryRows(tenantId, area).catch(() => []);
    if (reg.length) {
      await insertRows(tenantId, run.id, reg).catch(() => {});
      await db.exec(`UPDATE nca_research_runs SET status = 'done', source = 'registry', notice = 'research_failed', error = :e, finished_at = now(), expires_at = now() + interval '30 minutes',
        progress = :p WHERE id = :id`, { e: String(e.message).slice(0, 500), p: JSON.stringify({ searches: 0, builders_checked: 0, rows_found: reg.length }), id: run.id }).catch(() => {});
    } else {
      await db.exec(`UPDATE nca_research_runs SET status = 'failed', error = :e, finished_at = now(), expires_at = now() WHERE id = :id`, { e: String(e.message).slice(0, 500), id: run.id }).catch(() => {});
    }
  } finally { clearTimeout(timer); }
}

/** Return a cached/running run for the area, or start one. Never waits for the crawl. */
async function startOrGet(tenantId, area, { allowFresh = true } = {}) {
  const key = cacheKeyFor(area);
  const existing = await db.one(`SELECT * FROM nca_research_runs WHERE tenant_id = :t AND cache_key = :k
    AND ((status = 'done' AND expires_at > now()) OR (status = 'running' AND ran_at > now() - (:stale || ' milliseconds')::interval))
    ORDER BY ran_at DESC LIMIT 1`, { t: tenantId, k: key, stale: String(STALE_MS) });
  if (existing) return { run: existing, fresh: false };
  if (!allowFresh) return { run: null, fresh: false, limited: true };

  const hasModel = !!(runner || process.env.ANTHROPIC_API_KEY) && process.env.INCENTIVA_RESEARCH !== 'off';
  const created = await db.exec(`INSERT INTO nca_research_runs (tenant_id, token, cache_key, zip, area_label, city, county, state, status, source, expires_at)
    VALUES (:t, :tok, :k, :zip, :label, :city, :county, :state, 'running', :src, now() + interval '1 hour') RETURNING *`, {
    t: tenantId, tok: token(18), k: key, zip: area.zip || null, label: area.label || area.input || null, city: area.city || null, county: area.county || null, state: area.state || 'FL',
    src: hasModel ? 'model' : 'registry'
  });
  const run = created[0];
  if (!hasModel) { await finishRegistryOnly(tenantId, run.id, area, 'research_not_configured'); }
  else if (!(await claimMonthly(tenantId))) { await finishRegistryOnly(tenantId, run.id, area, 'research_cap_reached'); }
  else { setImmediate(() => { execute(tenantId, run, area); }); }
  return { run: await db.one('SELECT * FROM nca_research_runs WHERE id = :id', { id: run.id }), fresh: true };
}

/**
 * Buyer-facing view of a run: visible rows only, filtered by the buyer's price and
 * monthly payment, never a source URL or check date.
 */
async function publicRun(tenantId, runToken, criteria = {}, settings = null) {
  const run = await db.one('SELECT * FROM nca_research_runs WHERE tenant_id = :t AND token = :tok', { t: tenantId, tok: runToken });
  if (!run) return null;
  if (run.status === 'running' && new Date(run.ran_at).getTime() < Date.now() - STALE_MS) {
    await db.exec(`UPDATE nca_research_runs SET status = 'failed', error = 'timed out', finished_at = now(), expires_at = now() WHERE id = :id AND status = 'running'`, { id: run.id });
    run.status = 'failed';
  }
  const base = { token: run.token, status: run.status, source: run.source, notice: run.notice, area: { label: run.area_label, city: run.city, county: run.county, zip: run.zip },
    progress: run.progress || {}, checked_on: run.finished_at ? new Date(run.finished_at).toISOString().slice(0, 10) : null };
  if (run.status !== 'done') return Object.assign(base, { rows: [], top_deals: [], inventory: [], filtered_out: 0 });

  const rows = await db.q(`SELECT * FROM nca_research_rows WHERE tenant_id = :t AND run_id = :r AND hidden_reason IS NULL ORDER BY (origin = 'agent_verified') DESC, verified DESC, builder, community`, { t: tenantId, r: run.id });
  const maxPrice = Number(criteria.max_price) > 0 ? Number(criteria.max_price) : null;
  const maxMonthly = Number(criteria.max_monthly) > 0 ? Number(criteria.max_monthly) : null;
  let filtered = 0;
  const shown = [];
  for (const r of rows) {
    const price = r.starting_price_usd != null ? Number(r.starting_price_usd) : null;
    let monthly = null;
    if (price && settings) {
      const sc = scenarios({ price, financing: criteria.financing, down_payment: criteria.down_payment, county: run.county, settings, fees: [], incentives: [] });
      monthly = sc.base && sc.base.modeled ? sc.base.year3plus : null;
    }
    if (maxPrice && price && price > maxPrice) { filtered++; continue; }
    if (maxMonthly && monthly && monthly > maxMonthly) { filtered++; continue; }
    shown.push({
      id: r.id, origin: r.origin, builder: r.builder, community: r.community, starting_price: r.starting_price, promotion: r.promotion, rate: r.rate,
      closing_credit: r.closing_credit, other_incentives: r.other_incentives, expiration: r.expiration, restrictions: r.restrictions, hoa: r.hoa, cdd: r.cdd,
      scope: r.scope, verified: !!r.verified, verified_basis: r.verified_basis, price_known: price != null, est_monthly_from: monthly != null ? Math.round(monthly) : null
    });
  }
  const shownIds = new Set(shown.map((r) => r.id));
  const top = (run.top_deals || []).filter((t) => shownIds.has(t.row_id)).slice(0, 5);
  const inventory = (run.inventory || []).filter((h) => !(maxPrice && h.price_usd && h.price_usd > maxPrice))
    .map((h) => ({ builder: h.builder, community: h.community, home: h.home, price: h.price, note: h.note }));
  return Object.assign(base, { rows: shown, top_deals: top, inventory, filtered_out: filtered });
}

function _setRunner(fn) { runner = fn; }

module.exports = { startOrGet, publicRun, sanitizeResearch, buildPrompt, cacheKeyFor, parsePrice, parseDate, urlKey, extractJson, registryRows, KNOWN_BUILDERS, _setRunner };
