# RinglyPro Lite — WhatsApp Messaging Setup Guide

Status: **planned / not yet built** (SMS is the shipped channel). This document
is the implementation + operations plan for adding WhatsApp as a notification
channel, with SMS fallback. WhatsApp was out of scope for Lite v1 but is the
recommended primary channel for the **Colombia** market.

---

## 1. Why WhatsApp (and when to prefer it over SMS/RCS)

| | SMS | RCS (business) | WhatsApp |
|---|---|---|---|
| iPhone support | Yes | No (falls back to SMS) | Yes |
| Colombia / LatAm reach | OK | Low | Excellent (dominant channel) |
| US reach | Best (universal) | Growing (Android only) | Medium (lower adoption) |
| US A2P 10DLC / carrier gate | Required | Required | None (rides the internet) |
| Rich (buttons, quick replies, media) | No | Yes | Yes |
| Two-way threading | Limited | Yes | Yes |
| Setup gate | A2P campaign | Google agent verify | Meta verify + templates |

**Recommended channel strategy:**
- **Colombia tenants → WhatsApp primary** (dominant, cheaper per message, no A2P pain).
- **US tenants → SMS primary** (universal), WhatsApp as an opt-in enhancement.
- Always keep **SMS as automatic fallback** when the customer is not reachable on WhatsApp.

---

## 2. Prerequisites

1. **Meta Business Manager** account for Digit2AI (or the tenant's business).
2. **Meta Business Verification** — submit business documents; Meta reviews
   (comparable in spirit to A2P vetting). Required before high message limits.
3. **WhatsApp Business Account (WABA)** created and linked in Business Manager.
4. **A dedicated sender phone number** — once a number is registered on the
   WhatsApp Business API it **cannot** be used in the consumer WhatsApp app.
   Use a fresh number (not the Lite voice DID, not a personal WhatsApp number).
5. **Provider:** Twilio (already the Lite telephony provider and an official
   WhatsApp BSP) — no new vendor. Alternative: Meta Cloud API directly (the
   AgroMercado vertical uses `AGROMERCADO_WHATSAPP_TOKEN` against the Cloud API,
   so there is in-house precedent for either path).

---

## 3. Setup steps (Twilio path — recommended)

1. Twilio Console → **Messaging → Senders → WhatsApp senders → Create**.
2. Connect/authorize the **Meta Business Manager** + **WABA**.
3. Register the **dedicated sender number** as a WhatsApp sender; complete the
   number verification (SMS/voice OTP to that number).
4. Wait for **Meta business verification** to clear (raises the messaging tier
   from the sandbox/limited tier to production volumes).
5. Create and submit **message templates** (see §4) for approval.
6. Set the WhatsApp **inbound webhook** to a Lite endpoint (for replies /
   opt-in / STOP handling) — e.g. `POST /voice/whatsapp-inbound` (to be built).
7. Note the WhatsApp sender in the form Twilio expects: `whatsapp:+1XXXXXXXXXX`.

### Sandbox (for dev/testing before Meta verification)
Twilio provides a WhatsApp **sandbox** number you can join by texting a code.
Use it to build and test `sendWhatsApp()` end-to-end before the production WABA
is verified. Templates are not required in the sandbox (24h session applies).

---

## 4. Message templates (the key rule)

Any **business-initiated** WhatsApp message (a confirmation you push proactively,
outside a 24-hour customer-service window) **must use a Meta-approved template**.
Free-form text is only allowed within 24h after the customer messages you first.

Design these templates up front (category = **Utility**, which is cheap/approved
easily). Use placeholders `{{1}}`, `{{2}}`, …:

**`lite_appointment_confirmation` (Utility, ES + EN):**
```
ES: {{1}}: su cita quedó confirmada para el {{2}}. Responda a este mensaje para contactarnos.
EN: {{1}}: your appointment is confirmed for {{2}}. Reply to this message to reach us.
    {{1}} = business name, {{2}} = date/time
```

**`lite_new_message_owner` (Utility) — owner alert:**
```
{{1}} — new message from {{2}}: {{3}}
    {{1}} = business, {{2}} = caller name, {{3}} = message body
```

Optionally add **quick-reply buttons** (Confirm / Reschedule / Cancel) — these
become tap actions in WhatsApp and route to the inbound webhook.

Submit templates in Twilio Console → **Content Template Builder**, or via the
Content API. Approval is usually minutes–hours for Utility.

---

## 5. Opt-in (required)

WhatsApp requires prior **opt-in** before a business messages a user. For Lite:
- During the call, Lina asks: *"May I send your confirmation on WhatsApp?"* and
  records consent on the appointment/caller record (`whatsapp_optin = true`).
- Only send WhatsApp if opted in; otherwise fall back to SMS.
- Honor **STOP / "baja"** replies (opt-out) via the inbound webhook.

---

## 6. Integration into RinglyPro Lite (design)

Keep it behind the existing `TelephonyProvider` abstraction so callers don't change.

**a) Provider interface** (`src/telephony/TelephonyProvider.js`):
```
async sendWhatsApp({ to, templateSid, variables, body }) { ... }   // new method
```

