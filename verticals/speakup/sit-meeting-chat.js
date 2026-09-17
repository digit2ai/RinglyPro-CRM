'use strict';

/**
 * AutoDev — the meetings chat, System Integration Test.
 *
 * Boots the SpeakUp router against the database in .env with NO external keys. The Anthropic
 * client is a FAKE injected into factory/llm.js, which is what lets the model path — streaming,
 * refinements carrying prior turns, a screenshot as an image block, converting to a prompt and
 * transferring — be tested offline at all. GitHub is a fake that records calls. It creates its
 * own throwaway accounts (their own tenants) and deletes every row it made.
 *
 * It attacks the guarantees: one tenant cannot read, write or fetch another's meeting, chat or
 * screenshot; History lists meetings only and escapes search wildcards; a missing or broke
 * model is labelled, never dressed up as an answer; and "Transfer to Factory" opens a job that
 * stops at a plan — no dispatch, and only for the Factory operator.
 *
 *   node verticals/speakup/sit-meeting-chat.js
 *
 * NOT COVERED HERE (production only): the real Anthropic model's wording and latency, dictation
 * (the browser's own speech recognition), and the owner's real meetings.
 */

require('dotenv').config();
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
process.env.SPEAKUP_SEED_USERS = 'off';
process.env.SPEAKUP_FACTORY_POLLER = 'off';
process.env.SPEAKUP_AUTO_RUN = 'on';   // even with auto-run ON, a transfer must not dispatch
process.env.SPEAKUP_JWT_SECRET = 'sit-meeting-chat-jwt-' + Date.now();

const STAMP = Date.now();
const OP = `sit-mchat-op-${STAMP}@speakup.invalid`;
const OTHER = `sit-mchat-other-${STAMP}@speakup.invalid`;
process.env.SPEAKUP_FACTORY_ALLOWED_EMAILS = OP;
process.env.SPEAKUP_FACTORY_SECRET = 'sit-mchat-secret-' + STAMP;
process.env.SPEAKUP_GITHUB_TOKEN = 'fake-token-for-sit';
process.env.SPEAKUP_TEAM_PASSWORD = 'sit-private-password-not-published';

const express = require('express');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/speakup', require('./src/index'));

const { User, Recording, Transcript, MeetingChat, MeetingIntel, Command, Job, JobEvent, Upload, Audit, Project, Document, sequelize } = require('./src/models');
const llm = require('./src/factory/llm');
const github = require('./src/factory/github');
const projects = require('./src/factory/projects');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ── Fake GitHub: records every call; a transfer must make none that dispatch ──────
const ghCalls = [];
github.__setFetch(async (url, opts) => {
  ghCalls.push({ url, method: (opts && opts.method) || 'GET' });
  return { ok: false, status: 404, text: async () => '{"message":"sit"}' };
});

// ── Fake Anthropic client ─────────────────────────────────────────────────────
const fake = { calls: [], mode: 'ok', delay: 0 };
function lastText(args) {
  const last = args.messages[args.messages.length - 1];
  if (typeof last.content === 'string') return last.content;
  return (last.content.find(b => b.type === 'text') || {}).text || '';
}
const conversions = () => fake.calls.filter(c => /Convert your previous answer|Convierte tu respuesta anterior|Convert this meeting|Convierte esta reunión/.test(lastText(c.args))).length;
fake.reply = (args) => {
  const t = lastText(args);
  if (/prompt/i.test(t)) return 'BUILD PROMPT:\nAdd a weekly report page that lists open tasks. Check: the page loads and lists tasks. Do not change login.';
  if (/minutas|acta/i.test(t)) return 'Acta de la reunion\n- Se reviso el reporte semanal.';
  if (/shorter|corto/i.test(t)) return 'Short summary.';
  if (/screenshot|captura/i.test(t)) return 'The screenshot shows a chart.';
  return 'Summary: the team reviewed the weekly report and agreed to add a task list.';
};
function creditError() { const e = new Error('Your credit balance is too low to access the Anthropic API.'); e.status = 400; return e; }
fake.messages = {
  stream(args) {
    fake.calls.push({ type: 'stream', args });
    const listeners = [];
    const obj = {
      on(ev, fn) { if (ev === 'text') listeners.push(fn); return obj; },
      async finalMessage() {
        if (fake.mode === 'credit') throw creditError();
        const text = fake.reply(args);
        await wait(fake.delay);
        for (const part of text.match(/.{1,12}/gs)) listeners.forEach(f => f(part));
        return { content: [{ type: 'text', text }] };
      }
    };
    return obj;
  },
  async create(args) {
    fake.calls.push({ type: 'create', args });
    if (fake.mode === 'credit') throw creditError();
    return { content: [{ type: 'text', text: fake.reply(args) }] };
  }
};

