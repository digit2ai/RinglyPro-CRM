'use strict';

/**
 * AutoDev — meetings: the history list and the conversation about one meeting.
 * Mounted at /speakup/api/v1/meetings.
 *
 *   GET  /                      history, newest first, searchable, paginated
 *   GET  /:id                   the meeting header and its transcript
 *   GET  /:id/chat              the conversation so far
 *   POST /:id/chat              ask anything; streams the reply as NDJSON and stores both turns
 *   POST /:id/factory           hand an answer to the Factory (stops at a plan)
 *   GET  /:id/chat/attachment/:uploadId   a screenshot shown in the thread
 *
 * A MEETING IS A su_recordings ROW. Every query is scoped to the tenant from the session,
 * never from the body, and a meeting from another tenant answers 404.
 *
 * THE LIST SHOWS MEETINGS ONLY. Every instruction typed into the Factory console is saved as
 * a recording too (mode 'architect'), so an unfiltered list would fill History with them.
 * Meetings are rows whose mode is 'meeting', or null for recordings made before modes existed.
 */

const express = require('express');
const router = express.Router();
const { sequelize, Recording, Transcript, MeetingChat, Upload, User } = require('../models');
const security = require('../factory/security');
const intents = require('../factory/intents');
const audit = require('../factory/audit');
const llm = require('../factory/llm');
const chat = require('../factory/meeting-chat');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
const wrap = (fn) => (req, res) => fn(req, res).catch(e => {
  console.error('SpeakUp meetings route error', req.method, req.path, e.message);
  if (res.headersSent) { try { res.write(JSON.stringify({ type: 'error', error: e.message }) + '\n'); res.end(); } catch (x) {} return; }
  res.status(500).json({ error: e.message });
});
function mutation(req, res, next) {
  if (!security.sameOriginRequest(req)) return res.status(403).json({ error: 'Cross-site request refused' });
  next();
}

// The role and email come from the database, not the token — the Factory routes do the same,
// and transferring to the Factory is an operator action.
router.use((req, res, next) => {
  (async () => {
    const u = req.user && await User.findByPk(req.user.id);
    if (!u || String(u.email).toLowerCase() !== String(req.user.email || '').toLowerCase()) return res.status(401).json({ error: 'No autorizado' });
    req.user = Object.assign({}, req.user, { role: u.role, email: u.email, tenant_id: u.tenant_id || u.id });
    next();
  })().catch(e => res.status(500).json({ error: e.message }));
});

const MEETING_WHERE = "r.status <> 'recording' AND (r.mode IS NULL OR r.mode = 'meeting')";
// ONE transcript per meeting. su_transcripts.recording_id is not unique and two racing autosaves
// can write two rows; a plain join would list that meeting twice and inflate the count.
const LATEST_TRANSCRIPT = 'LEFT JOIN LATERAL (SELECT text FROM su_transcripts x WHERE x.recording_id = r.id ORDER BY x.id DESC LIMIT 1) t ON true';
const IMAGE_MIME = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1, 'image/gif': 1 };
const MAX_IMAGE = 6 * 1024 * 1024;
const DAILY_CAP = parseInt(process.env.SPEAKUP_CHAT_DAILY_CAP, 10) || 400;