**b) Twilio implementation** (`src/telephony/twilioProvider.js`):
```
async sendWhatsApp({ to, contentSid, contentVariables, body }) {
  const c = this.client();
  const from = process.env.LITE_WHATSAPP_FROM;          // 'whatsapp:+1XXXXXXXXXX'
  const payload = contentSid
    ? { from, to: `whatsapp:${to}`, contentSid, contentVariables: JSON.stringify(contentVariables) }
    : { from, to: `whatsapp:${to}`, body };             // body only valid in 24h session
  const msg = await c.messages.create(payload);
  return { sid: msg.sid };
}
```

**c) Channel selection** (new helper, e.g. `src/services/notify.js`):
```
async function notify({ tenant, to, kind, vars, smsBody, optedInWhatsApp }) {
  const prefWhatsApp = tenant.channel === 'whatsapp' || tenant.country === 'CO';
  if (prefWhatsApp && optedInWhatsApp && process.env.LITE_WHATSAPP_FROM) {
    try { return await provider.sendWhatsApp({ to, contentSid: TEMPLATES[kind], contentVariables: vars }); }
    catch (e) { /* fall through to SMS */ }
  }
  return smsSvc.send({ from: smsFrom, to, body: smsBody });   // SMS fallback
}
```

**d) Wire into `server.js` `fireSms`/`fireEvent`** — replace direct `smsSvc.send`
with `notify(...)` so bookings/messages pick WhatsApp-or-SMS per tenant + opt-in.

**e) Inbound** — add `POST /voice/whatsapp-inbound` to handle replies, button
taps (Confirm/Reschedule), and STOP/opt-out, routed to the correct tenant by the
`to` (the WhatsApp sender) + `from` (customer) mapping.

**f) Data model additions:**
- `lite_tenants.channel` — `sms` | `whatsapp` (default per country).
- `lite_appointments.whatsapp_optin` / `lite_messages` opt-in flag as needed.

---

## 7. Environment variables (to add when built)

- `LITE_WHATSAPP_FROM` — the WhatsApp sender, format `whatsapp:+1XXXXXXXXXX`.
  Unset = WhatsApp disabled, everything uses SMS.
- `LITE_WHATSAPP_TEMPLATE_CONFIRM` — Content SID of the approved appointment
  confirmation template.
- `LITE_WHATSAPP_TEMPLATE_MSG` — Content SID of the owner new-message template.
- (Meta Cloud API alternative: `LITE_WHATSAPP_TOKEN`, `LITE_WHATSAPP_PHONE_ID`,
  mirroring the AgroMercado pattern.)

Same disabled-by-default safety as the rest of Lite: if `LITE_WHATSAPP_FROM` is
unset, no WhatsApp is attempted and SMS is used.

---

## 8. Cost

WhatsApp bills per **conversation** (a 24-hour window) by category:
- **Utility** (appointment confirmations, alerts) — cheapest tier; in many
  regions cheaper than SMS, and often **much cheaper than Colombian SMS**
  (~$0.05–0.06/segment). Some service/utility conversations are free within the
  window.
- **Marketing** / **Authentication** — separate (not used by Lite).

Net effect on unit economics: for **Colombia**, WhatsApp likely **lowers**
per-notification cost vs SMS. For the US, cost is comparable but adoption is the
limiting factor, so SMS stays primary.

Update `src/utils/cost.js` with a `whatsappUtility` rate when the channel ships,
and split notification cost by channel in `/internal/economics`.

---

## 9. Limitations / caveats

- **US adoption:** many US users are not on WhatsApp — keep SMS primary for US.
- **Template rigidity:** proactive messages must match an approved template;
  design them before launch. Free-form only inside the 24h reply window.
- **Opt-in mandatory:** cannot message users who have not consented.
- **Dedicated number:** the WhatsApp sender number is consumed by the Business
  API and cannot double as a consumer WhatsApp or (cleanly) the voice DID.
- **Per-tenant identity at scale:** like SMS, decide whether all tenants share
  one Digit2AI WhatsApp sender (business name in the template body) or each
  tenant gets its own WABA sender (cleaner brand, more setup).

---

## 10. Rollout recommendation

1. Ship/keep **SMS** as the universal baseline (done — verified toll-free).
2. Build WhatsApp behind the provider abstraction using the **Twilio sandbox**
   first (no Meta verification needed to develop `sendWhatsApp()` + templates).
3. Complete **Meta business verification** + template approval for production.
4. Turn on **WhatsApp-primary for Colombia** tenants; keep SMS fallback everywhere.
5. Add **inbound** handling (replies, Confirm/Reschedule buttons, opt-out).

File: `/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/ringlypro-lite/docs/whatsapp-setup.md`
