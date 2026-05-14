'use strict';

// Shared CC/BCC recipients applied to every stakeholder-facing email sent
// from the projects module (approvals, rejections, meeting invites, UAT
// handoff, shipped confirmation, contract signing). Defaults can be
// overridden at deploy time without a code change.

const DEFAULT_CC  = 'mstagg@digit2ai.com';
const DEFAULT_BCC = 'manuelstagg@gmail.com';

function parseList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\s]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function getStakeholderCc() {
  return parseList(process.env.STAKEHOLDER_EMAIL_CC || DEFAULT_CC);
}

function getStakeholderBcc() {
  return parseList(process.env.STAKEHOLDER_EMAIL_BCC || DEFAULT_BCC);
}

// Build {cc, bcc} for a SendGrid message, filtering out any addresses that
// already appear in the To: recipient list (case-insensitive) so the same
// inbox does not receive the message twice.
function buildCcBcc(toRecipients) {
  const toSet = new Set(
    (Array.isArray(toRecipients) ? toRecipients : [toRecipients])
      .filter(Boolean)
      .map(e => String(e).trim().toLowerCase())
  );
  const cc  = getStakeholderCc().filter(e => !toSet.has(e));
  const bcc = getStakeholderBcc().filter(e => !toSet.has(e) && !cc.includes(e));
  const out = {};
  if (cc.length)  out.cc  = cc;
  if (bcc.length) out.bcc = bcc;
  return out;
}

module.exports = { getStakeholderCc, getStakeholderBcc, buildCcBcc };