async function ownMeeting(req, res) {
  const rec = await Recording.findOne({ where: { id: parseInt(req.params.id, 10) || 0, tenant_id: tenantOf(req) } });
  // A Factory instruction or a recording still in progress is not a meeting to talk to.
  if (!rec || rec.status === 'recording' || !(rec.mode == null || rec.mode === 'meeting')) { res.status(404).json({ error: 'Meeting not found' }); return null; }
  return rec;
}
async function transcriptOf(rec) {
  const tr = await Transcript.findOne({ where: { recording_id: rec.id, tenant_id: rec.tenant_id }, order: [['id', 'DESC']] })
    || await Transcript.findOne({ where: { recording_id: rec.id }, order: [['id', 'DESC']] });
  return tr ? String(tr.text || '') : '';
}
function view(m) {
  return { id: m.id, role: m.role, kind: m.kind, content: m.content, attachment_url: m.attachment_url ? `/speakup/api/v1/meetings/${m.meeting_id}/chat/attachment/${String(m.attachment_url).replace(/^upload:/, '')}` : null,
    factory_ref: m.factory_ref, job_id: m.factory_ref && /^job:\d+$/.test(m.factory_ref) ? parseInt(m.factory_ref.slice(4), 10) : null,
    composed_by: m.composed_by, offline: m.composed_by === 'offline', created_at: m.created_at };
}
function uiLang(req, text) { const l = req.body && req.body.lang; return l === 'en' || l === 'es' ? l : (chat.looksSpanish(text) ? 'es' : 'en'); }

// ── History ───────────────────────────────────────────────────────────────────
router.get('/', wrap(async (req, res) => {
  const tenant_id = tenantOf(req);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const q = String(req.query.q || '').trim().slice(0, 200);
  const repl = { tenant_id, limit, offset: (page - 1) * limit };
  let search = '';
  if (q) {
    // Title or anything said in the meeting. ILIKE with the wildcards escaped, so a "%" typed
    // into the box is a character, not a pattern.
    repl.q = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    search = ' AND (r.title ILIKE :q OR t.text ILIKE :q)';
  }
  const where = `r.tenant_id = :tenant_id AND ${MEETING_WHERE}${search}`;
  const [rows] = await sequelize.query(
    `SELECT r.id, r.title, r.created_at, r.duration_sec, r.participants, (t.text IS NOT NULL AND length(trim(t.text)) > 0) AS has_transcript
       FROM su_recordings r ${LATEST_TRANSCRIPT}
      WHERE ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT :limit OFFSET :offset`, { replacements: repl });
  const [[{ total }]] = await sequelize.query(
    `SELECT COUNT(*)::int AS total FROM su_recordings r ${LATEST_TRANSCRIPT} WHERE ${where}`, { replacements: repl });
  res.json({ meetings: rows, page, limit, total, has_more: page * limit < total });
}));

// ── One meeting ───────────────────────────────────────────────────────────────
router.get('/:id', wrap(async (req, res) => {
  const rec = await ownMeeting(req, res); if (!rec) return;
  const text = await transcriptOf(rec);
  res.json({ meeting: { id: rec.id, title: rec.title, created_at: rec.created_at, date_label: chat.meetingDate(rec), duration_sec: rec.duration_sec,
    status: rec.status, participants: rec.participants || [], transcript: text, has_transcript: !!text.trim() }, model: { configured: llm.configured() } });
}));

router.get('/:id/chat', wrap(async (req, res) => {
  const rec = await ownMeeting(req, res); if (!rec) return;
  const rows = await MeetingChat.findAll({ where: { tenant_id: rec.tenant_id, meeting_id: rec.id }, order: [['id', 'ASC']], limit: 500 });
  res.json({ messages: rows.map(view) });
}));

// A screenshot shown in the thread. Only one that a message in THIS meeting, in THIS tenant,
// points at — an upload id alone opens nothing.
router.get('/:id/chat/attachment/:uploadId', wrap(async (req, res) => {
  const rec = await ownMeeting(req, res); if (!rec) return;
  const uid = parseInt(req.params.uploadId, 10) || 0;
  const linked = await MeetingChat.findOne({ where: { tenant_id: rec.tenant_id, meeting_id: rec.id, attachment_url: 'upload:' + uid } });
  const up = linked && await Upload.findOne({ where: { id: uid, tenant_id: rec.tenant_id } });
  if (!up || !IMAGE_MIME[up.mime]) return res.status(404).json({ error: 'not found' });
  res.set('Content-Type', up.mime).set('X-Content-Type-Options', 'nosniff').set('Cache-Control', 'private, max-age=3600').send(up.bytes);
}));

