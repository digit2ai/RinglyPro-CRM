/**
 * Lightweight iCal generator for Final Meeting invitations.
 * No external library -- emits VCALENDAR/VEVENT block per RFC 5545.
 */
const crypto = require('crypto');

function escapeICal(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function formatICalDate(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/**
 * @param {Object} opts
 * @param {string} opts.uid           Unique event UID
 * @param {Date} opts.startsAt        Meeting start
 * @param {number} opts.durationMinutes Duration in minutes
 * @param {string} opts.summary       Event title
 * @param {string} opts.description   Event description (multi-line OK)
 * @param {string} opts.location      Video link / location
 * @param {string} opts.organizerEmail
 * @param {string} opts.organizerName
 * @param {Array<{email: string, name?: string}>} opts.attendees
 */
function buildICal(opts) {
  const {
    uid, startsAt, durationMinutes = 60, summary, description, location,
    organizerEmail, organizerName, attendees = []
  } = opts;

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const now = new Date();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CamaraVirtual.app//P2B Final Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatICalDate(now)}`,
    `DTSTART:${formatICalDate(startsAt)}`,
    `DTEND:${formatICalDate(endsAt)}`,
    `SUMMARY:${escapeICal(summary)}`,
    `DESCRIPTION:${escapeICal(description)}`,
    location ? `LOCATION:${escapeICal(location)}` : null,
    organizerEmail ? `ORGANIZER;CN=${escapeICal(organizerName || organizerEmail)}:mailto:${organizerEmail}` : null
  ].filter(Boolean);

  for (const a of attendees) {
    if (!a.email) continue;
    lines.push(`ATTENDEE;CN=${escapeICal(a.name || a.email)};RSVP=TRUE:mailto:${a.email}`);
  }

  lines.push(
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return lines.join('\r\n');
}

function generateUID(projectId, meetingType) {
  const rand = crypto.randomBytes(8).toString('hex');
  return `cv-p${projectId}-${meetingType}-${rand}@camaravirtual.app`;
}

function generateJitsiLink(projectId) {
  const rand = crypto.randomBytes(6).toString('hex');
  return `https://meet.jit.si/CamaraVirtual-P${projectId}-${rand}`;
}

module.exports = { buildICal, generateUID, generateJitsiLink };
