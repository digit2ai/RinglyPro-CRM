'use strict';

/**
 * OUTBOUND CALLING FROM AN UPLOADED LIST.
 *
 * THE RISK THAT SHAPES EVERY LINE HERE. On 2026-08-06 someone with the Twilio
 * credentials dialled ten sequential international numbers in forty seconds
 * and the carrier disabled voice on the whole account for eighteen days. This
 * feature invites a tenant to upload ten thousand numbers and dial them. Open
 * signup plus a spreadsheet plus a dialer is that incident with a user
 * interface, so:
 *
 *  - `tollFraud.checkDestination` gates every number at IMPORT, while a human
 *    is looking at the screen, AND again at DIAL, because a row can be edited
 *    in the database afterwards and a list can be imported before a country is
 *    removed from the allow-list.
 *  - Dialling is OFF until an operator sets `outbound_enabled`. It is never a
 *    signup default.
 *  - A per-tenant DAILY CAP is enforced here, because HighLevel places these
 *    calls and the toll-fraud velocity breaker cannot see them — the same gap
 *    `/internal/security` already reports as `ghl_transfers_uncapped`.
 *
 * COLD-CALLING RULES, CHECKED AT DIAL TIME. A suppression list, a consent
 * basis recorded per list, and calling hours in the CALLED PARTY'S timezone
 * (derived from their area code, not the tenant's clock).
 *
 * WHAT IS NOT BUILT, AND MUST NOT BE IMPLIED: there is no National DNC scrub.
 * That needs an FTC Subscription Account Number the owner does not have. The
 * UI says numbers are not scrubbed against the national registry; a product
 * implying a scrub that is not happening is the one failure here with legal
 * consequences.
 *
 * AN OUTBOUND CALL IS A WORKFLOW ENROLLMENT. HighLevel dials Voice AI outbound
 * only from the "Voice AI Outbound Call" workflow action, and a workflow
 * CANNOT be created by API — it ships in a Snapshot the owner loads. Until
 * that workflow id is on the tenant, `dial()` refuses and says why. No call id
 * exists until the call log returns one, and one is never invented.
 */
const { sequelize, Tenant } = require('../models');
const tollFraud = require('../security/tollFraud');
const ghl = require('../telephony/ghl');
const accounts = require('./ghlAccounts');

const CONSENT_BASES = ['existing_customer', 'express_written', 'business_published', 'unstated'];

/** Area code → IANA zone. Coarse on purpose; see callingHours(). */
const AREA_TZ = {
  America: null, // placeholder so the object is never empty
};
// A small, honest map: the common US zones by area code prefix. A number we
// cannot place falls back to the tenant's timezone AND is flagged, rather than
// being assumed Eastern — assuming is how somebody gets rung at 5am.
const TZ_BY_AREA = {
  Eastern: ['201','202','203','207','212','215','216','229','239','240','267','276','301','302','304','305','404','407','410','412','413','434','440','443','470','475','478','484','508','516','517','518','540','551','561','567','570','571','585','586','601','603','606','607','609','610','612','614','615','616','617','631','636','646','667','678','689','703','704','706','707','716','717','718','724','727','732','734','737','740','754','757','762','770','772','774','781','786','802','803','804','810','812','813','814','828','843','845','848','850','856','857','860','862','863','864','865','878','901','904','906','908','910','912','914','917','919','929','931','941','947','954','956','959','973','978','980','984','989'],
  Central: ['205','214','217','218','224','225','228','251','256','262','270','281','309','312','314','316','318','319','320','325','334','337','346','352','361','380','402','405','406','409','414','417','430','432','469','479','501','502','504','505','507','512','515','531','539','541','563','573','574','580','601','605','608','618','620','630','636','641','651','660','662','682','701','712','713','715','731','737','763','769','773','779','785','806','815','816','817','830','832','847','850','870','872','901','903','913','915','918','920','936','940','956','972','979','985'],
  Mountain: ['303','307','385','406','435','480','505','520','575','602','623','719','720','801','828','915','928','970','986'],
  Pacific: ['206','209','213','253','279','310','323','341','360','408','415','424','425','442','503','509','510','530','541','559','562','619','626','628','650','657','661','669','707','714','747','760','805','818','831','858','909','916','925','949','951','971'],
};
const ZONE = { Eastern: 'America/New_York', Central: 'America/Chicago',
  Mountain: 'America/Denver', Pacific: 'America/Los_Angeles' };

/**
 * The called party's timezone, from their own number. Returns null when we
 * cannot tell — the caller decides what to do with that, and the honest
 * choice is to refuse rather than guess somebody into a 5am call.
 */