function magicMatches(mime, b) {
  if (mime === 'image/png') return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (mime === 'image/jpeg') return b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  if (mime === 'image/gif') return b.length > 6 && b.slice(0, 4).toString('ascii') === 'GIF8';
  if (mime === 'image/webp') return b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function readAttachment(att) {
  if (!att) return { ok: true, image: null };
  const mime = String(att.mime || '');
  if (!IMAGE_MIME[mime]) return { ok: false, error: 'Only PNG, JPEG, WebP or GIF images' };
  let bytes = null;
  try { bytes = Buffer.from(String(att.data_base64 || ''), 'base64'); } catch (e) { bytes = null; }
  if (!bytes || !bytes.length) return { ok: false, error: 'Empty image' };
  if (bytes.length > MAX_IMAGE) return { ok: false, error: 'Image over 6 MB' };
  // The declared type is the client's word; the first bytes are the file's. A mismatch would be
  // refused by the model and quietly turn the reply into an offline one.
  if (!magicMatches(mime, bytes)) return { ok: false, error: 'The file is not the image type it claims to be' };
  return { ok: true, image: { mime, bytes, name: (String(att.name || 'screenshot').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'screenshot') } };
}

// ── The conversation ──────────────────────────────────────────────────────────
router.post('/:id/chat', mutation, wrap(async (req, res) => {
  const rec = await ownMeeting(req, res); if (!rec) return;
  const text = String((req.body && req.body.message) || '').trim().slice(0, 8000);
  if (!text && !(req.body && req.body.attachment)) return res.status(400).json({ error: 'message required' });
  // Limits BEFORE any decoding or model call. Every turn re-sends the transcript, so the daily
  // cap is what bounds a runaway loop's bill, not only the per-minute one.
  if (!security.rateLimit('meeting-chat', String(req.user.id), 60, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many messages. Wait a few minutes.' });
  if (!security.rateLimit('meeting-chat-day', String(req.user.id), DAILY_CAP, 24 * 60 * 60 * 1000)) return res.status(429).json({ error: 'Daily message limit reached for the meetings chat.' });
  const att = readAttachment(req.body && req.body.attachment);
  if (!att.ok) return res.status(400).json({ error: att.error });

  const message = text || (uiLang(req, '') === 'es' ? 'Mira la captura adjunta.' : 'Look at the attached screenshot.');
  let attachment_url = null;
  if (att.image) {
    const up = await Upload.create({ tenant_id: rec.tenant_id, user_id: req.user.id, name: att.image.name, mime: att.image.mime, size: att.image.bytes.length, bytes: att.image.bytes });
    attachment_url = 'upload:' + up.id;
  }

  // Streamed as NDJSON. The first line goes out at once, so a long answer never sits behind
  // Cloudflare's ~100 s wait for a first byte.
  res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  res.flushHeaders && res.flushHeaders();
  const send = (obj) => { try { res.write(JSON.stringify(obj) + '\n'); } catch (e) {} };

  const prior = await MeetingChat.findAll({ where: { tenant_id: rec.tenant_id, meeting_id: rec.id }, order: [['id', 'ASC']] });
  const userRow = await MeetingChat.create({ tenant_id: rec.tenant_id, meeting_id: rec.id, user_id: req.user.id, role: 'user', kind: 'text', content: message, attachment_url });
  send({ type: 'user', message: view(userRow) });

  // "transfer to Factory", typed or dictated, is a command — not a question for the model.
  if (!att.image && chat.isTransfer(text)) {
    const out = await transfer({ req, rec, prior, lang: uiLang(req, text) });
    for (const m of out.messages) send({ type: 'message', message: view(m) });
    if (!out.ok) send({ type: 'error', error: out.error });
    send({ type: 'end' });
    return res.end();
  }

  const transcript = chat.cleanTranscript(await transcriptOf(rec));
  const system = chat.systemBlocks({ meeting: rec, transcript });
  const messages = chat.messagesFor(prior, message, att.image);
  // The person closed the tab: stop the model rather than pay for an answer nobody reads.
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  let reply = null, offline = null, composed_by = null;
  try {
    const r = await llm.streamText('chat', { system, messages, max_tokens: 3000, signal: abort.signal }, (t) => send({ type: 'delta', text: t }));
    if (r) { reply = r.text; composed_by = r.model; }
    else offline = chat.reasonOf(null);
  } catch (e) {
    if (abort.signal.aborted) return;       // nobody is listening; store no half-answer
    offline = chat.reasonOf(e);
    console.error('SpeakUp meeting chat model error:', e.message);
  }
  let kind = 'text';
  if (reply == null) {
    const off = chat.offlineReply({ message, meeting: rec, transcript, reason: offline });
    reply = off.text; kind = off.kind; composed_by = 'offline';
  } else if (chat.isBuildPrompt(reply)) kind = 'prompt';

  const row = await MeetingChat.create({ tenant_id: rec.tenant_id, meeting_id: rec.id, user_id: req.user.id, role: 'assistant', kind, content: reply, composed_by });
  send({ type: 'done', message: view(row) });
  send({ type: 'end' });
  res.end();
}));

router.post('/:id/factory', mutation, wrap(async (req, res) => {
  const rec = await ownMeeting(req, res); if (!rec) return;
  const prior = await MeetingChat.findAll({ where: { tenant_id: rec.tenant_id, meeting_id: rec.id }, order: [['id', 'ASC']] });
  const id = parseInt(req.body && req.body.message_id, 10) || 0;
  const out = await transfer({ req, rec, prior, messageId: id || null, lang: uiLang(req, '') });
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error, messages: out.messages.map(view) });
  res.json({ ok: true, job_id: out.job_id, messages: out.messages.map(view) });
}));

/**
 * TRANSFER STOPS AT A PLAN. The answer (a build prompt, converted first if it is not one yet)
 * goes to intents.run in architect mode — the same door the Factory console uses — and never
 * with auto_run, so the job waits for the owner to read the plan and type "approved".
 */
async function transfer({ req, rec, prior, messageId, lang }) {
  const es = lang === 'es';
  const messages = [];
  if (!security.isFactoryOperator(req.user)) {
    return { ok: false, status: 403, messages, error: es ? 'Transferir a la Fábrica necesita la cuenta de operador de la Fábrica.' : 'Transferring to the Factory needs the AI Factory operator account.' };
  }
  if (!security.rateLimit('meeting-transfer', String(req.user.id), 10, 10 * 60 * 1000)) {
    return { ok: false, status: 429, messages, error: es ? 'Demasiadas transferencias. Espera unos minutos.' : 'Too many transfers. Wait a few minutes.' };
  }
  const answers = prior.filter(m => m.role === 'assistant' && m.kind !== 'transfer');
  let source = messageId ? answers.find(m => m.id === messageId) : answers[answers.length - 1];
  if (messageId && !source) return { ok: false, status: 404, messages, error: es ? 'Mensaje no encontrado en esta reunión.' : 'Message not found in this meeting.' };
  // Saying "transfer" twice must not open two jobs for the same prompt.
  if (source && source.factory_ref) {
    return { ok: false, status: 409, messages, error: es ? `Esta respuesta ya se transfirió (${source.factory_ref.replace('job:', 'trabajo #')}).` : `This answer was already transferred (${source.factory_ref.replace('job:', 'job #')}).` };
  }

  // Not a prompt yet: convert it first, in the same step, and show the prompt that was sent.
  if (!source || !(source.kind === 'prompt' || chat.isBuildPrompt(source.content))) {
    const transcript = chat.cleanTranscript(await transcriptOf(rec));
    const ask = source
      ? (es ? 'Convierte tu respuesta anterior en un prompt de construcción.' : 'Convert your previous answer into a build prompt.')
      : (es ? 'Convierte esta reunión en un prompt de construcción.' : 'Convert this meeting into a build prompt.');
    const history = source ? prior.filter(m => m.id <= source.id) : [];
    let text = null, composed_by = null, why = null;
    try {
      const r = await llm.callText('chat', { system: chat.systemBlocks({ meeting: rec, transcript }), messages: chat.messagesFor(history, ask), max_tokens: 3000 });
      if (r && chat.isBuildPrompt(r.text)) { text = r.text; composed_by = r.model; }
      else if (r) { text = chat.PROMPT_MARK + '\n' + r.text; composed_by = r.model; }
      else why = chat.reasonOf(null);
    } catch (e) { why = chat.reasonOf(e); console.error('SpeakUp meeting transfer conversion error:', e.message); }
    // A BUILD PROMPT NEEDS THE MODEL. Assembling one from the transcript would carry the meeting
    // into a build job on a public repository, so without a model the transfer stops and says why.
    if (!text) {
      return { ok: false, status: 503, messages, error: es
        ? `No se pudo transferir: convertirlo en un prompt necesita el modelo (${why}).`
        : `Could not transfer: turning it into a prompt needs the model (${why}).` };
    }
    source = await MeetingChat.create({ tenant_id: rec.tenant_id, meeting_id: rec.id, user_id: req.user.id, role: 'assistant', kind: 'prompt', content: text, composed_by });
    messages.push(source);
  }

  // THE MEETING DOES NOT RIDE ALONG. The Factory's push guard skips instruction text, so this
  // is the check that keeps a quote or a participant's name out of a public build.
  const leaks = chat.meetingLeaks({ prompt: source.content, transcript: await transcriptOf(rec), participants: rec.participants || [] });
  if (leaks.length) {
    const what = leaks.map(l => l.type === 'name' ? (es ? 'un nombre de la reunión' : 'a name from the meeting') : (es ? 'una cita textual' : 'a verbatim quote')).join(', ');
    return { ok: false, status: 422, messages, error: es
      ? `No se transfirió: el prompt contiene ${what}, y el repositorio es público. Pide "reescribe el prompt sin nombres ni citas" y vuelve a transferir.`
      : `Not transferred: the prompt contains ${what}, and the repository is public. Ask "rewrite the prompt without names or quotes", then transfer again.` };
  }
  const out = await intents.run({ tenant_id: rec.tenant_id, user: req.user, text: chat.factoryText({ prompt: source.content, meeting: rec }),
    mode: 'architect', lang: es ? 'es' : 'en', project_key: process.env.SPEAKUP_DEFAULT_PROJECT || 'ringlypro', engine: 'meeting-chat', req });
  const jobId = out && out.status === 200 && out.card && out.card.job_id;
  if (!jobId) {
    return { ok: false, status: (out && out.status !== 200 && out.status) || 502, messages,
      error: (out && (out.error || out.reply)) || (es ? 'La Fábrica no abrió un trabajo.' : 'The Factory did not open a job.') };
  }
  const receipt = await MeetingChat.create({ tenant_id: rec.tenant_id, meeting_id: rec.id, user_id: req.user.id, role: 'assistant', kind: 'transfer',
    factory_ref: 'job:' + jobId, composed_by: 'system',
    content: es
      ? `Transferido a la Fábrica como trabajo #${jobId}. Se detiene en un plan: nada se ejecuta hasta que lo leas y escribas aprobado. Abrir: /speakup/?job=${jobId}`
      : `Transferred to the Factory as job #${jobId}. It stops at a plan: nothing runs until you read it and type approved. Open: /speakup/?job=${jobId}` });
  messages.push(receipt);
  source.factory_ref = 'job:' + jobId; await source.save();
  await audit.record({ tenant_id: rec.tenant_id, user_id: req.user.id, actor: req.user.email, action: 'meeting.transferred_to_factory', entity: 'recording', entity_id: rec.id,
    detail: { job_id: jobId, message_id: source.id, composed_by: source.composed_by }, req });
  return { ok: true, job_id: jobId, messages };
}

module.exports = router;
