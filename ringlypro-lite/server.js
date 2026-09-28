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
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS ghl_location_id VARCHAR(255);
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS ghl_token_enc TEXT;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS ghl_agent_id VARCHAR(255);
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS ghl_calendar_id VARCHAR(255);
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS provisioning_state VARCHAR(32) DEFAULT 'pending';
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS provisioning_error TEXT;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS forwarding_confirmed_at TIMESTAMP WITH TIME ZONE;
    -- Set only when this tenant's HighLevel calendar had open hours written AND
    -- read back. It is what licenses slot validation for that tenant: handing
    -- HighLevel the right to refuse a booking against an EMPTY calendar refuses
    -- every booking, which is why validation shipped globally off.
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS ghl_hours_confirmed_at TIMESTAMP WITH TIME ZONE;
  `);
  // Two-way calendar. `origin` is deliberately left NULL on existing rows —
  // they pre-date the column and their provenance is genuinely unknown, and
  // only origin='ringlypro' is ever pushed to HighLevel, so an unknown row can
  // never be replayed into a customer's calendar.
  await sequelize.query(`
    ALTER TABLE lite_appointments ADD COLUMN IF NOT EXISTS origin VARCHAR(16);
    ALTER TABLE lite_appointments ADD COLUMN IF NOT EXISTS ghl_event_id VARCHAR(255);
    ALTER TABLE lite_appointments ADD COLUMN IF NOT EXISTS ghl_cancel_failed_at TIMESTAMPTZ;
    -- WHY the appointment exists. The Calendar tab showed a time and a name and
    -- nothing about the purpose, so an owner could not tell a consultation from
    -- a complaint. NULL on every existing row on purpose: their reason was never
    -- captured and inventing one is worse than an empty field.
    ALTER TABLE lite_appointments ADD COLUMN IF NOT EXISTS reason TEXT;
    CREATE INDEX IF NOT EXISTS ix_lite_appts_ghl_event ON lite_appointments(ghl_event_id);
  `);
  // One tenant may hold at most one sub-account from the pool. Enforced in the
  // database, not only in the claim function, because a double-claim would put
  // two clients' phone numbers and contacts in one HighLevel location.
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_ghl_claim
       ON lite_ghl_accounts(claimed_by_tenant) WHERE claimed_by_tenant IS NOT NULL`
  );
  // ── OUTBOUND CALLING ────────────────────────────────────────────────────
  // A product with open signup that accepts a spreadsheet of phone numbers and
  // dials them is the 2026-08-06 toll-fraud payout path, industrialised. Every
  // table here is tenant-scoped, every number is allow-list checked at IMPORT
  // and again at DIAL, and dialling is off until an operator enables it.
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lite_outbound_lists (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      name VARCHAR(160) NOT NULL,
      -- What the tenant ASSERTED about why they may call these people. A claim
      -- with a timestamp, not a checkbox: it is the record if anyone asks.
      consent_basis VARCHAR(40) NOT NULL DEFAULT 'unstated',
      consent_note TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      rows_total INTEGER NOT NULL DEFAULT 0,
      rows_accepted INTEGER NOT NULL DEFAULT 0,
      rows_refused INTEGER NOT NULL DEFAULT 0,
      created_by VARCHAR(160),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      activated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS ix_lite_ob_lists_tenant ON lite_outbound_lists(tenant_id);

    CREATE TABLE IF NOT EXISTS lite_outbound_contacts (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      list_id INTEGER NOT NULL,
      company VARCHAR(200),
      contact_name VARCHAR(160),
      phone VARCHAR(32) NOT NULL,
      email VARCHAR(200),
      timezone VARCHAR(64),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      last_outcome VARCHAR(40),
      ghl_contact_id VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_lite_ob_contacts_tenant ON lite_outbound_contacts(tenant_id);
    CREATE INDEX IF NOT EXISTS ix_lite_ob_contacts_list ON lite_outbound_contacts(list_id);
    -- One row per number per tenant: re-uploading the same sheet must not
    -- double-dial anybody.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_ob_contact_phone
      ON lite_outbound_contacts(tenant_id, phone);

    -- CHECKED AT DIAL TIME, not at save time: a person can opt out between the
    -- two, and the later check is the one that matters.
    CREATE TABLE IF NOT EXISTS lite_outbound_suppressions (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      phone VARCHAR(32) NOT NULL,
      reason VARCHAR(40) NOT NULL,
      source VARCHAR(40),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_ob_suppress ON lite_outbound_suppressions(tenant_id, phone);

    CREATE TABLE IF NOT EXISTS lite_outbound_calls (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      list_id INTEGER,
      -- NO call id exists until HighLevel's call log returns one: an outbound
      -- call is a WORKFLOW ENROLLMENT, not an API dial. Inventing an id here
      -- would put a fiction at the head of the attribution chain.
      ghl_call_id VARCHAR(64),
      enrolled_at TIMESTAMPTZ DEFAULT NOW(),
      outcome VARCHAR(40),
      summary TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_lite_ob_calls_tenant ON lite_outbound_calls(tenant_id);
    CREATE INDEX IF NOT EXISTS ix_lite_ob_calls_contact ON lite_outbound_calls(contact_id);
  `);
  // Dialling is a per-tenant privilege an operator grants, never a signup default.
  //
  // TWO GATES, DELIBERATELY SEPARATE. `outbound_enabled` + `outbound_workflow_id`
  // say the PLUMBING exists (the owner built this client's HighLevel workflow by
  // hand — HighLevel has no API to create one). `outbound_state` says it has
  // been PAID FOR. Both must be true to dial. Collapsing them into one column
  // loses the difference between "not set up" and "not paid", which are
  // different messages to the client and different actions for the owner.
  await sequelize.query(`
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS outbound_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS outbound_workflow_id VARCHAR(64);
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS outbound_daily_cap INTEGER DEFAULT 50;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS outbound_state VARCHAR(24) NOT NULL DEFAULT 'off';
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS outbound_setup_paid_at TIMESTAMPTZ;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS outbound_setup_due_at TIMESTAMPTZ;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS outbound_activated_at TIMESTAMPTZ;
    ALTER TABLE lite_tenants ADD COLUMN IF NOT EXISTS outbound_state_reason VARCHAR(200);
  `);

  // THE WALLET. One row per tenant. `reserved_cents` is money held against
  // calls that are in flight: the cost of a call is NOT known when it is
  // placed (HighLevel bills per minute and reports the duration minutes
  // later), so a generous amount is reserved at dial time and the unused part
  // is released when the call log arrives. Holding rather than charging is
  // what stops a balance going negative when two dials race.
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lite_outbound_credit (
      tenant_id INTEGER PRIMARY KEY,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      reserved_cents INTEGER NOT NULL DEFAULT 0,
      lifetime_topup_cents INTEGER NOT NULL DEFAULT 0,
      lifetime_spent_cents INTEGER NOT NULL DEFAULT 0,
      low_balance_notified_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE lite_outbound_credit ADD COLUMN IF NOT EXISTS low_balance_notified_at TIMESTAMPTZ;

    -- EVERY CHARGE, AUDITABLE. Two unique indexes carry the idempotency that
    -- makes a replayed Stripe webhook a no-op rather than a second credit.
    CREATE TABLE IF NOT EXISTS lite_outbound_payments (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      kind VARCHAR(16) NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency VARCHAR(8) NOT NULL DEFAULT 'usd',
      status VARCHAR(16) NOT NULL DEFAULT 'open',
      stripe_session_id VARCHAR(120),
      stripe_event_id VARCHAR(120),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS ix_lite_ob_pay_tenant ON lite_outbound_payments(tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_ob_pay_session
      ON lite_outbound_payments(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_ob_pay_event
      ON lite_outbound_payments(stripe_event_id) WHERE stripe_event_id IS NOT NULL;
  `);

  // What a call cost and what happened on it. Added to the existing table
  // rather than a new one: the report and the billing read the same row, so
  // the figure shown to the client is the figure that moved the money.
  await sequelize.query(`
    ALTER TABLE lite_outbound_calls ADD COLUMN IF NOT EXISTS reserved_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE lite_outbound_calls ADD COLUMN IF NOT EXISTS charged_cents INTEGER;
    ALTER TABLE lite_outbound_calls ADD COLUMN IF NOT EXISTS duration_sec INTEGER;
    ALTER TABLE lite_outbound_calls ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_ob_calls_ghl
      ON lite_outbound_calls(ghl_call_id) WHERE ghl_call_id IS NOT NULL;
  `);

  // The one channel that cannot fail. Email needs a key and a working
  // transport; this needs neither, so it is written FIRST on every event and
  // the email is the optimisation on top.
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lite_notifications (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      kind VARCHAR(40) NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      read_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS ix_lite_notif_tenant ON lite_notifications(tenant_id, created_at DESC);

    -- WHAT THE FOUNDER SENT EVERYONE, AND HOW MANY GOT IT. The per-tenant
    -- rows are the delivery; this is the record. Without it "what did I
    -- announce last month, and did it reach anyone" has no answer, and a
    -- broadcast that silently reached nobody looks identical to one that
    -- reached everybody.
    CREATE TABLE IF NOT EXISTS lite_broadcasts (
      id SERIAL PRIMARY KEY,
      sent_by_tenant INTEGER NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      recipients INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_lite_broadcasts_at ON lite_broadcasts(created_at DESC);
  `);

  // Fraud-watch alert log: dedupes alerts across restarts, so a redeploy does
  // not re-text the owner about something already reported. Platform-level
  // (tenant 0), not tenant data.
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lite_security_alerts (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 0,
      alert_key VARCHAR(200) NOT NULL,
      type VARCHAR(40),
      detail TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_security_alerts_key ON lite_security_alerts(tenant_id, alert_key);
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
        const r = await smsSvc.send({ tenant, from, to: tenant.owner_phone, body }); segs += r.segments;
      }
    } else if (ev.type === 'appointment') {
      const when = ev.data.display || ev.data.starts_at;
      if (tenant.owner_phone) {
        const r = await smsSvc.send({ tenant, from, to: tenant.owner_phone, body: tt.smsBookingOwner(tenant.business_name, ev.data.caller_name, when) });
        segs += r.segments;
      }
      const callerNum = ev.data.callback_number || ctx.from;
      if (callerNum) {
        const r = await smsSvc.send({ tenant, from, to: callerNum, body: tt.smsBookingCaller(tenant.business_name, when) });
        segs += r.segments;
      }
    }
    return { segments: segs };
  } catch (e) { console.error('[lite] fireSms error:', e.message); return { segments: 0 }; }
}

/* ── Transfer the live call to a human (bypasses the AI) ──────────────── */
async function fireTransfer(ctx, ev) {
  // A transfer redirects a LIVE call on an account shared with the CRM. It only
  // ever acts on a callSid that /voice/incoming answered, whatever the mode.
  if (!ctx.callVerified) {
    console.error('[lite:security] transfer refused: callSid was not answered by /voice/incoming');
    return;
  }
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
          // A socket is only a real call if /voice/incoming created its row in the
          // last 15 minutes. Without that, anyone who opens the socket could run an
          // AI session and name ANY callSid on this shared account for a transfer.
          ctx.callVerified = !!(call && call.started_at && (Date.now() - new Date(call.started_at).getTime()) < 15 * 60 * 1000);
          if (!ctx.callVerified) {
            console.warn('[lite:security] relay setup for a callSid with no recent call row');
            if (String(process.env.LITE_TWILIO_SIGNATURE || 'log').toLowerCase() === 'enforce') {
              speak('Thank you for calling. Goodbye.'); try { ws.close(); } catch (_) {} return;
            }
          }
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
      if (!require('./src/security/twilioSignature').allowUpgrade(req)) { socket.destroy(); return; }
      relayWss.handleUpgrade(req, socket, head, (ws) => relayWss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  // FRAUD WATCH: reads the Twilio account on a timer for the signatures of the
  // 2026-08-06 toll-fraud attack. Production only (or LITE_FRAUD_WATCH=on).
  const fraudWatch = require('./src/security/fraudWatch');
  const fraudWatchDeps = () => {
    const provider = getProvider();
    return {
      client: provider.client(),
      ownedDids: async () => (await require('./src/models').Number.findAll({ attributes: ['did'] })).map((n) => n.did),
      hasSeen: async (key) => {
        const [r] = await sequelize.query('SELECT 1 FROM lite_security_alerts WHERE tenant_id = 0 AND alert_key = :key LIMIT 1', { replacements: { key } });
        return r.length > 0;
      },
      markSeen: async (key, alert) => {
        await sequelize.query(
          `INSERT INTO lite_security_alerts (tenant_id, alert_key, type, detail) VALUES (0, :key, :type, :detail)
           ON CONFLICT (tenant_id, alert_key) DO NOTHING`,
          { replacements: { key, type: alert.type, detail: String(alert.detail || '').slice(0, 500) } });
      },
      // Alerts bypass only the auto-lock, never the destination allow-list.
      sendAlert: async (to, body) => {
        const tf = require('./src/security/tollFraud');
        if (!tf.checkDestination(to).ok) throw new Error('alert phone is not an allowed destination');
        const msg = { to: tf.normalize(to), body };
        if (process.env.LITE_MESSAGING_SERVICE_SID) msg.messagingServiceSid = process.env.LITE_MESSAGING_SERVICE_SID;
        else msg.from = process.env.LITE_SMS_FROM || require('./src/telephony').TwilioProvider.DEFAULT_SMS_FROM;
        await provider.client().messages.create(msg);
      }
    };
  };
  app.set('fraudWatchDeps', fraudWatchDeps);
  if (fraudWatch.start(fraudWatchDeps)) console.log('[lite] fraud watch started');

  // PULL FINISHED CALLS FROM HIGHLEVEL. The post-call webhook is configured by
  // hand in someone else's dashboard and cannot be verified from here — a real
  // call on 2026-09-26 left a message that never reached RinglyPro because the
  // workflow's signature header was missing. A voicemail is the product, so it
  // does not hang on a field in a form: the poller reads the same facts from
  // HighLevel's API and hands them to the same writer, keyed on the same call
  // id, so whichever arrives second is a no-op.
  try { require('./src/services/ghlCallLogs').start(); }
  catch (e) { console.error('[lite] call-log poller failed to start:', e.message); }

  // AND THE OTHER HALF OF THE MIRROR: the booking itself. A call log carries
  // no slot, so the call poller cannot create an appointment without inventing
  // a time; the slot only exists on the calendar, and is read from there.
  try { require('./src/services/ghlAppointments').start(); }
  catch (e) { console.error('[lite] appointment poller failed to start:', e.message); }

  // THE DIALER. Until this existed, "Activate" set a column nothing read and
  // an activated list of 139 contacts sat there while the UI implied it had
  // started. Every gate is inside mayDial and applied per contact at dial
  // time, so this loop only decides WHO to offer and how fast.
  try { require('./src/services/outboundDialer').start(); }
  catch (e) { console.error('[lite] outbound dialer failed to start:', e.message); }

  // PAYMENTS ARE SWEPT SEPARATELY FROM DIALLING. A client who has paid but has
  // no workflow yet is exactly the client whose dialer is off, so putting this
  // in the dialer's tick would mean turning dialling off stops applying money.
  try { require('./src/services/paymentSweep').start(); }
  catch (e) { console.warn('[lite] payment sweep did not start:', e.message); }

  // RUNNING OUT OF NUMBERS IS SILENT: the next signup hits the 403, stops at
  // the number step, and nothing says the shelf was empty. A human watching a
  // count is a workaround on top of a workaround.
  try { require('./src/services/numberPool').start(); }
  catch (e) { console.warn('[lite] number pool watch did not start:', e.message); }

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

/**
 * A REJECTED PROMISE MUST NOT END THE SERVICE. Node's default for an unhandled
 * rejection is to exit, so one bad request — `/api/appointments/abc/cancel`
 * sent a non-integer into an integer column — restarted Lite for every tenant.
 * The route is fixed; this is the net under every route that is not.
 */
process.on('unhandledRejection', (err) => {
  console.error('[lite] UNHANDLED REJECTION (kept running):', (err && err.stack) || err);
});
process.on('uncaughtException', (err) => {
  console.error('[lite] UNCAUGHT EXCEPTION (kept running):', (err && err.stack) || err);
});

main();
