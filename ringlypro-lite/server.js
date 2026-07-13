'use strict';

/**
 * RinglyPro Lite — standalone server (separate Render service).
 * HTTP (Express) + a single WebSocket endpoint /voice-relay/ws that Twilio
 * ConversationRelay connects to. Uses app.listen()'s http.Server + noServer
 * WS + one server.on('upgrade') dispatcher (the pattern proven in full
 * RinglyPro's src/server.js).
 */
require('dotenv').config();

const http = require('http');
const WebSocket = require('ws');
const app = require('./src/app');
const { sequelize } = require('./src/models');
const { RelaySession, resolveContext } = require('./src/services/relayAgent');
const { t } = require('./src/services/i18n');
const transcript = require('./src/services/liteTranscript');
const smsSvc = require('./src/services/sms');
const { getProvider } = require('./src/telephony');
const { Call, Tenant, Number } = require('./src/models');

const PORT = process.env.LITE_PORT || process.env.PORT || 10001;

/* ── DB init: create tables + the partial unique slot-lock index ──────── */
async function initDb() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: false });
  // Partial unique index isn't expressible in the model; ensure it exists.
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_appts_slot
       ON lite_appointments(tenant_id, starts_at) WHERE status <> 'cancelled'`
  );
  // sync({alter:false}) never adds columns to existing tables — add the
  // minute-banking columns idempotently (rollover + prepaid recharge minutes).
  await sequelize.query(`
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS rollover_minutes NUMERIC(8,2) DEFAULT 0;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS purchased_minutes NUMERIC(8,2) DEFAULT 0;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS rollover_period_start TIMESTAMP WITH TIME ZONE;
  `);
  console.log('[lite] DB ready');
}

/* ── SMS side-effects for a completed agent event ─────────────────────── */
async function fireSms(ctx, ev) {
  try {
    // Demo line: text the caller a real confirmation (no owner on file).
    if (ctx.is_demo) { const r = await smsSvc.sendDemoConfirm(ctx, ev); return { segments: r.segments || 0 }; }
    const tenant = await Tenant.findByPk(ctx.tenantId);
    if (!tenant) return { segments: 0 };
    const num = await Number.findOne({ where: { tenant_id: ctx.tenantId, status: 'active' } });
    const from = (num && num.did) || ctx.to;
    const tt = t(ctx.locale);
    let segs = 0;
    if (ev.type === 'message') {
      if (tenant.owner_phone) {
        const body = tt.smsMessageOwner(tenant.business_name, ev.data.caller_name, ev.data.callback_number || ctx.from, ev.data.body);
        const r = await smsSvc.send({ from, to: tenant.owner_phone, body }); segs += r.segments;
      }
    } else if (ev.type === 'appointment') {
      const when = ev.data.display || ev.data.starts_at;
      if (tenant.owner_phone) {
        const r = await smsSvc.send({ from, to: tenant.owner_phone, body: tt.smsBookingOwner(tenant.business_name, ev.data.caller_name, when) });
        segs += r.segments;
      }
      const callerNum = ev.data.callback_number || ctx.from;
      if (callerNum) {
        const r = await smsSvc.send({ from, to: callerNum, body: tt.smsBookingCaller(tenant.business_name, when) });
        segs += r.segments;
      }
    }
    return { segments: segs };
  } catch (e) { console.error('[lite] fireSms error:', e.message); return { segments: 0 }; }
}

/* ── Transfer the live call to a human (bypasses the AI) ──────────────── */
async function fireTransfer(ctx, ev) {
  try {
    const tt = t(ctx.locale);
    const voice = ctx.locale === 'es'
      ? (process.env.LITE_POLLY_VOICE_ES || 'Lupe-Neural')
      : (process.env.LITE_POLLY_VOICE_EN || 'Joanna-Neural');
    await getProvider().redirectCall({
      callSid: ctx.callSid,
      number: ev.data.number,
      message: tt.transferSay(ctx.businessName),
      voice,
      language: ctx.locale === 'es' ? 'es-US' : 'en-US'
    });
    console.log(`[lite] transferred call ${ctx.callSid} → ${ev.data.number}`);
  } catch (e) {
    console.error('[lite] fireTransfer error:', e.message);
  }
}

/* ── Dispatch a queued agent event (SMS or live transfer) ─────────────── */
async function fireEvent(ctx, ev) {
  if (ev.type === 'transfer') return fireTransfer(ctx, ev);
  return fireSms(ctx, ev);
}

/* ── Finalize the call row on socket close ────────────────────────────── */
async function finalizeCall(ctx, session, startedAt) {
  try {
    const call = ctx.callSid ? await Call.findOne({ where: { call_sid: ctx.callSid } }) : null;
    if (!call) return;
    const flat = session.messages
      .map(m => typeof m.content === 'string' ? `${m.role}: ${m.content}` : null)
      .filter(Boolean).join('\n');
    call.transcript = flat.slice(0, 8000);
    call.disposition = session.disposition || call.disposition || 'abandoned';
    call.llm_input_tokens = session.tokensIn;
    call.llm_output_tokens = session.tokensOut;
    call.turns = session.turns;
    if (!call.duration) call.duration = Math.round((Date.now() - startedAt) / 1000);
    call.ended_at = new Date();
    await call.save();
  } catch (e) { console.error('[lite] finalizeCall error:', e.message); }
}

/* ── Boot ─────────────────────────────────────────────────────────────── */
async function main() {
  try { await initDb(); }
  catch (e) { console.error('[lite] DB init failed (continuing so /health works):', e.message); }

  const server = http.createServer(app);
  const relayWss = new WebSocket.Server({ noServer: true });

  relayWss.on('connection', (ws) => {
    let session = null;
    let ctx = null;
    const startedAt = Date.now();
    const send = (obj) => { try { ws.send(JSON.stringify(obj)); } catch (_) {} };
    const speak = (text, last = true) => send({ type: 'text', token: text, last });
    let sentEvents = 0;

    async function flushEvents() {
      if (!session) return;
      while (sentEvents < session.events.length) {
        const ev = session.events[sentEvents++];
        await fireEvent(ctx, ev);
      }
    }

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) { return; }

      if (msg.type === 'setup') {
        try {
          ctx = await resolveContext({ to: msg.to, from: msg.from, callSid: msg.callSid });
          if (!ctx.resolved) { speak('Thank you for calling. Please leave a message.'); return; }
          // attach the pre-created call row id
          const call = msg.callSid ? await Call.findOne({ where: { call_sid: msg.callSid } }) : null;
          ctx.callId = call ? call.id : null;
          ctx.businessName = ctx.businessName;
          session = new RelaySession(ctx, {
            onTurn: (role, text, tool) => transcript.log({ tenantId: ctx.tenantId, callSid: ctx.callSid, role, text, toolName: tool })
          });
          speak(session.openingGreeting(), true);
        } catch (e) {
          console.error('[lite] setup error:', e.message);
          speak('Sorry, we are unable to take your call right now.');
        }
        return;
      }

      if (msg.type === 'prompt') {
        if (!session || session.busy) return;
        if (msg.last === false || !msg.voicePrompt) return;
        try {
          const reply = await session.handlePrompt(msg.voicePrompt);
          // If a transfer is queued, skip the socket line — the redirect's
          // premium Polly <Say> speaks the hand-off (avoids double speech).
          const transferPending = session.events.slice(sentEvents).some(e => e.type === 'transfer');
          if (!transferPending) speak(reply, true);
          await flushEvents();
        } catch (e) {
          console.error('[lite] prompt error:', e.message);
          speak(ctx && ctx.locale === 'es' ? 'Disculpe, tuve un problema. ¿Me lo repite?' : 'Sorry, I had a problem. Could you repeat that?');
        }
        return;
      }

      if (msg.type === 'error') console.error('[lite] relay error:', msg.description);
    });

    ws.on('close', async () => {
      if (session && ctx) { await flushEvents(); await finalizeCall(ctx, session, startedAt); }
    });
    ws.on('error', (e) => console.error('[lite] ws error:', e.message));
  });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (_) {}
    if (pathname === '/voice-relay/ws') {
      relayWss.handleUpgrade(req, socket, head, (ws) => relayWss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[lite] RinglyPro Lite listening on :${PORT}`);
    console.log(`[lite] voice webhook → POST /voice/incoming ; ws → /voice-relay/ws`);
    // Daily auto-release of unconverted numbers (no external cron needed).
    try { require('./src/services/numberReclaim').startScheduler(); }
    catch (e) { console.error('[lite] reclaim scheduler failed to start:', e.message); }
    // Daily minute-rollover reconcile so idle tenants also carry unused minutes.
    try {
      const minutesSvc = require('./src/services/minutes');
      const runRollover = async () => {
        try {
          const tenants = await Tenant.findAll();
          for (const tn of tenants) { try { await minutesSvc.reconcileRollover(tn); } catch (_) {} }
          console.log(`[lite] rollover reconcile: ${tenants.length} tenants`);
        } catch (e) { console.error('[lite] rollover reconcile error:', e.message); }
      };
      setInterval(runRollover, 24 * 60 * 60 * 1000);
      setTimeout(runRollover, 60 * 1000);   // once shortly after boot
    } catch (e) { console.error('[lite] rollover scheduler failed to start:', e.message); }
  });
}

main();
