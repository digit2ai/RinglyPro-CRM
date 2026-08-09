// =====================================================
// sit.js — System Integration Test.
//
//   node client-builds/ai-agent-prompt-builder-for-data-writing/sit.js
//
// Boots the sub-app on an ephemeral port and exercises the real HTTP surface.
// Exits 0 on pass, non-zero on any failure, and prints a markdown summary.
//
// Zero external keys. Runs green against Postgres OR the in-memory fallback,
// so CI never needs a database to prove the contract holds.
//
// It creates its own throwaway tenants and deletes their rows at the end.
// =====================================================

'use strict';

require('dotenv').config();

// lib/auth reads JWT_SECRET at require-time, so it must be set BEFORE the
// sub-app is required. On a dev box with no secret configured the SIT supplies
// its own — it is testing that the gate works, not which key opens it.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'sit-only-secret-' + process.pid;
  console.log('[sit] JWT_SECRET not set — using a SIT-local secret for this run');
}

// The composer reads its API key at require-time, and a dev box's .env usually
// has one. Unsetting it BEFORE the sub-app is required forces the zero-key
// heuristic path for the whole run: the SIT bills nobody, never depends on a
// live API, and proves the fallback a keyless deploy actually runs. Said loudly
// because a silently-skipped model path is the kind of gap SITs are for.
if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  console.log('[sit] ANTHROPIC_API_KEY unset for this run — compose is exercised on the heuristic path only');
}

const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

const subApp = require('./index');
const store = require('./lib/store');
const pb = require('./lib/promptBuilder');
const composer = require('./lib/compose');
const seeds = require('./seeds/templates');

const MOUNT = '/ai-agent-prompt-builder-for-data-writing';
const TENANT_A = 970101; // SIT-only tenants; purged at the end
const TENANT_B = 970102;
const SECRET = process.env.JWT_SECRET;

let pass = 0, fail = 0;
const results = [];

function ok(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail || '']); }
  else { fail++; results.push(['FAIL', name, detail || '']); }
}

function tokenFor(tenantId) {
  return jwt.sign({ tenant_id: tenantId, userId: tenantId, email: 'sit@digit2ai.com' }, SECRET, { expiresIn: '10m' });
}