function tzForNumber(e164) {
  const m = String(e164 || '').match(/^\+1(\d{3})/);
  if (!m) return null;
  for (const [zone, list] of Object.entries(TZ_BY_AREA)) {
    if (list.includes(m[1])) return ZONE[zone];
  }
  return null;
}

/** Local hour in a zone, without pulling in a date library. */
function hourIn(tz, at = new Date()) {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(at);
    const h = parseInt(s, 10);
    return Number.isInteger(h) ? (h === 24 ? 0 : h) : null;
  } catch (_) { return null; }
}

function startHour() { return Math.max(0, parseInt(process.env.LITE_OUTBOUND_START_HOUR || '8', 10) || 8); }
function endHour() { return Math.min(24, parseInt(process.env.LITE_OUTBOUND_END_HOUR || '21', 10) || 21); }

/**
 * IS IT A LEGAL HOUR WHERE THEY ARE? 8am-9pm is the US federal telemarketing
 * window, and it is THEIR clock that counts, not the business's.
 */
function withinCallingHours(e164, tenant, at = new Date()) {
  const tz = tzForNumber(e164);
  if (!tz) {
    // Unknown zone. Refusing is the safe answer: a wrong guess is a call at
    // an illegal hour, and the cost of waiting is that somebody is rung later.
    return { ok: false, reason: 'timezone_unknown', tz: null };
  }
  const h = hourIn(tz, at);
  if (h === null) return { ok: false, reason: 'timezone_unreadable', tz };
  if (h < startHour() || h >= endHour()) {
    return { ok: false, reason: `outside calling hours (${startHour()}:00-${endHour()}:00 ${tz})`, tz, hour: h };
  }
  return { ok: true, tz, hour: h };
}

/** Add a number to this tenant's do-not-call list. Idempotent. */
async function suppress(tenantId, phoneRaw, reason, source) {
  const chk = tollFraud.checkDestination(phoneRaw, { defaultCountry: 'US' });
  const phone = chk.ok ? chk.e164 : String(phoneRaw || '').trim();
  if (!phone) return { ok: false, error: 'no_phone' };
  await sequelize.query(
    `INSERT INTO lite_outbound_suppressions (tenant_id, phone, reason, source)
       VALUES (:t, :p, :r, :s)
     ON CONFLICT (tenant_id, phone) DO UPDATE SET reason = :r, source = :s`,
    { replacements: { t: tenantId, p: phone, r: String(reason || 'do_not_call').slice(0, 40),
      s: String(source || '').slice(0, 40) } }
  );
  // Also stop it being dialled from any list it is already on.
  await sequelize.query(
    `UPDATE lite_outbound_contacts SET status = 'suppressed' WHERE tenant_id = :t AND phone = :p`,
    { replacements: { t: tenantId, p: phone } }
  );
  return { ok: true, phone };
}

async function isSuppressed(tenantId, phone) {
  const [rows] = await sequelize.query(
    `SELECT reason FROM lite_outbound_suppressions WHERE tenant_id = :t AND phone = :p LIMIT 1`,
    { replacements: { t: tenantId, p: phone } }
  );
  return rows && rows[0] ? rows[0].reason : null;
}

