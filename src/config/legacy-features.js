'use strict';

/**
 * Old RinglyPro features that are OFF unless switched on (owner decision
 * 2026-10-24: RinglyPro Lite replaced them). Nothing was deleted; each one is a
 * Render environment variable away from coming back.
 *
 *   VAGARO_ENABLED=on          /api/vagaro, /api/mcp/vagaro/*, /api/mcp/webhooks/vagaro
 *   OUTBOUND_CALLER_ENABLED=on /api/outbound-caller (one shared caller for all clients:
 *                              any client could stop or read another's campaign, and
 *                              /call-from-copilot dialled with no login)
 *   LEAD_SEARCH_ENABLED=on     /api/mcp/business-collector/{connect,collect,quick}
 *                              (searches billed to whatever client id the caller sent)
 *
 * Read on every request, so a change on Render applies after the restart it
 * triggers, with no code change.
 */

const FLAGS = {
  vagaro: 'VAGARO_ENABLED',
  outbound_caller: 'OUTBOUND_CALLER_ENABLED',
  lead_search: 'LEAD_SEARCH_ENABLED'
};

function featureOn(key) {
  const v = String(process.env[FLAGS[key]] || '').trim().toLowerCase();
  return v === 'on' || v === 'true' || v === '1';
}

// Express middleware: 410 Gone while the feature is off.
function requireFeature(key) {
  return (req, res, next) => {
    if (featureOn(key)) return next();
    res.status(410).json({ success: false, disabled: true, feature: key,
      error: 'This feature is turned off.' });
  };
}

module.exports = { featureOn, requireFeature, FLAGS };
