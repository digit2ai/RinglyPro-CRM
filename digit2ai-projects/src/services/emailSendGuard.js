'use strict';

// Single source of truth for "should the server send this email itself?"
//
// Set EMAIL_AUTOSEND_DISABLED=1 (default on prod) to kill ALL server-
// initiated SendGrid sends — meeting recaps, project notifications,
// RSVP reminders, inbox digests, contract notices, intake confirmations.
// The user reviews drafts in the dashboard and sends through their own
// mail client (Apple Mail) via the magic-link / mailto helper.
//
// Why a single flag: the user reported SendGrid mail hitting recipient
// spam folders. A single switch lets us cut every auto-trigger at once
// and re-enable selectively if a specific path proves reliable later.
//
// Two API shapes:
//   - isAutoSendDisabled(): returns boolean
//   - skipIfDisabled(label): logs a skip line and returns true if
//     auto-send is off; call sites short-circuit on the return value
//
// Manual / user-clicked sends are NOT gated by this — only background
// fire-and-forget auto-triggers. The user clicking a "Send via SendGrid"
// button (if we ever expose one) bypasses this guard.

function isAutoSendDisabled() {
  // Default to disabled when the var isn't set. The user explicitly asked
  // for auto-send off; explicit opt-in is required to re-enable.
  const raw = process.env.EMAIL_AUTOSEND_DISABLED;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return true;
}

function skipIfDisabled(label) {
  if (!isAutoSendDisabled()) return false;
  try {
    console.log(`[email-guard] auto-send DISABLED — skipped: ${label}`);
  } catch (_) {}
  return true;
}

module.exports = { isAutoSendDisabled, skipIfDisabled };