const server = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/speakup';
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
  const users = [];

  async function mkUser(email, role) {
    const u = await User.create({ email, name: email.split('@')[0], role, lang: 'es', password_hash: await bcrypt.hash('sit-pass-' + STAMP, 4) });
    u.tenant_id = u.id; await u.save(); users.push(u); return u;
  }
  async function login(email) {
    const r = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'sit-pass-' + STAMP }) });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  }
  const H = (cookie, extra) => Object.assign({ 'Content-Type': 'application/json', Cookie: cookie, 'X-SpeakUp': '1' }, extra || {});
  async function call(cookie, method, path, body, extra) {
    const r = await fetch(base + '/api/v1' + path, { method, headers: H(cookie, extra), body: body ? JSON.stringify(body) : undefined });
    let d = null; try { d = await r.json(); } catch (e) {}
    return { status: r.status, d };
  }
  // POST /chat, read as NDJSON. Records when each line arrived, to prove it streams.
  async function chat(cookie, meetingId, body, extra) {
    const t0 = Date.now();
    const r = await fetch(base + '/api/v1/meetings/' + meetingId + '/chat', { method: 'POST', headers: H(cookie, extra), body: JSON.stringify(body) });
    if (!/ndjson/.test(r.headers.get('content-type') || '')) { let d = null; try { d = await r.json(); } catch (e) {} return { status: r.status, d, lines: [] }; }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; const lines = [];
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl; while ((nl = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (l) lines.push(Object.assign(JSON.parse(l), { at: Date.now() - t0 })); }
    }
    return { status: r.status, lines, done: lines.find(l => l.type === 'done'), user: lines.find(l => l.type === 'user'), messages: lines.filter(l => l.type === 'message').map(l => l.message), error: lines.find(l => l.type === 'error') };
  }

  try {
    await wait(4000); // let the router sync the new table
    const op = await mkUser(OP, 'admin');
    const other = await mkUser(OTHER, 'admin');     // an admin, but NOT the Factory operator
    await projects.ensureDefaults(op.id);
    const A = await login(OP), B = await login(OTHER);
    ok(!!A && !!B, 'both throwaway accounts can sign in');

    // Meetings. The transcript is invented; this repository is public.
    const T = 'Weekly review. We looked at the weekly report. We agreed to add a page that lists the open tasks. The discount code is 50%_OFF.';
    const meet = await Recording.create({ tenant_id: op.id, user_id: op.id, title: 'SIT weekly review ' + STAMP, status: 'done', mode: 'meeting' });
    await Transcript.create({ tenant_id: op.id, recording_id: meet.id, text: T, engine: 'whisper' });
    const legacy = await Recording.create({ tenant_id: op.id, user_id: op.id, title: 'SIT older recording ' + STAMP, status: 'done', mode: null });
    const instr = await Recording.create({ tenant_id: op.id, user_id: op.id, title: 'SIT factory instruction ' + STAMP, status: 'done', mode: 'architect' });
    const live = await Recording.create({ tenant_id: op.id, user_id: op.id, title: 'SIT still recording ' + STAMP, status: 'recording', mode: 'meeting' });
    const theirs = await Recording.create({ tenant_id: other.id, user_id: other.id, title: 'SIT other tenant ' + STAMP, status: 'done', mode: 'meeting' });
    await Transcript.create({ tenant_id: other.id, recording_id: theirs.id, text: 'private words of another tenant', engine: 'whisper' });

    // ── History ────────────────────────────────────────────────────────────────
    const h = await call(A, 'GET', '/meetings?limit=100');
    const ids = (h.d.meetings || []).map(m => m.id);
    ok(h.status === 200 && ids.includes(meet.id) && ids.includes(legacy.id), 'history lists meetings, including ones made before modes existed');
    ok(!ids.includes(instr.id), 'history leaves out Factory instructions');
    ok(!ids.includes(live.id), 'history leaves out a recording still in progress');
    ok(!ids.includes(theirs.id), 'history never lists another tenant\'s meeting');
    ok(ids.indexOf(legacy.id) < ids.indexOf(meet.id), 'newest first');
    const byTitle = await call(A, 'GET', '/meetings?q=' + encodeURIComponent('weekly review ' + STAMP));
    ok(byTitle.d.meetings.length === 1 && byTitle.d.meetings[0].id === meet.id, 'search finds a meeting by title');
    const bySaid = await call(A, 'GET', '/meetings?q=' + encodeURIComponent('open tasks'));
    ok(bySaid.d.meetings.some(m => m.id === meet.id), 'search finds a meeting by what was said');
    ok((await call(A, 'GET', '/meetings?q=' + encodeURIComponent('private words'))).d.meetings.length === 0, 'search cannot reach another tenant\'s transcript');
    const wild = await call(A, 'GET', '/meetings?q=' + encodeURIComponent('%'));
    ok(wild.status === 200 && wild.d.meetings.every(m => m.id !== legacy.id), 'a "%" typed into search is a character, not a match-everything wildcard');
    const page1 = await call(A, 'GET', '/meetings?limit=1&page=1');
    ok(page1.d.meetings.length === 1 && page1.d.has_more === true && page1.d.total >= 2, 'history paginates');

    // ── One meeting, and tenancy ───────────────────────────────────────────────
    const one = await call(A, 'GET', '/meetings/' + meet.id);
    ok(one.status === 200 && one.d.meeting.transcript === T && /2026|20\d\d/.test(one.d.meeting.date_label), 'a meeting returns its transcript and a readable date');
    ok((await call(A, 'GET', '/meetings/' + theirs.id)).status === 404, 'another tenant\'s meeting is 404, not 403');
    ok((await call(B, 'GET', '/meetings/' + meet.id + '/chat')).status === 404, 'another tenant cannot read this conversation');
    ok((await call(A, 'GET', '/meetings/' + instr.id)).status === 404 && (await call(A, 'GET', '/meetings/' + live.id + '/chat')).status === 404,
      'a Factory instruction or a recording in progress cannot be opened as a meeting');

    // ── The model path, streamed ───────────────────────────────────────────────
    llm.__setClient(fake);
    fake.delay = 900;
    const s1 = await chat(A, meet.id, { message: 'Give me a summary', lang: 'en' });
    ok(s1.status === 200 && !!s1.user && !!s1.done, 'the reply streams as NDJSON: the question, then the stored answer');
    ok(s1.user.at < s1.done.at - 500, `the first line arrives before the model finishes (${s1.user.at} ms vs ${s1.done.at} ms)`);
    ok(s1.lines.filter(l => l.type === 'delta').length > 1, 'the answer arrives in pieces, not all at once');
    ok(/Summary:/.test(s1.done.message.content) && s1.done.message.composed_by === 'claude-sonnet-5' && !s1.done.message.offline, 'the stored answer names the model that wrote it');
    const sysArg = fake.calls[fake.calls.length - 1].args.system;
    const sys = [].concat(sysArg).map(b => (typeof b === 'string' ? b : b.text)).join('');
    ok(Array.isArray(sysArg) && sysArg[0].cache_control && sysArg[0].cache_control.type === 'ephemeral', 'the transcript is sent as a cacheable block');
    ok(sys.includes(T) && sys.includes('SIT weekly review ' + STAMP) && sys.includes('meeting #' + meet.id), 'the model gets the transcript, the title and the meeting id');
    ok(/No emojis/.test(sys) && /language of the user's latest message/.test(sys), 'and the rules: plain text, no emojis, the user\'s language');
    fake.delay = 0;

    const s2 = await chat(A, meet.id, { message: 'Dame las minutas', lang: 'es' });
    ok(/Acta/.test(s2.done.message.content), 'a Spanish request is answered');
    const s3 = await chat(A, meet.id, { message: 'make it shorter', lang: 'en' });
    const sent = fake.calls[fake.calls.length - 1].args.messages;
    ok(sent.some(m => m.content === 'Dame las minutas') && sent.some(m => /Acta/.test(typeof m.content === 'string' ? m.content : '')),
      'a refinement carries the earlier turns, so the model can edit its previous answer');
    ok(s3.done.message.content === 'Short summary.', 'and the refined answer is stored');
    ok(sent.every((m, i) => i === 0 || m.role !== sent[i - 1].role) && sent[0].role === 'user', 'the turns alternate, as the API requires');

    // A screenshot goes to the model as an image block, and only this tenant can fetch it.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
    const s5 = await chat(A, meet.id, { message: 'what is in this screenshot', lang: 'en', attachment: { name: 'a.png', mime: 'image/png', data_base64: png.toString('base64') } });
    const lastArgs = fake.calls[fake.calls.length - 1].args;
    const lastMsg = lastArgs.messages[lastArgs.messages.length - 1];
    ok(Array.isArray(lastMsg.content) && lastMsg.content[0].type === 'image' && lastMsg.content[0].source.media_type === 'image/png', 'the screenshot reaches the model as an image');
    ok(!!s5.user.message.attachment_url, 'the question keeps a link to its screenshot');
    const imgA = await fetch('http://127.0.0.1:' + server.address().port + s5.user.message.attachment_url, { headers: { Cookie: A } });
    ok(imgA.status === 200 && /image\/png/.test(imgA.headers.get('content-type')) && imgA.headers.get('x-content-type-options') === 'nosniff', 'its owner can see the screenshot');
    const imgB = await fetch('http://127.0.0.1:' + server.address().port + s5.user.message.attachment_url, { headers: { Cookie: B } });
    ok(imgB.status === 404, 'another tenant cannot fetch it, even with the exact URL');
    const bad = await chat(A, meet.id, { message: 'x', attachment: { name: 'a.svg', mime: 'image/svg+xml', data_base64: 'PHN2Zy8+' } });
    ok(bad.status === 400, 'an SVG (which can carry script) is refused as an attachment');
    const liar = await chat(A, meet.id, { message: 'x', attachment: { name: 'a.png', mime: 'image/png', data_base64: Buffer.from('<script>alert(1)</script>').toString('base64') } });
    ok(liar.status === 400, 'a file claiming to be PNG that is not one is refused');

    // The prompt last, so the transfer below starts from an answer that is already a prompt.
    const s4 = await chat(A, meet.id, { message: 'convert this to a build prompt', lang: 'en' });
    ok(s4.done.message.kind === 'prompt', 'a build prompt is stored as a prompt');

    // ── Tenancy and origin on writes ───────────────────────────────────────────
    ok((await chat(B, meet.id, { message: 'hello' })).status === 404, 'another tenant cannot write into this conversation');
    ok((await chat(A, meet.id, { message: 'hello' }, { Origin: 'https://evil.example' })).status === 403, 'a cross-site request is refused');
    ok((await chat(A, meet.id, { message: '   ' })).status === 400, 'an empty message is refused');

    // ── Transfer to Factory ────────────────────────────────────────────────────
    const dispatchesBefore = ghCalls.filter(c => /dispatches/.test(c.url)).length;
    const convBefore = conversions();
    const t1 = await chat(A, meet.id, { message: 'transfer to Factory', lang: 'en' });
    const receipt = t1.messages.find(m => m.kind === 'transfer');
    ok(!!receipt && receipt.job_id > 0, 'typing "transfer to Factory" opens a Factory job and returns a receipt');
    ok(conversions() === convBefore, 'the last answer was already a prompt, so it was sent as it was, not converted');
    const job = receipt && await Job.findByPk(receipt.job_id);
    ok(job && job.tenant_id === op.id, 'the job belongs to this tenant');
    const cmd = job && await Command.findByPk(job.command_id);
    ok(cmd && /^\/ringlypro-architect\n/.test(cmd.transcript) && cmd.transcript.includes('meeting #' + meet.id) && cmd.transcript.includes('weekly report page'),
      'the Factory received the prompt, wrapped with the source meeting');
    ok(cmd && cmd.intent === 'PREPARE_IMPLEMENTATION', 'and read it as an instruction to plan, not a question');
    ok(cmd && !cmd.transcript.includes('SIT weekly review'), 'the meeting title is not handed to the Factory');
    const dup = await call(A, 'POST', '/meetings/' + meet.id + '/factory', { message_id: s4.done.message.id });
    ok(dup.status === 409, 'the same answer cannot open a second job');
    // Give the background plan a moment, then prove nothing ran.
    await wait(2500);
    const after = await Job.findByPk(receipt.job_id);
    ok(!['QUEUED', 'CODING', 'TESTING', 'FIXING', 'PUSHING', 'PR_CREATED', 'READY_FOR_REVIEW', 'DEPLOYING', 'DEPLOYED'].includes(after.status),
      `the job stops before running (status ${after.status}), even with SPEAKUP_AUTO_RUN on`);
    ok(ghCalls.filter(c => /dispatches/.test(c.url)).length === dispatchesBefore, 'nothing was dispatched to GitHub');
    ok(await Audit.count({ where: { tenant_id: op.id, action: 'meeting.transferred_to_factory', entity_id: meet.id } }) === 1, 'the transfer is audited against the meeting');

    // Transfer a plain answer with the button: converted first, in the same step.
    const conv0 = conversions();
    const plain = s2.done.message;
    const t2 = await call(A, 'POST', '/meetings/' + meet.id + '/factory', { message_id: plain.id, lang: 'es' });
    ok(t2.status === 200 && t2.d.job_id > 0, 'the button transfers a specific answer');
    ok(conversions() === conv0 + 1, 'an answer that was not a prompt was converted first');
    ok(t2.d.messages.length === 2 && t2.d.messages[0].kind === 'prompt' && t2.d.messages[1].kind === 'transfer', 'the prompt that was sent is shown, then the receipt');
    ok(/Transferido/.test(t2.d.messages[1].content), 'the receipt follows the screen language');
    ok((await call(A, 'POST', '/meetings/' + meet.id + '/factory', { message_id: 999999999 })).status === 404, 'a message from nowhere cannot be transferred');

    // A prompt that quotes the meeting, or names someone in it, never reaches the Factory.
    await meet.update({ participants: ['Marisol Quintero'] });
    const jobsBefore = await Job.count({ where: { tenant_id: op.id } });
    const quoting = await MeetingChat.create({ tenant_id: op.id, meeting_id: meet.id, user_id: op.id, role: 'assistant', kind: 'prompt', composed_by: 'claude-sonnet-5',
      content: 'BUILD PROMPT:\nWe agreed to add a page that lists the open tasks. Make it so.' });
    const q1 = await call(A, 'POST', '/meetings/' + meet.id + '/factory', { message_id: quoting.id, lang: 'en' });
    ok(q1.status === 422 && /verbatim quote/.test(q1.d.error), 'a prompt quoting the transcript is refused, and told why');
    const naming = await MeetingChat.create({ tenant_id: op.id, meeting_id: meet.id, user_id: op.id, role: 'assistant', kind: 'prompt', composed_by: 'claude-sonnet-5',
      content: 'BUILD PROMPT:\nAdd a task page and assign it to Marisol Quintero.' });
    const q2 = await call(A, 'POST', '/meetings/' + meet.id + '/factory', { message_id: naming.id, lang: 'en' });
    ok(q2.status === 422 && /name from the meeting/.test(q2.d.error), 'a prompt naming a participant is refused');
    ok(await Job.count({ where: { tenant_id: op.id } }) === jobsBefore, 'neither opened a job');

    // Only the Factory operator can transfer.
    const theirsChat = await chat(B, theirs.id, { message: 'send to Factory', lang: 'en' });
    ok(!!theirsChat.error && /operator/i.test(theirsChat.error.error), 'someone who is not the Factory operator is told so');
    ok(await Job.count({ where: { tenant_id: other.id } }) === 0, 'and no job was opened for them');

    // ── No model, or a broke one: labelled, never dressed up ───────────────────
    llm.__setClient(null);
    const o1 = await chat(A, meet.id, { message: 'Give me a summary', lang: 'en' });
    ok(o1.done.message.offline === true && /No model/.test(o1.done.message.content) && /ANTHROPIC_API_KEY/.test(o1.done.message.content), 'no key: the reply is labelled and says why');
    ok(o1.done.message.content.includes('weekly report'), 'and offers the transcript instead of an invented summary');
    const o2 = await chat(A, meet.id, { message: 'convierte esto en un prompt', lang: 'es' });
    ok(o2.done.message.kind === 'text' && /necesita el modelo/.test(o2.done.message.content) && !o2.done.message.content.includes('weekly report'),
      'no key: no build prompt is assembled from the transcript, and it says why');
    const o2t = await call(A, 'POST', '/meetings/' + meet.id + '/factory', { message_id: o1.done.message.id, lang: 'en' });
    ok(o2t.status === 503 && /needs the model/.test(o2t.d.error), 'no key: transferring a plain answer stops, because converting it needs the model');
    llm.__setClient(fake); fake.mode = 'credit';
    const o3 = await chat(A, meet.id, { message: 'Give me a summary', lang: 'en' });
    ok(o3.done.message.offline === true && /out of credit/.test(o3.done.message.content), 'a model out of credit is named as such, not hidden');
    fake.mode = 'ok';

    const all = await call(A, 'GET', '/meetings/' + meet.id + '/chat');
    ok(all.status === 200 && all.d.messages.length >= 14 && all.d.messages.every(m => m.id), 'the whole conversation is stored and comes back in order');
    ok(await MeetingChat.count({ where: { tenant_id: other.id, meeting_id: meet.id } }) === 0, 'no row of this conversation was written under another tenant');

    // Let any background plan finish before its rows are deleted.
    const end = Date.now() + 30000;
    while (Date.now() < end && await Job.count({ where: { tenant_id: op.id, status: ['ANALYZING', 'PLANNING'] } })) await wait(500);
  } catch (e) {
    fail++; console.log('ERROR ' + e.stack);
  }

  // ── Cleanup: every row this run made ─────────────────────────────────────────
  try {
    const tenants = users.map(u => u.id);
    if (tenants.length) {
      const recIds = (await Recording.findAll({ where: { tenant_id: tenants }, attributes: ['id'] })).map(r => r.id);
      await Document.destroy({ where: { recording_id: recIds.length ? recIds : [0] } });
      for (const M of [MeetingChat, MeetingIntel, Command, JobEvent, Job, Audit, Project, Transcript, Recording, Upload]) await M.destroy({ where: { tenant_id: tenants } });
      await Transcript.destroy({ where: { recording_id: recIds.length ? recIds : [0] } });
      await sequelize.query('DELETE FROM su_usage WHERE tenant_id IN (:t)', { replacements: { t: tenants } });
      await User.destroy({ where: { id: tenants } });
      const left = await MeetingChat.count({ where: { tenant_id: tenants } }) + await Recording.count({ where: { tenant_id: tenants } }) + await User.count({ where: { id: tenants } });
      ok(left === 0, 'cleanup removed every SIT row');
    }
  } catch (e) { fail++; console.log('CLEANUP ERROR ' + e.message); }

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  console.log('NOT COVERED (production only): the real model\'s wording and latency, browser dictation, the owner\'s real meetings.');
  server.close();
  process.exit(fail ? 1 : 0);
});
