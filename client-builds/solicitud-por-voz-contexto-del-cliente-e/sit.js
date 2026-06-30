// =====================================================
// SIT harness — in-process, self-hosted. Boots the sub-app on an ephemeral
// port, mints a JWT with JWT_SECRET, and exercises every acceptance criterion.
// Exits 0 (all pass) or 1 (any fail) + prints a markdown summary.
//   run: node client-builds/solicitud-por-voz-contexto-del-cliente-e/sit.js
// =====================================================

require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('./index');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TOKEN = jwt.sign({ tenant_id: 1, email: 'sit@digit2ai.com' }, JWT_SECRET);

const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail: detail || '' }); }

function req(method, path, { token, body } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) {} resolve({ status: res.statusCode, json: j, text: buf }); });
    });
    r.on('error', () => resolve({ status: 0, json: null, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}

let PORT = 0;
const server = http.createServer(app);

server.listen(0, async () => {
  PORT = server.address().port;
  const B = ''; // routes are root-relative on the sub-app
  try {
    // 1. health
    let h = await req('GET', '/health');
    check('health 200 + body', h.status === 200 && h.json && h.json.status === 'ok' && h.json.service === 'solicitud-por-voz-contexto-del-cliente-e' && !!h.json.version, 'status=' + h.status);

    // 2. POST transactions requires JWT
    let noAuth = await req('POST', '/api/v1/transactions', { body: { type: 'sale', amount_usd: 1000, counterparty: 'X' } });
    check('POST tx without JWT -> 401', noAuth.status === 401, 'status=' + noAuth.status);

    let created = await req('POST', '/api/v1/transactions', { token: TOKEN, body: { type: 'sale', amount_usd: 1000, counterparty: 'Acme' } });
    check('POST tx with JWT -> 201 + tenant_id', created.status === 201 && created.json && created.json.data && created.json.data.tenant_id === 1, 'status=' + created.status);

    // add a purchase for margin math
    await req('POST', '/api/v1/transactions', { token: TOKEN, body: { type: 'purchase', amount_usd: 400, counterparty: 'Prov' } });

    // 3. GET transactions tenant-scoped
    let list = await req('GET', '/api/v1/transactions', { token: TOKEN });
    check('GET tx -> tenant rows only', list.status === 200 && list.json && Array.isArray(list.json.data) && list.json.data.every((r) => r.tenant_id === 1) && list.json.data.length >= 2, 'count=' + (list.json && list.json.data ? list.json.data.length : 'n/a'));

    // 4. summary math
    let sum = await req('GET', '/api/v1/summary', { token: TOKEN });
    const okSum = sum.status === 200 && sum.json &&
      sum.json.total_sales_usd >= 1000 && sum.json.total_purchases_usd >= 400 &&
      sum.json.gross_margin_usd === (sum.json.total_sales_usd - sum.json.total_purchases_usd) &&
      sum.json.net_position_usd === (sum.json.total_sales_usd - sum.json.total_purchases_usd);
    check('GET summary -> P&L math', okSum, sum.json ? JSON.stringify({ s: sum.json.total_sales_usd, p: sum.json.total_purchases_usd, m: sum.json.gross_margin_usd }) : 'no json');

    // 5. voice parse
    let voice = await req('POST', '/api/v1/voice', { token: TOKEN, body: { transcript: 'vendí 5000 dólares de palma a Acme' } });
    check('POST voice -> parses sale 5000', voice.status === 201 && voice.json && voice.json.data && voice.json.data.type === 'sale' && Number(voice.json.data.amount_usd) === 5000, voice.json && voice.json.data ? (voice.json.data.type + '/' + voice.json.data.amount_usd) : 'no data');

    // 6/7. dashboard ES + EN
    let dEs = await req('GET', '/dashboard');
    check('dashboard ES -> Spanish h1 + currency', dEs.status === 200 && /Visibilidad Financiera en Vivo/.test(dEs.text) && /\$0\.00/.test(dEs.text), 'status=' + dEs.status);
    let dEn = await req('GET', '/dashboard?lang=en');
    check('dashboard EN -> English h1', dEn.status === 200 && /Live Financial Visibility/.test(dEn.text), 'status=' + dEn.status);

    // 8. privacy
    let priv = await req('GET', '/privacy');
    check('privacy -> Ley 1581 de 2012', priv.status === 200 && /Ley 1581 de 2012/.test(priv.text), 'status=' + priv.status);

  } catch (e) {
    check('harness ran without throwing', false, e.message);
  } finally {
    server.close();
    const pass = results.filter((r) => r.ok).length;
    const fail = results.length - pass;
    console.log('\n# SIT — solicitud-por-voz-contexto-del-cliente-e\n');
    results.forEach((r) => console.log((r.ok ? 'PASS' : 'FAIL') + ' · ' + r.name + (r.detail ? '  (' + r.detail + ')' : '')));
    console.log('\n' + pass + '/' + results.length + ' passed' + (fail ? ' · ' + fail + ' FAILED' : ''));
    process.exit(fail ? 1 : 0);
  }
});