function request(port, method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null
      : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port, method, path,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0
      }, headers || {})
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* non-JSON is a valid result */ }
        resolve({ status: res.statusCode, body: json, raw: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const AGENT_BODY = {
  name: 'SIT Field Extractor',
  role: 'a precise data extraction specialist',
  goal: 'Return the requested fields as strict JSON, null where the source is silent.',
  dataSources: 'raw_documents.body_text\nextraction_fields config',
  instructions: 'Read the full document first.\nCopy values verbatim.\nReturn null rather than guessing.',
  constraints: 'Never fabricate a value.\nReturn JSON only.',
  outputSchema: '{"document_id":"string","fields":[{"name":"string","value":"string|null"}]}'
};

(async function main() {
  const app = express();
  app.use(MOUNT, subApp);
  const server = http.createServer(app);

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const authA = { Authorization: 'Bearer ' + tokenFor(TENANT_A) };
  const authB = { Authorization: 'Bearer ' + tokenFor(TENANT_B) };

  try {
    // ---------------------------------------------------------------- health
    {
      const r = await request(port, 'GET', MOUNT + '/health');
      ok('AC1 health returns 200', r.status === 200, 'got ' + r.status);
      ok('AC1 health status ok', r.body && r.body.status === 'ok', JSON.stringify(r.body));
      ok('AC1 health names the service',
        r.body && r.body.service === 'ai-agent-prompt-builder-for-data-writing',
        r.body && r.body.service);
      ok('AC1 health carries a version', !!(r.body && /^\d+\.\d+\.\d+$/.test(r.body.version)), r.body && r.body.version);
      ok('health reports the storage backend',
        r.body && ['postgres', 'memory'].indexOf(r.body.storage) !== -1, r.body && r.body.storage);
      console.log(`[sit] storage backend: ${r.body && r.body.storage}`);
    }

    // ------------------------------------------------------------- templates
    {
      const r = await request(port, 'GET', MOUNT + '/api/v1/templates');
      ok('AC2 templates returns 200', r.status === 200, 'got ' + r.status);
      ok('AC2 templates is a JSON array', Array.isArray(r.body), typeof r.body);
      ok('AC2 at least 6 seeded templates', Array.isArray(r.body) && r.body.length >= 6,
        'count=' + (Array.isArray(r.body) ? r.body.length : 'n/a'));
      ok('AC2 templates need no auth (no Authorization header sent)', r.status === 200);

      const list = Array.isArray(r.body) ? r.body : [];
      const cats = list.map((t) => t.category);
      ['extract', 'validate', 'classify', 'enrich', 'summarize', 'format'].forEach((c) => {
        ok('template category present: ' + c, cats.indexOf(c) !== -1, cats.join(','));
      });
      ok('every template carries a loadable definition',
        list.length > 0 && list.every((t) => t.definition && t.definition.name && Array.isArray(t.definition.instructions) && t.definition.instructions.length),
        'checked ' + list.length);
      ok('every template definition has constraints',
        list.length > 0 && list.every((t) => Array.isArray(t.definition.constraints) && t.definition.constraints.length));
      ok('no template leaks another tenant (all system-tenant seeds)',
        list.length >= 6 && list.every((t) => seeds.TEMPLATES.some((s) => s.slug === t.slug)));
    }

    {
      const r = await request(port, 'GET', MOUNT + '/api/v1/templates/extract-structured-fields');
      ok('template by slug returns 200', r.status === 200, 'got ' + r.status);
      ok('template by slug returns the right one', r.body && r.body.slug === 'extract-structured-fields');
      const r404 = await request(port, 'GET', MOUNT + '/api/v1/templates/no-such-template');
      ok('unknown slug returns 404', r404.status === 404, 'got ' + r404.status);
    }

    // --------------------------------------------------- create without JWT
    {
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents', AGENT_BODY);
      ok('AC3 create without JWT returns 401', r.status === 401, 'got ' + r.status + ' ' + r.raw.slice(0, 120));
    }
    {
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents', AGENT_BODY,
        { Authorization: 'Bearer not-a-real-token' });
      ok('create with a malformed JWT returns 401', r.status === 401, 'got ' + r.status);
    }
    {
      const expired = jwt.sign({ tenant_id: TENANT_A }, SECRET, { expiresIn: -10 });
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents', AGENT_BODY,
        { Authorization: 'Bearer ' + expired });
      ok('create with an expired JWT returns 401', r.status === 401, 'got ' + r.status);
    }

    // ------------------------------------------------------ create with JWT
    let createdId = null;
    {
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents', AGENT_BODY, authA);
      ok('AC3 create with JWT returns 201', r.status === 201, 'got ' + r.status + ' ' + r.raw.slice(0, 200));
      ok('AC3 persisted row carries an id', !!(r.body && r.body.id), JSON.stringify(r.body && r.body.id));
      ok('AC3 persisted row carries tenant_id', !!(r.body && r.body.tenant_id === TENANT_A),
        'got ' + (r.body && r.body.tenant_id));
      ok('newline-separated instructions became an array',
        !!(r.body && Array.isArray(r.body.instructions) && r.body.instructions.length === 3),
        JSON.stringify(r.body && r.body.instructions));
      ok('outputSchema text was parsed into an object',
        !!(r.body && r.body.output_schema && r.body.output_schema.document_id === 'string'),
        JSON.stringify(r.body && r.body.output_schema));
      createdId = r.body && r.body.id;
    }

    {
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents', { role: 'nameless' }, authA);
      ok('create without a name returns 400', r.status === 400, 'got ' + r.status);
    }
    {
      const bad = Object.assign({}, AGENT_BODY, { outputSchema: '{ this is not json' });
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents', bad, authA);
      ok('create with an invalid output schema returns 400', r.status === 400, 'got ' + r.status);
    }

    // -------------------------------------------------------- tenant scoping
    {
      const rB = await request(port, 'POST', MOUNT + '/api/v1/agents',
        Object.assign({}, AGENT_BODY, { name: 'Tenant B Agent' }), authB);
      ok('second tenant can create its own agent', rB.status === 201, 'got ' + rB.status);
      ok('second tenant row carries ITS tenant_id', rB.body && rB.body.tenant_id === TENANT_B,
        'got ' + (rB.body && rB.body.tenant_id));

      const listA = await request(port, 'GET', MOUNT + '/api/v1/agents', undefined, authA);
      ok('AC4 list with JWT returns 200', listA.status === 200, 'got ' + listA.status);
      ok('AC4 list is scoped to the caller tenant',
        listA.body && listA.body.agents.every((a) => a.tenant_id === TENANT_A),
        'tenants seen: ' + (listA.body && [...new Set(listA.body.agents.map((a) => a.tenant_id))].join(',')));
      ok('AC4 tenant A cannot see tenant B rows',
        listA.body && !listA.body.agents.some((a) => a.name === 'Tenant B Agent'));

      const listB = await request(port, 'GET', MOUNT + '/api/v1/agents', undefined, authB);
      ok('tenant B sees only its own row',
        listB.body && listB.body.agents.every((a) => a.tenant_id === TENANT_B) && listB.body.agents.length >= 1);

      const listNoAuth = await request(port, 'GET', MOUNT + '/api/v1/agents');
      ok('list without JWT returns 401', listNoAuth.status === 401, 'got ' + listNoAuth.status);

      // The isolation case that actually matters: a valid token for one tenant
      // requesting another tenant's row by id must read as not-found.
      if (createdId) {
        const cross = await request(port, 'GET', MOUNT + '/api/v1/agents/' + createdId, undefined, authB);
        ok('cross-tenant read by id returns 404', cross.status === 404, 'got ' + cross.status);
        const crossDel = await request(port, 'DELETE', MOUNT + '/api/v1/agents/' + createdId, undefined, authB);
        ok('cross-tenant delete by id returns 404', crossDel.status === 404, 'got ' + crossDel.status);
        const crossPut = await request(port, 'PUT', MOUNT + '/api/v1/agents/' + createdId,
          Object.assign({}, AGENT_BODY, { name: 'hijacked' }), authB);
        ok('cross-tenant update by id returns 404', crossPut.status === 404, 'got ' + crossPut.status);

        const stillMine = await request(port, 'GET', MOUNT + '/api/v1/agents/' + createdId, undefined, authA);
        ok('the row survived the cross-tenant attempts unchanged',
          stillMine.status === 200 && stillMine.body.name === 'SIT Field Extractor',
          stillMine.body && stillMine.body.name);
      }

      // A body-supplied tenant_id must never override the token claim.
      const spoof = await request(port, 'POST', MOUNT + '/api/v1/agents',
        Object.assign({}, AGENT_BODY, { name: 'Spoof', tenant_id: TENANT_B }), authA);
      ok('body tenant_id cannot override the JWT claim',
        spoof.status === 201 && spoof.body.tenant_id === TENANT_A,
        'got ' + (spoof.body && spoof.body.tenant_id));
    }

    // ------------------------------------------------------------- generate
    {
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents/generate', AGENT_BODY);
      ok('AC5 generate returns 200', r.status === 200, 'got ' + r.status);
      ok('AC5 response parses as JSON', r.body !== null, r.raw.slice(0, 120));

      // Re-parse the raw bytes explicitly — the assertion the criterion names.
      let reparsed = null;
      try { reparsed = JSON.parse(r.raw); } catch (e) { /* leave null */ }
      ok('AC5 raw body passes JSON.parse', reparsed !== null);
      ok('AC5 payload contains key: agent', !!(reparsed && reparsed.agent));
      ok('AC5 payload contains key: instructions', !!(reparsed && reparsed.instructions));
      ok('AC5 payload contains key: output_schema', !!(reparsed && reparsed.output_schema));

      ok('generate carries the agent name', reparsed && reparsed.agent.name === AGENT_BODY.name);
      ok('generate split instructions into 3 steps',
        reparsed && Array.isArray(reparsed.instructions) && reparsed.instructions.length === 3,
        JSON.stringify(reparsed && reparsed.instructions));
      ok('generate parsed the output schema',
        reparsed && reparsed.output_schema.document_id === 'string');
      ok('generate assembles a system_prompt',
        reparsed && typeof reparsed.system_prompt === 'string' && reparsed.system_prompt.indexOf('CONSTRAINTS') !== -1);
      ok('generate needs no auth (stateless assembly)', r.status === 200);
    }

    {
      // An empty body must still produce a parseable artifact — the live
      // preview renders from the first keystroke, before any field is filled.
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents/generate', {});
      ok('generate on an empty body returns 200', r.status === 200, 'got ' + r.status);
      ok('generate on an empty body still has all three keys',
        r.body && r.body.agent && r.body.instructions && r.body.output_schema);
    }

    {
      const bad = Object.assign({}, AGENT_BODY, { outputSchema: '{ broken' });
      const r = await request(port, 'POST', MOUNT + '/api/v1/agents/generate', bad);
      ok('generate flags an invalid schema instead of silently dropping it',
        r.status === 200 && Array.isArray(r.body.warnings) && r.body.warnings.length > 0,
        JSON.stringify(r.body && r.body.warnings));
      ok('invalid schema is preserved under _raw, not discarded',
        r.body && r.body.output_schema && typeof r.body.output_schema._raw === 'string');
    }

    // ---------------------------------------------- every template generates
    {
      const list = (await request(port, 'GET', MOUNT + '/api/v1/templates')).body || [];
      let allGood = true, firstBad = '';
      for (const tpl of list) {
        const r = await request(port, 'POST', MOUNT + '/api/v1/agents/generate', tpl.definition);
        const good = r.status === 200 && r.body && r.body.agent && r.body.instructions.length > 0
          && r.body.output_schema && !(r.body.warnings && r.body.warnings.length);
        if (!good) { allGood = false; firstBad = tpl.slug; break; }
      }
      ok('every seeded template generates a clean payload', allGood, firstBad ? 'failed on ' + firstBad : '');
    }

    // ---------------------------------------------------------- THE ONE BOX
    // The whole point of the redesign: one sentence in, a complete, buildable
    // spec out, with no wizard step in between.
    {
      const DESCRIPTION =
        'Read the invoice PDFs that land in raw_documents and pull out the vendor, ' +
        'invoice number, date and total, one row per invoice. Copy the numbers exactly ' +
        'as printed. If a field is not on the page leave it null and never guess.';

      const r = await request(port, 'GET', MOUNT + '/');
      ok('AC6 home page returns 200', r.status === 200, 'got ' + r.status);
      ok('AC6 home page contains id="json-preview"', r.raw.indexOf('id="json-preview"') !== -1);
      ok('home page has no unsubstituted template tokens', r.raw.indexOf('{{') === -1);
      ok('home page loads the shared promptBuilder bundle', r.raw.indexOf('promptBuilder.js') !== -1);
      ok('home page is ONE box, not a multi-step form',
        r.raw.indexOf('id="one-box"') !== -1 && r.raw.indexOf('class="step-num"') === -1);
      ok('home page offers dictation as well as typing', r.raw.indexOf('id="btn-mic"') !== -1);

      const c = await request(port, 'POST', MOUNT + '/api/v1/agents/compose', { text: DESCRIPTION });
      ok('compose returns 200', c.status === 200, 'got ' + c.status + ' ' + c.raw.slice(0, 200));
      ok('compose needs no auth (nothing is persisted)', c.status === 200);

      const b = c.body || {};
      ok('compose returns a definition, a payload and a command',
        !!(b.definition && b.payload && typeof b.command === 'string'));
      ok('compose payload carries all three prompt keys',
        !!(b.payload && b.payload.agent && b.payload.instructions && b.payload.output_schema));
      ok('compose named the agent from the description',
        !!(b.definition && b.definition.name && b.definition.name !== 'Untitled Agent'),
        b.definition && b.definition.name);
      ok('compose produced ordered instructions',
        !!(b.definition && Array.isArray(b.definition.instructions) && b.definition.instructions.length),
        String(b.definition && b.definition.instructions && b.definition.instructions.length));
      ok('compose always constrains fabrication',
        !!(b.definition && b.definition.constraints.some((x) => /fabricate|invent/i.test(x))),
        JSON.stringify(b.definition && b.definition.constraints));

      // The command is the deliverable — a JSON payload sitting in a clipboard
      // is not yet something an operator can run.
      ok('command invokes the architect', b.command && b.command.indexOf('/ringlypro-architect') === 0);
      ok('command embeds the payload as a fenced JSON block',
        b.command && b.command.indexOf('```json') !== -1 && b.command.trim().endsWith('```'));
      {
        const m = /```json\n([\s\S]*?)\n```/.exec(b.command || '');
        let reparsed = null;
        try { reparsed = m ? JSON.parse(m[1]) : null; } catch (e) { /* leave null */ }
        ok('the JSON inside the command parses', reparsed !== null);
        ok('the JSON inside the command is the same payload',
          !!(reparsed && reparsed.agent && reparsed.agent.name === b.payload.agent.name));
      }

      // Honesty: with no key the answer must SAY it was not authored by a model.
      ok('keyless compose labels itself heuristic',
        b.composed_by === 'heuristic' && b.is_simulated === true,
        b.composed_by + '/' + b.is_simulated);
      ok('keyless compose says so in the payload source block',
        !!(b.payload.source && b.payload.source.is_simulated === true && b.payload.source.model === 'heuristic'));
      ok('keyless compose surfaces assumptions rather than hiding them',
        Array.isArray(b.assumptions) && b.assumptions.length > 0,
        String(b.assumptions && b.assumptions.length));
      ok('the command repeats the assumptions for the build agent',
        b.command.indexOf('assumptions') !== -1);

      // An empty box is a 400, not an invented agent.
      const empty = await request(port, 'POST', MOUNT + '/api/v1/agents/compose', { text: '   ' });
      ok('compose on an empty description returns 400', empty.status === 400, 'got ' + empty.status);

      // Input is capped — an unbounded body is a cost incident, not a feature.
      const huge = await request(port, 'POST', MOUNT + '/api/v1/agents/compose',
        { text: 'extract fields from documents. '.repeat(2000) });
      ok('compose accepts an oversized body by truncating, not erroring', huge.status === 200, 'got ' + huge.status);
      ok('compose caps the recorded description at MAX_INPUT',
        huge.body && huge.body.payload.source.described_as.length <= composer.MAX_INPUT,
        String(huge.body && huge.body.payload.source.described_as.length));

      // The composed definition must round-trip into the persistence layer —
      // "compose then save" cannot fail validation on its own output.
      const saved = await request(port, 'POST', MOUNT + '/api/v1/agents', b.definition, authA);
      ok('a composed definition saves without further editing', saved.status === 201,
        'got ' + saved.status + ' ' + saved.raw.slice(0, 160));
      if (saved.status === 201) {
        await request(port, 'DELETE', MOUNT + '/api/v1/agents/' + saved.body.id, undefined, authA);
      }
    }

    // -------------------------------------------- compose internals (pure)
    {
      ok('extractJson survives a code fence',
        composer.extractJson('```json\n{"name":"X"}\n```').name === 'X');
      ok('extractJson survives a leading sentence',
        composer.extractJson('Here you go: {"name":"X"} — enjoy').name === 'X');
      ok('extractJson handles braces inside strings',
        composer.extractJson('{"name":"a{b}c","k":1}').name === 'a{b}c');
      ok('extractJson returns null on junk', composer.extractJson('no json here') === null);

      // The honesty check that matters: a table name the user never said must
      // come back flagged, and one they did say must not.
      const flagged = composer.unstatedIdentifiers(
        { dataSources: ['orders_2024.csv'], instructions: [], constraints: [], goal: '', outputSchema: {} },
        'read the invoices in raw_documents'
      );
      ok('an identifier the user never mentioned is flagged',
        flagged.indexOf('orders_2024.csv') !== -1, JSON.stringify(flagged));

      const notFlagged = composer.unstatedIdentifiers(
        { dataSources: ['raw_documents.body_text'], instructions: [], constraints: [], goal: '', outputSchema: {} },
        'read raw_documents.body_text'
      );
      ok('an identifier the user did mention is not flagged',
        notFlagged.length === 0, JSON.stringify(notFlagged));

      // Noise control 1: separators alone are not a difference. People write
      // "invoice number"; specs write invoice_number.
      const separators = composer.unstatedIdentifiers(
        { dataSources: ['invoice_number column'], instructions: [], constraints: [], goal: '', outputSchema: {} },
        'pull the vendor and the invoice number out of each page'
      );
      ok('a separator-only difference is not flagged',
        separators.length === 0, JSON.stringify(separators));

      // Noise control 2: the output schema is what the agent CREATES, so its
      // field names are never "confirm this exists" material.
      const schemaOnly = composer.unstatedIdentifiers(
        { dataSources: [], instructions: [], constraints: [], goal: '',
          outputSchema: { source_file: 'string', unreadable_files: 'array' } },
        'pull the vendor and total from each invoice'
      );
      ok('output schema field names are never flagged as unverified',
        schemaOnly.length === 0, JSON.stringify(schemaOnly));

      // Noise control 3: prose abbreviations are not identifiers. Specs are
      // full of "e.g." and "i.e."; flagging them as tables nobody can confirm
      // trains the operator to skim the list, which defeats the whole check.
      const prose = composer.unstatedIdentifiers(
        { dataSources: [], instructions: ['Use the label (e.g. Invoice No.) to find it, i.e. the printed one.'],
          constraints: [], goal: '', outputSchema: {} },
        'pull the invoice number'
      );
      ok('prose abbreviations are not treated as identifiers',
        prose.length === 0, JSON.stringify(prose));

      const placeholder = composer.unstatedIdentifiers(
        { dataSources: ['<source table>'], instructions: [], constraints: [], goal: '', outputSchema: {} },
        'pull the totals'
      );
      ok('a visible placeholder is surfaced for confirmation',
        placeholder.indexOf('<source table>') !== -1, JSON.stringify(placeholder));

      const h = composer.heuristic('Read the invoices in raw_documents and write the vendor and total to a table.', 'en');
      ok('the heuristic path builds from the user own words',
        h.goal.indexOf('invoices') !== -1, h.goal);
      ok('the heuristic path never claims to be a model',
        h.assumptions.some((a) => /no model/i.test(a)), JSON.stringify(h.assumptions));

      ok('architectCommand is deterministic',
        pb.architectCommand({ agent: { name: 'X' } }) === pb.architectCommand({ agent: { name: 'X' } }));
      ok('architectCommand names the agent it is asking for',
        pb.architectCommand({ agent: { name: 'Field Extractor' } }).indexOf('"Field Extractor"') !== -1);
    }

    // ----------------------------------------------------- the advanced editor
    {
      const r = await request(port, 'GET', MOUNT + '/advanced');
      ok('advanced editor returns 200', r.status === 200, 'got ' + r.status);
      ok('advanced editor still carries the full field form',
        r.raw.indexOf('id="wizard"') !== -1 && r.raw.indexOf('id="f-outputSchema"') !== -1);
      ok('advanced editor exposes the same paste-ready command',
        r.raw.indexOf('id="btn-copy-command"') !== -1);
      ok('advanced editor links back to the box', r.raw.indexOf('href="./"') !== -1);
    }
    {
      const r = await request(port, 'GET', MOUNT + '/gallery');
      ok('gallery page returns 200', r.status === 200, 'got ' + r.status);
      ok('gallery page has the template grid', r.raw.indexOf('id="tpl-grid"') !== -1);
    }
    {
      const r = await request(port, 'GET', MOUNT + '/promptBuilder.js');
      ok('promptBuilder bundle serves 200', r.status === 200, 'got ' + r.status);
      ok('promptBuilder bundle is javascript',
        (r.headers['content-type'] || '').indexOf('javascript') !== -1, r.headers['content-type']);
      ok('promptBuilder bundle exposes window.PromptBuilder', r.raw.indexOf('window.PromptBuilder') !== -1);
      ok('promptBuilder bundle carries buildPrompt', r.raw.indexOf('buildPrompt') !== -1);
    }
    {
      const r = await request(port, 'GET', MOUNT + '/api/v1/i18n');
      ok('i18n dictionary returns 200', r.status === 200, 'got ' + r.status);
      ok('i18n exposes the en bundle', r.body && r.body.lang === 'en' && r.body.strings.app_title);
      const es = await request(port, 'GET', MOUNT + '/api/v1/i18n?lang=es');
      ok('i18n es falls back per key to en',
        es.body && es.body.lang === 'es' && es.body.strings.step_identity === 'Identity',
        es.body && es.body.strings.step_identity);
    }

    // ------------------------------------------- the app executes no prompts
    {
      // The hardest boundary in this app, and a subtle one now that a model is
      // involved: the composer uses a model to WRITE the spec, and nothing here
      // ever RUNS the spec it wrote. The deliverable is the JSON the user takes
      // elsewhere. Asserted against the source so a future "add a little Try it
      // button" has to change this test on the way in.
      const fs = require('fs');
      const path = require('path');
      const dirs = ['lib', 'routes', 'models', 'seeds'];
      const importers = [];
      for (const d of dirs) {
        for (const f of fs.readdirSync(path.join(__dirname, d))) {
          if (!f.endsWith('.js')) continue;
          const src = fs.readFileSync(path.join(__dirname, d, f), 'utf8');
          if (/require\(['"](openai|@anthropic-ai\/sdk|langchain)/.test(src)) importers.push(d + '/' + f);
        }
      }
      ok('exactly one file may reach a model, and it is the composer',
        importers.length === 1 && importers[0] === 'lib/compose.js', importers.join(','));

      const composeSrc = fs.readFileSync(path.join(__dirname, 'lib', 'compose.js'), 'utf8');
      ok('the composer authors a specification (not an answer)',
        composeSrc.indexOf('You are a specification author') !== -1);
      ok('the composer never feeds the assembled prompt back to a model',
        composeSrc.indexOf('system_prompt') === -1);

      const routeSrc = fs.readFileSync(path.join(__dirname, 'routes', 'agents.js'), 'utf8');
      ok('no route sends output_schema or system_prompt to a model',
        !/messages\.create|\.completions\./.test(routeSrc));
    }

    // ------------------------------------------------- update + delete round
    if (createdId) {
      const upd = await request(port, 'PUT', MOUNT + '/api/v1/agents/' + createdId,
        Object.assign({}, AGENT_BODY, { name: 'SIT Renamed' }), authA);
      ok('update with JWT returns 200', upd.status === 200, 'got ' + upd.status);
      ok('update applied the new name', upd.body && upd.body.name === 'SIT Renamed', upd.body && upd.body.name);
      ok('update kept the tenant_id', upd.body && upd.body.tenant_id === TENANT_A);

      const updNoAuth = await request(port, 'PUT', MOUNT + '/api/v1/agents/' + createdId, AGENT_BODY);
      ok('update without JWT returns 401', updNoAuth.status === 401, 'got ' + updNoAuth.status);

      const delNoAuth = await request(port, 'DELETE', MOUNT + '/api/v1/agents/' + createdId);
      ok('delete without JWT returns 401', delNoAuth.status === 401, 'got ' + delNoAuth.status);

      const del = await request(port, 'DELETE', MOUNT + '/api/v1/agents/' + createdId, undefined, authA);
      ok('delete with JWT returns 200', del.status === 200, 'got ' + del.status);

      const gone = await request(port, 'GET', MOUNT + '/api/v1/agents/' + createdId, undefined, authA);
      ok('deleted agent reads 404', gone.status === 404, 'got ' + gone.status);
    }

    // -------------------------------------------------- promptBuilder purity
    {
      const a = pb.buildPrompt(AGENT_BODY);
      const b = pb.buildPrompt(AGENT_BODY);
      // Everything except the timestamp must be byte-identical run to run.
      delete a.generated_at; delete b.generated_at;
      ok('buildPrompt is deterministic', JSON.stringify(a) === JSON.stringify(b));
      ok('buildPrompt accepts an array for a list field',
        pb.buildPrompt({ name: 'x', instructions: ['one', 'two'] }).instructions.length === 2);
      ok('buildPrompt drops blank lines from list fields',
        pb.buildPrompt({ name: 'x', constraints: 'a\n\n\nb\n' }).constraints.length === 2);
      ok('buildPrompt never returns an empty name',
        pb.buildPrompt({}).agent.name === 'Untitled Agent');
    }

  } catch (err) {
    fail++;
    results.push(['FAIL', 'harness', err.message]);
    console.error(err);
  } finally {
    // Clean up after ourselves — SIT tenants never linger in a shared DB.
    try {
      await store.purgeTenant(TENANT_A);
      await store.purgeTenant(TENANT_B);
    } catch (e) {
      console.error('[sit] cleanup failed:', e.message);
    }
    server.close();
  }

  // ------------------------------------------------------------- the report
  console.log('\n# SIT — AI Agent Prompt Builder for Data Writing\n');
  console.log('| Result | Check | Detail |');
  console.log('|---|---|---|');
  for (const [r, n, d] of results) {
    console.log(`| ${r} | ${n} | ${String(d).replace(/\|/g, '/').slice(0, 90)} |`);
  }
  console.log(`\n**${pass} passed, ${fail} failed** — ${fail === 0 ? 'PASS' : 'FAIL'}\n`);

  process.exit(fail === 0 ? 0 : 1);
})();