/** Calls already enrolled for this tenant today (UTC day — the cap is ours). */
async function dialledToday(tenantId) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM lite_outbound_calls
       WHERE tenant_id = :t AND enrolled_at >= date_trunc('day', NOW())`,
    { replacements: { t: tenantId } }
  );
  return (rows && rows[0] && rows[0].n) || 0;
}

/**
 * MAY WE DIAL THIS PERSON, RIGHT NOW? Every check that matters, at dial time.
 * Returns {ok} or {ok:false, reason} — the reason is shown to the operator,
 * never to the called party.
 */
async function mayDial(tenant, contact, at = new Date()) {
  if (!tenant.outbound_enabled) return { ok: false, reason: 'outbound_not_enabled_for_this_tenant' };
  if (!tenant.outbound_workflow_id) {
    return { ok: false, reason: 'no_outbound_workflow',
      detail: 'HighLevel dials Voice AI outbound only from a workflow action, and a workflow cannot be created by API. Load the RinglyPro Snapshot into this sub-account and record its workflow id.' };
  }
  if (contact.status === 'suppressed') return { ok: false, reason: 'do_not_call' };

  // THE ALLOW-LIST AGAIN. It passed at import, but a row can be edited in the
  // database and a country can be removed from the list afterwards.
  const chk = tollFraud.checkDestination(contact.phone, { defaultCountry: tenant.country || 'US' });
  if (!chk.ok) return { ok: false, reason: 'destination_not_allowed', detail: chk.reason || null };

  const sup = await isSuppressed(tenant.id, chk.e164);
  if (sup) return { ok: false, reason: 'do_not_call', detail: sup };

  const hours = withinCallingHours(chk.e164, tenant, at);
  if (!hours.ok) return { ok: false, reason: hours.reason, tz: hours.tz };

  const cap = Math.max(0, parseInt(tenant.outbound_daily_cap, 10) || 0);
  if (cap > 0 && (await dialledToday(tenant.id)) >= cap) {
    return { ok: false, reason: 'daily_cap_reached', detail: `cap ${cap}` };
  }
  return { ok: true, e164: chk.e164, tz: hours.tz };
}

/* ── IMPORT ──────────────────────────────────────────────────────────────── */

/**
 * CSV ONLY, AND THAT IS A DECISION. .xlsx is a zip of XML; parsing it needs a
 * dependency with a history of CVEs, in the one service that holds toll-fraud
 * relevant data, for the convenience of not clicking "Save As". The uploader
 * detects a spreadsheet and says exactly how to export it instead. Refusing
 * clearly beats a silent new attack surface.
 */
function looksLikeSpreadsheet(buf) {
  if (!buf || buf.length < 4) return false;
  // xlsx = PK zip; legacy xls = OLE compound file.
  return (buf[0] === 0x50 && buf[1] === 0x4b) ||
         (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0);
}

/**
 * A PDF MUST BE REFUSED BY NAME, because it is the one wrong format that
 * PARSES. xlsx and xls are binary and produce obvious rubbish; a PDF is mostly
 * ASCII, so the splitter returns hundreds of rows of object dictionaries, the
 * header match fails, the positional fallback runs, and the tenant is shown a
 * preview of garbage with a phone column of nonsense. Detected by magic bytes,
 * never by file extension, which anyone can rename.
 */
function looksLikePdf(buf) {
  return !!buf && buf.length >= 5 &&
    buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d;
}

/** A tolerant CSV/TSV row splitter: quotes, escaped quotes, commas or tabs. */
function splitRows(text) {
  const rows = []; let row = [], cell = '', q = false;
  const delim = (text.split('\n')[0] || '').split('\t').length > (text.split('\n')[0] || '').split(',').length ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

/**
 * A CELL BEGINNING = + - or @ IS CSV-INJECTION BAIT. Excel executes it when
 * the file is reopened. It is stored as text with the trigger neutralised, so
 * a list exported later cannot carry a formula into someone's spreadsheet.
 */
function safeCell(v) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

const HEADERS = {
  // A REAL LIST DOES NOT SAY "COMPANY". The lists tenants actually hold are
  // exported from someone else's system and name the column after the trade:
  // a realtor roster says "Brokerage / Agency", a contractor list says "Firm".
  // An unrecognised header is not a refusal, it is a SILENT null - the company
  // never reaches HighLevel and nothing on any screen says a column was lost.
  company: ['company', 'company name', 'business', 'business name', 'empresa', 'negocio',
    'organization', 'organisation', 'brokerage', 'agency', 'brokerage / agency',
    'brokerage/agency', 'agency / brokerage', 'firm', 'office', 'employer'],
  contact_name: ['name', 'full name', 'contact', 'contact name', 'nombre', 'nombres',
    'contacto', 'first name', 'firstname', 'first'],
  // Carried SEPARATELY and joined onto the first name, because a roster that
  // splits the person across two columns is the common case, not the odd one.
  last_name: ['last name', 'lastname', 'last', 'surname', 'apellido', 'apellidos'],
  phone: ['phone', 'phone number', 'telephone', 'mobile', 'cell', 'cell phone',
    'telefono', 'teléfono', 'number'],
  email: ['email', 'e-mail', 'correo', 'email address'],
};

// Header text is matched on a NORMALISED key: lowercase, whitespace collapsed,
// and the spaces around a slash removed - so "Brokerage / Agency",
// "brokerage/agency" and "BROKERAGE  /  AGENCY" are one header, not three.
function normaliseHeader(h) {
  return String(h || '').trim().toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/[:.]+$/, '')
    .trim();
}

function mapHeaders(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => {
    const k = normaliseHeader(h);
    const kNoSpaceSlash = k.replace(/ \/ /g, '/');
    for (const [field, names] of Object.entries(HEADERS)) {
      if (idx[field] === undefined && (names.includes(k) || names.includes(kNoSpaceSlash))) idx[field] = i;
    }
  });
  return idx;
}

/**
 * Parse an uploaded list and report a RESULT PER ROW. A silently dropped row
 * is worse than a refusal: the tenant thinks they uploaded 900 numbers and
 * 700 were dialled, and nothing says which 200 vanished.
 */
function parseList(buf, { defaultCountry = 'US', maxRows = 5000 } = {}) {
  if (looksLikePdf(buf)) {
    return { ok: false, error: 'pdf_not_supported',
      message: 'This is a PDF. Open it in Excel or Google Sheets, put the columns in order '
             + '(Company, Name, Phone, Email), then File, Save As, CSV and upload that file.' };
  }
  if (looksLikeSpreadsheet(buf)) {
    return { ok: false, error: 'spreadsheet_not_supported',
      message: 'Save the file as CSV first (Excel: File, Save As, CSV) and upload that.' };
  }
  const text = buf.toString('utf8');
  const rows = splitRows(text);
  if (!rows.length) return { ok: false, error: 'empty_file' };

  const idx = mapHeaders(rows[0]);
  const hasHeader = idx.phone !== undefined;
  // WHICH COLUMNS WERE UNDERSTOOD, AND WHICH WERE NOT. Reported so the tenant
  // sees "Brokerage / Agency was not recognised" on the preview instead of
  // discovering months later that every company field is empty.
  const recognised = hasHeader
    ? Object.entries(idx).sort((a, b) => a[1] - b[1]).map(([f, i]) => ({ field: f, column: String(rows[0][i] || '').trim() }))
    : [];
  const ignored = hasHeader
    ? rows[0].map((h, i) => ({ h: String(h || '').trim(), i }))
        .filter((c) => c.h && !Object.values(idx).includes(c.i))
        .map((c) => c.h)
    : [];
  // With no recognisable header, assume company, phone, email in that order —
  // and SAY SO, so a mis-ordered file is the tenant's informed choice.
  const map = hasHeader ? idx : { company: 0, phone: 1, email: 2 };
  const body = hasHeader ? rows.slice(1) : rows;

  const accepted = [], refused = [];
  const seen = new Set();
  for (const r of body.slice(0, maxRows)) {
    const rawPhone = r[map.phone] !== undefined ? String(r[map.phone]) : '';
    const company = safeCell(map.company !== undefined ? r[map.company] : '').slice(0, 200);
    const first = safeCell(map.contact_name !== undefined ? r[map.contact_name] : '');
    const last = safeCell(map.last_name !== undefined ? r[map.last_name] : '');
    const name = [first, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    const email = safeCell(map.email !== undefined ? r[map.email] : '').slice(0, 200);

    if (!String(rawPhone).trim()) { refused.push({ company, phone: rawPhone, reason: 'no phone number' }); continue; }

    // THE ALLOW-LIST, AT IMPORT, WITH A HUMAN WATCHING. A number without a
    // country code belongs to the OWNER'S country — never guessed wider.
    const chk = tollFraud.checkDestination(rawPhone, { defaultCountry });
    if (!chk.ok) {
      refused.push({ company, phone: tollFraud.mask(String(rawPhone)), reason: chk.reason || 'not an allowed destination' });
      continue;
    }
    if (seen.has(chk.e164)) { refused.push({ company, phone: tollFraud.mask(chk.e164), reason: 'duplicate in this file' }); continue; }
    seen.add(chk.e164);

    accepted.push({ company: company || null, contact_name: name || null, phone: chk.e164,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      timezone: tzForNumber(chk.e164) });
  }
  const truncated = body.length > maxRows;
  return { ok: true, accepted, refused, truncated,
    header_detected: hasHeader,
    columns_mapped: recognised,
    columns_ignored: ignored,
    total_rows: body.length };
}

/* ── DIAL ────────────────────────────────────────────────────────────────── */

/**
 * Enroll ONE contact in the tenant's outbound workflow — which is what an
 * outbound Voice AI call is. Every gate in mayDial() runs first.
 *
 * NO CALL ID IS INVENTED. HighLevel returns none from an enrollment; the id
 * appears later in the call log, and the poller attaches it.
 */
async function dial(tenant, contact, { at = new Date(), creds } = {}) {
  const gate = await mayDial(tenant, contact, at);
  if (!gate.ok) return { ok: false, ...gate };

  const c = creds || await accounts.credsFor(tenant);
  if (!c || !ghl.configured(c)) return { ok: false, reason: 'no_credentials' };

  // The person must exist as a contact before a workflow can enroll them.
  let contactId = contact.ghl_contact_id;
  if (!contactId) {
    // ONE UPSERT PATH, THE ONE THAT IS PROVEN. This had its own copy pinned to
    // Version v3 with no fallback, and no firstName/lastName — so a
    // sub-account that rejects v3 would have failed every outbound call with
    // '404 Cannot POST', and a contact would have landed in HighLevel's UI
    // with no name. services/ghlCalendar.js has created real contacts in
    // production: it tries v3 then the date-stamped version, splits the name,
    // and is safe to retry because an upsert is one by definition.
    try {
      contactId = await require('./ghlCalendar').upsertContact({
        creds: c,
        name: contact.contact_name || contact.company || null,
        phone: gate.e164,
        email: contact.email || null,
        companyName: contact.company || null,
        source: 'RinglyPro Outbound',
      });
    } catch (e) {
      return { ok: false, reason: 'contact_upsert_failed',
        detail: String(e.message || e).slice(0, 200) };
    }
  }

  await ghl.call('POST',
    `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(tenant.outbound_workflow_id)}`,
    { creds: c, version: 'v3', body: {} });

  const [ins] = await sequelize.query(
    `INSERT INTO lite_outbound_calls (tenant_id, contact_id, list_id)
       VALUES (:t, :c, :l) RETURNING id`,
    { replacements: { t: tenant.id, c: contact.id, l: contact.list_id || null } }
  );
  await sequelize.query(
    `UPDATE lite_outbound_contacts
        SET status = 'dialled', attempts = attempts + 1, last_attempt_at = NOW(), ghl_contact_id = :gc
      WHERE id = :id AND tenant_id = :t`,
    { replacements: { id: contact.id, t: tenant.id, gc: contactId } }
  );
  return { ok: true, enrolled: true, ghl_contact_id: contactId,
    call_row: ins && ins[0] && ins[0].id,
    // Stated rather than implied: an enrollment is not yet a connected call.
    note: 'Enrolled in the outbound workflow. No call id exists until HighLevel logs the call.' };
}

/* ── CALLBACK RECOGNITION ────────────────────────────────────────────────── */

/**
 * DID WE CALL THIS PERSON FIRST?
 *
 * When a number we dialled rings back, the greeting should say so — but only
 * if it is TRUE. This returns what actually happened: the company, when we
 * called, and the outcome recorded. It never returns a campaign's marketing
 * copy dressed up as history, and it never asserts a call that has no row.
 *
 * Identity comes from the CALLING number, which the carrier supplies, and the
 * tenant from the line that was DIALLED — never from anything the caller says.
 */
async function recogniseCaller(tenantId, fromE164) {
  if (!tenantId || !fromE164) return null;
  const [rows] = await sequelize.query(
    `SELECT c.id, c.company, c.contact_name, c.last_outcome, c.attempts,
            l.name AS list_name, l.consent_basis,
            (SELECT MAX(enrolled_at) FROM lite_outbound_calls oc WHERE oc.contact_id = c.id) AS last_called_at
       FROM lite_outbound_contacts c
       LEFT JOIN lite_outbound_lists l ON l.id = c.list_id
      WHERE c.tenant_id = :t AND c.phone = :p
      LIMIT 1`,
    { replacements: { t: tenantId, p: fromE164 } }
  );
  const r = rows && rows[0];
  if (!r) return null;
  // NEVER CLAIM A CALL THAT DID NOT HAPPEN. Being on a list is not being rung.
  if (!r.last_called_at) {
    return { known: true, called: false, company: r.company || null,
      contact_name: r.contact_name || null, list: r.list_name || null };
  }
  return { known: true, called: true,
    company: r.company || null, contact_name: r.contact_name || null,
    list: r.list_name || null, attempts: r.attempts || 0,
    last_called_at: r.last_called_at, last_outcome: r.last_outcome || null };
}

/**
 * A short, TRUE line for the owner's message and for the agent's greeting.
 * Returns null when there is nothing honest to say.
 */
function callbackNote(rec) {
  if (!rec || !rec.known) return null;
  const who = rec.company || rec.contact_name;
  if (!rec.called) return who ? `On your outbound list${who ? ` (${who})` : ''}, not yet called.` : null;
  const when = rec.last_called_at ? new Date(rec.last_called_at).toISOString().slice(0, 10) : null;
  return `Calling back${who ? ` — ${who}` : ''}. We called them${when ? ` on ${when}` : ''}`
    + `${rec.last_outcome ? ` (${rec.last_outcome})` : ''}.`;
}

module.exports = {
  CONSENT_BASES, tzForNumber, withinCallingHours, hourIn,
  suppress, isSuppressed, dialledToday, mayDial, dial, recogniseCaller, callbackNote,
  parseList, safeCell, splitRows, looksLikeSpreadsheet, mapHeaders,
  startHour, endHour,
};
