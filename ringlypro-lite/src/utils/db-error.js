'use strict';

/**
 * A database that cannot be REACHED is an operator problem, not a user error.
 *
 * Sequelize hands the raw driver message straight through, so an unreachable
 * host used to render "getaddrinfo ENOTFOUND dpg-xxxxx-a" on the public signup
 * page: it reads to the visitor as if their details were rejected, and it
 * prints our database hostname to anyone who taps the button. Connection
 * failures now answer 503 with a stable code; the detail stays in the log.
 */

const CONNECTION_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'
]);

const CONNECTION_NAMES = new Set([
  'SequelizeConnectionError',
  'SequelizeConnectionRefusedError',
  'SequelizeHostNotFoundError',
  'SequelizeHostNotReachableError',
  'SequelizeConnectionTimedOutError',
  'SequelizeAccessDeniedError'
]);

function isConnectionError(e) {
  if (!e) return false;
  const code = e.original?.code || e.parent?.code || e.code;
  return CONNECTION_NAMES.has(e.name) || CONNECTION_CODES.has(code);
}

// A short, honest label for the operator — never rendered to the visitor.
function reason(e) {
  const code = e?.original?.code || e?.parent?.code || e?.code;
  if (code === 'ENOTFOUND' || e?.name === 'SequelizeHostNotFoundError') return 'db_host_unresolvable';
  if (code === 'ECONNREFUSED') return 'db_connection_refused';
  if (code === 'ETIMEDOUT' || code === 'EAI_AGAIN') return 'db_unreachable';
  if (e?.name === 'SequelizeAccessDeniedError') return 'db_credentials_rejected';
  return 'db_error';
}

/**
 * Send `e` as a response. Connection failures become a generic 503; anything
 * else keeps the previous behaviour (500 + message), which is application-level
 * and safe to show.
 */
function sendDbError(res, e, tag) {
  if (isConnectionError(e)) {
    console.error(`[lite:db] ${tag || 'request'} failed — ${reason(e)}:`, e.original?.message || e.message);
    return res.status(503).json({
      error: 'database_unavailable',
      code: reason(e),
      message: 'The service cannot reach its database right now. Nothing was saved. Please try again shortly.'
    });
  }
  console.error(`[lite] ${tag || 'request'} error:`, e.message);
  return res.status(500).json({ error: e.message });
}

module.exports = { isConnectionError, reason, sendDbError };
